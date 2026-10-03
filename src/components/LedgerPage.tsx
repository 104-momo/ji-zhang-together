import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Category, Entry } from '../types'
import StatHeader from './StatHeader'
import CategoryStats from './CategoryStats'
import EntryBubble from './EntryBubble'
import EntryInput from './EntryInput'
import LedgerManage from './LedgerManage'
import AiChat from './AiChat'
import { IconChart, IconGear, IconAI, IconSearch, IconBudget } from './Icons'
import { setShare, resetShare } from '../share'
import { makeInviteToken } from '../services/invite'
import type { LedgerView } from '../store/useLedger'

interface Props {
  view: LedgerView
  onAddEntry: (text: string) => Promise<Entry>
  onUpdateEntry: (entryId: string, patch: { amount?: number; category?: Category; note?: string; rawText?: string }) => Promise<Entry>
  onDeleteEntry: (entryId: string) => Promise<void>
  onBack: () => void
  onOpenStats: () => void
  onOpenSearch: () => void
  onOpenBudget: () => void
  onRename: (name: string) => Promise<void>
  onRemoveMember: (memberId: string) => Promise<void>
  onUpdateNickname: (nickname: string) => Promise<void>
  onRegenerateInvite: () => Promise<void>
  onUpdateCategories: (categories: string[]) => Promise<void>
  onDeleteLedger: () => Promise<void>
  onGetReminderStatus: () => Promise<{ subscribed: boolean; templateConfigured: boolean }>
  onSubscribeReminder: () => Promise<{ ok: boolean; templateConfigured?: boolean }>
  onUnsubscribeReminder: () => Promise<void>
}

