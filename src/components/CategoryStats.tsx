import { useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { Category, Entry } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR } from '../utils/colors'
import { IconChart, IconChevronDown } from './Icons'

interface Props { entries: Entry[] }
interface CatStat { category: Category; amount: number; count: number; percent: number }

export default function CategoryStats({ entries }: Props) {
  const [open, setOpen] = useState(false)
  const stats = useMemo<CatStat[]>(() => {
    const active = entries.filter((e) => !(e.amount === 0 && (e.note || '').includes('【已删除】')))
    const total = active.reduce((s, e) => s + e.amount, 0)
    const map = new Map<Category, { amount: number; count: number }>()
    for (const e of active) { const cur = map.get(e.category) ?? { amount: 0, count: 0 }; cur.amount += e.amount; cur.count += 1; map.set(e.category, cur) }
    const list: CatStat[] = []
    for (const c of CATEGORIES) { const v = map.get(c); if (v && v.amount > 0) list.push({ category: c, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 }) }
    list.sort((a, b) => b.amount - a.amount)
    return list
  }, [entries])
  const total = stats.reduce((s, c) => s + c.amount, 0)
  if (stats.length === 0) return null
  return (
    <View className="cat-stats">
      <Button className="cat-toggle" onClick={() => setOpen((v) => !v)}>
        <Text className="cat-toggle-icon"><IconChart size={16} /></Text>
        <Text className="cat-toggle-text">分类统计</Text>
        <Text className="cat-toggle-total">¥{total.toFixed(0)}</Text>
        <Text className={`cat-toggle-arrow ${open ? 'open' : ''}`}><IconChevronDown size={14} /></Text>
      </Button>
      {open ? (
        <View className="cat-panel">
          {stats.map((s) => (
            <View key={s.category} className="cat-row">
              <View className="cat-label">
                <Text className="cat-dot" style={{ background: CATEGORY_COLOR_VAR[s.category] }} />
                <Text className="cat-name">{s.category}</Text>
                <Text className="cat-count">{s.count}笔</Text>
              </View>
              <View className="cat-bar-wrap"><View className="cat-bar" style={{ width: `${Math.max(s.percent, 4)}%`, background: CATEGORY_COLOR_VAR[s.category] }} /></View>
              <View className="cat-amount">
                <Text className="cat-money">¥{s.amount.toFixed(2)}</Text>
                <Text className="cat-percent">{s.percent.toFixed(0)}%</Text>
              </View>
            </View>
          ))}
          <View className="cat-total">合计 <Text className="cat-total-strong">¥{total.toFixed(2)}</Text></View>
        </View>
      ) : null}
    </View>
  )
}
