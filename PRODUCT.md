# Product

This is the single source for what ccOverhead does, the rules it follows and what it will not do. How it
looks is in [docs/design.md](docs/design.md); what is verified today is in
[docs/status.md](docs/status.md).

## Purpose

ccOverhead is for people who work in Claude Code and want to know, without asking, how much of their
budget a session is using. It answers four questions from one band above the prompt: *how full is the
context window and how far is auto-compaction, how fast is it filling, how much quota is left, and is the
prompt cache still warm?* The `/ccoverhead` pane answers the follow-ups the band has no room for: *what is
in the window, how has it grown, how well is the cache working, and what have the session and its subagents used?*

It shows figures; it never acts on them. Compacting, pausing or switching models stays the user's call.

## Concepts

- **Context window**: the model's window and how much of it the last response was answered over
  (uncached, cache-written and cache-read input together), as Claude Code's status line reports it.
- **Auto-compaction threshold**: the context total at which Claude Code compacts on its own, from its local
  `/context` count; none while auto-compaction is off.
- **Growth**: what a turn added to the context, the difference between consecutive context totals.
- **Quota window**: a subscription's 5-hour and weekly rate-limit windows, each a share used and a reset
  time, as the last response reported them.
- **Cache warmth**: whether the main conversation's last request read or wrote the prompt cache, and how
  long that cache lives.
- **Cache rewrite**: a main-conversation request that read back less than half of what the request before it
  sent, so it wrote the prefix to the cache again (the cache lapsed, the model changed).
- **Hit rate**: the share of the main conversation's input tokens the cache served since the conversation
  started.
- **Subagent context**: a subagent's own input total, as its last request reported it.
- **Cost**: the native session USD ledger, an API-price reference. A turn's increment is the difference
  from its starting ledger; it includes any work the host charges to that session. Missing readings stay hidden.
- **Scale**: one ten-step color scale from safe to warning for usage; money has a fixed gold accent.

## Rules

### The band

- Groups read left to right from what changes every turn to what changes slowly: the conversation's own
  state first (context with its growth chart, then the cache, which every request renews), then the
  account's quota (the 5-hour window, the weekly window, a gateway's spend limit).
- When the band is too narrow it drops, in order, the turn cost increment, the growth chart, the cache
  rewrite, the cache, the context token counts, the session cost, the weekly and spend resets, the 5-hour reset, then truncates. The context stays
  longest.
- Cost follows quota: a gold session total and a secondary turn increment. A running-agent count follows
  when nonzero; idle and completed agents do not count.
- It yields to a survey that holds the band, preserves the downstream band, and draws nothing until it has a figure to show.
- While a subagent's transcript is on screen, the context group shows that agent instead, labeled `agent`:
  its last input total, its growth, and its bar and percentage when it runs the model the context window was
  last read for (the only window Claude Code reports); otherwise, and after a model switch until the next
  reading, its tokens alone. Quota and cache stay the account's and the main
  conversation's.

### Context

- The figure is Claude Code's own reading, refreshed between requests within a turn; growth is recorded
  only by the end-of-turn measurement. It is never reconstructed from summed step usage. Before the first response of a window (a
  new session, after `/clear`, after compaction) it shows Claude Code's local `/context` estimate, dim and
  marked `~`; the estimate sends no request.
- If Claude Code cannot give an estimate, the band shows the window size with `--`, never a stale figure.
- The band draws no auto-compaction mark: on a 1M window the threshold (967k) sits at the bar's end, where
  a mark read as a separator and said no more than the bar's end. The pane gives the threshold and the
  tokens to go, read with the same local count as the estimate, so it costs no request.

### Growth

- A total is recorded only when it changes; a compaction of the main conversation, as Claude Code reports
  it, starts the history over, and so does a drop no compaction announced. Eight totals are
  kept, which makes seven bars; fewer than two show no chart.
