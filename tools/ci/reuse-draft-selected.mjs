#!/usr/bin/env node
/**
 * @doc Reuse a passed run's selected-spec legs when it tested the same merge tree and base (the deploy tip) and plan.
 * @section runner
 * @skill steward
 *
 *   reuse-draft-selected.mjs --record --sel sel.json   # every run's select job: record this plan (annotation + plan_key output)
 *   reuse-draft-selected.mjs --sel sel.json            # the reuse question on a non-draft PR run (stdout: GITHUB_OUTPUT lines)
 *
 * WHY (#5426, orchestration review 2026-11-11 P3 first half, decision 2). A ready flip re-ran every selected browser
 * leg its draft run had just proven on the same commit: 108 of 117 flips in the review window, 684 of 1,000 legs,
 * about 10,275 runner-minutes. This answers `reuse=true` only when skipping those legs proves exactly what running them
 * again would, and `reuse=false` on any doubt (the cost of a wrong `false` is today's behaviour: the legs run).
 *
 * REUSE ONLY WHEN ALL OF THESE HOLD (decide() below; each has a unit test):
 *   1. This run is a non-draft pull_request run (ready_for_review, synchronize, opened or reopened; #6585), and its own
 *      plan dropped nothing (a drop reds the verdict anyway).
 *   2. Some other ci.yml pull_request run, on this head, this PR's branch or a train car's head, recorded the SAME base
 *      and the SAME merge tree as this checkout (tooling A's `apex-guards` record; the tree is the key, not the head),
 *      completed `success` on attempt 1, and NO other run that tested that base and tree is red, re-run green, still
 *      running or unreadable (the veto in decide()).
 *   3. That run's tooling A record (`apex-guards`, tools/ci/reuse-draft-fast.sh) names the SAME base sha this run
 *      merged with and the same tree it checked out (a record without `tree=` counts only on the same head).
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
  // `tree=` since 2026-11-25 (#6557 P1); an older record has none and reads as tree "none".
  const m = /^mode=(full|changed|unknown) base=([0-9a-f]{40}|none)(?: tree=([0-9a-f]{40}|none))?$/.exec(String(message || "").trim());
  return m ? { mode: m[1], base: m[2], tree: m[3] || "none" } : null;
}

const strip = (name) => String(name || "").replace(/^ci \/ /, "");

/** The pull_request actions whose run may reuse a passed verdict: a ready flip (a), a push such as a sync (b), and a
 *  PR that opens or reopens non-draft, such as a train PR (c). The step only asks on a non-draft PR. */
export const REUSE_ACTIONS = Object.freeze(["ready_for_review", "synchronize", "opened", "reopened"]);
/** How many other runs a lookup may clear. Past that it cannot rule out a red on the same tree, so no reuse. Below
 *  each listing's page size (50), so a truncated listing always trips it rather than hiding an older red. */
export const MAX_CANDIDATES = 30;
/** A merge-train manifest in a PR body. merge-train.mjs TRAIN_MARK is the writer; a unit test pins them equal. */
export const TRAIN_MARK = /<!-- merge-train (\{[^\n]*\}) -->/;

/** The cars a train PR's manifest names, `{head, ref}` each ([] for any other body). Only a candidate source (their
 *  runs are looked up so a car's green can be reused and a car's red vetoes): the tree decides, never the manifest. */
export function trainCars(body) {
  const m = TRAIN_MARK.exec(String(body || ""));
  if (!m) return [];
  try {
    const cars = JSON.parse(m[1]).cars;
    return Array.isArray(cars) ? cars.filter((c) => c && SHA.test(String(c.head || "")))
      .map((c) => ({ head: String(c.head), ref: typeof c.ref === "string" ? c.ref : "" })) : [];
  } catch { return []; }
}

/**
 * The reuse decision. Pure: every GitHub read is a callback, so a test hands in fixtures.
 *
 * THE TREE IS THE KEY (#6585, Bryce 2026-11-25 "Skip re-runs on same tree"). A pull_request run tests GitHub's merge
 * ref, and tooling A records that ref's base and tree (`apex-guards ... base= tree=`, #6557 P1). Two runs whose records
 * name the same base AND the same tree checked out the same bytes on the same base. That holds whatever their head
 * commits are: the same head after a ready flip (a), a sync merge whose result equals a merge ref that passed (b), or
 * a train whose fold equals its car's merge ref (c). A head sha alone is never the key, and neither is a timestamp.
 * A record without `tree=` (before 2026-11-25) matches only on the same head, the pre-#6585 rule.
 *
 * THE VETO. Every other completed run that tested this (base, tree) must be clean. One red, a cancelled run with a
 * failed or timed-out job, a green on attempt > 1, or a still-running one means no reuse (AGENTS.md rule 9: a pass that
 * needed another try is a red). A failed lookup on any candidate is no reuse, because it could hide that red.
 * @param {object} q
 * @param {string} q.action      github.event.action
 * @param {string} q.head        PR head sha
 * @param {string} q.base        the base sha THIS run's merge commit sits on
 * @param {string} q.tree        the tree THIS run's checkout (the merge ref) tests
 * @param {string} q.tip         the deploy branch head right now ("" when the lookup failed)
 * @param {string} q.key         this run's planKey
 * @param {number} q.dropped     this run's dropped count
 * @param {string} q.self        this run's id
 * @param {boolean} q.hasLegs   this run's plan has browser legs
 * @param {Array}  q.runs        candidate workflow runs (this head, this PR's branch, train car heads), or null on a lookup failure
 * @param {(id:string)=>Array|null} q.jobsOf          a run's jobs, or null on a lookup failure
 * @param {(jobId:string)=>Array|null} q.annotationsOf a job's annotations, or null on a lookup failure
 * @returns {{reuse:boolean, why:string, run?:string}}
 */
