#!/usr/bin/env node
/**
 * @doc Ready flip: reuse the same-sha draft run's selected-spec legs when its plan, base and the deploy tip are unchanged.
 * @section runner
 * @skill steward
 *
 *   reuse-draft-selected.mjs --record --sel sel.json   # every run's select job: record this plan (annotation + plan_key output)
 *   reuse-draft-selected.mjs --sel sel.json            # the ready flip's question (stdout: GITHUB_OUTPUT lines)
 *
 * WHY (#5426, orchestration review 2026-11-11 P3 first half, decision 2). A ready flip re-ran every selected browser
 * leg its draft run had just proven on the same commit: 108 of 117 flips in the review window, 684 of 1,000 legs,
 * about 10,275 runner-minutes. This answers `reuse=true` only when skipping those legs proves exactly what running them
 * again would, and `reuse=false` on any doubt (the cost of a wrong `false` is today's behaviour: the legs run).
 *
 * REUSE ONLY WHEN ALL OF THESE HOLD (decide() below; each has a unit test):
 *   1. This run is `ready_for_review`, and its own plan dropped nothing (a drop reds the verdict anyway).
 *   2. The NEWEST other ci.yml pull_request run on the same head sha completed `success` on attempt 1. A newer
 *      push is a new sha (no run); a red, cancelled or still-running newest run, or one that went green only on a
 *      re-run, means the legs run again.
 *   3. That run's tooling A record (`apex-guards`, tools/ci/reuse-draft-fast.sh) names the SAME base sha this run
 *      merged with: the merge ref is the same commit pair.
 *   4. THE DEPLOY TIP HAS NOT MOVED since that base (the live branch head equals it). A ready flip does not always
 *      rebuild the merge ref (#5340's ready run tested against a tip from before a base fix), so "same base as the
 *      draft" alone can be two runs on one stale merge ref. Requiring base == the live tip means a reused verdict is
 *      exactly as fresh as a new run would be: it does not widen #5407 (two green PRs crossing on an old merge ref).
 *   5. That run's select job recorded the SAME plan key (the specs and circuit filters its legs ran) with zero
 *      dropped specs. A draft runs a 5-min budget and may drop specs with only a warning; a dropped spec, a
 *      carried-forward failure or a changed timing record changes the key, and the legs run.
 *   6. Every `Selected specs (change-aware gate)` leg of that run concluded success (at least one when the plan has
 *      legs), and its `Selected specs (verdict)` job concluded success. A run whose own legs were reused has no legs
 *      and is not chained onto.
 *
 * What a reused ready run still runs on its own merge ref: every structural guard shard (reused only under
 * reuse-draft-fast.sh's own same-base rule), lints, the node suites, smoke, staged boot, the sweeps, the renderer and
 * XR legs, baseline-trial, and `Selected specs (verdict)`, which reports the reuse and the draft run it came from.
 * `selected-verdict` is in the full tier's REQUIRE_SUCCESS (#5403 part 1), so a reused verdict is one the full tier
 * requires: a skipped verdict job reds `CI`.
 *
 * Every lookup failure is `reuse=false`. Needs `gh` with GH_TOKEN (actions:read, checks:read).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_TITLE = "apex-selected";
export const LEG_PREFIX = "Selected specs (change-aware gate)";
export const VERDICT_JOB = "Selected specs (verdict)";
export const SELECT_JOB = "Select specs for this change";
export const GUARDS_A_JOB = "Structural guards (tooling A)";
const SHA = /^[0-9a-f]{40}$/;

/** The plan's identity: which specs its legs run, under which circuit filters. Shard layout and budget are not part of it. */
export function planKey(sel) {
  const rows = new Set();
  for (const j of (sel && sel.shards) || []) {
    for (const spec of String(j.specs || "").split(/\s+/).filter(Boolean)) rows.add(`${spec}|${j.circuits || ""}`);
  }
  const body = JSON.stringify({ legs: [...rows].sort(), circuits: [...((sel && sel.circuits) || [])].sort() });
  return createHash("sha256").update(body).digest("hex");
}

/** The routed specs this plan cannot run (the select step's `dropped` output, same arithmetic). */
export function droppedCount(sel) {
  const n = (k) => ((sel && sel[k]) || []).length;
  return n("overBudgetSpecs") + n("unreachable") + n("skipped") + n("unreadable");
}

