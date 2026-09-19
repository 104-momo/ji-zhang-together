import type { Ledger } from './types'

export const shareState: { title: string; path: string } = { title: '', path: '' }

export function setShare(ledger: Ledger): void {
  shareState.title = `一起记账｜${ledger.name}`
  shareState.path = `/pages/index/index?join=${ledger.id}&code=${ledger.inviteCode}`
}
