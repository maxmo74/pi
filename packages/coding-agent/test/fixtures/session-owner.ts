// Child-process fixture for session relocation ownership tests.
import { SessionManager } from "../../src/core/session-manager.ts";

const manager = SessionManager.open(process.argv[2]);
process.send?.("ready");
process.on("message", () => {
	manager.dispose();
	process.send?.("released");
	process.disconnect();
});
