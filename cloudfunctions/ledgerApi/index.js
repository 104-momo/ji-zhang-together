/**
 * 一起记账 · 云函数 ledgerApi（微信云开发文档型数据库版）
 * 单函数多 action：所有账本/成员/账目操作走这里，权限在服务端校验。
 * 身份认证：小程序 event.userInfo.openId → wx_<openid> 稳定 uid。
 */
const crypto = require('crypto')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const ledgers = db.collection('ledgers')
const members = db.collection('members')
const entries = db.collection('entries')
const subscriptions = db.collection('subscriptions')

/** 订阅消息模板 ID：mp 后台「功能 → 订阅消息 → 我的模板」中查看；环境变量 REMINDER_TMPL_ID 优先 */
const REMINDER_TMPL_ID = process.env.REMINDER_TMPL_ID || '-wq0aZvKONxkdQeqgJCMnnn4Ev1uYXnczkduVE0OQ3g'
/** 上海时区当前时间，格式 YYYY-MM-DD HH:mm（微信 time 类型字段要求） */
function shNowText() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
/** 上海时区今日 0 点与本月 1 日 0 点的毫秒时间戳 */
function shRangeStarts() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate()
  return { todayStart: Date.UTC(y, m, day) - 8 * 3600 * 1000, monthStart: Date.UTC(y, m, 1) - 8 * 3600 * 1000 }
}
/** 汇总某账本自 sinceTs 起的有效账目金额 */
async function sumEntriesSince(ledgerId, sinceTs) {
  const $agg = db.command.aggregate
  const r = await entries.aggregate()
    .match({ ledger_id: ledgerId, deleted: _.neq(true), created_at: _.gte(sinceTs) })
    .group({ _id: null, total: $agg.sum('$amount') })
    .end()
  return r.list && r.list[0] ? Number(r.list[0].total) || 0 : 0
}
/**
 * 模板字段（与 mp 后台「我的模板」详情一一对应）：
 * time1 时间 / thing4 温馨提示 / thing9 账本名称 / amount15 今日支出 / character_string14 预算占比
 * thing ≤20 字；amount 为数字字符串；character_string 仅允许数字字母符号（≤32），不能含中文
 */
function reminderData({ ledgerName, todayAmount, usedPct }) {
  return {
    time1: { value: shNowText() },
    thing4: { value: '说一句话就能记一笔，别让开销溜走' },
    thing9: { value: String(ledgerName || '共享账本').slice(0, 20) },
    amount15: { value: Number(todayAmount || 0).toFixed(2) },
    character_string14: { value: usedPct === null || usedPct === undefined ? '-' : `${Math.round(usedPct)}%` },
  }
}

function validateLen(val, max, field) {
  if (val && String(val).length > max) throw new Error(`${field}过长（最多 ${max} 字）`)
}

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '日用', '娱乐', '居住', '医疗', '人情', '其他']
const MAX_AMOUNT = 100000000 // 1 亿

