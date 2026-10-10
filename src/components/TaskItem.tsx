import { useEffect, useRef, useState } from 'react'

import type { Task } from '../lib/storage'
import { formatDuration } from '../lib/time'
import Portal from './Portal'

type TaskItemProps = {
  task: Task
  onToggle: () => void
  onRename: (text: string) => void
  onLogTime: () => void
  onDelete: () => void
}

/** 菜单有三项（重命名 / 补录时长 / 删除），留出高度用于贴底时向上收 */
const MENU_HEIGHT = 132

/** 长按多久进入重命名（毫秒） */
const LONG_PRESS_MS = 500

/**
 * 任务行：左侧圆形勾选框 / 中间文字 / 右侧已用时长 / 末尾 "..." 菜单。
 *
 * 整行可点，切换完成状态；勾选框和 "..." 都在行内，各自 stopPropagation。
 * 长按任务文字（或走 "..." 菜单）可以就地重命名。
 */
export default function TaskItem({
  task,
  onToggle,
  onRename,
  onLogTime,
  onDelete,
}: TaskItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const moreRef = useRef<HTMLButtonElement>(null)

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const longPressTimer = useRef<number | null>(null)
  /** 长按已经触发过：抑制随后那次 click，避免顺手把任务划掉 */
  const suppressClick = useRef(false)
  /** 编辑已经收尾（保存或取消过）：避免输入框卸载后补发的 blur 再提交一次 */
  const editSettled = useRef(false)

  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  /* ---------------- 长按进入编辑 ---------------- */

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handlePressStart() {
    if (editing) return
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      suppressClick.current = true
      startEdit()
    }, LONG_PRESS_MS)
  }

  function startEdit() {
    editSettled.current = false
    setEditText(task.text)
    setEditing(true)
  }

  function saveEdit() {
    if (editSettled.current) return
    editSettled.current = true
    setEditing(false)
    onRename(editText)
  }

  function cancelEdit() {
    if (editSettled.current) return
    editSettled.current = true
    setEditing(false)
  }

  /* ---------------- 菜单 ---------------- */

  function openMenu() {
    const rect = moreRef.current?.getBoundingClientRect()
    if (!rect) return

    setMenuPos({
      // 靠近屏幕底部时向上收，避免菜单被裁掉
      top: Math.min(rect.bottom + 6, window.innerHeight - MENU_HEIGHT),
      right: Math.max(8, window.innerWidth - rect.right),
    })
    setMenuOpen(true)
  }

  const menuItemClass =
    'flex min-h-11 w-full items-center px-4 text-left text-[14px] text-ink ' +
    'transition-colors duration-200 active:bg-surface'

  return (
    <li>
      <div
        role="checkbox"
        aria-checked={task.done}
        tabIndex={0}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          onToggle()
        }}
        onKeyDown={(event) => {
          // 只响应行本身获得焦点时的按键，别把子元素（输入框 / "..." 按钮）冒泡上来的也算进去
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        className="flex w-full cursor-pointer touch-manipulation items-center gap-3
          px-5 py-4 select-none
          focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-muted"
      >
        {/* 圆形勾选框 */}
        <span
          aria-hidden="true"
          className={`grid size-5 shrink-0 place-items-center rounded-full border
            transition-colors duration-200
            ${task.done ? 'border-ink bg-ink' : 'border-line bg-panel'}`}
        >
          {task.done && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3 text-on-ink"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </span>

        {editing ? (
          <input
            autoFocus
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={saveEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveEdit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancelEdit()
              }
            }}
            aria-label="重命名任务"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none
              select-text"
          />
        ) : (
          /* 任务文字：完成后变灰 + 划线 + 200ms 过渡；长按可就地重命名 */
          <span
            onPointerDown={handlePressStart}
            onPointerUp={clearLongPress}
            onPointerLeave={clearLongPress}
            onPointerCancel={clearLongPress}
            onContextMenu={(event) => event.preventDefault()}
            className={`task-text min-w-0 flex-1 text-[15px] break-words
              [-webkit-touch-callout:none]
              ${task.done ? 'task-text-done' : 'text-ink'}`}
          >
            {task.text}
          </span>
        )}

        {/* 已用时长 */}
        <span className="shrink-0 text-[13px] text-muted tabular-nums">
          {formatDuration(task.seconds)}
        </span>

        {/* "..." 菜单按钮 */}
        <button
          ref={moreRef}
          type="button"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation()
            if (menuOpen) setMenuOpen(false)
            else openMenu()
          }}
          className="-my-2 -mr-1 grid size-11 shrink-0 place-items-center rounded-card
            text-muted transition-colors duration-200 active:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <Portal>
          {/* 点击空白处关闭 */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen(false)
            }}
          />

          <div
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-50 w-32 overflow-hidden rounded-card border border-line frosted py-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                startEdit()
              }}
              className={menuItemClass}
            >
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                onLogTime()
              }}
              className={menuItemClass}
            >
              补录时长
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                onDelete()
              }}
              className={menuItemClass}
            >
              删除
            </button>
          </div>
        </Portal>
      )}
    </li>
  )
}
