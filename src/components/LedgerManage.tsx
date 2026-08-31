import { useState } from 'react'
import type { Ledger, Member } from '../types'
import { CATEGORIES } from '../types'
import { IconX } from './Icons'
interface Props {
  ledger: Ledger
  members: Member[]
  myMemberId: string
  isOwner: boolean
  onRename: (name: string) => Promise<void>
  onRemoveMember: (memberId: string) => Promise<void>
  onUpdateNickname: (nickname: string) => Promise<void>
  onRegenerateInvite: () => Promise<void>
  onUpdateCategories: (categories: string[]) => Promise<void>
  onDeleteLedger: () => Promise<void>
  onClose: () => void
}
export default function LedgerManage({
  ledger,
  members,
  myMemberId,
  isOwner,
  onRename,
  onRemoveMember,
  onUpdateNickname,
  onRegenerateInvite,
  onUpdateCategories,
  onDeleteLedger,
  onClose,
}: Props) {
  const [name, setName] = useState(ledger.name)
  const [cats, setCats] = useState<string[]>(ledger.categories?.length ? ledger.categories : [...CATEGORIES])
  const [newCat, setNewCat] = useState('')
  const [myNick, setMyNick] = useState(() => members.find((m) => m.id === myMemberId)?.nickname || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const showMsg = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }
  const handleRename = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onRename(name)
      showMsg('账本名已更新')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  const handleRemove = async (memberId: string) => {
    if (busy) return
    if (!confirm('确定移除该成员？其历史账目保留。')) return
    setBusy(true)
    try {
      await onRemoveMember(memberId)
      showMsg('已移除成员')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  const handleRegenerate = async () => {
    if (busy) return
    if (!confirm('重新生成邀请码后，旧链接将失效。确定？')) return
    setBusy(true)
    try {
      await onRegenerateInvite()
      showMsg('邀请码已重新生成')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  const handleUpdateNickname = async () => {
    if (!myNick.trim() || busy) return
    setBusy(true)
    try {
      await onUpdateNickname(myNick.trim())
      showMsg('昵称已更新')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  const addCat = () => {
    const c = newCat.trim()
    if (!c || cats.includes(c)) return
    setCats([...cats, c])
    setNewCat('')
  }
  const removeCat = (c: string) => {
    setCats(cats.filter((x) => x !== c))
  }
  const handleSaveCats = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onUpdateCategories(cats)
      showMsg('分类已更新')
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  const handleDeleteLedger = async () => {
    if (busy) return
    if (!confirm('删除账本将同时删除所有账目和成员记录，且不可恢复。确定删除这本账？')) return
    setBusy(true)
    try {
      await onDeleteLedger()
      onClose() // 删除成功后关闭弹窗（当前账本由 useLedger 切回首页）
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '操作失败')
    }
    setBusy(false)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>账本管理</span>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconX size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="manage-section">
            <div className="manage-title">我的昵称（在这本账里显示的名字）</div>
            <div className="manage-row">
              <input className="manage-input" value={myNick} onChange={(e) => setMyNick(e.target.value)} placeholder="你的昵称" />
              <button className="btn-primary btn-sm" onClick={handleUpdateNickname} disabled={busy}>保存</button>
            </div>
          </div>
          {!isOwner ? (
            <div className="manage-notice">只有账本创建者可以管理此账本</div>
          ) : (
            <>
              <div className="manage-section">
                <div className="manage-title">账本名称</div>
                <div className="manage-row">
                  <input className="manage-input" value={name} onChange={(e) => setName(e.target.value)} />
                  <button className="btn-primary btn-sm" onClick={handleRename} disabled={busy}>保存</button>
                </div>
              </div>
              <div className="manage-section">
                <div className="manage-title">成员（{members.length} 人）</div>
                <div className="member-list">
                  {members.map((m) => (
                    <div key={m.id} className="member-item">
                      <span className="member-name">
                        {m.nickname}
                        {m.id === myMemberId ? '（我）' : ''}
                        {m.uid ? m.uid === ledger.ownerId : m.id === ledger.ownerId ? (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 7px', borderRadius: 999 }}>
                            创建者
                          </span>
                        ) : null}
                      </span>
                      {m.id !== myMemberId && !(m.uid ? m.uid === ledger.ownerId : m.id === ledger.ownerId) ? (
                        <button className="btn-danger btn-sm" onClick={() => handleRemove(m.id)} disabled={busy}>移除</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="manage-section">
                <div className="manage-title">邀请链接</div>
                <div className="manage-row">
                  <span className="manage-hint">当前邀请码：{ledger.inviteCode}</span>
                  <button className="btn-warn btn-sm" onClick={handleRegenerate} disabled={busy}>重新生成</button>
                </div>
              </div>
              <div className="manage-section">
                <div className="manage-title">分类管理</div>
                <div className="cat-manage-list">
                  {cats.map((c) => (
                    <div key={c} className="cat-manage-item">
                      <span>{c}</span>
                      <button onClick={() => removeCat(c)} aria-label={`删除${c}`}>
                        <IconX size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="manage-row" style={{ marginBottom: 10 }}>
                  <input
                    className="manage-input"
                    placeholder="新分类名"
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCat()}
                  />
                  <button className="btn-primary btn-sm" onClick={addCat}>添加</button>
                </div>
                <button className="btn-primary btn-block" onClick={handleSaveCats} disabled={busy}>保存分类</button>
              </div>
              <div className="manage-section manage-danger">
                <div className="manage-title">危险操作</div>
                <button className="btn-danger btn-block" onClick={handleDeleteLedger} disabled={busy}>删除账本</button>
              </div>
            </>
          )}
        </div>
        {msg ? <div className="modal-msg">{msg}</div> : null}
      </div>
    </div>
  )
}
