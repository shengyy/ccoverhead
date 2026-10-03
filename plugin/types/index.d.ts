// Context fill as of the latest response: `tokens`/`percent` absent before the first one, when
// `estimate` holds /context's local count instead.
export type OverheadCtx = { tokens?: number; window: number; percent?: number; estimate?: number }
export type OverheadLimit = { kind: string; percentUsed: number; resetsAt?: string }
// The main conversation's last request: when it finished, and whether it touched the cache.
export type OverheadCache = { at: number; warm: boolean }

declare module 'claude-code' {
  interface PluginState {
    'ccoverhead': {
      ctx: OverheadCtx | null
      history: number[]
      limits: OverheadLimit[]
      limitsLive: boolean
      cache: OverheadCache | null
    }
  }
}
