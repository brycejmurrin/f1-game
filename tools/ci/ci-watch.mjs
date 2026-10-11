#!/usr/bin/env node
// ci-watch.mjs — watch a pushed commit's CI (and optionally the Pages train that ships it), one line per job result.
// @doc Watches a SHA's CI runs (`--pages`: the Pages train too); one `[ci-watch]` line per job, then a `= ci <verdict>` line.
// Full description: Watches every workflow run for a SHA (default HEAD) and prints one `[ci-watch]` line per job as it finishes — a red names its failing step and first annotations — then a terminal `= ci <verdict>` line; `--pages` follows the deploy train until a Pages run containing the SHA ends. Built for a Monitor (each line an event) or a background task.
// @skill steward
//
// AGENTS.md rule 12 / §Watching CI and Pages: a push is not done when it lands,
// it is done when its jobs are green — and a red found at the end of the turn
// (or never: a `cancelled` run hid a FAILED one for five days) costs a cycle.
// Waiting on a PR event alone is not enough either: webhooks arrive late or not
// at all for success, and a docs-only push (paths-ignore) or a topic-branch push
// with no PR (ci.yml runs on push for the deploy branch only) starts NO run,
// which looks exactly like "still queued". So this polls the REST API and turns
// state into events:
//
//   [ci-watch] CI #35957643756 (push) queued …                     once, when first seen
//   [ci-watch] CI › Smoke (page boots, __apex responds) (2) → failure — step "Run smoke shard": <annotation> <url>
//   [ci-watch] = ci failed (19 jobs, 1 failed, 4 skipped) sha=e3bd067 …   terminal; the process exits
//
//   node tools/ci/ci-watch.mjs                       # HEAD, poll every 30 s, until every run completes (or 120 min)
//   node tools/ci/ci-watch.mjs --sha e3bd067 --timeout 30   # minutes; default 120 for CI and --pages together
//   node tools/ci/ci-watch.mjs --pages               # …then follow pages.yml until a run containing the SHA ends
//   node tools/ci/ci-watch.mjs --once                # print the current state and exit (no waiting)
//
// Under Claude Code, arm it as a Monitor (every line is an event; re-arm on the
// 30-min expiry — it resumes from the API, nothing is lost) or as ONE
// run_in_background task when only the verdict matters. Exit: 0 green (or no
// run started — a docs-only push), 1 red, 2 cancelled with no live sibling,
// 3 no token / API unreachable, 4 superseded (a pending run replaced by a newer
// push in the same concurrency group — ci.yml's `ship-fast` — before it ran a
// step; re-arm on the `--sha` it names), 124 --timeout (default 120 min).
//
// Auth: GH_TOKEN or GITHUB_TOKEN, else `gh auth token` (Cloud boxes often have
// gh logged in with no env token). Sent via curl's stdin config so it never
// appears in argv. Read-only: GET requests only.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const PAGES_WORKFLOW = 295002043;   // pages.yml (AGENTS.md §Watching CI and Pages)
export const DEFAULT_TIMEOUT_MIN = 120;     // no --timeout: CI (~15 min) + the Pages train (≤ ~25 min), with room
const say = (...a) => console.log("[ci-watch]", ...a);

export function api(pathQs, { run = spawnSync, env = process.env, gh } = {}) {
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return { error: NO_TOKEN_HINT };
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    // Revalidate stored HTTP responses when polling mutable CI/PR state.
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.4
    // https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api#use-conditional-requests
    "-H", "Cache-Control: no-cache",
    `https://api.github.com/repos/${REPO}/${pathQs}`],
    { encoding: "utf8", input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  try { return code === 200 ? { json: JSON.parse(out.join("\n")) } : { error: `HTTP ${code}` }; }
  catch { return { error: "bad JSON" }; }
}

/** One run per workflow: the NEWEST by creation. A push run the PR run on the
 *  same head_sha cancelled seconds in (AGENTS.md rule 8's designed dedupe) is
 *  superseded, not a red. `created_at` has one-second resolution and the two
 *  runs of that dedupe often share the second, so a tie goes to the higher run
 *  id (ids only grow) — never to whichever the API happened to list first. */
export function latestPerWorkflow(runs) {
  const by = new Map();
  for (const r of runs) {
    const cur = by.get(r.name), t = Date.parse(r.created_at), ct = cur ? Date.parse(cur.created_at) : -Infinity;
    if (!cur || t > ct || (t === ct && r.id > cur.id)) by.set(r.name, r);
  }
  return [...by.values()];
}

