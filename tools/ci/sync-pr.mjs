#!/usr/bin/env node
// sync-pr.mjs — catch an open PR branch up to the deploy tip (2026-09-16).
// @doc Syncs a PR branch to the deploy tip (fetch, merge, verify). Without --push: no push, HEAD left on sync-pr-<branch>.
// @skill check-changes
//
//   node tools/ci/sync-pr.mjs <branch> --plan   # print the plan, run nothing
//   node tools/ci/sync-pr.mjs <branch>          # fetch, merge, verify, leave the result on a local branch
//   node tools/ci/sync-pr.mjs <branch> --push   # same, then push to origin/<branch>
//   node tools/ci/sync-pr.mjs <branch> --verify=none|fast|full   # default fast
//   node tools/ci/sync-pr.mjs <branch> --force-clean-behind     # sync although needs-sync.mjs says `no`
//   node tools/ci/sync-pr.mjs <branch> --resume --from=<stage>   # re-verify the kept sync-pr-<branch>
//
// STAGED, TIMED, DIFF-AWARE VERIFY (#2186, 2026-10-15). It ran tooling-fast at
// --jobs=1 and EVERY ci.yml node suite (game-vm-a/b1/b2, vm-page, node-slow …)
// serially with no timeout, whatever the diff — and outran a 30-min background
// ceiling, which kills the task with no marker. Now: tooling-fast --jobs=3; the
// node suites node-plan.mjs skips for the branch's OWN diff (tip...HEAD) are
// skipped by name in `fast` (the default; CI re-gates the pushed head anyway);
// `full` runs them all; `none` only after a clean merge that regenerated
// nothing. Each stage has a timeout, and a stopped stage prints the resume
// command. `--push` asks queue-depth.mjs first, as bash-guard does for a hand
// push (#2182): a push that starts CI waits while the queue holds.
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
// A CLEAN merge is re-derived too: mergeDeployTip() runs `npm run gen` after
// every merge and commits what it rewrites, because two sides can each add to
// a generated file identically and leave the union stale without a conflict.
//
// Refuses the same things deploy.mjs refuses: a dirty tree, loadavg >= 3, a
// live Playwright run. Never force-pushes, never rebases, never amends —
// the merge is a real merge commit, so the branch stays valid for whoever has
// it checked out (mirrors deploy.mjs's own "no history was rewritten").
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, plan, preflight, mergeDeployTip, gateNodeSuites, touchedCircuits, changedPaths } from "./deploy.mjs";
import { plan as nodePlan } from "./node-plan.mjs";
import { needsSync, verdictLine } from "./needs-sync.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const a = argv.find((x) => x.startsWith(`${n}=`)); return a === undefined ? null : a.slice(n.length + 1); };
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
/** One stage, killed at its timeout. Returns the exit code (124 on timeout). */
function runStage(st) {
  log(`${st.name}: ${st.cmd} ${st.args.join(" ")} (timeout ${Math.round(st.timeoutMs / 60000)} min)`);
  const r = spawnSync(st.cmd, st.args, { cwd: ROOT, stdio: "inherit", timeout: st.timeoutMs, killSignal: "SIGKILL" });
  if (r.error?.code === "ETIMEDOUT" || (r.status === null && r.signal)) return 124;
  return r.status ?? 1;
}

export const VERIFY_MODES = ["none", "fast", "full"];
/** Per-stage ceilings: well inside a 30-min background task each. */
export const STAGE_TIMEOUT_MS = { "tooling-fast": 20 * 60e3, node: 15 * 60e3, "verify-track": 5 * 60e3 };

/**
 * The verify stages, in order. Pure.
 * @param {{ verify: string, changed: string[]|null, circuits: string[], suites: string[], planFor?: typeof nodePlan }} o
 *   `changed` is the branch's own diff against the tip (null = unknown → every suite).
 */
export function verifyStages({ verify, changed, circuits, suites, planFor = nodePlan }) {
  if (verify === "none") return [];
  const skip = new Set();
  if (verify === "fast" && changed) { const p = planFor(changed); if (!p.all) for (const s of p.skip) skip.add(s); }
  return [
    { name: "tooling-fast", cmd: "node", args: ["tools/ci/tooling-fast.mjs", "--jobs=3"], timeoutMs: STAGE_TIMEOUT_MS["tooling-fast"] },
    ...suites.filter((s) => !skip.has(s)).map((s) => ({ name: s, cmd: "npm", args: ["run", s], timeoutMs: STAGE_TIMEOUT_MS.node })),
    ...circuits.map((id) => ({ name: `verify-track:${id}`, cmd: "node", args: ["tools/track/verify-track.cjs", id], timeoutMs: STAGE_TIMEOUT_MS["verify-track"] })),
  ].map((st) => ({ ...st, skipped: [...skip] }));
}

