// Pure formatting for the band: its groups, their widths and colours, and the desktop's Svg graphics.
import type { OverheadAgent, OverheadCache, OverheadCtx, OverheadLimit, OverheadTheme } from '../types'
import { activityBody, activityGlyphs, activityOverflow, activityWidth } from './activity'

// The two cache lifetimes the engine can report. Neither is assumed before evidence arrives.
export const CACHE_TTL_MS = 60 * 60 * 1000
export const SHORT_TTL_MS = 5 * 60 * 1000
// The warm cache's colour for `left` of a `ttl` lifetime: the share of it gone, on the percentage scale, as a
// quota's share used is. Sky while fresh, one tier per 10% gone from 30%, red in its last tenth.
export function cacheTier(left: number, ttl: number): number {
  return pctTier(((ttl - left) * 100) / ttl)
}
// Context totals kept for the sparkline: 8 totals, 7 bars.
export const HISTORY = 8
const BARS = '▁▂▃▄▅▆▇█'
// The window growth is tiered by before any is known.
export const FALLBACK_WINDOW = 1_000_000
// Model families a rate-limit window may be named after.
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku']

// `text` is what the terminal draws and what widths count; `tier` its colour on the band's one scale (`GAIN`),
// absent for plain text (the labels). A span with `bar` (a used percentage) or `spark` (the gains, with their
// `tiers`) is a graphic: block glyphs line up only in a
// monospace font, so the desktop, which draws the band in a proportional one, draws those as an Svg instead
// (`items`).
export type Span = {
  text: string
  tier?: number
  dimColor?: boolean
  bar?: number
  forecast?: number
  barLabel?: string
  spark?: number[]
  sparkLabel?: 'input'
  tiers?: number[]
  money?: boolean
  agentCount?: number
  fold?: 'growth' | 'tokens' | 'reset' | 'rewrite' | 'turn-cost'
}

type Ink = { dark: string; light: string }

// An Svg is drawn as an image, with no theme: each colour has a dark-card and a light-card value, picked by
// the image's own media query. Text uses the host's configured theme.
const DIM: Ink = { dark: '#898781', light: '#6f6d68' }
const MONEY: Ink = { dark: '#dfbc70', light: '#8a6215' }
const TRACK = 'rgba(137,135,129,0.3)'

// The band's one colour scale, safe to warning: cool for safe (indigo, blue, sky, cyan, teal), caution
// through lime to yellow, warm to a deep red for warning. The sparkline takes a tier by its gain's share of the
// window (`gainTier`), quota, context and the cache's lifetime by the share used (`pctTier`).
// Cool against warm, not green against red, so a red-green colour-blind reader still tells safe from warning
// (worst ΔE 17 between the two ends).
const GAIN: Ink[] = [
  { dark: '#5965cd', light: '#4c55bc' },
  { dark: '#4087de', light: '#266ec3' },
  { dark: '#37aae3', light: '#0076a8' },
  { dark: '#35c5db', light: '#007a8b' },
  { dark: '#49d6cc', light: '#007c74' },
  { dark: '#b8e45c', light: '#567a00' },
  { dark: '#f9e149', light: '#856d00' },
  { dark: '#fea92f', light: '#a05f00' },
  { dark: '#fd7933', light: '#bc4c00' },
  { dark: '#ed4b43', light: '#bb0916' },
]

// A gain's tier: 0 below 0.1% of the window, then one more for each doubling (0.2%, 0.4%, … 25.6% and over),
// since one change adds anywhere from a few hundred tokens to a quarter of the window: 1k, 2k, 4k … 256k of
// a 1M window, 200 … 51k of a 200k one. Integer comparisons, so a gain on a boundary lands on its own tier.
export function gainTier(gain: number, window: number): number {
  let t = 0
  while (t < GAIN.length - 1 && gain * 1000 >= window * 2 ** t) t++
  return t
}

// A used percentage's tier: one per 10%, from tier 2, since the two quietest tiers are dimmer than the band's
// dim text and too faint for a figure. 0–29% sky, 30s cyan, 40s teal (safe); 50s lime, 60s yellow (caution);
// 70s amber, 80s orange, 90% and over red (warning).
export function pctTier(p: number): number {
  return Math.min(Math.max(Math.floor(p / 10), 2), GAIN.length - 1)
}