/** The verdict over the latest runs and their jobs. */
export function verdict(runs, jobsByRun) {
  const live = runs.filter((r) => r.status !== "completed");
  const jobs = runs.flatMap((r) => jobsByRun[r.id] || []);
  const failed = jobs.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
  const skipped = jobs.filter((j) => j.conclusion === "skipped").length;
  const tail = `(${jobs.length} jobs, ${failed.length} failed, ${skipped} skipped)`;
  if (!runs.length) return { done: false, state: "none", line: "no workflow run yet" };
  if (failed.length) return { done: !live.length, state: "failed", line: `failed ${tail}`, failed };
  if (live.length) return { done: false, state: "running", line: `running ${tail}` };
  if (runs.some((r) => r.conclusion === "cancelled")) return { done: true, state: "cancelled", line: `cancelled ${tail} — a timeout until proven otherwise (AGENTS.md rule 8)` };
  if (runs.every((r) => ["success", "skipped", "neutral"].includes(r.conclusion))) return { done: true, state: "passed", line: `passed ${tail}` };
  return { done: true, state: "failed", line: `failed ${tail} — run conclusion ${runs.map((r) => r.conclusion).join(",")}` };
}

/** A cancelled run that a NEWER run of the same workflow, branch and event
 *  replaced before it ran a single step: GitHub keeps one PENDING run per
 *  concurrency group, so a deploy-branch push waiting in ci.yml's shared
 *  `ship-fast` group is cancelled when the next push arrives. That is
 *  superseded, not a timeout — but only when the run never started work (a
 *  run killed mid-way that happens to have a successor is still rule 8's
 *  "timeout until proven otherwise"). Returns the newer run or null. Pure. */
export function supersededBy(run, jobs, siblings) {
  if (run.conclusion !== "cancelled") return null;
  const startedWork = (jobs || []).some((j) => (j.steps || []).some((s) => s.started_at || s.conclusion));
  if (startedWork) return null;
  return siblings
    .filter((s) => s.id > run.id && s.workflow_id === run.workflow_id && s.head_branch === run.head_branch
      && s.event === run.event && s.head_sha !== run.head_sha)
    .sort((a, b) => a.id - b.id)[0] || null;
}

/** Lines for jobs that reached a conclusion since the last poll. */
export function newJobEvents(jobs, seen, wf) {
  const out = [];
  for (const j of jobs) {
    if (j.status !== "completed" || seen.has(j.id)) continue;
    seen.add(j.id);
    if (j.conclusion === "skipped") continue;
    const bad = j.conclusion !== "success";
    const step = bad ? (j.steps || []).find((s) => s.conclusion === "failure" || s.conclusion === "timed_out") : null;
    out.push({ job: j, bad, line: `${wf} › ${j.name} → ${j.conclusion}${step ? ` — step "${step.name}"` : ""}${bad ? ` ${j.html_url}` : ""}` });
  }
  return out;
}

/** The Pages run whose outcome is the verdict for a SHA: the NEWEST run (runs
 *  newest-first, as the API lists them) whose head contains it. */
export function pagesVerdictRun(runs, containsHead) {
  for (const run of runs) if (containsHead(run.head_sha)) return run;
  return null;
}

/** Only a failed or timed-out job carries a diagnosis worth printing. */
// What "no run yet" means depends on whether a PR carries the SHA. GitHub
// starts NO pull_request run for a PR with merge conflicts, and a PR's run can
// start minutes after the push (the merge ref is built first), so "none after
// 3 min" read as green on a conflicting PR (2026-09-25). Only a SHA with no
// open PR (a docs-only push, a topic branch not yet PR'd) is a real "none".
//
// AND "no run" must be confirmed from a second source. The runs list is
// filtered by head_sha, which GitHub documents as a SEARCH (1,000-result cap);
// on 2026-09-30 it listed nothing for PR #537's head for ten minutes while
// run 36728654810 was already in progress, and this said `none-yet`. The
// commit's check-runs come from a different endpoint: when that shows checks,
// CI exists and the answer is `indexing` (keep waiting), never none/late.
export function noneVerdict(pr, waitedMs, checkRuns = 0) {
  if (checkRuns > 0) return "indexing";
  if (!pr) return waitedMs > 180_000 ? "none" : "wait";
  if (pr.mergeable_state === "dirty") return "blocked";
  return waitedMs > 600_000 ? "late" : "wait";
}

