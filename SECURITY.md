# Security

ccOverhead runs inside Claude Code with the access Claude Code grants a plugin. This page states what it
reads, what it keeps, and what it sends.

## What is read

Only figures Claude Code reports to plugins: the context window and its fill, the rate-limit windows, the
token usage of each request (the main conversation's and each subagent's), the session's local `/context`
count (tokens by category, the auto-compaction threshold, and the names of MCP servers with their tool
schemas' tokens), the main loop's model id, each subagent's type and running status, the native USD
cost ledger, the theme, an in-memory session id to detect conversation changes, and each compaction's
size before and after. ccOverhead does not read the conversation, your prompts, a subagent's task, files or the
environment; its compaction hook passes the compaction on unchanged and reads only the sizes.

`claude plugin validate plugin` lists every engine call the module makes; today they are `$.session.usage`
(plain, and with the local `summary` breakdown, never `full`, which would send token-count requests),
`$.session.model`, `$.session.id`, `$.config.list` (theme only), `$.agent.list`, `$.command.register` (the `/ccoverhead` command), `$.clock`, `$.state`,
`$.store` and `$.ui` (drawing, redrawing and opening the pane).

The terminal activity icon runs in a one-cell surface module with no mods API. Its local clock changes
only a braille glyph while mounted; it sends no messages. The desktop icon is a script-free SVG animation.

## What is stored

| Data | Location |
|---|---|
| The session's figures: context and auto-compaction threshold, growth history, quota, cache time and token counts, subagents' types, models and token totals, `/context`'s tokens by category and by MCP server name, cost and turn baseline, theme, session id and the last live quota observation time | Claude Code's per-session plugin state (`$.state`), in memory |
| The last quota reading: each window's kind, share used and reset time | Claude Code's per-plugin store (`$.store`, key `limits`) |

Nothing else is written. No credentials, prompts or file paths are stored, and the `/ccoverhead` command
adds nothing to the conversation.

## What is sent, and to whom

Nothing. ccOverhead makes no network requests, starts no processes and makes no model requests, so it adds
nothing to your usage.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting
(<https://github.com/shengyy/ccoverhead/security/advisories/new>) rather than a public issue. Include the
ccOverhead and Claude Code versions and the steps to reproduce, without transcripts or credentials.