/** 金额清洗：必须是有限正数，最多两位小数，有上限。防止负数/字符串/NaN/超大数污染统计 */
function cleanAmount(v, field = '金额') {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${field}不正确`)
  if (n <= 0) throw new Error(`${field}必须大于 0`)
  if (n > MAX_AMOUNT) throw new Error(`${field}超出上限`)
  return Math.round(n * 100) / 100
}
/** 分类清洗：不在账本自定义/默认分类内一律归为“其他” */
function cleanCategory(cat, customCats) {
  const allow = Array.isArray(customCats) && customCats.length > 0 ? customCats : DEFAULT_CATEGORIES
  const c = String(cat == null ? '' : cat).trim().slice(0, 10)
  return allow.includes(c) ? c : '其他'
}
/** 文本字段清洗：限长，去除首尾空白 */
function cleanText(v, max, field) {
  if (v == null) return undefined
  const s = String(v).trim().slice(0, max)
  return s
}

function docToLedger(d) {
  if (!d) return null
  return {
    id: d._id, name: d.name, ownerId: d.owner_id, inviteCode: d.invite_code,
    categories: d.categories || null, monthlyBudget: d.monthly_budget || null,
    categoryBudgets: d.category_budgets && typeof d.category_budgets === 'object' && !Array.isArray(d.category_budgets) ? d.category_budgets : null,
    createdAt: d.created_at || Date.now(), updatedAt: d.updated_at || Date.now(),
  }
}
function docToMember(d) {
  if (!d) return null
  return {
    id: d._id, ledgerId: d.ledger_id, uid: d.uid, nickname: d.name,
    role: d.role || 'member', joinedAt: d.joined_at || Date.now(),
  }
}
function docToEntry(d, memberName) {
  if (!d) return null
  return {
    id: d._id, ledgerId: d.ledger_id, memberId: d.member_id || d.uid, uid: d.uid,
    nickname: memberName || '我', rawText: d.text, amount: Number(d.amount),
    category: d.category || '其他', note: d.note || undefined, description: d.description || '',
    entryDate: d.entry_date, createdAt: d.created_at || Date.now(), updatedAt: d.updated_at || Date.now(),
    history: d.history || [], deleted: d.deleted === true,
  }
}

async function getUid(event) {
  const openId = event && event.userInfo && event.userInfo.openId
  if (openId) return `wx_${openId}`
  throw new Error('请先登录')
}
async function getMyMember(ledgerId, uid) {
  const res = await members.where({ ledger_id: ledgerId, uid }).limit(1).get()
  return res.data.length > 0 ? docToMember(res.data[0]) : null
}
async function getLedgerDoc(ledgerId) {
  try { const res = await ledgers.doc(ledgerId).get(); return docToLedger(res.data) }
  catch (e) { return null }
}
async function assertMember(ledgerId, uid) {
  const m = await getMyMember(ledgerId, uid)
  if (!m) throw new Error('你还没有加入这个账本')
  return m
}
async function assertOwner(ledgerId, uid) {
  const l = await getLedgerDoc(ledgerId)
  if (!l) throw new Error('账本不存在')
  if (l.ownerId !== uid) throw new Error('只有账本创建者可以操作')
  return l
}

const KEYWORDS = [
  ['医疗', ['药', '医院', '看病', '体检', '挂号', '诊所', '牙科', '打针', '输液']],
  ['居住', ['房租', '电费', '水费', '燃气', '物业', '宽带', '话费', '房贷']],
  ['餐饮', ['烤鱼', '火锅', '烧烤', '奶茶', '咖啡', '星巴克', '瑞幸', '外卖', '午餐', '晚饭', '早饭', '早餐', '晚餐', '夜宵', '麻辣烫', '吃', '饭', '餐', '面', '水果', '零食', '甜品', '蛋糕', '请客', '聚餐']],
  ['交通', ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路费', '单车', '出租', '网约车', '高速', '加油费']],
  ['日用', ['纸巾', '抽纸', '卷纸', '卫生纸', '面巾纸', '湿巾', '洗衣液', '洗衣粉', '洗衣凝珠', '洗发水', '洗发露', '沐浴露', '护发素', '牙膏', '牙刷', '毛巾', '浴巾', '香皂', '肥皂', '垃圾袋', '洗洁精', '清洁剂', '洁厕', '消毒液', '拖把', '扫帚', '扫把', '抹布', '衣架', '收纳', '卫生巾', '纸尿裤', '洗面奶', '洁面', '洗面', '洗脸', '日用品', '日用', '百货', '洗漱']],
  ['购物', ['超市', '淘宝', '京东', '拼多多', '衣服', '鞋', '化妆品', '手机', '耳机', '文具', '家电', '商场', '便利店', '买']],
  ['娱乐', ['电影', '游戏', '会员', 'KTV', '演唱会', '门票', '健身', '游泳', '酒吧', '剧本杀', '密室', '充值']],
  ['人情', ['红包', '份子', '送礼', '礼物', '随礼', '生日', '结婚', '借款', '还钱']],
]
const AMOUNT_RE = /(\d+(?:\.\d{1,2})?)\s*(元|块|块钱|rmb|RMB|¥|￥)?/g
function extractAmount(text) {
  const matches = []
  let m
  AMOUNT_RE.lastIndex = 0
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const v = parseFloat(m[1])
    if (Number.isFinite(v)) matches.push({ value: v, index: m.index, length: m[0].length, hasUnit: !!m[2] })
  }
  if (matches.length === 0) return null
  const um = matches.filter((it) => it.hasUnit)
  if (um.length > 0) return um[um.length - 1]
  let best = matches[0]
  for (const it of matches) if (it.value >= best.value) best = it
  return best
}
function matchCategory(text) {
  for (const [cat, words] of KEYWORDS) for (const w of words) if (text.includes(w)) return cat
  return '其他'
}
function parseByRules(text) {
  const t = text.trim()
  if (!t) return null
  const am = extractAmount(t)
  if (!am) return null
  const before = t.slice(0, am.index).trim()
  const after = t.slice(am.index + am.length).trim()
  let description = before, note
  if (before) { if (after) note = after } else { description = after }
  return { amount: am.value, category: matchCategory(t), description: description || '支出', note: note || undefined, matchedBy: 'rule' }
}
async function parseByLLM(text, categories) {
  const key = process.env.ZHIPU_API_KEY
  // Node 16 运行时无全局 fetch；未配置 key 或不支持时直接降级为规则解析
  if (!key || typeof fetch !== 'function') return null
  try {
    const catList = (categories && categories.length > 0 ? categories : ['餐饮', '交通', '购物', '日用', '娱乐', '居住', '医疗', '人情', '其他']).join('、')
    // 6 秒超时兜底，避免大模型接口挂起把整个云函数拖到 10s 网关超时
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    let resp
    try {
      resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'glm-4-flash', temperature: 0.1,
          messages: [
            { role: 'system', content: `你是记账解析助手。从用户输入中提取金额、分类和备注。只返回 JSON，格式：{"amount":数字,"category":"${catList}中的一个","description":"简短描述","note":"备注或空字符串"}。` },
            { role: 'user', content: text },
          ],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    const data = await resp.json()
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!content) return null
    const jm = content.match(/\{[\s\S]*\}/)
    if (!jm) return null
    const parsed = JSON.parse(jm[0])
    const amount = Number(parsed.amount)
    if (!(amount > 0) || !Number.isFinite(amount) || amount > MAX_AMOUNT) return null
    return {
      amount: Math.round(amount * 100) / 100,
      category: String(parsed.category || '其他').slice(0, 10),
      description: String(parsed.description || text).slice(0, 100),
      note: parsed.note ? String(parsed.note).slice(0, 100) : undefined,
      matchedBy: 'llm',
    }
  } catch (e) { console.error('[LLM]', e.message); return null }
}
async function parseEntry(text, categories) {
  const rule = parseByRules(text)
  if (rule) return rule
  const llm = await parseByLLM(text, categories)
  if (llm) return llm
  const m = text.trim().match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  return { amount: parseFloat(m[1]), category: matchCategory(text), description: text.replace(m[0], '').trim() || '支出', matchedBy: 'fallback' }
}

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genInviteCode() {
  const bytes = crypto.randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) code += INVITE_CHARS[bytes[i] % INVITE_CHARS.length]
  return code
}

const handlers = {
  async whoami({}, ctx) { return { uid: ctx.uid } },

  async createLedger({ name, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(name, 30, '账本名'); validateLen(nickname, 20, '昵称')
    const ownedCnt = await ledgers.where({ owner_id: uid }).count()
    if (ownedCnt.total >= 30) throw new Error('创建账本数量已达上限（30 本）')
    const ledgerName = (name || '').trim() || '我的账本'
    const memberName = (nickname || '').trim() || '我'
    const inviteCode = genInviteCode()
    const now = Date.now()
    const lr = await ledgers.add({ data: { name: ledgerName, owner_id: uid, invite_code: inviteCode, categories: null, created_at: now, updated_at: now } })
    const ledger = await getLedgerDoc(lr._id)
    const mr = await members.add({ data: { ledger_id: ledger.id, uid, name: memberName, role: 'owner', joined_at: now } })
    return { ledger, member: { id: mr._id, ledgerId: ledger.id, uid, nickname: memberName, role: 'owner', joinedAt: now } }
  },

  async joinLedger({ ledgerId, inviteCode, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(nickname, 20, '昵称')
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    if (ledger.inviteCode !== inviteCode) throw new Error('邀请码无效')
    const existing = await getMyMember(ledgerId, uid)
    if (existing) return { ledger, member: existing }
    const cnt = await members.where({ ledger_id: ledgerId }).count()
    if (cnt.total >= 20) throw new Error('该账本成员已达上限（20 人）')
    const memberName = (nickname || '').trim() || '我'
    const mr = await members.add({ data: { ledger_id: ledgerId, uid, name: memberName, role: 'member', joined_at: Date.now() } })
    return { ledger, member: { id: mr._id, ledgerId, uid, nickname: memberName, role: 'member', joinedAt: Date.now() } }
  },

  async getLedger({ id }, ctx) {
    const l = await getLedgerDoc(id)
    if (!l) throw new Error('账本不存在')
    await assertMember(id, ctx.uid)
    return l
  },

  async listLedgersByUid({}, ctx) {
    const uid = ctx.uid
    const myM = await members.where({ uid }).orderBy('joined_at', 'desc').get()
    if (myM.data.length === 0) return []
    const ids = myM.data.map((m) => m.ledger_id)
    const lr = await ledgers.where({ _id: _.in(ids) }).get()
    return lr.data.map(docToLedger)
  },

  async listMembers({ ledgerId }, ctx) {
    await assertMember(ledgerId, ctx.uid)
    const res = await members.where({ ledger_id: ledgerId }).orderBy('joined_at', 'asc').get()
    return res.data.map(docToMember)
  },

  async listEntries({ ledgerId }, ctx) {
    await assertMember(ledgerId, ctx.uid)
    const [er, mr] = await Promise.all([
      entries.where({ ledger_id: ledgerId }).orderBy('created_at', 'asc').get(),
      members.where({ ledger_id: ledgerId }).get(),
    ])
    const nm = {}
    mr.data.forEach((m) => { nm[m.uid] = m.name })
    return er.data.map((d) => docToEntry(d, nm[d.uid]))
  },

  async getLedgerFull({ ledgerId }, ctx) {
    const uid = ctx.uid
    const [ledger, myMember] = await Promise.all([getLedgerDoc(ledgerId), getMyMember(ledgerId, uid)])
    if (!ledger) throw new Error('账本不存在')
    if (!myMember) throw new Error('你还没有加入这个账本')
    const [mr, er] = await Promise.all([
      members.where({ ledger_id: ledgerId }).orderBy('joined_at', 'asc').get(),
      entries.where({ ledger_id: ledgerId }).orderBy('created_at', 'asc').get(),
    ])
    const nm = {}
    mr.data.forEach((m) => { nm[m.uid] = m.name })
    return { ledger, myMember, members: mr.data.map(docToMember), entries: er.data.map((d) => docToEntry(d, nm[d.uid])) }
  },

  async addEntry({ ledgerId, text, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(text, 200, '记账内容'); validateLen(nickname, 20, '昵称')
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    const myMember = await getMyMember(ledgerId, uid)
    if (!myMember) throw new Error('你还没有加入这个账本')
    const parsed = await parseEntry(text, ledger.categories)
    if (!parsed) throw new Error('没识别出这笔账的金额，换种说法试试？')
    parsed.amount = cleanAmount(parsed.amount)
    parsed.category = cleanCategory(parsed.category, ledger.categories)
    const safeDesc = cleanText(parsed.description, 100, '描述') || '支出'
    const safeNote = cleanText(parsed.note, 100, '备注') || null
    const entryNickname = nickname || myMember.nickname || '我'
    const rawText = (text || '').trim()
    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const res = await entries.add({
      data: {
        ledger_id: ledgerId, member_id: myMember.id, uid, text: rawText,
        amount: parsed.amount, category: parsed.category, description: safeDesc,
        note: safeNote, entry_date: today, created_at: now, updated_at: now,
        history: [], deleted: false,
      },
    })
    return docToEntry({
      _id: res._id, ledger_id: ledgerId, member_id: myMember.id, uid, text: rawText,
      amount: parsed.amount, category: parsed.category, description: safeDesc,
      note: safeNote, entry_date: today, created_at: now, updated_at: now,
      history: [], deleted: false,
    }, entryNickname)
  },

  async updateEntry({ entryId, patch }, ctx) {
    const uid = ctx.uid
    if (!patch || typeof patch !== 'object') throw new Error('修改内容不正确')
    const res = await entries.doc(entryId).get()
    const entry = res.data
    if (!entry) throw new Error('账目不存在')
    if (entry.deleted === true) throw new Error('账目已删除，不能修改')
    const ledger = await getLedgerDoc(entry.ledger_id)
    if (!ledger) throw new Error('账本不存在')
    const isOwner = ledger.owner_id === uid
    const myMember = await getMyMember(entry.ledger_id, uid)
    if (!isOwner) {
      if (!myMember) throw new Error('你还没有加入这个账本')
      if (entry.uid !== uid) throw new Error('只能修改自己的账')
    }
    const opNick = myMember ? myMember.nickname : '我'
    const pd = { updated_at: Date.now() }
    if (patch.amount !== undefined) pd.amount = cleanAmount(patch.amount)
    if (patch.category !== undefined) pd.category = cleanCategory(patch.category, ledger.categories)
    if (patch.note !== undefined) pd.note = cleanText(patch.note, 100, '备注') || null
    if (patch.description !== undefined) pd.description = cleanText(patch.description, 100, '描述') || '支出'
    if (patch.rawText !== undefined) {
      validateLen(patch.rawText, 200, '记账内容')
      pd.text = String(patch.rawText || '').trim()
    }
    pd.history = (entry.history || []).concat([{ uid, nickname: opNick, at: Date.now(), action: '修改' }])
    await entries.doc(entryId).update({ data: pd })
    const up = await entries.doc(entryId).get()
    const mres = await members.where({ ledger_id: entry.ledger_id, uid: up.data.uid }).limit(1).get()
    return docToEntry(up.data, mres.data.length > 0 ? mres.data[0].name : '我')
  },

  async deleteEntry({ entryId }, ctx) {
    const uid = ctx.uid
    const res = await entries.doc(entryId).get()
    const entry = res.data
    if (!entry) throw new Error('账目不存在')
    if (entry.deleted === true) return { ok: true } // 已删除，幂等返回
    const ledger = await getLedgerDoc(entry.ledger_id)
    if (!ledger) throw new Error('账本不存在')
    const isOwner = ledger.owner_id === uid
    const myMember = await getMyMember(entry.ledger_id, uid)
    if (!isOwner) {
      if (!myMember) throw new Error('你还没有加入这个账本')
      if (entry.uid !== uid) throw new Error('只能删除自己的账')
    }
    const opNick = myMember ? myMember.nickname : '我'
    const hist = (entry.history || []).concat([{ uid, nickname: opNick, at: Date.now(), action: '删除', originalAmount: Number(entry.amount), originalCategory: entry.category, originalNote: entry.note }])
    await entries.doc(entryId).update({
      data: { deleted: true, amount: 0, note: (entry.note ? entry.note + ' · ' : '') + '【已删除】', updated_at: Date.now(), history: hist },
    })
  },

  async renameLedger({ ledgerId, newName }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    validateLen(newName, 30, '账本名')
    const name = (newName || '').trim()
    if (!name) throw new Error('账本名不能为空')
    await ledgers.doc(ledgerId).update({ data: { name, updated_at: Date.now() } })
    return await getLedgerDoc(ledgerId)
  },

  async removeMember({ ledgerId, memberId }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    const res = await members.doc(memberId).get()
    const member = res.data
    if (!member || member.ledger_id !== ledgerId) throw new Error('成员不存在')
    if (member.uid === ctx.uid) throw new Error('不能移除自己')
    await members.doc(memberId).remove()
    const toRemove = await entries.where({ ledger_id: ledgerId, uid: member.uid, deleted: false }).get()
    for (const e of toRemove.data) {
      await entries.doc(e._id).update({ data: { deleted: true, note: (e.note ? e.note + ' · ' : '') + '【成员已移除】', updated_at: Date.now() } })
    }
  },

  async updateNickname({ ledgerId, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(nickname, 20, '昵称')
    const name = (nickname || '').trim()
    if (!name) throw new Error('昵称不能为空')
    const myMember = await getMyMember(ledgerId, uid)
    if (!myMember) throw new Error('你还没有加入这个账本')
    await members.doc(myMember.id).update({ data: { name } })
    const res = await members.doc(myMember.id).get()
    return docToMember(res.data)
  },

  async deleteLedger({ ledgerId }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    const er = await entries.where({ ledger_id: ledgerId }).get()
    for (const e of er.data) await entries.doc(e._id).remove()
    const mr = await members.where({ ledger_id: ledgerId }).get()
    for (const m of mr.data) await members.doc(m._id).remove()
    await ledgers.doc(ledgerId).remove()
    return { ok: true }
  },

  async regenerateInviteCode({ ledgerId }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    const newCode = genInviteCode()
    await ledgers.doc(ledgerId).update({ data: { invite_code: newCode, updated_at: Date.now() } })
    return { ledger: await getLedgerDoc(ledgerId) }
  },

  async updateCategories({ ledgerId, categories }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    let cats = null
    if (Array.isArray(categories) && categories.length > 0) {
      cats = [...new Set(categories.map((c) => String(c == null ? '' : c).trim()).filter(Boolean))]
        .slice(0, 30)
        .map((c) => c.slice(0, 10))
      if (cats.length === 0) cats = null
    }
    const data = { categories: cats, updated_at: Date.now() }
    // 同步清理已被删除分类的预算额度
    const ledger = await getLedgerDoc(ledgerId)
    if (ledger && ledger.categoryBudgets && typeof ledger.categoryBudgets === 'object') {
      const allow = Array.isArray(cats) && cats.length > 0 ? cats : DEFAULT_CATEGORIES
      const kept = {}
      Object.keys(ledger.categoryBudgets).forEach((c) => { if (allow.includes(c)) kept[c] = ledger.categoryBudgets[c] })
      data.category_budgets = Object.keys(kept).length > 0 ? kept : null
    }
    await ledgers.doc(ledgerId).update({ data })
    return await getLedgerDoc(ledgerId)
  },

  /** 设置/清除每月预算（仅创建者）。amount 为正数时设置，为 null/0 时清除 */
  async updateBudget({ ledgerId, amount }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    let budget = null
    if (amount !== null && amount !== undefined && Number(amount) > 0) budget = cleanAmount(amount, '预算')
    await ledgers.doc(ledgerId).update({ data: { monthly_budget: budget, updated_at: Date.now() } })
    return await getLedgerDoc(ledgerId)
  },

  /**
   * 批量设置分类月度预算（仅创建者）。
   * budgets: { 分类名: 金额 }，金额为正数时设置，null/undefined/''/0 时清除该分类预算。
   * 分类名必须命中账本分类白名单，整体读-改-写回。
   */
  async updateCategoryBudgets({ ledgerId, budgets }, ctx) {
    await assertOwner(ledgerId, ctx.uid)
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) throw new Error('预算数据不正确')
    const allow = Array.isArray(ledger.categories) && ledger.categories.length > 0 ? ledger.categories : DEFAULT_CATEGORIES
    const current = ledger.categoryBudgets && typeof ledger.categoryBudgets === 'object' ? { ...ledger.categoryBudgets } : {}
    const keys = Object.keys(budgets).slice(0, 50)
    for (const cat of keys) {
      if (typeof cat !== 'string' || !allow.includes(cat)) continue
      const v = budgets[cat]
      if (v === null || v === undefined || v === '' || Number(v) <= 0) {
        delete current[cat]
      } else {
        current[cat] = cleanAmount(v, `${cat}预算`)
      }
    }
    const out = Object.keys(current).length > 0 ? current : null
    await ledgers.doc(ledgerId).update({ data: { category_budgets: out, updated_at: Date.now() } })
    return await getLedgerDoc(ledgerId)
  },

  /** 查询当前用户在某账本的提醒订阅状态 */
  async getReminderStatus({ ledgerId }, ctx) {
    await assertMember(ledgerId, ctx.uid)
    const res = await subscriptions.where({ ledger_id: ledgerId, uid: ctx.uid }).limit(1).get()
    return { subscribed: res.data.length > 0, templateConfigured: !!REMINDER_TMPL_ID }
  },

  /** 订阅每日记账提醒（前端需先通过 wx.requestSubscribeMessage 拿到用户授权） */
  async subscribeReminder({ ledgerId }, ctx) {
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    await assertMember(ledgerId, ctx.uid)
    const exist = await subscriptions.where({ ledger_id: ledgerId, uid: ctx.uid }).limit(1).get()
    if (exist.data.length === 0) {
      await subscriptions.add({ data: { ledger_id: ledgerId, uid: ctx.uid, ledger_name: ledger.name, created_at: Date.now(), last_sent_date: '' } })
    }
    return { ok: true, templateConfigured: !!REMINDER_TMPL_ID }
  },

  /** 取消订阅 */
  async unsubscribeReminder({ ledgerId }, ctx) {
    const res = await subscriptions.where({ ledger_id: ledgerId, uid: ctx.uid }).get()
    for (const r of res.data) await subscriptions.doc(r._id).remove()
    return { ok: true }
  },
}

/** 定时触发器：每晚给订阅者发送记账提醒（幂等，每人每天最多一条） */
async function runDailyReminder() {
  if (!REMINDER_TMPL_ID) { console.log('[reminder] REMINDER_TMPL_ID 未配置，跳过'); return { skipped: true } }
  const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }).replace(/\//g, '-')
  const { todayStart, monthStart } = shRangeStarts()
  let sent = 0, failed = 0
  let pageData
  try {
    const MAX_LIMIT = 100
    let batch = []
    let offset = 0
    do {
      batch = (await subscriptions.skip(offset).limit(MAX_LIMIT).get()).data
      for (const s of batch) {
        if (s.last_sent_date === today) continue
        const openid = String(s.uid || '').replace(/^wx_/, '')
        if (!openid) continue
        try {
          // 实时统计：今日支出 + 本月预算使用率（账本被删则跳过该订阅）
          let todayAmount = 0, usedPct = null
          try {
            const ledger = await getLedgerDoc(s.ledger_id)
            if (!ledger) { await subscriptions.doc(s._id).remove().catch(() => {}); continue }
            const [todaySum, monthSum] = await Promise.all([
              sumEntriesSince(s.ledger_id, todayStart),
              sumEntriesSince(s.ledger_id, monthStart),
            ])
            todayAmount = todaySum
            if (ledger.monthlyBudget && ledger.monthlyBudget > 0) {
              usedPct = (monthSum / ledger.monthlyBudget) * 100
            }
          } catch (statErr) { console.error('[reminder:stat]', s.ledger_id, statErr.message) }
          await cloud.openapi.subscribeMessage.send({
            touser: openid,
            templateId: REMINDER_TMPL_ID,
            page: 'pages/index/index',
            data: reminderData({ ledgerName: s.ledger_name, todayAmount, usedPct }),
            miniprogramState: 'trial',
            lang: 'zh_CN',
          })
          await subscriptions.doc(s._id).update({ data: { last_sent_date: today, last_ok_at: Date.now() } })
          sent++
        } catch (e) {
          failed++
          await subscriptions.doc(s._id).update({ data: { last_fail_at: Date.now(), last_fail_msg: String(e && e.errMsg || e.message || 'fail').slice(0, 100) } }).catch(() => {})
        }
      }
      offset += batch.length
    } while (batch.length === MAX_LIMIT)
  } catch (e) { console.error('[reminder]', e) }
  return { sent, failed, date: today }
}

exports.main = async (event, context) => {
  // 定时触发器事件（无用户态，走每日提醒广播）。
  // 必须同时满足：触发器名匹配 + 携带 cron Message + 不含 action（前端调用必带 action），
  // 防止客户端在 callFunction 的 data 里伪造 TriggerName 触发群发。
  if (event && event.TriggerName === 'dailyReminder'
    && typeof event.Message === 'string'
    && !Object.prototype.hasOwnProperty.call(event, 'action')) {
    try { return { success: true, data: await runDailyReminder() } }
    catch (e) { console.error('[ledgerApi:timer]', e); return { success: false, error: e.message || '定时任务失败' } }
  }
  const { action, ...params } = event || {}
  const handler = handlers[action]
  if (!handler) return { success: false, error: `未知 action: ${action}` }
  try {
    const ctx = { uid: await getUid(event) }
    const data = await handler(params, ctx)
    return { success: true, data }
  } catch (e) {
    console.error(`[ledgerApi:${action}]`, e)
    return { success: false, error: e.message || '操作失败' }
  }
}
