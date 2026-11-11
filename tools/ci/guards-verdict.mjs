#!/usr/bin/env node
/**
 * @doc Commit-gate verdict cache for test:guards (#2889 slice 1).
 * @skill check-changes
 *
 *   node tools/ci/guards-verdict.mjs check
 *   node tools/ci/guards-verdict.mjs run [-- file.mjs…]
 *
 * `run` executes the test:guards file list (from tests/groups.json, or the
 * paths after `--`). Only a green COMPLETE roster whose worktree matched the
 * same index tree at start and end (no unstaged tracked changes) writes the
 * `git write-tree` hash to artifacts/pre-commit-guards.ok — the same path and
 * format bash-guard.sh already reuses (raw tree hash, 10-minute freshness).
 * Red, timed-out or dirty-tree runs never write; any re-stage changes the tree
 * hash and misses.
 *
 * `check` exits 0 on a fresh green match for the current staged tree and
 * prints `guards: cache hit <tree>`.
 */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Same file bash-guard.sh reads/writes (slice 2 will call `check` too). */
export const OK_REL = "artifacts/pre-commit-guards.ok";
/** Match bash-guard's `find … -mmin -10` window. */
export const FRESH_MS = 10 * 60 * 1000;

function git(cwd, args, opts = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

/** Current index tree hash (`git write-tree`). */
export function writeTree(cwd = ROOT) {
  return git(cwd, ["write-tree"]);
}

/**
 * Tracked paths whose worktree differs from the index (unstaged changes).
 * Mirrors bash-guard's "guards measure the working tree" gate; ignores
 * `.claude/memory/*` the same way.
 */
export function unstagedTracked(cwd = ROOT) {
  const out = spawnSync("git", ["diff", "--name-only"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (out.status !== 0) throw new Error("Cannot inspect unstaged tracked changes");
  return out.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => f && !f.startsWith(".claude/memory/"));
}

export function okPath(root = ROOT) {
  return path.join(root, OK_REL);
}

/** True when OKF holds `tree` and its mtime is within `freshMs`. */
export function isFreshHit(okFile, tree, { now = Date.now(), freshMs = FRESH_MS } = {}) {
  if (!tree || !fs.existsSync(okFile)) return false;
  let body;
  try {
    body = fs.readFileSync(okFile, "utf8");
  } catch {
    return false;
  }
  if (body !== tree) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(okFile).mtimeMs;
  } catch {
    return false;
  }
  return now - mtimeMs <= freshMs;
}

/** Load the curated test:guards file list from groups.json (source of truth). */
export function loadGuardFiles(root = ROOT) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, "tests/groups.json"), "utf8"));
  const files = doc?.groups?.["test:guards"]?.files;
  if (!Array.isArray(files) || !files.length) {
    throw new Error("tests/groups.json has no test:guards.files list");
  }
  return files.slice();
}

/**
 * Write the cache file the way bash-guard does: raw tree hash, no trailing newline.
 * Never call this for a red / dirty / timed-out run.
 */
export function writeOk(okFile, tree) {
  fs.mkdirSync(path.dirname(okFile), { recursive: true });
  fs.writeFileSync(okFile, tree);
}

/**
 * @returns {{ hit: boolean, tree: string, message: string }}
 */
export function checkVerdict({ root = ROOT, freshMs = FRESH_MS, now = Date.now() } = {}) {
  const tree = writeTree(root);
  const okFile = okPath(root);
  if (isFreshHit(okFile, tree, { now, freshMs })) {
    return { hit: true, tree, message: `guards: cache hit ${tree}` };
  }
  return { hit: false, tree, message: `guards: cache miss ${tree}` };
}

/**
 * Run the guard suite. Writes the cache only when green and the worktree was
 * clean (matched the index) both before and after.
 *
 * @param {{ root?: string, files?: string[], spawn?: Function }} opts
 * @returns {{ status: number, wrote: boolean, tree: string|null, dirty: boolean, reason: string }}
 */
