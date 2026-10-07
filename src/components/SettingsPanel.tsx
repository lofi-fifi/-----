import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import { todayKey } from '../lib/date'
import { buildProgressCard } from '../lib/progressCard'
import { clampValue, stepValue } from '../lib/stepper'
import {
  createDefaultData,
  looksLikeAppData,
  normalizeData,
  type AppData,
  type Settings,
} from '../lib/storage'
import { copyText } from '../utils/clipboard'
import ConfirmDialog from './ConfirmDialog'

type SettingsPanelProps = {
  open: boolean
  onClose: () => void
  data: AppData
  update: (updater: (prev: AppData) => AppData) => void
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
}: SettingsPanelProps) {
  const { settings } = data

  const [quoteDraft, setQuoteDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  /** 已经解析好、等着二次确认的导入数据 */
  const [pendingImport, setPendingImport] = useState<AppData | null>(null)
  /** 复制失败时把卡片文字摆出来，供手动长按复制 */
  const [cardFallback, setCardFallback] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const lastDestructiveAt = useRef(0)

  // 提示条自动消失
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

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
          gap-5 overflow-y-auto border-l border-line bg-white px-5 py-6
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
