import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { isSupabaseConfigured } from '../utils/supabase'
import { getCurrentSession, onAuthStateChange, signOut } from '../utils/supabaseAuth'

/**
 * 「先不登录，只用本地」的选择。
 *
 * 这是一个逃生舱口：Supabase 挂掉、或者 .env.local 配错的时候，
 * 用户仍然能进去用自己手机上的本地数据，而不是被一堵登录墙挡在外面。
 * 登录成功后会把这个标记清掉。
 */
const SKIP_KEY = 'kaoyan-skip-login'

function readSkip(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

function writeSkip(value: boolean): void {
  try {
    if (value) localStorage.setItem(SKIP_KEY, '1')
    else localStorage.removeItem(SKIP_KEY)
  } catch {
    // 无痕模式写不了，忽略即可
  }
}

export type AuthStatus =
  /** 正在读本地会话 */
  | 'loading'
  /** .env.local 没配 Supabase，整个应用按纯本地版跑 */
  | 'unconfigured'
  /** 配了但没登录 */
  | 'signedOut'
  /** 已登录 */
  | 'signedIn'
  /** 用户主动选择不登录 */
  | 'localOnly'

export type AuthState = {
  status: AuthStatus
  userId: string | null
  email: string | null
  username: string | null
}

const EMPTY: Omit<AuthState, 'status'> = { userId: null, email: null, username: null }

function fromSession(session: Session | null): AuthState {
  if (session?.user) {
    return {
      status: 'signedIn',
      userId: session.user.id,
      email: session.user.email ?? null,
      username:
        typeof session.user.user_metadata?.username === 'string'
          ? session.user.user_metadata.username
          : null,
    }
  }
  return { status: readSkip() ? 'localOnly' : 'signedOut', ...EMPTY }
}

/**
 * 登录状态。
 *
 * 初始态永远是 loading —— getSession() 只读 localStorage，不发网络请求，
 * 所以断网时也能立刻判断出「已登录」或「未登录」。
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    status: isSupabaseConfigured ? 'loading' : 'unconfigured',
    ...EMPTY,
  }))

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let alive = true
    const apply = (session: Session | null) => {
      if (!alive) return
      if (session?.user) writeSkip(false)
      setState(fromSession(session))
    }

    getCurrentSession()
      .then(apply)
      .catch(() => apply(null))

    const unsubscribe = onAuthStateChange(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  /** 用户选择「先不登录」 */
  const skipLogin = useCallback(() => {
    writeSkip(true)
    setState({ status: 'localOnly', ...EMPTY })
  }, [])

  /**
   * 取消「先不登录」的选择，退回登录页。
   *
   * 少了这个，用户在登录页点了「先不登录」之后就再也进不去登录页了 ——
   * 设置面板里那些登录相关的分组只在已登录时才渲染，等于把自己关在门外。
   */
  const cancelSkip = useCallback(() => {
    writeSkip(false)
    setState({ status: 'signedOut', ...EMPTY })
  }, [])

  const logout = useCallback(async () => {
    writeSkip(false)
    await signOut()
    setState({ status: 'signedOut', ...EMPTY })
  }, [])

  return { ...state, skipLogin, cancelSkip, logout }
}
