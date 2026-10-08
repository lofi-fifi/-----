import { describe, expect, it } from 'vitest'

import {
  PHASE_MINUTES_BOUNDS,
  clampPhaseMinutes,
  createInitialState,
  elapsedFocus,
  phaseSeconds,
  reducePomodoro,
  type PomodoroDurations,
  type PomodoroState,
} from './pomodoro'

const D: PomodoroDurations = { focusMinutes: 25, breakMinutes: 5 }

const reduce = (state: PomodoroState, action: Parameters<typeof reducePomodoro>[1]) =>
  reducePomodoro(state, action, D)

describe('phaseSeconds', () => {
  it('分钟换算成秒', () => {
    expect(phaseSeconds('focus', D)).toBe(1500)
    expect(phaseSeconds('break', D)).toBe(300)
  })

  it('至少 1 秒，防止 0 或负数导致立刻结束', () => {
    expect(phaseSeconds('focus', { focusMinutes: 0, breakMinutes: 5 })).toBe(60)
    expect(phaseSeconds('focus', { focusMinutes: -3, breakMinutes: 5 })).toBe(60)
  })
})

describe('clampPhaseMinutes', () => {
  it('专注 1~180，休息 1~60（上限不同）', () => {
    expect(PHASE_MINUTES_BOUNDS.focus).toEqual({ min: 1, max: 180 })
    expect(PHASE_MINUTES_BOUNDS.break).toEqual({ min: 1, max: 60 })
    expect(clampPhaseMinutes('focus', 999)).toBe(180)
    expect(clampPhaseMinutes('break', 999)).toBe(60)
    expect(clampPhaseMinutes('focus', 0)).toBe(1)
  })

  it('小数四舍五入', () => {
    expect(clampPhaseMinutes('focus', 45.4)).toBe(45)
    expect(clampPhaseMinutes('focus', 45.6)).toBe(46)
  })

  it('NaN 落到下限，±Infinity 落到对应边界', () => {
    expect(clampPhaseMinutes('focus', Number.NaN)).toBe(1)
    expect(clampPhaseMinutes('focus', Number.POSITIVE_INFINITY)).toBe(180)
    expect(clampPhaseMinutes('focus', Number.NEGATIVE_INFINITY)).toBe(1)
  })
})

describe('createInitialState', () => {
  it('从专注阶段空闲起步', () => {
    expect(createInitialState(D)).toEqual({
      phase: 'focus',
      status: 'idle',
      remaining: 1500,
      sessionTotal: 1500,
    })
  })
})

describe('elapsedFocus', () => {
  it('空闲时算 0', () => {
    expect(elapsedFocus(createInitialState(D))).toBe(0)
  })

  it('专注中 = 总时长 - 剩余', () => {
    expect(
      elapsedFocus({ phase: 'focus', status: 'running', remaining: 1200, sessionTotal: 1500 }),
    ).toBe(300)
  })

  it('休息时间不算学习时间', () => {
    expect(
      elapsedFocus({ phase: 'break', status: 'running', remaining: 100, sessionTotal: 300 }),
    ).toBe(0)
  })
})

describe('start / pause / reset', () => {
  it('全新一段按当前设置快照', () => {
    const r = reduce(createInitialState(D), { type: 'start' })
    expect(r.state.status).toBe('running')
    expect(r.state.remaining).toBe(1500)
  })

  it('从暂停继续时剩余时间不动', () => {
    const paused: PomodoroState = {
      phase: 'focus',
      status: 'paused',
      remaining: 800,
      sessionTotal: 1500,
    }
    const r = reduce(paused, { type: 'start' })
    expect(r.state.status).toBe('running')
    expect(r.state.remaining).toBe(800)
    expect(r.state.sessionTotal).toBe(1500)
  })

  it('运行中再按开始无效', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 800,
      sessionTotal: 1500,
    }
    expect(reduce(running, { type: 'start' }).state).toBe(running)
  })

  it('暂停只改状态', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 800,
      sessionTotal: 1500,
    }
    const r = reduce(running, { type: 'pause' })
    expect(r.state.status).toBe('paused')
    expect(r.state.remaining).toBe(800)
  })

  it('重置 = 停止并记账已专注的时间', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 1200,
      sessionTotal: 1500,
    }
    const r = reduce(running, { type: 'reset' })
    expect(r.loggedFocusSeconds).toBe(300)
    expect(r.state).toEqual({
      phase: 'focus',
      status: 'idle',
      remaining: 1500,
      sessionTotal: 1500,
    })
  })
})

