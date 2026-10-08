// Context fill as of the latest response: `tokens`/`percent` absent before the first one, when
// `estimate` holds /context's local count instead. `compactAt` is the total at which auto-compaction
// runs, absent while it is off or unknown; `model` the main loop's model when the window was read.
export type OverheadCtx = { tokens?: number; window: number; percent?: number; estimate?: number; compactAt?: number; model?: string }
// One compaction of the main conversation: its size before and after, as far as Claude Code recorded them.
export type OverheadCompaction = { before?: number; after?: number }
export type OverheadLimit = { kind: string; percentUsed: number; resetsAt?: string }
// Native theme names that cannot use the custom palette keep Claude Code's semantic colors.
export type OverheadTheme = 'dark' | 'light' | 'native'
// The main conversation's last request: when it started, and whether it touched the cache.
export type OverheadCache = { at: number; warm: boolean }
export type OverheadEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number
// The main conversation's requests since it started: input tokens neither read from nor written to the cache,
// read from it and written to it; generated output; the last request's input total; and the last request that rewrote the cache
// instead of reading it, kept until a later turn reads again.
export type OverheadCacheStats = { input: number; output: number; read: number; write: number; last: number; rewrite?: { tokens: number; turnId: string } }
// One subagent's observed requests: the latest responding model, optional requested effort, the last eight
// changed input totals, and cumulative input (including cache), output and cache-read tokens. Not a ledger
// of requests before observation or after eviction from the bounded list.
export type OverheadAgent = {
  id: string
  model: string
  effort?: OverheadEffort
  totals: number[]
  usage: { input: number; output: number; read: number }
  label?: string
  // Native short task description, never the spawn prompt or transcript.
  description?: string
}
// /context's local breakdown, kept for the pane: whether auto-compaction is on, the rows that occupy the
// window, the deferred tool schemas outside it, and the loaded MCP tool schemas by server. No paths or names
// of files are kept.
export type OverheadBreakdown = {
  autoCompact: boolean
  rows: { name: string; tokens: number }[]
  deferred: number
  mcp: { server: string; tokens: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'ccoverhead': {
      ctx: OverheadCtx | null
      history: number[]
      // The conversation's context totals since its last compaction, for the pane.
      timeline: number[]
      // The conversation's last compactions, the latest last.
      compactions: OverheadCompaction[]
      limits: OverheadLimit[]
      limitsLive: boolean
      cache: OverheadCache | null
      cacheStats: OverheadCacheStats
      // The prompt cache's lifetime in ms as the session showed it (a switch, a resume, the request traffic); null until then.
      cacheTtl: number | null
      cost: number | null
      turnCostBase: number | null
      turnCost: number | null
      // null until the host's `theme` row has been read; drawn as native colors meanwhile.
      theme: OverheadTheme | null
      sessionId: string | null
      limitsAt: number | null
      activeAgents: number
      // The main loop's model, as /model shows it: picks a model's own weekly window when one is reported.
      model: string | null
      effort: OverheadEffort | null
      agents: OverheadAgent[]
      breakdown: OverheadBreakdown | null
    }
  }
}
