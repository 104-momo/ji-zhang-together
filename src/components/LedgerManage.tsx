import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { Ledger, Member } from '../types'
import { CATEGORIES } from '../types'
import { IconX } from './Icons'

interface Props {
  ledger: Ledger; members: Member[]; myMemberId: string; isOwner: boolean
  onRename: (name: string) => Promise<void>; onRemoveMember: (memberId: string) => Promise<void>
  onUpdateNickname: (nickname: string) => Promise<void>; onRegenerateInvite: () => Promise<void>
  onUpdateCategories: (categories: string[]) => Promise<void>; onDeleteLedger: () => Promise<void>; onClose: () => void
}

function confirmAsync(content: string, title = '提示'): Promise<boolean> {
  return new Promise((resolve) => { Taro.showModal({ title, content, confirmText: '确定', success: (res) => resolve(!!res.confirm), fail: () => resolve(false) }) })
}

export default function LedgerManage({ ledger, members, myMemberId, isOwner, onRename, onRemoveMember, onUpdateNickname, onRegenerateInvite, onUpdateCategories, onDeleteLedger, onClose }: Props) {
  const [name, setName] = useState(ledger.name)
  const [cats, setCats] = useState<string[]>(ledger.categories?.length ? ledger.categories : [...CATEGORIES])
  const [newCat, setNewCat] = useState('')
  const [myNick, setMyNick] = useState(() => members.find((m) => m.id === myMemberId)?.nickname || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500) }
  const copyInvite = () => { Taro.setClipboardData({ data: `${ledger.name} 邀请码：${ledger.inviteCode}`, success: () => showMsg('邀请码已复制'), fail: () => showMsg('复制失败') }) }
  const handleRename = async () => { if (!name.trim() || busy) return; setBusy(true); try { await onRename(name); showMsg('账本名已更新') } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  const handleRemove = async (memberId: string) => { if (busy) return; if (!(await confirmAsync('确定移除该成员？其历史账目保留。'))) return; setBusy(true); try { await onRemoveMember(memberId); showMsg('已移除成员') } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  const handleRegenerate = async () => { if (busy) return; if (!(await confirmAsync('重新生成邀请码后，旧链接将失效。确定？'))) return; setBusy(true); try { await onRegenerateInvite(); showMsg('邀请码已重新生成') } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  const handleUpdateNickname = async () => { if (!myNick.trim() || busy) return; setBusy(true); try { await onUpdateNickname(myNick.trim()); showMsg('昵称已更新') } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  const addCat = () => { const c = newCat.trim(); if (!c || cats.includes(c)) return; setCats([...cats, c]); setNewCat('') }
  const removeCat = (c: string) => { setCats(cats.filter((x) => x !== c)) }
  const handleSaveCats = async () => { if (busy) return; setBusy(true); try { await onUpdateCategories(cats); showMsg('分类已更新') } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  const handleDeleteLedger = async () => { if (busy) return; if (!(await confirmAsync('删除账本将同时删除所有账目和成员记录，且不可恢复。确定删除这本账？'))) return; setBusy(true); try { await onDeleteLedger(); onClose() } catch (e) { showMsg(e instanceof Error ? e.message : '操作失败') } setBusy(false) }
  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="modal" onClick={(e) => e.stopPropagation()}>
        <View className="modal-header"><Text>账本管理</Text><Button className="modal-close" onClick={onClose} aria-label="关闭"><IconX size={15} /></Button></View>
        <View className="modal-body">
          <View className="manage-section">
            <View className="manage-title">我的昵称（在这本账里显示的名字）</View>
            <View className="manage-row">
              <Input className="manage-input" value={myNick} onInput={(e) => setMyNick(e.detail.value)} placeholder="你的昵称" />
              <Button className="btn-primary btn-sm" onClick={handleUpdateNickname} disabled={busy}>保存</Button>
            </View>
          </View>
          {!isOwner ? (<View className="manage-notice">只有账本创建者可以管理此账本</View>) : (
            <View>
              <View className="manage-section"><View className="manage-title">账本名称</View><View className="manage-row"><Input className="manage-input" value={name} onInput={(e) => setName(e.detail.value)} /><Button className="btn-primary btn-sm" onClick={handleRename} disabled={busy}>保存</Button></View></View>
              <View className="manage-section">
                <View className="manage-title">成员（{members.length} 人）</View>
                <View className="member-list">
                  {members.map((m) => (
                    <View key={m.id} className="member-item">
                      <Text className="member-name">{m.nickname}{m.id === myMemberId ? '（我）' : ''}{m.uid ? m.uid === ledger.ownerId : m.id === ledger.ownerId ? (<Text style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 7px', borderRadius: 999 }}>创建者</Text>) : null}</Text>
                      {m.id !== myMemberId && !(m.uid ? m.uid === ledger.ownerId : m.id === ledger.ownerId) ? (<Button className="btn-danger btn-sm" onClick={() => handleRemove(m.id)} disabled={busy}>移除</Button>) : null}
                    </View>
                  ))}
                </View>
              </View>
              <View className="manage-section">
                <View className="manage-title">邀请</View>
                <View className="manage-row"><Text className="manage-hint">当前邀请码：{ledger.inviteCode}</Text><Button className="btn-primary btn-sm" onClick={copyInvite}>复制</Button></View>
                <View className="manage-row" style={{ marginTop: 8 }}><Text className="manage-hint">分享卡片：账本页右上角「+」</Text><Button className="btn-warn btn-sm" onClick={handleRegenerate} disabled={busy}>重新生成</Button></View>
              </View>
              <View className="manage-section">
                <View className="manage-title">分类管理</View>
                <View className="cat-manage-list">{cats.map((c) => (<View key={c} className="cat-manage-item"><Text>{c}</Text><Button onClick={() => removeCat(c)} aria-label={`删除${c}`}><IconX size={11} /></Button></View>))}</View>
                <View className="manage-row" style={{ marginBottom: 10 }}><Input className="manage-input" placeholder="新分类名" value={newCat} onInput={(e) => setNewCat(e.detail.value)} confirmType="done" onConfirm={() => addCat()} /><Button className="btn-primary btn-sm" onClick={addCat}>添加</Button></View>
                <Button className="btn-primary btn-block" onClick={handleSaveCats} disabled={busy}>保存分类</Button>
              </View>
              <View className="manage-section manage-danger"><View className="manage-title">危险操作</View><Button className="btn-danger btn-block" onClick={handleDeleteLedger} disabled={busy}>删除账本</Button></View>
            </View>
          )}
        </View>
        {msg ? <View className="modal-msg">{msg}</View> : null}
      </View>
    </View>
  )
}
