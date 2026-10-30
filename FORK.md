# Fork of [pi](https://github.com/earendil-works/pi)

## Why this fork exists

One reason: **moving a session from another directory into the directory Pi was started from, from the `/resume` picker.** Everything else here is infrastructure for distributing that. If upstream ever accepts session moves, the reason disappears and the rest is plumbing to drop back onto upstream `main`.

Upstream declined it: issue [#11583](https://github.com/earendil-works/pi/issues/11583) was closed `no-action`. The suggested alternative, `pi --session <id>` per session, is unusable at 50-60 sessions. Do not relitigate that issue.

## Changes

Status means upstream intent, not effort: `never` would be rejected on sight, `unfiled` is upstream-owned and reportable, `ours` is fork-only machinery.

| Cluster | New files | Files it modifies in upstream | Status |
| --- | --- | --- | --- |
| Session move: `app.session.move`, `Ctrl+Y` in the picker | `src/core/session-move.ts`, `src/core/session-ownership.ts`, `src/core/session-delete.ts` | `src/core/keybindings.ts`, `src/core/session-manager.ts`, `src/core/agent-session-runtime.ts`, `src/modes/interactive/components/session-selector.ts`, `src/modes/interactive/interactive-mode.ts`, `src/core/export-html/index.ts`, `schemas/keybindings.schema.json` | rejected #11583 |
| Release staging: build, rename, version, publish | `scripts/publish-patched.mjs`, `patch/README.fork.md` | none; writes `patch/update-info.json` on each publish | never |
| Update endpoint: `pi update` resolves from this fork's releases, and says so when pi.dev is ahead of the fork's base | none | `src/utils/version-check.ts`, `src/package-manager-cli.ts`, `src/modes/interactive/interactive-mode.ts` | never |
| Standalone relocation script, predates the in-app feature | `scripts/pi-session-move.mjs`, `scripts/try-session-move.mjs`, `scripts/session-move-prototype.md` | none | ours |

New files never conflict at rebase. The modified columns are where rebases hurt: against current upstream, five of them have changed since our base -- `agent-session-runtime.ts`, `session-manager.ts`, `session-selector.ts`, `interactive-mode.ts`, `package-manager-cli.ts`. See Commands for the check.

`version-check.ts` deliberately keeps asking pi.dev, once, and only when the fork has nothing newer. That request is the whole cost of the "upstream released it, this fork hasn't rebuilt it" notice. Paths above are relative to `packages/coding-agent/` except `scripts/` and `patch/`, which are repo root.

## Distribution

- npm package `@maxmo74/pi-coding-agent`. One package: the published bundle inlines every workspace package.
- Versions are `<upstream>-max.<revision>`, e.g. `1.4.0-max.2`. Prerelease suffix, not `+build`, because semver ignores build metadata and `pi update` would stop seeing upgrades.
- `pi update` reads `https://raw.githubusercontent.com/maxmo74/pi/update-info/patch/update-info.json`: `patch/update-info.json` on a single-file branch, pushed with the deploy key. No GitHub Release is used, because deploy keys cannot create releases and raw hosting means publishing needs no API credential at all.
- `node scripts/publish-patched.mjs` stages and dry-runs; `--publish` publishes and rewrites `patch/update-info.json`. It refuses a dirty `packages/` tree, because publishing from a branch that lags the release commit silently ships a mix of revisions.
- The staged tree is build output only, so `README.md` and `LICENSE` are composed at staging time: `patch/README.fork.md` followed by the upstream package README, and the repo root `LICENSE` unmodified. npm ships both only from the packed directory, and the package directory has no LICENSE of its own.
- **Publish and push the update pointer in the same run.** While the file is missing or stale, `pi update` on an installed fork build fails with `Could not determine latest pi version.` rather than reporting nothing.
- Accepted risk, not a bug: that file names the npm package `pi update` installs, is served unsigned, and anyone who can push to this repository can change what everyone's installs run. Publishing makes you the update authority for every install. Branch protection is the mitigation; Trusted Publishing only covers npm itself.

### Open actions

- Rotate the npm access token that was written to `~/.npmrc` and exposed in a session transcript.
- Replace it with GitHub Actions Trusted Publishing (OIDC), which needs the package to exist first.

## Upstream bugs we carry unsubmitted

Filed nowhere. Not our code, and filing them is a contribution to them, not progress for us.

- `packages/tui/src/terminal-image.ts`, `shortenImagePath()` compares a raw `homedir()` prefix against a caller-supplied path. A normalised path (collapsed `//`, or macOS `/var` resolved to `/private/var`) misses the prefix and shows unshortened: `join(homedir(), ".pi", "agent", "shot.png")` under such a `HOME` prints the absolute path instead of `~/...`. Cosmetic, and only reachable with a non-normalised `HOME`, so ordinary installs never hit it.
  **Decided: do not patch it in this fork.** The fix is `path.resolve` on both sides inside `shortenImagePath()`, with cases to extend in `packages/tui/test/terminal-image.test.ts`, but carrying it means a permanent diff in a package we otherwise never modify. Revisit if upstream edits that file or someone actually reports it.
- `packages/coding-agent/package.json` lists `containerization.md` in `files`, but the file lives at `docs/containerization.md` and always has (added there in `86314bf38`, #5356). **Not a defect, and nothing to report.** npm ignores missing `files` entries, the doc ships via the `docs` entry in both the official and our tarball, and every link to it is `docs`-relative. Dead metadata from the day it was written; the only cost is a reader wondering why the manifest lies.

## Rebase notes

- **Our ownership registry is the main hazard.** Upstream has no `dispose()` and no ownership concept; we added both, and a session opened without `dispose()` blocks relocation for the process lifetime. After every rebase, run `grep -rn "SessionManager.open(" packages/coding-agent/src` and check each new call site releases ownership. Two upstream sites already needed fixing: the HTML export path and the picker's rename callback.
- **`dispose()` clearing `sessionFile` is our behaviour change.** One upstream test read the path afterwards and had to capture it earlier (`test/suite/agent-session-runtime.test.ts`).
- **`Ctrl+Y` is claimed only when a move is possible**, otherwise it forwards to the search field so editor yank keeps working. Same convention as `app.session.deleteNoninvasive`.
- Upstream test files we had to edit, and the likely conflict points: `test/extensions-runner.test.ts` (fixture moved off `ctrl+y` to unclaimed `ctrl+h`), `test/suite/agent-session-runtime.test.ts`, `test/version-check.test.ts` (asserts the update URL), `test/package-command-paths.test.ts` (its mock answers pi.dev and counts requests).

## Remotes and branches

- `origin` is this fork (`git@github.com:maxmo74/pi.git`), `upstream` is `https://github.com/earendil-works/pi.git`.
- One permanent fork line, rebased onto `upstream/main`. It is `feat/session-move` today; `fork/main` is the better name now that it carries more than that feature. Feature branches only for experiments, and delete them when they land -- separate long-lived patch branches are how forks rot.
- Never merge `upstream/main` into the fork line. Rebase, so the diff stays exactly our commits.

## Publishing an update

One run, in this order, from a commit that contains the upstream release commit:

```
npm run build && npm run check
node scripts/publish-patched.mjs            # stage and dry-run, check the manifest
node scripts/publish-patched.mjs --publish  # publishes and rewrites patch/update-info.json
```

Then push that file to the `update-info` branch without disturbing the working tree. It builds a commit
from a temporary index, so nothing is staged or checked out, and it fast-forwards the branch instead
of force-pushing:

```
blob=$(git hash-object -w patch/update-info.json)
GIT_INDEX_FILE=/tmp/update-info.idx git update-index --add --cacheinfo 100644,"$blob",patch/update-info.json
tree=$(GIT_INDEX_FILE=/tmp/update-info.idx git write-tree)
parent=$(git rev-parse -q --verify refs/remotes/origin/update-info) || parent=
if [ -n "$parent" ]; then commit=$(git commit-tree "$tree" -p "$parent" -m "release: <version>");
else commit=$(git commit-tree "$tree" -m "release: <version>"); fi
git push origin "$commit:refs/heads/update-info"
git fetch origin update-info:refs/remotes/origin/update-info
```

`patch/update-info.json` is deliberately not tracked on the fork line: the branch copy is the published one, and tracking it here would create a conflict on every release.

## Commands

```
git merge-base upstream/main HEAD            # our base
git log upstream/main..HEAD --oneline           # every commit that is ours
git diff upstream/main...HEAD --stat         # every file that is ours
git log upstream/main..HEAD --format=%s -- <path>   # why a given file differs
git diff --name-only upstream/main...HEAD | sort > /tmp/mine
git diff --name-only "$(git merge-base upstream/main HEAD)" upstream/main | sort | comm -12 /tmp/mine -
                                             # upstream also touched since our base: the conflict set
```