// A span's text colour: its tier's dark-card value, none for plain text.
export function colorOf(s: Span, theme: OverheadTheme = 'dark'): string | undefined {
  if (s.money) return theme === 'native' ? 'warning' : MONEY[theme]
  if (s.tier === undefined) return undefined
  if (theme === 'native') return s.tier < 5 ? 'permission' : s.tier < 8 ? 'warning' : 'error'
  return GAIN[s.tier]?.[theme]
}

export type Cell = { text: string; color?: string; dimColor?: boolean }

// A span the terminal draws in more than one colour, piece by piece: the sparkline, one glyph per gain in its
// tier's colour. Undefined for a span of one colour.
export function cells(s: Span, theme: OverheadTheme = 'dark'): Cell[] | undefined {
  const glyphs = [...s.text]
  if (s.forecast !== undefined) return glyphs.map(text => text === '■' ? { text, color: colorOf(s, theme) } : { text, dimColor: true })
  if (s.spark) return s.spark.map((_, i) => ({ text: glyphs[i] ?? '', color: colorOf({ text: '', tier: s.tiers?.[i] ?? 0 }, theme) }))
  return undefined
}

export type Graphic = { source: string; alt: string; width: number; height: number; isInteractive?: boolean }

// The Svg's colours as classes: each its dark-card fill, and its light-card one under the media query.
function inks(classes: [name: string, ink: Ink][]): string {
  const rules = (mode: keyof Ink) => classes.map(([name, ink]) => `.${name}{fill:${ink[mode]}}`).join('')
  return `<style>${rules('dark')}@media (prefers-color-scheme: light){${rules('light')}}</style>`
}

function svg(width: number, height: number, style: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${style}${body}</svg>`
}

// A graphic span as an Svg: the bar a 60×6 rounded track filled to the exact percentage; the sparkline one 4 px column per gain on a shared baseline,
// 14 px at the largest and 3 px at the least so the smallest still shows its colour, each in its tier's
// colour.
export function svgOf(s: Span): Graphic | undefined {
  if (s.agentCount !== undefined) return {
    source: svg(activityWidth(s.agentCount), 14, inks([['k', GAIN[5]!]]), activityBody(s.agentCount)),
    alt: `${s.agentCount} running agents`, width: activityWidth(s.agentCount), height: 14, isInteractive: true,
  }
  if (s.bar !== undefined) {
    const ink = s.dimColor ? DIM : (GAIN[s.tier ?? -1] ?? DIM)
    const w = Math.round((Math.min(Math.max(s.bar, 0), 100) * 60) / 100)
    const track = `<rect x="0" y="0" width="60" height="6" rx="3" fill="${TRACK}"/>`
    const done = w > 0 ? `<rect class="k" x="0" y="0" width="${w}" height="6" rx="3"/>` : ''
    const projected = s.forecast === undefined ? w : Math.round(Math.min(Math.max(s.forecast, s.bar), 100) * 0.6)
    const future = projected > w ? `<rect class="f" x="${w}" y="0" width="${projected - w}" height="6" opacity="0.4"/>` : ''
    return {
      source: svg(60, 6, inks([['k', ink], ['f', DIM]]), track + future + done),
      alt: `${s.barLabel ?? 'context'} ${s.bar}% used${s.forecast === undefined ? '' : `; approximately ${Math.round(s.forecast)}% by reset`}`,
      width: 60, height: 6,
    }
  }
  if (s.spark && s.spark.length > 0) {
    const top = Math.max(...s.spark, 1)
    const width = s.spark.length * 6 - 2
    const cols = s.spark
      .map((v, i) => {
        const h = Math.max(Math.round((v * 14) / top), 3)
        return `<rect class="t${s.tiers?.[i] ?? 0}" x="${i * 6}" y="${14 - h}" width="4" height="${h}" rx="1"/>`
      })
      .join('')
    return {
      source: svg(width, 14, inks(GAIN.map((ink, t) => [`t${t}`, ink])), cols),
      alt: `${s.sparkLabel === 'input' ? 'input increase' : 'context added'} in each of the last ${s.spark.length} changes`,
      width,
      height: 14,
    }
  }
  return undefined
}

// Countdown: 3d4h, 2h10m, 41m (floored, never negative).
export function dur(ms: number): string {
  const s = Math.max(Math.floor(ms / 1000), 0)
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d${Math.floor((s % 86_400) / 3_600)}h`
  if (s >= 3_600) return `${Math.floor(s / 3_600)}h${Math.floor((s % 3_600) / 60)}m`
  return `${Math.floor(s / 60)}m`
}

