#!/usr/bin/env node
// remote-group.mjs — run one browser test group on GitHub's runners (sharded, llvmpipe) and stream its verdict here.
// @doc One test:* browser group on 4 llvmpipe runners (browser-group.yml); a line per shard, then `= group`.
// Full description: Dispatches .github/workflows/browser-group.yml for one test:* browser group on the current (pushed) branch, finds the run, prints one `[remote-group]` line per shard as it finishes (a red names its failing tests from the shard's log), then a terminal `= group <verdict>` line. `--plan` is the workflow's own step: it validates the group against package.json and prints the shard matrix. Built for a Monitor or a background task.
// @skill check-changes
//
// WHY. A browser group run in a cloud container is SwiftShader on 4 cores:
// `ui` was on track for ~40 min on 2026-09-30 (32/166 after 8). The same group
// on four GitHub runners with Mesa llvmpipe finished a shard in ~3 min. ci.yml
// could already do this (`group:` on a dispatch), but that dispatch is the
// whole CI workflow — 25 jobs for the 4 that ran the group. browser-group.yml
// is just those four, so this is the cheap way to answer "is <group> green on
// my branch?" without tying up the container for half an hour.
//
//   node tools/ci/remote-group.mjs ui                  # dispatch on this branch, 4 shards, watch to the verdict
//   node tools/ci/remote-group.mjs input --shards 2
//   node tools/ci/remote-group.mjs render --workers 2  # override; default is GL+group aware (browser-workers.mjs)
//   node tools/ci/remote-group.mjs ui --gl swiftshader  # reproduce a local-only (SwiftShader) red on CI
//   node tools/ci/remote-group.mjs ui --no-wait         # dispatch, print the run URL, exit
//   node tools/ci/remote-group.mjs --watch <run-id>     # watch a run already dispatched
//   GROUP=ui SHARDS=4 node tools/ci/remote-group.mjs --plan   # the workflow's plan step (prints matrix=[…])
//
// It tests the branch AS PUSHED: the runner checks out origin/<branch>, so a
// local commit not yet pushed is refused rather than silently not tested.
// NOT A GATE: nothing requires this workflow; the PR's own ci.yml run decides
// merge. Exit: 0 green, 1 red, 2 cancelled, 3 API/usage error, 124 --timeout.
//
// Auth: GH_TOKEN or GITHUB_TOKEN, else `gh auth token`, via curl's stdin config
// (never in argv), as ci-watch.mjs does. The dispatch is the one write; the rest are GETs.
// API: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
//      (200 with workflow_run_id on current API versions; a 204 falls back to finding the run)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { defaultRemoteWorkers } from "../lib/browser-workers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = "brycejmurrin/f1-game";
export const WORKFLOW = "browser-group.yml";
export const SHARD_CHOICES = [1, 2, 4, 6, 8];   // browser-group.yml's `shards` options
const say = (...a) => console.log("[remote-group]", ...a);

/** Resolve workers for a group: explicit request, else GL + render-heavy heuristic. */
export function resolveWorkers(group, gl, requested, scripts) {
  const script = (scripts || {})[`test:${group}`] || "";
  return defaultRemoteWorkers({ group, gl, script, requested });
}

/** The browser groups package.json defines: `test:<name>` scripts that run
 *  Playwright through run-playwright.mjs (the node-only groups are not here). */
export function browserGroups(scripts) {
  return Object.entries(scripts || {})
    .filter(([k, v]) => k.startsWith("test:") && /tools\/ci\/run-playwright\.mjs/.test(String(v)))
    .map(([k]) => k.slice(5)).sort();
}

/** Validate an explicit workers override, or { workers: "" } when unset. */
export function parseWorkers(w) {
  if (w == null || w === "") return { workers: "" };
  return defaultRemoteWorkers({ requested: w });
}

export function planMatrix(group, shards, scripts) {
  const g = String(group || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(g)) return { error: `not a group name: ${JSON.stringify(group)}` };
  const known = browserGroups(scripts);
  if (!known.includes(g)) return { error: `no browser group "test:${g}" in package.json (browser groups: ${known.join(", ")})` };
  const n = shards == null || shards === "" ? 4 : Number(shards);
  if (!SHARD_CHOICES.includes(n)) return { error: `shards must be one of ${SHARD_CHOICES.join(", ")}, not ${shards}` };
  return { group: g, shards: n, matrix: Array.from({ length: n }, (_, i) => i + 1) };
}

/** The run a dispatch created, when the API did not hand back its id: the
 *  newest workflow_dispatch run of this workflow on `branch`, created no
 *  earlier than `sinceMs` (less 60 s of clock skew), whose name carries the group. */
export function pickRun(runs, { branch, group, sinceMs }) {
  return (runs || [])
    .filter((r) => r.event === "workflow_dispatch" && r.head_branch === branch
      && Date.parse(r.created_at) >= sinceMs - 60_000
      && String(r.display_title || r.name || "").includes(`browser group ${group} `))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0] || null;   // a same-second tie: the higher id is the newer run
}

