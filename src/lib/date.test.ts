import { describe, expect, it } from 'vitest'

import { fromDateKey, isToday, isValidDateKey, shiftDateKey, toDateKey, todayKey } from './date'

describe('toDateKey —— 必须用本地时区，不能用 UTC', () => {
  it('本地时间凌晨 00:30 仍然算当天', () => {
    // 如果实现里用了 toISOString()，在 UTC+8 下这一刻是「前一天 16:30 UTC」，
    // 会返回 2026-10-07 —— 这个断言就是为了挡住那种写法
    expect(toDateKey(new Date(2026, 9, 8, 0, 30))).toBe('2026-10-08')
  })

  it('本地时间深夜 23:30 也算当天', () => {
    expect(toDateKey(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
  })

  it('月份和日补零', () => {
    expect(toDateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('和 fromDateKey 往返一致', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2026-10-08', '2026-12-31']) {
      expect(toDateKey(fromDateKey(key))).toBe(key)
    }
  })
})

describe('isValidDateKey', () => {
  it('合法日期', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31']) {
      expect(isValidDateKey(key)).toBe(true)
    }
  })

  it('格式不对的挡掉', () => {
    for (const key of ['', 'abc', '2026-1-1', '2026/01/01', '20261001', '2026-01-01T00:00:00Z']) {
      expect(isValidDateKey(key)).toBe(false)
    }
  })

  it('不存在的日期挡掉（2 月 30 日、13 月）', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-00-10')).toBe(false)
    expect(isValidDateKey('2026-04-31')).toBe(false)
  })

  it('不是字符串也不崩', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(isValidDateKey(value)).toBe(false)
    }
  })
})

describe('shiftDateKey', () => {
  it('加减一天', () => {
    expect(shiftDateKey('2026-10-08', 1)).toBe('2026-10-09')
    expect(shiftDateKey('2026-10-08', -1)).toBe('2026-10-07')
  })

  it('跨月', () => {
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDateKey('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('跨年', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('平年 2 月 28 日的下一天是 3 月 1 日', () => {
    expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('闰年 2 月 28 日的下一天是 2 月 29 日', () => {
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDateKey('2024-02-29', 1)).toBe('2024-03-01')
  })

  it('跨夏令时也不出错（用中午锚定，避免 23/25 小时的坑）', () => {
    // 北美/欧洲夏令时切换日
    expect(shiftDateKey('2026-03-08', 1)).toBe('2026-03-09')
    expect(shiftDateKey('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('一次挪多天', () => {
    expect(shiftDateKey('2026-01-01', 365)).toBe('2027-01-01')
    expect(shiftDateKey('2027-01-01', -365)).toBe('2026-01-01')
  })

  it('挪 0 天等于自己', () => {
    expect(shiftDateKey('2026-10-08', 0)).toBe('2026-10-08')
  })
})

describe('todayKey / isToday', () => {
  it('todayKey 是合法的日期串', () => {
    expect(isValidDateKey(todayKey())).toBe(true)
  })

  it('todayKey 和 new Date() 的本地日期一致', () => {
    expect(todayKey()).toBe(toDateKey(new Date()))
  })

  it('isToday 判断正确', () => {
    expect(isToday(todayKey())).toBe(true)
    expect(isToday(shiftDateKey(todayKey(), -1))).toBe(false)
    expect(isToday(shiftDateKey(todayKey(), 1))).toBe(false)
  })
})
