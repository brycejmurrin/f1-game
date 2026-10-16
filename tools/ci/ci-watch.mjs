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
// with no PR (ci.yml runs on pull_request; the deploy branch's push starts
// pages.yml) starts NO run,
// which looks exactly like "still queued". So this polls the REST API and turns
// state into events:
//
//   [ci-watch] CI #35957643756 (push) queued …                     once, when first seen
//   [ci-watch] CI › Smoke (page boots, __apex responds) (2) → failure — step "Run smoke shard": <annotation> <url>
//   [ci-watch] = ci failed (19 jobs, 1 failed, 4 skipped) sha=e3bd067 …   terminal; the process exits
//
//   node tools/ci/ci-watch.mjs                       # HEAD, poll every 60 s, until every run completes (or 120 min)
//   node tools/ci/ci-watch.mjs --sha e3bd067 --timeout 30   # minutes; default 120 for CI and --pages together
//   node tools/ci/ci-watch.mjs --pages               # …then follow pages.yml until a run containing the SHA ends
//   node tools/ci/ci-watch.mjs --once                # print the current state and exit (no waiting)
//   node tools/ci/ci-watch.mjs --interval 30         # seconds between polls (min 10, default 60)
//   node tools/ci/ci-watch.mjs --since 2026-10-15T17:08:05Z   # count only runs created at/after this time
//   node tools/ci/ci-watch.mjs --since none          # no floor (default: the PR's last trigger event)
//
// THE TRIGGER FLOOR (#2259, 2026-10-15). Started right after a `run-ci` label,
// a watch printed `= ci passed` from the PREVIOUS run on the same head (the
// draft's skipped run) because the run the label started was not listed yet
// (PR #2224). A label, a ready flip or a reopen re-runs CI on the SAME sha, so
// "newest run on the sha" can be a run from before the event. By default the
// floor is the open PR's newest trigger event (triggerFloor): runs created
// before it never count, and if no newer run appears within FLOOR_GRACE_MIN
// the line is `= ci none` (exit 124), never the older run's verdict.
//
// Under Claude Code, arm it as a Monitor (every line is an event; re-arm on the
// 30-min expiry — it resumes from the API, nothing is lost) or as ONE
// run_in_background task when only the verdict matters. Exit: 0 green (or no
// run started — a docs-only push), 1 red, 2 cancelled with no live sibling,
// 3 no token / API unreachable, 4 superseded (a pending run replaced by a newer
// push in the same concurrency group — pages.yml's `pages-train-*` — before it
// ran a step, or the PR merged / moved to a new head; re-arm on the `--sha` it
// names), 5 hollow (a draft's skeleton ran, nothing was tested — not green),
// 124 --timeout (default 120 min).
//
// FRICTION FIXES (#2384, agent friction plan WS2):
//   --failures-only   a Monitor event only for a failed/cancelled job and the final `= ci …` line
//   --wait            long-poll past a 30-min Monitor: timeout 12 h unless --timeout, exits on the final line
//   --jobs            one line per job still queued/pending, with its wait age (replaces paging list_workflow_jobs)
//   --state <file>    already-reported `<run>:<job>` keys; default artifacts/ci-watch/<sha7>.json (not under --once),
//                     so a re-armed watch never replays a job or a cancelled run; `--state none` disables
//   `= ci hollow (draft, n/m jobs skipped — add run-ci)` · `= ci superseded (merged | new head <sha>)` ·
//   `= ci cancelled-external` (one run, every job cancelled within 60 s, no newer run) · the final line
//   names the run(s): `run=#<id> <event> <tier>` · a 5xx is retried with backoff (1/2/4 s) before it is an error.
//
// Auth: GH_TOKEN or GITHUB_TOKEN, else `gh auth token` (Cloud boxes often have
// gh logged in with no env token). Sent via curl's stdin config so it never
// appears in argv. Read-only: GET requests only.
//
// API budget (docs/notes/ACTIONS-AUDIT-2026-10-14.md finding 8): a tick is 3–4
// GETs, so the old 30 s default cost 360–480 requests/h per armed watch and
// ~15 concurrent watches crossed the 5,000/h token limit. The default is 60 s,
// and every GET is CONDITIONAL: the URL's last ETag rides in If-None-Match and
// a 304 reuses the cached body. "Making a conditional request does not count
// against your primary rate limit if a 304 response is returned" (authorized
// requests only) — https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests
// (read 2026-10-14; measured here: x-ratelimit-remaining unchanged across 304s).
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const PAGES_WORKFLOW = 295002043;   // pages.yml (AGENTS.md §Watching CI and Pages)
export const DEFAULT_TIMEOUT_MIN = 120;     // no --timeout: CI (~15 min) + the gated Pages publish (median 23, p90 73 min)
export const DEFAULT_INTERVAL_S = 60;       // seconds between polls; --interval overrides (min 10)
export const WAIT_TIMEOUT_MIN = 720;        // --wait: one background task outlives the 30-min Monitor expiry
export const FLOOR_GRACE_MIN = 5;           // minutes to wait for a run newer than the trigger floor
const say = (...a) => console.log("[ci-watch]", ...a);