// Whole k/M, floored: 443k, 1M.
export function ktok(t: number): string {
  if (t >= 1_000_000) return `${Math.floor(t / 1_000_000)}M`
  if (t >= 1_000) return `${Math.floor(t / 1_000)}k`
  return String(t)
}

// One-decimal k/M for deltas: 12.3k, 1.2M, 41k.
export function kshort(t: number): string {
  let x: number
  let u: string
  if (t >= 1_000_000) {
    x = Math.floor((t + 50_000) / 100_000)
    u = 'M'
  } else if (t >= 1_000) {
    x = Math.floor((t + 50) / 100)
    u = 'k'
  } else return String(t)
  return x % 10 === 0 ? `${x / 10}${u}` : `${Math.floor(x / 10)}.${x % 10}${u}`
}

// 10 cells, rounded to the nearest tenth: ■■■□□□□□□□.
export function bar(p: number): string {
  const filled = Math.max(Math.min(Math.floor((p + 5) / 10), 10), 0)
  return '■'.repeat(filled) + '□'.repeat(10 - filled)
}

// Same quota scale: solid is used, shaded is projected additional use, hollow is unfilled.
export function forecastBar(p: number, projected: number): string {
  const used = Math.max(0, Math.min(10, Math.round(p / 10)))
  const end = Math.max(used, Math.min(10, Math.round(projected / 10)))
  return '■'.repeat(used) + '▧'.repeat(end - used) + '□'.repeat(10 - end)
}

export function gains(history: number[]): number[] {
  return history.slice(1).map((t, i) => Math.max(t - (history[i] ?? t), 0))
}

export function sparkline(values: number[]): string {
  const top = Math.max(...values, 1)
  return values.map(v => BARS[Math.floor((v * 7) / top)]).join('')
}

// The family a model id belongs to (`claude-fable-5-1` → `fable`), if it names one.
export function modelFamily(model: string | null): string | undefined {
  const id = (model ?? '').toLowerCase()
  return FAMILIES.find(f => id.includes(f))
}

// The weekly window to show: the main model's own when Claude Code reports one, else the all-models week.
// Not verified: no model's own window has reached a plugin yet, so its kind is matched, not known. A kind
// naming the family counts; for Fable so does a `scoped` one, since Anthropic's usage data calls a
// model's own weekly window `weekly_scoped` (the model in a separate scope a rate limit here does not
// carry) and the one seen was Fable's.
export function weeklyWindow(limits: OverheadLimit[], model: string | null): { limit?: OverheadLimit; label: string } {
  const family = modelFamily(model)
  const others = limits.filter(l => l.kind !== 'seven_day')
  const own =
    family === undefined
      ? undefined
      : (others.find(l => l.kind.toLowerCase().includes(family)) ??
        (family === 'fable' ? others.find(l => l.kind.toLowerCase().includes('scoped')) : undefined))
  return own ? { limit: own, label: `7d ${family}` } : { limit: limits.find(l => l.kind === 'seven_day'), label: '7d' }
}

// The subagent whose transcript is on screen, when one is: its figures (absent before its first request)
// and its window, known only when it runs the main loop's model.
export type AgentView = { agent?: OverheadAgent; window?: number }

export type BandInput = {
  now: number
  ctx: OverheadCtx | null
  history: number[]
  limits: OverheadLimit[]
  limitsLive: boolean
  cache: OverheadCache | null
  cacheTtl: number | null
  cost?: number | null
  turnCost?: number | null
  activeAgents?: number
  // Tokens the main conversation's latest rewrite wrote to the cache instead of reading them, until a later
  // turn reads the cache.
  rewrite?: number
  model: string | null
  view?: AgentView
}

