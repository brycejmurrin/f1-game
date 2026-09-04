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
// 240 s, matching MEASURED.perTestTimeoutSec in ./select-budget.mjs and the
// --timeout ci.yml already gives physics-characterization. This gate was the
// ONLY place running at half that, and the gap was not survivable: a spec that
// builds a circuit costs 190-225 s on these runners, so the 120 s cap sat at
// roughly HALF the price of the work and turned healthy specs into false reds
// whenever a diff first selected them.
//
// OBSERVED on the runs it blocked, all on 2026-09-04:
//   physics-fixes  Monaco          killed at 120 s, job line 224.5 s
//   albert-park    run 2020        killed at 120 s, job line 194.0 s
//   parts-ers      run 2002        killed at 120 s, job lines 195.1/175.4/150.9 s
//   abudhabi night run 2020        died in context SETUP at the 120 s mark
// READ THOSE NUMBERS CAREFULLY. The larger figure is wall time until Playwright
// gave up AND finished tearing down, not what the test needed: each was killed
// at exactly 120 s and the remainder is timeout handling on a loaded runner. So
// what is actually established is that these tests need MORE than 120 s and
// their true cost is UNKNOWN — not that they fit in any particular larger
// number. 240 is chosen because it is MEASURED.perTestTimeoutSec, the value
// ci.yml already gives the smoke shards and physics-characterization for the
// same kind of circuit-building work, not because a test was seen finishing in
// it. If 240 still proves short the evidence will say so the same way, and the
// next move is a measurement of what a circuit build actually costs here rather
// than another doubling.
// Pages runs 2015 and 2020 both failed at this gate and SKIPPED the deploy job,
// so nothing published all day.
//
// SPEND IS UNCHANGED: capacity() prices a failure at timeout x (1 + retries),
// so doubling this halves the test count the same budget affords. The gate
// trades breadth for a per-test allowance that matches what a test costs —
// which is the right trade, because a cap below the work's cost does not buy
// coverage, it buys false reds.
//
// The three patches before this one — FIXED_GATE_SPECS, then seven specs
// declaring their own budgets — were all treating symptoms of this number.
export const SELECTED_GATE = { retries: 0, perTestTimeoutSec: 240 };

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

/** Cut the spec list to what fits `budgetMin` surviving one timeout. */
export function fit(specs, budgetMin) {
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
    // >=, not >: a spec that declares the WHOLE gate has no headroom for runner
    // variance, and runner variance is the entire lesson here — parts-ers ran
    // 29.4 s locally against 195 s on CI, a 6.6x stretch. Selecting a spec whose
    // own declaration says it may need every second the gate has is selecting a
    // coin flip. At 240 s this keeps the four specs declaring exactly 240 out
    // while admitting the ones declaring 180, which genuinely fit.
    if (own >= SELECTED_GATE.perTestTimeoutSec * 1000) {
      overBudgetSpecs.push({ file, tests, ownTimeoutSec: own / 1000 });
      continue;
    }
    counted.push({ file, tests });
  }
  counted.sort((a, b) => a.tests - b.tests);
  const selected = [], skipped = [], unreachable = [];
  let used = 0;
  for (const r of counted) {
    // A spec bigger than the WHOLE cap can never be selected — not "did not fit
    // today", but "cannot fit on any change, ever", because the cut is greedy
    // smallest-first. Naming it as merely skipped is what let
    // multiplayer-session.spec.js (19 tests against a 10-test cap) sit red for
    // weeks: every js/net change listed it as skipped and nobody read a routine
    // line. Separating the two turns a permanent hole into a visible one — the
    // spec still does not run here, so this is a REPORT, not a fix: it belongs
    // in a fixed gate, or split, or its invariant needs a cheap unit home.
    if (r.tests > cap.tests) { unreachable.push(r); continue; }
    if (used + r.tests <= cap.tests) { selected.push(r); used += r.tests; }
    else skipped.push(r);
  }
  return { selected, skipped, unreachable, overBudgetSpecs, coveredByFixedGates, coveredByVmTwin,
    testsSelected: used, testsFit: cap.tests, cap };
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
  // The three always-run inputs, unioned into the candidate set BEFORE the cut
  // so they compete for the budget on merit rather than being bolted on after.
  const changedSpecs = changed.filter((f) => /^tests\/specs\/.+\.spec\.js$/.test(f)
    && fs.existsSync(path.join(ROOT, f)));
  const imported = specsImporting(changed);
  const failed = (opts.failed || []).filter((f) => fs.existsSync(path.join(ROOT, f)));
  const candidates = [...new Set([...changedSpecs, ...failed, ...imported, ...specs])];
  const reason = !changed.length ? "none"
    : tracked.length ? "infra"
    : (g.size || candidates.length ? "matched" : "unmatched");
  const cut = fit(candidates, budgetMin);
  const r = { reason, changed: changed.length, tracked, groups: browserGroups, bootCoveredBySmoke,
              changedSpecs, imported, failed, ...cut,
              selected: prioritise(cut.selected, { changedSpecs, failed, imported }) };
  // On "infra" the selection is reported but NOT run — the gates own that push.
  if (reason === "infra") { r.skipped = [...r.selected, ...r.skipped]; r.selected = []; r.testsSelected = 0; }
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
    `SELECTION NOT MEANINGFUL: this diff touches ${r.tracked.length} tracked/infra path(s) ` +
    `(${r.tracked.slice(0, 4).join(", ")}${r.tracked.length > 4 ? ", …" : ""}) — a change there can affect ` +
    `any spec, so nothing is selected and the GATES own this push.`);
  if (r.reason === "unmatched") console.error(
    "SELECTION NOT TRUSTWORTHY: files changed but no pick-tests rule claimed them.");
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
  for (const s of r.selected) console.log(s.file);
}
