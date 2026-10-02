# 一起记账吖 · 微信小程序

> **本分支（wechat-miniprogram）为微信小程序版本**。`main` 分支保留原始 H5（React + Vite + PostgreSQL）版本。

多人共享记账小程序——说一句话就把账记了，自动识别金额和分类，支持多人协作、口令邀请加入、分类/成员统计、月度与分类预算、搜索、日历、月度/年度 AI 报告与每日记账提醒。

技术栈：**Taro 4（React 18 + TypeScript）+ 微信云开发（wx-server-sdk 文档型数据库）**。

## 本地运行

```bash
npm install
npm run dev:weapp     # 或 npm run build:weapp
```

用微信开发者工具导入项目根目录，填入自己的小程序 AppID，并在 `.env` 中配置云环境 ID（参考 `.env.example`）：

```
TARO_APP_CLOUDBASE_ENV=your-cloud-env-id
```

## 云端部署

1. 在微信开发者工具开通云开发，创建环境，并把环境 ID 填入 `.env` 与 `cloudbaserc.json`
2. 在「数据库」中创建四个集合：`ledgers`、`members`、`entries`、`subscriptions`，权限均设为「所有用户不可读写」
3. 右键 `cloudfunctions/ledgerApi` →「上传并部署：云端安装依赖（不上传 node_modules）」
4. （可选）云函数环境变量配置 `ZHIPU_API_KEY`（一句话解析大模型兜底）、`REMINDER_TMPL_ID`（每日提醒订阅消息模板）
5. 云函数测试面板调用 `{"action":"whoami"}` 验证连通与登录态

## 分支说明

| 分支 | 版本 | 说明 |
|------|------|------|
| `main` | H5 网页版 | 原始 React + Vite + CloudBase PostgreSQL 版本 |
| `wechat-miniprogram` | **微信小程序版（本分支）** | Taro 迁移，接入微信云开发文档型数据库，微信免登 |

## 版本历史

- **v4（wechat-miniprogram 分支）**：月度预算与分类预算（进度/超支提醒）、流水搜索、记账日历、月度/年度 AI 报告、每日记账订阅提醒、统计时间维度（今天/本月/上月/今年/全部）、成员维度统计、口令邀请、真机适配与多轮安全加固
- **v3（wechat-miniprogram 分支）**：小程序迭代版——口令邀请路线、云函数对抗式安全修复、统计增强
- **v2.0（wechat-miniprogram 分支）**：Taro 迁移为微信小程序，云开发文档型数据库，微信免登
- **v1.0（main 分支）**：原始 H5 网页版，React + Vite + CloudBase PostgreSQL
