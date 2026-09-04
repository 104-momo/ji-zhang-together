import { useEffect, useMemo, useState } from 'react'
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
function formatHM(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function StatsPage({ entries, members, onBack }: Props) {
  const [filterMember, setFilterMember] = useState<string>('all')
  const todayKey = getDayKey(Date.now())
  // 整页时间范围：默认只看“今天”，主动切换到月/年/全部后才扩大统计口径。
  // 取值：day:YYYY-MM-DD（默认今天）/ month:YYYY-MM / year:YYYY / all
  const [range, setRange] = useState<string>(`day:${todayKey}`)
  // 每日统计：页面只展示选中的某一天（默认今天），查其他天通过“日期”下拉切换
  const [selDay, setSelDay] = useState<string>(todayKey)

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
  // 每日支出：按本地日聚合，最近的一天在最上
  const dayStats = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>()
    for (const e of filtered) {
      const k = getDayKey(e.createdAt)
      const cur = map.get(k) ?? { amount: 0, count: 0 }
      cur.amount += e.amount
      cur.count += 1
      map.set(k, cur)
    }
    return Array.from(map.entries())
      .map(([day, v]) => ({ day, amount: v.amount, count: v.count }))
      .sort((a, b) => b.day.localeCompare(a.day))
  }, [filtered])
  const dayAvg = dayStats.length > 0 ? total / dayStats.length : 0
  // 筛选/数据变化后，若当前选中日已不在列表，则默认选今天，否则选最近一天
  useEffect(() => {
    // 当日模式：明细锁定为范围指定的那一天（默认即今天）
    if (range.startsWith('day:')) {
      setSelDay(range.slice(4))
      return
    }
    setSelDay((cur) => {
      if (dayStats.some((d) => d.day === cur)) return cur
      if (dayStats.some((d) => d.day === todayKey)) return todayKey
      return dayStats[0]?.day ?? ''
    })
  }, [dayStats, todayKey, range])
  const curDay = dayStats.find((d) => d.day === selDay)
  const entriesOfDay = (day: string): Entry[] =>
    filtered.filter((e) => getDayKey(e.createdAt) === day).sort((a, b) => a.createdAt - b.createdAt)
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
          {dayStats.length > 1 && (
            <span className="stats-section-hint">日均 ¥{dayAvg.toFixed(2)} · {dayStats.length} 天有记录</span>
          )}
        </div>
        {dayStats.length === 0 ? (
          <div className="stats-empty">该条件下暂无数据</div>
        ) : (
          <>
            {dayStats.length > 1 && (
              <div className="stats-filter stats-day-picker">
                <div className="stats-filter-item">
                  <span className="stats-filter-label">日期</span>
                  <select className="stats-select" value={selDay} onChange={(e) => setRange(`day:${e.target.value}`)}>
                    {dayStats.map((d) => (
                      <option key={d.day} value={d.day}>
                        {formatDayLabel(d.day)}{d.day === todayKey ? '（今天）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {curDay && (
              <div className="stats-day-card is-open">
                <div className="stats-day-card-head stats-day-card-static">
                  <span className="stats-day-card-date">
                    {formatDayLabel(curDay.day)}
                    {curDay.day === todayKey && <em className="stats-day-today">今天</em>}
                  </span>
                  <span className="stats-day-card-sum">
                    ¥{curDay.amount.toFixed(2)}
                    <small>{curDay.count}笔</small>
                  </span>
                </div>
                <div className="stats-day-detail">
                  {entriesOfDay(curDay.day).map((e) => (
                    <div key={e.id} className="stats-day-item">
                      <span className="stats-day-item-time">{formatHM(e.createdAt)}</span>
                      <span
                        className="stats-day-item-dot"
                        style={{ background: CATEGORY_COLOR_VAR[e.category as keyof typeof CATEGORY_COLOR_VAR] ?? 'var(--c-other)' }}
                      />
                      <span className="stats-day-item-text">{e.rawText}</span>
                      <span className="stats-day-item-by">{e.nickname}</span>
                      <span className="stats-day-item-amt">¥{e.amount.toFixed(2)}</span>
                    </div>
                  ))}
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
