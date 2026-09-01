import type { LedgerAPI } from './api'
import { mockAPI } from './mock'
import { cloudAPI } from './cloudbase'

/**
 * 数据层自动切换：
 * - 配置了 VITE_CLOUDBASE_ENV（CloudBase 环境 ID）→ 走云端真实共享
 * - 未配置 → 走本地 mock（localStorage + 事件订阅模拟实时），单人演示用
 *
 * 接口签名完全一致，前端组件零感知。
 */
const ENV_ID = (import.meta.env.VITE_CLOUDBASE_ENV as string | undefined) || ''

export const api: LedgerAPI = ENV_ID ? cloudAPI : mockAPI

/** 当前是否运行在云端模式（用于 UI 提示，如"数据已同步到云端"） */
export const isCloudMode = !!ENV_ID
