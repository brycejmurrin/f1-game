#!/usr/bin/env node
/**
 * @doc One read-only table of every open PR into the deploy branch, with a SUGGESTION per row for a Claude-run CI Watch.
 * @section runner
 * @skill ci-watch
 *
 * CI Watch (AGENTS.md §Concurrent PRs) needs five facts per PR before it may act:
 * draft or ready, mergeable_state, whether auto-merge is armed and with which
 * method, the newest `ci.yml` state on the head sha, and the ready-gate verdict
 * (the `Structural guards` check-run, read through ready-gate.mjs's own
 * guardsVerdict). This gathers them with GET requests only and prints one table;
 * the `ci-watch` skill turns each SUGGESTION into a GitHub MCP call. The tool
 * itself never writes: it has no way to issue anything but a GET.
 *
 * SUGGESTION, first match wins:
 *   FOREIGN-ARM  auto-merge armed with a method other than squash
 *   SYNC         mergeable_state dirty (merge conflict with the deploy branch)
 *   FIX          ci.yml failed on the head, or the Structural guards check failed
 *   ARM          ready, not armed, Structural guards passed, ci not failed
 *   READY        draft, ci green, Structural guards passed, a full-tier slot is free
 *   NONE         armed (squash) and healthy
 *   WAIT         anything else: ci running, gate pending/absent, cap full
 * The cap is ready-full-cap.mjs's own measure (MAX_LIVE = 3); each READY in one
 * sweep consumes a slot, so a board never suggests more flips than the cap has room.
 *
 *   node tools/ci/pr-board.mjs              # the table
 *   node tools/ci/pr-board.mjs --json       # rows + cap, for the skill
 *   node tools/ci/pr-board.mjs --pr 1234    # one PR (still measures the cap)
 *
 * Exit: 0 printed, 2 bad args (or --pr is not open into the deploy branch), 3 no token / API error.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, measure as capMeasure, reportLine as capLine, DEPLOY, MAX_LIVE } from "./ready-full-cap.mjs";
import { guardsVerdict } from "./ready-gate.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";

export { DEPLOY, MAX_LIVE };
export const SUGGESTIONS = ["ARM", "READY", "SYNC", "FIX", "FOREIGN-ARM", "WAIT", "NONE"];
const LIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
const BAD_JOB = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * ci.yml state on one head sha from its runs (the API list for `head_sha`).
 * A live run wins over any finished one (a rerun, or the draft/ready dedupe whose
 * cancelled sibling is not a red); otherwise the newest run's conclusion decides.
 * @returns {{ state: "none"|"queued"|"in_progress"|"success"|"failure"|"cancelled", runId: number|null }}
 */
export function ciState(runs) {
  const list = (runs || []).filter((r) => r && (r.path ? r.path.endsWith("/ci.yml") : true));
  if (!list.length) return { state: "none", runId: null };
  const byId = (a, b) => (b.id || 0) - (a.id || 0);
  const live = list.filter((r) => LIVE.has(r.status)).sort(byId);
  if (live.length) {
    const running = live.find((r) => r.status === "in_progress");
    return { state: running ? "in_progress" : "queued", runId: (running || live[0]).id ?? null };
  }
  const newest = [...list].sort(byId)[0];
  const c = newest.conclusion;
  const state = c === "success" ? "success"
    : BAD_JOB.has(c) ? "failure"
    : c === "cancelled" ? "cancelled"
    : "none"; // skipped / neutral / null: not evidence of green
  return { state, runId: newest.id ?? null };
}

/**
 * The decision for one row. Pure. `ctx.room` is how many more full-tier slots a
 * READY may take (default: ctx.cap.cap - ctx.cap.count).
 * @param {{ draft:boolean, armed:boolean, mergeMethod?:string|null, mergeableState?:string|null, ci:string, gate:string }} row
 * @param {{ room?: number, cap?: { cap:number, count:number } }} [ctx]
 * @returns {{ action: string, why: string }}
 */
