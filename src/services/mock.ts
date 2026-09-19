import Taro from '@tarojs/taro'
import type { Category, Entry, Ledger, Member } from '../types'
import { parseEntryText } from '../parser'
import type { LedgerAPI } from './api'

const K_LEDGERS = 'jz_ledgers'
const K_MEMBERS = 'jz_members'
const K_ENTRIES = 'jz_entries'

function load<T>(key: string): T[] {
  try { const raw = Taro.getStorageSync(key) as string; return raw ? JSON.parse(raw) : [] } catch { return [] }
}
function save<T>(key: string, val: T[]): void { Taro.setStorageSync(key, JSON.stringify(val)) }
function uid(p: string): string { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` }
function genInviteCode(): string { return Math.random().toString(36).slice(2, 8).toUpperCase() }

const listeners: Record<string, Array<(entries: Entry[]) => void>> = {}
function notify(ledgerId: string): void {
  const all = load<Entry>(K_ENTRIES).filter((e) => e.ledgerId === ledgerId)
  ;(listeners[ledgerId] || []).forEach((cb) => cb([...all].sort((a, b) => a.createdAt - b.createdAt)))
}

export function createInviteLink(ledger: Ledger): string { return `/pages/index/index?join=${ledger.id}&code=${ledger.inviteCode}` }

export const mockAPI: LedgerAPI = {
  async createLedger(name, nickname) {
    const ledger: Ledger = { id: uid('ledger'), name: name.trim() || '我的账本', ownerId: '', inviteCode: genInviteCode(), createdAt: Date.now() }
    const member: Member = { id: uid('m'), ledgerId: ledger.id, nickname: nickname.trim() || '我', joinedAt: Date.now() }
    ledger.ownerId = member.id
    save<Ledger>(K_LEDGERS, [...load<Ledger>(K_LEDGERS), ledger])
    save<Member>(K_MEMBERS, [...load<Member>(K_MEMBERS), member])
    return { ledger, member, inviteLink: createInviteLink(ledger) }
  },
  async joinLedger(ledgerId, inviteCode, nickname) {
    const ledger = load<Ledger>(K_LEDGERS).find((l) => l.id === ledgerId && l.inviteCode === inviteCode)
    if (!ledger) throw new Error('账本不存在或邀请码无效')
    const member: Member = { id: uid('m'), ledgerId, nickname: nickname.trim() || '我', joinedAt: Date.now() }
    save<Member>(K_MEMBERS, [...load<Member>(K_MEMBERS), member])
    return { ledger, member }
  },
  async getLedger(id) { return load<Ledger>(K_LEDGERS).find((l) => l.id === id) ?? null },
  async getLedgersByIds(ids) { const s = new Set(ids); return load<Ledger>(K_LEDGERS).filter((l) => s.has(l.id)) },
  async listLedgersByUid() { return load<Ledger>(K_LEDGERS) },
  async listMembers(ledgerId) { return load<Member>(K_MEMBERS).filter((m) => m.ledgerId === ledgerId) },
  async listEntries(ledgerId) { return load<Entry>(K_ENTRIES).filter((e) => e.ledgerId === ledgerId).sort((a, b) => a.createdAt - b.createdAt) },
  async getLedgerFull(ledgerId) {
    const ledger = load<Ledger>(K_LEDGERS).find((l) => l.id === ledgerId)
    if (!ledger) throw new Error('账本不存在')
    const members = load<Member>(K_MEMBERS).filter((m) => m.ledgerId === ledgerId)
    const entries = load<Entry>(K_ENTRIES).filter((e) => e.ledgerId === ledgerId).sort((a, b) => a.createdAt - b.createdAt)
    return { ledger, members, entries, myMember: members[0] }
  },
  async addEntry(ledgerId, memberId, nickname, text) {
    const parsed = parseEntryText(text)
    if (!parsed) throw new Error('没识别出这笔账的金额，换种说法试试？')
    const entry: Entry = { id: uid('e'), ledgerId, memberId, nickname, rawText: text.trim(), amount: parsed.amount, category: parsed.category, note: parsed.note, createdAt: Date.now(), updatedAt: Date.now(), history: [] }
    save<Entry>(K_ENTRIES, [...load<Entry>(K_ENTRIES), entry]); notify(ledgerId); return entry
  },
  async updateEntry(entryId, patch, memberId, nickname) {
    const all = load<Entry>(K_ENTRIES)
    const entry = all.find((e) => e.id === entryId)
    if (!entry) throw new Error('账目不存在')
    const updated: Entry = { ...entry, ...patch, updatedAt: Date.now(), history: [...entry.history, { memberId, nickname, at: Date.now(), action: '修改' }] }
    save<Entry>(K_ENTRIES, all.map((e) => (e.id === entryId ? updated : e))); notify(entry.ledgerId); return updated
  },
  async deleteEntry(entryId, memberId, nickname) {
    const all = load<Entry>(K_ENTRIES)
    const entry = all.find((e) => e.id === entryId)
    if (!entry) throw new Error('账目不存在')
    entry.history = [...entry.history, { memberId, nickname, at: Date.now(), action: '删除' }]
    const marked: Entry = { ...entry, note: (entry.note ? entry.note + ' · ' : '') + '【已删除】', amount: 0 }
    save<Entry>(K_ENTRIES, all.map((e) => (e.id === entryId ? marked : e))); notify(entry.ledgerId)
  },
  async renameLedger(ledgerId, newName) { const all = load<Ledger>(K_LEDGERS); const l = all.find((x) => x.id === ledgerId); if (!l) throw new Error('账本不存在'); l.name = newName.trim() || l.name; save<Ledger>(K_LEDGERS, all); return l },
  async removeMember(ledgerId, memberId) { save<Member>(K_MEMBERS, load<Member>(K_MEMBERS).filter((m) => !(m.ledgerId === ledgerId && m.id === memberId))) },
  async deleteLedger(ledgerId) {
    save<Ledger>(K_LEDGERS, load<Ledger>(K_LEDGERS).filter((l) => l.id !== ledgerId))
    save<Member>(K_MEMBERS, load<Member>(K_MEMBERS).filter((m) => m.ledgerId !== ledgerId))
    save<Entry>(K_ENTRIES, load<Entry>(K_ENTRIES).filter((e) => e.ledgerId !== ledgerId))
    delete listeners[ledgerId]
  },
  async updateNickname(ledgerId, nickname, memberId) { const all = load<Member>(K_MEMBERS); const m = all.find((x) => x.ledgerId === ledgerId && x.id === memberId); if (!m) throw new Error('成员不存在'); m.nickname = nickname.trim() || m.nickname; save<Member>(K_MEMBERS, all); return m },
  async regenerateInviteCode(ledgerId) { const all = load<Ledger>(K_LEDGERS); const l = all.find((x) => x.id === ledgerId); if (!l) throw new Error('账本不存在'); l.inviteCode = genInviteCode(); save<Ledger>(K_LEDGERS, all); return { ledger: l, inviteLink: createInviteLink(l) } },
  async updateCategories(ledgerId, categories) { const all = load<Ledger>(K_LEDGERS); const l = all.find((x) => x.id === ledgerId); if (!l) throw new Error('账本不存在'); l.categories = categories.length > 0 ? categories : undefined; save<Ledger>(K_LEDGERS, all); return l },
  watchEntries(ledgerId, onChange) { if (!listeners[ledgerId]) listeners[ledgerId] = []; listeners[ledgerId].push(onChange); return () => { listeners[ledgerId] = (listeners[ledgerId] || []).filter((cb) => cb !== onChange) } },
}
