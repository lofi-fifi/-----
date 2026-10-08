import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import { BACKGROUND_PRESETS, resolveBackground, totalImageChars } from '../lib/background'
import { todayKey } from '../lib/date'
import { buildProgressCard } from '../lib/progressCard'
import { clampValue, stepValue } from '../lib/stepper'
import {
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  createDefaultData,
  looksLikeAppData,
  MAX_BACKGROUND_CHARS,
  MAX_BACKGROUND_IMAGES,
  normalizeData,
  type AppData,
  type BackgroundSettings,
  type Settings,
} from '../lib/storage'
import { applyCardAppearance } from '../utils/appearance'
import { copyText } from '../utils/clipboard'
import { compressImage } from '../utils/image'
import ConfirmDialog from './ConfirmDialog'
import FriendsSection from './FriendsSection'

type SettingsPanelProps = {
  open: boolean
  onClose: () => void
  data: AppData
  /** 返回是否写入成功 —— 背景图可能撑爆 localStorage，需要据此提示用户 */
  update: (updater: (prev: AppData) => AppData) => boolean
  /** 已登录时的账号信息；没登录（本地版）传 null，整个分组不显示 */
  account?: {
    username: string | null
    email: string | null
    onLogout: () => void
  } | null
  /** 用户选了「先不登录」时传进来，用来回到登录页；已登录或没配 Supabase 传 null */
  onRequestLogin?: (() => void) | null
  /** 云同步状态；没登录传 null */
  sync?: {
    status: 'off' | 'idle' | 'pulling' | 'pushing' | 'offline' | 'error'
    message: string | null
    pending: boolean
    lastSyncedAt: number | null
    onPull: () => void
  } | null
}

const STEP_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-full border border-line ' +
  'text-muted transition-colors duration-200 active:text-ink disabled:opacity-20'

const TEXT_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-card border border-line ' +
  'bg-white px-3 text-[13px] text-ink transition-colors duration-200 active:bg-surface'

/** 提示条停留多久 */
const NOTICE_MS = 2600

/** 破坏性操作的防抖窗口：这段时间内重复触发只算一次 */
const DESTRUCTIVE_GUARD_MS = 400

/** 同步状态一句话描述。出错时具体原因由调用方另外显示。 */
function syncLabel(sync: NonNullable<SettingsPanelProps['sync']>): string {
  switch (sync.status) {
    case 'pulling':
      return '正在从云端读取…'
    case 'pushing':
      return '正在上传…'
    case 'offline':
      return '离线中，联网后会自动上传'
    case 'error':
      return '同步出错'
    default:
      return sync.pending ? '有改动待上传' : '已同步'
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[12px] text-muted">{title}</h3>
      {children}
    </section>
  )
}

/**
 * 时长选择：加减按钮按 5 分钟步进，中间的数字点一下变成输入框，
 * 可以直接敲 1、45、50 这种任意分钟数。回车 / 失焦保存，Esc 取消。
 */
