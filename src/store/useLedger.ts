import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category, Entry, Ledger, Member } from '../types'
import { api } from '../services'
import { auth } from '../services/auth'
import { parseEntryText } from '../parser'

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
  // 刷新“我参与的所有账本”：云端按登录 uid 查询（跨设备可靠），不再依赖本地缓存
  const refreshMyLedgers = useCallback(async () => {
    // 登录态恢复时 accessToken 可能稍晚才就绪，一次失败就置空会让首页永久显示“没有账本”。
    // 这里做有限重试；明确“未登录”时不清空，交给 onAuthStateChanged 在登录后再拉。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ledgers = await api.listLedgersByUid()
        setMyLedgers(ledgers)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const notAuthed = /未登录|请先登录|登录态无效/.test(msg)
        if (notAuthed) return // 等登录态就绪事件再触发，不主动清空
        if (attempt === 2) {
          setMyLedgers([])
          return
        }
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }, [])

  // 监听登录态：登录/注册成功后刷新我的账本列表（此前仅在组件挂载时刷新一次，
  // 未登录时拿不到 token 会失败，登录后不会自动重试，导致账本列表为空）
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u?.uid) {
        void refreshMyLedgers()
      } else {
        setMyLedgers([])
        setCurrent(null)
      }
    })
    return unsub
  }, [refreshMyLedgers])

  // 打开某个账本：加载 members + entries + 订阅实时
  const openLedger = useCallback(async (ledgerId: string) => {
    const ledger = await api.getLedger(ledgerId)
    if (!ledger) {
      setError('账本不存在')
      return
    }
    const members = await api.listMembers(ledgerId)
    const entries = await api.listEntries(ledgerId)
    // 优先按登录 uid 定位“我”的成员记录（跨设备可靠）；mock 模式无 uid 时回退本地缓存
    const uid = auth.getCurrentUser()?.uid
    const idRec = identityRef.current[ledgerId]
    const myMember =
      (uid ? members.find((m) => m.uid === uid) : undefined) ??
      members.find((m) => m.id === idRec?.memberId) ??
      {
        id: idRec?.memberId ?? '',
        ledgerId,
        nickname: idRec?.nickname ?? '我',
        joinedAt: Date.now(),
      }
    if (!uid && !idRec) {
      setError('你还没有加入这个账本')
      return
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
        setCurrent((c) => {
          if (!c) return c
          // 保留尚未被云端确认的乐观占位（pending-*），避免被轮询结果覆盖导致气泡闪没；
          // 若云端已出现同人同内容的真实记录，则丢弃对应占位，防止短暂重复
          const pendings = c.entries.filter((e) => e.id.startsWith('pending-'))
          const uniquePendings = pendings.filter(
            (p) => !entries.some((en) => en.rawText === p.rawText && en.nickname === p.nickname && Math.abs(en.createdAt - p.createdAt) < 30000),
          )
          return { ...c, members, entries: [...uniquePendings, ...entries] }
        })
      } catch {
        // 单次轮询失败静默处理，下一轮自动重试
      }
    }
    // 2 秒轮询：本方记账会立即本地插入，轮询主要负责拉取对方的新账目
    const timer = setInterval(refresh, 2000)
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
      // 乐观更新：先用本地解析结果立即插入气泡，不等云端（云端 1~4s 后返回真实数据再替换）
      const local = parseEntryText(text)
      const optimistic: Entry = {
        id: `pending-${Date.now()}`,
        ledgerId: current.ledger.id,
        memberId: current.myMember.id,
        nickname: current.myMember.nickname,
        rawText: text.trim(),
        amount: local ? local.amount : 0,
        category: (local ? local.category : '其他') as Category,
        note: local?.note,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: [],
      }
      setCurrent((c) =>
        c ? { ...c, entries: [...c.entries, optimistic].sort((a, b) => a.createdAt - b.createdAt) } : c,
      )
      try {
        const entry = await api.addEntry(current.ledger.id, current.myMember.id, current.myMember.nickname, text)
        // 云端确认成功：用真实 entry 替换占位（并去除可能已由轮询拉到的重复项）
        setCurrent((c) =>
          c
            ? { ...c, entries: c.entries.filter((e) => e.id !== optimistic.id && e.id !== entry.id).concat(entry) }
            : c,
        )
        return entry
      } catch (e) {
        // 失败：移除占位气泡并上抛错误（由页面 toast 提示）
        setCurrent((c) => (c ? { ...c, entries: c.entries.filter((e) => e.id !== optimistic.id) } : c))
        throw e
      }
    },
    [current],
  )

  const updateEntry = useCallback(
    async (entryId: string, patch: { amount?: number; category?: Category; note?: string }) => {
      if (!current) throw new Error('请先进入账本')
      const updated = await api.updateEntry(entryId, patch, current.myMember.id, current.myMember.nickname)
      // 立即把更新结果写回本地列表，不等轮询
      setCurrent((c) =>
        c ? { ...c, entries: c.entries.map((e) => (e.id === entryId ? updated : e)) } : c,
      )
      return updated
    },
    [current],
  )

  const deleteEntry = useCallback(
    async (entryId: string) => {
      if (!current) throw new Error('请先进入账本')
      await api.deleteEntry(entryId, current.myMember.id, current.myMember.nickname)
      // 本地立即移除该条目（云端已软删除，列表过滤后不再显示），避免等 2s 轮询才消失
      setCurrent((c) => (c ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) } : c))
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
  // 删除账本（仅创建者）：级联删除云端账目/成员，并清理本地身份记录回到首页
  const deleteLedger = useCallback(async () => {
    if (!current) return
    assertOwner()
    await api.deleteLedger(current.ledger.id)
    const next = { ...identityRef.current }
    delete next[current.ledger.id]
    identityRef.current = next
    saveIdentity(next)
    setCurrent(null)
    await refreshMyLedgers()
  }, [current, assertOwner, refreshMyLedgers])

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
    deleteLedger,
    updateCategories,
    canModify,
    clearError,
    setError,
  }
}
