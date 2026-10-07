/**
 * 轻量撤销提示：删除任务后从底部浮出一条，3 秒后自动消失。
 *
 * 位置固定在悬浮按钮上方（pb-[6.5rem] 让开右下角的番茄钟按钮），
 * 容器 pointer-events-none，只有提示条本身接收点击，不会挡住后面其它元素。
 *
 * 层级 z-45：压在悬浮按钮(z-30)、任务菜单遮罩(z-40)之上，
 * 但低于任务菜单(z-50)和补录时长弹窗(z-60)，不会被提示条抢焦点。
 */
type UndoToastProps = {
  message: string
  onUndo: () => void
}

export default function UndoToast({ message, onUndo }: UndoToastProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-45">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-[6.5rem]">
        <div
          role="status"
          className="toast-in pointer-events-auto flex items-center justify-between
            gap-4 rounded-card bg-ink px-4 py-3"
        >
          <span className="min-w-0 truncate text-[13px] text-white">
            {message}
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-11 shrink-0 items-center px-1 text-[13px]
              font-medium text-white underline underline-offset-4"
          >
            撤销
          </button>
        </div>
      </div>
    </div>
  )
}
