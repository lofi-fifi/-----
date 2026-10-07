import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { formatDateLabel, isToday, shiftDateKey, todayKey } from '../lib/date'
import type { AppData, Task } from '../lib/storage'
import {
  addMinutes,
  addTask,
  removeTask,
  renameTask,
  restoreTask,
  sortForDisplay,
  toggleTask,
} from '../lib/tasks'
import DurationDialog from './DurationDialog'
import TaskItem from './TaskItem'
import UndoToast from './UndoToast'

const EMPTY_TASKS: Task[] = []

/** 撤销提示保留多久 */
const UNDO_TIMEOUT_MS = 3000

/** 被删任务的快照，带上它在存储里的原始下标，撤销时插回原位 */
type PendingUndo = {
  dateKey: string
  task: Task
  index: number
}

const NAV_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-card border border-line ' +
  'text-muted transition-colors duration-200 active:text-ink'

type TaskListProps = {
  data: AppData
  update: (updater: (prev: AppData) => AppData) => void
}

/**
 * 今日任务列表。
 * 支持左右切换日期查看/编辑其它日期，所有改动立即写入 localStorage。
 */
export default function TaskList({ data, update }: TaskListProps) {
  const [dateKey, setDateKey] = useState(todayKey)
  const [draft, setDraft] = useState('')
  const [logTaskId, setLogTaskId] = useState<string | null>(null)
  const [undo, setUndo] = useState<PendingUndo | null>(null)

  const tasks = data.tasks[dateKey] ?? EMPTY_TASKS
  const visible = useMemo(() => sortForDisplay(tasks), [tasks])
  const showingToday = isToday(dateKey)
  const logTarget = logTaskId
    ? (tasks.find((task) => task.id === logTaskId) ?? null)
    : null

  // 撤销提示 3 秒后自动消失；连着删两次就重置计时，只留最后一次
  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [undo])

  /** 把这一天的任务整列表写回 AppData，空列表就把键删掉，别在存储里留空数组 */
  function commit(next: Task[]) {
    update((prev) => {
      const allTasks = { ...prev.tasks }
      if (next.length === 0) delete allTasks[dateKey]
      else allTasks[dateKey] = next
      return { ...prev, tasks: allTasks }
    })
  }

  /** 切日期时丢掉未提交的输入和打开中的弹窗，避免误落到别的日期 */
  function resetTransientState() {
    setDraft('')
    setLogTaskId(null)
  }

  function changeDate(days: number) {
    resetTransientState()
    setDateKey((prev) => shiftDateKey(prev, days))
  }

  function goToToday() {
    resetTransientState()
    setDateKey(todayKey())
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    commit(addTask(tasks, text))
    setDraft('')
  }

  function handleRename(task: Task, text: string) {
    const next = renameTask(tasks, task.id, text)
    if (next === tasks) return // 空文字或没改动，别白写一次存储
    commit(next)
  }

  /** 删除后留一个撤销入口，记下它在存储里的下标，撤销时插回原位 */
  function handleDelete(task: Task) {
    const index = tasks.findIndex((item) => item.id === task.id)
    if (index < 0) return

    commit(removeTask(tasks, task.id))
    setUndo({ dateKey, task, index })
  }

  /** 撤销写回它被删的那一天，跟当前正在看哪天无关 */
  function handleUndo() {
    if (!undo) return
    const { dateKey: targetDate, task, index } = undo
    setUndo(null)

    update((prev) => {
      const list = prev.tasks[targetDate] ?? []
      const next = restoreTask(list, task, index)
      if (next === list) return prev // 已经在列表里，不用改
      return { ...prev, tasks: { ...prev.tasks, [targetDate]: next } }
    })
  }

  return (
    <section className="card">
      {/* 标题 + 日期切换：一起放进卡片，背景是深色图时文字才看得清 */}
      <div className="flex flex-col gap-3 px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">
            {showingToday ? '今日任务' : '任务'}
          </h2>
          <span className="text-[13px] text-muted">共 {visible.length} 项</span>
        </div>

        <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => changeDate(-1)}
          aria-label="前一天"
          className={NAV_BUTTON}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {showingToday ? (
          <span className="text-[13px] text-muted">
            {formatDateLabel(dateKey)}
          </span>
        ) : (
          <button
            type="button"
            onClick={goToToday}
            className="btn-text"
          >
            {formatDateLabel(dateKey)} · 回到今天
          </button>
        )}

        <button
          type="button"
          onClick={() => changeDate(1)}
          aria-label="后一天"
          className={NAV_BUTTON}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        </div>
      </div>

      {/* 添加任务：回车或点加号 */}
      <form
        onSubmit={handleAdd}
        className="flex items-center gap-3 border-t border-line px-5 py-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="添加任务，回车确认"
          aria-label="新任务内容"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink
            outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="添加任务"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink
            text-white transition-opacity duration-200 disabled:opacity-20"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="border-t border-line px-5 py-8 text-center text-[13px] text-muted">
          这一天还没有任务
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {visible.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => commit(toggleTask(tasks, task.id))}
              onRename={(text) => handleRename(task, text)}
              onLogTime={() => setLogTaskId(task.id)}
              onDelete={() => handleDelete(task)}
            />
          ))}
        </ul>
      )}

      {logTarget && (
        <DurationDialog
          taskText={logTarget.text}
          currentSeconds={logTarget.seconds}
          onCancel={() => setLogTaskId(null)}
          onConfirm={(minutes) => {
            commit(addMinutes(tasks, logTarget.id, minutes))
            setLogTaskId(null)
          }}
        />
      )}

      {undo && (
        <UndoToast
          message={`已删除「${undo.task.text}」`}
          onUndo={handleUndo}
        />
      )}
    </section>
  )
}
