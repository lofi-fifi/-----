/**
 * 「今日进度卡片」：把当天的情况拼成一段可以直接粘贴分享的纯文本。
 * 纯函数，方便单测。
 */

import { BADGE_META, badgeCount, currentStreak } from './checkin'
import { daysUntil, formatDateWithWeekday, todayKey } from './date'
import type { AppData } from './storage'
import { sortForDisplay } from './tasks'
import { formatDuration } from './time'

export function buildProgressCard(data: AppData, dateKey: string = todayKey()): string {
  const { settings } = data
  const tasks = sortForDisplay(data.tasks[dateKey] ?? [])
  const doneCount = tasks.filter((task) => task.done).length

  // 今日专注 = 各任务累计时长 + 没关联到任务的番茄钟时长
  const taskSeconds = tasks.reduce((sum, task) => sum + task.seconds, 0)
  const totalSeconds = taskSeconds + (data.dayTotals[dateKey] ?? 0)

  const lines: string[] = [formatDateWithWeekday(dateKey)]

  const days = daysUntil(settings.examDate, dateKey)
  if (days !== null && days > 0) {
    lines.push(`距离 ${settings.examName}还有 ${days} 天`)
  } else if (days === 0) {
    lines.push(`今天就是 ${settings.examName} 的日子`)
  }

  lines.push('', `今日任务 ${doneCount}/${tasks.length}`)
  if (tasks.length === 0) {
    lines.push('（今天还没有任务）')
  } else {
    for (const task of tasks) {
      lines.push(`${task.done ? '✓' : '○'} ${task.text}  ${formatDuration(task.seconds)}`)
    }
  }

  lines.push('', `今日专注 ${formatDuration(totalSeconds)}`)

  const streak = currentStreak(data.checkins, dateKey)
  lines.push(`连续签到 ${streak} 天`)

  const earned = BADGE_META.filter((meta) => badgeCount(data.badges, meta.type) > 0).map(
    (meta) => {
      const count = badgeCount(data.badges, meta.type)
      return count > 1 ? `${meta.emoji}×${count}` : meta.emoji
    },
  )
  if (earned.length > 0) lines.push(`徽章 ${earned.join(' ')}`)

  return lines.join('\n')
}
