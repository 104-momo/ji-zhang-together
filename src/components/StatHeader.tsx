import { Button, Text, View } from '@tarojs/components'
import type { Entry } from '../types'
import { IconArrowLeft, IconPlus, IconUsers } from './Icons'

interface Props {
  ledgerName: string
  entries: Entry[]
  memberCount: number
  monthlyBudget?: number | null
  onBack: () => void
  onInvite: () => void
}

export default function StatHeader({ ledgerName, entries, memberCount, monthlyBudget, onBack, onInvite }: Props) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${now.getMonth()}`
  const ymd = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const valid = (e: Entry) => !(e.amount === 0 && (e.note || '').includes('【已删除】'))
  const monthEntries = entries.filter((e) => {
    if (!valid(e)) return false
    const d = new Date(e.createdAt)
    return `${d.getFullYear()}-${d.getMonth()}` === ym
  })
  const todayEntries = entries.filter((e) => {
    if (!valid(e)) return false
    const d = new Date(e.createdAt)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === ymd
  })
  const monthTotal = monthEntries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const todayTotal = todayEntries.reduce((s, e) => s + Number(e.amount || 0), 0)

  const budget = monthlyBudget && monthlyBudget > 0 ? monthlyBudget : 0
  const pct = budget > 0 ? (monthTotal / budget) * 100 : 0
  const over = budget > 0 && monthTotal > budget
  const near = !over && pct >= 80

  return (
    <View className="header">
      <View className="header-top">
        <Button className="icon-btn" onClick={onBack} aria-label="返回"><IconArrowLeft size={19} /></Button>
        <View className="header-title">
          <Text className="ledger-name">{ledgerName}</Text>
          <Text className="ledger-sub"><IconUsers size={12} /> {memberCount} 人 · 本月</Text>
        </View>
        <Button className="icon-btn accent" onClick={onInvite} aria-label="复制邀请口令"><IconPlus size={18} /></Button>
      </View>
      <View className="header-stats">
        <View className="stat">
          <Text className="stat-label">今日支出</Text>
          <Text className="stat-value">¥{todayTotal.toFixed(2)}</Text>
        </View>
        <View className={`stat stat-budget ${over ? 'is-over' : near ? 'is-near' : ''}`}>
          {budget > 0 ? (
            <>
              <View className="sb-row">
                <Text className="stat-label">当月预算</Text>
                <Text className="sb-pct">{pct.toFixed(0)}%</Text>
              </View>
              <View className="sb-bar-wrap"><View className="sb-bar" style={{ width: `${Math.min(pct, 100)}%` }} /></View>
              <Text className="sb-num">
                ¥{monthTotal.toFixed(0)} / ¥{budget.toFixed(0)}
                {over ? <Text className="sb-extra"> 超¥{(monthTotal - budget).toFixed(0)}</Text>
                  : <Text className="sb-extra"> 剩¥{(budget - monthTotal).toFixed(0)}</Text>}
              </Text>
            </>
          ) : (
            <>
              <Text className="stat-label">当月预算</Text>
              <Text className="sb-empty">未设置</Text>
              <Text className="sb-num">本月已花 ¥{monthTotal.toFixed(0)}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  )
}