export function runGuards({
  root = ROOT,
  files,
  spawn = (args, cwd) =>
    spawnSync(process.execPath, ["--test", ...args], {
      cwd,
      encoding: "utf8",
      stdio: "inherit",
      // Node treats inherited test context as recursion and skips all files.
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")),
    }),
} = {}) {
  const roster = loadGuardFiles(root);
  const list = files && files.length ? files : roster;
  const complete = list.length === roster.length && new Set(list).size === roster.length
    && roster.every((file) => list.includes(file));
  // A new attempt supersedes an earlier verdict, including on red or interruption.
  fs.rmSync(okPath(root), { force: true });
  let startTree = null, dirtyStart = null;
  try {
    startTree = writeTree(root);
    dirtyStart = unstagedTracked(root);
  } catch { /* Unknown Git state cannot authorize a cache write. */ }
  const r = spawn(list, root);
  const status = r.status == null ? 1 : r.status;
  let tree = null, dirtyEnd = null;
  try {
    tree = writeTree(root);
    dirtyEnd = unstagedTracked(root);
  } catch { /* Keep the suite's status, but refuse to cache unknown provenance. */ }
  const dirty = !!(dirtyStart?.length || dirtyEnd?.length);
  if (status !== 0) return { status, wrote: false, tree, dirty, reason: "red" };
  if (!complete) return { status: 0, wrote: false, tree, dirty, reason: "partial-suite" };
  if (!startTree || !tree || !dirtyStart || !dirtyEnd) {
    return { status: 0, wrote: false, tree, dirty, reason: "git-inspection" };
  }
  if (dirty) return { status: 0, wrote: false, tree, dirty: true, reason: "dirty-tree" };
  if (tree !== startTree) return { status: 0, wrote: false, tree, dirty: false, reason: "changed-tree" };
  writeOk(okPath(root), tree);
  return { status: 0, wrote: true, tree, dirty: false, reason: "green" };
}

async function main(argv) {
  exitIfHelp(argv, `usage: node tools/ci/guards-verdict.mjs <check|run> [-- file.mjs…]`);
  const cmd = argv[0];
  if (cmd !== "check" && cmd !== "run") {
    console.error(`guards-verdict: unknown command ${cmd || "(none)"}\nusage: node tools/ci/guards-verdict.mjs <check|run> [-- file.mjs…]`);
    process.exit(2);
  }
  const dash = argv.indexOf("--");
  const files = dash >= 0 ? argv.slice(dash + 1).filter(Boolean) : [];
  if (cmd === "check") {
    const v = checkVerdict({ root: ROOT });
    if (v.hit) {
      console.log(v.message);
      process.exit(0);
    }
    console.error(v.message);
    process.exit(1);
  }
  // The served generated files are gitignored (docs/notes/DEPLOY-TIME-GEN-2026-10-28.md); load-order and
  // global-registry read every FULL file, so build what is missing or stale first. They are ignored, so the
  // tree hash this verdict caches is unchanged. A fixture checkout without the generator skips it.
  const ensureMod = path.join(ROOT, "tools/gen/ensure-built.mjs");
  if (fs.existsSync(ensureMod)) {
    const { ensureBuilt, builtLine } = await import(pathToFileURL(ensureMod).href);
    const line = builtLine(ensureBuilt());
    if (line) console.error(`guards: ${line}`);
  }
  const result = runGuards({ root: ROOT, files: files.length ? files : undefined });
  if (result.wrote) {
    console.error(`guards: cached green ${result.tree}`);
  } else if (result.status === 0) {
    const reason = { "dirty-tree": "dirty worktree (stage or stash unstaged tracked files)",
      "partial-suite": "only a subset of the guards roster ran", "changed-tree": "the index tree changed during execution",
      "git-inspection": "Git provenance could not be inspected" }[result.reason];
    console.error(`guards: green but ${reason} — cache not written`);
  }
  process.exit(result.status);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) await main(process.argv.slice(2));
