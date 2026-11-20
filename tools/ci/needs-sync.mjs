#!/usr/bin/env node
/**
 * @doc Does a PR branch need a deploy-tip sync? conflict | union-conflict | stale-red | retest-refused | tip-red | no.
 * @section runner
 * @skill steward
 *
 *   node tools/ci/needs-sync.mjs <branch>            # fetch, decide, print `= sync needed: …`
 *   node tools/ci/needs-sync.mjs <branch> --json     # the facts behind the verdict
 *   node tools/ci/needs-sync.mjs <branch> --offline  # cached refs, no fetch, no API (CI state unknown)
 *
 * Verdicts (issue #2449 design, phase 0):
 *   conflict   `git merge-tree --write-tree` of the deploy tip and the branch exits 1
 *              (sync-pr.mjs still cures generated-file-only conflicts itself)
 *   union-conflict  merge-tree is clean only because a `merge=union` path (.gitattributes, e.g.
 *              docs/notes/CEILING-HISTORY.md) changed on both sides and git's union driver joined
 *              them. GitHub's mergeability check ignores merge drivers, so it merges that path as
 *              text, calls the PR dirty and never merges it (#5922, #5778). The same paths are
 *              re-merged as plain text (`git merge-file` on the three blobs); a conflict there is
 *              this verdict. sync-pr runs it as a normal sync: its local merge applies the union.
 *   stale-red  the newest ci.yml run on the branch head failed AND the deploy tip gained
 *              a commit after that run started: a re-run re-tests the stale merge ref,
 *              only a new head can clear it. A heuristic (a flake looks the same): name
 *              the failing job in the PR, and never re-run twice. A newest run that ended
 *              `cancelled` counts as failed when at least one of its jobs concluded
 *              `failure` (it was red before the cancel); with zero failed jobs it stays
 *              `no` (AGENTS.md rule 8: a timeout until proven otherwise), and a jobs read
 *              error keeps `no` and names the error. A newest run that is green only on
 *              `run_attempt` > 1 counts as failed when an earlier attempt had a red job
 *              (failure / timed_out / startup_failure): merge-gate's ci row refuses that
 *              green (a pass that needed a retry is a red). A re-run after a cancel-only
 *              attempt stays green; an unreadable attempt keeps `no` and names the error.
 *   retest-refused  the newest `gate` status on the branch head (land.yml, by the Actions bot) is a refusal whose
 *              `retest` row failed after the ci and gen rows passed, AND merge-gate's own window (newerTipPaths:
 *              first-parent tip commits the head lacks, newer than the CI run less its margin or past the run's
 *              recorded base) still names at least one tip merge. The row's cure is a sync and a push, so a fresh
 *              CI run tests the combination (#5554). A status on an older head is never read (statuses are per
 *              sha); a refusal with no tip merge in the window stays `no` (a sync cannot help); read only when
 *              the head's ci.yml run is green.
 *   tip-red    the branch is behind, but the deploy tip is red on CODE (the newest completed pages.yml run failed
 *              in a job other than a Pages-side publish failure; tools/ci/lib/deploy-tip.mjs, #5425): syncing
 *              would import the red. Wait for the fix to land; sync-pr refuses (only the fixer's own branch may
 *              sync onto it, with --onto-red-tip). Wins over conflict and stale-red.
 *   no         up to date, or merely behind with no conflict and no stale red: a green
 *              PR merges as it stands, and a clean refresh buys a full tier that repeats
 *              the old verdict. (The `distance` verdict went with merge-gate's distance
 *              row on 2026-11-03: gen and ratchets run on the real merge result.)
 * Exit: 0 sync needed (conflict | union-conflict | stale-red | retest-refused), 1 no sync needed (no | tip-red), 2 bad args, 3 could not
 * decide (fetch / git / merge-tree failed). The API half degrades: no token or an API
 * error leaves ci "unknown", so only `conflict` can fire (the line says so).
 * Needs the merge base: a shallow clone must be deep enough for `git merge-tree`.
 */
