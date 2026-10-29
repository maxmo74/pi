// Delete inactive sessions under the same gate used by relocation and ownership registration.
import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { assertSessionUnused, withSessionOwnershipGate } from "./session-ownership.ts";

export interface SessionDeleteResult {
	ok: boolean;
	method: "trash" | "unlink";
	error?: string;
}

/** Prefer trash, retaining the existing unlink fallback; on Linux, refuse active or untracked owners. */
export function deleteSessionFile(sessionPath: string): SessionDeleteResult {
	try {
		if (process.platform !== "linux") return removeSessionFile(sessionPath);
		return withSessionOwnershipGate(() => {
			assertSessionUnused(sessionPath);
			return removeSessionFile(sessionPath);
		});
	} catch (error) {
		return { ok: false, method: "unlink", error: error instanceof Error ? error.message : String(error) };
	}
}

function removeSessionFile(sessionPath: string): SessionDeleteResult {
	const trashArgs = sessionPath.startsWith("-") ? ["--", sessionPath] : [sessionPath];
	const trashResult = spawnSync("trash", trashArgs, { encoding: "utf-8" });
	if (trashResult.status === 0 || !existsSync(sessionPath)) return { ok: true, method: "trash" };
	try {
		unlinkSync(sessionPath);
		return { ok: true, method: "unlink" };
	} catch (error) {
		const parts: string[] = [];
		if (trashResult.error) parts.push(trashResult.error.message);
		const stderr = trashResult.stderr?.trim();
		if (stderr) parts.push(stderr.split("\n")[0] ?? stderr);
		const hint = parts.length ? ` (trash: ${parts.join(" · ").slice(0, 200)})` : "";
		return { ok: false, method: "unlink", error: `${error instanceof Error ? error.message : String(error)}${hint}` };
	}
}
