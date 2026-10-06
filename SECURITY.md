# Security

ccOverhead runs inside Claude Code with the access Claude Code grants a plugin. This page states what it
reads, what it keeps, and what it sends.

## What is read

Only usage and agent metadata Claude Code reports to plugins: the context window and its fill, the rate-limit windows, the
token usage of each request (the main conversation's and each subagent's), the session's local `/context`
count (tokens by category, the auto-compaction threshold, and the names of MCP servers with their tool
schemas' tokens), the main loop's model id and optional requested effort, each subagent's ID, type, short task description, running status,
responding model and optional requested effort, the native USD
cost ledger, the theme, an in-memory session id to detect conversation changes, and each compaction's
size before and after. ccOverhead does not read the conversation, full prompts, a subagent's spawn prompt, files or the
environment; its compaction hook passes the compaction on unchanged and reads only the sizes.

`claude plugin validate plugin` lists every engine call the module makes; today they are `$.session.usage`
(plain, and with the local `summary` breakdown, never `full`, which would send token-count requests),
`$.session.model`, `$.session.id`, `$.config.list` (theme only), `$.agent.list`, `$.command.register` (the `/ccoverhead` command), `$.clock`, `$.state`,
`$.store` and `$.ui` (drawing, redrawing and opening the pane).

The terminal activity row runs in a surface module of at most three cells with no mods API. One local
clock changes only its braille glyphs; it sends no messages. The desktop uses a script-free SVG animation.
The `agent.spawn` hook observes a spawn initiated by the host and passes it through unchanged; this mod
never calls `$.agent.spawn`. Spawn and completion schedule a local status refresh on the existing timer.

## What is stored

| Data | Location |
|---|---|
| The session's figures: context and auto-compaction threshold, growth history, quota, cache time and token counts, subagents' IDs, types, short descriptions, models, requested effort and observed input/output/cache-read totals, `/context`'s tokens by category and by MCP server name, cost and turn baseline, theme, session id and the last live quota observation time | Claude Code's per-session plugin state (`$.state`), in memory |
| The last quota reading: each window's kind, share used and reset time | Claude Code's per-plugin store (`$.store`, key `limits`) |

Nothing else is written. Credentials, full prompts, transcripts and file contents are not collected.
Short task descriptions are treated as display text and stay in session memory; they may contain words
from the task. They come directly from `agent.list`, with no summarization or extra model request.
The `/ccoverhead` command adds nothing to the conversation.

## What is sent, and to whom

Nothing. ccOverhead makes no network requests, starts no processes and makes no model requests, so it adds
nothing to your usage.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting
(<https://github.com/shengyy/ccoverhead/security/advisories/new>) rather than a public issue. Include the
ccOverhead and Claude Code versions and the steps to reproduce, without transcripts or credentials.
