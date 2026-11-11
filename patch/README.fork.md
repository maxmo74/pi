# Unofficial fork of Pi

This is **my personal fork** of [Pi](https://pi.dev), published as `@maxmo74/pi-coding-agent`. It is
not the official release and is not affiliated with or endorsed by its maintainers; the official
package is [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

Two things behave differently:

- In the `/resume` picker, `Ctrl+Y` moves a session recorded under another directory into the one you
  started Pi in, keeping its id and history. The header names that directory.
- Opening a session that another running Pi already holds is refused, naming the process, instead of
  silently forking its history.

Install `npm install -g @maxmo74/pi-coding-agent` (Node 22.19 or newer). Update `pi update`.
Sessions, credentials and settings stay in `~/.pi`, so nothing migrates and nothing is lost going
back. Do not run pi.dev's installer on a machine that should keep this build: it installs official
Pi over it.

Everything else is upstream. The full list of changes, and why they live here rather than upstream:
[FORK.md](https://github.com/maxmo74/pi/blob/release/v1.5.0/FORK.md).
