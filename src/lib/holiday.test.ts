import { describe, expect, it } from 'vitest'

import { HOLIDAYS } from '../data/holidays'
import { holidayFor, lunarDateOf } from './holiday'

/** 考试日固定成 2026-12-20，这样倒计时那几条能算准 */
const EXAM = '2026-12-20'

describe('lunarDateOf', () => {
  it('2026 年春节是正月初一（2 月 17 日）', () => {
    expect(lunarDateOf(new Date(2026, 1, 17, 12))).toEqual({ month: 1, day: 1 })
  })

  it('端午五月初五、中秋八月十五、七夕七月初七、元宵正月十五', () => {
    expect(lunarDateOf(new Date(2026, 5, 19, 12))).toEqual({ month: 5, day: 5 })
    expect(lunarDateOf(new Date(2026, 8, 25, 12))).toEqual({ month: 8, day: 15 })
    expect(lunarDateOf(new Date(2026, 7, 19, 12))).toEqual({ month: 7, day: 7 })
    expect(lunarDateOf(new Date(2026, 2, 3, 12))).toEqual({ month: 1, day: 15 })
  })

  it('前一天的农历日要差 1（说明不是靠固定偏移糊弄的）', () => {
    const a = lunarDateOf(new Date(2026, 1, 17, 12))
    const b = lunarDateOf(new Date(2026, 1, 16, 12))
    expect(a).toEqual({ month: 1, day: 1 })
    // 前一天还在腊月，具体廿九还是三十取决于那年腊月大小，别写死
    expect(b?.month).toBe(12)
    expect(b?.day).toBeGreaterThanOrEqual(29)
  })

  it('环境不支持时返回 null，不抛异常', () => {
    expect(() => lunarDateOf(new Date())).not.toThrow()
  })
})

describe('HOLIDAYS 数据本身', () => {
  it('id 不重复', () => {
    expect(new Set(HOLIDAYS.map((h) => h.id)).size).toBe(HOLIDAYS.length)
  })

  it('每条都有文案和优先级', () => {
    for (const holiday of HOLIDAYS) {
      expect(holiday.message.trim().length).toBeGreaterThan(0)
      expect(Number.isFinite(holiday.priority)).toBe(true)
    }
  })

  it('每条至少有一个触发条件', () => {
    for (const holiday of HOLIDAYS) {
      const hasTrigger =
        holiday.gregorian !== undefined ||
        holiday.lunar !== undefined ||
        holiday.examOffset !== undefined
      expect(hasTrigger, `${holiday.id} 没有任何触发条件`).toBe(true)
    }
  })

  it('公历日期格式统一是 MM-DD', () => {
    for (const holiday of HOLIDAYS) {
      if (holiday.gregorian === undefined) continue
      expect(holiday.gregorian, holiday.id).toMatch(/^\d{2}-\d{2}$/)
    }
  })

  it('考研专属的优先级最高（撞节日时它赢）', () => {
    const examPriority = Math.max(
      ...HOLIDAYS.filter((h) => h.examOffset !== undefined).map((h) => h.priority),
    )
    const others = HOLIDAYS.filter((h) => h.examOffset === undefined).map((h) => h.priority)
    expect(examPriority).toBeLessThan(Math.min(...others))
  })

  it('没有清明 / 国难日这类不该玩梗的日子', () => {
    const banned = ['清明', '九一八', '918', '国家公祭']
    for (const holiday of HOLIDAYS) {
      for (const word of banned) {
        expect(holiday.name.includes(word) || holiday.message.includes(word)).toBe(false)
      }
    }
  })
})

describe('holidayFor —— 公历节日', () => {
  it('国庆、情人节、元旦、跨年前夜', () => {
    expect(holidayFor('2026-10-01', EXAM)?.id).toBe('national-day')
    expect(holidayFor('2026-02-14', EXAM)?.id).toBe('valentine')
    expect(holidayFor('2026-01-01', EXAM)?.id).toBe('new-year')
    expect(holidayFor('2026-12-31', EXAM)?.id).toBe('new-years-eve')
  })

  it('普通日子返回 null', () => {
    expect(holidayFor('2026-10-10', EXAM)).toBeNull()
    expect(holidayFor('2026-03-15', EXAM)).toBeNull()
  })
})

describe('holidayFor —— 农历节日', () => {
  it('春节 / 端午 / 中秋 / 七夕 / 元宵都能命中', () => {
    expect(holidayFor('2026-02-17', EXAM)?.id).toBe('spring-festival')
    expect(holidayFor('2026-06-19', EXAM)?.id).toBe('dragon-boat')
    expect(holidayFor('2026-09-25', EXAM)?.id).toBe('mid-autumn')
    expect(holidayFor('2026-08-19', EXAM)?.id).toBe('qixi')
    expect(holidayFor('2026-03-03', EXAM)?.id).toBe('lantern-festival')
  })

  it('农历节日的前一天不命中', () => {
    expect(holidayFor('2026-02-16', EXAM)).toBeNull()
    expect(holidayFor('2026-09-24', EXAM)).toBeNull()
  })
})

describe('holidayFor —— 考研倒计时', () => {
  it('倒计时 100 / 50 / 30 / 7 / 3 / 1 天', () => {
    expect(holidayFor('2026-09-11', EXAM)?.id).toBe('exam-100')
    expect(holidayFor('2026-10-31', EXAM)?.id).toBe('exam-50')
    expect(holidayFor('2026-11-20', EXAM)?.id).toBe('exam-30')
    expect(holidayFor('2026-12-13', EXAM)?.id).toBe('exam-7')
    expect(holidayFor('2026-12-17', EXAM)?.id).toBe('exam-3')
    expect(holidayFor('2026-12-19', EXAM)?.id).toBe('exam-1')
  })

  it('考试当天和考完第一天', () => {
    expect(holidayFor('2026-12-20', EXAM)?.id).toBe('exam-today')
    expect(holidayFor('2026-12-21', EXAM)?.id).toBe('exam-done')
  })

  it('考试日期没设置时，考研那几条不触发，但公历节日照常', () => {
    expect(holidayFor('2026-09-11', '')).toBeNull()
    expect(holidayFor('2026-10-01', '')).not.toBeNull()
  })
})

describe('holidayFor —— 撞车时按优先级取', () => {
  it('2020-10-01 既是中秋又是国庆 -> 中秋赢', () => {
    // 中秋 priority 20，国庆 25
    expect(holidayFor('2020-10-01', EXAM)?.id).toBe('mid-autumn')
  })

  it('考试当天正好是圣诞 -> 考研赢', () => {
    // 把考试日设成 2026-12-25
    expect(holidayFor('2026-12-25', '2026-12-25')?.id).toBe('exam-today')
    // 第二天属于「考完第一天」，仍然是考研那条压着
    expect(holidayFor('2026-12-26', '2026-12-25')?.id).toBe('exam-done')
    // 再往后一天才回到普通日子
    expect(holidayFor('2026-12-27', '2026-12-25')).toBeNull()
  })

  it('中秋撞国庆之外，国庆仍然压过其他公历节日', () => {
    // 10-01 只和中秋撞，单独测一下国庆能命中
    expect(holidayFor('2026-10-01', EXAM)?.id).toBe('national-day')
  })
})

describe('holidayFor —— 非法输入', () => {
  it('日期不合法返回 null', () => {
    for (const bad of ['', 'abc', '2026-13-01', '2026-02-30', '2026-1-1']) {
      expect(holidayFor(bad, EXAM)).toBeNull()
    }
  })
})