import { spawnSync } from "node:child_process";
import { gitRun } from "../lib/git-run.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY } from "./github-api.mjs";
import { createSnapshot } from "../lib/pr-snapshot.mjs";
import { ciState } from "./pr-board.mjs";
import { readDeployTip } from "./lib/deploy-tip.mjs";
import { ciRecordedBase, newerTipPaths } from "./merge-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VERDICTS = ["conflict", "union-conflict", "stale-red", "retest-refused", "tip-red", "no"];

/**
 * The verdict from the facts. Pure.
 * @param {{ behind: boolean, conflict: boolean, unionConflicts?: string[], ci?: string, runStartedAt?: string|null, tipNewestAt?: string|null,
 *   failedJobs?: number|null, jobsError?: string|null, attempt?: number, retryFailedJobs?: number|null,
 *   tip?: { state: string, evidence: string }|null, retest?: { refused: boolean, tipMerges?: number, commits?: string[] }|null }} f
 *   unionConflicts = `merge=union` paths whose plain-text merge conflicts (unionTextConflicts()).
 *   tipNewestAt = committer date of the newest commit on the tip that the branch lacks; tip = tipState() of the deploy
 *   branch's newest completed pages.yml run (null: not read).
 *   failedJobs = jobs of a `cancelled` newest run that concluded `failure` (null: not read); jobsError = why not.
 *   attempt = the newest run's run_attempt; retryFailedJobs = red jobs across its earlier attempts (green runs only).
 *   retest = gateRetestRefusal() of the head's newest `gate` status, plus tipMerges / commits: the tip merges
 *   merge-gate's retest window still names for this head (null: not read).
 * @returns {{ verdict: "conflict"|"union-conflict"|"stale-red"|"retest-refused"|"tip-red"|"no", why: string }}
 */
export function decideSync(f) {
  if (!f.behind) return { verdict: "no", why: "the branch already contains the deploy tip" };
  if (f.tip?.state === "code-red") return { verdict: "tip-red", why: `${f.tip.evidence}: do not sync onto a red tip; wait for the fix to land` };
  if (f.conflict) return { verdict: "conflict", why: "merging the deploy tip conflicts" };
  if (f.unionConflicts?.length) {
    const shown = f.unionConflicts.slice(0, 3).join(", ") + (f.unionConflicts.length > 3 ? ` +${f.unionConflicts.length - 3}` : "");
    return { verdict: "union-conflict", why: `merge=union path(s) ${shown} conflict as text: git's union driver merges them, GitHub does not, so it reports the PR dirty and never merges it` };
  }
  const ran = Date.parse(f.runStartedAt || ""), tipAt = Date.parse(f.tipNewestAt || "");
  const moved = !!(ran && tipAt && tipAt > ran);
  const n = f.ci === "cancelled" && Number.isInteger(f.failedJobs) ? f.failedJobs : null;
  const cancelledRed = n !== null && n > 0;
  const attempt = Number(f.attempt) || 1;
  const m = f.ci === "success" && attempt > 1 && Number.isInteger(f.retryFailedJobs) ? f.retryFailedJobs : null;
  const retriedRed = m !== null && m > 0;
  const what = cancelledRed ? `ci cancelled after ${n} failed job(s)`
    : retriedRed ? `ci green only on attempt ${attempt} after ${m} failed job(s)` : "ci.yml is red";
  if ((f.ci === "failure" || cancelledRed || retriedRed) && moved) {
    return { verdict: "stale-red", why: `${what} on the head and the tip has moved since that run started` };
  }
  if (f.retest?.refused && f.retest.tipMerges > 0) {
    const shown = (f.retest.commits || []).slice(0, 3).map((c) => String(c).slice(0, 8)).join(", ");
    return { verdict: "retest-refused", why: `the gate's retest row refused this head and ${f.retest.tipMerges} tip merge(s) since its CI run remain${shown ? ` (${shown})` : ""}: sync and push, so a fresh CI run tests this combination` };
  }
  if (f.retest?.refused) return { verdict: "no", why: "behind with no conflict (the gate's retest row refused this head, but no tip merge since its CI run remains: a sync cannot help): clean-behind is not a reason" };
  const red = f.ci === "failure" || cancelledRed || retriedRed ? `${cancelledRed || retriedRed ? what : "ci red"} but the tip has not moved since`
    : f.ci === "unknown" ? "ci state unknown"
    : f.ci === "cancelled" && f.jobsError ? `ci cancelled; its jobs are unreadable (${f.jobsError})`
    : n === 0 ? "ci cancelled with 0 failed jobs: a timeout until proven otherwise, AGENTS.md rule 8"
    : f.ci === "success" && attempt > 1 && f.jobsError ? `ci success on attempt ${attempt}; its earlier attempts are unreadable (${f.jobsError})`
    : m === 0 ? `ci success on attempt ${attempt}; earlier attempts had no failed job`
    : `ci ${f.ci || "none"}`;
  return { verdict: "no", why: `behind with no conflict (${red}): clean-behind is not a reason` };
}

