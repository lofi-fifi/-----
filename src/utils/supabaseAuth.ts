import type { Session } from '@supabase/supabase-js'

import { getSupabase } from './supabase'

export type AuthResult = { ok: true } | { ok: false; message: string }

/**
 * 把 Supabase 的英文报错翻成人话。
 *
 * 不翻译的话，用户注册失败看到的是
 * "Invalid login credentials" 或者 "For security purposes, you can only
 * request this after 47 seconds" —— 完全不知道该怎么办。
 */
export function translateAuthError(message: string): string {
  const text = message.toLowerCase()

  if (text.includes('invalid login credentials')) return '邮箱或密码不对'
  if (text.includes('email not confirmed')) return '邮箱还没确认，去邮箱点一下验证链接（或者让管理员关掉邮箱确认）'
  if (text.includes('user already registered')) return '这个邮箱已经注册过了，直接登录吧'
  if (text.includes('already been registered')) return '这个邮箱已经注册过了，直接登录吧'
  if (text.includes('password should be at least')) return '密码太短了，至少 6 位'
  if (text.includes('password is too short')) return '密码太短了，至少 6 位'
  if (text.includes('unable to validate email')) return '邮箱格式不对'
  if (text.includes('email address is invalid')) return '邮箱格式不对'
  if (text.includes('email logins are disabled')) return 'Supabase 里没打开邮箱登录（Authentication → Sign In / Providers → Email）'
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return 'Supabase 里关闭了注册'
  }
  if (text.includes('for security purposes')) return '操作太频繁了，等一会儿再试'
  if (text.includes('rate limit') || text.includes('too many requests')) {
    return '请求太频繁了，等一会儿再试'
  }
  if (text.includes('invalid api key') || text.includes('no api key')) {
    return 'Supabase key 不对，检查 .env.local 里的 VITE_SUPABASE_ANON_KEY'
  }
  if (text.includes('failed to fetch') || text.includes('networkerror')) {
    return '网络连不上 Supabase，检查一下网络'
  }
  if (text.includes('database error saving new user')) {
    return '建用户资料失败，可能是 username 重复或数据库触发器出错'
  }

  // 没匹配上就原样返回，至少让人能搜
  return message
}

/** 用户名规则，和数据库里的 check 约束保持一致（trim 后 2~20 字） */
export function validateUsername(raw: string): string | null {
  const name = raw.trim()
  if (name.length < 2) return '用户名至少 2 个字'
  if (name.length > 20) return '用户名最多 20 个字'
  return null
}

export function validateEmail(raw: string): string | null {
  const email = raw.trim()
  if (!email) return '请填邮箱'
  // 故意宽松：只挡住明显不是邮箱的输入，真伪交给服务端判断
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不对'
  return null
}

export function validatePassword(raw: string): string | null {
  if (!raw) return '请填密码'
  if (raw.length < 6) return '密码至少 6 位'
  return null
}

export type SignUpResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; message: string }

/**
 * 注册。username 通过 metadata 传给数据库的 handle_new_user 触发器自动建档。
 *
 * 返回 needsConfirmation 是为了告诉用户「去邮箱点链接」——
 * 判断依据是 signUp 有没有直接返回 session：
 *   有 session  = 邮箱确认已关闭，注册完就是登录态
 *   没 session  = 邮箱确认开着，必须先去邮箱点链接
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  username: string,
): Promise<SignUpResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, message: '没有配置 Supabase' }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username: username.trim() } },
  })

  if (error) return { ok: false, message: translateAuthError(error.message) }
  return { ok: true, needsConfirmation: data.session === null }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, message: '没有配置 Supabase' }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) return { ok: false, message: translateAuthError(error.message) }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** 订阅登录状态变化，返回退订函数 */
export function onAuthStateChange(handler: (session: Session | null) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(session)
  })

  return () => data.subscription.unsubscribe()
}
