#!/usr/bin/env node
// sync-pr.mjs — catch an open PR branch up to the deploy tip (2026-09-16).
// @doc Syncs a PR branch to the deploy tip (fetch, merge, verify). Without --push: no push, HEAD left on sync-pr-<branch>.
// @skill check-changes
//
//   node tools/ci/sync-pr.mjs <branch> --plan   # print the plan, run nothing
//   node tools/ci/sync-pr.mjs <branch>          # fetch, merge, verify, leave the result on a local branch
//   node tools/ci/sync-pr.mjs <branch> --push   # same, then push to origin/<branch>
//
// WHY THIS EXISTS: an open PR sits for hours while the deploy branch keeps
// moving (other sessions land commits continuously), so its branch drifts and
// needs re-syncing more than once before it can merge — each round costs a
// fetch, a merge, a re-verify and (if it goes well) a push. deploy.mjs already
// carries the rules for the ROUTINE case of that merge: a conflict confined to
// files this repo GENERATES (the index.html shell, ratchets.json, package.json,
// tools/README.md) is not a disagreement to referee, it is a stale derived
// value to re-derive. This script reuses that exact logic instead of
// duplicating it, and reuses the same verification (tooling-fast + the Pages
// gate's node suites + touched-circuit checks) before it will push anywhere.
//
// WHAT THIS IS NOT: a general conflict resolver. A conflict in hand-written
// content — two features' prose landing in the same help-sheet paragraph, a
// priority table two PRs both touched, a ratchet whose FORM (not just its
// number) changed — is exactly what deploy.mjs's own cureableConflicts()
// refuses to guess at, and this script inherits that refusal. Expect it to
// stop and hand back a list of files "resolve by hand" for anything beyond
// the generated set; that is deploy.mjs's tested judgment, not a gap here.
//
// Refuses the same things deploy.mjs refuses: a dirty tree, loadavg >= 3, a
// live Playwright run. Never force-pushes, never rebases, never amends —
// the merge is a real merge commit, so the branch stays valid for whoever has
// it checked out (mirrors deploy.mjs's own "no history was rewritten").
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, plan, preflight, mergeDeployTip, gateNodeSuites, touchedCircuits } from "./deploy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const branch = argv.find((a) => !a.startsWith("--"));
const REMOTE = "origin";
const log = (m) => process.stderr.write(`[sync-pr] ${m}\n`);

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function must(r, what) {
  if (r.code !== 0) throw new Error(`${what} failed: ${r.err || r.out}`);
  return r.out;
}
function run(cmd, args, what) {
  log(`${what}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status})`);
}

function usage() {
  console.log([
    "usage: node tools/ci/sync-pr.mjs <branch> [--plan] [--push]",
    "  <branch>  the PR's own head branch, e.g. claude/ui-consistency-2026-09-15",
    "  --plan    print head/tip/conflicts for that branch against the deploy tip, run nothing",
    "  --push    on a clean verify, push the result to origin/<branch> (default: leaves it on a local sync-pr-<branch> branch for review)",
  ].join("\n"));
}

export function main() {
  if (!branch || flag("--help") || flag("-h")) { usage(); return branch ? 0 : 1; }
  if (branch === DEPLOY_BRANCH) { log(`REFUSED: ${branch} is the deploy branch itself — use deploy.mjs, not sync-pr.mjs`); return 3; }

  must(git(["fetch", "--no-tags", REMOTE, branch, DEPLOY_BRANCH]), "fetch");
  const problems = preflight();
  if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }

  const startedOn = git(["branch", "--show-current"]).out || git(["rev-parse", "HEAD"]).out;
  const localBranch = `sync-pr-${branch.replace(/[^\w.-]/g, "-")}`;
  git(["branch", "-D", localBranch]); // best-effort: drop any stale local copy from a prior run
  must(git(["checkout", "-B", localBranch, `${REMOTE}/${branch}`]), "checkout PR branch");

  const p = plan();
  if (flag("--plan")) {
    console.log(`${branch} @ ${p.head.slice(0, 7)} — deploy tip ${p.tip.slice(0, 7)} ${p.fastForward ? "(ancestor: nothing to sync)" : "(diverged)"}`);
    if (p.conflicts.length) console.log("conflicts a merge would hit:\n  " + p.conflicts.join("\n  "));
    if (p.theirCommits.length) console.log(`deploy has moved ${p.theirCommits.length} commit(s) ahead of this branch's last sync`);
    git(["checkout", startedOn]);
    git(["branch", "-D", localBranch]);
    return 0;
  }

  try {
    if (p.fastForward) {
      log("already caught up with the deploy tip — nothing to merge");
    } else {
      log(`merge: ${mergeDeployTip()}`);
    }
    run("node", ["tools/ci/tooling-fast.mjs"], "guard suite on the synced branch");
    for (const script of gateNodeSuites()) run("npm", ["run", script], `Pages gate: ${script}`);
    for (const id of touchedCircuits(p.tip)) run("node", ["tools/track/verify-track.cjs", id], `verify-track ${id}`);
  } catch (e) {
    log(`STOPPED: ${e.message}`);
    log(`tree left on ${localBranch} for inspection — fix, then either re-run or push it yourself.`);
    git(["checkout", startedOn]);
    return 1;
  }

  if (flag("--push")) {
    must(git(["push", REMOTE, `${localBranch}:${branch}`]), `push to origin/${branch}`);
    log(`pushed to origin/${branch}`);
    git(["checkout", startedOn]);
    git(["branch", "-D", localBranch]);
  } else {
    log(`verified on ${localBranch} — rerun with --push to publish, or: git push ${REMOTE} ${localBranch}:${branch}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); }
  catch (e) { log("ERROR " + (e && e.message ? e.message : e)); process.exit(1); }
}
