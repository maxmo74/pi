# Session move prototype

Experimental Linux-only implementation on `feat/session-move`. Do not use on valuable sessions yet.

## Continue on another machine

```sh
git clone --branch feat/session-move <your-fork-url>
cd pi
npm ci --ignore-scripts
npm run build
node scripts/try-session-move.mjs
```

Use Node.js 22.19 or newer. This branch is a prototype checkpoint, not an upstream-approved contribution. The ownership redesign discussed during development has not been implemented: macOS and native Windows relocation remain unsupported. Start with synthetic sessions, not your live profile.

The machine-local launchers, packaged installation, credentials, session files, and backups are not included in this repository. The scripts below can create a separate test profile; cloning the branch does not transfer your conversations or replace your installed Pi.

## Test with copies of your real sessions

A separate launcher is installed locally as `~/.local/bin/pi-session-move`:

```sh
cd ~/work/project-b
pi-session-move
```

It launches the source checkout with a persistent private snapshot under `~/.local/share/pi-session-move/profile-*`. Original session files and the installed Pi are unchanged. The picker starts in the directory from which you invoke the launcher. Tab shows other directories; Ctrl+Y moves the highlighted copy here.

- `pi-session-move --profile` prints the current test profile.
- `pi-session-move --new-snapshot --prepare` takes a fresh snapshot, retaining previous test profiles.
- Credentials, extensions, models, and user settings are not copied. Picker tests need no login. `/login` writes to the private profile if you choose to test conversations.
- Invalid, partial, unreadable, or symlinked sessions are skipped and listed in the profile's `snapshot.json`.
- Parent references between copied sessions are rebased to their copies. Transcript bodies are unchanged.
- This isolates **session storage**, not project files. Resumed conversations still point at real working directories. Do not ask the agent to edit files unless intended.
- The existing older-process refusal remains enabled: close the reported older Pi processes before testing a successful move. This launcher does not bypass ownership checks or complete the hardening work listed below.

## Controlled live tests (disposable sessions only)

`pi-session-move --live` explicitly uses **original** session files in `~/.pi/agent`. It requires an interactive terminal and typing `LIVE` on every launch. This is experimental, not approval to move valuable history. It loads your normal credentials, settings and extensions. Your normal Pi executable is not replaced.

```sh
# Terminal A: create a disposable session in a source directory.
cd ~/work/project-a
pi-session-move --live --new
# Type LIVE, give the session a distinctive /name, and send a harmless message to persist it.

# Terminal B: try moving that same disposable session while A still has it open.
cd ~/work/project-b
pi-session-move --live
# Type LIVE, Tab, select the disposable session, Ctrl+Y, Enter.
# Expect an ownership refusal. Close terminal A's Pi and retry; the move should succeed.
```

Close older/untracked Pi processes too, including the development conversation if reported. Do not concurrently fork, import, rename or delete the test session. Child references, unsupported storage, or malformed headers elsewhere in the store can cause conservative refusals. Default invocation without `--live` still uses your copied profile. Snapshot options cannot be combined with `--live`; custom `PI_CODING_AGENT_SESSION_DIR` must be unset.

Before publication, every move writes an exclusive, private backup, flushes it, verifies it byte-for-byte against the original snapshot, and flushes its metadata and backup directory. A backup failure prevents the move. Backups are in `~/.pi/agent/session-move-backups/<uuid>.jsonl`; `<uuid>.jsonl.metadata.json` records source, destination and session ID.

For a restoration test, close all Pi instances first. Locate the matching metadata, restore the backup to its recorded source path without overwriting an existing file, verify the restored bytes, and only then remove the moved copy after verifying its ID. Keep the backup. Ask for help rather than overwriting unexpected files. Crash recovery is not fully journaled; the limitations below still apply.

## Try it without touching your profile

From the repository root:

```sh
node scripts/try-session-move.mjs
```

