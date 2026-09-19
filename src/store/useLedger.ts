import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import type { Category, Entry, Ledger, Member } from '../types'
import { api } from '../services'
import { auth } from '../services/auth'
import { parseEntryText } from '../parser'

const K_IDENTITY = 'jz_identity'
interface IdentityRecord { memberId: string; nickname: string }

function loadIdentity(): Record<string, IdentityRecord> {
  try { return JSON.parse((Taro.getStorageSync(K_IDENTITY) as string) || '{}') } catch { return {} }
}
function saveIdentity(v: Record<string, IdentityRecord>): void { Taro.setStorageSync(K_IDENTITY, JSON.stringify(v)) }

export interface LedgerView { ledger: Ledger; members: Member[]; entries: Entry[]; myMember: Member }

function isOwnerOf(ledger: Ledger, member: Member): boolean {
  return ledger.ownerId === member.id || (!!member.uid && ledger.ownerId === member.uid)
}

export function useLedger() {
  const [myLedgers, setMyLedgers] = useState<Ledger[]>([])
  const [ledgersLoading, setLedgersLoading] = useState(false)
  const [ledgersError, setLedgersError] = useState<string | null>(null)
  const [current, setCurrent] = useState<LedgerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const identityRef = useRef<Record<string, IdentityRecord>>(loadIdentity())

  const refreshMyLedgers = useCallback(async () => {
    setLedgersLoading(true); setLedgersError(null)
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { const ledgers = await api.listLedgersByUid(); setMyLedgers(ledgers); setLedgersError(null); return }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (attempt < 4) { await new Promise((r) => setTimeout(r, 1000)); continue }
          setLedgersError(msg || '加载账本失败，请重试'); return
        }
      }
    } finally { setLedgersLoading(false) }
  }, [])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u?.uid) void refreshMyLedgers()
      else { setMyLedgers([]); setCurrent(null) }
    })
    return unsub
  }, [refreshMyLedgers])

  const openLedger = useCallback(async (ledgerId: string) => {
    const full = await api.getLedgerFull(ledgerId)
    const { ledger, members, entries } = full
    const uid = auth.getCurrentUser()?.uid
    const idRec = identityRef.current[ledgerId]
    const myMember = (uid ? members.find((m) => m.uid === uid) : undefined) ?? full.myMember ?? members.find((m) => m.id === idRec?.memberId) ?? { id: idRec?.memberId ?? '', ledgerId, nickname: idRec?.nickname ?? '我', joinedAt: Date.now() }
    if (!uid && !idRec) { setError('你还没有加入这个账本'); return }
    setCurrent({ ledger, members, entries, myMember })
  }, [])

  useEffect(() => {
    if (!current) return
    let cancelled = false
    const ledgerId = current.ledger.id
    const refresh = async () => {
      try {
        const { members, entries } = await api.getLedgerFull(ledgerId)
        if (cancelled) return
        setCurrent((c) => {
          if (!c) return c
          const pendings = c.entries.filter((e) => e.id.startsWith('pending-'))
          const uniquePendings = pendings.filter((p) => !entries.some((en) => en.rawText === p.rawText && en.nickname === p.nickname && Math.abs(en.createdAt - p.createdAt) < 30000))
          return { ...c, members, entries: [...uniquePendings, ...entries] }
        })
      } catch {}
    }
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!timer && !cancelled) timer = setInterval(refresh, 2000) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onShow = () => { if (cancelled) return; void refresh(); start() }
    const onHide = () => stop()
    Taro.onAppShow(onShow); Taro.onAppHide(onHide); start()
    return () => { cancelled = true; stop(); Taro.offAppShow(onShow); Taro.offAppHide(onHide) }
  }, [current?.ledger.id])

  useEffect(() => { void refreshMyLedgers() }, [refreshMyLedgers])

  const createLedger = useCallback(async (name: string, nickname: string) => {
    const { ledger, member } = await api.createLedger(name, nickname)
    identityRef.current = { ...identityRef.current, [ledger.id]: { memberId: member.id, nickname: member.nickname } }
    saveIdentity(identityRef.current)
    await refreshMyLedgers(); await openLedger(ledger.id)
    return ledger
  }, [openLedger, refreshMyLedgers])

  const joinLedger = useCallback(async (ledgerId: string, code: string, nickname: string) => {
    const { ledger, member } = await api.joinLedger(ledgerId, code, nickname)
    identityRef.current = { ...identityRef.current, [ledger.id]: { memberId: member.id, nickname: member.nickname } }
    saveIdentity(identityRef.current)
    await refreshMyLedgers(); await openLedger(ledgerId)
    return ledger
  }, [openLedger, refreshMyLedgers])

  const leaveLedger = useCallback(() => { setCurrent(null) }, [])

  const addEntry = useCallback(async (text: string) => {
    if (!current) throw new Error('请先进入账本')
    const local = parseEntryText(text)
    const optimistic: Entry = { id: `pending-${Date.now()}`, ledgerId: current.ledger.id, memberId: current.myMember.id, nickname: current.myMember.nickname, rawText: text.trim(), amount: local ? local.amount : 0, category: (local ? local.category : '其他') as Category, note: local?.note, createdAt: Date.now(), updatedAt: Date.now(), history: [] }
    setCurrent((c) => c ? { ...c, entries: [...c.entries, optimistic].sort((a, b) => a.createdAt - b.createdAt) } : c)
    try {
      const entry = await api.addEntry(current.ledger.id, current.myMember.id, current.myMember.nickname, text)
      setCurrent((c) => c ? { ...c, entries: c.entries.filter((e) => e.id !== optimistic.id && e.id !== entry.id).concat(entry) } : c)
      return entry
    } catch (e) {
      setCurrent((c) => c ? { ...c, entries: c.entries.filter((e) => e.id !== optimistic.id) } : c)
      throw e
    }
  }, [current])

  const updateEntry = useCallback(async (entryId: string, patch: { amount?: number; category?: Category; note?: string; rawText?: string }) => {
    if (!current) throw new Error('请先进入账本')
    const updated = await api.updateEntry(entryId, patch, current.myMember.id, current.myMember.nickname)
    setCurrent((c) => c ? { ...c, entries: c.entries.map((e) => (e.id === entryId ? updated : e)) } : c)
    return updated
  }, [current])

  const deleteEntry = useCallback(async (entryId: string) => {
    if (!current) throw new Error('请先进入账本')
    await api.deleteEntry(entryId, current.myMember.id, current.myMember.nickname)
    setCurrent((c) => c ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) } : c)
  }, [current])

  const assertOwner = useCallback(() => {
    if (!current) throw new Error('请先进入账本')
    if (!isOwnerOf(current.ledger, current.myMember)) throw new Error('只有账本创建者可以操作')
  }, [current])

  const renameLedger = useCallback(async (newName: string) => {
    if (!current) return; assertOwner()
    const ledger = await api.renameLedger(current.ledger.id, newName)
    setCurrent({ ...current, ledger })
  }, [current, assertOwner])

  const removeMember = useCallback(async (memberId: string) => {
    if (!current) return; assertOwner()
    if (memberId === current.myMember.id) throw new Error('不能移除自己')
    await api.removeMember(current.ledger.id, memberId)
    const members = await api.listMembers(current.ledger.id)
    setCurrent({ ...current, members })
  }, [current, assertOwner])

  const updateNickname = useCallback(async (nickname: string) => {
    if (!current) throw new Error('请先进入账本')
    const member = await api.updateNickname(current.ledger.id, nickname, current.myMember.id)
    identityRef.current = { ...identityRef.current, [current.ledger.id]: { memberId: member.id, nickname: member.nickname } }
    saveIdentity(identityRef.current)
    setCurrent((c) => c ? { ...c, myMember: member, members: c.members.map((m) => (m.id === member.id ? member : m)) } : c)
    return member
  }, [current])

  const regenerateInviteCode = useCallback(async () => {
    if (!current) return; assertOwner()
    const { ledger } = await api.regenerateInviteCode(current.ledger.id)
    setCurrent({ ...current, ledger })
  }, [current, assertOwner])

  const deleteLedger = useCallback(async () => {
    if (!current) return; assertOwner()
    await api.deleteLedger(current.ledger.id)
    const next = { ...identityRef.current }; delete next[current.ledger.id]
    identityRef.current = next; saveIdentity(next); setCurrent(null); await refreshMyLedgers()
  }, [current, assertOwner, refreshMyLedgers])

  const updateCategories = useCallback(async (categories: string[]) => {
    if (!current) return; assertOwner()
    const ledger = await api.updateCategories(current.ledger.id, categories)
    setCurrent({ ...current, ledger })
  }, [current, assertOwner])

  const canModify = useCallback((entry: Entry): boolean => {
    if (!current) return false
    return entry.memberId === current.myMember.id || isOwnerOf(current.ledger, current.myMember)
  }, [current])

  const clearError = useCallback(() => setError(null), [])

  return {
    myLedgers, ledgersLoading, ledgersError, refreshMyLedgers, current, error,
    createLedger, joinLedger, openLedger, leaveLedger, addEntry, updateEntry, deleteEntry,
    renameLedger, removeMember, updateNickname, regenerateInviteCode, deleteLedger,
    updateCategories, canModify, clearError, setError,
  }
}
