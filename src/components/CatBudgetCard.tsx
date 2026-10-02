import { Button, Text, View } from '@tarojs/components'
import { IconBudget } from './Icons'
import { categoryColor } from '../utils/colors'

interface CatStat { category: string; amount: number }

interface Props {
  cats: CatStat[]
  categoryBudgets?: Record<string, number> | null
  isOwner: boolean
  onManage: () => void
}

export default function CatBudgetCard({ cats, categoryBudgets, isOwner, onManage }: Props) {
  const budgets = categoryBudgets || {}
  const spentMap = new Map(cats.map((c) => [c.category, c.amount]))
  const names = Object.keys(budgets)

  if (names.length === 0) {
    if (!isOwner) return null
    return (
      <Button className="cat-budget-empty" onClick={onManage}>
        <IconBudget size={14} />
        <Text>设置分类预算，如餐饮每月 ¥1000</Text>
      </Button>
    )
  }

  const rows = names
    .map((name) => {
      const budget = budgets[name] || 0
      const spent = spentMap.get(name) || 0
      return { name, budget, spent, percent: budget > 0 ? (spent / budget) * 100 : 0 }
    })
    .sort((a, b) => b.percent - a.percent)

  return (
    <View className="cat-budget-card">
      <View className="cat-budget-head">
        <Text className="cat-budget-title"><IconBudget size={14} /> 分类预算</Text>
        {isOwner ? <Button className="cat-budget-manage" onClick={onManage}>管理</Button> : null}
      </View>
      <View className="cat-budget-list">
        {rows.map((r) => {
          const over = r.spent > r.budget
          const near = !over && r.percent >= 80
          return (
            <View key={r.name} className={`cat-budget-row ${over ? 'is-over' : near ? 'is-near' : ''}`}>
              <View className="cb-row-head">
                <Text className="cb-name">
                  <Text className="stats-cat-dot" style={{ background: categoryColor(r.name) }} />
                  {r.name}
                </Text>
                <Text className="cb-nums">
                  ¥{r.spent.toFixed(0)}<Text className="cb-total"> / ¥{r.budget.toFixed(0)}</Text>
                </Text>
              </View>
              <View className="cb-bar-wrap">
                <View className="cb-bar" style={{ width: `${Math.min(r.percent, 100)}%`, background: categoryColor(r.name) }} />
              </View>
              <View className="cb-row-foot">
                <Text className="cb-percent">{r.percent.toFixed(0)}%</Text>
                <Text className="cb-remain">
                  {over ? `已超支 ¥${Math.abs(r.budget - r.spent).toFixed(0)}` : `剩余 ¥${(r.budget - r.spent).toFixed(0)}`}
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}
