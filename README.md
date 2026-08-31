# 一起记账（ji-zhang-together）

多人共享记账 Web 应用：**说一句话就能记账**，自动解析金额与分类；支持创建/邀请成员共享同一账本、实时同步、分类统计。

## 功能特性

- 🗣️ 一句话自然语言记账：输入「吃烤鱼200元」→ 自动识别金额 200、分类「餐饮」
- 👥 多人共享：创建账本 → 生成邀请链接 → 成员加入后共同记账
- 📊 分类统计：按餐饮/交通/购物等分类汇总月度支出（可折叠）
- 📱 移动端友好：H5 响应式，可添加到手机桌面当 App 用
- 📧 邮箱注册登录：真实邮箱验证码验证

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 后端：腾讯云 CloudBase 云函数（Node.js）
- 数据库：腾讯云 CloudBase PostgreSQL
- 认证：CloudBase 匿名/邮箱登录（SDK 3.x）

## 本地开发

```bash
npm install
npm run dev        # 本地开发，http://localhost:5173
```

不配置环境变量时走本地 mock 单人演示模式；配置 `VITE_CLOUDBASE_ENV` 后切换到云端共享模式（见 `.env.example`）。

## 构建与部署

```bash
npm run build      # 打包到 dist/
# 部署前端静态托管
tcb hosting deploy dist -e <环境ID>
# 部署云函数
tcb fn deploy ledgerApi -e <环境ID> --force
```

详细部署步骤见 `DEPLOY.md`。

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

数据存于 PostgreSQL，前端无法直连，统一通过云函数访问；前端每 4 秒轮询 `listMembers` / `listEntries` 实现实时同步（见 `src/services/cloudbase.ts` 与 `src/store/useLedger.ts`）。

## 说明

本项目为 MVP 版本，私有仓库，仅用于学习与产品验证。
