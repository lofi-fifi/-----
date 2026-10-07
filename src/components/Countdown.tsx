import type { AppData } from '../lib/storage'
import { daysUntil } from '../lib/date'

type CountdownProps = {
  data: AppData
}

/**
 * 页面结构 1：顶部考研倒计时
 * 「距离 {examName} 还有 XX 天」，天数 0 时换成「就是今天，加油！」
 */
export default function Countdown({ data }: CountdownProps) {
  const { examName, examDate } = data.settings
  const name = examName.trim() || '考试'
  const days = daysUntil(examDate)

  // 日期被清空或填得不像日期
  if (days === null) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted">{name}</p>
        <p className="text-[15px] text-muted">考试日期未设置</p>
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
      </section>
    )
  }

  if (days < 0) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted">{name}</p>
        <p className="text-[15px] text-muted">已结束 {-days} 天</p>
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
    </section>
  )
}
