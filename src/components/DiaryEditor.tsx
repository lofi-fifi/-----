import { useState } from 'react'

import { MOODS } from '../lib/diary'
import type { Diary } from '../lib/storage'
import ConfirmDialog from './ConfirmDialog'

type DiaryEditorProps = {
  /** null 表示新建 */
  diary: Diary | null
  today: string
  onSave: (values: { date: string; mood: string; content: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/**
 * 全屏沉浸式编辑器 —— 不做成弹窗。
 *
 * 写日记需要「进入另一个空间」的感觉，弹窗会让人一直觉得是在填一张表。
 * 所以顶栏只有三个东西（取消 / 标题 / 保存），其余全是留白和正文。
 *
 * 正文输入框**没有边框**，行高 1.9，字号比别处大一号 —— 写起来不挤。
 */
export default function DiaryEditor({
  diary,
  today,
  onSave,
  onDelete,
  onClose,
}: DiaryEditorProps) {
  const isNew = diary === null

  const [date, setDate] = useState(diary?.date ?? today)
  const [mood, setMood] = useState(diary?.mood ?? '')
  const [content, setContent] = useState(diary?.content ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canSave = content.trim().length > 0

  function handleSave() {
    if (!canSave) return
    onSave({ date, mood, content: content.trim() })
  }

  /** 有没有改过 —— 用来决定「取消」要不要问一句 */
  const dirty =
    date !== (diary?.date ?? today) ||
    mood !== (diary?.mood ?? '') ||
    content.trim() !== (diary?.content ?? '')

  function handleClose() {
    if (dirty && !window.confirm('放弃这次的修改？')) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      {/* 顶栏：只有取消 / 状态 / 保存 */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-1">
        <button type="button" onClick={handleClose} className="btn-text">
          取消
        </button>
        <span className="text-[12px] text-muted">{isNew ? '写日记' : '编辑'}</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn-text font-medium text-ink disabled:opacity-30"
        >
          保存
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col px-5">
          {/* 日期 + 心情 */}
          <div className="flex shrink-0 flex-col gap-5 py-6">
            <label className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-[13px] text-muted">日期</span>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value || today)}
                className="min-h-11 border-0 bg-transparent text-right text-[14px]
                  text-ink tabular-nums outline-none"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[13px] text-muted">心情</span>
              <div className="flex gap-1">
                {MOODS.map((item) => {
                  const selected = mood === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMood(selected ? '' : item.id)}
                      aria-label={item.label}
                      aria-pressed={selected}
                      className={`grid size-11 place-items-center rounded-full border text-[20px]
                        leading-none transition-colors duration-200 ${
                          selected ? 'border-ink bg-surface' : 'border-transparent'
                        }`}
                    >
                      <span aria-hidden="true">{item.emoji}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 正文：无边框、大行距，占满剩下的高度 */}
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="今天怎么样？"
            aria-label="日记正文"
            className="min-h-[45vh] flex-1 resize-none border-0 bg-transparent pb-8
              text-[16px] leading-[1.9] text-ink outline-none placeholder:text-muted"
          />

          {/* 删除只对已有日记显示，放在最下面，不容易误触 */}
          {!isNew && diary && (
            <div className="flex shrink-0 justify-center border-t border-line py-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn-text text-danger"
              >
                删除这篇日记
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && diary && (
        <ConfirmDialog
          title="删除这篇日记？"
          description="删掉就找不回来了。"
          confirmText="确认删除"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            onDelete(diary.id)
          }}
        />
      )}
    </div>
  )
}
