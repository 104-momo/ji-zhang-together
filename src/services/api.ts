import type { Category, Entry, Ledger, Member } from '../types'

export interface LedgerAPI {
  createLedger(name: string, nickname: string): Promise<{ ledger: Ledger; member: Member; inviteLink: string }>
  joinLedger(ledgerId: string, inviteCode: string, nickname: string): Promise<{ ledger: Ledger; member: Member }>
  getLedger(id: string): Promise<Ledger | null>
  getLedgersByIds(ids: string[]): Promise<Ledger[]>
  listLedgersByUid(): Promise<Ledger[]>
  listMembers(ledgerId: string): Promise<Member[]>
  listEntries(ledgerId: string): Promise<Entry[]>
  getLedgerFull(ledgerId: string): Promise<{ ledger: Ledger; myMember: Member; members: Member[]; entries: Entry[] }>
  addEntry(ledgerId: string, memberId: string, nickname: string, text: string): Promise<Entry>
  updateEntry(entryId: string, patch: { amount?: number; category?: Category; note?: string; rawText?: string }, memberId: string, nickname: string): Promise<Entry>
  deleteEntry(entryId: string, memberId: string, nickname: string): Promise<void>
  updateNickname(ledgerId: string, nickname: string, memberId?: string): Promise<Member>
  renameLedger(ledgerId: string, newName: string): Promise<Ledger>
  removeMember(ledgerId: string, memberId: string): Promise<void>
  deleteLedger(ledgerId: string): Promise<void>
  regenerateInviteCode(ledgerId: string): Promise<{ ledger: Ledger; inviteLink: string }>
  updateCategories(ledgerId: string, categories: string[]): Promise<Ledger>
  /** 设置（amount>0）或清除（amount 为 null）每月预算，仅创建者 */
  updateBudget(ledgerId: string, amount: number | null): Promise<Ledger>
  /** 批量设置/清除分类月度预算，仅创建者；值为正数设置、null/0 清除 */
  updateCategoryBudgets(ledgerId: string, budgets: Record<string, number | null>): Promise<Ledger>
  /** 每日记账提醒：订阅 / 取消 / 查询状态 */
  subscribeReminder(ledgerId: string): Promise<{ ok: boolean; templateConfigured?: boolean }>
  unsubscribeReminder(ledgerId: string): Promise<{ ok: boolean }>
  getReminderStatus(ledgerId: string): Promise<{ subscribed: boolean; templateConfigured: boolean }>
  watchEntries(ledgerId: string, onChange: (entries: Entry[]) => void): () => void
}
