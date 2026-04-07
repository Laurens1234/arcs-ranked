import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const cacheRoot = path.join(repoRoot, ".cache");
const cloneDir = path.join(cacheRoot, REPO_NAME);

const resultsDir = path.join(cloneDir, "results");
const loreDir = path.join(cloneDir, "results", "lore");
const outFile = path.join(repoRoot, "assets", "leader-generator-manifest.json");

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function git(args, { cwd } = {}) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function ensureClone() {
  await fs.mkdir(cacheRoot, { recursive: true });

  const hasGitDir = await pathExists(path.join(cloneDir, ".git"));
  const repoUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;

  if (!hasGitDir) {
    // Fresh shallow clone.
    await git(["clone", "--depth", "1", "--branch", BRANCH, repoUrl, cloneDir], { cwd: cacheRoot });
    return;
  }

  // Update existing clone.
  await git(["fetch", "origin", BRANCH, "--depth", "1"], { cwd: cloneDir });
  await git(["reset", "--hard", `origin/${BRANCH}`], { cwd: cloneDir });
}

async function listPngFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await ensureClone();

  const leaders = await listPngFiles(resultsDir);
  const lore = await listPngFiles(loreDir);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: BRANCH,
    },
    leaders,
    lore,
  };

  await fs.writeFile(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");

  process.stdout.write(
    `Wrote ${path.relative(repoRoot, outFile)} (${leaders.length} leaders, ${lore.length} lore)\n`
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exitCode = 1;
});
