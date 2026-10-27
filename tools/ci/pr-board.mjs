#!/usr/bin/env node
/**
 * @doc One read-only table of every open PR into the deploy branch, with a SUGGESTION per row for a Claude-run CI Watch.
 * @section runner
 * @skill steward
 *
 * CI Watch (AGENTS.md §Coordination) needs five facts per PR before it may act:
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
 *   ARM          ready, not armed, Structural guards passed, ci.yml completed
 *                with success on the head plus full-tier job evidence, no
 *                MERGE-HOLD, Plan closed, fewer than MAX_ARMED armed
 *   READY        draft, ci.yml completed+success, Structural guards passed,
 *                no MERGE-HOLD, Plan closed
 *   NONE         armed (MERGE) and healthy
 *   WAIT         anything else: ci queued/running/absent, gate pending/absent, a
 *                MERGE-HOLD, MAX_ARMED already armed, Plan items open
 * ARM and READY never fire on a row ready-gate.mjs --pr would refuse
 * (plan-open), nor on a MERGE-HOLD: line (#2737 / #2789, 2026-10-18).
 * There is no ready-PR cap: since 2026-10-16 (CI/CD review #2333 finding 7)
 * GitHub's own `queue: max` lanes bound the browser legs; the cap tool was
 * deleted in #3013.
 * Each ARM counts toward MAX_ARMED (2 repo-wide, any method). The
 * PLAN column is ready-gate.mjs's planVerdict of the PR body: done/items, or "-"
 * for a body with no ## Plan checklist (AGENTS.md rule 12).
 * FLEET reads the retired (2026-10-27) worker report on PRs opened before the
 * redesign: the body's `fleet-status: <state> | <reason> | <utc>` line,
 * or the newest PR comment starting `fleet-status:` or `@orchestrator
 * NEEDS-DECISION:` when it is newer than the body line; state, age, reason.
 * LANE is the PR's `lane:<host>` label and OWNER the `owner:` line of the body's ```handoff block (docs/WORKERS.md).
 * token in the block's title (ready-gate.mjs fleetIdentity; no extra API call).
 *
 *   node tools/ci/pr-board.mjs              # the table
 *   node tools/ci/pr-board.mjs --json       # rows, for the skill
 *   node tools/ci/pr-board.mjs --pr 1234    # one PR
 *   node tools/ci/pr-board.mjs --alarm      # only the stall alarm: READY > 12 h, green, no hold, no push
 *
 * Exit: 0 printed (--alarm: none stalled), 1 --alarm found a stalled PR, 2 bad args (or --pr is not open
 * into the deploy branch), 3 no token / API error.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY } from "./github-api.mjs";
import { createSnapshot, runsByHead } from "../lib/pr-snapshot.mjs";
import { guardsVerdict, planVerdict } from "./ready-gate.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { needsSync, verdictLine } from "./needs-sync.mjs";

export { DEPLOY };
/** At most this many PRs armed repo-wide (AGENTS.md §Coordination, Merge Desk's hard gate). */
export const MAX_ARMED = 2;
/** The one merge method allowed (AGENTS.md MERGE-COMMIT-ONLY). */
const MERGE_METHOD = "merge";

/** A PR-body line that STARTS with `MERGE-HOLD:`, outside an HTML comment, is
 *  the one veto on arming or merging (AGENTS.md); a mid-sentence mention is not. */
export function hasMergeHold(body) {
  return /^MERGE-HOLD:/m.test(String(body || "").replace(/<!--[\s\S]*?-->/g, ""));
}
/** The `lane:<host>` label of a PR, else "-". Pure. */
export function laneOf(pr) {
  const l = (pr.labels || []).map((x) => (typeof x === "string" ? x : x.name)).find((n) => /^lane:/.test(n || ""));
  return l ? l.slice(5) : "-";
}
/** The `owner:` line of the body's ```handoff block (docs/WORKERS.md), else "-". Pure. */
export function handoffOwner(body) {
  const m = /```handoff\n([\s\S]*?)```/.exec(String(body || ""));
  const line = m && /^owner:\s*(.+)$/m.exec(m[1]);
  return line ? line[1].trim() : "-";
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
    && !/^CI ignored: /.test(String(r.display_title || "")));
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

/** ready-gate.mjs's planVerdict says open: the same rule `ready-gate --pr` exits 1 on. */
const planOpen = (row) => !!(row.plan && row.plan.state === "open");

