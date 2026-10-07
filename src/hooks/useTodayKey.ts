import { useEffect, useState } from 'react'

import { todayKey } from '../lib/date'

/**
 * 今天的日期键（本地时区），跨零点会自动更新。
 *
 * 应用一直开着不动时，「今天」不会自己变 —— 倒计时、任务列表、
 * 每日随机背景都会停在旧日期上。这里每分钟检查一次日期有没有翻篇，
 * 只在真的变了的时候才 setState，所以不会造成多余渲染。
 */
export function useTodayKey(): string {
  const [key, setKey] = useState(todayKey)

  useEffect(() => {
    const id = window.setInterval(() => {
      setKey((prev) => {
        const next = todayKey()
        return next === prev ? prev : next
      })
    }, 60_000)

    return () => window.clearInterval(id)
  }, [])

  return key
}
