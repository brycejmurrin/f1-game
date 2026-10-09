// Change-aware CI budget derivation. See docs/archive/research/TEST-AUDIT-2026-08.md §3.
// @doc Can a change-aware CI job run what it selects? Bills each spec from `spec-timings.json`, else 7.5 s/test (llvmpipe).
// Full description: Can a change-aware CI job run what it selects? Bills each spec from `spec-timings.json`, else the measured llvmpipe fallback (7.5 s/test).
// @section runner
// Measures per-spec runtime from CI and accounts for retries/timeouts.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as espree from "espree";
import { loadDb, unionDb, median, inBuckets, TIMINGS_FILE } from "./spec-timings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// MEASURED, not assumed. Change these only with a CI run id to point at.
// `secPerTest` is the FALLBACK now, not the whole model: a spec with enough
// samples in tests/data/spec-timings.json is billed at its own median (see
// specSecPerTest below). One tree-wide mean was always a compromise — smoke's
// cheapest test is 2.4 s and its dearest 100.6 s on the same box, same run.
//
// THE FALLBACK WAS A SWIFTSHADER NUMBER ON AN LLVMPIPE GATE (2026-09-29).
// 79.7 s came from smoke on SwiftShader (CI run 31197770813, 2026-08-07); the
// browser jobs moved to Mesa llvmpipe on 2026-09-16 (8-12x faster), and 95 of
// 125 specs still had no history, so almost every spec was billed ~10x its
// cost. That one number sharded tracks-walls (63 tests, ~3.5 min measured)
// into three jobs and shut routed specs out of the budget. The replacement is
// the p75 of the per-test medians of every llvmpipe spec with 3+ samples in
// tests/data/spec-timings.json (30 specs; p50 5.5, p75 7.5, p90 12.5 s) — p75,
// not p50, because an unmeasured spec is more often a boot-heavy one.
export const MEASURED = {
  source: "tests/data/spec-timings.json llvmpipe p75 of 30 specs, 2026-09-29 (was 79.7 s SwiftShader, CI run 31197770813)",
  secPerTest: 7.5,           // per test, one worker, llvmpipe runner
  perTestTimeoutSec: 240,    // ci.yml's --timeout=240000
  retries: 1,                // ci.yml: retries: process.env.CI ? 1 : 0
};

// A CI bucket is a RUNNER. `local` — this container, a laptop — is deliberately
// excluded: it is a different machine under a different load, and the whole
// point of the number is to predict what a CI job will cost. A local history is
// still recorded and still readable; it just may not set a CI budget.
export const CI_BUCKETS = ["swiftshader", "llvmpipe"];

// Three samples is the floor for a median that is not simply "the one run we
// saw". Below it the constant above is the honest answer, and `source` says so.
export const MIN_SAMPLES = 3;

let TIMINGS = null;
/** The rolling history, loaded once. Absent file -> empty history -> constant.
 *
 *  APEX_SPEC_TIMINGS names a second history to UNION in — ci.yml's select job
 *  points it at the `bot/spec-timings` side branch's copy (2026-09-29). That
 *  branch is where spec-timings.yml accumulates every deploy-branch run, and
 *  it is merged into the committed file only by hand: on 2026-09-29 it held
 *  68 specs (30 measured) while the committed file billed from 12, so the gate
 *  priced 95 specs at a SwiftShader-era constant. Reading it here keeps the
 *  committed file a reviewed record while the budget uses the freshest one.
 *  An absent or unreadable overlay is an empty one. */
export function timings(reload = false) {
  if (reload || !TIMINGS) {
    TIMINGS = loadDb(path.join(ROOT, TIMINGS_FILE));
    const extra = process.env.APEX_SPEC_TIMINGS;
    if (extra) TIMINGS = unionDb(TIMINGS, loadDb(path.resolve(extra)));
  }
  return TIMINGS;
}

/** What one test of `file` costs, and WHERE THE NUMBER CAME FROM.
 *
 *  Measured beats assumed, but only inside one runner bucket and only with
 *  MIN_SAMPLES behind it; otherwise the 2026-08-07 constant stands. The bucket
 *  with the most samples wins, so a move from SwiftShader to llvmpipe re-bases
 *  the estimate as the new runner's history accumulates rather than averaging
 *  two machines into a number that describes neither.
 *
 *  Returns `{ sec, source, bucket, samples }`; `source` is "measured" or
 *  "constant" and is reported wherever the number is, because a budget derived
 *  from a default must never read like a budget derived from a measurement. */
