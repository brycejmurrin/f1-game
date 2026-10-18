#!/usr/bin/env node
// remote-group.mjs — run one browser test group on GitHub's runners (sharded, llvmpipe) and stream its verdict here.
// @doc One test:* browser group on 4 llvmpipe runners (browser-group.yml), time-packed shards; line per shard, then `= group`.
// Full description: Dispatches .github/workflows/browser-group.yml for one test:* browser group on the current (pushed) branch, finds the run, prints one `[remote-group]` line per shard as it finishes (a red names its failing tests from the shard's log), then a terminal `= group <verdict>` line. The shard plan is computed HERE (LPT over tests/data/spec-timings.json) and travels as the workflow's `plan` input, so there is no plan job; `--run-shard` is the workflow's shard step (validates the plan against package.json, then runs it). A live or green run of the same group on the same sha is reused, not re-dispatched (`--force`). Built for a Monitor or a background task.
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
//   node tools/ci/remote-group.mjs ui --force           # dispatch even when this sha already has a live or green run
//   GROUP=ui PLAN='{…}' SHARD=1 TOTAL=4 node tools/ci/remote-group.mjs --run-shard   # the workflow's shard step
//
// SHARDS ARE PACKED BY TIME, NOT COUNT (2026-10-14). `--shard=i/n` splits a
// group by file count, so one shard drew the mega-sweep spec plus the 6-minute
// visual spec: gfx ran 15.3 / 2.7 / 1.8 / 2.7 min across its four shards (run
// 38478672714), ui 15.5 / 11.0 / 5.0 / 7.5, render 19.7 / 13.8 / 10.9 / 6.0 —
// a 14-min median against ~5 min of actual test work per shard
// (docs/notes/ACTIONS-AUDIT-2026-10-14.md). shardPlan() packs the group's spec
// files longest-first onto the least-loaded shard (LPT, the same rule
// select-specs' megaShardPlan uses) by expected seconds = declared tests × the
// spec's measured per-test rate, and each shard runs its list through
// run-playwright.mjs. The plan rides the dispatch as JSON (text from whoever
// dispatched: --run-shard re-validates every path against package.json before
// a byte reaches a shell). A group whose script is not a plain file list
// (--project, an env prefix) keeps Playwright's count shard. The plan job is
// gone with it: it was a second runner-queue wait (p90 15.8 min) in series.
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
import { CI_BUCKETS, MIN_SAMPLES, declaredTests, specSecPerTest } from "./select-budget.mjs";
import { specsOf } from "./select-specs.mjs";
import { inBuckets, loadDb, median, TIMINGS_FILE } from "./spec-timings.mjs";

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

/** A spec path as it may appear in a plan: tests/specs/<name>.spec.js, nothing else. */
export const SPEC_RE = /^tests\/specs\/[A-Za-z0-9._-]+\.spec\.js$/;
const SPEC_OR_GLOB_RE = /^tests\/specs\/[A-Za-z0-9._*-]+\.spec\.js$/;
/** A piece of a fat spec: Playwright's native `--shard=j/k` over ONE file. */
const PIECE_RE = /^([1-9]\d?)\/([1-9]\d?)$/;
/** No spec is split into more than this many pieces, and no piece is expected
 *  under MIN_PIECE_SEC (a piece still boots a browser and a server, ~20 s;
 *  hud-layout at ~1,480 s measured is 3-4 pieces of ~400-500 s). */
export const MAX_PIECES = 8;
export const MIN_PIECE_SEC = 120;

/** The group's spec files when its script is a PLAIN file list (globs
 *  expanded) — what a packed plan can split; null when it is not: `--project=…`,
 *  an env prefix, no files, and the count shard (`--shard=i/n`) must stay. */
export function groupFiles(group, scripts) {
  const cmd = String((scripts || {})[`test:${group}`] || "");
  const toks = cmd.split(/\s+/).filter(Boolean);
  if (toks[0] !== "node" || toks[1] !== "tools/ci/run-playwright.mjs") return null;
  const files = toks.slice(2);
  if (!files.length || !files.every((f) => SPEC_OR_GLOB_RE.test(f))) return null;
  const out = specsOf([`test:${group}`], scripts).filter((f) => SPEC_RE.test(f));
  return out.length ? out : null;
}

