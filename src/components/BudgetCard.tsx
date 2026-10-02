import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { IconBudget, IconX } from './Icons'

interface Props {
  spent: number
  budget: number | null | undefined
  monthLabel: string
  isOwner: boolean
  onSetBudget: (amount: number | null) => Promise<void> | void
}

export default function BudgetCard({ spent, budget, monthLabel, isOwner, onSetBudget }: Props) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)

  const openEdit = () => { setVal(budget ? String(budget) : ''); setEditing(true) }

  const save = async () => {
    const num = Number(val)
    if (!val.trim()) { TaroHint('请输入预算金额'); return }
    if (!Number.isFinite(num) || num <= 0) { TaroHint('预算金额不正确'); return }
    if (num > 100000000) { TaroHint('预算金额过大'); return }
    setBusy(true)
    try { await onSetBudget(Math.round(num * 100) / 100); setEditing(false) }
    catch (e) { TaroHint(e instanceof Error ? e.message : '保存失败') }
    finally { setBusy(false) }
  }

  const clear = async () => {
    setBusy(true)
    try { await onSetBudget(null); setEditing(false) }
    finally { setBusy(false) }
  }

  if (editing) {
    return (
      <View className="budget-card">
        <View className="budget-edit-head">
          <Text className="budget-edit-title"><IconBudget size={15} /> 设置每月预算</Text>
          <Button className="modal-close budget-edit-close" onClick={() => setEditing(false)}><IconX size={13} /></Button>
        </View>
        <View className="budget-edit-row">
          <Text className="budget-unit">¥</Text>
          <Input
            className="budget-input"
            type="digit"
            value={val}
            placeholder="例如 3000"
            onInput={(e) => setVal(e.detail.value)}
          />
          <Text className="budget-unit">/月</Text>
        </View>
        <View className="budget-edit-actions">
          {budget ? <Button className="btn-sm btn-warn" disabled={busy} onClick={clear}>清除预算</Button> : null}
          <Button className="btn-sm btn-primary" disabled={busy} onClick={save}>保存</Button>
        </View>
      </View>
    )
  }

  if (!budget) {
    if (!isOwner) return null
    return (
      <Button className="budget-empty" onClick={openEdit}>
        <IconBudget size={15} />
        <Text>设置每月预算，控制{monthLabel}开销</Text>
      </Button>
    )
  }

  const percent = budget > 0 ? (spent / budget) * 100 : 0
  const over = spent > budget
  const near = !over && percent >= 80
  const remain = budget - spent
  const barWidth = `${Math.min(percent, 100)}%`

  return (
    <View className={`budget-card ${over ? 'is-over' : near ? 'is-near' : ''}`}>
      <View className="budget-head">
        <Text className="budget-title"><IconBudget size={14} /> {monthLabel}预算</Text>
        {isOwner ? <Button className="budget-edit-btn" onClick={openEdit}>修改</Button> : null}
      </View>
      <View className="budget-numbers">
        <Text className="budget-spent">¥{spent.toFixed(2)}</Text>
        <Text className="budget-total">/ ¥{budget.toFixed(0)}</Text>
      </View>
      <View className="budget-bar-wrap">
        <View className="budget-bar" style={{ width: barWidth }} />
      </View>
      <View className="budget-foot">
        <Text className="budget-percent">已用 {percent.toFixed(0)}%</Text>
        <Text className="budget-remain">
          {over ? `已超支 ¥${Math.abs(remain).toFixed(2)}` : `剩余 ¥${remain.toFixed(2)}`}
        </Text>
      </View>
    </View>
  )
}

function TaroHint(msg: string) {
  Taro.showToast({ title: msg, icon: 'none' })
}