export function decide(row, ctx = {}) {
  const room = ctx.room ?? (ctx.cap ? Math.max(0, ctx.cap.cap - ctx.cap.count) : 0);
  const method = String(row.mergeMethod || "").toLowerCase();
  if (row.armed && method !== "squash") {
    return { action: "FOREIGN-ARM", why: `auto-merge armed with ${method || "an unknown method"}; only squash is allowed` };
  }
  if (row.mergeableState === "dirty") return { action: "SYNC", why: "merge conflict with the deploy branch" };
  if (row.ci === "failure") return { action: "FIX", why: "ci.yml failed on the head" };
  if (row.gate === "failed") return { action: "FIX", why: "Structural guards failed on the head" };
  const gateOk = row.gate === "passed";
  if (!row.draft) {
    if (row.armed) return { action: "NONE", why: "armed (squash) and healthy" };
    if (gateOk) return { action: "ARM", why: "ready, Structural guards passed, ci not failed" };
    return { action: "WAIT", why: `ready, Structural guards ${row.gate}` };
  }
  if (row.ci === "queued" || row.ci === "in_progress") return { action: "WAIT", why: `draft, ci ${row.ci}` };
  if (!gateOk) return { action: "WAIT", why: `draft, Structural guards ${row.gate}` };
  if (row.ci !== "success") return { action: "WAIT", why: `draft, ci ${row.ci}: the fast tier is not green on the head` };
  if (room < 1) return { action: "WAIT", why: "draft is green but the full-tier cap is full" };
  return { action: "READY", why: "draft, ci green, Structural guards passed, a full-tier slot is free" };
}

/** Just the verb. */
export const suggest = (row, ctx) => decide(row, ctx).action;

/**
 * Rows from collected facts. Pure: inject what the API returned.
 * @param {Array<{ pr: object, runs?: object[], jobs?: object[], checkRuns?: object[] }>} items
 *   pr = the pulls/{n} object (needs number, title, draft, head.sha/ref, auto_merge, mergeable_state)
 * @param {{ cap?: { cap:number, count:number, ok?:boolean } }} [opts]
 */
