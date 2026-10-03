# Security

ccOverhead runs inside Claude Code with the access Claude Code grants a plugin. This page states what it
reads, what it keeps, and what it sends.

## What is read

Only figures Claude Code reports to plugins: the context window and its fill, the rate-limit windows, the
token usage of each main-conversation request, the session's local `/context` estimate, and the main loop's
model id. ccOverhead does
not read the conversation, your prompts, files or the environment.

`claude plugin validate plugin` lists every engine call the module makes; today they are `$.session.usage`,
`$.session.model`, `$.clock`, `$.state`, `$.store` and `$.ui`.

## What is stored

| Data | Location |
|---|---|
| The session's figures: context, growth history, quota, cache time | Claude Code's per-session plugin state (`$.state`), in memory |
| The last quota reading: each window's kind, share used and reset time | Claude Code's per-plugin store (`$.store`, key `limits`) |

Nothing else is written. No tokens, prompts or identifiers are stored.

## What is sent, and to whom

Nothing. ccOverhead makes no network requests, starts no processes and makes no model requests, so it adds
nothing to your usage.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting
(<https://github.com/shengyy/ccoverhead/security/advisories/new>) rather than a public issue. Include the
ccOverhead and Claude Code versions and the steps to reproduce, without transcripts or credentials.
