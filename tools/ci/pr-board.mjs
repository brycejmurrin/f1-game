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
 * SUGGESTION, first match wins (AGENTS.md MERGE-COMMIT-ONLY, 2026-10-13):
 *   FOREIGN-ARM  auto-merge armed with a method other than MERGE (squash, rebase)
 *   SYNC         mergeable_state dirty (merge conflict with the deploy branch)
 *   FIX          ci.yml failed on the head, or the Structural guards check failed
 *   ARM          ready, not armed, Structural guards passed, ci succeeded with
 *                full-tier job evidence, no MERGE-HOLD, fewer than MAX_ARMED armed
 *   READY        draft, ci green, Structural guards passed, Plan closed
 *   NONE         armed (MERGE) and healthy
 *   WAIT         anything else: ci running, gate pending/absent, a
 *                MERGE-HOLD, MAX_ARMED already armed, Plan items open
 * The cap (ready-full-cap.mjs, MAX_LIVE = 8) is REPORTED, never a WAIT: since
 * 2026-10-16 (CI/CD review #2333 finding 7) GitHub's own `queue: max` lanes
 * bound the browser legs, and the cap sat at 13/3 while 12 ready PRs were open.
 * Each ARM counts toward MAX_ARMED (2 repo-wide, any method). The
 * PLAN column is ready-gate.mjs's planVerdict of the PR body: done/items, or "-"
 * for a body with no ## Plan checklist (AGENTS.md rule 12).
 * FLEET is the worker's report (agent-fleet role-pr-owner.md §Monitoring and
 * reporting): the body's `fleet-status: <state> | <reason> | <utc>` line,
 * or the newest PR comment starting `fleet-status:` or `@orchestrator
 * NEEDS-DECISION:` when it is newer than the body line; state, age, reason.
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
import { guardsVerdict, planVerdict } from "./ready-gate.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { needsSync, verdictLine } from "./needs-sync.mjs";

export { DEPLOY, MAX_LIVE };
/** At most this many PRs armed repo-wide (AGENTS.md §Concurrent PRs, Merge Desk's hard gate). */
export const MAX_ARMED = 2;
/** The one merge method allowed (AGENTS.md MERGE-COMMIT-ONLY). */
const MERGE_METHOD = "merge";

/** A PR-body line that STARTS with `MERGE-HOLD:`, outside an HTML comment, is
 *  the one veto on arming or merging (AGENTS.md); a mid-sentence mention is not. */
export function hasMergeHold(body) {
  return /^MERGE-HOLD:/m.test(String(body || "").replace(/<!--[\s\S]*?-->/g, ""));
}
/** One `fleet-status: <state> | <reason> | <utc>` line (body or comment), outside
 *  HTML comments; the last one in the text wins. null when absent. */