/**
 * Whether the newest `gate` commit status of a head (the statuses list, newest first) is a merge-gate refusal on the
 * `retest` row that the row really evaluated: state `failure`, posted by the Actions bot, its description the
 * `= merge-gate refused — …` summary line (merge-gate.mjs rowLines) with `ci=ok`, `gen=ok` and `retest=FAIL` (a red
 * ci or gen row leaves retest "not evaluated", which is not this refusal). Pure.
 * @returns {{ refused: boolean, evidence: string }}
 */
export function gateRetestRefusal(statuses) {
  const g = (Array.isArray(statuses) ? statuses : []).find((s) => s?.context === "gate");
  const d = String(g?.description || "");
  const rows = new Set(d.split(" "));
  const refused = g?.state === "failure" && g?.creator?.login === "github-actions[bot]" && d.startsWith("= merge-gate refused — ")
    && rows.has("ci=ok") && rows.has("gen=ok") && rows.has("retest=FAIL");
  return { refused, evidence: d };
}

/** Job conclusions that make an earlier attempt red (as merge-gate's ci row reads them; a cancelled job is not one). */
const RED_JOB = new Set(["failure", "timed_out", "startup_failure"]);

/** Jobs of one run (or one of its attempts) whose conclusion is in `bad`, paged through `request`.
 *  @returns {{ failed?: number, error?: string }} */
export function failedJobCount(request, runId, { attempt = null, bad = new Set(["failure"]) } = {}) {
  let failed = 0;
  const base = attempt ? `actions/runs/${runId}/attempts/${attempt}/jobs` : `actions/runs/${runId}/jobs`;
  for (let page = 1; page <= 20; page++) {
    const r = request(`${base}?per_page=100&page=${page}`);
    if (r?.error) return { error: r.error };
    const batch = r?.json?.jobs || [];
    failed += batch.filter((j) => bad.has(j?.conclusion)).length;
    if (batch.length < 100) return { failed };
  }
  return { error: "more than 20 pages of jobs" };
}

/** The empty blob (a path absent on one side merges against it, as add/add does). */
const EMPTY_BLOB = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

/**
 * `merge=union` paths that both sides changed since their merge base and whose PLAIN-TEXT three-way merge conflicts:
 * what GitHub's mergeability check sees, since it runs no merge driver (#5922). Attributes are read from the tip's
 * tree. A path deleted on one side counts as a conflict (modify/delete). `readGit` injectable.
 * @returns {{ paths: string[], error?: string }}
 */
