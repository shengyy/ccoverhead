// Renders the README screenshots from the plugin's own formatting code with fictional figures, so they
// always match the current design and never show anyone's session. Needs Google Chrome.
//
//   bun scripts/screenshot/render.ts
//
// Writes band, pane, cache-rewrite and subagent previews at 4x, trimmed to the scene. Needs ImageMagick too.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { BandInput, Span } from '../../plugin/hooks/format'
import { MONEY_BG, SEP, cells, colorOf, fit, items } from '../../plugin/hooks/format'
import { LABEL, paneLines } from '../../plugin/hooks/pane'
import { agentView, band, pane, rewriting } from './fixture'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = resolve(import.meta.dir, '../../assets/screenshots')
const SCALE = 4
type Theme = 'dark' | 'light'
const palette = (theme: Theme) => theme === 'light' ? { DIM: '#66645f', INK: '#262624' } : { DIM: '#8b8a85', INK: '#e8e6dc' }
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Spans as the terminal draws them: block glyphs, a multi-coloured span (the sparkline) piece by piece.
function spans(run: Span[], theme: Theme = 'dark'): string {
  const { DIM, INK } = palette(theme)
  return run
    .map(s => {
      const parts = cells(s, theme)
      return parts
        ? parts.map(c => `<span style="color:${c.dimColor ? DIM : (c.color ?? INK)}">${esc(c.text)}</span>`).join('')
        : `<span style="color:${s.dimColor ? DIM : (colorOf(s, theme) ?? INK)}">${esc(s.text)}</span>`
    })
    .join('')
}

// The terminal draws one line of text.
function terminal(theme: Theme = 'dark'): string {
  const { DIM } = palette(theme)
  const line = fit(band, 160)
    .map(g => spans(g, theme))
    .join(`<span style="color:${DIM}">${SEP}</span>`)
  return page(
    'terminal',
    `<div class="term">
      <div class="band">${line}</div>
      <div class="prompt"><span class="caret">&gt;</span><span class="cursor"></span></div>
      <div class="status">~/workspace/demo  main | Opus</div>
    </div>`, theme,
  )
}

// The /ccoverhead pane in a terminal: bold headings, a label column, the same spans as the band.
function paneShot(): string {
  const { DIM, INK } = palette('dark')
  const rows = paneLines(pane)
    .map(l =>
      'head' in l
        ? `<div class="head">${esc(l.head)}</div>`
        : `<div><span style="color:${l.label.dimColor ? DIM : (colorOf(l.label) ?? INK)}">${esc(l.label.text.padEnd(LABEL))}</span>${spans(l.spans)}</div>`,
    )
    .join('')
  return page(
    'terminal',
    `<div class="term"><div class="pane"><div class="pane-title">ccOverhead</div>${rows}</div>
      <div class="prompt"><span class="caret">&gt;</span><span class="cursor"></span></div></div>`,
  )
}

// The desktop draws in a proportional font: each group a row spaced by gap, the bar and sparkline as Svg.
function desktop(input: BandInput = band, width = 160, detail?: string, theme: Theme = 'dark'): string {
  const { DIM, INK } = palette(theme)
  const groups = fit(input, width).filter(group => !detail || group[0]?.text === detail).map(
    g =>
      `<span class="group"${g.some(s => s.money) ? ` style="background:${MONEY_BG[theme]};padding:0 7px"` : ''}>${items(g)
        .map(it =>
          it.kind === 'graphic'
            ? `<img src="data:image/svg+xml;base64,${btoa(it.graphic.source)}" width="${it.graphic.width}" height="${it.graphic.height}" alt="${esc(it.graphic.alt)}">`
            : `<span style="color:${it.span.dimColor ? DIM : (colorOf(it.span, theme) ?? INK)}">${esc(it.span.text)}</span>`,
        )
        .join('')}</span>`,
  )
  return page(
    'desktop',
    `<div class="app"${detail ? ' style="min-width:320px"' : ''}>
      <div class="card"><div class="row">${groups.join(`<span style="color:${DIM}">|</span>`)}</div></div>
      <div class="input">Type / for commands<span class="send">↵</span></div>
    </div>`, theme,
  )
}

function page(kind: string, body: string, theme: Theme = 'dark'): string {
  const { DIM, INK } = palette(theme)
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0 }
    body { color-scheme:${theme}; background: ${theme === 'light' ? '#eae9e5' : '#141413'}; padding: 20px; width: max-content }
    .term { background: ${theme === 'light' ? '#f5f5f5' : '#262624'}; color: ${INK}; font: 15px/1.6 "SF Mono", Menlo, monospace; padding: 18px 22px;
      border-radius: 12px }
    .term .band { white-space: pre }
    .term .prompt { margin: 10px 0 8px; border: 1px solid #4a4640; border-radius: 6px; padding: 6px 12px }
    .term .caret { color: ${INK} } .term .cursor { display: inline-block; width: 9px; height: 18px;
      background: #d97757; vertical-align: -3px; margin-left: 10px }
    .term .status { color: ${DIM} }
    .term .pane { white-space: pre; border: 1px solid #4a4640; border-radius: 6px; padding: 8px 14px }
    .term .pane .head { font-weight: 700; margin-top: 12px } .term .pane .pane-title { color: ${DIM} }
    .app { font: 15px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: ${INK}; width: max-content; min-width: 820px }
    .card { background: ${theme === 'light' ? '#f5f5f5' : '#212121'}; border-radius: 16px; padding: 14px 18px }
    .row, .group { display: flex; align-items: center; gap: 7px } .row { gap: 9px }
    .input { margin-top: 10px; border: 1px solid #3a3a38; border-radius: 16px; padding: 16px 18px; color: #8b8a85;
      display: flex; justify-content: space-between }
  </style><body class="${kind}">${body}</body>`
}

const dir = mkdtempSync(join(tmpdir(), 'ccoverhead-shots-'))
for (const [name, html, width, height] of [
  ['terminal', terminal(), 1400, 320],
  ['desktop', desktop(), 1400, 320],
  ['pane', paneShot(), 1100, 1300],
  ['terminal-light', terminal('light'), 1400, 320],
  ['cost', desktop(band, 160, 'cost'), 440, 280],
  ['cost-light', desktop(band, 160, 'cost', 'light'), 440, 280],
  ['cache-rewrite', desktop(rewriting, 160, 'cache'), 620, 320],
  ['agent', desktop(agentView, 110, 'agent'), 620, 320],
] as const) {
  const file = join(dir, `${name}.html`)
  writeFileSync(file, html)
  const shot = Bun.spawnSync([
    CHROME,
    '--headless=new',
    '--hide-scrollbars',
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${width},${height}`,
    `--screenshot=${join(OUT, `${name}.png`)}`,
    `file://${file}`,
  ])
  if (shot.exitCode !== 0) throw new Error(`Chrome failed on ${name}: ${shot.stderr.toString()}`)
  // Crop to the scene and give it an even margin of the page colour.
  const png = join(OUT, `${name}.png`)
  const trim = Bun.spawnSync(['magick', png, '-trim', '+repage', '-bordercolor', name.endsWith('-light') ? '#eae9e5' : '#141413', '-border', String(16 * SCALE), '-strip', png])
  if (trim.exitCode !== 0) throw new Error(`ImageMagick failed on ${name}: ${trim.stderr.toString()}`)
  console.log(`assets/screenshots/${name}.png`)
}
