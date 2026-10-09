# Status

What is true about ccOverhead right now. The version itself lives in `plugin/.claude-plugin/plugin.json`,
published versions on [Releases](https://github.com/shengyy/ccoverhead/releases), and the change history in
[CHANGELOG.md](../CHANGELOG.md). Update this page in the same PR as anything that changes what has been
verified.

## Surfaces

Claude Code raises the band's site (`AbovePrompt`) on the terminal and desktop surfaces only, and the
`/ccoverhead` pane's site (`Pane`) on every surface.

| | Terminal | Claude desktop app (Code tab) | VS Code, mobile |
|---|---|---|---|
| Band drawn | One line of text, block glyphs | Rows of text and Svg graphics | Not raised by Claude Code |
| Pane drawn | Lines of text, block glyphs | Rows of text and Svg graphics | Rows of text and Svg graphics |
| Covered by tests | Band and pane | Band and pane | Pane |
| Band seen in a live session | Yes, before 1.0.0: macOS 27, Terminal.app, Claude Code 2.1.288 | Yes, before 1.0.0: macOS 27, Claude Code 2.1.288 | — |
| Pane seen in a live session | Not yet: in a headless session the command runs and the pane is placed (2.1.289) | Not yet | Not yet |

## Verified

- The Claude desktop app's **Settings → Plugins → Discover** lists ccOverhead from **Anthropic
  Directory**; its detail page shows the installed release enabled. This confirms directory listing
  and discovery, not a fresh-install test or live acceptance of the new behavior described below. Installation
  instructions for both sources are in the [README](../README.md#install).
- In a live session (Claude Code 2.1.288, macOS 27): the band and its layout on the terminal, the desktop's
  Svg bar and growth chart, dark theme. The color scale and group order introduced in 1.0.0, and the
  cache colors, `rewrote`, `spend`, `agent` view and pane added since 1.2.0,
  are covered by the tests and by renders of the plugin's own output (`scripts/screenshot/`), not yet by a
  live look.
- In a headless session with the plugin loaded from this repository (Claude Code 2.1.289, Haiku 4.5, one
  Explore subagent): the plugin's state held the auto-compaction threshold (167k of 200k), the growth
  timeline, the main conversation's cache counts, the subagent with its type and three input totals, and
  the local breakdown by category; `/ccoverhead` ran as a headless prompt, printed nothing and its pane was
  placed; `/compact` on a continued conversation was recorded as one compaction with its sizes.
- In a headless session with the installed plugin: before the first response the plugin's state holds the
  window and the local estimate (about 13.8k tokens from `{ breakdown: 'summary' }`, about 20 ms, no
  request sent).
- With a command hook on `SessionStart` (Claude Code 2.1.289, Haiku 4.5, Claude Pro): a resume or fork
  reports the transcript's last context, its age and whether the cache likely lapsed; resumed after 343
  seconds the cache was still read, evidence for an hour's lifetime in that session.
- Installing from this repository: `claude plugin marketplace add shengyy/ccoverhead` then
  `claude plugin install ccoverhead@ccoverhead` (and `update` from 1.0.0) installs the released version
  enabled, the installed copy matches `plugin/` file for file, and it loads and records its state in a
  headless session.

Not verified live: light themes (matching text palettes are covered offline), `/clear` resetting Claude Code's own
plugin state (ccOverhead resets its values itself, covered by tests), plans other than Claude Pro, the
weekly group following a model's own window and a gateway's `spend_limit` (neither has reached a plugin;
covered by tests with fictional ones), the band following a subagent's transcript on screen and a model
switch leaving the cache cold (both from the declarations; covered by tests), and the pane on VS Code and
mobile.

Each Claude Code behavior these rely on, and the version it was checked against, is listed in
[claude-code-integration.md](claude-code-integration.md).

## Current offline validation

On Claude Code 2.1.295, the validator and test kit cover native cost, turn increments, running-agent
counts, theme colors (including `auto` using the dark text palette), downstream band preservation,
mid-turn context refresh, and conversation changes without classic events. Type checking uses the saved
2.1.289 declarations. Fictional previews cover dark
and light cost styling, lime agent spinners, and right-to-left narrowing that hides cost before agents
and preserves the growth chart (on the terminal; a proportional surface wraps instead, see
[claude-code-integration.md](claude-code-integration.md)). The cache lifetime rule (the session's evidence, else the
account's plan) and the request-traffic learning are covered by the test kit on both surfaces; they are **not verified
in a live session**. The Claude desktop app runs its own bundled Claude Code (2.1.289 seen in its log), not the
terminal's install, so the two can differ in version.
Activity uses a local terminal Client and an animated desktop SVG. The test kit checks mounting and
removal, one spinner per agent up to three plus overflow, four-row vector grids and synchronized phases.
Its frame clock checks progression across redraws and count changes without duplicating timers; native playback
is not verified live. Browser previews demonstrate the intended animation only.
Spawn/completion tests also cover running to waiting, idle, completed, failed and killed transitions,
including the host updating its list after a completion hook returns. Other unsignaled status changes
still wait for the existing 30-second poll; task status is not a per-token activity signal.
Pane tests on all four surfaces cover per-agent native short description and full ID, responding model,
optional requested effort (hidden when unknown or when another model answers), and observed input/output
and cache-read totals. Repeated/smaller inputs still accumulate, null usage adds nothing, and the existing
eight-entry bound starts a new observed period after eviction. These additions are not verified live.
The main pane shows the existing session ID and model plus observed requested effort and output tokens.
Tests cover isolation from subagent usage, compaction preserving totals, and model/session changes
clearing stale metadata; the session change clears all observed totals.
The window-average quota estimate is arithmetic-tested and pane-only. These
changes are **not verified in a live session**; no model requests were made for this validation.
Delayed-reading tests on terminal and desktop cover cost posted after completion, quota changes with
unchanged context, and identity/model/usage/breakdown reads that finish after a conversation clear,
including native reads inside measurement and request-completion handlers.
Settings-observation tests on both surfaces preserve allowed and denied results, display the host's
effective theme, and refresh auto-compaction after a change even if the theme read fails. A failed
display-state write cannot replace an allowed or denied decision or the host's own error.

## Known limitations

Accepted limitations are tracked as issues labeled
[`deferred`](https://github.com/shengyy/ccoverhead/issues?q=is%3Aissue+is%3Aopen+label%3Adeferred), each
saying why it waits and what would bring it back. They are not repeated here.
