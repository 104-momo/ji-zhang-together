import type { LedgerAPI } from './api'
import { mockAPI } from './mock'
import { cloudAPI } from './cloud'
import { CLOUD_ENV } from './env'

/**
 * 数据层自动切换：
 * - 配置了 TARO_APP_CLOUDBASE_ENV（CloudBase 环境 ID）→ 走云端真实共享
 * - 未配置 → 走本地 mock（小程序缓存 + 事件订阅模拟实时），单人演示用
 */
export const api: LedgerAPI = CLOUD_ENV ? cloudAPI : mockAPI

/** 当前是否运行在云端模式 */
export const isCloudMode = !!CLOUD_ENV
