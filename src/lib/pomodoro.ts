/**
 * 番茄钟状态机 —— 纯函数，不碰 DOM、不碰计时器。
 *
 * 计时器的「多久 tick 一次」「截止时间戳」这些副作用留在 usePomodoro 里，
 * 这里只负责「收到事件后状态应该变成什么、要不要记账、要不要响铃」。
 *
 * 相位（phase）：focus 专注 → break 休息 → focus …
 * 状态（status）：idle 待开始 / running 进行中 / paused 已暂停
 */

export type PomodoroPhase = 'focus' | 'break'
export type PomodoroStatus = 'idle' | 'running' | 'paused'

export type PomodoroDurations = {
  focusMinutes: number
  breakMinutes: number
}

export type PomodoroState = {
  phase: PomodoroPhase
  status: PomodoroStatus
  /** 当前这一段还剩多少秒 */
  remaining: number
  /** 当前这一段的总秒数。开始时从设置里快照，跑到一半改设置不影响这一段 */
  sessionTotal: number
}

export type PomodoroAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset' }
  /** 外部计时器算好剩余秒数喂进来；带上 phase 是为了丢弃上一段的迟到 tick */
  | { type: 'tick'; phase: PomodoroPhase; remaining: number }
  /** 设置里的时长变了，空闲时把倒计时重新对齐（具体数值取 reducePomodoro 的 durations 参数） */
  | { type: 'durations' }

export type ReduceResult = {
  state: PomodoroState
  /** 需要累加给所选任务的专注秒数，0 表示不用记账 */
  loggedFocusSeconds: number
  /** 是否需要响铃 + 震动 */
  alert: boolean
}

const MINUTE = 60

/** 某个相位的完整秒数 */
export function phaseSeconds(
  phase: PomodoroPhase,
  durations: PomodoroDurations,
): number {
  const minutes = phase === 'focus' ? durations.focusMinutes : durations.breakMinutes
  return Math.max(1, Math.round(minutes)) * MINUTE
}

export function createInitialState(durations: PomodoroDurations): PomodoroState {
  const total = phaseSeconds('focus', durations)
  return { phase: 'focus', status: 'idle', remaining: total, sessionTotal: total }
}

/**
 * 这一段已经专注过去的秒数。
 * 不在专注阶段（休息中 / 还没开始）一律算 0 —— 休息时间不是学习时间。
 */
export function elapsedFocus(state: PomodoroState): number {
  if (state.phase !== 'focus' || state.status === 'idle') return 0
  return Math.max(0, state.sessionTotal - state.remaining)
}

function idleFocusState(durations: PomodoroDurations): PomodoroState {
  const total = phaseSeconds('focus', durations)
  return { phase: 'focus', status: 'idle', remaining: total, sessionTotal: total }
}

function unchanged(state: PomodoroState): ReduceResult {
  return { state, loggedFocusSeconds: 0, alert: false }
}

export function reducePomodoro(
  state: PomodoroState,
  action: PomodoroAction,
  durations: PomodoroDurations,
): ReduceResult {
  switch (action.type) {
    /* 开始 / 继续 */
    case 'start': {
      if (state.status === 'running') return unchanged(state)

      // 从暂停继续：剩余时间和本段总时长都不动
      if (state.status === 'paused') {
        return {
          state: { ...state, status: 'running' },
          loggedFocusSeconds: 0,
          alert: false,
        }
      }

      // 全新一段：按当前设置快照
      const total = phaseSeconds(state.phase, durations)
      return {
        state: { ...state, status: 'running', remaining: total, sessionTotal: total },
        loggedFocusSeconds: 0,
        alert: false,
      }
    }

    /* 暂停 */
    case 'pause': {
      if (state.status !== 'running') return unchanged(state)
      return {
        state: { ...state, status: 'paused' },
        loggedFocusSeconds: 0,
        alert: false,
      }
    }

    /* 重置 = 手动停止：先把已经专注的时间交出去记账，再回到专注起点 */
    case 'reset': {
      return {
        state: idleFocusState(durations),
        loggedFocusSeconds: elapsedFocus(state),
        alert: false,
      }
    }

    /* 计时器 tick */
    case 'tick': {
      if (state.status !== 'running') return unchanged(state)
      // 上一段遗留的 tick，丢掉，否则会瞬间把新的一段也跑完
      if (action.phase !== state.phase) return unchanged(state)

      if (action.remaining > 0) {
        if (action.remaining === state.remaining) return unchanged(state)
        return {
          state: { ...state, remaining: action.remaining },
          loggedFocusSeconds: 0,
          alert: false,
        }
      }

      // 归零：专注结束 -> 记账 + 响铃 + 自动开始休息
      if (state.phase === 'focus') {
        const breakTotal = phaseSeconds('break', durations)
        return {
          state: {
            phase: 'break',
            status: 'running',
            remaining: breakTotal,
            sessionTotal: breakTotal,
          },
          loggedFocusSeconds: state.sessionTotal,
          alert: true,
        }
      }

      // 休息结束 -> 响铃 + 回到专注并停住，等手动开始下一颗番茄
      return {
        state: idleFocusState(durations),
        loggedFocusSeconds: 0,
        alert: true,
      }
    }

    /* 设置里的时长变了 */
    case 'durations': {
      // 正在跑或暂停的这一段不受影响，避免倒计时突然跳变
      if (state.status !== 'idle') return unchanged(state)

      const total = phaseSeconds(state.phase, durations)
      if (total === state.sessionTotal) return unchanged(state)

      return {
        state: { ...state, remaining: total, sessionTotal: total },
        loggedFocusSeconds: 0,
        alert: false,
      }
    }
  }
}
