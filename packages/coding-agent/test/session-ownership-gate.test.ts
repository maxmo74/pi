import { type ChildProcess, fork } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface GateEvent {
	event: string;
	message?: string;
}

describe.skipIf(process.platform !== "linux")("session ownership gate", () => {
	let directory: string;
	const children: ChildProcess[] = [];
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "pi-gate-test-"));
	});
	afterEach(async () => {
		await Promise.all(
			children.splice(0).map(
				(child) =>
					new Promise<void>((resolve) => {
						if (child.exitCode !== null || child.signalCode !== null) {
							resolve();
							return;
						}
						child.once("exit", () => resolve());
						child.kill("SIGKILL");
					}),
			),
		);
		rmSync(directory, { recursive: true, force: true });
	});

	function start(mode: string) {
		const child = fork(
			fileURLToPath(new URL("./fixtures/session-ownership-gate.ts", import.meta.url)),
			[mode, join(directory, "release")],
			{
				execArgv: [],
				silent: true,
				env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory },
			},
		);
		children.push(child);
		const events: GateEvent[] = [];
		child.on("message", (message) => events.push(message as GateEvent));
		const exited = new Promise<void>((resolve, reject) => {
			child.once("exit", () => resolve());
			child.once("error", reject);
		});
		return { child, events, exited };
	}

	it("waits for another process and succeeds after it releases the gate", async () => {
		const holder = start("hold");
		await expect.poll(() => holder.events.some((event) => event.event === "acquired"), { timeout: 3000 }).toBe(true);
		const contender = start("acquire");
		await expect
			.poll(() => contender.events.some((event) => event.event === "attempt"), { timeout: 3000 })
			.toBe(true);
		expect(contender.events.some((event) => event.event === "acquired")).toBe(false);
		writeFileSync(join(directory, "release"), "release");
		await Promise.all([holder.exited, contender.exited]);
		expect(contender.events.map((event) => event.event)).toEqual(["attempt", "acquired", "released"]);
	});

	it("times out without stealing an abandoned gate", async () => {
		const crashed = start("crash");
		await crashed.exited;
		expect(crashed.child.exitCode).toBe(23);
		const contender = start("acquire");
		await contender.exited;
		expect(contender.events.map((event) => event.event)).toEqual(["attempt", "error"]);
		expect(contender.events[1].message).toContain("Session ownership is busy");
		expect(existsSync(join(directory, `pi-session-owners-${process.getuid!()}`, "gate"))).toBe(true);
	});

	it.each(["throw", "nested"])("releases the gate when the operation fails (%s)", async (mode) => {
		const failed = start(mode);
		await failed.exited;
		expect(failed.events.at(-1)?.event).toBe("error");
		expect(failed.events.at(-1)?.message).toContain(mode === "nested" ? "recursively" : "operation failed");
		const next = start("acquire");
		await next.exited;
		expect(next.events.map((event) => event.event)).toEqual(["attempt", "acquired", "released"]);
	});
});