// The growth sparkline and the latest gain, each bar in its gain's tier of `window`.
function growth(history: number[], window: number, sparkLabel?: Span['sparkLabel']): Span[] {
  const gs = gains(history)
  return [
    { text: '  ', fold: 'growth' },
    { text: sparkline(gs), spark: gs, sparkLabel, tiers: gs.map(v => gainTier(v, window)), fold: 'growth' },
    { text: ` ↑${kshort(gs.at(-1) ?? 0)}`, dimColor: true, fold: 'growth' },
  ]
}

// The main conversation's context: bar, percentage, tokens and growth.
function contextGroup(b: BandInput, ctx: OverheadCtx): Span[] {
  const { tokens, window, estimate } = ctx
  if (tokens !== undefined && tokens > 0) {
    const p = Math.trunc(ctx.percent ?? (tokens * 100) / window)
    const g: Span[] = [
      { text: 'ctx' },
      { text: ' ' },
      { text: bar(p), tier: pctTier(p), bar: p },
      { text: ` ${p}%`, tier: pctTier(p) },
    ]
    g.push({ text: ` ${ktok(tokens)}/${ktok(window)}`, dimColor: true, fold: 'tokens' })
    if (b.history.length >= 2) g.push(...growth(b.history, window))
    return g
  }
  if (estimate !== undefined && estimate > 0) {
    // Before the window's first response: /context's estimate, dim and marked ~.
    const p = Math.trunc((estimate * 100) / window)
    const g: Span[] = [
      { text: 'ctx' },
      { text: ' ' },
      { text: bar(p), dimColor: true, bar: p },
      { text: ` ~${p}%`, dimColor: true },
    ]
    g.push({ text: ` ~${ktok(estimate)}/${ktok(window)}`, dimColor: true, fold: 'tokens' })
    return g
  }
  // Neither a response nor an estimate yet.
  return [{ text: 'ctx' }, { text: ` -- /${ktok(window)}`, dimColor: true }]
}

// A subagent's context while its transcript is on screen: its last request's input total, against its
// window when that is known, else the tokens alone; its growth bars by the main window's tiers.
function agentGroup(b: BandInput, view: AgentView): Span[] {
  const totals = view.agent?.totals ?? []
  const tokens = totals.at(-1)
  if (tokens === undefined) return [{ text: 'agent' }, { text: ' --', dimColor: true }]
  const g: Span[] = [{ text: 'agent' }]
  if (view.window) {
    const p = Math.trunc((tokens * 100) / view.window)
    g.push({ text: ' ' }, { text: bar(p), tier: pctTier(p), bar: p }, { text: ` ${p}%`, tier: pctTier(p) })
    g.push({ text: ` ${ktok(tokens)}/${ktok(view.window)}`, dimColor: true, fold: 'tokens' })
  } else {
    g.push({ text: ` ${ktok(tokens)}` })
  }
  if (totals.length >= 2) g.push(...growth(totals, view.window ?? b.ctx?.window ?? FALLBACK_WINDOW, 'input'))
  return g
}

// Warm and its minutes left in one colour (`cacheTier`), or cold; then the latest request that rewrote
// the cache instead of reading it, kept until a later turn reads the cache, tiered like a growth bar by its
// share of the window.
function cacheGroup(b: BandInput, cache: OverheadCache): Span[] {
  const g: Span[] = [{ text: 'cache' }]
  g.push(cacheStatus(cache, b.cacheTtl, b.now))
  if (b.rewrite) {
    const text = ` rewrote ${kshort(b.rewrite)}`
    g.push({ ...(b.ctx?.window ? { text, tier: gainTier(b.rewrite, b.ctx.window) } : { text, dimColor: true }), fold: 'rewrite' })
  }
  return g
}