export function unionTextConflicts(tip, head, readGit = git) {
  const base = readGit(["merge-base", tip, head]);
  if (base.code !== 0 || !base.out) return { paths: [], error: `merge-base failed: ${base.err || base.out || "no common ancestor"}` };
  const changed = (to) => {
    const d = readGit(["diff", "--name-only", "--no-renames", base.out, to]);
    return d.code === 0 ? d.out.split("\n").filter(Boolean) : null;
  };
  const a = changed(tip), b = changed(head);
  if (!a || !b) return { paths: [], error: "git diff failed" };
  const both = a.filter((p) => b.includes(p));
  if (!both.length) return { paths: [] };
  const attr = readGit(["check-attr", "--source", tip, "merge", "--", ...both]);
  if (attr.code !== 0) return { paths: [], error: `git check-attr failed: ${attr.err || attr.out}` };
  const union = attr.out.split("\n").map((l) => l.match(/^(.*): merge: union$/)?.[1]).filter(Boolean);
  const paths = [];
  for (const p of union) {
    const blob = (rev) => { const r = readGit(["rev-parse", "--verify", "--quiet", `${rev}:${p}`]); return r.code === 0 ? r.out : null; };
    const o = blob(base.out) || EMPTY_BLOB, t = blob(tip), h = blob(head);
    if (!t || !h) { paths.push(p); continue; }
    // merge-file exits with the conflict count (0 clean); a negative (255) is an error, not a verdict.
    const m = readGit(["merge-file", "-p", "--object-id", h, o, t]);
    if (m.code > 0 && m.code < 128) paths.push(p);
    else if (m.code !== 0) return { paths: [], error: `git merge-file failed on ${p} (${m.code}): ${m.err}` };
  }
  return { paths };
}

// The {code,out,err} git helper is tools/lib/git-run.mjs (audit3 T11).
function git(args, run = spawnSync) { return gitRun(args, { cwd: ROOT, run }); }

/**
 * Gather facts and decide. `readGit` / `request` injectable.
 * @returns {{ ok: boolean, error?: string, branch?: string, head?: string, tip?: string, behind?: boolean, conflict?: boolean,
 *   ci?: string, verdict?: string, why?: string, note?: string|null }}
 */
