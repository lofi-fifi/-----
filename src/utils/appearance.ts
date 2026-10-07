import { blurForAlpha } from '../lib/background'
import { CARD_OPACITY_MAX, CARD_OPACITY_MIN } from '../lib/storage'

/**
 * 把「卡片不透明度」写到根元素的 CSS 变量上。
 *
 * .card / .frosted 都读 --card-alpha 和 --card-blur，所以改一次全站生效。
 * 拖动滑块时这里会被高频调用（直接改 CSS 变量，不走 React 渲染），
 * 松手才真正写 localStorage —— 背景图动辄上百万字符，每帧都写会卡死。
 */
export function applyCardAppearance(alphaPercent: number): void {
  if (typeof document === 'undefined') return

  const clamped = Math.min(
    CARD_OPACITY_MAX,
    Math.max(CARD_OPACITY_MIN, Math.round(alphaPercent)),
  )

  const root = document.documentElement.style
  root.setProperty('--card-alpha', String(clamped / 100))
  root.setProperty('--card-blur', `${blurForAlpha(clamped)}px`)
}
