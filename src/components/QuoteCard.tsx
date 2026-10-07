import { useEffect, useMemo, useState } from 'react'

import { BUILTIN_QUOTES } from '../data/quotes'
import type { AppData } from '../lib/storage'

type QuoteCardProps = {
  data: AppData
}

/** 从池子里随机取一条，尽量避开当前这条 */
function pickRandom(pool: string[], avoid: string | null): string {
  const candidates =
    pool.length > 1 && avoid ? pool.filter((quote) => quote !== avoid) : pool
  const source = candidates.length > 0 ? candidates : pool
  if (source.length === 0) return ''
  return source[Math.floor(Math.random() * source.length)]
}

/**
 * 页面结构 2：鸡汤卡片
 * 打开时随机一条，内置 100 条 + 设置里的自定义语录一起参与随机。
 */
export default function QuoteCard({ data }: QuoteCardProps) {
  const pool = useMemo(
    () => Array.from(new Set([...BUILTIN_QUOTES, ...data.settings.customQuotes])),
    [data.settings.customQuotes],
  )

  const [quote, setQuote] = useState(() => pickRandom(pool, null))

  // 当前这条如果被从自定义语录里删掉了，就换一条
  useEffect(() => {
    if (!pool.includes(quote)) setQuote(pickRandom(pool, null))
  }, [pool, quote])

  return (
    <section className="card flex flex-col gap-5 p-5">
      <p className="text-[15px] leading-relaxed text-ink">{quote}</p>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setQuote((prev) => pickRandom(pool, prev))}
          className="btn-ghost"
        >
          换一条
        </button>
      </div>
    </section>
  )
}
