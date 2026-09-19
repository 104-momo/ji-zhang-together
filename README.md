# 一起记账 · 微信小程序（Taro 迁移版）

> **本分支为微信小程序版本**。`main` 分支保留原始 H5（React + Vite + PostgreSQL）版本。

多人共享记账小程序——说一句话就把账记了，自动识别金额和分类，支持多人协作、邀请码加入、消费统计。

技术栈：**Taro 4（React 18 + TypeScript）+ 微信云开发（文档型数据库）**。

## 分支说明

| 分支 | 版本 | 说明 |
|------|------|------|
| `main` | H5 网页版 | 原始 React + Vite + CloudBase PostgreSQL 版本 |
| `wechat-miniprogram` | **微信小程序版（本分支）** | Taro 迁移，参赛版本，接入微信云开发文档型数据库 |

## 云端部署

1. 在微信开发者工具开通云开发，创建环境
2. 在「数据库」中创建三个集合：`ledgers`、`members`、`entries`（权限设为"所有用户不可读写"）
3. 右键 `cloudfunctions/ledgerApi` →「上传并部署：云端安装依赖」
4. 云函数测试面板调用 `{"action":"testDb"}` 验证连通

## 版本历史

- **v2.0（wechat-miniprogram 分支）**：Taro 迁移为微信小程序，云开发文档型数据库，参赛版本
- **v1.0（main 分支）**：原始 H5 网页版，React + Vite + CloudBase PostgreSQL