export const wantsAnnotations = (job) => job.conclusion === "failure" || job.conclusion === "timed_out";

function annotations(jobId) {
  const r = api(`check-runs/${jobId}/annotations?per_page=5`);
  return (r.json || []).filter((a) => a.annotation_level === "failure").slice(0, 3)
    .map((a) => `    ${a.path}:${a.start_line} ${String(a.message).split("\n").slice(0, 3).join(" | ").slice(0, 300)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/ci/ci-watch.mjs [--sha <sha|ref>] [--pages] [--once] [--timeout <min>]
  Polls every workflow run for a SHA (default HEAD): one [ci-watch] line per job, a red\'s failing step,
  then one \`= ci <verdict>\` line (passed | failed | cancelled | superseded | none). --pages adds the Pages train.
  --once polls one time and exits. Details: the header of this file and AGENTS.md §Watching CI and Pages.`);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/** Expand `ref` (short sha, branch, HEAD) to a full 40-char commit id: local
 *  `git rev-parse` first (a unique prefix; unknown or ambiguous fails), then
 *  GitHub for a commit this clone has not fetched (a PR merge commit,
 *  2026-09-27). Never returns a short sha: { sha } or { error }. */
export function resolveSha(ref, { revParse = defaultRevParse, request = api } = {}) {
  if (typeof ref !== "string" || !/^[\w./@^~-]+$/.test(ref) || ref.startsWith("-")) return { error: `invalid --sha ${JSON.stringify(ref)}` };
  const local = (revParse(ref) || "").trim();
  if (/^[0-9a-f]{40}$/.test(local)) return { sha: local };
  const remote = request(`commits/${encodeURIComponent(ref)}`).json?.sha;
  if (typeof remote === "string" && /^[0-9a-f]{40}$/.test(remote)) return { sha: remote };
  return { error: `cannot expand --sha ${ref} to a full commit id: not a unique prefix of a commit in this clone, and GitHub did not resolve it either (git fetch, or pass the 40-char sha)` };
}
function defaultRevParse(ref) {
  const g = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: ROOT, encoding: "utf8" });
  return g.status === 0 ? g.stdout : "";
}

// The commit-associated endpoint avoids a stale/incomplete broad open-PR
// listing. Association can include earlier commits, so confirm the current
// open head using the individual PR response before diagnosing no-run state.
// https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit
export function openPrFor(sha, request = api) {
  const unknown = (error) => ({ state: "unknown", pr: null, error });
  if (typeof sha !== "string" || !/^[0-9a-f]{4,40}$/i.test(sha)) return unknown("invalid commit SHA");
  const validHead = (head) => typeof head === "string" && /^[0-9a-f]{40}$/i.test(head);
  const matches = (head) => validHead(head) && head.toLowerCase().startsWith(sha.toLowerCase());
  let changed = false, detailCalls = 0;
  try {
    // A full page does not establish absence. Bound the lookup, and report
    // unknown rather than bless an incomplete commit-association list.
    for (let page = 1; page <= 10; page++) {
      const list = request(`commits/${encodeURIComponent(sha)}/pulls?per_page=100&page=${page}`);
      if (list?.error) return unknown(`associated PR lookup: ${list.error}`);
      if (!Array.isArray(list?.json)) return unknown("associated PR lookup returned no PR array");
      for (const hit of list.json) {
        if (!hit || !Number.isInteger(hit.number) || hit.number < 1 || !["open", "closed"].includes(hit.state) || !validHead(hit.head?.sha)) return unknown("associated PR lookup returned malformed PR metadata");
        if (hit.state !== "open") continue;
        // Association metadata may lag the current head. Check every open
        // candidate before filtering by head, but cap slow detail requests.
        if (detailCalls >= 10) return unknown("associated PR lookup exceeded 10 PR detail requests; absence unconfirmed");
        detailCalls++;
        const one = request(`pulls/${hit.number}`);
        if (one?.error) return unknown(`PR #${hit.number} lookup: ${one.error}`);
        const pr = one?.json;
        if (pr?.number !== hit.number || !["open", "closed"].includes(pr.state) || !validHead(pr.head?.sha)) return unknown(`PR #${hit.number} lookup returned malformed metadata`);
        if (pr.state !== "open" || !matches(pr.head.sha)) { if (matches(hit.head.sha) || pr.state !== hit.state) changed = true; continue; }
        return { state: "found", pr, error: null };
      }
      if (list.json.length < 100) return changed ? unknown("associated PR head/state changed during lookup; recheck") : { state: "none", pr: null, error: null };
    }
    return unknown("associated PR lookup exceeded 10 pages; absence unconfirmed");
  } catch (error) { return unknown(`associated PR lookup: ${error.message || error}`); }
}

