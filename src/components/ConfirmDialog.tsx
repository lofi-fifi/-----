import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type ConfirmDialogProps = {
  title: string
  description?: string
  confirmText: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 破坏性操作的二次确认弹窗。
 *
 * 用 portal 挂到 document.body —— 设置面板本身带 transform，
 * 而 transform 会让 position:fixed 的后代改成相对它定位，直接渲染会跑偏。
 */
export default function ConfirmDialog({
  title,
  description,
  confirmText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-60 flex items-center justify-center px-5"
    >
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/20"
      />

      <div className="relative w-full max-w-[320px] rounded-card border border-line bg-white p-5">
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="btn-danger">
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
