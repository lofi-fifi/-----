import { useCallback, useEffect, useState } from 'react'

import { todayKey } from '../lib/date'
import {
  findProfileByUsername,
  listFriendTaskStats,
  listFriendships,
  removeFriendship,
  respondToRequest,
  sendFriendRequest,
  type FriendProfile,
  type FriendTaskStats,
  type Friendship,
} from '../utils/supabaseFriends'

const FIELD = [
  'min-h-11 w-full rounded-card border border-line bg-panel px-3',
  'text-[15px] text-ink outline-none transition-colors duration-200',
  'placeholder:text-muted focus:border-ink',
].join(' ')

const SMALL_BUTTON = [
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-card border',
  'border-line bg-panel px-3 text-[13px] text-ink transition-colors duration-200',
  'active:bg-surface disabled:opacity-40',
].join(' ')

const DANGER_BUTTON = SMALL_BUTTON.replace('text-ink', 'text-danger')

/** 设置面板开着的时候，多久自动拉一次好友列表 */
const POLL_MS = 15000

type Notice = { tone: 'ok' | 'error'; text: string }

/** 好友今天的状态一句话描述 */
function statusLine(friendship: Friendship, stats: FriendTaskStats | undefined, today: string) {
  const parts: string[] = []

  const streak = friendship.other.streak
  parts.push(streak > 0 ? `连续 ${streak} 天` : '还没开始连续')

  parts.push(friendship.other.lastCheckinDate === today ? '今天已签到' : '今天还没签')

  if (stats && stats.total > 0) parts.push(`任务 ${stats.done}/${stats.total}`)

  return parts.join(' · ')
}

type Props = {
  /**
   * 设置面板是否打开。
   *
   * 这一项不是可有可无的：设置面板其实**一直挂载着**（只是滑出屏幕外），
   * 所以如果只在挂载时读一次，用户第二次打开面板看到的还是最开始那份旧数据 ——
   * 对方发来的好友请求就会「收不到」。
   */
  active?: boolean
}

/**
 * 好友分组：搜人、发请求、同意/拒绝、看好友今天的进度。
 *
 * 只有登录后才会渲染（SettingsPanel 传了 account 才显示这一块）。
 */
export default function FriendsSection({ active = false }: Props) {
  const today = todayKey()

  const [loading, setLoading] = useState(true)
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [stats, setStats] = useState<Record<string, FriendTaskStats>>({})

  const [term, setTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<FriendProfile | null>(null)
  const [searched, setSearched] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  /** 拉好友关系 + 好友今天的任务统计 */
  const reload = useCallback(async () => {
    const list = await listFriendships()
    setFriendships(list)

    const accepted = list.filter((item) => item.status === 'accepted').map((item) => item.other.id)
    setStats(await listFriendTaskStats(accepted, today))
  }, [today])

  // 面板每打开一次就重新拉一遍。写成依赖 active 而不是空依赖，就是为了这个。
  useEffect(() => {
    if (!active) return

    let alive = true
    setLoading(true)
    reload()
      .catch(() => setNotice({ tone: 'error', text: '读取好友列表失败，检查一下网络' }))
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [active, reload])

  // 面板开着的时候每 15 秒静默拉一次。
  // 不然你把面板开着等对方同意，得自己想起来点刷新。
  // 这里**不动 loading**，否则每 15 秒闪一下「读取中…」很晃眼。
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      void reload()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, reload])

  // 从别的 App 切回来时也刷一下 —— 对方可能刚同意，或者刚给你发了请求
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [reload])

  async function handleRefresh() {
    if (loading) return
    setLoading(true)
    setNotice(null)
    try {
      await reload()
    } catch {
      setNotice({ tone: 'error', text: '刷新失败，检查一下网络' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    const name = term.trim()
    if (!name || searching) return

    setSearching(true)
    setNotice(null)
    setFound(null)
    setSearched(false)

    try {
      const result = await findProfileByUsername(name)
      setFound(result)
      setSearched(true)
      if (!result) setNotice({ tone: 'error', text: `没找到叫「${name}」的人` })
    } catch {
      setNotice({ tone: 'error', text: '搜索失败，检查一下网络' })
    } finally {
      setSearching(false)
    }
  }

  /** 包一层：统一的忙碌态、报错提示和刷新 */
  async function run(id: string, action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    if (busyId !== null) return
    setBusyId(id)
    setNotice(null)
    try {
      const result = await action()
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.message ?? '操作失败' })
        return
      }
      setNotice({ tone: 'ok', text: done })
      setFound(null)
      setTerm('')
      setSearched(false)
      await reload()
    } catch {
      setNotice({ tone: 'error', text: '网络出问题了，等会儿再试' })
    } finally {
      setBusyId(null)
    }
  }

  const incoming = friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming')
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing')
  const accepted = friendships.filter((f) => f.status === 'accepted')

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] text-muted">好友</h3>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="btn-text disabled:opacity-40"
        >
          {loading ? '读取中…' : '刷新'}
        </button>
      </div>

      {/* 搜人 */}
      <div className="card flex flex-col gap-3 px-4 py-4">
        <div className="flex gap-2">
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleSearch()
              }
            }}
            placeholder="输入对方的用户名"
            aria-label="搜索好友"
            maxLength={20}
            className={FIELD}
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searching || term.trim().length === 0}
            className={SMALL_BUTTON}
          >
            {searching ? '找…' : '搜索'}
          </button>
        </div>

        {found !== null && (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="truncate text-[14px] text-ink">{found.username}</span>
            <button
              type="button"
              onClick={() =>
                void run(found.id, () => sendFriendRequest(found.id), `已向 ${found.username} 发出请求`)
              }
              disabled={busyId !== null}
              className={SMALL_BUTTON}
            >
              加好友
            </button>
          </div>
        )}

        {found === null && searched && (
          <p className="text-[12px] text-muted">没找到这个人，确认一下用户名拼写</p>
        )}
      </div>

      {notice !== null && (
        <p
          role="status"
          className={`text-[12px] ${notice.tone === 'error' ? 'text-danger' : 'text-muted'}`}
        >
          {notice.text}
        </p>
      )}

      {/* 待我处理 */}
      {incoming.length > 0 && (
        <div className="card flex flex-col divide-y divide-line px-4">
          {incoming.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-3">
              <span className="truncate text-[14px] text-ink">{item.other.username}</span>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    void run(item.id, () => respondToRequest(item.id, true), '已同意')
                  }
                  className={SMALL_BUTTON}
                >
                  同意
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() =>
                    void run(item.id, () => respondToRequest(item.id, false), '已拒绝')
                  }
                  className={DANGER_BUTTON}
                >
                  拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 我发出的 */}
      {outgoing.length > 0 && (
        <div className="card flex flex-col divide-y divide-line px-4">
          {outgoing.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] text-ink">{item.other.username}</span>
                <span className="text-[12px] text-muted">等待对方同意</span>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void run(item.id, () => removeFriendship(item.id), '已撤回请求')}
                className={DANGER_BUTTON}
              >
                撤回
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 已是好友 */}
      {accepted.length > 0 && (
        <div className="card flex flex-col divide-y divide-line px-4">
          {accepted.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] text-ink">{item.other.username}</span>
                <span className="text-[12px] text-muted">
                  {statusLine(item, stats[item.other.id], today)}
                </span>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void run(item.id, () => removeFriendship(item.id), '已删除好友')}
                className={DANGER_BUTTON}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && friendships.length === 0 && (
        <p className="text-[12px] text-muted">
          还没有好友。把对方的用户名输进去搜一下就能加。
        </p>
      )}
    </section>
  )
}
