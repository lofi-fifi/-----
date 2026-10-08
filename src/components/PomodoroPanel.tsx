import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { usePomodoro } from '../hooks/usePomodoro'
import { todayKey } from '../lib/date'
import { PHASE_MINUTES_BOUNDS } from '../lib/pomodoro'
import type { AppData, Task } from '../lib/storage'
import { addSeconds, sortForDisplay } from '../lib/tasks'
import { formatClock, formatDuration } from '../lib/time'
import { vibrate } from '../utils/feedback'

const EMPTY_TASKS: Task[] = []

/** 滑动多少像素算一格（1 分钟）。移动端 22px 大概是拇指滑一下的 1/4 屏高 */
const SWIPE_STEP_PX = 22

/** 鼠标滚轮多少 deltaY 算一格 */
const WHEEL_STEP = 60

type PomodoroPanelProps = {
  open: boolean
  onClose: () => void
  data: AppData
  update: (updater: (prev: AppData) => AppData) => void
}

/** 页面结构 5：番茄钟面板（从底部滑出） */
export default function PomodoroPanel({
  open,
  onClose,
  data,
  update,
}: PomodoroPanelProps) {
  const today = todayKey()
  const todayTasks = useMemo(
    () => sortForDisplay(data.tasks[today] ?? EMPTY_TASKS),
    [data.tasks, today],
  )

  /** null = 不关联任务，记到今日总时长 */
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [lastLog, setLastLog] = useState<string | null>(null)

  // 选中的任务被删掉（或换了一天）就清空选择
  useEffect(() => {
    if (selectedTaskId && !todayTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null)
    }
  }, [todayTasks, selectedTaskId])

  const targetTask = selectedTaskId
    ? (todayTasks.find((task) => task.id === selectedTaskId) ?? null)
    : null

  /**
   * 记账：优先累加到所选任务；没选任务、或选中的任务已被删掉，
   * 就退到 dayTotals（今日总时长），别把这段时间丢掉。
   */
  const handleLogFocus = useCallback(
    (seconds: number) => {
      const label = targetTask ? targetTask.text : '今日总时长'

      update((prev) => {
        const list = prev.tasks[today] ?? []
        const next = selectedTaskId ? addSeconds(list, selectedTaskId, seconds) : list

        if (next !== list) {
          return { ...prev, tasks: { ...prev.tasks, [today]: next } }
        }

        return {
          ...prev,
          dayTotals: {
            ...prev.dayTotals,
            [today]: (prev.dayTotals[today] ?? 0) + seconds,
          },
        }
      })

      setLastLog(`已记录 ${formatDuration(seconds)} → ${label}`)
    },
    [update, today, selectedTaskId, targetTask],
  )

  const { state, start, pause, reset, adjustBy, effectiveDurations, overrides } = usePomodoro({
    durations: {
      focusMinutes: data.settings.focusMinutes,
      breakMinutes: data.settings.breakMinutes,
    },
    onLogFocus: handleLogFocus,
  })

  /* ---------- 上下滑动调时长 ---------- */

  const timerRef = useRef<HTMLDivElement>(null)
  /** 手指起点、累计位移、是否正按着 */
  const gestureRef = useRef({ y: 0, acc: 0, active: false })
  const [dragging, setDragging] = useState(false)

  /** 连续走 n 格（正数加、负数减）。一格一调用，连滑三格才会加 3 分钟 */
  const applySteps = useCallback(
    (steps: number) => {
      if (steps === 0) return
      let changed = false
      for (let i = 0; i < Math.abs(steps); i += 1) {
        if (adjustBy(steps > 0 ? 1 : -1)) changed = true
      }
      // 到边界时 adjustBy 返回 false，就不震了，手感上能察觉「到头了」
      if (changed) vibrate([12])
    },
    [adjustBy],
  )

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    gestureRef.current = { y: event.clientY, acc: 0, active: true }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture.active) return

    // 往上滑 clientY 变小，取反让「往上 = 加时间」
    gesture.acc += gesture.y - event.clientY
    gesture.y = event.clientY

    let steps = 0
    while (gesture.acc >= SWIPE_STEP_PX) {
      gesture.acc -= SWIPE_STEP_PX
      steps += 1
    }
    while (gesture.acc <= -SWIPE_STEP_PX) {
      gesture.acc += SWIPE_STEP_PX
      steps -= 1
    }

    if (steps !== 0) applySteps(steps)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    gestureRef.current.active = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // 电脑上用滚轮也能调 —— 不然这个功能在桌面上没法试。
  // 必须用非 passive 的监听器才能 preventDefault，挡住背景页面跟着滚。
  const wheelAccRef = useRef(0)
  useEffect(() => {
    const node = timerRef.current
    if (!node) return

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      // 往上滚 deltaY 为负 -> 加时间，和触摸方向一致
      wheelAccRef.current -= event.deltaY

      let steps = 0
      while (wheelAccRef.current >= WHEEL_STEP) {
        wheelAccRef.current -= WHEEL_STEP
        steps += 1
      }
      while (wheelAccRef.current <= -WHEEL_STEP) {
        wheelAccRef.current += WHEEL_STEP
        steps -= 1
      }

      if (steps !== 0) applyStepsRef.current(steps)
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  // 上面那个 effect 只挂一次，靠 ref 拿到最新的 applySteps
  const applyStepsRef = useRef(applySteps)
  applyStepsRef.current = applySteps

  const phaseText = state.phase === 'focus' ? '专注' : '休息'
  const statusText =
    state.status === 'running' ? '进行中' : state.status === 'paused' ? '已暂停' : '待开始'

  /** 当前相位生效的分钟数、上下限、以及有没有被滑动改过 */
  const bounds = PHASE_MINUTES_BOUNDS[state.phase]
  const currentMinutes =
    state.phase === 'focus' ? effectiveDurations.focusMinutes : effectiveDurations.breakMinutes
  const isOverridden = state.phase === 'focus' ? overrides.focus !== null : overrides.break !== null

  function handleStart() {
    setLastLog(null)
    start()
  }

  function handleReset() {
    setLastLog(null)
    reset()
  }

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-scrim transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* 底部滑出面板 */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="番茄钟"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px]
          rounded-t-card border border-line frosted px-5 pt-3
          pb-[max(1.25rem,env(safe-area-inset-bottom))]
          transition-transform duration-200 ease-out motion-reduce:transition-none
          ${open ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* 顶部小把手 */}
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">番茄钟</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-text"
          >
            关闭
          </button>
        </div>

        {/* 6. 这段专注算给哪个任务 */}
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="pomodoro-task" className="shrink-0 text-[13px] text-muted">
            算给
          </label>
          <select
            id="pomodoro-task"
            value={selectedTaskId ?? ''}
            onChange={(event) => setSelectedTaskId(event.target.value || null)}
            className="min-h-11 min-w-0 flex-1 rounded-card border border-line
              bg-panel px-2 text-[14px] text-ink outline-none"
          >
            <option value="">不关联任务（记到今日总时长）</option>
            {todayTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.text}
              </option>
            ))}
          </select>
        </div>

        {/* 大号等宽倒计时 —— 这一块同时是「上下滑动调时长」的手势区 */}
        <div
          ref={timerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-label="专注时长，上下滑动调节"
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuenow={currentMinutes}
          className="flex cursor-ns-resize touch-none flex-col items-center gap-2 py-7 select-none"
        >
          <span className="text-[13px] text-muted">
            {phaseText} · {statusText}
          </span>
          <p
            className={`text-[56px] leading-none font-semibold tracking-tight text-ink tabular-nums
              transition-transform duration-150 ${dragging ? 'scale-[1.05]' : 'scale-100'}`}
          >
            {formatClock(state.remaining)}
          </p>
        </div>

        <p className="mb-4 text-center text-[12px] text-muted">
          上下滑动倒计时可调时长（当前 {currentMinutes} 分钟
          {isOverridden ? '，仅本次' : ''}）
        </p>

        {/* 开始 / 暂停 / 重置 */}
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={state.status === 'running'}
            className="btn-primary disabled:opacity-20"
          >
            {state.status === 'paused' ? '继续' : '开始'}
          </button>
          <button
            type="button"
            onClick={pause}
            disabled={state.status !== 'running'}
            className="btn-ghost disabled:opacity-20"
          >
            暂停
          </button>
          <button type="button" onClick={handleReset} className="btn-ghost">
            重置
          </button>
        </div>

        {/* 记账回执 */}
        <p className="mt-4 h-5 truncate text-center text-[13px] text-muted">
          {lastLog ?? ''}
        </p>
      </section>
    </>
  )
}
