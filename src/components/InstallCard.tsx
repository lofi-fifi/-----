import { useEffect, useState, type ReactNode } from 'react'

import {
  detectPlatform,
  isStandalone,
  onInstallAvailability,
  promptInstall,
  readInstallDismissed,
  writeInstallDismissed,
  type Platform,
} from '../utils/install'

type Props = {
  /** banner = 首页那张可关闭的提示卡；plain = 设置里的常驻说明 */
  variant?: 'banner' | 'plain'
}

/** iOS 的「分享」图标：方框加一支向上的箭头 */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block size-[15px] align-[-2px] text-ink"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

type Guide = {
  steps: ReactNode[]
  /** 补一句前提条件 */
  note: string
}

function guideFor(platform: Platform): Guide {
  if (platform === 'ios') {
    return {
      steps: [
        <>
          点底部的 <ShareIcon /> <b className="font-medium text-ink">分享</b> 按钮
        </>,
        <>往下滑，选「添加到主屏幕」</>,
        <>点右上角「添加」</>,
      ],
      note: 'iOS 上必须用 Safari，其他浏览器加不了',
    }
  }

  if (platform === 'android') {
    return {
      steps: [<>点右上角的「⋮」</>, <>选「安装应用」或「添加到主屏幕」</>, <>确认</>],
      note: '用 Chrome 打开才有这个选项',
    }
  }

  return {
    steps: [<>看地址栏右边有没有一个「安装」图标</>, <>点它，然后确认</>],
    note: 'Chrome / Edge 都支持',
  }
}

/**
 * 「装到桌面」引导。
 *
 * 三种情况分开处理：
 *   Android Chrome 并且抓到了 beforeinstallprompt → 直接给一个按钮调原生安装框
 *   iOS                                          → 只能手动，写清楚点哪里
 *   其他                                          → 提示地址栏那个安装图标
 *
 * 装完之后（isStandalone）整个组件自动消失，不用用户手动关。
 */
export default function InstallCard({ variant = 'plain' }: Props) {
  // 首帧不渲染，等 useEffect 里探测完再决定 —— 否则服务端渲染和客户端首帧会对不上
  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState<Platform>('other')
  const [installed, setInstalled] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)

  useEffect(() => {
    setPlatform(detectPlatform())
    setInstalled(isStandalone())
    setDismissed(readInstallDismissed())
    setReady(true)

    const unsubscribe = onInstallAvailability(setCanPrompt)
    // 已经装上了就把引导永久收起来
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      unsubscribe()
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!ready || installed) return null
  // 首页那张卡被手动关掉之后就不再出现；设置里那份说明永远在
  if (variant === 'banner' && dismissed) return null

  const guide = guideFor(platform)

  async function handleInstall() {
    setBusy(true)
    try {
      const result = await promptInstall()
      if (result === 'accepted') {
        setInstalled(true)
      } else if (result === 'unavailable') {
        setOutcome('系统没给出安装框，按下面的步骤手动添加吧')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {variant === 'banner' && (
            <h2 className="text-[14px] font-medium text-ink">装到桌面，用起来像 App</h2>
          )}
          <p className="text-[12px] text-muted">全屏、离线可用、有自己的图标</p>
        </div>

        {variant === 'banner' && (
          <button
            type="button"
            onClick={() => {
              writeInstallDismissed(true)
              setDismissed(true)
            }}
            className="btn-text shrink-0"
          >
            不再提示
          </button>
        )}
      </div>

      {canPrompt ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={busy}
          className="btn-primary self-start disabled:opacity-40"
        >
          {busy ? '处理中…' : '安装应用'}
        </button>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {guide.steps.map((step, index) => (
            <li key={index} className="flex gap-2 text-[13px] text-muted">
              <span className="shrink-0 tabular-nums text-ink">{index + 1}.</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-[12px] text-muted">
        {outcome ?? (canPrompt ? '装完桌面会多一个「考」的图标' : guide.note)}
      </p>
    </div>
  )
}
