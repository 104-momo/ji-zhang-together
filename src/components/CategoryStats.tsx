import { useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { Category, Entry, Member } from '../types'
import { CATEGORIES } from '../types'
import { categoryColor } from '../utils/colors'
import { IconChart, IconChevronDown, IconUsers } from './Icons'

interface Props { entries: Entry[]; members?: Member[]; categories?: string[] }
interface CatStat { category: string; amount: number; count: number; percent: number }
interface MemStat { nickname: string; amount: number; count: number; percent: number }

function memberColor(name: string) {
  const palette = ['#1f8a70', '#4a90c2', '#d2688c', '#9b7bd4', '#c08431', '#5fa87a', '#d4645c']
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export default function CategoryStats({ entries, members, categories }: Props) {
  const [tab, setTab] = useState<'' | 'cat' | 'member'>('')
  const isValid = (e: Entry) => !(e.amount === 0 && (e.note || '').includes('【已删除】'))

  const catList = useMemo<CatStat[]>(() => {
    const active = entries.filter(isValid)
    const total = active.reduce((s, e) => s + Number(e.amount || 0), 0)
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of active) { const cur = map.get(e.category) ?? { amount: 0, count: 0 }; cur.amount += Number(e.amount || 0); cur.count += 1; map.set(e.category, cur) }
    const allCats = [...new Set<string>([...CATEGORIES, ...(categories || []), ...map.keys()])]
    const list: CatStat[] = []
    for (const c of allCats) { const v = map.get(c); if (v && v.amount > 0) list.push({ category: c, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 }) }
    list.sort((a, b) => b.amount - a.amount)
    return list
  }, [entries, categories])

  const memList = useMemo<MemStat[]>(() => {
    const active = entries.filter(isValid)
    const total = active.reduce((s, e) => s + Number(e.amount || 0), 0)
    const nameOf = (e: Entry) => members?.find((m) => m.id === e.memberId)?.nickname || e.nickname || '成员'
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of active) {
      const name = nameOf(e)
      const cur = map.get(name) ?? { amount: 0, count: 0 }
      cur.amount += Number(e.amount || 0); cur.count += 1
      map.set(name, cur)
    }
    return Array.from(map.entries())
      .map(([nickname, v]) => ({ nickname, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [entries, members])

  const total = catList.reduce((s, c) => s + c.amount, 0)
  if (catList.length === 0) return null

  const toggle = (t: 'cat' | 'member') => setTab((cur) => (cur === t ? '' : t))

  return (
    <View className="cat-stats">
      <View className="stat-tabs">
        <Button className={`stat-tab ${tab === 'cat' ? 'open' : ''}`} onClick={() => toggle('cat')}>
          <Text className="stat-tab-icon"><IconChart size={14} /></Text>
          <Text className="stat-tab-text">分类</Text>
          <Text className="stat-tab-total">¥{total.toFixed(0)}</Text>
          <Text className={`stat-tab-arrow ${tab === 'cat' ? 'open' : ''}`}><IconChevronDown size={12} /></Text>
        </Button>
        <Button className={`stat-tab ${tab === 'member' ? 'open' : ''}`} onClick={() => toggle('member')}>
          <Text className="stat-tab-icon"><IconUsers size={14} /></Text>
          <Text className="stat-tab-text">成员</Text>
          <Text className="stat-tab-total">¥{total.toFixed(0)}</Text>
          <Text className={`stat-tab-arrow ${tab === 'member' ? 'open' : ''}`}><IconChevronDown size={12} /></Text>
        </Button>
      </View>
      {tab ? (
        <View className="cat-panel">
          {tab === 'cat' ? catList.map((s) => (
            <View key={s.category} className="cat-row">
              <View className="cat-label">
                <Text className="cat-dot" style={{ background: categoryColor(s.category) }} />
                <Text className="cat-name">{s.category}</Text>
                <Text className="cat-count">{s.count}笔</Text>
              </View>
              <View className="cat-bar-wrap"><View className="cat-bar" style={{ width: `${Math.max(s.percent, 4)}%`, background: categoryColor(s.category) }} /></View>
              <View className="cat-amount">
                <Text className="cat-money">¥{s.amount.toFixed(2)}</Text>
                <Text className="cat-percent">{s.percent.toFixed(0)}%</Text>
              </View>
            </View>
          )) : memList.map((s) => (
            <View key={s.nickname} className="cat-row">
              <View className="cat-label">
                <Text className="cat-dot" style={{ background: memberColor(s.nickname) }} />
                <Text className="cat-name">{s.nickname}</Text>
                <Text className="cat-count">{s.count}笔</Text>
              </View>
              <View className="cat-bar-wrap"><View className="cat-bar" style={{ width: `${Math.max(s.percent, 4)}%`, background: memberColor(s.nickname) }} /></View>
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
