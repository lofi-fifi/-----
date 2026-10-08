import { useEffect, useState } from 'react'

import type { ThemeMode } from '../lib/storage'
import { applyTheme, onSystemThemeChange, resolveTheme, type ResolvedTheme } from '../utils/theme'

/**
 * 深浅色模式。
 *
 * 返回**解析后**的主题（light / dark），App 拿它去选背景渐变的版本、
 * 决定要不要给自定义背景图压暗。
 *
 * 选「跟随系统」时会订阅系统的深浅色变化 —— 用户在系统设置里一开深色，
 * 应用立刻跟着变，不用刷新页面。
 */
export function useTheme(mode: ThemeMode): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode))

  // 设置里改了模式就立刻应用
  useEffect(() => {
    setResolved(applyTheme(mode))
  }, [mode])

  // 跟随系统时，盯着系统开关
  useEffect(() => {
    if (mode !== 'system') return

    return onSystemThemeChange(() => {
      setResolved(applyTheme('system'))
    })
  }, [mode])

  return resolved
}
