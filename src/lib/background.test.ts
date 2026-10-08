import { describe, expect, it } from 'vitest'

import {
  BACKGROUND_PRESETS,
  DARK_IMAGE_DIM,
  blurForAlpha,
  dailyImageIndex,
  getPreset,
  resolveBackground,
  totalImageChars,
} from './background'
import { CARD_OPACITY_MAX, CARD_OPACITY_MIN, type BackgroundSettings } from './storage'

/** 从 CSS 值里抠出所有十六进制颜色 */
function hexesIn(css: string): string[] {
  return [...css.matchAll(/#([0-9a-fA-F]{6})/g)].map((m) => m[1])
}

/** WCAG 相对亮度 */
function luminance(hex: string): number {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

describe('blurForAlpha', () => {
  it('100% 不透明 -> 8px，0% -> 24px', () => {
    expect(blurForAlpha(100)).toBe(8)
    expect(blurForAlpha(0)).toBe(24)
  })

  it('70% -> 13px', () => {
    expect(blurForAlpha(70)).toBe(13)
  })

  it('超出范围按边界算', () => {
    expect(blurForAlpha(-50)).toBe(24)
    expect(blurForAlpha(999)).toBe(8)
  })

  it('单调：越透明模糊越大', () => {
    let previous = blurForAlpha(CARD_OPACITY_MIN)
    for (let a = CARD_OPACITY_MIN + 1; a <= CARD_OPACITY_MAX; a += 1) {
      const blur = blurForAlpha(a)
      expect(blur).toBeLessThanOrEqual(previous)
      previous = blur
    }
  })

  it('全范围都是 8~24 的整数', () => {
    for (let a = 0; a <= 100; a += 1) {
      const blur = blurForAlpha(a)
      expect(Number.isInteger(blur)).toBe(true)
      expect(blur).toBeGreaterThanOrEqual(8)
      expect(blur).toBeLessThanOrEqual(24)
    }
  })
})

describe('内置背景预设', () => {
  it('4 套，顺序固定', () => {
    expect(BACKGROUND_PRESETS.map((p) => p.id)).toEqual(['blueGray', 'pinkPurple', 'mint', 'white'])
  })

  it('每套都配了深色版，且和浅色版不同', () => {
    for (const preset of BACKGROUND_PRESETS) {
      expect(preset.darkBackground).toBeTruthy()
      expect(preset.darkBackground).not.toBe(preset.background)
    }
  })

  it('浅色版确实是浅的（最暗的色标亮度 > 0.6）', () => {
    for (const preset of BACKGROUND_PRESETS) {
      const darkest = Math.min(...hexesIn(preset.background).map(luminance))
      expect(darkest).toBeGreaterThan(0.6)
    }
  })

  it('深色版确实是深的（最亮的色标亮度 < 0.06）', () => {
    for (const preset of BACKGROUND_PRESETS) {
      const brightest = Math.max(...hexesIn(preset.darkBackground).map(luminance))
      expect(brightest).toBeLessThan(0.06)
    }
  })

  it('深色版保留了色相，不是一坨灰', () => {
    for (const preset of BACKGROUND_PRESETS.filter((p) => p.id !== 'white')) {
      for (const hex of hexesIn(preset.darkBackground)) {
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
        expect(r === g && g === b).toBe(false)
      }
    }
  })

  it('getPreset 未知 id 兜底到最后一个（纯白）', () => {
    expect(getPreset('nope' as never).id).toBe('white')
  })
})

describe('dailyImageIndex（每日随机）', () => {
  const dates = Array.from({ length: 365 }, (_, i) => {
    const day = new Date(2026, 0, 1 + i)
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const d = String(day.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })

  it('同一天调用多少次结果都一样', () => {
    for (const date of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const first = dailyImageIndex(date, 5)
      for (let i = 0; i < 50; i += 1) {
        expect(dailyImageIndex(date, 5)).toBe(first)
      }
    }
  })

  it('只有 1 张图时永远是第 0 张', () => {
    for (const date of dates.slice(0, 30)) {
      expect(dailyImageIndex(date, 1)).toBe(0)
    }
  })

  it('一张图都没有时返回 0，不会崩', () => {
    expect(dailyImageIndex('2026-10-08', 0)).toBe(0)
    expect(dailyImageIndex('2026-10-08', -3)).toBe(0)
  })

  it('下标永远在 [0, count) 内', () => {
    for (const count of [2, 3, 4, 5]) {
      for (const date of dates) {
        const index = dailyImageIndex(date, count)
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(count)
      }
    }
  })

  it('连续两天一定不是同一张（2/3/4/5 张都验一遍）', () => {
    for (const count of [2, 3, 4, 5]) {
      for (let i = 1; i < dates.length; i += 1) {
        expect(
          dailyImageIndex(dates[i], count),
          `${count} 张图时 ${dates[i - 1]} 和 ${dates[i]} 撞了`,
        ).not.toBe(dailyImageIndex(dates[i - 1], count))
      }
    }
  })

  it('长期分布均匀：365 天里 5 张图都用到过', () => {
    const used = new Set(dates.map((date) => dailyImageIndex(date, 5)))
    expect(used.size).toBe(5)
  })

  it('跨年也稳定', () => {
    expect(dailyImageIndex('2026-12-31', 4)).not.toBe(dailyImageIndex('2027-01-01', 4))
  })
})

describe('resolveBackground', () => {
  const base: BackgroundSettings = {
    active: 'preset',
    presetId: 'blueGray',
    images: [],
    imageIndex: 0,
    dailyRandom: false,
    cardOpacity: 70,
  }

  it('浅色用浅色渐变，深色用深色渐变', () => {
    const preset = getPreset('blueGray')
    expect(resolveBackground(base, '2026-10-08', 'light').presetBackground).toBe(preset.background)
    expect(resolveBackground(base, '2026-10-08', 'dark').presetBackground).toBe(
      preset.darkBackground,
    )
  })

  it('不传主题时默认浅色（向后兼容）', () => {
    expect(resolveBackground(base, '2026-10-08').presetBackground).toBe(
      getPreset('blueGray').background,
    )
  })

  it('没有图片时 image 为 null', () => {
    const r = resolveBackground(base, '2026-10-08', 'dark')
    expect(r.image).toBeNull()
    expect(r.imageDim).toBe(0)
  })

  it('选了内置渐变 -> 即使有图也不用图', () => {
    const r = resolveBackground(
      { ...base, images: ['data:image/jpeg;base64,AAA'] },
      '2026-10-08',
      'light',
    )
    expect(r.image).toBeNull()
  })

  it('选了自定义图 + 关掉随机 -> 用 imageIndex 那张', () => {
    const r = resolveBackground(
      {
        ...base,
        active: 'image',
        images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'],
        imageIndex: 1,
      },
      '2026-10-08',
      'light',
    )
    expect(r.image?.dataUrl).toBe('data:image/jpeg;base64,BBB')
    expect(r.imageDim).toBe(0)
  })

  it('imageIndex 越界会被夹住', () => {
    const images = ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']
    expect(
      resolveBackground({ ...base, active: 'image', images, imageIndex: 99 }, '2026-10-08').image
        ?.index,
    ).toBe(1)
    expect(
      resolveBackground({ ...base, active: 'image', images, imageIndex: -5 }, '2026-10-08').image
        ?.index,
    ).toBe(0)
  })

  it('深色下自定义图被压暗 45%，浅色下不压暗', () => {
    const withImage: BackgroundSettings = {
      ...base,
      active: 'image',
      images: ['data:image/jpeg;base64,AAA'],
    }
    expect(resolveBackground(withImage, '2026-10-08', 'dark').imageDim).toBe(DARK_IMAGE_DIM)
    expect(resolveBackground(withImage, '2026-10-08', 'light').imageDim).toBe(0)
  })

  it('开了每日随机就跟着日期走，且同一天稳定', () => {
    const bg: BackgroundSettings = {
      ...base,
      active: 'image',
      images: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'],
      dailyRandom: true,
    }
    const first = resolveBackground(bg, '2026-10-08').image?.index
    expect(resolveBackground(bg, '2026-10-08').image?.index).toBe(first)
    expect(resolveBackground(bg, '2026-10-09').image?.index).not.toBe(first)
  })
})

describe('totalImageChars', () => {
  it('累加所有 Base64 长度', () => {
    expect(totalImageChars(['abc', 'defg'])).toBe(7)
    expect(totalImageChars([])).toBe(0)
  })
})
