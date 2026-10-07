/**
 * 日期工具。
 *
 * 全部基于**本地时区**计算（用 getFullYear/getMonth/getDate 拼字符串），
 * 不走 toISOString —— 否则东八区的凌晨会被算成前一天。
 * 日期键统一格式：YYYY-MM-DD
 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date → "2026-10-07" */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "2026-10-07" → Date（当天 00:00 本地时间） */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

/** 今天的日期键 */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** 在日期键上加减天数 */
export function shiftDateKey(key: string, days: number): string {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function isToday(key: string): boolean {
  return key === todayKey()
}

/** "10月7日 周二" */
export function formatMonthDay(key: string): string {
  const date = fromDateKey(key)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
}

/** 临近三天用「今天 / 昨天 / 明天」前缀，其余直接显示月日 */
export function formatDateLabel(key: string): string {
  const today = todayKey()
  if (key === today) return `今天 · ${formatMonthDay(key)}`
  if (key === shiftDateKey(today, -1)) return `昨天 · ${formatMonthDay(key)}`
  if (key === shiftDateKey(today, 1)) return `明天 · ${formatMonthDay(key)}`
  return formatMonthDay(key)
}

/** "2026-10-07 周三" */
export function formatDateWithWeekday(key: string): string {
  return `${key} ${WEEKDAYS[fromDateKey(key).getDay()]}`
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 是不是合法的 YYYY-MM-DD（2026-02-31 这种会被判为不合法） */
export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_PATTERN.test(key)) return false
  const date = fromDateKey(key)
  return !Number.isNaN(date.getTime()) && toDateKey(date) === key
}

/**
 * 距离目标日期还有多少天：今天 = 0，已经过去是负数。
 * 目标日期不合法时返回 null（设置里可能被清空）。
 */
export function daysUntil(targetKey: string, fromKey: string = todayKey()): number | null {
  if (!isValidDateKey(targetKey)) return null

  const target = fromDateKey(targetKey).getTime()
  const from = fromDateKey(fromKey).getTime()
  // 用 round 而不是 floor，避免夏令时带来的 ±1 小时误差
  return Math.round((target - from) / 86_400_000)
}
