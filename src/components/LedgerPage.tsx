import { Fragment, useEffect, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Category, Entry } from '../types'
import StatHeader from './StatHeader'
import CategoryStats from './CategoryStats'
import EntryBubble from './EntryBubble'
import EntryInput from './EntryInput'
import LedgerManage from './LedgerManage'
import { IconChart, IconGear } from './Icons'
import { setShare } from '../share'
import type { LedgerView } from '../store/useLedger'

interface Props {
  view: LedgerView
  onAddEntry: (text: string) => Promise<Entry>
  onUpdateEntry: (entryId: string, patch: { amount?: number; category?: Category; note?: string; rawText?: string }) => Promise<Entry>
  onDeleteEntry: (entryId: string) => Promise<void>
  onBack: () => void; onOpenStats: () => void
  onRename: (name: string) => Promise<void>; onRemoveMember: (memberId: string) => Promise<void>
  onUpdateNickname: (nickname: string) => Promise<void>; onRegenerateInvite: () => Promise<void>
  onUpdateCategories: (categories: string[]) => Promise<void>; onDeleteLedger: () => Promise<void>
}

export default function LedgerPage({ view, onAddEntry, onUpdateEntry, onDeleteEntry, onBack, onOpenStats, onRename, onRemoveMember, onUpdateNickname, onRegenerateInvite, onUpdateCategories, onDeleteLedger }: Props) {
  const { ledger, members, entries, myMember } = view
  const [toast, setToast] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [scrollTarget, setScrollTarget] = useState('')
  const activeEntries = entries.filter((e) => !e.deleted)
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const getDayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayLabel = (key: string) => { const [Y, M, D] = key.split('-').map(Number); return `${M}月${D}日 ${WEEK[new Date(Y, M - 1, D).getDay()]}` }
  const isOwner = ledger.ownerId === myMember.id || (!!myMember.uid && ledger.ownerId === myMember.uid)
  useEffect(() => { setShare(ledger) }, [ledger])
  useEffect(() => { if (activeEntries.length > 0) setScrollTarget(`e-${activeEntries[activeEntries.length - 1].id}`) }, [activeEntries.length])
  const handleAdd = async (text: string) => {
    try { await onAddEntry(text) }
    catch (e) { setToast(e instanceof Error ? e.message : '记账失败'); setTimeout(() => setToast(null), 3000) }
  }
  return (
    <View className="page ledger">
      <StatHeader ledgerName={ledger.name} entries={entries} memberCount={members.length} onBack={onBack} />
      <View className="ledger-actions">
        <Button className="ledger-action-btn" onClick={onOpenStats}><IconChart size={14} /> 统计</Button>
        <Button className="ledger-action-btn" onClick={() => setManageOpen(true)}><IconGear size={14} /> 管理</Button>
      </View>
      <CategoryStats entries={entries} />
      <ScrollView className="msg-list" scrollY enableFlex scrollIntoView={scrollTarget}>
        {activeEntries.length === 0 ? (
          <View className="empty"><Text className="empty-title">还没有账目</Text><Text className="empty-sub">在下面说一句，比如「吃烤鱼200元」</Text></View>
        ) : (
          activeEntries.map((e, i) => {
            const day = getDayKey(e.createdAt)
            const prevDay = i > 0 ? getDayKey(activeEntries[i - 1].createdAt) : ''
            return (<Fragment key={e.id}>
              {day !== prevDay && (<View className="msg-day-divider" id={`d-${day}`}><Text>{dayLabel(day)}</Text>{day === todayKey && <Text className="msg-day-today">今天</Text>}</View>)}
              <View id={`e-${e.id}`}><EntryBubble entry={e} myMemberId={myMember.id} isOwner={isOwner} onUpdate={(id, patch) => void onUpdateEntry(id, patch)} onDelete={(id) => void onDeleteEntry(id)} /></View>
            </Fragment>)
          })
        )}
      </ScrollView>
      <EntryInput onSend={handleAdd} disabled={false} />
      {toast ? <View className="toast">{toast}</View> : null}
      {manageOpen ? (
        <LedgerManage ledger={ledger} members={members} myMemberId={myMember.id} isOwner={isOwner} onRename={onRename} onRemoveMember={onRemoveMember} onUpdateNickname={onUpdateNickname} onRegenerateInvite={onRegenerateInvite} onUpdateCategories={onUpdateCategories} onDeleteLedger={onDeleteLedger} onClose={() => setManageOpen(false)} />
      ) : null}
    </View>
  )
}
