# Draft issue: resuming one session in two pi processes forks its history

**Status: not filed. Do not file until the Linux verification below passes.** This file exists so that
any machine with this checkout - and the AI working on it - has the whole picture in one place.

Whoever continues this: read the whole file before touching the draft. The prior-art section is the
reason this has not been filed yet, and the rules section is how previous attempts died.

## The defect, in one paragraph

Session files are append-only trees (`id`/`parentId`, plus an in-memory `leafId` per process). Nothing
revalidates the file before an append, so when two live processes hold one session file, the first
process's next append parents to the leaf it remembered instead of the tip the second process just
wrote. The file gets two branches under one parent. On reload the leaf comes from the last line of the
file, so one branch becomes unreachable: gone from the transcript, from the model context and from
`/export`, while its bytes sit in the file with no warning and no tool that shows them.

## What is verified, and where

| Base | How | Result |
| --- | --- | --- |
| `v1.4.0` (upstream release tag) | `node scripts/probe-double-writer.mjs packages/coding-agent/src/core/session-manager.ts` | reproduced |
| `upstream/main` @ `b556cfe5b` (well past 1.4.0) | same probe on a worktree of the tip | reproduced, identical trace |
| our published `1.4.0-max.2`, `max.3` and `max.4` | same probe against `dist/core/session-manager.js` | reproduced, identical trace |

Canonical trace, produced by the probe:

```
  dbe4 <- root   from-A-first
  3228 <- dbe4   from-B          <- second window's turn
  63f7 <- dbe4   from-A-second   <- first window, stale leaf: the fork

visible from the leaf a later resume picks: [ 'from-A-first', 'from-A-second' ]
REPRODUCED: in the file, invisible after resume: from-B
```

Also verified by reading: there is no lock, no `flock`, and no check before append that the file still
ends where this process believes. `proper-lockfile` is a dependency but is used for installs only.
`_rewriteFile()` opens with `"w"`, so the one path that rewrites an existing file - opening a session
older than `CURRENT_SESSION_VERSION` (3) - truncates instead of appending, and can delete the other
branch outright rather than only orphaning it.

