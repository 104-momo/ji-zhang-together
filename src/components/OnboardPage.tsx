import { useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import { auth } from '../services/auth'
import { IconWallet } from './Icons'

interface Props { onSuccess: () => void; joinHint?: string }

export default function OnboardPage({ onSuccess, joinHint }: Props) {
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    const nick = nickname.trim()
    if (!nick) { setError('请输入昵称'); return }
    setBusy(true); setError(null)
    try { await auth.ensureUser(nick); onSuccess() }
    catch (e) { setError(e instanceof Error ? e.message : '进入失败，请重试') }
    finally { setBusy(false) }
  }
  return (
    <ScrollView className="page home" scrollY>
      <View className="home-hero">
        <View className="home-logo">
          <Text className="home-logo-badge"><IconWallet size={24} /></Text>
          <Text className="home-logo-text">一起记账</Text>
        </View>
        <Text className="home-tagline">像聊天一样记账，说一句话，自动变成一笔账。</Text>
        {joinHint ? (
          <Text style={{ marginTop: 12, padding: '10px 16px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 'var(--r-control)', fontSize: 13, fontWeight: 600 }}>{joinHint}</Text>
        ) : null}
      </View>
      <View className="card">
        <View className="field">
          <Text className="field-label">你的昵称</Text>
          <Input value={nickname} onInput={(e) => setNickname(e.detail.value)} placeholder="在这本账里怎么称呼你" confirmType="done" onConfirm={() => void submit()} />
        </View>
        <Text className="home-tip" style={{ display: 'block', marginBottom: 12 }}>微信一键进入，无需注册账号；数据自动同步云端，换设备不丢失</Text>
        {error ? (
          <View style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 'var(--r-control)' }}>{error}</View>
        ) : null}
        <Button className="btn-primary btn-block" onClick={() => void submit()} disabled={busy}>{busy ? '请稍候…' : '进入'}</Button>
      </View>
    </ScrollView>
  )
}
