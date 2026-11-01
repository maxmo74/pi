// Resuming a session another live Pi holds must be refused: two writers fork its history.
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultSessionDir, SessionManager } from "../src/core/session-manager.ts";
import { getSessionOpenRefusal } from "../src/core/session-ownership.ts";

describe("session open refusal", () => {
	let root: string;
	let agent: string;
	let session: string;

	beforeEach(() => {
		// Ownership paths are canonical, so compare against the resolved temp root (macOS links /var to /private/var).
		root = realpathSync(mkdtempSync(join(tmpdir(), "pi-open-refusal-")));
		agent = join(root, "agent");
		const project = join(root, "project");
		mkdirSync(project);
		session = join(getDefaultSessionDir(project, agent), "session.jsonl");
		writeFileSync(
			session,
			`${JSON.stringify({ type: "session", version: 3, id: "test", timestamp: new Date().toISOString(), cwd: project })}\n`,
		);
	});

	afterEach(() => {
		delete process.env.PI_ALLOW_SHARED_SESSION;
		rmSync(root, { recursive: true, force: true });
	});

	/** Hold the file from a separate process, the way a second terminal would. */
	async function holdInOtherProcess(file: string): Promise<{ pid: number; release: () => Promise<unknown> }> {
		const child = fork(fileURLToPath(new URL("./fixtures/session-owner.ts", import.meta.url)), [file], {
			execArgv: [],
			silent: true,
		});
		await once(child, "message");
		return {
			pid: child.pid!,
			release: async () => {
				const exited = once(child, "exit");
				child.send("release");
				return exited;
			},
		};
	}

	it("refuses a session a live process holds, naming it and the way out", async () => {
		const holder = await holdInOtherProcess(session);
		try {
			const refusal = getSessionOpenRefusal(session);
			expect(refusal).toContain(`process ${holder.pid}`);
			expect(refusal).toContain("PI_ALLOW_SHARED_SESSION");
		} finally {
			await holder.release();
		}
	});

	it("allows the session once the holder exits", async () => {
		const holder = await holdInOtherProcess(session);
		await holder.release();
		expect(getSessionOpenRefusal(session)).toBeUndefined();
	});

	it("allows the session this process holds, so re-selecting it stays a no-op", () => {
		const manager = SessionManager.open(session);
		try {
			expect(getSessionOpenRefusal(session)).toBeUndefined();
		} finally {
			manager.dispose();
		}
	});

	it("ignores a live process holding a different session", async () => {
		const other = session.replace("session.jsonl", "other.jsonl");
		writeFileSync(
			other,
			`${JSON.stringify({ type: "session", version: 3, id: "other", timestamp: new Date().toISOString(), cwd: root })}\n`,
		);
		const holder = await holdInOtherProcess(other);
		try {
			expect(getSessionOpenRefusal(session)).toBeUndefined();
		} finally {
			await holder.release();
		}
	});

	it("resumes anyway when PI_ALLOW_SHARED_SESSION is set", async () => {
		const holder = await holdInOtherProcess(session);
		try {
			process.env.PI_ALLOW_SHARED_SESSION = "1";
			expect(getSessionOpenRefusal(session)).toBeUndefined();
		} finally {
			delete process.env.PI_ALLOW_SHARED_SESSION;
			await holder.release();
		}
	});

	it("ignores a record left behind by a process that is gone", () => {
		const owners = join(tmpdir(), `pi-session-owners-${process.getuid?.() ?? "user"}`);
		mkdirSync(owners, { recursive: true, mode: 0o700 });
		const record = join(owners, "999999.json");
		writeFileSync(record, JSON.stringify({ start: null, sessions: [session] }), { mode: 0o600 });
		expect(getSessionOpenRefusal(session)).toBeUndefined();
		expect(existsSync(record)).toBe(false);
		expect(readdirSync(owners).filter((file) => file === "999999.json")).toEqual([]);
	});
});