/** Expected seconds of one spec on a CI runner: the median WHOLE-RUN wall from
 *  the committed timings file when a CI bucket has MIN_SAMPLES of them (that is
 *  what a shard pays, and declared counts over-read loop- or skip-heavy specs:
 *  tlx-probes declares 17, runs 6); else declared tests × the per-test rate, as
 *  megaShardPlan. The committed file only: every reader of the plan must agree. */
export function expectedSec(file, db) {
  const samples = inBuckets(db?.specs?.[file]?.s, CI_BUCKETS);
  let best = null;
  for (const b of CI_BUCKETS) {
    const rows = samples.filter((x) => x[1] === b);
    if (rows.length >= MIN_SAMPLES && (!best || rows.length > best.length)) best = rows;
  }
  if (best) return Math.round(median(best.map((x) => x[2])));
  return Math.round((declaredTests(file) || 1) * specSecPerTest(file, db).sec);
}

/** The shard plan for a dispatch: `{ matrix: [{shard, total}…], shards?: [[unit…]…] }`
 *  where a unit is a spec path or `{ file, shard: "j/k" }`, a piece of one fat
 *  spec. Packed by time when the group is a plain file list: a spec expected
 *  to outlast the even share is cut into ceil(expected / share) native-shard
 *  pieces (at most MAX_PIECES, none under MIN_PIECE_SEC), then every unit goes longest-first onto the
 *  least-loaded shard (LPT; a piece avoids a shard already holding a sibling
 *  piece while it can). Ties on the path, so the plan is a pure function of
 *  the group and the timings file. Count mode otherwise. Never more shards
 *  than units. */
export function shardPlan(group, shards, scripts, db = loadDb(path.join(ROOT, TIMINGS_FILE))) {
  const p = planMatrix(group, shards, scripts);
  if (p.error) return p;
  const files = groupFiles(p.group, scripts);
  if (!files) return { group: p.group, mode: "count", matrix: Array.from({ length: p.shards }, (_, i) => ({ shard: i + 1, total: p.shards })) };
  const secs = new Map(files.map((f) => [f, expectedSec(f, db)]));
  const share = [...secs.values()].reduce((a, b) => a + b, 0) / p.shards;
  const units = [];
  for (const f of files) {
    const sec = secs.get(f);
    const k = sec > share * 1.25 && p.shards > 1
      ? Math.max(1, Math.min(MAX_PIECES, Math.ceil(sec / share), Math.floor(sec / MIN_PIECE_SEC))) : 1;
    if (k === 1) units.push({ f, sec, unit: f });
    else for (let j = 1; j <= k; j++) units.push({ f, sec: sec / k, unit: { file: f, shard: `${j}/${k}` } });
  }
  units.sort((a, b) => b.sec - a.sec || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0)
    || String(a.unit.shard || "").localeCompare(String(b.unit.shard || "")));
  const total = Math.max(1, Math.min(p.shards, units.length));
  const matrix = Array.from({ length: total }, (_, i) => ({ shard: i + 1, total }));
  const load = new Array(total).fill(0);
  const lists = Array.from({ length: total }, () => []);
  const holds = Array.from({ length: total }, () => new Set());
  for (const u of units) {
    let k = -1;
    for (let i = 0; i < total; i++) {
      if (typeof u.unit !== "string" && holds[i].has(u.f)) continue;
      if (k < 0 || load[i] < load[k]) k = i;
    }
    if (k < 0) { k = 0; for (let i = 1; i < total; i++) if (load[i] < load[k]) k = i; }
    load[k] += u.sec;
    lists[k].push(u.unit);
    holds[k].add(u.f);
  }
  return { group: p.group, mode: "time", matrix, shards: lists, load: load.map((x) => Math.round(x)) };
}

/** What one shard runs, from the workflow's env: `{ runs: [{cmd, args}…], mode }`,
 *  `{ empty: true }` for a packed shard with nothing to run, or `{ error }`. The
 *  plan is text from whoever dispatched, so every unit is checked against the
 *  group's own script before anything is spawned: the plain units run as one
 *  run-playwright invocation, each piece as its own (`file --shard=j/k`). */
