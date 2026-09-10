#!/usr/bin/env node
// select-specs — per-SPEC change-aware selection for the blocking CI gate.
// @doc Per-SPEC change-aware selection for the blocking CI job: cuts at `select-budget` capacity and names every skip.
// @section runner
//
// tools/ci/pick-tests.mjs answers "which GROUPS does this change need" for a
// human with a 4-core box and no deadline. A CI job has a budget, and
// tools/ci/select-budget.mjs measured what fits: at 79.7 s/test (one worker,
// shared runner) a 15-minute budget surviving one failure holds ~10 tests at
// retries 0 / 120 s per-test — and per-GROUP selection (71-193 tests) does
// not fit at any budget worth spending. So this selects SPECS: the groups
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
//   node tools/ci/select-specs.mjs --since <ref> --budget-min 15
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pick } from "./pick-tests.mjs";
import { MEASURED, capacity, declaredTests } from "./select-budget.mjs";
import { isTwinned, TWINNED } from "./twinned-specs.mjs";
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
// helper) that does not fit the main budget is not dropped: it runs alone in
// its own matrix shard, billed at its own declared test count. Bounded, so a
// helper edit that touches 59 specs cannot fan out into 59 runners — the rest
// are named as skipped, which is the honesty contract this file has always had.
export const MAX_OVERSIZE_SHARDS = 3;
// Minutes a shard may take before the runner kills it: every test at the gate's
// per-test timeout, plus setup (npm ci + chromium, ~4 min) and margin. A killed
// job reads as "0 failures" in the aggregate, which this file's history shows
// hiding a dead deploy, so the cap is derived, never guessed.
export const shardTimeoutMin = (tests) =>
  Math.min(90, Math.ceil((tests * SELECTED_GATE.perTestTimeoutSec) / 60) + 6);

/** Cut the spec list to what fits `budgetMin` surviving one timeout.
 *  `rank(file)` orders the cut: lower ranks fill the budget first (prioritise()
 *  defines the scale — 0 edited, 1 previously failed, 2 imports a changed
 *  helper, 3 routed by a path rule), ties smallest-first. Affected specs
 *  (rank < 3) that miss the budget go to `oversize` instead of `skipped`. */
export function fit(specs, budgetMin, { rank = () => 3 } = {}) {
  const m = { ...MEASURED, ...SELECTED_GATE };
  const cap = capacity(budgetMin, 1, m);
  const counted = [], overBudgetSpecs = [], coveredByFixedGates = [], coveredByVmTwin = [];
  for (const file of specs) {
    const tests = declaredTests(file);
    if (tests == null) continue;
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
      coveredByVmTwin.push({ file, tests, twin: TWINNED[file] });
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
    if (own >= SELECTED_GATE.perTestTimeoutSec * 1000) {
      overBudgetSpecs.push({ file, tests, ownTimeoutSec: own / 1000 });
      continue;
    }
    counted.push({ file, tests });
  }
  // AFFECTED FIRST, then smallest-first. The cut used to be smallest-first
  // alone with the priority applied AFTER it as a mere reordering, so a changed
  // 10-test spec was omitted whenever smaller routed specs had already filled
  // the 10-test cap — the one spec the change most needed was the one dropped.
  // A budget that cannot afford the spec you just edited is not "change-aware".
  for (const r of counted) r.rank = rank(r.file);
  counted.sort((a, b) => a.rank - b.rank || a.tests - b.tests);
  const selected = [], skipped = [], unreachable = [], oversize = [];
  let used = 0;
  for (const r of counted) {
    // A spec bigger than the WHOLE cap can never be selected into the main
    // shard — not "did not fit today", but "cannot fit on any change, ever".
    // Naming it as merely skipped is what let multiplayer-session.spec.js (19
    // tests against a 10-test cap) sit red for weeks: every js/net change listed
    // it as skipped and nobody read a routine line. An AFFECTED one now runs in
    // its own shard (below); an unaffected one stays a visible REPORT — it
    // belongs in a fixed gate, or split, or its invariant needs a unit home.
    if (used + r.tests <= cap.tests) { selected.push(r); used += r.tests; continue; }
    if (r.rank < 3) oversize.push(r);
    else if (r.tests > cap.tests) unreachable.push(r);
    else skipped.push(r);
  }
  // The oversize list is bounded; the overflow is skipped BY NAME, never silently.
  const oversizeRun = oversize.slice(0, MAX_OVERSIZE_SHARDS);
  for (const r of oversize.slice(MAX_OVERSIZE_SHARDS)) skipped.push(r);
  return { selected, skipped, unreachable, oversize: oversizeRun, overBudgetSpecs, coveredByFixedGates, coveredByVmTwin,
    testsSelected: used, testsFit: cap.tests, cap };
}

