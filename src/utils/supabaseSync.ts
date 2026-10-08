import {
  checkinsToRows,
  staleTaskIds,
  tasksToRows,
  type CheckinRow,
  type TaskRow,
} from '../lib/sync'
import type { AppData } from '../lib/storage'
import { getSupabase } from './supabase'

export type SyncOutcome = { ok: true } | { ok: false; message: string; offline: boolean }

/** 从云端拉下来的全部内容 */
export type CloudSnapshot = {
  tasks: TaskRow[]
  checkins: CheckinRow[]
  settings: Record<string, unknown> | null
  badges: unknown[] | null
  dayTotals: Record<string, number> | null
  taskCount: number
  checkinCount: number
}

/** 网络不通（而不是权限/数据错误）—— 这种情况要进待同步队列，而不是报错给用户 */
export function isOfflineMessage(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('load failed') ||
    text.includes('timeout') ||
    text.includes('aborted')
  )
}

function failure(message: string): SyncOutcome {
  return { ok: false, message, offline: isOfflineMessage(message) }
}

/**
 * 拉取当前用户在云端的全部内容。
 * 网络失败返回 null —— 调用方据此保持本地数据不动，而不是当成「云端是空的」。
 */
export async function pullCloud(userId: string): Promise<CloudSnapshot | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  try {
    const [taskResult, checkinResult, settingsResult] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('checkins').select('user_id, date').eq('user_id', userId),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    ])

    if (taskResult.error || checkinResult.error) return null

    const tasks = (taskResult.data ?? []) as TaskRow[]
    const checkins = (checkinResult.data ?? []) as CheckinRow[]
    const row = settingsResult.data as
      | { settings: Record<string, unknown> | null; badges: unknown[] | null; day_totals: Record<string, number> | null }
      | null

    return {
      tasks,
      checkins,
      settings: row?.settings ?? null,
      badges: row?.badges ?? null,
      dayTotals: row?.day_totals ?? null,
      taskCount: tasks.length,
      checkinCount: checkins.length,
    }
  } catch {
    return null
  }
}

/**
 * 推送任务和签到。
 *
 * 两步：先把本地的 Upsert 上去，再删掉云端多出来的行。
 * 「云端多出来的」= 本地已经删掉的 —— 不删的话，你在一台设备上删了任务，
 * 另一台一拉取又把它变回来了。
 *
 * 前提是本地已经是权威数据（首次同步拉取完之后才成立），
 * 否则会把别的设备的活儿一起删掉。
 */
export async function pushTasks(userId: string, data: AppData): Promise<SyncOutcome> {
  const supabase = getSupabase()
  if (!supabase) return failure('没有配置 Supabase')

  const now = new Date().toISOString()
  const taskRows = tasksToRows(data, userId, now)
  const checkinRows = checkinsToRows(data, userId)

  try {
    if (taskRows.length > 0) {
      const { error } = await supabase.from('tasks').upsert(taskRows, { onConflict: 'id' })
      if (error) return failure(error.message)
    }

    const { data: cloudTasks, error: readError } = await supabase
      .from('tasks')
      .select('id, date')
      .eq('user_id', userId)

    if (readError) return failure(readError.message)

    const dropIds = staleTaskIds(
      Object.keys(data.tasks),
      taskRows,
      (cloudTasks ?? []).map((row) => ({ id: String(row.id), date: String(row.date) })),
    )

    if (dropIds.length > 0) {
      const { error } = await supabase.from('tasks').delete().in('id', dropIds)
      if (error) return failure(error.message)
    }

    if (checkinRows.length > 0) {
      const { error } = await supabase
        .from('checkins')
        .upsert(checkinRows, { onConflict: 'user_id,date' })
      if (error) return failure(error.message)
    }

    // 签到**只增不删**。
    //
    // 这个应用没有「取消签到」的功能，所以云端永远不需要删签到行。
    // 而如果按「云端有、本地没有就删」来做，同样会出事：
    // 一台还没同步过的设备本地签到是空的，一登录就会把云端记录全清掉。
    // 想清空云端签到的话，去 Supabase 后台手动删更安全。

    return { ok: true }
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 推送设置 / 徽章 / 未关联时长。
 *
 * 单独一个函数，而不是和任务一起推 —— 这里面可能塞着上兆的背景图 Base64，
 * 每加一件任务就重传一遍太浪费。
 */
export async function pushSettings(userId: string, data: AppData): Promise<SyncOutcome> {
  const supabase = getSupabase()
  if (!supabase) return failure('没有配置 Supabase')

  try {
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        settings: data.settings,
        badges: data.badges,
        day_totals: data.dayTotals,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) return failure(error.message)
    return { ok: true }
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}