/** Run stages from `from` (a stage name) on; stop at the first failure. `run` injectable. */
export function runStages(stages, { from = null, run = runStage } = {}) {
  let start = 0;
  if (from) { start = stages.findIndex((s) => s.name === from); if (start < 0) return { ok: false, error: `no stage named ${from} (stages: ${stages.map((s) => s.name).join(", ")})` }; }
  for (const st of stages.slice(start)) {
    const code = run(st);
    if (code !== 0) return { ok: false, failedAt: st.name, code, error: `${st.name} ${code === 124 ? `timed out after ${Math.round(st.timeoutMs / 60000)} min` : `failed (exit ${code})`}` };
  }
  return { ok: true };
}

function usage() {
  console.log([
    "usage: node tools/ci/sync-pr.mjs <branch> [--plan] [--push] [--verify=none|fast|full] [--resume [--from=<stage>]]",
    "  <branch>  the PR's own head branch, e.g. claude/ui-consistency-2026-09-15",
    "  --plan    print head/tip/conflicts for that branch against the deploy tip, run nothing",
    "  --push    on a clean verify, push the result to origin/<branch> (default: leaves it on a local sync-pr-<branch> branch for review);",
    "            a push that starts CI waits while queue-depth.mjs holds (APEX_PUSH_HOLD=0 when the user asked for it now)",
    "  --verify  fast (default): tooling-fast --jobs=3 + the node suites node-plan.mjs needs for the branch's own diff;",
    "            full: every ci.yml node suite; none: only after a clean merge that regenerated nothing",
    "  --force-clean-behind  sync although needs-sync.mjs says `no` (clean-behind is not a reason; exit 4 without it)",
    "  --resume  re-verify the kept sync-pr-<branch> (no fetch, no merge); --from=<stage> starts at that stage",
  ].join("\n"));
}

// Cached refs only: no fetch, checkout, branch deletion or object-writing merge-tree.
export function cachedPlan(prBranch, readGit = git) {
  const head = must(readGit(["rev-parse", "--verify", `origin/${prBranch}`]), "cached PR ref (fetch explicitly first if absent)");
  const tip = must(readGit(["rev-parse", "--verify", `origin/${DEPLOY_BRANCH}`]), "cached deploy ref");
  const fastForward = readGit(["merge-base", "--is-ancestor", tip, head]).code === 0;
  return { branch: prBranch, head, tip, fastForward, source: "cached-remote-refs", conflicts: null,
    conflictsChecked: false, note: "Refs may be stale. Exact merge conflicts are checked during sync; plan changes nothing.",
    theirCommits: must(readGit(["log", "--oneline", `${head}..${tip}`]), "cached commits").split("\n").filter(Boolean) };
}

/** Put the working tree back on `startedOn` and SAY WHERE IT IS (2026-10-04).
 *  The failure path logged "tree left on <sync branch>" and then ran an
 *  unchecked `git checkout startedOn`: when that checkout worked the log was
 *  wrong, and when it failed (a merge stopped mid-way by a throwing gen step)
 *  nothing said so. A merge in progress is aborted first; the result is
 *  checked; the returned line is the truth. `readGit` is injectable for tests. */
export function returnTo(startedOn, keptBranch, readGit = git) {
  if (readGit(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).code === 0) readGit(["merge", "--abort"]);
  const r = readGit(["checkout", startedOn]);
  const where = readGit(["branch", "--show-current"]).out || readGit(["rev-parse", "--short", "HEAD"]).out;
  if (r.code !== 0)
    return { ok: false, line: `could NOT return to ${startedOn} (${(r.err || r.out || "checkout failed").split("\n")[0]}) — the working tree is on ${where}` };
  return { ok: true, line: `working tree back on ${startedOn}; the attempt is kept on branch ${keptBranch} for inspection` };
}

