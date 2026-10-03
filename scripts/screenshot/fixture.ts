// Shared fictional figures for README previews and design sheets. Never read a live session here.
import type { BandInput } from '../../plugin/hooks/format'

const NOW = Date.parse('2026-10-04T09:00:00Z')
const MIN = 60_000

export const band: BandInput = {
  now: NOW,
  ctx: { tokens: 271_400, window: 1_000_000, percent: 27 },
  history: [180_000, 181_200, 186_000, 198_000, 232_000, 236_500, 268_000, 271_400],
  limits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(NOW + 154 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 63, resetsAt: new Date(NOW + (2 * 24 * 60 + 7 * 60) * MIN).toISOString() },
  ],
  limitsLive: true,
  cache: { at: NOW - 22 * MIN, warm: true },
  model: null,
}
