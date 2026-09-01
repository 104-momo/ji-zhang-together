import type { Entry } from '../types'
import { IconArrowLeft, IconPlus, IconUsers } from './Icons'

interface Props {
  ledgerName: string
  entries: Entry[]
  memberCount: number
  onShare: () => void
  onBack: () => void
}

export default function StatHeader({ ledgerName, entries, memberCount, onShare, onBack }: Props) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${now.getMonth()}`
  const monthEntries = entries.filter((e) => {
    if (e.amount === 0 && (e.note || '').includes('【已删除】')) return false
    const d = new Date(e.createdAt)
    return `${d.getFullYear()}-${d.getMonth()}` === ym
  })
  const total = monthEntries.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="header">
      <div className="header-top">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          <IconArrowLeft size={19} />
        </button>
        <div className="header-title">
          <span className="ledger-name">{ledgerName}</span>
          <span className="ledger-sub">
            <IconUsers size={12} /> {memberCount} 人 · 本月
          </span>
        </div>
        <button className="icon-btn accent" onClick={onShare} aria-label="邀请成员">
          <IconPlus size={18} />
        </button>
      </div>
      <div className="header-stats">
        <div className="stat">
          <span className="stat-label">本月总支出</span>
          <span className="stat-value">¥{total.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">本月笔数</span>
          <span className="stat-value">{monthEntries.length} 笔</span>
        </div>
      </div>
    </div>
  )
}
