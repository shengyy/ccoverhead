# Architecture

ccOverhead is one hooks module for Claude Code's mod engine. It turns events into plugin state and draws
the band from that state. External facts about the engine live in
[claude-code-integration.md](claude-code-integration.md); this page covers how the code is organized.

## Data flow

```text
 session.start ─────────┐                     ┌─▶ $.state: ctx (compactAt, model), history, timeline,
 classic.SessionStart ──┼─▶ load / take ──────┤             limits, limitsLive, breakdown
 session.measure ───────┤   ($.session.usage, └─▶ $.store "limits" (last quota reading, across sessions)
 command.run ccoverhead ┘    breakdown 'summary')
 session.compact, main thread ────▶ $.state: compactions; history, timeline restart
 turn.step, main thread ──────────▶ $.state: cache, cacheStats
 turn.step, a subagent + existing $.agent.list refresh ─▶ $.state: agents
 classic.PostModelSwitch, $.session.model() ─▶ $.state: model, cacheTtl, cache (cold)
 turn.start / turn.complete / session.measure ─▶ native cost total and turn increment
 config.list / config.set ─▶ theme
 native commands / turn.step / agent.spawn / turn.complete ─▶ coalesced refresh after 100 ms
 clock, every 30 s ─▶ local session/model/context check, running-agent count, redraw
                                                   │
 ui.render { AbovePrompt } ◀── read $.state ───────┤ ──▶ format.ts: fit → groups → spans ──┐
 ui.render { Pane, ccoverhead } ◀── read $.state ──┘ ──▶ pane.ts: paneLines → spans ───────┤
                                                        draw.tsx ◀────────────────────────┘
                                                          ├─ terminal: Text, block glyphs
                                                          └─ desktop, VS Code, mobile: Box rows, Text + Svg
```

The render hooks only read. Every write happens in an event hook, and a write to `$.state` redraws the
band and the pane by itself. The existing clock also checks native session identity and readings when
classic events are unavailable. No additional polling loop or persistent history is created.

## Files (`plugin/`)

| File | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Manifest; the only version source |
| `hooks/hooks.json` | Names the hooks module |
| `hooks/register.tsx` | Event hooks: loading figures, recording growth, compactions, cache and subagents, resetting on a new conversation, the `/ccoverhead` command, choosing the tree per surface |
| `hooks/track.ts` | Pure state updates: the growth history and timeline, compactions, the cache's running counts and rewrite mark (`addStep`, `compacted`), each subagent's totals (`addAgentStep`), window-average quota forecast (`quotaForecast`) |
| `hooks/format.ts` | Pure formatting of the band: groups and spans, narrowing (`fit`), the weekly window for the model (`weeklyWindow`, `modelFamily`), the color scale (`GAIN`, `pctTier`, `gainTier`), the cache state (`cacheTier`), multi-colored spans (`cells`), the desktop's Svg (`svgOf`, `items`) |
| `hooks/pane.ts` | Pure formatting of the pane: its sections as lines of a label and spans (`paneLines`) |
| `hooks/draw.tsx` | The band and the pane as element trees, for the terminal and for the surfaces with Svg |
| `hooks/activity.ts` | Shared clockwise dot masks, synchronized phases, three-spinner cap and overflow; terminal glyphs and matching desktop vectors |
| `hooks/activity-client.ts` | Up to three terminal glyphs driven by one local frame clock; removed from the tree when hidden |
| `types/index.d.ts` | The `$.state` contract, `PluginState['ccoverhead']` |
| `tests/kit.ts` | Shared fictional figures and engine answers for the tests |
| `tests/ccoverhead.test.ts` | The band's behavior through the engine's test kit, on the terminal and desktop surfaces |
| `tests/readings.test.ts` | Native cost, theme, mid-turn context, session identity and forecast regressions |
| `tests/pane.test.ts` | The pane's behavior, on the terminal, desktop, VS Code and mobile surfaces |

