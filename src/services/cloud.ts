import Taro from '@tarojs/taro'
import type { Category, Entry, Ledger, Member } from '../types'
import type { LedgerAPI } from './api'
import { CLOUD_ENV } from './env'

export async function call(action: string, params: Record<string, any> = {}): Promise<any> {
  const res = await Taro.cloud.callFunction({ name: 'ledgerApi', data: { action, ...params } })
  const result = (res as any).result
  if (!result || result.success === false) throw new Error(result?.error || '操作失败')
  return result.data
}

export function createInviteLink(ledger: Ledger): string {
  return `/pages/index/index?join=${ledger.id}&code=${ledger.inviteCode}`
}

function mapLedger(doc: any): Ledger { return { ...doc, id: doc.id } }
function mapMember(doc: any): Member { return { ...doc, id: doc.id } }
function mapEntry(doc: any): Entry { return { ...doc, id: doc.id } }

export const cloudAPI: LedgerAPI = {
  async createLedger(name, nickname) {
    const data = await call('createLedger', { name, nickname })
    const ledger = mapLedger(data.ledger)
    return { ledger, member: mapMember(data.member), inviteLink: createInviteLink(ledger) }
  },
  async joinLedger(ledgerId, inviteCode, nickname) {
    const data = await call('joinLedger', { ledgerId, inviteCode, nickname })
    return { ledger: mapLedger(data.ledger), member: mapMember(data.member) }
  },
  async getLedger(id) { const data = await call('getLedger', { id }); return data ? mapLedger(data) : null },
  async getLedgersByIds(ids) { const data = await call('getLedgersByIds', { ids }); return (data || []).map(mapLedger) },
  async listLedgersByUid() { const data = await call('listLedgersByUid', {}); return (data || []).map(mapLedger) },
  async listMembers(ledgerId) { const data = await call('listMembers', { ledgerId }); return (data || []).map(mapMember) },
  async listEntries(ledgerId) { const data = await call('listEntries', { ledgerId }); return (data || []).map(mapEntry) },
  async getLedgerFull(ledgerId) {
    const data = await call('getLedgerFull', { ledgerId })
    return { ledger: mapLedger(data.ledger), myMember: mapMember(data.myMember), members: (data.members || []).map(mapMember), entries: (data.entries || []).map(mapEntry) }
  },
  async addEntry(ledgerId, _memberId, nickname, text) { const data = await call('addEntry', { ledgerId, text, nickname }); return mapEntry(data) },
  async updateEntry(entryId, patch, _memberId, _nickname) { const data = await call('updateEntry', { entryId, patch }); return mapEntry(data) },
  async deleteEntry(entryId, _memberId, _nickname) { await call('deleteEntry', { entryId }) },
  async renameLedger(ledgerId, newName) { const data = await call('renameLedger', { ledgerId, newName }); return mapLedger(data) },
  async removeMember(ledgerId, memberId) { await call('removeMember', { ledgerId, memberId }) },
  async deleteLedger(ledgerId) { await call('deleteLedger', { ledgerId }) },
  async updateNickname(ledgerId, nickname) { const data = await call('updateNickname', { ledgerId, nickname }); return mapMember(data) },
  async regenerateInviteCode(ledgerId) { const data = await call('regenerateInviteCode', { ledgerId }); const ledger = mapLedger(data.ledger); return { ledger, inviteLink: createInviteLink(ledger) } },
  async updateCategories(ledgerId, categories) { const data = await call('updateCategories', { ledgerId, categories }); return mapLedger(data) },
  watchEntries(_ledgerId, _onChange) { return () => {} },
}
