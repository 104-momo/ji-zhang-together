# AGENTS.md — 一起记账 Taro 小程序版

## 项目定位
多人共享记账微信小程序，参加 2026 微信小程序开发大赛。Taro 4 迁移自 H5 版。

## 怎么跑
```bash
npm install
npm run build:weapp   # 产物在 dist/
```
微信开发者工具导入项目根目录，AppID `wx05a49c442243ddbb`。

## 技术栈
Taro 4.2 + React 18 + TypeScript + 微信云开发（文档型数据库，环境 `cloudbase-d8gqnbpr077aca008`）。

## 关键约定
- 云函数 `cloudfunctions/ledgerApi/index.js`：14 个 action，前端传 uid 一律不信任，openId → `wx_<openid>`。
- 数据库三个集合：`ledgers`、`members`、`entries`，权限"所有用户不可读写"。
- AI 对话：前端直接调 `wx.cloud.extend.AI.createModel('hunyuan-exp')`，不走云函数。
- 语音输入：同声传译插件（`wx069ba97219f66d99`），**仅企业主体可用**，个人主体当前用键盘语音替代。
- 不要主动推 GitHub，等用户说再推。版本 tag 由用户确认后打。

## 当前状态
- P0/P1/P2 完成（基础功能 + 云端部署联调）
- P3 方向1+2 代码已完成并打 tag v3，待本地测试验证
- P3 方向3+4（主动洞察提醒 + 微信生态深度绑定）未开始
- P4 提审上线：10/1-10/17，红线 10/7 前必须提审
