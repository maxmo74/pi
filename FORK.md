# pi fork

Personal fork of [pi](https://github.com/earendil-works/pi), published as `@maxmo74/pi-coding-agent`.
Built from upstream release tags; versions are `<upstream>-max.<build>`, e.g. `1.5.2-max.15`. The number
after `max.` counts builds of the whole fork and never resets, so it names exactly one published build.
(0 through 8 were numbered per upstream line and therefore repeat; the counter restarted at 15.)
Not affiliated with or endorsed by upstream.

## Changes vs upstream

This is the whole fork. Everything is under `packages/coding-agent/` except the release tooling.

| Change | Files |
| --- | --- |
| `Ctrl+Y` in the `/resume` picker moves a session that lives in another directory into the directory pi was started in, keeping its id and history. Configurable as `app.session.move`; when the highlighted session cannot be moved the key does its ordinary search-field job. | `src/core/session-move.ts` (new), `src/core/keybindings.ts`, `schemas/keybindings.schema.json`, `components/session-selector.ts`, `interactive-mode.ts` |
| A session that another running pi holds open is refused at every resume entry point, naming the pid. Two writers on one file fork its history and only the last branch stays visible, with no warning. `PI_ALLOW_SHARED_SESSION=1` resumes anyway. | `src/core/session-ownership.ts` (new), `src/main.ts`, `src/core/agent-session-runtime.ts` |
| Deleting a session is refused while a registered pi holds it. A pi that reports no ownership -- any official install on Linux, which never registers -- does not block cleanup, because a delete is recoverable and a move is not. | `src/core/session-delete.ts` (new) |
| `pi update` resolves only from the npm scope this build was published in, and refuses a package name outside it. Upstream's advice to run pi.dev's installer is suppressed: it would install official pi over these patches. | `src/utils/version-check.ts`, `src/package-manager-cli.ts` |
| Deleting or moving a session keeps the picker where it was: the row on screen is corrected or removed instead of the list being re-read. A reload arrives in pages and the cursor gets clamped to the page in hand, so working near the bottom of a long list dropped it into the middle. | `components/session-selector.ts` |
| A session whose file is already stored in the starting directory, but whose header names another one, is relabelled in place. Moving it used to refuse with "storage paths are identical", which was true and useless: the header was the only thing wrong. | `src/core/session-move.ts` |
| Release tooling: build, rename, publish, and a model catalog pinned by digest so a tag rebuilds identically. Build-time only, nothing here runs in pi. | `scripts/publish-patched.mjs`, `.github/workflows/publish.yml`, `patch/` |
| This file, and the notice prepended to the published README. | `FORK.md`, `patch/README.fork.md` |
| The fork's own front door. The README replaces upstream's, so someone landing on the fork is not handed upstream's install instructions and package name as if they were ours, and the issue templates are cut back to the two that mean something here -- upstream's contribution-proposal and pi.dev package-report forms have no bots behind them on a fork. Neither file is packed into npm, so installs are unaffected. On a merge, keep ours: upstream's edits to its README are documentation that lives at pi.dev anyway. | `README.md`, `.github/ISSUE_TEMPLATE/` |

## Why these are not upstream

The session move was proposed in [pi#11583](https://github.com/earendil-works/pi/issues/11583) and
closed without action. The double-open guard was reported in
[pi#11684](https://github.com/earendil-works/pi/issues/11684) with a reproduction on two platforms
and closed `no-action`. Both live here instead. Nothing else about how pi works is changed.

## Cutting a release

Tag first; a tag push is what publishes. Build from the upstream release **tag**, never from `main`
ahead of it: the published manifest pins its sibling packages to the released version, so building
past the tag ships code that calls exports the pinned siblings do not have.

```
git fetch --tags upstream
git worktree add -b release/v1.6.0 ../worktrees/release-v1.6.0 v1.6.0
cd ../worktrees/release-v1.6.0
git merge --no-ff release/v1.5.0                      # port with history, do not re-diff
npm ci --ignore-scripts
node scripts/publish-patched.mjs --hydrate          # model data by digest, not by live scrape
npm run build:offline && npm run check
git tag v1.6.0-max.16 && git push origin v1.6.0-max.16
```

The tag must match the version `publish-patched.mjs` derives from the registry -- one above the highest
`max.<build>` npm holds -- and it refuses to build when the two disagree, because npm versions are
immutable and a tag pointing at no published artifact has happened before.

`publish.yml` runs the suite, publishes through npm trusted publishing, and moves the `update-info`
pointer once npm actually serves the version. It is the only workflow enabled on the fork: upstream's
CI, Nix, npm audit, model-catalog publishing, preview packages and the issue and PR automation are all
disabled, because they build or publish things this fork does not ship, and several of them act on
issues. `gh workflow enable "<name>"` reverses any of them.

## Testing

`npm run check`, plus the coding-agent suite. Upstream's `./test.sh` needs a Rust toolchain for
`packages/env` and cannot complete in this checkout; nothing in the fork's diff reaches it.

```
PI_CODING_AGENT_DIR=$(mktemp -d) npm test --workspace @earendil-works/pi-coding-agent
```
