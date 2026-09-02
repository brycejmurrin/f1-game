// Change-aware CI budget derivation. See docs/archive/research/TEST-AUDIT-2026-08.md §3.
// @doc Can a change-aware CI job run what it selects? Re-derives the budget from measured per-spec counts (79.7 s/test).
// @section runner
// Measures per-spec runtime from CI and accounts for retries/timeouts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// MEASURED, not assumed. Change these only with a CI run id to point at.
export const MEASURED = {
  source: "CI run 31197770813, 2026-08-07",
  secPerTest: 79.7,          // smoke: 9 declared tests in 11m57s, one worker
  perTestTimeoutSec: 240,    // ci.yml's --timeout=240000
  retries: 1,                // ci.yml: retries: process.env.CI ? 1 : 0
};

// The settings a SELECTED job could plausibly run under, against the ones
// ci.yml's smoke step uses today. Same per-test cost throughout — only the
// price of a failure moves, which is the whole point.
export const VARIANTS = [
  { ...MEASURED, retries: 1, perTestTimeoutSec: 240 },   // as smoke runs today
  { ...MEASURED, retries: 0, perTestTimeoutSec: 240 },
  { ...MEASURED, retries: 1, perTestTimeoutSec: 120 },
  { ...MEASURED, retries: 0, perTestTimeoutSec: 120 },
];

/** Declared `test(...)` / `it(...)` calls in a spec, by AST — a grep miscounts
 *  the loop-generated ones (17 across 16 specs, per tools/test-observed.mjs). */
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
  let n = 0;
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.type === "CallExpression") {
      const c = x.callee;
      // `sharedTest` IS a test declaration. Every spec on it today follows the
      // documented idiom `import { sharedTest as test }`, so the call sites read
      // `test(` and this counter never had to know the real name. A file that
      // cannot alias — smoke.spec.js keeps plain `test` for the seven specs
      // asserting FIRST-LOAD behaviour, which fixtures.js warns sharedTest off —
      // has to call it by name, and those tests then counted as ZERO. That is
      // the silent rejection the guard below exists to catch, and it caught it.
      if (c.type === "Identifier" && /^(test|it|sharedTest)$/.test(c.name)) n++;
      if (c.type === "MemberExpression" && /^(test|sharedTest)$/.test(c.object?.name)
          && /^(only|fixme)$/.test(c.property?.name)) n++;
    }
    for (const k of Object.keys(x)) if (k !== "loc" && k !== "range") walk(x[k]);
  };
  walk(ast);
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
    console.log(JSON.stringify({ measured: MEASURED, rows, specCounts: counts }, null, 2));
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
