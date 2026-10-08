import { describe, expect, it } from 'vitest'

import {
  CARD_OPACITY_DEFAULT,
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  DEFAULT_BACKGROUND,
  DEFAULT_SETTINGS,
  MAX_BACKGROUND_IMAGES,
  createDefaultData,
  looksLikeAppData,
  normalizeData,
} from './storage'
import { MAX_BACKGROUND_CHARS } from './storage'

describe('createDefaultData', () => {
  it('是一份完整可用的空数据', () => {
    const data = createDefaultData()
    expect(data.version).toBe(1)
    expect(data.tasks).toEqual({})
    expect(data.checkins).toEqual([])
    expect(data.badges).toEqual([])
    expect(data.dayTotals).toEqual({})
    expect(data.settings.examName).toBeTruthy()
    expect(data.settings.theme).toBe('system')
  })

  it('每次返回新对象，改一个不会污染另一个', () => {
    const a = createDefaultData()
    const b = createDefaultData()
    a.tasks['2026-10-08'] = [{ id: 'x', text: 't', done: false, seconds: 0, createdAt: 0 }]
    a.settings.customQuotes.push('测试')
    expect(b.tasks).toEqual({})
    expect(b.settings.customQuotes).toEqual([])
  })
})

describe('normalizeData —— 脏数据兜底', () => {
  it('空对象 -> 一份默认数据', () => {
    const data = normalizeData({})
    expect(data.settings.examName).toBe(DEFAULT_SETTINGS.examName)
    expect(data.tasks).toEqual({})
    expect(data.checkins).toEqual([])
  })

  it('不是对象也不崩', () => {
    for (const input of [null, undefined, 'abc', 42, []]) {
      expect(() => normalizeData(input)).not.toThrow()
      expect(normalizeData(input).version).toBe(1)
    }
  })

  it('tasks 里的非法条目被丢掉', () => {
    const data = normalizeData({
      tasks: {
        '2026-10-08': [
          { id: 'ok', text: '正常', done: false, seconds: 60, createdAt: 1 },
          { id: '', text: '没有 id', done: false, seconds: 0, createdAt: 1 },
          { id: 'bad', text: '', done: false, seconds: 0, createdAt: 1 },
          { id: 'neg', text: '负数秒', done: false, seconds: -100, createdAt: 1 },
          null,
        ],
      },
    })
    const ids = data.tasks['2026-10-08']?.map((t) => t.id) ?? []
    expect(ids).toContain('ok')
    expect(ids).not.toContain('')
    expect(ids).not.toContain('bad')
  })

  it('checkins 里的非法日期被丢掉', () => {
    const data = normalizeData({
      checkins: ['2026-10-08', '不是日期', '', '2026-13-99', 42, null],
    })
    expect(data.checkins).toEqual(['2026-10-08'])
  })

  it('checkins 去重并排序', () => {
    const data = normalizeData({ checkins: ['2026-10-08', '2026-10-07', '2026-10-08'] })
    expect(data.checkins).toEqual(['2026-10-07', '2026-10-08'])
  })

  it('dayTotals 丢掉非正数和非法日期', () => {
    const data = normalizeData({
      dayTotals: { '2026-10-08': 60, '2026-10-07': 0, '2026-10-06': -5, nope: 100 },
    })
    expect(data.dayTotals).toEqual({ '2026-10-08': 60 })
  })

  it('设置里的类型不对就回落默认值', () => {
    const data = normalizeData({
      settings: { examName: 123, examDate: null, focusMinutes: 'abc', soundOn: 'yes' },
    })
    expect(data.settings.examName).toBe(DEFAULT_SETTINGS.examName)
    expect(data.settings.examDate).toBe(DEFAULT_SETTINGS.examDate)
    expect(data.settings.focusMinutes).toBe(DEFAULT_SETTINGS.focusMinutes)
    expect(data.settings.soundOn).toBe(DEFAULT_SETTINGS.soundOn)
  })
})

describe('normalizeData —— 徽章', () => {
  it('🏆 可重复，按获得日期区分', () => {
    const data = normalizeData({
      badges: [
        { type: '30d', earnedAt: '2026-08-01', streak: 30 },
        { type: '30d', earnedAt: '2026-09-01', streak: 60 },
      ],
    })
    expect(data.badges).toHaveLength(2)
  })

  it('🌱 / 🔥 各只保留一个', () => {
    const data = normalizeData({
      badges: [
        { type: '7d', earnedAt: '2026-08-01', streak: 7 },
        { type: '7d', earnedAt: '2026-09-01', streak: 7 },
      ],
    })
    expect(data.badges).toHaveLength(1)
  })

  it('未知类型被丢掉', () => {
    const data = normalizeData({ badges: [{ type: '99d', earnedAt: '2026-08-01', streak: 99 }] })
    expect(data.badges).toEqual([])
  })
})

