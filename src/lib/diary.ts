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
  return list.map((item) => {
    if (item.id !== id) return item
    // 编辑一篇（理论上不该打开）已删除的日记时，顺手把墓碑摘掉 —— 有意编辑就该复活
    const { deletedAt: _removed, ...alive } = item
    return { ...alive, ...patch, updatedAt: Date.now() }
  })
}

/**
 * 删除一篇 —— **立墓碑，不是从数组里拿掉**。
 *
 * 直接从数组里删掉的话，另一台设备同步上来时会把它**复活**：
 * 合并逻辑只看到「云端有、本地没有」，分不清这是「本地没同步过」还是「本地删了」。
 * 打上 deletedAt 并刷新 updatedAt，它就能在合并时正当地赢过旧版本。
 */
export function deleteDiary(list: Diary[], id: string): Diary[] {
  const now = Date.now()
  return list.map((item) =>
    item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item,
  )
}

/** 还活着的日记（滤掉墓碑）—— 界面显示和计数都用它，不要直接用 data.diaries */
export function activeDiaries(list: Diary[]): Diary[] {
  return list.filter((item) => !item.deletedAt)
}

/**
 * 墓碑保留 90 天。
 * 够覆盖「另一台设备放了很久没开」的情况，又不至于让数组无限长下去。
 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** 清掉过期的墓碑 */
export function pruneTombstones(list: Diary[], now = Date.now()): Diary[] {
  return list.filter((item) => !item.deletedAt || now - item.deletedAt < TOMBSTONE_TTL_MS)
}

/**
 * 合并两边的日记：按 id 去重，`updatedAt` 大的赢。
 *
 * 规则很简单：**同一个 id 取 updatedAt 大的那个**。
 *
 * 因为删除是「立墓碑」而不是「从数组里拿掉」，墓碑也照常参与比较 ——
 * 所以「电脑删了、手机还留着旧的」这种情况，墓碑更新，它就赢，删除得以传播。
 * 反过来，如果手机在电脑删之后又编辑了那篇（updatedAt 更大），编辑就会赢，
 * 日记重新出现。这也符合直觉：**最后动手的那台说了算**。
 *
 * 合并完顺手清掉过期的墓碑，免得数组无限长。
 */
export function mergeDiaries(local: Diary[], cloud: Diary[], now = Date.now()): Diary[] {
  const byId = new Map<string, Diary>()

  for (const item of [...local, ...cloud]) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item)
  }

  return pruneTombstones([...byId.values()], now)
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