export function specSecPerTest(file, db = timings()) {
  const entry = db?.specs?.[file];
  const samples = inBuckets(entry?.s, CI_BUCKETS);
  let best = null;
  for (const bucket of CI_BUCKETS) {
    const rows = samples.filter((s) => s[1] === bucket);
    if (rows.length < MIN_SAMPLES) continue;
    if (!best || rows.length > best.rows.length) best = { bucket, rows };
  }
  if (!best) {
    return { sec: MEASURED.secPerTest, source: "constant", bucket: null,
      samples: samples.length };
  }
  // Per TEST, not per run: a spec that grew from 8 tests to 10 did not get 25%
  // slower, and billing the whole-file wall would say it did.
  const per = best.rows.map((s) => (s[3] ? s[2] / s[3] : s[2]));
  return { sec: Math.round(median(per) * 10) / 10, source: "measured",
    bucket: best.bucket, samples: best.rows.length };
}

/** The `capacity()` settings object for one spec, billed at its own rate. */
export function billing(file, m = MEASURED) {
  const { sec, source, bucket, samples } = specSecPerTest(file);
  return { ...m, secPerTest: sec, secPerTestSource: source, secPerTestBucket: bucket,
    secPerTestSamples: samples };
}

// The settings a SELECTED job could plausibly run under, against the ones
// ci.yml's smoke step uses today. Same per-test cost throughout — only the
// price of a failure moves, which is the whole point.
export const VARIANTS = [
  { ...MEASURED, retries: 1, perTestTimeoutSec: 240 },   // as smoke runs today
  { ...MEASURED, retries: 0, perTestTimeoutSec: 240 },
  { ...MEASURED, retries: 1, perTestTimeoutSec: 120 },
  { ...MEASURED, retries: 0, perTestTimeoutSec: 120 },
  { ...MEASURED, retries: 0, perTestTimeoutSec: 180 },   // what the selected gate runs
];

// A CAVEAT THIS MODEL CANNOT SEE, and it cost three deploys. `secPerTest` is a
// typical cost (was a 79.7 s mean, now a 7.5 s p75), which is the right input for "how many fit"; it is the wrong
// input for choosing the per-test TIMEOUT, which has to clear the slowest spec
// rather than the average one. At 120 s it did not: physics-fixes' Monaco test
// measures 124.2 s and albert-park-foundation 110.1 s on an idle box
// (2026-09-04), so the gate failed specs that pass. Read a timeout row here
// against the SLOWEST spec you might select, never against secPerTest.

/** Statically resolvable number (slice bounds, Math.ceil(n/2) shard sizes). */
function staticNumber(node, bindings) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (node.type === "Identifier") {
    const v = bindings.get(node.name);
    return typeof v === "number" ? v : null;
  }
  if (node.type === "MemberExpression" && (node.property?.name === "length" || node.property?.value === "length")) {
    return staticArrayLen(node.object, bindings);
  }
  if (node.type === "BinaryExpression") {
    const a = staticNumber(node.left, bindings);
    const b = staticNumber(node.right, bindings);
    if (a == null || b == null) return null;
    if (node.operator === "/") return b === 0 ? null : a / b;
    if (node.operator === "*") return a * b;
    if (node.operator === "+") return a + b;
    if (node.operator === "-") return a - b;
    return null;
  }
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression"
      && node.callee.object?.name === "Math"
      && /^(ceil|floor|round)$/.test(node.callee.property?.name || "")
      && node.arguments.length === 1) {
    const x = staticNumber(node.arguments[0], bindings);
    if (x == null) return null;
    return Math[node.callee.property.name](x);
  }
  return null;
}

/** How many `js/circuits/*.js` defs exist — the length a `readdirSync` of that
 *  directory expands to at module load (tracks-walls, elevation-tracks, …). */
