import { getSupabase } from './supabase'

export type FriendActionResult = { ok: true } | { ok: false; message: string }

export type FriendProfile = {
  id: string
  username: string
  /** 连续签到天数。搜索出来的陌生人看不到（RPC 只返回 id + username），所以是 0 */
  streak: number
  lastCheckinDate: string | null
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

export type Friendship = {
  id: string
  status: FriendshipStatus
  /** outgoing = 我发起的；incoming = 别人发给我的 */
  direction: 'incoming' | 'outgoing'
  other: FriendProfile
}

/** 好友今天的学习概览 */
export type FriendTaskStats = { total: number; done: number }

/** 把数据库的英文报错翻成人话 */
export function translateDataError(message: string): string {
  const text = message.toLowerCase()

  if (text.includes('duplicate key')) return '这条好友关系已经存在了'
  if (text.includes('does not exist') || text.includes('could not find the function')) {
    return '数据库函数不存在 —— 第三轮的 003-friends-rpc.sql 跑了吗？'
  }
  if (text.includes('permission denied') || text.includes('row-level security')) {
    return '没有权限。可能是 RLS 策略没生效，或者你们还不是好友'
  }
  if (text.includes('violates check constraint')) return '数据不合法（比如不能加自己为好友）'
  if (text.includes('failed to fetch') || text.includes('networkerror')) {
    return '网络连不上，检查一下网络'
  }

  return message
}

/** 当前登录用户的 id，没登录返回 null。只读本地会话，不发网络请求。 */
export async function myUserId(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

type FriendshipRow = {
  id: string
  status: string
  dir: string
  other_id: string
  other_username: string
  other_streak: number
  other_last_checkin: string | null
}

/**
 * 我的全部好友关系（含待确认的请求）。
 *
 * 走 list_my_friendships 这个 SECURITY DEFINER 函数 —— 因为待确认的请求
 * 双方还不是「好友」，直接查 profiles 会被 RLS 拦下、拿不到对方用户名。
 */
export async function listFriendships(): Promise<Friendship[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase.rpc('list_my_friendships')
  if (error || !data) return []

  return (data as FriendshipRow[]).map((row) => ({
    id: row.id,
    status: row.status as FriendshipStatus,
    direction: row.dir === 'outgoing' ? 'outgoing' : 'incoming',
    other: {
      id: row.other_id,
      username: row.other_username,
      streak: row.other_streak ?? 0,
      lastCheckinDate: row.other_last_checkin,
    },
  }))
}

/**
 * 按用户名精确找人。
 *
 * 只返回 id + username —— 陌生人的连续天数、签到记录都看不到，
 * 加了好友之后才可见。
 */
export async function findProfileByUsername(raw: string): Promise<FriendProfile | null> {
  const supabase = getSupabase()
  const username = raw.trim()
  if (!supabase || !username) return null

  const { data, error } = await supabase.rpc('find_profile_by_username', { lookup: username })
  if (error || !data) return null

  const rows = data as { id: string; username: string }[]
  if (rows.length === 0) return null

  return { id: rows[0].id, username: rows[0].username, streak: 0, lastCheckinDate: null }
}

/**
 * 发好友请求。
 *
 * 三种情况都处理了：
 *   1. 我已经发过 → 提示等待
 *   2. **对方先发过给我** → 直接互相成为好友（不用再等一轮，体验好很多）
 *   3. 都没有 → 新建一条 pending
 */
export async function sendFriendRequest(targetId: string): Promise<FriendActionResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, message: '没有配置 Supabase' }

  const me = await myUserId()
  if (!me) return { ok: false, message: '请先登录' }
  if (me === targetId) return { ok: false, message: '不能加自己' }

  const { data: outgoing } = await supabase
    .from('friendships')
    .select('id, status')
    .eq('user_id', me)
    .eq('friend_id', targetId)
    .maybeSingle()

  if (outgoing) {
    return outgoing.status === 'accepted'
      ? { ok: false, message: '你们已经是好友了' }
      : { ok: false, message: '已经发过请求了，等对方同意' }
  }

  const { data: incoming } = await supabase
    .from('friendships')
    .select('id, status')
    .eq('user_id', targetId)
    .eq('friend_id', me)
    .maybeSingle()

  // 对方先发过 → 我这一下等于「同意」，直接成为好友
  if (incoming) {
    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', incoming.id)
      .select('id')

    if (error) return { ok: false, message: translateDataError(error.message) }
    // ⚠️ UPDATE 被 RLS 挡掉时 PostgREST 返回 204 且**不带 error**，
    //    只看 error 会把「什么都没改」当成成功。必须看有没有真的返回行。
    if (!data || data.length === 0) {
      return { ok: false, message: '这条请求已经不在了，刷新一下再看看' }
    }
    return { ok: true }
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ user_id: me, friend_id: targetId, status: 'pending' })

  if (error) return { ok: false, message: translateDataError(error.message) }
  return { ok: true }
}

/** 同意或拒绝一个收到的好友请求。拒绝 = 直接删掉那一行。 */
export async function respondToRequest(
  friendshipId: string,
  accept: boolean,
): Promise<FriendActionResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, message: '没有配置 Supabase' }

  if (!accept) {
    const { data, error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
      .select('id')

    if (error) return { ok: false, message: translateDataError(error.message) }
    if (!data || data.length === 0) {
      return { ok: false, message: '这条请求已经不在了，刷新一下再看看' }
    }
    return { ok: true }
  }

  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select('id')

  if (error) return { ok: false, message: translateDataError(error.message) }
  if (!data || data.length === 0) {
    return { ok: false, message: '这条请求已经不在了，刷新一下再看看' }
  }
  return { ok: true }
}

/** 删除好友关系（也用于撤回自己发出的请求） */
export async function removeFriendship(friendshipId: string): Promise<FriendActionResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, message: '没有配置 Supabase' }

  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .select('id')

  if (error) return { ok: false, message: translateDataError(error.message) }
  if (!data || data.length === 0) {
    return { ok: false, message: '这条关系已经不在了，刷新一下再看看' }
  }
  return { ok: true }
}

/**
 * 批量查好友某天的任务完成情况。
 *
 * 一次查完所有好友，而不是每个好友查一遍 —— 5 个好友就是 1 次请求而不是 5 次。
 * 依赖 tasks 的 RLS 策略：已同意的好友之间互相可读。
 */
export async function listFriendTaskStats(
  userIds: string[],
  date: string,
): Promise<Record<string, FriendTaskStats>> {
  const stats: Record<string, FriendTaskStats> = {}
  for (const id of userIds) stats[id] = { total: 0, done: 0 }

  const supabase = getSupabase()
  if (!supabase || userIds.length === 0) return stats

  const { data, error } = await supabase
    .from('tasks')
    .select('user_id, done')
    .in('user_id', userIds)
    .eq('date', date)

  if (error || !data) return stats

  for (const row of data as { user_id: string; done: boolean }[]) {
    const entry = stats[row.user_id]
    if (!entry) continue
    entry.total += 1
    if (row.done) entry.done += 1
  }

  return stats
}
