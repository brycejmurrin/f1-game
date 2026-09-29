#!/usr/bin/env node
// select-specs — per-SPEC change-aware selection for the blocking CI gate.
// @doc Per-SPEC change-aware selection for the blocking CI job: cuts at `select-budget` capacity and names every skip.
// @section runner
//
// tools/ci/pick-tests.mjs answers "which GROUPS does this change need" for a
// human with a 4-core box and no deadline. A CI job has a budget, and
// tools/ci/select-budget.mjs measured what fits: first at 79.7 s/test
// (SwiftShader, 2026-08-07), now at each spec's own llvmpipe rate or a 7.5 s
// fallback — and per-GROUP selection (71-193 tests) does not fit the gate's
// 10-minute budget (DEFAULT_BUDGET_MIN). So this selects SPECS: the groups
// pick-tests names, decomposed into their spec files, ordered smallest
// declared-test-count first (more distinct specs covered before the budget
// runs out), and cut off when the next spec's declared tests would blow the
// budget.
//
// BUDGETED, NOT SILENT — the CI caller gates on every spec this selects. The
// cut is by declared-test count, so a spec outside the budget must be NAMED;
// skipped/excluded output is part of the gate's honesty contract.
//
//   node tools/ci/select-specs.mjs --since <ref>            # spec list, one per line
//   node tools/ci/select-specs.mjs --since <ref> --json
//   node tools/ci/select-specs.mjs --since <ref> --budget-min 10
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pick } from "./pick-tests.mjs";
import { MEASURED, capacity, declaredTests, specSecPerTest, timings } from "./select-budget.mjs";
import { isTwinned, twinOf } from "./twinned-specs.mjs";
import { referencesIn } from "../check/cross-file-paths.mjs";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The selected gate's settings, per select-budget's table. It has no retry so a
// failure reports promptly while smoke retains the retry used for deploy safety.
//
// 180, NOT 120. The budget model reasons about the MEAN test (79.7 s), but a
// per-test timeout has to clear the SLOWEST one, and it did not. Measured on an
// idle box, 2026-09-04, one worker, no contention:
//
//   physics-fixes    "lap distance ... through Monaco"   124.2 s   (over 120 outright)
//   albert-park-foundation                               110.1 s   (92% of budget)
//
// So Monaco failed EVERY time the selector picked it, on a tree where it passes,
// and Albert Park failed on any runner contention at all. Worse, the
// carry-forward cache then re-ran both first on every later push to the branch,
// which made a budget defect look like a spreading regression and cost three
// deploys. Neither is slow in the loop — Monaco's sibling test in the same file
// runs 100 steps and still takes 57 s, so ~55 s of each is Monaco boot + track
// build, which no test-side change removes. (Skipping the render via
// headless(true) was tried: 124.2 -> 120.4 s. Not the cost.)
//
// 180 clears the slowest measured spec by 44%. Re-derive ci.yml's
// `timeout-minutes` with it: cap >= (tests x timeout) + setup + margin.
export const SELECTED_GATE = { retries: 0, perTestTimeoutSec: 180 };

// These specs already have independent blocking jobs with runner-measured
// timeout policies. Re-running them in the selected job used its generic 120 s
// cap and turned a green 420 s smoke shard into a deterministic false red.
// Keep them named in the selector report, but never put them on its command.
export const FIXED_GATE_SPECS = new Set([
  "tests/specs/smoke.spec.js",
  "tests/specs/physics-characterization.spec.js",
]);

/** Largest test.setTimeout(N) a spec declares, in ms — 0 when none.
 *  THE COST MODEL'S BLIND SPOT, measured on CI run 31233088772: the selector
 *  billed every test at ~80 s, but 8 of the 10 specs it picked declare their
 *  own test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout —
 *  so a "14-minute" selection signed up for 3-7 minutes per test and failed
 *  the job. A spec that reserves more than the selected gate's per-test budget
 *  cannot be billed at those rates and is excluded by name. */
export function maxDeclaredTimeout(file) {
  let ast;
  try {
    ast = espree.parse(fs.readFileSync(path.join(ROOT, file), "utf8"),
      { ecmaVersion: "latest", sourceType: "module" });
  } catch { return 0; }
  let max = 0;
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.type === "CallExpression" && x.callee?.type === "MemberExpression"
        && x.callee.object?.name === "test" && x.callee.property?.name === "setTimeout"
        && x.arguments?.[0]?.type === "Literal" && typeof x.arguments[0].value === "number") {
      max = Math.max(max, x.arguments[0].value);
    }
    // `test.describe.configure({ timeout })` reserves a budget the same way
    // test.setTimeout does (image-grade-visual 480 s, instanced-draw 420 s were
    // invisible to this walker and selectable), and `test.slow()` triples the
    // gate's per-test timeout.
    if (x.type === "CallExpression" && x.callee?.type === "MemberExpression"
        && x.callee.property?.name === "configure" && x.arguments?.[0]?.type === "ObjectExpression") {
      for (const p of x.arguments[0].properties || []) {
        if (p.key && (p.key.name === "timeout" || p.key.value === "timeout")
            && p.value?.type === "Literal" && typeof p.value.value === "number") max = Math.max(max, p.value.value);
      }
    }
    if (x.type === "CallExpression" && x.callee?.type === "MemberExpression"
        && x.callee.object?.name === "test" && x.callee.property?.name === "slow") {
      max = Math.max(max, 3 * SELECTED_GATE.perTestTimeoutSec * 1000);
    }
    for (const k of Object.keys(x)) if (k !== "loc" && k !== "range") walk(x[k]);
  };
  walk(ast);
  return max;
}