/** The failing test lines of a shard's log (live-reporter's `x FAIL` lines and
 *  its `= FAILURES` roll-up), timestamps stripped, at most `max`. */
export function failLines(log, max = 8) {
  const out = [];
  for (const raw of String(log || "").split("\n")) {
    const l = raw.replace(/^\S+Z\s/, "");   // the Actions timestamp
    if (/\bx FAIL\b|= FAILURES|= APEX_FAIL_ON_FLAKY|= run (failed|timedout|interrupted)/.test(l)) out.push(l.trim());
    if (out.length >= max) break;
  }
  return out;
}

/** Terminal verdict over a run's shard jobs (the plan job included). */
export function groupVerdict(run, jobs) {
  const shards = (jobs || []).filter((j) => j.name !== "Plan shards");
  const bad = (jobs || []).filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out");
  const done = shards.filter((j) => j.status === "completed").length;
  const tail = `(${done}/${shards.length} shards done, ${bad.length} failed)`;
  if (run.status !== "completed") return { done: false, line: `running ${tail}`, code: 124 };
  if (bad.length || run.conclusion === "failure") return { done: true, line: `failed ${tail}`, code: 1 };
  if (run.conclusion === "cancelled") return { done: true, line: `cancelled ${tail} — superseded by a newer dispatch of this group, or stopped`, code: 2 };
  return { done: true, line: run.conclusion === "success" ? `passed ${tail}` : `${run.conclusion} ${tail}`, code: run.conclusion === "success" ? 0 : 1 };
}

