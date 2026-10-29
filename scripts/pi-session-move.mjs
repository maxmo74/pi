// Run the experimental picker with copied history by default, or explicitly confirmed live storage.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Snapshot default-storage sessions, rebasing parent references but leaving conversation bytes intact. */
export function snapshotSessions(sourceProfile, destinationRoot) {
	const source = realpathSync(join(sourceProfile, "sessions"));
	mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });
	const profile = mkdtempSync(join(destinationRoot, "profile-"));
	const files = [];
	const skipped = [];
	try {
		for (const folder of readdirSync(source, { withFileTypes: true })) {
			if (!folder.isDirectory()) {
				if (folder.isSymbolicLink()) skipped.push(folder.name);
				continue;
			}
			for (const entry of readdirSync(join(source, folder.name), { withFileTypes: true })) {
				if (!entry.name.endsWith(".jsonl")) continue;
				if (!entry.isFile()) { skipped.push(join(folder.name, entry.name)); continue; }
				files.push({ original: join(source, folder.name, entry.name), copy: join(profile, "sessions", folder.name, entry.name) });
			}
		}
		const valid = [];
		for (const file of files) {
			try {
				const content = readFileSync(file.original);
				const newline = content.indexOf(10);
				if (newline < 0) throw new Error("Incomplete header");
				const header = JSON.parse(content.subarray(0, newline).toString("utf8"));
				if (header?.type !== "session" || typeof header.cwd !== "string" || typeof header.id !== "string") throw new Error("Invalid header");
				// Do not turn a concurrent partial append or existing corruption into a broken test fixture.
				for (const line of content.toString("utf8").split("\n")) if (line.trim()) JSON.parse(line);
				valid.push({ ...file, content, newline, header });
			} catch {
				skipped.push(file.original);
			}
		}
		const destinations = new Map(valid.map(file => [realpathSync(file.original), file.copy]));
		for (const file of valid) {
			const { content, newline, header } = file;
			let output = content;
			if (header.parentSession) {
				let parent = header.parentSession;
				try { parent = realpathSync(parent); } catch { /* Preserve historical missing-parent references. */ }
				if (destinations.has(parent)) {
					header.parentSession = destinations.get(parent);
					output = Buffer.concat([Buffer.from(`${JSON.stringify(header)}\n`), content.subarray(newline + 1)]);
				}
			}
			mkdirSync(dirname(file.copy), { recursive: true, mode: 0o700 });
			writeFileSync(file.copy, output, { flag: "wx", mode: 0o600 });
		}
		writeFileSync(join(profile, "settings.json"), JSON.stringify({ fullscreen: false }), { mode: 0o600 });
		writeFileSync(join(profile, "snapshot.json"), JSON.stringify({ source, created: new Date().toISOString(), count: valid.length, skipped }, null, 2), { mode: 0o600 });
		return { profile, count: valid.length, skipped };
	} catch (error) {
		rmSync(profile, { recursive: true, force: true });
		throw new Error("Snapshot failed; originals are unchanged. If a session is being written, retry after it finishes.", { cause: error });
	}
}

/** Validate live/snapshot separation before doing filesystem work or starting Pi. */
export function validateOptions(args) {
	const supported = new Set(["--prepare", "--new-snapshot", "--profile", "--help", "--version", "--live", "--new"]);
	for (const arg of args) if (!supported.has(arg)) throw new Error(`Unsupported option: ${arg}. Run with --help.`);
	if (args.includes("--live") && args.some(arg => ["--prepare", "--new-snapshot", "--profile"].includes(arg))) {
		throw new Error("--live cannot be combined with snapshot options.");
	}
	if (args.includes("--new") && !args.includes("--live")) throw new Error("--new requires --live.");
}

