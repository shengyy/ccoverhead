# ccOverhead

Your Claude Code overhead, right overhead. ccOverhead is a Claude Code mod that puts context usage,
per-turn growth, 5-hour and weekly quota, and prompt-cache warmth in one quiet
band above the prompt. One cool-to-warm color scale makes changes easy to notice while you work. Type
`/ccoverhead` for a pane with the detail: where auto-compaction runs, the window by category and MCP server, growth and compactions,
cache hit rate, quota with a shaded projection at the window-average pace, native cost, and subagents.

The band uses text and glyphs in the terminal, and vector graphics in the Claude desktop app's Code tab.
It reads only figures Claude Code already reports: no user files, network requests, model requests or
telemetry. Compacting, pausing and switching models remain your decisions.

## Install and use

In Claude Code:

```text
/plugin marketplace add shengyy/ccoverhead
/plugin install ccoverhead@ccoverhead
/reload-plugins
```

The band appears above the prompt when figures are available. Quota appears only when the host reports
it. `/ccoverhead` opens the pane on every surface, VS Code and mobile included. See the [full English README](https://github.com/shengyy/ccoverhead#requirements) for requirements,
updates and the group-by-group explanation, and
[verified behavior](https://github.com/shengyy/ccoverhead/blob/main/docs/status.md) for tested surfaces
and remaining limitations.

## Design rationale

Four signals share one band and one visual scale. Secondary details yield first when space is tight,
keeping context visible longest. The following diagrams use fictional figures and
illustrate the [design specification](https://github.com/shengyy/ccoverhead/blob/main/docs/design.md).

![Layout and color: desktop and terminal drawing, narrowing stages, palettes and thresholds](https://raw.githubusercontent.com/shengyy/ccoverhead/main/assets/screenshots/design-layout-en.png)

![States and data: estimates, saved quota, cache warmth, lifecycle and verification boundaries](https://raw.githubusercontent.com/shengyy/ccoverhead/main/assets/screenshots/design-states-en.png)

## Privacy and license

On session start and after `/clear`, `/resume` or `/branch`, the lifecycle hook refreshes only
ccOverhead's numeric state and clears its growth, cache and subagent history. It forwards the original event and
the downstream result unchanged, preserving the first message, instructions and permission decisions.
Other hooks observe usage and model changes; the render hooks only draw the band and the pane, and the
`/ccoverhead` command adds nothing to the conversation.

Session figures stay in memory. Only the last quota reading is kept in Claude Code's plugin store so a
new session can show it until its own arrives. See the
[privacy details](https://github.com/shengyy/ccoverhead/blob/main/SECURITY.md).

Released under the [MIT license](https://github.com/shengyy/ccoverhead/blob/main/LICENSE).
ccOverhead is an independent project, not affiliated with or endorsed by Anthropic.