The launcher creates a temporary agent profile, two project directories, and synthetic sessions. It does not copy credentials or real sessions. The directory is retained after exit for inspection.

1. The picker starts in the target directory. Ctrl+Y must do nothing for "Already here".
2. Press Tab to show all directories, then select "Move this demo session".
3. Ctrl+Y shows the source and destination. Escape cancels without changing files.
4. Repeat and press Enter. While an older Pi instance is running, expect a refusal identifying its PID. This includes the Pi instance used to develop this patch.
5. Close older Pi instances and repeat to test success. Do not launch an older instance during a move.
6. After success, switch to current-directory scope: the moved session should now appear there. Resume it and inspect `/session`.

Ctrl+Y is configurable as `app.session.move`. It overrides the search field's yank shortcut inside the picker. The destination is the process's starting directory, not a directory chosen interactively. Moving does not resume the session.

## Safety implemented

- Confirmation before mutation; refuses the current session and same-directory moves.
- SessionManager registers session ownership before loading a file. Multiple managers are reference-counted. Failed constructors and failed persisted runtime replacements release candidate ownership; an installed runtime keeps its manager if subsequent UI rebinding fails.
- A per-user local gate serializes registration and moves, retrying contention for up to two seconds. Recursive acquisition fails immediately. Live PID records include Linux process start time, guarding against PID reuse.
- Moves and picker deletion refuse a session held by any tracked manager, including another process. Recognized older Pi processes without tracking cause a conservative refusal. Deletion holds the gate across trash/unlink, and import holds it across copying.
- Forking holds counted source and destination references during publication. Branch creation retains the source reference while the manager switches to the new file.
- Only the header cwd changes; conversation bytes, IDs, timestamps and filename are preserved.
- Backups are verified byte-for-byte and flushed before publication, with source/destination metadata retained under the agent profile's `session-move-backups/`, outside picker discovery.
- Atomic, no-overwrite destination publication; verification before source removal; rollback on ordinary failures.
- A vacated-path marker prevents a racing opener from recreating the old path.

## Limitations before upstream submission

- Local Linux process tracking only. Shared filesystems accessed from other hosts, containers with separate process namespaces, and untracked SDK hosts are not supported. Process-name detection cannot prove the absence of arbitrary older/custom hosts.
- A crashed process holding the short-lived gate leaves it blocked deliberately. Inspect the gate path in the error before recovery; automatic recovery and crash-journal handling still need design and tests.
- Gate retries are synchronous and can pause the UI for up to two seconds; longer contention fails without stealing the gate. A move scans headers synchronously while holding it; large stores need performance testing.
- Sessions with child `parentSession` references are refused rather than changing multiple files. Custom storage and symlinked storage need further work.
- Temporary SDK managers must be disposed to release their registration. Existing temporary-manager call sites (for example rename) still need a lifecycle audit; conservative false-positive refusals are possible until the process exits.
- Fork/import/picker-delete now participate in ownership coordination. This is not yet a complete audit of all SDK, extension and metadata-writing paths (including callers supplying arbitrary parent-session references). Broader race tests are still required before declaring the operation production-safe.
- A power loss can leave a backup and both source/destination files. This is not a fully journaled filesystem transaction.
- Real-terminal testing is still required. Automated tests exercise component input/rendering, not every terminal protocol.

## Automated tests

```sh
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/session-move.test.ts test/session-selector-move.test.ts test/session-ownership-gate.test.ts \
  test/session-selector-path-delete.test.ts test/session-selector-rename.test.ts \
  test/session-manager test/session-cwd.test.ts test/session-file-invalid.test.ts \
  test/session-delete.test.ts test/agent-session-runtime-events.test.ts \
  --no-file-parallelism
```

Move tests use disposable files. Only legacy process discovery is mocked; ownership records and the filesystem are real. Child-process tests cover an active owner, release, abrupt process death, competing gate acquisitions, exceptions, recursive acquisition, and refusal to steal an abandoned gate. No provider calls are made.
