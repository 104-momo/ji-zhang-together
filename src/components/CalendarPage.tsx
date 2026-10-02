import { useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type { Entry, Member } from '../types'
import { categoryColor } from '../utils/colors'
import { IconArrowLeft, IconChevronLeft, IconChevronRight } from './Icons'
import { activeEntries, dayLabelFromKey, getDayKey, pad2, sumAmount } from '../utils/stats'

interface Props {
  entries: Entry[]
  members: Member[]
  onBack: () => void
}

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

export default function CalendarPage({ entries, members, onBack }: Props) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() }) // m: 0-based
  const [selected, setSelected] = useState(getDayKey(Date.now()))

  const dayMap = useMemo(() => {
    const map = new Map<string, Entry[]>()
    activeEntries(entries).forEach((e) => {
      const k = getDayKey(e.createdAt)
      const arr = map.get(k) || []
      arr.push(e); map.set(k, arr)
    })
    return map
  }, [entries])

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const lead = (first.getDay() + 6) % 7 // 周一为列首
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const arr: (string | null)[] = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(`${view.y}-${pad2(view.m + 1)}-${pad2(d)}`)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [view])

  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  const todayK = getDayKey(Date.now())
  const selectedEntries = (dayMap.get(selected) || []).sort((a, b) => a.createdAt - b.createdAt)
  const selectedTotal = sumAmount(selectedEntries)
  const memberName = (id: string) => members.find((m) => m.id === id)?.nickname || '成员'

  return (
    <View className="page stats-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">日历视图</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView className="stats-scroll" scrollY enableFlex>
        <View className="stats-section">
          <View className="cal-card">
            <View className="cal-nav">
              <Button className="cal-nav-btn" onClick={() => shiftMonth(-1)}><IconChevronLeft size={20} /></Button>
              <Text className="cal-nav-title">{view.y}年{view.m + 1}月</Text>
              <Button className="cal-nav-btn" onClick={() => shiftMonth(1)}><IconChevronRight size={20} /></Button>
            </View>
            <View className="cal-grid cal-head-row">
              {WEEK_HEAD.map((w) => <Text key={w} className="cal-cell cal-head-cell">{w}</Text>)}
            </View>
            <View className="cal-grid">
              {cells.map((k, i) => {
                if (!k) return <View key={`b${i}`} className="cal-cell cal-blank" />
                const dayList = dayMap.get(k)
                const dayNum = Number(k.slice(8))
                const sum = dayList ? sumAmount(dayList) : 0
                const isToday = k === todayK
                const isSel = k === selected
                return (
                  <Button key={k} className={`cal-cell cal-day ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''} ${dayList ? 'has-data' : ''}`} onClick={() => setSelected(k)}>
                    <Text className="cal-day-num">{dayNum}</Text>
                    {sum > 0 ? <Text className="cal-day-amt">¥{sum >= 10000 ? `${(sum / 10000).toFixed(1)}w` : sum.toFixed(0)}</Text> : <Text className="cal-day-amt cal-day-dot">·</Text>}
                  </Button>
                )
              })}
            </View>
            <View className="cal-legend">
              <Text className="cal-legend-item"><Text className="cal-legend-dot" /> 有支出</Text>
              <Text className="cal-legend-item"><Text className="cal-legend-today" /> 今天</Text>
            </View>
          </View>
        </View>

        <View className="stats-section">
          <Text className="stats-section-title">{dayLabelFromKey(selected)} 明细</Text>
          {selectedEntries.length === 0 ? (
            <View className="stats-empty">当天没有账目</View>
          ) : (
            <View className="stats-day-card">
              <View className="stats-day-card-head">
                <Text className="stats-day-card-date">{selectedEntries.length} 笔</Text>
                <Text className="stats-day-card-sum">¥{selectedTotal.toFixed(2)}</Text>
              </View>
              <View className="stats-day-detail">
                {selectedEntries.map((e) => (
                  <View key={e.id} className="stats-day-item">
                    <Text className="stats-day-item-time">{new Date(e.createdAt).toTimeString().slice(0, 5)}</Text>
                    <Text className="stats-day-item-dot" style={{ background: categoryColor(e.category) }} />
                    <Text className="stats-day-item-text">{e.note || e.rawText}</Text>
                    {members.length > 1 ? <Text className="stats-day-item-by">{memberName(e.memberId)}</Text> : null}
                    <Text className="stats-day-item-amt">¥{Number(e.amount).toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}
