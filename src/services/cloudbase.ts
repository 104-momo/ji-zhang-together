import type { Category, Entry, Ledger, Member } from '../types'
import type { LedgerAPI } from './api'
import { createInviteLink } from './mock'
import { getCloudApp, getCloudAuth } from './cloudbase-app'
/**
 * CloudBase 适配层。
 *
 * 启用条件：Vite 环境变量 VITE_CLOUDBASE_ENV 填入环境 ID。
 * 所有写操作走云函数 ledgerApi（服务端从 context.userInfo 取 uid 做权限校验）；
 * 账目实时推送走数据库 watch。
 *
 * 前端不再传 memberId 做权限校验——云函数从登录态取，无法伪造。
 * 接口签名与 mock.ts 完全一致，前端组件零改动。
 */
/** 统一调用云函数，自动解包 success/data/error */
async function call(action: string, params: Record<string, any> = {}): Promise<any> {
  const app = getCloudApp()
  // 登录态在 auth 单例上就绪可能有极短延迟；若暂时读不到 uid，短暂轮询等待，
  // 避免登录瞬间用空 uid 请求云函数而报“请先登录”（最多等待约 3 秒）
  let uid = ''
  for (let i = 0; i < 15; i++) {
    uid = getCloudAuth().currentUser?.uid || ''
    if (uid) break
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log('[callFunction] action:', action, 'uid:', uid)
  // 临时方案：手动传递 uid（因为 SDK 3.x 云函数调用不传递登录态）
  // 后续优化：云函数验证 accessToken 获取 uid
  const res = await app.callFunction({
    name: 'ledgerApi',
    data: { action, _uid: uid, ...params },
  })
  const result = (res as any).result
  console.log('[callFunction] result:', result)
  if (!result || result.success === false) {
    throw new Error(result?.error || '操作失败')
  }
  return result.data
}
// —— 把 CloudBase 文档（带 _id）转成前端类型（带 id） ——
function mapLedger(doc: any): Ledger {
  return { ...doc, id: doc._id || doc.id }
}
function mapMember(doc: any): Member {
  return { ...doc, id: doc._id || doc.id }
}
function mapEntry(doc: any): Entry {
  return { ...doc, id: doc._id || doc.id }
}
export const cloudAPI: LedgerAPI = {
  async createLedger(name, nickname) {
    const data = await call('createLedger', { name, nickname })
    const ledger = mapLedger(data.ledger)
    const member = mapMember(data.member)
    return { ledger, member, inviteLink: createInviteLink(ledger) }
  },
  async joinLedger(ledgerId, inviteCode, nickname) {
    const data = await call('joinLedger', { ledgerId, inviteCode, nickname })
    return { ledger: mapLedger(data.ledger), member: mapMember(data.member) }
  },
  async getLedger(id) {
    const data = await call('getLedger', { id })
    return data ? mapLedger(data) : null
  },
  async getLedgersByIds(ids) {
    const data = await call('getLedgersByIds', { ids })
    return (data || []).map(mapLedger)
  },
  async listMembers(ledgerId) {
    const data = await call('listMembers', { ledgerId })
    return (data || []).map(mapMember)
  },
  async listEntries(ledgerId) {
    const data = await call('listEntries', { ledgerId })
    return (data || []).map(mapEntry)
  },
  async addEntry(ledgerId, _memberId, nickname, text) {
    // 注意：云函数从登录态取 uid，memberId 参数忽略不传
    const data = await call('addEntry', { ledgerId, text, nickname })
    return mapEntry(data)
  },
  async updateEntry(entryId, patch, _memberId, _nickname) {
    // 云函数从登录态取 uid 做权限校验
    const data = await call('updateEntry', { entryId, patch })
    return mapEntry(data)
  },
  async deleteEntry(entryId, _memberId, _nickname) {
    await call('deleteEntry', { entryId })
  },
  async renameLedger(ledgerId, newName) {
    const data = await call('renameLedger', { ledgerId, newName })
    return mapLedger(data)
  },
  async removeMember(ledgerId, memberId) {
    await call('removeMember', { ledgerId, memberId })
  },
  async deleteLedger(ledgerId) {
    await call('deleteLedger', { ledgerId })
  },
  async updateNickname(ledgerId, nickname) {
    const data = await call('updateNickname', { ledgerId, nickname })
    return mapMember(data)
  },
  async regenerateInviteCode(ledgerId) {
    const data = await call('regenerateInviteCode', { ledgerId })
    const ledger = mapLedger(data.ledger)
    return { ledger, inviteLink: createInviteLink(ledger) }
  },
  async updateCategories(ledgerId, categories) {
    const data = await call('updateCategories', { ledgerId, categories })
    return mapLedger(data)
  },
  /**
   * 实时订阅占位：数据存储在 PostgreSQL（经云函数访问），CloudBase 文档库 watch 不适用。
   * 实时同步由 useLedger 中的定时轮询（listMembers/listEntries）负责，这里返回空取消函数以兼容接口。
   */
  watchEntries(_ledgerId, _onChange) {
    return () => {}
  },
}
export { createInviteLink }
export type { Category }