export const recordLine = ({ key, dropped, base }) => `plan=${key} dropped=${dropped} base=${base || "none"}`;
export function parseRecord(message) {
  const m = /^plan=([0-9a-f]{64}) dropped=(\d+) base=([0-9a-f]{40}|none)$/.exec(String(message || "").trim());
  return m ? { key: m[1], dropped: Number(m[2]), base: m[3] } : null;
}
export function parseGuardsRecord(message) {
  const m = /^mode=(full|changed|unknown) base=([0-9a-f]{40}|none)$/.exec(String(message || "").trim());
  return m ? { mode: m[1], base: m[2] } : null;
}

const strip = (name) => String(name || "").replace(/^ci \/ /, "");

/**
 * The reuse decision. Pure: every GitHub read is a callback, so a test hands in fixtures.
 * @param {object} q
 * @param {string} q.action      github.event.action
 * @param {string} q.head        PR head sha
 * @param {string} q.base        the base sha THIS run's merge commit sits on
 * @param {string} q.tip         the deploy branch head right now ("" when the lookup failed)
 * @param {string} q.key         this run's planKey
 * @param {number} q.dropped     this run's dropped count
 * @param {string} q.self        this run's id
 * @param {boolean} q.hasLegs   this run's plan has browser legs
 * @param {Array}  q.runs        workflow runs on q.head (newest first; the API order), or null on a lookup failure
 * @param {(id:string)=>Array|null} q.jobsOf          a run's jobs, or null on a lookup failure
 * @param {(jobId:string)=>Array|null} q.annotationsOf a job's annotations, or null on a lookup failure
 * @returns {{reuse:boolean, why:string, run?:string}}
 */
export function decide(q) {
  const no = (why) => ({ reuse: false, why });
  if (q.action !== "ready_for_review") return no(`action=${q.action || "?"}, not ready_for_review`);
  if (!SHA.test(String(q.head || ""))) return no("no PR head sha");
  if (!SHA.test(String(q.base || ""))) return no("this run's base sha is unknown");
  if (!SHA.test(String(q.tip || ""))) return no("the deploy tip could not be read");
  if (q.tip !== q.base) return no(`the deploy tip moved: this merge ref sits on ${q.base.slice(0, 12)}, the tip is ${q.tip.slice(0, 12)} — the legs run on a fresh base`);
  if (q.dropped !== 0) return no(`this plan dropped ${q.dropped} spec(s); the verdict judges that itself`);
  if (!Array.isArray(q.runs)) return no("the runs lookup failed");
  const prior = q.runs
    .filter((r) => r && String(r.id) !== String(q.self) && r.path === ".github/workflows/ci.yml" && r.event === "pull_request" && r.head_sha === q.head)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0) || Number(b.id) - Number(a.id));
  const r = prior[0];
  if (!r) return no(`no other ci.yml pull_request run on ${q.head.slice(0, 12)}`);
  const id = String(r.id);
  if (r.status !== "completed" || r.conclusion !== "success") return no(`the newest run on this sha (${id}) is ${r.status}/${r.conclusion || "-"}, not a green verdict`);
  if ((Number(r.run_attempt) || 1) !== 1) return no(`run ${id} passed on attempt ${r.run_attempt}, not its first`);
  const jobs = q.jobsOf(id);
  if (!Array.isArray(jobs)) return no(`the jobs lookup for run ${id} failed`);
  const named = (n) => jobs.filter((j) => strip(j.name) === n);
  const one = (n) => { const a = named(n); return a.length === 1 && a[0].conclusion === "success" ? a[0] : null; };
  const guardsA = one(GUARDS_A_JOB);
  if (!guardsA) return no(`run ${id}: tooling A did not run and pass`);
  const g = parseGuardsRecord((q.annotationsOf(String(guardsA.id)) || []).find((a) => a && a.title === "apex-guards")?.message);
  if (!g) return no(`run ${id}: no readable guards record`);
  if (g.base !== q.base) return no(`run ${id} tested base ${g.base.slice(0, 12)}, this run tests ${q.base.slice(0, 12)}`);
  const select = one(SELECT_JOB);
  if (!select) return no(`run ${id}: its select job did not run and pass`);
  const rec = parseRecord((q.annotationsOf(String(select.id)) || []).find((a) => a && a.title === RECORD_TITLE)?.message);
  if (!rec) return no(`run ${id}: no readable ${RECORD_TITLE} plan record`);
  if (rec.base !== q.base) return no(`run ${id} planned on base ${rec.base.slice(0, 12)}, this run on ${q.base.slice(0, 12)}`);
  if (rec.dropped !== 0) return no(`run ${id}'s plan dropped ${rec.dropped} spec(s) (a draft only warns on that)`);
  if (rec.key !== q.key) return no(`run ${id} ran a different spec plan (${rec.key.slice(0, 12)} vs ${q.key.slice(0, 12)})`);
  if (!one(VERDICT_JOB)) return no(`run ${id}: its selected verdict did not run and pass`);
  const legs = jobs.filter((j) => strip(j.name).startsWith(LEG_PREFIX));
  const bad = legs.filter((j) => j.conclusion !== "success");
  if (bad.length) return no(`run ${id}: ${bad.length} selected leg(s) did not pass (${bad.map((j) => `${strip(j.name)}=${j.conclusion}`).slice(0, 3).join(", ")})`);
  if (q.hasLegs && legs.length === 0) return no(`run ${id} ran no selected leg (its own verdict was reused or empty) — not chained onto`);
  return { reuse: true, run: id, why: `reusing run ${id}: same head ${q.head.slice(0, 12)}, same base ${q.base.slice(0, 12)} (the deploy tip), same plan, ${legs.length} leg(s) green on attempt 1` };
}

