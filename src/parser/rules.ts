import type { Category, ParsedEntry } from '../types'

/**
 * 第一级：本地规则解析（零延迟，覆盖常见简单句式）
 * - 金额提取：支持 "200元 / 200块 / 200块钱 / ¥200 / ￥200 / 200 / 花了25元" 等中文金额表达
 * - 分类：按关键词匹配（强词优先）
 * - 描述：金额之前的文本；备注：金额之后的文本（如 "吃烤鱼200 和小王生日" → 描述"吃烤鱼" 备注"和小王生日"）
 */

// 分类关键词表：数组顺序即匹配优先级，强词在前、通用词在后
const KEYWORDS: Array<[Category, string[]]> = [
  ['医疗', ['药', '医院', '看病', '体检', '挂号', '诊所', '牙科', '打针', '输液']],
  ['居住', ['房租', '电费', '水费', '燃气', '物业', '宽带', '话费', '房贷']],
  [
    '餐饮',
    [
      '烤鱼', '火锅', '烧烤', '奶茶', '咖啡', '星巴克', '瑞幸', '外卖', '午餐', '晚饭',
      '早饭', '早餐', '晚餐', '夜宵', '麻辣烫', '吃', '饭', '餐', '面', '水果', '零食',
      '甜品', '蛋糕', '请客', '聚餐',
    ],
  ],
  [
    '交通',
    ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路费', '单车', '出租', '网约车', '高速', '加油费'],
  ],
  [
    '购物',
    ['超市', '淘宝', '京东', '拼多多', '日用品', '衣服', '鞋', '化妆品', '手机', '耳机', '文具', '家电', '商场', '便利店', '买'],
  ],
  ['娱乐', ['电影', '游戏', '会员', 'KTV', '演唱会', '门票', '健身', '游泳', '酒吧', '剧本杀', '密室', '充值']],
  ['人情', ['红包', '份子', '送礼', '礼物', '随礼', '生日', '结婚', '借款', '还钱']],
]

const AMOUNT_RE = /(\d+(?:\.\d{1,2})?)\s*(元|块|块钱|rmb|RMB|¥|￥)?/g

interface AmountMatch {
  value: number
  index: number
  length: number
  hasUnit: boolean
}

/** 提取文本中的金额：优先带单位（元/块/¥）的，否则取数值最大的 */
function extractAmount(text: string): AmountMatch | null {
  const matches: AmountMatch[] = []
  let m: RegExpExecArray | null
  AMOUNT_RE.lastIndex = 0
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const value = parseFloat(m[1])
    if (Number.isFinite(value)) {
      matches.push({ value, index: m.index, length: m[0].length, hasUnit: !!m[2] })
    }
  }
  if (matches.length === 0) return null

  const unitMatches = matches.filter((it) => it.hasUnit)
  if (unitMatches.length > 0) {
    // 多个带单位时取最后一个（金额通常在句末）
    return unitMatches[unitMatches.length - 1]
  }
  // 无单位：取数值最大者；并列时取靠后者
  let best = matches[0]
  for (const it of matches) {
    if (it.value >= best.value) best = it
  }
  return best
}

/** 分类关键词匹配 */
function matchCategory(text: string): Category {
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) {
      if (text.includes(w)) return cat
    }
  }
  return '其他'
}

/**
 * 规则解析入口。解析不了（无金额）返回 null，由上层走 LLM 兜底。
 */
export function parseByRules(text: string): ParsedEntry | null {
  const t = text.trim()
  if (!t) return null

  const am = extractAmount(t)
  if (!am) return null

  const before = t.slice(0, am.index).trim()
  const after = t.slice(am.index + am.length).trim()

  // 描述 = 金额前文本（无则用金额后文本）；备注 = 金额后文本（描述在金额前时）
  let description = before
  let note: string | undefined
  if (before) {
    if (after) note = after
  } else {
    description = after
  }

  // 金额出现在句子最前面时（如 "200块钱买早餐"），用整句做分类匹配
  const category = matchCategory(t)

  return {
    amount: am.value,
    category,
    description: description || '支出',
    note: note || undefined,
    matchedBy: 'rule',
  }
}

/**
 * 本地兜底：规则层没匹配到金额、且 LLM 不可用时，尽量从文本抠一个数字
 * （本地 mock 阶段使用；云函数阶段该层替换为 GLM 调用）
 */
export function parseByLocalFallback(text: string): ParsedEntry | null {
  const t = text.trim()
  if (!t) return null
  const m = t.match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  const amount = parseFloat(m[1])
  const idx = m.index ?? 0
  const description = (t.slice(0, idx) + t.slice(idx + m[0].length)).trim() || '支出'
  return {
    amount,
    category: matchCategory(t),
    description,
    matchedBy: 'local',
  }
}