function api(method, pathQs, body, { raw = false } = {}) {
  const token = githubToken();
  if (!token) return { error: NO_TOKEN_HINT };
  const args = ["-sS", "-L", "--max-time", "60", "-K", "-", "-w", "\n%{http_code}", "-X", method,
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28"];
  // The token rides curl's stdin config, so a JSON body goes through a temp file.
  let tmp = null;
  if (body) {
    tmp = path.join(ROOT, "artifacts", `.remote-group-${process.pid}.json`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(body));
    args.push("-H", "Content-Type: application/json", "--data-binary", "@" + tmp);
  }
  args.push(`https://api.github.com/repos/${REPO}/${pathQs}`);
  const r = spawnSync("curl", args, { encoding: "utf8", input: `header = "Authorization: Bearer ${token}"\n`, maxBuffer: 64 << 20 });
  if (tmp) fs.rmSync(tmp, { force: true });
  if (r.status !== 0) return { error: (r.stderr || "curl failed").trim() };
  const out = (r.stdout || "").split("\n");
  const code = Number(out.pop());
  const text = out.join("\n");
  if (code < 200 || code > 299) return { error: `HTTP ${code} ${text.slice(0, 200)}`, code };
  if (raw || !text.trim()) return { code, text };
  try { return { code, json: JSON.parse(text) }; } catch { return { code, text }; }
}

const git = (...a) => (spawnSync("git", a, { cwd: ROOT, encoding: "utf8" }).stdout || "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const scripts = () => JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

async function watch(runId, { interval, deadline }) {
  const seen = new Set();
  let announced = false;
  for (;;) {
    const r = api("GET", `actions/runs/${runId}`);
    if (r.error) { say(`= group unknown — API: ${r.error}`); return 3; }
    const run = r.json;
    if (!announced) { announced = true; say(`${run.display_title} — ${run.html_url}`); }
    const j = api("GET", `actions/runs/${runId}/jobs?per_page=100`);
    const jobs = j.json?.jobs || [];
    for (const job of jobs) {
      if (job.status !== "completed" || seen.has(job.id)) continue;
      seen.add(job.id);
      if (job.conclusion === "skipped") continue;
      const mins = job.started_at && job.completed_at ? ` in ${((Date.parse(job.completed_at) - Date.parse(job.started_at)) / 60000).toFixed(1)} min` : "";
      say(`${job.name} → ${job.conclusion}${mins}`);
      if (job.conclusion === "failure" || job.conclusion === "timed_out") {
        const log = api("GET", `actions/jobs/${job.id}/logs`, null, { raw: true });
        const lines = failLines(log.text);
        for (const l of lines.length ? lines : [`(no test lines in the log — read ${job.html_url})`]) console.log("    " + l);
      }
    }
    const v = groupVerdict(run, jobs);
    if (v.done) { say(`= group ${v.line} ${run.html_url}`); return v.code; }
    if (Date.now() > deadline) { say(`= group timeout — still ${v.line}; re-arm with --watch ${runId}`); return 124; }
    await sleep(interval);
  }
}

/** Printed for `--help` / a missing group — never `not a group name: undefined`. */
export const USAGE = `usage: node tools/ci/remote-group.mjs <group> [--shards N] [--gl llvmpipe|swiftshader] [--workers N] [--ref <branch>] [--no-wait] [--timeout <min>]
       node tools/ci/remote-group.mjs --plan          # GROUP=/SHARDS= env (workflow step)
       node tools/ci/remote-group.mjs --watch <run-id>
       node tools/ci/remote-group.mjs --help`;

async function main() {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  if (argv.includes("--plan")) {   // the workflow's plan step: validate, print matrix + workers
    const allScripts = scripts();
    const p = planMatrix(process.env.GROUP, process.env.SHARDS, allScripts);
    if (p.error) { console.error("remote-group --plan: " + p.error); return 3; }
    const gl = process.env.GL || process.env.APEX_GL || "llvmpipe";
    const w = resolveWorkers(p.group, gl, process.env.WORKERS, allScripts);
    if (w.error) { console.error("remote-group --plan: " + w.error); return 3; }
    console.log(`matrix=${JSON.stringify(p.matrix)}`);
    // browser-group.yml appends this to GITHUB_OUTPUT — shards use needs.plan.outputs.workers
    console.log(`workers=${w.workers}`);
    return 0;
  }
  const interval = Math.max(10, +opt("--interval", 30)) * 1000;
  const tmin = +opt("--timeout", 0);
  const deadline = tmin > 0 ? Date.now() + tmin * 60_000 : Infinity;
  if (argv.includes("--watch")) return watch(opt("--watch"), { interval, deadline });

  const group = argv.find((a, i) => !a.startsWith("--") && !["--shards", "--gl", "--ref", "--interval", "--timeout", "--workers"].includes(argv[i - 1]));
  // Bare invoke used to fall through to planMatrix(undefined) → "not a group name: undefined".
  if (!group) {
    console.error(USAGE);
    return 3;
  }
  const p = planMatrix(group, opt("--shards", "4"), scripts());
  if (p.error) { say("refused: " + p.error); return 3; }
  const gl = opt("--gl", "llvmpipe");
  if (!["llvmpipe", "swiftshader"].includes(gl)) { say(`refused: --gl is llvmpipe or swiftshader, not ${gl}`); return 3; }
  const allScripts = scripts();
  const w = resolveWorkers(p.group, gl, opt("--workers", ""), allScripts);
  if (w.error) { say("refused: " + w.error); return 3; }
  const branch = opt("--ref", git("rev-parse", "--abbrev-ref", "HEAD"));
  if (!branch || branch === "HEAD") { say("refused: detached HEAD — pass --ref <pushed branch>"); return 3; }
  // The runner tests origin/<branch>: an unpushed commit would silently not be tested.
  if (!argv.includes("--ref")) {
    spawnSync("git", ["fetch", "-q", "origin", branch], { cwd: ROOT });
    const local = git("rev-parse", "HEAD"), remote = git("rev-parse", "--verify", "-q", `origin/${branch}`);
    if (local !== remote) { say(`refused: HEAD ${local.slice(0, 9)} is not origin/${branch} (${remote.slice(0, 9) || "not pushed"}) — push first; the runner tests the pushed branch`); return 3; }
  }
  // GitHub runs the workflow file AS IT IS ON THE DISPATCHED REF: a branch cut
  // before browser-group.yml landed has no such workflow to run.
  if (spawnSync("git", ["cat-file", "-e", `origin/${branch}:.github/workflows/${WORKFLOW}`], { cwd: ROOT }).status !== 0) {
    say(`refused: origin/${branch} predates ${WORKFLOW} — merge the deploy branch in (sync-pr.mjs), or dispatch ci.yml with group: ${p.group} (the whole CI workflow, slower to start)`);
    return 3;
  }
  const since = Date.now();
  const d = api("POST", `actions/workflows/${WORKFLOW}/dispatches`, {
    ref: branch,
    // Always pass resolved workers (GL + group aware) so empty UI input still gets the plan default.
    inputs: { group: p.group, shards: String(p.shards), gl, workers: w.workers },
  });
  if (d.error) { say(`= group unknown — dispatch failed: ${d.error}`); return 3; }
  let runId = d.json?.workflow_run_id || null;
  for (let tries = 0; !runId && tries < 20; tries++) {   // a 204 (older API behaviour): find it
    await sleep(3000);
    const r = api("GET", `actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=10`);
    runId = pickRun(r.json?.workflow_runs, { branch, group: p.group, sinceMs: since })?.id || null;
  }
  if (!runId) { say("= group unknown — dispatched, but no run appeared within 60 s; check the Actions tab"); return 3; }
  say(`dispatched ${p.group} on ${branch} (${p.shards} shards, ${gl}, ${w.workers} workers) — run ${runId}`);
  if (argv.includes("--no-wait")) { say(`watch: node tools/ci/remote-group.mjs --watch ${runId}`); return 0; }
  return watch(runId, { interval, deadline });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