export function runShardArgs({ group, plan, shard, total, workers, timeoutMs = 900000 }, scripts) {
  const g = String(group || "").trim();
  if (!browserGroups(scripts).includes(g)) return { error: `no browser group "test:${g}" in package.json` };
  const i = Number(shard), n = Number(total);
  if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 1 && n >= 1 && i <= n)) return { error: `bad shard ${shard}/${total}` };
  const w = parseWorkers(workers);
  if (w.error) return w;
  const flags = [`--timeout=${timeoutMs}`, ...(w.workers ? [`--workers=${w.workers}`] : [])];
  let parsed = null;
  if (plan != null && String(plan).trim() !== "") {
    try { parsed = JSON.parse(String(plan)); } catch { return { error: "plan is not JSON" }; }
  }
  if (!parsed || !Array.isArray(parsed.shards)) {
    return { runs: [{ cmd: "npm", args: ["run", `test:${g}`, "--", ...flags, `--shard=${i}/${n}`] }], mode: "count" };
  }
  const files = groupFiles(g, scripts);
  if (!files) return { error: `test:${g} is not a plain file list; a packed plan cannot drive it` };
  if (parsed.shards.length !== n) return { error: `plan has ${parsed.shards.length} shards, the matrix ${n}` };
  const mine = parsed.shards[i - 1];
  if (!Array.isArray(mine)) return { error: `shard ${i} has no list` };
  const plain = [], pieces = [];
  for (const u of mine) {
    if (typeof u === "string" && SPEC_RE.test(u) && files.includes(u)) { plain.push(u); continue; }
    const m = u && typeof u === "object" && typeof u.file === "string" && typeof u.shard === "string" ? PIECE_RE.exec(u.shard) : null;
    if (m && SPEC_RE.test(u.file) && files.includes(u.file) && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= MAX_PIECES) { pieces.push(u); continue; }
    return { error: `shard ${i} lists a unit outside test:${g}: ${JSON.stringify(u).slice(0, 80)}` };
  }
  if (!plain.length && !pieces.length) return { empty: true, mode: "time" };
  const runs = [];
  if (plain.length) runs.push({ cmd: "node", args: ["tools/ci/run-playwright.mjs", ...plain, ...flags] });
  for (const u of pieces) runs.push({ cmd: "node", args: ["tools/ci/run-playwright.mjs", u.file, ...flags, `--shard=${u.shard}`] });
  return { runs, mode: "time" };
}

/** A run of THIS group on THIS branch for THIS sha that makes a new dispatch
 *  pointless: live (queued / in progress) first, else the newest green one.
 *  14 of 100 dispatches on 2026-10-10..14 repeated a branch+group within an
 *  hour and the concurrency group cancelled the earlier run. Pure. */
