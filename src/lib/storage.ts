/**
 * 数据持久化层 —— SPEC「数据模型」
 *
 * 存储策略：localStorage 单键 `kaoyan-app-data`，整个应用状态序列化成一个 JSON。
 * 无后端、无登录。
 *
 * 对外 API：
 *   loadData()   —— 读取；无数据 / 数据损坏时回退到默认数据
 *   saveData()   —— 写入；返回是否成功
 *   updateData() —— 读取 → 交给 updater → 写回 → 返回新数据
 */

import { isValidDateKey } from './date'

/** localStorage 使用的唯一键 */
export const STORAGE_KEY = 'kaoyan-app-data'

/** 当前数据结构版本，将来结构变更时用于迁移 */
export const DATA_VERSION = 1

/* ------------------------------------------------------------------ */
/* 类型定义                                                            */
/* ------------------------------------------------------------------ */

/** 单条任务 */
export type Task = {
  id: string
  text: string
  done: boolean
  seconds: number // 累计学习秒数
  createdAt: number
}

/** 徽章种类：连续 7 / 15 / 30 天 */
export type BadgeType = '7d' | '15d' | '30d'

/** 已获得的徽章 */
export type Badge = {
  type: BadgeType
  earnedAt: string // YYYY-MM-DD
  streak: number // 获得时的连续天数
}

/* ------------------------------------------------------------------ */
/* 背景设置                                                            */
/* ------------------------------------------------------------------ */

/** 内置的低饱和度渐变 */
export type BackgroundPresetId = 'blueGray' | 'pinkPurple' | 'mint' | 'white'

/**
 * 背景最多存几张图。
 * localStorage 大约 5MB 配额（按 UTF-16 算约 260 万字符），Base64 又比原图胀 33%，
 * 所以这里既限制张数，也限制总字符数，两道护栏。
 */
export const MAX_BACKGROUND_IMAGES = 5

/** 所有背景图 Base64 字符串的总长度上限（字符数），给任务/签到等数据留出余量 */
export const MAX_BACKGROUND_CHARS = 2_000_000

/**
 * 卡片不透明度（百分比），0 = 完全透明，100 = 完全不透明。
 *
 * 全范围开放，但要注意：低于 50% 后深色照片会把卡片压成中灰，
 * 次要文字（#888）对比度会掉到 2:1 以下；到 0% 时卡片完全消失，
 * 文字直接压在照片上。界面上会给出提示，最终由用户自己权衡。
 */
export const CARD_OPACITY_MIN = 0
export const CARD_OPACITY_MAX = 100
export const CARD_OPACITY_DEFAULT = 70

export type BackgroundSettings = {
  /** 当前显示内置渐变还是自己上传的图 */
  active: 'preset' | 'image'
  presetId: BackgroundPresetId
  /** 上传的背景图，`data:image/...` 开头的 Base64 */
  images: string[]
  /** 关掉每日随机时，手动选中的那张（下标） */
  imageIndex: number
  /** 每天按本地日期做种子，从 images 里随机挑一张 */
  dailyRandom: boolean
  /** 卡片不透明度，百分比（CARD_OPACITY_MIN ~ CARD_OPACITY_MAX） */
  cardOpacity: number
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  active: 'preset',
  presetId: 'white',
  images: [],
  imageIndex: 0,
  dailyRandom: false,
  cardOpacity: CARD_OPACITY_DEFAULT,
}

/**
 * 深浅色模式。
 * system = 跟随系统；light / dark = 手动锁死，不管系统怎么设。
 */
export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark']

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

/** 设置面板里的全部配置 */
export type Settings = {
  examName: string // "2026 考研"
  examDate: string // "2026-12-20"
  focusMinutes: number // 默认 25
  breakMinutes: number // 默认 5
  soundOn: boolean // 默认 true
  vibrateOn: boolean // 默认 true
  /** 深浅色模式，默认跟随系统 */
  theme: ThemeMode
  customQuotes: string[]
  background: BackgroundSettings
}

/** 整个应用的状态，也是 localStorage 里存的唯一一份 JSON */
export type AppData = {
  version: 1
  tasks: Record<string, Task[]> // key = "2026-10-07"
  checkins: string[] // ["2026-10-07", ...]
  badges: Badge[]
  /** 番茄钟里「不关联任务」的专注秒数，key = "2026-10-07" */
  dayTotals: Record<string, number>
  settings: Settings
}

/* ------------------------------------------------------------------ */
/* 默认值                                                              */
/* ------------------------------------------------------------------ */

