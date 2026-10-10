import { describe, expect, it } from 'vitest'

import {
  checkinsToRows,
  diariesFingerprint,
  isEmptyCloud,
  rowsToCheckins,
  rowsToTasks,
  settingsFingerprint,
  staleTaskIds,
  tasksFingerprint,
  tasksToRows,
} from './sync'
import { createDefaultData, type AppData } from './storage'

const USER = '11111111-1111-1111-1111-111111111111'
const NOW = '2026-10-08T12:00:00.000Z'

function withTasks(): AppData {
  const data = createDefaultData()
  data.tasks = {
    '2026-10-07': [
      { id: 'a', text: '英语阅读', done: true, seconds: 1500, createdAt: 1000 },
      { id: 'b', text: '数学', done: false, seconds: 0, createdAt: 2000 },
    ],
    '2026-10-08': [{ id: 'c', text: '政治', done: false, seconds: 600, createdAt: 3000 }],
  }
  data.checkins = ['2026-10-07', '2026-10-08']
  return data
}

describe('tasksToRows', () => {
  it('摊平成一行一件', () => {
    expect(tasksToRows(withTasks(), USER, NOW)).toHaveLength(3)
  })

  it('带上 user_id 和 updated_at', () => {
    const rows = tasksToRows(withTasks(), USER, NOW)
    expect(rows.every((r) => r.user_id === USER)).toBe(true)
    expect(rows.every((r) => r.updated_at === NOW)).toBe(true)
  })

  it('position 记的是当天顺序', () => {
    const rows = tasksToRows(withTasks(), USER, NOW).filter((r) => r.date === '2026-10-07')
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('createdAt 转成 ISO 字符串', () => {
    const row = tasksToRows(withTasks(), USER, NOW).find((r) => r.id === 'a')
    expect(row?.created_at).toBe(new Date(1000).toISOString())
  })

  it('负数秒数被夹到 0（脏数据防护）', () => {
    const data = createDefaultData()
    data.tasks = { '2026-10-08': [{ id: 'x', text: 't', done: false, seconds: -50, createdAt: 0 }] }
    expect(tasksToRows(data, USER, NOW)[0].seconds).toBe(0)
  })

  it('没有任务时返回空数组', () => {
    expect(tasksToRows(createDefaultData(), USER, NOW)).toEqual([])
  })
})

describe('rowsToTasks', () => {
  it('按日期分组', () => {
    const map = rowsToTasks(tasksToRows(withTasks(), USER, NOW))
    expect(Object.keys(map).sort()).toEqual(['2026-10-07', '2026-10-08'])
    expect(map['2026-10-07']).toHaveLength(2)
  })

  it('同一天按 position 排序 —— 顺序打乱了也能还原', () => {
    const rows = tasksToRows(withTasks(), USER, NOW)
    const shuffled = [rows[1], rows[0], rows[2]]
    expect(rowsToTasks(shuffled)['2026-10-07'].map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('往返一致：data -> rows -> data', () => {
    const before = withTasks()
    expect(rowsToTasks(tasksToRows(before, USER, NOW))).toEqual(before.tasks)
  })
})

describe('checkins 转换', () => {
  it('转成行', () => {
    const rows = checkinsToRows(withTasks(), USER)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ user_id: USER, date: '2026-10-07' })
  })

  it('拉回来时去重并排序', () => {
    const rows = [
      { user_id: USER, date: '2026-10-08' },
      { user_id: USER, date: '2026-10-07' },
      { user_id: USER, date: '2026-10-08' },
    ]
    expect(rowsToCheckins(rows)).toEqual(['2026-10-07', '2026-10-08'])
  })
})

describe('isEmptyCloud', () => {
  it('任务和签到都空才算空（决定首次同步的方向）', () => {
    expect(isEmptyCloud(0, 0)).toBe(true)
    expect(isEmptyCloud(1, 0)).toBe(false)
    expect(isEmptyCloud(0, 1)).toBe(false)
    expect(isEmptyCloud(3, 5)).toBe(false)
  })
})

describe('staleTaskIds（该删哪些云端行）', () => {
  it('本地一个日期都没碰过 -> 一个都不删', () => {
    const cloud = [
      { id: 'a', date: '2026-10-08' },
      { id: 'b', date: '2026-10-07' },
    ]
    expect(staleTaskIds([], [], cloud)).toEqual([])
  })

  it('本地没碰过的日期，云端的任务保留', () => {
    const data = withTasks()
    const local = tasksToRows(data, USER, NOW)
    const cloud = [
      { id: 'a', date: '2026-10-07' },
      { id: 'b', date: '2026-10-07' },
      { id: 'other1', date: '2026-09-01' },
      { id: 'other2', date: '2026-09-01' },
    ]
    expect(staleTaskIds(Object.keys(data.tasks), local, cloud)).toEqual([])
  })

  it('本地编辑过的日期里，云端多出来的会删', () => {
    const data = withTasks()
    const local = tasksToRows(data, USER, NOW)
    const cloud = [
      { id: 'a', date: '2026-10-07' },
      { id: 'b', date: '2026-10-07' },
      { id: 'zzz', date: '2026-10-07' },
    ]
    expect(staleTaskIds(Object.keys(data.tasks), local, cloud)).toEqual(['zzz'])
  })

  it('某天被删光了，日期 key 还在 -> 照删不误', () => {
    const data = createDefaultData()
    data.tasks = { '2026-10-08': [] }
    expect(Object.keys(data.tasks)).toEqual(['2026-10-08'])
    expect(tasksToRows(data, USER, NOW)).toEqual([])
    expect(staleTaskIds(Object.keys(data.tasks), [], [{ id: 'a', date: '2026-10-08' }])).toEqual([
      'a',
    ])
  })

  it('云端为空 -> 空数组', () => {
    const data = withTasks()
    expect(staleTaskIds(Object.keys(data.tasks), tasksToRows(data, USER, NOW), [])).toEqual([])
  })
})

describe('变更指纹', () => {
  it('内容一样 -> 指纹一样', () => {
    expect(tasksFingerprint(withTasks())).toBe(tasksFingerprint(withTasks()))
    expect(settingsFingerprint(withTasks())).toBe(settingsFingerprint(withTasks()))
  })

  it('加任务 / 勾完成 / 加签到 都会让任务指纹变', () => {
    const a = withTasks()

    const b = withTasks()
    b.tasks['2026-10-08'].push({ id: 'd', text: '新', done: false, seconds: 0, createdAt: 4 })
    expect(tasksFingerprint(b)).not.toBe(tasksFingerprint(a))

    const c = withTasks()
    c.tasks['2026-10-07'][1].done = true
    expect(tasksFingerprint(c)).not.toBe(tasksFingerprint(a))

    const d = withTasks()
    d.checkins = [...d.checkins, '2026-10-09']
    expect(tasksFingerprint(d)).not.toBe(tasksFingerprint(a))
  })

  it('两个指纹互相独立：改任务不影响设置指纹', () => {
    const a = withTasks()
    const b = withTasks()
    b.tasks['2026-10-08'].push({ id: 'e', text: 'x', done: false, seconds: 0, createdAt: 1 })
    expect(settingsFingerprint(a)).toBe(settingsFingerprint(b))
  })

  it('改设置不影响任务指纹', () => {
    const a = withTasks()
    const b = withTasks()
    b.settings.examName = '换个名字'
    expect(tasksFingerprint(a)).toBe(tasksFingerprint(b))
    expect(settingsFingerprint(a)).not.toBe(settingsFingerprint(b))
  })

  it('背景图只吃长度和头尾，不会把整串 Base64 塞进指纹', () => {
    const data = createDefaultData()
    data.settings.background.images = ['data:image/jpeg;base64,' + 'A'.repeat(500_000)]
    expect(settingsFingerprint(data).length).toBeLessThan(2000)
  })

  it('换图（长度不同）能识别', () => {
    const data = createDefaultData()
    data.settings.background.images = ['data:image/jpeg;base64,' + 'A'.repeat(100)]
    const before = settingsFingerprint(data)
    data.settings.background.images = ['data:image/jpeg;base64,' + 'B'.repeat(200)]
    expect(settingsFingerprint(data)).not.toBe(before)
  })

  it('换图（长度相同、内容不同）也能识别', () => {
    const data = createDefaultData()
    data.settings.background.images = ['data:image/jpeg;base64,' + 'A'.repeat(100) + 'XXXX']
    const before = settingsFingerprint(data)
    data.settings.background.images = ['data:image/jpeg;base64,' + 'A'.repeat(100) + 'YYYY']
    expect(settingsFingerprint(data)).not.toBe(before)
  })
})


describe('diariesFingerprint（第三个指纹）', () => {
  const withDiary = () => {
    const data = withTasks()
    data.diaries = [
      { id: 'd1', date: '2026-10-08', mood: 'good', content: '今天做了三套卷子', createdAt: 1, updatedAt: 1 },
    ]
    return data
  }

  it('加一篇日记 -> 日记指纹变', () => {
    const before = withTasks()
    expect(diariesFingerprint(withDiary())).not.toBe(diariesFingerprint(before))
  })

  it('同样的日记 -> 指纹一样', () => {
    expect(diariesFingerprint(withDiary())).toBe(diariesFingerprint(withDiary()))
  })

  it('改日记正文 -> 指纹变', () => {
    const a = withDiary()
    const b = withDiary()
    b.diaries[0].content = '改过了'
    expect(diariesFingerprint(a)).not.toBe(diariesFingerprint(b))
  })

  it('删掉日记 -> 指纹变', () => {
    const a = withDiary()
    const b = withDiary()
    b.diaries = []
    expect(diariesFingerprint(a)).not.toBe(diariesFingerprint(b))
  })

  // 这三条是关键：写日记绝不能触发设置（可能带 2MB 背景图）或任务重传
  it('写日记不影响任务指纹', () => {
    expect(tasksFingerprint(withDiary())).toBe(tasksFingerprint(withTasks()))
  })

  it('写日记不影响设置指纹', () => {
    expect(settingsFingerprint(withDiary())).toBe(settingsFingerprint(withTasks()))
  })

  it('改设置不影响日记指纹', () => {
    const a = withDiary()
    const b = withDiary()
    b.settings.examName = '换个名字'
    expect(diariesFingerprint(a)).toBe(diariesFingerprint(b))
  })

  it('加任务不影响日记指纹', () => {
    const a = withDiary()
    const b = withDiary()
    b.tasks['2026-10-08'].push({ id: 'z', text: '新任务', done: false, seconds: 0, createdAt: 9 })
    expect(diariesFingerprint(a)).toBe(diariesFingerprint(b))
  })

  it('三个指纹两两独立：日记 / 任务 / 设置互不干扰', () => {
    const base = withTasks()
    const diary = withDiary()
    const task = withTasks()
    task.tasks['2026-10-08'].push({ id: 'z', text: '新', done: false, seconds: 0, createdAt: 9 })
    const conf = withTasks()
    conf.settings.examName = 'x'

    expect(diariesFingerprint(base)).toBe(diariesFingerprint(task))
    expect(diariesFingerprint(base)).toBe(diariesFingerprint(conf))
    expect(tasksFingerprint(base)).toBe(tasksFingerprint(conf))
    expect(settingsFingerprint(base)).toBe(settingsFingerprint(task))
    expect(diariesFingerprint(diary)).not.toBe(diariesFingerprint(base))
  })
})