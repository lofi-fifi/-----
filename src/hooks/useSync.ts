import { useCallback, useEffect, useRef, useState } from 'react'

import {
  diariesFingerprint,
  isEmptyCloud,
  rowsToCheckins,
  rowsToTasks,
  settingsFingerprint,
  tasksFingerprint,
} from '../lib/sync'
import { mergeDiaries } from '../lib/diary'
import { normalizeData, normalizeDiaries, type AppData } from '../lib/storage'
import {
  pullCloud,
  pushDiaries,
  pushSettings,
  pushTasks,
  type SyncOutcome,
} from '../utils/supabaseSync'

/**
 * 这台设备为「哪个账号」做过首次同步 —— 做过之后才允许推送，
 * 否则会把本机的旧数据推上去覆盖云端。
 */
const SYNCED_KEY = 'kaoyan-synced-user'

/** 本地改动停下多久之后才推送，避免打字/连点触发一串请求 */
const PUSH_DEBOUNCE_MS = 1500

/** 有未推送的改动时，多久重试一次 */
const RETRY_INTERVAL_MS = 20000

function readSyncedUser(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY)
  } catch {
    return null
  }
}

function writeSyncedUser(id: string | null): void {
  try {
    if (id) localStorage.setItem(SYNCED_KEY, id)
    else localStorage.removeItem(SYNCED_KEY)
  } catch {
    // 无痕模式写不了，下次进来会重新做一次首次同步，不影响正确性
  }
}

/* ------------------------------------------------------------------ */
/* 「有未推送的改动」标记                                              */
/* ------------------------------------------------------------------ */
/*
 * 用来回答一个跨会话的问题：**上次关掉页面的时候，有没有东西还没推上去？**
 *
 * 光比指纹是不够的 —— 指纹在页面加载的那一刻就记成了当前值，
 * 它分不清「本地这批数据已经推过了」和「本地这批数据还没推过」。
 * 所以这个状态必须持久化下来。
 *
 * 有了它，打开应用时就能安全地做决定：
 *   标记是干净的 → 本地没有没推的东西 → **直接拉云端**（于是能看到另一台设备写的）
 *   标记是脏的   → 本地有没推的东西   → **先推再拉**（于是不会覆盖掉它）
 */
const dirtyKey = (userId: string) => `kaoyan-dirty-${userId}`

function markDirty(userId: string): void {
  try {
    localStorage.setItem(dirtyKey(userId), '1')
  } catch {
    // 写不进去就算了：下次打开会被当成干净的，最坏情况是白拉一次
  }
}

function clearDirty(userId: string): void {
  try {
    localStorage.removeItem(dirtyKey(userId))
  } catch {
    // 同上
  }
}

/** 读不到时**保守地**当成有改动 —— 宁可多推一次，也不能把没推的东西拉掉 */
function isDirty(userId: string): boolean {
  try {
    return localStorage.getItem(dirtyKey(userId)) === '1'
  } catch {
    return true
  }
}

export type SyncStatus = 'off' | 'idle' | 'pulling' | 'pushing' | 'offline' | 'error'

export type SyncState = {
  status: SyncStatus
  /** error 时的具体原因 */
  message: string | null
  /** 有改动还没推上去 */
  pending: boolean
  lastSyncedAt: number | null
}

type Params = {
  userId: string | null
  data: AppData
  /** 用云端数据整体替换本地。返回是否写入成功（可能撑爆 localStorage）。 */
  replace: (next: AppData) => boolean
}

/**
 * 云端同步。
 *
 * 规则（和之前定的一致）：
 *   首次在这台设备登录 → 云端有内容就覆盖本地，云端是空的就把本机传上去
 *   之后每次改动        → 停手 1.5 秒后推上去；失败就排队，联网后自动重试
 *
 * 不做什么：不按行做时间戳合并。同一账号多设备同时编辑同一天时，
 * 后推的那台覆盖先推的。个人自用够，多端并发编辑是已知局限。
 */