export async function watchSha(sha, { interval, deadline, once, request = api, now = Date.now, wait = sleep, report = say }) {
  const seen = new Set(), announced = new Set();
  const start = now();
  const unknown = (message) => { report(`= ci unknown — API: ${message}`); return 3; };
  for (;;) {
    const r = request(`actions/runs?head_sha=${sha}&per_page=50`);
    if (r?.error || !Array.isArray(r?.json?.workflow_runs)) return unknown(r?.error || "workflow runs lookup returned no run array");
    const runs = latestPerWorkflow(r.json.workflow_runs);
    const jobsByRun = {};
    for (const run of runs) {
      if (!announced.has(run.id)) { announced.add(run.id); report(`${run.name} #${run.id} (${run.event}) ${run.status} ${run.html_url}`); }
      const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
      if (j?.error || !Array.isArray(j?.json?.jobs)) return unknown(j?.error || `run #${run.id} jobs lookup returned no job array`);
      jobsByRun[run.id] = j.json.jobs;
      for (const e of newJobEvents(jobsByRun[run.id], seen, run.name)) {
        report(e.line);
        // Annotations only for a job that FAILED: a cancelled job's annotation is
        // the draft/ready dedupe's "higher priority waiting request" (rule 8) — as a
        // Monitor event it read as a red, eight times over, on PR #279.
        if (wantsAnnotations(e.job)) for (const a of annotations(e.job.id)) console.log(a);
      }
    }
    const v = verdict(runs, jobsByRun);
    // A cancelled run replaced while pending (ci.yml's `ship-fast` group) is
    // superseded, not a timeout: say so, and name the run that has the tree.
    if (v.state === "cancelled") {
      const cancelled = runs.filter((x) => x.conclusion === "cancelled");
      const newer = [];
      for (const c of cancelled) {
        const s = request(`actions/workflows/${c.workflow_id}/runs?branch=${encodeURIComponent(c.head_branch || "")}&event=${encodeURIComponent(c.event || "")}&per_page=20`);
        const by = Array.isArray(s?.json?.workflow_runs) ? supersededBy(c, jobsByRun[c.id], s.json.workflow_runs) : null;
        if (!by) break;
        newer.push([c, by]);
      }
      if (newer.length && newer.length === cancelled.length) {
        for (const [c, by] of newer) report(`${c.name} #${c.id} was replaced while pending by #${by.id} (head ${String(by.head_sha).slice(0, 7)}, ${by.status}) ${by.html_url}`);
        report(`= ci superseded ${v.line.replace(/^cancelled /, "").replace(/ — .*/, "")} — a newer ${newer[0][1].event} run in the same concurrency group replaced it before it started; watch it: --sha ${newer[0][1].head_sha} sha=${sha.slice(0, 7)}`);
        return 4;
      }
    }
    // A commit ci.yml's paths-ignore skips (docs / *.md / .claude/) starts no
    // run at all; after 3 min of nothing that is the answer, not "queued".
    if (v.state === "none" && now() - start > 180_000) {
      const lookup = openPrFor(sha, request);
      if (lookup.state === "unknown") return unknown(lookup.error);
      const pr = lookup.pr;
      const checked = request(`commits/${sha}/check-runs?per_page=1`);
      if (checked?.error || !Number.isInteger(checked?.json?.total_count) || checked.json.total_count < 0) return unknown(checked?.error || "commit checks lookup returned no valid count");
      const checks = checked.json.total_count;
      const nv = noneVerdict(pr, now() - start, checks);
      if (nv === "indexing" && !announced.has("indexing")) {
        announced.add("indexing");
        report(`runs list is empty for ${sha.slice(0, 7)} but the commit has ${checks} check run(s): GitHub's run search is lagging — still waiting`);
      }
      if (nv === "none") { report(`= ci none — no workflow run for ${sha.slice(0, 7)} after 3 min and no open PR carries it (docs/.md/.claude-only push, or a topic branch with no PR — ci.yml runs on the PR, draft = fast tier)`); return 0; }
      if (nv === "blocked") { report(`= ci blocked — PR #${pr.number} has merge conflicts, so GitHub starts no run for ${sha.slice(0, 7)}; merge the base (sync-pr.mjs) and push`); return 1; }
      if (nv === "late") { report(`= ci none-yet — PR #${pr.number} carries ${sha.slice(0, 7)} but no run started in 10 min; re-arm, or check the Actions tab`); return 124; }
    }
    // `running` and `none` are NOT green: under --once a scripted `&& next`
    // used to proceed on a run still in flight (2026-09-24).
    if (v.done || once) { report(`= ci ${v.line} sha=${sha.slice(0, 7)}`); return { passed: 0, failed: 1, cancelled: 2, running: 124, none: 124 }[v.state] ?? 0; }
    if (now() > deadline) { report(`= ci timeout — still ${v.line} sha=${sha.slice(0, 7)}; re-arm to keep watching`); return 124; }
    await wait(interval);
  }
}

