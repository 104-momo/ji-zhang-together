import { useState, useEffect, useRef } from 'react'
import { auth } from '../services/auth'
import { IconWallet } from './Icons'

interface Props {
  onSuccess: () => void
  joinHint?: string
}

type Mode = 'login' | 'register'

export default function AuthPage({ onSuccess, joinHint }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startCountdown = () => {
    setCountdown(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const sendCode = async () => {
    setError(null)
    if (!email.trim()) {
      setError('请先输入邮箱')
      return
    }
    setBusy(true)
    try {
      const res = await auth.sendVerificationCode(email)
      setVerificationId(res.verificationId)
      setCodeSent(true)
      startCountdown()
      if (res.isUser) {
        setError('该邮箱已注册，请直接登录')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    setError(null)
    if (!email.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (mode === 'register') {
      if (password.length < 8) {
        setError('密码至少 8 位')
        return
      }
      if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        setError('密码必须同时包含字母和数字')
        return
      }
      if (!codeSent || !verificationId) {
        setError('请先获取邮箱验证码')
        return
      }
      if (!code.trim()) {
        setError('请输入邮箱验证码')
        return
      }
      if (!nickname.trim()) {
        setError('请输入昵称')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        // 先校验验证码，获取 token
        const token = await auth.verifyCode(verificationId, code.trim())
        // 再注册
        await auth.signUp(email, code.trim(), token, password, nickname)
      } else {
        await auth.signIn(email, password)
      }
      onSuccess()
    } catch (e: any) {
      console.error('[注册/登录失败]', e)
      const msg = e?.message || e?.msg || e?.error?.message || (typeof e === 'string' ? e : '')
      const code = e?.code || e?.errorCode || ''
      setError(`${code ? '[' + code + '] ' : ''}${msg || '操作失败，请重试'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page home">
      <div className="home-hero">
        <div className="home-logo">
          <span className="home-logo-badge">
            <IconWallet size={24} />
          </span>
          <span className="home-logo-text">一起记账</span>
        </div>
        <p className="home-tagline">登录后和朋友一起记账，数据云端同步不丢失</p>
        {joinHint ? (
          <p style={{ marginTop: 12, padding: '10px 16px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 'var(--r-control)', fontSize: 13, fontWeight: 600 }}>
            {joinHint}
          </p>
        ) : null}
      </div>
      <div className="card">
        {/* 登录/注册切换 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--surface-2)', borderRadius: 'var(--r-control)', padding: 4 }}>
          <button
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--r-control)', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: mode === 'login' ? 'var(--accent)' : 'transparent',
              color: mode === 'login' ? '#fff' : 'var(--ink-2)', transition: 'all 0.18s',
            }}
            onClick={() => { setMode('login'); setError(null) }}
          >登录</button>
          <button
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--r-control)', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: mode === 'register' ? 'var(--accent)' : 'transparent',
              color: mode === 'register' ? '#fff' : 'var(--ink-2)', transition: 'all 0.18s',
            }}
            onClick={() => { setMode('register'); setError(null) }}
          >注册</button>
        </div>

        <div className="field">
          <label>邮箱</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com" onKeyDown={(e) => e.key === 'Enter' && void submit()}
            autoComplete="email"
          />
        </div>

        {mode === 'register' ? (
          <div className="field">
            <label>邮箱验证码</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="6位验证码" style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                maxLength={6}
              />
              <button
                onClick={() => void sendCode()}
                disabled={busy || countdown > 0}
                style={{
                  padding: '0 14px', borderRadius: 'var(--r-control)', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: countdown > 0 ? 'default' : 'pointer',
                  background: countdown > 0 ? 'var(--surface-2)' : 'var(--accent-soft)',
                  color: countdown > 0 ? 'var(--ink-3)' : 'var(--accent)',
                  whiteSpace: 'nowrap', minWidth: 100,
                }}
              >
                {countdown > 0 ? `${countdown}s 后重发` : codeSent ? '重新发送' : '获取验证码'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="field">
          <label>密码</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '至少8位，含字母和数字' : '请输入密码'}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </div>

        {mode === 'register' ? (
          <div className="field">
            <label>昵称</label>
            <input
              value={nickname} onChange={(e) => setNickname(e.target.value)}
              placeholder="在账本里怎么称呼你" onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </div>
        ) : null}

        {error ? (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 'var(--r-control)' }}>
            {error}
          </div>
        ) : null}

        <button className="btn-primary btn-block" onClick={() => void submit()} disabled={busy}>
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </div>
      <p className="home-tip">
        {mode === 'login' ? '还没有账号？点上方「注册」创建' : '已有账号？点上方「登录」'}
      </p>
    </div>
  )
}