/** 设置项默认值 */
export const DEFAULT_SETTINGS: Settings = {
  examName: '2026 考研',
  examDate: '2026-12-20',
  focusMinutes: 25,
  breakMinutes: 5,
  soundOn: true,
  vibrateOn: true,
  theme: 'system',
  customQuotes: [],
  background: DEFAULT_BACKGROUND,
}

/** 生成一份全新的默认数据（每次都返回新对象，避免调用方改到共享引用） */
export function createDefaultData(): AppData {
  return {
    version: DATA_VERSION,
    tasks: {},
    checkins: [],
    badges: [],
    dayTotals: {},
    settings: {
      ...DEFAULT_SETTINGS,
      customQuotes: [],
      background: { ...DEFAULT_BACKGROUND, images: [] },
    },
  }
}

/** 生成本地唯一 id */
export function createId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/* ------------------------------------------------------------------ */
/* 读取 / 写入                                                         */
/* ------------------------------------------------------------------ */

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/**
 * 读取数据。
 * 任何异常（无数据、JSON 损坏、结构不对）都会回退到默认数据，绝不抛错。
 */
export function loadData(): AppData {
  if (!hasLocalStorage()) return createDefaultData()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultData()
    return normalizeData(JSON.parse(raw) as unknown)
  } catch (error) {
    console.warn('[storage] 读取失败，已回退到默认数据', error)
    return createDefaultData()
  }
}

/**
 * 写入数据。
 * localStorage 可能因为隐私模式 / 容量超限而失败，这里吞掉异常并返回 false。
 */
export function saveData(data: AppData): boolean {
  if (!hasLocalStorage()) return false

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (error) {
    console.warn('[storage] 写入失败', error)
    return false
  }
}

/**
 * 读取当前数据 → 交给 updater 得到新数据 → 写回 → 返回新数据。
 * updater 必须是纯函数：接收旧数据，返回一份新的 AppData。
 *
 * @example
 * updateData((prev) => ({ ...prev, checkins: [...prev.checkins, today] }))
 */
export function updateData(updater: (prev: AppData) => AppData): AppData {
  const next = updater(loadData())
  saveData(next)
  return next
}

/* ------------------------------------------------------------------ */
/* 结构校验 / 归一化                                                   */
/* ------------------------------------------------------------------ */
/* localStorage 里的东西可能是旧版本、手动改坏的、或被别的代码写脏的，
 * 所以读出来的每一步都做类型收敛，缺什么补什么、类型不对就用默认值。 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * 签到日期列表：去重、排序、并**校验格式**。
 *
 * 校验不是洁癖 —— 这些字符串会被 checkinsToRows 原样发给 Postgres 的 `date` 列，
 * 只要混进去一个「不是日期」，整批 upsert 就会报
 * `invalid input syntax for type date`，同步会一直卡住推不上去。
 */
function normalizeCheckins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !isValidDateKey(item)) continue
    seen.add(item)
  }
  return [...seen].sort()
}

/** 去掉两端空白、丢弃空串并去重（自定义语录用，重复的没意义） */
function asUniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
  return Math.max(0, asNumber(value, fallback))
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Math.round(asNumber(value, fallback))
  return n > 0 ? n : fallback
}

function isBadgeType(value: unknown): value is BadgeType {
  return value === '7d' || value === '15d' || value === '30d'
}

function normalizeTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null

  const text = asString(raw.text, '')
  if (!text.trim()) return null

  return {
    id: asString(raw.id, '') || createId(),
    text,
    done: asBoolean(raw.done, false),
    seconds: asNonNegativeNumber(raw.seconds, 0),
    createdAt: asNumber(raw.createdAt, Date.now()),
  }
}

/** tasks 是「日期 → 任务数组」的映射，逐条清洗，丢弃不合法项 */
function normalizeTasks(raw: unknown): Record<string, Task[]> {
  if (!isRecord(raw)) return {}

  const result: Record<string, Task[]> = {}
  for (const [date, list] of Object.entries(raw)) {
    // 日期 key 会原样发给 Postgres 的 date 列，非法的必须挡在这里
    if (!isValidDateKey(date)) continue
    if (!Array.isArray(list)) continue

    const tasks: Task[] = []
    for (const item of list) {
      const task = normalizeTask(item)
      if (task) tasks.push(task)
    }
    result[date] = tasks
  }
  return result
}

/** 只能持有一枚的徽章；30d 可以叠加，所以不参与「按类型去重」 */
const SINGLE_BADGES: readonly BadgeType[] = ['7d', '15d']

