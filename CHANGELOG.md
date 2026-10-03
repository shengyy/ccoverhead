# Changelog

All notable changes to ccOverhead are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
