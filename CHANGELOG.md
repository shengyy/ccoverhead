# Changelog

All notable changes to ccOverhead are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The band preserves content drawn by later mods and Claude Code. Main-context readings refresh between
  requests, and native session/command observations recover changes when `classic.*` is unavailable.
- Cache warmth no longer assumes an hour before the engine reports a lifetime; a long response does not
  extend the countdown. Light-theme text uses the light palette.

### Changed

- The website build takes its version and color scale from the plugin, keeping the public introduction
  aligned with the code it illustrates.
- The website presents the detail pane, cache rewrites, resume behavior and subagent view alongside the
  band, with current fictional previews, a revised layout and keyboard-accessible surface tabs.
- The website uses a warm dark palette and a centered layout that scales up to a 1584px content width,
  preserving side margins on large displays and a readable measure for paragraphs. Product previews
  are rendered at 4x for wide and high-density displays.

### Added

- Session cost and the latest turn's increase from Claude Code's own cost ledger: a gold total with a
  secondary delta, hidden when unavailable. Running agents appear only while the count is nonzero.
- A pane-only quota exhaustion estimate at the current window's average pace; early, expired or stale
  readings have no forecast. The detail quota bar shades projected use by reset; no time progress bars
  or persistent history are added.
- Website previews for a cache rewrite and the band while viewing a subagent's transcript.

## [1.4.0] - 2026-10-04

### Removed

- The auto-compaction mark on the context bar: on a 1M window the threshold (967k) sat at the bar's end,
  where `│` read as a separator between the bar and its figures. The pane still gives the threshold and the
  tokens to go.
- The cache's lifetime gauge (the terminal's block glyph, the desktop's ring), which repeated the minutes:
  the band reads `cache warm 38m`.

### Changed

- The cache's minutes, dim before, share `warm`'s color, which follows the share of the lifetime gone on
  the percentage scale.
- A resumed or forked conversation shows its cache warm or cold at once, aged from its last response, and
  counts its first request as a rewrite when the cache had lapsed. A resume between five minutes and an
  hour after the last response also tells the band whether the account's cache lifetime is five minutes or
  an hour.
- The pane colors each `/context` category by its share of the window, as the context bar is colored,
  instead of on the growth scale, where a large `Messages` row read as an alarm.
- Two of the pane's longer notes are shorter, so they fit a narrow pane.

### Fixed

- A quota reset time that does not parse is treated as none: the band no longer shows `↻NaNm`.
- The pane cuts a long quota window name to its column instead of wrapping the line.
- A subagent the agent list did not have at its first request is named once the list has it.
- The pane no longer says where auto-compaction runs for a threshold at or past the window's end.

## [1.3.0] - 2026-10-04

### Added

- An auto-compaction mark on the context bar (`│` in the terminal, a tick on the desktop), at the threshold
  Claude Code's local `/context` count reports, warming as the context nears it; none while auto-compaction
  is off.
- A `/ccoverhead` pane, on every surface including VS Code and mobile: the context with the tokens left to
  auto-compaction, `/context`'s breakdown by category and by MCP server, growth since the last compaction
  and the last three compactions, the cache's state, hit rate and token counts, every quota window with the
  share of its time gone, and the eight most recently active subagents. The command adds nothing to the
  conversation.
- The band follows a subagent while its transcript is on screen, labeled `agent`: its context, growth and,
  on the main loop's model, its bar. Not verified live.
- `rewrote` in the cache group when a turn's request read back less than half of the previous request and
  wrote the cache again, sized and colored like a growth bar, until a request of a later turn reads the
  cache again. The first request after a compaction does not count.
- A Claude gateway's `spend_limit` window as a `spend` group, which can pass 100% and may have no reset.
  Not verified live.
- A pane screenshot in the READMEs.

### Changed

- `warm` takes its color from the share of the cache lifetime gone, cool when fresh and red in the last
  minutes, with a gauge of the lifetime left before it: one block glyph in the terminal (`cache ▆ warm
  38m`), a draining ring on the desktop.
- Growth starts over at a compaction as Claude Code reports it, not only when the context total drops.
- The cache group comes right after the context, before the quota: the conversation's own state first, the
  account's after it.
- A model switch leaves the cache cold and sets its lifetime from the switch's `cache_ttl`.

## [1.2.0] - 2026-10-04

### Added

- Detailed design sheets for layout, color thresholds and state rules in English and Simplified Chinese,
  embedded under Design rationale in the matching README.
- An English README inside the plugin folder for installation and usage, linking to the full documentation
  and design sheets.
- A PNG directory icon rendered from the existing logo and the display name `ccOverhead`.
- A public showcase website under `site/` with interactive surface switcher, 10-tier color scale visualizer,
  one-click install command copy and automated GitHub Pages deployment.

### Fixed

- Directory validation of the hooks module: avoid the JSX compiler's reserved `h` name and return the
  lifecycle hook's downstream result directly without changing the first message or permission decisions.

## [1.1.0] - 2026-10-04

### Added

- The weekly group follows the main model: when Claude Code reports a weekly window of the model's own, it
  shows that window as `7d <family>` (for example `7d fable`) and switches at once on `/model`. Not verified:
  no such window has reached a plugin yet; without one the band is unchanged.

## [1.0.0] - 2026-10-04

### Added

- A band above the Claude Code prompt with the context window, each turn's growth, the 5-hour and weekly
  quota and prompt-cache warmth, ordered from what changes every turn to what changes slowly.
- The context bar, used percentage and token counts; before the first response of a window, Claude Code's
  local `/context` estimate marked `~`.
- A seven-bar growth chart with the latest turn's `↑` figure, each bar colored by its share of the window
  in ten tiers that double from 0.1%.
- Quota windows with reset countdowns; a new session shows the last reading, dimmed, until its own arrives.
- Prompt-cache warmth from the main conversation's last request, with the minutes it stays warm.
- One ten-step color scale from safe (cool) to warning (warm) for every figure, readable for red-green
  color-blind users.
- Terminal rendering in block glyphs and desktop rendering in vector graphics, which line up in the desktop
  app's proportional font; a light-theme palette for the desktop graphics.
- Graceful narrowing: the chart, the cache and details drop before the context.

### Verified

- Claude Code 2.1.288 on macOS 27: the terminal (Terminal.app) and the Claude desktop app's Code tab.
