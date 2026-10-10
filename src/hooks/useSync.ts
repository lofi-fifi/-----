import { useCallback, useEffect, useRef, useState } from 'react'

import {
  diariesFingerprint,
  isEmptyCloud,
  rowsToCheckins,
  rowsToTasks,
  settingsFingerprint,
  tasksFingerprint,
} from '../lib/sync'
import { normalizeData, type AppData } from '../lib/storage'
import {
  pullCloud,
  pushDiaries,
  pushSettings,
  pushTasks,
  type SyncOutcome,
} from '../utils/supabaseSync'

/**
 * 这台设备为「哪个账号」做过首次同步。
 *
 * 只记第一次，之后的每次打开都**不再拉取覆盖** —— 否则你在地铁上离线加的任务，
 * 一联网打开应用就被云端盖掉了。
 * 想强制拉取的话，设置面板里有「从云端覆盖本地」按钮。
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

    setPending(false)
    setMessage(null)
    setStatus('idle')
    setLastSyncedAt(Date.now())
    return { ok: true }
  }, [userId])

  /* ---------- 首次同步 ---------- */
  useEffect(() => {
    if (!userId) {
      ready.current = false
      setStatus('off')
      return
    }

    // 这台设备已经为这个账号同步过了 → 直接进入「本地推送」模式
    if (readSyncedUser() === userId) {
      ready.current = true
      lastTasks.current = tasksFingerprint(dataRef.current)
      lastSettings.current = settingsFingerprint(dataRef.current)
      lastDiaries.current = diariesFingerprint(dataRef.current)
      setStatus('idle')
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
        // 日记存在 user_settings.diaries 那一列里（第四轮 SQL 加的）。
        // 云端为 null 时说明那台设备还没写过日记，这时保留本机的。
        diaries: cloud.diaries ?? dataRef.current.diaries,
      })

      replaceRef.current(next)
      writeSyncedUser(userId)
      ready.current = true
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
  }, [userId])

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

  /** 手动「从云端覆盖本地」—— 换设备、或者本地数据搞乱了时的救命按钮 */
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
      // 日记存在 user_settings.diaries 那一列里（第四轮 SQL 加的）。
      // 云端为 null 时说明那台设备还没写过日记，这时保留本机的。
      diaries: cloud.diaries ?? dataRef.current.diaries,
    })

    replaceRef.current(next)
    writeSyncedUser(userId)
    ready.current = true
    lastTasks.current = tasksFingerprint(next)
    lastSettings.current = settingsFingerprint(next)
    lastDiaries.current = diariesFingerprint(next)
    setStatus('idle')
    setPending(false)
    setLastSyncedAt(Date.now())
  }, [userId])

  return { status, message, pending, lastSyncedAt, pullNow }
}
