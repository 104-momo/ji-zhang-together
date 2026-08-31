import { useEffect, useRef, useState } from 'react'
import type { Category, Entry } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR, avatarColor } from '../utils/colors'
import { IconPencil, IconTrash } from './Icons'
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function isDeleted(e: Entry): boolean {
  return e.amount === 0 && (e.note || '').includes('【已删除】')
}
interface Props {
  entry: Entry
  myMemberId: string
  isOwner: boolean
  onUpdate: (entryId: string, patch: { amount?: number; category?: Category; note?: string }) => void
  onDelete: (entryId: string) => void
}
export default function EntryBubble({ entry, myMemberId, isOwner, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(entry.amount))
  const [category, setCategory] = useState<Category>(entry.category)
  const [note, setNote] = useState(entry.note ?? '')
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (editing && panelRef.current) {
      panelRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [editing])
  const mine = entry.memberId === myMemberId
  const canEdit = mine || isOwner
  const deleted = isDeleted(entry)
  const lastHistory = entry.history.length > 0 ? entry.history[entry.history.length - 1] : null
  const save = () => {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    onUpdate(entry.id, { amount: amt, category, note: note.trim() || undefined })
    setEditing(false)
  }
  if (deleted) {
    return (
      <div className="bubble-row">
        <div className="bubble-col" style={{ maxWidth: '100%' }}>
          <div className="bubble deleted" style={{ background: 'transparent', border: '1px dashed var(--line-strong)', boxShadow: 'none' }}>
            <span className="deleted-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {entry.nickname} 删除了一笔账
            </span>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={`bubble-row ${mine ? 'mine' : ''}`}>
      {!mine ? (
        <div className="bubble-avatar" style={{ background: avatarColor(entry.memberId) }}>
          {entry.nickname.slice(0, 1)}
        </div>
      ) : null}
      <div className="bubble-col">
        <div className="bubble-meta">
          <span className="nick">{entry.nickname}</span>
          <span className="time"> · {fmtTime(entry.createdAt)}</span>
          {canEdit ? (
            <button
              className="bubble-edit-btn"
              onClick={(e) => {
                e.stopPropagation()
                setEditing((v) => !v)
              }}
              aria-label="编辑"
            >
              <IconPencil size={12} /> 编辑
            </button>
          ) : null}
        </div>
        <div className="bubble" onClick={() => canEdit && setEditing((v) => !v)}>
          <div className="bubble-main">
            <span className="desc">{entry.rawText || entry.category}</span>
            <span className="amount">¥{entry.amount.toFixed(2)}</span>
          </div>
          <div className="bubble-sub">
            <span className="cat-tag" style={{ background: CATEGORY_COLOR_VAR[entry.category] }}>
              {entry.category}
            </span>
            {entry.note ? <span className="note">{entry.note}</span> : null}
          </div>
          {lastHistory ? (
            <div className="history">
              {lastHistory.nickname} {lastHistory.action === '修改' ? '修改过' : '删除过'}
            </div>
          ) : null}
        </div>
        {editing && canEdit ? (
          <div className="edit-panel" ref={panelRef} style={{ background: 'var(--surface)', borderRadius: 'var(--r-card)', padding: 10, marginTop: 6, border: '1px solid var(--line)' }}>
            <div className="edit-row">
              <input
                className="edit-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="金额"
              />
              <select className="edit-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（可选）"
            />
            <div className="edit-actions">
              <button className="btn-del" onClick={() => onDelete(entry.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IconTrash size={12} /> 删除
              </button>
              <button className="btn-cancel" onClick={() => setEditing(false)}>
                取消
              </button>
              <button className="btn-save" onClick={save}>
                保存
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
