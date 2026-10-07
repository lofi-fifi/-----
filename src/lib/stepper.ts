/**
 * 加减步进器的取值逻辑。
 *
 * 坑：min 不一定是 step 的整数倍（这里 min=1、step=5）。
 * 如果简单地 value ± step，从 1 往上会走出 1 → 6 → 11 → 16 这种莫名其妙的序列。
 * 所以统一「往 step 的下一个倍数上靠」：
 *   1 → 5 → 10 → 15 …
 * 反过来 5 → 1（再往下就低于 min 了），10 → 5，47 → 45。
 */

type Bounds = {
  min: number
  max: number
  step: number
}

export function stepValue(value: number, direction: 1 | -1, { min, max, step }: Bounds): number {
  const size = Math.max(1, Math.round(step))
  const raw =
    direction > 0
      ? Math.ceil((value + 1) / size) * size
      : Math.floor((value - 1) / size) * size

  return Math.min(max, Math.max(min, raw))
}

/** 手动输入的值：四舍五入到整数并夹在上下限之间 */
export function clampValue(value: number, min: number, max: number): number {
  // 兜底：别让 NaN / Infinity 渗进 localStorage
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