function circuitDefCount() {
  try {
    return fs.readdirSync(path.join(ROOT, "js/circuits"))
      .filter((f) => f.endsWith(".js")).length;
  } catch { return null; }
}

/** How many circuits `auditTracks()` (tests/helpers/track-helpers.js) returns
 *  with TRACK unset — tools/manifest.cjs's CIRCUITS, the roster it reads. CI
 *  never sets TRACK, so the selected gate runs the whole roster. */
function auditRosterCount() {
  try {
    const list = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs")).CIRCUITS;
    return Array.isArray(list) ? list.length : null;
  } catch { return null; }
}

/** True when an AST node names the circuits directory (Literal / template). */
function mentionsCircuitsDir(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "Literal" && typeof node.value === "string"
      && /(^|\/)circuits\/?$/.test(node.value.replace(/\\/g, "/"))) return true;
  if (node.type === "TemplateLiteral"
      && node.quasis.some((q) => /circuits/.test(q.value.cooked || ""))) return true;
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) { if (v.some(mentionsCircuitsDir)) return true; }
    else if (v && typeof v === "object" && mentionsCircuitsDir(v)) return true;
  }
  return false;
}

/** Statically resolvable length of a for-of right-hand side (array literal,
 *  const bound to one, or `fs.readdirSync(…/js/circuits)` chain). null when
 *  unknown — the caller then bills the enclosed `test(` once, as before. */
function staticArrayLen(node, bindings) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "ArrayExpression")
    return node.elements.filter((e) => e != null && e.type !== "SpreadElement").length;
  if (node.type === "Identifier") {
    const v = bindings.get(node.name);
    return typeof v === "number" ? v : null;
  }
  // ONLY_TRACK / process.env.TRACK ternaries: CI runs the full fleet (no TRACK),
  // so take the alternate branch — the one that keeps every id.
  if (node.type === "ConditionalExpression") {
    const t = node.test;
    const envish = (t.type === "Identifier" && /^(ONLY_TRACK|TRACK)$/.test(t.name))
      || (t.type === "MemberExpression" && t.object?.type === "MemberExpression"
          && t.object.object?.name === "process" && t.object.property?.name === "env")
      || (t.type === "MemberExpression" && t.object?.name === "process"
          && t.property?.name === "env");
    if (envish) return staticArrayLen(node.alternate, bindings);
    const a = staticArrayLen(node.consequent, bindings);
    const b = staticArrayLen(node.alternate, bindings);
    if (a != null && b != null) return Math.max(a, b);
    return a ?? b;
  }
  // .filter / .map / .sort keep (or shrink) length; we cannot see a
  // filter predicate's runtime, so keep the base length — exact for the
  // `!ONLY_TRACK || …` guards these specs use when TRACK is unset.
  // `.slice(i, j)` with numeric literals OR bound numbers IS a shrink
  // (tracks-walls fleet files: ALL.slice(0, HALF) with HALF = ceil(n/2)).
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression"
      && /^(filter|map|sort|slice|concat)$/.test(node.callee.property?.name || "")) {
    const base = staticArrayLen(node.callee.object, bindings);
    if (node.callee.property.name === "slice" && base != null) {
      const args = node.arguments || [];
      const a0 = staticNumber(args[0], bindings) ?? 0;
      const a1 = args[1] != null ? (staticNumber(args[1], bindings) ?? base) : base;
      if (args.length) return Math.max(0, Math.min(base, a1) - Math.max(0, a0));
    }
    return base;
  }
  // auditTracks() — the shared all-circuit AUDIT roster (terrain-over-road).
  // Unresolved, it billed `for (const trk of TRACKS)` once: terrain-over-road
  // read as 5 tests / ~69 s while Playwright ran 56 (~10-13 min on llvmpipe),
  // so it packed into a 10-minute `selected-N` job beside five other specs and
  // the job died at its cap with 0 failures (CI runs 37603233990 selected-3,
  // 37607617812 selected-4). Since #1075 split the old single 1500 s body into
  // one 180 s test per circuit, the solo/mega-sweep rule no longer catches it,
  // so the COUNT is the only thing that can send it to its own shards.
  if (node.type === "CallExpression" && node.callee?.type === "Identifier"
      && node.callee.name === "auditTracks") {
    return auditRosterCount();
  }
  // fs.readdirSync(path.join(ROOT, "js/circuits")) — same source tracks-walls
  // and friends use to build their per-circuit list at module load.
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression"
      && node.callee.property?.name === "readdirSync" && mentionsCircuitsDir(node)) {
    return circuitDefCount();
  }
  return null;
}

