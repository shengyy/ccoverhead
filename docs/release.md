# Release

## Version

`plugin/.claude-plugin/plugin.json` is the only version source. Releases follow
[SemVer](https://semver.org). Claude Code caches an installed plugin by its version, so every release that
users should receive needs a new version; `/plugin update` does nothing for an unchanged one.

## How users get it

The official Anthropic Directory tracks this repository's `main` branch and the `plugin/` folder.
Each detected commit is validated and scanned; the listing keeps serving its last published version
until a new one is published. This plugin requires an Anthropic reviewer to publish each version.
After merging a release, open the existing submission in the
[developer portal](https://claude.ai/directory/manage) and select **Check for new commits** to check
immediately. Resolve blocking findings on **Review**, then request **Publish update** when available.
A passing scan or a GitHub Release alone does not confirm that the directory update is live.
See the [official publication guide](https://claude.com/docs/plugins/submit#update-a-published-plugin).

The repository is its own marketplace (`.claude-plugin/marketplace.json`, plugin source `./plugin`).
`/plugin marketplace add shengyy/ccoverhead` reads the default branch, so a merged version bump is what
users receive on their next `/plugin marketplace update ccoverhead` and `/plugin update
ccoverhead@ccoverhead`. A GitHub release marks the version and carries its notes.

## Steps

Releases are run end to end by the maintainer's coding agent with `gh`; nobody needs to open the browser.
The maintainer decides *when*; the agent does the rest.

1. **Prepare in a normal PR.** Make sure [status.md](status.md) matches what this version was verified on,
   move `CHANGELOG.md`'s `[Unreleased]` entries under `## [X.Y.Z] - YYYY-MM-DD`, and set `version` in
   `plugin/.claude-plugin/plugin.json`. Regenerate the screenshots if the look changed. Merge it through the
   usual draft → ready → `gate` flow.
2. **Check what users will install.** In a signed-in Claude Code:

   ```bash
   claude plugin marketplace update ccoverhead
   claude plugin update ccoverhead@ccoverhead      # or install, on a clean machine
   claude plugin list                              # ccoverhead@ccoverhead must show X.Y.Z, enabled
   ```

3. **Publish the release.** Write the notes from the version's `CHANGELOG.md` section, then:

   ```bash
   gh release create vX.Y.Z --target main --title "ccOverhead X.Y.Z" --notes-file <notes.md>
   gh api repos/shengyy/ccoverhead/releases/latest --jq .tag_name   # must print vX.Y.Z
   ```

   Publishing creates the tag on `main`'s current commit.

4. **Request the directory update.** Complete the existing submission's scan and publish request above.
   Confirm the version and commit under **Live now** before reporting a directory release as published;
   if Anthropic review is pending, report it as submitted for review instead.
