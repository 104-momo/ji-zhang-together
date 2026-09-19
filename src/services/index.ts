import type { LedgerAPI } from './api'
import { mockAPI } from './mock'
import { cloudAPI } from './cloud'
import { CLOUD_ENV } from './env'

export const api: LedgerAPI = CLOUD_ENV ? cloudAPI : mockAPI
exnexport const isCloudMode = !!CLOUD_ENV
