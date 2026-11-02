import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportFromFile } from "../src/core/export-html/index.ts";
import { CURRENT_SESSION_VERSION, getDefaultSessionDir, type SessionHeader } from "../src/core/session-manager.ts";
import { moveSessionHere } from "../src/core/session-move.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

// Regression guard: exporting reads a session through a temporary SessionManager. If that manager
// kept its ownership registration, a completed export would block relocation until the process exited.
vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof childProcess>()),
	execFileSync: vi.fn(),
}));

describe("HTML export session ownership", () => {
	let root: string;
	let agent: string;
	let source: string;
	let target: string;

	beforeAll(() => initTheme("dark"));

	beforeEach(() => {
		vi.mocked(childProcess.execFileSync).mockReturnValue("");
		root = realpathSync(mkdtempSync(join(tmpdir(), "pi-export-ownership-")));
		agent = join(root, "agent");
		const from = join(root, "from");
		target = join(root, "to");
		mkdirSync(from);
		mkdirSync(target);
		const header: SessionHeader = {
			type: "session",
			version: CURRENT_SESSION_VERSION,
			id: "export-ownership",
			timestamp: new Date().toISOString(),
			cwd: from,
		};
		source = join(getDefaultSessionDir(from, agent), "session.jsonl");
		writeFileSync(source, `${JSON.stringify(header)}\n`);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(root, { recursive: true, force: true });
	});

	it("releases the session after exporting so it can be moved", async () => {
		const html = await exportFromFile(source, { outputPath: join(root, "export.html") });
		expect(readFileSync(html, "utf8")).toContain("<html");
		expect(existsSync(moveSessionHere(source, target, agent))).toBe(true);
	});
});