describe('tick', () => {
  const running: PomodoroState = {
    phase: 'focus',
    status: 'running',
    remaining: 100,
    sessionTotal: 1500,
  }

  it('正常倒数', () => {
    expect(reduce(running, { type: 'tick', phase: 'focus', remaining: 99 }).state.remaining).toBe(99)
  })

  it('数值没变就不产生新对象（避免无谓渲染）', () => {
    expect(reduce(running, { type: 'tick', phase: 'focus', remaining: 100 }).state).toBe(running)
  })

  it('丢弃上一段遗留的 tick', () => {
    expect(reduce(running, { type: 'tick', phase: 'break', remaining: 50 }).state).toBe(running)
  })

  it('非运行状态下忽略 tick', () => {
    const idle = createInitialState(D)
    expect(reduce(idle, { type: 'tick', phase: 'focus', remaining: 10 }).state).toBe(idle)
  })

  it('专注归零 -> 记账 + 响铃 + 自动开始休息', () => {
    const r = reduce(running, { type: 'tick', phase: 'focus', remaining: 0 })
    expect(r.state.phase).toBe('break')
    expect(r.state.status).toBe('running')
    expect(r.state.sessionTotal).toBe(300)
    expect(r.loggedFocusSeconds).toBe(1500)
    expect(r.alert).toBe(true)
  })

  it('休息归零 -> 响铃 + 回到专注并停住', () => {
    const resting: PomodoroState = {
      phase: 'break',
      status: 'running',
      remaining: 1,
      sessionTotal: 300,
    }
    const r = reduce(resting, { type: 'tick', phase: 'break', remaining: 0 })
    expect(r.state).toEqual({ phase: 'focus', status: 'idle', remaining: 1500, sessionTotal: 1500 })
    expect(r.alert).toBe(true)
    expect(r.loggedFocusSeconds).toBe(0)
  })
})

describe('durations（改设置）', () => {
  it('空闲时倒计时跟着设置走', () => {
    const idle = createInitialState(D)
    const r = reducePomodoro(idle, { type: 'durations' }, { focusMinutes: 45, breakMinutes: 10 })
    expect(r.state.remaining).toBe(2700)
    expect(r.state.sessionTotal).toBe(2700)
  })

  it('跑着的这一段不受影响（避免倒计时突然跳变）', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 800,
      sessionTotal: 1500,
    }
    const r = reducePomodoro(running, { type: 'durations' }, { focusMinutes: 45, breakMinutes: 10 })
    expect(r.state).toBe(running)
  })

  it('时长没变就不产生新对象', () => {
    const idle = createInitialState(D)
    expect(reduce(idle, { type: 'durations' }).state).toBe(idle)
  })
})

describe('adjust（上下滑动调时长）', () => {
  const adjust = (state: PomodoroState, delta: number) =>
    reducePomodoro(state, { type: 'adjust', deltaSeconds: delta }, D)

  it('空闲时不动 —— 交给 durations 那条路重排', () => {
    const idle = createInitialState(D)
    expect(adjust(idle, 60).state).toBe(idle)
  })

  it('运行中剩余和总时长一起加', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 1200,
      sessionTotal: 1500,
    }
    const r = adjust(running, 60)
    expect(r.state.remaining).toBe(1260)
    expect(r.state.sessionTotal).toBe(1560)
    expect(r.loggedFocusSeconds).toBe(0)
    expect(r.alert).toBe(false)
  })

  it('已专注的时间不受影响', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 1200,
      sessionTotal: 1500,
    }
    expect(elapsedFocus(adjust(running, 60).state)).toBe(300)
    expect(elapsedFocus(adjust(running, -60).state)).toBe(300)
  })

  it('往下减也是两边一起减', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 1200,
      sessionTotal: 1500,
    }
    const r = adjust(running, -60)
    expect(r.state.remaining).toBe(1140)
    expect(r.state.sessionTotal).toBe(1440)
  })

  it('一次可以滑多格', () => {
    const running: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 1200,
      sessionTotal: 1500,
    }
    expect(adjust(running, 300).state.remaining).toBe(1500)
  })

  it('剩余不会掉到 1 秒以下，且总时长不小于剩余', () => {
    const almost: PomodoroState = {
      phase: 'focus',
      status: 'running',
      remaining: 20,
      sessionTotal: 1500,
    }
    const r = adjust(almost, -60)
    expect(r.state.remaining).toBe(1)
    expect(r.state.sessionTotal).toBeGreaterThanOrEqual(r.state.remaining)
    expect(elapsedFocus(r.state)).toBeGreaterThanOrEqual(0)
  })

  it('暂停时也能调，且不会把暂停变成运行', () => {
    const paused: PomodoroState = {
      phase: 'focus',
      status: 'paused',
      remaining: 600,
      sessionTotal: 1500,
    }
    const r = adjust(paused, 60)
    expect(r.state.remaining).toBe(660)
    expect(r.state.status).toBe('paused')
  })

  it('休息阶段同样能调，且不改相位', () => {
    const rest: PomodoroState = {
      phase: 'break',
      status: 'running',
      remaining: 200,
      sessionTotal: 300,
    }
    const r = adjust(rest, -60)
    expect(r.state.remaining).toBe(140)
    expect(r.state.phase).toBe('break')
  })
})
