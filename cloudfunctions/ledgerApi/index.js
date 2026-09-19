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

function validateLen(val, max, field) {
  if (val && String(val).length > max) throw new Error(`${field}过长（最多 ${max} 字）`)
}

function docToLedger(d) {
  if (!d) return null
  return {
    id: d._id, name: d.name, ownerId: d.owner_id, inviteCode: d.invite_code,
    categories: d.categories || null, createdAt: d.created_at || Date.now(), updatedAt: d.updated_at || Date.now(),
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
  if (!key) return null
  try {
    const catList = (categories && categories.length > 0 ? categories : ['餐饮', '交通', '购物', '日用', '娱乐', '居住', '医疗', '人情', '其他']).join('、')
    const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'glm-4-flash', temperature: 0.1,
        messages: [
          { role: 'system', content: `你是记账解析助手。从用户输入中提取金额、分类和备注。只返回 JSON，格式：{"amount":数字,"category":"${catList}中的一个","description":"简短描述","note":"备注或空字符串"}。` },
          { role: 'user', content: text },
        ],
      }),
    })
    const data = await resp.json()
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!content) return null
    const jm = content.match(/\{[\s\S]*\}/)
    if (!jm) return null
    const parsed = JSON.parse(jm[0])
    if (!parsed.amount || !Number.isFinite(Number(parsed.amount))) return null
    return { amount: Number(parsed.amount), category: parsed.category || '其他', description: parsed.description || text, note: parsed.note || undefined, matchedBy: 'llm' }
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
    const memberName = (nickname || '').trim() || '我'
    const mr = await members.add({ data: { ledger_id: ledgerId, uid, name: memberName, role: 'member', joined_at: Date.now() } })
    return { ledger, member: { id: mr._id, ledgerId, uid, nickname: memberName, role: 'member', joinedAt: Date.now() } }
  },

  async getLedger({ id }, ctx) {
    const l = await getLedgerDoc(id)
    if (!l) throw new Error('账本不存在')
    if (ctx && ctx.uid) await assertMember(id, ctx.uid)
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
    const entryNickname = nickname || myMember.nickname || '我'
    const rawText = (text || '').trim()
    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const res = await entries.add({
      data: {
        ledger_id: ledgerId, member_id: myMember.id, uid, text: rawText,
        amount: parsed.amount, category: parsed.category, description: parsed.description,
        note: parsed.note || null, entry_date: today, created_at: now, updated_at: now,
        history: [], deleted: false,
      },
    })
    return docToEntry({
      _id: res._id, ledger_id: ledgerId, member_id: myMember.id, uid, text: rawText,
      amount: parsed.amount, category: parsed.category, description: parsed.description,
      note: parsed.note || null, entry_date: today, created_at: now, updated_at: now,
      history: [], deleted: false,
    }, entryNickname)
  },

  async updateEntry({ entryId, patch }, ctx) {
    const uid = ctx.uid
    const res = await entries.doc(entryId).get()
    const entry = res.data
    if (!entry) throw new Error('账目不存在')
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
    if (patch.amount !== undefined) pd.amount = patch.amount
    if (patch.category !== undefined) pd.category = patch.category
    if (patch.note !== undefined) pd.note = patch.note
    if (patch.description !== undefined) pd.description = patch.description
    if (patch.rawText !== undefined) pd.text = patch.rawText
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
    if (!member) throw new Error('成员不存在')
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
    const cats = Array.isArray(categories) && categories.length > 0 ? categories : null
    await ledgers.doc(ledgerId).update({ data: { categories: cats, updated_at: Date.now() } })
    return await getLedgerDoc(ledgerId)
  },

  async initSchema() {
    return { ok: true, message: '文档型数据库无需建表，首次写入自动创建集合', collections: ['ledgers', 'members', 'entries'] }
  },

  async testDb() {
    try {
      const c = await ledgers.count()
      return { ok: true, type: 'document', ledgerCount: c.total }
    } catch (e) { return { ok: false, error: e.message } }
  },
}

exports.main = async (event, context) => {
  const { action, ...params } = event || {}
  const handler = handlers[action]
  if (!handler) return { success: false, error: `未知 action: ${action}` }
  try {
    const SKIP_AUTH = ['initSchema', 'testDb']
    const ctx = SKIP_AUTH.includes(action) ? {} : { uid: await getUid(event) }
    const data = await handler(params, ctx)
    return { success: true, data }
  } catch (e) {
    console.error(`[ledgerApi:${action}]`, e)
    return { success: false, error: e.message || '操作失败' }
  }
}
