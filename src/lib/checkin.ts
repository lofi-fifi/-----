/**
 * 签到与徽章的纯逻辑。
 *
 * 连续天数、该不该发徽章这些判断都放这里，组件只管渲染和触发副作用。
 */

import { shiftDateKey, todayKey } from './date'
import type { Badge, BadgeType } from './storage'

/** 徽章的展示信息与门槛 */
export const BADGE_META: readonly {
  type: BadgeType
  emoji: string
  days: number
  /** 可重复获得（满 30 天再来一个） */
  repeatable: boolean
}[] = [
  { type: '7d', emoji: '🌱', days: 7, repeatable: false },
  { type: '15d', emoji: '🔥', days: 15, repeatable: false },
  { type: '30d', emoji: '🏆', days: 30, repeatable: true },
]

export function isCheckedIn(checkins: string[], date: string = todayKey()): boolean {
  return checkins.includes(date)
}

/**
 * 当前连续签到天数。
 *
 * 今天签了就从今天往前数；今天还没签就从昨天往前数 ——
 * 否则每天零点一过，连续天数会先掉成 0，看着像是断签了。
 */
export function currentStreak(checkins: string[], today: string = todayKey()): number {
  const signed = new Set(checkins)
  let cursor = signed.has(today) ? today : shiftDateKey(today, -1)

  let streak = 0
  while (signed.has(cursor)) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}

/** 某类徽章持有数量（🏆 可能不止一个） */
export function badgeCount(badges: Badge[], type: BadgeType): number {
  return badges.filter((badge) => badge.type === type).length
}

/** 某类徽章的全部获得日期，按时间正序 */
export function badgeDates(badges: Badge[], type: BadgeType): string[] {
  return badges
    .filter((badge) => badge.type === type)
    .map((badge) => badge.earnedAt)
    .sort()
}

/**
 * 本次签到应该新发哪些徽章。
 *
 * - 🌱 7 天 / 🔥 15 天：各只发一次，拿到就永久保留
 * - 🏆 30 天：每「连续满 30 天」发一个，可叠加
 *
 * 30 天这里用的是「streak 正好落在 30 的倍数上」。
 * 连续天数一天只 +1，所以同一段连续里每个 30 的倍数只会命中一次；
 * 断签归零后重新攒满 30 天，会再发一个。
 * （区别于另一种理解：按历史最高连续天数 floor(max/30) 计算，那样重新攒满不再发。）
 */
export function badgesEarnedOnCheckin(
  badges: Badge[],
  streak: number,
  today: string = todayKey(),
): Badge[] {
  const owned = (type: BadgeType) => badges.some((badge) => badge.type === type)
  const earned: Badge[] = []

  if (streak >= 7 && !owned('7d')) {
    earned.push({ type: '7d', earnedAt: today, streak })
  }
  if (streak >= 15 && !owned('15d')) {
    earned.push({ type: '15d', earnedAt: today, streak })
  }
  if (streak > 0 && streak % 30 === 0) {
    earned.push({ type: '30d', earnedAt: today, streak })
  }

  return earned
}