export function liveRun(runs, { branch, group, sha }) {
  const mine = (runs || []).filter((r) => r.event === "workflow_dispatch" && r.head_branch === branch && r.head_sha === sha
    && String(r.display_title || r.name || "").includes(`browser group ${group} `))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const live = mine.find((r) => r.status === "queued" || r.status === "in_progress" || r.status === "waiting");
  if (live) return { run: live, kind: "live" };
  const green = mine.find((r) => r.status === "completed" && r.conclusion === "success");
  return green ? { run: green, kind: "green" } : null;
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
export const USAGE = `usage: node tools/ci/remote-group.mjs <group> [--shards N] [--gl llvmpipe|swiftshader] [--workers N] [--ref <branch>] [--no-wait] [--force] [--timeout <min>]
       node tools/ci/remote-group.mjs --plan          # GROUP=/SHARDS= env: print the shard plan JSON (what the dispatch sends)
       node tools/ci/remote-group.mjs --run-shard     # GROUP=/PLAN=/SHARD=/TOTAL=/WORKERS= env (the workflow's shard step)
       node tools/ci/remote-group.mjs --watch <run-id>
       node tools/ci/remote-group.mjs --help`;

async function main() {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  if (argv.includes("--plan")) {   // the plan the dispatch would send, for a human or a test
    const p = shardPlan(process.env.GROUP, process.env.SHARDS, scripts());
    if (p.error) { console.error("remote-group --plan: " + p.error); return 3; }
    console.log(JSON.stringify({ matrix: p.matrix, ...(p.shards ? { shards: p.shards } : {}) }));
    return 0;
  }
  if (argv.includes("--run-shard")) {   // the workflow's shard step
    const allScripts = scripts();
    const gl = process.env.GL || process.env.APEX_GL || "llvmpipe";
    const w = resolveWorkers(process.env.GROUP, gl, process.env.WORKERS, allScripts);
    if (w.error) { console.error("remote-group --run-shard: " + w.error); return 3; }
    const r = runShardArgs({ group: process.env.GROUP, plan: process.env.PLAN, shard: process.env.SHARD, total: process.env.TOTAL, workers: w.workers }, allScripts);
    if (r.error) { console.error("remote-group --run-shard: " + r.error); return 3; }
    if (r.empty) { say(`shard ${process.env.SHARD}/${process.env.TOTAL}: the plan gave it no specs (fewer specs than shards) — nothing to run`); return 0; }
    let code = 0;
    for (const u of r.runs) {   // every unit runs even after a red, so one shard reports all its failures
      say(`shard ${process.env.SHARD}/${process.env.TOTAL} (${r.mode}): ${u.cmd} ${u.args.join(" ")}`);
      const run = spawnSync(u.cmd, u.args, { cwd: ROOT, stdio: "inherit", env: process.env });
      const st = run.status == null ? 1 : run.status;
      if (st !== 0 && code === 0) code = st;
    }
    return code;
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
  const p = shardPlan(group, opt("--shards", "4"), scripts());
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
  // A live or green run of this group on this exact sha answers the question already.
  const sha = git("rev-parse", "--verify", "-q", `origin/${branch}`) || git("rev-parse", "HEAD");
  if (!argv.includes("--force")) {
    const r = api("GET", `actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=20`);
    const have = liveRun(r.json?.workflow_runs, { branch, group: p.group, sha });
    if (have?.kind === "live") {
      say(`${p.group} on ${branch} @${sha.slice(0, 9)} is already ${have.run.status} — watching run ${have.run.id} instead of dispatching again (--force to re-run)`);
      if (argv.includes("--no-wait")) { say(`watch: node tools/ci/remote-group.mjs --watch ${have.run.id}`); return 0; }
      return watch(have.run.id, { interval, deadline });
    }
    if (have?.kind === "green") { say(`= group passed — ${p.group} on ${branch} @${sha.slice(0, 9)} is already green: ${have.run.html_url} (--force to re-run)`); return 0; }
  }
  const since = Date.now();
  const plan = JSON.stringify({ matrix: p.matrix, ...(p.shards ? { shards: p.shards } : {}) });
  const d = api("POST", `actions/workflows/${WORKFLOW}/dispatches`, {
    ref: branch,
    // Always pass resolved workers (GL + group aware) so empty UI input still gets the plan default.
    inputs: { group: p.group, plan, gl, workers: w.workers },
  });
  if (d.error) { say(`= group unknown — dispatch failed: ${d.error}`); return 3; }
  let runId = d.json?.workflow_run_id || null;
  for (let tries = 0; !runId && tries < 20; tries++) {   // a 204 (older API behaviour): find it
    await sleep(3000);
    const r = api("GET", `actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=10`);
    runId = pickRun(r.json?.workflow_runs, { branch, group: p.group, sinceMs: since })?.id || null;
  }
  if (!runId) { say("= group unknown — dispatched, but no run appeared within 60 s; check the Actions tab"); return 3; }
  say(`dispatched ${p.group} on ${branch} (${p.matrix.length} shards by ${p.mode}${p.load ? `, expected s/shard ${p.load.join("/")}` : ""}, ${gl}, ${w.workers} workers) — run ${runId}`);
  if (argv.includes("--no-wait")) { say(`watch: node tools/ci/remote-group.mjs --watch ${runId}`); return 0; }
  return watch(runId, { interval, deadline });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