/**
 * The decision for one row. Pure.
 * @param {{ draft:boolean, armed:boolean, mergeMethod?:string|null, mergeableState?:string|null, ci:string, gate:string }} row
 * @param {{ armed?: number }} [ctx]
 *   ctx.armed: PRs armed repo-wide so far (ARM waits at MAX_ARMED).
 * @returns {{ action: string, why: string }}
 */
export function decide(row, ctx = {}) {
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
    if (row.hold) return { action: "WAIT", why: "ready and green, but the body carries MERGE-HOLD: (the one veto)" };
    if (planOpen(row)) return { action: "WAIT", why: `ready and green, but ${row.plan.open.length} Plan item(s) are open (ready-gate exits 1: plan-open)` };
    if (gateOk && (ctx.armed ?? 0) >= MAX_ARMED) return { action: "WAIT", why: `ready and green, but ${MAX_ARMED} PRs are already armed` };
    if (gateOk) return { action: "ARM", why: "ready, Structural guards passed, ci succeeded" };
    return { action: "WAIT", why: `ready, Structural guards ${row.gate}` };
  }
  if (row.ci === "queued" || row.ci === "in_progress") return { action: "WAIT", why: `draft, ci ${row.ci}` };
  if (!gateOk) return { action: "WAIT", why: `draft, Structural guards ${row.gate}` };
  if (row.ci !== "success") return { action: "WAIT", why: `draft, ci ${row.ci}: the fast tier is not green on the head` };
  if (row.hold) return { action: "WAIT", why: "draft is green, but the body carries MERGE-HOLD: (the one veto)" };
  if (planOpen(row)) {
    return { action: "WAIT", why: `draft is green but ${row.plan.open.length} Plan item(s) are open (ready-gate refuses)` };
  }
  return { action: "READY", why: `draft, ci green, Structural guards passed` };
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
 * @param {{ armed?: number }} [opts]
 *   armed = repository-wide initial count, including siblings omitted from items.
 */
