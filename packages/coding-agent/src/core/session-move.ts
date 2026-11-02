// Relocate an inactive session without rewriting its conversation history.
import { randomUUID } from "node:crypto";
import {
	closeSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { getAgentDir } from "../config.ts";
import { canonicalizePath } from "../utils/paths.ts";
import { getDefaultSessionDir, type SessionHeader } from "./session-manager.ts";
import {
	assertSessionUnused,
	markSessionMoved,
	unmarkSessionMoved,
	withSessionOwnershipGate,
} from "./session-ownership.ts";

function readHeader(path: string): SessionHeader {
	const fd = openSync(path, "r");
	try {
		const buffer = Buffer.alloc(1024 * 1024);
		const count = readSync(fd, buffer, 0, buffer.length, 0);
		const newline = buffer.subarray(0, count).indexOf(10);
		if (newline < 0) throw new Error(`Missing or oversized session header: ${path}`);
		const value = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
		if (value?.type !== "session" || typeof value.id !== "string" || typeof value.cwd !== "string") {
			throw new Error(`Invalid session header: ${path}`);
		}
		return value as SessionHeader;
	} finally {
		closeSync(fd);
	}
}

function writeDurableFile(path: string, content: Buffer | string): void {
	const fd = openSync(path, "wx", 0o600);
	try {
		writeFileSync(fd, content);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

/** Move a default-storage session; retain a backup and refuse uncertain ownership or linked children. */
export function moveSessionHere(sourcePath: string, targetCwd: string, agentDir = getAgentDir()): string {
	return withSessionOwnershipGate(() => {
		const source = realpathSync(sourcePath);
		if (lstatSync(sourcePath).isSymbolicLink()) throw new Error("Moving symlinked session files is not supported.");
		if (statSync(source).nlink !== 1) throw new Error("Moving hard-linked session files is not supported.");
		const target = realpathSync(targetCwd);
		if (!statSync(target).isDirectory()) throw new Error("Move destination must be a directory.");
		const header = readHeader(source);
		if (canonicalizePath(header.cwd) === target) throw new Error("Session already belongs to this directory.");
		const sessionsRoot = realpathSync(join(agentDir, "sessions"));
		if (dirname(dirname(source)) !== sessionsRoot)
			throw new Error("Only default session storage is supported for now.");
		assertSessionUnused(source);

		// Changing child headers would require a multi-file transaction. Do not silently break ancestry.
		for (const directory of readdirSync(sessionsRoot, { withFileTypes: true })) {
			if (directory.isSymbolicLink())
				throw new Error("Symlinked session storage needs manual review before moving.");
			if (!directory.isDirectory()) continue;
			for (const file of readdirSync(join(sessionsRoot, directory.name))) {
				if (!file.endsWith(".jsonl")) continue;
				const child = readHeader(join(sessionsRoot, directory.name, file));
				if (child.parentSession && canonicalizePath(child.parentSession) === source) {
					throw new Error("Session has forks or clones referencing its path; moving it is not supported yet.");
				}
			}
		}

		const original = readFileSync(source);
		const newline = original.indexOf(10);
		// Validate every JSONL record, but preserve all bytes after the header, including unknown entry types.
		for (const line of original.toString("utf8").split("\n")) if (line.trim()) JSON.parse(line);
		const output = Buffer.concat([
			Buffer.from(`${JSON.stringify({ ...header, cwd: target })}\n`),
			original.subarray(newline + 1),
		]);
		const destination = join(getDefaultSessionDir(target, agentDir), basename(source));
		if (resolve(destination) === source) throw new Error("Source and destination storage paths are identical.");
		const backupDir = join(agentDir, "session-move-backups");
		mkdirSync(backupDir, { recursive: true, mode: 0o700 });
		const backup = join(backupDir, `${randomUUID()}.jsonl`);
		writeDurableFile(backup, original);
		if (!readFileSync(backup).equals(original)) throw new Error(`Backup verification failed: ${backup}`);
		writeDurableFile(
			`${backup}.metadata.json`,
			`${JSON.stringify({ source, destination, sessionId: header.id, created: new Date().toISOString() }, null, 2)}\n`,
		);
		const backupDirectoryFd = openSync(backupDir, "r");
		try {
			fsyncSync(backupDirectoryFd);
		} finally {
			closeSync(backupDirectoryFd);
		}
		const temporary = `${destination}.${randomUUID()}.tmp`;
		const fd = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(fd, output);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		let published = false;
		let marked = false;
		try {
			// Hard-link publication is atomic and never replaces an existing destination.
			linkSync(temporary, destination);
			published = true;
			if (!readFileSync(destination).equals(output)) throw new Error("Destination verification failed.");
			if (!readFileSync(source).equals(original)) throw new Error("Source changed during the move.");
			markSessionMoved(source, destination);
			marked = true;
			unlinkSync(source);
		} catch (error) {
			if (marked) unmarkSessionMoved(source);
			if (published) unlinkSync(destination);
			throw error;
		} finally {
			unlinkSync(temporary);
		}
		return destination;
	});
}