export function decide(q) {
  const no = (why) => ({ reuse: false, why });
  if (!REUSE_ACTIONS.includes(q.action)) return no(`action=${q.action || "?"}, not one of ${REUSE_ACTIONS.join("/")}`);
  if (!SHA.test(String(q.head || ""))) return no("no PR head sha");
  if (!SHA.test(String(q.base || ""))) return no("this run's base sha is unknown");
  if (!SHA.test(String(q.tree || ""))) return no("this run's merge tree is unknown");
  if (!SHA.test(String(q.tip || ""))) return no("the deploy tip could not be read");
  if (q.tip !== q.base) return no(`the deploy tip moved: this merge ref sits on ${q.base.slice(0, 12)}, the tip is ${q.tip.slice(0, 12)} — the legs run on a fresh base`);
  if (q.dropped !== 0) return no(`this plan dropped ${q.dropped} spec(s); the verdict judges that itself`);
  if (!Array.isArray(q.runs)) return no("the runs lookup failed");
  const seen = new Set();
  const others = q.runs
    .filter((r) => r && String(r.id) !== String(q.self) && r.path === ".github/workflows/ci.yml" && r.event === "pull_request"
      && !seen.has(String(r.id)) && seen.add(String(r.id)))
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0) || Number(b.id) - Number(a.id));
  if (others.length > MAX_CANDIDATES) return no(`${others.length} other runs to clear (cap ${MAX_CANDIDATES}); a red on this tree cannot be ruled out`);
  const named = (jobs, n) => jobs.filter((j) => strip(j.name) === n);
  const one = (jobs, n) => { const a = named(jobs, n); return a.length === 1 && a[0].conclusion === "success" ? a[0] : null; };
  // Which candidates tested this (base, tree)? Each needs its jobs and its tooling A record.
  const failedJob = (jobs) => jobs.some((j) => /^(failure|timed_out)$/.test(j.conclusion));
  const clean = (r, jobs) => r.conclusion === "success" || (r.conclusion === "cancelled" && !failedJob(jobs));
  const matched = [];
  for (const r of others) {
    const id = String(r.id);
    const sameHead = r.head_sha === q.head;
    const done = r.status === "completed";
    // Still running on this head: the newest word on these bytes is not in yet.
    if (!done && sameHead) return no(`run ${id} on this head is ${r.status || "?"}, not a verdict yet`);
    const jobs = q.jobsOf(id);
    if (!Array.isArray(jobs)) {
      if (!done) continue; // a run in flight elsewhere may not list its jobs yet; its record below is what could veto
      return no(`the jobs lookup for run ${id} failed`);
    }
    const aJobs = named(jobs, GUARDS_A_JOB);
    const notes = aJobs.length === 1 && aJobs[0].id ? q.annotationsOf(String(aJobs[0].id)) : [];
    if (!Array.isArray(notes)) return no(`the annotations lookup for run ${id} failed`);
    const g = parseGuardsRecord(notes.find((a) => a && a.title === "apex-guards")?.message);
    const match = g ? g.base === q.base && (g.tree === q.tree || (g.tree === "none" && sameHead)) : false;
    if (!match) {
      // A red we cannot place: no record at all (it died before tooling A recorded), or a tree-less record (before
      // 2026-11-25) on this very base. Either may have tested these bytes, so it vetoes like a red on this tree.
      if (done && !clean(r, jobs) && (!g || (g.tree === "none" && g.base === q.base))) {
        return no(`run ${id} is ${r.conclusion} and its tree cannot be placed (${g ? "a tree-less record on this base" : "no readable guards record"}) — cannot rule out a red on this tree`);
      }
      continue;
    }
    if (!done) return no(`run ${id} is testing this base and tree right now (${r.status || "?"}) — its verdict is not in`);
    matched.push({ r, id, jobs, g });
  }
  for (const { r, id, jobs } of matched) {
    if (r.conclusion === "success") {
      if ((Number(r.run_attempt) || 1) !== 1) return no(`run ${id} tested this tree and passed on attempt ${r.run_attempt}, not its first — a red`);
      continue;
    }
    if (clean(r, jobs)) continue; // cancelled with no failed job: superseded, not a red
    return no(`run ${id} tested this base and tree and concluded ${r.conclusion || "-"} — a red on these bytes is never reused past`);
  }
  const pick = matched.find((m) => m.r.conclusion === "success");
  if (!pick) return no(`no other green ci.yml pull_request run tested base ${q.base.slice(0, 12)} tree ${q.tree.slice(0, 12)}`);
  const { id, jobs, r } = pick;
  if (!one(jobs, GUARDS_A_JOB)) return no(`run ${id}: tooling A did not run and pass`);
  const select = one(jobs, SELECT_JOB);
  if (!select) return no(`run ${id}: its select job did not run and pass`);
  const rec = parseRecord((q.annotationsOf(String(select.id)) || []).find((a) => a && a.title === RECORD_TITLE)?.message);
  if (!rec) return no(`run ${id}: no readable ${RECORD_TITLE} plan record`);
  if (rec.base !== q.base) return no(`run ${id} planned on base ${rec.base.slice(0, 12)}, this run on ${q.base.slice(0, 12)}`);
  if (rec.dropped !== 0) return no(`run ${id}'s plan dropped ${rec.dropped} spec(s) (a draft only warns on that)`);
  if (rec.key !== q.key) return no(`run ${id} ran a different spec plan (${rec.key.slice(0, 12)} vs ${q.key.slice(0, 12)})`);
  if (!one(jobs, VERDICT_JOB)) return no(`run ${id}: its selected verdict did not run and pass`);
  const legs = jobs.filter((j) => strip(j.name).startsWith(LEG_PREFIX));
  const bad = legs.filter((j) => j.conclusion !== "success");
  if (bad.length) return no(`run ${id}: ${bad.length} selected leg(s) did not pass (${bad.map((j) => `${strip(j.name)}=${j.conclusion}`).slice(0, 3).join(", ")})`);
  if (q.hasLegs && legs.length === 0) return no(`run ${id} ran no selected leg (its own verdict was reused or empty) — not chained onto`);
  const how = r.head_sha === q.head ? `same head ${q.head.slice(0, 12)}` : `head ${String(r.head_sha).slice(0, 12)}, same tree ${q.tree.slice(0, 12)}`;
  return { reuse: true, run: id, why: `reusing run ${id}: ${how}, same base ${q.base.slice(0, 12)} (the deploy tip), same plan, ${legs.length} leg(s) green on attempt 1, ${matched.length - 1} other run(s) on this tree clean` };
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

