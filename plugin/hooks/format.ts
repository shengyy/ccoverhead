// Pure formatting for the band: its groups, their widths and colours, and the desktop's Svg graphics.
import type { OverheadAgent, OverheadCache, OverheadCtx, OverheadLimit } from '../types'

// The prompt cache's lifetime until a model switch reports it: every main-conversation write seen on a
// Claude Pro account was ephemeral_1h.
export const CACHE_TTL_MS = 60 * 60 * 1000
// Context totals kept for the sparkline: 8 totals, 7 bars.
export const HISTORY = 8
const BARS = '▁▂▃▄▅▆▇█'
// Where auto-compaction runs, drawn between two cells of the context bar.
export const MARK = '│'
// Model families a rate-limit window may be named after.
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku']

// `text` is what the terminal draws and what widths count; `tier` its colour on the band's one scale (`GAIN`),
// absent for plain text (the labels). A span with `bar` (a used percentage, with the auto-compaction `mark`
// in its `markTier`) or `spark` (the gains, with their `tiers`) is a graphic: block glyphs line up only in a
// monospace font, so the desktop, which draws the band in a proportional one, draws those as an Svg instead
// (`items`). A `ring` (the cache lifetime left, 0 to 1) is drawn on the desktop only, its `text` empty.
export type Span = {
  text: string
  tier?: number
  dimColor?: boolean
  bar?: number
  mark?: number
  markTier?: number
  spark?: number[]
  tiers?: number[]
  ring?: number
}

type Ink = { dark: string; light: string }

// An Svg is drawn as an image, with no theme: each colour has a dark-card and a light-card value, picked by
// the image's own media query. Text takes the dark-card value (the terminal's Claude Dark, the desktop's card).
const DIM: Ink = { dark: '#898781', light: '#6f6d68' }
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
export function colorOf(s: Span): string | undefined {
  return s.tier === undefined ? undefined : GAIN[s.tier]?.dark
}

export type Cell = { text: string; color?: string; dimColor?: boolean }

// A span the terminal draws in more than one colour, piece by piece: the sparkline one glyph per gain in its
// tier's colour, a marked bar its cells around the mark. Undefined for a span of one colour.
export function cells(s: Span): Cell[] | undefined {
  const glyphs = [...s.text]
  if (s.spark) return s.spark.map((_, i) => ({ text: glyphs[i] ?? '', color: GAIN[s.tiers?.[i] ?? 0]?.dark ?? DIM.dark }))
  if (s.mark === undefined) return undefined
  const at = markCell(s.mark)
  const ink: Cell = s.dimColor ? { text: '', dimColor: true } : { text: '', color: colorOf(s) }
  const mark: Cell = s.dimColor ? { text: MARK, dimColor: true } : { text: MARK, color: colorOf({ text: '', tier: s.markTier }) }
  return [{ ...ink, text: glyphs.slice(0, at).join('') }, mark, { ...ink, text: glyphs.slice(at + 1).join('') }].filter(c => c.text)
}

export type Graphic = { source: string; alt: string; width: number; height: number }

// The Svg's colours as classes: each its dark-card fill (or stroke), and its light-card one under the media query.
function inks(classes: [name: string, ink: Ink][], paint: 'fill' | 'stroke' = 'fill'): string {
  const rules = (mode: keyof Ink) => classes.map(([name, ink]) => `.${name}{${paint}:${ink[mode]}}`).join('')
  return `<style>${rules('dark')}@media (prefers-color-scheme: light){${rules('light')}}</style>`
}

