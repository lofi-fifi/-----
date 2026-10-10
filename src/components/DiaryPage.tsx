import { useState } from 'react'

import {
  MOOD_PLACEHOLDER,
  addDiary,
  createDiary,
  deleteDiary,
  diaryDateLabel,
  excerpt,
  moodEmoji,
  sortDiaries,
  updateDiary,
} from '../lib/diary'
import type { AppData, Diary } from '../lib/storage'
import DiaryEditor from './DiaryEditor'

type DiaryPageProps = {
  data: AppData
  update: (updater: (prev: AppData) => AppData) => boolean
  today: string
}

/** 编辑器状态：null 关闭，'new' 新建，Diary 编辑某一篇 */
type EditorState = Diary | 'new' | null

/**
 * 日记页 —— 和主页完全独立的一屏，不塞进主页也不塞进设置面板。
 *
 * 风格比主页还安静一档：列表只有日期、一个心情、两行摘要，
 * 没有任何颜色、标签、分类、搜索框。
 */
export default function DiaryPage({ data, update, today }: DiaryPageProps) {
  const [editor, setEditor] = useState<EditorState>(null)

  const diaries = sortDiaries(data.diaries)

  function handleSave(values: { date: string; mood: string; content: string }) {
    if (editor === 'new') {
      update((prev) => ({
        ...prev,
        diaries: addDiary(prev.diaries, createDiary(values.date, values.mood, values.content)),
      }))
    } else if (editor !== null) {
      const id = editor.id
      update((prev) => ({ ...prev, diaries: updateDiary(prev.diaries, id, values) }))
    }
    setEditor(null)
  }

  function handleDelete(id: string) {
    update((prev) => ({ ...prev, diaries: deleteDiary(prev.diaries, id) }))
    setEditor(null)
  }

  return (
    <>
      <main className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col gap-5 px-5 pt-8 pb-40">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="text-[17px] font-medium tracking-tight text-ink">日记</h1>
          {diaries.length > 0 && (
            <span className="text-[12px] text-muted tabular-nums">共 {diaries.length} 篇</span>
          )}
        </header>

        {diaries.length === 0 ? (
          <div className="card px-5 py-12 text-center">
            <p className="text-[13px] text-muted">还没有写过日记</p>
            <p className="mt-1 text-[12px] text-muted">点右下角的按钮开始</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line px-5">
            {diaries.map((item) => {
              const emoji = moodEmoji(item.mood)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setEditor(item)}
                    className="flex min-h-11 w-full items-start gap-3 py-4 text-left"
                  >
                    <span
                      className={`w-6 shrink-0 text-center text-[18px] leading-6 ${
                        emoji ? '' : 'text-muted'
                      }`}
                      aria-hidden="true"
                    >
                      {emoji ?? MOOD_PLACEHOLDER}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[13px] text-ink">
                        {diaryDateLabel(item.date, today)}
                      </span>
                      <span className="line-clamp-2 text-[13px] leading-relaxed text-muted">
                        {excerpt(item.content)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {/* 右下角悬浮按钮，抬高到 Tab 栏之上 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div
          className="mx-auto flex w-full max-w-[480px] justify-end px-5
            pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            onClick={() => setEditor('new')}
            aria-label="写日记"
            className="pointer-events-auto grid size-14 place-items-center rounded-full
              bg-ink text-on-ink transition-transform duration-200 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="size-6"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {editor !== null && (
        <DiaryEditor
          diary={editor === 'new' ? null : editor}
          today={today}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}