function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  /** 已经收尾过（保存或取消）：避免输入框卸载后补发的 blur 再提交一次 */
  const settled = useRef(false)

  const bounds = { min, max, step }

  function startEdit() {
    settled.current = false
    setDraft(String(value))
    setEditing(true)
  }

  function commit() {
    if (settled.current) return
    settled.current = true
    setEditing(false)

    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed)) return // 空 / 乱输：保持原值

    const next = clampValue(parsed, min, max)
    if (next !== value) onChange(next)
  }

  function cancel() {
    if (settled.current) return
    settled.current = true
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-ink">{label}</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`减少${label}`}
          disabled={value <= min}
          onClick={() => onChange(stepValue(value, -1, bounds))}
          className={STEP_BUTTON}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
          </svg>
        </button>

        {editing ? (
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
            }}
            aria-label={`${label}（分钟）`}
            className="input-number min-h-11 w-[3.5rem] rounded-card border border-line
              bg-white px-2 text-center text-[14px] text-ink tabular-nums outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`输入${label}，当前 ${value} 分钟`}
            className="grid min-h-11 w-[3.5rem] place-items-center rounded-card border
              border-transparent text-[14px] text-ink tabular-nums transition-colors
              duration-200 active:bg-surface"
          >
            {value}
          </button>
        )}

        <span className="text-[12px] text-muted">min</span>

        <button
          type="button"
          aria-label={`增加${label}`}
          disabled={value >= max}
          onClick={() => onChange(stepValue(value, 1, bounds))}
          className={STEP_BUTTON}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** 开关：黑底白字 = 开，描边灰字 = 关 */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center
          rounded-card border px-3 text-[13px] transition-colors duration-200 ${
            value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted'
          }`}
      >
        {value ? '开' : '关'}
      </button>
    </div>
  )
}

/** 页面结构 6：设置面板（从右侧滑出） */
export default function SettingsPanel({
  open,
  onClose,
  data,
  update,
  account = null,
  sync = null,
  onRequestLogin = null,
}: SettingsPanelProps) {
  const { settings } = data

  const [quoteDraft, setQuoteDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmPull, setConfirmPull] = useState(false)
  /** 已经解析好、等着二次确认的导入数据 */
  const [pendingImport, setPendingImport] = useState<AppData | null>(null)
  /** 复制失败时把卡片文字摆出来，供手动长按复制 */
  const [cardFallback, setCardFallback] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  /** 正在压缩图片 */
  const [bgBusy, setBgBusy] = useState(false)
  /** 拖动不透明度滑块时的临时值（松手后才落盘） */
  const [opacityPreview, setOpacityPreview] = useState<number | null>(null)
  const opacityTimer = useRef<number | null>(null)
  const lastDestructiveAt = useRef(0)

  // 提示条自动消失
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // 卸载时清掉还没落盘的滑块定时器
  useEffect(() => {
    return () => {
      if (opacityTimer.current !== null) window.clearTimeout(opacityTimer.current)
    }
  }, [])

  /** 破坏性操作防抖：短时间内重复触发只真正执行一次，避免连点把数据搞坏 */
  function runDestructive(action: () => void) {
    const now = Date.now()
    if (now - lastDestructiveAt.current < DESTRUCTIVE_GUARD_MS) return
    lastDestructiveAt.current = now
    action()
  }

  function patchSettings(patch: Partial<Settings>) {
    update((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }

  /* ---------------- 背景 ---------------- */

  const background = settings.background
  const bgUsedChars = totalImageChars(background.images)
  /** 今天实际显示的那个背景（开了每日随机的话就是随机结果） */
  const bgToday = resolveBackground(background, todayKey())
  const bgFull = background.images.length >= MAX_BACKGROUND_IMAGES
  /** 当前高亮的图片下标（开了每日随机时就是今天随机到的那张） */
  const bgSelectedIndex =
    bgToday.image?.index ??
    Math.min(Math.max(0, background.imageIndex), Math.max(0, background.images.length - 1))
  /** 滑块当前显示的值：拖动时用临时值，否则用已保存的值 */
  const opacityValue = opacityPreview ?? background.cardOpacity

  function patchBackground(patch: Partial<BackgroundSettings>) {
    patchSettings({ background: { ...background, ...patch } })
  }

  /**
   * 拖动时：立刻改 CSS 变量实时预览，但**不写 localStorage**。
   * 背景图动辄上百万字符，每帧都序列化 + 写盘会把拖动卡死，
   * 所以停手 220ms 后才真正落盘。
   */
  function handleOpacityChange(value: number) {
    setOpacityPreview(value)
    applyCardAppearance(value)

    if (opacityTimer.current !== null) window.clearTimeout(opacityTimer.current)
    opacityTimer.current = window.setTimeout(() => {
      opacityTimer.current = null
      setOpacityPreview(null)
      patchBackground({ cardOpacity: value })
    }, 220)
  }

  async function handleBackgroundFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = '' // 允许连续两次选同一个文件
    if (files.length === 0) return

    const room = MAX_BACKGROUND_IMAGES - background.images.length
    if (room <= 0) {
      setNotice(`最多只能存 ${MAX_BACKGROUND_IMAGES} 张图片`)
      return
    }

    const picked = files.slice(0, room)
    if (files.length > room) {
      setNotice(`最多 ${MAX_BACKGROUND_IMAGES} 张，这次只加了前 ${room} 张`)
    }

    setBgBusy(true)
    const next = [...background.images]
    let chars = bgUsedChars
    let failed = false

    for (const file of picked) {
      try {
        const dataUrl = await compressImage(file)
        if (chars + dataUrl.length > MAX_BACKGROUND_CHARS) {
          setNotice('存储空间不够了，先删掉一两张再加')
          break
        }
        next.push(dataUrl)
        chars += dataUrl.length
      } catch {
        failed = true
      }
    }
    setBgBusy(false)

    if (next.length === background.images.length) {
      if (failed) setNotice('有图片读取失败，换一张试试')
      return
    }

    const added = next.length - background.images.length
    const ok = update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        background: {
          ...prev.settings.background,
          active: 'image',
          images: next,
          imageIndex: next.length - 1,
        },
      },
    }))

    setNotice(ok ? `已添加 ${added} 张背景图` : '保存失败：浏览器存储空间不足')
  }

  /** 手动指定某一张，就顺手关掉每日随机 —— 「我就要这张」 */
  function selectBackgroundImage(index: number) {
    patchBackground({ active: 'image', imageIndex: index, dailyRandom: false })
  }

  function deleteBackgroundImage() {
    const next = background.images.filter((_, i) => i !== bgSelectedIndex)

    const ok = update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        background: {
          ...prev.settings.background,
          images: next,
          imageIndex: Math.min(bgSelectedIndex, Math.max(0, next.length - 1)),
          // 一张都不剩了就只能回到内置渐变
          active: next.length > 0 ? prev.settings.background.active : 'preset',
        },
      },
    }))

    setNotice(ok ? '已删除这张背景图' : '删除失败，存储空间异常')
  }

  /* ---------------- 自定义语录 ---------------- */

  function handleAddQuote(event: FormEvent) {
    event.preventDefault()
    const text = quoteDraft.trim()
    if (!text) return

    if (settings.customQuotes.includes(text)) {
      setNotice('这条语录已经添加过了')
      return
    }

    patchSettings({ customQuotes: [...settings.customQuotes, text] })
    setQuoteDraft('')
  }

  function removeQuote(text: string) {
    patchSettings({
      customQuotes: settings.customQuotes.filter((quote) => quote !== text),
    })
  }

  /* ---------------- 数据 ---------------- */

  function handleExport() {
    const json = JSON.stringify(data, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))

    const link = document.createElement('a')
    link.href = url
    link.download = `kaoyan-backup-${todayKey()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setNotice('已导出 JSON 备份文件')
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = '' // 允许连续两次选同一个文件
    if (!file) return

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!looksLikeAppData(parsed)) {
        setNotice('导入失败：文件里没有可识别的备份数据')
        return
      }
      setPendingImport(normalizeData(parsed))
    } catch {
      setNotice('导入失败：文件不是合法的 JSON')
    }
  }

  async function handleCopyCard() {
    const text = buildProgressCard(data, todayKey())
    const ok = await copyText(text)

    setCardFallback(ok ? null : text)
    setNotice(ok ? '今日进度卡片已复制到剪贴板' : '复制失败，请长按下面的文字手动复制')
  }

  function handleClearAll() {
    runDestructive(() => {
      setConfirmClear(false)
      setCardFallback(null)
      update(() => createDefaultData())
      setNotice('已清空所有数据')
    })
  }

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/20 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* 右侧滑出面板 */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className={`fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-[360px] flex-col
          gap-5 overflow-y-auto border-l border-line frosted px-5 py-6
          pb-[max(1.5rem,env(safe-area-inset-bottom))]
          transition-transform duration-200 ease-out motion-reduce:transition-none
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-medium text-ink">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-text"
          >
            关闭
          </button>
        </div>

        {/* 账号（只有登录后才显示） */}
        {account !== null && (
          <Section title="账号">
            <div className="card flex flex-col gap-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] text-ink">
                    {account.username ?? '未命名'}
                  </span>
                  <span className="truncate text-[12px] text-muted">
                    {account.email ?? '—'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={account.onLogout}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-card border
                    border-line bg-white px-3 text-[13px] text-danger transition-colors
                    duration-200 active:bg-surface"
                >
                  退出登录
                </button>
              </div>

              {sync !== null && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-[12px] ${
                        sync.status === 'error' ? 'text-danger' : 'text-muted'
                      }`}
                    >
                      {syncLabel(sync)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmPull(true)}
                      disabled={sync.status === 'pulling' || sync.status === 'pushing'}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-card border
                        border-line bg-white px-3 text-[13px] text-ink transition-colors
                        duration-200 active:bg-surface disabled:opacity-40"
                    >
                      从云端覆盖本地
                    </button>
                  </div>
                  {sync.status === 'error' && sync.message !== null && (
                    <p className="text-[12px] text-danger">{sync.message}</p>
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 本地模式：留一个回登录页的入口 */}
        {onRequestLogin !== null && (
          <Section title="账号">
            <div className="card flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-[14px] text-ink">本地模式</span>
                <span className="text-[12px] text-muted">
                  登录后可加好友；云端有数据时会覆盖本机
                </span>
              </div>
              <button
                type="button"
                onClick={onRequestLogin}
                className="inline-flex min-h-11 shrink-0 items-center rounded-card border
                  border-line bg-white px-3 text-[13px] text-ink transition-colors
                  duration-200 active:bg-surface"
              >
                去登录
              </button>
            </div>
          </Section>
        )}

        {/* 好友（只有登录后才显示） */}
        {account !== null && <FriendsSection active={open} />}

        {/* 考试 */}
        <Section title="考试">
          <div className="card flex flex-col gap-4 px-4 py-4">
            <label className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[14px] text-ink">名称</span>
              <input
                value={settings.examName}
                onChange={(event) => patchSettings({ examName: event.target.value })}
                placeholder="2026 考研"
                aria-label="考试名称"
                className="min-h-11 min-w-0 flex-1 rounded-card border border-line
                  bg-white px-2 text-right text-[14px] text-ink outline-none
                  placeholder:text-muted"
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[14px] text-ink">日期</span>
              <input
                type="date"
                value={settings.examDate}
                onChange={(event) => {
                  // 清空时 input 给空字符串，别把已有日期冲掉
                  if (event.target.value) patchSettings({ examDate: event.target.value })
                }}
                aria-label="考试日期"
                className="min-h-11 min-w-0 rounded-card border border-line bg-white
                  px-2 text-[14px] text-ink outline-none"
              />
            </label>
          </div>
        </Section>

        {/* 番茄钟 */}
        <Section title="番茄钟">
          <div className="card flex flex-col gap-4 px-4 py-4">
            <Stepper
              label="专注时长"
              value={settings.focusMinutes}
              min={1}
              max={180}
              step={5}
              onChange={(focusMinutes) => patchSettings({ focusMinutes })}
            />
            <Stepper
              label="休息时长"
              value={settings.breakMinutes}
              min={1}
              max={60}
              step={5}
              onChange={(breakMinutes) => patchSettings({ breakMinutes })}
            />
            <p className="text-[12px] text-muted">点数字可直接输入任意分钟数</p>
          </div>
        </Section>

        {/* 提醒 */}
        <Section title="提醒">
          <div className="card flex flex-col gap-4 px-4 py-4">
            <Toggle
              label="提示音"
              value={settings.soundOn}
              onChange={(soundOn) => patchSettings({ soundOn })}
            />
            <Toggle
              label="震动"
              value={settings.vibrateOn}
              onChange={(vibrateOn) => patchSettings({ vibrateOn })}
            />
          </div>
        </Section>

        {/* 背景设置 */}
        <Section title="背景设置">
          <div className="card flex flex-col gap-4 px-4 py-4">
            {/* 4 套内置低饱和度渐变 */}
            <div className="grid grid-cols-4 gap-2">
              {BACKGROUND_PRESETS.map((preset) => {
                const selected =
                  background.active === 'preset' && background.presetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => patchBackground({ active: 'preset', presetId: preset.id })}
                    aria-label={`使用${preset.name}背景`}
                    aria-pressed={selected}
                    className={`flex min-h-11 flex-col items-center gap-1.5 rounded-card
                      border p-1.5 transition-colors duration-200 ${
                        selected ? 'border-ink' : 'border-line active:bg-surface'
                      }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-9 w-full rounded-[8px] border border-line"
                      style={{ background: preset.background }}
                    />
                    <span className={`text-[11px] ${selected ? 'text-ink' : 'text-muted'}`}>
                      {preset.name}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 卡片不透明度 */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-ink">卡片不透明度</span>
                <span className="text-[12px] text-muted tabular-nums">
                  {opacityValue}%
                </span>
              </div>
              <input
                type="range"
                min={CARD_OPACITY_MIN}
                max={CARD_OPACITY_MAX}
                step={1}
                value={opacityValue}
                onChange={(event) => handleOpacityChange(Number(event.target.value))}
                aria-label="卡片不透明度"
                className="range-slider"
              />
              {opacityValue < 50 ? (
                <p className="text-[12px] text-danger">
                  低于 50% 后，深色照片下的灰色小字会看不清；0% 时卡片完全透明
                </p>
              ) : (
                <p className="text-[12px] text-muted">
                  越低背景越透，模糊会自动跟着补偿
                </p>
              )}
            </div>

            <Toggle
              label="每日随机"
              value={background.dailyRandom}
              onChange={(dailyRandom) => {
                if (dailyRandom && background.images.length === 0) {
                  setNotice('先上传至少一张图片，才能开每日随机')
                  return
                }
                patchBackground(
                  dailyRandom ? { dailyRandom, active: 'image' } : { dailyRandom },
                )
              }}
            />

            {background.dailyRandom && bgToday.image && (
              <p className="text-[12px] text-muted">
                今天用的是第 {bgToday.image.index + 1} 张，明天零点自动换
              </p>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-ink">我的图片</span>
                <span className="text-[12px] text-muted">
                  {background.images.length}/{MAX_BACKGROUND_IMAGES} 张 ·{' '}
                  {(bgUsedChars / 1_000_000).toFixed(1)}MB
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {background.images.map((image, index) => {
                  const selected = bgToday.image?.index === index
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectBackgroundImage(index)}
                      aria-label={`使用第 ${index + 1} 张背景图`}
                      aria-pressed={selected}
                      className={`h-16 min-h-11 rounded-card border bg-cover bg-center
                        transition-colors duration-200 ${
                          selected ? 'border-ink' : 'border-line'
                        }`}
                      style={{ backgroundImage: `url("${image}")` }}
                    />
                  )
                })}

                {!bgFull && (
                  <button
                    type="button"
                    disabled={bgBusy}
                    onClick={() => bgFileRef.current?.click()}
                    aria-label="上传背景图片"
                    className="grid h-16 min-h-11 place-items-center rounded-card border
                      border-dashed border-line text-muted transition-colors duration-200
                      active:text-ink disabled:opacity-40"
                  >
                    {bgBusy ? (
                      <span className="text-[11px]">处理中</span>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        className="size-5"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                  </button>
                )}
              </div>

              {background.images.length > 0 && (
                <button
                  type="button"
                  onClick={deleteBackgroundImage}
                  className="inline-flex min-h-11 items-center text-[13px] text-danger
                    transition-opacity duration-200 active:opacity-70"
                >
                  删除第 {bgSelectedIndex + 1} 张
                </button>
              )}

              <p className="text-[12px] leading-relaxed text-muted">
                图片会先压到最长边 1920px、质量 0.7 再存进浏览器；最多{' '}
                {MAX_BACKGROUND_IMAGES} 张，合计不超过约 2MB。
              </p>

              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleBackgroundFiles}
                className="hidden"
              />
            </div>
          </div>
        </Section>

        {/* 自定义语录 */}
        <Section title={`自定义语录（${settings.customQuotes.length} 条）`}>
          <div className="card flex flex-col gap-3 px-4 py-4">
            {settings.customQuotes.length > 0 && (
              <ul className="flex flex-col gap-2">
                {settings.customQuotes.map((quote) => (
                  <li key={quote} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink break-words">
                      {quote}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeQuote(quote)}
                      aria-label={`删除语录：${quote}`}
                      className="-mr-1 grid size-11 shrink-0 place-items-center rounded-card
                        text-muted transition-colors duration-200 active:text-ink"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        className="size-3.5"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddQuote} className="flex items-center gap-2">
              <input
                value={quoteDraft}
                onChange={(event) => setQuoteDraft(event.target.value)}
                placeholder="添加一条语录，回车确认"
                aria-label="新增自定义语录"
                className="min-w-0 flex-1 rounded-card border border-line bg-white px-3 min-h-11 text-[14px] text-ink outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={!quoteDraft.trim()}
                aria-label="添加语录"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-ink
                  text-white transition-opacity duration-200 disabled:opacity-20"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </form>
          </div>
        </Section>

        {/* 数据 */}
        <Section title="数据">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={handleExport} className={TEXT_BUTTON}>
                导出 JSON
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={TEXT_BUTTON}
              >
                导入 JSON
              </button>
            </div>

            <button type="button" onClick={handleCopyCard} className={TEXT_BUTTON}>
              生成今日进度卡片
            </button>

            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex min-h-11 items-center rounded-card border border-line bg-white px-3 text-[13px] text-danger transition-colors duration-200 active:bg-surface"
            >
              清空所有数据
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />

            {notice && <p className="text-[12px] text-muted">{notice}</p>}

            {cardFallback && (
              <textarea
                readOnly
                value={cardFallback}
                rows={9}
                aria-label="今日进度卡片文字"
                className="w-full rounded-card border border-line bg-surface p-3
                  text-[12px] leading-relaxed text-ink"
              />
            )}
          </div>
        </Section>
      </aside>

      {sync !== null && confirmPull && (
        <ConfirmDialog
          title="用云端覆盖本地？"
          description="本机的任务、签到记录、设置和徽章会被云端数据整个替换掉。如果本机有还没上传成功的改动，会丢失。"
          confirmText="覆盖本地"
          onCancel={() => setConfirmPull(false)}
          onConfirm={() => {
            setConfirmPull(false)
            sync.onPull()
          }}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="清空所有数据？"
          description="所有任务、学习时长、签到记录、徽章和设置都会被删除，且无法撤销。建议先导出 JSON 备份。"
          confirmText="确认清空"
          onCancel={() => setConfirmClear(false)}
          onConfirm={handleClearAll}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="导入并覆盖？"
          description="导入会替换掉当前的全部数据，且无法撤销。建议先导出当前数据做备份。"
          confirmText="覆盖导入"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            runDestructive(() => {
              const next = pendingImport
              setPendingImport(null)
              setCardFallback(null)
              update(() => next)
              setNotice('已导入备份数据')
            })
          }}
        />
      )}
    </>
  )
}
