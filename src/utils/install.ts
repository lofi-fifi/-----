/**
 * PWA 安装相关的浏览器 API 封装。
 * 不碰 React —— 因为 beforeinstallprompt 可能在 React 挂载之前就触发，
 * 必须在 main.tsx 里尽早注册监听。
 */

/**
 * Chrome / Edge 的安装事件。不是标准 API，TS 里没有类型，自己声明。
 */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

let deferred: InstallPromptEvent | null = null
const listeners = new Set<(available: boolean) => void>()

function notify(): void {
  const available = deferred !== null
  for (const fn of listeners) fn(available)
}

/**
 * 尽早调用。`beforeinstallprompt` 可能在 React 挂载之前就触发，
 * 晚一步注册监听就永远抓不到那个事件，安装按钮也就永远不出现。
 *
 * 重复调用是安全的（用 window 上的标记挡住）。
 */
export function watchInstallPrompt(): void {
  if (typeof window === 'undefined') return

  const flag = window as Window & { __kaoyanInstallWatched?: boolean }
  if (flag.__kaoyanInstallWatched) return
  flag.__kaoyanInstallWatched = true

  window.addEventListener('beforeinstallprompt', (event) => {
    // 不 preventDefault 的话 Chrome 会自己弹一条迷你提示，和自己的引导打架
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** 订阅「能不能调起原生安装框」。订阅时会立刻回调一次当前状态。 */
export function onInstallAvailability(fn: (available: boolean) => void): () => void {
  listeners.add(fn)
  fn(deferred !== null)
  return () => {
    listeners.delete(fn)
  }
}

/** 是不是已经装过了（以独立窗口模式打开） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false

  if (window.matchMedia?.('(display-mode: standalone)').matches) return true

  // iOS Safari 不支持 display-mode 媒体查询的老版本走这条路
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export type Platform = 'ios' | 'android' | 'desktop' | 'other'

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent

  // iPadOS 13+ 的 UA 伪装成 Macintosh，只能靠「有没有触摸」区分
  const iPadLike =
    /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document

  if (/iPad|iPhone|iPod/.test(ua) || iPadLike) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop'
  return 'other'
}

/** 调起系统原生的安装确认框 */
export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferred) return 'unavailable'

  const event = deferred
  // 一个事件只能用一次，用掉就作废
  deferred = null
  notify()

  await event.prompt()
  const choice = await event.userChoice
  return choice.outcome
}

/**
 * 「不再提示」的标记。
 * 装了之后引导会自动消失（isStandalone 为真），这个标记只管手动关掉的情况。
 */
const DISMISS_KEY = 'kaoyan-install-dismissed'

export function readInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeInstallDismissed(value: boolean): void {
  try {
    if (value) localStorage.setItem(DISMISS_KEY, '1')
    else localStorage.removeItem(DISMISS_KEY)
  } catch {
    // 无痕模式写不了，忽略
  }
}
