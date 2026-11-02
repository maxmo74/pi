// The advice pi prints after a successful self-update. A fork build must never be sent to pi.dev's installer,
// which would install the official package over the patched one and drop every patch without saying so.
import { describe, expect, it } from "vitest";
import { getSelfUpdateAdvice } from "../src/package-manager-cli.ts";

const OFFICIAL = "@earendil-works/pi-coding-agent";
const FORK = "@maxmo74/pi-coding-agent";

describe("getSelfUpdateAdvice", () => {
	it("tells an official npm install to migrate to a managed installation", () => {
		const advice = getSelfUpdateAdvice("npm", OFFICIAL, "darwin");
		expect(advice?.notes).toEqual([
			"This npm installation of pi does not pin its dependencies.",
			"Run the installer to migrate to a managed installation that does:",
		]);
		expect(advice?.command).toBe("curl -fsSL https://pi.dev/install.sh | sh");
	});

	it("uses the powershell installer on windows", () => {
		expect(getSelfUpdateAdvice("npm", OFFICIAL, "win32")?.command).toBe(
			'powershell -c "irm https://pi.dev/install.ps1 | iex"',
		);
	});

	it("says nothing to a build published under another name", () => {
		expect(getSelfUpdateAdvice("npm", FORK, "darwin")).toBeUndefined();
	});

	it("says nothing to install methods the installer does not migrate", () => {
		expect(getSelfUpdateAdvice("pnpm", OFFICIAL, "darwin")).toBeUndefined();
		expect(getSelfUpdateAdvice("bun-binary", OFFICIAL, "darwin")).toBeUndefined();
	});
});
