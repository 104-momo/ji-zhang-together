import { useMemo, useState } from 'react'
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components'
import type { Entry } from '../types'
import { IconArrowLeft, IconChevronDown } from './Icons'
import BudgetCard from './BudgetCard'
import CatBudgetCard from './CatBudgetCard'
import {
  activeEntries, catStats, currentMonth, filterByRange, getMonth,
  monthLabel, shortMonthLabel, sumAmount,
} from '../utils/stats'

interface Props {
  entries: Entry[]
  categories?: string[]
  monthlyBudget?: number | null
  categoryBudgets?: Record<string, number> | null
  isOwner: boolean
  onSetBudget: (amount: number | null) => Promise<void> | void
  onOpenCatBudget: () => void
  onBack: () => void
}

export default function BudgetPage({
  entries, categories, monthlyBudget, categoryBudgets, isOwner, onSetBudget, onOpenCatBudget, onBack,
}: Props) {
  const curMonth = currentMonth()
  const [month, setMonth] = useState(curMonth)

  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    activeEntries(entries).forEach((e) => set.add(getMonth(e.createdAt)))
    set.add(curMonth)
    return Array.from(set).sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }))
  }, [entries, curMonth])

  const monthEntries = useMemo(
    () => filterByRange(activeEntries(entries), { kind: 'month', key: month }),
    [entries, month],
  )
  const total = sumAmount(monthEntries)
  const cats = useMemo(() => catStats(monthEntries, categories), [monthEntries, categories])
  const label = month === curMonth ? '本月' : shortMonthLabel(month)

  return (
    <View className="page stats-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">预算</Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView className="stats-scroll" scrollY enableFlex>
        <View className="stats-filter">
          <Picker mode="selector" range={monthOptions} rangeKey="label" onChange={(e) => setMonth(monthOptions[Number(e.detail.value)].value)}>
            <Button className="stats-select">{monthLabel(month)} <IconChevronDown size={12} /></Button>
          </Picker>
        </View>

        <View className="stats-section stats-budget-wrap">
          <BudgetCard
            spent={total}
            budget={monthlyBudget}
            monthLabel={label}
            isOwner={isOwner}
            onSetBudget={onSetBudget}
          />
          <CatBudgetCard
            cats={cats}
            categoryBudgets={categoryBudgets}
            isOwner={isOwner}
            onManage={onOpenCatBudget}
          />
        </View>

        <Text className="budget-page-note">预算为每月固定额度，按账本全部成员的支出统计；切换月份可回看历史执行情况。</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}
