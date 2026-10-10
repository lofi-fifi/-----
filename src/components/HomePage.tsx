import type { AppData } from '../lib/storage'
import CheckinSection from './CheckinSection'
import Countdown from './Countdown'
import QuoteCard from './QuoteCard'
import TaskList from './TaskList'

type HomePageProps = {
  data: AppData
  update: (updater: (prev: AppData) => AppData) => boolean
  onOpenSettings: () => void
}

/**
 * 主页 —— 倒计时、鸡汤、签到、今日任务。
 *
 * 从 App 里抽出来，一是让 App 只负责「壳」的组装（登录门禁 / Tab / 浮层），
 * 二是主页和日记页现在是并列的两屏，各自一个组件更清楚。
 *
 * 风格约束：白底黑字、冷淡边框、大量留白。
 * 不加暖色、不加渐变卡片、不加圆润装饰图标 —— 这里也不该出现任何「亲切感」。
 */
export default function HomePage({ data, update, onOpenSettings }: HomePageProps) {
  return (
    <main className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col gap-6 px-5 pt-8 pb-40">
      {/* 1. 顶部：倒计时 + 右上角齿轮 */}
      <header className="card flex items-start justify-between gap-3 px-5 py-4">
        <Countdown data={data} />

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="打开设置"
          className="grid size-11 shrink-0 place-items-center rounded-card border
            border-line bg-panel text-muted transition-colors duration-200
            hover:text-ink active:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[18px]"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </header>

      {/* 2. 鸡汤卡片 */}
      <QuoteCard data={data} />

      {/* 3. 签到区 */}
      <CheckinSection data={data} update={update} />

      {/* 4. 今日任务列表 */}
      <TaskList data={data} update={update} />
    </main>
  )
}
