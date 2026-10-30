// Publish the patched coding-agent build to npm under this fork's scope.
//
// The repository keeps upstream package names so rebasing stays clean; the rename happens only in
// a staging copy of the published files. Run without --publish to stage and dry-run.
//
// Pushing a v<tag> runs .github/workflows/publish.yml, which builds, publishes through npm's
// trusted publishing and moves the update pointer, so --publish here is for the one publish that
// creates the package and for recovery when CI cannot run.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(repoRoot, "packages", "coding-agent");
const infoPath = join(repoRoot, "patch", "update-info.json");
const publishedName = "@maxmo74/pi-coding-agent";
const defaultNote = "Unofficial pi fork: adds session moves to the /resume picker.";

function printUsage() {
	console.log(`Usage: node scripts/publish-patched.mjs [options]

Stages the patched coding-agent package under ${publishedName} for npm publishing.
Run \`npm run build\` first: the staged tree is copied from the current build output.

Options:
  --publish          Publish the staged package instead of only preparing it
  --revision <n>     Patch revision; defaults to the next unused one in the registry
  --help             Show this usage
`);
}

const { values: options } = parseArgs({
	options: {
		publish: { type: "boolean", default: false },
		revision: { type: "string" },
		help: { type: "boolean", default: false },
	},
});
if (options.help) {
	printUsage();
	process.exit(0);
}

function git(args) {
	return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

/** Versions npm already holds for this name; an unpublished package has none. */
function publishedVersions() {
	try {
		const output = execFileSync("npm", ["view", publishedName, "versions", "--json"], {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const parsed = JSON.parse(output);
		return typeof parsed === "string" ? [parsed] : parsed;
	} catch {
		return [];
	}
}

const source = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const upstreamVersion = source.version;

// The registry decides the next revision, so releasing the same upstream version twice cannot
// collide with a version npm already holds, and npm versions are effectively immutable.
const registry = publishedVersions();
const revisions = registry
	.map((entry) => new RegExp(`^${upstreamVersion}-max\\.(\\d+)$`).exec(entry))
	.filter((match) => match)
	.map((match) => Number(match[1]));
const revision = options.revision === undefined ? (revisions.length ? Math.max(...revisions) + 1 : 0) : Number(options.revision);
if (!Number.isInteger(revision) || revision < 0) throw new Error(`Invalid revision: ${options.revision}`);
// A prerelease suffix rather than build metadata: semver ignores build metadata, so "1.4.0+max.1"
// never compares as newer than "1.4.0+max.0" and `pi update` would stop offering upgrades.
const version = `${upstreamVersion}-max.${revision}`;

// The published bundle inlines every workspace package, so a publish must name its source exactly.
const dirty = git(["status", "--porcelain", "--", "packages"]);
if (dirty) throw new Error("Commit or stash changes under packages/ before publishing.");
const sourceCommit = git(["rev-parse", "HEAD"]);

// dist/ is what ships, so a missing bundle means the build step was skipped rather than that the
// fork has no code yet.
if (!existsSync(join(packageDir, "dist", "bundle", "cli.js"))) {
	throw new Error("packages/coding-agent/dist/bundle/cli.js is missing. Run npm run build first.");
}

const staging = join(repoRoot, ".artifacts", "publish", version);
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
for (const entry of source.files) {
	const from = join(packageDir, entry);
	// npm packs only entries that exist, and this package lists a docs file that lives in docs/.
	if (!existsSync(from)) {
		console.log(`Skipping missing files entry: ${entry}`);
		continue;
	}
	cpSync(from, join(staging, entry), { recursive: true });
}

// npm ships README.md and LICENSE from the packed directory only, and the package directory has no
// LICENSE of its own. Compose both so the registry page says what this package is and carries the
// upstream license notice, while the fork notice stays in one file that survives rebases.
const forkNoticePath = join(repoRoot, "patch", "README.fork.md");
if (!existsSync(forkNoticePath)) {
	throw new Error("patch/README.fork.md is missing; the published README states what this fork is.");
}
const upstreamReadme = readFileSync(join(packageDir, "README.md"), "utf8");
const forkNotice = readFileSync(forkNoticePath, "utf8");
writeFileSync(join(staging, "README.md"), `${forkNotice.trimEnd()}\n\n${upstreamReadme.trimStart()}`);
cpSync(join(repoRoot, "LICENSE"), join(staging, "LICENSE"));

const published = {
	...source,
	name: publishedName,
	version,
	// The staged tree holds build output and no sources, so lifecycle scripts that rebuild must go:
	// the package's prepublishOnly runs `clean` and would delete the bundle being published.
	scripts: {},
	publishConfig: { ...source.publishConfig, access: "public" },
	repository: { type: "git", url: "git+https://github.com/maxmo74/pi.git", directory: "packages/coding-agent" },
	piFork: { upstreamVersion, sourceCommit, builtAt: new Date().toISOString() },
};
writeFileSync(join(staging, "package.json"), `${JSON.stringify(published, null, "	")}\n`);
console.log(`Staged ${publishedName}@${version} in ${staging}`);
console.log(`Registry versions: ${registry.length ? registry.join(", ") : "none"}`);

if (!options.publish) {
	execFileSync("npm", ["publish", "--dry-run"], { cwd: staging, stdio: "inherit" });
	console.log(`\nNext: node scripts/publish-patched.mjs --revision ${revision} --publish`);
	process.exit(0);
}

execFileSync("npm", ["publish", "--access", "public"], { cwd: staging, stdio: "inherit" });

// `pi update` reads this file from the raw-hosted update-info branch, so it names the version just
// published.
const note = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, "utf8")).note || defaultNote : defaultNote;
writeFileSync(infoPath, `${JSON.stringify({ version, packageName: publishedName, note }, null, "	")}\n`);
console.log(`\nPublished ${publishedName}@${version}.`);
console.log(`Installs cannot update until this file reaches the update-info branch. A CI publish`);
console.log(`moves it in the same run; after publishing from here, push it with the git plumbing in`);
console.log(`FORK.md, "Publishing an update".`);
