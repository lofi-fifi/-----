import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { playDing, unlockAudio, vibrate } from '../utils/feedback'
import {
  clampPhaseMinutes,
  createInitialState,
  reducePomodoro,
  type PomodoroAction,
  type PomodoroDurations,
  type PomodoroPhase,
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

  /**
   * 本次会话的时长覆盖（上下滑动调节用）。null = 没调过，跟随设置。
   *
   * 只活在内存里 —— 刷新页面就回到设置里的值，**不写 localStorage、不进设置**。
   */
  const [overrides, setOverrides] = useState<{ focus: number | null; break: number | null }>({
    focus: null,
    break: null,
  })

  /**
   * adjustBy 可能在同一次事件里被连续调用（滑得快时一格接一格），
   * 用 ref 保存权威值，保证每次都读到最新的覆盖数，
   * 而不是上一次渲染时的闭包快照 —— 否则连滑三格只会加 1 分钟。
   */
  const overridesRef = useRef(overrides)

  /** 真正生效的时长：有覆盖用覆盖，没有就用设置里的 */
  const effectiveDurations = useMemo(
    () => ({
      focusMinutes: overrides.focus ?? durations.focusMinutes,
      breakMinutes: overrides.break ?? durations.breakMinutes,
    }),
    [overrides.focus, overrides.break, durations.focusMinutes, durations.breakMinutes],
  )
  const effectiveRef = useLatest(effectiveDurations)

  /** 当前这一段的结束时间戳 */
  const deadlineRef = useRef(0)

  const dispatch = useCallback((action: PomodoroAction) => {
    const result = reducePomodoro(stateRef.current, action, effectiveRef.current)

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

  // 时长变了（改设置、或者滑动覆盖）：空闲时倒计时数字跟着变，跑着的这一段不受影响
  useEffect(() => {
    dispatch({ type: 'durations' })
  }, [effectiveDurations.focusMinutes, effectiveDurations.breakMinutes, dispatch])

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

  /**
   * 上下滑动调时长。deltaMinutes 是分钟增量（往上滑传 +1）。
   *
   * 改的只是**当前相位**这一次的时长：正在计时就连剩余时间一起加减，
   * 空闲时由上面的 durations effect 重新对齐倒计时。返回是否真的变了
   * （到边界时返回 false，界面据此决定要不要震一下）。
   */
  const adjustBy = useCallback(
    (deltaMinutes: number): boolean => {
      const phase: PomodoroPhase = stateRef.current.phase
      const current =
        overridesRef.current[phase] ??
        (phase === 'focus'
          ? durationsRef.current.focusMinutes
          : durationsRef.current.breakMinutes)

      const next = clampPhaseMinutes(phase, current + deltaMinutes)
      if (next === current) return false

      overridesRef.current = { ...overridesRef.current, [phase]: next }
      setOverrides(overridesRef.current)

      // 正在跑 / 暂停时剩余时间同步加减；空闲时上面那个 effect 会按新时长重排
      dispatch({ type: 'adjust', deltaSeconds: (next - current) * 60 })
      return true
    },
    [dispatch],
  )

  return { state, start, pause, reset, adjustBy, effectiveDurations, overrides }
}
