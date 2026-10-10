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
import { createRequire } from "node:module";
import { pick, stripSpecOwner } from "./pick-tests.mjs";
import { MEASURED, capacity, declaredTests, specSecPerTest, timings } from "./select-budget.mjs";
import { loadDb, TIMINGS_FILE } from "./spec-timings.mjs";
import { ADAPTED, ADAPTED_RUNNER, isTwinned, twinOf } from "./twinned-specs.mjs";
import { changedPaths } from "../lib/changed-files.mjs";
import { changeKind } from "./change-kind.mjs";
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

// Opt-in / manual specs: the body is behind an env gate (APEX_SHIMMER=1) and
// nightly-group.mjs lists them as manual with no pass/fail verdict. Selecting
// them without the env makes every test SKIP and the runner treat "all
// skipped" as RED (PR #968 sync: T2 circuit-racing routed material-shimmer
// after a fleet props-tris remeasure). Keep them named in the report; never
// put them on a selected command.
export const MANUAL_OPT_IN_SPECS = new Set([
  "tests/specs/material-shimmer.spec.js",
]);

/** Fold a numeric constant expression: literals, `+ - * /`, unary `-`, and a
 *  top-level const identifier already in `env` (a Map name -> number). Null
 *  when any part is not constant (15-F4: `BOOT_MS + 240_000`). */
function foldNum(n, env) {
  if (!n) return null;
  if (n.type === "Literal") return typeof n.value === "number" ? n.value : null;
  if (n.type === "Identifier") return env.has(n.name) ? env.get(n.name) : null;
  if (n.type === "UnaryExpression" && (n.operator === "-" || n.operator === "+")) {
    const v = foldNum(n.argument, env);
    return v === null ? null : (n.operator === "-" ? -v : v);
  }
  if (n.type === "BinaryExpression") {
    const a = foldNum(n.left, env), b = foldNum(n.right, env);
    if (a === null || b === null) return null;
    switch (n.operator) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? null : a / b;
      default: return null;
    }
  }
  return null;
}

/** name -> number for every top-level `const X = <constant expr>` (exported or
 *  not) in a parsed module, plus the same from the relative modules it imports
 *  (BOOT_MS lives in tests/helpers/fixtures.js). */
function constEnv(ast, dir, depth = 0) {
  const env = new Map();
  if (depth < 3) {
    for (const d of ast.body) {
      if (d.type !== "ImportDeclaration" || !String(d.source.value).startsWith(".")) continue;
      let sub;
      try {
        const f = path.resolve(dir, d.source.value);
        sub = constEnv(espree.parse(fs.readFileSync(f, "utf8"), { ecmaVersion: "latest", sourceType: "module" }), path.dirname(f), depth + 1);
      } catch { continue; }
      for (const sp of d.specifiers) if (sp.type === "ImportSpecifier" && sub.has(sp.imported.name)) env.set(sp.local.name, sub.get(sp.imported.name));
    }
  }
  for (const d of ast.body) {
    const decl = d.type === "ExportNamedDeclaration" ? d.declaration : d;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") continue;
    for (const v of decl.declarations) {
      if (v.id?.type !== "Identifier") continue;
      const n = foldNum(v.init, env);
      if (n !== null) env.set(v.id.name, n);
    }
  }
  return env;
}

/** Largest test.setTimeout(N) a spec declares, in ms — 0 when none.
 *  THE COST MODEL'S BLIND SPOT, measured on CI run 31233088772: the selector
 *  billed every test at ~80 s, but 8 of the 10 specs it picked declare their
 *  own test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout —
 *  so a "14-minute" selection signed up for 3-7 minutes per test and failed
 *  the job. A spec that reserves more than the selected gate's per-test budget
 *  cannot be billed at those rates and is excluded by name.
 *
 *  The argument is constant-folded (15-F4, 2026-10-10): `BOOT_MS + 240_000`
 *  (garage-out-before-card, 285 s) read as 0 while only literals counted. An
 *  argument that is NOT constant (a variable, a call) is unknown, and unknown
 *  is billed as `test.slow()` — over the cap — never as free. */