export function useSync({ userId, data, replace }: Params): SyncState & { pullNow: () => Promise<void> } {
  const [status, setStatus] = useState<SyncStatus>(userId ? 'idle' : 'off')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  const dataRef = useRef(data)
  dataRef.current = data
  const replaceRef = useRef(replace)
  replaceRef.current = replace

  /** 首次同步做完了吗 —— 没做完之前不许推送，否则会把本地旧数据推上去覆盖云端 */
  const ready = useRef(false)
  const lastTasks = useRef('')
  const lastSettings = useRef('')
  const lastDiaries = useRef('')
  const timer = useRef<number | null>(null)

  const pushNow = useCallback(async (): Promise<SyncOutcome | null> => {
    if (!userId || !ready.current) return null

    const snapshot = dataRef.current
    const taskPrint = tasksFingerprint(snapshot)
    const settingsPrint = settingsFingerprint(snapshot)
    const diariesPrint = diariesFingerprint(snapshot)
    const needTasks = taskPrint !== lastTasks.current
    const needSettings = settingsPrint !== lastSettings.current
    const needDiaries = diariesPrint !== lastDiaries.current

    if (!needTasks && !needSettings && !needDiaries) {
      setPending(false)
      return { ok: true }
    }

    setStatus('pushing')
    let failure: SyncOutcome | null = null

    if (needTasks) {
      const result = await pushTasks(userId, snapshot)
      if (result.ok) lastTasks.current = taskPrint
      else failure = result
    }

    if (needSettings) {
      const result = await pushSettings(userId, snapshot)
      if (result.ok) lastSettings.current = settingsPrint
      else failure = failure ?? result
    }

    if (needDiaries) {
      const result = await pushDiaries(userId, snapshot)
      if (result.ok) lastDiaries.current = diariesPrint
      else failure = failure ?? result
    }

    if (failure) {
      setPending(true)
      setMessage(failure.message)
      setStatus(failure.offline ? 'offline' : 'error')
      return failure
    }

    clearDirty(userId)
    setPending(false)
    setMessage(null)
    setStatus('idle')
    setLastSyncedAt(Date.now())
    return { ok: true }
  }, [userId])

  /**
   * 从云端拉一次，覆盖本地。
   *
   * 两个调用方：
   *   1. 打开应用时（本地没有未推送的改动）—— 让另一台设备写的东西能看到
   *   2. 设置面板里的「从云端覆盖本地」按钮 —— 换设备或者本地搞乱了的救命按钮
   */
  const pullNow = useCallback(async () => {
    if (!userId) return
    setStatus('pulling')
    setMessage(null)

    const cloud = await pullCloud(userId)
    if (cloud === null) {
      setStatus('offline')
      setMessage('连不上云端')
      return
    }

    const next = normalizeData({
      tasks: rowsToTasks(cloud.tasks),
      checkins: rowsToCheckins(cloud.checkins),
      badges: cloud.badges ?? [],
      dayTotals: cloud.dayTotals ?? {},
      settings: cloud.settings ?? dataRef.current.settings,
      // 日记两边**合并**，不是整体覆盖 —— 两台设备各写一篇时两篇都要留住。
      // 任务不能这么合：任务有删除，按 id 并集会把删掉的复活。
      diaries: mergeDiaries(dataRef.current.diaries, normalizeDiaries(cloud.diaries)),
    })

    replaceRef.current(next)
    writeSyncedUser(userId)
    ready.current = true
    // 刚拉下来的就是云端的，所以本地此刻是「干净」的
    clearDirty(userId)
    lastTasks.current = tasksFingerprint(next)
    lastSettings.current = settingsFingerprint(next)
    lastDiaries.current = diariesFingerprint(next)
    setStatus('idle')
    setPending(false)
    setLastSyncedAt(Date.now())
  }, [userId])

  /* ---------- 首次同步 ---------- */
  useEffect(() => {
    if (!userId) {
      ready.current = false
      setStatus('off')
      return
    }

    // 这台设备已经为这个账号同步过了
    if (readSyncedUser() === userId) {
      ready.current = true
      lastTasks.current = tasksFingerprint(dataRef.current)
      lastSettings.current = settingsFingerprint(dataRef.current)
      lastDiaries.current = diariesFingerprint(dataRef.current)
      setStatus('idle')

      // 顺手拉一次，让另一台设备写的东西在这台也能看到。
      //
      // 但如果本地还有没推上去的改动，就**先把本地的推上去再拉** ——
      // 否则「在地铁上离线加的日记，一联网打开就被云端盖掉」这个老问题就回来了。
      if (isDirty(userId)) {
        void pushNow().then(() => pullNow())
      } else {
        void pullNow()
      }
      return
    }

    let alive = true
    setStatus('pulling')

    ;(async () => {
      const cloud = await pullCloud(userId)
      if (!alive) return

      // 网络不通：保持本地不动，等联网后由重试逻辑接手
      if (cloud === null) {
        setStatus('offline')
        setMessage('连不上云端，本地数据先留着，联网后会自动上传')
        setPending(true)
        return
      }

      const cloudEmpty =
        isEmptyCloud(cloud.taskCount, cloud.checkinCount) && cloud.settings === null

      if (cloudEmpty) {
        // 云端还没有内容（新账号 / 换设备第一次用）→ 把本机传上去
        const results = [
          await pushTasks(userId, dataRef.current),
          await pushSettings(userId, dataRef.current),
          await pushDiaries(userId, dataRef.current),
        ]
        if (!alive) return

        const bad = results.find((result) => !result.ok)
        if (bad) {
          setStatus(bad.offline ? 'offline' : 'error')
          setMessage(bad.message)
          setPending(true)
          return
        }

        writeSyncedUser(userId)
        ready.current = true
        clearDirty(userId)
        lastTasks.current = tasksFingerprint(dataRef.current)
        lastSettings.current = settingsFingerprint(dataRef.current)
        lastDiaries.current = diariesFingerprint(dataRef.current)
        setStatus('idle')
        setLastSyncedAt(Date.now())
        return
      }

      // 云端有内容 → 覆盖本地
      const next = normalizeData({
        tasks: rowsToTasks(cloud.tasks),
        checkins: rowsToCheckins(cloud.checkins),
        badges: cloud.badges ?? [],
        dayTotals: cloud.dayTotals ?? {},
        settings: cloud.settings ?? dataRef.current.settings,
        // 日记两边合并，不是整体覆盖 —— 两台设备各写一篇时两篇都留住
        diaries: mergeDiaries(dataRef.current.diaries, normalizeDiaries(cloud.diaries)),
      })

      replaceRef.current(next)
      writeSyncedUser(userId)
      ready.current = true
      // 刚拉下来的就是云端的，本地此刻是干净的
      clearDirty(userId)
      // 用 next 而不是 dataRef.current —— 后者这一帧还是旧值
      lastTasks.current = tasksFingerprint(next)
      lastSettings.current = settingsFingerprint(next)
      lastDiaries.current = diariesFingerprint(next)
      setStatus('idle')
      setPending(false)
      setMessage(null)
      setLastSyncedAt(Date.now())
    })()

    return () => {
      alive = false
    }
  }, [userId, pushNow, pullNow])

  /* ---------- 本地一变就防抖推送 ---------- */
  useEffect(() => {
    if (!userId || !ready.current) return

    const taskPrint = tasksFingerprint(data)
    const settingsPrint = settingsFingerprint(data)
    const diariesPrint = diariesFingerprint(data)
    if (
      taskPrint === lastTasks.current &&
      settingsPrint === lastSettings.current &&
      diariesPrint === lastDiaries.current
    ) {
      return
    }

    // 先标记「有东西没推上去」再排定时器 —— 万一用户在这 1.5 秒里关掉页面，
    // 下次打开会看到脏标记，于是先推再拉，改动不会丢
    markDirty(userId)
    setPending(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void pushNow()
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [data, userId, pushNow])

  /* ---------- 断网重试 ---------- */
  useEffect(() => {
    if (!userId) return

    const retry = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void pushNow()
    }

    window.addEventListener('online', retry)
    const interval = window.setInterval(retry, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', retry)
      window.clearInterval(interval)
    }
  }, [userId, pushNow])

  return { status, message, pending, lastSyncedAt, pullNow }
}
