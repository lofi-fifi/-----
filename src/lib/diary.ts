/**
 * 日记的纯逻辑：心情选项、排序、摘要、增删改。
 * 不碰 DOM、不碰 localStorage，方便单测。
 */

import { fromDateKey, shiftDateKey, todayKey } from './date'
import { createId, type Diary } from './storage'

/**
 * 心情选项。数据里只存 id，emoji 和文字纯粹用于显示 ——
 * 这样以后想换图标或者加一档，不用动已经写下的日记。
 */
export const MOODS: readonly { id: string; emoji: string; label: string }[] = [
  { id: 'great', emoji: '😄', label: '很好' },
  { id: 'good', emoji: '🙂', label: '还行' },
  { id: 'ok', emoji: '😐', label: '一般' },
  { id: 'low', emoji: '😔', label: '低落' },
  { id: 'bad', emoji: '😣', label: '很累' },
]

/** 没选心情时列表里显示这个占位，避免那一列空着 */
export const MOOD_PLACEHOLDER = '·'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function moodEmoji(id: string): string | null {
  return MOODS.find((mood) => mood.id === id)?.emoji ?? null
}

export function moodLabel(id: string): string | null {
  return MOODS.find((mood) => mood.id === id)?.label ?? null
}

/**
 * 排序：日期倒序；同一天里后改的排前面。
 *
 * 返回新数组 —— 调用方经常直接把它丢进 React 渲染，
 * 原地排序会让 setState 认不出变化。
 */
export function sortDiaries(diaries: Diary[]): Diary[] {
  return [...diaries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.updatedAt - a.updatedAt
  })
}

/**
 * 列表里显示的摘要。
 * 先把换行和连续空白压成单个空格 —— 日记里经常敲回车，
 * 不压的话摘要会变成一行散乱的短语。
 */
export function excerpt(content: string, max = 70): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max)}…`
}

/** 新建一篇。id 和时间戳在这里生成，调用方只管塞进列表 */
export function createDiary(date: string, mood: string, content: string): Diary {
  const now = Date.now()
  return { id: createId(), date, mood, content, createdAt: now, updatedAt: now }
}

export function addDiary(list: Diary[], diary: Diary): Diary[] {
  return [...list, diary]
}

export function updateDiary(list: Diary[], id: string, patch: Partial<Diary>): Diary[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item))
}

/** 按 id 删掉一篇 */
export function deleteDiary(list: Diary[], id: string): Diary[] {
  return list.filter((item) => item.id !== id)
}

/**
 * 合并两边的日记：按 id 去重，`updatedAt` 大的赢。
 *
 * **为什么日记可以合并、任务不行**：
 *   两者都有 id 和 updatedAt，但任务还有「删除」这个动作 ——
 *   单纯按 id 合并会把删掉的任务复活（没有墓碑就分不清「从没同步过」和「已经删了」）。
 *   日记不需要纠结这个：同一篇 id 一定来自同一台设备，按更新时间取新的就是对的。
 *
 * 所以两台设备各写各的日记，合并之后**两篇都在**。
 */
export function mergeDiaries(local: Diary[], cloud: Diary[]): Diary[] {
  const byId = new Map<string, Diary>()

  for (const item of [...local, ...cloud]) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item)
  }

  return [...byId.values()]
}

/**
 * 日期标签。靠近的日期给一个相对说法，但**一定跟上绝对日期** ——
 * 只写「今天」，过几天回头看就不知道是哪天写的了。
 *
 *   今天 · 10月10日 周五
 *   昨天 · 10月9日 周四
 *   10月8日 周三          （同年，且不是今明）
 *   2025年12月31日 周三   （跨年，补上年份）
 */
export function diaryDateLabel(date: string, today: string = todayKey()): string {
  const target = fromDateKey(date)
  const base = fromDateKey(today)

  const monthDay = `${target.getMonth() + 1}月${target.getDate()}日 ${WEEKDAYS[target.getDay()]}`
  const absolute =
    target.getFullYear() === base.getFullYear()
      ? monthDay
      : `${target.getFullYear()}年${monthDay}`

  if (date === today) return `今天 · ${absolute}`
  if (date === shiftDateKey(today, -1)) return `昨天 · ${absolute}`
  return absolute
}
