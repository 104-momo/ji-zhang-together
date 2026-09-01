import { parseEntryText } from '../src/parser'

const cases: Array<[string, number, string]> = [
  // [输入, 期望金额, 期望分类]
  ['吃烤鱼200', 200, '餐饮'],
  ['吃烤鱼200元', 200, '餐饮'],
  ['打车35.5', 35.5, '交通'],
  ['地铁6块', 6, '交通'],
  ['星巴克拿铁38元', 38, '餐饮'],
  ['午餐12', 12, '餐饮'],
  ['买了件衣服299', 299, '购物'],
  ['超市买菜80', 80, '购物'],
  ['电影票两张45', 45, '娱乐'],
  ['房租3000', 3000, '居住'],
  ['交电费150元', 150, '居住'],
  ['药店买药56', 56, '医疗'],
  ['给妈妈红包200', 200, '人情'],
  ['奶茶18块', 18, '餐饮'],
  ['吃烤鱼200 和小王生日', 200, '餐饮'], // 备注场景
]

let fail = 0
for (const [text, amount, category] of cases) {
  const r = parseEntryText(text)
  if (!r) {
    console.log(`✗ "${text}" → 未解析出结果`)
    fail++
    continue
  }
  const amtOk = Math.abs(r.amount - amount) < 0.001
  const catOk = r.category === category
  if (amtOk && catOk) {
    console.log(`✓ "${text}" → ¥${r.amount} [${r.category}]${r.note ? ' 备注:' + r.note : ''}`)
  } else {
    console.log(`✗ "${text}" → 期望 ¥${amount}[${category}] 实际 ¥${r.amount}[${r.category}]${r.note ? ' 备注:' + r.note : ''}`)
    fail++
  }
}

// 无金额应返回 null
const bad = parseEntryText('今天心情不错')
if (bad) {
  console.log(`✗ "今天心情不错" → 不应解析出结果，实际 ${JSON.stringify(bad)}`)
  fail++
} else {
  console.log('✓ "今天心情不错" → 正确返回 null（交给 LLM 兜底）')
}

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
