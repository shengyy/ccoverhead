# Product

This is the single source for what ccOverhead does, the rules it follows and what it will not do. How it
looks is in [docs/design.md](docs/design.md); what is verified today is in
[docs/status.md](docs/status.md).

## Purpose

ccOverhead is for people who work in Claude Code and want to know, without asking, how much of their
budget a session is using. It answers four questions from one band above the prompt: *how full is the
context window, how fast is it filling, how much quota is left, and is the prompt cache still warm?*

It shows figures; it never acts on them. Compacting, pausing or switching models stays the user's call.

## Concepts

- **Context window**: the model's window and how much of it the last response was answered over
  (uncached, cache-written and cache-read input together), as Claude Code's status line reports it.
- **Growth**: what a turn added to the context, the difference between consecutive context totals.
- **Quota window**: a subscription's 5-hour and weekly rate-limit windows, each a share used and a reset
  time, as the last response reported them.
- **Cache warmth**: whether the main conversation's last request read or wrote the prompt cache, and how
  long that cache lives.
- **Scale**: one ten-step color scale from safe to warning, shared by every figure in the band.

## Rules

### The band

- Groups read left to right from what changes every turn to what changes slowly: context with its growth
  chart, the 5-hour window, the weekly window, the cache.
- When the band is too narrow it drops, in order, the growth chart, the cache, the context token counts,
  the weekly reset, the 5-hour reset, then truncates. The context stays longest.
- It yields to a survey that holds the band, and draws nothing until it has a figure to show.

### Context

- The figure is the one Claude Code reports after each response. Before the first response of a window (a
  new session, after `/clear`, after compaction) it shows Claude Code's local `/context` estimate, dim and
  marked `~`; the estimate sends no request.
- If Claude Code cannot give an estimate, the band shows the window size with `--`, never a stale figure.

### Growth

- A total is recorded only when it changes; a drop (compaction) starts the history over. Eight totals are
  kept, which makes seven bars; fewer than two show no chart.
- Bar height is relative to the largest bar shown. Bar color is absolute: the bar's share of the window,
  in tiers that double from 0.1% (see [the scale](docs/design.md#color-scale)).
- `/clear`, `/resume` and `/branch` start another conversation: its growth history and cache state start
  empty.

### Quota

- Only the 5-hour and weekly windows are shown; a window whose reset time has passed is dropped.
- The weekly group follows the main model: when Claude Code reports a weekly window of the model's own, it
  shows that window, labeled with the model family (`7d fable`), and switches at once on `/model`;
  otherwise the all-models week. *Not verified*: no model's own window has reached a plugin yet, so it is
  recognized by its kind (one naming the family; for Fable, also a `scoped` one).
- Until a session has its own reading, it shows the last reading any session saw, dimmed. A session saves
  a reading only when its own figures change, so an idle session never overwrites a newer one.

### Cache

- Only main-conversation requests count, not subagents. A request that read or wrote the cache makes it
  warm for the cache lifetime from that moment; anything else, or an expired lifetime, is cold.

### Color

- One meaning everywhere: cool for safe, yellow for caution, warm to red for warning.
- Percentages (context and quota) move one tier per 10%, starting at the third tier so a figure is never
  drawn dimmer than the band's secondary text. Growth bars use all ten tiers.
- Labels are plain text: they name things, they are not states.

## Non-goals

- **No reading of files, processes or the network, and no model requests.** Every figure comes from what
  Claude Code already reports to plugins. In particular it does not read Claude Code's own caches or
  credentials to reach undocumented usage endpoints, even for figures plugins are not given (such as a
  model's own weekly quota).
- **No cost accounting.** It shows tokens and quota shares, not money, and it does not predict when a limit
  will be hit.
- **No actions.** It never compacts, clears, pauses or changes anything in the session.
- **No telemetry.** Nothing leaves the machine.