function currentTree() {
  const r = spawnSync("git", ["rev-parse", "--verify", "-q", "HEAD^{tree}"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

/** The PR payload (head ref, body) from the event file; {} off a pull_request. */
function prEvent(env) {
  try { return JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8")).pull_request || {}; } catch { return {}; }
}

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
  if (!REUSE_ACTIONS.includes(action)) return say({ reuse: false, why: `action=${action || "?"}, not one of ${REUSE_ACTIONS.join("/")}` });
  const head = env.PR_HEAD_SHA || "";
  const baseRef = env.PR_BASE_REF || "";
  const pr = prEvent(env);
  const headRef = env.PR_HEAD_REF || pr.head?.ref || "";
  const tip = baseRef ? (json(gh([`repos/${repo}/branches/${encodeURIComponent(baseRef)}`]))?.commit?.sha || "") : "";
  // Candidates: runs on this head (a), on this PR's branch (b: the heads before a sync), on a train's car heads (c).
  // Any failed listing is a null: decide() then answers no reuse.
  const list = (qs) => json(gh([`repos/${repo}/actions/runs?${qs}&event=pull_request&per_page=50`]))?.workflow_runs ?? null;
  const lists = [list(`head_sha=${head}`)];
  if (headRef) lists.push(list(`branch=${encodeURIComponent(headRef)}`));
  for (const car of trainCars(pr.body)) {
    lists.push(list(`head_sha=${car.head}`));
    if (car.ref) lists.push(list(`branch=${encodeURIComponent(car.ref)}`));
  }
  const runs = lists.some((l) => !Array.isArray(l)) ? null : lists.flat();
  say(decide({
    action, head, base, tree: env.CURRENT_TREE || currentTree(), tip, key: planKey(sel), dropped: droppedCount(sel), self: env.GITHUB_RUN_ID || "",
    hasLegs: ((sel.shards) || []).length > 0, runs,
    jobsOf: (id) => pages(gh([`repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate"]), "jobs"),
    annotationsOf: (jobId) => json(gh([`repos/${repo}/check-runs/${jobId}/annotations?per_page=100`])),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
