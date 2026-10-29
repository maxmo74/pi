import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSessionFile } from "../src/core/session-delete.ts";
import { getDefaultSessionDir, SessionManager } from "../src/core/session-manager.ts";
import { moveSessionHere } from "../src/core/session-move.ts";
import { withSessionOwnershipGate } from "../src/core/session-ownership.ts";

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof childProcess>()),
	execFileSync: vi.fn(),
	spawnSync: vi.fn(),
}));

const unavailableTrash = { pid: 0, output: [], stdout: "", stderr: "", status: 1, signal: null };

describe.skipIf(process.platform !== "linux")("coordinated session deletion", () => {
	let root: string;
	let source: string;
	let target: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pi-delete-test-"));
		target = join(root, "target");
		mkdirSync(target);
		source = join(getDefaultSessionDir(root, root), "test.jsonl");
		writeFileSync(source, `${JSON.stringify({ type: "session", version: 3, id: "test", cwd: root })}\n`);
		vi.mocked(childProcess.execFileSync).mockReturnValue("");
		vi.mocked(childProcess.spawnSync).mockReturnValue(unavailableTrash);
	});
	afterEach(() => {
		vi.resetAllMocks();
		rmSync(root, { recursive: true, force: true });
	});

	it("refuses an open session before running trash or unlink", () => {
		const manager = SessionManager.open(source);
		try {
			expect(deleteSessionFile(source)).toMatchObject({
				ok: false,
				error: expect.stringContaining("open in process"),
			});
			expect(childProcess.spawnSync).not.toHaveBeenCalled();
			expect(existsSync(source)).toBe(true);
		} finally {
			manager.dispose();
		}
		expect(deleteSessionFile(source)).toEqual({ ok: true, method: "unlink" });
		expect(existsSync(source)).toBe(false);
	});

	it("holds the mutation gate throughout the trash attempt and unlink fallback", () => {
		vi.mocked(childProcess.spawnSync).mockImplementation(() => {
			expect(() => withSessionOwnershipGate(() => {})).toThrow("recursively");
			return unavailableTrash;
		});
		expect(deleteSessionFile(source)).toEqual({ ok: true, method: "unlink" });
		expect(() => moveSessionHere(source, target, root)).toThrow();
	});

	it("a stale deletion of the old path cannot remove the moved file", () => {
		const moved = moveSessionHere(source, target, root);
		const before = readFileSync(moved);
		deleteSessionFile(source);
		expect(readFileSync(moved)).toEqual(before);
	});

	it("fails closed when an older Pi instance does not report ownership", () => {
		vi.mocked(childProcess.execFileSync).mockReturnValue("999999 pi pi\n");
		expect(deleteSessionFile(source)).toMatchObject({
			ok: false,
			error: expect.stringContaining("does not report session ownership"),
		});
		expect(existsSync(source)).toBe(true);
	});
});
