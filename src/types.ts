export const CATEGORIES = ['餐饮', '交通', '购物', '日用', '娱乐', '居住', '医疗', '人情', '其他'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Ledger {
  id: string
  name: string
  ownerId: string
  inviteCode: string
  categories?: string[]
  createdAt: number
}

export interface Member {
  id: string
  ledgerId: string
  nickname: string
  joinedAt: number
  uid?: string
}

export interface ModifyRecord {
  memberId: string
  nickname: string
  at: number
  action: '修改' | '删除'
}

export interface Entry {
  id: string
  ledgerId: string
  memberId: string
  nickname: string
  rawText: string
  amount: number
  category: Category
  note?: string
  createdAt: number
  updatedAt: number
  history: ModifyRecord[]
  deleted?: boolean
}

export interface ParsedEntry {
  amount: number
  category: Category
  description: string
  note?: string
  matchedBy: 'rule' | 'local' | 'llm'
}