/** url -> { etag, json }: the last 200 per URL, for If-None-Match. Bounded. */
const ETAGS = new Map();
export const ETAG_CACHE_MAX = 256;

/** GET `repos/<REPO>/<pathQs>` → { json } | { error }; `cached: true` when a 304
 *  reused the stored body. `etags` (a Map, or null to disable) is the per-URL
 *  ETag store, injectable for tests. */
export function api(pathQs, opts = {}) {
  const { retries = RETRY_DELAYS_MS, sleepSync: nap = sleepSync } = opts;
  for (let attempt = 0; ; attempt++) {
    const r = apiOnce(pathQs, opts);
    if (!/^HTTP 5\d\d$/.test(r.error || "") || attempt >= retries.length) return r;
    nap(retries[attempt]);   // a 5xx is GitHub's, not ours: back off and ask again
  }
}
/** Backoff before each retry of a 5xx (1 s, 2 s, 4 s), then the error stands.
 *  https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately */
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function apiOnce(pathQs, { run = spawnSync, env = process.env, gh, etags = ETAGS } = {}) {
  const token = githubToken(gh !== undefined ? { env, gh } : { env });
  if (!token) return { error: NO_TOKEN_HINT };
  const url = `https://api.github.com/repos/${REPO}/${pathQs}`;
  const prior = etags?.get(url);
  // -w: the status code and the response ETag on the last line (`%header{}`, curl ≥ 7.84).
  const r = run("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code} %header{etag}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    // Revalidate stored HTTP responses when polling mutable CI/PR state.
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.4
    "-H", "Cache-Control: no-cache",
    ...(prior ? ["-H", `If-None-Match: ${prior.etag}`] : []),
    url],
  // maxBuffer: a 100-job page or a 50-run page can pass spawnSync's 1 MB
  // default; ready-full-cap died of exactly that (ENOBUFS, #1733).
  { encoding: "utf8", maxBuffer: 64 << 20, input: `header = "Authorization: Bearer ${token}"\n` });
  if (r.status !== 0) return { error: (r.stderr || r.error?.code || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const [, codeText = "", etag = ""] = /^(\d{3})\s*(.*)$/.exec(out.pop().trim()) || [];
  const code = Number(codeText);
  if (code === 304 && prior) return { json: prior.json, cached: true };
  try {
    if (code !== 200) return { error: `HTTP ${code}` };
    const json = JSON.parse(out.join("\n"));
    if (etags && etag) {
      etags.delete(url);
      etags.set(url, { etag, json });
      if (etags.size > ETAG_CACHE_MAX) etags.delete(etags.keys().next().value);
    }
    return { json };
  } catch { return { error: "bad JSON" }; }
}

/** A ci.yml run started by a label other than run-ci on a draft (#2184): its
 *  jobs all skip, so it concludes success while testing nothing. ci.yml's
 *  `run-name` titles it `CI ignored: label <name>`; as the newest run on the
 *  head it would hide the real verdict, so it never counts. Pure. */
export const labelNoiseRun = (r) => /^CI ignored: label /.test(String(r?.display_title || ""));

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
 *  concurrency group, so a deploy-branch push waiting in pages.yml's
 *  `pages-train-*` group is cancelled when the next push arrives. That is
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

/** The draft skeleton: ci.yml's one `Draft push (CI skipped — add run-ci label)` job
 *  succeeds while every other job skips, so the run is `success` and tested
 *  nothing. → { skipped, total } when that is ALL that ran, else null. Pure. */
export function hollowDraft(jobs) {
  const list = jobs || [];
  const skeleton = list.filter((j) => /^Draft push \(CI skipped/.test(j.name || ""));
  if (!skeleton.length) return null;
  const rest = list.filter((j) => !skeleton.includes(j));
  if (!rest.every((j) => j.conclusion === "skipped")) return null;
  return { skipped: rest.length, total: list.length };
}

/** A lone run whose every job was cancelled within `withinMs` of starting, with
 *  no newer run: someone or something outside the workflow cancelled it (a
 *  person, the API, a lane) — not a timeout (a timeout runs for minutes) and
 *  not the designed dedupe (that leaves a NEWER run). → seconds | null. Pure. */
export function cancelledExternal(runs, jobsByRun, withinMs = 60_000) {
  if (runs.length !== 1 || runs[0].conclusion !== "cancelled") return null;
  const jobs = jobsByRun[runs[0].id] || [];
  if (!jobs.length || !jobs.every((j) => j.conclusion === "cancelled" || j.conclusion === "skipped")) return null;
  const took = Date.parse(runs[0].updated_at) - Date.parse(runs[0].run_started_at || runs[0].created_at);
  return Number.isFinite(took) && took >= 0 && took <= withinMs ? Math.round(took / 1000) : null;
}

/** Is a still-unfinished `sha` obsolete? Its PR merged, or the PR's head moved
 *  on. → { why: "merged" | "new head", pr, head? } | null. A PR whose
 *  merge_commit_sha IS `sha` is the merge being watched, not a replacement.
 *  https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit */
export function supersededByPr(sha, request = api) {
  const r = request(`commits/${encodeURIComponent(sha)}/pulls?per_page=100`);
  if (r?.error || !Array.isArray(r?.json)) return null;
  const prs = r.json.filter((p) => p && p.merge_commit_sha !== sha);
  if (prs.some((p) => p.state === "open" && p.head?.sha === sha)) return null;
  const merged = prs.find((p) => p.merged_at);
  if (merged) return { why: "merged", pr: merged.number };
  const moved = prs.find((p) => p.state === "open" && /^[0-9a-f]{40}$/.test(p.head?.sha || "") && p.head.sha !== sha);
  return moved ? { why: "new head", pr: moved.number, head: moved.head.sha } : null;
}

/** Persisted "already reported" keys (`<run>:<job>`), so a re-armed watch does
 *  not replay events the last one emitted. File-backed JSON array. */
export function fileState(file, fsm) {
  let keys = new Set();
  try { keys = new Set(JSON.parse(fsm.readFileSync(file, "utf8"))); } catch { /* first run */ }
  return {
    has: (k) => keys.has(k),
    add: (k) => {
      keys.add(k);
      try { fsm.mkdirSync(path.dirname(file), { recursive: true }); fsm.writeFileSync(file, JSON.stringify([...keys])); } catch { /* best effort */ }
    },
  };
}

/** `--jobs`: one line per job still waiting for a runner or a lane, with its wait age. */
export function waitingJobs(sha, { since = null, request = api, now = Date.now, report = say } = {}) {
  const r = request(`actions/runs?head_sha=${sha}&per_page=50`);
  if (r?.error || !Array.isArray(r?.json?.workflow_runs)) { report(`= ci unknown — API: ${r?.error || "workflow runs lookup returned no run array"}`); return 3; }
  const listed = r.json.workflow_runs.filter((x) => !labelNoiseRun(x));
  const runs = latestPerWorkflow(since == null ? listed : listed.filter((x) => Date.parse(x.created_at) >= since)).filter((x) => x.status !== "completed");
  let waiting = 0, running = 0;
  const kinds = {};
  for (const run of runs) {
    const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
    if (j?.error || !Array.isArray(j?.json?.jobs)) { report(`= ci unknown — API: ${j?.error || `run #${run.id} jobs lookup returned no job array`}`); return 3; }
    for (const job of j.json.jobs) {
      if (job.status === "in_progress") { running++; continue; }
      if (job.status === "completed") continue;
      waiting++; kinds[job.status] = (kinds[job.status] || 0) + 1;
      const age = Math.max(0, Math.round((now() - Date.parse(job.created_at || run.created_at)) / 60_000));
      report(`${run.name} › ${job.name} — ${job.status} ${age}m (run #${run.id})`);
    }
  }
  const by = Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ");
  report(`= ci jobs ${waiting} waiting${by ? ` (${by})` : ""}, ${running} running sha=${sha.slice(0, 7)}`);
  return 0;
}

export const wantsAnnotations = (job) => job.conclusion === "failure" || job.conclusion === "timed_out";

function annotations(jobId) {
  const r = api(`check-runs/${jobId}/annotations?per_page=5`);
  return (r.json || []).filter((a) => a.annotation_level === "failure").slice(0, 3)
    .map((a) => `    ${a.path}:${a.start_line} ${String(a.message).split("\n").slice(0, 3).join(" | ").slice(0, 300)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/ci/ci-watch.mjs [--sha <sha|ref>] [--pages] [--once] [--failures-only] [--wait] [--jobs] [--state <file|none>] [--timeout <min>] [--interval <s>] [--since <ISO>|none]
  Polls every workflow run for a SHA (default HEAD) every 60 s, with ETag conditional GETs (a 304 is free):
  one [ci-watch] line per job, a red\'s failing step,
  then one \`= ci <verdict>\` line (passed | failed | cancelled | superseded | none). --pages adds the Pages train.
  --failures-only: only red/cancelled jobs and the final line. --wait: long poll (12 h default timeout). --jobs: list waiting legs and exit.
  --state <file|none>: reported-job keys across re-arms. --once polls one time and exits. --since: runs created earlier never count (default: the open PR's last
  run-ci label / ready / reopen; none = no floor). Details: the header of this file and AGENTS.md §Watching CI and Pages.`);
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

/**
 * The PR's newest event that starts a ci.yml run on the SAME head: `run-ci`
 * labelled while the PR was a draft (any other label, or run-ci on a ready PR,
 * starts only a `CI ignored` run — labelNoiseRun), `ready_for_review`, or
 * `reopened`. Draft state is replayed backwards from `pr.draft` through
 * ready_for_review / converted_to_draft. → { floor: ms|null } | { error }.
 * https://docs.github.com/en/rest/issues/events#list-issue-events (oldest first, per_page max 100)
 */
export function triggerFloor(pr, request = api) {
  const events = [];
  for (let page = 1; page <= 10; page++) {
    const r = request(`issues/${pr.number}/events?per_page=100&page=${page}`);
    if (r?.error || !Array.isArray(r?.json)) return { floor: null, error: `PR #${pr.number} events: ${r?.error || "no event array"}` };
    events.push(...r.json);
    if (r.json.length < 100) break;
  }
  let draft = Boolean(pr.draft);
  for (const e of events.slice().reverse()) {
    const at = Date.parse(e?.created_at);
    if (e?.event === "ready_for_review") { if (Number.isFinite(at)) return { floor: at }; draft = true; }
    else if (e?.event === "reopened" && Number.isFinite(at)) return { floor: at };
    else if (e?.event === "converted_to_draft") draft = false;
    else if (e?.event === "labeled" && e.label?.name === "run-ci" && draft && Number.isFinite(at)) return { floor: at };
  }
  return { floor: null };
}

export async function watchSha(sha, { interval, deadline, once, since = null, grace = FLOOR_GRACE_MIN * 60_000, request = api, now = Date.now, wait = sleep, report: out = say,
  failuresOnly = false, state = null, checkSuperseded = false, tier = "" }) {
  const seen = new Set(), announced = new Set();
  const start = now();
  let lastSuperseded = -Infinity;
  // --failures-only: a Monitor wakes the model only for a red job and the final line.
  const report = out;
  const note = (m) => { if (!failuresOnly) out(m); };
  // The run(s) the verdict is about, on the final line: id, event, tier.
  const via = (rs) => rs.length ? ` run=${rs.map((x) => `#${x.id} ${x.event}`).join(", ")}${tier ? ` ${tier}` : ""}` : "";
  const unknown = (message) => { report(`= ci unknown — API: ${message}`); return 3; };
  for (;;) {
    const r = request(`actions/runs?head_sha=${sha}&per_page=50`);
    if (r?.error || !Array.isArray(r?.json?.workflow_runs)) return unknown(r?.error || "workflow runs lookup returned no run array");
    const listed = r.json.workflow_runs.filter((x) => !labelNoiseRun(x));
    // #2259: a run from before the trigger floor does not cover it.
    const fresh = since == null ? listed : listed.filter((x) => Date.parse(x.created_at) >= since);
    if (since != null && !fresh.length && listed.length) {
      const at = new Date(since).toISOString().replace(/\.000Z$/, "Z");
      if (!announced.has("floor")) { announced.add("floor"); note(`ignoring ${listed.length} run(s) created before ${at} (the PR's last run-ci label / ready / reopen); waiting for the run it starts`); }
      if (once || now() - start > grace) {
        report(`= ci none — no run for ${sha.slice(0, 7)} created after ${at} within ${Math.round(grace / 60000)} min; the ${listed.length} older run(s) do not cover it, so theirs is not the verdict (re-arm, or --since none to read them; a label that started no run: dispatch ci.yml by hand)`);
        return 124;
      }
      await wait(interval);
      continue;
    }
    const runs = latestPerWorkflow(fresh);
    const jobsByRun = {};
    for (const run of runs) {
      if (!announced.has(run.id)) { announced.add(run.id); note(`${run.name} #${run.id} (${run.event}${tier ? `, ${tier}` : ""}) ${run.status} ${run.html_url}`); }
      const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
      if (j?.error || !Array.isArray(j?.json?.jobs)) return unknown(j?.error || `run #${run.id} jobs lookup returned no job array`);
      jobsByRun[run.id] = j.json.jobs;
      for (const e of newJobEvents(jobsByRun[run.id], seen, run.name)) {
        // A re-armed watch is a new process: the file state remembers what the last one said.
        const key = `${run.id}.${run.run_attempt || 1}:${e.job.id}`;
        if (state?.has(key)) continue;
        state?.add(key);
        if (failuresOnly && !e.bad) continue;
        report(e.line);
        // Annotations only for a job that FAILED: a cancelled job's annotation is
        // the draft/ready dedupe's "higher priority waiting request" (rule 8) — as a
        // Monitor event it read as a red, eight times over, on PR #279.
        if (wantsAnnotations(e.job)) for (const a of annotations(e.job.id)) console.log(a);
      }
    }
    const v = verdict(runs, jobsByRun);
    // A cancelled run replaced while pending (pages.yml's `pages-train-*` group) is
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
        for (const [c, by] of newer) note(`${c.name} #${c.id} was replaced while pending by #${by.id} (head ${String(by.head_sha).slice(0, 7)}, ${by.status}) ${by.html_url}`);
        report(`= ci superseded ${v.line.replace(/^cancelled /, "").replace(/ — .*/, "")} — a newer ${newer[0][1].event} run in the same concurrency group replaced it before it started; watch it: --sha ${newer[0][1].head_sha} sha=${sha.slice(0, 7)}`);
        return 4;
      }
      const external = cancelledExternal(runs, jobsByRun);
      if (external != null) {
        report(`= ci cancelled-external — run #${runs[0].id} (${runs[0].event}): every job cancelled ${external}s after it started and no newer run exists on ${sha.slice(0, 7)}; someone or something cancelled it, not a timeout — re-dispatch ci.yml (or re-push)${via(runs)} sha=${sha.slice(0, 7)}`);
        return 2;
      }
    }
    // The commit's PR merged or moved on while this verdict was still open: waiting is pointless.
    if (checkSuperseded && ["none", "running", "cancelled"].includes(v.state) && (once || now() - lastSuperseded >= 300_000)) {
      lastSuperseded = now();
      const by = supersededByPr(sha, request);
      if (by) {
        report(by.why === "merged"
          ? `= ci superseded (merged) — PR #${by.pr} merged; this head's run is moot, read the merge commit's CI (--sha <merge sha> --pages) sha=${sha.slice(0, 7)}`
          : `= ci superseded (new head ${by.head.slice(0, 7)}) — PR #${by.pr} moved on; watch it: --sha ${by.head} sha=${sha.slice(0, 7)}`);
        return 4;
      }
    }
    if (v.state === "passed") {
      const hollow = hollowDraft(runs.flatMap((x) => jobsByRun[x.id] || []));
      if (hollow) {
        report(`= ci hollow (draft, ${hollow.skipped}/${hollow.total} jobs skipped — add run-ci) nothing ran but the draft skeleton${via(runs)} sha=${sha.slice(0, 7)}`);
        return 5;
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
        note(`runs list is empty for ${sha.slice(0, 7)} but the commit has ${checks} check run(s): GitHub's run search is lagging — still waiting`);
      }
      if (nv === "none") { report(`= ci none — no workflow run for ${sha.slice(0, 7)} after 3 min and no open PR carries it (docs/.md/.claude-only push, or a topic branch with no PR — ci.yml runs on the PR, draft = fast tier; the deploy branch's push starts pages.yml)`); return 0; }
      if (nv === "blocked") { report(`= ci blocked — PR #${pr.number} has merge conflicts, so GitHub starts no run for ${sha.slice(0, 7)}; merge the base (sync-pr.mjs) and push`); return 1; }
      if (nv === "late") { report(`= ci none-yet — PR #${pr.number} carries ${sha.slice(0, 7)} but no run started in 10 min (mergeable_state ${pr.mergeable_state || "unknown"}: "unknown" is GitHub still computing, "dirty" starts no run); re-arm, or check the Actions tab`); return 124; }
    }
    // `running` and `none` are NOT green: under --once a scripted `&& next`
    // used to proceed on a run still in flight (2026-09-24).
    if (v.done || once) { report(`= ci ${v.line} sha=${sha.slice(0, 7)}${via(runs)}`); return { passed: 0, failed: 1, cancelled: 2, running: 124, none: 124 }[v.state] ?? 0; }
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
  const interval = Math.max(10, +opt("--interval", DEFAULT_INTERVAL_S) || DEFAULT_INTERVAL_S) * 1000;
  // No --timeout = DEFAULT_TIMEOUT_MIN, not forever: a `--pages` watch whose
  // train never contains the SHA (or a CI that never reports) used to poll
  // until the task was killed, and a killed task leaves no verdict line.
  const tmin = +opt("--timeout", argv.includes("--wait") ? WAIT_TIMEOUT_MIN : DEFAULT_TIMEOUT_MIN);
  const deadline = Date.now() + (tmin > 0 ? tmin : DEFAULT_TIMEOUT_MIN) * 60_000;
  // #2259: the trigger floor — explicit --since, else the open PR's last trigger event.
  let since = null, tier = "";
  const sinceArg = opt("--since", null);
  if (sinceArg === "none") since = null;
  else if (sinceArg != null) {
    since = Date.parse(sinceArg);
    if (!Number.isFinite(since)) { say(`= ci unknown — invalid --since ${JSON.stringify(sinceArg)} (an ISO time, or none)`); process.exit(3); }
  } else {
    const lookup = openPrFor(sha);
    if (lookup.state === "found") tier = lookup.pr.draft ? "draft/fast tier" : "ready/full tier";
    const f = lookup.state === "found" ? triggerFloor(lookup.pr) : { floor: null, error: lookup.error };
    if (f.error) say(`trigger floor unavailable (${f.error}) — every run on the sha counts`);
    since = f.floor;
  }
  if (argv.includes("--jobs")) process.exit(waitingJobs(sha, { since }));
  const once = argv.includes("--once");
  const stateArg = opt("--state", null);
  const state = once || stateArg === "none" ? null : fileState(path.resolve(ROOT, stateArg || `artifacts/ci-watch/${sha.slice(0, 7)}.json`), fs);
  let code = await watchSha(sha, { interval, deadline, once, since, state, tier, checkSuperseded: true, failuresOnly: argv.includes("--failures-only") });
  if (code === 0 && argv.includes("--pages") && !argv.includes("--once")) code = await watchPages(sha, { interval, deadline });
  process.exit(code);
}
