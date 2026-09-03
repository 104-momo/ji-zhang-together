/**
 * 一起记账 · CloudBase 云函数 ledgerApi (PostgreSQL 版)
 * 单函数多 action：所有账本/成员/账目操作走这里，权限在服务端校验。
 *
 * 数据库访问：通过腾讯云临时密钥调用 tcb.ExecutePGSql API 执行 SQL。
 * 云函数无法直连 PostgreSQL（网络隔离），走 API 是唯一方式。
 * 全程不接触数据库密码，密码由 CloudBase 服务端托管。
 *
 * 身份认证：用户通过 CloudBase 邮箱登录后调用云函数，
 * 当前用户 uid 从 event.userInfo.uid 取（CloudBase 平台在用户登录后
 * 调用云函数时自动注入，前端无法伪造）。前端传入的 _uid 一律不信任。
 *
 * 调用方式：app.callFunction({ name: 'ledgerApi', data: { action, ...params } })
 *
 * 环境变量（可选）：
 *   ZHIPU_API_KEY  —— 智谱 GLM API Key，规则解析失败时用 LLM 兜底分类
 */
const crypto = require('crypto')
const https = require('https')
// 复用 TCP/TLS 连接：同一 SCF 实例热复用时，多次访问腾讯云数据网关 / 认证网关
// 不必每次重新握手，显著降低单次 SQL/鉴权的往返耗时（对所有 action 生效）。
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 30000 })
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
    const req = https.request({ hostname: host, method: 'POST', path: '/', headers, agent: keepAliveAgent }, (res) => {
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
/** 输入长度限制 */
function validateLen(val, max, field) {
  if (val && String(val).length > max) {
    throw new Error(`${field}过长（最多 ${max} 字）`)
  }
}
/**
 * 把 ExecutePGSql 返回的 PG 时间字符串安全转成毫秒时间戳。
 * CloudBase PG（时区 PRC）实际返回形如 "2026-09-02 16:53:51.988075+08"：
 * 偏移只到小时、没有分钟；也兼容 " +0800 CST" / "+08:00" / "Z" 等写法。
 * 只按数字偏移换算成绝对 UTC 毫秒，忽略有歧义的时区缩写。
 */
function pgTimeToMs(v) {
  if (v === null || v === undefined || v === '') return Date.now()
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  const s = String(v).trim()
  // 手动拆解，避免老版本 Node 解析 "6位微秒+时区偏移" 不一致：
  // 形如 2026-08-31 14:04:56.826722 +0800 CST（结尾时区缩写忽略，只用数字偏移）
  // 偏移分钟可选：兼容 CloudBase PG 实际返回的 "+08"（无分钟），以及 "+0800"/"+08:00"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s*([+-]\d{2})(?::?(\d{2}))?)?/)
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
// ============================================================
// 身份认证：Web SDK 调用云函数不会注入 event.userInfo（仅小程序端注入），
// 因此改为「前端传 accessToken → 云函数调 CloudBase 网关 /auth/v1/user/me 验证」
// 拿 uid。该接口用 Bearer token 即可换取用户信息（sub/user_id 即 uid），
// 前端伪造的 uid 一律不信任。
// ============================================================
const authTokenCache = new Map() // token -> { uid, exp }
const AUTH_CACHE_TTL = 10 * 60 * 1000 // 10 分钟，缓解每次记账都打网关
const AUTH_CACHE_MAX = 300

function httpsJson(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'GET',
        headers,
        agent: keepAliveAgent,
        timeout: timeoutMs || 6000,
      },
      (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('认证网关超时'))
    })
    req.end()
  })
}

async function verifyAccessToken(token) {
  if (!token) throw new Error('请先登录')
  // 缓存命中
  const hit = authTokenCache.get(token)
  if (hit && hit.exp > Date.now()) return hit.uid
  if (hit) authTokenCache.delete(token)
  const env = ENV_ID
  if (!env) throw new Error('环境配置缺失')
  const url = `https://${env}.api.tcloudbasegateway.com/auth/v1/user/me`
  const { status, body } = await httpsJson(url, { Authorization: `Bearer ${token}` })
  if (status !== 200) {
    throw new Error('登录态无效，请重新登录')
  }
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error('登录态无效，请重新登录')
  }
  const uid = data.sub || data.user_id
  if (!uid) throw new Error('登录态无效，请重新登录')
  // 写入缓存（控制大小）
  if (authTokenCache.size >= AUTH_CACHE_MAX) authTokenCache.clear()
  authTokenCache.set(token, { uid, exp: Date.now() + AUTH_CACHE_TTL })
  return uid
}

