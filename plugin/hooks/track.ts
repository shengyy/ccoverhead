// Pure updates of the plugin's recorded figures: the context totals, the cache's running counts and each
// subagent's context. The event hooks in register.tsx apply them to `$.state`.
import type { OverheadAgent, OverheadCacheStats, OverheadCompaction, OverheadLimit } from '../types'
import { HISTORY } from './format'

// Totals kept for the pane's growth chart.
export const TIMELINE = 48
// Compactions kept for the pane.
export const COMPACTIONS = 3
// Subagents kept, the most recently active last.
export const AGENTS = 8

// A new total: append when it changed, restart on a drop (compaction), keep the last `keep` (HISTORY for the
// band, TIMELINE for the pane).
export function addSample(history: number[], tokens: number, keep = HISTORY): number[] {
  const last = history.at(-1)
  if (last === tokens) return history
  if (last !== undefined && tokens < last) return [tokens]
  return [...history, tokens].slice(-keep)
}

// A compaction appended to the last few.
export function addCompaction(list: OverheadCompaction[], c: OverheadCompaction): OverheadCompaction[] {
  return [...list, c].slice(-COMPACTIONS)
}

export type StepUsage = { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const NO_CACHE_STATS: OverheadCacheStats = { input: 0, read: 0, write: 0, last: 0 }

// One main-conversation request added to the running counts. It rewrote the cache when it read back less than
// half of what the request before it sent (the cache had lapsed, the model changed, the prefix changed); a
// large new tool result is written beside a full read and does not count, nor does the first request after a
// compaction (`last` 0, see `compacted`). The mark stays until a request of a later turn reads the cache.
export function addStep(stats: OverheadCacheStats, u: StepUsage, turnId: string): OverheadCacheStats {
  const input = u.input_tokens ?? 0
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const next: OverheadCacheStats = {
    input: stats.input + input,
    read: stats.read + read,
    write: stats.write + write,
    last: input + read + write,
  }
  if (stats.last > 0 && write > 0 && read * 2 < stats.last) next.rewrite = { tokens: write, turnId }
  else if (stats.rewrite && (stats.rewrite.turnId === turnId || read === 0)) next.rewrite = stats.rewrite
  return next
}

// The counts without the rewrite mark.
export function clearRewrite(stats: OverheadCacheStats): OverheadCacheStats {
  const { rewrite: _, ...rest } = stats
  return rest
}

// The counts after a compaction, before its first request: no rewrite mark, and no previous request to read
// back, since the next one writes a new conversation rather than finding a lapsed cache.
export function compacted(stats: OverheadCacheStats): OverheadCacheStats {
  return { ...clearRewrite(stats), last: 0 }
}

// The share of the main conversation's input the cache served, 0 to 100; undefined before any input.
export function hitRate(stats: OverheadCacheStats): number | undefined {
  const all = stats.input + stats.read + stats.write
  return all > 0 ? (stats.read * 100) / all : undefined
}

// A subagent's request: its input total (uncached, read and written together) added to that agent's totals
// as the main context's are (`addSample`), the agent moved to the end as the most recently active, the oldest
// dropped past AGENTS.
export function addAgentStep(agents: OverheadAgent[], id: string, model: string, u: StepUsage, label?: string): OverheadAgent[] {
  const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  const before = agents.find(a => a.id === id)
  const type = label ?? before?.label
  const agent: OverheadAgent = { id, model, totals: addSample(before?.totals ?? [], total), ...(type !== undefined && { label: type }) }
  return [...agents.filter(a => a.id !== id), agent].slice(-AGENTS)
}

// A model id without the window suffix /model may add (`claude-opus-5-5[1m]`).
export function baseModel(id: string | null | undefined): string {
  return (id ?? '').replace(/\[[^\]]*\]$/, '')
}

// The window-average forecast used by WeekToken: used / elapsed is the pace.
// No history or price table. An old reading or a window just opened has no useful forecast.
export function quotaForecast(limit: OverheadLimit, observedAt: number | null | undefined, now: number): number | undefined {
  const window = limit.kind === 'five_hour' ? 5 * 3_600_000
    : limit.kind === 'seven_day' || limit.kind.startsWith('seven_day_') || limit.kind.includes('weekly') ? 7 * 86_400_000 : undefined
  if (!window || !limit.resetsAt || observedAt == null || observedAt > now || now - observedAt > Math.max(15 * 60_000, window * 0.05)) return undefined
  const reset = Date.parse(limit.resetsAt)
  const elapsed = window - (reset - now)
  const used = limit.percentUsed / 100
  if (!Number.isFinite(reset) || elapsed <= Math.max(300_000, window * 0.001) || elapsed >= window || !Number.isFinite(used) || used <= 0 || used >= 1) return undefined
  return now + elapsed * (1 - used) / used
}