export default function LedgerPage({
  view,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onBack,
  onOpenStats,
  onOpenSearch,
  onOpenBudget,
  onRename,
  onRemoveMember,
  onUpdateNickname,
  onRegenerateInvite,
  onUpdateCategories,
  onDeleteLedger,
  onGetReminderStatus,
  onSubscribeReminder,
  onUnsubscribeReminder,
}: Props) {
  const { ledger, members, entries, myMember } = view
  const [toast, setToast] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [scrollTarget, setScrollTarget] = useState('')
  const activeEntries = entries.filter((e) => !e.deleted)
  const todayKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const getDayKey = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayLabel = (key: string) => {
    const [Y, M, D] = key.split('-').map(Number)
    return `${M}月${D}日 ${WEEK[new Date(Y, M - 1, D).getDay()]}`
  }
  const isOwner = ledger.ownerId === myMember.id || (!!myMember.uid && ledger.ownerId === myMember.uid)

  // 流水里出现过的日期（升序、去重）
  const dayKeys = useMemo(() => {
    const keys: string[] = []
    for (const e of activeEntries) {
      const k = getDayKey(e.createdAt)
      if (keys[keys.length - 1] !== k) keys.push(k)
    }
    return keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries])

  // 顶部统计跟随流水滚动位置：当前可视区所处的日期
  const [statDay, setStatDay] = useState('')
  const statDayKey = statDay || todayKey
  const dayTopsRef = useRef<Map<string, number>>(new Map())

  const pickDay = (scrollTop: number) => {
    const map = dayTopsRef.current
    if (!map.size || !dayKeys.length) return
    let cur = dayKeys[0]
    for (const k of dayKeys) {
      const top = map.get(k)
      if (top == null) continue
      if (top <= scrollTop + 2) cur = k
      else break
    }
    setStatDay((prev) => (prev === cur ? prev : cur))
  }

  // 渲染后测量每个日期分隔条在滚动内容里的位置（条目变化导致位置变化时重测）
  useEffect(() => {
    if (activeEntries.length === 0) return
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .selectAll('.msg-day-divider').boundingClientRect()
        .select('.msg-list').boundingClientRect()
        .select('.msg-list').scrollOffset()
        .exec((res: any[]) => {
          const divs = res?.[0]
          const listRect = res?.[1]
          const scroll = res?.[2]
          if (!Array.isArray(divs) || !listRect || !scroll) return
          const map = new Map<string, number>()
          for (const r of divs) {
            if (!r || !r.id) continue
            map.set(String(r.id).slice(2), r.top - listRect.top + scroll.scrollTop)
          }
          dayTopsRef.current = map
          pickDay(scroll.scrollTop)
        })
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  // 当前统计日期被删空时回退到最新一天
  useEffect(() => {
    if (statDay && dayKeys.length && !dayKeys.includes(statDay)) {
      setStatDay(dayKeys[dayKeys.length - 1])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statDay, dayKeys.join(',')])

  useEffect(() => {
    setShare(ledger)
    return () => resetShare()
  }, [ledger])

  useEffect(() => {
    if (activeEntries.length > 0) {
      setScrollTarget(`e-${activeEntries[activeEntries.length - 1].id}`)
    }
  }, [activeEntries.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (text: string) => {
    try {
      await onAddEntry(text)
      setStatDay(todayKey)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '记账失败')
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <View className="page ledger">
      <StatHeader
        ledgerName={ledger.name}
        entries={entries}
        memberCount={members.length}
        monthlyBudget={ledger.monthlyBudget}
        onBack={onBack}
        onInvite={() => Taro.setClipboardData({
          data: makeInviteToken(ledger),
          success: () => Taro.showToast({ title: '邀请口令已复制，去微信发给好友', icon: 'none' }),
          fail: () => Taro.showToast({ title: '复制失败', icon: 'none' }),
        })}
      />
      <View className="ledger-actions">
        <Button className="ledger-action-btn" onClick={onOpenStats}><IconChart size={14} /> 统计</Button>
        <Button className="ledger-action-btn" onClick={onOpenSearch}><IconSearch size={14} /> 搜索</Button>
        <Button className="ledger-action-btn" onClick={onOpenBudget}><IconBudget size={14} /> 预算</Button>
        <Button className="ledger-action-btn" onClick={() => setManageOpen(true)}><IconGear size={14} /> 管理</Button>
        <Button className="ledger-action-btn" onClick={() => setAiOpen(true)}><IconAI size={14} /> AI助手</Button>
      </View>
      <CategoryStats entries={entries} members={members} categories={ledger.categories || undefined} dayKey={statDayKey} />
      <ScrollView className="msg-list" scrollY enableFlex scrollIntoView={scrollTarget} onScroll={(e) => pickDay(e.detail.scrollTop)}>
        {activeEntries.length === 0 ? (
          <View className="empty">
            <Text className="empty-title">还没有账目</Text>
            <Text className="empty-sub">在下面说一句，比如「吃烤鱼200元」</Text>
          </View>
        ) : (
          activeEntries.map((e, i) => {
            const day = getDayKey(e.createdAt)
            const prevDay = i > 0 ? getDayKey(activeEntries[i - 1].createdAt) : ''
            return (
              <Fragment key={e.id}>
                {day !== prevDay && (
                  <View className="msg-day-divider" id={`d-${day}`}>
                    <Text>{dayLabel(day)}</Text>
                    {day === todayKey && <Text className="msg-day-today">今天</Text>}
                  </View>
                )}
                <View id={`e-${e.id}`}>
                  <EntryBubble
                    entry={e}
                    myMemberId={myMember.id}
                    isOwner={isOwner}
                    categories={ledger.categories || undefined}
                    onUpdate={(id, patch) => void onUpdateEntry(id, patch)}
                    onDelete={(id) => void onDeleteEntry(id)}
                  />
                </View>
              </Fragment>
            )
          })
        )}
      </ScrollView>
      <EntryInput onSend={handleAdd} disabled={false} />
      {toast ? <View className="toast">{toast}</View> : null}
      {aiOpen ? (
        <AiChat
          ledgerName={ledger.name}
          entries={entries}
          members={members}
          onClose={() => setAiOpen(false)}
        />
      ) : null}
      {manageOpen ? (
        <LedgerManage
          ledger={ledger}
          members={members}
          myMemberId={myMember.id}
          isOwner={isOwner}
          onRename={onRename}
          onRemoveMember={onRemoveMember}
          onUpdateNickname={onUpdateNickname}
          onRegenerateInvite={onRegenerateInvite}
          onUpdateCategories={onUpdateCategories}
          onDeleteLedger={onDeleteLedger}
          onClose={() => setManageOpen(false)}
          onGetReminderStatus={onGetReminderStatus}
          onSubscribeReminder={onSubscribeReminder}
          onUnsubscribeReminder={onUnsubscribeReminder}
        />
      ) : null}
    </View>
  )
}
