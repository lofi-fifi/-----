import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 客户端的唯一入口。
 *
 * 两个值来自构建时注入的环境变量（本地是 .env.local，线上是 GitHub Actions secrets）：
 *   VITE_SUPABASE_URL       https://xxxxx.supabase.co   ← 结尾**不带** /rest/v1/
 *   VITE_SUPABASE_ANON_KEY  sb_publishable_...          ← 绝不能是 secret / service_role
 */

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SUPABASE_URL = typeof rawUrl === 'string' ? rawUrl.trim() : ''
export const SUPABASE_ANON_KEY = typeof rawKey === 'string' ? rawKey.trim() : ''

/**
 * 有没有配好 Supabase。
 *
 * 没配好时整个应用**退化成纯本地版** —— 登录和好友入口隐藏，其余功能照常。
 * 这样 .env.local 忘了填、或者部署时 secrets 没配，应用也不会白屏。
 */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 0

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (cached) return cached

  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // 会话写进 localStorage，重开页面仍是登录态（断网也进得来）
      persistSession: true,
      // token 过期自动续期
      autoRefreshToken: true,
      // 邮箱验证链接回来时，从 URL 里把会话捡起来
      detectSessionInUrl: true,
      // 独立 key，避免和 kaoyan-app-data 那套本地数据混在一起
      storageKey: 'kaoyan-auth',
    },
  })

  return cached
}
