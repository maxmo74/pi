# Fork of [pi](https://github.com/earendil-works/pi)

## Why this fork exists

One reason: **moving a session from another directory into the directory Pi was started from, from the `/resume` picker.** Everything else here is infrastructure for distributing that. If upstream ever accepts session moves, the reason disappears and the rest is plumbing to drop back onto upstream `main`.

Upstream declined it: issue [#11583](https://github.com/earendil-works/pi/issues/11583) was closed `no-action`. The suggested alternative, `pi --session <id>` per session, is unusable at 50-60 sessions. Do not relitigate that issue.

## Changes

Status means upstream intent, not effort: `never` would be rejected on sight, `unfiled` is upstream-owned and reportable, `ours` is fork-only machinery.

| Cluster | New files | Files it modifies in upstream | Status |
| --- | --- | --- | --- |
| Session move: `app.session.move`, `Ctrl+Y` in the picker | `src/core/session-move.ts`, `src/core/session-ownership.ts`, `src/core/session-delete.ts` | `src/core/keybindings.ts`, `src/core/session-manager.ts`, `src/core/agent-session-runtime.ts`, `src/modes/interactive/components/session-selector.ts`, `src/modes/interactive/interactive-mode.ts`, `src/core/export-html/index.ts`, `schemas/keybindings.schema.json` | rejected #11583 |
| Release staging: build, rename, version, publish | `scripts/publish-patched.mjs`, `patch/README.fork.md`, `.github/workflows/publish.yml` | none; writes `patch/update-info.json` on each publish | never |
| Update endpoint: `pi update` resolves from this fork's releases, and says so when pi.dev is ahead of the fork's base | none | `src/utils/version-check.ts`, `src/package-manager-cli.ts`, `src/modes/interactive/interactive-mode.ts` | never |
| Standalone relocation script, predates the in-app feature | `scripts/pi-session-move.mjs`, `scripts/try-session-move.mjs`, `scripts/session-move-prototype.md` | none | ours |

New files never conflict at rebase. The modified columns are where rebases hurt: against current upstream, five of them have changed since our base -- `agent-session-runtime.ts`, `session-manager.ts`, `session-selector.ts`, `interactive-mode.ts`, `package-manager-cli.ts`. See Commands for the check.

`version-check.ts` deliberately keeps asking pi.dev, once, and only when the fork has nothing newer. That request is the whole cost of the "upstream released it, this fork hasn't rebuilt it" notice. Paths above are relative to `packages/coding-agent/` except `scripts/` and `patch/`, which are repo root.

## Distribution

- npm package `@maxmo74/pi-coding-agent`. One package: the published bundle inlines every workspace package.
- Versions are `<upstream>-max.<revision>`, e.g. `1.4.0-max.2`. Prerelease suffix, not `+build`, because semver ignores build metadata and `pi update` would stop seeing upgrades.
- Published with `--tag latest`. npm refuses a prerelease without an explicit tag, and since this package never holds a non-prerelease, `latest` is the newest fork build so `npm i @maxmo74/pi-coding-agent` resolves. `pi update` ignores dist-tags: it installs `packageName@version` from the pointer.
- The first publish of the name left a `0.0.0-stage` version behind, created by npm in the same second as the package itself. That is npm's staged-publishing placeholder, it is the lowest version in the package, and `latest` does not point at it.
- **npm does not serve a freshly published version for about four minutes**, and it says so (`Your package is being processed`). The pointer must not move across that gap: `pi update` reads it, installs `packageName@version`, and fails with `ETARGET` while npm still hides the version. `publish.yml` therefore waits for the version to resolve before pushing the pointer. Measured on the first two publishes: 4m12s and 3m40s.
- `pi update` reads `https://raw.githubusercontent.com/maxmo74/pi/update-info/patch/update-info.json`: `patch/update-info.json` on a single-file branch. It is hosted on a branch rather than as a release asset because a deploy key cannot create releases, and raw hosting means the pointer needs no API credential beyond the one the publishing workflow already holds.
- `node scripts/publish-patched.mjs` stages and dry-runs; `--publish` publishes and rewrites `patch/update-info.json`. It refuses a dirty `packages/` tree, because publishing from a branch that lags the release commit silently ships a mix of revisions.
- The staged tree is build output only, so `README.md` and `LICENSE` are composed at staging time: `patch/README.fork.md` followed by the upstream package README, and the repo root `LICENSE` unmodified. npm ships both only from the packed directory, and the package directory has no LICENSE of its own.
- **Publishing and moving the pointer are one run.** While the file is missing or stale, `pi update` on an installed fork build fails with `Could not determine latest pi version.` rather than reporting nothing, so `.github/workflows/publish.yml` does both: it publishes over npm's trusted publishing (OIDC, no stored npm credential, provenance for free) and then commits that file to `update-info` with the run's own `GITHUB_TOKEN`.
- Accepted risk, not a bug: that file names the npm package `pi update` installs, is served unsigned, and anyone who can push to this repository can change what everyone's installs run. Publishing makes you the update authority for every install. Branch protection on `update-info` is the mitigation; trusted publishing only covers npm itself, and `GITHUB_TOKEN` pushes bypass branch protection unless "restrict pushes" is on and the workflow's actor is allowed.

### Open actions

- Revoke the two npm tokens that reached this session's transcript: the login token in `~/.npmrc` and the short-lived bypass token used for the bootstrap publish. Then set the package to "Require two-factor authentication and disallow tokens", which leaves OIDC as the only way to publish. The trusted publisher is registered and bound by `1.4.0-max.1`, so no token is needed any more.
- Protect the `update-info` branch with restrict-pushes so the workflow's `GITHUB_TOKEN` push is the only writer. It has to be tested against a real publish, because restrict-pushes blocks that push too unless the workflow's actor is allowed -- do it on the next release rather than in between, when there is no publish to check with.

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

Rebase onto the upstream release commit first. Never publish from a branch that lags the release it names.

The normal path is one tag push on the fork line:

```
git tag v1.4.0-max.0 && git push origin v1.4.0-max.0
```

`.github/workflows/publish.yml` builds, runs `npm run check` and the coding-agent suite, stages, publishes
through npm's trusted publishing, commits `patch/update-info.json` to the `update-info` branch with the run's
own `GITHUB_TOKEN`, and polls raw.githubusercontent.com until the new pointer is served. A tag names the exact
version to publish, `v<upstream>-max.<revision>` with the upstream part matching `packages/coding-agent/package.json`,
so pushing the same tag twice fails on a duplicate version instead of publishing something else. `workflow_dispatch`
with a revision input exists for the run that binds a freshly registered publisher config.

A dispatched publish leaves no tag, so tag the commit it published afterwards -- `piFork.sourceCommit` in the
published manifest names it:

```
git tag v<version> <sourceCommit> -m "published <version> from a workflow_dispatch run" && git push origin v<version>
```

`1.4.0-max.0` has no provenance, because the bootstrap publish came from the laptop. Everything since carries a
SLSA provenance statement whose subject digest matches the tarball and whose builder is this repository and workflow;
`npm audit signatures` on an install verifies it.

Publishing from the laptop is the bootstrap (npm cannot register a publisher for a package that does not exist yet)
and the recovery path when CI cannot run. It needs a credential npm accepts from the CLI -- an OTP, or a granular
token with Bypass 2FA, since a passkey cannot answer the CLI's prompt -- and it does not move the pointer, so finish
it by hand:

```
npm run build && npm run check
node scripts/publish-patched.mjs            # stage and dry-run, check the manifest
NPM_CONFIG_USERCONFIG=/tmp/publish-npmrc node scripts/publish-patched.mjs --publish
```

`NPM_CONFIG_USERCONFIG` points npm at a throwaway file holding the publish token, so a publish never
depends on the token in `~/.npmrc` and no credential is written inside the repository.

Then push that file to the `update-info` branch without disturbing the working tree. It builds a commit
from a temporary index, so nothing is staged or checked out, and it fast-forwards the branch instead
of force-pushing:

```
blob=$(git hash-object -w patch/update-info.json)
rm -f /tmp/update-info.idx
GIT_INDEX_FILE=/tmp/update-info.idx git update-index --add --cacheinfo 100644,"$blob",patch/update-info.json
tree=$(GIT_INDEX_FILE=/tmp/update-info.idx git write-tree)
parent=$(git rev-parse -q --verify refs/remotes/origin/update-info) || parent=
if [ -n "$parent" ]; then commit=$(git commit-tree "$tree" -p "$parent" -m "update pi update pointer to <version>");
else commit=$(git commit-tree "$tree" -m "add pi update pointer for <version>"); fi
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
