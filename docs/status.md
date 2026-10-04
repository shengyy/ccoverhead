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

- In a live session (Claude Code 2.1.288, macOS 27): the band and its layout on the terminal, the desktop's
  Svg bar and growth chart, dark theme. The color scale and group order introduced in 1.0.0, and the
  cache state colors, `rewrote`, `spend`, `agent` view and pane added since 1.2.0,
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
- Installing from this repository: `claude plugin marketplace add shengyy/ccoverhead` then
  `claude plugin install ccoverhead@ccoverhead` (and `update` from 1.0.0) installs the released version
  enabled, the installed copy matches `plugin/` file for file, and it loads and records its state in a
  headless session.

Not verified: light themes (the text colors are tuned for dark ones), `/clear` resetting Claude Code's own
plugin state (ccOverhead resets its values itself, covered by tests), plans other than Claude Pro, the
weekly group following a model's own window and a gateway's `spend_limit` (neither has reached a plugin;
covered by tests with fictional ones), the band following a subagent's transcript on screen and a model
switch leaving the cache cold (both from the declarations; covered by tests), and the pane on VS Code and
mobile.

Each Claude Code behavior these rely on, and the version it was checked against, is listed in
[claude-code-integration.md](claude-code-integration.md).

## Known limitations

Accepted limitations are tracked as issues labeled
[`deferred`](https://github.com/shengyy/ccoverhead/issues?q=is%3Aissue+is%3Aopen+label%3Adeferred), each
saying why it waits and what would bring it back. They are not repeated here.
