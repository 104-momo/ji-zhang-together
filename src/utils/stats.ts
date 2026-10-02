import type { Entry } from '../types'

export function pad2(n: number): string { return String(n).padStart(2, '0') }

export function getMonth(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export function getDayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayKey(): string { return getDayKey(Date.now()) }
export function currentMonth(): string { return getMonth(Date.now()) }
export function currentYear(): string { return String(new Date().getFullYear()) }

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-')
  return `${y}年${Number(mo)}月`
}

export function shortMonthLabel(m: string): string { return `${Number(m.split('-')[1])}月` }

export function yearLabel(y: string): string { return `${y}年` }

export function dayLabelFromKey(key: string): string {
  const [Y, M, D] = key.split('-').map(Number)
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${M}月${D}日 ${WEEK[new Date(Y, M - 1, D).getDay()]}`
}

/** 排除软删除条目（软删条目 amount=0 且 note 含【已删除】） */
export function activeEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => !e.deleted && !(e.amount === 0 && (e.note || '').includes('【已删除】')))
}

export function sumAmount(entries: Entry[]): number {
  return entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

export type Range =
  | { kind: 'day'; key: string }
  | { kind: 'month'; key: string }
  | { kind: 'year'; key: string }
  | { kind: 'all' }

/** 按时间范围过滤（闭区间，按本地自然日） */
export function filterByRange(entries: Entry[], range: Range): Entry[] {
  if (range.kind === 'all') return entries
  return entries.filter((e) => {
    const d = new Date(e.createdAt)
    if (range.kind === 'day') return getDayKey(e.createdAt) === range.key
    if (range.kind === 'month') return getMonth(e.createdAt) === range.key
    return String(d.getFullYear()) === range.key
  })
}

/** 范围内天数（月=当月已过天数含今天；年=全年天数；全部=首尾跨度），用于日均 */
export function rangeDays(range: Range, now = new Date()): number {
  if (range.kind === 'day') return 1
  if (range.kind === 'year') {
    const y = Number(range.key)
    const isThisYear = y === now.getFullYear()
    if (isThisYear) {
      const start = new Date(y, 0, 1)
      return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1)
    }
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365
  }
  if (range.kind === 'month') {
    const [y, m] = range.key.split('-').map(Number)
    if (y === now.getFullYear() && m - 1 === now.getMonth()) return now.getDate()
    return new Date(y, m, 0).getDate()
  }
  return 1
}

export interface CatStat { category: string; amount: number; count: number; percent: number }

export function catStats(entries: Entry[], allCategories: string[] = []): CatStat[] {
  const total = sumAmount(entries)
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of entries) {
    const cur = map.get(e.category) ?? { amount: 0, count: 0 }
    cur.amount += Number(e.amount) || 0
    cur.count += 1
    map.set(e.category, cur)
  }
  const list: CatStat[] = []
  for (const [category, v] of map) {
    if (v.amount > 0) list.push({ category, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 })
  }
  list.sort((a, b) => b.amount - a.amount)
  return list
}

export interface MemberStat { nickname: string; amount: number; count: number; percent: number }

export function memberStats(entries: Entry[]): MemberStat[] {
  const total = sumAmount(entries)
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of entries) {
    const key = e.nickname || '成员'
    const cur = map.get(key) ?? { amount: 0, count: 0 }
    cur.amount += Number(e.amount) || 0
    cur.count += 1
    map.set(key, cur)
  }
  const list: MemberStat[] = []
  for (const [nickname, v] of map) list.push({ nickname, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 })
  list.sort((a, b) => b.amount - a.amount)
  return list
}

/** 上一个周期 key：月→上月，年→去年；日→前一天 */
export function prevRangeKey(range: Range): string | null {
  if (range.kind === 'month') {
    const [y, m] = range.key.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
  }
  if (range.kind === 'year') return String(Number(range.key) - 1)
  if (range.kind === 'day') {
    const [Y, M, D] = range.key.split('-').map(Number)
    return getDayKey(new Date(Y, M - 1, D - 1).getTime())
  }
  return null
}

export function fmtMoney(n: number): string { return `¥${n.toFixed(2)}` }
