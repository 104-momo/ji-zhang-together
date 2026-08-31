import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category, Entry, Ledger, Member } from '../types'
import { api } from '../services'
const K_IDENTITY = 'jz_identity' // Record<ledgerId, { memberId, nickname }>
interface IdentityRecord {
  memberId: string
  nickname: string
}
function loadIdentity(): Record<string, IdentityRecord> {
  try {
    return JSON.parse(localStorage.getItem(K_IDENTITY) || '{}') as Record<string, IdentityRecord>
  } catch {
    return {}
  }
}
function saveIdentity(v: Record<string, IdentityRecord>): void {
  localStorage.setItem(K_IDENTITY, JSON.stringify(v))
}
export interface LedgerView {
  ledger: Ledger
  members: Member[]
  entries: Entry[]
  myMember: Member
}
/** 兼容判断创建者身份：CloudBase 模式 ownerId 是 uid，mock 模式 ownerId 是 member.id */
function isOwnerOf(ledger: Ledger, member: Member): boolean {
  return ledger.ownerId === member.id || (!!member.uid && ledger.ownerId === member.uid)
}
export function useLedger() {
  const [myLedgers, setMyLedgers] = useState<Ledger[]>([])
  const [current, setCurrent] = useState<LedgerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const identityRef = useRef<Record<string, IdentityRecord>>(loadIdentity())
  // 刷新“我参与的所有账本”
  const refreshMyLedgers = useCallback(async () => {
    const ids = Object.keys(identityRef.current)
    if (ids.length === 0) {
      setMyLedgers([])
      return
    }
    const ledgers = await api.getLedgersByIds(ids)
    setMyLedgers(ledgers)
  }, [])
  // 打开某个账本：加载 members + entries + 订阅实时
  const openLedger = useCallback(async (ledgerId: string) => {
    const ledger = await api.getLedger(ledgerId)
    if (!ledger) {
      setError('账本不存在')
      return
    }
    const idRec = identityRef.current[ledgerId]
    if (!idRec) {
      setError('你还没有加入这个账本')
      return
    }
    const members = await api.listMembers(ledgerId)
    const entries = await api.listEntries(ledgerId)
    const myMember = members.find((m) => m.id === idRec.memberId) ?? {
      id: idRec.memberId,
      ledgerId,
      nickname: idRec.nickname,
      joinedAt: Date.now(),
    }
    setCurrent({ ledger, members, entries, myMember })
  }, [])
  // 实时同步：数据在 PostgreSQL，无法用文档数据库 watch，改为定时轮询云函数
  useEffect(() => {
    if (!current) return
    let cancelled = false
    const ledgerId = current.ledger.id
    const refresh = async () => {
      try {
        const [members, entries] = await Promise.all([api.listMembers(ledgerId), api.listEntries(ledgerId)])
        if (cancelled) return
        setCurrent((c) => (c ? { ...c, members, entries } : c))
      } catch {
        // 单次轮询失败静默处理，下一轮自动重试
      }
    }
    const timer = setInterval(refresh, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [current?.ledger.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // 初始化：加载我的账本；支持 ?join= 链接直达由 App 层处理
  useEffect(() => {
    void refreshMyLedgers()
  }, [refreshMyLedgers])
  const createLedger = useCallback(
    async (name: string, nickname: string) => {
      const { ledger, member } = await api.createLedger(name, nickname)
      identityRef.current = { ...identityRef.current, [ledger.id]: { memberId: member.id, nickname: member.nickname } }
      saveIdentity(identityRef.current)
      await refreshMyLedgers()
      await openLedger(ledger.id)
      return ledger
    },
    [openLedger, refreshMyLedgers],
  )
  const joinLedger = useCallback(
    async (ledgerId: string, code: string, nickname: string) => {
      const { ledger, member } = await api.joinLedger(ledgerId, code, nickname)
      identityRef.current = { ...identityRef.current, [ledger.id]: { memberId: member.id, nickname: member.nickname } }
      saveIdentity(identityRef.current)
      await refreshMyLedgers()
      await openLedger(ledger.id)
      return ledger
    },
    [openLedger, refreshMyLedgers],
  )
  const leaveLedger = useCallback(() => {
    setCurrent(null)
  }, [])
  const addEntry = useCallback(
    async (text: string) => {
      if (!current) throw new Error('请先进入账本')
      return api.addEntry(current.ledger.id, current.myMember.id, current.myMember.nickname, text)
    },
    [current],
  )
  const updateEntry = useCallback(
    async (entryId: string, patch: { amount?: number; category?: Category; note?: string }) => {
      if (!current) throw new Error('请先进入账本')
      return api.updateEntry(entryId, patch, current.myMember.id, current.myMember.nickname)
    },
    [current],
  )
  const deleteEntry = useCallback(
    async (entryId: string) => {
      if (!current) throw new Error('请先进入账本')
      await api.deleteEntry(entryId, current.myMember.id, current.myMember.nickname)
    },
    [current],
  )
  const assertOwner = useCallback(() => {
    if (!current) throw new Error('请先进入账本')
    if (!isOwnerOf(current.ledger, current.myMember)) throw new Error('只有账本创建者可以操作')
  }, [current])
  const renameLedger = useCallback(
    async (newName: string) => {
      if (!current) return
      assertOwner()
      const ledger = await api.renameLedger(current.ledger.id, newName)
      setCurrent({ ...current, ledger })
    },
    [current, assertOwner],
  )
  const removeMember = useCallback(
    async (memberId: string) => {
      if (!current) return
      assertOwner()
      if (memberId === current.myMember.id) throw new Error('不能移除自己')
      await api.removeMember(current.ledger.id, memberId)
      const members = await api.listMembers(current.ledger.id)
      setCurrent({ ...current, members })
    },
    [current, assertOwner],
  )
  const updateNickname = useCallback(
    async (nickname: string) => {
      if (!current) throw new Error('请先进入账本')
      const member = await api.updateNickname(current.ledger.id, nickname, current.myMember.id)
      // 同步本地身份（localStorage）与当前视图
      identityRef.current = {
        ...identityRef.current,
        [current.ledger.id]: { memberId: member.id, nickname: member.nickname },
      }
      saveIdentity(identityRef.current)
      setCurrent((c) =>
        c
          ? {
              ...c,
              myMember: member,
              members: c.members.map((m) => (m.id === member.id ? member : m)),
            }
          : c,
      )
      return member
    },
    [current],
  )
  const regenerateInviteCode = useCallback(async () => {
    if (!current) return
    assertOwner()
    const { ledger } = await api.regenerateInviteCode(current.ledger.id)
    setCurrent({ ...current, ledger })
  }, [current, assertOwner])
  const updateCategories = useCallback(
    async (categories: string[]) => {
      if (!current) return
      assertOwner()
      const ledger = await api.updateCategories(current.ledger.id, categories)
      setCurrent({ ...current, ledger })
    },
    [current, assertOwner],
  )
  // 权限：本人可改删自己的；账本创建者可改删任何人的
  const canModify = useCallback(
    (entry: Entry): boolean => {
      if (!current) return false
      return entry.memberId === current.myMember.id || isOwnerOf(current.ledger, current.myMember)
    },
    [current],
  )
  const clearError = useCallback(() => setError(null), [])
  return {
    myLedgers,
    current,
    error,
    createLedger,
    joinLedger,
    openLedger,
    leaveLedger,
    addEntry,
    updateEntry,
    deleteEntry,
    renameLedger,
    removeMember,
    updateNickname,
    regenerateInviteCode,
    updateCategories,
    canModify,
    clearError,
    setError,
  }
}