export function maxDeclaredTimeout(file) {
  let ast, env;
  try {
    const abs = path.join(ROOT, file);
    ast = espree.parse(fs.readFileSync(abs, "utf8"), { ecmaVersion: "latest", sourceType: "module" });
    env = constEnv(ast, path.dirname(abs));
  } catch { return 0; }
  const UNKNOWN = 3 * SELECTED_GATE.perTestTimeoutSec * 1000;
  let max = 0;
  const declared = (arg) => {
    const v = foldNum(arg, env);
    return v === null ? UNKNOWN : v;
  };
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.type === "CallExpression" && x.callee?.type === "MemberExpression"
        && x.callee.object?.name === "test" && x.callee.property?.name === "setTimeout"
        && x.arguments?.[0]) {
      max = Math.max(max, declared(x.arguments[0]));
    }
    // `test.describe.configure({ timeout })` reserves a budget the same way
    // test.setTimeout does (image-grade-visual 480 s, instanced-draw 420 s were
    // invisible to this walker and selectable), and `test.slow()` triples the
    // gate's per-test timeout.
    if (x.type === "CallExpression" && x.callee?.type === "MemberExpression"
        && x.callee.property?.name === "configure" && x.arguments?.[0]?.type === "ObjectExpression") {
      for (const p of x.arguments[0].properties || []) {
        if (p.key && (p.key.name === "timeout" || p.key.value === "timeout") && p.value) max = Math.max(max, declared(p.value));
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
// Raised to 4 (2026-10-07): terrain-over-road billed at its real 56 tests
// (select-budget.mjs auditTracks()) is ~767 s, so on a wide diff it takes an
// oversize slot beside hud-layout and career — at 3, props-over-road (416 s,
// too big for overflow) spilled to skipped and dropped=1 red the verdict on
// the #1180 tip's plan (`--since 2f50ad2c`). 4 carries all four. The unit
// test still bounds this at 4.
export const MAX_OVERSIZE_SHARDS = 4;
// A ROUTED spec that loses the budget to smaller ones is not dropped either: up
// to this many TARGET_SHARD_SEC jobs' worth of them ride as OVERFLOW, which
// shards() packs with everything else. Before this, "SKIPPED (over budget)"
// was the verdict for a routed spec on every diff that also routed smaller
// ones, so menu-traversal and ui-redesign broke on the deploy branch after two
// menu PRs and only the 11-night rota would ever have run them (2026-09-29).
// Leftovers are still skipped BY NAME — and since 2026-10-04 a name is a RED
// on a pull request (ci.yml selected-verdict fails on dropped > 0), so the
// allowance is sized to carry a typical multi-area diff: `--since HEAD~10` on
// the 2026-10-04 tip (67 files) squeezed out 14 routed specs, ~1,900 s of
// expected work, which two jobs' worth dropped and six carry. Raised to 7
// (2026-10-04, PR #915): a synced 84-file bug-hunt batch with the
// bot/spec-timings overlay still dropped tracks-walls + props-over-road at 6
// (overflow 2740/2880 s) and cleared both at 7. Raised to 8 (2026-10-05,
// PR #951): a synced bug-hunt batch with the failing-spec hoist dropped
// tracks-walls + dev-tools at 7 (Selected specs verdict on run 37327254206).
// Raised to 9 (2026-10-06, PR #1077): a wide UI diff (Home resize + layers
// :modal ranking) packed 21 overflow specs and dropped hud-layout.spec.js
// (32 tests, ~182 s measured) with dropped=1 on run 37438922786.
// Raised to 11 (2026-10-06, PR #1021): after taking js/game.js and the
// fixtures.js re-export out of the garage-defaults diff (GarageDefaults still
// supplies Mercedes on a miss), bot/spec-timings still billed hud-layout at
// 829 s — over one TARGET_SHARD_SEC job, so overflow refused it at 9 even
// with leftover room. 10 shards still dropped dev-tools (129 s) after
// hud-layout took the leftover; 11 carries both. A sibling 9→12 raise on
// 7cf57c60d is superseded: routing shrink makes 12 unnecessary.
export const MAX_OVERFLOW_SHARDS = 11;
// SPILL, NOT SKIP (2026-10-07, PR #1204). When the overflow room is full a
// leftover used to land in `skipped`: the selected-failed hoist plus the
// bot/spec-timings overlay filled all 11 overflow jobs and dev-tools.spec.js
// (56 tests) ran nowhere, so the verdict went red on a spec that passes
// (remote-group run 37665046433 on 5f2e64b82: 74/74). Leftovers now ride a
// bounded SPILL leg of this many TARGET_SHARD_SEC jobs' worth, packed into
// their own `spill-<k>` jobs and logged with a SPILL line. Only what the spill
// cannot carry is left in `skipped`, and that is reported as an ERROR (never
// a quiet skip): it runs nowhere and the verdict reds on it.
// PR #1289, CI 38010342804: the exact timing overlay and failing-spec hoist
// filled 717 of 720 spill seconds, dropping props-over-road (374 s) and
// parts-physics (70 s). One extra allowance merely displaced dev-tools;
// four carry every candidate with two extra matrix jobs. Keep the verdict
// strict: anything beyond this bounded allowance is still a named failure.
export const MAX_SPILL_SHARDS = 4;
// ROUTED DECLARED-SLOW SPECS RUN TOO (2026-10-04). A spec that declares a
// per-test timeout >= the gate's 180 s and is merely ROUTED (rank 3) used to
// land in overBudgetSpecs and never run on any PR or train: 41 of them on
// `--since HEAD~10` (career, gamepad, menu-keyboard, quali, camera-tuner,
// webgl/tlx probes, ui-scale, 13 circuit foundations…), covered only by the
// 11-night rota, while post-edit.sh told every new spec author to declare
// > 180 s to join them. They now ride in their OWN pool — packed into
// `overbudget-<k>` jobs, never beside the budgeted specs, each job's kill
// timer derived from the largest declared per-test figure it carries — with
// its own allowance of this many TARGET_SHARD_SEC jobs. Only what that pool
// cannot afford is left in overBudgetSpecs, by name, and on a pull request a
// name is a red verdict.
export const MAX_OVER_BUDGET_SHARDS = 8;

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
export const TARGET_SHARD_SEC = 360;
// Passing selected legs should finish in about 10 minutes of runner time
// (career shards were 27-34 min because shardCapMin priced three 540 s
// timeouts). The kill timer is a ceiling for a passing run plus setup, not
// "every test times out". --max-failures still stops a red early.
export const MAX_SELECTED_JOB_MIN = 10;
// Fat UI files (career*, hud-layout) cannot use Playwright --shard (it
// splits GROUPS). One job, 2 workers. PR #1075 run 37446472987: career
// 27/37 passed then cancelled at 9 min (~39 s/test); career-season 15/36
// at 6 min (~46 s/test). spec-timings still reflect fake-shard leftovers
// so billed seconds are a lie; floor the plan and the kill timer here.
export const FAT_UI_SEC_PER_TEST = 45;
export const FAT_UI_SELECTED_JOB_MIN = 18;
// Over-budget / high-timeout specs (career, hud-layout): Playwright --shard
// so each leg has this many tests, not one 30-minute packed file.
export const MAX_TESTS_PER_JOB = 8;
// Specs that declare this much (or more) per test NEVER share a selected job.
// terrain-over-road still declares 1500 s for an all-circuits walk (props-
// over-road left that set on 2026-09-30 — one test per circuit at 120 s);
// billed at the unmeasured fallback they look like 8–38 s and pack next to a
// title-menu or foundation Navigate. Under llvmpipe that walk then runs for
// 5–10 min, poisons Chromium, and the next page.goto hangs at the 180 s gate
// (PR #604 runs 36817164457 / 36815567820: ERR_ABORTED / Navigate 190 s on the
// same worker; siblings on a fresh worker pass in ~8 s). menu-baseline is solo
// for goldens; these are solo so nothing inherits their browser.
export const SOLO_OWN_TIMEOUT_SEC = 3 * SELECTED_GATE.perTestTimeoutSec;

/** True when a concrete spec file declares a solo-class per-test budget
 *  (terrain-over-road's 1500 s all-circuits walk; props-over-road left that
 *  set on 2026-09-30 — one test per circuit at 120 s). */
export function isMegaSweepSpec(file) {
  if (!file || typeof file !== "string") return false;
  const rel = file.replace(/^\.\//, "");
  if (!/\.spec\.js$/.test(rel) || rel.includes("*")) return false;
  try {
    if (!fs.existsSync(path.join(ROOT, rel))) return false;
  } catch { return false; }
  return maxDeclaredTimeout(rel) / 1000 >= SOLO_OWN_TIMEOUT_SEC;
}

/** Peel mega-sweep specs out of a Playwright argv so they never share a
 *  Chromium with siblings. The selected gate already solos them (shards());
 *  browser-group.yml / `npm run test:circuits -- --shard=i/n` still packs them
 *  via Playwright's count shard — run 36911235525: props-over-road 410 s then
 *  qatar-foundation Navigate hung 190 s on the same worker (retry on a fresh
 *  worker: 23.6 s). `run-playwright.mjs` uses this so every group path inherits
 *  the same isolation. Flags and globs stay in `rest`. */
export function partitionMegaSweepArgs(args) {
  const mega = [], rest = [];
  for (const a of args || []) {
    if (isMegaSweepSpec(a)) mega.push(a);
    else rest.push(a);
  }
  // Selected-gate oversize jobs are already a SINGLE mega + --shard=i/n
  // (tlx-probes test.slow() → 540 s). Peeling dropped --shard (megaSoloFlags)
  // and ran all 17 tests on shard 1 inside a 6 min cap billed for 6 tests
  // (PR #1113 job 112373879955; siblings 2/3 and 3/3 were empty greens).
  // Only peel when a mega shares the argv with another spec file.
  const specLike = (a) => typeof a === "string" && !a.startsWith("-")
    && (/\.spec\.js$/.test(a) || a.includes("*") || /^tests\//.test(a));
  const otherSpecs = rest.filter(specLike);
  if (mega.length === 1 && otherSpecs.length === 0) {
    return { mega: [], rest: args || [], peeled: false };
  }
  return { mega, rest, peeled: mega.length > 0 };
}

/** Parse `--shard=i/n` or `--shard i/n` from argv. null when unsharded. */
export function playwrightShard(args) {
  const list = args || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    let m = /^--shard=(\d+)\/(\d+)$/.exec(a);
    if (!m && a === "--shard") m = /^(\d+)\/(\d+)$/.exec(list[i + 1] || "");
    if (m) return { index: +m[1], total: +m[2] };
  }
  return null;
}

/** WHICH SHARD RUNS EACH MEGA SOLO (test audit T1, 2026-10-05). Every peeled
 *  mega ran on shard 1, so the nightly modes group put career (101 tests) AND
 *  quali (20) on one runner: shard 1 1827 s against 185/276/410 s for 2-4
 *  (run 37195789273); hooks 1040 s vs 170/111/229 s. Longest-first onto the
 *  least-loaded shard (LPT) spreads them by expected seconds — declared tests
 *  x the spec's per-test rate. The rate comes from the COMMITTED timings file
 *  only, never the APEX_SPEC_TIMINGS overlay: every shard must compute the
 *  same plan from the same commit, or a mega runs twice or not at all. Ties
 *  break on the path, so the plan is a pure function of (megas, total). */
export function megaShardPlan(mega, total, db = loadDb(path.join(ROOT, TIMINGS_FILE))) {
  const plan = new Map();
  if (!(total >= 1)) return plan;
  const rows = [...new Set(mega)].map((f) => ({ f, sec: (declaredTests(f) || 1) * specSecPerTest(f, db).sec }))
    .sort((a, b) => b.sec - a.sec || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  const load = new Array(total).fill(0);
  for (const r of rows) {
    let k = 0;
    for (let i = 1; i < total; i++) if (load[i] < load[k]) k = i;
    load[k] += r.sec;
    plan.set(r.f, k + 1);
  }
  return plan;
}

/** The peeled megas THIS invocation runs: all of them unsharded, else the
 *  ones megaShardPlan gives this shard. Each mega runs on exactly one shard. */
export function megasForThisShard(args, mega, db) {
  const s = playwrightShard(args);
  if (!s) return [...mega];
  const plan = megaShardPlan(mega, s.total, db);
  return mega.filter((f) => plan.get(f) === s.index);
}

/** Flags to keep when launching a peeled mega solo (drop --shard so Playwright
 *  does not skip the only file). */
export function megaSoloFlags(args) {
  const out = [];
  const list = args || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === "--shard" || /^--shard=/.test(a)) {
      if (a === "--shard") i++;
      continue;
    }
    if (a.startsWith("-")) out.push(a);
  }
  return out;
}

// Minutes a job may take before the runner kills it: twice its expected work
// (runner variance), plus MAX_FAILURES timeouts at the slowest per-test
// timeout in it, plus setup (npm ci + chromium + Mesa) and margin. A ceiling,
// not the spend: a passing run never approaches it. A killed job reads as
// "0 failures", which this file's history shows hiding a dead deploy, so the
// cap is derived from the plan, never guessed.
export const shardCapMin = (expectedSec, _perTestSec = SELECTED_GATE.perTestTimeoutSec, maxMin = MAX_SELECTED_JOB_MIN) => {
  const setupMin = 3;
  // Wrap-up (junit upload) + Mesa apt variance. PR #1109 image-grade-visual
  // 1of2: 5/5 passed in 379 s after 113 s Mesa; the 8 min cap (workMin 5 +
  // setup 3) killed the job during artifact upload. PR #1113 tlx-probes 1of3
  // billed 6 tests / 6 min then mega-peel dropped --shard and ran all 17.
  const wrapMin = 2; // selected wrap-up headroom (PR #1109/#1113/#1114)
  const workMin = Math.ceil(Math.max(0, expectedSec) / 60);
  return Math.min(maxMin, Math.max(6, workMin + setupMin + wrapMin));
};

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
export function fit(specs, budgetMin, { rank = () => 3, db = timings(), overflowShards = MAX_OVERFLOW_SHARDS,
  overBudgetShards = MAX_OVER_BUDGET_SHARDS, spillShards = MAX_SPILL_SHARDS, staleFirst = false } = {}) {
  const m = { ...MEASURED, ...SELECTED_GATE };
  const cap = capacity(budgetMin, 1, m);
  const allowanceSec = cap.budgetSec - cap.perFailureSec + m.secPerTest;
  const costOf = (r) => r.tests * specSecPerTest(r.file, db).sec;
  const counted = [], overBudgetSpecs = [], coveredByFixedGates = [], coveredByManualOptIn = [], coveredByVmTwin = [];
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
    if (MANUAL_OPT_IN_SPECS.has(file)) {
      coveredByManualOptIn.push({ file, tests });
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
  // STALE FIRST (the nightly lane): among equals, the spec whose last recorded
  // CI run is OLDEST goes first — never-run before everything — so a day's
  // union diff, which routes nearly every spec, spends its jobs on the specs
  // nothing has run lately rather than on the smallest ones.
  const lastRun = (f) => { const x = db && db.specs && db.specs[f]; const arr = (x && x.s) || []; return arr.length ? arr[arr.length - 1][0] : ""; };
  const order = staleFirst
    ? (a, b) => a.rank - b.rank || (lastRun(a.file) < lastRun(b.file) ? -1 : lastRun(a.file) > lastRun(b.file) ? 1 : 0) || a.tests - b.tests
    : (a, b) => a.rank - b.rank || a.tests - b.tests;
  counted.sort(order);
  const selected = [], skipped = [], unreachable = [], oversize = [], overBudgetPool = [];
  let used = 0, usedSec = 0;
  for (const r of counted) {
    // An over-budget spec never joins the budgeted set. Affected (rank < 3)
    // it runs outside it, its job's cap derived from its own declared timeout;
    // merely routed, it joins the over-budget pool (MAX_OVER_BUDGET_SHARDS).
    if (r.overBudget) {
      if (r.rank < 3) oversize.push(r);
      else overBudgetPool.push(r);
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
  // Largest expected workloads first, priority for ties. A small hoisted
  // failure must not evict a larger required suite that cannot fit another
  // pool. Main/overflow/spill still run failures first; all suites must run.
  oversize.sort((a, b) => expectedSec(b, db) - expectedSec(a, db) || a.rank - b.rank);
  const oversizeRun = oversize.slice(0, MAX_OVERSIZE_SHARDS);
  // An over-budget spill must NOT fall into skipped → overflow. Overflow bills
  // at the measured/fallback rate, so a 1500 s all-circuits sweep looks like
  // 8 s, packs into a shared selected job, and poisons the next Navigate
  // (PR #604). Keep it SKIPPED by name; the overflow filter below also
  // refuses it so a future order change cannot re-admit it.
  // A declared-slow spill goes to the over-budget pool instead, which bills it
  // in its own jobs with its own declared per-test figure.
  for (const r of oversize.slice(MAX_OVERSIZE_SHARDS)) (r.overBudget ? overBudgetPool : skipped).push(r);
  // OVERFLOW: skipped specs that fit one job each, up to `overflowShards` jobs'
  // worth of expected seconds, in the same order as the budgeted cut.
  // Never overflow a mega-sweep (overBudget with a solo-class declaration, or
  // ownTimeoutSec past SOLO_OWN_TIMEOUT_SEC): its fallback bill is a lie about
  // wall time, and packing it is how props/terrain-over-road reached selected
  // next to a Navigate victim (PR #604). Ordinary gate-boundary declarations
  // (180 s) may still overflow — they are not the all-circuits poison class.
  const overflow = [];
  {
    let room = overflowShards * TARGET_SHARD_SEC;
    const left = [];
    skipped.sort(order);
    for (const r of skipped) {
      const sec = r.sec != null ? r.sec : Math.round(expectedSec(r, db));
      const own = r.ownTimeoutSec || 0;
      // A solo-class declaration never packs as overflow: it goes to the
      // over-budget pool below, whose jobs shards() gives it alone.
      if (own >= SOLO_OWN_TIMEOUT_SEC) { overBudgetPool.push(r); continue; }
      // A leftover billed over TARGET_SHARD_SEC still runs as overflow while
      // room lasts (PR #1021: hud-layout 829 s). shards() splits it the same
      // way the over-budget pool does. Solo-class stays diverted above.
      if (sec <= room) { overflow.push(r); room -= sec; } else left.push(r);
    }
    skipped.length = 0;
    skipped.push(...left);
  }
  // TOO BIG FOR ONE OVERFLOW JOB (2026-10-06, PR #1021). Overflow only packs
  // specs that fit TARGET_SHARD_SEC. A leftover billed over that — hud-layout
  // at 829 s on bot/spec-timings, Selected-specs verdict dropped=21 then
  // dropped=1 on run 37472255445 — cannot ride there even with spare overflow
  // seconds. Promote it to oversize while a slot remains: shards() already
  // splits oversize items across --shard=i/n. Solo-class declarations stay
  // in skipped for the over-budget pool below.
  {
    const keep = [];
    for (const r of skipped) {
      const sec = r.sec != null ? r.sec : Math.round(expectedSec(r, db));
      const own = r.ownTimeoutSec || 0;
      if (own >= SOLO_OWN_TIMEOUT_SEC) { keep.push(r); continue; }
      if (sec > TARGET_SHARD_SEC && oversizeRun.length < MAX_OVERSIZE_SHARDS) oversizeRun.push(r);
      else keep.push(r);
    }
    skipped.length = 0;
    skipped.push(...keep);
  }
  // THE SPILL LEG (MAX_SPILL_SHARDS, above): what overflow and the oversize
  // promotion could not place, up to `spillShards` jobs' worth, in the same
  // order. Solo-class declarations never spill (the over-budget pool owns them).
  const spill = [];
  {
    let room = spillShards * TARGET_SHARD_SEC;
    const keep = [];
    for (const r of skipped) {
      const sec = r.sec != null ? r.sec : Math.round(expectedSec(r, db));
      if ((r.ownTimeoutSec || 0) < SOLO_OWN_TIMEOUT_SEC && sec <= room) { spill.push(r); room -= sec; }
      else keep.push(r);
    }
    skipped.length = 0;
    skipped.push(...keep);
  }
  // THE OVER-BUDGET POOL: up to `overBudgetShards` jobs' worth of expected
  // seconds, in the same order as the budgeted cut. A spec whose own expected
  // run exceeds a job is still admitted while room lasts — shards() splits it
  // with --shard=i/n. What does not fit is named in overBudgetSpecs (dropped).
  const overBudgetRun = [];
  {
    let room = overBudgetShards * TARGET_SHARD_SEC;
    overBudgetPool.sort(order);
    for (const r of overBudgetPool) {
      const sec = r.sec != null ? r.sec : Math.round(expectedSec(r, db));
      if (sec <= room) { overBudgetRun.push(r); room -= sec; continue; }
      overBudgetSpecs.push({ file: r.file, tests: r.tests, ownTimeoutSec: r.ownTimeoutSec });
    }
    // Ordinary leftovers may use reserved capacity left AFTER the pool's
    // existing slow candidates. A changed failure cache must not strand room
    // while dropping terrain or parts. Isolate each fallback so it cannot
    // inherit another candidate's longer per-test timeout when packed.
    const keep = [];
    for (const r of skipped) {
      const sec = r.sec != null ? r.sec : Math.round(expectedSec(r, db));
      if (sec <= room) {
        overBudgetRun.push({ ...r, capacityFallback: true }); room -= sec;
      } else keep.push(r);
    }
    skipped.length = 0;
    skipped.push(...keep);
  }
  return { selected, skipped, unreachable, oversize: oversizeRun, overflow, spill, overBudgetRun, overBudgetSpecs, coveredByFixedGates, coveredByManualOptIn, coveredByVmTwin,
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
 *  Three kinds of item never share a job: a `--shard` piece (the flag applies
 *  to the whole command), a spec carrying menu-baseline (its goldens are
 *  SwiftShader captures, so ci.yml drops llvmpipe for any job naming it), and
 *  a mega-sweep whose declared per-test budget is SOLO_OWN_TIMEOUT_SEC or more
 *  (all-circuits props/terrain walks — see that constant). The over-budget
 *  pool (routed specs declaring >= the gate's per-test timeout) packs in its
 *  OWN bins, `overbudget-<k>`, so a declared 300-540 s figure never raises the
 *  kill timer of the budgeted jobs.
 *
 *  EVERY JOB NAME IS UNIQUE (2026-10-04). The budgeted bins were all named
 *  `selected`, and ci.yml keyed the failing-spec cache and the timings
 *  artifact on the name: run 37198214523's three `selected` jobs raced for one
 *  cache key (two "Unable to reserve cache") and uploaded three artifacts
 *  called `spec-timings-junit-selected-selected`. Budgeted bins are now
 *  `selected-<i>`, and a final pass suffixes any repeat. */
export function shards(r, db = timings()) {
  const items = [];
  const cost = (x) => (x.sec != null ? x.sec : expectedSec(x, db));
  for (const s of [...(r.selected || []).map((x) => ({ ...x, budgeted: true })), ...(r.oversize || []), ...(r.overflow || []),
                   ...(r.overBudgetRun || []).map((x) => ({ ...x, pool: true })),
                   ...(r.spill || []).map((x) => ({ ...x, pool: "spill" }))]) {
    const sec = cost(s);
    const perTest = Math.max(SELECTED_GATE.perTestTimeoutSec, s.ownTimeoutSec || 0);
    const base = path.basename(s.file, ".spec.js");
    const nTime = Math.max(1, Math.ceil(sec / TARGET_SHARD_SEC));
    const nTests = (s.ownTimeoutSec || 0) >= SELECTED_GATE.perTestTimeoutSec
      ? Math.max(1, Math.ceil(s.tests / MAX_TESTS_PER_JOB))
      : 1;
    // Pages 37420997285 job oversize-career-1of5: Playwright --shard splits
    // TEST GROUPS, not tests. A default-mode describe is one group, so shard
    // 1/5 of career.spec.js ran ~101 tests (~22 min) while 2–5 finished in
    // ~40 s. Fat UI files (career*, hud-layout) get 2 workers on ONE job
    // instead of a fake even --shard.
    const fatUi = /(?:^|\/)(career|career-season|career-hub|hud-layout)\.spec\.js$/.test(s.file);
    if (fatUi) {
      const workers = 2;
      const secFat = Math.max(sec / workers, (s.tests * FAT_UI_SEC_PER_TEST) / workers);
      items.push({ solo: true, name: `oversize-${base}`, files: [s.file], shard: "",
        tests: s.tests, sec: Math.max(1, secFat), perTest, workers,
        maxCapMin: FAT_UI_SELECTED_JOB_MIN });
      continue;
    }
    const n = Math.max(nTime, nTests);
    if (n > 1) {
      for (let i = 1; i <= n; i++) {
        items.push({ solo: true, name: `oversize-${base}-${i}of${n}`, files: [s.file], shard: `${i}/${n}`,
          tests: Math.ceil(s.tests / n), sec: sec / n, perTest, workers: 1 });
      }
      continue;
    }
    const solo = !!s.capacityFallback || /menu-baseline/.test(s.file) || (s.ownTimeoutSec || 0) >= SOLO_OWN_TIMEOUT_SEC;
    items.push({ solo, budgeted: !!s.budgeted, pool: s.pool || false, name: `oversize-${base}`,
      files: [s.file], shard: "", tests: s.tests, sec, perTest, workers: 1 });
  }
  const bins = [];
  for (const it of items.filter((x) => x.solo)) bins.push({ ...it, items: [it] });
  // First-fit-decreasing, the over-budget pool and the spill in bins of their own.
  for (const pool of [false, true, "spill"]) {
    const packable = items.filter((x) => !x.solo && x.pool === pool).sort((a, b) => b.sec - a.sec);
    const open = [];
    for (const it of packable) {
      const bin = open.find((b) => b.sec + it.sec <= TARGET_SHARD_SEC);
      if (bin) { bin.items.push(it); bin.sec += it.sec; continue; }
      const fresh = { items: [it], sec: it.sec, pool };
      open.push(fresh); bins.push(fresh);
    }
  }
  let k = 0, sel = 0, ob = 0, sp = 0;
  const out = bins.map((b) => {
    const files = b.items.flatMap((x) => x.files);
    const budgeted = b.items.some((x) => x.budgeted);
    const name = b.solo ? b.name
      : budgeted ? `selected-${++sel}`
      : b.pool === "spill" ? `spill-${++sp}`
      : b.pool ? `overbudget-${++ob}`
      : b.items.length === 1 ? b.items[0].name : `packed-${++k}`;
    const perTest = Math.max(...b.items.map((x) => x.perTest));
    const sec = Math.round(b.sec);
    const workers = Math.max(1, ...b.items.map((x) => x.workers || 1));
    const maxCapMin = Math.max(MAX_SELECTED_JOB_MIN, ...b.items.map((x) => x.maxCapMin || MAX_SELECTED_JOB_MIN));
    return { name, specs: files.join(" "), shard: b.solo ? b.shard : "",
      tests: b.items.reduce((n, x) => n + x.tests, 0), sec, perTest, workers,
      timeout: shardCapMin(sec, perTest, maxCapMin),
      // APEX_CIRCUITS for the job: empty = every circuit (see select()).
      circuits: (r.circuits || []).join(",") };
  });
  // Unique names: a matrix name keys ci.yml's timings artifact, and a repeat
  // there is an upload that collides.
  const seen = new Map();
  for (const j of out) {
    const n = (seen.get(j.name) || 0) + 1;
    seen.set(j.name, n);
    if (n > 1) j.name = `${j.name}-${n}`;
  }
  // The budgeted `selected-<i>` jobs first: the ones a reader looks for.
  const isSel = (j) => j.name.startsWith("selected-");
  return out.sort((a, b) => (isSel(a) === isSel(b) ? 0 : isSel(a) ? -1 : 1));
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
// Def vs scenery: both name the circuit for APEX_CIRCUITS / own foundation, but
// only a DEF edit changes geometry that other specs race (T2 / #878 Bahrain
// startFrac → steering.spec). A scenery-only Monza PR matching CIRCUIT_FILE
// still ran specsRacing(["monza"]) — monza is the fixtures' default — and
// billed ~120 unrelated specs; CI then DROPPED 11 and packed assets-api until
// a 45 s waitForFunction timed out (PR #1015 run 37446466249).
export const CIRCUIT_DEF = /^js\/circuits\/([a-z0-9_]+)\.js$/;
// Per-circuit Must-landmark registry and that circuit's foundation spec.
// tests/data/landmarks/<id>.json matches TRACKED (`^tests/data/`) otherwise,
// so a new registry file made the selected gate "not circuit-only" and dropped
// fleet specs it could not afford (PR #1015: props-over-road, tracks-walls,
// parts-physics). Filename IS the circuit id, same as CIRCUIT_FILE.
export const CIRCUIT_LANDMARK = /^tests\/data\/landmarks\/([a-z0-9_]+)\.json$/;
export const CIRCUIT_FOUNDATION = /^tests\/specs\/([a-z0-9-]+)-foundation\.spec\.js$/;
// Data files keyed `{ <category>: { <circuit id>: … } }`: a change here is
// scoped to the ids whose rows differ. Reading them needs the base, so a
// base git cannot show leaves the file TRACKED, exactly as before.
// Also `{ <circuit id>: <number> }` (flat), e.g. the props triangle budget.
export const PER_CIRCUIT_DATA = new Set([
  "tests/data/scenery-audit-baseline.json",
  "tools/track/props-tris-baseline.json",
  "tools/track/clip-baseline.json",
  "tools/track/coplanar-baseline.json",
]);
// Tests that read APEX_CIRCUITS to narrow their per-circuit loop. Editing one
// of THESE is not circuit-scoped: the edit is to the loop, so it runs whole.
export const CIRCUIT_FILTERED_TESTS = new Set([
  "tests/specs/tracks-walls.spec.js",
  "tests/specs/tracks-walls-a.spec.js",
  "tests/specs/tracks-walls-b.spec.js",
  // props-over-road: one test per circuit since 2026-09-30 (was a single
  // 1500 s all-circuits body the selected gate excluded). Honours
  // APEX_CIRCUITS so a circuit-only PR does not bill the whole roster.
  "tests/specs/props-over-road.spec.js",
  "tests/unit/elevation-tracks-vm.test.mjs",
  // The fleet sweeps (2026-09-30): each narrows its roster loop, or the roster
  // floor it holds a scoped audit CLI to (tools/lib/circuit-scope.cjs).
  "tests/unit/prop-clipping.test.mjs",
  "tests/unit/scenery-grounding.test.mjs",
  "tests/unit/coplanar-faces.test.mjs",
  "tests/unit/props-tri-ratchet.test.mjs",
  "tests/unit/road-under-floor.test.mjs",
  // pit-complex is NOT scoped: its mouth test counts qualifying circuits
  // across the roster and its other tests build fixed circuits regardless.
  "tests/unit/shared-track-foundation-characterization.test.cjs",
  // Second pass (2026-09-30, measured on #510's scoped run: lamp-fixture-anchor
  // 54 s, pit-signs 69 s, props-over-road 68 s of a 344 s sweeps step).
  "tests/unit/lamp-fixture-anchor.test.mjs",
  "tests/unit/pit-signs.test.mjs",
  "tests/unit/props-over-road.test.mjs",
]);
// Paths that cannot change what a browser spec or a per-circuit loop sees, so
// they do not break a circuit scope: prose, and node unit files other than
// the filtered ones (the node gate runs every one of them regardless).
const scopeNeutral = (f) => DOCS_ONLY.some((re) => re.test(f))
  || (/^tests\/unit\//.test(f) && !CIRCUIT_FILTERED_TESTS.has(f))
  // The selector itself does not change what a circuit spec sees. Without this,
  // CIRCUIT_LANDMARK cannot land on the PR that needs it: adding the classifier
  // made the diff "not circuit-only" and dropped the fleet specs the classifier
  // was meant to keep affordable (PR #1015: props-over-road, tracks-walls,
  // parts-physics).
  || f === "tools/ci/select-specs.mjs";
export const foundationSpec = (id) => `tests/specs/${id.replace(/_/g, "-")}-foundation.spec.js`;
const FOUNDATION = /^tests\/specs\/(.+)-foundation\.spec\.js$/;

/* WHICH CIRCUITS DOES A SCRIPT BUILD? (2026-09-30) Every game-vm-b twin races
 * a fixed circuit — monza for 30 of 40, a handful on spa, baku, monaco,
 * bahrain, zandvoort, jeddah, shanghai, singapore, redbull — so a circuit-only
 * diff to imola ran both halves (4 min of runner) for nothing. Read from the
 * files, never listed: the circuit ids a file (or a tests/helpers module it
 * imports) names as a string literal, plus every foundation circuit for a file
 * that globs the `*-foundation.spec.js` twins. A file that walks the whole
 * roster (the manifest's CIRCUITS, a loop over Tracks.LIST) builds EVERY
 * circuit and keeps its script in the plan — fail safe, as everything here. */
const CIRCUIT_IDS = () => require_cjs("../manifest.cjs").CIRCUITS;
const require_cjs = (rel) => createRequire(import.meta.url)(rel);
const WHOLE_ROSTER = [/manifest\.cjs"\)\.CIRCUITS/, /for\s*\([^)]*\bof\s+[\w.]*Tracks\.LIST\b/, /Tracks\.LIST\.(map|forEach|filter|some|every|reduce|flatMap)\(/,
  /readdirSync\([^)]*circuits/];
const FOUNDATION_GLOB = /-foundation\.spec\.js/;
const foundationIds = () => fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => f.endsWith("-foundation.spec.js"))
  .map((f) => f.replace("-foundation.spec.js", "").replace(/-/g, "_"));

/** The circuit ids one test file can build: a Set, or `null` for the whole roster. */
export function circuitsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  // The ADAPTED runner names no circuit: it spawns one child per ADAPTED spec,
  // so it builds the UNION of theirs (cota-foundation.spec.js -> cota, monza).
  // Read as an empty set, a `cota` diff made node-plan skip test:vm-page and
  // the circuit's own foundation spec ran nowhere on the PR (ledger L9).
  if (file === ADAPTED_RUNNER) {
    const ids = new Set();
    for (const spec of Object.keys(ADAPTED)) {
      const sub = circuitsOf(spec);
      if (sub === null) return null;
      for (const id of sub) ids.add(id);
    }
    return ids;
  }
  let text;
  try { text = fs.readFileSync(path.join(ROOT, file), "utf8"); } catch { return null; }   // unreadable: assume everything
  if (WHOLE_ROSTER.some((re) => re.test(text))) return null;
  const ids = new Set();
  if (FOUNDATION_GLOB.test(text) && /readdirSync\(/.test(text)) for (const id of foundationIds()) ids.add(id);
  for (const id of CIRCUIT_IDS()) if (new RegExp(`["'\`]${id}["'\`]`).test(text)) ids.add(id);
  for (const m of text.matchAll(/(?:from|require\()\s*["'](\.\.\/helpers\/[^"']+)["']/g)) {
    const sub = circuitsOf(path.posix.join(path.posix.dirname(file), m[1]), seen);
    if (sub === null) return null;
    for (const id of sub) ids.add(id);
  }
  return ids;
}

/* THE HIDDEN CIRCUIT DEPENDENCY (test audit T2, 2026-10-05). A circuit edit
 * routes to `circuits` and its own foundation spec, but most specs RACE a
 * fixed circuit — monza is the fixtures' default, a score of others race
 * bahrain or monaco — and read targets off its geometry. #878 moved Bahrain's
 * startFrac and steering.spec's racing-line assist went red on six unrelated
 * PRs, because no ship run had selected it. circuitsOf() already reads which
 * circuits a test file builds (literals, its helper imports one hop), so a
 * touched circuit routes every spec that names it, generated at run time from
 * the files, never listed. They join the ROUTED candidates (rank 3) and
 * compete for the budget like a group's specs: a monza edit may route most of
 * the tree, and fit() cuts and names the rest exactly as it always has. A
 * roster walker (circuitsOf null) is the `circuits` group's business. */
export function specsRacing(ids, root = ROOT) {
  if (!ids.length) return [];
  const out = [];
  for (const name of fs.readdirSync(path.join(root, "tests", "specs")).filter((f) => f.endsWith(".spec.js")).sort()) {
    const rel = `tests/specs/${name}`;
    const built = circuitsOf(rel);
    if (built && ids.some((id) => built.has(id))) out.push(rel);
  }
  return out;
}

/** Circuit ids a per-circuit data file's rows changed for, or null when the
 *  diff cannot be read (then the file stays infra unless the rest of the diff
 *  already named a circuit — see circuitsTouched). */
export function dataCircuits(file, ref, root = ROOT) {
  const read = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
  let before, after;
  // A blob:none CI checkout (ci.yml select job) has HEAD blobs from checkout
  // but not the base version of a *changed* file. `git show ref:file` then
  // exits non-zero (persist-credentials: false cannot lazy-fetch). Returning
  // {} here used to mark every circuit as moved. Returning null lets
  // circuitsTouched pin the file to circuits the rest of the diff already
  // named (PR #1015 run 37425354715: scoped=false, DROPPED 8).
  try { before = read(execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { return null; }
  try { after = read(fs.readFileSync(path.join(root, file), "utf8")); } catch { return null; }
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
  const unresolvedData = [];
  for (const f of changed) {
    const m = CIRCUIT_FILE.exec(f);
    if (m) { ids.add(m[1]); continue; }
    const lm = CIRCUIT_LANDMARK.exec(f);
    if (lm) { ids.add(lm[1]); dataResolved.push(f); continue; }
    const fd = CIRCUIT_FOUNDATION.exec(f);
    if (fd) { ids.add(fd[1].replace(/-/g, "_")); continue; }
    if (PER_CIRCUIT_DATA.has(f)) {
      const d = ref ? dataCircuits(f, ref, root) : null;
      if (d) { d.forEach((id) => ids.add(id)); dataResolved.push(f); continue; }
      unresolvedData.push(f);
      continue;
    }
    if (scopeNeutral(f)) continue;
    scoped = false;
  }
  // Two-pass: a baseline the base git cannot show (blob:none) does not break
  // scope when the rest of the diff already named the circuit. Alone, it
  // stays infra. Order of `git diff --name-only` is not a contract.
  for (const f of unresolvedData) {
    if (ids.size) { dataResolved.push(f); continue; }
    scoped = false;
  }
  return { ids: [...ids].sort(), scoped: scoped && ids.size > 0, dataResolved };
}

/** Circuit ids whose DEF file (`js/circuits/<id>.js`, not scenery/) is in the
 *  diff — the only ids specsRacing should see. Scenery / landmarks /
 *  foundation / baseline rows still fill circuitsTouched().ids. */
export function racingCircuitIds(changed) {
  const ids = new Set();
  for (const f of changed) {
    const m = CIRCUIT_DEF.exec(f);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
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

// SOURCE → SPEC pins that must run as AFFECTED (rank 2), not merely routed.
// career.spec.js declares 540 s/test, so the modes-group path rule alone puts
// it in overBudgetSpecs and the selected gate never runs it — PR #611's
// EXPORT/IMPORT reuse of .cr-slot-del shipped green for that reason. A pin
// here elevates the spec to oversize when its UI / backup module changes.
export const SOURCE_AFFECTED = [
  [/^js\/career\/(career-ui|career-backup)\.js$/, "tests/specs/career.spec.js"],
  [/^js\/career\/(career-ui|career-backup)\.js$/, "tests/specs/career-season.spec.js"],
  [/^js\/career\/(career-ui|career-backup)\.js$/, "tests/specs/career-hub.spec.js"],
  // THE START RACE INTRO (garage drive-out + card): quali.spec and steering.spec
  // launch races through it (#mb-race → rs-go) and wait BOOT_MS for the grid.
  // A ui/car route never picked them, so #1290 shipped red there (Browser group
  // input 38015514694, Pages 38016755004); real-race owns the JUMP IN card.
  ...["quali", "steering", "real-race"].map((s) => [/^js\/(ui\/loading-screen|garage\/(setup-camera|arrival))\.js$/, `tests/specs/${s}.spec.js`]),
];
export function specsAffectedBySource(changed, root = ROOT) {
  const hit = new Set();
  for (const f of changed) {
    for (const [re, spec] of SOURCE_AFFECTED) {
      if (re.test(f) && fs.existsSync(path.join(root, spec))) hit.add(spec);
    }
  }
  return [...hit];
}

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
  const changed = changedPaths([changedRef]);   // rename SOURCES too (ledger M36)
  const g = pick(changed);   // Map: group -> reasons (pick-tests' native shape)
  // An edited spec already runs first, alone (changedSpecs, rank 0); its
  // group-mates are not this diff's business (pick-tests SPEC_OWNER_REASON).
  stripSpecOwner(g);
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
  const kind = changeKind(changed);
  const lightDiff = docsOnly || kind === "docs" || kind === "css";
  // The three always-run inputs, unioned into the candidate set BEFORE the cut
  // so they compete for the budget on merit rather than being bolted on after.
  const changedSpecs = changed.filter((f) => /^tests\/specs\/.+\.spec\.js$/.test(f)
    && fs.existsSync(path.join(ROOT, f)));
  const imported = specsImporting(changed);
  const failed = (opts.failed || []).filter((f) => fs.existsSync(path.join(ROOT, f)));
  // The touched circuits' own foundation specs are AFFECTED, like an import;
  // on a circuit-scoped diff another circuit's foundation is not a candidate.
  const ownFoundations = circ.ids.map(foundationSpec).filter((f) => fs.existsSync(path.join(ROOT, f)));
  // Source modules whose browser gate is over-budget when merely routed (see
  // SOURCE_AFFECTED) — same rank-2 elevation as an import / own foundation.
  const sourceAffected = specsAffectedBySource(changed);
  const otherCircuit = (f) => {
    const m = FOUNDATION.exec(f);
    return circ.scoped && m && !ownFoundations.includes(f) && !changedSpecs.includes(f);
  };
  // Specs that race a touched circuit (specsRacing, T2): routed, budgeted.
  const racing = specsRacing(racingCircuitIds(changed));
  const routed = [...new Set([...changedSpecs, ...imported, ...ownFoundations, ...sourceAffected, ...specs, ...racing])]
    .filter((f) => !otherCircuit(f));
  const { inScope: failedInScope, dropped: failedDropped } = scopeCarryForward(failed, lightDiff ? [] : routed);
  // Docs-/CSS-only PRs skip the selected matrix at the plan (required check
  // names still report). Never a pull_request paths filter: those leave
  // required checks pending.
  const candidates = lightDiff ? [] : routed;
  const reason = !changed.length ? "none"
    : lightDiff ? (kind === "css" ? "css" : "docs")
    : tracked.length ? "infra"
    : (g.size || candidates.length ? "matched" : "unmatched");
  const rank = (f) => changedSpecs.includes(f) ? 0 : failedInScope.includes(f) ? 1
    : (imported.includes(f) || ownFoundations.includes(f) || sourceAffected.includes(f)) ? 2 : 3;
  const cut = fit(candidates, budgetMin, { rank, overflowShards: opts.overflowShards ?? MAX_OVERFLOW_SHARDS, staleFirst: !!opts.staleFirst });
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
              changedSpecs, imported, racing, failed: failedInScope, failedDropped, ...cut,
              selected: prioritise(cut.selected, { changedSpecs, failed: failedInScope, imported }) };
  r.shards = shards(r);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--since");
  const usage = "usage: node tools/ci/select-specs.mjs --since <ref> [--budget-min N] [--overflow-shards N] [--failed-from file] [--stale-first] [--json]";
  if (argv.includes("--help") || argv.includes("-h")) { console.log(usage); process.exit(0); }
  if (si < 0 || !argv[si + 1]) {
    console.error(usage);
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
  const oi = argv.indexOf("--overflow-shards");
  const overflowShards = oi >= 0 && Number.isInteger(Number(argv[oi + 1])) ? Number(argv[oi + 1]) : undefined;
  const r = select(argv[si + 1], bi >= 0 ? Number(argv[bi + 1]) : DEFAULT_BUDGET_MIN, { failed, overflowShards, staleFirst: argv.includes("--stale-first") });
  if (argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.error(`${r.changed} changed file(s) [${r.reason}] -> groups: ${r.groups.join(", ") || "(none)"}`);
  if (r.reason === "infra") console.error(
    `SELECTION NARROWER THAN THE CHANGE: this diff touches ${r.tracked.length} tracked/infra path(s) ` +
    `(${r.tracked.slice(0, 4).join(", ")}${r.tracked.length > 4 ? ", …" : ""}) — a change there can affect ` +
    `any spec; the edited/imported specs below still run, and the fixed GATES own the rest.`);
  if (r.reason === "unmatched") console.error(
    "SELECTION NOT TRUSTWORTHY: files changed but no pick-tests rule claimed them.");
  if (r.racing?.length) console.error(
    `RACES A TOUCHED CIRCUIT (${r.circuitsTouched.join(", ")}): ${r.racing.length} spec(s) routed, budgeted like a group's`);
  for (const s of r.failedDropped || []) console.error(
    `CARRY-FORWARD DROPPED (not routed by this change): ${s}`);
  console.error(`budget fits ${r.secFit} s — ${r.testsFit} tests at the ${MEASURED.secPerTest} s fallback, measured specs at ` +
    `their own median (retries ${SELECTED_GATE.retries}, ${SELECTED_GATE.perTestTimeoutSec}s/test, surviving 1 timeout); ` +
    `selected ${r.testsSelected} tests, ${r.secSelected} s`);
  for (const s of r.overBudgetSpecs) console.error(
    `DROPPED (declares ${s.ownTimeoutSec}s/test and the over-budget pool is full): ${s.file}`);
  for (const s of r.coveredByFixedGates) console.error(
    `COVERED BY FIXED BLOCKING GATE: ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByManualOptIn || []) console.error(
    `COVERED BY MANUAL OPT-IN (env-gated; not a selected-gate verdict): ${s.file} (${s.tests} tests)`);
  for (const s of r.coveredByVmTwin || []) console.error(
    `COVERED BY A VM TWIN ON THE NODE GATE: ${s.file} (${s.tests} tests) -> ${s.twin}`);
  for (const s of r.unreachable) console.error(
    `UNREACHABLE (declares ${s.tests} tests, over the whole ${r.secFit} s budget — this gate can ` +
    `NEVER run it): ${s.file}`);
  for (const s of r.spill || []) console.error(
    `SPILL (overflow full; runs in a spill job, ${MAX_SPILL_SHARDS} x ${TARGET_SHARD_SEC} s max): ${s.file} (${s.tests} tests)`);
  for (const s of r.skipped) console.error(
    `ERROR: NOT RUN ANYWHERE (overflow and spill are both full — the verdict reds on this): ${s.file} (${s.tests} tests)`);
  for (const s of r.overBudgetRun || []) console.error(
    `OVER-BUDGET POOL (routed; declares ${s.ownTimeoutSec}s/test, runs in an overbudget job): ${s.file} (${s.tests} tests)`);
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
  for (const s of r.overflow || []) console.log(s.file);
  for (const s of r.spill || []) console.log(s.file);
  for (const s of r.overBudgetRun || []) console.log(s.file);
}