/** The matrix the CI gate runs: one shard for the budgeted selection, one per
 *  oversize affected spec, each with the derived cap it is billed at. */
export function shards(r) {
  const out = [];
  if (r.selected.length) out.push({ name: "selected", specs: r.selected.map((s) => s.file).join(" "),
    tests: r.testsSelected, timeout: shardTimeoutMin(r.testsFit) });
  for (const s of r.oversize || []) out.push({ name: `oversize-${path.basename(s.file, ".spec.js")}`,
    specs: s.file, tests: s.tests, timeout: shardTimeoutMin(s.tests) });
  return out;
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
  /^tools\/(manifest\.cjs|pick-tests\.mjs|select-specs\.mjs|select-budget\.mjs|run-playwright\.mjs)$/,
  /^tests\/helpers\/(fixtures|global-setup|live-reporter)\.js$/,  // EVERY spec's plumbing
  /^\.github\//,                      // the job that runs the selection
  /^(index\.html|sw\.js|version\.json)$/,   // the shell, its precache, its cache key
  /^tests\/data\//,                   // data-driven inputs: no import graph sees these
];

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
// by the FIXED smoke gate (smoke.spec.js, four shards), so routing it here
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

export function select(changedRef, budgetMin = 15, opts = {}) {
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
  const tracked = changed.filter((f) => TRACKED.some((re) => re.test(f)));
  const docsOnly = isDocsOnly(changed);
  // The three always-run inputs, unioned into the candidate set BEFORE the cut
  // so they compete for the budget on merit rather than being bolted on after.
  const changedSpecs = changed.filter((f) => /^tests\/specs\/.+\.spec\.js$/.test(f)
    && fs.existsSync(path.join(ROOT, f)));
  const imported = specsImporting(changed);
  const failed = (opts.failed || []).filter((f) => fs.existsSync(path.join(ROOT, f)));
  const routed = [...new Set([...changedSpecs, ...imported, ...specs])];
  const { inScope: failedInScope, dropped: failedDropped } = scopeCarryForward(failed, routed);
  const candidates = routed;
  const reason = !changed.length ? "none"
    : docsOnly ? "docs"
    : tracked.length ? "infra"
    : (g.size || candidates.length ? "matched" : "unmatched");
  const rank = (f) => changedSpecs.includes(f) ? 0 : failedInScope.includes(f) ? 1
    : imported.includes(f) ? 2 : 3;
  const cut = fit(candidates, budgetMin, { rank });
  // "infra" no longer EMPTIES the selection. A tracked-path change (the shell,
  // a fixture every spec imports, this selector) can affect any spec, which is
  // a reason to distrust the routing, not a reason to run nothing: the specs
  // this diff edited or imports are still the best-evidenced ones to run, and
  // the fixed gates still own the rest. The warning stays so the log says why
  // the selection is narrower than the change.
  const r = { reason, changed: changed.length, tracked, groups: browserGroups, bootCoveredBySmoke,
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
  const r = select(argv[si + 1], bi >= 0 ? Number(argv[bi + 1]) : 15, { failed });
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
  console.error(`budget fits ${r.testsFit} tests (retries ${SELECTED_GATE.retries}, ` +
    `${SELECTED_GATE.perTestTimeoutSec}s/test, surviving 1 timeout); selected ${r.testsSelected}`);
  for (const s of r.overBudgetSpecs) console.error(
    `EXCLUDED (declares ${s.ownTimeoutSec}s test budget > gate ${SELECTED_GATE.perTestTimeoutSec}s): ${s.file}`);
  for (const s of r.coveredByFixedGates) console.error(
    `COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByVmTwin || []) console.error(
    `COVERED BY A VM TWIN ON THE NODE GATE: ${s.file} (${s.tests} tests) -> ${s.twin}`);
  for (const s of r.unreachable) console.error(
    `UNREACHABLE (declares ${s.tests} tests > the whole ${r.testsFit}-test cap — this gate can ` +
    `NEVER run it): ${s.file}`);
  for (const s of r.skipped) console.error(`SKIPPED (over budget): ${s.file} (${s.tests} tests)`);
  for (const s of r.oversize) console.error(
    `OVERSIZE (affected by this change, runs in its own shard, ${shardTimeoutMin(s.tests)} min cap): ${s.file} (${s.tests} tests)`);
  for (const s of r.selected) console.log(s.file);
  for (const s of r.oversize) console.log(s.file);
}
