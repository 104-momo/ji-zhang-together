import { Button, Text, View } from '@tarojs/components'
import type { Entry } from '../types'
import { IconArrowLeft, IconPlus, IconUsers } from './Icons'

interface Props { ledgerName: string; entries: Entry[]; memberCount: number; onBack: () => void }

export default function StatHeader({ ledgerName, entries, memberCount, onBack }: Props) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${now.getMonth()}`
  const monthEntries = entries.filter((e) => {
    if (e.amount === 0 && (e.note || '').includes('【已删除】')) return false
    const d = new Date(e.createdAt)
    return `${d.getFullYear()}-${d.getMonth()}` === ym
  })
  const total = monthEntries.reduce((s, e) => s + e.amount, 0)
  return (
    <View className="header">
      <View className="header-top">
        <Button className="icon-btn" onClick={onBack} aria-label="返回"><IconArrowLeft size={19} /></Button>
        <View className="header-title">
          <Text className="ledger-name">{ledgerName}</Text>
          <Text className="ledger-sub"><IconUsers size={12} /> {memberCount} 人 · 本月</Text>
        </View>
        <Button className="icon-btn accent" openType="share" aria-label="邀请成员"><IconPlus size={18} /></Button>
      </View>
      <View className="header-stats">
        <View className="stat"><Text className="stat-label">本月总支出</Text><Text className="stat-value">¥{total.toFixed(2)}</Text></View>
        <View className="stat"><Text className="stat-label">本月笔数</Text><Text className="stat-value">{monthEntries.length} 笔</Text></View>
      </View>
    </View>
  )
}