/** 取当前登录用户 uid：只信任网关验证结果，前端传的 uid 一律不信任 */
async function getUid(event) {
  const token = event && event.accessToken
  return verifyAccessToken(token)
}
async function getMyMember(ledgerId, uid) {
  const rows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} AND uid = ${esc(uid)} LIMIT 1`)
  return rows.length > 0 ? rowToMember(rows[0]) : null
}
async function getLedgerDoc(ledgerId) {
  const rows = await executePGSql(`SELECT * FROM ledgers WHERE id = ${esc(ledgerId)} LIMIT 1`)
  return rows.length > 0 ? rowToLedger(rows[0]) : null
}
/** 校验“我是该账本成员”，防止越权读 */
async function assertMember(ledgerId, uid) {
  const member = await getMyMember(ledgerId, uid)
  if (!member) throw new Error('你还没有加入这个账本')
  return member
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
  ['日用', ['纸巾', '抽纸', '卷纸', '卫生纸', '面巾纸', '湿巾', '洗衣液', '洗衣粉', '洗衣凝珠', '洗发水', '洗发露', '沐浴露', '护发素', '牙膏', '牙刷', '毛巾', '浴巾', '香皂', '肥皂', '垃圾袋', '洗洁精', '清洁剂', '洁厕', '消毒液', '拖把', '扫帚', '扫把', '抹布', '衣架', '收纳', '卫生巾', '纸尿裤', '日用品', '日用', '百货', '洗漱']],
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
    const catList = (categories && categories.length > 0 ? categories : ['餐饮', '交通', '购物', '日用', '娱乐', '居住', '医疗', '人情', '其他']).join('、')
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
/** 邀请码：使用 CSPRNG（crypto.randomBytes），排除易混淆字符 */
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genInviteCode() {
  const bytes = crypto.randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) code += INVITE_CHARS[bytes[i] % INVITE_CHARS.length]
  return code
}
// ============================================================
// Action Handlers
// ============================================================
const handlers = {
  // —— 创建账本 ——
  async createLedger({ name, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(name, 30, '账本名')
    validateLen(nickname, 20, '昵称')
    const ledgerName = (name || '').trim() || '我的账本'
    const memberName = (nickname || '').trim() || '我'
    const inviteCode = genInviteCode()
    // 1. 创建账本
    await executePGSql(`INSERT INTO ledgers (name, owner_id, invite_code) VALUES (${esc(ledgerName)}, ${esc(uid)}, ${esc(inviteCode)})`)
    const ledgerRows = await executePGSql(`SELECT * FROM ledgers WHERE invite_code = ${esc(inviteCode)} ORDER BY created_at DESC LIMIT 1`)
    const ledger = rowToLedger(ledgerRows[0])
    // 2. 创建成员记录（role = owner）
    await executePGSql(`INSERT INTO members (ledger_id, uid, name, role) VALUES (${esc(ledger.id)}, ${esc(uid)}, ${esc(memberName)}, 'owner')`)
    const memberRows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledger.id)} AND uid = ${esc(uid)} LIMIT 1`)
    const member = rowToMember(memberRows[0])
    return { ledger, member }
  },
  // —— 加入账本 ——
  async joinLedger({ ledgerId, inviteCode, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(nickname, 20, '昵称')
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
  // —— 查单个账本（仅成员/创建者） ——
  async getLedger({ id }, ctx) {
    const ledger = await getLedgerDoc(id)
    if (!ledger) throw new Error('账本不存在')
    if (ctx && ctx.uid) await assertMember(id, ctx.uid)
    return ledger
  },
  // —— 按 id 列表批量查账本（仅返回我是成员的账本） ——
  async getLedgersByIds({ ids }, ctx) {
    const uid = ctx.uid
    if (!ids || ids.length === 0) return []
    const idList = ids.map(esc).join(', ')
    const rows = await executePGSql(`
      SELECT l.* FROM ledgers l
      JOIN members m ON m.ledger_id = l.id::text AND m.uid = ${esc(uid)}
      WHERE l.id::text IN (${idList})
    `)
    return rows.map(rowToLedger)
  },
  // —— 列出我参与的所有账本（按登录 uid 查询，跨设备可用） ——
  async listLedgersByUid({}, ctx) {
    const uid = ctx.uid
    const rows = await executePGSql(`
      SELECT l.* FROM ledgers l
      JOIN members m ON m.ledger_id = l.id::text AND m.uid = ${esc(uid)}
      ORDER BY m.joined_at DESC
    `)
    return rows.map(rowToLedger)
  },
  // —— 列出成员（仅成员/创建者） ——
  async listMembers({ ledgerId }, ctx) {
    await assertMember(ledgerId, ctx.uid)
    const rows = await executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} ORDER BY joined_at ASC`)
    return rows.map(rowToMember)
  },
  // —— 列出账目（仅成员/创建者） ——
  async listEntries({ ledgerId }, ctx) {
    await assertMember(ledgerId, ctx.uid)
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
  // —— 聚合：一次调用取回账本+成员+账目（打开账本/轮询专用，替代原先 3 次串行云函数）——
  async getLedgerFull({ ledgerId }, ctx) {
    const uid = ctx.uid
    const t0 = Date.now()
    // 阶段1：账本本体与“我的成员身份”并行查（两条 SQL 同时发出）
    const [ledger, myMember] = await Promise.all([getLedgerDoc(ledgerId), getMyMember(ledgerId, uid)])
    if (!ledger) throw new Error('账本不存在')
    if (!myMember) throw new Error('你还没有加入这个账本')
    const t1 = Date.now()
    // 阶段2：成员列表与全部账目并行查
    const [memberRows, entryRows] = await Promise.all([
      executePGSql(`SELECT * FROM members WHERE ledger_id = ${esc(ledgerId)} ORDER BY joined_at ASC`),
      executePGSql(`
        SELECT e.*, m.id as resolved_member_id, m.name as nickname
        FROM entries e
        LEFT JOIN members m ON m.ledger_id = e.ledger_id AND m.uid = e.uid
        WHERE e.ledger_id = ${esc(ledgerId)}
        ORDER BY e.created_at ASC
      `),
    ])
    return {
      ledger,
      myMember,
      members: memberRows.map(rowToMember),
      entries: entryRows.map(rowToEntry),
      _timing: { phase1Ms: t1 - t0, phase2Ms: Date.now() - t1, totalMs: Date.now() - t0 },
    }
  },
  // —— 记账 ——
  async addEntry({ ledgerId, text, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(text, 200, '记账内容')
    validateLen(nickname, 20, '昵称')
    // 性能优化：一次 JOIN 同时确认「账本存在 + 我是成员」，减少串行 DB 调用
    // 注意：ledgers.id 是 uuid，members.ledger_id 是 varchar，JOIN 需用 ::text 转换
    const rows = await executePGSql(`
      SELECT l.id as ledger_id, l.name as ledger_name, l.owner_id, l.categories,
             m.id as member_id, m.name as member_name
      FROM ledgers l
      LEFT JOIN members m ON m.ledger_id = l.id::text AND m.uid = ${esc(uid)}
      WHERE l.id::text = ${esc(ledgerId)} LIMIT 1
    `)
    const row = rows[0]
    if (!row) throw new Error('账本不存在')
    if (!row.member_id) throw new Error('你还没有加入这个账本')
    const categories = row.categories
      ? (typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories)
      : null
    const parsed = await parseEntry(text, categories)
    if (!parsed) throw new Error('没识别出这笔账的金额，换种说法试试？')
    const entryNickname = nickname || row.member_name || '我'
    const rawText = (text || '').trim()
    // 性能优化：INSERT ... RETURNING + JOIN 一条 SQL 拿回完整 entry（含昵称），不再额外查一次
    const entryRows = await executePGSql(`
      WITH ins AS (
        INSERT INTO entries (ledger_id, member_id, uid, text, amount, category, description, note)
        VALUES (${esc(ledgerId)}, ${esc(row.member_id)}, ${esc(uid)}, ${esc(rawText)}, ${esc(parsed.amount)}, ${esc(parsed.category)}, ${esc(parsed.description)}, ${esc(parsed.note || null)})
        RETURNING *
      )
      SELECT ins.*, m.id as resolved_member_id, m.name as nickname
      FROM ins
      LEFT JOIN members m ON m.ledger_id = ins.ledger_id AND m.uid = ins.uid
    `)
    return rowToEntry(entryRows[0])
  },
  // —— 修改账目（本人或创建者） ——
  async updateEntry({ entryId, patch }, ctx) {
    const uid = ctx.uid
    const entryRows = await executePGSql(`SELECT * FROM entries WHERE id = ${esc(entryId)} LIMIT 1`)
    const entry = entryRows.length > 0 ? rowToEntry(entryRows[0]) : null
    if (!entry) throw new Error('账目不存在')
    const ledger = await getLedgerDoc(entry.ledgerId)
    if (!ledger) throw new Error('账本不存在')
    // 权限：创建者可改任意账；普通成员必须当前仍是本账本成员，且只能改自己的账（被移除即失权）
    const isOwner = ledger.ownerId === uid
    const myMember = await getMyMember(entry.ledgerId, uid)
    if (!isOwner) {
      if (!myMember) throw new Error('你还没有加入这个账本')
      if (entry.uid !== uid) throw new Error('只能修改自己的账')
    }
    const operatorNickname = myMember ? myMember.nickname : '我'
    const sets = []
    if (patch.amount !== undefined) sets.push(`amount = ${esc(patch.amount)}`)
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
  async deleteEntry({ entryId }, ctx) {
    const uid = ctx.uid
    const entryRows = await executePGSql(`SELECT * FROM entries WHERE id = ${esc(entryId)} LIMIT 1`)
    const entry = entryRows.length > 0 ? rowToEntry(entryRows[0]) : null
    if (!entry) throw new Error('账目不存在')
    const ledger = await getLedgerDoc(entry.ledgerId)
    if (!ledger) throw new Error('账本不存在')
    // 权限：创建者可删任意账；普通成员必须当前仍是本账本成员，且只能删自己的账（被移除即失权）
    const isOwner = ledger.ownerId === uid
    const myMember = await getMyMember(entry.ledgerId, uid)
    if (!isOwner) {
      if (!myMember) throw new Error('你还没有加入这个账本')
      if (entry.uid !== uid) throw new Error('只能删除自己的账')
    }
    const operatorNickname = myMember ? myMember.nickname : '我'
    // 历史记录保存原始值，便于审计追溯
    const historyEntry = {
      uid, nickname: operatorNickname, at: Date.now(), action: '删除',
      originalAmount: entry.amount, originalCategory: entry.category, originalNote: entry.note,
    }
    const currentHistory = entry.history || []
    currentHistory.push(historyEntry)
    await executePGSql(`
      UPDATE entries SET deleted = true, amount = 0, note = ${esc((entry.note ? entry.note + ' · ' : '') + '【已删除】')}, updated_at = NOW(), history = ${esc(JSON.stringify(currentHistory))}
      WHERE id = ${esc(entryId)}
    `)
  },
  // —— 改账本名（仅创建者） ——
  async renameLedger({ ledgerId, newName }, ctx) {
    const uid = ctx.uid
    await assertOwner(ledgerId, uid)
    validateLen(newName, 30, '账本名')
    const name = (newName || '').trim()
    if (!name) throw new Error('账本名不能为空')
    await executePGSql(`UPDATE ledgers SET name = ${esc(name)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    return await getLedgerDoc(ledgerId)
  },
  // —— 移除成员（仅创建者，其账目软删除保留历史） ——
  async removeMember({ ledgerId, memberId }, ctx) {
    const uid = ctx.uid
    await assertOwner(ledgerId, uid)
    const memberRows = await executePGSql(`SELECT * FROM members WHERE id = ${esc(memberId)} LIMIT 1`)
    const member = memberRows.length > 0 ? rowToMember(memberRows[0]) : null
    if (!member) throw new Error('成员不存在')
    if (member.uid === uid) throw new Error('不能移除自己')
    await executePGSql(`DELETE FROM members WHERE id = ${esc(memberId)}`)
    // 该成员的账目软删除（保留历史、统计与列表不再显示，避免归属混乱）
    await executePGSql(`
      UPDATE entries SET deleted = true, note = COALESCE(note, '') || ' · 【成员已移除】', updated_at = NOW()
      WHERE ledger_id = ${esc(ledgerId)} AND uid = ${esc(member.uid)} AND deleted = false
    `)
  },
  // —— 修改自己在本账本中的昵称 ——
  async updateNickname({ ledgerId, nickname }, ctx) {
    const uid = ctx.uid
    validateLen(nickname, 20, '昵称')
    const name = (nickname || '').trim()
    if (!name) throw new Error('昵称不能为空')
    const myMember = await getMyMember(ledgerId, uid)
    if (!myMember) throw new Error('你还没有加入这个账本')
    await executePGSql(`UPDATE members SET name = ${esc(name)} WHERE id = ${esc(myMember.id)}`)
    const rows = await executePGSql(`SELECT * FROM members WHERE id = ${esc(myMember.id)} LIMIT 1`)
    return rowToMember(rows[0])
  },
  // —— 删除账本（仅创建者，级联删除账目与成员） ——
  async deleteLedger({ ledgerId }, ctx) {
    const uid = ctx.uid
    await assertOwner(ledgerId, uid)
    await executePGSql(`DELETE FROM entries WHERE ledger_id = ${esc(ledgerId)}`)
    await executePGSql(`DELETE FROM members WHERE ledger_id = ${esc(ledgerId)}`)
    await executePGSql(`DELETE FROM ledgers WHERE id = ${esc(ledgerId)}`)
    return { ok: true }
  },
  // —— 重新生成邀请码（仅创建者） ——
  async regenerateInviteCode({ ledgerId }, ctx) {
    const uid = ctx.uid
    await assertOwner(ledgerId, uid)
    const newCode = genInviteCode()
    await executePGSql(`UPDATE ledgers SET invite_code = ${esc(newCode)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    const ledger = await getLedgerDoc(ledgerId)
    return { ledger }
  },
  // —— 更新分类（仅创建者） ——
  async updateCategories({ ledgerId, categories }, ctx) {
    const uid = ctx.uid
    await assertOwner(ledgerId, uid)
    const cats = Array.isArray(categories) && categories.length > 0 ? categories : null
    await executePGSql(`UPDATE ledgers SET categories = ${esc(cats ? JSON.stringify(cats) : null)}, updated_at = NOW() WHERE id = ${esc(ledgerId)}`)
    return await getLedgerDoc(ledgerId)
  },
  // —— 初始化/修复数据库表结构（幂等，可反复执行） ——
  async initSchema() {
    const statements = [
      // uuid 主键依赖（PG13+ 内置，低版本需 pgcrypto 扩展）
      `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
      // 账本表：主键 uuid，由数据库 gen_random_uuid() 生成（与线上一致）
      `CREATE TABLE IF NOT EXISTS ledgers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL DEFAULT '我的账本',
        owner_id text NOT NULL,
        invite_code text NOT NULL,
        categories jsonb,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`,
      // 成员表：ledger_id 为账本 uuid 的文本（varchar）
      `CREATE TABLE IF NOT EXISTS members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id text NOT NULL,
        uid text NOT NULL,
        name text NOT NULL,
        role text DEFAULT 'member',
        joined_at timestamptz DEFAULT now()
      )`,
      // 账目表：member_id/ledger_id 均为文本 uuid；含软删除 deleted、历史 history
      `CREATE TABLE IF NOT EXISTS entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id text NOT NULL,
        member_id text,
        uid text NOT NULL,
        text text NOT NULL,
        amount numeric(12,2) NOT NULL DEFAULT 0,
        category text DEFAULT '其他',
        description text DEFAULT '',
        note text,
        entry_date date DEFAULT CURRENT_DATE,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        history jsonb DEFAULT '[]'::jsonb,
        deleted boolean DEFAULT false
      )`,
      // 幂等补齐早期表可能缺失的列
      `ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS categories jsonb`,
      `ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`,
      `ALTER TABLE members ADD COLUMN IF NOT EXISTS role text DEFAULT 'member'`,
      `ALTER TABLE members ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now()`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS uid text`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS note text`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS entry_date date DEFAULT CURRENT_DATE`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS history jsonb DEFAULT '[]'::jsonb`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS category text DEFAULT '其他'`,
      `ALTER TABLE entries ADD COLUMN IF NOT EXISTS description text DEFAULT ''`,
    ]
    const results = []
    for (const sql of statements) {
      try {
        await executePGSql(sql)
        results.push({ sql: sql.slice(0, 50), ok: true })
      } catch (e) {
        results.push({ sql: sql.slice(0, 50), ok: false, error: e.message })
      }
    }
    // 返回当前 entries 表结构，便于确认补列结果
    const cols = await executePGSql(
      `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'entries' ORDER BY ordinal_position`
    )
    return { results, entriesColumns: cols }
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
  const { action, ...params } = event || {}
  const handler = handlers[action]
  if (!handler) {
    return { success: false, error: `未知 action: ${action}` }
  }
  try {
    // 安全：用 accessToken 经 CloudBase 网关验证身份，取真实 uid（前端 _uid 不信任）
    const uid = await getUid(event)
    const ctx = { uid }
    const data = await handler(params, ctx)
    return { success: true, data }
  } catch (e) {
    console.error(`[ledgerApi:${action}]`, e)
    return { success: false, error: e.message || '操作失败' }
  }
}
