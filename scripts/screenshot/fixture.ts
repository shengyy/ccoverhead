// Shared fictional figures for README previews and design sheets. Never read a live session here.
import type { BandInput } from '../../plugin/hooks/format'
import { CACHE_TTL_MS } from '../../plugin/hooks/format'
import type { PaneInput } from '../../plugin/hooks/pane'

const NOW = Date.parse('2026-10-04T09:00:00Z')
const MIN = 60_000

export const band: BandInput = {
  now: NOW,
  ctx: { tokens: 271_400, window: 1_000_000, percent: 27, compactAt: 967_000 },
  history: [180_000, 181_200, 186_000, 198_000, 232_000, 236_500, 268_000, 271_400],
  limits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(NOW + 154 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 63, resetsAt: new Date(NOW + (2 * 24 * 60 + 7 * 60) * MIN).toISOString() },
  ],
  limitsLive: true,
  cache: { at: NOW - 22 * MIN, warm: true },
  cacheTtl: CACHE_TTL_MS,
  model: null,
  cost: 1.84,
  turnCost: 0.12,
  activeAgents: 1,
}

export const rewriting: BandInput = { ...band, rewrite: 41_000 }

export const agentView: BandInput = {
  ...band,
  view: {
    agent: {
      id: 'fictional-view',
      label: 'Explore',
      model: 'claude-opus-5-5',
      totals: [58_000, 62_100, 72_200, 98_000, 111_400, 124_000],
      usage: { input: 525_700, output: 8_400, read: 390_000 },
    },
    window: band.ctx!.window,
  },
}

// The pane over the same session: one compaction behind it, two MCP servers and one subagent.
export const pane: PaneInput = {
  ...band,
  model: 'claude-opus-5-5',
  effort: 'high',
  sessionId: '00000000-0000-4000-8000-000000000001',
  limitsAt: NOW,
  timeline: [61_000, 92_000, 140_000, 180_000, 181_200, 186_000, 198_000, 232_000, 236_500, 268_000, 271_400],
  compactions: [{ before: 455_000, after: 61_000 }],
  cacheStats: { input: 2_100, output: 18_600, read: 3_412_000, write: 296_000, last: 271_400 },
  agents: [{ id: 'fictional-agent-01', description: 'Trace cache refresh behavior', model: 'claude-opus-5-5', effort: 'high', totals: [9_100, 14_800, 22_300, 31_000], usage: { input: 77_200, output: 4_800, read: 45_900 }, label: 'Explore' }],
  breakdown: {
    autoCompact: true,
    rows: [
      { name: 'System prompt', tokens: 7_100 },
      { name: 'System tools', tokens: 17_500 },
      { name: 'MCP tools', tokens: 5_900 },
      { name: 'Memory files', tokens: 3_200 },
      { name: 'Skills', tokens: 2_000 },
      { name: 'Messages', tokens: 235_700 },
    ],
    deferred: 28_200,
    mcp: [
      { server: 'tracker', tokens: 4_100 },
      { server: 'notes', tokens: 1_800 },
    ],
  },
}
