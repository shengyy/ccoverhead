// Pure updates of the plugin's recorded figures: the context totals, the cache's running counts and each
// subagent's context. The event hooks in register.tsx apply them to `$.state`.
import type { OverheadAgent, OverheadCacheStats } from '../types'
import { HISTORY } from './format'

// Totals kept for the pane's growth chart, compactions included.
export const TIMELINE = 48
// Subagents kept, the most recently active last.
export const AGENTS = 8

// A new total: append when it changed, restart on a drop (compaction), keep the last HISTORY.
export function addSample(history: number[], tokens: number): number[] {
  const last = history.at(-1)
  if (last === tokens) return history
  if (last !== undefined && tokens < last) return [tokens]
  return [...history, tokens].slice(-HISTORY)
}

// The same for the pane, which keeps the drops: a total lower than the one before marks a compaction.
export function addTimeline(timeline: number[], tokens: number): number[] {
  if (timeline.at(-1) === tokens) return timeline
  return [...timeline, tokens].slice(-TIMELINE)
}

export type StepUsage = { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const NO_CACHE_STATS: OverheadCacheStats = { input: 0, read: 0, write: 0, last: 0 }

// One main-conversation request added to the running counts. It rewrote the cache when it read back less than
// half of what the request before it sent (the cache had lapsed, the model changed, the prefix changed); a
// large new tool result is written beside a full read and does not count. The mark stays until a request of
// a later turn reads again.
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
  else if (stats.rewrite && stats.rewrite.turnId === turnId) next.rewrite = stats.rewrite
  return next
}

// The counts without the rewrite mark.
export function clearRewrite(stats: OverheadCacheStats): OverheadCacheStats {
  const { rewrite: _, ...rest } = stats
  return rest
}

// The share of the main conversation's input the cache served, 0 to 100; undefined before any input.
export function hitRate(stats: OverheadCacheStats): number | undefined {
  const all = stats.input + stats.read + stats.write
  return all > 0 ? (stats.read * 100) / all : undefined
}

// A subagent's request: its input total (uncached, read and written together) appended to that agent's,
// the agent moved to the end as the most recently active, the oldest dropped past AGENTS.
export function addAgentStep(agents: OverheadAgent[], id: string, model: string, u: StepUsage, label?: string): OverheadAgent[] {
  const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  const before = agents.find(a => a.id === id)
  const agent: OverheadAgent = {
    id,
    model,
    totals: [...(before?.totals ?? []), total].slice(-HISTORY),
    ...((label ?? before?.label) !== undefined && { label: label ?? before?.label }),
  }
  return [...agents.filter(a => a.id !== id), agent].slice(-AGENTS)
}

// A model id without the window suffix /model may add (`claude-opus-5-5[1m]`).
export function baseModel(id: string | null | undefined): string {
  return (id ?? '').replace(/\[[^\]]*\]$/, '')
}
