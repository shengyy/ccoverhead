// Renders the README screenshots from the plugin's own formatting code with fictional figures, so they
// always match the current design and never show anyone's session. Needs Google Chrome.
//
//   bun scripts/screenshot/render.ts
//
// Writes assets/screenshots/{terminal,desktop,pane}.png at 2x, trimmed to the scene. Needs ImageMagick too.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { Span } from '../../plugin/hooks/format'
import { SEP, cells, colorOf, fit, items } from '../../plugin/hooks/format'
import { LABEL, paneLines } from '../../plugin/hooks/pane'
import { band, pane } from './fixture'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = resolve(import.meta.dir, '../../assets/screenshots')
const DIM = '#8b8a85'
const INK = '#e8e6dc'
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// Spans as the terminal draws them: block glyphs, a multi-coloured span (the sparkline, a marked bar) piece by piece.
function spans(run: Span[]): string {
  return run
    .map(s => {
      const parts = cells(s)
      return parts
        ? parts.map(c => `<span style="color:${c.dimColor ? DIM : (c.color ?? INK)}">${esc(c.text)}</span>`).join('')
        : `<span style="color:${s.dimColor ? DIM : (colorOf(s) ?? INK)}">${esc(s.text)}</span>`
    })
    .join('')
}

// The terminal draws one line of text.
function terminal(): string {
  const line = fit(band, 110)
    .map(spans)
    .join(`<span style="color:${DIM}">${SEP}</span>`)
  return page(
    'terminal',
    `<div class="term">
      <div class="band">${line}</div>
      <div class="prompt"><span class="caret">&gt;</span><span class="cursor"></span></div>
      <div class="status">~/workspace/demo  main | Opus</div>
    </div>`,
  )
}

// The /ccoverhead pane in a terminal: bold headings, a label column, the same spans as the band.
function paneShot(): string {
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
function desktop(): string {
  const groups = fit(band, 110).map(
    g =>
      `<span class="group">${items(g)
        .map(it =>
          it.kind === 'graphic'
            ? `<img src="data:image/svg+xml;base64,${btoa(it.graphic.source)}" width="${it.graphic.width}" height="${it.graphic.height}" alt="${esc(it.graphic.alt)}">`
            : `<span style="color:${it.span.dimColor ? DIM : (colorOf(it.span) ?? INK)}">${esc(it.span.text)}</span>`,
        )
        .join('')}</span>`,
  )
  return page(
    'desktop',
    `<div class="app">
      <div class="card"><div class="row">${groups.join(`<span style="color:${DIM}">|</span>`)}</div></div>
      <div class="input">Type / for commands<span class="send">↵</span></div>
    </div>`,
  )
}

function page(kind: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0 }
    body { background: #141413; padding: 20px; width: max-content }
    .term { background: #262624; color: ${INK}; font: 15px/1.6 "SF Mono", Menlo, monospace; padding: 18px 22px;
      border-radius: 12px }
    .term .band { white-space: pre }
    .term .prompt { margin: 10px 0 8px; border: 1px solid #4a4640; border-radius: 6px; padding: 6px 12px }
    .term .caret { color: ${INK} } .term .cursor { display: inline-block; width: 9px; height: 18px;
      background: #d97757; vertical-align: -3px; margin-left: 10px }
    .term .status { color: ${DIM} }
    .term .pane { white-space: pre; border: 1px solid #4a4640; border-radius: 6px; padding: 8px 14px }
    .term .pane .head { font-weight: 700; margin-top: 12px } .term .pane .pane-title { color: ${DIM} }
    .app { font: 15px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: ${INK}; width: 820px }
    .card { background: #212121; border-radius: 16px; padding: 14px 18px }
    .row, .group { display: flex; align-items: center; gap: 7px } .row { gap: 9px }
    .input { margin-top: 10px; border: 1px solid #3a3a38; border-radius: 16px; padding: 16px 18px; color: #8b8a85;
      display: flex; justify-content: space-between }
  </style><body class="${kind}">${body}</body>`
}

const dir = mkdtempSync(join(tmpdir(), 'ccoverhead-shots-'))
for (const [name, html, width, height] of [
  ['terminal', terminal(), 1100, 320],
  ['desktop', desktop(), 900, 320],
  ['pane', paneShot(), 1000, 1100],
] as const) {
  const file = join(dir, `${name}.html`)
  writeFileSync(file, html)
  const shot = Bun.spawnSync([
    CHROME,
    '--headless=new',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${width},${height}`,
    `--screenshot=${join(OUT, `${name}.png`)}`,
    `file://${file}`,
  ])
  if (shot.exitCode !== 0) throw new Error(`Chrome failed on ${name}: ${shot.stderr.toString()}`)
  // Crop to the scene and give it an even margin of the page colour.
  const png = join(OUT, `${name}.png`)
  const trim = Bun.spawnSync(['magick', png, '-trim', '+repage', '-bordercolor', '#141413', '-border', '32', png])
  if (trim.exitCode !== 0) throw new Error(`ImageMagick failed on ${name}: ${trim.stderr.toString()}`)
  console.log(`assets/screenshots/${name}.png`)
}
