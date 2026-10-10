export type Tab = 'home' | 'diary'

type TabBarProps = {
  active: Tab
  onChange: (tab: Tab) => void
}

/** 主页：一个最简的方框房子，细线，不带任何填充或圆角装饰 */
function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[21px]"
      aria-hidden="true"
    >
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.6V20h13V9.6" />
    </svg>
  )
}

/** 日记：一本合上的本子加两道横线 */
function DiaryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[21px]"
      aria-hidden="true"
    >
      <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11z" />
      <path d="M6.5 3.5v17" />
      <path d="M10.5 9h5" />
      <path d="M10.5 13h5" />
    </svg>
  )
}

/**
 * 底部 Tab 栏 —— 只有两个页面，所以不引路由库，App 里一个 useState 就够。
 *
 * 视觉上刻意做得最轻：无阴影、无圆角装饰、只有一条上边框和毛玻璃底，
 * 和主页的卡片是同一套语言。
 */
export default function TabBar({ active, onChange }: TabBarProps) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: '主页', icon: <HomeIcon /> },
    { id: 'diary', label: '日记', icon: <DiaryIcon /> },
  ]

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line frosted"
    >
      <div className="mx-auto flex w-full max-w-[480px] pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1
                transition-colors duration-200 ${
                  selected ? 'text-ink' : 'text-muted active:text-ink'
                }`}
            >
              {tab.icon}
              <span className="text-[11px] leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
