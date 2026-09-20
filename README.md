# 一起记账 · 微信小程序（Taro 迁移版）

> **本分支为微信小程序版本**。`main` 分支保留原始 H5（React + Vite + PostgreSQL）版本。

多人共享记账小程序——说一句话就把账记了，自动识别金额和分类，支持多人协作、邀请码加入、消费统计。

技术栈：**Taro 4（React 18 + TypeScript）+ 微信云开发（文档型数据库）**。

## 分支说明

| 分支 | 版本 | 说明 |
|------|------|------|
| `main` | H5 网页版 | 原始 React + Vite + CloudBase PostgreSQL 版本 |
| `wechat-miniprogram` | **微信小程序版（本分支）** | Taro 迁移，参赛版本，接入微信云开发文档型数据库 |

## 目录结构

```
ji-zhang-taro/
├── src/
│   ├── app.tsx / app.config.ts / app.css   # 入口、页面注册、全局样式
│   ├── pages/index/                        # 唯一页面（App 内做视图切换）
│   ├── components/                         # 全部 UI 组件
│   ├── services/
│   │   ├── env.ts     # 运行模式判断
│   │   ├── api.ts     # 数据层统一接口
│   │   ├── cloud.ts   # 微信云开发实现（Taro.cloud.callFunction）
│   │   └── auth.ts    # openid 一键身份
│   ├── store/useLedger.ts                  # 账本状态管理
│   ├── parser/                             # 一句话记账解析引擎（规则 + AI）
│   └── share.ts                            # 分享卡片内容
├── cloudfunctions/ledgerApi/               # 云函数（文档型数据库版）
│   ├── index.js                            # 14 个 action，权限服务端校验
│   └── package.json                        # wx-server-sdk 依赖
├── project.config.json                     # 微信开发者工具项目配置
└── .env.example                            # 环境变量示例
```

## 相比 H5 版的适配

| H5 版 | 小程序版 | 说明 |
|-------|---------|------|
| 邮箱+验证码登录 | openid 一键身份 | 云函数识别 `event.userInfo.openId` → `wx_<openid>` |
| CloudBase JS SDK | `Taro.cloud.callFunction` | 平台自动注入身份 |
| 邀请链接 | 小程序分享卡片 | 路径带 `?join=&code=` 自动加入 |
| PostgreSQL | 微信云开发文档型数据库 | ledgers / members / entries 三个集合 |
| 浏览器 API | Taro API | showModal / setClipboardData / getStorageSync 等 |

## 本地运行

1. `npm install`
2. 复制 `.env.example` 为 `.env`，填入云开发环境 ID
3. `npm run build:weapp`（产物在 `dist/`）
4. 微信开发者工具导入项目根目录

## 云端部署

1. 在微信开发者工具开通云开发，创建环境
2. 在「数据库」中创建三个集合：`ledgers`、`members`、`entries`（权限设为"所有用户不可读写"）
3. 右键 `cloudfunctions/ledgerApi` →「上传并部署：云端安装依赖」
4. 云函数测试面板调用 `{"action":"testDb"}` 验证连通

## 版本历史

- **v3.0（tag: v3）**：接入微信云开发 AI——AI 财务对话助手（混元 hunyuan-exp）、语音输入按钮（同声传译插件，需企业主体，当前个人主体暂用键盘语音）
- **v2.0（wechat-miniprogram 分支）**：Taro 迁移为微信小程序，云开发文档型数据库，参赛版本
- **v1.0（main 分支）**：原始 H5 网页版，React + Vite + CloudBase PostgreSQL
