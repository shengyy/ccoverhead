// Pure formatting for the /ccoverhead pane: the detail the band has no room for, as headed sections of lines.
// Each line is a label column and a run of spans, drawn like the band's (block glyphs on the terminal, Svg on
// the surfaces with a proportional font).
import type { OverheadAgent, OverheadBreakdown, OverheadCacheStats } from '../types'
import type { BandInput, Span } from './format'
import { bar, dur, gainTier, gains, kshort, ktok, modelFamily, pctTier, sparkline, weeklyWindow } from './format'
import { hitRate } from './track'

export type PaneInput = BandInput & {
  timeline: number[]
  cacheStats: OverheadCacheStats
  agents: OverheadAgent[]
  breakdown: OverheadBreakdown | null
  // The agent whose transcript is on screen, if any.
  viewing?: string
}

export type PaneLine = { head: string } | { label: Span; spans: Span[] }

// Cells the label column takes on the terminal.
export const LABEL = 12
// MCP servers listed under the breakdown, the costliest first.
const SERVERS = 5
// Compactions listed, the latest last.
const COMPACTIONS = 3
// How long each known quota window runs, for the share of it gone.
const SPANS: [test: (kind: string) => boolean, ms: number][] = [
  [kind => kind === 'five_hour', 5 * 3_600_000],
  [kind => kind.startsWith('seven_day') || kind.includes('weekly'), 7 * 86_400_000],
]

const line = (label: string | Span, ...spans: Span[]): PaneLine => ({ label: typeof label === 'string' ? { text: label } : label, spans })
const dim = (text: string): Span => ({ text, dimColor: true })
const pad = (text: string, n: number) => text.padStart(n)

export function paneLines(p: PaneInput): PaneLine[] {
  return [...context(p), ...breakdown(p), ...growth(p), ...cache(p), ...quota(p), ...agents(p)]
}

function context(p: PaneInput): PaneLine[] {
  const out: PaneLine[] = [{ head: 'Context' }]
  const ctx = p.ctx
  if (!ctx || ctx.window <= 0) return [...out, line('window', dim(' no reading yet'))]
  const { tokens, window, estimate, compactAt } = ctx
  const mark = compactAt !== undefined && compactAt > 0 && compactAt < window ? (compactAt * 100) / window : undefined
  const now = tokens !== undefined && tokens > 0 ? tokens : undefined
  if (now !== undefined) {
    const pc = Math.trunc(ctx.percent ?? (now * 100) / window)
    const markTier = compactAt ? pctTier((now * 100) / compactAt) : undefined
    out.push(line('window', { text: ' ' }, { text: bar(pc, mark), tier: pctTier(pc), bar: pc, mark, markTier }, { text: ` ${pc}%`, tier: pctTier(pc) }, dim(` ${ktok(now)} of ${ktok(window)}`)))
  } else if (estimate !== undefined && estimate > 0) {
    const pc = Math.trunc((estimate * 100) / window)
    out.push(line('window', { text: ' ' }, { text: bar(pc, mark), dimColor: true, bar: pc, mark }, dim(` ~${pc}% ~${ktok(estimate)} of ${ktok(window)}, estimated before the first response`)))
  } else {
    out.push(line('window', dim(` -- of ${ktok(window)}`)))
  }
  if (compactAt !== undefined && compactAt > 0) {
    const used = now ?? estimate
    const left = used === undefined ? undefined : Math.max(compactAt - used, 0)
    out.push(
      line(
        'compacts',
        dim(` at ${kshort(compactAt)}`),
        ...(left === undefined ? [] : [{ text: ` · ${kshort(left)} to go`, tier: pctTier(((used ?? 0) * 100) / compactAt) }]),
      ),
    )
  } else if (p.breakdown && !p.breakdown.autoCompact) {
    out.push(line('compacts', dim(' never: auto-compaction is off')))
  }
  if (p.model) out.push(line('model', dim(` ${p.model}`)))
  return out
}

// /context's local estimate by category, the largest first, with each one's share of what is in use.
function breakdown(p: PaneInput): PaneLine[] {
  const b = p.breakdown
  if (!b || b.rows.length === 0) return []
  const window = p.ctx?.window ?? 1_000_000
  const used = b.rows.reduce((n, r) => n + r.tokens, 0)
  const out: PaneLine[] = [{ head: 'In the window, as /context estimates it' }]
  for (const r of [...b.rows].sort((x, y) => y.tokens - x.tokens)) {
    out.push(line({ text: pad(kshort(r.tokens), LABEL - 2), tier: gainTier(r.tokens, window) }, dim(` ${pad(`${Math.round((r.tokens * 100) / Math.max(used, 1))}%`, 4)}`), { text: `  ${r.name}` }))
    if (r.name.startsWith('MCP tools')) {
      for (const s of [...b.mcp].sort((x, y) => y.tokens - x.tokens).slice(0, SERVERS)) {
        out.push(line(dim(pad(kshort(s.tokens), LABEL - 2)), dim(`         ${s.server}`)))
      }
    }
  }
  if (b.deferred > 0) out.push(line(dim(pad(kshort(b.deferred), LABEL - 2)), dim('       tool schemas loaded on demand, outside the window')))
  return out
}

