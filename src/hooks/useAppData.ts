import { useCallback, useRef, useState } from 'react'

import { loadData, saveData, type AppData } from '../lib/storage'

export type AppDataUpdater = (prev: AppData) => AppData

/**
 * 应用状态的唯一入口。
 *
 * 首次渲染时从 localStorage 读一次，之后所有改动都走 update()：
 * 算新值 → 立刻 setState → 立刻写回 localStorage。
 *
 * 用 ref 保存最新值，保证连续调用（例如同一帧内改两次）不会丢更新，
 * 同时也避免把写 localStorage 这种副作用放进 setState 的 updater 里
 * （StrictMode 下 updater 会被调用两次）。
 */
export function useAppData() {
  const [data, setData] = useState<AppData>(loadData)
  const latest = useRef(data)

  const update = useCallback((updater: AppDataUpdater) => {
    const next = updater(latest.current)
    latest.current = next
    setData(next)
    saveData(next)
  }, [])

  return { data, update }
}
