#!/usr/bin/env node
// ci-watch.mjs — watch a pushed commit's CI (and optionally the Pages train that ships it), one line per job result.
// @doc Watches every workflow run for a SHA (default HEAD) and prints one `[ci-watch]` line per job as it finishes — a red names its failing step and first annotations — then a terminal `= ci <verdict>` line; `--pages` follows the deploy train until a Pages run containing the SHA ends. Built for a Monitor (each line an event) or a background task.
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
//   node tools/ci/ci-watch.mjs                       # HEAD, poll every 30 s, until every run completes
//   node tools/ci/ci-watch.mjs --sha e3bd067 --timeout 30
//   node tools/ci/ci-watch.mjs --pages               # …then follow pages.yml until a run containing the SHA ends
//   node tools/ci/ci-watch.mjs --once                # print the current state and exit (no waiting)
//
// Under Claude Code, arm it as a Monitor (every line is an event; re-arm on the
// 30-min expiry — it resumes from the API, nothing is lost) or as ONE
// run_in_background task when only the verdict matters. Exit: 0 green (or no
// run started — a docs-only push), 1 red, 2 cancelled with no live sibling,
// 3 no token / API unreachable, 124 --timeout.
//
// Auth: GH_TOKEN or GITHUB_TOKEN (the remote containers carry both), sent via
// curl's stdin config so it never appears in argv. Read-only: GET requests only.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
export const DEPLOY = "claude/f1-game-project-26h3ng";
export const PAGES_WORKFLOW = 295002043;   // pages.yml (AGENTS.md §Watching CI and Pages)
const say = (...a) => console.log("[ci-watch]", ...a);

function api(pathQs) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) return { error: "no GH_TOKEN / GITHUB_TOKEN" };
  const r = spawnSync("curl", ["-sS", "--max-time", "30", "-K", "-", "-w", "\n%{http_code}",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
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
 *  superseded, not a red. */
export function latestPerWorkflow(runs) {
  const by = new Map();
  for (const r of runs) {
    const cur = by.get(r.name);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) by.set(r.name, r);
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

/** Only a failed or timed-out job carries a diagnosis worth printing. */
export const wantsAnnotations = (job) => job.conclusion === "failure" || job.conclusion === "timed_out";

function annotations(jobId) {
  const r = api(`check-runs/${jobId}/annotations?per_page=5`);
  return (r.json || []).filter((a) => a.annotation_level === "failure").slice(0, 3)
    .map((a) => `    ${a.path}:${a.start_line} ${String(a.message).split("\n").slice(0, 3).join(" | ").slice(0, 300)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

async function watchSha(sha, { interval, deadline, once }) {
  const seen = new Set(), announced = new Set();
  const start = Date.now();
  for (;;) {
    const r = api(`actions/runs?head_sha=${sha}&per_page=50`);
    if (r.error) { say(`= ci unknown — API: ${r.error}`); return 3; }
    const runs = latestPerWorkflow(r.json.workflow_runs || []);
    const jobsByRun = {};
    for (const run of runs) {
      if (!announced.has(run.id)) { announced.add(run.id); say(`${run.name} #${run.id} (${run.event}) ${run.status} ${run.html_url}`); }
      const j = api(`actions/runs/${run.id}/jobs?per_page=100`);
      jobsByRun[run.id] = j.json?.jobs || [];
      for (const e of newJobEvents(jobsByRun[run.id], seen, run.name)) {
        say(e.line);
        // Annotations only for a job that FAILED: a cancelled job's annotation is
        // the draft/ready dedupe's "higher priority waiting request" (rule 8) — as a
        // Monitor event it read as a red, eight times over, on PR #279.
        if (wantsAnnotations(e.job)) for (const a of annotations(e.job.id)) console.log(a);
      }
    }
    const v = verdict(runs, jobsByRun);
    // A commit ci.yml's paths-ignore skips (docs / *.md / .claude/) starts no
    // run at all; after 3 min of nothing that is the answer, not "queued".
    if (v.state === "none" && Date.now() - start > 180_000) { say(`= ci none — no workflow run for ${sha.slice(0, 7)} after 3 min (docs/.md/.claude-only push, or a topic branch with no PR — ci.yml runs on the PR, draft = fast tier)`); return 0; }
    if (v.done || once) { say(`= ci ${v.line} sha=${sha.slice(0, 7)}`); return { passed: 0, failed: 1, cancelled: 2 }[v.state] ?? 0; }
    if (Date.now() > deadline) { say(`= ci timeout — still ${v.line} sha=${sha.slice(0, 7)}; re-arm to keep watching`); return 124; }
    await sleep(interval);
  }
}

async function watchPages(sha, { interval, deadline }) {
  say(`pages: waiting for a pages.yml run on ${DEPLOY} whose head contains ${sha.slice(0, 7)}`);
  let announced = null;
  for (;;) {
    const r = api(`actions/workflows/${PAGES_WORKFLOW}/runs?branch=${encodeURIComponent(DEPLOY)}&per_page=10`);
    if (r.error) { say(`= pages unknown — API: ${r.error}`); return 3; }
    for (const run of (r.json.workflow_runs || []).slice().reverse()) {
      const c = api(`compare/${sha}...${run.head_sha}`);
      if (!["ahead", "identical"].includes(c.json?.status)) continue;   // this run does not contain the SHA
      if (announced !== run.id) { announced = run.id; say(`pages #${run.id} (${run.event}) head=${run.head_sha.slice(0, 7)} ${run.status} ${run.html_url}`); }
      if (run.status === "completed") {
        say(`= pages ${run.conclusion} #${run.id} contains ${sha.slice(0, 7)} — live only once version.json's apex-sha confirms (deploy-research)`);
        return run.conclusion === "success" ? 0 : 1;
      }
      break;
    }
    if (Date.now() > deadline) { say(`= pages timeout — no finished Pages run containing ${sha.slice(0, 7)} yet; re-arm`); return 124; }
    await sleep(interval);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ref = opt("--sha", "HEAD");
  const g = spawnSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" });
  const sha = (g.stdout || "").trim() || ref;
  const interval = Math.max(10, +opt("--interval", 30)) * 1000;
  const tmin = +opt("--timeout", 0);
  const deadline = tmin > 0 ? Date.now() + tmin * 60_000 : Infinity;
  let code = await watchSha(sha, { interval, deadline, once: argv.includes("--once") });
  if (code === 0 && argv.includes("--pages") && !argv.includes("--once")) code = await watchPages(sha, { interval, deadline });
  process.exit(code);
}