// The band's groups, each a run of spans; drawn with a dim " | " between groups. The conversation's own state
// first (context and its growth, then the cache, which every request renews), then the account's quota,
// which moves slowest. Narrowing follows this visual order, from right to left.
export function groups(b: BandInput): Span[][] {
  const out: Span[][] = []

  if (b.view) out.push(agentGroup(b, b.view))
  else if (b.ctx && b.ctx.window > 0) out.push(contextGroup(b, b.ctx))
  if (b.cache) out.push(cacheGroup(b, b.cache))

  const weekly = weeklyWindow(b.limits, b.model)
  const windows: [l: OverheadLimit | undefined, label: string][] = [
    [b.limits.find(x => x.kind === 'five_hour'), '5h'],
    [weekly.limit, weekly.label],
    // A Claude gateway's spend limit: it may carry no reset, and goes past 100% once exceeded.
    [b.limits.find(x => x.kind === 'spend_limit'), 'spend'],
  ]
  for (const [l, label] of windows) {
    if (!l) continue
    const resets = l.resetsAt === undefined ? undefined : Date.parse(l.resetsAt)
    // A window whose reset has passed is dropped; only a spend limit may have none.
    if (resets === undefined ? label !== 'spend' : resets <= b.now) continue
    const p = Math.trunc(l.percentUsed)
    const reset = resets !== undefined ? ` ↻${dur(resets - b.now)}` : ''
    out.push([
      { text: label },
      { text: ` ${p}%`, ...(b.limitsLive ? { tier: pctTier(p) } : { dimColor: true }) },
      ...(reset ? [{ text: reset, dimColor: true, fold: 'reset' as const }] : []),
    ])
  }

  if ((b.activeAgents ?? 0) > 0) out.push([
    { text: 'agent' }, { text: ' ' },
    { text: activityGlyphs(b.activeAgents!) + activityOverflow(b.activeAgents!), tier: 5, agentCount: b.activeAgents },
  ])
  if (validCost(b.cost)) out.push([
    { text: 'cost' }, { text: ` ≈${usd(b.cost)}`, money: true },
    ...(validCost(b.turnCost) ? [{ text: ` (+${usd(b.turnCost)})`, dimColor: true, fold: 'turn-cost' as const }] : []),
  ])

  return out
}

export function validCost(cost: number | null | undefined): cost is number {
  return cost !== null && cost !== undefined && Number.isFinite(cost) && cost >= 0
}

export function usd(cost: number): string {
  return `$${cost.toFixed(2)}`
}

// A cache lifetime the engine has not reported is unknown, never an assumed hour.
export function cacheStatus(cache: OverheadCache, ttl: number | null, now: number): Span {
  if (!cache.warm) return { text: ' cold', dimColor: true }
  if (ttl === null) return { text: ' TTL unknown', dimColor: true }
  const left = cache.at + ttl - now
  return left > 0 ? { text: ` warm ${dur(left)}`, tier: cacheTier(left, ttl) } : { text: ' cold', dimColor: true }
}

export const SEP = ' | '

export function width(gs: Span[][]): number {
  const cells = gs.reduce((n, g) => n + g.reduce((m, s) => m + [...s.text].length, 0), 0)
  return cells + SEP.length * Math.max(gs.length - 1, 0)
}

// Each level removes only the rightmost group's trailing detail, then that group. Never skip leftward
// over a group that is still visible. The leftmost group's core is the final, truncatable level.
export function bandVariants(b: BandInput): Span[][][] {
  let gs = groups(b)
  const levels = [gs]
  while (gs.length > 0) {
    const last = gs.at(-1)!
    const fold = last.at(-1)?.fold
    if (fold) gs = [...gs.slice(0, -1), last.filter(s => s.fold !== fold)]
    else if (gs.length > 1) gs = gs.slice(0, -1)
    else break
    levels.push(gs)
  }
  return levels
}

// The fullest band that fits `columns`; the last level is drawn truncated if even it does not.
export function fit(b: BandInput, columns: number): Span[][] {
  const levels = bandVariants(b)
  return levels.find(gs => width(gs) <= columns) ?? levels.at(-1)!
}

export type Item = { kind: 'text'; span: Span } | { kind: 'graphic'; graphic: Graphic; suffix?: Span }

// One group as the desktop draws it: a row of items spaced by the Box's gap, not by spaces, which a
// proportional font draws narrow; the graphic spans become an Svg, the spaces-only ones go.
export function items(g: Span[]): Item[] {
  return g.flatMap((s): Item[] => {
    const graphic = svgOf(s)
    if (graphic) return [{
      kind: 'graphic', graphic,
      ...(s.agentCount !== undefined && activityOverflow(s.agentCount) ? {
        suffix: { text: activityOverflow(s.agentCount), tier: s.tier },
      } : {}),
    }]
    const text = s.text.trim()
    return text ? [{ kind: 'text', span: { ...s, text } }] : []
  })
}
