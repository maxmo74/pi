// Reproduce the dual-writer session fork. Usage: node scripts/probe-double-writer.mjs [target]
//   no argument  tries the installed fork, then official pi, then this checkout's source
//   <directory>  an installed package, e.g. $(npm root -g)/@maxmo74/pi-coding-agent
//   <file>       a session-manager module, built (dist/core/session-manager.js) or source (.ts)
// Exits 0 when the fork is reproduced, 2 when it is not.
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** The session-manager module of an installed pi package, or undefined when it is not installed. */
function installed(name) {
	try {
		return join(dirname(require.resolve(`${name}/package.json`)), "dist/core/session-manager.js");
	} catch {
		return undefined;
	}
}

// Imported by computed path because which target is present is only known at run time.
const targets = [
	process.argv[2],
	installed("@maxmo74/pi-coding-agent"),
	installed("@earendil-works/pi-coding-agent"),
	`${import.meta.dirname}/../packages/coding-agent/src/core/session-manager.ts`,
].filter(Boolean);

let SessionManager;
for (const target of targets) {
	const absolute = resolve(target);
	const module = absolute.endsWith(".js") || absolute.endsWith(".ts") ? absolute : join(absolute, "dist/core/session-manager.js");
	try {
		({ SessionManager } = await import(pathToFileURL(module).href));
		console.log("session manager:", module);
		break;
	} catch {
		// Try the next target.
	}
}
if (!SessionManager) throw new Error("No importable SessionManager. Pass an installed package directory or a module path.");

const root = join(tmpdir(), `pi-double-writer-${process.pid}`);
rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, "project"), { recursive: true });

const a = SessionManager.create(join(root, "project"), join(root, "sessions"));
const file = a.getSessionFile();
a.appendMessage({ role: "user", content: "from-A-first" });

// A second window resumes the same file, then both keep writing.
const b = SessionManager.open(file, join(root, "sessions"));
b.appendMessage({ role: "user", content: "from-B" });
a.appendMessage({ role: "user", content: "from-A-second" });

const reader = SessionManager.open(file, join(root, "sessions"));
const entries = reader.getEntries().filter((entry) => entry.type === "message");
const visible = reader.getBranch().filter((entry) => entry.message?.content).map((entry) => entry.message.content);
console.log("session file:", file);
for (const entry of entries)
	console.log(`  ${entry.id.slice(0, 4)} <-${(entry.parentId ?? "root").slice(0, 4)}  ${entry.message.content}`);
console.log("visible from the leaf a later resume picks:", visible);
const lost = entries.map((entry) => entry.message.content).filter((text) => !visible.includes(text));
rmSync(root, { recursive: true, force: true });
if (lost.length) {
	console.log(`REPRODUCED: in the file, invisible after resume: ${lost.join(", ")}`);
	process.exit(0);
}
console.log("NOT REPRODUCED: every entry is reachable from the leaf.");
process.exit(2);
