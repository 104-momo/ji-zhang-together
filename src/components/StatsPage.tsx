import { useMemo, useState } from 'react'
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components'
import type { Entry, Member } from '../types'
import { categoryColor } from '../utils/colors'
import { IconArrowLeft, IconCalendar, IconChevronDown, IconReport } from './Icons'
import {
  activeEntries, catStats, currentMonth, currentYear, dayLabelFromKey, filterByRange,
  getDayKey, getMonth, memberStats, monthLabel, pad2, prevRangeKey, rangeDays,
  shortMonthLabel, sumAmount, yearLabel, type Range,
} from '../utils/stats'

interface Props {
  entries: Entry[]
  members: Member[]
  categories?: string[]
  onBack: () => void
  onOpenCalendar: () => void
  onOpenReport: () => void
}

export default function StatsPage({ entries, members, categories, onBack, onOpenCalendar, onOpenReport }: Props) {
  const now = new Date()
  const curMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const [range, setRange] = useState<string>(`month:${curMonth}`)
  const [memberFilter, setMemberFilter] = useState('all')

  const memberName = (id: string) => members.find((m) => m.id === id)?.nickname || '成员'
  const memberColor = (name: string) => {
    const palette = ['#1f8a70', '#4a90c2', '#d2688c', '#9b7bd4', '#c08431', '#5fa87a', '#d4645c']
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return palette[h % palette.length]
  }

  const months = useMemo(() => {
    const set = new Set<string>()
    activeEntries(entries).forEach((e) => set.add(getMonth(e.createdAt)))
    set.add(curMonth)
    return Array.from(set).sort().reverse()
  }, [entries, curMonth])

  const years = useMemo(() => {
    const set = new Set<string>()
    activeEntries(entries).forEach((e) => set.add(String(new Date(e.createdAt).getFullYear())))
    set.add(currentYear())
    return Array.from(set).sort().reverse()
  }, [entries])

  const timeOptions = useMemo(() => {
    const list = [
      { value: `day:${getDayKey(Date.now())}`, label: '今天' },
      { value: `month:${curMonth}`, label: '本月' },
    ]
    const lastMonth = prevRangeKey({ kind: 'month', key: curMonth })!
    list.push({ value: `month:${lastMonth}`, label: '上月' })
    list.push({ value: `year:${currentYear()}`, label: '今年' })
    months.forEach((m) => { if (!list.some((o) => o.value === `month:${m}`)) list.push({ value: `month:${m}`, label: monthLabel(m) }) })
    years.forEach((y) => { if (!list.some((o) => o.value === `year:${y}`)) list.push({ value: `year:${y}`, label: yearLabel(y) }) })
    list.push({ value: 'all:all', label: '全部时间' })
    return list
  }, [months, years, curMonth])

  const memberOptions = useMemo(() => [{ id: 'all', nickname: '全部成员' }, ...members], [members])

  const rangeObj = useMemo<Range>(() => {
    const [kind, key] = range.split(':')
    if (kind === 'day') return { kind: 'day', key }
    if (kind === 'month') return { kind: 'month', key }
    if (kind === 'year') return { kind: 'year', key }
    return { kind: 'all' }
  }, [range])

  const rangeLabel = useMemo(() => timeOptions.find((o) => o.value === range)?.label || '全部时间', [timeOptions, range])

  const filtered = useMemo(() => {
    let list = filterByRange(activeEntries(entries), rangeObj)
    if (memberFilter !== 'all') list = list.filter((e) => e.memberId === memberFilter)
    return list
  }, [entries, rangeObj, memberFilter])

  const total = sumAmount(filtered)
  const days = rangeDays(rangeObj)
  const avg = total / days

  const cats = useMemo(() => catStats(filtered, categories), [filtered, categories])
  const mStats = useMemo(() => memberStats(filtered), [filtered])

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    filtered.forEach((e) => {
      const k = getDayKey(e.createdAt)
      const arr = map.get(k) || []
      arr.push(e); map.set(k, arr)
    })
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  /** 环比对比 */
  const compare = useMemo(() => {
    const prevKey = prevRangeKey(rangeObj)
    if (!prevKey) return null
    const prevRange: Range = rangeObj.kind === 'all' ? { kind: 'all' } : { kind: rangeObj.kind, key: prevKey } as Range
    let prevList = filterByRange(activeEntries(entries), prevRange)
    if (memberFilter !== 'all') prevList = prevList.filter((e) => e.memberId === memberFilter)
    const prevTotal = sumAmount(prevList)
    const diff = total - prevTotal
    const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : null
    const prevLabel = rangeObj.kind === 'month' ? `上月` : rangeObj.kind === 'year' ? '去年' : '昨天'
    return { prevTotal, diff, pct, prevLabel, prevCount: prevList.length, curCount: filtered.length }
  }, [rangeObj, entries, memberFilter, total, filtered.length])

  // 近 7 天/12 个月/近 5 年 趋势
  const trend = useMemo(() => {
    if (rangeObj.kind === 'day') {
      const arr: { label: string; value: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const k = getDayKey(d.getTime())
        let list = activeEntries(entries).filter((e) => getDayKey(e.createdAt) === k)
        if (memberFilter !== 'all') list = list.filter((e) => e.memberId === memberFilter)
        arr.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: sumAmount(list) })
      }
      return { title: '近7天支出', cols: arr }
    }
    if (rangeObj.kind === 'month') {
      const arr: { label: string; value: number }[] = []
      const monthKeys = months.slice(0, 12).reverse()
      monthKeys.forEach((m) => {
        let list = activeEntries(entries).filter((e) => getMonth(e.createdAt) === m)
        if (memberFilter !== 'all') list = list.filter((e) => e.memberId === memberFilter)
        arr.push({ label: shortMonthLabel(m), value: sumAmount(list) })
      })
      return { title: '近12个月支出', cols: arr }
    }
    const arr: { label: string; value: number }[] = []
    years.slice(0, 5).reverse().forEach((y) => {
      let list = activeEntries(entries).filter((e) => String(new Date(e.createdAt).getFullYear()) === y)
      if (memberFilter !== 'all') list = list.filter((e) => e.memberId === memberFilter)
      arr.push({ label: y, value: sumAmount(list) })
    })
    return { title: '近年支出', cols: arr }
  }, [rangeObj.kind, months, years, entries, memberFilter])

  const maxTrend = Math.max(1, ...trend.cols.map((c) => c.value))

  return (
    <View className="page stats-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">统计</Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView className="stats-scroll" scrollY enableFlex>
        <View className="stats-filter">
          <Picker mode="selector" range={timeOptions} rangeKey="label" onChange={(e) => setRange(timeOptions[Number(e.detail.value)].value)}>
            <Button className="stats-select">{rangeLabel} <IconChevronDown size={12} /></Button>
          </Picker>
          <Picker mode="selector" range={memberOptions} rangeKey="nickname" onChange={(e) => setMemberFilter(memberOptions[Number(e.detail.value)].id)}>
            <Button className="stats-select">{memberFilter === 'all' ? '全部成员' : memberName(memberFilter)} <IconChevronDown size={12} /></Button>
          </Picker>
        </View>
        <View className="stats-filter stats-quick-row">
          <Button className="ledger-action-btn" onClick={onOpenCalendar}><IconCalendar size={14} /> 日历视图</Button>
          <Button className="ledger-action-btn" onClick={onOpenReport}><IconReport size={14} /> 月度报告</Button>
        </View>

        <View className="stats-summary">
          <View className="stats-card"><Text className="stats-label">总支出</Text><Text className="stats-value">¥{total.toFixed(0)}</Text></View>
          <View className="stats-card"><Text className="stats-label">笔数</Text><Text className="stats-value">{filtered.length}</Text></View>
          <View className="stats-card"><Text className="stats-label">日均</Text><Text className="stats-value">¥{avg.toFixed(0)}</Text></View>
        </View>

        {compare && (compare.prevTotal > 0 || total > 0) ? (
          <View className="stats-section">
            <View className={`compare-card ${compare.diff > 0 ? 'up' : compare.diff < 0 ? 'down' : ''}`}>
              <Text className="compare-label">较{compare.prevLabel}</Text>
              <Text className="compare-main">
                {compare.prevTotal === 0 && total > 0 ? `${compare.prevLabel}无记录` : (
                  <>
                    {compare.diff > 0 ? '多花 ' : compare.diff < 0 ? '少花 ' : '持平 '}
                    {compare.diff !== 0 ? <Text className="compare-amt">¥{Math.abs(compare.diff).toFixed(0)}</Text> : null}
                    {compare.pct !== null ? <Text className="compare-pct">（{compare.diff > 0 ? '+' : ''}{compare.pct.toFixed(0)}%）</Text> : null}
                  </>
                )}
              </Text>
              <Text className="compare-sub">{compare.prevLabel} ¥{compare.prevTotal.toFixed(0)} · {compare.prevCount}笔</Text>
            </View>
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View className="stats-section"><View className="stats-empty">这段时间还没有账目</View></View>
        ) : (
          <>
            <View className="stats-section">
              <Text className="stats-section-title">{trend.title}</Text>
              <View className="stats-cat-list">
                <DayTrendChart cols={trend.cols} max={maxTrend} />
              </View>
            </View>

            <View className="stats-section">
              <Text className="stats-section-title">分类统计</Text>
              <View className="stats-cat-list">
                {cats.map((c) => (
                  <View key={c.category} className="stats-cat-row">
                    <View className="stats-cat-label">
                      <Text className="stats-cat-dot" style={{ background: categoryColor(c.category) }} />
                      <Text className="stats-cat-name">{c.category}</Text>
                    </View>
                    <View className="stats-cat-bar-wrap"><View className="stats-cat-bar" style={{ width: `${Math.max(c.percent, 3)}%`, background: categoryColor(c.category) }} /></View>
                    <View className="stats-cat-amount">
                      <Text className="stats-cat-money">¥{c.amount.toFixed(0)}</Text>
                      <Text className="stats-cat-percent">{c.percent.toFixed(0)}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {members.length > 1 ? (
              <View className="stats-section">
                <Text className="stats-section-title">成员对比</Text>
                <View className="stats-member-list">
                  {mStats.map((m) => (
                    <View key={m.nickname} className="stats-member-row">
                      <Text className="stats-member-name">
                        <Text className="stats-member-avatar" style={{ background: memberColor(m.nickname) }}>{m.nickname.slice(0, 1)}</Text>
                        {m.nickname} · {m.count}笔
                      </Text>
                      <Text className="stats-member-amount">¥{m.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="stats-section">
              <Text className="stats-section-title">每日明细</Text>
              <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byDay.map(([day, list]) => (
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
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}

function DayTrendChart({ cols, max }: { cols: { label: string; value: number }[]; max: number }) {
  return (
    <View className="trend-chart">
      <View className="trend-bars">
        {cols.map((c, i) => (
          <View key={i} className="trend-col">
            <View className="trend-col-body">
              {c.value > 0 ? <Text className="trend-val">{c.value >= 10000 ? `${(c.value / 10000).toFixed(1)}w` : c.value.toFixed(0)}</Text> : null}
              <View className="trend-bar" style={{ height: `${Math.max((c.value / max) * 100, c.value > 0 ? 4 : 1)}%` }} />
            </View>
            <Text className="trend-x">{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