Nothing in `packages/coding-agent/docs` states that a session file may only be written by one process.
The only place such a rule is written down anywhere in the repo is `packages/durable/README.md` ("One
process owns a storage at a time; there is no cross-process locking"), which is a different package.

## Verification still needed, on Linux

Required because one prior report says "still present in 1.0.3 on Linux" and we want a second
independent confirmation before filing, on a machine that shares nothing with this one.

```
git clone -b release/v1.4.0 https://github.com/maxmo74/pi.git
cd pi && npm ci --ignore-scripts && npm run build
node scripts/probe-double-writer.mjs                       # expect exit 0, prints REPRODUCED
```

Then the same through the real CLI, which is what a maintainer will actually run. **Run this against
official pi, not the fork**: the fork refuses the second resume by design, which would look like a fix
rather than a repro. If you only have the fork, set `PI_ALLOW_SHARED_SESSION=1` on the second window. If
you use the fork's own `SessionManager`, the probe above already covers it.

Terminal A: `pi`, send
one message, leave it running. Terminal B, same directory: `pi --continue`, send a message, quit B.
Back in A, send another message, quit A. `pi --resume`, pick the session, and check whether B's message
is there. `grep` for its text in the session file under `~/.pi/agent/sessions/` to show it was written.

Record for the issue: OS, distribution, kernel, `pi --version`, and whether extensions were installed
(none for the official run). Note anything that differs from the macOS result; if it does **not**
reproduce on Linux, stop and report that, do not file.

## Prior art: reported four times, never answered

| Issue | Content | Fate |
| --- | --- | --- |
| [#8177](https://github.com/earendil-works/pi/issues/8177) | "Discuss exclusive cross-process writers for resumed JSONL sessions" | bot-closed |
| [#8300](https://github.com/earendil-works/pi/issues/8300) | our exact bug, with `pi -c` repro and a lock design | bot-closed 9 seconds after filing |
| [#8848](https://github.com/earendil-works/pi/issues/8848) | same, from an RPC desktop shell | bot-closed in 9 seconds |
| [#8852](https://github.com/earendil-works/pi/issues/8852) | in-process double open, duplicate seq | bot-closed; author rewrote to meet the bar |

Every closure is the new-contributor auto-close bot, with `no-action` / `NOT_PLANNED`. No maintainer has
responded to any of them, so there is no rejection to argue with, and no open issue tracks this.
Fix PR #8333 ("enforce session writer ownership") was bot-closed because only `lgtm`-approved
contributors may open PRs; the author later asked for approval on #8848 and never got it.

Two details worth reusing:

- On #8300, another user reported real loss on 2026-10-03: an idle pane woke up and forked a session a
  second pane had been using for an hour, orphaning that work. Their comment also states the constraint
  that any fix must respect: *"Before any extension hook runs, pi has already loaded or migrated the
  file and can append `model_change` / `thinking_level_change` entries. A refused process still leaves
  those entries in the holder's file."* So an extension cannot fix this, and the check must happen
  before the file is opened. Pre-empt the "write an extension" answer with this.
- Precedent that this class gets fixed: `807a5c051` (post-1.4.0, shipped as #11486) fixed the same end
  state - history unreachable after resume - for a failed write, with the note that on resume "pi
  follows the history only back to that gap: everything before it disappears". Same harm, rarer trigger.

## What our fork does, so we can describe a working fix

`getSessionOpenRefusal()` scans per-user ownership records in `$TMPDIR/pi-session-owners-<uid>` (one
JSON per live pid: process start identity plus the session paths it holds; stale records are dropped by
PID-liveness and, on Linux, a `/proc/<pid>/stat` start-time check). Resume is refused before
`SessionManager.open()` at `--session`, `--session-id`, `--resume`, `--continue`, `/resume` and in
`AgentSessionRuntime.switchSession()`, naming the pid; `PI_ALLOW_SHARED_SESSION=1` overrides. It refuses
only *other* processes' registrations, so re-selecting your own session is a no-op and two pi windows on
different sessions stay normal.

Be precise about what that does and does not fix, because the draft leans on it: the guard sits at pi's
resume entry points, not in the storage layer. `node scripts/probe-double-writer.mjs` still reproduces
the fork against `1.4.0-max.4`, because the probe drives `SessionManager` directly, which is what an
extension or an RPC client does too. So our fork keeps an ordinary user from getting into this, and does
not make the file safe for two writers. That is a reason to fix it upstream rather than a reason to skip
the report.

Note for the draft: do not paste our implementation as a demanded design, and do not link the fork unless
a maintainer asks.

## Rules for filing

1. One issue, not a batch. Filing several is what gets accounts blocked in `CONTRIBUTING.md`.
2. Link all four prior issues in the first line. A duplicate that does not say it is a duplicate is the
   worst thing to file here.
3. Expect a bot close within seconds regardless of quality: our account is new. The realistic target is
   the daily review of auto-closed issues, so the body must stand alone and be reopenable on sight.
   A maintainer replying `lgtmi` keeps later issues open; nothing in our control forces that.
4. Also leave a short comment on #8300 pointing at the new issue, since the loss report lives there.
5. Repro must be executable with plain `pi` and no extensions, no fork, no model spend for the probe
   variant.
6. Do not relitigate #11583 (session moves). Different topic, already closed, and reopening it is the
   fastest way to lose the account.

## Draft body (upstream's bug template)

### What happened?

Resuming a session that another running `pi` already holds silently forks its history, and only the
branch that appended last stays visible. Duplicate of #8177, #8300, #8848 and #8852, all auto-closed
without a reply; adding a deterministic repro, a case that deletes rather than hides entries, and a
confirmation against current `main`.

Session files are append-only trees: every entry has `id`/`parentId`, and each process tracks its own
`leafId`. Appending never revalidates the file, so the first window's next append parents to the leaf it
remembered rather than the tip the second window wrote:

```
A appends            ->  6d8c <- root     from-A-first
B opens, appends     ->  15aa <- 6d8c     from-B
A appends (stale)    ->  2ceb <- 6d8c     from-A-second
```

On reload the leaf is taken from the last line of the file, so the resumed session is
`from-A-first -> from-A-second` and `from-B` is unreachable in the transcript, in the context sent to the
model and in `/export`, while both windows keep prompting from their own branch. There is no lock, no
`flock`, and no check before append that the file still ends where this process thinks. `proper-lockfile`
is in the tree but used for installs.

`_rewriteFile()` opens with `"w"`, so the one path that rewrites an existing file - opening a session
older than `CURRENT_SESSION_VERSION` (3) - truncates and writes back only this process's entries: two
windows opening an older session can delete lines rather than only orphan them.

Nothing in `docs/` says a session file is single-writer, though `packages/durable/README.md` states
exactly that rule for durable storage. #8300's follow-up also notes an extension cannot work around
this, because pi loads or migrates the file and can append entries before any hook runs.

### Steps to reproduce

1. Terminal A: `cd some/project`, run `pi`, send one message. Leave it running.
2. Terminal B, same directory: `pi --continue` - it resumes the session A still holds. Send a message,
   quit B.
3. In A, send another message, quit A.
4. `pi --resume`, pick that session. Only one window's messages are shown; `grep` for the other's text in
   the file under `~/.pi/agent/sessions/` to confirm it was written.

Reproduced on macOS with 1.4.0 and with current `main`, and on Linux with a package built from the
`v1.4.0` tag. `pi --continue` in a second terminal is what makes it easy to hit by accident, since it
silently resumes whatever the first window holds.

### Expected behavior

Refuse to resume a session a live `pi` already holds, or warn, before the file is opened - #8300's
suggestion of a lease recorded with the pid and start time, checked before anything is written, is what
we converged on too. Absent that, detecting that the leaf moved before appending would at least turn
silent divergence into an error.

### Version

1.4.0, and current `main`. The relevant code (`_persist`, `_appendEntry`, `_rewriteFile`, `_loadEntries`
in `packages/coding-agent/src/core/session-manager.ts`) is unchanged between them.