function gh(args) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
function pages(text, key) {
  if (text == null) return null;
  try {
    const out = [];
    for (const page of text.split(/(?=\{"total_count")/)) if (page.trim()) out.push(...(JSON.parse(page)[key] || []));
    return out;
  } catch { return null; }
}
function json(text) { try { return text == null ? null : JSON.parse(text); } catch { return null; } }

function currentBase() {
  // The base this checkout's merge commit sits on: its first parent (tools/ci/reuse-draft-fast.sh current_base).
  const r = spawnSync("git", ["cat-file", "-p", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? ((/^parent ([0-9a-f]{40})$/m.exec(r.stdout) || [])[1] || "") : "";
}

function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf("--sel");
  const selPath = at >= 0 ? argv[at + 1] : "sel.json";
  const out = (s) => { process.stdout.write(s); };
  let sel = null;
  try { sel = JSON.parse(fs.readFileSync(selPath, "utf8")); } catch { /* below */ }
  const env = process.env;
  const base = env.CURRENT_BASE || (env.GITHUB_EVENT_NAME === "pull_request" ? currentBase() : "");
  if (argv.includes("--record")) {
    if (!sel) { console.error(`reuse-draft-selected: ${selPath} unreadable; no plan record`); return; }
    const key = planKey(sel);
    console.log(`::notice title=${RECORD_TITLE}::${recordLine({ key, dropped: droppedCount(sel), base })}`);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `plan_key=${key}\n`);
    return;
  }
  const say = (v) => { console.error(`reuse-draft-selected: ${v.why}`); out(`reuse=${v.reuse}\n${v.run ? `run=${v.run}\n` : ""}`); };
  if (!sel) return say({ reuse: false, why: `${selPath} unreadable` });
  const repo = env.GITHUB_REPOSITORY || "";
  if (!repo) return say({ reuse: false, why: "no GITHUB_REPOSITORY" });
  const action = env.GITHUB_EVENT_ACTION || "";
  if (action !== "ready_for_review") return say({ reuse: false, why: `action=${action || "?"}, not ready_for_review` });
  const head = env.PR_HEAD_SHA || "";
  const baseRef = env.PR_BASE_REF || "";
  const tip = baseRef ? (json(gh([`repos/${repo}/branches/${encodeURIComponent(baseRef)}`]))?.commit?.sha || "") : "";
  const runs = json(gh([`repos/${repo}/actions/runs?head_sha=${head}&event=pull_request&per_page=50`]))?.workflow_runs ?? null;
  say(decide({
    action, head, base, tip, key: planKey(sel), dropped: droppedCount(sel), self: env.GITHUB_RUN_ID || "",
    hasLegs: ((sel.shards) || []).length > 0, runs,
    jobsOf: (id) => pages(gh([`repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate"]), "jobs"),
    annotationsOf: (jobId) => json(gh([`repos/${repo}/check-runs/${jobId}/annotations?per_page=100`])),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
