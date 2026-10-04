# Claude Code integration

Every fact about Claude Code that ccOverhead relies on, and the version it was verified on. The mod API is
early access and moves between releases; the declarations Claude Code writes into
`plugin/.claude-plugin/types/claude-code/index.d.ts` are the authority for the version you run. Re-check a
row when you rely on it in a new version, and add the version you checked.

## Figures

| Fact | Verified on |
|---|---|
| `$.session.usage()` answers `{ context, rateLimits }` as the status line has them: `context.window`, and `tokens` / `percent` from the last response | 2.1.288, 2.1.289 |
| Before the first response of a window (new session, after `/clear`, after compaction) `context` holds only `window` | 2.1.288, 2.1.289 |
| `$.session.usage({ breakdown: 'summary' })` adds `context.breakdown`, a local `/context` count; `totalTokens` counts system prompt, tools, memory files and skills, not deferred tools. It sends no request and took about 20 ms (2–3 ms on 2.1.289) | 2.1.288, 2.1.289 |
| The breakdown's `autoCompactThreshold` is a token total and `isAutoCompactEnabled` says whether it applies: 967,000 on Opus 5.5's 1M window (`autocompactSource` `model-default`), 167,000 on Haiku 4.5's 200k window (`auto`); with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` on Haiku, `rawMaxTokens` is 100,000 and the threshold 67,000 while `context.window` stays 200,000, so the mark is placed on `context.window`'s scale; with `DISABLE_AUTO_COMPACT=1`, `isAutoCompactEnabled` is false and there is no threshold | 2.1.289 |
| The breakdown's `categories` carry a `kind`: `used` rows (system prompt, system tools, MCP server instructions, skills, messages, …), `deferred` rows (tool schemas loaded on demand, outside the window) and the `free` row; `mcpTools` name each schema's `serverName` and `isLoaded` | 2.1.289 |
| A breakdown the engine refuses rejects the call; ccOverhead treats that as no estimate | 2.1.288 (test kit) |
| `session.measure` fires after each main-thread turn and when a rate-limit window moves a whole point, with `context`, `rateLimits` and `changed`; it also carries `cost` and fires when only the cost changed (`changed: ['context', 'cost']`) | 2.1.288, 2.1.289 |
| A `session.measure` whose `changed` names `rateLimits` with an empty list means the windows went away; ccOverhead drops them | not verified |
| `rateLimits` lists `five_hour` and `seven_day` with `percentUsed` and ISO `resetsAt` on a Claude subscription; it is empty off a subscription | 2.1.288, 2.1.289 (Claude Pro) |
| A Claude gateway reports a `spend_limit` window, which may lack `resetsAt` and goes past 100 when exceeded (the declarations say so) | not verified |
| A `turn.step` result carries `usage` with `cache_read_input_tokens` and `cache_creation_input_tokens`; `agentId` is absent on the main thread | 2.1.288, 2.1.289 |
| A subagent's requests reach `turn.step` with its `agentId` and their own `usage` (the model that answered in `usage.model`); its first request reads nothing from the cache and writes its whole prefix | 2.1.289 |
| The main context total `session.measure` reports equals the last main-thread request's `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`; ccOverhead counts a subagent's context the same way | 2.1.289 (requests without a server-side tool loop) |
| Under a server-side tool loop a step's `usage` sums several responses, so it may exceed the loop's last context | not verified (declarations of 2.1.289) |
| `$.agent.list()` lists a running subagent with its `id` (the `agentId` of its steps) and its `type` (`Explore`) | 2.1.289 |
| Main-conversation cache writes are `ephemeral_1h`; ccOverhead counts warmth over one hour | 2.1.288 (Claude Pro only; other plans not verified) |
| On a Claude Pro account without Fable access, `rateLimits` holds only `five_hour` and `seven_day` (all models); a Fable request is refused with "Fable 5.1 requires usage credits" and reports no windows | 2.1.288 |
| `$.session.model()` returns the main loop's resolved model id (`claude-haiku-4-5-20251001`, `claude-fable-5-1`, `claude-opus-5-5`); `classic.PostModelSwitch` carries `from_model` and `to_model` | 2.1.288, 2.1.289 |
| `classic.PostModelSwitch` carries `cache_ttl` (`5m` or `1h`) and `prompt_cache_warm`, documented as "a switch then forfeits it" (each model has its own cache) | not verified (declarations of 2.1.289) |
| Anthropic's usage data, as cached by Claude Code's `/usage` (not read by ccOverhead), names a model's own weekly window `weekly_scoped`, with the model in a separate `scope`; the one seen was Fable's, on an account with Fable access | seen in 2026-08, outside the plugin API |
| Whether Claude Code passes a model's own weekly window to plugins in `rateLimits`, and under what kind (`SessionRateLimit` has no scope) | not verified |

## Session lifecycle

| Fact | Verified on |
|---|---|
| `/compact` raises `session.compact` with `trigger` `manual` and no `agentId`; the result carries `tokensBefore` and `tokensAfter` (22,480 → 2,022 in a short Haiku conversation). A plugin hook that passes `next(e)` through and reads the result changes nothing | 2.1.289 |
| A compaction that fails (`summarization produced empty response` on a two-message conversation) leaves no result for the hook to read; ccOverhead records nothing | 2.1.289 |
| Auto-compaction raises `session.compact` with `trigger` `auto`; a subagent's own compaction carries its `agentId`, a `precompute` installs nothing | not verified (declarations of 2.1.289) |
| `session.start` fires once per load of the plugin, never for `/clear` | 2.1.288 |
| `classic.SessionStart` with `source` `clear`, `resume` or `fork` marks another conversation in the same process | 2.1.288 |
| Whether `/clear` empties a plugin's `$.state` is not documented; ccOverhead resets its own values | not verified |
| A hook that throws is skipped and the chain continues, so one failed call leaves the band on its last figures; in `session.start`, everything after the failed call is skipped too, so ccOverhead starts its clock before registering its command | 2.1.288, 2.1.289 (test kit) |

## Commands and the pane

| Fact | Verified on |
|---|---|
| `$.command.register({ name, description })` in `session.start` answers `{ command }`; typing `/<name>`, also as a headless prompt, runs the plugin's `command.run` hook (`origin` `sdk` there) | 2.1.289 |
| `$.ui.open({ id })` from a `command.run` hook answers `{ isPlaced: true }`, even in a headless run | 2.1.289 |
| A command's `{ text }` is a transcript row the model also reads; a hook that answers `{}` shows nothing | not verified (declarations of 2.1.289; ccOverhead answers `{}`) |
| The `Pane` site is raised on every surface (terminal, desktop, VS Code, mobile) and its tree is validated against each surface's table in the test kit | 2.1.289 (test kit); not verified live on VS Code or mobile |
| `AbovePrompt` and `Pane` props carry `view.agentId` while a subagent's transcript is on screen, and a switch re-runs the hook | not verified (declarations of 2.1.289; covered by tests) |

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