export function evaluate(items, opts = {}) {
  const ctx = {
    armed: opts.armed ?? (items || []).filter((it) => it.pr && it.pr.auto_merge).length };
  const rows = [];
  for (const it of [...(items || [])].sort((a, b) => a.pr.number - b.pr.number)) {
    const pr = it.pr;
    const ci = ciState(it.runs);
    const gate = guardsVerdict(it.checkRuns || []);
    const failing = [...new Set((it.jobs || []).filter((j) => BAD_JOB.has(j.conclusion)).map((j) => j.name))].sort();
    const row = {
      number: pr.number,
      lane: laneOf(pr),
      title: pr.title || "",
      branch: pr.head?.ref || "",
      draft: pr.draft === true,
      sha: pr.head?.sha || "",
      mergeableState: pr.mergeable_state ?? null,
      armed: !!pr.auto_merge,
      mergeMethod: pr.auto_merge?.merge_method ?? null,
      ci: ci.state,
      ciRunId: ci.runId,
      ciAt: (it.runs || []).find((r) => r && r.id === ci.runId)?.created_at || null,
      fullTier: ci.state === "success" && it.jobsRunId === ci.runId && fullTierPassed(it.jobs),
      failing,
      gate: gate.state,
      gateEvidence: gate.evidence,
      plan: planVerdict(pr.body),
      hold: hasMergeHold(pr.body) || (pr.labels || []).some((l) => (typeof l === "string" ? l : l.name) === "hold"),
      owner: handoffOwner(pr.body),
      url: pr.html_url || "",
    };
    const d = decide(row, ctx);
    if (d.action === "ARM") ctx.armed += 1;
    rows.push({ ...row, suggest: d.action, why: d.why });
  }
  return { rows };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The table plus a one-line footer. */
export function render(result, { now = Date.now() } = {}) {
  const { rows } = result;
  const head = ["PR", "LANE", "OWNER", "TITLE", "STATE", "HEAD", "MERGEABLE", "AUTO-MERGE", "CI", "FAILING JOBS", "GATE", "PLAN", "SUGGEST"];
  const plan = (p) => (!p || p.state === "none" ? "-" : `${p.items - p.open.length}/${p.items}`);
  const body = rows.map((r) => [
    `#${r.number}`, r.lane || "-", clip(r.owner || "-", 18), clip(r.title, 40), r.draft ? "draft" : "ready", r.sha || "-",
    r.mergeableState || "-", r.armed ? (r.mergeMethod || "armed") : "-", r.ci,
    clip(r.failing.join(", "), 36) || "-", r.gate, plan(r.plan), r.hold ? `${r.suggest} (HOLD)` : r.suggest,
  ]);
  const all = [head, ...body];
  const w = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const fmt = (row) => row.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd();
  const out = rows.length ? all.map(fmt) : ["no open PRs into " + DEPLOY];
  out.push(`pr-board: ${rows.length} open PR(s)`);
  return out.join("\n");
}

/**
 * Gather every open PR into the deploy branch and evaluate. GET requests only,
 * through tools/lib/pr-snapshot.mjs (conditional GETs: a 304 on an unchanged
 * PR is free against the rate limit). Injectable `request` (a `pathQs` ->
 * `{json}|{error}` function) for tests.
 *
 * REST budget at N open PRs (request sites, 2026-10-26): 1 list page + 1
 * recent-ci.yml-runs page + N pulls/{n} + N check-runs, plus a per-head runs
 * read only for heads absent from the recent page, jobs for red/ready-green
 * heads, and the last comment page for PRs with comments. Before: 1 + 3N plus
 * the same extras, every one unconditional.
 * @param {{ request?: Function, run?: Function, env?: object, gh?: Function, only?: number|null, snapshot?: ReturnType<typeof createSnapshot> }} [opts]
 */
export function measure(opts = {}) {
  const snap = opts.snapshot || createSnapshot({ request: opts.request, run: opts.run, env: opts.env, gh: opts.gh });
  const fail = (error) => ({ ok: false, error, rows: [] });

  // --pr limits expensive detail/CI reads, not the repository-wide armed cap.
  // The list includes auto_merge metadata; no sibling detail request is needed.
  // https://docs.github.com/en/rest/pulls/pulls#list-pull-requests
  const list = snap.openPrs();
  if (list.error) return fail(list.error);
  const armedByPr = new Map(list.json.map((pr) => [pr.number, !!pr.auto_merge]));
  const nums = opts.only != null ? [opts.only] : [...armedByPr.keys()];
  // One page of the newest ci.yml runs answers most heads (advisory: a failed
  // or empty page only means every head is read on its own). A single --pr
  // read skips it: one per-head call is cheaper than a 100-run page.
  const recent = opts.only == null && nums.length > 1 ? snap.recentCiRuns() : { json: null };
  const byHead = runsByHead(recent.error ? [] : recent.json?.workflow_runs);
  const items = [];
  for (const n of nums) {
    const one = snap.pr(n);
    if (one.error) return fail(`PR #${n}: ${one.error}`);
    const pr = one.json || {};
    if (opts.only != null && (pr.state !== "open" || pr.base?.ref !== DEPLOY)) {
      return { ok: false, badArgs: true, error: `PR #${n} is not open into ${DEPLOY}`, rows: [] };
    }
    const sha = pr.head?.sha;
    if (!sha) return fail(`PR #${n}: no head sha`);
    armedByPr.set(n, !!pr.auto_merge);   // refresh selected rows after discovery
    let runs = byHead.get(sha);
    if (!runs) {
      const runsR = snap.ciRuns(sha);
      if (runsR.error) return fail(`PR #${n} runs: ${runsR.error}`);
      runs = runsR.json?.workflow_runs || [];
    }
    const checks = snap.checkRuns(sha);
    if (checks.error) return fail(`PR #${n} check-runs: ${checks.error}`);
    let jobs = [];
    const ci = ciState(runs);
    if (ci.runId && (ci.state === "failure" || ci.state === "cancelled"
        || (ci.state === "success" && !pr.draft && !pr.auto_merge))) {
      const j = snap.jobs(ci.runId);
      if (j.error) return fail(`PR #${n} jobs: ${j.error}`);
      jobs = j.json;
    }
    // The newest issue comments for the FLEET column; advisory, so a failed
    // read leaves the body line alone.
    // https://docs.github.com/en/rest/issues/comments#list-issue-comments
    let comments = [];
    if (pr.comments > 0) {
      const c = snap.comments(n, pr.comments);
      if (!c.error && Array.isArray(c.json)) comments = c.json;
    }
    items.push({ pr, runs, jobs, jobsRunId: ci.runId, checkRuns: checks.json?.check_runs || [], comments });
  }
  snap.save();
  const result = evaluate(items, { armed: [...armedByPr.values()].filter(Boolean).length });
  return { ok: true, ...result, requests: snap.stats() };
}

/** Hours a ready, green, unheld PR may sit with no push before it is a stall (audit 2026-10-26 Top 10 #3). */
export const ALARM_HOURS = 12;

/**
 * The stall alarm: ready (not draft), ci.yml green on the head, Structural
 * guards passed, no MERGE-HOLD:, and the head's newest ci.yml run created
 * ≥ ALARM_HOURS ago (a push or a draft→ready flip starts a run, so this is
 * "nothing has happened for 12 h"). Pure.
 */
export function stalled(rows, { now = Date.now(), hours = ALARM_HOURS } = {}) {
  return (rows || []).filter((r) => !r.draft && r.ci === "success" && r.gate === "passed" && !r.hold
    && r.ciAt && now - Date.parse(r.ciAt) >= hours * 3600e3);
}
export function alarmLines(rows, opts = {}) {
  const now = opts.now ?? Date.now();
  const hit = stalled(rows, opts);
  return [
    ...hit.map((r) => `#${r.number} STALLED ${ageLabel(r.ciAt, now)} ready+green, no hold, no push`
      + ` (lane ${r.lane || "-"}${r.armed ? `, armed ${r.mergeMethod}` : ""}): ${clip(r.title, 60)} ${r.url}`),
    `= alarm ${hit.length ? `${hit.length} stalled` : "none"} (ready > ${opts.hours ?? ALARM_HOURS} h, green, no hold, no push)`,
  ];
}

function parseArgs(argv) {
  const out = { json: false, only: null, alarm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--alarm") out.alarm = true;
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
  exitIfHelp(argv, `usage: node tools/ci/pr-board.mjs [--json] [--pr <n>] [--alarm]

Read-only board of every open PR into ${DEPLOY}: draft/ready, mergeable_state,
auto-merge (method), ci.yml state on the head, failing jobs, ready-gate verdict,
the legacy fleet-status report on pre-2026-10-27 PRs, the lane:<host> label (LANE)
and the Hand-off block's owner (OWNER), and a SUGGESTION (ARM READY SYNC FIX FOREIGN-ARM WAIT NONE) for a CI Watch session.
Each SYNC/FIX row also prints needs-sync.mjs's verdict (= sync needed: conflict|stale-red|no; git fetch, no writes).
--alarm prints only the stall alarm: PRs ready > ${ALARM_HOURS} h, green, no MERGE-HOLD, no push
(\`= alarm none|<n> stalled\`; exit 1 when any). Requests go through tools/lib/pr-snapshot.mjs (ETag cache).
Exit 0 printed, 1 --alarm hit, 2 bad args, 3 API/token.`);
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`pr-board: ${args.error}`);
    process.exit(2);
  }
  const snapshot = createSnapshot();
  const v = measure({ only: args.only, snapshot });
  if (!v.ok) {
    console.error(`pr-board: ${v.error}`);
    process.exit(v.badArgs ? 2 : 3);
  }
  if (args.alarm) {
    const lines = alarmLines(v.rows);
    if (args.json) console.log(JSON.stringify({ stalled: stalled(v.rows), requests: v.requests }, null, 2));
    else console.log(lines.join("\n"));
    process.exit(stalled(v.rows).length ? 1 : 0);
  }
  // needs-sync.mjs runs FIRST for every row the board would send to SYNC or FIX
  // (a red may be stale, a "dirty" may be generated-file-only): one verdict line each.
  const sync = {};
  for (const r of v.rows) if (r.suggest === "SYNC" || r.suggest === "FIX") sync[r.number] = needsSync(r.branch, { request: snapshot.get });
  snapshot.save();
  const syncLine = (n) => (sync[n].ok ? `${verdictLine(sync[n])} (${sync[n].why})` : `= sync needed: unknown (${sync[n].error})`);
  if (args.json) console.log(JSON.stringify({ rows: v.rows.map((r) => (sync[r.number] ? { ...r, sync: sync[r.number] } : r)) }, null, 2));
  else {
    console.log(render(v));
    for (const n of Object.keys(sync)) console.log(`#${n} ${syncLine(n)}`);
  }
}
