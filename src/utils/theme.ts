import type { ThemeMode } from '../lib/storage'

/** 实际生效的主题：system 会被解析成这两个之一 */
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 浅色 / 深色下浏览器自己的 UI（状态栏、地址栏）用什么颜色 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#FFFFFF',
  dark: '#0B0B0B',
}

/**
 * 单独存一份解析好的主题，就为了 index.html 里那段前置脚本能**飞快**读到。
 *
 * 为什么不读 kaoyan-app-data：那里面可能塞着上兆的背景图 Base64，
 * 为了一个主题去 JSON.parse 几兆字符串，会实打实拖慢首屏。
 */
const CACHE_KEY = 'kaoyan-theme'

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

/** 把设置里的三档解析成实际该用哪一档 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

/** 订阅系统深浅色切换。返回退订函数。 */
export function onSystemThemeChange(handler: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}

  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}

/**
 * 把主题落到 DOM 上。
 *
 * 只写**解析后**的值（light / dark），不写 'system' ——
 * CSS 那边只需要知道最终用哪套变量，判断「是不是跟随系统」是 JS 的事。
 *
 * 顺带同步 <meta name="theme-color">，这样安卓状态栏和 iOS 的地址栏
 * 会跟着一起变色，不会出现「页面是黑的、状态栏是白的」。
 */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode)
  if (typeof document === 'undefined') return resolved

  const root = document.documentElement
  root.setAttribute('data-theme', resolved)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved])

  try {
    localStorage.setItem(CACHE_KEY, resolved)
  } catch {
    // 无痕模式写不了，下次首屏会退回「跟随系统」，不影响正确性
  }

  return resolved
}
