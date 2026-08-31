# AGENTS.md

## 项目定位
「一起记账」——双人共享记账 H5 应用：一句话自然语言记账（自动解析金额/分类），支持创建账本、邀请成员、实时同步、分类统计。部署于腾讯云 CloudBase，PostgreSQL 存储。

## 怎么跑起来
```bash
npm install
npm run dev        # 本地开发（http://localhost:5173）
npm run build      # 构建到 dist/
```
- 配置 `VITE_CLOUDBASE_ENV`（`.env`）→ 云端共享模式；不配 → 本地 mock 开发模式。
- 部署前端：`npm run build && printf 'n\n' | ./node_modules/.bin/tcb hosting deploy dist`
- 部署云函数：`./node_modules/.bin/tcb fn deploy ledgerApi`（先 `tcb login` 授权）

## 技术栈
- 前端：React 19 + TypeScript + Vite
- 后端：CloudBase 云函数（Node.js，`cloudbase/functions/ledgerApi/index.js`）
- 数据库：CloudBase PostgreSQL（云函数内 `tcb.ExecutePGSql` API 访问，前端不可直连；SCF 环境变量注入临时密钥）
- 认证：CloudBase 邮箱验证码注册 + 密码登录（**无匿名**）

## 目录与约定
- `src/components/` UI 组件；`src/parser/` 一句话记账解析；`src/services/` 数据层（`api.ts` 统一接口，`mock.ts` 本地 / `cloudbase.ts` 云端）；`src/store/useLedger.ts` 前端状态（**2s 轮询**同步）
- 云函数 action 全集见 `ledgerApi/index.js` 头部；表结构由 `initSchema` 幂等补齐（entries 含 deleted/history/updated_at）
- 关键陷阱：`ledgers.id`=uuid、`members.ledger_id`=varchar，JOIN 需 `l.id::text = m.ledger_id`
- 认证 `_uid` 由前端传入（可伪造），代码已注释"后续优化：验证 accessToken"

## 当前状态与下一步
- 线上：`https://jizhang-together-d9es2tka134439b-1469737219.tcloudbaseapp.com`（环境 `jizhang-together-d9es2tka134439b`，PG 实例 `pgdb-8y9ip4mt`）
- GitHub：`104-momo/ji-zhang-together`（main 分支；**本地非 git 仓库**，靠 `gh api` 推送）
- 已知技术债：云函数 getUid 未验证 accessToken；addEntry 端到端 ~4.5s，靠前端乐观更新兜底
- 下一步（产品化）：接入 Apple 登录满足 App Store 审核；替换测试域名
