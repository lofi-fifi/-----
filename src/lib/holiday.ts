/**
 * 节日彩蛋的纯逻辑。不碰 DOM，方便单测。
 */

import { HOLIDAYS, type Holiday } from '../data/holidays'
import { daysUntil, fromDateKey, isValidDateKey } from './date'

/**
 * 中国农历格式化器。
 *
 * 用 Intl 原生能力算农历，而不是手写一张年份对照表 ——
 * 春节中秋这些日期每年都在飘，手写表格过两年就失效了。
 *
 * 极少数没编 ICU 的运行环境里构造会失败，这时返回 null，
 * 整个农历部分静默跳过。**彩蛋不该让应用崩掉。**
 */
const LUNAR_FORMAT = (() => {
  try {
    return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return null
  }
})()

/**
 * 中文月份名 -> 数字。
 * 不同浏览器给的写法不完全一致（「正月」/「一月」、「腊月」/「十二月」），
 * 所以按名字归一化，而不是直接比较字符串。
 */
const MONTH_NAMES: Record<string, number> = {
  正: 1,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  冬: 11,
  十二: 12,
  腊: 12,
}

function lunarMonthNumber(raw: string): number | null {
  // 闰月不算正节 —— 闰四月初四不是四月初四
  if (raw.includes('闰')) return null
  return MONTH_NAMES[raw.replace('月', '').trim()] ?? null
}

/** 某个公历日期对应的农历月日；环境不支持时返回 null */
export function lunarDateOf(date: Date): { month: number; day: number } | null {
  if (!LUNAR_FORMAT) return null

  try {
    const parts = LUNAR_FORMAT.formatToParts(date)
    const rawMonth = parts.find((part) => part.type === 'month')?.value
    const rawDay = parts.find((part) => part.type === 'day')?.value
    if (!rawMonth || !rawDay) return null

    const month = lunarMonthNumber(rawMonth)
    const day = Number(rawDay)
    if (month === null || !Number.isFinite(day)) return null

    return { month, day }
  } catch {
    return null
  }
}

/**
 * 这一天该显示哪条彩蛋，没有就返回 null。
 *
 * examDate 用来匹配考研倒计时那几条（0 = 考试当天，-1 = 考完第一天）。
 * 同一天命中多条时取 priority 最小的 —— 比如中秋撞国庆，让中秋赢。
 */
export function holidayFor(dateKey: string, examDate: string): Holiday | null {
  if (!isValidDateKey(dateKey)) return null

  const monthDay = dateKey.slice(5) // 'MM-DD'
  const lunar = lunarDateOf(fromDateKey(dateKey))
  const examOffset = daysUntil(examDate, dateKey)

  const hits = HOLIDAYS.filter((holiday) => {
    if (holiday.gregorian !== undefined && holiday.gregorian === monthDay) return true

    if (
      holiday.lunar !== undefined &&
      lunar !== null &&
      holiday.lunar.month === lunar.month &&
      holiday.lunar.day === lunar.day
    ) {
      return true
    }

    if (
      holiday.examOffset !== undefined &&
      examOffset !== null &&
      holiday.examOffset === examOffset
    ) {
      return true
    }

    return false
  })

  if (hits.length === 0) return null

  return hits.reduce((best, holiday) => (holiday.priority < best.priority ? holiday : best))
}
