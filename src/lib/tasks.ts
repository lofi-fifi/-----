/**
 * 任务列表的纯函数操作。
 * 每个函数都是「旧数组 → 新数组」，不改原数组，方便直接塞进 updateData。
 */

import { createId, type Task } from './storage'

/**
 * 展示用排序：已完成沉到底部。
 * Array.prototype.sort 是稳定的，所以两组内部都保持原有顺序。
 * 只在渲染时调用，不写回 localStorage —— 存储里始终保留添加顺序。
 */
export function sortForDisplay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done))
}

export function addTask(tasks: Task[], text: string): Task[] {
  const trimmed = text.trim()
  if (!trimmed) return tasks

  return [
    ...tasks,
    {
      id: createId(),
      text: trimmed,
      done: false,
      seconds: 0,
      createdAt: Date.now(),
    },
  ]
}

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
}

export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id)
}

/** 重命名：空文字视为取消，不产生改动 */
export function renameTask(tasks: Task[], id: string, text: string): Task[] {
  const trimmed = text.trim()
  if (!trimmed) return tasks

  return tasks.map((task) => (task.id === id ? { ...task, text: trimmed } : task))
}

/**
 * 撤销删除：把任务插回它原来的下标位置。
 * 下标越界就贴到末尾；任务已经存在则原样返回（调用方可用 `===` 判断无需写回）。
 */
export function restoreTask(tasks: Task[], task: Task, index: number): Task[] {
  if (tasks.some((item) => item.id === task.id)) return tasks

  const next = [...tasks]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, task)
  return next
}

/** 累加秒数（番茄钟直接按秒记账，不经过分钟取整） */
export function addSeconds(tasks: Task[], id: string, seconds: number): Task[] {
  const delta = Math.max(0, Math.round(seconds))
  if (delta === 0) return tasks

  return tasks.map((task) =>
    task.id === id ? { ...task, seconds: task.seconds + delta } : task,
  )
}

/** 手动补录时长：在原有累计秒数上累加 */
export function addMinutes(tasks: Task[], id: string, minutes: number): Task[] {
  return addSeconds(tasks, id, Math.max(0, Math.round(minutes)) * 60)
}
