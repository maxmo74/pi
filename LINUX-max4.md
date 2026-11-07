# Linux box: objectives for the fork install and the double-writer report

Target: exactly one `pi` on `PATH`, `@maxmo74/pi-coding-agent` at `1.4.0-max.4`, no session lost, and
the double-writer bug confirmed on Linux so the issue in `ISSUE-double-writer.md` can be filed.

## State found 2026-11-01 (l53prdsrv-sysops1, home /home/TRADITION/massimo.santoro)

- `pi` resolves to `~/.local/bin/pi`, a trial launcher printing `[Pi local trial: session-move-20261029-142331]`
  and exec'ing `~/.local/share/pi-local/session-move-20261029-142331/install`. Reports `1.4.0`, blocks
  `pi update`.
- Official managed install present: `~/.pi/agent/bin` (launcher), `~/.pi/agent/install` (307M),
  `~/.local/share/pi-node` (private Node). `~/.pi/agent/bin` is no longer on `PATH`; `which -a` still
  lists it from bash's hash table until `hash -r`.
- Node we own: nvm `v22.23.2`, first on `PATH`. Meets the fork's >=22.19 requirement.
- Live session store: `~/.pi/agent/sessions`, 64 `.jsonl`, 237M. No `PI_CODING_AGENT_DIR` anywhere, so
  the trial used this store too.
- `~/.local/share/pi-local/session-move-20261029-142331/backups/20261029T143412Z-tw0fjkdw/sessions`
  holds 57 `.jsonl`: 56 ids already in `~/.pi`, 1 unique, newest dated 2026-10-29. A pre-move snapshot,
  not a live store.

## Objectives

1. Snapshot `~/.pi` (`tar czf ~/pi-agent-backup-$(date +%F).tgz -C ~/.pi agent`), note the `.jsonl` count.
2. Archive the trial before deleting: `tar czf ~/pi-trial-backup-20261029.tar.gz backups README.md
   switch.py source-added.tar`, then `tar tzf ... | grep -c '\.jsonl$'` must print 57.
3. Remove the trial (`~/.local/bin/pi`, `~/.local/share/pi-local`), then the official install
   (`~/.pi/agent/bin/pi`, `~/.pi/agent/install`, `~/.local/share/pi-node`). Never `~/.pi/agent` itself.
4. Install: `npm install -g @maxmo74/pi-coding-agent`, then `hash -r`. Expect `pi --version`
   `1.4.0-max.4` and one `pi` under the nvm prefix, no sudo.
5. Prove no loss: `.jsonl` count identical to objective 1, and `/resume` still lists old projects.
6. Prove the extension fix on Linux: with a scratch `PI_CODING_AGENT_DIR` holding a two-line extension
   importing `@earendil-works/pi-coding-agent`, expect an auth error, not a `SyntaxError` from
   `@earendil-works/pi-tui`.
7. Double-writer, three targets, one line each in the verification table of `ISSUE-double-writer.md`:
   official `@earendil-works/pi-coding-agent@1.4.0`, a build of `upstream/main`, and the installed
   `max.4`. Either `node scripts/probe-double-writer.mjs <target>` per run, or `node
   scripts/probe-double-writer.mjs --linux`, which prints the exact commands, reads the results you
   write into `LINUX-RESULTS.sh`, fills the table, and tells you whether to file.
8. While there, note whether `readLinuxProcessStartMs` behaves: the `/proc/<pid>/stat` start-time check in
   the ownership guard is Linux-only and has never run outside macOS.

## Rules

- Never run `curl -fsSL https://pi.dev/install.sh | sh` on this box. It reinstalls upstream and puts its
  launcher back in front.
- The two-terminal CLI repro must run against **official** pi. Our fork refuses the second resume by
  design, which would read as a fix. With only the fork, set `PI_ALLOW_SHARED_SESSION=1` on the second
  window.
- Probe `--help` aside, do not treat the fork as fixing the storage layer: the guard is at the resume
  entry points, so the probe reproducing on `max.4` is the expected result, not a regression.
- Kill stray pi processes after removal: the move and delete guards refuse when an untracked pi process
  exists.
- With nvm, `npm install -g` is per Node version. If versions change often, `npm config set prefix
  ~/.npm-global` once and put that `bin` on `PATH`.
- File only after objective 7, then exactly one issue plus a pointer comment on #8300. No new issue that
  does not link #8177, #8300, #8848, #8852.