- Bar height is relative to the largest bar shown. Bar color is absolute: the bar's share of the window,
  in tiers that double from 0.1% (see [the scale](docs/design.md#color-scale)).
- `/clear`, `/resume` and `/branch` start another conversation: its growth history, cache state and subagents start
  empty.

### Quota

- The band shows the 5-hour and weekly windows and a Claude gateway's spend limit; a window whose reset
  time has passed is dropped, and so is one a later reading no longer reports. A spend limit may have no
  reset time and may go past 100%. *Not verified*: no
  spend limit has reached a plugin yet.
- The weekly group follows the main model: when Claude Code reports a weekly window of the model's own, it
  shows that window, labeled with the model family (`7d fable`), and switches at once on `/model`;
  otherwise the all-models week. *Not verified*: no model's own window has reached a plugin yet, so it is
  recognized by its kind (one naming the family; for Fable, also a `scoped` one).
- Until a session has its own reading, it shows the last reading any session saw, dimmed. A session saves
  a reading only when its own figures change, so an idle session never overwrites a newer one.

### Cache

- Only main-conversation requests count, not subagents. A request that read or wrote the cache makes it
  warm for the cache lifetime from that moment; anything else, or an expired lifetime, is cold.
- The lifetime stays unknown (`TTL unknown`) until a model switch reports the session's own (`5m` or
  `1h`), or a resume shows it: the engine's verdict on a cache between five minutes and an hour old tells the two apart. A
  switch to another model leaves the cache cold: each model has its own.
- A resumed or forked conversation shows its cache warm or cold at once, aged from the transcript's last
  response, and its first request counts as a rewrite when it writes the transcript again.
- `warm` and its minutes share one color: the share of the lifetime gone, on the percentage scale, as a
  quota's share used is, so the cache warms toward red as a pause nears a rewrite.
- A rewrite shows `rewrote` and its tokens until a request of a later turn reads the cache again. The first
  request after a compaction is not counted as one: it writes a new conversation, not a lapsed cache.

### The pane

- `/ccoverhead` opens it; it only displays, and the command writes nothing to the conversation, also when
  the surface cannot place the pane yet.
- It is raised on every surface Claude Code has, so it is the one view on VS Code and mobile.
- Sections: the context with the threshold and the tokens left to it; `/context`'s local estimate by
  category with the five costliest MCP servers' loaded tool schemas (and how many more there are); the
  growth since the last compaction and the last three compactions' sizes before and after; the cache's
  state, hit rate and token counts; quota and a compact exhaustion estimate; native cost and turn increment;
  the eight most recently active subagents with type, model family, last context total and growth.
- The estimate uses the window-average formula also used by
  [WeekToken](https://github.com/3dnow/claude-mods/blob/main/weektoken/hooks/pace.ts): remaining duration = elapsed duration × (1 − used share)
  / used share. It is marked `≈`, appears only in the pane, and says when reset comes first. Missing,
  early, expired, zero/full and stale readings have no forecast. The existing quota bar overlays projected additional usage in a lighter shade; it adds no time-progress
  bar or history. The projected percentage may exceed 100%, while the bar stops at 100%.
- The breakdown is always the latest local count's: a compaction or a switch to another model drops it at
  once, and a count the engine refuses leaves none, never an older one. A switch also drops the old model's
  auto-compaction threshold.

### Color

- One meaning everywhere: cool for safe, yellow for caution, warm to red for warning.
- Percentages (context and quota) move one tier per 10%, starting at the third tier so a figure is never
  drawn dimmer than the band's secondary text. Growth bars use all ten tiers.
- Labels are plain text: they name things, they are not states. Money stays gold regardless of amount.
- Text uses the configured dark/light palette; other themes keep Claude Code semantic colors.

## Non-goals

- **No reading of files, processes or the network, and no model requests.** Every figure comes from what
  Claude Code already reports to plugins. In particular it does not read Claude Code's own caches or
  credentials to reach undocumented usage endpoints, even for figures plugins are not given (such as a
  model's own weekly quota).
- **No independent billing system.** It reads native cost, never keeps model prices or presents subscription
  usage as an extra invoice. Forecasts use existing quota readings without persistent sampling.
- **No notifications.** It never raises a toast or a sound; the band's colors are the warning.
- **No actions.** It never compacts, clears, pauses or changes anything in the session.
- **No telemetry.** Nothing leaves the machine.
