import { useEffect, useRef, useState } from 'react'
import type { Category, Entry } from '../types'
import StatHeader from './StatHeader'
import CategoryStats from './CategoryStats'
import EntryBubble from './EntryBubble'
import EntryInput from './EntryInput'
import LedgerManage from './LedgerManage'
import { IconChart, IconGear } from './Icons'
import { createInviteLink } from '../services/mock'
import type { LedgerView } from '../store/useLedger'
interface Props {
  view: LedgerView
  onAddEntry: (text: string) => Promise<Entry>
  onUpdateEntry: (entryId: string, patch: { amount?: number; category?: Category; note?: string }) => Promise<Entry>
  onDeleteEntry: (entryId: string) => Promise<void>
  onBack: () => void
  onOpenStats: () => void
  onRename: (name: string) => Promise<void>
  onRemoveMember: (memberId: string) => Promise<void>
  onRegenerateInvite: () => Promise<void>
  onUpdateCategories: (categories: string[]) => Promise<void>
}
export default function LedgerPage({
  view,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onBack,
  onOpenStats,
  onRename,
  onRemoveMember,
  onRegenerateInvite,
  onUpdateCategories,
}: Props) {
  const { ledger, members, entries, myMember } = view
  const [toast, setToast] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  // 兼容判断创建者：CloudBase 模式 ledger.ownerId 是 uid，与 myMember.uid 对应；mock 模式 ownerId 是 member.id
  const isOwner = ledger.ownerId === myMember.id || (!!myMember.uid && ledger.ownerId === myMember.uid)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])
  const share = async () => {
    const link = createInviteLink(ledger)
    try {
      await navigator.clipboard.writeText(link)
      setToast('邀请链接已复制，发给朋友即可加入')
    } catch {
      setToast(link)
    }
    setTimeout(() => setToast(null), 3000)
  }
  const handleAdd = async (text: string) => {
    try {
      await onAddEntry(text)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '记账失败')
      setTimeout(() => setToast(null), 3000)
    }
  }
  return (
    <div className="page ledger">
      <StatHeader
        ledgerName={ledger.name}
        entries={entries}
        memberCount={members.length}
        onShare={share}
        onBack={onBack}
      />
      <div className="ledger-actions">
        <button className="ledger-action-btn" onClick={onOpenStats}><IconChart size={14} /> 统计</button>
        <button className="ledger-action-btn" onClick={() => setManageOpen(true)}><IconGear size={14} /> 管理</button>
      </div>
      <CategoryStats entries={entries} />
      <div className="msg-list" ref={listRef}>
        {entries.length === 0 ? (
          <div className="empty">
            <p>还没有账目</p>
            <p className="empty-sub">在下面说一句，比如「吃烤鱼200元」</p>
          </div>
        ) : (
          entries.map((e) => (
            <EntryBubble
              key={e.id}
              entry={e}
              myMemberId={myMember.id}
              isOwner={isOwner}
              onUpdate={(id, patch) => void onUpdateEntry(id, patch)}
              onDelete={(id) => void onDeleteEntry(id)}
            />
          ))
        )}
      </div>
      <EntryInput onSend={handleAdd} disabled={false} />
      {toast ? <div className="toast">{toast}</div> : null}
      {manageOpen ? (
        <LedgerManage
          ledger={ledger}
          members={members}
          myMemberId={myMember.id}
          isOwner={isOwner}
          onRename={onRename}
          onRemoveMember={onRemoveMember}
          onRegenerateInvite={onRegenerateInvite}
          onUpdateCategories={onUpdateCategories}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </div>
  )
}
