import type { Ledger } from '../types'

/**
 * 邀请口令（不依赖小程序转发能力，适用于未认证账号）。
 * 口令内含账本 ID 与邀请码，通过任意聊天工具发送，对方在首页粘贴加入。
 */
const TOKEN_RE = /jzjoin\s*([A-Za-z0-9]{16,64})#([A-Za-z0-9]{4,12})/i

export function makeInviteToken(ledger: Ledger): string {
  return `【一起记账】「${ledger.name}」邀请你一起记账。复制本条消息，打开小程序在首页点「加入账本」粘贴即可。\njzjoin ${ledger.id}#${ledger.inviteCode}`
}

export function parseInviteToken(text: string): { ledgerId: string; code: string } | null {
  if (!text) return null
  const m = String(text).match(TOKEN_RE)
  if (!m) return null
  return { ledgerId: m[1], code: m[2].toUpperCase() }
}