export function main() {
  if (flag("--help") || flag("-h")) { usage(); return 0; }
  if (!branch) { usage(); return 1; }
  const unknown = argv.find((a) => a.startsWith("-") && !["--plan", "--push", "--resume", "--force-clean-behind"].includes(a) && !/^--(verify|from)=/.test(a));
  if (unknown || argv.filter((a) => !a.startsWith("-")).length !== 1) throw new Error(`Invalid arguments${unknown ? ": " + unknown : ""}`);
  if (flag("--plan") && flag("--push")) throw new Error("--plan cannot be combined with --push");
  let verify = opt("--verify") ?? "fast";
  if (!VERIFY_MODES.includes(verify)) throw new Error(`--verify must be one of ${VERIFY_MODES.join("|")}`);
  const from = opt("--from");
  if (from && !flag("--resume")) throw new Error("--from needs --resume");
  if (branch === DEPLOY_BRANCH) { log(`REFUSED: ${branch} is the deploy branch itself — use deploy.mjs, not sync-pr.mjs`); return 3; }

  if (flag("--plan")) { console.log(JSON.stringify(cachedPlan(branch), null, 2)); return 0; }

  const resume = flag("--resume");
  if (!resume) must(git(["fetch", "--no-tags", REMOTE, branch, DEPLOY_BRANCH]), "fetch");
  if (!resume && !flag("--force-clean-behind")) {
    // AGENTS.md "sync only when you must": ask the predicate before any merge or push.
    const v = needsSync(branch, { fetch: false });
    if (v.ok) {
      log(`${verdictLine(v)} (${v.why})`);
      if (v.verdict === "no") { log("REFUSED: no sync needed; --force-clean-behind overrides (exit 4)"); return 4; }
    } else log(`needs-sync could not decide (${v.error}); continuing`);
  }
  const problems = preflight();
  if (problems.length) { for (const x of problems) log("REFUSED: " + x); return 3; }

  const startedOn = git(["branch", "--show-current"]).out || git(["rev-parse", "HEAD"]).out;
  const localBranch = `sync-pr-${branch.replace(/[^\w.-]/g, "-")}`;
  const exists = git(["show-ref", "--verify", "--quiet", `refs/heads/${localBranch}`]).code === 0;
  if (resume) {
    if (!exists) throw new Error(`--resume: no local ${localBranch} to resume (run without --resume)`);
    if (startedOn !== localBranch) must(git(["checkout", localBranch]), `checkout ${localBranch}`);
  } else {
    if (exists) throw new Error(`Local branch ${localBranch} already exists; inspect or rename it before syncing, or --resume it`);
    must(git(["checkout", "-b", localBranch, `${REMOTE}/${branch}`]), "checkout PR branch");
  }

  const p = resume ? null : plan();
  const tip = p ? p.tip : must(git(["rev-parse", `${REMOTE}/${DEPLOY_BRANCH}`]), "deploy tip");
  const resumeCmd = (stage) => `node tools/ci/sync-pr.mjs ${branch} --resume${stage ? ` --from=${stage}` : ""}${verify !== "fast" ? ` --verify=${verify}` : ""}${flag("--push") ? " --push" : ""}`;
  try {
    if (!resume) {
      const fastForward = p.fastForward;
      const merged = fastForward ? "already caught up" : mergeDeployTip();
      log(fastForward ? "already caught up with the deploy tip — nothing to merge" : `merge: ${merged}`);
      if (verify === "none" && !(fastForward || merged === "merged")) {
        log(`--verify=none needs a clean merge that regenerated nothing (got: ${merged}) — verifying fast instead`);
        verify = "fast";
      }
    } else if (verify === "none") throw new Error("--resume --verify=none verifies nothing; drop --resume and push by hand");
    const stages = verifyStages({ verify, changed: changedPaths(tip), circuits: touchedCircuits(tip), suites: verify === "none" ? [] : gateNodeSuites() });
    if (stages[0]?.skipped.length) log(`verify=${verify}: node-plan skips ${stages[0].skipped.join(", ")} for this diff (CI re-gates the pushed head)`);
    if (!stages.length) log("verify=none: clean merge, nothing regenerated — CI gates the pushed head");
    const r = runStages(stages, { from });
    if (!r.ok) {
      const e = new Error(r.error);
      e.resume = r.failedAt ? resumeCmd(r.failedAt) : null;
      throw e;
    }
  } catch (e) {
    log(`STOPPED: ${e.message}`);
    log(returnTo(startedOn, localBranch).line + " — fix, then either re-run or push it yourself.");
    if (e.resume) log(`resume from the stopped stage: ${e.resume}`);
    return 1;
  }

  const pushCmd = `git push ${REMOTE} ${localBranch}:${branch}`;
  if (flag("--push")) {
    // No queue hold (retired 2026-10-16, CI/CD review #2333 finding 7): a
    // verified sync publishes at once.
    must(git(["push", REMOTE, `${localBranch}:${branch}`]), `push to origin/${branch}`);
    log(`pushed to origin/${branch}`);
    const back = returnTo(startedOn, localBranch);
    log(back.line);
    if (back.ok) git(["branch", "-D", localBranch]);
  } else {
    log(`verified on ${localBranch} — review, then publish with: ${pushCmd}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); }
  catch (e) { log("ERROR " + (e && e.message ? e.message : e)); process.exit(1); }
}
