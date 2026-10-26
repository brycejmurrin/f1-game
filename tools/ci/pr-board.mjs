#!/usr/bin/env node
/**
 * @doc One read-only table of every open PR into the deploy branch, with a SUGGESTION per row for a Claude-run CI Watch.
 * @section runner
 * @skill steward
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
 * FLEET is the worker's report (agent-fleet role-pr-owner.md §Monitoring and
 * reporting): the body's `fleet-status: <state> | <reason> | <utc>` line,
 * or the newest PR comment starting `fleet-status:` or `@orchestrator
 * NEEDS-DECISION:` when it is newer than the body line; state, age, reason.
 * FL and SLOT (JSON `fleetLetter`, `slot`; `fleet` stays the report above, which
 * fleet-tick.mjs reads) are the body's ```fleet block: the letter from `fleet:`,
 * a letter `orchestrator:` or the slot; the slot from `slot:` or a `<letter>·<slot>`
 * token in the block's title (ready-gate.mjs fleetIdentity; no extra API call).
 *
 *   node tools/ci/pr-board.mjs              # the table
 *   node tools/ci/pr-board.mjs --json       # rows, for the skill
 *   node tools/ci/pr-board.mjs --pr 1234    # one PR
 *   node tools/ci/pr-board.mjs --alarm      # only the alarm: ready > 2 h green unheld, lends without merger:, fleets with no live orchestrator
 *   node tools/ci/pr-board.mjs --no-alarm   # the board without the alarm (it is ON by default)
 * OWNER is the fleet block's `merger:` plus owner tags (`MERGE-HOLD: <X> merges`, `owner: <X>`): never a veto.
 *
 * Exit: 0 printed (--alarm: none stalled), 1 --alarm found a stalled PR, 2 bad args (or --pr is not open
 * into the deploy branch), 3 no token / API error.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEPLOY } from "./github-api.mjs";
import { createSnapshot, runsByHead, paths } from "../lib/pr-snapshot.mjs";
import { guardsVerdict, planVerdict, fleetIdentity } from "./ready-gate.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { needsSync, verdictLine } from "./needs-sync.mjs";
import { fleetBlock } from "../lib/fleet-block.mjs";
import { readBus, whoIs, lendMerger } from "./fleet-bus.mjs";

export { DEPLOY };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** At most this many PRs armed repo-wide (AGENTS.md §Concurrent PRs, Merge Desk's hard gate). */
export const MAX_ARMED = 2;
/** The one merge method allowed (AGENTS.md MERGE-COMMIT-ONLY). */
const MERGE_METHOD = "merge";

/** The text a reader SEES: HTML comments (an unclosed `<!--` runs to the end), fenced code and `<details>`
 *  blocks dropped; NFKC with Unicode dashes folded to `-`. Pure. */