async function watchPages(sha, { interval, deadline }) {
  say(`pages: waiting for a pages.yml run on ${DEPLOY} whose head contains ${sha.slice(0, 7)}`);
  let announced = null;
  const contains = new Map();   // head_sha -> does it contain `sha` (a compare per head, once)
  for (;;) {
    const r = api(`actions/workflows/${PAGES_WORKFLOW}/runs?branch=${encodeURIComponent(DEPLOY)}&per_page=10`);
    if (r.error) { say(`= pages unknown — API: ${r.error}`); return 3; }
    // NEWEST containing run decides (the API lists newest first). Oldest-first
    // returned on the first finished run, so a waiting train run a later tick
    // replaced (GitHub cancels a pending run in the same concurrency group) or
    // an older red read as the verdict while a newer run was about to ship the
    // SHA (2026-09-24).
    const run = pagesVerdictRun(r.json.workflow_runs || [], (h) => {
      if (contains.has(h)) return contains.get(h);
      // Cache only an ANSWER: a failed compare (rate limit, 5xx, timeout) read
      // as "not contained" forever, so the run that ships the SHA was never
      // recognised and the watch ran out its clock. Ask again next tick.
      const c = api(`compare/${sha}...${h}`);
      if (c.error || typeof c.json?.status !== "string") return false;
      contains.set(h, ["ahead", "identical"].includes(c.json.status));
      return contains.get(h);
    });
    if (run) {
      if (announced !== run.id) { announced = run.id; say(`pages #${run.id} (${run.event}) head=${run.head_sha.slice(0, 7)} ${run.status} ${run.html_url}`); }
      if (run.status === "completed" && run.conclusion !== "cancelled") {
        say(`= pages ${run.conclusion} #${run.id} contains ${sha.slice(0, 7)} — live only once version.json's apex-sha confirms (deploy-research)`);
        return run.conclusion === "success" ? 0 : 1;
      }
      // cancelled = replaced by a later tick, or killed: wait for the next containing run
    }
    if (Date.now() > deadline) { say(`= pages timeout — no finished Pages run containing ${sha.slice(0, 7)} yet; re-arm`); return 124; }
    await sleep(interval);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ref = opt("--sha", "HEAD");
  // actions/runs?head_sha= matches a FULL sha only: a short one reached the API
  // as "no run" (2026-09-27) and as `associated PR lookup: HTTP 422` (2026-10-10).
  const resolved = resolveSha(ref);
  if (resolved.error) { say(`= ci unknown — ${resolved.error}`); process.exit(3); }
  const sha = resolved.sha;
  const interval = Math.max(10, +opt("--interval", 30)) * 1000;
  // No --timeout = DEFAULT_TIMEOUT_MIN, not forever: a `--pages` watch whose
  // train never contains the SHA (or a CI that never reports) used to poll
  // until the task was killed, and a killed task leaves no verdict line.
  const tmin = +opt("--timeout", DEFAULT_TIMEOUT_MIN);
  const deadline = Date.now() + (tmin > 0 ? tmin : DEFAULT_TIMEOUT_MIN) * 60_000;
  let code = await watchSha(sha, { interval, deadline, once: argv.includes("--once") });
  if (code === 0 && argv.includes("--pages") && !argv.includes("--once")) code = await watchPages(sha, { interval, deadline });
  process.exit(code);
}
