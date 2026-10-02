import type { Ledger } from './types'

export const shareState: { title: string; path: string } = { title: '', path: '' }

export function setShare(ledger: Ledger): void {
  shareState.title = `一起记账｜${ledger.name}`
  shareState.path = `/pages/index/index?join=${ledger.id}&code=${ledger.inviteCode}`
}

/** 离开账本后清空分享内容，避免在首页转发时仍带上一本账的邀请链接 */
export function resetShare(): void {
  shareState.title = ''
  shareState.path = ''
}
