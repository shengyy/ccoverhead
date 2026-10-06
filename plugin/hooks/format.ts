// Pure formatting for the band: its groups, their widths and colours, and the desktop's Svg graphics.
import type { OverheadAgent, OverheadCache, OverheadCtx, OverheadLimit, OverheadTheme } from '../types'

// The prompt cache's lifetime until a model switch or a resume reports it: every main-conversation write seen
// on a Claude Pro account was ephemeral_1h. The other lifetime is five minutes.
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
  spark?: number[]
  tiers?: number[]
  money?: boolean
}

type Ink = { dark: string; light: string }

// An Svg is drawn as an image, with no theme: each colour has a dark-card and a light-card value, picked by
// the image's own media query. Text takes the dark-card value (the terminal's Claude Dark, the desktop's card).
const DIM: Ink = { dark: '#898781', light: '#6f6d68' }
const MONEY: Ink = { dark: '#dfbc70', light: '#8a6215' }
export const MONEY_BG: Ink = { dark: '#302a1e', light: '#f4eddf' }
const TRACK = 'rgba(137,135,129,0.3)'

// The band's one colour scale, safe to warning: cool for safe (indigo, blue, sky, cyan, teal), caution
// through lime to yellow, warm to a deep red for warning. The sparkline takes a tier by its gain's share of the
// window (`gainTier`), quota, context and the cache's lifetime by the share used (`pctTier`).
// Cool against warm, not green against red, so a red-green colour-blind reader still tells safe from warning
// (worst ΔE 17 between the two ends).
const GAIN: Ink[] = [
  { dark: '#5965cd', light: '#4c55bc' },
  { dark: '#4087de', light: '#266ec3' },
  { dark: '#37aae3', light: '#0481b3' },
  { dark: '#35c5db', light: '#0c8d9e' },
  { dark: '#49d6cc', light: '#17938b' },
  { dark: '#b8e45c', light: '#74980d' },
  { dark: '#f9e149', light: '#b39b00' },
  { dark: '#fea92f', light: '#b77610' },
  { dark: '#fd7933', light: '#bd4d00' },
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
  if (s.spark) return s.spark.map((_, i) => ({ text: glyphs[i] ?? '', color: colorOf({ text: '', tier: s.tiers?.[i] ?? 0 }, theme) }))
  return undefined
}

