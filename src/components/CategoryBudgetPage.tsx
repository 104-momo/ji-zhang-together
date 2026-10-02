import { useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import { CATEGORIES } from '../types'
import { categoryColor } from '../utils/colors'
import { IconArrowLeft } from './Icons'

interface Props {
  categories?: string[]
  categoryBudgets?: Record<string, number> | null
  onBack: () => void
  onSave: (budgets: Record<string, number | null>) => Promise<void> | void
}

export default function CategoryBudgetPage({ categories, categoryBudgets, onBack, onSave }: Props) {
  const allCats = useMemo(
    () => (categories && categories.length > 0 ? categories : (CATEGORIES as readonly string[]).slice()),
    [categories],
  )
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    allCats.forEach((c) => { const v = categoryBudgets?.[c]; if (v) init[c] = String(v) })
    return init
  })
  const [busy, setBusy] = useState(false)

  const setVal = (cat: string, v: string) => setVals((prev) => ({ ...prev, [cat]: v }))

  const save = async () => {
    const budgets: Record<string, number | null> = {}
    for (const cat of allCats) {
      const raw = (vals[cat] || '').trim()
      if (!raw) { budgets[cat] = null; continue }
      const num = Number(raw)
      if (!Number.isFinite(num) || num <= 0) { Taro.showToast({ title: `${cat}预算金额不正确`, icon: 'none' }); return }
      if (num > 100000000) { Taro.showToast({ title: `${cat}预算金额过大`, icon: 'none' }); return }
      budgets[cat] = Math.round(num * 100) / 100
    }
    setBusy(true)
    try {
      await onSave(budgets)
      Taro.showToast({ title: '已保存', icon: 'success' })
      onBack()
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '保存失败', icon: 'none' })
    } finally { setBusy(false) }
  }

  return (
    <View className="page cb-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">分类预算</Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView className="stats-scroll" scrollY enableFlex>
        <Text className="cb-tip">为每个分类设置每月额度，留空表示不限制。仅账本创建者可修改。</Text>
        <View className="cb-edit-list">
          {allCats.map((cat) => (
            <View key={cat} className="cb-edit-row">
              <Text className="cb-edit-name">
                <Text className="stats-cat-dot" style={{ background: categoryColor(cat) }} />
                {cat}
              </Text>
              <View className="cb-edit-input-wrap">
                <Text className="cb-edit-unit">¥</Text>
                <Input
                  className="cb-edit-input"
                  type="digit"
                  value={vals[cat] || ''}
                  placeholder="未设置"
                  onInput={(e) => setVal(cat, e.detail.value)}
                />
                <Text className="cb-edit-unit">/月</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ height: 96 }} />
      </ScrollView>
      <View className="cb-save-bar">
        <Button className="btn-primary btn-block" loading={busy} onClick={save}>保存</Button>
      </View>
    </View>
  )
}
