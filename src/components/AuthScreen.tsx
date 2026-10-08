import { useState, type FormEvent } from 'react'

import {
  signInWithEmail,
  signUpWithEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../utils/supabaseAuth'

type Mode = 'signIn' | 'signUp'

type Props = {
  /** 用户选择「先不登录」，直接进本地版 */
  onSkip: () => void
}

/** 输入框统一样式：44px 高、无边框聚焦发黑 */
const FIELD = [
  'min-h-11 w-full rounded-card border border-line bg-panel px-3',
  'text-[15px] text-ink outline-none transition-colors duration-200',
  'placeholder:text-muted focus:border-ink',
].join(' ')

/**
 * 登录 / 注册页。
 *
 * 只有在 Supabase 配好的情况下才会出现 —— 没配的话 App 直接进本地版。
 * 底部留了「先不登录」的出口：Supabase 出问题时用户不至于被锁在自己的数据外面。
 */
export default function AuthScreen({ onSkip }: Props) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setError(null)
    setNotice(null)

    // 先本地校验一遍，省得为一个格式错误跑一趟网络
    const problem =
      validateEmail(email) ??
      validatePassword(password) ??
      (mode === 'signUp' ? validateUsername(username) : null)

    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    try {
      if (mode === 'signUp') {
        const result = await signUpWithEmail(email, password, username)
        if (!result.ok) {
          setError(result.message)
          return
        }
        setNotice(
          result.needsConfirmation
            ? '注册成功！去邮箱点一下验证链接，然后回来登录'
            : '注册成功，正在进入…',
        )
      } else {
        const result = await signInWithEmail(email, password)
        if (!result.ok) {
          setError(result.message)
          return
        }
        // 登录成功后 useAuth 的订阅会切走界面，这里不用额外做什么
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      <main className="w-full max-w-[400px]">
        <div className="mb-5 text-center">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">考研打卡</h1>
          <p className="mt-1 text-[13px] text-muted">登录后可以加好友互相监督</p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
          {/* 登录 / 注册 切换 */}
          <div className="flex gap-1 rounded-card border border-line p-1">
            {(['signIn', 'signUp'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`min-h-11 flex-1 rounded-[8px] text-[14px] transition-colors duration-200 ${
                  mode === value ? 'bg-ink text-on-ink' : 'text-muted active:text-ink'
                }`}
              >
                {value === 'signIn' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {mode === 'signUp' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">用户名（好友靠它找你）</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                maxLength={20}
                placeholder="2~20 个字"
                className={FIELD}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              placeholder="至少 6 位"
              className={FIELD}
            />
          </label>

          {error !== null && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          {notice !== null && (
            <p role="status" className="text-[13px] text-ink">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '处理中…' : mode === 'signIn' ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-3 flex justify-center">
          <button type="button" onClick={onSkip} className="btn-text">
            先不登录，只用本地
          </button>
        </div>
      </main>
    </div>
  )
}
