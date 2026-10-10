import { describe, expect, it } from 'vitest'

import {
  MOODS,
  activeDiaries,
  addDiary,
  createDiary,
  deleteDiary,
  diaryDateLabel,
  excerpt,
  moodEmoji,
  mergeDiaries,
  moodLabel,
  pruneTombstones,
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

  it('deleteDiary 是立墓碑，不是从数组里拿掉', () => {
    const list = [diary({ id: 'a', date: '2026-10-09' }), diary({ id: 'b', date: '2026-10-08' })]
    const after = deleteDiary(list, 'a')

    // 数组长度不变 —— 墓碑必须留着，否则另一台设备同步上来会把它复活
    expect(after).toHaveLength(2)
    expect(after.find((d) => d.id === 'a')?.deletedAt).toBeGreaterThan(0)
    // 但界面上已经看不到它
    expect(activeDiaries(after).map((d) => d.id)).toEqual(['b'])
    // 没删的那篇不受影响
    expect(after.find((d) => d.id === 'b')?.deletedAt).toBeUndefined()
  })

  it('deleteDiary 刷新 updatedAt，这样墓碑才能赢过旧版本', () => {
    const list = [diary({ id: 'a', date: '2026-10-09', updatedAt: 100 })]
    expect(deleteDiary(list, 'a')[0].updatedAt).toBeGreaterThan(100)
  })

  it('updateDiary 会摘掉墓碑（有意编辑就该复活）', () => {
    const deleted = deleteDiary([diary({ id: 'a', date: '2026-10-09' })], 'a')
    const revived = updateDiary(deleted, 'a', { content: '又想起来了' })
    expect(revived[0].deletedAt).toBeUndefined()
    expect(activeDiaries(revived)).toHaveLength(1)
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

describe('mergeDiaries（两台设备各写各的）', () => {
  const a = diary({ id: 'a', date: '2026-10-09', content: '电脑写的', updatedAt: 100 })
  const b = diary({ id: 'b', date: '2026-10-08', content: '手机写的', updatedAt: 200 })

  it('两边各写一篇 -> 合并后两篇都在', () => {
    const merged = mergeDiaries([a], [b])
    expect(merged).toHaveLength(2)
    expect(merged.map((d) => d.id).sort()).toEqual(['a', 'b'])
  })

  it('同一篇 id 冲突 -> updatedAt 大的赢（后改的）', () => {
    const older = diary({ id: 'x', date: '2026-10-09', content: '旧内容', updatedAt: 100 })
    const newer = diary({ id: 'x', date: '2026-10-09', content: '新内容', updatedAt: 900 })

    expect(mergeDiaries([older], [newer])[0].content).toBe('新内容')
    // 反过来也应该是同一篇，跟参数顺序无关
    expect(mergeDiaries([newer], [older])[0].content).toBe('新内容')
  })

  it('内容一样、更新时间也一样 -> 只留一条（不会翻倍）', () => {
    expect(mergeDiaries([a], [a])).toHaveLength(1)
  })

  it('一边为空 -> 等于另一边', () => {
    expect(mergeDiaries([], [a, b])).toHaveLength(2)
    expect(mergeDiaries([a, b], [])).toHaveLength(2)
    expect(mergeDiaries([], [])).toEqual([])
  })

  it('不修改传进来的数组（React 靠引用判断变化）', () => {
    const local = [a]
    const cloud = [b]
    mergeDiaries(local, cloud)
    expect(local).toHaveLength(1)
    expect(cloud).toHaveLength(1)
  })

  it('电脑删了、手机还留着旧版本 -> 删除传播过去，不会再冒出来', () => {
    // 电脑：a 被删（立了更新的墓碑）；手机：还是原来那篇活着的 a
    const tomb = deleteDiary([a], 'a')[0]
    const merged = mergeDiaries([tomb], [a])

    expect(merged).toHaveLength(1)
    expect(merged[0].deletedAt).toBeGreaterThan(0)
    expect(activeDiaries(merged)).toHaveLength(0)
  })

  it('反过来：删完之后另一台又编辑了 -> 编辑赢，日记复活', () => {
    // 墓碑 updatedAt = 1000，之后手机编辑到 2000
    const tomb = { ...a, deletedAt: 1000, updatedAt: 1000 }
    const edited = { ...a, content: '删完又写了点东西', updatedAt: 2000 }
    const merged = mergeDiaries([tomb], [edited])

    expect(merged[0].deletedAt).toBeUndefined()
    expect(merged[0].content).toBe('删完又写了点东西')
    expect(activeDiaries(merged)).toHaveLength(1)
  })

  it('墓碑参与合并，不会因为另一边没有就消失', () => {
    const tomb = deleteDiary([a], 'a')[0]
    // 云端完全没有这篇（比如还没同步过墓碑）—— 墓碑仍然留着
    expect(mergeDiaries([tomb], [])).toHaveLength(1)
    expect(mergeDiaries([tomb], [])[0].deletedAt).toBeGreaterThan(0)
  })

  it('多轮合并是幂等的（合并两次结果一样）', () => {
    const once = mergeDiaries([a], [b])
    const twice = mergeDiaries(once, [a, b])
    expect(twice).toHaveLength(2)
  })
})

describe('pruneTombstones / activeDiaries', () => {
  const NOW = 1_700_000_000_000
  const DAY = 24 * 60 * 60 * 1000

  it('90 天内的墓碑留着', () => {
    const list = [diary({ id: 'a', date: '2026-10-09', deletedAt: NOW - 30 * DAY })]
    expect(pruneTombstones(list, NOW)).toHaveLength(1)
  })

  it('超过 90 天的墓碑清掉（数组不能无限长）', () => {
    const list = [
      diary({ id: 'old', date: '2026-10-09', deletedAt: NOW - 91 * DAY }),
      diary({ id: 'new', date: '2026-10-09', deletedAt: NOW - 1 * DAY }),
    ]
    expect(pruneTombstones(list, NOW).map((d) => d.id)).toEqual(['new'])
  })

  it('活着的日记永远不清', () => {
    const list = [diary({ id: 'a', date: '2026-10-09' })]
    expect(pruneTombstones(list, NOW)).toHaveLength(1)
  })

  it('合并时会顺手清掉过期墓碑', () => {
    const stale = diary({ id: 'old', date: '2026-10-09', deletedAt: NOW - 200 * DAY })
    const fresh = diary({ id: 'new', date: '2026-10-08' })
    // 传 NOW 进去，不然用的是真实时间
    expect(mergeDiaries([stale], [fresh], NOW).map((d) => d.id)).toEqual(['new'])
  })

  it('activeDiaries 只滤显示，不改原数组', () => {
    const list = [
      diary({ id: 'a', date: '2026-10-09' }),
      diary({ id: 'b', date: '2026-10-08', deletedAt: 123 }),
    ]
    expect(activeDiaries(list)).toHaveLength(1)
    expect(list).toHaveLength(2)
  })
})