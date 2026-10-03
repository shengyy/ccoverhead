// Pure formatting for the band: its groups, their widths and colours, and the desktop's Svg graphics.
import type { OverheadCache, OverheadCtx, OverheadLimit } from '../types'

// Main-conversation prompt cache TTL on this account: every cache write is ephemeral_1h.
export const CACHE_TTL_MS = 60 * 60 * 1000
// Context totals kept for the sparkline: 8 totals, 7 bars.
export const HISTORY = 8
const BARS = '▁▂▃▄▅▆▇█'
const LIMIT_LABELS: [kind: string, label: string][] = [
  ['five_hour', '5h'],
  ['seven_day', '7d'],
]

// `text` is what the terminal draws and what widths count; `tier` its colour on the band's one scale (`GAIN`),
// absent for plain text (the labels). A span with `bar` (a used percentage) or `spark` (the gains, with their
// `tiers`) is a graphic: block glyphs line up only in a monospace font, so the desktop, which draws the band
// in a proportional one, draws those two as an Svg instead (`items`).
export type Span = {
  text: string
  tier?: number
  dimColor?: boolean
  bar?: number
  spark?: number[]
  tiers?: number[]
}

type Ink = { dark: string; light: string }

// An Svg is drawn as an image, with no theme: each colour has a dark-card and a light-card value, picked by
// the image's own media query. Text takes the dark-card value (the terminal's Claude Dark, the desktop's card).
const DIM: Ink = { dark: '#898781', light: '#6f6d68' }
const TRACK = 'rgba(137,135,129,0.3)'

// The band's one colour scale, safe to warning: cool for safe (indigo, blue, sky, cyan, teal), caution
// through lime to yellow, warm to a deep red for warning. The sparkline takes a tier by its gain's share of the
// window (`gainTier`), quota and context by their used percentage (`pctTier`), a warm cache the safe teal.
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

// A warm cache is a safe state.
export const SAFE_TIER = 4

// A span's text colour: its tier's dark-card value, none for plain text.
export function colorOf(s: Span): string | undefined {
  return s.tier === undefined ? undefined : GAIN[s.tier]?.dark
}

// The sparkline as the terminal draws it: one glyph per gain, each in its tier's colour.
export function sparkCells(s: Span): { text: string; color: string }[] {
  const glyphs = [...s.text]
  return (s.spark ?? []).map((_, i) => ({ text: glyphs[i] ?? '', color: GAIN[s.tiers?.[i] ?? 0]?.dark ?? DIM.dark }))
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

// A graphic span as an Svg: the bar a 60×6 rounded track filled to the exact percentage, the sparkline one
// 4 px column per gain on a shared baseline, 14 px at the largest and 3 px at the least so the smallest
// still shows its colour, each in its tier's colour.
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
  const filled = Math.min(Math.floor((p + 5) / 10), 10)
  return '■'.repeat(Math.max(filled, 0)) + '□'.repeat(10 - Math.max(filled, 0))
}

// A new total: append when it changed, restart on a drop (compaction), keep the last HISTORY.
export function addSample(history: number[], tokens: number): number[] {
  const last = history.at(-1)
  if (last === tokens) return history
  if (last !== undefined && tokens < last) return [tokens]
  return [...history, tokens].slice(-HISTORY)
}

export function gains(history: number[]): number[] {
  return history.slice(1).map((t, i) => Math.max(t - (history[i] ?? t), 0))
}

export function sparkline(values: number[]): string {
  const top = Math.max(...values, 1)
  return values.map(v => BARS[Math.floor((v * 7) / top)]).join('')
}

export type BandInput = {
  now: number
  ctx: OverheadCtx | null
  history: number[]
  limits: OverheadLimit[]
  limitsLive: boolean
  cache: OverheadCache | null
}

// What to leave out, from least to most important, when the band is too narrow.
export type Detail = { spark: boolean; cache: boolean; tokens: boolean; reset7: boolean; reset5: boolean }
export const DEGRADE: Detail[] = [
  { spark: true, cache: true, tokens: true, reset7: true, reset5: true },
  { spark: false, cache: true, tokens: true, reset7: true, reset5: true },
  { spark: false, cache: false, tokens: true, reset7: true, reset5: true },
  { spark: false, cache: false, tokens: false, reset7: true, reset5: true },
  { spark: false, cache: false, tokens: false, reset7: false, reset5: true },
  { spark: false, cache: false, tokens: false, reset7: false, reset5: false },
]

// The band's groups, each a run of spans; drawn with a dim " | " between groups. The session's own state
// first (context and its growth), then the account's quota, then the cache, so a narrow band cuts the
// slow-moving groups before the context.
export function groups(b: BandInput, d: Detail): Span[][] {
  const out: Span[][] = []

  if (b.ctx && b.ctx.window > 0) {
    const { tokens, window, estimate } = b.ctx
    if (tokens !== undefined && tokens > 0) {
      const p = Math.trunc(b.ctx.percent ?? (tokens * 100) / window)
      const g: Span[] = [
        { text: 'ctx' },
        { text: ' ' },
        { text: bar(p), tier: pctTier(p), bar: p },
        { text: ` ${p}%`, tier: pctTier(p) },
      ]
      if (d.tokens) g.push({ text: ` ${ktok(tokens)}/${ktok(window)}`, dimColor: true })
      if (d.spark && b.history.length >= 2) {
        const gs = gains(b.history)
        g.push(
          { text: '  ' },
          { text: sparkline(gs), spark: gs, tiers: gs.map(v => gainTier(v, window)) },
          { text: ` ↑${kshort(gs.at(-1) ?? 0)}`, dimColor: true },
        )
      }
      out.push(g)
    } else if (estimate !== undefined && estimate > 0) {
      // Before the window's first response: /context's estimate, dim and marked ~.
      const p = Math.trunc((estimate * 100) / window)
      const g: Span[] = [
        { text: 'ctx' },
        { text: ' ' },
        { text: bar(p), dimColor: true, bar: p },
        { text: ` ~${p}%`, dimColor: true },
      ]
      if (d.tokens) g.push({ text: ` ~${ktok(estimate)}/${ktok(window)}`, dimColor: true })
      out.push(g)
    } else {
      // Neither a response nor an estimate yet.
      out.push([{ text: 'ctx' }, { text: ` -- /${ktok(window)}`, dimColor: true }])
    }
  }

  for (const [kind, label] of LIMIT_LABELS) {
    const l = b.limits.find(x => x.kind === kind)
    // A window whose reset has passed is dropped, as the script did.
    if (!l || !l.resetsAt || Date.parse(l.resetsAt) <= b.now) continue
    const p = Math.trunc(l.percentUsed)
    const showReset = kind === 'five_hour' ? d.reset5 : d.reset7
    const reset = showReset ? ` ↻${dur(Date.parse(l.resetsAt) - b.now)}` : ''
    out.push(
      b.limitsLive
        ? [{ text: label }, { text: ` ${p}%`, tier: pctTier(p) }, { text: reset, dimColor: true }]
        : // Remembered from an earlier session, before this one has a reading: all dim.
          [{ text: label }, { text: ` ${p}%${reset}`, dimColor: true }],
    )
  }

  if (d.cache && b.cache) {
    const left = b.cache.at + CACHE_TTL_MS - b.now
    out.push(
      b.cache.warm && left > 0
        ? [{ text: 'cache' }, { text: ' warm', tier: SAFE_TIER }, { text: ` ${dur(left)}`, dimColor: true }]
        : [{ text: 'cache' }, { text: ' cold', dimColor: true }],
    )
  }
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