`tsconfig.json` extends the declarations Claude Code writes into `.claude-plugin/types/` when it loads the
plugin from a folder (ignored by Git).

## Plugin state

| Key | Type | Written by | Holds |
|---|---|---|---|
| `ctx` | `OverheadCtx \| null` | `session.start`, `session.measure`, `classic.SessionStart`, `command.run`; `session.compact` drops its reading, `classic.PostModelSwitch` its threshold | Window, tokens and percent of the last response, or the pre-response estimate; the auto-compaction threshold; the model the window was read for |
| `history` | `number[]` | the same, `session.compact` | Up to eight context totals; reset on a compaction, a drop or a new conversation |
| `timeline` | `number[]` | the same, `session.compact` | Up to 48 context totals since the last compaction, for the pane |
| `compactions` | `OverheadCompaction[]` | `session.compact`, a drop in `session.measure` | The last three compactions' sizes before and after |
| `breakdown` | `OverheadBreakdown \| null` | the same; cleared by `session.compact` and a model switch | `/context`'s local count by category and by MCP server, without paths or file names; none when the last count was refused |
| `limits` | `OverheadLimit[]` | the same | Every window reported; the band shows the 5-hour one, one weekly one and a spend limit |
| `limitsLive` | `boolean` | the same | Whether `limits` is this session's own reading (drawn in color) or remembered (dim) |
| `cache` | `OverheadCache \| null` | `turn.step`, `classic.PostModelSwitch`, `classic.SessionStart` (cleared; on a resume or fork, aged from the last response) | When the last main-thread request started and whether it touched the cache |
| `cacheStats` | `OverheadCacheStats` | `turn.step`, `session.compact`, `classic.SessionStart` (cleared; on a resume or fork, `last` is the transcript's last context) | The main conversation's input, cache-read and cache-written tokens, the last request's total, and the latest rewrite, until a later turn reads the cache |
| `cacheTtl` | `number \| null` | `classic.PostModelSwitch`, `classic.SessionStart` (resume or fork) | The cache lifetime in ms; unknown until a switch reports it or a resume shows it |
| `model` | `string \| null` | load, `session.measure`, `classic.PostModelSwitch` | The main loop's model; picks its own weekly window (`weeklyWindow`) |
| `agents` | `OverheadAgent[]` | `turn.step`, existing agent-list refresh; cleared on conversation change | Up to eight subagents: native ID/type/short description, latest responding model and requested effort, changed input totals and cumulative observed input/output/cache-read usage |

The additional session-state fields and their types have one owner in `types/index.d.ts`: native cost
and its turn baseline, theme, session identity, last live quota observation time, and running-agent count.
Main requested effort is pane-only metadata from `turn.step`; its output count joins the existing
`cacheStats` counters, avoiding a second input ledger. Cost comes from `session.measure` / `session.usage`; the count from `agent.list`; identity and theme from
`session.id` and `config.list`. Render hooks only consume them.

`$.store` keeps one key, `limits`, written only when this session's own reading changes.

## Drawing

`format.ts` builds the band once as groups of spans, and `pane.ts` the pane as lines of a label and spans.
A span's `text` is what the terminal draws and what widths are counted in; `tier` is its color on the
scale; a span with `bar` or `spark` is a graphic. `draw.tsx` renders spans as nested `Text` on the
terminal, the sparkline piece by piece (`cells`). Elsewhere it
renders each group or line as a `Box` row spaced by `gap`, trims text to drop the spaces the terminal
needs, and turns graphic spans into `Svg` with their own light-theme colors. The look is specified in
[design.md](design.md).

The running-agent spinners sit between the plain `agent` label and an optional overflow suffix. On the
terminal a single `Client` of up to three cells sits outside the text run; its clock and phase belong only
to that instance, not `$.state`. Changing the count updates its props without creating another timer.
No animation tick reads usage or invalidates the band. The desktop's dots animate inside their SVG.
