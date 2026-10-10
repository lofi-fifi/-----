import { useEffect, useState } from 'react'

import { useAppData } from './hooks/useAppData'
import { useAuth } from './hooks/useAuth'
import { useSync } from './hooks/useSync'
import { useTheme } from './hooks/useTheme'
import { useTodayKey } from './hooks/useTodayKey'
import { resolveBackground } from './lib/background'
import { applyCardAppearance } from './utils/appearance'
import { syncFeedbackSettings } from './utils/feedback'
import AuthScreen from './components/AuthScreen'
import DiaryPage from './components/DiaryPage'
import FloatingButton from './components/FloatingButton'
import HomePage from './components/HomePage'
import PomodoroPanel from './components/PomodoroPanel'
import SettingsPanel from './components/SettingsPanel'
import TabBar, { type Tab } from './components/TabBar'

/** 读本地会话时的一瞬间，避免闪一下登录页又跳回来 */
function Splash() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center">
      <p className="text-[13px] text-muted">正在恢复登录状态…</p>
    </div>
  )
}

/**
 * 应用外壳 —— 只负责「组装」：
 *   登录门禁 → 页面切换（主页 / 日记）→ 浮层（番茄钟、设置）→ 底部 Tab
 *
 * 两个页面各自是独立组件，用 useState 切换，不引路由库。
 * 全部数据来自 useAppData，任何改动都会立即写回 localStorage。
 *
 * 外面那层登录门禁只在「配好了 Supabase、且用户没登录、也没选只用本地」时才拦。
 * .env.local 没配就完全跳过登录，退化成纯本地版。
 */
export default function App() {
  const { data, update } = useAppData()
  const auth = useAuth()
  // 跨零点会自动更新，每日随机背景和倒计时都靠它翻篇
  const today = useTodayKey()
  const [pomodoroOpen, setPomodoroOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 页面切换。只有两个页面，一个 useState 就够，不引路由库
  const [tab, setTab] = useState<Tab>('home')

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

  // 深浅色：把 data-theme 写到 <html>，并返回实际生效的那一档（跟随系统会被解析掉）
  const theme = useTheme(data.settings.theme)

  const background = resolveBackground(data.settings.background, today, theme)

  return (
    <div className="relative min-h-dvh">
      {/* 背景层：内置渐变打底（已按主题选好深浅版本），有自定义图时再盖一张上去 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: background.presetBackground }}
      >
        {background.image && (
          <>
            <img
              src={background.image.dataUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            {/* 深色模式下把照片压暗，否则深色卡片浮在明亮照片上会糊成一片 */}
            {background.imageDim > 0 && (
              <div
                className="absolute inset-0"
                style={{ background: `rgb(0 0 0 / ${background.imageDim})` }}
              />
            )}
          </>
        )}
      </div>

      {auth.status === 'loading' ? (
        <Splash />
      ) : auth.status === 'signedOut' ? (
        <AuthScreen onSkip={auth.skipLogin} />
      ) : (
        <>
          {tab === 'home' ? (
            <HomePage data={data} update={update} onOpenSettings={() => setSettingsOpen(true)} />
          ) : (
            <DiaryPage data={data} update={update} today={today} />
          )}

          {/* 番茄钟按钮只在主页出现 —— 日记页要保持安静 */}
          {tab === 'home' && <FloatingButton onClick={() => setPomodoroOpen(true)} />}

          <PomodoroPanel
            open={pomodoroOpen}
            onClose={() => setPomodoroOpen(false)}
            data={data}
            update={update}
          />

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
            onRequestLogin={
              auth.status === 'localOnly'
                ? () => {
                    auth.cancelSkip()
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

          <TabBar active={tab} onChange={setTab} />
        </>
      )}
    </div>
  )
}
