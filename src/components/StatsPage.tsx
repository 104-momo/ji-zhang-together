import { useMemo, useState } from 'react'
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components'
import type { Entry, Member } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR, avatarColor } from '../utils/colors'
import { IconArrowLeft } from './Icons'

interface Props { entries: Entry[]; members: Member[]; onBack: () => void }
interface CatStat { category: string; amount: number; count: number; percent: number }

function getMonth(ts: number): string { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function getDayKey(ts: number): string { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function formatDayLabel(key: string): string { const [Y, M, D] = key.split('-').map(Number); const w = WEEK_LABEL[new Date(Y, M - 1, D).getDay()]; return `${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')} ${w}` }

function DayTrendChart({ data }: { data: { day: string; amount: number; count: number }[] }) {
  const asc = [...data].sort((a, b) => a.day.localeCompare(b.day))
  const max = Math.max(...asc.map((d) => d.amount), 1)
  const showVal = asc.length <= 7
  const xStep = asc.length <= 10 ? 1 : Math.ceil(asc.length / 10)
  return (
    <View className="trend-chart">
      <View className="trend-y">
        <Text className="trend-y-label">{Math.round(max)}</Text>
        <Text className="trend-y-label">{Math.round(max / 2)}</Text>
        <Text className="trend-y-label">0</Text>
      </View>
      <View className="trend-bars">
        {asc.map((d, i) => (
          <View key={d.day} className="trend-col">
            <View className="trend-col-body">
              <View className="trend-bar" style={{ height: `${Math.max((d.amount / max) * 100, 2)}%` }} />
              {showVal && <Text className="trend-val">¥{d.amount.toFixed(0)}</Text>}
            </View>
            {i % xStep === 0 && <Text className="trend-x">{d.day.slice(5).replace('-', '/')}</Text>}
          </View>
        ))}
      </View>
    </View>
  )
}

export default function StatsPage({ entries, members, onBack }: Props) {
  const [filterMember, setFilterMember] = useState<string>('all')
  const todayKey = getDayKey(Date.now())
  const [range, setRange] = useState<string>(`day:${todayKey}`)
  const active = useMemo(() => entries.filter((e) => !(e.amount === 0 && (e.note || '').includes('【已删除】'))), [entries])
  const allMembers = useMemo<Member[]>(() => {
    const map = new Map<string, Member>()
    for (const m of members) map.set(m.id, m)
    for (const e of active) { if (!map.has(e.memberId)) map.set(e.memberId, { id: e.memberId, ledgerId: e.ledgerId, nickname: e.nickname, joinedAt: e.createdAt }) }
    return Array.from(map.values())
  }, [members, active])
  const months = useMemo(() => { const s = new Set<string>(); for (const e of active) s.add(getMonth(e.createdAt)); return Array.from(s).sort((a, b) => b.localeCompare(a)) }, [active])
  const years = useMemo(() => { const s = new Set<string>(); for (const e of active) s.add(String(new Date(e.createdAt).getFullYear())); return Array.from(s).sort((a, b) => b.localeCompare(a)) }, [active])
  const filtered = useMemo(() => {
    let list = active
    if (filterMember !== 'all') list = list.filter((e) => e.memberId === filterMember)
    if (range !== 'all') { const [kind, val] = range.split(':'); list = list.filter((e) => { if (kind === 'day') return getDayKey(e.createdAt) === val; if (kind === 'month') return getMonth(e.createdAt) === val; if (kind === 'year') return String(new Date(e.createdAt).getFullYear()) === val; return true }) }
    return list
  }, [active, filterMember, range])
  const total = filtered.reduce((s, e) => s + e.amount, 0)
  const stats = useMemo<CatStat[]>(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of filtered) { const cur = map.get(e.category) ?? { amount: 0, count: 0 }; cur.amount += e.amount; cur.count += 1; map.set(e.category, cur) }
    const list: CatStat[] = []
    const allCats = new Set([...CATEGORIES, ...Array.from(map.keys())])
    for (const c of allCats) { const v = map.get(c); if (v && v.amount > 0) list.push({ category: c, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 }) }
    list.sort((a, b) => b.amount - a.amount)
    return list
  }, [filtered, total])
  const memberStats = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of filtered) { const cur = map.get(e.memberId) ?? { amount: 0, count: 0 }; cur.amount += e.amount; cur.count += 1; map.set(e.memberId, cur) }
    return allMembers.map((m) => ({ member: m, ...(map.get(m.id) ?? { amount: 0, count: 0 }) })).filter((x) => x.count > 0).sort((a, b) => b.amount - a.amount)
  }, [filtered, allMembers])
  const rangeLabel = (() => { if (range === 'all') return '全部'; const [kind, val] = range.split(':'); if (kind === 'day') return val === todayKey ? '今日' : val.slice(5).replace('-', '/'); if (kind === 'year') return `${val}年`; const [, M] = val.split('-'); return `${Number(M)}月` })()
  const trendStats = useMemo(() => {
    let list = filterMember !== 'all' ? active.filter((e) => e.memberId === filterMember) : active
    if (range !== 'all') { const [kind, val] = range.split(':'); if (kind === 'day' || kind === 'month') { const [Y, M] = val.split('-'); list = list.filter((e) => { const d = new Date(e.createdAt); return d.getFullYear() === Number(Y) && d.getMonth() + 1 === Number(M) }) } else if (kind === 'year') { list = list.filter((e) => new Date(e.createdAt).getFullYear() === Number(val)) } }
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of list) { const k = getDayKey(e.createdAt); const cur = map.get(k) ?? { amount: 0, count: 0 }; cur.amount += e.amount; cur.count += 1; map.set(k, cur) }
    return Array.from(map.entries()).map(([day, v]) => ({ day, amount: v.amount, count: v.count })).sort((a, b) => a.day.localeCompare(b.day))
  }, [active, filterMember, range])
  const trendTotal = trendStats.reduce((s, d) => s + d.amount, 0)
  const trendAvg = trendStats.length > 0 ? trendTotal / trendStats.length : 0
  const pickedDay = range.startsWith('day:') ? range.slice(4) : ''
  const avgBase = memberStats.length > 0 ? memberStats.length : 1
  const timeOptions = [
    { label: '今天', value: `day:${todayKey}` },
    ...years.map((y) => ({ label: `${y}年`, value: `year:${y}` })),
    ...months.map((m) => { const [Y, M] = m.split('-'); return { label: `${Y}年${Number(M)}月`, value: `month:${m}` } }),
    { label: '全部时间', value: 'all' },
  ]
  const timeIndex = Math.max(0, timeOptions.findIndex((o) => o.value === range))
  const memberOptions = [{ label: '全部', value: 'all' }, ...allMembers.map((m) => ({ label: m.nickname, value: m.id }))]
  const memberIndex = Math.max(0, memberOptions.findIndex((o) => o.value === filterMember))
  const dayOptions = trendStats.map((d) => ({ label: formatDayLabel(d.day) + (d.day === todayKey ? '（今天）' : ''), value: d.day }))
  const dayIndex = Math.max(0, dayOptions.findIndex((o) => o.value === pickedDay))
  return (
    <View className="page stats">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">统计</Text>
      </View>
      <ScrollView className="stats-scroll" scrollY>
        <View className="stats-summary">
          <View className="stats-card"><Text className="stats-label">{rangeLabel}支出</Text><Text className="stats-value">¥{total.toFixed(2)}</Text></View>
          <View className="stats-card"><Text className="stats-label">笔数</Text><Text className="stats-value">{filtered.length}</Text></View>
          <View className="stats-card"><Text className="stats-label">人均</Text><Text className="stats-value">¥{(total / avgBase).toFixed(2)}</Text></View>
        </View>
        <View className="stats-filter">
          <View className="stats-filter-item"><Text className="stats-filter-label">时间</Text>
            <Picker mode="selector" range={timeOptions.map((o) => o.label)} value={timeIndex} onChange={(e) => setRange(timeOptions[Number(e.detail.value)].value)}><View className="stats-select">{timeOptions[timeIndex].label} ▾</View></Picker>
          </View>
          <View className="stats-filter-item"><Text className="stats-filter-label">成员</Text>
            <Picker mode="selector" range={memberOptions.map((o) => o.label)} value={memberIndex} onChange={(e) => setFilterMember(memberOptions[Number(e.detail.value)].value)}><View className="stats-select">{memberOptions[memberIndex].label} ▾</View></Picker>
          </View>
        </View>
        <View className="stats-section">
          <View className="stats-section-title stats-day-head"><Text>每日支出</Text>{trendStats.length > 1 && (<Text className="stats-section-hint">日均 ¥{trendAvg.toFixed(2)} · {trendStats.length} 天有记录</Text>)}</View>
          {trendStats.length === 0 ? (<View className="stats-empty">该条件下暂无数据</View>) : (
            <View>
              <DayTrendChart data={trendStats} />
              {trendStats.length > 1 && (
                <View className="stats-filter stats-day-picker" style={{ marginTop: 4 }}>
                  <View className="stats-filter-item"><Text className="stats-filter-label">查看某天</Text>
                    <Picker mode="selector" range={dayOptions.map((o) => o.label)} value={dayIndex} onChange={(e) => setRange(`day:${dayOptions[Number(e.detail.value)].value}`)}><View className="stats-select">{dayOptions[dayIndex].label} ▾</View></Picker>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
        <View className="stats-section">
          <View className="stats-section-title">分类占比</View>
          {stats.length === 0 ? (<View className="stats-empty">该条件下暂无数据</View>) : (
            <View className="stats-cat-list">
              {stats.map((s) => (
                <View key={s.category} className="stats-cat-row">
                  <View className="stats-cat-label">
                    <Text className="stats-cat-dot" style={{ background: CATEGORY_COLOR_VAR[s.category as keyof typeof CATEGORY_COLOR_VAR] ?? 'var(--c-other)' }} />
                    <Text className="stats-cat-name">{s.category}</Text>
                    <Text className="stats-cat-count">{s.count}笔</Text>
                  </View>
                  <View className="stats-cat-bar-wrap"><View className="stats-cat-bar" style={{ width: `${Math.max(s.percent, 3)}%`, background: CATEGORY_COLOR_VAR[s.category as keyof typeof CATEGORY_COLOR_VAR] ?? 'var(--c-other)' }} /></View>
                  <View className="stats-cat-amount">
                    <Text className="stats-cat-money">¥{s.amount.toFixed(2)}</Text>
                    <Text className="stats-cat-percent">{s.percent.toFixed(0)}%</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        <View className="stats-section" style={{ paddingBottom: 28 }}>
          <View className="stats-section-title">成员支出</View>
          {memberStats.length === 0 ? (<View className="stats-empty">该条件下暂无数据</View>) : (
            <View className="stats-member-list">
              {memberStats.map(({ member, amount, count }) => (
                <View key={member.id} className="stats-member-row">
                  <Text className="stats-member-name">
                    <Text className="stats-member-avatar" style={{ background: avatarColor(member.id), color: '#fff' }}>{member.nickname.slice(0, 1)}</Text>
                    {member.nickname}
                  </Text>
                  <Text className="stats-member-count">{count}笔</Text>
                  <Text className="stats-member-amount">¥{amount.toFixed(2)}</Text>
                  <Text className="stats-member-percent">{total > 0 ? ((amount / total) * 100).toFixed(0) : 0}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