async function main(args) {
	validateOptions(args);
	if (args.includes("--help")) {
		console.log("pi-session-move [--live [--new]] [--prepare] [--new-snapshot] [--profile] [--version]\nWithout options: open the experimental resume picker using copied real sessions.\n--prepare: create/reuse the snapshot without launching Pi\n--new-snapshot: create a fresh snapshot; retain previous test profiles\n--profile: print the current snapshot profile\n--live: use ~/.pi/agent after typing LIVE at an interactive confirmation (disposable sessions only)\n--live --new: start a new live session instead of the resume picker\nIn default snapshot mode: no credentials, settings, extensions or original sessions are modified or copied into the test profile (only session history is copied).");
		return;
	}
	const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	if (args.includes("--version")) {
		console.log("pi-session-move (experimental source checkout)");
		const result = spawnSync(join(checkout, "pi-test.sh"), ["--version"], { stdio: "inherit" });
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
		return;
	}
	if (args.includes("--live")) {
		if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("--live requires an interactive terminal; confirmation cannot be piped or bypassed.");
		if (process.env.PI_CODING_AGENT_SESSION_DIR) throw new Error("Unset PI_CODING_AGENT_SESSION_DIR before live tests; custom session storage is unsupported.");
		const profile = join(homedir(), ".pi", "agent");
		console.log(`WARNING: LIVE SESSION STORAGE: ${profile}`);
		console.log("Experimental: use disposable sessions only. Moves change ORIGINAL session files; project files are also live.");
		console.log(`Verified backups: ${join(profile, "session-move-backups")}`);
		console.log("Close other Pi instances before testing moves; on Linux untracked ones are refused too. Do not concurrently fork, import, rename or delete the test session.");
		const prompt = createInterface({ input: process.stdin, output: process.stdout });
		let answer;
		try { answer = await prompt.question("Type LIVE to continue (anything else cancels): "); }
		finally { prompt.close(); }
		if (answer !== "LIVE") { console.log("Cancelled; Pi was not started."); return; }
		const env = { ...process.env, PI_CODING_AGENT_DIR: profile };
		delete env.PI_CODING_AGENT_SESSION_DIR;
		const result = spawnSync(join(checkout, "pi-test.sh"), args.includes("--new") ? [] : ["--resume"], { env, stdio: "inherit" });
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
		return;
	}
	const root = join(homedir(), ".local", "share", "pi-session-move");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const pointer = join(root, "current-profile");
	let profile;
	try { profile = readFileSync(pointer, "utf8").trim(); }
	catch (error) { if (error.code !== "ENOENT") throw error; }
	if (!profile || args.includes("--new-snapshot")) {
		const result = snapshotSessions(join(homedir(), ".pi", "agent"), root);
		profile = result.profile;
		const temporary = join(root, `current-profile.${process.pid}.tmp`);
		writeFileSync(temporary, profile, { flag: "wx", mode: 0o600 });
		renameSync(temporary, pointer);
		console.log(`Copied ${result.count} sessions; skipped ${result.skipped.length} symlink, unreadable, or malformed entries (listed in snapshot.json).`);
	}
	if (dirname(realpathSync(profile)) !== realpathSync(root)) throw new Error("Test profile is outside the snapshot directory; refusing.");
	console.log(`Test profile: ${profile}`);
	if (args.includes("--prepare") || args.includes("--profile")) return;
	console.log("EXPERIMENTAL: session moves affect copies only. Project files are NOT sandboxed.");
	console.log("Tab → choose a session from elsewhere → Ctrl+Y. Other Pi instances holding the session block moves.");
	console.log("No credentials were copied. Picker testing needs no login; /login is separate in this profile.");
	const env = { ...process.env, PI_CODING_AGENT_DIR: profile };
	delete env.PI_CODING_AGENT_SESSION_DIR;
	const result = spawnSync(join(checkout, "pi-test.sh"), ["--resume"], { env, stdio: "inherit" });
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try { await main(process.argv.slice(2)); }
	catch (error) { console.error(error); process.exitCode = 1; }
}
