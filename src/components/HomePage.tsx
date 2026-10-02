import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import type { Ledger } from '../types'
import { IconWallet, IconChevronDown, IconSignOut } from './Icons'
import { auth } from '../services/auth'
import { parseInviteToken } from '../services/invite'
import logoImg from '../assets/logo.jpeg'

interface Props {
  myLedgers: Ledger[]; loading?: boolean; error?: string | null; onRefresh?: () => void
  onCreate: (name: string, nickname: string) => Promise<void>; onOpen: (ledgerId: string) => void
  onJoin: (ledgerId: string, code: string, nickname: string) => Promise<void>
}

export default function HomePage({ myLedgers, loading, error, onRefresh, onCreate, onOpen, onJoin }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState(auth.getCurrentUser()?.nickname || '')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [joining, setJoining] = useState(false)

  const handleSignOut = async () => { await auth.signOut() }
  const submit = async () => {
    if (!nickname.trim()) return
    setBusy(true)
    try { await onCreate(name.trim() || '我的账本', nickname.trim()) } finally { setBusy(false) }
  }
  const pasteToken = async () => {
    try {
      const res = await Taro.getClipboardData()
      if (res.data) setToken(res.data)
    } catch {}
  }
  const submitJoin = async () => {
    const parsed = parseInviteToken(token)
    if (!parsed) { Taro.showToast({ title: '口令无效，请复制好友发的完整消息', icon: 'none' }); return }
    const nick = nickname.trim() || auth.getCurrentUser()?.nickname || '我'
    setJoining(true)
    try {
      await onJoin(parsed.ledgerId, parsed.code, nick)
      setToken('')
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加入失败', icon: 'none' })
    } finally { setJoining(false) }
  }
  return (
    <ScrollView className="page home" scrollY>
      <View className="home-hero">
        <View className="home-logo">
          <Image className="home-logo-badge" src={logoImg} mode="aspectFill" />
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
        <View style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: '20px 0' }}>还没有账本，创建一本或加入好友的账本</View>
      )}
      <View className="card" style={{ marginTop: 8 }}>
        <View className="card-title">加入好友的账本</View>
        <View className="field">
          <Text className="field-label">邀请口令</Text>
          <View className="join-token-row">
            <Textarea
              className="join-token-input"
              value={token}
              onInput={(e) => setToken(e.detail.value)}
              placeholder="把好友发你的邀请消息整段粘贴到这里"
              autoHeight
              maxlength={300}
            />
            <Button className="btn-secondary join-paste-btn" onClick={() => void pasteToken()}>粘贴</Button>
          </View>
        </View>
        <View className="field">
          <Text className="field-label">你的昵称</Text>
          <Input value={nickname} onInput={(e) => setNickname(e.detail.value)} placeholder="在这本账里怎么称呼你" />
        </View>
        <Button className="btn-primary btn-block" onClick={() => void submitJoin()} disabled={joining || !token.trim()}>
          {joining ? '加入中…' : '加入账本'}
        </Button>
      </View>
      <View className="card" style={{ marginTop: 8 }}>
        <View className="card-title">建一本新账</View>
        <View className="field">
          <Text className="field-label">账本名</Text>
          <Input value={name} onInput={(e) => setName(e.detail.value)} placeholder="如：和小王的合租账" />
        </View>
        <Button className="btn-primary btn-block" onClick={() => void submit()} disabled={busy || !nickname.trim()}>创建并进入</Button>
      </View>
      <View style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 16 }}>
        <Button onClick={() => void handleSignOut()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)', background: 'none', border: 'none', padding: '6px 12px', lineHeight: 1.4 }}>
          <IconSignOut size={13} /> 退出登录
        </Button>
      </View>
      <Text className="home-tip">邀请朋友：进入账本 →「管理」→「复制邀请口令」，发给好友粘贴加入</Text>
    </ScrollView>
  )
}