export type Graphic = { source: string; alt: string; width: number; height: number }

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
  if (s.bar !== undefined) {
    const ink = s.dimColor ? DIM : (GAIN[s.tier ?? -1] ?? DIM)
    const w = Math.round((Math.min(Math.max(s.bar, 0), 100) * 60) / 100)
    const track = `<rect x="0" y="0" width="60" height="6" rx="3" fill="${TRACK}"/>`
    const done = w > 0 ? `<rect class="k" x="0" y="0" width="${w}" height="6" rx="3"/>` : ''
    return { source: svg(60, 6, inks([['k', ink]]), track + done), alt: `context ${s.bar}% used`, width: 60, height: 6 }
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
      alt: `context added in each of the last ${s.spark.length} changes`,
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

// What to leave out, from least to most important, when the band is too narrow.
export type Detail = { cost?: boolean; turnCost?: boolean; spark: boolean; rewrite: boolean; cache: boolean; tokens: boolean; reset7: boolean; reset5: boolean }
export const DEGRADE: Detail[] = [
  { cost: true, turnCost: true, spark: true, rewrite: true, cache: true, tokens: true, reset7: true, reset5: true },
  { cost: true, spark: true, rewrite: true, cache: true, tokens: true, reset7: true, reset5: true },
  { cost: true, spark: false, rewrite: true, cache: true, tokens: true, reset7: true, reset5: true },
  { cost: true, spark: false, rewrite: false, cache: true, tokens: true, reset7: true, reset5: true },
  { cost: true, spark: false, rewrite: false, cache: false, tokens: true, reset7: true, reset5: true },
  { cost: true, spark: false, rewrite: false, cache: false, tokens: false, reset7: true, reset5: true },
  { spark: false, rewrite: false, cache: false, tokens: false, reset7: true, reset5: true },
  { spark: false, rewrite: false, cache: false, tokens: false, reset7: false, reset5: true },
  { spark: false, rewrite: false, cache: false, tokens: false, reset7: false, reset5: false },
]

// The growth sparkline and the latest gain, each bar in its gain's tier of `window`.
function growth(history: number[], window: number): Span[] {
  const gs = gains(history)
  return [
    { text: '  ' },
    { text: sparkline(gs), spark: gs, tiers: gs.map(v => gainTier(v, window)) },
    { text: ` ↑${kshort(gs.at(-1) ?? 0)}`, dimColor: true },
  ]
}

// The main conversation's context: bar, percentage, tokens and growth.
function contextGroup(b: BandInput, ctx: OverheadCtx, d: Detail): Span[] {
  const { tokens, window, estimate } = ctx
  if (tokens !== undefined && tokens > 0) {
    const p = Math.trunc(ctx.percent ?? (tokens * 100) / window)
    const g: Span[] = [
      { text: 'ctx' },
      { text: ' ' },
      { text: bar(p), tier: pctTier(p), bar: p },
      { text: ` ${p}%`, tier: pctTier(p) },
    ]
    if (d.tokens) g.push({ text: ` ${ktok(tokens)}/${ktok(window)}`, dimColor: true })
    if (d.spark && b.history.length >= 2) g.push(...growth(b.history, window))
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
    if (d.tokens) g.push({ text: ` ~${ktok(estimate)}/${ktok(window)}`, dimColor: true })
    return g
  }
  // Neither a response nor an estimate yet.
  return [{ text: 'ctx' }, { text: ` -- /${ktok(window)}`, dimColor: true }]
}

// A subagent's context while its transcript is on screen: its last request's input total, against its
// window when that is known, else the tokens alone; its growth bars by the main window's tiers.
function agentGroup(b: BandInput, view: AgentView, d: Detail): Span[] {
  const totals = view.agent?.totals ?? []
  const tokens = totals.at(-1)
  if (tokens === undefined) return [{ text: 'agent' }, { text: ' --', dimColor: true }]
  const g: Span[] = [{ text: 'agent' }]
  if (view.window) {
    const p = Math.trunc((tokens * 100) / view.window)
    g.push({ text: ' ' }, { text: bar(p), tier: pctTier(p), bar: p }, { text: ` ${p}%`, tier: pctTier(p) })
    if (d.tokens) g.push({ text: ` ${ktok(tokens)}/${ktok(view.window)}`, dimColor: true })
  } else {
    g.push({ text: ` ${ktok(tokens)}` })
  }
  if (d.spark && totals.length >= 2) g.push(...growth(totals, view.window ?? b.ctx?.window ?? FALLBACK_WINDOW))
  return g
}

// Warm and its minutes left in one colour (`cacheTier`), or cold; then the latest request that rewrote
// the cache instead of reading it, kept until a later turn reads the cache, tiered like a growth bar by its
// share of the window.
function cacheGroup(b: BandInput, cache: OverheadCache, d: Detail): Span[] {
  const g: Span[] = [{ text: 'cache' }]
  g.push(cacheStatus(cache, b.cacheTtl, b.now))
  if (d.rewrite && b.rewrite) {
    const text = ` rewrote ${kshort(b.rewrite)}`
    g.push(b.ctx?.window ? { text, tier: gainTier(b.rewrite, b.ctx.window) } : { text, dimColor: true })
  }
  return g
}

// The band's groups, each a run of spans; drawn with a dim " | " between groups. The conversation's own state
// first (context and its growth, then the cache, which every request renews), then the account's quota,
// which moves slowest; narrowing drops details by `DEGRADE`, and a truncated end cuts the quota first.
export function groups(b: BandInput, d: Detail): Span[][] {
  const out: Span[][] = []

  if (b.view) out.push(agentGroup(b, b.view, d))
  else if (b.ctx && b.ctx.window > 0) out.push(contextGroup(b, b.ctx, d))
  if (d.cache && b.cache) out.push(cacheGroup(b, b.cache, d))

  const weekly = weeklyWindow(b.limits, b.model)
  const windows: [l: OverheadLimit | undefined, label: string, showReset: boolean][] = [
    [b.limits.find(x => x.kind === 'five_hour'), '5h', d.reset5],
    [weekly.limit, weekly.label, d.reset7],
    // A Claude gateway's spend limit: it may carry no reset, and goes past 100% once exceeded.
    [b.limits.find(x => x.kind === 'spend_limit'), 'spend', d.reset7],
  ]
  for (const [l, label, showReset] of windows) {
    if (!l) continue
    const resets = l.resetsAt === undefined ? undefined : Date.parse(l.resetsAt)
    // A window whose reset has passed is dropped; only a spend limit may have none.
    if (resets === undefined ? label !== 'spend' : resets <= b.now) continue
    const p = Math.trunc(l.percentUsed)
    const reset = showReset && resets !== undefined ? ` ↻${dur(resets - b.now)}` : ''
    out.push(
      b.limitsLive
        ? [{ text: label }, { text: ` ${p}%`, tier: pctTier(p) }, ...(reset ? [{ text: reset, dimColor: true }] : [])]
        : // Remembered from an earlier session, before this one has a reading: all dim.
          [{ text: label }, { text: ` ${p}%${reset}`, dimColor: true }],
    )
  }

  if (d.cost && validCost(b.cost)) out.push([
    { text: 'cost', dimColor: true }, { text: ` ≈${usd(b.cost)}`, money: true },
    ...(d.turnCost && validCost(b.turnCost) ? [{ text: ` (+${usd(b.turnCost)})`, dimColor: true }] : []),
  ])
  if ((b.activeAgents ?? 0) > 0) out.push([{ text: `${b.activeAgents} agent${b.activeAgents === 1 ? '' : 's'}`, dimColor: true }])

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

// The fullest band that fits `columns`; the last level is drawn truncated if even it does not.
export function fit(b: BandInput, columns: number): Span[][] {
  let gs: Span[][] = []
  for (const d of DEGRADE) {
    gs = groups(b, d)
    if (width(gs) <= columns) return gs
  }
  return gs
}

export type Item = { kind: 'text'; span: Span } | { kind: 'graphic'; graphic: Graphic }

// One group as the desktop draws it: a row of items spaced by the Box's gap, not by spaces, which a
// proportional font draws narrow; the graphic spans become an Svg, the spaces-only ones go.
export function items(g: Span[]): Item[] {
  return g.flatMap((s): Item[] => {
    const graphic = svgOf(s)
    if (graphic) return [{ kind: 'graphic', graphic }]
    const text = s.text.trim()
    return text ? [{ kind: 'text', span: { ...s, text } }] : []
  })
}
