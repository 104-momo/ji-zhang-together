import { useState } from 'react'
import type { Ledger } from '../types'
import { IconWallet, IconChevronDown, IconSignOut } from './Icons'
import { auth } from '../services/auth'
interface Props {
  myLedgers: Ledger[]
  onCreate: (name: string, nickname: string) => Promise<void>
  onOpen: (ledgerId: string) => void
}
export default function HomePage({ myLedgers, onCreate, onOpen }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState(auth.getCurrentUser()?.nickname || '')
  const [busy, setBusy] = useState(false)
  const handleSignOut = async () => {
    await auth.signOut()
  }
  const submit = async () => {
    if (!nickname.trim()) return
    setBusy(true)
    try {
      await onCreate(name.trim() || '我的账本', nickname.trim())
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
        <p className="home-tagline">像聊天一样记账，说一句话，自动变成一笔账。</p>
      </div>
      <div className="card">
        <h2>建一本新账</h2>
        <div className="field">
          <label>账本名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：和小王的合租账" />
        </div>
        <div className="field">
          <label>你的昵称</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="在这本账里怎么称呼你"
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <button className="btn-primary btn-block" onClick={() => void submit()} disabled={busy || !nickname.trim()}>
          创建并进入
        </button>
      </div>
      {myLedgers.length > 0 ? (
        <>
          <div className="home-section-title">
            <IconWallet size={14} /> 我的账本
          </div>
          {myLedgers.map((l) => (
            <button key={l.id} className="ledger-item" onClick={() => onOpen(l.id)}>
              <span className="ledger-item-icon">
                <IconWallet size={20} />
              </span>
              <span className="ledger-item-body">
                <span className="ledger-item-name">{l.name}</span>
                <span className="ledger-item-sub">点击进入</span>
              </span>
              <span className="ledger-item-arrow">
                <IconChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
              </span>
            </button>
          ))}
        </>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 16 }}>
        <button
          onClick={() => void handleSignOut()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: 'var(--ink-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <IconSignOut size={13} /> 退出登录
        </button>
      </div>
      <p className="home-tip">收到朋友的邀请链接？用浏览器打开即可自动加入</p>
    </div>
  )
}
