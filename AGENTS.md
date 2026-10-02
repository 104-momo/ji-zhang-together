# AGENTS.md

## 项目定位
「一起记账吖」——双人/多人共享记账**微信小程序**：一句话自然语言记账（端侧规则解析，云函数智谱大模型兜底），支持创建账本、口令邀请成员、2s 轮询实时同步、分类/成员统计、月度与分类预算、搜索、日历、月度/年度 AI 报告、每日记账提醒。自用与好友体验版。

## 怎么跑起来
```bash
npm install
npm run dev:weapp     # watch 构建
npm run build:weapp   # 类型无关编译，产物到 dist/（微信开发者工具导入项目根目录）
```
- 微信开发者工具导入后，appid 填自己的小程序 AppID；开通云开发并创建环境。
- 个人环境配置（**均不入库**，参考 `.env.example`）：
  - `.env`：`TARO_APP_CLOUDBASE_ENV=<云环境ID>`
  - `project.config.json`：`appid`
  - `cloudbaserc.json`：`envId`
- 云函数部署：开发者工具中右键 `cloudfunctions/ledgerApi` →「上传并部署：云端安装依赖（不上传 node_modules）」。
- 数据库集合：`ledgers` / `members` / `entries` / `subscriptions`，权限全部设为「所有用户不可读写」，前端只经云函数访问。
- 校验：`node --check cloudfunctions/ledgerApi/index.js`；`npx tsc --noEmit`（旧 H5 死代码文件有存量错误，见文末）。

## 技术栈
- Taro 4.2.1 + React 18 + TypeScript；designWidth 375，样式按 375 逻辑像素书写。
- 微信云开发 `wx-server-sdk` 文档数据库；单云函数 `cloudfunctions/ledgerApi/index.js`（单函数多 action，Nodejs16.13，超时 10s）。
- 认证：微信免登，无独立账号体系。

## 身份与安全模型（重点，勿回退）
- 云函数 `getUid` 从 `cloud.getWXContext()` 取 openid，uid 形如 `wx_<openid>`，由网关注入、不可伪造；前端不传 uid，无用户态直接拒绝。
- 越权防护：读接口（getLedger/listMembers/listEntries/getLedgerFull 等）经 `assertMember(ledgerId, uid)`；写操作经 `assertOwner` 或成员校验。
- 入参校验：金额必须经 `cleanAmount`（正数、有限、≤1 亿、最多两位小数）；分类命中账本 categories/默认分类白名单；字符串经 `validateLen` 限长。
- 邀请码用 `crypto.randomBytes`（CSPRNG）；未完成微信认证前小程序无转发权限，邀请走「复制口令 → 首页粘贴加入」。
- 定时触发器 `dailyReminder`（每晚 21:00，见 `cloudfunctions/ledgerApi/config.json`）：入口三重判断——`TriggerName==='dailyReminder'` 且 `Message` 为字符串且事件不含 `action` 字段，防止客户端 callFunction 伪造群发。
- 密钥只允许走云函数环境变量：`ZHIPU_API_KEY`（一句话记账解析兜底）、`REMINDER_TMPL_ID`（订阅消息模板），**禁止硬编码进代码**。
- 删除为软删除：entries 保留原文档并写 `history`，不物理删除。

## 目录约定
- `src/pages/index/index.tsx`：单页入口，用 subPage 状态路由各全屏页，取值 `'ledger' | 'stats' | 'search' | 'calendar' | 'report' | 'budget' | 'catBudget'`。
- `src/components/`：LedgerPage（账本主页）、EntryBubble（账目气泡+行内编辑）、StatHeader、CategoryStats，以及 StatsPage/SearchPage/CalendarPage/ReportPage/BudgetPage/CategoryBudgetPage/LedgerManage 等全屏页与卡片。
- `src/services/`：`api.ts` 统一接口；`cloud.ts` 云端实现；`mock.ts` 本地 mock；`useLedger` 状态 + 2s 轮询 + 乐观更新；`env.ts` 读云环境 ID；`aiReport.ts` AI 报告；`reminder.ts` 订阅消息授权；`invite.ts` 邀请口令编解码。
- `src/utils/stats.ts`：统计口径（时间范围、分类/成员聚合、环比、预算使用率等）；`src/parser/`：一句话解析。
- `cloudfunctions/ledgerApi/index.js`：全部后端逻辑与 handlers 分发表。

## 云函数 action 全集
whoami、createLedger、joinLedger、getLedger、listLedgersByUid、listMembers、listEntries、getLedgerFull、addEntry、updateEntry、deleteEntry、renameLedger、removeMember、updateNickname、deleteLedger、regenerateInviteCode、updateCategories、updateBudget、updateCategoryBudgets、getReminderStatus、subscribeReminder、unsubscribeReminder；定时任务内部函数 runDailyReminder。
统一返回 `{ success, data }` / `{ success:false, error }`。

## 数据模型（文档型集合）
- `ledgers`：name、owner_id、invite_code、categories、monthly_budget、category_budgets（分类名→月额度对象）、created_at、updated_at。
- `members`：ledger_id、uid、name、role（owner/member）、joined_at。
- `entries`：ledger_id、member_id、nickname（记账时昵称快照）、text、amount、category、note、created_at、deleted、history。
- `subscriptions`：uid、ledger_id、ledger_name、last_sent_date、last_ok_at/last_fail_at 等（每日提醒幂等用）。

## 小程序端注意事项
- 微信原生 `input` 必须给固定 `height` 与 `line-height`，否则文字会被裁切；placeholder 颜色只认 `placeholderStyle` 属性，不吃 CSS `::placeholder`。
- 个人环境标识（AppID、云环境 ID、`.env`、`project.private.config.json`、`.DS_Store`）已在 `.gitignore`，不得提交。
- `cloudbase/`（旧 H5 云函数）、`src/components/AuthPage.tsx`、`src/main.tsx`、`src/services/cloudbase.ts`、`src/services/cloudbase-app.ts`、`vite.config.ts`、`index.html` 为旧 H5 版残留死代码；删除前，LedgerAPI 接口变更仍需同步 `cloudbase.ts` 的 stub，否则 tsc 报错。
- 正式发布后，runDailyReminder 的 `miniprogramState` 需从 `'trial'` 改为 `'formal'`。
