# Docs

The map of every document and directory in this repository, and the rules for writing them. `docs/` holds
only long-lived **current** facts that every maintainer needs; history lives in Git, pull requests and
[CHANGELOG.md](../CHANGELOG.md).

## Core documents

| Document | Only responsibility |
|---|---|
| [README.md](../README.md) / [README.zh-CN.md](../README.zh-CN.md) | Entry for users: what it is, install, use. The two are kept in sync |
| [PRODUCT.md](../PRODUCT.md) | What ccOverhead does, its rules and its non-goals |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Human workflow: setup, checks, issues, pull requests |
| [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md) | Boundaries and routing for coding agents, loaded every session |
| [SECURITY.md](../SECURITY.md) | What is read, what is stored, what is sent, how to report a vulnerability |
| [CHANGELOG.md](../CHANGELOG.md) | User-visible changes per version |
| [status.md](status.md) | What is true now: Claude Code versions and surfaces verified |
| [architecture.md](architecture.md) | Code map, data flow, plugin state |
| [claude-code-integration.md](claude-code-integration.md) | Every external fact about Claude Code's mod API, with the version it was verified on |
| [design.md](design.md) | How it looks: the band, the color scale, desktop drawing, logo, screenshots |
| [release.md](release.md) | Versioning and the release steps |

## Directories

| Directory | Only holds |
|---|---|
| `.claude-plugin/` | The marketplace manifest: this repository is its own marketplace |
| `plugin/` | The mod: manifest, hooks module, `$.state` contract, tests |
| `assets/brand/` | The logo source (SVG) |
| `assets/screenshots/` | Rendered screenshots for the README; regenerate, never hand-edit |
| `scripts/screenshot/` | The screenshot renderer and its fictional figures |
| `docs/` | The documents above |
| `.github/` | CI; issue and pull request templates |

A new directory needs one responsibility and a row here in the same change.

## Writing rules

- **One owner per fact.** Other documents link to it instead of repeating it.
- **Current state only.** Documents describe how things are now. No plans, dated logs or "previously"
  notes; history is in Git, pull requests and the changelog.
- **Work items live in issues, not documents.** To-dos are open issues; accepted limitations carry the
  `deferred` label and say why they wait and what would bring them back; open questions carry
  `needs-decision`. Documents link to an issue or label instead of listing them.
- **Verified, then written.** Facts about Claude Code are recorded only after checking them in a real
  session, with the version; anything unchecked is marked *not verified*.
- **Language.** User and contributor documents are in English; `AGENTS.md` and `CLAUDE.md` are in Chinese,
  the maintainers' working language. The two READMEs are kept in sync.
- **Names.** Files and directories use lowercase kebab-case, except the conventional root files
  (`README.md`, `AGENTS.md`, …).
- **Nothing private.** No transcripts, prompts, accounts or absolute paths from someone's machine; use
  repository-relative paths and `<placeholder>`s.

## Context layers

| Layer | Loaded | Holds |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | Every agent session | Boundaries that hold for every task, and routing |
| `PRODUCT.md`, `docs/**` | When a task needs them | The full rules and facts |

A rule lives in exactly one layer: `AGENTS.md` states the boundary and links to the owner of the detail.
