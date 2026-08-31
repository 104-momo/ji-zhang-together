import type { ParsedEntry } from '../types'
import { parseByLocalFallback, parseByRules } from './rules'
/**
 * 两级解析引擎入口
 *
 * 本地阶段（前端 / 本地 mock）：
 *   规则解析 → 不中则本地兜底（尽量抠数字），不调外网
 *
 * 云端阶段（CloudBase 云函数 addEntry 内）：
 *   规则解析 → 不中则调用智谱 GLM flash 兜底（见 cloudfunctions/addEntry/index.js）
 *
 * 前端只依赖本文件；GLM 调用永远不暴露在前端。
 */
export function parseEntryText(text: string): ParsedEntry | null {
  const rule = parseByRules(text)
  if (rule) return rule
  const local = parseByLocalFallback(text)
  if (local) return local
  return null
}