export function evaluate(items, opts = {}) {
  const cap = opts.cap || { cap: MAX_LIVE, count: 0, ok: true };
  const ctx = { cap, room: Math.max(0, cap.cap - cap.count) };
  const rows = [];
  for (const it of [...(items || [])].sort((a, b) => a.pr.number - b.pr.number)) {
    const pr = it.pr;
    const ci = ciState(it.runs);
    const gate = guardsVerdict(it.checkRuns || []);
    const failing = [...new Set((it.jobs || []).filter((j) => BAD_JOB.has(j.conclusion)).map((j) => j.name))].sort();
    const row = {
      number: pr.number,
      title: pr.title || "",
      branch: pr.head?.ref || "",
      draft: pr.draft === true,
      sha: pr.head?.sha || "",
      mergeableState: pr.mergeable_state ?? null,
      armed: !!pr.auto_merge,
      mergeMethod: pr.auto_merge?.merge_method ?? null,
      ci: ci.state,
      ciRunId: ci.runId,
      failing,
      gate: gate.state,
      gateEvidence: gate.evidence,
      url: pr.html_url || "",
    };
    const d = decide(row, ctx);
    if (d.action === "READY") ctx.room -= 1;
    rows.push({ ...row, suggest: d.action, why: d.why });
  }
  const room = Math.max(0, cap.cap - cap.count);
  return { rows, cap: { ok: room > 0, count: cap.count, cap: cap.cap, room } };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The table plus a one-line footer. */
export function render(result, { capLine: line } = {}) {
  const { rows, cap } = result;
  const head = ["PR", "TITLE", "STATE", "HEAD", "MERGEABLE", "AUTO-MERGE", "CI", "FAILING JOBS", "GATE", "SUGGEST"];
  const body = rows.map((r) => [
    `#${r.number}`, clip(r.title, 40), r.draft ? "draft" : "ready", r.sha.slice(0, 7) || "-",
    r.mergeableState || "-", r.armed ? (r.mergeMethod || "armed") : "-", r.ci,
    clip(r.failing.join(", "), 36) || "-", r.gate, r.suggest,
  ]);
  const all = [head, ...body];
  const w = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const fmt = (row) => row.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd();
  const out = rows.length ? all.map(fmt) : ["no open PRs into " + DEPLOY];
  out.push(`pr-board: ${rows.length} open PR(s); ${line || `${cap.count}/${cap.cap} ready full-tier live`}`);
  return out.join("\n");
}

/**
 * Gather every open PR into the deploy branch and evaluate. GET requests only.
 * Injectable `request` (a `pathQs` -> `{json}|{error}` function) for tests; the
 * default is ready-full-cap's api(), which sends a plain curl GET.
 * @param {{ request?: typeof api, run?: Function, env?: object, gh?: Function, only?: number|null, cap?: number }} [opts]
 */
export function measure(opts = {}) {
  const request = opts.request || ((p) => api(p, { run: opts.run, env: opts.env, gh: opts.gh }));
  const fail = (error) => ({ ok: false, error, rows: [], cap: null });
  const capV = capMeasure({ request, cap: opts.cap });
  if (capV.error) return fail(capV.error);

  let nums;
  if (opts.only != null) {
    nums = [opts.only];
  } else {
    nums = [];
    for (let page = 1; page <= 5; page++) {
      const r = request(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`);
      if (r.error) return fail(r.error);
      const batch = Array.isArray(r.json) ? r.json : [];
      nums.push(...batch.map((p) => p.number));
      if (batch.length < 100) break;
    }
  }
  const items = [];
  for (const n of nums) {
    const one = request(`pulls/${n}`);
    if (one.error) return fail(`PR #${n}: ${one.error}`);
    const pr = one.json || {};
    if (opts.only != null && (pr.state !== "open" || pr.base?.ref !== DEPLOY)) {
      return { ok: false, badArgs: true, error: `PR #${n} is not open into ${DEPLOY}`, rows: [], cap: null };
    }
    const sha = pr.head?.sha;
    if (!sha) return fail(`PR #${n}: no head sha`);
    const runsR = request(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`);
    if (runsR.error) return fail(`PR #${n} runs: ${runsR.error}`);
    const runs = runsR.json?.workflow_runs || [];
    const checks = request(`commits/${sha}/check-runs?per_page=100`);
    if (checks.error) return fail(`PR #${n} check-runs: ${checks.error}`);
    let jobs = [];
    const ci = ciState(runs);
    if ((ci.state === "failure" || ci.state === "cancelled") && ci.runId) {
      const j = request(`actions/runs/${ci.runId}/jobs?per_page=100`);
      if (j.error) return fail(`PR #${n} jobs: ${j.error}`);
      jobs = j.json?.jobs || [];
    }
    items.push({ pr, runs, jobs, checkRuns: checks.json?.check_runs || [] });
  }
  const result = evaluate(items, { cap: capV });
  return { ok: true, ...result, capLine: capLine(capV) };
}

function parseArgs(argv) {
  const out = { json: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--pr") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: `--pr needs a positive integer (got ${argv[i]})` };
      out.only = n;
    } else return { error: `unknown arg: ${a}` };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/pr-board.mjs [--json] [--pr <n>]

Read-only board of every open PR into ${DEPLOY}: draft/ready, mergeable_state,
auto-merge (method), ci.yml state on the head, failing jobs, ready-gate verdict,
and a SUGGESTION (ARM READY SYNC FIX FOREIGN-ARM WAIT NONE) for a CI Watch session.
GET requests only. Exit 0 printed, 2 bad args, 3 API/token.`);
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`pr-board: ${args.error}`);
    process.exit(2);
  }
  const v = measure({ only: args.only });
  if (!v.ok) {
    console.error(`pr-board: ${v.error}`);
    process.exit(v.badArgs ? 2 : 3);
  }
  if (args.json) console.log(JSON.stringify({ rows: v.rows, cap: v.cap, line: v.capLine }, null, 2));
  else console.log(render(v, { capLine: v.capLine }));
}
