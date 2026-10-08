type FloatingButtonProps = {
  onClick: () => void
}

/**
 * 右下角悬浮按钮 —— 打开番茄钟面板。
 * 用一层固定定位的容器把按钮约束在正文栏（max-w-[480px]）右侧，桌面端不会跑到屏幕最右边。
 */
export default function FloatingButton({ onClick }: FloatingButtonProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto flex w-full max-w-[480px] justify-end px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClick}
          aria-label="打开番茄钟"
          className="pointer-events-auto grid size-14 place-items-center rounded-full
            bg-ink text-on-ink transition-transform duration-200 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 1.8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