function normalizeBadges(raw: unknown): Badge[] {
  if (!Array.isArray(raw)) return []

  const badges: Badge[] = []
  /** 7d/15d 按类型去重；30d 按获得日期去重（同一段连续里不会重复发） */
  const seen = new Set<string>()

  for (const item of raw) {
    if (!isRecord(item)) continue
    if (!isBadgeType(item.type)) continue

    const earnedAt = asString(item.earnedAt, '')
    const key = SINGLE_BADGES.includes(item.type) ? item.type : `${item.type}:${earnedAt}`
    if (seen.has(key)) continue

    seen.add(key)
    badges.push({
      type: item.type,
      earnedAt,
      streak: asNonNegativeNumber(item.streak, 0),
    })
  }
  return badges
}

/** dayTotals 是「日期 → 未关联任务的累计秒数」，丢弃非正数的脏值 */
function normalizeDayTotals(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {}

  const result: Record<string, number> = {}
  for (const [date, value] of Object.entries(raw)) {
    if (!isValidDateKey(date)) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    result[date] = value
  }
  return result
}

function isBackgroundPresetId(value: unknown): value is BackgroundPresetId {
  return (
    value === 'blueGray' || value === 'pinkPurple' || value === 'mint' || value === 'white'
  )
}

/** 背景图必须是 data:image/ 开头的 Base64，避免脏数据塞进 CSS */
function normalizeBackgroundImages(raw: unknown): string[] {
  return asStringArray(raw)
    .filter((item) => item.startsWith('data:image/'))
    .slice(0, MAX_BACKGROUND_IMAGES)
}

function normalizeBackground(raw: unknown): BackgroundSettings {
  if (!isRecord(raw)) return { ...DEFAULT_BACKGROUND, images: [] }

  const images = normalizeBackgroundImages(raw.images)
  const presetId = isBackgroundPresetId(raw.presetId)
    ? raw.presetId
    : DEFAULT_BACKGROUND.presetId

  // 一张图都没有就只能用内置渐变
  const active = raw.active === 'image' && images.length > 0 ? 'image' : 'preset'

  const rawIndex = Math.round(asNumber(raw.imageIndex, 0))
  const imageIndex = Math.min(Math.max(0, rawIndex), Math.max(0, images.length - 1))

  const rawOpacity = Math.round(asNumber(raw.cardOpacity, CARD_OPACITY_DEFAULT))
  const cardOpacity = Math.min(CARD_OPACITY_MAX, Math.max(CARD_OPACITY_MIN, rawOpacity))

  return {
    active,
    presetId,
    images,
    imageIndex,
    dailyRandom: asBoolean(raw.dailyRandom, DEFAULT_BACKGROUND.dailyRandom),
    cardOpacity,
  }
}

function normalizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS, customQuotes: [], background: { ...DEFAULT_BACKGROUND } }
  }

  return {
    examName: asString(raw.examName, DEFAULT_SETTINGS.examName),
    examDate: asString(raw.examDate, DEFAULT_SETTINGS.examDate),
    focusMinutes: asPositiveInt(
      raw.focusMinutes,
      DEFAULT_SETTINGS.focusMinutes,
    ),
    breakMinutes: asPositiveInt(
      raw.breakMinutes,
      DEFAULT_SETTINGS.breakMinutes,
    ),
    soundOn: asBoolean(raw.soundOn, DEFAULT_SETTINGS.soundOn),
    vibrateOn: asBoolean(raw.vibrateOn, DEFAULT_SETTINGS.vibrateOn),
    // 旧数据没这个字段 -> 落到 'system'，升级不会把用户的深浅色偏好重置掉
    theme: isThemeMode(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    customQuotes: asUniqueStrings(raw.customQuotes),
    background: normalizeBackground(raw.background),
  }
}

/**
 * 粗判一份数据是不是本应用的备份。
 * 导入时用 —— 否则随便选个 JSON 文件进来，normalizeData 会「成功」返回一份默认数据，
 * 等于把用户的数据悄悄清空了。
 */
export function looksLikeAppData(value: unknown): boolean {
  if (!isRecord(value)) return false
  return ['tasks', 'checkins', 'badges', 'dayTotals', 'settings'].some(
    (key) => key in value,
  )
}

/**
 * 把任意值收敛成合法的 AppData。
 * 将来 version 升级时，在这里按 raw.version 做迁移。
 */
export function normalizeData(raw: unknown): AppData {
  if (!isRecord(raw)) return createDefaultData()

  return {
    version: DATA_VERSION,
    tasks: normalizeTasks(raw.tasks),
    checkins: normalizeCheckins(raw.checkins),
    badges: normalizeBadges(raw.badges),
    dayTotals: normalizeDayTotals(raw.dayTotals),
    settings: normalizeSettings(raw.settings),
  }
}
