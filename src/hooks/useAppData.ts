import { useCallback, useRef, useState } from 'react'

import { loadData, saveData, type AppData } from '../lib/storage'

export type AppDataUpdater = (prev: AppData) => AppData

/**
 * 应用状态的唯一入口。
 *
 * 首次渲染时从 localStorage 读一次，之后所有改动都走 update()：
 * 算新值 → 写回 localStorage → 成功后才更新内存状态。
 *
 * 用 ref 保存最新值，保证连续调用（例如同一帧内改两次）不会丢更新，
 * 同时也避免把写 localStorage 这种副作用放进 setState 的 updater 里
 * （StrictMode 下 updater 会被调用两次）。
 *
 * update 返回**是否写入成功** —— 背景图这类大体积数据可能超配额，
 * 调用方可以据此提示用户，而不是让界面「看着变了、一刷新又没了」。
 */
export function useAppData() {
  const [data, setData] = useState<AppData>(loadData)
  const latest = useRef(data)

  const update = useCallback((updater: AppDataUpdater): boolean => {
    const next = updater(latest.current)

    if (!saveData(next)) return false

    latest.current = next
    setData(next)
    return true
  }, [])

  return { data, update }
}
