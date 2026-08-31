import { useMemo, useState } from 'react'
import type { Category, Entry } from '../types'
import { CATEGORIES } from '../types'
import { CATEGORY_COLOR_VAR } from '../utils/colors'
import { IconChart, IconChevronDown } from './Icons'
interface Props {
  entries: Entry[]
}
interface CatStat {
  category: Category
  amount: number
  count: number
  percent: number
}
export default function CategoryStats({ entries }: Props) {
  const [open, setOpen] = useState(false)
  const stats = useMemo<CatStat[]>(() => {
    const active = entries.filter((e) => !(e.amount === 0 && (e.note || '').includes('【已删除】')))
    const total = active.reduce((s, e) => s + e.amount, 0)
    const map = new Map<Category, { amount: number; count: number }>()
    for (const e of active) {
      const cur = map.get(e.category) ?? { amount: 0, count: 0 }
      cur.amount += e.amount
      cur.count += 1
      map.set(e.category, cur)
    }
    const list: CatStat[] = []
    for (const c of CATEGORIES) {
      const v = map.get(c)
      if (v && v.amount > 0) {
        list.push({ category: c, amount: v.amount, count: v.count, percent: total > 0 ? (v.amount / total) * 100 : 0 })
      }
    }
    list.sort((a, b) => b.amount - a.amount)
    return list
  }, [entries])
  const total = stats.reduce((s, c) => s + c.amount, 0)
  if (stats.length === 0) return null
  return (
    <div className="cat-stats">
      <button className="cat-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="cat-toggle-icon">
          <IconChart size={16} />
        </span>
        <span className="cat-toggle-text">分类统计</span>
        <span className="cat-toggle-total">¥{total.toFixed(0)}</span>
        <span className={`cat-toggle-arrow ${open ? 'open' : ''}`}>
          <IconChevronDown size={14} />
        </span>
      </button>
      {open ? (
        <div className="cat-panel">
          {stats.map((s) => (
            <div key={s.category} className="cat-row">
              <div className="cat-label">
                <span className="cat-dot" style={{ background: CATEGORY_COLOR_VAR[s.category] }} />
                <span className="cat-name">{s.category}</span>
                <span className="cat-count">{s.count}笔</span>
              </div>
              <div className="cat-bar-wrap">
                <div className="cat-bar" style={{ width: `${Math.max(s.percent, 4)}%`, background: CATEGORY_COLOR_VAR[s.category] }} />
              </div>
              <div className="cat-amount">
                <span className="cat-money">¥{s.amount.toFixed(2)}</span>
                <span className="cat-percent">{s.percent.toFixed(0)}%</span>
              </div>
            </div>
          ))}
          <div className="cat-total">
            合计 <strong>¥{total.toFixed(2)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}
