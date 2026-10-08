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
| The breakdown's `autoCompactThreshold` is a token total and `isAutoCompactEnabled` says whether it applies: 967,000 on Opus 5.5's 1M window (`autocompactSource` `model-default`), 167,000 on Haiku 4.5's 200k window (`auto`); with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` on Haiku, `rawMaxTokens` is 100,000 and the threshold 67,000 while `context.window` stays 200,000, so ccOverhead measures the threshold against `context.window`; with `DISABLE_AUTO_COMPACT=1`, `isAutoCompactEnabled` is false and there is no threshold | 2.1.289 |
| The breakdown's `categories` carry a `kind`: `used` rows (system prompt, system tools, MCP server instructions, skills, messages, …), `deferred` rows (tool schemas loaded on demand, outside the window) and the `free` row; `mcpTools` name each schema's `serverName` and `isLoaded` | 2.1.289 |
| A breakdown the engine refuses rejects the call; ccOverhead treats that as no estimate | 2.1.288 (test kit) |
| `session.measure` fires after each main-thread turn and when a rate-limit window moves a whole point, with `context`, `rateLimits` and `changed`; it also carries `cost`, and `changed` names it when the cost moved (`['context', 'cost']` after a turn) | 2.1.288, 2.1.289 |
| A `session.measure` whose `changed` names `rateLimits` with an empty list means the windows went away; ccOverhead drops them | not verified |
| `rateLimits` lists `five_hour` and `seven_day` with `percentUsed` and ISO `resetsAt` on a Claude subscription; it is empty off a subscription | 2.1.288, 2.1.289 (Claude Pro) |
| A Claude gateway reports a `spend_limit` window, which may lack `resetsAt` and goes past 100 when exceeded (the declarations say so) | not verified |
| A `turn.step` result carries `usage` with `cache_read_input_tokens` and `cache_creation_input_tokens`; `agentId` is absent on the main thread | 2.1.288, 2.1.289 |
| A subagent's requests reach `turn.step` with its `agentId` and their own `usage` (the model that answered in `usage.model`); its first request reads nothing from the cache and writes its whole prefix | 2.1.289 |
| The main context total `session.measure` reports equals the last main-thread request's `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`; ccOverhead counts a subagent's context the same way | 2.1.289 (requests without a server-side tool loop) |
| Under a server-side tool loop a step's `usage` sums several responses, so it may exceed the loop's last context | not verified (declarations of 2.1.289) |
| `$.agent.list()` lists a running subagent with its `id` (the `agentId` of its steps) and its `type` (`Explore`) | 2.1.289 |
| Observed main-conversation cache writes were `ephemeral_1h`; this does not establish a default for other sessions | 2.1.288 (Claude Pro only; other plans not verified) |
| The API's usage carries `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` (seen in `claude -p --output-format json`), but the `usage` a plugin's `turn.step` receives is declared with five numbers only; whether the breakdown reaches plugins is unknown: a probe plugin run under `claude -p` left no record to read. ccOverhead reads only the declared fields | not verified (declarations of 2.1.289) |
| On a Claude Pro account without Fable access, `rateLimits` holds only `five_hour` and `seven_day` (all models); a Fable request is refused with "Fable 5.1 requires usage credits" and reports no windows | 2.1.288 |
| `$.session.model()` returns the main loop's resolved model id (`claude-haiku-4-5-20251001`, `claude-fable-5-1`, `claude-opus-5-5`); `classic.PostModelSwitch` carries `from_model` and `to_model` | 2.1.288, 2.1.289 |
| Claude Code gives a subscription inside its plan usage the one-hour cache and usage credits or an API key the five-minute one, which ccOverhead applies when the session has shown no lifetime; taken from another mod's README (`augiefra/claude-mods` `token-weather-usage`), the plan windows serving as the sign of a subscription | not verified (the observed Claude Pro writes were one-hour; no five-minute account seen) |
| The official example mods (`anthropics/claude-code` `mods/`: `agents-md`, `diff`, `sec-default`, `telemetry`) read neither the cache lifetime nor the cost; nothing in the declarations (2.1.289 and the repository's 2.1.277 copy) exposes the lifetime besides `PostModelSwitch.cache_ttl` and the resume fields | 2026-10-07 |
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
| A hot reload of the plugin's code raises `session.start` again for it and cancels the old code's timers, so ccOverhead's 30-second redraw is started anew rather than lost or doubled | not verified (declarations of 2.1.289) |
| `classic.SessionStart` with `source` `clear`, `resume` or `fork` marks another conversation in the same process | 2.1.288 |
| On `resume` and `fork`, `classic.SessionStart` carries `seconds_since_last_response`, `context_tokens` (the transcript's last context) and `prompt_cache_likely_expired`; `claude --resume` at process start reports `source` `resume`, not `startup` (Haiku 4.5, resumed after 5 and 13 seconds: 20,843 tokens, not expired). Resumed after 343 seconds on Claude Pro, `prompt_cache_likely_expired` was false and the request read 20,879 tokens from the cache: the engine counts the hour, as ccOverhead infers from an age between five minutes and an hour | 2.1.289 (Claude Pro; a five-minute account not verified) |
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
| On a remote surface (the desktop app) `bodyColumns` counts cells of the surface's code font (`RenderViewport`: "the pane's width and height over the advance and line height of its code font"), so a band drawn in the proportional UI font needs fewer cells than its characters; ccOverhead wraps there instead of dropping groups | declarations of 2.1.289; the desktop's real width not verified |
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

## Native observation paths (not verified live)

The saved 2.1.289 declarations and the 2.1.291 test kit cover these paths; this is not live acceptance.

- `session.measure.cost.usd` / `session.usage().cost.usd` provide the session ledger. The plugin
  snapshots it at main `turn.start`, subtracts on every local ledger refresh, and keeps that baseline
  until the next turn or reset so delayed accounting can settle. Subagent completion does not replace
  it. `turn.complete` is passed on unchanged. The existing poll adopts cost and quota changes even when
  context is unchanged; this timing is tested with delayed fictional readings, not verified live.
- `config.list` exposes the theme; allowed `config.set` results update colors. Unknown theme names use
  native semantic colors. No configuration is written. A list that fails or has no `theme` row leaves the
  theme unread (native colors meanwhile) and the 30-second tick and a clear/resume/fork read again until a row
  answers. One resumed session was seen drawing native colors under a `dark` setting until `/theme` was
  confirmed; why its first read failed is not verified (2.1.289).
- `session.id`, `session.model` and `session.usage` allow local refreshes when `classic.*` is unavailable.
  The upstream [sec-default guard](https://github.com/anthropics/claude-code/blob/main/mods/sec-default/hooks/register.ts)
  skips user classic hooks for managed/Team/Enterprise contexts. ccOverhead still respects refused reads;
  it does not bypass policy. Native command events schedule a refresh, and the existing 30-second tick
  catches delayed picker changes.
- Main `turn.step` schedules a coalesced 100 ms local usage read. Its summed usage is not treated as
  context size. End-of-turn measurements alone add growth samples.
- Conversation reset invalidates pending native identity, model, usage and breakdown reads. Tests let
  an old read finish after clear and the new reading, and check that the new figures survive.
- Main and subagent `turn.step` carry requested `model` and optional `effort`; `agentId` identifies a
  subagent. The result's `usage`
  gives the responding model and four always-present token counts (uncached input, output, cache read,
  cache write). The pane sums observed counts, including repeated/smaller inputs, independently of its
  last-input growth history. No usage means no new entry. Effort is the input observed by this hook,
  not actual reasoning-token usage or proof that a later hook kept it; a model mismatch hides it.
  `agent.list`'s short `description`, `type` and full `id` are reused by the existing refresh. The saved
  declarations identify this as the loop's `agentId`, not `TaskCreated.task_id`; no messaging or task
  lookup is added. These fields and calculations are test-kit covered, not verified live.
  Main output joins the existing input/cache counters; subagent steps do not contribute to them.
  Main `session.id` is displayed from the identity already read for resets. No summary is generated.
- There is no agent selector on `session.usage`, and `agent.list` has no context history. Agent charts
  therefore describe changes in observed input totals (`last input`), not a separate host-reported
  context series. A server-side tool loop can aggregate several responses in one step's usage.
- `agent.list` provides running status. The saved declarations distinguish `pending`, `running`,
  `waiting`, `idle`, `completed`, `failed` and `killed`; only `running` counts in the band and zero is
  hidden. `agent.spawn` is observed and passed through unchanged. Spawn and completion use the same
  coalesced 100 ms refresh as context so a status installed after a hook returns is read again. The
  existing 30-second poll is the fallback. These transitions are test-kit covered, not verified live.
  This is task status, not a per-token activity signal. The declarations warn that a teammate in its own
  terminal pane can leave a stale roster status if that pane dies; the mod cannot infer a live process
  heartbeat from this API.
- The saved declarations expose a terminal `Client` with `surface.every`, automatically canceled on
  unmount, and desktop `Svg.isInteractive` for sandboxed SMIL playback. The activity indicator uses
  these without model or network calls. Mounting is test-kit covered; native playback and unmount
  cleanup are not verified live.
- `AbovePrompt` preserves the tree returned by `next(e)` below its own row. The host test fixture
  supplies a downstream renderer, making composition regressions visible on both surfaces.
