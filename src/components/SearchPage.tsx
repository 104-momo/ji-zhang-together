import { useMemo, useState } from 'react'
import { Button, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import type { Entry, Member } from '../types'
import { categoryColor } from '../utils/colors'
import { IconArrowLeft, IconChevronDown, IconSearch } from './Icons'
import {
  activeEntries, dayLabelFromKey, filterByRange, getDayKey,
  getMonth, sumAmount, type Range,
} from '../utils/stats'

interface Props {
  entries: Entry[]
  members: Member[]
  categories?: string[]
  onBack: () => void
}

const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'month:cur', label: '本月' },
  { value: 'month:prev', label: '上月' },
  { value: 'year:cur', label: '今年' },
]

export default function SearchPage({ entries, members, categories, onBack }: Props) {
  const [keyword, setKeyword] = useState('')
  const [cat, setCat] = useState('all')
  const [memberId, setMemberId] = useState('all')
  const [time, setTime] = useState('all')

  const catOptions = useMemo(() => {
    const set = new Set<string>(categories || [])
    activeEntries(entries).forEach((e) => set.add(e.category))
    return ['all', ...Array.from(set)]
  }, [entries, categories])

  const memberOptions = useMemo(() => [{ id: 'all', nickname: '全部成员' }, ...members], [members])

  const results = useMemo(() => {
    let list = activeEntries(entries)
    // 时间
    if (time !== 'all') {
      const now = new Date()
      let range: Range = { kind: 'all' }
      if (time === 'month:cur') range = { kind: 'month', key: getMonth(Date.now()) }
      else if (time === 'year:cur') range = { kind: 'year', key: String(now.getFullYear()) }
      else if (time === 'month:prev') {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        range = { kind: 'month', key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
      }
      list = filterByRange(list, range)
    }
    if (cat !== 'all') list = list.filter((e) => e.category === cat)
    if (memberId !== 'all') list = list.filter((e) => e.memberId === memberId)
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((e) =>
        (e.rawText || '').toLowerCase().includes(kw)
        || (e.note || '').toLowerCase().includes(kw)
        || (e.category || '').toLowerCase().includes(kw)
        || (e.nickname || '').toLowerCase().includes(kw),
      )
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt)
  }, [entries, keyword, cat, memberId, time])

  const total = sumAmount(results)
  const memberName = (id: string) => members.find((m) => m.id === id)?.nickname || '成员'
  const timeLabel = TIME_OPTIONS.find((t) => t.value === time)?.label || '全部时间'

  // 按天分组（倒序）
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    results.forEach((e) => {
      const k = getDayKey(e.createdAt)
      const arr = map.get(k) || []
      arr.push(e); map.set(k, arr)
    })
    return Array.from(map.entries())
  }, [results])

  return (
    <View className="page stats-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">搜索账目</Text>
        <View style={{ width: 56 }} />
      </View>

      <View className="search-bar">
        <Text className="search-icon"><IconSearch size={15} /></Text>
        <Input
          className="search-input"
          value={keyword}
          placeholder="搜金额、分类、备注、成员，如 午餐 / 餐饮 / 交通"
          confirmType="search"
          onInput={(e) => setKeyword(e.detail.value)}
        />
        {keyword ? <Button className="search-clear" onClick={() => setKeyword('')}>✕</Button> : null}
      </View>

      <View className="stats-filter search-filters">
        <Picker mode="selector" range={catOptions} onChange={(e) => setCat(catOptions[Number(e.detail.value)])}>
          <Button className="stats-select">{cat === 'all' ? '全部分类' : cat} <IconChevronDown size={12} /></Button>
        </Picker>
        <Picker mode="selector" range={memberOptions} rangeKey="nickname" onChange={(e) => setMemberId(memberOptions[Number(e.detail.value)].id)}>
          <Button className="stats-select">{memberId === 'all' ? '全部成员' : memberName(memberId)} <IconChevronDown size={12} /></Button>
        </Picker>
        <Picker mode="selector" range={TIME_OPTIONS} rangeKey="label" onChange={(e) => setTime(TIME_OPTIONS[Number(e.detail.value)].value)}>
          <Button className="stats-select">{timeLabel} <IconChevronDown size={12} /></Button>
        </Picker>
      </View>

      <ScrollView className="stats-scroll search-scroll" scrollY enableFlex>
        {results.length > 0 ? (
          <View className="stats-section">
            <Text className="search-sum">共 {results.length} 笔，合计 <Text className="search-sum-strong">¥{total.toFixed(2)}</Text></Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '10px' }}>
              {groups.map(([day, list]) => (
                <View key={day} className="stats-day-card">
                  <View className="stats-day-card-head">
                    <Text className="stats-day-card-date">{dayLabelFromKey(day)}{day === getDayKey(Date.now()) ? <Text className="stats-day-today"> 今天</Text> : null}</Text>
                    <Text className="stats-day-card-sum"><small>{list.length}笔</small>¥{sumAmount(list).toFixed(0)}</Text>
                  </View>
                  <View className="stats-day-detail">
                    {list.map((e) => (
                      <View key={e.id} className="stats-day-item">
                        <Text className="stats-day-item-time">{new Date(e.createdAt).toTimeString().slice(0, 5)}</Text>
                        <Text className="stats-day-item-dot" style={{ background: categoryColor(e.category) }} />
                        <Text className="stats-day-item-text">{e.note || e.rawText}</Text>
                        {members.length > 1 ? <Text className="stats-day-item-by">{e.nickname}</Text> : null}
                        <Text className="stats-day-item-amt">¥{Number(e.amount).toFixed(0)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View className="stats-section">
            <View className="stats-empty">{keyword || cat !== 'all' || memberId !== 'all' || time !== 'all' ? '没有符合条件的账目' : '输入关键词或选择筛选条件查找账目'}</View>
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}
