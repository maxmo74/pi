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
	it("requires confirmation, allows cancellation, and refreshes after moving", async () => {
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
		expect(load).toHaveBeenCalledTimes(2);
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
});
