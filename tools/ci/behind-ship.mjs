#!/usr/bin/env node
/**
 * @doc Print how many commits a PR head is behind the ship branch; warn over 10, never fail.
 * @section runner
 * @skill check-changes
 *
 * Non-blocking advisory for concurrent PRs (AGENTS.md §Concurrent PRs). A PR
 * that sits far behind ship is more likely to conflict or inherit tip reds;
 * this prints the count and emits a GitHub Actions `::warning::` annotation
 * when behind exceeds WARN_BEHIND (10). Exit is always 0 — never fails a job.
 *
 *   node tools/ci/behind-ship.mjs
 *   node tools/ci/behind-ship.mjs --head <sha> --ship origin/claude/f1-game-project-26h3ng
 *   node tools/ci/behind-ship.mjs --json
 *
 * Env (CI): BEHIND_SHIP_HEAD, BEHIND_SHIP_SHIP override CLI defaults.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SHIP = "claude/f1-game-project-26h3ng";
export const WARN_BEHIND = 10;

const defaultGit = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
};

/**
 * @param {{ git?: typeof defaultGit, head?: string, ship?: string, warnAt?: number }} [opts]
 * @returns {{ behind: number|null, head: string, ship: string, warnAt: number, ok: boolean, reason?: string }}
 */
export function measure(opts = {}) {
  const git = opts.git || defaultGit;
  const warnAt = opts.warnAt ?? WARN_BEHIND;
  const head = opts.head || process.env.BEHIND_SHIP_HEAD || "HEAD";
  const ship = opts.ship || process.env.BEHIND_SHIP_SHIP || `origin/${SHIP}`;
  const headOk = git("rev-parse", "--verify", "-q", head);
  if (headOk.status !== 0) {
    return { behind: null, head, ship, warnAt, ok: false, reason: `head ref unresolved: ${head}` };
  }
  const shipOk = git("rev-parse", "--verify", "-q", ship);
  if (shipOk.status !== 0) {
    return { behind: null, head, ship, warnAt, ok: false, reason: `ship ref unresolved: ${ship}` };
  }
  const count = git("rev-list", "--count", `${head}..${ship}`);
  if (count.status !== 0) {
    return { behind: null, head, ship, warnAt, ok: false, reason: count.stderr || "rev-list failed" };
  }
  const behind = Number(count.stdout);
  if (!Number.isFinite(behind)) {
    return { behind: null, head, ship, warnAt, ok: false, reason: `non-numeric count: ${count.stdout}` };
  }
  return { behind, head, ship, warnAt, ok: true };
}

/** Human line always printed. */
export function reportLine(m) {
  if (!m.ok) return `behind-ship: could not measure (${m.reason}) — advisory only`;
  return `behind-ship: ${m.behind} commit(s) behind \`${m.ship}\` (head ${m.head}; warn at >${m.warnAt})`;
}

/**
 * GitHub Actions annotation when over threshold. null when no warning.
 * Never an ::error:: — this tool must not fail the job.
 */
export function warningAnnotation(m) {
  if (!m.ok || m.behind == null || m.behind <= m.warnAt) return null;
  return `::warning title=behind-ship::PR head is ${m.behind} commits behind ${m.ship} (threshold ${m.warnAt}). Sync with \`node tools/ci/sync-pr.mjs <branch>\` once before the final CI run — do not enable require-up-to-date or auto-update-branch bots.`;
}

function parseArgs(argv) {
  const out = { json: false, head: undefined, ship: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--head") out.head = argv[++i];
    else if (a === "--ship") out.ship = argv[++i];
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const m = measure({ head: args.head, ship: args.ship });
  if (args.json) {
    console.log(JSON.stringify(m, null, 2));
  } else {
    console.log(reportLine(m));
    const warn = warningAnnotation(m);
    if (warn) console.log(warn);
  }
  process.exit(0);
}