export function visibleText(body) {
  return String(body || "").normalize("NFKC").replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|(?![\s\S]))/gm, "")
    .replace(/<details\b[\s\S]*?(?:<\/details>|$)/gi, "");
}
/** One line with its markdown dress removed: quote/list/heading markers and emphasis around the start. Pure. */
const undress = (line) => line.replace(/^(?:\s*(?:>|[-*+]\s|\d+[.)]\s|#{1,6}\s|\[[ xX~]\]\s))*\s*/, "")
  .replace(/^(?:\*\*|__|\*|_)+/, "").replace(/^([A-Za-z-]+?)(?:\*\*|__|\*|_)+(\s*:)/, "$1$2")
  .replace(/^([A-Za-z-]+\s*:)\s*(?:\*\*|__|\*|_)+/, "$1 ").replace(/(?:\*\*|__)+\s*$/, "").trim();

/**
 * The PR body's MERGE-HOLD lines (DECISIONS #6, audit4 G12). A VETO is only the full shape
 * `MERGE-HOLD: <reason> | lift: <who> | until: <time|event>`; `MERGE-HOLD: <X> merges` and `owner: <X>` are OWNER
 * TAGS (who merges), never a veto; any other MERGE-HOLD line is `malformed` (shown, not a veto). Matched after
 * visibleText + undress, so a bold/list/quote/heading/lower-case hold counts and a fenced/commented example does not.
 * @returns {{ holds: {reason:string, lift:string, until:string}[], owners: string[], malformed: string[] }}
 */
export function parseHolds(body) {
  const out = { holds: [], owners: [], malformed: [] };
  for (const raw of visibleText(body).split(/\r?\n/)) {
    const line = undress(raw);
    const own = /^owner\s*:\s*(\S.*)$/i.exec(line);
    if (own) { out.owners.push(own[1].replace(/\s+#.*$/, "").trim()); continue; }
    const m = /^MERGE[- ]HOLD\s*:\s*(.*)$/i.exec(line);
    if (!m || !m[1] || m[1].startsWith("<")) continue;
    const [reason, ...rest] = m[1].split("|").map((s) => s.trim());
    const tag = /^(\S+)\s+merges\b/i.exec(reason);
    if (tag) { out.owners.push(tag[1]); continue; }
    const field = (k) => (rest.map((s) => new RegExp(`^${k}\\s*:\\s*(\\S.*)$`, "i").exec(s)).find(Boolean) || [])[1] || "";
    const lift = field("lift"), until = field("until");
    if (reason && lift && until) out.holds.push({ reason, lift, until });
    else out.malformed.push(clip(m[1], 60));
  }
  return out;
}
/** The one veto on arming or merging (fleet-core.md): a well-formed MERGE-HOLD line a reader can see. */
export const hasMergeHold = (body) => parseHolds(body).holds.length > 0;
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
    const who = fleetIdentity(pr.body);
    const holds = parseHolds(pr.body);
    const merger = fleetBlock(pr.body).merger || "";
    const row = {
      number: pr.number,
      fleetLetter: who.letter || "-",
      slot: who.slot || "-",
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
      hold: holds.holds.length > 0,
      holdMalformed: holds.malformed,
      merger,
      owner: [...new Set([...(merger ? [merger] : []), ...holds.owners])].join(",") || "-",
      fleet: fleetStatus(pr.body, it.comments),
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
  const head = ["PR", "FL", "SLOT", "OWNER", "TITLE", "STATE", "HEAD", "MERGEABLE", "AUTO-MERGE", "CI", "FAILING JOBS", "GATE", "PLAN", "FLEET", "SUGGEST"];
  const plan = (p) => (!p || p.state === "none" ? "-" : `${p.items - p.open.length}/${p.items}`);
  const fleet = (f) => (!f ? "-" : clip(`${f.state} ${ageLabel(f.at, now)}${f.reason ? `: ${f.reason}` : ""}`, 40));
  const body = rows.map((r) => [
    `#${r.number}`, r.fleetLetter || "-", clip(r.slot || "-", 12), clip(r.owner || "-", 10), clip(r.title, 40), r.draft ? "draft" : "ready", r.sha || "-",
    r.mergeableState || "-", r.armed ? (r.mergeMethod || "armed") : "-", r.ci,
    clip(r.failing.join(", "), 36) || "-", r.gate, plan(r.plan), fleet(r.fleet), r.hold ? `${r.suggest} (HOLD)` : r.holdMalformed?.length ? `${r.suggest} (HOLD? malformed, not a veto)` : r.suggest,
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
  // Every round of independent reads goes out as one parallel prefetch (pr-snapshot POOL); the serial reads
  // below then hit the memo, and anything the pool missed is asked again with backoff.
  if (opts.only == null) snap.prefetch([paths.openPrs(1), paths.recentCiRuns()]);
  const list = snap.openPrs();
  if (list.error) return fail(list.error);
  const armedByPr = new Map(list.json.map((pr) => [pr.number, !!pr.auto_merge]));
  const nums = opts.only != null ? [opts.only] : [...armedByPr.keys()];
  // One page of the newest ci.yml runs answers most heads (advisory: a failed
  // or empty page only means every head is read on its own). A single --pr
  // read skips it: one per-head call is cheaper than a 100-run page.
  const recent = opts.only == null && nums.length > 1 ? snap.recentCiRuns() : { json: null };
  const byHead = runsByHead(recent.error ? [] : recent.json?.workflow_runs);
  // Round 2: every PR's detail plus the per-head reads keyed by the LIST's head sha (a head that moved in between
  // is read again serially below); round 3: comments (their count is in the detail) and jobs (they need the ci state).
  const listSha = new Map(list.json.map((pr) => [pr.number, pr.head?.sha]));
  snap.prefetch(nums.flatMap((n) => {
    const sha = listSha.get(n);
    return [paths.pr(n), ...(sha ? [paths.checkRuns(sha), ...(byHead.has(sha) ? [] : [paths.ciRuns(sha)])] : [])];
  }));
  const prs = nums.map((n) => snap.pr(n).json).filter((pr) => pr?.head?.sha);
  snap.prefetch(prs.flatMap((pr) => [paths.checkRuns(pr.head.sha), ...(byHead.has(pr.head.sha) ? [] : [paths.ciRuns(pr.head.sha)])]));
  snap.prefetch(prs.flatMap((pr) => {
    const runs = byHead.get(pr.head.sha) || snap.ciRuns(pr.head.sha).json?.workflow_runs || [];
    const ci = ciState(runs);
    const jobs = ci.runId && (ci.state === "failure" || ci.state === "cancelled" || (ci.state === "success" && !pr.draft && !pr.auto_merge));
    return [...(jobs ? [paths.jobs(ci.runId)] : []), ...(pr.comments > 0 ? [paths.comments(pr.number, pr.comments)] : [])];
  }));
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

/** Hours a ready, green, unheld PR may sit with no push before it is a stall (DECISIONS #7: any live
 *  orchestrator may merge a green READY PR its merger left ≥ 2 h; was 12 h, audit 2026-10-26 Top 10 #3). */
export const ALARM_HOURS = 2;
/** A fleet whose newest `ORCH <L> LIVE` bus line is older than this has no live orchestrator (BH5, audit3 #12). */
export const ORCH_LIVE_HOURS = 24;
/** Bus lines the board reads for lends and LIVE lines (the `fleet-bus who` window). */
export const BUS_WINDOW = 500;

/**
 * The stall alarm: ready (not draft), ci.yml green on the head, Structural
 * guards passed, no MERGE-HOLD:, and the head's newest ci.yml run created
 * ≥ ALARM_HOURS ago (a push or a draft→ready flip starts a run, so this is
 * "nothing has happened for 2 h"). Pure.
 */
export function stalled(rows, { now = Date.now(), hours = ALARM_HOURS } = {}) {
  return (rows || []).filter((r) => !r.draft && r.ci === "success" && r.gate === "passed" && !r.hold
    && r.ciAt && now - Date.parse(r.ciAt) >= hours * 3600e3);
}

/** A bus line that lends PRs: type LEND, or a lend verb (not LEND-EXTEND, a lease word). Pure. */
const LEND_RE = /\b(?:lend|lends|lending|lent)\b(?!-)/i;
/** The fleet a lend line names as merger: `merger:<L>` or "lent to <L>". Pure. */
const lendTo = (text) => lendMerger(text) || (/\blent\s+to\s+(?:fleet\s+)?([A-Z])\b/.exec(String(text || "")) || [])[1] || null;

/**
 * Fleet-level alarms from the bus (entries oldest first, readBus shape {sha, at, type, from, to, text}). Pure.
 *  - LEND: an open PR named by the newest lend line on the bus whose fleet block has no `merger:` (or a different one);
 *  - ORCH: a fleet letter on an open PR with no `ORCH <L> LIVE` line within ORCH_LIVE_HOURS.
 */
export function busAlarms(rows, entries, { now = Date.now(), orchHours = ORCH_LIVE_HOURS } = {}) {
  const out = [];
  const open = new Map((rows || []).map((r) => [r.number, r]));
  const lent = new Map();
  for (const e of entries || []) {
    if (e?.type !== "LEND" && !LEND_RE.test(String(e?.text || ""))) continue;
    for (const m of String(e.text || "").matchAll(/#(\d{2,6})\b/g)) lent.set(Number(m[1]), e);
  }
  for (const [n, e] of [...lent].sort((a, b) => a[0] - b[0])) {
    const r = open.get(n);
    if (!r) continue;
    const to = lendTo(e.text);
    if (!r.merger) out.push(`#${n} LEND on the bus (${String(e.sha).slice(0, 7)}${to ? `, merger ${to}` : ""}) but the fleet block has no merger: — pr-body --fleet merger=${to || "<L>"}`);
    else if (to && r.merger !== to) out.push(`#${n} LEND names merger ${to} (${String(e.sha).slice(0, 7)}) but the fleet block says merger: ${r.merger}`);
  }
  const letters = [...new Set((rows || []).map((r) => r.fleetLetter).filter((l) => /^[A-Z]$/.test(l || "")))].sort();
  for (const L of letters) {
    const w = whoIs(entries || [], L);
    const prs = (rows || []).filter((r) => r.fleetLetter === L).map((r) => `#${r.number}`);
    if (!w) out.push(`fleet ${L} NO ORCHESTRATOR: no ORCH ${L} LIVE line in the last ${(entries || []).length} bus entries (${prs.join(" ")})`);
    else if (now - w.at * 1000 > orchHours * 3600e3) {
      out.push(`fleet ${L} NO ORCHESTRATOR: newest ORCH ${L} LIVE ${w.id} is ${ageLabel(new Date(w.at * 1000).toISOString(), now)} old (> ${orchHours} h; ${prs.join(" ")})`);
    }
  }
  return out;
}

/** Every alarm line plus the `= alarm …` verdict. `bus`: readBus entries, or null when the bus was not read. Pure. */
export function alarmLines(rows, opts = {}) {
  const now = opts.now ?? Date.now();
  const hit = stalled(rows, opts);
  const fleet = opts.bus ? busAlarms(rows, opts.bus, { now }) : [];
  const n = hit.length + fleet.length;
  return [
    ...hit.map((r) => `#${r.number} STALLED ${ageLabel(r.ciAt, now)} ready+green, no hold, no push`
      + ` (fleet ${r.fleetLetter || "-"}${r.owner && r.owner !== "-" ? `, owner ${r.owner}` : ""}${r.armed ? `, armed ${r.mergeMethod}` : ""}): ${clip(r.title, 60)} ${r.url}`),
    ...fleet,
    `= alarm ${n ? `${hit.length} stalled, ${fleet.length} fleet` : "none"} (ready > ${opts.hours ?? ALARM_HOURS} h, green, no hold, no push;`
      + ` ${opts.bus ? "lends without merger:, fleets without a live orchestrator" : "bus not read"})`,
  ];
}

function parseArgs(argv) {
  const out = { json: false, only: null, alarm: false, noAlarm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--alarm") out.alarm = true;
    else if (a === "--no-alarm") out.noAlarm = true;
    else if (a === "--pr") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: `--pr needs a positive integer (got ${argv[i]})` };
      out.only = n;
    } else return { error: `unknown arg: ${a}` };
  }
  if (out.alarm && out.noAlarm) return { error: "--alarm and --no-alarm contradict" };
  return out;
}

/** The newest BUS_WINDOW bus entries, or null when the bus cannot be read (the alarm then says "bus not read"). */
function busEntries() {
  try {
    const r = readBus({ last: BUS_WINDOW });
    return r.tip ? r.entries : null;
  } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/ci/pr-board.mjs [--json] [--pr <n>] [--alarm | --no-alarm]

Read-only board of every open PR into ${DEPLOY}: draft/ready, mergeable_state,
auto-merge (method), ci.yml state on the head, failing jobs, ready-gate verdict,
the worker's fleet-status report (state, age, reason), the fleet block's letter (FL)
and slot (SLOT), OWNER (the block's merger: plus owner tags \`MERGE-HOLD: <X> merges\` / \`owner: <X>\`,
never a veto), and a SUGGESTION (ARM READY SYNC FIX FOREIGN-ARM WAIT NONE) for a CI Watch session.
A hold is a veto only in the full shape \`MERGE-HOLD: <reason> | lift: <who> | until: <time|event>\`;
any other MERGE-HOLD line shows as "HOLD? malformed".
Each SYNC/FIX row also prints needs-sync.mjs's verdict (= sync needed: conflict|stale-red|no; git fetch, no writes).
The ALARM is ON by default on the full board (--no-alarm skips it): PRs ready > ${ALARM_HOURS} h, green, no
MERGE-HOLD, no push; a PR lent on the bus whose fleet block has no merger:; a fleet letter on an open PR with no
ORCH <L> LIVE bus line in ${ORCH_LIVE_HOURS} h (reads the last ${BUS_WINDOW} bus entries).
--alarm prints only the alarm (\`= alarm none|<n> stalled, <m> fleet\`; exit 1 when any).
Requests go through tools/lib/pr-snapshot.mjs (ETag cache, a pool of parallel GETs).
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
  // A single --pr read has no fleet picture: the bus half of the alarm needs every open PR.
  const bus = args.noAlarm || args.only != null ? null : busEntries();
  const fleetAlarms = bus ? busAlarms(v.rows, bus) : [];
  const alarms = args.noAlarm ? [] : alarmLines(v.rows, { bus });
  const alarmHit = !args.noAlarm && (stalled(v.rows).length > 0 || fleetAlarms.length > 0);
  if (args.alarm) {
    if (args.json) console.log(JSON.stringify({ stalled: stalled(v.rows), fleet: bus ? fleetAlarms : null, requests: v.requests }, null, 2));
    else console.log(alarms.join("\n"));
    process.exit(alarmHit ? 1 : 0);
  }
  // needs-sync.mjs runs FIRST for every row the board would send to SYNC or FIX
  // (a red may be stale, a "dirty" may be generated-file-only): one verdict line each.
  // ONE fetch of every such branch and the deploy tip (needs-sync fetched them one by one, ~1.6 s each); when it
  // fails (a branch deleted meanwhile) each needs-sync fetches its own as before.
  const sync = {};
  const syncRows = v.rows.filter((r) => r.suggest === "SYNC" || r.suggest === "FIX");
  const oneFetch = syncRows.length > 0 && spawnSync("git", ["fetch", "--quiet", "--no-tags", "origin", ...new Set(syncRows.map((r) => r.branch)), DEPLOY],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 }).status === 0;
  for (const r of syncRows) sync[r.number] = needsSync(r.branch, { request: snapshot.get, fetch: !oneFetch });
  snapshot.save();
  const syncLine = (n) => (sync[n].ok ? `${verdictLine(sync[n])} (${sync[n].why})` : `= sync needed: unknown (${sync[n].error})`);
  if (args.json) {
    console.log(JSON.stringify({ rows: v.rows.map((r) => (sync[r.number] ? { ...r, sync: sync[r.number] } : r)),
      ...(args.noAlarm ? {} : { alarms }) }, null, 2));
  } else {
    console.log(render(v));
    for (const n of Object.keys(sync)) console.log(`#${n} ${syncLine(n)}`);
    if (alarms.length) console.log(alarms.join("\n"));
  }
}
