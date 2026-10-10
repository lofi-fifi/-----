import { daysUntil, todayKey } from '../lib/date'
import { holidayFor } from '../lib/holiday'
import type { AppData } from '../lib/storage'

type CountdownProps = {
  data: AppData
}

/** 节日彩蛋：安静的一行小字，不做任何高亮或动效，避免抢了倒计时的注意力 */
function HolidayLine({ message }: { message: string }) {
  return <p className="text-[12px] leading-relaxed text-muted">{message}</p>
}

/**
 * 页面结构 1：顶部考研倒计时
 * 「距离 {examName} 还有 XX 天」，天数 0 时换成「就是今天，加油！」
 *
 * 下面再挂一行节日彩蛋（国庆、春节、七夕、倒计时 100 天……）。
 * 内容全在 src/data/holidays.ts，一天最多一条。
 */
export default function Countdown({ data }: CountdownProps) {
  const { examName, examDate } = data.settings
  const name = examName.trim() || '考试'
  const days = daysUntil(examDate)

  const today = todayKey()
  const holiday = holidayFor(today, examDate)

  // 日期被清空或填得不像日期
  if (days === null) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted">{name}</p>
        <p className="text-[15px] text-muted">考试日期未设置</p>
        {holiday && <HolidayLine message={holiday.message} />}
      </section>
    )
  }

  if (days === 0) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted">{name}</p>
        <p className="text-[24px] leading-tight font-bold tracking-tight text-ink">
          就是今天，加油！
        </p>
        {holiday && <HolidayLine message={holiday.message} />}
      </section>
    )
  }

  if (days < 0) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted">{name}</p>
        <p className="text-[15px] text-muted">已结束 {-days} 天</p>
        {holiday && <HolidayLine message={holiday.message} />}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-1">
      <p className="text-[13px] text-muted">距离 {name}还有</p>
      <p className="text-[40px] leading-none font-bold tracking-tight text-ink tabular-nums">
        {days}
        <span className="ml-1 text-[13px] font-normal text-muted">天</span>
      </p>
      {holiday && <HolidayLine message={holiday.message} />}
    </section>
  )
}
