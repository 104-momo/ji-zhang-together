/**
 * 账单报告 AI 小结
 * 复用 AI 助手同款通道：小程序端 wx.cloud.extend.AI（混元 hy3），
 * 需基础库 >= 3.15.1 且在云开发控制台开通 AI；与 AiChat.tsx 保持一致。
 */

export interface ReportStatsInput {
  kind: 'month' | 'year'
  periodLabel: string
  total: number
  count: number
  avg: number
  categoryCount: number
  days: number
  cats: { category: string; amount: number; count: number; percent: number }[]
  members: { nickname: string; amount: number; count: number; percent: number }[]
  maxEntry: { dateLabel: string; text: string; amount: number; nickname?: string } | null
  compare: { prevLabel: string; prevTotal: number; diff: number; pct: number | null } | null
  budget: { amount: number; spent: number } | null
}

function buildFacts(i: ReportStatsInput): string {
  const lines: string[] = []
  lines.push(`周期：${i.periodLabel}`)
  lines.push(`总支出：¥${i.total.toFixed(2)}；共 ${i.count} 笔；日均 ¥${i.avg.toFixed(2)}（按 ${i.days} 天计）；涉及 ${i.categoryCount} 个分类`)
  if (i.cats.length) {
    lines.push(`分类支出：${i.cats.map((c) => `${c.category} ¥${c.amount.toFixed(0)}（占${c.percent.toFixed(0)}%，${c.count}笔）`).join('；')}`)
  }
  if (i.members.length > 1) {
    lines.push(`成员支出：${i.members.map((m) => `${m.nickname} ¥${m.amount.toFixed(0)}（占${m.percent.toFixed(0)}%，${m.count}笔）`).join('；')}`)
  }
  if (i.maxEntry) {
    lines.push(`最大一笔：${i.maxEntry.dateLabel}「${i.maxEntry.text}」¥${i.maxEntry.amount.toFixed(0)}${i.maxEntry.nickname ? `（${i.maxEntry.nickname}）` : ''}`)
  }
  if (i.compare) {
    const c = i.compare
    if (c.prevTotal === 0) lines.push(`环比：${c.prevLabel}没有记录`)
    else if (Math.abs(c.diff) < 0.01) lines.push(`环比：与${c.prevLabel}基本持平（${c.prevLabel}总支出 ¥${c.prevTotal.toFixed(0)}）`)
    else lines.push(`环比：比${c.prevLabel}${c.diff > 0 ? '多' : '少'}花 ¥${Math.abs(c.diff).toFixed(0)}${c.pct !== null ? `（${c.diff > 0 ? '+' : ''}${c.pct.toFixed(0)}%）` : ''}，${c.prevLabel}总支出 ¥${c.prevTotal.toFixed(0)}`)
  }
  if (i.budget) {
    const usedPct = (i.budget.spent / i.budget.amount) * 100
    if (i.kind === 'month') {
      lines.push(i.budget.spent > i.budget.amount
        ? `预算：每月预算 ¥${i.budget.amount.toFixed(0)}，已超支 ¥${(i.budget.spent - i.budget.amount).toFixed(0)}`
        : `预算：每月预算 ¥${i.budget.amount.toFixed(0)}，已用 ${usedPct.toFixed(0)}%，剩余 ¥${(i.budget.amount - i.budget.spent).toFixed(0)}`)
    }
  }
  return lines.join('\n')
}

export async function generateReportText(input: ReportStatsInput): Promise<string> {
  const w = (globalThis as any).wx
  if (!w?.cloud?.extend?.AI) {
    throw new Error('AI 不可用：需微信基础库 >= 3.15.1 且已开通云开发 AI')
  }
  const model = w.cloud.extend.AI.createModel('cloudbase')
  const facts = buildFacts(input)
  const periodWord = input.kind === 'month' ? '月度' : '年度'
  const res = await model.generateText({
    model: 'hy3',
    messages: [
      {
        role: 'system',
        content: `你是一个贴心的共享记账助手。用户会给你一份${periodWord}账单的统计事实，请据此写一段账单小结：4 到 6 句话，口语化、温暖、像朋友提醒；必须引用事实里的真实数字（总支出、花得最多的分类、最大一笔、环比、预算等）；可以给一条具体可执行的省钱建议；严禁编造事实中没有的消费或数字；不要使用 markdown、序号、项目符号；每句话单独占一行。`,
      },
      { role: 'user', content: `${facts}\n\n请生成${input.periodLabel}的${periodWord}账单小结。` },
    ],
  })
  const text: string = res?.data?.choices?.[0]?.message?.content
    || res?.choices?.[0]?.message?.content
    || res?.data?.content
    || res?.content
    || ''
  const trimmed = String(text).trim()
  if (!trimmed) throw new Error('AI 返回为空，请重试')
  return trimmed
}

/** AI 文本拆成段落：优先按换行，没有换行则按中文句号拆 */
export function splitSentences(text: string): string[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (lines.length > 1) return lines
  return text.split(/。/).map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith('。') ? s : `${s}。`))
}
