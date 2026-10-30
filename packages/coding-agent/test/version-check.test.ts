import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewPiVersion,
	comparePackageVersions,
	forkBaseVersion,
	formatUpstreamAheadNotice,
	formatUpstreamAheadTitle,
	formatVersionCheckError,
	getForkUpdateStatus,
	getLatestPiRelease,
	getLatestPiVersion,
	isNewerPackageVersion,
	upstreamVersionAhead,
} from "../src/utils/version-check.ts";
import { allowNetwork } from "./test-network-env.ts";

const originalSkipVersionCheck = process.env.PI_SKIP_VERSION_CHECK;
const forkReleaseUrl = "https://github.com/maxmo74/pi/releases/latest/download/update-info.json";

// Answer the fork endpoint and the upstream endpoint differently, the way a stale fork looks live.
function stubReleases(fork: unknown, upstream: unknown) {
	const fetchMock = vi.fn(async (url: string) => Response.json(url.includes("github.com") ? fork : upstream));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	allowNetwork();
});

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.PI_SKIP_VERSION_CHECK;
	} else {
		process.env.PI_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(comparePackageVersions("5.0.0-beta.20", "5.0.0-beta.9")).toBeGreaterThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer versions", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		await expect(checkForNewPiVersion("1.2.2")).resolves.toEqual({ version: "1.2.3" });
	});

	it("uses the fork release asset with a pi user agent", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledWith(
			forkReleaseUrl,
			expect.objectContaining({
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^pi\/1\.2\.3 /),
					accept: "application/json",
				}),
			}),
		);
	});

	it("retries a transient version request when explicitly requested", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockResolvedValueOnce(Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3", { retry: true })).resolves.toEqual({ version: "1.2.4" });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("keeps automatic version checks to one request", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("formats nested network error details", () => {
		const error = new Error("fetch failed", {
			cause: new AggregateError([
				Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }),
				Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" }),
			]),
		});

		expect(formatVersionCheckError(error)).toBe("fetch failed (ETIMEDOUT, ENETUNREACH)");
	});

	it("returns the active package metadata from the version check api", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				packageName: "@new-scope/pi",
				version: "1.2.4",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3")).resolves.toEqual({
			packageName: "@new-scope/pi",
			version: "1.2.4",
		});
	});

	it("returns update notes from the version check api", async () => {
		const fetchMock = vi.fn(async () => Response.json({ note: " **Read this** ", version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3")).resolves.toEqual({ note: "**Read this**", version: "1.2.4" });
	});

	it("skips automatic api calls when version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("allows direct api calls when automatic version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});

describe("fork update status", () => {
	beforeEach(() => {
		allowNetwork();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		if (originalSkipVersionCheck === undefined) delete process.env.PI_SKIP_VERSION_CHECK;
	});

	it("strips this fork's revision suffix", () => {
		expect(forkBaseVersion("1.4.0-max.2")).toBe("1.4.0");
		expect(forkBaseVersion("1.4.0")).toBe("1.4.0");
	});

	it("offers a patched build whenever the fork published one", async () => {
		stubReleases({ packageName: "@maxmo74/pi-coding-agent", version: "1.4.0-max.1" }, { version: "1.4.0" });

		await expect(getForkUpdateStatus("1.4.0-max.0")).resolves.toEqual({
			kind: "patched-update",
			release: { packageName: "@maxmo74/pi-coding-agent", version: "1.4.0-max.1" },
		});
	});

	it("names the upstream release when the fork still owes a rebuild", async () => {
		stubReleases({ packageName: "@maxmo74/pi-coding-agent", version: "1.4.0-max.0" }, { version: "1.5.0" });

		await expect(getForkUpdateStatus("1.4.0-max.0")).resolves.toEqual({
			kind: "upstream-ahead",
			upstreamVersion: "1.5.0",
		});
	});

	it("stays quiet while the fork matches upstream", async () => {
		stubReleases({ packageName: "@maxmo74/pi-coding-agent", version: "1.4.0-max.3" }, { version: "1.4.0" });

		await expect(getForkUpdateStatus("1.4.0-max.3")).resolves.toEqual({ kind: "current" });
	});

	it("treats unreachable endpoints as nothing to report", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 503 })),
		);

		await expect(getForkUpdateStatus("1.4.0-max.0")).resolves.toEqual({ kind: "current" });
	});

	// A rejected request must not escape: this runs unhandled at startup and inside `pi update`.
	it("swallows a failing endpoint instead of rejecting", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("fetch failed");
			}),
		);

		await expect(getForkUpdateStatus("1.4.0-max.0")).resolves.toEqual({ kind: "current" });
	});

	it("only reports upstream ahead when upstream passes the fork's base version", () => {
		expect(upstreamVersionAhead("1.4.0-max.3", { version: "1.4.0" })).toBeUndefined();
		expect(upstreamVersionAhead("1.4.0-max.3", { version: "1.4.1" })).toBe("1.4.1");
		expect(upstreamVersionAhead("1.4.0-max.3", { version: "1.3.9" })).toBeUndefined();
		expect(upstreamVersionAhead("1.4.0-max.3", undefined)).toBeUndefined();
	});

	it("asks both endpoints exactly once", async () => {
		const fetchMock = stubReleases({ version: "1.4.0-max.0" }, { version: "1.5.0" });

		await getForkUpdateStatus("1.4.0-max.0");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("asks nothing when version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getForkUpdateStatus("1.4.0-max.0")).resolves.toEqual({ kind: "current" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps the nudge to the two versions", () => {
		expect(formatUpstreamAheadTitle("1.5.0")).toBe("New pi 1.5.0 released - maxmo74 reviewing it. Or napping...");

		const notice = formatUpstreamAheadNotice("1.4.0-max.2", "1.5.0");
		expect(notice).toBe('Your build is 1.4.0-max.2; "pi update" waits for 1.5.0-max.0.');
		// The notice must not read like an installable upgrade.
		expect(notice).toContain("waits for");
	});
});