export function parseFleetStatus(text) {
  const lines = String(text || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  let out = null;
  for (const l of lines) {
    const m = /^\s*fleet-status:\s*([^|]+?)\s*(?:\|\s*([^|]*?)\s*)?(?:\|\s*(\S[^|]*?)\s*)?$/.exec(l);
    if (!m || m[1].startsWith("<")) continue; // the template placeholder is not a report
    const at = Date.parse(m[3] || "");
    out = { state: m[1], reason: m[2] || "", at: Number.isFinite(at) ? new Date(at).toISOString() : null };
  }
  return out;
}

/** The fleet report for one PR: the body line, replaced by the newest comment
 *  that starts `fleet-status:` or `@orchestrator NEEDS-DECISION:` when that
 *  comment is newer (a body line with no time loses to any such comment). */
export function fleetStatus(body, comments = []) {
  const fromBody = parseFleetStatus(body);
  let best = fromBody ? { ...fromBody, source: "body" } : null;
  for (const c of comments || []) {
    const text = String(c?.body || "").trimStart();
    const at = c?.created_at ? new Date(c.created_at).toISOString() : null;
    let s = null;
    const ask = /^@orchestrator NEEDS-DECISION:\s*(.*)/.exec(text);
    if (ask) s = { state: "needs-decision", reason: ask[1].split(/\r?\n/)[0].trim(), at };
    else if (/^fleet-status:/.test(text)) {
      const p = parseFleetStatus(text.split(/\r?\n/)[0]);
      if (p) s = { ...p, at };
    }
    if (!s || !at) continue;
    if (!best || !best.at || Date.parse(at) > Date.parse(best.at)) best = { ...s, source: "comment" };
  }
  return best;
}

/** "45m", "3h", "2d" since `at` (ISO), or "?" without a time. */
export function ageLabel(at, now = Date.now()) {
  const ms = now - Date.parse(at || "");
  if (!Number.isFinite(ms)) return "?";
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

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
  // A label-noise run (#2184: ci-watch.mjs labelNoiseRun) skips every job and
  // concludes success; as the newest run it would read a red head as green.
  const list = (runs || []).filter((r) => r && (r.path ? r.path.endsWith("/ci.yml") : true)
    && !/^CI ignored: label /.test(String(r.display_title || "")));
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
 * @param {{ room?: number, armed?: number, cap?: { cap:number, count:number } }} [ctx]
 *   ctx.armed: PRs armed repo-wide so far (ARM waits at MAX_ARMED).
 * @returns {{ action: string, why: string }}
 */
export function decide(row, ctx = {}) {
  const room = ctx.room ?? (ctx.cap ? Math.max(0, ctx.cap.cap - ctx.cap.count) : 0);
  const method = String(row.mergeMethod || "").toLowerCase();
  if (row.armed && method !== MERGE_METHOD) {
    return { action: "FOREIGN-ARM", why: `auto-merge armed with ${method || "an unknown method"}; only MERGE is allowed` };
  }
  if (row.mergeableState === "dirty") return { action: "SYNC", why: "merge conflict with the deploy branch" };
  if (row.ci === "failure") return { action: "FIX", why: "ci.yml failed on the head" };
  if (row.gate === "failed") return { action: "FIX", why: "Structural guards failed on the head" };
  const gateOk = row.gate === "passed";
  if (!row.draft) {
    if (row.armed) return { action: "NONE", why: "armed (MERGE) and healthy" };
    if (row.ci !== "success") return { action: "WAIT", why: `ready, ci ${row.ci}: the full tier is not green on the head` };
    if (row.fullTier !== true) return { action: "WAIT", why: "ready, no successful full-tier job evidence on this CI run" };
    if (gateOk && row.hold) return { action: "WAIT", why: "ready and green, but the body carries MERGE-HOLD:" };
    if (gateOk && (ctx.armed ?? 0) >= MAX_ARMED) return { action: "WAIT", why: `ready and green, but ${MAX_ARMED} PRs are already armed` };
    if (gateOk) return { action: "ARM", why: "ready, Structural guards passed, ci succeeded" };
    return { action: "WAIT", why: `ready, Structural guards ${row.gate}` };
  }
  if (row.ci === "queued" || row.ci === "in_progress") return { action: "WAIT", why: `draft, ci ${row.ci}` };
  if (!gateOk) return { action: "WAIT", why: `draft, Structural guards ${row.gate}` };
  if (row.ci !== "success") return { action: "WAIT", why: `draft, ci ${row.ci}: the fast tier is not green on the head` };
  if (row.plan && row.plan.state === "open") {
    return { action: "WAIT", why: `draft is green but ${row.plan.open.length} Plan item(s) are open (ready-gate refuses)` };
  }
  // `room` is informational since 2026-10-16: the lanes in ci.yml bound the legs.
  return { action: "READY", why: `draft, ci green, Structural guards passed${room < 1 ? " (full-tier cap reported full; lanes bound the legs)" : ""}` };
}

/** Just the verb. */
export const suggest = (row, ctx) => decide(row, ctx).action;

/** Required full-tier jobs must all have run successfully in the selected run. */
export function fullTierPassed(jobs = []) {
  const required = ["CI", "Selected specs (verdict)", "Per-circuit geometry sweeps"];
  const passed = (rows) => rows.length > 0 && rows.every((j) => j.conclusion === "success");
  return required.every((name) => passed(jobs.filter((j) => j?.name === name)))
    && passed(jobs.filter((j) => String(j?.name || "").startsWith("Smoke (page boots, __apex responds)")));
}

/**
 * Rows from collected facts. Pure: inject what the API returned.
 * @param {Array<{ pr: object, runs?: object[], jobs?: object[], jobsRunId?: number, checkRuns?: object[] }>} items
 *   pr = the pulls/{n} object (needs number, title, draft, head.sha/ref, auto_merge, mergeable_state)
 * @param {{ cap?: { cap:number, count:number, ok?:boolean }, armed?: number }} [opts]
 *   armed = repository-wide initial count, including siblings omitted from items.
 */
export function evaluate(items, opts = {}) {
  const cap = opts.cap || { cap: MAX_LIVE, count: 0, ok: true };
  const ctx = { cap, room: Math.max(0, cap.cap - cap.count),
    armed: opts.armed ?? (items || []).filter((it) => it.pr && it.pr.auto_merge).length };
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
      fullTier: ci.state === "success" && it.jobsRunId === ci.runId && fullTierPassed(it.jobs),
      failing,
      gate: gate.state,
      gateEvidence: gate.evidence,
      plan: planVerdict(pr.body),
      hold: hasMergeHold(pr.body),
      fleet: fleetStatus(pr.body, it.comments),
      url: pr.html_url || "",
    };
    const d = decide(row, ctx);
    if (d.action === "READY") ctx.room -= 1;
    if (d.action === "ARM") ctx.armed += 1;
    rows.push({ ...row, suggest: d.action, why: d.why });
  }
  const room = Math.max(0, cap.cap - cap.count);
  return { rows, cap: { ok: room > 0, count: cap.count, cap: cap.cap, room } };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The table plus a one-line footer. */
export function render(result, { capLine: line, now = Date.now() } = {}) {
  const { rows, cap } = result;
  const head = ["PR", "TITLE", "STATE", "HEAD", "MERGEABLE", "AUTO-MERGE", "CI", "FAILING JOBS", "GATE", "PLAN", "FLEET", "SUGGEST"];
  const plan = (p) => (!p || p.state === "none" ? "-" : `${p.items - p.open.length}/${p.items}`);
  const fleet = (f) => (!f ? "-" : clip(`${f.state} ${ageLabel(f.at, now)}${f.reason ? `: ${f.reason}` : ""}`, 40));
  const body = rows.map((r) => [
    `#${r.number}`, clip(r.title, 40), r.draft ? "draft" : "ready", r.sha || "-",
    r.mergeableState || "-", r.armed ? (r.mergeMethod || "armed") : "-", r.ci,
    clip(r.failing.join(", "), 36) || "-", r.gate, plan(r.plan), fleet(r.fleet), r.hold ? `${r.suggest} (HOLD)` : r.suggest,
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

  // --pr limits expensive detail/CI reads, not the repository-wide armed cap.
  // The list includes auto_merge metadata; no sibling detail request is needed.
  // https://docs.github.com/en/rest/pulls/pulls#list-pull-requests
  const armedByPr = new Map();
  for (let page = 1; page <= 5; page++) {
    const r = request(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}`);
    if (r.error) return fail(r.error);
    const batch = Array.isArray(r.json) ? r.json : [];
    for (const pr of batch) armedByPr.set(pr.number, !!pr.auto_merge);
    if (batch.length < 100) break;
  }
  const nums = opts.only != null ? [opts.only] : [...armedByPr.keys()];
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
    armedByPr.set(n, !!pr.auto_merge);   // refresh selected rows after discovery
    const runsR = request(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`);
    if (runsR.error) return fail(`PR #${n} runs: ${runsR.error}`);
    const runs = runsR.json?.workflow_runs || [];
    const checks = request(`commits/${sha}/check-runs?per_page=100`);
    if (checks.error) return fail(`PR #${n} check-runs: ${checks.error}`);
    let jobs = [];
    const ci = ciState(runs);
    if (ci.runId && (ci.state === "failure" || ci.state === "cancelled"
        || (ci.state === "success" && !pr.draft && !pr.auto_merge))) {
      for (let page = 1; ; page++) {
        const j = request(`actions/runs/${ci.runId}/jobs?per_page=100&page=${page}`);
        if (j.error) return fail(`PR #${n} jobs: ${j.error}`);
        const batch = j.json?.jobs || [];
        jobs.push(...batch);
        if (batch.length < 100) break;
      }
    }
    // The newest issue comments (ascending order: the last page holds them) for
    // the FLEET column; advisory, so a failed read leaves the body line alone.
    // https://docs.github.com/en/rest/issues/comments#list-issue-comments
    let comments = [];
    if (pr.comments > 0) {
      const c = request(`issues/${n}/comments?per_page=100&page=${Math.ceil(pr.comments / 100)}`);
      if (!c.error && Array.isArray(c.json)) comments = c.json;
    }
    items.push({ pr, runs, jobs, jobsRunId: ci.runId, checkRuns: checks.json?.check_runs || [], comments });
  }
  const result = evaluate(items, { cap: capV, armed: [...armedByPr.values()].filter(Boolean).length });
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
the worker's fleet-status report (state, age, reason), and a SUGGESTION (ARM READY SYNC FIX FOREIGN-ARM WAIT NONE) for a CI Watch session.
Each SYNC/FIX row also prints needs-sync.mjs's verdict (= sync needed: conflict|stale-red|no; git fetch, no writes).
Exit 0 printed, 2 bad args, 3 API/token.`);
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
  // needs-sync.mjs runs FIRST for every row the board would send to SYNC or FIX
  // (a red may be stale, a "dirty" may be generated-file-only): one verdict line each.
  const sync = {};
  for (const r of v.rows) if (r.suggest === "SYNC" || r.suggest === "FIX") sync[r.number] = needsSync(r.branch);
  const syncLine = (n) => (sync[n].ok ? `${verdictLine(sync[n])} (${sync[n].why})` : `= sync needed: unknown (${sync[n].error})`);
  if (args.json) console.log(JSON.stringify({ rows: v.rows.map((r) => (sync[r.number] ? { ...r, sync: sync[r.number] } : r)), cap: v.cap, line: v.capLine }, null, 2));
  else {
    console.log(render(v, { capLine: v.capLine }));
    for (const n of Object.keys(sync)) console.log(`#${n} ${syncLine(n)}`);
  }
}
