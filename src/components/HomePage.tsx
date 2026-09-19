import { useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { Ledger } from '../types'
import { IconWallet, IconChevronDown, IconSignOut } from './Icons'
import { auth } from '../services/auth'

interface Props {
  myLedgers: Ledger[]; loading?: boolean; error?: string | null; onRefresh?: () => void
  onCreate: (name: string, nickname: string) => Promise<void>; onOpen: (ledgerId: string) => void
}

export default function HomePage({ myLedgers, loading, error, onRefresh, onCreate, onOpen }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState(auth.getCurrentUser()?.nickname || '')
  const [busy, setBusy] = useState(false)
  const handleSignOut = async () => { await auth.signOut() }
  const submit = async () => {
    if (!nickname.trim()) return
    setBusy(true)
    try { await onCreate(name.trim() || '我的账本', nickname.trim()) } finally { setBusy(false) }
  }
  return (
    <ScrollView className="page home" scrollY>
      <View className="home-hero">
        <View className="home-logo">
          <Text className="home-logo-badge"><IconWallet size={24} /></Text>
          <Text className="home-logo-text">一起记账</Text>
        </View>
        <Text className="home-tagline">像聊天一样记账，说一句话，自动变成一笔账。</Text>
      </View>
      {loading && myLedgers.length === 0 ? (
        <View style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: '24px 0' }}>正在加载账本…</View>
      ) : error ? (
        <View style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</Text>
          <Button className="btn-primary" style={{ padding: '6px 22px', fontSize: 13 }} onClick={() => onRefresh?.()}>重试</Button>
        </View>
      ) : myLedgers.length > 0 ? (
        <View>
          <View className="home-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconWallet size={14} /> 我的账本</Text>
            <Text onClick={() => onRefresh?.()} style={{ fontSize: 12, color: 'var(--accent)', padding: '4px 8px' }}>刷新</Text>
          </View>
          {myLedgers.map((l) => (
            <View key={l.id} className="ledger-item" onClick={() => onOpen(l.id)} hoverClass="ledger-item-hover">
              <Text className="ledger-item-icon"><IconWallet size={20} /></Text>
              <View className="ledger-item-body">
                <Text className="ledger-item-name">{l.name}</Text>
                <Text className="ledger-item-sub">点击进入</Text>
              </View>
              <Text className="ledger-item-arrow"><IconChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} /></Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: '20px 0' }}>还没有账本，在下面创建一本吧</View>
      )}
      <View className="card" style={{ marginTop: 8 }}>
        <View className="card-title">建一本新账</View>
        <View className="field">
          <Text className="field-label">账本名</Text>
          <Input value={name} onInput={(e) => setName(e.detail.value)} placeholder="如：和小王的合租账" />
        </View>
        <View className="field">
          <Text className="field-label">你的昵称</Text>
          <Input value={nickname} onInput={(e) => setNickname(e.detail.value)} placeholder="在这本账里怎么称呼你" confirmType="done" onConfirm={() => void submit()} />
        </View>
        <Button className="btn-primary btn-block" onClick={() => void submit()} disabled={busy || !nickname.trim()}>创建并进入</Button>
      </View>
      <View style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 16 }}>
        <Button onClick={() => void handleSignOut()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)', background: 'none', border: 'none', padding: '6px 12px', lineHeight: 1.4 }}>
          <IconSignOut size={13} /> 退出登录
        </Button>
      </View>
      <Text className="home-tip">邀请朋友：进入账本后点右上角「+」发送小程序卡片</Text>
    </ScrollView>
  )
}
