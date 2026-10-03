import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Image, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import type { Ledger } from '../types'
import { IconWallet, IconUsers, IconChevronRight, IconSignOut, IconPlus, IconX, IconPencil } from './Icons'
import { auth } from '../services/auth'
import { api } from '../services'
import { parseInviteToken } from '../services/invite'
import { currentMonth, getMonth } from '../utils/stats'
import paperImg from '../assets/paper-green.jpg'
import emptyImg from '../assets/empty-ledger.jpg'

interface Props {
  myLedgers: Ledger[]; loading?: boolean; error?: string | null; onRefresh?: () => void
  onCreate: (name: string, nickname: string) => Promise<void>; onOpen: (ledgerId: string) => void
  onJoin: (ledgerId: string, code: string, nickname: string) => Promise<void>
}

interface CoverStat { spent: number; count: number; members: number }

const NAME_IDEAS = ['和小王的合租账', '情侣日常', '旅行基金', '宝宝花销']
/** 主卡（墨绿底）用亮点，小卡（浅纸底）用深点 */
const DOTS_MAIN = ['#F3ECDC', '#D27E3D', '#9CC4B4']
const DOTS_MINI = ['#2C6350', '#D27E3D', '#7FA99B']

function todayText(): string {
  const d = new Date()
  const week = '日一二三四五六'[d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
}

function CoverCard({ ledger, stat, main, onOpen }: {
  ledger: Ledger; stat?: CoverStat; main: boolean; onOpen: () => void
}) {
  const dots = Array.from({ length: Math.min(stat?.members ?? 0, 3) })
  const palette = main ? DOTS_MAIN : DOTS_MINI
  return (
    <View className={main ? 'hm-ledger' : 'hm-ledger hm-mini'} onClick={onOpen} hoverClass='hm-ledger-hover'>
      {main ? <Image className='hm-grain' src={paperImg} mode='aspectFill' /> : null}
      {main ? <View className='hm-ribbon' /> : null}
      {main ? <View className='hm-bind' /> : null}
      <View className='hm-lg-hd'>
        <View className='hm-lg-ic'><IconWallet size={main ? 24 : 20} /></View>
        <View className='hm-lg-name'>
          <Text className='hm-lg-title'>{ledger.name}</Text>
          <Text className='hm-lg-sub'>
            <IconUsers size={13} />
            {stat ? `${stat.members} 人共记` : '加载中…'}
          </Text>
        </View>
        {dots.length > 0 ? (
          <View className='hm-avatars'>
            {dots.map((_, i) => (
              <View key={i} className='hm-dot' style={{ background: palette[i % palette.length] }} />
            ))}
          </View>
        ) : null}
      </View>
      <View className='hm-lg-bd'>
        <View className='hm-stat'>
          <Text className='hm-stat-k'>本月支出</Text>
          <Text className={main ? 'hm-stat-v hm-accent' : 'hm-stat-v hm-accent mini'}>
            <Text className='hm-yen'>¥</Text>{stat ? stat.spent.toFixed(2) : '—'}
          </Text>
        </View>
        <View className='hm-stat hm-stat-sub'>
          <Text className='hm-stat-k'>本月笔数</Text>
          <Text className={main ? 'hm-stat-v hm-plain' : 'hm-stat-v hm-plain mini'}>
            {stat ? stat.count : '—'}<Text className='hm-unit'> 笔</Text>
          </Text>
        </View>
        <View className={main ? 'hm-go' : 'hm-go mini'} onClick={(e) => { e.stopPropagation(); onOpen() }} hoverClass='hm-go-hover'>
          <IconChevronRight size={main ? 22 : 18} />
        </View>
      </View>
    </View>
  )
}

export default function HomePage({ myLedgers, loading, error, onRefresh, onCreate, onOpen, onJoin }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState(auth.getCurrentUser()?.nickname || '')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [joining, setJoining] = useState(false)
  const [modal, setModal] = useState<'join' | 'create' | null>(null)
  const [stats, setStats] = useState<Record<string, CoverStat>>({})

  /* 首页封面卡需要每本账本的本月支出/笔数/人数：账本数量很少，逐本拉取全量数据后本地聚合 */
  useEffect(() => {
    let cancelled = false
    if (loading || myLedgers.length === 0) return
    const month = currentMonth()
    Promise.all(myLedgers.map(async (l): Promise<[string, CoverStat] | null> => {
      try {
        const full = await api.getLedgerFull(l.id)
        const monthEntries = full.entries.filter((e) => !e.deleted && getMonth(e.createdAt) === month)
        return [l.id, {
          spent: monthEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
          count: monthEntries.length,
          members: full.members.length,
        }]
      } catch {
        return null
      }
    })).then((rows) => {
      if (cancelled) return
      const next: Record<string, CoverStat> = {}
      rows.forEach((r) => { if (r) next[r[0]] = r[1] })
      setStats(next)
    })
    return () => { cancelled = true }
  }, [myLedgers, loading])

  const closeModal = () => setModal(null)

  const handleSignOut = () => {
    Taro.showModal({
      title: '退出登录',
      content: '退出后本机需要重新进入，确定退出吗？',
      confirmText: '退出',
      confirmColor: '#c0504a',
      success: (res) => { if (res.confirm) void auth.signOut() },
    })
  }

  const handleRefresh = () => {
    onRefresh?.()
    Taro.showToast({ title: '账本已刷新', icon: 'none', duration: 900 })
  }

  const submit = async () => {
    const nick = nickname.trim() || auth.getCurrentUser()?.nickname || '我'
    if (!nick) { Taro.showToast({ title: '请先填写昵称', icon: 'none' }); return }
    setBusy(true)
    try {
      await onCreate(name.trim() || '我的账本', nick)
      setName(''); closeModal()
    } finally { setBusy(false) }
  }

  const pasteToken = async () => {
    try {
      const res = await Taro.getClipboardData()
      if (res.data) { setToken(res.data); Taro.showToast({ title: '已粘贴剪贴板内容', icon: 'none', duration: 900 }) }
      else Taro.showToast({ title: '剪贴板是空的', icon: 'none' })
    } catch {
      Taro.showToast({ title: '读取剪贴板失败', icon: 'none' })
    }
  }

  const submitJoin = async () => {
    const parsed = parseInviteToken(token)
    if (!parsed) { Taro.showToast({ title: '口令无效，请复制好友发的完整消息', icon: 'none' }); return }
    const nick = nickname.trim() || auth.getCurrentUser()?.nickname || '我'
    setJoining(true)
    try {
      await onJoin(parsed.ledgerId, parsed.code, nick)
      setToken(''); closeModal()
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加入失败', icon: 'none' })
    } finally { setJoining(false) }
  }

  const isEmpty = !loading && !error && myLedgers.length === 0

  return (
    <View className='hm-page'>
      <ScrollView className='hm-scroll' scrollY>
        <View className='hm-top'>
          <View className='hm-hello'>
            <Text className='hm-hi'>今天也要好好记账呀</Text>
            <Text className='hm-date'>{todayText()} · 和好友把小钱钱记明白</Text>
          </View>
          <View className='hm-topbtns'>
            <View className='hm-iconbtn' onClick={handleRefresh} hoverClass='hm-iconbtn-hover'>
              <Text className='hm-ic-glyph'>↻</Text>
            </View>
            <View className='hm-iconbtn hm-warn' onClick={handleSignOut} hoverClass='hm-iconbtn-hover'>
              <IconSignOut size={16} />
            </View>
          </View>
        </View>

        {loading && myLedgers.length === 0 ? (
          <View className='hm-state'>正在加载账本…</View>
        ) : error ? (
          <View className='hm-state hm-state-err'>
            <Text className='hm-err-text'>{error}</Text>
            <View className='hm-retry' onClick={() => onRefresh?.()} hoverClass='hm-retry-hover'>重试</View>
          </View>
        ) : isEmpty ? (
          <View className='hm-empty'>
            <Image className='hm-empty-art' src={emptyImg} mode='widthFix' />
            <Text className='hm-empty-title'>还没有账本</Text>
            <Text className='hm-empty-p'>建一本新账开始记账，{'\n'}或粘贴好友发来的口令一起记</Text>
          </View>
        ) : (
          <View className='hm-listwrap'>
            <View className='hm-sechd'>
              <Text className='hm-sect'>我的账本</Text>
              <View className='hm-rule' />
              <Text className='hm-cnt'>{myLedgers.length} 本</Text>
            </View>
            {myLedgers.map((l, i) => (
              <CoverCard key={l.id} ledger={l} stat={stats[l.id]} main={i === 0} onOpen={() => onOpen(l.id)} />
            ))}
            <Text className='hm-foot-tip'>邀请朋友：进入账本 →「管理」→「复制邀请口令」，发给好友粘贴加入</Text>
          </View>
        )}
      </ScrollView>

      {/* 底部拇指区 */}
      <View className='hm-dock'>
        <View className='hm-ghost' onClick={() => setModal('join')} hoverClass='hm-dock-hover'>
          <Text className='hm-ic-glyph'>→</Text> 加入账本
        </View>
        <View className='hm-main' onClick={() => setModal('create')} hoverClass='hm-dock-hover'>
          <IconPlus size={18} /> 建新账
        </View>
      </View>

      {/* 遮罩 */}
      <View className={modal ? 'hm-scrim on' : 'hm-scrim'} onClick={closeModal} />

      {/* 加入账本 */}
      <View className={modal === 'join' ? 'hm-modal on' : 'hm-modal'}>
        <View className='hm-grab' />
        <View className='hm-m-hd'>
          <View className='hm-m-txt'>
            <Text className='hm-m-title'>加入好友的账本</Text>
            <Text className='hm-m-sub'>把好友发来的邀请消息整段粘贴，就能和 TA 一起记</Text>
          </View>
          <View className='hm-m-x' onClick={closeModal} hoverClass='hm-iconbtn-hover'><IconX size={15} /></View>
        </View>
        <View className='hm-field'>
          <Text className='hm-label'>邀请口令</Text>
          <View className='hm-paste-wrap'>
            <Textarea
              className='hm-textarea'
              value={token}
              onInput={(e) => setToken(e.detail.value)}
              placeholder='把好友发你的邀请消息整段粘贴到这里'
              placeholderStyle='color:#908979'
              maxlength={300}
            />
            <View className='hm-paste-mini' onClick={() => void pasteToken()} hoverClass='hm-dock-hover'>
              <Text className='hm-ic-glyph'>📋</Text> 粘贴
            </View>
          </View>
        </View>
        <View className='hm-field'>
          <Text className='hm-label'>你的昵称</Text>
          <Input
            className='hm-input'
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
            placeholder='在这本账里怎么称呼你'
            placeholderStyle='color:#908979'
            maxlength={12}
          />
        </View>
        <View className='hm-note'>
          <IconWallet size={14} />
          <Text className='hm-note-txt'>无需注册账号，微信一键进入；数据自动同步云端，换设备不丢失</Text>
        </View>
        <View
          className={joining || !token.trim() ? 'hm-submit disabled' : 'hm-submit'}
          onClick={() => { if (!joining && token.trim()) void submitJoin() }}
          hoverClass='hm-dock-hover'
        >
          <Text className='hm-ic-glyph'>→</Text> {joining ? '加入中…' : '加入账本'}
        </View>
      </View>

      {/* 建新账 */}
      <View className={modal === 'create' ? 'hm-modal on' : 'hm-modal'}>
        <View className='hm-grab' />
        <View className='hm-m-hd'>
          <View className='hm-m-txt'>
            <Text className='hm-m-title'>建一本新账</Text>
            <Text className='hm-m-sub'>给账本起个名字，之后可以邀请好友一起记</Text>
          </View>
          <View className='hm-m-x' onClick={closeModal} hoverClass='hm-iconbtn-hover'><IconX size={15} /></View>
        </View>
        <View className='hm-field'>
          <Text className='hm-label'>账本名称</Text>
          <Input
            className='hm-input'
            value={name}
            onInput={(e) => setName(e.detail.value)}
            placeholder='如：和小王的合租账'
            placeholderStyle='color:#908979'
            maxlength={20}
            confirmType='done'
          />
          <View className='hm-chips'>
            {NAME_IDEAS.map((idea) => (
              <View
                key={idea}
                className={name === idea ? 'hm-chip on' : 'hm-chip'}
                onClick={() => setName(name === idea ? '' : idea)}
                hoverClass='hm-dock-hover'
              >{idea}</View>
            ))}
          </View>
        </View>
        <View
          className={busy ? 'hm-submit disabled' : 'hm-submit'}
          onClick={() => { if (!busy) void submit() }}
          hoverClass='hm-dock-hover'
        >
          <IconPencil size={17} /> {busy ? '创建中…' : '创建并进入'}
        </View>
      </View>
    </View>
  )
}
