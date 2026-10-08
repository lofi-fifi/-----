import { useEffect, useState } from 'react'

import { useAppData } from './hooks/useAppData'
import { useAuth } from './hooks/useAuth'
import { useSync } from './hooks/useSync'
import { useTodayKey } from './hooks/useTodayKey'
import { resolveBackground } from './lib/background'
import { applyCardAppearance } from './utils/appearance'
import { syncFeedbackSettings } from './utils/feedback'
import AuthScreen from './components/AuthScreen'
import CheckinSection from './components/CheckinSection'
import Countdown from './components/Countdown'
import FloatingButton from './components/FloatingButton'
import PomodoroPanel from './components/PomodoroPanel'
import QuoteCard from './components/QuoteCard'
import SettingsPanel from './components/SettingsPanel'
import TaskList from './components/TaskList'

/** 读本地会话时的一瞬间，避免闪一下登录页又跳回来 */
function Splash() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center">
      <p className="text-[13px] text-muted">正在恢复登录状态…</p>
    </div>
  )
}

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
 *
 * 外面套了一层登录门禁：只有 Supabase 配好了、且用户没登录、也没选「只用本地」
 * 的时候才拦。.env.local 没配就完全跳过登录，退化成纯本地版。
 */
export default function App() {
  const { data, update } = useAppData()
  const auth = useAuth()
  // 跨零点会自动更新，每日随机背景和倒计时都靠它翻篇
  const today = useTodayKey()
  const [pomodoroOpen, setPomodoroOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 云端同步。未登录时 userId 为 null，hook 自己会停摆
  const sync = useSync({
    userId: auth.status === 'signedIn' ? auth.userId : null,
    data,
    replace: (next) => update(() => next),
  })

  // 把「提示音 / 震动」开关同步给 utils/feedback，调用方就不用各自判断了
  useEffect(() => {
    syncFeedbackSettings(data.settings)
  }, [data.settings.soundOn, data.settings.vibrateOn])

  // 卡片不透明度写进 :root 的 CSS 变量，.card / .frosted 都读它
  useEffect(() => {
    applyCardAppearance(data.settings.background.cardOpacity)
  }, [data.settings.background.cardOpacity])

  const background = resolveBackground(data.settings.background, today)

  return (
    <div className="relative min-h-dvh">
      {/* 背景层：内置渐变打底，有自定义图时再盖一张上去 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: background.presetBackground }}
      >
        {background.image && (
          <img
            src={background.image.dataUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </div>

      {auth.status === 'loading' ? (
        <Splash />
      ) : auth.status === 'signedOut' ? (
        <AuthScreen onSkip={auth.skipLogin} />
      ) : (
        <>
          <main className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col gap-6 px-5 pt-8 pb-32">
            {/* 1. 顶部：倒计时 + 右上角齿轮 */}
            <header className="card flex items-start justify-between gap-3 px-5 py-4">
              <Countdown data={data} />

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="打开设置"
                className="grid size-11 shrink-0 place-items-center rounded-card border
                  border-line bg-white text-muted transition-colors duration-200
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
            account={
              auth.status === 'signedIn'
                ? {
                    username: auth.username,
                    email: auth.email,
                    onLogout: () => {
                      void auth.logout()
                    },
                  }
                : null
            }
            sync={
              auth.status === 'signedIn'
                ? {
                    status: sync.status,
                    message: sync.message,
                    pending: sync.pending,
                    lastSyncedAt: sync.lastSyncedAt,
                    onPull: () => {
                      void sync.pullNow()
                    },
                  }
                : null
            }
          />
        </>
      )}
    </div>
  )
}
