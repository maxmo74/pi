// Launch the move-session prototype against disposable synthetic sessions, never the user's profile.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = mkdtempSync(join(tmpdir(), "pi-move-demo-"));
const profile = join(sandbox, "profile");
const source = join(sandbox, "source");
const target = join(sandbox, "target");
mkdirSync(source);
mkdirSync(target);
for (const [cwd, name] of [[source, "Move this demo session"], [target, "Already here — move disabled"]]) {
	const directory = join(profile, "sessions", `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`);
	mkdirSync(directory, { recursive: true });
	const timestamp = new Date().toISOString();
	const id = randomUUID();
	const records = [
		{ type: "session", version: 3, id, timestamp, cwd },
		{ type: "message", id: "message", parentId: null, timestamp, message: { role: "user", content: "Synthetic session for testing relocation. No model request needed.", timestamp: Date.now() } },
		{ type: "session_info", id: "name", parentId: "message", timestamp, name },
	];
	writeFileSync(join(directory, `${timestamp.replace(/[:.]/g, "-")}_${id}.jsonl`), `${records.map(record => JSON.stringify(record)).join("\n")}\n`, { mode: 0o600 });
}
writeFileSync(join(profile, "settings.json"), JSON.stringify({ fullscreen: false }));
console.log(`Isolated demo: ${sandbox}`);
console.log("Tab → select 'Move this demo session' → Ctrl+Y → Enter (or Escape to cancel).");
console.log("Older Pi processes should cause a refusal. Close them to test a successful move.");
console.log("No real sessions or credentials are copied. The demo directory is retained for inspection.");
const env = { ...process.env, PI_CODING_AGENT_DIR: profile };
delete env.PI_CODING_AGENT_SESSION_DIR;
const result = spawnSync(join(checkout, "pi-test.sh"), ["--no-env", "--resume"], {
	cwd: target,
	env,
	stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