function svg(width: number, height: number, style: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${style}${body}</svg>`
}

// A graphic span as an Svg: the bar a 60×6 rounded track filled to the exact percentage, with a 2 px tick
// standing past it where auto-compaction runs; the sparkline one 4 px column per gain on a shared baseline,
// 14 px at the largest and 3 px at the least so the smallest still shows its colour, each in its tier's
// colour; the ring a 12 px circle whose arc drains with the cache lifetime.
export function svgOf(s: Span): Graphic | undefined {
  if (s.bar !== undefined) {
    const ink = s.dimColor ? DIM : (GAIN[s.tier ?? -1] ?? DIM)
    const w = Math.round((Math.min(Math.max(s.bar, 0), 100) * 60) / 100)
    const marked = s.mark !== undefined
    const y = marked ? 2 : 0
    const height = marked ? 10 : 6
    const track = `<rect x="0" y="${y}" width="60" height="6" rx="3" fill="${TRACK}"/>`
    const done = w > 0 ? `<rect class="k" x="0" y="${y}" width="${w}" height="6" rx="3"/>` : ''
    const markInk = s.dimColor ? DIM : (GAIN[s.markTier ?? -1] ?? DIM)
    const x = marked ? Math.min(Math.max(Math.round(((s.mark ?? 0) * 60) / 100) - 1, 0), 58) : 0
    const tick = marked ? `<rect class="m" x="${x}" y="0" width="2" height="10" rx="1"/>` : ''
    const alt = `context ${s.bar}% used${marked ? `, auto-compacts at ${Math.round(s.mark ?? 0)}%` : ''}`
    return { source: svg(60, height, inks([['k', ink], ['m', markInk]]), track + done + tick), alt, width: 60, height }
  }
  if (s.ring !== undefined) {
    const left = Math.min(Math.max(s.ring, 0), 1)
    const c = 2 * Math.PI * 4.5
    const ink = GAIN[s.tier ?? -1] ?? DIM
    const track = `<circle cx="6" cy="6" r="4.5" fill="none" stroke="${TRACK}" stroke-width="2"/>`
    const arc = `<circle class="k" cx="6" cy="6" r="4.5" fill="none" stroke-width="2" stroke-dasharray="${(c * left).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 6 6)"/>`
    return { source: svg(12, 12, inks([['k', ink]], 'stroke'), track + arc), alt: `cache lifetime ${Math.round(left * 100)}% left`, width: 12, height: 12 }
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

// 10 cells, rounded to the nearest tenth: ■■■□□□□□□□; with a mark (a percentage), the mark between the two
// cells nearest it: ■■■□□□□□│□□.
export function bar(p: number, mark?: number): string {
  const filled = Math.max(Math.min(Math.floor((p + 5) / 10), 10), 0)
  const cells = '■'.repeat(filled) + '□'.repeat(10 - filled)
  if (mark === undefined) return cells
  const at = markCell(mark)
  return cells.slice(0, at) + MARK + cells.slice(at)
}

// How many cells stand before the mark: at least one, so a mark never reads as the bar's start.
export function markCell(mark: number): number {
  return Math.min(Math.max(Math.round(mark / 10), 1), 10)
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
  cacheTtl: number
  // Tokens the main conversation's request rewrote to the cache this turn instead of reading them.
  rewrite?: number
  model: string | null
  view?: AgentView
}

// What to leave out, from least to most important, when the band is too narrow.
export type Detail = { spark: boolean; rewrite: boolean; cache: boolean; tokens: boolean; reset7: boolean; reset5: boolean }
export const DEGRADE: Detail[] = [
  { spark: true, rewrite: true, cache: true, tokens: true, reset7: true, reset5: true },
  { spark: false, rewrite: true, cache: true, tokens: true, reset7: true, reset5: true },
  { spark: false, rewrite: false, cache: true, tokens: true, reset7: true, reset5: true },
  { spark: false, rewrite: false, cache: false, tokens: true, reset7: true, reset5: true },
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

// The main conversation's context: bar (with the auto-compaction mark), percentage, tokens and growth.
function contextGroup(b: BandInput, ctx: OverheadCtx, d: Detail): Span[] {
  const { tokens, window, estimate, compactAt } = ctx
  // The mark sits at the threshold's share of the window, coloured by how near the context is to it.
  const mark = compactAt !== undefined && compactAt > 0 && compactAt < window ? (compactAt * 100) / window : undefined
  if (tokens !== undefined && tokens > 0) {
    const p = Math.trunc(ctx.percent ?? (tokens * 100) / window)
    const markTier = mark === undefined ? undefined : pctTier((tokens * 100) / (compactAt ?? window))
    const g: Span[] = [
      { text: 'ctx' },
      { text: ' ' },
      { text: bar(p, mark), tier: pctTier(p), bar: p, mark, markTier },
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
      { text: bar(p, mark), dimColor: true, bar: p, mark },
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
  if (d.spark && totals.length >= 2) g.push(...growth(totals, view.window ?? b.ctx?.window ?? 1_000_000))
  return g
}

// Warm with its lifetime left, or cold; then a request of this turn that rewrote the cache instead of reading
// it, tiered like a growth bar by its share of the window.
function cacheGroup(b: BandInput, cache: OverheadCache, d: Detail): Span[] {
  const left = cache.at + b.cacheTtl - b.now
  let g: Span[] = [{ text: 'cache' }, { text: ' cold', dimColor: true }]
  if (cache.warm && left > 0) {
    // Cool while the lifetime is fresh, warming as it drains: one tier per 10% of it gone.
    const tier = pctTier(((b.cacheTtl - left) * 100) / b.cacheTtl)
    g = [{ text: 'cache' }, { text: '', ring: left / b.cacheTtl, tier }, { text: ' warm', tier }, { text: ` ${dur(left)}`, dimColor: true }]
  }
  if (d.rewrite && b.rewrite) {
    const text = ` rewrote ${kshort(b.rewrite)}`
    g.push(b.ctx?.window ? { text, tier: gainTier(b.rewrite, b.ctx.window) } : { text, dimColor: true })
  }
  return g
}

// The band's groups, each a run of spans; drawn with a dim " | " between groups. The session's own state
// first (context and its growth), then the account's quota, then the cache, so a narrow band cuts the
// slow-moving groups before the context.
export function groups(b: BandInput, d: Detail): Span[][] {
  const out: Span[][] = []

  if (b.view) out.push(agentGroup(b, b.view, d))
  else if (b.ctx && b.ctx.window > 0) out.push(contextGroup(b, b.ctx, d))

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

  if (d.cache && b.cache) out.push(cacheGroup(b, b.cache, d))
  return out
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
