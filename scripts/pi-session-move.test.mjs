import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { snapshotSessions, validateOptions } from "./pi-session-move.mjs";

let root;
let source;
let destination;
let parent;
let body;
beforeEach(() => {
	// The snapshot reports resolved paths, and macOS links the temp dir to /private/var.
	root = realpathSync(mkdtempSync(join(tmpdir(), "pi-snapshot-test-")));
	source = join(root, "original");
	destination = join(root, "snapshots");
	mkdirSync(join(source, "sessions", "--project--"), { recursive: true });
	parent = join(source, "sessions", "--project--", "parent.jsonl");
	body = '{ "type": "custom", "data": "preserve bytes" }\n';
	writeFileSync(parent, `${JSON.stringify({ type: "session", id: "parent", cwd: "/project" })}\n${body}`);
	writeFileSync(join(source, "auth.json"), "do not copy");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("requires explicit live selection and rejects conflicting storage options", () => {
	assert.doesNotThrow(() => validateOptions([]));
	assert.doesNotThrow(() => validateOptions(["--live"]));
	assert.doesNotThrow(() => validateOptions(["--live", "--new"]));
	assert.throws(() => validateOptions(["--new"]), /requires --live/);
	for (const option of ["--profile", "--prepare", "--new-snapshot"]) {
		assert.throws(() => validateOptions(["--live", option]), /cannot be combined/);
	}
	assert.throws(() => validateOptions(["--live", "--yes"]), /Unsupported option/);
});

test("live mode cannot bypass confirmation through piped input", () => {
	const result = spawnSync(process.execPath, [fileURLToPath(new URL("./pi-session-move.mjs", import.meta.url)), "--live"], {
		input: "LIVE\n", encoding: "utf8", env: { ...process.env, HOME: root },
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /requires an interactive terminal/);
	assert.deepEqual(readdirSync(root), ["original"]);
});

test("copies real history privately without copying auth or changing originals", () => {
	const original = readFileSync(parent);
	const { profile, count } = snapshotSessions(source, destination);
	assert.equal(count, 1);
	const copied = join(profile, "sessions", "--project--", "parent.jsonl");
	assert.deepEqual(readFileSync(copied), original);
	assert.deepEqual(readFileSync(parent), original);
	assert.equal(readdirSync(profile).includes("auth.json"), false);
	assert.equal(statSync(profile).mode & 0o777, 0o700);
	assert.equal(statSync(copied).mode & 0o777, 0o600);
	writeFileSync(copied, "changed copy");
	assert.deepEqual(readFileSync(parent), original);
});

test("rebases copied parent references and preserves transcript bytes", () => {
	const child = join(source, "sessions", "--project--", "child.jsonl");
	writeFileSync(child, `${JSON.stringify({ type: "session", id: "child", cwd: "/project", parentSession: parent })}\n${body}`);
	const { profile } = snapshotSessions(source, destination);
	const copied = readFileSync(join(profile, "sessions", "--project--", "child.jsonl"), "utf8");
	assert.equal(JSON.parse(copied.split("\n")[0]).parentSession, join(profile, "sessions", "--project--", "parent.jsonl"));
	assert.equal(copied.slice(copied.indexOf("\n") + 1), body);
	assert.equal(JSON.parse(readFileSync(child, "utf8").split("\n")[0]).parentSession, parent);
});

test("skips and reports a partial transcript without modifying it", () => {
	writeFileSync(parent, `${readFileSync(parent, "utf8")}partial`);
	const result = snapshotSessions(source, destination);
	assert.equal(result.count, 0);
	assert.deepEqual(result.skipped, [parent]);
	assert.ok(readFileSync(parent, "utf8").endsWith("partial"));
});

test("skips symlink entries and retains earlier snapshots", () => {
	symlinkSync(parent, join(source, "sessions", "--project--", "alias.jsonl"));
	const first = snapshotSessions(source, destination);
	const second = snapshotSessions(source, destination);
	assert.notEqual(first.profile, second.profile);
	assert.equal(second.skipped.length, 1);
	assert.equal(readdirSync(destination).length, 2);
});
