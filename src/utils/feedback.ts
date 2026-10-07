/**
 * 提示音与震动的统一出口。
 *
 * 提示音全部用 Web Audio API 现场合成，不引入任何音频文件。
 * 两个函数都受设置面板里的「提示音 / 震动」开关控制 ——
 * 开关由 App 通过 syncFeedbackSettings 同步进来，调用方不用自己判断。
 */

type AudioContextCtor = typeof AudioContext

let soundEnabled = true
let vibrateEnabled = true

/** 整个应用共用一个 AudioContext，避免反复创建 */
let sharedContext: AudioContext | null = null

/** App 在设置变化时调用，把开关状态同步进来 */
export function syncFeedbackSettings(settings: {
  soundOn: boolean
  vibrateOn: boolean
}): void {
  soundEnabled = settings.soundOn
  vibrateEnabled = settings.vibrateOn
}

function getContext(): AudioContext | null {
  if (sharedContext) return sharedContext
  if (typeof window === 'undefined') return null

  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null

  try {
    sharedContext = new Ctor()
  } catch {
    return null
  }
  return sharedContext
}

/**
 * 浏览器要求音频必须由用户手势启动。
 * 在「开始」「签到」这类点击里先调一次，把 AudioContext 建起来并解除挂起，
 * 否则到点响铃会被浏览器静默拦掉。
 */
export function unlockAudio(): void {
  const ctx = getContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

/**
 * 提示音：两声上扬的「叮」（A5 880Hz → D6 1174.66Hz）。
 * 用指数包络收尾，避免爆音。关掉提示音开关时直接返回。
 */
export function playDing(): void {
  if (!soundEnabled) return

  const ctx = getContext()
  if (!ctx) return

  if (ctx.state === 'suspended') void ctx.resume()

  const start = ctx.currentTime + 0.02
  const notes = [
    { freq: 880, at: start },
    { freq: 1174.66, at: start + 0.18 },
  ]

  for (const { freq, at } of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, at)

    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.5)
  }
}

/**
 * 震动。关掉开关、或者浏览器不支持 navigator.vibrate（iOS Safari 就是），
 * 都静默跳过 —— 整个函数包在 try-catch 里，不会因为震动把主流程搞崩。
 */
export function vibrate(pattern: number[] = [200]): void {
  if (!vibrateEnabled) return
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return

  try {
    navigator.vibrate(pattern)
  } catch {
    // iOS 等环境可能直接抛错，忽略即可
  }
}
