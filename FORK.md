# Fork of [pi](https://github.com/earendil-works/pi)

## Why this fork exists

A maintained, independent, unofficial Pi. It started for one reason -- **moving a session from another directory into the directory Pi was started from, from the `/resume` picker** -- and upstream declined that in [#11583](https://github.com/earendil-works/pi/issues/11583), closed `no-action`. The suggested alternative, `pi --session <id>` per session, is unusable at 50-60 sessions. Do not relitigate that issue.

It is now the build I run daily, so it also carries the correctness and update-path changes I want in it: `pi update` resolves from this fork's releases, an install published under this name is never sent back to pi.dev's installer, and resuming a session another running Pi holds is refused. Two rules keep it rebaseable. Every divergence is listed in the Changes table, and every known defect is in the Bug ledger whether we carry a fix or not. If upstream ever accepts session moves, most of the diff loses its reason and the rest is plumbing to drop back onto upstream `main`.

## Changes

Status means upstream intent, not effort: `never` would be rejected on sight, `unfiled` is upstream-owned and reportable, `ours` is fork-only machinery.

| Cluster | New files | Files it modifies in upstream | Status |
| --- | --- | --- | --- |
| Session move: `app.session.move`, `Ctrl+Y` in the picker | `src/core/session-move.ts`, `src/core/session-ownership.ts`, `src/core/session-delete.ts` | `src/core/keybindings.ts`, `src/core/session-manager.ts`, `src/core/agent-session-runtime.ts`, `src/modes/interactive/components/session-selector.ts`, `src/modes/interactive/interactive-mode.ts`, `src/core/export-html/index.ts`, `schemas/keybindings.schema.json` | rejected #11583 |
| Resume guard: refuse to open a session a live Pi holds, `PI_ALLOW_SHARED_SESSION` to override | none | `src/main.ts`, `src/core/agent-session-runtime.ts`, `src/modes/interactive/interactive-mode.ts` | unfiled |
| Release staging: build, rename, version, publish | `scripts/publish-patched.mjs`, `patch/README.fork.md`, `.github/workflows/publish.yml` | none; writes `patch/update-info.json` on each publish | never |
| Update endpoint: `pi update` resolves from this fork's releases, and says so when pi.dev is ahead of the fork's base | none | `src/utils/version-check.ts`, `src/package-manager-cli.ts`, `src/modes/interactive/interactive-mode.ts` | never |
| Release-base alignment on this branch only | none | `packages/ai/test/cache-retention.test.ts` (one stale fixture dropped, see ledger) | n/a, ours |

New files never conflict at rebase. The modified columns are where rebases hurt: against current upstream, six of them have changed since our base -- `agent-session-runtime.ts`, `session-manager.ts`, `session-selector.ts`, `interactive-mode.ts`, `package-manager-cli.ts`, `main.ts`. See Commands for the check.

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
- **`pi update` self-updates a global npm install only**, and this fork ships no managed installer. Switching from an official install therefore means installing a Node you own *before* deleting pi's private one in `~/.local/share/pi-node`, because `pi` runs on the first `node` in `PATH`. Nothing else needs migrating: everything under `~/.pi/agent` except `install/` and the `bin/pi` launcher is user data. `patch/README.fork.md` carries the steps.
- **Publishing makes you the update authority for every install.** The pointer file is unsigned, names the package `pi update` installs, and can be rewritten by anyone with push access here. Branch protection on `update-info` is the mitigation; trusted publishing covers npm only, and a `GITHUB_TOKEN` push bypasses protection unless restrict-pushes names the workflow's actor.

### Open actions

- Done 2026-11-01: both npm tokens that reached a session transcript are revoked, `~/.npmrc` holds no credential (`npm whoami` answers `ENEEDAUTH`), and publishing goes through OIDC only. Still to confirm in the browser: the package's "require 2FA and disallow tokens" setting, which no unauthenticated API exposes.
- Protect the `update-info` branch with restrict-pushes so the workflow's `GITHUB_TOKEN` push is the only writer. It has to be tested against a real publish, because restrict-pushes blocks that push too unless the workflow's actor is allowed -- do it on the next release rather than in between, when there is no publish to check with.

## Bug ledger

Defects found in upstream code, whether or not we fix them here. Features are in Changes; this table is bugs. Add a row the moment something is found, even if the answer is "not a defect" -- the reason a finding was dropped is the part that gets lost.

| What | Detail | In this fork | Upstream issue |
| --- | --- | --- | --- |
| Resuming one session in two Pi processes forks its history | Appends carry the writer's own leaf and nothing revalidates the file, so the first window's second append parents to a stale entry: `B1 -> A1 <- A2`. A later read takes the last line of the file as leaf, so one branch turns invisible in the transcript, in the context sent to the model and in `/export`, while its bytes sit unreferenced in the file with no warning and no tool that shows them. Measured with two `SessionManager`s on one file. Worse in one case: `_rewriteFile()` opens with `"w"`, so the only path that rewrites an existing file, opening a session older than version 3, truncates it and deletes the other branch if that branch appended after the read. | fixed: `getSessionOpenRefusal()` refuses `--session`, `--session-id`, `--resume`, `--continue`, `/resume` and the runtime's `switchSession()`, and `PI_ALLOW_SHARED_SESSION` overrides | none ours yet. Prior art, all auto-closed by the new-contributor bot within seconds of filing and never answered by a maintainer: [#8177](https://github.com/earendil-works/pi/issues/8177), [#8300](https://github.com/earendil-works/pi/issues/8300), [#8848](https://github.com/earendil-works/pi/issues/8848), plus the in-process variant [#8852](https://github.com/earendil-works/pi/issues/8852). Fix PR #8333 was auto-closed for lack of `lgtm`. #8300 carries an independent real-world loss report (2026-10-03, an hour of work orphaned) and says an extension cannot fix it, because Pi loads or migrates the file before any hook runs. Still reproduces at `upstream/main` `b556cfe5b`, measured |
| Published builds crash on any extension | Our base drifted past the `v1.4.0` tag while the published `package.json` still pins `@earendil-works/pi-tui: 1.4.0`, which lacks `getSelectPageIndex` (added after the tag in `3bae85274`). The extension loader aliases `@earendil-works/pi-coding-agent` to our own `dist/index.js`, and that entry imports pi-tui externally, so a five-line extension that imports the package kills `pi` at startup with `SyntaxError: The requested module '@earendil-works/pi-tui' does not provide an export named 'getSelectPageIndex'`. Upstream 1.4.0 loads the same extension fine. Running with no extensions never touches that file, which is why installs here keep working. The same skew breaks the SDK entry (`import "@maxmo74/pi-coding-agent"`) and applies to every cross-package alias, `pi-ai` and `pi-agent-core` included. | fixed on this branch: releases are cut from the `v1.4.0` tag (`release/v1.4.0`), so the pinned siblings match the code built against them. `1.4.0-max.0` through `max.3` are affected and stay published; `max.4` is the first clean build. Verified by loading a five-line extension against the built CLI: it now reaches the auth error like upstream instead of the `SyntaxError` | n/a, ours |
| Building an old tag hits live model-catalog drift | The catalog under `packages/ai/src/providers/data` is generated from live provider metadata and is gitignored, so a tag rebuilt months later sees different models than it was tested against. On `v1.4.0` one `it.each` fixture in `packages/ai/test/cache-retention.test.ts` no longer type-checks, and the id upstream substituted afterwards asserts a field the tag-era generator does not emit. | dropped that one fixture on the release branch, with a comment in the file. Expect to re-derive this per release tag | n/a, ours |
| Post-update advice sends installs to pi.dev | After a successful self-update, every npm-detected install is told to run pi.dev's installer, which installs official Pi over the running build. Renamed builds have no managed installer at all, so following the advice silently removes every patch they carry. | fixed: `getSelfUpdateAdvice()` gates on the official package name, pinned by `test/package-manager-cli.test.ts` | none |
| Update path infers a prefix it does not own | `getInferredNpmInstall()` decides an npm global prefix from path shape alone, so an install relocated by a package manager -- Homebrew's `Cellar/<formula>/<version>/libexec`, a Nix store path, a distro overlay -- is mistaken for a user-owned global prefix, and `pi update` installs the new version inside that tree, untracked by whatever owns it. Reproduced against upstream 1.3.0's published tarball in a Cellar-shaped layout with `npm root -g` pointing elsewhere. Keep it generic if we ever fix it: the inference should be distrusted whenever `npm root -g` answers and the package is not under what it reports, which covers every relocating manager without naming one. Confirm on Linux before filing. | not adopted | none |
| Test suite writes into the developer's real agent profile | `getAgentDir()/sessions/<cwd>` is where session files go, the suite runs against the real profile with temporary working directories, so each test cwd becomes a project bucket in the developer's own `/resume` list -- about fifty per full run. Verified it never writes into a bucket for a real directory, so this is pollution, not damage. | not adopted; run `PI_CODING_AGENT_DIR=$(mktemp -d) ./test.sh`, see Testing | none |
| Image placeholder misses a non-normalised `HOME` | `shortenImagePath()` in `packages/tui/src/terminal-image.ts` compares a raw `homedir()` prefix against a caller-supplied path, so a `HOME` with collapsed `//` or a macOS `/var` resolved to `/private/var` prints the absolute path instead of `~/...`. Cosmetic and unreachable on ordinary installs. | not adopted, see the decision below | none |
| TUI suite does not exit on Node 26 | Under Node 26 the `packages/tui` suite finishes its tests but the process stays alive unless `--test-force-exit` is passed, which `test:one` uses and `test` does not; Node 22 exits by itself. Cause unknown: either pi holds the event loop or Node changed, and no test has been isolated yet. | investigating | none |
| `containerization.md` listed in package `files` | `packages/coding-agent/package.json` names a file that has always lived in `docs/` (added in `86314bf38`, #5356). npm ignores missing `files` entries and the doc ships via the `docs` entry, so this is dead metadata, not a defect. | nothing to do | none |

Two of these are decisions not to patch, and both are the same trade. `shortenImagePath()` needs `path.resolve` on both sides plus cases in `packages/tui/test/terminal-image.test.ts`, and the harness needs a scratch agent dir in test setup; either would be a permanent diff in files we otherwise never touch, for a cosmetic result. Revisit if upstream edits those files or someone outside this repo reports them.

Session handles are not in the ledger. Upstream's HTML export path and the picker's rename callback open a `SessionManager` without releasing it, which leaks nothing upstream because nothing there needs releasing; both had to be fixed for our ownership registry, and the rebase notes carry the check.

## Rebase notes

- **Our ownership registry is the main hazard.** Upstream has no `dispose()` and no ownership concept; we added both, and a session opened without `dispose()` blocks relocation for the process lifetime. After every rebase, run `grep -rn "SessionManager.open(" packages/coding-agent/src` and check each new call site releases ownership. Two upstream sites already needed fixing: the HTML export path and the picker's rename callback.
- **`dispose()` clearing `sessionFile` is our behaviour change.** One upstream test read the path afterwards and had to capture it earlier (`test/suite/agent-session-runtime.test.ts`).
- **`Ctrl+Y` is claimed only when a move is possible**, otherwise it forwards to the search field so editor yank keeps working. Same convention as `app.session.deleteNoninvasive`.
- **The resume guard shares only the live-owner scan with `assertSessionUnused()`, never the guard itself.** `assertSessionUnused()` also refuses when an untracked Pi process exists, which is ordinary while resuming a *different* session; the resume guard must not use it, and two Pi windows on different sessions must stay possible. The check runs before `SessionManager.open()`, which can rewrite an older-format file, so a refusal never touches the session.
- **The self-update advice must stay gated.** It is in the ledger above; the part that rebases badly is that upstream's own `src/cli/startup-ui.ts` gates on the same constant while the update path does not, so a rebase that takes upstream's version of `package-manager-cli.ts` restores the footgun silently. The test is the only durable defence.
- Upstream test files we had to edit, and the likely conflict points: `test/extensions-runner.test.ts` (fixture moved off `ctrl+y` to unclaimed `ctrl+h`), `test/suite/agent-session-runtime.test.ts`, `test/version-check.test.ts` (asserts the update URL), `test/package-command-paths.test.ts` (its mock answers pi.dev and counts requests).

## Remotes and branches

- `origin` is this fork (`git@github.com:maxmo74/pi.git`), `upstream` is `https://github.com/earendil-works/pi.git`.
- One permanent fork line per upstream release, cut from the release **tag**: `release/v1.4.0` here. This is what gets published, because the published manifest pins the sibling workspace packages to the released version. `feat/session-move` is the `main`-based feature line where work happens; port it to a new `release/v<x>` by squashed `git diff`, which is what `release/v1.4.0` is. Feature branches only for experiments, and delete them when they land.
- Never merge `upstream/main` into a release line. Rebase or re-port, so the diff stays exactly our commits.

## Publishing an update

Publish only from a release line cut from the upstream release **tag**. Never from a branch that lags the release it names, and never from `main` ahead of it either: the published `package.json` pins the sibling workspace packages to the released version, so building past the tag yields a package whose own code calls exports the pinned `@earendil-works/pi-tui` does not have, which is how the extension crash in the ledger happened.

Cutting a new release line, in a worktree so the feature checkout never moves:

```
git worktree add -b release/v1.5.0 ../pi-max-150 v1.5.0
cd ../pi-max-150 && rm -rf node_modules && npm ci --ignore-scripts
(cd packages/ai && npm run generate-models)          # data dir is gitignored; tsc needs it
git diff $(git merge-base upstream/main feat/session-move) feat/session-move > /tmp/fork.patch
git apply --3way /tmp/fork.patch                     # expect one conflict: forkFrom, keep the tag's I/O
npm run check && npm run build
node scripts/probe-double-writer.mjs                 # the double-writer bug must still reproduce
npm test --workspace @earendil-works/pi-coding-agent
```

Then verify the two things only a built artifact shows, both against `dist/cli.js` with a scratch
`PI_CODING_AGENT_DIR`: a trivial extension in `extensions/` must reach the auth error rather than a
`SyntaxError` from `@earendil-works/pi-tui`, and `pi --continue` must refuse a session a live process
holds. The known conflict and the known catalog fix are in the ledger. `git log <tag>..HEAD --
packages/tui packages/ai packages/agent` must show only the catalog fixture before you tag.

The normal publish path is one tag push on the release line:

```
git tag v1.4.0-max.0 && git push origin v1.4.0-max.0
```

`.github/workflows/publish.yml` builds, runs `npm run check` and the coding-agent suite, stages, publishes
through npm's trusted publishing, commits `patch/update-info.json` to the `update-info` branch with the run's
own `GITHUB_TOKEN`, and polls raw.githubusercontent.com until the new pointer is served. A tag names the exact
version to publish, `v<upstream>-max.<revision>` with the upstream part matching `packages/coding-agent/package.json`,
so pushing the same tag twice fails on a duplicate version instead of publishing something else. `workflow_dispatch`
with a revision input exists for the run that binds a freshly registered publisher config.

Tag **before** publishing, never after. A tag is also a trigger, so tagging a version a `workflow_dispatch` run
already published just starts a second run that fails with `403 cannot publish over the previously published
versions`. The tag is still a useful marker for the commit that was published (`piFork.sourceCommit` in the
published manifest names it), which is how `v1.4.0-max.0` and `v1.4.0-max.1` ended up: right commits, wasted runs.

Our tags match upstream's `build-binaries.yml` trigger (`push: tags: v*`) as well as ours, so every tag used to
start a six-platform Bun build that failed minutes later for want of upstream's release secrets. That workflow is
disabled on the fork (`gh workflow disable`), like Nix, npm audit and Publish Model Catalog. If a future rebase
re-enables it, expect the noise back.

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

## Testing

The coding-agent suite writes real session files into the sessions directory of the **real** agent profile, one
project directory per test working directory: `getAgentDir()/sessions/<cwd escaped>`. A full run leaves about fifty
`--var-folders-...` entries in `~/.pi/agent/sessions`, and the `/resume` picker's other-directories tab lists every
one of them as a project. Upstream behaviour, but it is our machine that gets littered. Run the suite against a
scratch profile instead:

```
PI_CODING_AGENT_DIR=$(mktemp -d) ./test.sh
```

`PI_CODING_AGENT_DIR` is the lever because session paths resolve through `getAgentDir()`; `PI_CODING_AGENT_SESSION_DIR`
only steers the CLI's own startup resolution (`main.ts`) and does nothing for tests that build a SessionManager
directly.

To drive a CLI path end to end, hold a session file from a second process and run the built CLI against a scratch
profile: `node --experimental-strip-types packages/coding-agent/test/fixtures/session-owner.ts <file>` keeps the file
registered while `PI_CODING_AGENT_DIR=<profile> node packages/coding-agent/dist/cli.js --continue -p hi` reports what
the CLI would do. Used to verify the resume guard's CLI call sites; the unit tests cover the paths that stay allowed.

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