describe('normalizeData —— 主题', () => {
  it('旧数据没有 theme -> 兜底 system', () => {
    expect(normalizeData({ settings: { examName: 'x' } }).settings.theme).toBe('system')
  })

  it('非法值 -> 兜底 system', () => {
    expect(normalizeData({ settings: { theme: 'neon' } }).settings.theme).toBe('system')
    expect(normalizeData({ settings: { theme: 42 } }).settings.theme).toBe('system')
  })

  it('合法值原样保留', () => {
    expect(normalizeData({ settings: { theme: 'dark' } }).settings.theme).toBe('dark')
    expect(normalizeData({ settings: { theme: 'light' } }).settings.theme).toBe('light')
  })
})

describe('normalizeData —— 背景', () => {
  const background = (raw: unknown) => normalizeData({ settings: { background: raw } }).settings.background

  it('没这个字段 -> 默认纯白 + 空图片', () => {
    const bg = background(undefined)
    expect(bg.presetId).toBe(DEFAULT_BACKGROUND.presetId)
    expect(bg.images).toEqual([])
    expect(bg.active).toBe('preset')
  })

  it('非法 presetId 兜底成 white', () => {
    expect(background({ presetId: 'rainbow' }).presetId).toBe('white')
  })

  it('只保留 data:image/ 开头的图片（防止脏字符串进 CSS）', () => {
    const bg = background({
      images: [
        'data:image/jpeg;base64,AAA',
        'javascript:alert(1)',
        'https://evil.example/x.png',
        'data:text/html,<script>',
      ],
    })
    expect(bg.images).toEqual(['data:image/jpeg;base64,AAA'])
  })

  it(`最多留 ${MAX_BACKGROUND_IMAGES} 张`, () => {
    const images = Array.from({ length: 10 }, (_, i) => `data:image/jpeg;base64,${i}`)
    expect(background({ images }).images).toHaveLength(MAX_BACKGROUND_IMAGES)
  })

  it('active=image 但一张图都没有 -> 回退 preset', () => {
    expect(background({ active: 'image', images: [] }).active).toBe('preset')
  })

  it('imageIndex 越界会被夹住', () => {
    const images = ['data:image/jpeg;base64,AAA']
    expect(background({ images, imageIndex: 99 }).imageIndex).toBe(0)
    expect(background({ images, imageIndex: -3 }).imageIndex).toBe(0)
  })

  it('dailyRandom 非布尔值兜底成 false', () => {
    expect(background({ dailyRandom: 'yes' }).dailyRandom).toBe(false)
    expect(background({ dailyRandom: true }).dailyRandom).toBe(true)
  })

  it('卡片不透明度：0 和 100 都是合法值', () => {
    expect(background({ cardOpacity: 0 }).cardOpacity).toBe(CARD_OPACITY_MIN)
    expect(background({ cardOpacity: 100 }).cardOpacity).toBe(CARD_OPACITY_MAX)
  })

  it('卡片不透明度：越界夹取，脏值兜底', () => {
    expect(background({ cardOpacity: -50 }).cardOpacity).toBe(CARD_OPACITY_MIN)
    expect(background({ cardOpacity: 9999 }).cardOpacity).toBe(CARD_OPACITY_MAX)
    expect(background({ cardOpacity: 'abc' }).cardOpacity).toBe(CARD_OPACITY_DEFAULT)
  })

  it('不影响同级的其他背景字段', () => {
    const bg = background({
      active: 'image',
      presetId: 'mint',
      images: ['data:image/jpeg;base64,AAA'],
      dailyRandom: true,
      cardOpacity: 60,
    })
    expect(bg.presetId).toBe('mint')
    expect(bg.dailyRandom).toBe(true)
    expect(bg.cardOpacity).toBe(60)
  })

  it('字符数上限是个合理的数（给任务/签到留出配额）', () => {
    expect(MAX_BACKGROUND_CHARS).toBeGreaterThan(100_000)
    expect(MAX_BACKGROUND_CHARS).toBeLessThan(5_000_000)
  })
})

describe('looksLikeAppData', () => {
  it('认得出自己的备份', () => {
    expect(looksLikeAppData(createDefaultData())).toBe(true)
  })

  it('随便一个 JSON 不认 —— 否则导入会悄悄清空用户数据', () => {
    expect(looksLikeAppData({})).toBe(false)
    expect(looksLikeAppData({ foo: 'bar' })).toBe(false)
    expect(looksLikeAppData({ settings: {} })).toBe(true)
    expect(looksLikeAppData({ tasks: {} })).toBe(true)
    expect(looksLikeAppData(null)).toBe(false)
    expect(looksLikeAppData('abc')).toBe(false)
  })
})
