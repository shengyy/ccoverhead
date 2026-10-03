# Contributing

Thanks for helping. This page is the human workflow; repository rules for coding agents live in
[`AGENTS.md`](AGENTS.md), and the code map in [`docs/architecture.md`](docs/architecture.md).

## Setup

- [Claude Code](https://code.claude.com) 2.1.288 or later, signed in. It runs the mod, its tests and its
  validator.
- [Bun](https://bun.sh) for the type check and the screenshot renderer. Nothing is installed globally: the
  commands below fetch TypeScript on demand.
- For screenshots only: Google Chrome and ImageMagick.

Load the mod from your checkout for one session; saving a file reloads it:

```bash
claude --plugin-dir ./plugin
```

The first load also writes Claude Code's API declarations for your version into
`plugin/.claude-plugin/types/` (ignored by Git) and the `tsconfig.json` the type check extends. Run it once
before the first type check.

If the marketplace build is installed too, disable it for that session or uninstall it first, so only one
copy draws the band.

## Checks

```bash
claude plugin validate .                     # the marketplace manifest
claude plugin validate plugin                # the plugin manifest, hooks and $.state contract
bunx --package typescript tsc -p plugin      # strict type check, tests included
claude plugin test plugin                    # behaviour, on the terminal and desktop surfaces
```

CI runs the validator and the tests on every pull request. The type check needs the declarations a signed-in
session writes, so it runs locally only; run it before marking a pull request ready.

### Screenshots

```bash
bun scripts/screenshot/render.ts
bun scripts/screenshot/design.ts
```

Renders `assets/screenshots/{terminal,desktop}.png` and the bilingual `design-*.png` sheets from the
plugin's own formatting code and shared fictional figures in `scripts/screenshot/fixture.ts`. Regenerate
them when the band's look changes; never commit screenshots of a real session. The design sheets are
embedded in the matching README, with English used for submissions.

## Pull requests

`main` is protected for everyone, maintainers included: no direct pushes, changes land through pull
requests only.

1. Branch from `main` and open a **draft** PR early. CI skips drafts.
2. When the checks above pass locally, mark the PR **ready for review**. CI then runs; the `gate` check
   must pass and the branch must contain the latest `main`.
3. Maintainers squash-merge.

- One focused change per PR, with a short imperative title.
- Add an entry under `[Unreleased]` in `CHANGELOG.md` for user-visible changes, and bump `version` in
  `plugin/.claude-plugin/plugin.json` when releasing (Claude Code caches plugins by version).
- Update both `README.md` and `README.zh-CN.md` when either changes.
- A fact about Claude Code's behavior goes into
  [`docs/claude-code-integration.md`](docs/claude-code-integration.md) with the version you checked it on.
- Never paste transcripts, prompts or anything from a real session into issues, tests or screenshots.

## Issues

Issues are the only to-do list; documents link to them instead of keeping their own.

- `bug`, `enhancement`: reports and requests. Check them against [PRODUCT.md](PRODUCT.md) first,
  especially its non-goals.
- `deferred`: known and accepted for now. The issue says why it waits and what would bring it back.
- `needs-decision`: waiting on a maintainer decision.
- `help wanted`, `good first issue`: good places to start.

Releases are cut by the maintainer (run end to end by their coding agent); see
[`docs/release.md`](docs/release.md).
