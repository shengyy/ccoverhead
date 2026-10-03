# Architecture

ccOverhead is one hooks module for Claude Code's mod engine. It turns events into plugin state and draws
the band from that state. External facts about the engine live in
[claude-code-integration.md](claude-code-integration.md); this page covers how the code is organized.

## Data flow

```text
 session.start ─────────┐
 classic.SessionStart ──┼─▶ load / take ──▶ $.state: ctx, history, limits, limitsLive
 session.measure ───────┘        │                 ▲
                                 └─▶ $.store "limits" (last quota reading, across sessions)
 turn.step (main thread) ─────────────▶ $.state: cache
 classic.PostModelSwitch, $.session.model() ─▶ $.state: model
 clock, every 30 s ─▶ $.ui.invalidate("ui.render")
                                                   │
 ui.render { AbovePrompt } ◀── read $.state ───────┘ ──▶ format.ts: fit → groups → spans
                                                          ├─ terminal: one Text line, glyphs
                                                          └─ desktop:  Box rows, Text + Svg
```

The render hook only reads. Every write happens in an event hook, and a write to `$.state` redraws the
band by itself; the clock invalidates only so the countdowns keep time between turns.

## Files (`plugin/`)

| File | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Manifest; the only version source |
| `hooks/hooks.json` | Names the hooks module |
| `hooks/register.tsx` | Event hooks: loading figures, recording growth and cache, resetting on a new conversation, drawing per surface |
| `hooks/format.ts` | Pure formatting: groups and spans, narrowing (`fit`), the weekly window for the model (`weeklyWindow`, `modelFamily`), the color scale (`GAIN`, `pctTier`, `gainTier`), the desktop's Svg (`svgOf`, `items`) |
| `types/index.d.ts` | The `$.state` contract, `PluginState['ccoverhead']` |
| `tests/ccoverhead.test.ts` | Behavior through the engine's test kit, on the terminal and desktop surfaces |

`tsconfig.json` extends the declarations Claude Code writes into `.claude-plugin/types/` when it loads the
plugin from a folder (ignored by Git).

## Plugin state

| Key | Type | Written by | Holds |
|---|---|---|---|
| `ctx` | `OverheadCtx \| null` | `session.start`, `session.measure`, `classic.SessionStart` | Window, tokens and percent of the last response, or the pre-response estimate |
| `history` | `number[]` | the same | Up to eight context totals; reset on a drop or a new conversation |
| `limits` | `OverheadLimit[]` | the same | Every window reported; the band shows the 5-hour one and one weekly one |
| `limitsLive` | `boolean` | the same | Whether `limits` is this session's own reading (drawn in color) or remembered (dim) |
| `cache` | `OverheadCache \| null` | `turn.step`, cleared by `classic.SessionStart` | When the last main-thread request finished and whether it touched the cache |
| `model` | `string \| null` | load, `session.measure`, `classic.PostModelSwitch` | The main loop's model; picks its own weekly window (`weeklyWindow`) |

`$.store` keeps one key, `limits`, written only when this session's own reading changes.

## Drawing

`format.ts` builds the band once as groups of spans. A span's `text` is what the terminal draws and what
widths are counted in; `tier` is its color on the scale; a span with `bar` or `spark` is a graphic. The
terminal renders the spans as nested `Text`, the sparkline one glyph per bar. The desktop renders each
group as a `Box` row spaced by `gap`, trims text to drop the spaces the terminal needs, and turns graphic
spans into `Svg` with their own light-theme colors. The look is specified in [design.md](design.md).
