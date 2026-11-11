// Exercise the real ownership gate in a child process with an isolated TMPDIR.
import { existsSync } from "node:fs";
import { withSessionOwnershipGate } from "../../src/core/session-ownership.ts";

const [mode, releaseFile] = process.argv.slice(2);
try {
	process.send?.({ event: "attempt" });
	withSessionOwnershipGate(() => {
		process.send?.({ event: "acquired" });
		if (mode === "crash") process.exit(23);
		if (mode === "throw") throw new Error("operation failed");
		if (mode === "nested") withSessionOwnershipGate(() => {});
		if (mode === "hold") {
			const wait = new Int32Array(new SharedArrayBuffer(4));
			const deadline = performance.now() + 5000;
			while (!existsSync(releaseFile)) {
				if (performance.now() >= deadline) throw new Error("Fixture release timed out");
				Atomics.wait(wait, 0, 0, 10);
			}
		}
	});
	process.send?.({ event: "released" });
} catch (error) {
	process.send?.({ event: "error", message: error instanceof Error ? error.message : String(error) });
} finally {
	process.disconnect?.();
}
