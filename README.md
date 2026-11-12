# pi — maxmo74's fork

An unofficial personal fork of [Pi](https://pi.dev), published to npm as
[`@maxmo74/pi-coding-agent`](https://www.npmjs.com/package/@maxmo74/pi-coding-agent). It is not the
official release and is not affiliated with or endorsed by Pi's maintainers. The official package is
[`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

```sh
npm install -g @maxmo74/pi-coding-agent    # Node 22.19 or newer
```

Update with `pi update`. Sessions, credentials and settings live in `~/.pi` either way, so moving to or
from official Pi migrates nothing and loses nothing.

## What behaves differently

Three things. Each one exists because the same request upstream was closed.

**Move a session between folders.** In the `/resume` picker, `Ctrl+Y` moves a session recorded under
another directory into the folder you started Pi in, keeping its id and its whole history. Upstream
solves the same situation by copying the session under a new id; this keeps the session itself. The key
is configurable as `app.session.move`.

**Refuse to open one session twice.** If another running Pi holds a session file open, opening it is
refused and the message names the process. Two writers on one file fork its history and only the last
branch stays visible, with no warning. Deleting a session another Pi holds is refused for the same
reason. `PI_ALLOW_SHARED_SESSION=1` opens it anyway.

**Update only from this fork.** `pi update` resolves only inside the `@maxmo74` npm scope and rejects a
package name from anywhere else, so the update path cannot be redirected to another build. It never
offers official Pi as an upgrade. When upstream ships a release this fork has not rebuilt yet, Pi says
so instead of offering an update.

Everything else is upstream and unmodified. For how Pi works, read [pi.dev](https://pi.dev) and
upstream's documentation — this README deliberately does not duplicate it.

## Two things that will catch you out

- **Do not run pi.dev's installer** on a machine that should keep this build. It installs official Pi
  over it.
- **A version here is not an upstream version.** They read `<upstream>-max.<build>`: `1.5.2-max.15` is
  upstream 1.5.2, the fifteenth build of this fork. The build number counts every build of the fork and
  never resets, so it names exactly one published artifact.

## How builds are published

Every build is tagged and published by GitHub Actions through npm trusted publishing, so published
versions carry provenance linking the tarball to the commit it was built from. No npm credential is
stored in this repository or on any build machine, and the workflow that publishes is the only one
enabled here.

The complete list of changes against upstream, the reason each one is not upstream, and the release
procedure: **[FORK.md](FORK.md)**.

## Reporting problems

Problems with Pi itself belong upstream at
[earendil-works/pi](https://github.com/earendil-works/pi), where the people who wrote it will see them.
This repository's issues are for the three behaviours above.

## License

MIT — see [LICENSE](LICENSE), © upstream's authors. This fork makes no claim on Pi's branding, and the
Pi logo appears in documentation only as a reference to the upstream project.
