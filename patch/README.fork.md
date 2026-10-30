# Unofficial fork of Pi

This package is **not** the official [Pi](https://pi.dev) release and is not affiliated with or endorsed by its maintainers. The official package is [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

**What it adds:** one thing. In the `/resume` session picker, pressing `Ctrl+Y` moves a session that lives in another directory into the directory you started Pi from, keeping its history and id, so it shows up in this project's list. The key is configurable as `app.session.move`. When the highlighted session cannot be moved, the key does what it normally does in the search field.

**Why a fork instead of a pull request:** the feature was proposed upstream in [earendil-works/pi#11583](https://github.com/earendil-works/pi/issues/11583) and closed without action. Everything else about how Pi works is unchanged.

**Install**

```
npm install -g @maxmo74/pi-coding-agent
```

Requires Node.js 22.19 or newer. The binary is named `pi`, so this install takes precedence over an official `pi` on your `PATH`. Configuration, credentials and sessions in `~/.pi` are shared with official Pi, so existing logins carry over.

**Updating:** `pi update` installs patched builds published from this repository, versioned `<upstream>-max.<revision>` - for example `1.4.0-max.2`. When Pi releases a new version before a patched build exists, `pi update` will not install the unpatched one; it says what is missing instead.

**License:** MIT, as upstream. `LICENSE` is the upstream notice, unmodified; the additions in this fork are offered under the same terms. Source: [maxmo74/pi](https://github.com/maxmo74/pi), which tracks [earendil-works/pi](https://github.com/earendil-works/pi).

---
