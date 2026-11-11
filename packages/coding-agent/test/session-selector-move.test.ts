import { homedir } from "node:os";
import { setKeybindings } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import type { SessionInfo } from "../src/core/session-manager.ts";
import { SessionSelectorComponent } from "../src/modes/interactive/components/session-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function session(cwd: string): SessionInfo {
	return {
		path: "/session.jsonl",
		cwd,
		id: "a",
		created: new Date(),
		modified: new Date(),
		messageCount: 1,
		firstMessage: "hello",
		allMessagesText: "hello",
	};
}

describe("session picker move", () => {
	beforeAll(() => initTheme("dark"));
	beforeEach(() => setKeybindings(new KeybindingsManager()));
	it("requires confirmation, allows cancellation, and corrects the row in place after moving", async () => {
		const move = vi.fn(() => "/new/session.jsonl");
		const load = vi.fn(async () => [session("/elsewhere")]);
		const select = vi.fn();
		const picker = new SessionSelectorComponent(
			load,
			load,
			select,
			() => {},
			() => {},
			() => {},
			{ moveTarget: "/target", moveSession: move },
		);
		await flush();
		const loadsBeforeMove = load.mock.calls.length;
		picker.handleInput("\x19");
		expect(picker.render(140).join("\n")).toContain("Move session from /elsewhere to /target?");
		expect(move).not.toHaveBeenCalled();
		picker.handleInput("\x1b");
		expect(move).not.toHaveBeenCalled();
		picker.handleInput("\x19");
		picker.handleInput("\r");
		await flush();
		expect(move).toHaveBeenCalledExactlyOnceWith("/session.jsonl", "/target");
		expect(select).not.toHaveBeenCalled();
		// The row is corrected where it stands. Re-reading the list would move the cursor: a reload arrives in
		// pages and setSessions() clamps the index to the page in hand, so deleting or moving near the bottom
		// of a long list used to land the cursor somewhere in the middle.
		expect(load.mock.calls).toHaveLength(loadsBeforeMove);
		// And the session is here now, so there is nothing left to move.
		picker.handleInput("\x19");
		expect(picker.render(140).join("\n")).not.toContain("Move session from");
	});
	it("does nothing for a session already in the destination", async () => {
		const move = vi.fn(() => "");
		const picker = new SessionSelectorComponent(
			async () => [session("/target")],
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: "/target", moveSession: move },
		);
		await flush();
		picker.handleInput("\x19");
		expect(picker.render(140).join("\n")).not.toContain("Move session from");
		expect(move).not.toHaveBeenCalled();
	});
	it("yanks into the search field when no move is available", async () => {
		const move = vi.fn(() => "");
		const picker = new SessionSelectorComponent(
			async () => [session("/target")],
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: "/target", moveSession: move },
		);
		await flush();
		for (const character of "hello") picker.handleInput(character);
		// Ctrl+W kills the word into the kill ring; Ctrl+Y must yank it back instead of being swallowed.
		picker.handleInput("\x17");
		picker.handleInput("\x19");
		const rendered = picker.render(140).join("\n");
		// The search field is the line starting with "> "; list rows start with "› ", so this match proves
		// reached the input rather than being swallowed by the move binding.
		expect(rendered).toMatch(/> hello/);
		expect(rendered).not.toContain("Move session from");
		expect(move).not.toHaveBeenCalled();
	});
	it("refuses the current session even when it belongs elsewhere", async () => {
		const picker = new SessionSelectorComponent(
			async () => [session("/elsewhere")],
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: "/target" },
			"/session.jsonl",
		);
		await flush();
		picker.handleInput("\x19");
		expect(picker.render(140).join("\n")).not.toContain("Move session from");
	});
	it("shows a backend refusal without resuming or deleting the session", async () => {
		const select = vi.fn();
		const picker = new SessionSelectorComponent(
			async () => [session("/elsewhere")],
			async () => [],
			select,
			() => {},
			() => {},
			() => {},
			{
				moveTarget: "/target",
				moveSession: () => {
					throw new Error("Session is busy");
				},
			},
		);
		await flush();
		picker.handleInput("\x19");
		picker.handleInput("\r");
		await flush();
		expect(picker.render(140).join("\n")).toContain("Cannot move: Session is busy");
		expect(select).not.toHaveBeenCalled();
	});
	it("shows the destination directory in both scopes", async () => {
		const picker = new SessionSelectorComponent(
			async () => [session("/target")],
			async () => [session("/elsewhere")],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: "/target", moveSession: () => "" },
		);
		await flush();
		const current = picker.render(140).join("\n");
		expect(current).toContain("Resume Session (Current Folder: /target)");
		picker.handleInput("\t");
		await flush();
		// Same directory in both scopes: in "All" it is also where a confirmed move lands.
		const all = picker.render(140).join("\n");
		expect(all).toContain("Resume Session (All · → /target)");
	});
	it("keeps the folder on screen at every width, in exactly one place", async () => {
		const target = "/opt/projects/pi-max-fork/worktrees/release-v1.5.0";
		const picker = new SessionSelectorComponent(
			async () => [session("/target")],
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: target },
		);
		await flush();
		for (const width of [140, 120, 100, 90, 80]) {
			const rendered = picker.render(width).join("\n");
			// Header, with the whole path or with leading segments dropped, or the hint line.
			const inHeader = /Current Folder: (?:[^)]*release-v1\.5\.0)/.test(rendered);
			const onHintLine = rendered.includes(`→ ${target}`);
			expect(inHeader || onHintLine, `folder is nowhere on screen at width ${width}`).toBe(true);
			expect(inHeader && onHintLine, `folder is shown twice at width ${width}`).toBe(false);
		}
	});
	it("shortens the destination under the home directory", async () => {
		const home = process.env.HOME ?? homedir();
		const picker = new SessionSelectorComponent(
			async () => [session("/x")],
			async () => [session("/x")],
			() => {},
			() => {},
			() => {},
			() => {},
			{ moveTarget: `${home}/gitlab/pi` },
		);
		await flush();
		picker.handleInput("\t");
		await flush();
		const rendered = picker.render(140).join("\n");
		expect(rendered).toContain("→ ~/gitlab/pi");
		expect(rendered).not.toContain(home);
	});
});
