// Coordinate session users and relocation within one local Linux user account.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalizePath } from "../utils/paths.ts";

const root = join(tmpdir(), `pi-session-owners-${process.getuid?.() ?? "user"}`);
const sessions = new Map<string, number>();
const gateWait = new Int32Array(new SharedArrayBuffer(4));
const gateTimeoutMs = 2000;
let holdingGate = false;

/** Serialize registration and moves; an abandoned gate fails closed rather than guessing. */
export function withSessionOwnershipGate<T>(operation: () => T): T {
	if (holdingGate) throw new Error("Session ownership operations cannot acquire the gate recursively.");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const info = lstatSync(root);
	if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
		throw new Error(`Unsafe session ownership directory: ${root}`);
	}
	const gate = join(root, "gate");
	const deadline = performance.now() + gateTimeoutMs;
	for (;;) {
		try {
			mkdirSync(gate, { mode: 0o700 });
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			const remaining = deadline - performance.now();
			if (remaining <= 0) {
				throw new Error(`Session ownership is busy. Retry later. If a process crashed, inspect ${gate}.`);
			}
			// SessionManager's API is synchronous. Wait only for other processes, never for work on this event loop.
			Atomics.wait(gateWait, 0, 0, Math.min(25, remaining));
		}
	}
	holdingGate = true;
	try {
		return operation();
	} finally {
		holdingGate = false;
		rmdirSync(gate);
	}
}

/** Register a manager's session before reading it, releasing its previous registration. */
export function changeSessionOwnership(previous: string | undefined, next: string | undefined): void {
	if (previous === next) return;
	withSessionOwnershipGate(() => {
		if (next && !existsSync(next) && existsSync(movedMarker(next)))
			throw new Error("This session has moved. Refresh the session picker.");
		const updated = new Map(sessions);
		if (previous) {
			const path = canonicalSessionPath(previous);
			const count = updated.get(path) ?? 0;
			if (count <= 1) updated.delete(path);
			else updated.set(path, count - 1);
		}
		if (next) {
			const path = canonicalSessionPath(next);
			updated.set(path, (updated.get(path) ?? 0) + 1);
		}
		const temporary = join(root, `${process.pid}.tmp`);
		writeFileSync(temporary, JSON.stringify({ start: processStart(process.pid), sessions: [...updated.keys()] }), {
			mode: 0o600,
		});
		renameSync(temporary, join(root, `${process.pid}.json`));
		sessions.clear();
		for (const [path, count] of updated) sessions.set(path, count);
	});
}

/** Hold a counted session reference during a synchronous read/copy/mutation operation. */
export function withSessionFileUsage<T>(path: string, operation: () => T): T {
	if (process.platform !== "linux") return operation();
	changeSessionOwnership(undefined, path);
	try {
		return operation();
	} finally {
		changeSessionOwnership(path, undefined);
	}
}

function canonicalSessionPath(path: string): string {
	const absolute = resolve(path);
	return canonicalizePath(join(canonicalizePath(dirname(absolute)), basename(absolute)));
}

function movedMarker(path: string): string {
	return join(root, `${createHash("sha256").update(canonicalSessionPath(path)).digest("hex")}.moved`);
}

/** Prevent a concurrent opener from recreating the old path after relocation. */
export function markSessionMoved(path: string, destination: string): void {
	writeFileSync(movedMarker(path), destination, { mode: 0o600 });
}

/** Roll back a relocation marker when the source was not removed. */
export function unmarkSessionMoved(path: string): void {
	unlinkSync(movedMarker(path));
}

function processStart(pid: number): string {
	// Linux stat field 22 identifies a process across PID reuse. comm can contain spaces and parentheses.
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
}

/** Reject live users and untracked Pi processes. Caller must hold the ownership gate. */
export function assertSessionUnused(path: string): void {
	if (process.platform !== "linux") throw new Error("Session moves currently require Linux process tracking.");
	const canonical = canonicalSessionPath(path);
	const registered = new Set<number>();
	for (const file of readdirSync(root)) {
		if (!/^\d+\.json$/.test(file)) continue;
		const pid = Number(file.split(".")[0]);
		let start: string;
		try {
			start = processStart(pid);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			unlinkSync(join(root, file));
			continue;
		}
		const record: unknown = JSON.parse(readFileSync(join(root, file), "utf8"));
		if (
			!record ||
			typeof record !== "object" ||
			!("start" in record) ||
			!("sessions" in record) ||
			!Array.isArray(record.sessions)
		) {
			throw new Error(`Invalid session ownership record: ${file}`);
		}
		if (record.start !== start) continue;
		registered.add(pid);
		if (record.sessions.includes(canonical))
			throw new Error(`Session is open in process ${pid}. Close it before moving.`);
	}
	const processes = execFileSync("ps", ["-u", String(process.getuid!()), "-o", "pid=,comm=,args="], {
		encoding: "utf8",
	});
	for (const line of processes.split("\n")) {
		const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
		if (!match) continue;
		const pid = Number(match[1]);
		if (pid === process.pid || registered.has(pid)) continue;
		const isPi =
			match[2] === "pi" ||
			/(?:^|\s)\S*(?:pi-coding-agent\/(?:dist|src)\/cli\.(?:js|ts)|\/pi\/packages\/coding-agent\/src\/cli\.ts)(?:\s|$)/.test(
				match[3],
			);
		if (isPi)
			throw new Error(
				`Pi process ${pid} does not report session ownership. Close older Pi instances before moving.`,
			);
	}
}
