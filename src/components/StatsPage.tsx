import { useMemo, useState } from 'react'
import type { Entry, Member } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR, avatarColor } from '../utils/colors'
import { IconArrowLeft } from './Icons'

interface Props {
  entries: Entry[]
  members: Member[]
  onBack: () => void
}

interface CatStat {
  category: string
  amount: number
  count: number
  percent: number
}

function getMonth(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// 按本地日聚合，口径与月份筛选(getMonth)一致，均取 createdAt
function getDayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function formatDayLabel(key: string): string {
  const [Y, M, D] = key.split('-').map(Number)
  const w = WEEK_LABEL[new Date(Y, M - 1, D).getDay()]
  return `${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')} ${w}`
}
/** 每日支出折线图（纯 SVG，无第三方依赖） */
function DayTrendChart({ data }: { data: { day: string; amount: number; count: number }[] }) {
  const W = 340
  const H = 180
  const PL = 40
  const PR = 12
  const PT = 28
  const PB = 32
  const asc = [...data].sort((a, b) => a.day.localeCompare(b.day))
  const max = Math.max(...asc.map((d) => d.amount), 1)
  const n = asc.length
  const xAt = (i: number) => (n <= 1 ? (W - PL - PR) / 2 + PL : PL + (i / (n - 1)) * (W - PL - PR))
  const yAt = (v: number) => H - PB - (v / max) * (H - PT - PB)
  const path = asc.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(d.amount).toFixed(1)}`).join(' ')
  const gridVals = [0, max / 2, max]
  const showVal = n <= 7
  const xStep = n <= 10 ? 1 : Math.ceil(n / 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yAt(v)} x2={W - PR} y2={yAt(v)} stroke="var(--line)" strokeWidth={1} strokeDasharray={i === 0 ? '' : '3 3'} />
          <text x={PL - 6} y={yAt(v) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)">
            {Math.round(v)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {asc.map((d, i) => (
        <g key={d.day}>
          <circle cx={xAt(i)} cy={yAt(d.amount)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          {showVal && (
            <text x={xAt(i)} y={yAt(d.amount) - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent-strong)">
              ¥{d.amount.toFixed(0)}
            </text>
          )}
          {i % xStep === 0 && (
            <text x={xAt(i)} y={H - PB + 14} textAnchor="middle" fontSize={9} fill="var(--ink-3)">
              {d.day.slice(5).replace('-', '/')}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function StatsPage({ entries, members, onBack }: Props) {
  const [filterMember, setFilterMember] = useState<string>('all')
  const todayKey = getDayKey(Date.now())
  // 整页时间范围：默认只看“今天”，主动切换到月/年/全部后才扩大统计口径。
  // 取值：day:YYYY-MM-DD（默认今天）/ month:YYYY-MM / year:YYYY / all
  const [range, setRange] = useState<string>(`day:${todayKey}`)

  const active = useMemo(
    () => entries.filter((e) => !(e.amount === 0 && (e.note || '').includes('【已删除】'))),
    [entries],
  )

  // 合并正式成员 + 账目中出现过的成员（覆盖演示成员/已移除成员的历史账目）
  const allMembers = useMemo<Member[]>(() => {
    const map = new Map<string, Member>()
    for (const m of members) map.set(m.id, m)
    for (const e of active) {
      if (!map.has(e.memberId)) {
        map.set(e.memberId, { id: e.memberId, ledgerId: e.ledgerId, nickname: e.nickname, joinedAt: e.createdAt })
      }
    }
    return Array.from(map.values())
  }, [members, active])

  const months = useMemo(() => {
    const set = new Set<string>()
    for (const e of active) set.add(getMonth(e.createdAt))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [active])

  const years = useMemo(() => {
    const set = new Set<string>()
    for (const e of active) set.add(String(new Date(e.createdAt).getFullYear()))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [active])

  const filtered = useMemo(() => {
    let list = active
    if (filterMember !== 'all') list = list.filter((e) => e.memberId === filterMember)
    if (range !== 'all') {
      const [kind, val] = range.split(':')
      list = list.filter((e) => {
        if (kind === 'day') return getDayKey(e.createdAt) === val
        if (kind === 'month') return getMonth(e.createdAt) === val
        if (kind === 'year') return String(new Date(e.createdAt).getFullYear()) === val
        return true
      })
    }
    return list
  }, [active, filterMember, range])

  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const stats = useMemo<CatStat[]>(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of filtered) {
      const cur = map.get(e.category) ?? { amount: 0, count: 0 }
      cur.amount += e.amount
      cur.count += 1
      map.set(e.category, cur)
    }
    const list: CatStat[] = []
    const allCats = new Set([...CATEGORIES, ...Array.from(map.keys())])
    for (const c of allCats) {
      const v = map.get(c)
      if (v && v.amount > 0) {
        list.push({ category: c, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 })
      }
    }
    list.sort((a, b) => b.amount - a.amount)
    return list
  }, [filtered, total])

  const memberStats = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of filtered) {
      const cur = map.get(e.memberId) ?? { amount: 0, count: 0 }
      cur.amount += e.amount
      cur.count += 1
      map.set(e.memberId, cur)
    }
    return allMembers
      .map((m) => ({ member: m, ...(map.get(m.id) ?? { amount: 0, count: 0 }) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [filtered, allMembers])

  const rangeLabel = (() => {
    if (range === 'all') return '全部'
    const [kind, val] = range.split(':')
    if (kind === 'day') return val === todayKey ? '今日' : val.slice(5).replace('-', '/')
    if (kind === 'year') return `${val}年`
    const [, M] = val.split('-')
    return `${Number(M)}月`
  })()
  // 每日支出折线图数据：当日模式自动扩展到该自然月（避免只显示一个点），
  // 月/年/全部模式对应各自范围；成员筛选同样生效。
  const trendStats = useMemo(() => {
    let list = filterMember !== 'all' ? active.filter((e) => e.memberId === filterMember) : active
    if (range !== 'all') {
      const [kind, val] = range.split(':')
      if (kind === 'day' || kind === 'month') {
        const [Y, M] = val.split('-')
        list = list.filter((e) => {
          const d = new Date(e.createdAt)
          return d.getFullYear() === Number(Y) && d.getMonth() + 1 === Number(M)
        })
      } else if (kind === 'year') {
        list = list.filter((e) => new Date(e.createdAt).getFullYear() === Number(val))
      }
    }
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of list) {
      const k = getDayKey(e.createdAt)
      const cur = map.get(k) ?? { amount: 0, count: 0 }
      cur.amount += e.amount
      cur.count += 1
      map.set(k, cur)
    }
    return Array.from(map.entries())
      .map(([day, v]) => ({ day, amount: v.amount, count: v.count }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }, [active, filterMember, range])
  const trendTotal = trendStats.reduce((s, d) => s + d.amount, 0)
  const trendAvg = trendStats.length > 0 ? trendTotal / trendStats.length : 0
  const pickedDay = range.startsWith('day:') ? range.slice(4) : ''
  const avgBase = memberStats.length > 0 ? memberStats.length : 1

  return (
    <div className="page stats">
      <div className="stats-header">
        <button className="stats-back" onClick={onBack}>
          <IconArrowLeft size={18} /> 返回
        </button>
        <span className="stats-title">统计</span>
      </div>

      <div className="stats-summary">
        <div className="stats-card">
          <div className="stats-label">{rangeLabel}支出</div>
          <div className="stats-value">¥{total.toFixed(2)}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">笔数</div>
          <div className="stats-value">{filtered.length}</div>
        </div>
        <div className="stats-card">
          <div className="stats-label">人均</div>
          <div className="stats-value">¥{(total / avgBase).toFixed(2)}</div>
        </div>
      </div>

      <div className="stats-filter">
        <div className="stats-filter-item">
          <span className="stats-filter-label">时间</span>
          <select className="stats-select" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value={`day:${todayKey}`}>今天</option>
            {years.map((y) => (
              <option key={y} value={`year:${y}`}>{y}年</option>
            ))}
            {months.map((m) => {
              const [Y, M] = m.split('-')
              return (
                <option key={m} value={`month:${m}`}>{Y}年{Number(M)}月</option>
              )
            })}
            <option value="all">全部时间</option>
          </select>
        </div>
        <div className="stats-filter-item">
          <span className="stats-filter-label">成员</span>
          <select className="stats-select" value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
            <option value="all">全部</option>
            {allMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.nickname}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title stats-day-head">
          每日支出
          {trendStats.length > 1 && (
            <span className="stats-section-hint">日均 ¥{trendAvg.toFixed(2)} · {trendStats.length} 天有记录</span>
          )}
        </div>
        {trendStats.length === 0 ? (
          <div className="stats-empty">该条件下暂无数据</div>
        ) : (
          <>
            <DayTrendChart data={trendStats} />
            {trendStats.length > 1 && (
              <div className="stats-filter stats-day-picker" style={{ marginTop: 4 }}>
                <div className="stats-filter-item">
                  <span className="stats-filter-label">查看某天</span>
                  <select className="stats-select" value={pickedDay} onChange={(e) => setRange(`day:${e.target.value}`)}>
                    {trendStats.map((d) => (
                      <option key={d.day} value={d.day}>
                        {formatDayLabel(d.day)}{d.day === todayKey ? '（今天）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="stats-section">
        <div className="stats-section-title">分类占比</div>
        {stats.length === 0 ? (
          <div className="stats-empty">该条件下暂无数据</div>
        ) : (
          <div className="stats-cat-list">
            {stats.map((s) => (
              <div key={s.category} className="stats-cat-row">
                <div className="stats-cat-label">
                  <span className="stats-cat-dot" style={{ background: CATEGORY_COLOR_VAR[s.category as keyof typeof CATEGORY_COLOR_VAR] ?? 'var(--c-other)' }} />
                  <span className="stats-cat-name">{s.category}</span>
                  <span className="stats-cat-count">{s.count}笔</span>
                </div>
                <div className="stats-cat-bar-wrap">
                  <div
                    className="stats-cat-bar"
                    style={{ width: `${Math.max(s.percent, 3)}%`, background: CATEGORY_COLOR_VAR[s.category as keyof typeof CATEGORY_COLOR_VAR] ?? 'var(--c-other)' }}
                  />
                </div>
                <div className="stats-cat-amount">
                  <span className="stats-cat-money">¥{s.amount.toFixed(2)}</span>
                  <span className="stats-cat-percent">{s.percent.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stats-section" style={{ paddingBottom: 28 }}>
        <div className="stats-section-title">成员支出</div>
        {memberStats.length === 0 ? (
          <div className="stats-empty">该条件下暂无数据</div>
        ) : (
          <div className="stats-member-list">
            {memberStats.map(({ member, amount, count }) => (
              <div key={member.id} className="stats-member-row">
                <span className="stats-member-name">
                  <span className="stats-member-avatar" style={{ background: avatarColor(member.id), color: '#fff' }}>
                    {member.nickname.slice(0, 1)}
                  </span>
                  {member.nickname}
                </span>
                <span className="stats-member-count">{count}笔</span>
                <span className="stats-member-amount">¥{amount.toFixed(2)}</span>
                <span className="stats-member-percent">{total > 0 ? ((amount / total) * 100).toFixed(0) : 0}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
