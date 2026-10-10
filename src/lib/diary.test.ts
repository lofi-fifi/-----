import { describe, expect, it } from 'vitest'

import {
  MOODS,
  addDiary,
  createDiary,
  deleteDiary,
  diaryDateLabel,
  excerpt,
  moodEmoji,
  moodLabel,
  sortDiaries,
  updateDiary,
} from './diary'
import type { Diary } from './storage'

function diary(partial: Partial<Diary> & { id: string; date: string }): Diary {
  return {
    mood: '',
    content: '正文',
    createdAt: 1000,
    updatedAt: 1000,
    ...partial,
  }
}

describe('MOODS', () => {
  it('5 档，id 不重复', () => {
    expect(MOODS).toHaveLength(5)
    expect(new Set(MOODS.map((m) => m.id)).size).toBe(5)
  })

  it('每档都有 emoji 和文字', () => {
    for (const mood of MOODS) {
      expect(mood.emoji.length).toBeGreaterThan(0)
      expect(mood.label.length).toBeGreaterThan(0)
    }
  })

  it('moodEmoji / moodLabel 查得到，查不到返回 null', () => {
    expect(moodEmoji('great')).toBe(MOODS[0].emoji)
    expect(moodLabel('bad')).toBe(MOODS[4].label)
    expect(moodEmoji('')).toBeNull()
    expect(moodEmoji('nope')).toBeNull()
    expect(moodLabel('nope')).toBeNull()
  })
})

describe('sortDiaries', () => {
  const list: Diary[] = [
    diary({ id: 'a', date: '2026-10-07' }),
    diary({ id: 'b', date: '2026-10-09' }),
    diary({ id: 'c', date: '2026-10-08' }),
  ]

  it('按日期倒序', () => {
    expect(sortDiaries(list).map((d) => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('同一天里后改的排前面', () => {
    const same = [
      diary({ id: 'old', date: '2026-10-08', updatedAt: 100 }),
      diary({ id: 'new', date: '2026-10-08', updatedAt: 900 }),
    ]
    expect(sortDiaries(same).map((d) => d.id)).toEqual(['new', 'old'])
  })

  it('不修改原数组（React 靠引用判断变化）', () => {
    const before = list.map((d) => d.id)
    sortDiaries(list)
    expect(list.map((d) => d.id)).toEqual(before)
  })

  it('空数组 / 单条都不崩', () => {
    expect(sortDiaries([])).toEqual([])
    expect(sortDiaries([list[0]])).toHaveLength(1)
  })
})

describe('excerpt', () => {
  it('把换行和连续空白压成单个空格', () => {
    expect(excerpt('第一行\n\n第二行')).toBe('第一行 第二行')
    expect(excerpt('  前后有空白  ')).toBe('前后有空白')
    expect(excerpt('很多    空格')).toBe('很多 空格')
  })

  it('超长截断并加省略号', () => {
    expect(excerpt('x'.repeat(100), 10)).toBe('xxxxxxxxxx…')
  })

  it('刚好等于上限时不截断', () => {
    expect(excerpt('x'.repeat(10), 10)).toBe('xxxxxxxxxx')
  })

  it('空内容返回空串', () => {
    expect(excerpt('')).toBe('')
    expect(excerpt('   \n  ')).toBe('')
  })
})

describe('createDiary', () => {
  it('生成 id 和两个时间戳', () => {
    const item = createDiary('2026-10-09', 'good', '今天写了三套卷子')
    expect(item.id).toBeTruthy()
    expect(item.date).toBe('2026-10-09')
    expect(item.mood).toBe('good')
    expect(item.content).toBe('今天写了三套卷子')
    expect(item.createdAt).toBe(item.updatedAt)
    expect(item.createdAt).toBeGreaterThan(0)
  })

  it('每次的 id 都不同', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createDiary('2026-10-09', '', 'x').id))
    expect(ids.size).toBe(20)
  })
})

describe('增删改', () => {
  const base = [diary({ id: 'a', date: '2026-10-09' })]

  it('addDiary 追加并返回新数组', () => {
    const next = addDiary(base, diary({ id: 'b', date: '2026-10-08' }))
    expect(next).toHaveLength(2)
    expect(base).toHaveLength(1)
  })

  it('updateDiary 只改目标那条，并刷新 updatedAt', () => {
    const before = Date.now()
    const next = updateDiary(base, 'a', { content: '改过了' })
    expect(next[0].content).toBe('改过了')
    expect(next[0].updatedAt).toBeGreaterThanOrEqual(before)
    expect(next[0].createdAt).toBe(1000)
  })

  it('updateDiary 改不存在的 id 时原样返回内容', () => {
    const next = updateDiary(base, 'nope', { content: 'x' })
    expect(next[0].content).toBe(base[0].content)
  })

  it('deleteDiary 按 id 删除', () => {
    const list = [diary({ id: 'a', date: '2026-10-09' }), diary({ id: 'b', date: '2026-10-08' })]
    expect(deleteDiary(list, 'a').map((d) => d.id)).toEqual(['b'])
    expect(deleteDiary(list, 'nope')).toHaveLength(2)
  })
})

describe('diaryDateLabel', () => {
  const today = '2026-10-09'

  it('今天 / 昨天：相对说法后面一定跟上绝对日期', () => {
    // 只写「今天」的话，过几天回头看就不知道是哪天写的了
    expect(diaryDateLabel('2026-10-09', today)).toBe('今天 · 10月9日 周五')
    expect(diaryDateLabel('2026-10-08', today)).toBe('昨天 · 10月8日 周四')
  })

  it('更早的日期不给相对说法，只写月日和星期', () => {
    // 2026-10-09 是周五，往前推 8 天是 10-01 周四
    expect(diaryDateLabel('2026-10-01', today)).toBe('10月1日 周四')
    expect(diaryDateLabel('2026-09-30', today)).toBe('9月30日 周三')
  })

  it('跨年补上年份，免得看不出来是哪一年', () => {
    expect(diaryDateLabel('2025-12-31', today)).toBe('2025年12月31日 周三')
  })

  it('跨年时如果正好是昨天，也带上年份', () => {
    // 站在 2026-01-01 回看 2025-12-31：既是「昨天」，又跨了年
    expect(diaryDateLabel('2025-12-31', '2026-01-01')).toBe('昨天 · 2025年12月31日 周三')
  })

  it('今天参数默认取当天，不传也不崩', () => {
    expect(diaryDateLabel('2020-01-01')).toContain('2020年')
  })
})