export function needsSync(branch, { fetch = true, offline = false, readGit = git, request = null } = {}) {
  // Default transport: the shared ETag-cached snapshot (tools/lib/pr-snapshot.mjs).
  let snap = null;
  if (!request) { snap = createSnapshot(); request = snap.get; }
  if (fetch && !offline) {
    const f = readGit(["fetch", "--no-tags", "origin", branch, DEPLOY]);
    if (f.code !== 0) return { ok: false, error: `fetch failed: ${f.err || f.out}` };
  }
  const head = readGit(["rev-parse", "--verify", `origin/${branch}`]);
  const tip = readGit(["rev-parse", "--verify", `origin/${DEPLOY}`]);
  if (head.code !== 0 || tip.code !== 0) return { ok: false, error: `cannot resolve origin/${head.code !== 0 ? branch : DEPLOY}` };
  const behind = readGit(["merge-base", "--is-ancestor", tip.out, head.out]).code !== 0;
  let conflict = false;
  if (behind) {
    // exit 0 clean, 1 conflicts, anything else (>1) is an error, not a verdict.
    const m = readGit(["merge-tree", "--write-tree", "--name-only", tip.out, head.out]);
    if (m.code !== 0 && m.code !== 1) return { ok: false, error: `git merge-tree failed (${m.code}): ${m.err || m.out}` };
    conflict = m.code === 1;
  }
  let unionConflicts = [], note0 = null;
  if (behind && !conflict) {
    const u = unionTextConflicts(tip.out, head.out, readGit);
    if (u.error) note0 = `union paths unchecked (${u.error}): a union-conflict cannot be detected`;
    unionConflicts = u.paths;
  }
  let ci = "unknown", runStartedAt = null, note = note0, failedJobs = null, jobsError = null, attempt = 1, retryFailedJobs = null, deployTip = null, retest = null;
  const addNote = (t) => { note = note ? `${note}; ${t}` : t; };
  if (behind && !offline) {
    const t = readDeployTip(DEPLOY, request);
    snap?.save();
    if (t.error) addNote(`deploy tip state unreadable (${t.error}): tip-red cannot be detected`);
    else deployTip = t;
  }
  if (behind && !conflict && !offline) {
    const r = request(`actions/workflows/ci.yml/runs?head_sha=${head.out}&per_page=20`);
    snap?.save();
    if (r.error) addNote(`CI state unreadable (${r.error}): only a conflict can be detected`);
    else {
      const runs = r.json?.workflow_runs || [];
      const s = ciState(runs);
      ci = s.state;
      const run = runs.find((x) => x.id === s.runId);
      runStartedAt = run?.run_started_at || run?.created_at || null;
      if (ci === "cancelled" && s.runId != null) {
        const j = failedJobCount(request, s.runId);
        if (j.error) { jobsError = j.error; addNote(`jobs of cancelled run ${s.runId} unreadable (${j.error}): a cancelled run counts as no`); }
        else failedJobs = j.failed;
      }
      attempt = Number(run?.run_attempt) || 1;
      if (ci === "success" && attempt > 1) {
        let red = 0;
        for (let k = 1; k < attempt && !jobsError; k++) {
          const j = failedJobCount(request, s.runId, { attempt: k, bad: RED_JOB });
          if (j.error) { jobsError = `attempt ${k}: ${j.error}`; addNote(`earlier attempts of run ${s.runId} unreadable (${jobsError}): a retried green counts as no`); }
          else red += j.failed;
        }
        if (!jobsError) retryFailedJobs = red;
      }
      // #5554: a green head the gate refused on its retest row. The tip merges are counted with merge-gate's own
      // window (the same git reads, the same recorded base), so this verdict and that row cannot disagree.
      if (ci === "success") {
        const st = request(`commits/${head.out}/statuses?per_page=100`);
        if (st.error) addNote(`gate status unreadable (${st.error}): retest-refused cannot be detected`);
        else if ((retest = gateRetestRefusal(st.json)).refused) {
          const asGate = (args) => { const g = readGit(args); return { status: g.code, stdout: g.out, stderr: g.err }; };
          const t = newerTipPaths({ cwd: ROOT, tip: tip.out, head: head.out, ciAt: run?.created_at || runStartedAt, ciBase: ciRecordedBase(run, request), gitRun: asGate });
          if (t.error) addNote(`the retest window is unreadable (${t.error}): retest-refused cannot be confirmed`);
          retest = { ...retest, tipMerges: t.error ? 0 : t.commits.length, commits: t.error ? [] : t.commits };
        }
      }
      snap?.save();
    }
  } else if (offline) addNote("offline: CI state not read, only a conflict can be detected");
  const tipNewestAt = behind ? readGit(["log", "-1", "--format=%cI", `${head.out}..${tip.out}`]).out || null : null;
  const d = decideSync({ behind, conflict, unionConflicts, ci, runStartedAt, tipNewestAt, failedJobs, jobsError, attempt, retryFailedJobs, tip: deployTip, retest });
  return { ok: true, branch, head: head.out, tip: tip.out, behind, conflict, unionConflicts, ci, failedJobs, attempt, retryFailedJobs, deployTip, retest, ...d, note };
}

/** The one verdict line. */
export const verdictLine = (v) => `= sync needed: ${v.verdict}`;
export const exitCode = (v) => (!v.ok ? 3 : v.verdict === "no" || v.verdict === "tip-red" ? 1 : 0);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const branch = argv.find((a) => !a.startsWith("--"));
  const bad = argv.find((a) => a.startsWith("--") && !["--json", "--offline", "--help"].includes(a));
  if (argv.includes("--help") || !branch || bad || argv.filter((a) => !a.startsWith("--")).length !== 1) {
    console.error(`usage: node tools/ci/needs-sync.mjs <branch> [--json] [--offline]${bad ? `\nunknown arg: ${bad}` : ""}
verdict line: ${VERDICTS.map((v) => `= sync needed: ${v}`).join(" | ")}
exit: 0 sync needed (conflict|union-conflict|stale-red|retest-refused), 1 no (no|tip-red), 2 bad args, 3 could not decide`);
    process.exit(argv.includes("--help") ? 0 : 2);
  }
  const v = needsSync(branch, { offline: argv.includes("--offline") });
  if (!v.ok) { console.error(`needs-sync: ${v.error}`); process.exit(3); }
  if (argv.includes("--json")) console.log(JSON.stringify(v, null, 2));
  else { if (v.note) console.error(`needs-sync: ${v.note}`); console.log(`${verdictLine(v)} (${v.why})`); }
  process.exit(exitCode(v));
}