/** Is this CallExpression a Playwright / node:test test declaration?
 *  `freshTest` is fixtures.js's `test` rebound (tracks-walls edge-ram loop). */
function isTestCall(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier")
    return /^(test|it|sharedTest|freshTest)$/.test(callee.name);
  if (callee.type === "MemberExpression"
      && /^(test|sharedTest|freshTest)$/.test(callee.object?.name || "")
      && /^(only|fixme)$/.test(callee.property?.name || "")) return true;
  return false;
}

/** Declared `test(...)` / `it(...)` calls in a spec, by AST — EXPANDED through
 *  statically resolvable `for…of` loops. A bare CallExpression count bills
 *  tracks-walls as ~4 tests; Playwright runs one per circuit (~63). Undercount
 *  packed it into the selected shard and cancelled the job at the cap with
 *  0 failures (CI run 36057109364). tools/ci/test-observed.mjs already knew
 *  about loop-generated titles; the budget must bill the same expansion. */
export function declaredTests(file) {
  // The READ is inside the try too. It was not, and the guard below caught it:
  // a missing file threw ENOENT instead of returning null, so any caller
  // iterating a stale spec list would die rather than skip. Returning null
  // rather than 0 is the other half — 0 would read as a spec with no tests,
  // which is a real state (tracks-visual.spec.js) and must stay distinguishable
  // from a spec that is not there at all.
  let ast;
  try {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  } catch { return null; }
  const bindings = new Map();
  let n = 0;
  const walk = (x, mult) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach((c) => walk(c, mult));
    if (x.type === "VariableDeclaration") {
      for (const d of x.declarations) {
        if (d.id?.type === "Identifier") {
          const len = staticArrayLen(d.init, bindings) ?? staticNumber(d.init, bindings);
          if (len != null) bindings.set(d.id.name, len);
        }
      }
    }
    if (x.type === "ForOfStatement") {
      // Unknown RHS → multiply by 1 (prior undercount), never invent a length.
      const len = staticArrayLen(x.right, bindings) ?? 1;
      walk(x.left, mult);
      walk(x.body, mult * len);
      return;
    }
    if (x.type === "CallExpression" && isTestCall(x.callee)) {
      // `sharedTest` IS a test declaration. Every spec on it today follows the
      // documented idiom `import { sharedTest as test }`, so the call sites read
      // `test(` and this counter never had to know the real name. A file that
      // cannot alias — smoke.spec.js keeps plain `test` for the seven specs
      // asserting FIRST-LOAD behaviour, which fixtures.js warns sharedTest off —
      // has to call it by name, and those tests then counted as ZERO. That is
      // the silent rejection the twin-count guard exists to catch, and it caught it.
      n += mult;
      return; // do not walk the test body for nested declarations
    }
    for (const k of Object.keys(x)) {
      if (k === "loc" || k === "range" || k === "start" || k === "end") continue;
      walk(x[k], mult);
    }
  };
  walk(ast, 1);
  return n;
}

/** How many selected tests fit in `budgetMin`, surviving `failures` timeouts. */
export function capacity(budgetMin, failures = 1, m = MEASURED) {
  const budget = budgetMin * 60;
  const perFailure = m.perTestTimeoutSec * (1 + m.retries);
  const room = budget - failures * perFailure;
  return { budgetSec: budget, perFailureSec: perFailure,
    tests: room <= 0 ? 0 : Math.floor(room / m.secPerTest) + failures };
}

const SPECS = fs.readdirSync(path.join(ROOT, "tests", "specs"))
  .filter((f) => f.endsWith(".spec.js")).map((f) => `tests/specs/${f}`);
const counts = SPECS.map((f) => ({ file: f, tests: declaredTests(f) }))
  .filter((r) => r.tests != null).sort((a, b) => a.tests - b.tests);

