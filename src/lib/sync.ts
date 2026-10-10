/**
 * 云端同步的纯逻辑：本地数据 ⇄ 数据库行 的互相转换、差异计算、变更指纹。
 * 不碰网络、不碰 DOM，方便单测。
 */

import type { AppData, Task } from './storage'

/** tasks 表的一行 */
export type TaskRow = {
  id: string
  user_id: string
  date: string
  text: string
  done: boolean
  seconds: number
  position: number
  created_at: string
  updated_at: string
}

/** checkins 表的一行 */
export type CheckinRow = {
  user_id: string
  date: string
}

function toIso(millis: number): string {
  const date = new Date(Number.isFinite(millis) ? millis : 0)
  return date.toISOString()
}

/**
 * 把本地的 { 日期: Task[] } 摊平成数据库行。
 *
 * position 记的是任务在当天的顺序 —— 拉回来时靠它还原排列，
 * 不然跨设备同步完顺序会乱。
 */
export function tasksToRows(data: AppData, userId: string, now: string): TaskRow[] {
  const rows: TaskRow[] = []

  for (const date of Object.keys(data.tasks)) {
    const list = data.tasks[date] ?? []
    list.forEach((task, index) => {
      rows.push({
        id: task.id,
        user_id: userId,
        date,
        text: task.text,
        done: task.done,
        seconds: Math.max(0, Math.round(task.seconds)),
        position: index,
        created_at: toIso(task.createdAt),
        updated_at: now,
      })
    })
  }

  return rows
}

/** 把数据库行还原成 { 日期: Task[] }，同一天内按 position 排序 */
export function rowsToTasks(rows: TaskRow[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {}
  const sorted = [...rows].sort((a, b) => a.position - b.position)

  for (const row of sorted) {
    const list = map[row.date] ?? (map[row.date] = [])
    list.push({
      id: row.id,
      text: row.text,
      done: row.done,
      seconds: row.seconds,
      createdAt: Date.parse(row.created_at),
    })
  }

  return map
}

export function checkinsToRows(data: AppData, userId: string): CheckinRow[] {
  return data.checkins.map((date) => ({ user_id: userId, date }))
}

export function rowsToCheckins(rows: CheckinRow[]): string[] {
  return [...new Set(rows.map((row) => row.date))].sort()
}

/**
 * 云端算不算「空」。
 *
 * 决定首次同步的方向：
 *   空   → 把本机数据传上去（新账号 / 换设备第一次用）
 *   不空 → 用云端覆盖本地
 *
 * 只看 tasks 和 checkins，不看 profiles —— 因为注册时触发器就建好资料了，
 * 那时候云端「有资料但没内容」，不能当成「有数据」。
 */
export function isEmptyCloud(taskCount: number, checkinCount: number): boolean {
  return taskCount === 0 && checkinCount === 0
}

/**
 * 该从云端删掉哪些任务行。
 *
 * ⚠️ 这里的关键是**只删「本地确实编辑过的日期」**。
 *
 * 如果简单按「云端有、本地没有就删」，会出现这种事：
 * 你在手机上加了 10 件任务同步上去了，然后在电脑上第一次打开应用 ——
 * 电脑本地一个任务都没有，于是那 10 件**全被删干净**。
 *
 * 加上日期过滤之后：电脑从没碰过 2026-10-08 这一天，就不会去动它；
 * 而你在某一天里真的删掉了一件任务时，`data.tasks` 里那天的 key 还在
 * （只是数组变短了），所以删除照常能同步出去。
 *
 * ⚠️ touchedDates 必须来自 `Object.keys(data.tasks)`，**不能**从 local 行里推。
 * 一天的任务被删光时，那天在 local 里一行都没有，从行里推就会漏掉这个日期，
 * 结果「删掉当天最后一件任务」同步不出去。
 */
export function staleTaskIds(
  touchedDates: string[],
  local: TaskRow[],
  cloud: { id: string; date: string }[],
): string[] {
  const keep = new Set(local.map((row) => row.id))
  const touched = new Set(touchedDates)

  return cloud
    .filter((row) => touched.has(row.date) && !keep.has(row.id))
    .map((row) => row.id)
}

/**
 * 变更指纹：内容没变就不推送，避免每次渲染都打一趟网络。
 *
 * 拆成两个是为了省流量：
 *   tasks    —— 加一件任务就变，数据很小
 *   settings —— 里面可能塞着上兆的背景图 Base64
 * 不拆的话，你每加一件任务都会把 2MB 的图片重传一遍。
 */
export function tasksFingerprint(data: AppData): string {
  return JSON.stringify({ tasks: data.tasks, checkins: data.checkins })
}

/**
 * 设置指纹。背景图的 Base64 体量很大（可能上兆），不能整个塞进指纹，
 * 否则每次渲染都要序列化几兆字符串。
 *
 * 改用「长度 + 头尾各 24 字符」代替：能区分开不同的图，
 * 又只碰每个字符串的两个端点，开销可以忽略。
 */
export function settingsFingerprint(data: AppData): string {
  const bg = data.settings.background

  return JSON.stringify({
    badges: data.badges,
    dayTotals: data.dayTotals,
    settings: {
      ...data.settings,
      background: {
        ...bg,
        images: bg.images.map((item) => `${item.length}:${item.slice(0, 24)}:${item.slice(-24)}`),
      },
    },
  })
}

/**
 * 日记指纹。这是第三个独立指纹。
 *
 * 为什么不并进 settingsFingerprint：设置里可能塞着上兆的背景图 Base64，
 * 写一篇日记不该把那些重传一遍。
 */
export function diariesFingerprint(data: AppData): string {
  return JSON.stringify(data.diaries)
}
