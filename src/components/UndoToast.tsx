import Portal from './Portal'

/**
 * 轻量撤销提示：删除任务后从底部浮出一条，3 秒后自动消失。
 *
 * 位置固定在悬浮按钮上方（pb-[6.5rem] 让开右下角的番茄钟按钮），
 * 容器 pointer-events-none，只有提示条本身接收点击，不会挡住后面其它元素。
 *
 * 走 Portal 渲染到 body —— 否则会被 `<main>` 的层叠上下文锁在 z-10，
 * 被底部 Tab 栏整个盖住（详见 Portal.tsx 里的说明）。
 */
type UndoToastProps = {
  message: string
  onUndo: () => void
}

export default function UndoToast({ message, onUndo }: UndoToastProps) {
  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-45">
        <div className="mx-auto w-full max-w-[480px] px-5 pb-[6.5rem]">
          <div
            role="status"
            className="toast-in pointer-events-auto flex items-center justify-between
              gap-4 rounded-card bg-ink px-4 py-3"
          >
            <span className="min-w-0 truncate text-[13px] text-on-ink">
              {message}
            </span>
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex min-h-11 shrink-0 items-center px-1 text-[13px]
                font-medium text-on-ink underline underline-offset-4"
            >
              撤销
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
