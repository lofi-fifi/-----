import { useCallback, useEffect, useRef, useState } from 'react'

import { playDing, unlockAudio, vibrate } from '../utils/feedback'
import {
  createInitialState,
  reducePomodoro,
  type PomodoroAction,
  type PomodoroDurations,
  type PomodoroState,
} from '../lib/pomodoro'
import { formatClock } from '../lib/time'

/** 计时器刷新间隔：比 1 秒密一点，保证秒数跳动不飘 */
const TICK_MS = 250

/** 让 ref 始终指向最新值，供稳定的事件回调读取（避免闭包读到旧 state） */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

type Options = {
  durations: PomodoroDurations
  /** 专注结束 / 手动停止时回调，参数是要记账的秒数 */
  onLogFocus: (seconds: number) => void
}

/**
 * 番茄钟。计时状态只活在内存里，刷新即重置（按需求不持久化）。
 *
 * 用「截止时间戳 + 定时轮询」而不是每秒减一，避免 setInterval 漂移累积误差。
 * 提示音 / 震动由 utils/feedback 内部按设置开关判断，这里不用关心。
 */
export function usePomodoro({ durations, onLogFocus }: Options) {
  const [state, setState] = useState<PomodoroState>(() =>
    createInitialState(durations),
  )

  const stateRef = useLatest(state)
  const durationsRef = useLatest(durations)
  const onLogFocusRef = useLatest(onLogFocus)

  /** 当前这一段的结束时间戳 */
  const deadlineRef = useRef(0)

  const dispatch = useCallback((action: PomodoroAction) => {
    const result = reducePomodoro(stateRef.current, action, durationsRef.current)

    if (result.state !== stateRef.current) {
      stateRef.current = result.state
      setState(result.state)
    }

    if (result.alert) {
      playDing()
      vibrate([200])
    }

    if (result.loggedFocusSeconds > 0) {
      onLogFocusRef.current(result.loggedFocusSeconds)
    }
  }, [])

  // 计时循环：status / phase / sessionTotal 变了就重算截止时间戳
  useEffect(() => {
    if (state.status !== 'running') return

    deadlineRef.current = Date.now() + state.remaining * 1000

    const tick = () => {
      const msLeft = deadlineRef.current - Date.now()
      const remaining = msLeft <= 0 ? 0 : Math.ceil(msLeft / 1000)
      dispatch({ type: 'tick', phase: state.phase, remaining })
    }

    // 标签页在后台时 setInterval 会被限流（最长 1 分钟一次），
    // 回到前台立刻补算一次，别干等下一个 tick
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }

    tick()
    const id = window.setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [state.status, state.phase, state.sessionTotal, dispatch])

  // 设置里改了时长：空闲时倒计时数字跟着变，跑着的这一段不受影响
  useEffect(() => {
    dispatch({ type: 'durations' })
  }, [durations.focusMinutes, durations.breakMinutes, dispatch])

  // 标签页标题显示剩余时间
  const baseTitleRef = useRef('')
  useEffect(() => {
    baseTitleRef.current = document.title
    return () => {
      document.title = baseTitleRef.current
    }
  }, [])

  useEffect(() => {
    const base = baseTitleRef.current
    if (state.status === 'idle') {
      document.title = base
      return
    }
    const label = state.phase === 'focus' ? '专注' : '休息'
    document.title = `${formatClock(state.remaining)} · ${label} · ${base}`
  }, [state.status, state.phase, state.remaining])

  const start = useCallback(() => {
    // 在用户手势里解锁音频，否则到点响铃会被浏览器拦掉
    unlockAudio()
    dispatch({ type: 'start' })
  }, [dispatch])

  const pause = useCallback(() => dispatch({ type: 'pause' }), [dispatch])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch])

  return { state, start, pause, reset }
}