// The conversation's growth since its last compaction, and each compaction as the totals before and after.
function growth(p: PaneInput): PaneLine[] {
  const t = p.timeline
  const drop = t.findLastIndex((v, i) => i > 0 && v < (t[i - 1] ?? v))
  const run = drop < 0 ? t : t.slice(drop)
  const window = p.ctx?.window ?? 1_000_000
  const out: PaneLine[] = [{ head: 'Growth' }]
  const gs = gains(run)
  if (gs.length === 0) out.push(line('changes', dim(' none yet')))
  else {
    const top = Math.max(...gs)
    const mean = gs.reduce((n, g) => n + g, 0) / gs.length
    out.push(line(`last ${gs.length}`, { text: ' ' }, { text: sparkline(gs), spark: gs, tiers: gs.map(v => gainTier(v, window)) }, dim(` ↑${kshort(gs.at(-1) ?? 0)}`)))
    out.push(line('largest', { text: ` ↑${kshort(top)}`, tier: gainTier(top, window) }, dim(` · average ↑${kshort(Math.round(mean))}`)))
  }
  const drops = t.flatMap((v, i) => (i > 0 && v < (t[i - 1] ?? v) ? [[t[i - 1] ?? v, v] as const] : []))
  for (const [before, after] of drops.slice(-COMPACTIONS)) out.push(line('compacted', dim(` ${kshort(before)} → ${kshort(after)}`)))
  return out
}

function cache(p: PaneInput): PaneLine[] {
  const out: PaneLine[] = [{ head: 'Cache, main conversation' }]
  const c = p.cache
  if (!c) out.push(line('state', dim(' no request yet')))
  else {
    const left = c.at + p.cacheTtl - p.now
    out.push(
      c.warm && left > 0
        ? line('state', { text: ' warm', tier: pctTier(((p.cacheTtl - left) * 100) / p.cacheTtl) }, dim(` ${dur(left)} left of ${p.cacheTtl % 3_600_000 === 0 ? `${p.cacheTtl / 3_600_000}h` : dur(p.cacheTtl)}`))
        : line('state', dim(' cold')),
    )
  }
  const s = p.cacheStats
  const hit = hitRate(s)
  if (hit !== undefined) {
    out.push(line('hit rate', { text: ` ${Math.trunc(hit)}%`, tier: pctTier(100 - hit) }, dim(` · read ${kshort(s.read)} · written ${kshort(s.write)} · uncached ${kshort(s.input)}`)))
  }
  if (p.rewrite) out.push(line('rewrote', { text: ` ${kshort(p.rewrite)}`, tier: gainTier(p.rewrite, p.ctx?.window ?? 1_000_000) }, dim(' this turn, instead of reading it')))
  return out
}

// Every window reported, with the share of its time gone beside the share used: a fact, not a forecast.
function quota(p: PaneInput): PaneLine[] {
  const out: PaneLine[] = [{ head: p.limitsLive ? 'Quota' : 'Quota, as an earlier session last saw it' }]
  const weekly = weeklyWindow(p.limits, p.model)
  const shown = p.limits.filter(l => l.resetsAt === undefined || Date.parse(l.resetsAt) > p.now)
  if (shown.length === 0) return [...out, line('windows', dim(' none reported'))]
  for (const l of shown) {
    const pc = Math.trunc(l.percentUsed)
    const label =
      l.kind === 'five_hour' ? '5h' : l === weekly.limit ? weekly.label : l.kind === 'seven_day' ? '7d' : l.kind === 'spend_limit' ? 'spend' : l.kind
    const resets = l.resetsAt === undefined ? undefined : Date.parse(l.resetsAt)
    const span = SPANS.find(([test]) => test(l.kind))?.[1]
    const gone = span && resets !== undefined ? Math.min(Math.max(Math.round(((span - (resets - p.now)) * 100) / span), 0), 100) : undefined
    const ink = (s: Span): Span => (p.limitsLive ? s : { text: s.text, bar: s.bar, dimColor: true })
    out.push(
      line(
        label,
        { text: ' ' },
        ink({ text: bar(pc), tier: pctTier(pc), bar: Math.min(pc, 100) }),
        ink({ text: ` ${pc}%`, tier: pctTier(pc) }),
        ...(resets === undefined ? [] : [dim(` ↻${dur(resets - p.now)}`)]),
        ...(gone === undefined ? [] : [dim(` · ${gone}% of the window gone`)]),
      ),
    )
  }
  return out
}

// Each subagent seen this conversation: its type, model family and last context total, its growth, and which
// one is on screen.
function agents(p: PaneInput): PaneLine[] {
  if (p.agents.length === 0) return []
  const window = p.ctx?.window ?? 1_000_000
  const out: PaneLine[] = [{ head: 'Subagents' }]
  for (const a of p.agents) {
    const gs = gains(a.totals)
    const name = a.label ?? 'agent'
    out.push(
      line(
        name.length > LABEL - 1 ? `${name.slice(0, LABEL - 2)}…` : name,
        { text: ` ${ktok(a.totals.at(-1) ?? 0)}` },
        ...(gs.length > 0 ? [{ text: ' ' }, { text: sparkline(gs), spark: gs, tiers: gs.map(v => gainTier(v, window)) }] : []),
        dim(` ${modelFamily(a.model) ?? a.model}`),
        ...(a.id === p.viewing ? [dim(' · on screen')] : []),
      ),
    )
  }
  return out
}
