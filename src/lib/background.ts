/**
 * 背景的纯逻辑：内置渐变、每日随机、最终该显示哪张。
 * 不碰 DOM，方便单测。
 */

import { fromDateKey, todayKey } from './date'
import {
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  type BackgroundPresetId,
  type BackgroundSettings,
} from './storage'

/**
 * 卡片模糊强度跟着不透明度走。
 * 越透明越要把背景「揉匀」，否则照片细节会直接干扰文字。
 * 100% 不透明 -> 8px ；0%（完全透明）-> 24px，中间线性插值。
 */
export function blurForAlpha(alphaPercent: number): number {
  const clamped = Math.min(CARD_OPACITY_MAX, Math.max(CARD_OPACITY_MIN, alphaPercent))
  const t = (CARD_OPACITY_MAX - clamped) / (CARD_OPACITY_MAX - CARD_OPACITY_MIN)
  return Math.round(8 + t * 16)
}

/** 内置的 4 套低饱和度背景 */
export const BACKGROUND_PRESETS: readonly {
  id: BackgroundPresetId
  name: string
  /** 直接可以塞进 style.background 的 CSS 值 */
  background: string
}[] = [
  {
    id: 'blueGray',
    name: '蓝灰',
    background: 'linear-gradient(160deg, #eef2f7 0%, #dbe3ec 100%)',
  },
  {
    id: 'pinkPurple',
    name: '粉紫',
    background: 'linear-gradient(160deg, #f7eff6 0%, #e6dff0 100%)',
  },
  {
    id: 'mint',
    name: '浅绿',
    background: 'linear-gradient(160deg, #eff5f1 0%, #dceade 100%)',
  },
  { id: 'white', name: '纯白', background: '#FFFFFF' },
]

export function getPreset(id: BackgroundPresetId): (typeof BACKGROUND_PRESETS)[number] {
  return (
    BACKGROUND_PRESETS.find((preset) => preset.id === id) ??
    BACKGROUND_PRESETS[BACKGROUND_PRESETS.length - 1]
  )
}

/* ------------------------------------------------------------------ */
/* 每日随机                                                            */
/* ------------------------------------------------------------------ */

/** 逐日推演的起点：2020-01-01 记作第 0 天 */
const EPOCH_KEY = '2020-01-01'

/** 安全上限（约 100 年），避免传入离谱日期时空转 */
const MAX_WALK_DAYS = 36_600

/** 整数哈希（murmur3 收尾），把「第几天」打散成一个乱序的值 */
function hashDay(day: number): number {
  let h = Math.imul(day ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** 距 EPOCH 的天数；早于 EPOCH 或日期非法一律当作第 0 天 */
function dayOffset(dateKey: string): number {
  const target = fromDateKey(dateKey).getTime()
  const epoch = fromDateKey(EPOCH_KEY).getTime()
  if (!Number.isFinite(target)) return 0
  return Math.min(MAX_WALK_DAYS, Math.max(0, Math.round((target - epoch) / 86_400_000)))
}

/**
 * 今天该显示第几张图。
 *
 * 从固定起点逐日推演：每天取一个哈希值，**如果和前一天的结果撞了就往后挪一格**。
 * 这样两个要求同时成立：
 *  1. 同一天永远是同一个结果（纯函数，只依赖日期）
 *  2. 相邻两天一定不是同一张
 *
 * 为什么不能「直接拿今天和昨天的原始哈希比」：昨天自己可能也被挪过，
 * 只比原始值的话，连续三天哈希相同时第二、三天会算出同一张。
 * 逐日推演没有这个问题 —— 它比的是**最终结果**。
 *
 * 循环次数 = 距 2020-01-01 的天数（几千次整数运算），可以忽略。
 */
export function dailyImageIndex(dateKey: string, count: number): number {
  if (count <= 1) return 0

  const offset = dayOffset(dateKey)
  let current = hashDay(0) % count

  for (let day = 1; day <= offset; day += 1) {
    const raw = hashDay(day) % count
    // raw === current 时往后挪一格；count >= 2 保证挪完一定不等于 current
    current = raw === current ? (raw + 1) % count : raw
  }

  return current
}

/* ------------------------------------------------------------------ */
/* 最终解析                                                            */
/* ------------------------------------------------------------------ */

export type ResolvedBackground = {
  presetId: BackgroundPresetId
  /** 内置渐变，永远有值，作为底色铺在最下面 */
  presetBackground: string
  /** 有值时说明要在底色上再盖一张自定义图 */
  image: { index: number; dataUrl: string } | null
}

/**
 * 最终该显示什么。
 * 没有上传图片、或者用户选了内置渐变，就返回内置渐变（image 为 null）。
 */
export function resolveBackground(
  bg: BackgroundSettings,
  dateKey: string = todayKey(),
): ResolvedBackground {
  const preset = getPreset(bg.presetId)
  const base: ResolvedBackground = {
    presetId: preset.id,
    presetBackground: preset.background,
    image: null,
  }

  if (bg.active !== 'image' || bg.images.length === 0) return base

  const index = bg.dailyRandom
    ? dailyImageIndex(dateKey, bg.images.length)
    : Math.min(Math.max(0, bg.imageIndex), bg.images.length - 1)

  const dataUrl = bg.images[index] ?? bg.images[0]
  return { ...base, image: { index, dataUrl } }
}

/** 所有背景图 Base64 加起来的字符数，用于容量护栏和界面提示 */
export function totalImageChars(images: string[]): number {
  return images.reduce((sum, item) => sum + item.length, 0)
}
