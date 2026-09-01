// ===== 数据模型（与 CloudBase 三集合 ledgers/members/entries 一一对应）=====

export const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '人情', '其他'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Ledger {
  id: string
  name: string
  ownerId: string // 创建者 memberId，拥有最高权限
  inviteCode: string
  categories?: string[] // 自定义分类列表（为空则用默认 CATEGORIES）
  createdAt: number
}

export interface Member {
  id: string
  ledgerId: string
  nickname: string
  joinedAt: number
  /** CloudBase 模式下的登录用户 uid（服务端 owner_id 存的是 uid，用于创建者身份判断） */
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
  rawText: string // 原始输入文本
  amount: number
  category: Category
  note?: string
  createdAt: number
  updatedAt: number
  history: ModifyRecord[] // 改删留痕
  /** 软删除标记（云端 deleted=true，列表与统计不再计入） */
  deleted?: boolean
}

// 解析结果
export interface ParsedEntry {
  amount: number
  category: Category
  description: string
  note?: string
  matchedBy: 'rule' | 'local' | 'llm' // rule=本地规则；local=本地兜底；llm=GLM（云函数）
}
