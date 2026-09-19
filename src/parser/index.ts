import type { ParsedEntry } from '../types'
import { parseByLocalFallback, parseByRules } from './rules'

export function parseEntryText(text: string): ParsedEntry | null {
  const rule = parseByRules(text)
  if (rule) return rule
  const local = parseByLocalFallback(text)
  if (local) return local
  return null
}
