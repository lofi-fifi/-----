import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { formatDuration } from '../lib/time'

type DurationDialogProps = {
  taskText: string
  currentSeconds: number
  onCancel: () => void
  /** 返回要**累加**的分钟数 */
  onConfirm: (minutes: number) => void
}

const MAX_MINUTES = 24 * 60

/** 手动补录时长弹窗：输入分钟数，累加到任务已有的累计时长上 */
export default function DurationDialog({
  taskText,
  currentSeconds,
  onCancel,
  onConfirm,
}: DurationDialogProps) {
  const [minutes, setMinutes] = useState('')

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  // 弹窗打开期间锁住背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const parsed = Number.parseInt(minutes, 10)
  const valid = Number.isFinite(parsed) && parsed > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    onConfirm(Math.min(parsed, MAX_MINUTES))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="补录时长"
      className="fixed inset-0 z-60 flex items-center justify-center px-5"
    >
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-scrim"
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-[320px] rounded-card border border-line frosted p-5"
      >
        <h3 className="text-[15px] font-medium text-ink">补录时长</h3>
        <p className="mt-1 truncate text-[13px] text-muted">{taskText}</p>
        <p className="mt-3 text-[13px] text-muted">
          当前 {formatDuration(currentSeconds)}
        </p>

        <div className="mt-3 flex min-h-11 items-center gap-2 rounded-card border border-line px-3">
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MINUTES}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            placeholder="30"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink
              outline-none placeholder:text-muted"
          />
          <span className="shrink-0 text-[13px] text-muted">分钟</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            取消
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="btn-primary disabled:opacity-20"
          >
            增加
          </button>
        </div>
      </form>
    </div>
  )
}
