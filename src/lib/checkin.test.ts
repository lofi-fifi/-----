import { describe, expect, it } from 'vitest'

import {
  BADGE_META,
  badgeCount,
  badgeDates,
  badgesEarnedOnCheckin,
  currentStreak,
  isCheckedIn,
} from './checkin'
import type { Badge } from './storage'

/** 从 end 往前数 count 天，返回正序的日期数组 */
function range(end: string, count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(`${end}T12:00:00`)
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(cursor)
    day.setDate(day.getDate() - i)
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const d = String(day.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
  }
  return dates
}

const TODAY = '2026-10-08'

describe('isCheckedIn', () => {
  it('今天在列表里就是签过了', () => {
    expect(isCheckedIn(['2026-10-07', TODAY], TODAY)).toBe(true)
  })

  it('不在列表里就是没签', () => {
    expect(isCheckedIn(['2026-10-07'], TODAY)).toBe(false)
  })

  it('空列表', () => {
    expect(isCheckedIn([], TODAY)).toBe(false)
  })
})

describe('currentStreak', () => {
  it('今天签了，从今天往前数', () => {
    expect(currentStreak(range(TODAY, 3), TODAY)).toBe(3)
  })

  it('今天还没签，从昨天往前数（否则零点一过连续天数会先掉成 0）', () => {
    expect(currentStreak(range('2026-10-07', 5), TODAY)).toBe(5)
  })

  it('前天签了但昨天断了 -> 0', () => {
    expect(currentStreak(['2026-10-06', '2026-10-05'], TODAY)).toBe(0)
  })

  it('中间断过，只数到断点为止', () => {
    const dates = [...range(TODAY, 3), '2026-10-01', '2026-09-30']
    expect(currentStreak(dates, TODAY)).toBe(3)
  })

  it('没签到 -> 0', () => {
    expect(currentStreak([], TODAY)).toBe(0)
  })

  it('只有今天 -> 1', () => {
    expect(currentStreak([TODAY], TODAY)).toBe(1)
  })

  it('跨月连续也能数对', () => {
    // 2026-09-29, 09-30, 10-01 ... 10-08
    const dates = range(TODAY, 10)
    expect(dates[0]).toBe('2026-09-29')
    expect(currentStreak(dates, TODAY)).toBe(10)
  })

  it('跨年连续也能数对', () => {
    const dates = range('2027-01-02', 4)
    expect(dates).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(currentStreak(dates, '2027-01-02')).toBe(4)
  })

  it('重复日期不会重复计数', () => {
    expect(currentStreak([TODAY, TODAY, '2026-10-07'], TODAY)).toBe(2)
  })
})

describe('badgesEarnedOnCheckin', () => {
  const none: Badge[] = []

  it('6 天不发', () => {
    expect(badgesEarnedOnCheckin(none, 6, TODAY)).toEqual([])
  })

  it('第 7 天发 🌱', () => {
    expect(badgesEarnedOnCheckin(none, 7, TODAY)).toEqual([
      { type: '7d', earnedAt: TODAY, streak: 7 },
    ])
  })

  it('第 15 天发 🔥', () => {
    const owned: Badge[] = [{ type: '7d', earnedAt: '2026-09-30', streak: 7 }]
    expect(badgesEarnedOnCheckin(owned, 15, TODAY)).toEqual([
      { type: '15d', earnedAt: TODAY, streak: 15 },
    ])
  })

  it('已经有的徽章不会重复发', () => {
    const owned: Badge[] = [
      { type: '7d', earnedAt: '2026-09-30', streak: 7 },
      { type: '15d', earnedAt: '2026-10-01', streak: 15 },
    ]
    const earned = badgesEarnedOnCheckin(owned, 20, TODAY)
    expect(earned.some((b) => b.type === '7d')).toBe(false)
    expect(earned.some((b) => b.type === '15d')).toBe(false)
  })

  it('30 天发 🏆', () => {
    const owned: Badge[] = [
      { type: '7d', earnedAt: '2026-09-01', streak: 7 },
      { type: '15d', earnedAt: '2026-09-10', streak: 15 },
    ]
    expect(badgesEarnedOnCheckin(owned, 30, TODAY)).toEqual([
      { type: '30d', earnedAt: TODAY, streak: 30 },
    ])
  })

  it('🏆 可重复：第 60 天再发一个', () => {
    const owned: Badge[] = [
      { type: '7d', earnedAt: '2026-08-01', streak: 7 },
      { type: '15d', earnedAt: '2026-08-10', streak: 15 },
      { type: '30d', earnedAt: '2026-09-08', streak: 30 },
    ]
    expect(badgesEarnedOnCheckin(owned, 60, TODAY)).toEqual([
      { type: '30d', earnedAt: TODAY, streak: 60 },
    ])
  })

  it('一次补齐多枚：缺 7/15 天时到 60 天会一起发', () => {
    // 正常情况下会按 7 -> 15 -> 30 的顺序拿到，走到 60 天时前两枚早有了。
    // 但导入一份被改坏的数据后可能出现「只有 🏆 没有 🌱」，
    // 这时应当把欠的一起补上，而不是永远不给。
    const owned: Badge[] = [{ type: '30d', earnedAt: '2026-09-08', streak: 30 }]
    const earned = badgesEarnedOnCheckin(owned, 60, TODAY)
    expect(earned.map((b) => b.type).sort()).toEqual(['15d', '30d', '7d'])
  })

  it('不是 30 的倍数就不发', () => {
    expect(badgesEarnedOnCheckin([], 31, TODAY).some((b) => b.type === '30d')).toBe(false)
    expect(badgesEarnedOnCheckin([], 59, TODAY).some((b) => b.type === '30d')).toBe(false)
  })

  it('streak 为 0 时一个都不发', () => {
    expect(badgesEarnedOnCheckin([], 0, TODAY)).toEqual([])
  })

  it('第 30 天不会连发 7 天和 15 天的', () => {
    const owned: Badge[] = [
      { type: '7d', earnedAt: '2026-09-01', streak: 7 },
      { type: '15d', earnedAt: '2026-09-10', streak: 15 },
    ]
    const earned = badgesEarnedOnCheckin(owned, 30, TODAY)
    expect(earned).toHaveLength(1)
    expect(earned[0].type).toBe('30d')
  })
})

describe('badgeCount / badgeDates', () => {
  const badges: Badge[] = [
    { type: '30d', earnedAt: '2026-08-01', streak: 30 },
    { type: '7d', earnedAt: '2026-06-01', streak: 7 },
    { type: '30d', earnedAt: '2026-09-01', streak: 60 },
  ]

  it('数得出 🏆 有两个', () => {
    expect(badgeCount(badges, '30d')).toBe(2)
    expect(badgeCount(badges, '7d')).toBe(1)
    expect(badgeCount(badges, '15d')).toBe(0)
  })

  it('获得日期按时间正序', () => {
    expect(badgeDates(badges, '30d')).toEqual(['2026-08-01', '2026-09-01'])
  })
})

describe('BADGE_META', () => {
  it('三个徽章，只有 🏆 可重复', () => {
    expect(BADGE_META.map((b) => b.type)).toEqual(['7d', '15d', '30d'])
    expect(BADGE_META.filter((b) => b.repeatable).map((b) => b.type)).toEqual(['30d'])
  })

  it('天数门槛和类型对得上', () => {
    expect(BADGE_META.find((b) => b.type === '7d')?.days).toBe(7)
    expect(BADGE_META.find((b) => b.type === '15d')?.days).toBe(15)
    expect(BADGE_META.find((b) => b.type === '30d')?.days).toBe(30)
  })
})
