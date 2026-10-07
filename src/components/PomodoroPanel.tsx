import { useCallback, useEffect, useMemo, useState } from 'react'

import { usePomodoro } from '../hooks/usePomodoro'
import { todayKey } from '../lib/date'
import type { AppData, Task } from '../lib/storage'
import { addSeconds, sortForDisplay } from '../lib/tasks'
import { formatClock, formatDuration } from '../lib/time'

const EMPTY_TASKS: Task[] = []

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

  const { state, start, pause, reset } = usePomodoro({
    durations: {
      focusMinutes: data.settings.focusMinutes,
      breakMinutes: data.settings.breakMinutes,
    },
    onLogFocus: handleLogFocus,
  })

  const phaseText = state.phase === 'focus' ? '专注' : '休息'
  const statusText =
    state.status === 'running' ? '进行中' : state.status === 'paused' ? '已暂停' : '待开始'

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
        className={`fixed inset-0 z-40 bg-ink/20 transition-opacity duration-200 ${
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
              bg-white px-2 text-[14px] text-ink outline-none"
          >
            <option value="">不关联任务（记到今日总时长）</option>
            {todayTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.text}
              </option>
            ))}
          </select>
        </div>

        {/* 大号等宽倒计时 */}
        <div className="flex flex-col items-center gap-2 py-7">
          <span className="text-[13px] text-muted">
            {phaseText} · {statusText}
          </span>
          <p className="text-[56px] leading-none font-semibold tracking-tight text-ink tabular-nums">
            {formatClock(state.remaining)}
          </p>
        </div>

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
