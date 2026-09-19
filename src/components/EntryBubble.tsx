import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import type { Category, Entry } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR, avatarColor } from '../utils/colors'
import { IconPencil, IconTrash } from './Icons'

function fmtTime(ts: number): string { const d = new Date(ts); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function isDeleted(e: Entry): boolean { return e.amount === 0 && (e.note || '').includes('【已删除】') }

interface Props {
  entry: Entry; myMemberId: string; isOwner: boolean
  onUpdate: (entryId: string, patch: { amount?: number; category?: Category; note?: string; rawText?: string }) => void
  onDelete: (entryId: string) => void
}

export default function EntryBubble({ entry, myMemberId, isOwner, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(entry.amount))
  const [category, setCategory] = useState<Category>(entry.category)
  const [note, setNote] = useState(entry.note ?? '')
  const [text, setText] = useState(entry.rawText ?? entry.category)
  useEffect(() => { if (editing) { setAmount(String(entry.amount)); setCategory(entry.category); setNote(entry.note ?? ''); setText(entry.rawText ?? entry.category) } }, [editing])
  const mine = entry.memberId === myMemberId
  const canEdit = mine || isOwner
  const deleted = isDeleted(entry)
  const lastHistory = entry.history.length > 0 ? entry.history[entry.history.length - 1] : null
  const catIndex = Math.max(0, CATEGORIES.indexOf(category))
  const save = () => {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    onUpdate(entry.id, { amount: amt, category, note: note.trim() || undefined, rawText: text.trim() || undefined })
    setEditing(false)
  }
  const handleDelete = () => { Taro.showModal({ title: '删除这笔账？', content: '删除后将保留一条留痕记录，其他人可见。', confirmText: '删除', confirmColor: '#c0504a', success: (res) => { if (res.confirm) onDelete(entry.id) } }) }
  if (deleted) return (<View className="bubble-row"><View className="bubble-col" style={{ maxWidth: '100%' }}><View className="bubble deleted" style={{ background: 'transparent', border: '1px dashed var(--line-strong)', boxShadow: 'none' }}><Text className="deleted-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{entry.nickname} 删除了一笔账</Text></View></View></View>)
  return (
    <View className={`bubble-row ${mine ? 'mine' : ''}`}>
      {!mine ? (<View className="bubble-avatar" style={{ background: avatarColor(entry.memberId) }}>{entry.nickname.slice(0, 1)}</View>) : null}
      <View className="bubble-col">
        <View className="bubble-meta">
          <Text className="nick">{entry.nickname}</Text>
          <Text className="time"> · {fmtTime(entry.createdAt)}</Text>
          {canEdit ? (<Button className="bubble-edit-btn" onClick={() => setEditing((v) => !v)} aria-label="编辑"><IconPencil size={12} /> 编辑</Button>) : null}
        </View>
        <View className="bubble" onClick={() => canEdit && setEditing((v) => !v)}>
          <View className="bubble-main">
            <Text className="desc">{entry.rawText || entry.category}</Text>
            <Text className="amount">¥{entry.amount.toFixed(2)}</Text>
          </View>
          <View className="bubble-sub">
            <Text className="cat-tag" style={{ background: CATEGORY_COLOR_VAR[entry.category] }}>{entry.category}</Text>
            {entry.note ? <Text className="note">{entry.note}</Text> : null}
          </View>
          {lastHistory ? (<View className="history">{lastHistory.nickname} {lastHistory.action === '修改' ? '修改过' : '删除过'}</View>) : null}
        </View>
        {editing && canEdit ? (
          <View className="edit-panel" style={{ borderRadius: 'var(--r-card)', padding: 10, marginTop: 6, border: '1px solid var(--line)' }}>
            <View className="edit-row">
              <Input className="edit-amount" type="digit" value={amount} onInput={(e) => setAmount(e.detail.value)} placeholder="金额" />
              <Picker mode="selector" range={CATEGORIES as unknown as string[]} value={catIndex} onChange={(e) => setCategory(CATEGORIES[Number(e.detail.value)])}>
                <View className="edit-cat">{category} ▾</View>
              </Picker>
            </View>
            <Input className="edit-text" value={text} onInput={(e) => setText(e.detail.value)} placeholder="记账内容（一开始输入的文字）" />
            <Input className="edit-note" value={note} onInput={(e) => setNote(e.detail.value)} placeholder="备注（可选）" />
            <View className="edit-actions">
              <Button className="btn-del" onClick={handleDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconTrash size={12} /> 删除</Button>
              <Button className="btn-cancel" onClick={() => setEditing(false)}>取消</Button>
              <Button className="btn-save" onClick={save}>保存</Button>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
