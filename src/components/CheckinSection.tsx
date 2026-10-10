import { useRef, useState } from 'react'

import Portal from './Portal'
import { playDing, unlockAudio, vibrate } from '../utils/feedback'
import {
  BADGE_META,
  badgeCount,
  badgeDates,
  badgesEarnedOnCheckin,
  currentStreak,
  isCheckedIn,
} from '../lib/checkin'
import { todayKey } from '../lib/date'
import type { AppData, BadgeType } from '../lib/storage'

const POPOVER_WIDTH = 176

type CheckinSectionProps = {
  data: AppData
  update: (updater: (prev: AppData) => AppData) => void
}

/**
 * 页面结构 3：签到区
 *
 * 连续天数从「今天（没签就从昨天）」往前推；徽章满门槛当次签到即发。
 * 只点签到按钮就算签到，不要求完成任务。
 */
export default function CheckinSection({ data, update }: CheckinSectionProps) {
  const today = todayKey()
  const signedToday = isCheckedIn(data.checkins, today)
  const streak = currentStreak(data.checkins, today)

  /** 徽章类型 -> 触发次数，用来强制重挂载播放「放大出现」动画 */
  const [pops, setPops] = useState<Record<string, number>>({})
  const [openBadge, setOpenBadge] = useState<BadgeType | null>(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const badgeRefs = useRef<Partial<Record<BadgeType, HTMLButtonElement | null>>>({})

  function handleCheckin() {
    if (signedToday) return

    // 用户手势里解锁音频，否则发徽章的提示音会被浏览器拦掉
    unlockAudio()

    // 按当前渲染的数据先算一遍，用于决定要不要播动画 / 出声
    const mergedPreview = [...data.checkins, today]
    const earned = badgesEarnedOnCheckin(
      data.badges,
      currentStreak(mergedPreview, today),
      today,
    )

    update((prev) => {
      // 同一天只能签一次。读 prev 而不是闭包里的数据，防止快速连点签两次
      if (prev.checkins.includes(today)) return prev

      const merged = [...prev.checkins, today]
      const fresh = badgesEarnedOnCheckin(
        prev.badges,
        currentStreak(merged, today),
        today,
      )
      return { ...prev, checkins: merged, badges: [...prev.badges, ...fresh] }
    })

    if (earned.length === 0) return

    // 提示音 / 震动是否真的触发，由 utils/feedback 按设置开关判断
    playDing()
    vibrate([200])

    setPops((prev) => {
      const next = { ...prev }
      for (const badge of earned) next[badge.type] = (next[badge.type] ?? 0) + 1
      return next
    })
  }

  function openBadgeInfo(type: BadgeType) {
    const el = badgeRefs.current[type]
    if (!el) return

    const rect = el.getBoundingClientRect()
    const centered = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
    const maxLeft = window.innerWidth - POPOVER_WIDTH - 12

    setPopoverPos({
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(centered, maxLeft)),
    })
    setOpenBadge(type)
  }

  const openMeta = openBadge
    ? (BADGE_META.find((meta) => meta.type === openBadge) ?? null)
    : null
  const openDates = openBadge ? badgeDates(data.badges, openBadge) : []

  return (
    <section className="card flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted">连续签到</p>
          <p className="text-[30px] leading-none font-semibold tracking-tight text-ink tabular-nums">
            {streak}
            <span className="ml-1 text-[13px] font-normal text-muted">天</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheckin}
          disabled={signedToday}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center
            rounded-card px-4 text-[13px] font-medium transition-colors duration-200 ${
              signedToday
                ? 'border border-line bg-surface text-muted'
                : 'bg-ink text-on-ink active:opacity-80'
            }`}
        >
          {signedToday ? '已签到 ✓' : '今日签到'}
        </button>
      </div>

      {/* 三枚徽章：未获得灰色轮廓，获得后彩色，点击看获得日期 */}
      <ul className="flex gap-2">
        {BADGE_META.map((meta) => {
          const count = badgeCount(data.badges, meta.type)
          const earned = count > 0
          const token = pops[meta.type] ?? 0

          return (
            <li key={meta.type} className="flex-1">
              <button
                ref={(el) => {
                  badgeRefs.current[meta.type] = el
                }}
                type="button"
                disabled={!earned}
                onClick={() => openBadgeInfo(meta.type)}
                aria-label={
                  earned
                    ? `连续 ${meta.days} 天徽章，已获得，点击查看获得日期`
                    : `连续 ${meta.days} 天徽章，未获得`
                }
                className={`flex min-h-11 w-full flex-col items-center justify-center
                  gap-1.5 rounded-card border border-line bg-panel px-2 py-3
                  transition-colors duration-200 ${earned ? 'active:bg-surface' : ''}`}
              >
                <span className="flex items-baseline gap-0.5">
                  <span
                    key={token}
                    className={`text-[22px] leading-none ${
                      earned ? '' : 'opacity-40 grayscale'
                    } ${token > 0 ? 'badge-pop' : ''}`}
                  >
                    {meta.emoji}
                  </span>
                  {count > 1 && (
                    <span className="text-[11px] text-muted">×{count}</span>
                  )}
                </span>
                <span className="text-[11px] text-muted">连续 {meta.days} 天</span>
              </button>
            </li>
          )
        })}
      </ul>

      {openMeta && (
        <Portal>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onClick={() => setOpenBadge(null)}
          />

          <div
            role="dialog"
            aria-label="徽章获得日期"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              width: POPOVER_WIDTH,
            }}
            className="fixed z-50 rounded-card border border-line frosted px-3 py-2"
          >
            <p className="text-[12px] text-muted">
              {openMeta.emoji} 连续 {openMeta.days} 天
            </p>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {openDates.map((date) => (
                <li key={date} className="text-[13px] text-ink">
                  获得于 {date}
                </li>
              ))}
            </ul>
          </div>
        </Portal>
      )}
    </section>
  )
}
