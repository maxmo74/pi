# Unofficial fork of Pi

This package is **not** the official [Pi](https://pi.dev) release and is not affiliated with or endorsed by its maintainers. The official package is [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

**What it adds:** one thing. In the `/resume` session picker, pressing `Ctrl+Y` moves a session that lives in another directory into the directory you started Pi from, keeping its history and id, so it shows up in this project's list. The key is configurable as `app.session.move`. When the highlighted session cannot be moved, the key does what it normally does in the search field.

**Why a fork instead of a pull request:** the feature was proposed upstream in [earendil-works/pi#11583](https://github.com/earendil-works/pi/issues/11583) and closed without action. Everything else about how Pi works is unchanged.

**Install**

```
npm install -g @maxmo74/pi-coding-agent
```

Requires Node.js 22.19 or newer, installed in a way you control - see **Switching from an official install** below. Node 22 LTS is what upstream ships and what this fork's tests run on; newer majors work too. Configuration, credentials and sessions live in `~/.pi`, separate from the program, so existing logins and history carry over.

**Switching from an official install**

Nothing needs migrating: sessions, credentials, settings and extensions are in `~/.pi/agent` (`sessions`, `auth.json`, `models.json`, `settings.json`, `extensions`) and the official installer never writes history into the program directory. What you remove is only the program.

The order matters for one reason: the official installer keeps its own Node.js in `~/.local/share/pi-node`, and `pi` runs on whatever `node` is first on your `PATH`. Install the fork with a Node you own, or removing pi's Node afterwards breaks it.

1. Install Node.js 22.19 or newer yourself, then check it is the one you get: `which node` must not print a path under `~/.local/share/pi-node`. On macOS: `brew install node`. On Windows: `winget install OpenJS.NodeJS.LTS`. If you use `nvm` or `fnm`, use those.
2. Install the fork: `npm install -g @maxmo74/pi-coding-agent`.
3. Remove the official program, keeping everything else: `rm ~/.pi/agent/bin/pi` (the launcher), then the release directory it points at, `~/.pi/agent/install` (a few hundred MB), then pi's private Node, `~/.local/share/pi-node`. On Windows the same files are under `%USERPROFILE%\.pi\agent`. Only delete `~/.local/share/pi-node` if nothing else uses it - it holds only Node, npm and whatever you installed globally with that npm, and `ls ~/.local/share/pi-node/*/bin` shows what is in there.
4. Open a new shell and check what you actually get. `which -a pi` (where.exe pi on Windows) must list one `pi`, in your Node's bin directory - not `~/.pi/agent/bin/pi`, and not two. `pi --version` must print a `-max.` version. If it prints a plain version like `1.4.0`, an official install is still on your `PATH` and you are still running upstream.
5. `pi update` should answer `already up to date`. It only self-updates a **global** npm install; a local one prints `cannot self-update this installation` and has to be updated with `npm install -g` again.

Do not run the official installer (`curl -fsSL https://pi.dev/install.sh | sh`) on a machine that should keep the fork: it installs upstream and puts its launcher back in front of this one. This fork has no managed installer, npm only.

To go back: `npm uninstall -g @maxmo74/pi-coding-agent`, then install upstream however you like. Your `~/.pi` was never touched, so the same history is there either way.

**Updating:** `pi update` installs patched builds published from this repository, versioned `<upstream>-max.<revision>` - for example `1.4.0-max.2`. When Pi releases a new version before a patched build exists, `pi update` will not install the unpatched one; it says what is missing instead.

**License:** MIT, as upstream. `LICENSE` is the upstream notice, unmodified; the additions in this fork are offered under the same terms. Source: [maxmo74/pi](https://github.com/maxmo74/pi), which tracks [earendil-works/pi](https://github.com/earendil-works/pi).

---
