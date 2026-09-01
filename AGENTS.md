# AGENTS.md

## 项目定位
「一起记账」——双人/多人共享记账 H5：一句话自然语言记账（自动解析金额/分类），支持创建账本、邀请成员、2s 轮询实时同步、分类统计、按人筛选。部署于腾讯云 CloudBase，PostgreSQL 存储，目标产品化上架 App Store。

## 怎么跑起来
```bash
npm install
npm run dev        # 本地开发 http://localhost:5173
npm run build      # 类型检查 + 构建到 dist/
npm run lint       # oxlint
```
- 配 `VITE_CLOUDBASE_ENV`（`.env`）走云端共享；不配走本地 mock（`src/services/mock.ts`，仅本地）。
- 部署前端：`npm run build && printf 'n\n' | ./node_modules/.bin/tcb hosting deploy dist`
- 部署云函数：`./node_modules/.bin/tcb fn deploy ledgerApi --force`
- tcb CLI 用账号级 SecretId/SecretKey 登录（`~/.config/.cloudbase/auth.json`），免反复 device 授权；CloudBase 环境 API Key 权限不足，不能用于 fn deploy。

## 技术栈
- 前端 React 19 + TypeScript + Vite；后端单个云函数 `cloudbase/functions/ledgerApi/index.js`（Node.js）。
- DB：CloudBase PostgreSQL，云函数内用 SCF 临时密钥经 `tcb.tencentcloudapi.com` ExecutePGSql 访问，前端不直连。
- 认证：CloudBase 邮箱验证码注册 + 密码登录（**无匿名、无演示模式**）。

## 身份与安全模型（重点，勿回退）
- Web SDK 调云函数**不注入** event.userInfo，因此前端登录后用 `auth.getAccessToken()` 取 accessToken 随每次调用传入（见 `src/services/cloudbase.ts` call()）。
- 云函数 `getUid` 为 async：带 10min 内存缓存地调 `https://{env}.api.tcloudbasegateway.com/auth/v1/user/me`（Bearer token）校验，取 sub/user_id 为 uid；**前端传的任何 uid/_uid 一律不信任**，无 token→“请先登录”，伪造 token→“登录态无效”。
- 越权防护：getLedger/getLedgersByIds/listMembers/listEntries 等读接口都经 `assertMember(ledgerId,uid)`；写操作经 assertOwner/成员校验。amount 等入参经 esc() 转义，禁止把数值直接拼进 SQL。
- 邀请码用 crypto.randomBytes（CSPRNG）；输入经 validateLen 限长；软删除保留原值并写 history。

## 目录与约定
- `src/components/` UI；`src/parser/` 一句话解析；`src/services/`（api.ts 统一接口，cloudbase.ts 云端 / mock.ts 本地，auth.ts 认证，cloudbase-app.ts 单例）；`src/store/useLedger.ts` 状态 + 2s 轮询 + 乐观更新。
- 云函数 action 全集：createLedger/joinLedger/getLedger/getLedgersByIds/listLedgersByUid/listMembers/listEntries/addEntry/updateEntry/deleteEntry/renameLedger/removeMember/updateNickname/regenerateInviteCode/updateCategories/deleteLedger/initSchema/testDb。
- **真实表结构（uuid，权威，initSchema 已对齐，勿再写 bigint/BIGSERIAL）**：三表主键均 `uuid default gen_random_uuid()`；`members.ledger_id`、`entries.ledger_id/member_id` 均为 text（存账本 uuid 字符串）。JOIN 用 `l.id::text = m.ledger_id`。entries 含 deleted(bool)/history(jsonb)/updated_at。
- 前端权限口径：canModify 用 memberId 判本人，isOwnerOf 兼容 ownerId=uid（云端）/member.id（mock）。

## 当前状态与下一步
- 线上：`https://jizhang-together-d9es2tka134439b-1469737219.tcloudbaseapp.com`（环境 `jizhang-together-d9es2tka134439b`，region ap-shanghai，PG 实例 `pgdb-8y9ip4mt`）。测试域名访问需先过风险提示页。
- 对抗式审查 11 项漏洞已全部修复并部署；已验证：登录→账本列表(listLedgersByUid)→getLedger/listMembers/listEntries、无 token/伪造 token 被拒、initSchema 在现网幂等。
- GitHub：`104-momo/ji-zhang-together`（main；本地非 git 仓库，用 `gh api` PUT contents 推送）。
- 待办：真机回归记账/编辑/删除/邀请全链路与第二个账号越权实测；接入 Apple 登录满足 App Store；绑定正式域名替换测试域名；addEntry 云端耗时优化（当前靠乐观更新兜底）。
