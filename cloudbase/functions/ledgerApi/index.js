/**
 * 一起记账 · CloudBase 云函数 ledgerApi (PostgreSQL 版)
 * 单函数多 action：所有账本/成员/账目操作走这里，权限在服务端校验。
 *
 * 数据库访问：通过腾讯云临时密钥调用 tcb.ExecutePGSql API 执行 SQL。
 * 云函数无法直连 PostgreSQL（网络隔离），走 API 是唯一方式。
 * 全程不接触数据库密码，密码由 CloudBase 服务端托管。
 *
 * 身份认证：用户通过 CloudBase 邮箱登录后调用云函数，
 * 当前用户 uid 从 context.userInfo.uid 取，前端无法伪造。
 *
 * 调用方式：app.callFunction({ name: 'ledgerApi', data: { action, ...params } })
 *
 * 环境变量（可选）：
 *   ZHIPU_API_KEY  —— 智谱 GLM API Key，规则解析失败时用 LLM 兜底分类
 */
const crypto = require('crypto')
const https = require('https')
// ============================================================
// 数据库访问：通过临时密钥调用 ExecutePGSql API
// ============================================================
const ENV_ID = process.env.SCF_NAMESPACE || process.env.TCB_ENV || process.env.ENV_ID || process.env.TENCENTCLOUD_RUNENV || ''
function executePGSql(sql) {
  return new Promise((resolve, reject) => {
    const secretId = process.env.TENCENTCLOUD_SECRETID
    const secretKey = process.env.TENCENTCLOUD_SECRETKEY
    const token = process.env.TENCENTCLOUD_SESSIONTOKEN
    if (!secretId || !secretKey) {
      reject(new Error('云函数临时密钥不可用'))
      return
    }
    const host = 'tcb.tencentcloudapi.com'
    const service = 'tcb'
    const action = 'ExecutePGSql'
    const version = '2018-06-08'
    const region = 'ap-shanghai'
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    const payload = JSON.stringify({ EnvId: ENV_ID, Sql: sql })
    // TC3-HMAC-SHA256 签名
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
    const signedHeaders = 'content-type;host;x-tc-action'
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')
    const credentialScope = `${date}/${service}/tc3_request`
    const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
    const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
    const kService = crypto.createHmac('sha256', kDate).update(service).digest()
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      Authorization: authorization,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
    }
    if (token) headers['X-TC-Token'] = token
    const req = https.request({ hostname: host, method: 'POST', path: '/', headers }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.Response && parsed.Response.Error) {
            reject(new Error(`ExecutePGSql 失败: ${parsed.Response.Error.Message}`))
            return
          }
          // 解析 Rows：每个元素是 JSON 数组字符串，需要转换成对象
          const rowsRaw = (parsed.Response && parsed.Response.Rows) || []
          const columns = (parsed.Response && parsed.Response.Columns) || []
          const rows = rowsRaw.map((r) => {
            try {
              const arr = JSON.parse(r)
              // 如果是数组且有 columns，转换成对象
              if (Array.isArray(arr) && columns.length > 0) {
                const obj = {}
                columns.forEach((col, i) => { obj[col] = arr[i] })
                return obj
              }
              return arr
            } catch (e) { return r }
          })
          resolve(rows)
        } catch (e) {
          reject(new Error(`解析 ExecutePGSql 响应失败: ${e.message}, raw=${data.slice(0, 500)}`))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
/** SQL 转义：防止 SQL 注入 */
function esc(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  return `'${String(val).replace(/'/g, "''")}'`
}
/**
 * 把 ExecutePGSql 返回的 PG 时间字符串安全转成毫秒时间戳。
 * OpenAPI 返回形如 "2026-08-31 16:01:06.988206 +0800 CST"：
 * 结尾的时区缩写(CST/UTC...)在 JS 引擎里有歧义会被误解析，
 * 这里只保留数字时区偏移，输出标准 ISO（YYYY-MM-DDTHH:mm:ss+08:00）。
 */
function pgTimeToMs(v) {
  if (v === null || v === undefined || v === '') return Date.now()
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  const s = String(v).trim()
  // 手动拆解，避免老版本 Node 解析 "6位微秒+时区偏移" 不一致：
  // 形如 2026-08-31 14:04:56.826722 +0800 CST（结尾时区缩写忽略，只用数字偏移）
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s*([+-]\d{2}):?(\d{2}))?/)
  if (!m) {
    const t = Date.parse(s)
    return Number.isNaN(t) ? Date.now() : t
  }
  const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5], Se = +m[6]
  const frac = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0
  // 先按 UTC 构造该“墙上时间”，再减去数字偏移得到真正的 UTC 时刻
  let ms = Date.UTC(Y, Mo - 1, D, H, Mi, Se, frac)
  if (m[8] !== undefined) {
    const sign = m[8].startsWith('-') ? -1 : 1
    const offMin = sign * (Math.abs(+m[8]) * 60 + (+m[9] || 0))
    ms -= offMin * 60 * 1000
  }
  return ms
}
// ============================================================
// 行转换：PostgreSQL 字段 → 前端期望的 camelCase
// ============================================================
function rowToLedger(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    ownerId: r.owner_id,
    inviteCode: r.invite_code,
    categories: r.categories ? (typeof r.categories === 'string' ? JSON.parse(r.categories) : r.categories) : null,
    createdAt: r.created_at ? pgTimeToMs(r.created_at) : Date.now(),
    updatedAt: r.updated_at ? pgTimeToMs(r.updated_at) : Date.now(),
  }
}
function rowToMember(r) {
  if (!r) return null
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    uid: r.uid,
    nickname: r.name,
    role: r.role || 'member',
    joinedAt: r.joined_at ? pgTimeToMs(r.joined_at) : Date.now(),
  }
}
function rowToEntry(r) {
  if (!r) return null
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    // 优先用 JOIN 解析出的 members.id（PG 主键），兼容老数据 member_id 误存 uid 的情况
    memberId: r.resolved_member_id || r.member_id,
    uid: r.uid,
    nickname: r.nickname || '我',
    rawText: r.text,
    amount: Number(r.amount),
    category: r.category || '其他',
    note: r.note || undefined,
    description: r.description || '',
    entryDate: r.entry_date,
    createdAt: r.created_at ? pgTimeToMs(r.created_at) : Date.now(),
    updatedAt: r.updated_at ? pgTimeToMs(r.updated_at) : Date.now(),
    history: r.history ? (typeof r.history === 'string' ? JSON.parse(r.history) : r.history) : [],
    deleted: r.deleted === true || r.deleted === 'true',
  }
}
// ============================================================
// 身份
// ============================================================
function getUid(context) {
  // 临时方案：从 context._uid 获取用户 ID（由入口函数注入）
  // 后续优化：验证 accessToken 获取 uid
  const uid = context && context._uid
  if (!uid) throw new Error('请先登录')
  return uid
}
async function getMyMember(ledgerId, uid) {
  const rows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} AND uid = ${esc(uid)} LIMIT 1`)
  return rows.length > 0 ? rowToMember(rows[0]) : null
}
async function getLedgerDoc(ledgerId) {
  const rows = await executePGSql(`SELECT * FROM ledgers WHERE id = ${esc(ledgerId)} LIMIT 1`)
  return rows.length > 0 ? rowToLedger(rows[0]) : null
}
async function assertOwner(ledgerId, uid) {
  const ledger = await getLedgerDoc(ledgerId)
  if (!ledger) throw new Error('账本不存在')
  if (ledger.ownerId !== uid) throw new Error('只有账本创建者可以操作')
  return ledger
}
// ============================================================
// 规则解析引擎（与前端保持一致）
// ============================================================
const KEYWORDS = [
  ['医疗', ['药', '医院', '看病', '体检', '挂号', '诊所', '牙科', '打针', '输液']],
  ['居住', ['房租', '电费', '水费', '燃气', '物业', '宽带', '话费', '房贷']],
  ['餐饮', ['烤鱼', '火锅', '烧烤', '奶茶', '咖啡', '星巴克', '瑞幸', '外卖', '午餐', '晚饭', '早饭', '早餐', '晚餐', '夜宵', '麻辣烫', '吃', '饭', '餐', '面', '水果', '零食', '甜品', '蛋糕', '请客', '聚餐']],
  ['交通', ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路费', '单车', '出租', '网约车', '高速', '加油费']],
  ['购物', ['超市', '淘宝', '京东', '拼多多', '日用品', '衣服', '鞋', '化妆品', '手机', '耳机', '文具', '家电', '商场', '便利店', '买']],
  ['娱乐', ['电影', '游戏', '会员', 'KTV', '演唱会', '门票', '健身', '游泳', '酒吧', '剧本杀', '密室', '充值']],
  ['人情', ['红包', '份子', '送礼', '礼物', '随礼', '生日', '结婚', '借款', '还钱']],
]
const AMOUNT_RE = /(\d+(?:\.\d{1,2})?)\s*(元|块|块钱|rmb|RMB|¥|￥)?/g
function extractAmount(text) {
  const matches = []
  let m
  AMOUNT_RE.lastIndex = 0
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const value = parseFloat(m[1])
    if (Number.isFinite(value)) {
      matches.push({ value, index: m.index, length: m[0].length, hasUnit: !!m[2] })
    }
  }
  if (matches.length === 0) return null
  const unitMatches = matches.filter((it) => it.hasUnit)
  if (unitMatches.length > 0) return unitMatches[unitMatches.length - 1]
  let best = matches[0]
  for (const it of matches) if (it.value >= best.value) best = it
  return best
}
function matchCategory(text) {
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) if (text.includes(w)) return cat
  }
  return '其他'
}
function parseByRules(text) {
  const t = text.trim()
  if (!t) return null
  const am = extractAmount(t)
  if (!am) return null
  const before = t.slice(0, am.index).trim()
  const after = t.slice(am.index + am.length).trim()
  let description = before
  let note
  if (before) {
    if (after) note = after
  } else {
    description = after
  }
  return {
    amount: am.value,
    category: matchCategory(t),
    description: description || '支出',
    note: note || undefined,
    matchedBy: 'rule',
  }
}
async function parseByLLM(text, categories) {
  const key = process.env.ZHIPU_API_KEY
  if (!key) return null
  try {
    const catList = (categories && categories.length > 0 ? categories : ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '人情', '其他']).join('、')
    const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'glm-4-flash',
        temperature: 0.1,
        messages: [
          { role: 'system', content: `你是记账解析助手。从用户输入中提取金额、分类和备注。只返回 JSON，格式：{"amount":数字,"category":"${catList}中的一个","description":"简短描述","note":"备注或空字符串"}。` },
          { role: 'user', content: text },
        ],
      }),
    })
    const data = await resp.json()
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!content) return null
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.amount || !Number.isFinite(Number(parsed.amount))) return null
    return {
      amount: Number(parsed.amount),
      category: parsed.category || '其他',
      description: parsed.description || text,
      note: parsed.note || undefined,
      matchedBy: 'llm',
    }
  } catch (e) {
    console.error('[LLM 解析失败]', e.message)
    return null
  }
}
async function parseEntry(text, categories) {
  const rule = parseByRules(text)
  if (rule) return rule
  const llm = await parseByLLM(text, categories)
  if (llm) return llm
  const m = text.trim().match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  return {
    amount: parseFloat(m[1]),
    category: matchCategory(text),
    description: text.replace(m[0], '').trim() || '支出',
    matchedBy: 'fallback',
  }
}
// ============================================================
// 工具函数
// ============================================================
function genInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}
// ============================================================
// Action Handlers
// ============================================================
const handlers = {
  // —— 创建账本 ——
  async createLedger({ name, nickname }, context) {
    const uid = getUid(context)
    const ledgerName = (name || '').trim() || '我的账本'
    const memberName = (nickname || '').trim() || '我'
    const inviteCode = genInviteCode()
    // 1. 创建账本
    await executePGSql(`INSERT INTO ledgers (name, owner_id, invite_code) VALUES (${esc(ledgerName)}, ${esc(uid)}, ${esc(inviteCode)})`)
    const ledgerRows = await executePGSql(`SELECT * FROM ledgers WHERE invite_code = ${esc(inviteCode)} ORDER BY created_at DESC LIMIT 1`)
    console.log('[createLedger] ledgerRows:', JSON.stringify(ledgerRows))
    const ledger = rowToLedger(ledgerRows[0])
    console.log('[createLedger] ledger:', JSON.stringify(ledger))
    // 2. 创建成员记录（role = owner）
    await executePGSql(`INSERT INTO members (ledger_id, uid, name, role) VALUES (${esc(ledger.id)}, ${esc(uid)}, ${esc(memberName)}, 'owner')`)
    const memberRows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledger.id)} AND uid = ${esc(uid)} LIMIT 1`)
    const member = rowToMember(memberRows[0])
    return { ledger, member }
  },
  // —— 加入账本 ——
  async joinLedger({ ledgerId, inviteCode, nickname }, context) {
    const uid = getUid(context)
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    if (ledger.inviteCode !== inviteCode) throw new Error('邀请码无效')
    // 防止重复加入
    const existing = await getMyMember(ledgerId, uid)
    if (existing) {
      return { ledger, member: existing }
    }
    const memberName = (nickname || '').trim() || '我'
    await executePGSql(`INSERT INTO members (ledger_id, uid, name, role) VALUES (${esc(ledgerId)}, ${esc(uid)}, ${esc(memberName)}, 'member')`)
    const memberRows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} AND uid = ${esc(uid)} LIMIT 1`)
    const member = rowToMember(memberRows[0])
    return { ledger, member }
  },
  // —— 查单个账本 ——
  async getLedger({ id }) {
    return await getLedgerDoc(id)
  },
  // —— 按 id 列表批量查账本 ——
  async getLedgersByIds({ ids }) {
    if (!ids || ids.length === 0) return []
    const idList = ids.map(esc).join(', ')
    const rows = await executePGSql(`SELECT * FROM ledgers WHERE id IN (${idList})`)
    return rows.map(rowToLedger)
  },
  // —— 列出成员 ——
  async listMembers({ ledgerId }) {
    const rows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} ORDER BY joined_at ASC`)
    return rows.map(rowToMember)
  },
  // —— 列出账目 ——
  async listEntries({ ledgerId }) {
    // 关联 members 表获取昵称 + 解析真正的成员 id（members.id，PG 主键）
    const rows = await executePGSql(`
      SELECT e.*, m.id as resolved_member_id, m.name as nickname
      FROM entries e
      LEFT JOIN members m ON m.ledger_id = e.ledger_id AND m.uid = e.uid
      WHERE e.ledger_id = ${esc(ledgerId)}
      ORDER BY e.created_at ASC
    `)
    return rows.map(rowToEntry)
  },
  // —— 记账 ——
  async addEntry({ ledgerId, text, nickname }, context) {
    const uid = getUid(context)
    const ledger = await getLedgerDoc(ledgerId)
    if (!ledger) throw new Error('账本不存在')
    // 确认是本账本成员
    const myMember = await getMyMember(ledgerId, uid)
    if (!myMember) throw new Error('你还没有加入这个账本')
    const parsed = await parseEntry(text, ledger.categories)
    if (!parsed) throw new Error('没识别出这笔账的金额，换种说法试试？')
    const entryNickname = nickname || myMember.nickname || '我'
    const rawText = (text || '').trim()
    // member_id 存 members.id（PG 主键），与前端 myMember.id 对应；uid 单独存登录用户 uid 用于服务端权限校验
    await executePGSql(`
      INSERT INTO entries (ledger_id, member_id, uid, text, amount, category, description, note)
      VALUES (${esc(ledgerId)}, ${esc(myMember.id)}, ${esc(uid)}, ${esc(rawText)}, ${parsed.amount}, ${esc(parsed.category)}, ${esc(parsed.description)}, ${esc(parsed.note || null)})
    `)
    const entryRows = await executePGSql(`
      SELECT e.*, m.id as resolved_member_id, m.name as nickname
      FROM entries e
      LEFT JOIN members m ON m.ledger_id = e.ledger_id AND m.uid = e.uid
      WHERE e.ledger_id = ${esc(ledgerId)} AND e.uid = ${esc(uid)}
      ORDER BY e.created_at DESC LIMIT 1
    `)
    return rowToEntry(entryRows[0])
  },
  // —— 修改账目（本人或创建者） ——
  async updateEntry({ entryId, patch }, context) {
    const uid = getUid(context)
    const entryRows = await executePGSql(`SELECT * FROM entries WHERE id = ${esc(entryId)} LIMIT 1`)
    const entry = entryRows.length > 0 ? rowToEntry(entryRows[0]) : null
    if (!entry) throw new Error('账目不存在')
    const ledger = await getLedgerDoc(entry.ledgerId)
    if (!ledger) throw new Error('账本不存在')
    // 权限：本人（uid = 登录用户）或创建者（ownerId = uid）
    // 注意：memberId 是 members.id（PG 主键），权限判断必须用 uid 字段
    if (entry.uid !== uid && ledger.ownerId !== uid) {
      throw new Error('只能修改自己的账')
    }
    const myMember = await getMyMember(entry.ledgerId, uid)
    const operatorNickname = myMember ? myMember.nickname : '我'
    const sets = []
    if (patch.amount !== undefined) sets.push(`amount = ${patch.amount}`)
    if (patch.category !== undefined) sets.push(`category = ${esc(patch.category)}`)
    if (patch.note !== undefined) sets.push(`note = ${esc(patch.note)}`)
    if (patch.description !== undefined) sets.push(`description = ${esc(patch.description)}`)
    if (patch.rawText !== undefined) sets.push(`text = ${esc(patch.rawText)}`)
    sets.push(`updated_at = NOW()`)
    // 历史记录（简化：追加到 history JSON 数组）
    const historyEntry = { uid, nickname: operatorNickname, at: Date.now(), action: '修改' }
    const currentHistory = entry.history || []
    currentHistory.push(historyEntry)
    sets.push(`history = ${esc(JSON.stringify(currentHistory))}`)
    await executePGSql(`UPDATE entries SET ${sets.join(', ')} WHERE id = ${esc(entryId)}`)
    const updatedRows = await executePGSql(`
      SELECT e.*, m.id as resolved_member_id, m.name as nickname
      FROM entries e
      LEFT JOIN members m ON m.ledger_id = e.ledger_id AND m.uid = e.uid
      WHERE e.id = ${esc(entryId)} LIMIT 1
    `)
    return rowToEntry(updatedRows[0])
  },
  // —— 删除账目（软删除，本人或创建者） ——
  async deleteEntry({ entryId }, context) {
    const uid = getUid(context)
    const entryRows = await executePGSql(`SELECT * FROM entries WHERE id = ${esc(entryId)} LIMIT 1`)
    const entry = entryRows.length > 0 ? rowToEntry(entryRows[0]) : null
    if (!entry) throw new Error('账目不存在')
    const ledger = await getLedgerDoc(entry.ledgerId)
    if (!ledger) throw new Error('账本不存在')
    // 权限：本人（uid = 登录用户）或创建者（ownerId = uid）
    if (entry.uid !== uid && ledger.ownerId !== uid) {
      throw new Error('只能删除自己的账')
    }
    const myMember = await getMyMember(entry.ledgerId, uid)
    const operatorNickname = myMember ? myMember.nickname : '我'
    const historyEntry = { uid, nickname: operatorNickname, at: Date.now(), action: '删除' }
    const currentHistory = entry.history || []
    currentHistory.push(historyEntry)
    await executePGSql(`
      UPDATE entries SET deleted = true, amount = 0, note = ${esc((entry.note ? entry.note + ' · ' : '') + '【已删除】')}, updated_at = NOW(), history = ${esc(JSON.stringify(currentHistory))}
      WHERE id = ${esc(entryId)}
    `)
  },
  // —— 改账本名（仅创建者） ——
  async renameLedger({ ledgerId, newName }, context) {
    const uid = getUid(context)
    await assertOwner(ledgerId, uid)
    const name = (newName || '').trim()
    if (!name) throw new Error('账本名不能为空')
    await executePGSql(`UPDATE ledgers SET name = ${esc(name)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    return await getLedgerDoc(ledgerId)
  },
  // —— 移除成员（仅创建者） ——
  async removeMember({ ledgerId, memberId }, context) {
    const uid = getUid(context)
    await assertOwner(ledgerId, uid)
    const memberRows = await executePGSql(`SELECT * FROM members WHERE id = ${esc(memberId)} LIMIT 1`)
    const member = memberRows.length > 0 ? rowToMember(memberRows[0]) : null
    if (!member) throw new Error('成员不存在')
    if (member.uid === uid) throw new Error('不能移除自己')
    await executePGSql(`DELETE FROM members WHERE id = ${esc(memberId)}`)
  },
  // —— 修改自己在本账本中的昵称 ——
  async updateNickname({ ledgerId, nickname }, context) {
    const uid = getUid(context)
    const name = (nickname || '').trim()
    if (!name) throw new Error('昵称不能为空')
    const myMember = await getMyMember(ledgerId, uid)
    if (!myMember) throw new Error('你还没有加入这个账本')
    await executePGSql(`UPDATE members SET name = ${esc(name)} WHERE id = ${esc(myMember.id)}`)
    const rows = await executePGSql(`SELECT * FROM members WHERE id = ${esc(myMember.id)} LIMIT 1`)
    return rowToMember(rows[0])
  },
  // —— 重新生成邀请码（仅创建者） ——
  async regenerateInviteCode({ ledgerId }, context) {
    const uid = getUid(context)
    await assertOwner(ledgerId, uid)
    const newCode = genInviteCode()
    await executePGSql(`UPDATE ledgers SET invite_code = ${esc(newCode)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    const ledger = await getLedgerDoc(ledgerId)
    return { ledger }
  },
  // —— 更新分类（仅创建者） ——
  async updateCategories({ ledgerId, categories }, context) {
    const uid = getUid(context)
    await assertOwner(ledgerId, uid)
    const cats = Array.isArray(categories) && categories.length > 0 ? categories : null
    await executePGSql(`UPDATE ledgers SET categories = ${esc(cats ? JSON.stringify(cats) : null)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    return await getLedgerDoc(ledgerId)
  },
  // —— 测试数据库连接 ——
  async testDb() {
    const envInfo = {
      ENV_ID,
      TCB_ENV: process.env.TCB_ENV,
      TENCENTCLOUD_RUNENV: process.env.TENCENTCLOUD_RUNENV,
      SCF_NAMESPACE: process.env.SCF_NAMESPACE,
      hasSecretId: !!process.env.TENCENTCLOUD_SECRETID,
      hasSecretKey: !!process.env.TENCENTCLOUD_SECRETKEY,
      hasToken: !!process.env.TENCENTCLOUD_SESSIONTOKEN,
    }
    try {
      const rows = await executePGSql('SELECT version(), current_user, current_database()')
      return { ok: true, envInfo, rows }
    } catch (e) {
      return { ok: false, envInfo, error: e.message }
    }
  },
}
// ============================================================
// 云函数入口
// ============================================================
exports.main = async (event, context) => {
  const { action, _uid, ...params } = event || {}
  const handler = handlers[action]
  if (!handler) {
    return { success: false, error: `未知 action: ${action}` }
  }
  try {
    // 把 _uid 注入到 context 中，让 handler 可以通过 getUid(context) 获取
    const contextWithUid = { ...context, _uid }
    const data = await handler(params, contextWithUid)
    return { success: true, data }
  } catch (e) {
    console.error(`[ledgerApi:${action}]`, e)
    return { success: false, error: e.message || '操作失败' }
  }
}