/** tests/specs/*.spec.js named by the given npm scripts (globs expanded). */
export function specsOf(scriptNames, scripts) {
  const out = new Set();
  for (const name of scriptNames) {
    const cmd = scripts[name];
    if (!cmd) continue;
    for (const m of cmd.match(/tests\/specs\/[^\s"']+\.spec\.js/g) || []) {
      if (!m.includes("*")) { out.add(m); continue; }
      const re = new RegExp("^" + path.basename(m).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*") + "$");
      for (const f of fs.readdirSync(path.join(ROOT, "tests", "specs")))
        if (re.test(f)) out.add(`tests/specs/${f}`);
    }
  }
  return [...out].sort();
}

// A spec the change AFFECTS (edited, previously failed, or importing a changed
// helper) that does not fit the main budget is not dropped: it runs outside the
// budgeted set, packed with the rest by measured time (shards(), below). Bounded,
// so a helper edit that touches 59 specs cannot fan out into 59 runners — the
// rest are named as skipped, which is the honesty contract this file has always had.
export const MAX_OVERSIZE_SHARDS = 3;

// THE JOB'S WORST CASE IS BOUNDED BY --max-failures, NOT BY "EVERY TEST TIMES
// OUT" (2026-09-29). ci.yml runs the selection with --max-failures=3, so a job
// can spend at most its expected run plus three per-test timeouts before
// Playwright stops it GRACEFULLY (reporters finalise, junit carries the
// failures). The old cap assumed all N tests would time out (N x 180 s), which
// sharded tracks-walls — 63 tests, ~3.5 min measured on llvmpipe — across three
// runners to keep a kill timer under 90 minutes that no run could reach.
// Every job costs one of the account's 20 concurrent slots (docs/notes/
// CI-CAPACITY-2026-09-29.md: 200-290 jobs queued for 7 h on 2026-09-29), so a
// split that buys nothing is paid for in queue time by every other PR.
export const MAX_FAILURES = 3;
// A job's EXPECTED work before shards() splits or stops packing: close to the
// fixed gate's own critical path (vm-a, ~6 min), so the selection is rarely
// the last job to finish.
export const TARGET_SHARD_SEC = 480;
// Minutes a job may take before the runner kills it: twice its expected work
// (runner variance), plus MAX_FAILURES timeouts at the slowest per-test
// timeout in it, plus setup (npm ci + chromium + Mesa) and margin. A ceiling,
// not the spend: a passing run never approaches it. A killed job reads as
// "0 failures", which this file's history shows hiding a dead deploy, so the
// cap is derived from the plan, never guessed.
export const shardCapMin = (expectedSec, perTestSec = SELECTED_GATE.perTestTimeoutSec) =>
  Math.min(90, Math.ceil((2 * expectedSec + MAX_FAILURES * perTestSec) / 60) + 6);

/** Seconds one row of the plan is expected to take: its tests at the spec's
 *  own measured rate, or the fallback (select-budget's MEASURED). */
export const expectedSec = (r, db = timings()) => r.tests * specSecPerTest(r.file, db).sec;

/** A spec may bypass its declared per-test budget when CI has MEASURED it at a
 *  third of the gate's timeout or less (3+ samples, a CI bucket). The
 *  declaration is a ceiling its author wrote for the slowest box; the
 *  measurement is what the gate's own runner does. The declared figure still
 *  sets the job's kill timer (shardCapMin reads ownTimeoutSec), because
 *  test.setTimeout overrides --timeout. */
export function measuredCheap(file, db = timings()) {
  const m = specSecPerTest(file, db);
  return m.source === "measured" && m.sec * 3 <= SELECTED_GATE.perTestTimeoutSec;
}

/** Cut the spec list to what fits `budgetMin` surviving one timeout.
 *  `rank(file)` orders the cut: lower ranks fill the budget first (prioritise()
 *  defines the scale — 0 edited, 1 previously failed, 2 imports a changed
 *  helper, 3 routed by a path rule), ties smallest-first. Affected specs
 *  (rank < 3) that miss the budget go to `oversize` instead of `skipped`.
 *
 *  BILLED IN SECONDS, PER SPEC (2026-09-24). The cut used to count TESTS
 *  against `cap.tests`, i.e. every test in the tree at the 2026-08-07 mean
 *  (79.7 s) — so select-budget's per-spec median (`specSecPerTest`, 3+ CI
 *  samples) was reported and never used, and a 2-test spec measured at 7 s a
 *  test cost the budget as much as two boot-heavy ones. Now a spec costs
 *  `tests x its own rate`, and the allowance is the same budget expressed in
 *  seconds: `(budget - one failure) + one test at the fallback rate`, which
 *  is exactly `cap.tests` x the fallback's boundary — an UNMEASURED selection
 *  cuts where the fallback says (7.5 s/test since 2026-09-29, the llvmpipe
 *  p75). `db` pins the timing history (tests pass an empty one). */
export function fit(specs, budgetMin, { rank = () => 3, db = timings() } = {}) {
  const m = { ...MEASURED, ...SELECTED_GATE };
  const cap = capacity(budgetMin, 1, m);
  const allowanceSec = cap.budgetSec - cap.perFailureSec + m.secPerTest;
  const costOf = (r) => r.tests * specSecPerTest(r.file, db).sec;
  const counted = [], overBudgetSpecs = [], coveredByFixedGates = [], coveredByVmTwin = [];
  const unreadable = [];
  for (const file of specs) {
    const tests = declaredTests(file);
    // A SPEC THIS TOOL CANNOT READ IS NOT A SPEC IT MAY IGNORE. This used to
    // `continue` into no bucket at all, so a path that is missing, renamed or
    // unparseable left the selection with no trace anywhere in the report —
    // in a file whose whole contract is that nothing is dropped silently.
    // Reachable today: hand fit() a path that does not exist and it disappears.
    if (tests == null) { unreadable.push({ file, tests: null }); continue; }
    if (FIXED_GATE_SPECS.has(file)) {
      coveredByFixedGates.push({ file, tests });
      continue;
    }
    // A spec whose assertions a VM twin replays test-for-test, in a node group
    // the Pages gate runs unconditionally. Running the browser copy here spends
    // SwiftShader minutes the budget then denies to a spec with NO twin, which
    // is the opposite of what a budgeted gate is for. tools/ci/twinned-specs.mjs
    // holds the pairs and the drift check that keeps the substitution honest —
    // it is on the fast gate, so a twin that stops covering fails there rather
    // than leaving the spec quietly unchecked in both places.
    if (isTwinned(file)) {
      coveredByVmTwin.push({ file, tests, twin: twinOf(file) });
      continue;
    }
    const own = maxDeclaredTimeout(file);
    // >=, NOT >. A spec that declares EXACTLY the gate's budget is saying it
    // needs all of it, with nothing left for a runner slower than the box that
    // number was measured on — and the gate's runner always is. Under `>` such
    // a spec is SELECTED and then killed at its own declared figure, which
    // reads as a code failure and is not one.
    //
    // This was not hypothetical: raising the gate 120 -> 180 s silently pulled
    // in the five specs that declare exactly 180 s (audio-smoke,
    // material-shimmer, qatar/spa/suzuka-foundation), every one of them
    // boot-heavy and previously excluded. audio-smoke measures 115.5 s SOLO on
    // an idle 4-core. Raising a gate must never enrol specs that opted out of
    // the lower one; with `>=` the boundary moves with the gate instead.
    // OVER BUDGET IS NOT THE SAME ANSWER FOR AN EDITED SPEC AS FOR A ROUTED ONE,
    // and this used to `continue` before either had a rank. 56 of 119 specs
    // declare >= the gate, so 47% of the suite could never be selected — not
    // even by a diff that edits the spec itself. Four of the five changes
    // select-recall.mjs records as CAUGHT are in that 56, so the harness was
    // measuring a selector the gate does not run.
    //
    // The `>=` reasoning below is untouched and still right: a spec that
    // declares the whole budget has opted out of the BUDGETED shard, and
    // raising the gate must never enrol it. What it may not do is opt out of
    // running when you just edited it — that case has its own shard already
    // (oversize), and it is billed at the spec's own declared figure.
    //
    // MEASURED BEATS DECLARED (2026-09-29). The declaration is only a proxy for
    // "this spec is slow"; 30 specs now have llvmpipe history, and the proxy
    // was wrong in the direction that hid them — imola-foundation declares
    // 420 s and runs in ~30 s, bahrain-foundation 300 s and ~20 s. A spec CI
    // has measured at a third of the gate's timeout or less joins the budget
    // like any other, carrying its declared figure so its job's kill timer
    // still clears it. Unmeasured, the declaration stands, as above.
    if (own >= SELECTED_GATE.perTestTimeoutSec * 1000) {
      if (measuredCheap(file, db)) { counted.push({ file, tests, ownTimeoutSec: own / 1000 }); continue; }
      counted.push({ file, tests, overBudget: true, ownTimeoutSec: own / 1000 });
      continue;
    }
    counted.push({ file, tests });
  }
  // AFFECTED FIRST, then smallest-first. The cut used to be smallest-first
  // alone with the priority applied AFTER it as a mere reordering, so a changed
  // 10-test spec was omitted whenever smaller routed specs had already filled
  // the 10-test cap — the one spec the change most needed was the one dropped.
  // A budget that cannot afford the spec you just edited is not "change-aware".
  for (const r of counted) { r.rank = rank(r.file); r.sec = Math.round(expectedSec(r, db)); }
  counted.sort((a, b) => a.rank - b.rank || a.tests - b.tests);
  const selected = [], skipped = [], unreachable = [], oversize = [];
  let used = 0, usedSec = 0;
  for (const r of counted) {
    // An over-budget spec never joins the budgeted set. Affected (rank < 3)
    // it runs outside it, its job's cap derived from its own declared timeout;
    // merely routed, it is reported as over budget exactly as before.
    if (r.overBudget) {
      if (r.rank < 3) oversize.push(r);
      else overBudgetSpecs.push({ file: r.file, tests: r.tests, ownTimeoutSec: r.ownTimeoutSec });
      continue;
    }
    // A spec bigger than the budget still RUNS (oversize): shards() packs it
    // with the rest by expected seconds and splits it across Playwright
    // `--shard=i/n` jobs only when its own expected run exceeds
    // TARGET_SHARD_SEC. Naming it unreachable is what the undercount used to
    // avoid for tracks-walls — billed as 4, packed, then cancelled at 63/76
    // with 0 failures. MAX_OVERSIZE_SHARDS still bounds the fan-out; overflow
    // is skipped BY NAME below. Ordinary "bigger than the budget" is oversize
    // for every rank — affected or merely routed.
    const cost = costOf(r);
    if (usedSec + cost <= allowanceSec) { selected.push(r); used += r.tests; usedSec += cost; continue; }
    if (r.rank < 3 || cost > allowanceSec) oversize.push(r);
    else skipped.push(r);
  }
  // A single oversize entry whose expected run needs more than eight
  // TARGET_SHARD_SEC jobs is unreachable for real: the fan-out guard. Nothing
  // measured in the tree is within an order of magnitude of it (the largest
  // whole spec measures ~3.5 min on llvmpipe); it exists so a mis-billed
  // expansion cannot schedule dozens of runners.
  {
    const keep = [], tooBig = [];
    for (const r of oversize) {
      if (Math.ceil(expectedSec(r, db) / TARGET_SHARD_SEC) > MAX_OVERSIZE_SHARDS * 8) tooBig.push(r);
      else keep.push(r);
    }
    oversize.length = 0;
    oversize.push(...keep);
    unreachable.push(...tooBig);
  }
  // The oversize list is bounded; the overflow is skipped BY NAME, never silently.
  // Affected first, then the most expensive: a big spec the change reaches is
  // the one a small routed spec must not displace (tracks-walls losing its
  // slot to three 11-test specs was CI run 36057109364).
  oversize.sort((a, b) => a.rank - b.rank || expectedSec(b, db) - expectedSec(a, db));
  const oversizeRun = oversize.slice(0, MAX_OVERSIZE_SHARDS);
  for (const r of oversize.slice(MAX_OVERSIZE_SHARDS)) skipped.push(r);
  return { selected, skipped, unreachable, oversize: oversizeRun, overBudgetSpecs, coveredByFixedGates, coveredByVmTwin,
    unreadable,
    testsSelected: used, testsFit: cap.tests, secSelected: Math.round(usedSec), secFit: Math.round(allowanceSec), cap };
}

/** The matrix the CI gate runs, PACKED BY EXPECTED SECONDS (2026-09-29).
 *
 *  Every row the plan carries — the budgeted selection and each oversize spec —
 *  becomes one item costed at its measured (or fallback) rate. An item whose
 *  own expected run exceeds TARGET_SHARD_SEC is split across Playwright
 *  `--shard=i/n` jobs; everything else is packed first-fit-decreasing into as
 *  few jobs as fit TARGET_SHARD_SEC each. Before this, each oversize spec was
 *  its own job and a loop-expanded one was split by a worst case no run could
 *  reach: a typical circuit PR asked for 3-7 selected jobs doing 0.2-1.5 min
 *  of work apiece, each holding one of 20 slots behind a 26-minute queue.
 *
 *  Two kinds of item never share a job: a `--shard` piece (the flag applies to
 *  the whole command) and a spec carrying menu-baseline (its goldens are
 *  SwiftShader captures, so ci.yml drops llvmpipe for any job naming it).
 *  The job holding the budgeted specs is named `selected` — ci.yml's
 *  carry-forward of failing specs keys on that name. */
export function shards(r, db = timings()) {
  const items = [];
  const cost = (x) => (x.sec != null ? x.sec : expectedSec(x, db));
  for (const s of [...(r.selected || []).map((x) => ({ ...x, budgeted: true })), ...(r.oversize || [])]) {
    const sec = cost(s);
    const perTest = Math.max(SELECTED_GATE.perTestTimeoutSec, s.ownTimeoutSec || 0);
    const base = path.basename(s.file, ".spec.js");
    const n = Math.max(1, Math.ceil(sec / TARGET_SHARD_SEC));
    if (n > 1) {
      for (let i = 1; i <= n; i++) {
        items.push({ solo: true, name: `oversize-${base}-${i}of${n}`, files: [s.file], shard: `${i}/${n}`,
          tests: Math.ceil(s.tests / n), sec: sec / n, perTest });
      }
      continue;
    }
    items.push({ solo: /menu-baseline/.test(s.file), budgeted: !!s.budgeted, name: `oversize-${base}`,
      files: [s.file], shard: "", tests: s.tests, sec, perTest });
  }
  const bins = [];
  for (const it of items.filter((x) => x.solo)) bins.push({ ...it, items: [it] });
  const packable = items.filter((x) => !x.solo).sort((a, b) => b.sec - a.sec);
  const open = [];
  for (const it of packable) {
    const bin = open.find((b) => b.sec + it.sec <= TARGET_SHARD_SEC);
    if (bin) { bin.items.push(it); bin.sec += it.sec; continue; }
    const fresh = { items: [it], sec: it.sec };
    open.push(fresh); bins.push(fresh);
  }
  let k = 0;
  const out = bins.map((b) => {
    const files = b.items.flatMap((x) => x.files);
    const budgeted = b.items.some((x) => x.budgeted);
    const name = b.solo ? b.name
      : budgeted ? "selected"
      : b.items.length === 1 ? b.items[0].name : `packed-${++k}`;
    const perTest = Math.max(...b.items.map((x) => x.perTest));
    const sec = Math.round(b.sec);
    return { name, specs: files.join(" "), shard: b.solo ? b.shard : "",
      tests: b.items.reduce((n, x) => n + x.tests, 0), sec, perTest,
      timeout: shardCapMin(sec, perTest),
      // APEX_CIRCUITS for the job: empty = every circuit (see select()).
      circuits: (r.circuits || []).join(",") };
  });
  // `selected` first: the job a reader looks for, and the carry-forward's.
  return out.sort((a, b) => (a.name === "selected" ? -1 : b.name === "selected" ? 1 : 0));
}

// TRACKED (infra) PATHS — a change here makes the SELECTION ITSELF untrustworthy,
// so the honest answer is "this job cannot help; the gates cover it", never a
// quiet empty selection. Named after Datadog TIA's "tracked files" and Fowler's
// account of Google Testar, which records the same blind spot: a tool that
// derives impact from code cannot see impact arriving through data or config.
//
// The hole this closes, measured: tests/helpers/fixtures.js is imported by 59
// specs, but pick-tests routes ^tests/ to `audit` — not a browser group — so
// editing the file EVERY spec depends on selected ZERO specs and the job said
// nothing to run. A selector that is silent precisely when everything is
// affected is worse than no selector.
export const TRACKED = [
  /^package(-lock)?\.json$/,          // scripts + dependency versions
  /^playwright\.config\.js$/,         // projects, timeouts, the reporter
  // `tools/ci/` ON THE FOUR THAT MOVED. Only manifest.cjs still sits at the
  // tools/ root; pick-tests, select-specs, select-budget and run-playwright are
  // all under tools/ci/, so four of these five alternatives matched NOTHING —
  // editing the selector, the budget model or the Playwright runner never set
  // reason "infra", never printed SELECTION NARROWER THAN THE CHANGE, and the
  // gate went on trusting a routing produced by the code in that very diff.
  // A path inside a regex literal is invisible to a rename; the lint in
  // tests/unit/select-specs.test.mjs now fails on any member that matches no
  // tracked file, which is what pick-tests.mjs's RULES have had all along.
  /^tools\/(ci\/)?(manifest\.cjs|pick-tests\.mjs|select-specs\.mjs|select-budget\.mjs|run-playwright\.mjs)$/,
  /^tests\/helpers\/(fixtures|global-setup|live-reporter)\.js$/,  // EVERY spec's plumbing
  /^\.github\//,                      // the job that runs the selection
  /^(index\.html|sw\.js|version\.json)$/,   // the shell, its precache, its cache key
  /^tests\/data\//,                   // data-driven inputs: no import graph sees these
];

// A CIRCUIT-SCOPED CHANGE (2026-09-29). Most of the branches racing for the
// 20 runner slots on 2026-09-29 were circuit waves: every file they touched
// was one circuit's def, its scenery callback, or that circuit's rows in a
// per-circuit baseline. The routing saw `test:circuits` — 25 specs across 52
// circuits — plus, for the baseline, an "infra" warning, and then EXCLUDED
// the one spec about the circuit that changed (imola-foundation, for its
// declared 420 s) while running other circuits' foundations. These name the
// circuit instead: its own foundation spec becomes AFFECTED (it always runs),
// other circuits' foundation specs are not candidates, and the plan carries
// the ids so per-circuit loops (APEX_CIRCUITS) test only what moved.
export const CIRCUIT_FILE = /^js\/circuits\/(?:scenery\/)?([a-z0-9_]+)\.js$/;
// Data files keyed `{ <category>: { <circuit id>: … } }`: a change here is
// scoped to the ids whose rows differ. Reading them needs the base, so a
// base git cannot show leaves the file TRACKED, exactly as before.
// Also `{ <circuit id>: <number> }` (flat), e.g. the props triangle budget.
export const PER_CIRCUIT_DATA = new Set([
  "tests/data/scenery-audit-baseline.json",
  "tools/track/props-tris-baseline.json",
]);
// Tests that read APEX_CIRCUITS to narrow their per-circuit loop. Editing one
// of THESE is not circuit-scoped: the edit is to the loop, so it runs whole.
export const CIRCUIT_FILTERED_TESTS = new Set([
  "tests/specs/tracks-walls.spec.js",
  "tests/unit/elevation-tracks-vm.test.mjs",
]);
// Paths that cannot change what a browser spec or a per-circuit loop sees, so
// they do not break a circuit scope: prose, and node unit files other than
// the filtered ones (the node gate runs every one of them regardless).
const scopeNeutral = (f) => DOCS_ONLY.some((re) => re.test(f))
  || (/^tests\/unit\//.test(f) && !CIRCUIT_FILTERED_TESTS.has(f));
export const foundationSpec = (id) => `tests/specs/${id.replace(/_/g, "-")}-foundation.spec.js`;
const FOUNDATION = /^tests\/specs\/(.+)-foundation\.spec\.js$/;

/** Circuit ids a per-circuit data file's rows changed for, or null when the
 *  diff cannot be read (then the file stays infra). */
export function dataCircuits(file, ref, root = ROOT) {
  const read = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
  let before, after;
  try { before = read(execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { before = {}; }
  try { after = read(fs.readFileSync(path.join(root, file), "utf8")); } catch { after = {}; }
  if (!before || !after) return null;
  const ids = new Set();
  const flat = [before, after].every((o) => Object.entries(o)
    .every(([k, v]) => k.startsWith("//") || v === null || typeof v !== "object"));
  if (flat) {
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (!id.startsWith("//") && JSON.stringify(before[id]) !== JSON.stringify(after[id])) ids.add(id);
    return ids;
  }
  for (const cat of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (cat.startsWith("//")) continue;
    const a = before[cat] || {}, b = after[cat] || {};
    if (typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return null;
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) ids.add(id);
  }
  return ids;
}

/** `{ ids, scoped, dataResolved }`: the circuits a diff touches, whether EVERY
 *  changed path is one of them, and the per-circuit data files resolved to ids
 *  (the caller stops calling those infra). */
export function circuitsTouched(changed, ref, root = ROOT) {
  const ids = new Set(), dataResolved = [];
  let scoped = changed.length > 0;
  for (const f of changed) {
    const m = CIRCUIT_FILE.exec(f);
    if (m) { ids.add(m[1]); continue; }
    if (PER_CIRCUIT_DATA.has(f)) {
      const d = ref ? dataCircuits(f, ref, root) : null;
      if (d) { d.forEach((id) => ids.add(id)); dataResolved.push(f); continue; }
    }
    if (scopeNeutral(f)) continue;
    scoped = false;
  }
  return { ids: [...ids].sort(), scoped: scoped && ids.size > 0, dataResolved };
}

// DOCS-ONLY IS "NOTHING TO SELECT", NOT "UNMATCHED". ci.yml's own push trigger
// already ignores these paths, so a docs commit never reaches the selected gate
// by push — but pages.yml CALLS the workflow, and workflow_call does not honour
// paths-ignore. So the DEPLOY path saw a docs diff, matched no rule, and failed
// closed: a red Pages run for a change that ships no code. Measured on an
// AGENTS.md-only deploy. This list mirrors ci.yml's paths-ignore deliberately —
// if one grows, so must the other, and select-specs.test.mjs pins that.
export const DOCS_ONLY = [/^docs\//, /\.md$/, /^\.claude\//, /^\.cursor\//];
export const isDocsOnly = (changed) =>
  changed.length > 0 && changed.every((f) => DOCS_ONLY.some((re) => re.test(f)));

// ─── import graph (Playwright's --only-changed, computed here) ────────────────
//
// Playwright ships `--only-changed=<ref>`, which walks the suite's IMPORT graph
// to find affected specs. In most repos that would replace the path RULES
// wholesale. Here it would find almost nothing: Apex 26's specs do not import
// js/ at all — they load the game over HTTP — so no import graph can connect
// js/game.js to a spec. The two are complementary, not competing: RULES cover
// source -> spec (invisible to any import graph in an IIFE + script-tag app),
// and the graph covers helper/spec -> spec PRECISELY, which is exactly where
// the RULES are weakest (^tests/ routes to `audit` and nothing else).
export function specsImporting(changed, root = ROOT) {
  const narrow = changed.filter((f) => /^tests\/helpers\/.+\.js$/.test(f));
  if (!narrow.length) return [];
  const dir = path.join(root, "tests", "specs");
  const hit = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".spec.js"))) {
    const rel = `tests/specs/${name}`;
    let refs = [];
    try { refs = referencesIn(fs.readFileSync(path.join(dir, name), "utf8"), rel).refs || []; }
    catch { continue; }
    for (const r of refs) {
      const target = path.posix.normalize(path.posix.join("tests/specs", r.spec));
      if (narrow.includes(target)) { hit.push(rel); break; }
    }
  }
  return hit;
}

// ALWAYS-RUN, and FAIL-FAST ORDER. Both are standard TIA practice this
// selector lacked. Fowler's survey records Microsoft's TIA and Google's Testar
// each running newly-added and previously-failing tests UNCONDITIONALLY: a new
// test has no history to select on, and a test that failed last time is the
// single best predictor of failing again. Playwright's own CI guidance is the
// ordering half — run the changed specs FIRST so the likeliest failure reports
  // first, since the gate should report the likeliest failure as early as possible.
//
// Priority, highest first:
//   0  the spec file itself is in the diff (you just edited it)
//   1  it failed on the previous run (carried in via --failed-from)
//   2  it imports a helper that changed (import graph)
//   3  a pick-tests RULE routed its group here
export function prioritise(specs, { changedSpecs = [], failed = [], imported = [] } = {}) {
  const rank = (f) => changedSpecs.includes(f) ? 0 : failed.includes(f) ? 1
    : imported.includes(f) ? 2 : 3;
  return [...specs].sort((a, b) => rank(a.file) - rank(b.file) || a.tests - b.tests);
}

/** Previously-failing specs only ride along when this change already routes
 *  to them. Carry-forward is fail-fast ORDER, not a second selector.
 *
 *  Pages 33927358590 (livery lockup, groups: test:car) unioned
 *  albert-park-foundation + physics-fixes from .selected-failed.txt into the
 *  candidate set, ran them first, hit max-failures=3 at 180 s, and never
 *  reached carview-parts. The same three circuit specs then wrote themselves
 *  back into the cache — a budget flake became a branch-wide red. */
export function scopeCarryForward(failed, routed) {
  const allow = new Set(routed);
  const inScope = [], dropped = [];
  for (const f of failed) (allow.has(f) ? inScope : dropped).push(f);
  return { inScope, dropped };
}

// The boot group reaches this gate only through pick-tests' two blanket
// rules ("any source edit: does the page still boot", "script tags + DOM
// shell"). That question is already answered on every push and every deploy
// by the FIXED smoke gate (smoke.spec.js, one shard on llvmpipe), so routing it here
// too selected the boot group's cheapest-by-count specs — boot-guard (two
// reload cycles) and logging (a Monaco build) — for EVERY source edit, the two
// slowest-per-test specs in the tree, and they timed out the deploy gate twice
// on starved runners (2026-09-02) for diffs that never touched them. A rule
// that names the boot group for a specific reason still selects it.
export const BOOT_FALLBACK_REASONS = new Set([
  "any source edit: does the page still boot",
  "script tags + DOM shell",
]);
export function dropBootFallback(groups) {
  const reasons = groups.get("tiny");
  if (!reasons) return false;
  for (const why of reasons) if (!BOOT_FALLBACK_REASONS.has(why)) return false;
  groups.delete("tiny");
  return true;
}

// THE BUDGETED SELECTION'S MINUTES (2026-09-29: 15 -> 10). At the old 79.7 s
// fallback, "15 minutes" bought ~1 minute of real llvmpipe work; billed at
// measured rates the same figure would buy ~12 minutes and make this job the
// slowest in the run. Ten minutes surviving one 180 s timeout leaves ~7
// minutes of expected work, inside the fixed gate's own ~6-minute wall.
export const DEFAULT_BUDGET_MIN = 10;

export function select(changedRef, budgetMin = DEFAULT_BUDGET_MIN, opts = {}) {
  const changed = execFileSync("git", ["diff", "--name-only", changedRef], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const g = pick(changed);   // Map: group -> reasons (pick-tests' native shape)
  const bootCoveredBySmoke = dropBootFallback(g);
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const browserGroups = [...g.keys()].map((n) => `test:${n}`)
    .filter((s) => scripts[s] && scripts[s].includes("run-playwright")).sort();
  const specs = specsOf(browserGroups, scripts);
  // Same three-way contract as pick-tests --json: "unmatched" means files
  // changed but no rule claimed them — the selection is NOT trustworthy and
  // the caller must fall back to a full run, not to running nothing.
  const circ = circuitsTouched(changed, changedRef);
  const tracked = changed.filter((f) => TRACKED.some((re) => re.test(f)) && !circ.dataResolved.includes(f));
  const docsOnly = isDocsOnly(changed);
  // The three always-run inputs, unioned into the candidate set BEFORE the cut
  // so they compete for the budget on merit rather than being bolted on after.
  const changedSpecs = changed.filter((f) => /^tests\/specs\/.+\.spec\.js$/.test(f)
    && fs.existsSync(path.join(ROOT, f)));
  const imported = specsImporting(changed);
  const failed = (opts.failed || []).filter((f) => fs.existsSync(path.join(ROOT, f)));
  // The touched circuits' own foundation specs are AFFECTED, like an import;
  // on a circuit-scoped diff another circuit's foundation is not a candidate.
  const ownFoundations = circ.ids.map(foundationSpec).filter((f) => fs.existsSync(path.join(ROOT, f)));
  const otherCircuit = (f) => {
    const m = FOUNDATION.exec(f);
    return circ.scoped && m && !ownFoundations.includes(f) && !changedSpecs.includes(f);
  };
  const routed = [...new Set([...changedSpecs, ...imported, ...ownFoundations, ...specs])]
    .filter((f) => !otherCircuit(f));
  const { inScope: failedInScope, dropped: failedDropped } = scopeCarryForward(failed, routed);
  const candidates = routed;
  const reason = !changed.length ? "none"
    : docsOnly ? "docs"
    : tracked.length ? "infra"
    : (g.size || candidates.length ? "matched" : "unmatched");
  const rank = (f) => changedSpecs.includes(f) ? 0 : failedInScope.includes(f) ? 1
    : (imported.includes(f) || ownFoundations.includes(f)) ? 2 : 3;
  const cut = fit(candidates, budgetMin, { rank });
  // "infra" no longer EMPTIES the selection. A tracked-path change (the shell,
  // a fixture every spec imports, this selector) can affect any spec, which is
  // a reason to distrust the routing, not a reason to run nothing: the specs
  // this diff edited or imports are still the best-evidenced ones to run, and
  // the fixed gates still own the rest. The warning stays so the log says why
  // the selection is narrower than the change.
  // `circuits` is set only when EVERY changed path is circuit-scoped: it is
  // what lets a per-circuit loop skip the other 51 circuits, so a diff that
  // also touches the engine must leave it empty (the whole fleet runs).
  const r = { reason, changed: changed.length, tracked, groups: browserGroups, bootCoveredBySmoke,
              circuits: circ.scoped ? circ.ids : [], circuitsTouched: circ.ids,
              changedSpecs, imported, failed: failedInScope, failedDropped, ...cut,
              selected: prioritise(cut.selected, { changedSpecs, failed: failedInScope, imported }) };
  r.shards = shards(r);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--since");
  if (si < 0 || !argv[si + 1]) {
    console.error("usage: node tools/ci/select-specs.mjs --since <ref> [--budget-min N] [--json]");
    process.exit(2);
  }
  const bi = argv.indexOf("--budget-min");
  // Previously-failing specs, one path per line — CI carries this across runs
  // (actions/cache) so the best single failure predictor survives the runner.
  const fi = argv.indexOf("--failed-from");
  let failed = [];
  if (fi >= 0 && argv[fi + 1]) {
    try { failed = fs.readFileSync(argv[fi + 1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean); }
    catch { /* absent on the first run, and on any run after a cache miss */ }
  }
  const r = select(argv[si + 1], bi >= 0 ? Number(argv[bi + 1]) : DEFAULT_BUDGET_MIN, { failed });
  if (argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.error(`${r.changed} changed file(s) [${r.reason}] -> groups: ${r.groups.join(", ") || "(none)"}`);
  if (r.reason === "infra") console.error(
    `SELECTION NARROWER THAN THE CHANGE: this diff touches ${r.tracked.length} tracked/infra path(s) ` +
    `(${r.tracked.slice(0, 4).join(", ")}${r.tracked.length > 4 ? ", …" : ""}) — a change there can affect ` +
    `any spec; the edited/imported specs below still run, and the fixed GATES own the rest.`);
  if (r.reason === "unmatched") console.error(
    "SELECTION NOT TRUSTWORTHY: files changed but no pick-tests rule claimed them.");
  for (const s of r.failedDropped || []) console.error(
    `CARRY-FORWARD DROPPED (not routed by this change): ${s}`);
  console.error(`budget fits ${r.secFit} s — ${r.testsFit} tests at the ${MEASURED.secPerTest} s fallback, measured specs at ` +
    `their own median (retries ${SELECTED_GATE.retries}, ${SELECTED_GATE.perTestTimeoutSec}s/test, surviving 1 timeout); ` +
    `selected ${r.testsSelected} tests, ${r.secSelected} s`);
  for (const s of r.overBudgetSpecs) console.error(
    `EXCLUDED (declares ${s.ownTimeoutSec}s test budget > gate ${SELECTED_GATE.perTestTimeoutSec}s): ${s.file}`);
  for (const s of r.coveredByFixedGates) console.error(
    `COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByVmTwin || []) console.error(
    `COVERED BY A VM TWIN ON THE NODE GATE: ${s.file} (${s.tests} tests) -> ${s.twin}`);
  for (const s of r.unreachable) console.error(
    `UNREACHABLE (declares ${s.tests} tests, over the whole ${r.secFit} s budget — this gate can ` +
    `NEVER run it): ${s.file}`);
  for (const s of r.skipped) console.error(`SKIPPED (over budget): ${s.file} (${s.tests} tests)`);
  for (const s of r.oversize) console.error(
    `OVERSIZE (outside the budget, packed by expected time, ~${s.sec} s` +
    `${s.overBudget ? `, cap from its own ${s.ownTimeoutSec}s/test` : ""}): ${s.file} (${s.tests} tests)`);
  for (const j of r.shards) console.error(
    `JOB ${j.name}: ${j.tests} tests, ~${j.sec} s expected, ${j.timeout} min cap${j.shard ? `, --shard=${j.shard}` : ""}: ${j.specs}`);
  // Printed LAST and loudly: this is the bucket that means the tool could not
  // read a candidate at all, which is the one state its report must never omit.
  for (const s of r.unreadable || []) console.error(
    `UNREADABLE (missing, renamed or unparseable — NOT selected and NOT covered): ${s.file}`);
  for (const s of r.selected) console.log(s.file);
  for (const s of r.oversize) console.log(s.file);
}
