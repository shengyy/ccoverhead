# Status

What is true about ccOverhead right now. The version itself lives in `plugin/.claude-plugin/plugin.json`,
published versions on [Releases](https://github.com/shengyy/ccoverhead/releases), and the change history in
[CHANGELOG.md](../CHANGELOG.md). Update this page in the same PR as anything that changes what has been
verified.

## Surfaces

Claude Code raises the band's site (`AbovePrompt`) on the terminal and desktop surfaces only.

| | Terminal | Claude desktop app (Code tab) | VS Code, mobile |
|---|---|---|---|
| Drawn | One line of text, block glyphs | Rows of text and Svg graphics | Not raised by Claude Code |
| Covered by tests | Yes | Yes | — |
| Seen in a live session | Yes, before 1.0.0: macOS 27, Terminal.app, Claude Code 2.1.288 | Yes, before 1.0.0: macOS 27, Claude Code 2.1.288 | — |

## Verified (1.0.0)

- In a live session (Claude Code 2.1.288, macOS 27): the band and its layout on the terminal, the desktop's
  Svg bar and growth chart, dark theme. The 1.0.0 color scale and group order are covered by the tests and
  by renders of the plugin's own output (`scripts/screenshot/`), not yet by a live look.
- In a headless session with the installed plugin: before the first response the plugin's state holds the
  window and the local estimate (about 13.8k tokens from `{ breakdown: 'summary' }`, about 20 ms, no
  request sent).
- Installing from this repository: `claude plugin marketplace add shengyy/ccoverhead` then
  `claude plugin install ccoverhead@ccoverhead` installs 1.0.0 enabled, the installed copy matches
  `plugin/` file for file, and it loads and records its state in a headless session.

Not verified: light themes (the text colors are tuned for dark ones), `/clear` resetting Claude Code's own
plugin state (ccOverhead resets its values itself, covered by tests), plans other than Claude Pro, and the
weekly group following a model's own window (no such window has reached a plugin; covered by tests with a
fictional one).

Each Claude Code behavior these rely on, and the version it was checked against, is listed in
[claude-code-integration.md](claude-code-integration.md).

## Known limitations

Accepted limitations are tracked as issues labeled
[`deferred`](https://github.com/shengyy/ccoverhead/issues?q=is%3Aissue+is%3Aopen+label%3Adeferred), each
saying why it waits and what would bring it back. They are not repeated here.
