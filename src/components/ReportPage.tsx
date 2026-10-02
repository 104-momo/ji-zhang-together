import { useEffect, useMemo, useState } from 'react'
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components'
import type { Entry, Member } from '../types'
import { categoryColor } from '../utils/colors'
import { IconAI, IconChevronDown, IconArrowLeft } from './Icons'
import { generateReportText, splitSentences, type ReportStatsInput } from '../services/aiReport'
import {
  activeEntries, catStats, filterByRange, getMonth, memberStats, monthLabel, pad2,
  prevRangeKey, rangeDays, shortMonthLabel, sumAmount, yearLabel, type Range,
} from '../utils/stats'

interface Props {
  entries: Entry[]
  members: Member[]
  categories?: string[]
  monthlyBudget?: number | null
  onBack: () => void
}

export default function ReportPage({ entries, members, categories, monthlyBudget, onBack }: Props) {
  const now = new Date()
  const curMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const curYear = String(now.getFullYear())
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(curMonth)
  const [year, setYear] = useState(curYear)
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [aiParagraphs, setAiParagraphs] = useState<string[]>([])
  const [aiError, setAiError] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)

  // 切换报告周期后重置 AI 小结，避免展示上一个周期的内容
  useEffect(() => {
    setAiStatus('idle'); setAiParagraphs([]); setAiError(''); setUsingFallback(false)
  }, [mode, month, year])

  const monthOptions = useMemo(() => {
    const set = new Set<string>([curMonth])
    activeEntries(entries).forEach((e) => set.add(getMonth(e.createdAt)))
    return Array.from(set).sort().reverse()
  }, [entries, curMonth])

  const yearOptions = useMemo(() => {
    const set = new Set<string>([curYear])
    activeEntries(entries).forEach((e) => set.add(String(new Date(e.createdAt).getFullYear())))
    return Array.from(set).sort().reverse()
  }, [entries, curYear])

  const range: Range = mode === 'month' ? { kind: 'month', key: month } : { kind: 'year', key: year }
  const periodLabel = mode === 'month' ? monthLabel(month) : yearLabel(year)
  const shortLabel = mode === 'month' ? shortMonthLabel(month) : `${year}年`

  const list = useMemo(() => filterByRange(activeEntries(entries), range), [entries, month, year, mode])
  const total = sumAmount(list)
  const count = list.length
  const days = rangeDays(range)
  const avg = total / days
  const cats = catStats(list, categories)
  const mStats = memberStats(list)
  const maxEntry = useMemo(() => list.reduce<Entry | null>((mx, e) => (!mx || e.amount > mx.amount ? e : mx), null), [list])

  const compare = useMemo(() => {
    const pk = prevRangeKey(range)
    if (!pk) return null
    const prevList = filterByRange(activeEntries(entries), { kind: range.kind, key: pk } as Range)
    const prevTotal = sumAmount(prevList)
    const diff = total - prevTotal
    const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : null
    return { prevTotal, diff, pct, prevLabel: mode === 'month' ? '上月' : '去年' }
  }, [range, entries, total, mode])

  const memberColor = (name: string) => {
    const palette = ['#1f8a70', '#4a90c2', '#d2688c', '#9b7bd4', '#c08431', '#5fa87a', '#d4645c']
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return palette[h % palette.length]
  }

  /** 规则模板小结（AI 不可用时的兜底，不依赖网络） */
  const fallbackSentences = useMemo(() => {
    if (count === 0) return [`${shortLabel}还没有账目，记一笔就能生成完整报告啦。`]
    const out: string[] = []
    out.push(`${shortLabel}一共记了 ${count} 笔账，总支出 ¥${total.toFixed(2)}，平均每天 ¥${avg.toFixed(2)}。`)
    if (cats[0]) {
      out.push(`花得最多的是「${cats[0].category}」，共 ¥${cats[0].amount.toFixed(0)}，占了总支出的 ${cats[0].percent.toFixed(0)}%。`)
    }
    if (maxEntry) {
      const d = new Date(maxEntry.createdAt)
      const who = members.length > 1 ? `（${maxEntry.nickname}）` : ''
      out.push(`最大的一笔是 ${d.getMonth() + 1}月${d.getDate()}日的「${maxEntry.note || maxEntry.rawText}」¥${maxEntry.amount.toFixed(0)}${who}。`)
    }
    if (compare && (compare.prevTotal > 0 || total > 0)) {
      if (compare.prevTotal === 0) out.push(`上${mode === 'month' ? '月' : '年'}没有记录，这个${mode === 'month' ? '月' : '年'}是一个新的开始。`)
      else if (Math.abs(compare.diff) < 0.01) out.push(`和${compare.prevLabel}花费基本持平。`)
      else if (compare.diff > 0) out.push(`比${compare.prevLabel}多花了 ¥${compare.diff.toFixed(0)}${compare.pct !== null ? `（+${compare.pct.toFixed(0)}%）` : ''}，可以看看是不是哪类开销涨了。`)
      else out.push(`比${compare.prevLabel}少花了 ¥${Math.abs(compare.diff).toFixed(0)}${compare.pct !== null ? `（${compare.pct.toFixed(0)}%）` : ''}，继续保持～`)
    }
    if (mode === 'month' && monthlyBudget && monthlyBudget > 0) {
      const usedPct = (total / monthlyBudget) * 100
      if (total > monthlyBudget) out.push(`本月预算 ¥${monthlyBudget.toFixed(0)}，已超支 ¥${(total - monthlyBudget).toFixed(0)}，下个月注意控制哦。`)
      else out.push(`本月预算 ¥${monthlyBudget.toFixed(0)}，目前用了 ${usedPct.toFixed(0)}%，还剩 ¥${(monthlyBudget - total).toFixed(0)}，节奏不错。`)
    }
    return out
  }, [count, total, avg, cats, maxEntry, compare, shortLabel, mode, monthlyBudget, members.length])

  const buildAiInput = (): ReportStatsInput => ({
    kind: mode,
    periodLabel,
    total, count, avg, categoryCount: cats.length, days,
    cats: cats.map((c) => ({ category: c.category, amount: c.amount, count: c.count, percent: c.percent })),
    members: mStats.map((m) => ({ nickname: m.nickname, amount: m.amount, count: m.count, percent: m.percent })),
    maxEntry: maxEntry ? {
      dateLabel: `${new Date(maxEntry.createdAt).getMonth() + 1}月${new Date(maxEntry.createdAt).getDate()}日`,
      text: maxEntry.note || maxEntry.rawText,
      amount: maxEntry.amount,
      nickname: members.length > 1 ? maxEntry.nickname : undefined,
    } : null,
    compare: compare ? { prevLabel: compare.prevLabel, prevTotal: compare.prevTotal, diff: compare.diff, pct: compare.pct } : null,
    budget: mode === 'month' && monthlyBudget ? { amount: monthlyBudget, spent: total } : null,
  })

  const handleGenerate = async () => {
    if (count === 0 || aiStatus === 'loading') return
    setAiStatus('loading'); setAiError(''); setUsingFallback(false)
    try {
      const text = await generateReportText(buildAiInput())
      setAiParagraphs(splitSentences(text))
      setAiStatus('done')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '生成失败，请重试')
      setAiStatus('error')
    }
  }

  const showFallback = () => { setAiParagraphs(fallbackSentences); setUsingFallback(true); setAiStatus('done') }

  return (
    <View className="page stats-page">
      <View className="stats-header">
        <Button className="stats-back" onClick={onBack}><IconArrowLeft size={18} /> 返回</Button>
        <Text className="stats-title">账单报告</Text>
        <View style={{ width: 56 }} />
      </View>

      <View className="report-mode-row">
        <Button className={`report-mode-btn ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>月度报告</Button>
        <Button className={`report-mode-btn ${mode === 'year' ? 'active' : ''}`} onClick={() => setMode('year')}>年度报告</Button>
      </View>
      <View className="stats-filter report-picker-row">
        {mode === 'month' ? (
          <Picker mode="selector" range={monthOptions} onChange={(e) => setMonth(monthOptions[Number(e.detail.value)])}>
            <Button className="stats-select">{monthLabel(month)} <IconChevronDown size={12} /></Button>
          </Picker>
        ) : (
          <Picker mode="selector" range={yearOptions} onChange={(e) => setYear(yearOptions[Number(e.detail.value)])}>
            <Button className="stats-select">{yearLabel(year)} <IconChevronDown size={12} /></Button>
          </Picker>
        )}
      </View>

      <ScrollView className="stats-scroll" scrollY enableFlex>
        <View className="stats-section">
          <View className="report-hero">
            <Text className="report-hero-period">{periodLabel}账单</Text>
            <Text className="report-hero-total">¥{total.toFixed(2)}</Text>
            <View className="report-hero-meta">
              <View className="report-hero-item"><Text className="report-hero-num">{count}</Text><Text className="report-hero-label">笔数</Text></View>
              <View className="report-hero-divider" />
              <View className="report-hero-item"><Text className="report-hero-num">¥{avg.toFixed(0)}</Text><Text className="report-hero-label">日均</Text></View>
              <View className="report-hero-divider" />
              <View className="report-hero-item"><Text className="report-hero-num">{cats.length}</Text><Text className="report-hero-label">个分类</Text></View>
            </View>
          </View>
        </View>

        <View className="stats-section">
          <View className="report-summary-card">
            <Text className="stats-section-title">本期小结{usingFallback ? '（模板）' : aiStatus === 'done' ? '（AI）' : ''}</Text>
            {count === 0 ? (
              <Text className="report-sentence">{shortLabel}还没有账目，记一笔就能生成完整报告啦。</Text>
            ) : aiStatus === 'idle' ? (
              <View className="report-gen">
                <Text className="report-gen-hint">由 AI 根据本期账单的真实数据生成小结，约几秒钟</Text>
                <Button className="btn-primary btn-block report-gen-btn" onClick={handleGenerate}>
                  <IconAI size={16} /> 生成{mode === 'month' ? '月度' : '年度'}报告
                </Button>
              </View>
            ) : aiStatus === 'loading' ? (
              <View className="report-gen">
                <Text className="report-ai-loading">AI 正在分析{shortLabel}的账单…</Text>
              </View>
            ) : aiStatus === 'error' ? (
              <View className="report-gen">
                <Text className="report-ai-error">生成失败：{aiError}</Text>
                <View className="report-gen-actions">
                  <Button className="btn-sm btn-secondary" onClick={showFallback}>用模板小结</Button>
                  <Button className="btn-sm btn-primary" onClick={handleGenerate}>重试</Button>
                </View>
              </View>
            ) : (
              <View>
                {aiParagraphs.map((s, i) => <Text key={i} className="report-sentence">{s}</Text>)}
                <View className="report-regen-row">
                  <Button className="report-regen-btn" onClick={handleGenerate}>
                    <IconAI size={12} /> 重新生成
                  </Button>
                  {!usingFallback ? <Button className="report-regen-btn" onClick={showFallback}>用模板小结</Button> : null}
                </View>
              </View>
            )}
          </View>
        </View>

        {count > 0 ? (
          <>
            <View className="stats-section">
              <Text className="stats-section-title">分类 TOP {Math.min(3, cats.length)}</Text>
              <View className="stats-cat-list">
                {cats.slice(0, 3).map((c, i) => (
                  <View key={c.category} className="stats-cat-row">
                    <View className="stats-cat-label">
                      <Text className="report-rank">{i + 1}</Text>
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

            {compare && compare.prevTotal > 0 ? (
              <View className="stats-section">
                <View className={`compare-card ${compare.diff > 0 ? 'up' : compare.diff < 0 ? 'down' : ''}`}>
                  <Text className="compare-label">环比{compare.prevLabel}</Text>
                  <Text className="compare-main">
                    {compare.diff > 0 ? '多花 ' : compare.diff < 0 ? '少花 ' : '持平'}
                    {compare.diff !== 0 ? <Text className="compare-amt">¥{Math.abs(compare.diff).toFixed(0)}</Text> : null}
                    {compare.pct !== null ? <Text className="compare-pct">（{compare.diff > 0 ? '+' : ''}{compare.pct.toFixed(0)}%）</Text> : null}
                  </Text>
                  <Text className="compare-sub">{compare.prevLabel}总支出 ¥{compare.prevTotal.toFixed(0)}</Text>
                </View>
              </View>
            ) : null}

            {members.length > 1 && mStats.length > 0 ? (
              <View className="stats-section">
                <Text className="stats-section-title">成员支出</Text>
                <View className="stats-member-list">
                  {mStats.map((m) => (
                    <View key={m.nickname} className="stats-member-row">
                      <Text className="stats-member-name">
                        <Text className="stats-member-avatar" style={{ background: memberColor(m.nickname) }}>{m.nickname.slice(0, 1)}</Text>
                        {m.nickname} · {m.count}笔 · {m.percent.toFixed(0)}%
                      </Text>
                      <Text className="stats-member-amount">¥{m.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}
