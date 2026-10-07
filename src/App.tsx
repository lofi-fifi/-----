import { useEffect, useState } from 'react'

import { useAppData } from './hooks/useAppData'
import { syncFeedbackSettings } from './utils/feedback'
import CheckinSection from './components/CheckinSection'
import Countdown from './components/Countdown'
import FloatingButton from './components/FloatingButton'
import PomodoroPanel from './components/PomodoroPanel'
import QuoteCard from './components/QuoteCard'
import SettingsPanel from './components/SettingsPanel'
import TaskList from './components/TaskList'

/**
 * 单页应用外壳 —— 按 SPEC「页面结构」从上到下排布：
 *   1 顶部倒计时（右上角齿轮 → 设置面板）
 *   2 鸡汤卡片
 *   3 签到区
 *   4 今日任务列表
 *   5 右下角悬浮按钮 → 番茄钟面板（底部滑出）
 *   6 设置面板（右侧滑出）
 *
 * 全部数据来自 useAppData，任何改动都会立即写回 localStorage。
 */
export default function App() {
  const { data, update } = useAppData()
  const [pomodoroOpen, setPomodoroOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 把「提示音 / 震动」开关同步给 utils/feedback，调用方就不用各自判断了
  useEffect(() => {
    syncFeedbackSettings(data.settings)
  }, [data.settings.soundOn, data.settings.vibrateOn])

  return (
    <div className="min-h-dvh bg-white">
      <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-5 pt-8 pb-32">
        {/* 1. 顶部：倒计时 + 右上角齿轮 */}
        <header className="flex items-start justify-between gap-3">
          <Countdown data={data} />

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="打开设置"
            className="grid size-11 shrink-0 place-items-center rounded-card border
              border-line text-muted transition-colors duration-200 hover:text-ink
              active:text-ink"
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

      {/* 5. 右下角悬浮按钮 + 番茄钟面板 */}
      <FloatingButton onClick={() => setPomodoroOpen(true)} />
      <PomodoroPanel
        open={pomodoroOpen}
        onClose={() => setPomodoroOpen(false)}
        data={data}
        update={update}
      />

      {/* 6. 设置面板 */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        data={data}
        update={update}
      />
    </div>
  )
}
