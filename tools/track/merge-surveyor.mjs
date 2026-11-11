#!/usr/bin/env node
/**
 * @doc The track-surveyor hand-back: scope check, merge --no-ff, verify-track, worktree remove; --dry-run prints the plan.
 * @skill survey-track
 *
 *   node tools/track/merge-surveyor.mjs <circuit-id> <base-sha> <surveyor-branch> [--dry-run] [--keep-worktree]
 *
 * Run from the PARENT checkout (the branch that will carry the circuit). Steps, each a
 * `= step …` line, stopping at the first red:
 *   1. scope   — tools/track/surveyor-scope.mjs <id> <base> <branch>: every file the branch
 *                changed is the circuit pair, scratch/ or artifacts/ (the per-agent hook
 *                tools/hooks/surveyor-scope.sh cannot bind the circuit id; this does).
 *   2. merge   — `git merge --no-ff --no-edit <branch>` (AGENTS.md §Coordination: merge
 *                commits only; a conflict leaves the merge in progress and exits 1).
 *   3. verify  — `node tools/track/verify-track.cjs <id>` on the merged tree.
 *   4. cleanup — `git worktree remove <path>` for the worktree checked out on <branch>
 *                (looked up in `git worktree list --porcelain`; --keep-worktree skips it).
 * Exit 0 only when every step is green. tools/shot/scenery-locations.json is built on demand (gitignored since
 * 2026-11-11): its next reader rebuilds it from the merged circuits, so a campaign commits nothing for it.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Whether `id` is a shipped circuit. The roster, not a character class: the
 *  old /^[a-z0-9-]+$/ refused the seven ids with an underscore (albert_park,
 *  brands_hatch, buenos_aires, magny_cours, mont_tremblant, paul_ricard,
 *  watkins_glen), so those surveyors could never be merged by this tool. */
export function isCircuitId(id) {
  return createRequire(import.meta.url)("../manifest.cjs").CIRCUITS.includes(id);
}

/** The worktree path checked out on `branch`, or null. */
export function worktreeFor(branchName, porcelain) {
  let cur = null;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) cur = line.slice(9);
    else if (line === `branch refs/heads/${branchName}` && cur) return cur;
  }
  return null;
}

/** The ordered plan, as [label, argv] pairs — what --dry-run prints and the real run executes. */
export function plan(circuit, baseSha, surveyorBranch, wt) {
  const steps = [
    ["scope", ["node", "tools/track/surveyor-scope.mjs", circuit, baseSha, surveyorBranch]],
    ["merge", ["git", "merge", "--no-ff", "--no-edit", surveyorBranch]],
    ["verify", ["node", "tools/track/verify-track.cjs", circuit]],
  ];
  if (wt) steps.push(["cleanup", ["git", "worktree", "remove", wt]]);
  return steps;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const [id, base, branch] = argv.filter((a) => !a.startsWith("--"));
  if (flags.has("--help") || flags.has("-h") || !id || !base || !branch) {
    console.error("usage: merge-surveyor.mjs <circuit-id> <base-sha> <surveyor-branch> [--dry-run] [--keep-worktree]");
    process.exit(flags.has("--help") || flags.has("-h") ? 0 : 2);
  }
  if (!isCircuitId(id)) {
    console.error(`merge-surveyor: unknown circuit id ${JSON.stringify(id)} (not in tools/manifest.cjs CIRCUITS)`);
    process.exit(2);
  }
  const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
  const wt = flags.has("--keep-worktree") ? null : worktreeFor(branch, run("git", ["worktree", "list", "--porcelain"]).stdout || "");
  const steps = plan(id, base, branch, wt);
  if (flags.has("--dry-run")) {
    for (const [label, cmd] of steps) console.log(`= plan ${label}: ${cmd.join(" ")}`);
    if (!wt && !flags.has("--keep-worktree")) console.log(`= plan cleanup: (no worktree is checked out on ${branch})`);
    return;
  }
  for (const [label, [cmd, ...args]] of steps) {
    const r = run(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    console.log(`= step ${label}: ${r.status === 0 ? "ok" : `FAILED (exit ${r.status})`}`);
    if (r.status !== 0) {
      if (label === "merge") console.error("merge left in progress: resolve, `git commit`, then rerun from verify by hand (node tools/track/verify-track.cjs " + id + ")");
      process.exit(1);
    }
  }
  console.log(`= merge-surveyor ${id}: merged ${branch} into ${run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim()}; the scenery catalog rebuilds on demand (node tools/gen/ensure-built.mjs --with tools/shot/scenery-locations.json)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