export const SPEC_COUNTS = counts;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bi = process.argv.indexOf("--budget");
  const budgets = bi >= 0 ? [Number(process.argv[bi + 1])] : [10, 15, 20, 30];
  const rows = budgets.flatMap((b) => [0, 1, 2].map((k) => ({ budgetMin: b, failures: k, ...capacity(b, k) })));

  if (process.argv.includes("--json")) {
    // Every per-spec number carries its PROVENANCE. A reader who cannot tell a
    // measured 51 s from the inherited 79.7 s default has a table of numbers,
    // not a table of measurements — and this file's own header records what
    // believing an un-sourced number cost.
    const specCounts = counts.map((c) => ({ ...c, ...specSecPerTest(c.file) }));
    const measuredCount = specCounts.filter((c) => c.source === "measured").length;
    console.log(JSON.stringify({
      measured: MEASURED, rows, specCounts,
      timings: { file: TIMINGS_FILE, ciBuckets: CI_BUCKETS, minSamples: MIN_SAMPLES,
        specsMeasured: measuredCount, specsOnConstant: specCounts.length - measuredCount },
    }, null, 2));
  } else {
    const med = counts[Math.floor(counts.length / 2)].tests;
    console.log(`MEASURED (${MEASURED.source}): ${MEASURED.secPerTest} s per test at one worker,`);
    console.log(`per-test timeout ${MEASURED.perTestTimeoutSec} s, retries ${MEASURED.retries}`);
    console.log(`-> one TIMING-OUT test costs ${capacity(0, 0).perFailureSec} s.\n`);
    console.log("tests that fit, by budget and by how many timeouts it must survive:");
    console.log("  budget   0 fail   1 fail   2 fail");
    for (const b of budgets) {
      const c = [0, 1, 2].map((k) => String(capacity(b, k).tests).padStart(6));
      console.log(`  ${String(b).padStart(4)} min ${c.join("   ")}`);
    }
    const sourced = counts.map((c) => specSecPerTest(c.file));
    const measuredSpecs = sourced.filter((s) => s.source === "measured").length;
    console.log(`\nPer-spec cost from ${TIMINGS_FILE}: ${measuredSpecs}/${counts.length} spec(s) have ` +
      `${MIN_SAMPLES}+ samples in a CI bucket (${CI_BUCKETS.join("/")}) and are billed at their own ` +
      `median; the rest fall back to ${MEASURED.secPerTest} s.`);
    if (!measuredSpecs) console.log("  (no CI samples yet — merge a run's junit with tools/ci/spec-timings.mjs)");

    console.log(`\nSpecs on disk: ${counts.length}. Median ${med} declared tests;`);
    console.log(`smallest ${counts[0].tests} (${counts[0].file}),`);
    console.log(`largest ${counts.at(-1).tests} (${counts.at(-1).file}).`);
    console.log("\nRead it against the design: a selection is USUALLY one or more whole");
    console.log("specs, so the median spec alone is already near the surviving-one-failure");
    console.log("capacity at a 15-minute budget. Per-GROUP selection (71-193 tests) does");
    console.log("not fit at any budget worth spending.");

    // THE LEVER IS THE FAILURE COST, NOT THE BUDGET. Doubling 15 minutes to 30
    // buys 11 more tests; changing what a failure costs buys almost as much for
    // nothing. Modelled rather than asserted, so the recommendation can be
    // checked instead of believed.
    console.log("\nWhat a selected job should set, at a 15-minute budget:\n");
    console.log("  retries  per-test timeout   one failure costs   tests surviving 1 failure");
    for (const v of VARIANTS) {
      const c = capacity(15, 1, v);
      console.log(`  ${String(v.retries).padStart(7)}  ${String(v.perTestTimeoutSec + " s").padStart(16)}` +
        `   ${String(c.perFailureSec + " s").padStart(17)}   ${String(c.tests).padStart(25)}`);
    }
    console.log("\nci.yml's smoke settings (retries 1, 240 s) are RIGHT for smoke — a");
    console.log("deploy gate should absorb an infra blip rather than block on it. They are");
    console.log("wrong for the change-aware selected gate, where a retry only doubles the");
    console.log("cost before a failure reports. Selection is not the same job as smoke and");
    console.log("should not inherit smoke's settings.");
  }
}
