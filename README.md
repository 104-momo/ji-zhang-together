# 一起记账（ji-zhang-together）

多人共享记账 Web 应用：**说一句话就能记账**，自动解析金额与分类；支持创建/邀请成员共享同一账本、实时同步、分类统计。

## 功能特性

- 🗣️ 一句话自然语言记账：输入「吃烤鱼200元」→ 自动识别金额 200、分类「餐饮」
- 👥 多人共享：创建账本 → 生成邀请链接 → 成员加入后共同记账
- 📊 分类统计：按餐饮/交通/购物等分类汇总支出（小按钮按需展开，可按人筛选）
- 📱 移动端友好：H5 响应式，可添加到手机桌面当 App 用
- 📧 邮箱注册登录：真实邮箱验证码验证（无匿名登录、无演示模式）

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 后端：腾讯云 CloudBase 云函数（Node.js，单函数 ledgerApi）
- 数据库：腾讯云 CloudBase PostgreSQL（uuid 主键）
- 认证：CloudBase 邮箱验证码注册 + 密码登录（无匿名）

## 本地开发

```bash
npm install
npm run dev        # 本地开发，http://localhost:5173
```

配置 `VITE_CLOUDBASE_ENV`（见 `.env.example`）走云端共享模式；不配置时走**本地 mock 开发模式**（localStorage 模拟数据，仅用于本地跑通，线上不启用）。

## 构建与部署

```bash
npm run build      # 打包到 dist/
# 部署前端静态托管
tcb hosting deploy dist -e <环境ID>
# 部署云函数
tcb fn deploy ledgerApi -e <环境ID> --force
```

详细部署步骤见 `DEPLOY.md`。表结构由云函数 `initSchema` 幂等建立（uuid 主键），无需手工建表。

## 项目结构

```
src/
  components/   界面组件（首页、账本页、输入框、分类统计、登录页等）
  parser/       一句话记账的自然语言解析（金额 + 分类）
  services/     CloudBase 初始化、云函数调用、认证、数据轮询同步
  store/        前端状态（useLedger）
cloudbase/functions/ledgerApi/   云函数后端（PostgreSQL 读写、鉴权）
```

## 数据同步方案

数据存于 PostgreSQL，前端无法直连，统一通过云函数访问；前端每 2 秒轮询 `listMembers` / `listEntries` 拉取对方更新（见 `src/services/cloudbase.ts` 与 `src/store/useLedger.ts`）。本方记账走乐观更新，点发送立即出气泡，云端确认后回填。

## 安全与权限

- 每次云函数调用都携带登录 accessToken，由云函数向 CloudBase 网关校验换取真实 uid，前端不传、也无法伪造身份。
- 所有读接口校验「是否为本账本成员」，写接口校验成员/创建者身份，防止越权读写他人账本。
- 账本仅邀请成员可见；创建者可重新生成邀请码使旧链接失效；成员只能改删自己的账目，创建者可管理全部。
- 数据库主键为 uuid，输入做长度限制与 SQL 转义；删除为软删除并保留修改历史。

## 说明

本项目为 MVP 版本，私有仓库，仅用于学习与产品验证。
