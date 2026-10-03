# Claude Code integration

Every fact about Claude Code that ccOverhead relies on, and the version it was verified on. The mod API is
early access and moves between releases; the declarations Claude Code writes into
`plugin/.claude-plugin/types/claude-code/index.d.ts` are the authority for the version you run. Re-check a
row when you rely on it in a new version, and add the version you checked.

## Figures

| Fact | Verified on |
|---|---|
| `$.session.usage()` answers `{ context, rateLimits }` as the status line has them: `context.window`, and `tokens` / `percent` from the last response | 2.1.288 |
| Before the first response of a window (new session, after `/clear`, after compaction) `context` holds only `window` | 2.1.288 |
| `$.session.usage({ breakdown: 'summary' })` adds `context.breakdown`, a local `/context` count; `totalTokens` counts system prompt, tools, memory files and skills, not deferred tools. It sends no request and took about 20 ms | 2.1.288 |
| A breakdown the engine refuses rejects the call; ccOverhead treats that as no estimate | 2.1.288 (test kit) |
| `session.measure` fires after each main-thread turn and when a rate-limit window moves a whole point, with `context`, `rateLimits` and `changed` | 2.1.288 |
| `rateLimits` lists `five_hour` and `seven_day` with `percentUsed` and ISO `resetsAt` on a Claude subscription; it is empty off a subscription | 2.1.288 (Claude Pro) |
| A `turn.step` result carries `usage` with `cache_read_input_tokens` and `cache_creation_input_tokens`; `agentId` is absent on the main thread | 2.1.288 |
| Main-conversation cache writes are `ephemeral_1h`; ccOverhead counts warmth over one hour | 2.1.288 (Claude Pro only; other plans not verified) |

## Session lifecycle

| Fact | Verified on |
|---|---|
| `session.start` fires once per load of the plugin, never for `/clear` | 2.1.288 |
| `classic.SessionStart` with `source` `clear`, `resume` or `fork` marks another conversation in the same process | 2.1.288 |
| Whether `/clear` empties a plugin's `$.state` is not documented; ccOverhead resets its own values | not verified |
| A hook that throws is skipped and the chain continues, so one failed call leaves the band on its last figures | 2.1.288 |

## Drawing

| Fact | Verified on |
|---|---|
| The `AbovePrompt` site is raised on the terminal and desktop surfaces only; its props include `hasSurvey` and `bodyColumns` (the band's width in cells) | 2.1.288 |
| A write to `$.state` redraws the readers; `$.ui.invalidate('ui.render')` redraws for time-based content | 2.1.288 |
| The desktop's element table has `Svg`; the terminal's does not, yet `'Svg' in table` is true there and yields a placeholder that renders as a `Box`, so branch on `e.surface` | 2.1.288 |
| An `Svg` inside a `Text` is refused (`Svg inside an inline element`) and the engine draws its own band instead | 2.1.288 |
| A `Box` inside a `Text` is refused the same way | 2.1.288 |
| `Svg` is drawn as an image: no theme colors, but its own `prefers-color-scheme` media query applies | 2.1.288 (dark theme seen; light not verified) |
| The desktop band uses a proportional font; block glyphs such as `■□` and `▁▂▃` do not line up there | 2.1.288 |
| `Text` `color` takes a theme key, a color name or a hex color; `ansi:` colors are refused | 2.1.288 |

## Test kit

| Fact | Verified on |
|---|---|
| `claude plugin validate` and `claude plugin test` run without signing in (used by CI) | 2.1.288 |
| Neither writes `.claude-plugin/types/`; only loading the plugin from a folder does, which needs a signed-in session | 2.1.288 |
| `ui.find({ key })` matches an element's `props.key`; a JSX `key` is not in props | 2.1.288 |
| `$.classic.<Event>` needs a test-side `on('classic.<Event>', …)` at the bottom of the chain | 2.1.288 |
| `$.ui.mount` validates the tree against the named surface's element table, so a tree the surface would refuse fails the test | 2.1.288 |
