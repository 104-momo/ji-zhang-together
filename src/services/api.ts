import type { Category, Entry, Ledger, Member } from '../types'
/**
 * 账本数据层统一接口。
 * - mock.ts：本地实现（localStorage + 事件订阅模拟实时推送），本地跑通用
 * - cloudbase.ts：CloudBase 实现（接入真实环境后启用），接口完全一致，前端无感切换
 */
export interface LedgerAPI {
  /** 创建账本，返回账本 + 创建者成员 + 邀请链接 */
  createLedger(name: string, nickname: string): Promise<{ ledger: Ledger; member: Member; inviteLink: string }>
  /** 通过邀请链接加入账本 */
  joinLedger(ledgerId: string, inviteCode: string, nickname: string): Promise<{ ledger: Ledger; member: Member }>
  getLedger(id: string): Promise<Ledger | null>
  /** 按 id 列表批量取账本（用于列出“我参与的所有账本”） */
  getLedgersByIds(ids: string[]): Promise<Ledger[]>
  listMembers(ledgerId: string): Promise<Member[]>
  listEntries(ledgerId: string): Promise<Entry[]>
  /** 聊天式记账入口：整句话 → 解析 → 入账 */
  addEntry(ledgerId: string, memberId: string, nickname: string, text: string): Promise<Entry>
  updateEntry(
    entryId: string,
    patch: { amount?: number; category?: Category; note?: string },
    memberId: string,
    nickname: string,
  ): Promise<Entry>
  deleteEntry(entryId: string, memberId: string, nickname: string): Promise<void>
  /** 修改自己在本账本中的昵称（mock 模式用 memberId 定位，CloudBase 从登录态取） */
  updateNickname(ledgerId: string, nickname: string, memberId?: string): Promise<Member>
  /** 账本管理（仅创建者可调用） */
  renameLedger(ledgerId: string, newName: string): Promise<Ledger>
  removeMember(ledgerId: string, memberId: string): Promise<void>
  /** 删除账本（仅创建者，级联删除账目与成员） */
  deleteLedger(ledgerId: string): Promise<void>
  regenerateInviteCode(ledgerId: string): Promise<{ ledger: Ledger; inviteLink: string }>
  updateCategories(ledgerId: string, categories: string[]): Promise<Ledger>
  /** 订阅账本实时变化（CloudBase watch / mock 事件），返回取消订阅函数 */
  watchEntries(ledgerId: string, onChange: (entries: Entry[]) => void): () => void
}
