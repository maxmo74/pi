import * as childProcess from "node:child_process";
import { once } from "node:events";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultSessionDir, SessionManager } from "../src/core/session-manager.ts";
import { moveSessionHere } from "../src/core/session-move.ts";
import { withSessionFileUsage } from "../src/core/session-ownership.ts";

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof childProcess>()),
	execFileSync: vi.fn(),
}));

// Mock only legacy-process discovery: all session registrations and filesystem mutations are real.
describe.skipIf(process.platform !== "linux")("session move", () => {
	let root: string;
	let agent: string;
	let source: string;
	let target: string;
	let original: string;
	beforeEach(() => {
		vi.mocked(childProcess.execFileSync).mockReturnValue("");
		root = mkdtempSync(join(tmpdir(), "pi-move-test-"));
		agent = join(root, "agent");
		const from = join(root, "from");
		target = join(root, "to");
		mkdirSync(from);
		mkdirSync(target);
		source = join(getDefaultSessionDir(from, agent), "session.jsonl");
		original = `${JSON.stringify({ type: "session", version: 3, id: "test", timestamp: new Date().toISOString(), cwd: from })}\n{ "type": "custom", "id": "a", "parentId": null, "data": "unchanged" }\n`;
		writeFileSync(source, original);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(root, { recursive: true, force: true });
	});
	it("moves only the header cwd and preserves history, ID and a full backup", () => {
		const destination = moveSessionHere(source, target, agent);
		expect(existsSync(source)).toBe(false);
		const result = readFileSync(destination, "utf8");
		expect(JSON.parse(result.split("\n")[0])).toMatchObject({ cwd: target, id: "test" });
		expect(result.slice(result.indexOf("\n"))).toBe(original.slice(original.indexOf("\n")));
		const backups = readdirSync(join(agent, "session-move-backups")).filter((file) => file.endsWith(".jsonl"));
		expect(backups).toHaveLength(1);
		const backup = join(agent, "session-move-backups", backups[0]);
		expect(readFileSync(backup, "utf8")).toBe(original);
		expect(JSON.parse(readFileSync(`${backup}.metadata.json`, "utf8"))).toMatchObject({
			source,
			destination,
			sessionId: "test",
		});
		expect(() => SessionManager.open(source)).toThrow("moved");
		const manager = SessionManager.open(destination);
		expect(manager.getCwd()).toBe(target);
		manager.dispose();
	});
	it("refuses a session held by a manager and allows it after disposal", () => {
		const manager = SessionManager.open(source);
		try {
			expect(() => moveSessionHere(source, target, agent)).toThrow("open in process");
		} finally {
			manager.dispose();
		}
		expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
	});
	it("keeps ownership until all managers release the session", () => {
		const a = SessionManager.open(source);
		const b = SessionManager.open(source);
		a.dispose();
		try {
			expect(() => moveSessionHere(source, target, agent)).toThrow("open in process");
		} finally {
			b.dispose();
		}
	});
	it("detects the exact session held by another process and releases it on shutdown", async () => {
		const child = childProcess.fork(
			fileURLToPath(new URL("./fixtures/session-owner.ts", import.meta.url)),
			[source],
			{ execArgv: [], silent: true },
		);
		try {
			await once(child, "message");
			expect(() => moveSessionHere(source, target, agent)).toThrow(`open in process ${child.pid}`);
			const released = once(child, "exit");
			child.send("release");
			await released;
			expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
		} finally {
			child.kill();
		}
	});
	it("ignores stale ownership after the owning process is killed", async () => {
		const child = childProcess.fork(
			fileURLToPath(new URL("./fixtures/session-owner.ts", import.meta.url)),
			[source],
			{ execArgv: [], silent: true },
		);
		try {
			await once(child, "message");
			const exited = once(child, "exit");
			child.kill("SIGKILL");
			await exited;
			expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
		} finally {
			child.kill();
		}
	});
	it("releases ownership after opening an invalid session fails", () => {
		writeFileSync(source, "not a session\n");
		expect(() => SessionManager.open(source)).toThrow("not a valid");
		writeFileSync(source, original);
		expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
	});
	it("holds a temporary usage reference and releases it even after failure", () => {
		expect(() =>
			withSessionFileUsage(source, () => {
				expect(() => moveSessionHere(source, target, agent)).toThrow("open in process");
				throw new Error("copy failed");
			}),
		).toThrow("copy failed");
		expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
	});
	it("releases the source reference after fork validation fails", () => {
		expect(() =>
			SessionManager.forkFrom(source, target, getDefaultSessionDir(target, agent), { id: "../invalid" }),
		).toThrow();
		expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
	});
	it("publishes a fork reference before releasing source ownership", () => {
		const fork = SessionManager.forkFrom(source, target, getDefaultSessionDir(target, agent));
		try {
			expect(() => moveSessionHere(source, target, agent)).toThrow("forks or clones");
		} finally {
			fork.dispose();
		}
	});
	it("refuses an untracked Pi process", () => {
		vi.mocked(childProcess.execFileSync).mockReturnValue("999999 pi pi\n");
		expect(() => moveSessionHere(source, target, agent)).toThrow("does not report session ownership");
		expect(readFileSync(source, "utf8")).toBe(original);
	});
	it("does not overwrite an existing destination", () => {
		const destination = join(getDefaultSessionDir(target, agent), basename(source));
		writeFileSync(destination, original);
		expect(() => moveSessionHere(source, target, agent)).toThrow();
		expect(readFileSync(destination, "utf8")).toBe(original);
		expect(readFileSync(source, "utf8")).toBe(original);
	});
	it("supports moving back to the original directory", () => {
		const destination = moveSessionHere(source, target, agent);
		const returned = moveSessionHere(destination, join(root, "from"), agent);
		expect(returned).toBe(source);
		const manager = SessionManager.open(returned);
		manager.dispose();
		expect(existsSync(moveSessionHere(returned, target, agent))).toBe(true);
	});
	it("does not block a move because a different session is open", () => {
		const manager = SessionManager.create(target, getDefaultSessionDir(target, agent));
		try {
			expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
		} finally {
			manager.dispose();
		}
	});
	it.skipIf(process.getuid?.() === 0)("rolls back publication if removing the source fails", () => {
		chmodSync(dirname(source), 0o500);
		try {
			expect(() => moveSessionHere(source, target, agent)).toThrow();
			expect(readFileSync(source, "utf8")).toBe(original);
			expect(existsSync(join(getDefaultSessionDir(target, agent), basename(source)))).toBe(false);
		} finally {
			chmodSync(dirname(source), 0o700);
		}
		const manager = SessionManager.open(source);
		manager.dispose();
	});
	it("leaves source untouched and destination unpublished when backup creation fails", () => {
		writeFileSync(join(agent, "session-move-backups"), "not a directory");
		expect(() => moveSessionHere(source, target, agent)).toThrow();
		expect(readFileSync(source, "utf8")).toBe(original);
		expect(existsSync(join(getDefaultSessionDir(target, agent), basename(source)))).toBe(false);
	});
	it("refuses same-directory moves", () => {
		expect(() => moveSessionHere(source, join(root, "from"), agent)).toThrow("already belongs");
	});
	it("refuses to break child session references", () => {
		writeFileSync(
			join(getDefaultSessionDir(target, agent), "child.jsonl"),
			`${JSON.stringify({ type: "session", id: "child", cwd: target, parentSession: source })}\n`,
		);
		expect(() => moveSessionHere(source, target, agent)).toThrow("forks or clones");
	});
	it("refuses malformed history without changing the source", () => {
		writeFileSync(source, `${original}broken\n`);
		expect(() => moveSessionHere(source, target, agent)).toThrow();
		expect(readFileSync(source, "utf8")).toBe(`${original}broken\n`);
	});
});
