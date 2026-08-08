#!/usr/bin/env node
// select-specs — per-SPEC change-aware selection for the advisory CI job.
//
// tools/pick-tests.mjs answers "which GROUPS does this change need" for a
// human with a 4-core box and no deadline. A CI job has a budget, and
// tools/select-budget.mjs measured what fits: at 79.7 s/test (one worker,
// shared runner) a 15-minute budget surviving one failure holds ~10 tests at
// retries 0 / 120 s per-test — and per-GROUP selection (71-193 tests) does
// not fit at any budget worth spending. So this selects SPECS: the groups
// pick-tests names, decomposed into their spec files, ordered smallest
// declared-test-count first (more distinct specs covered before the budget
// runs out), and cut off when the next spec's declared tests would blow the
// budget.
//
// ADVISORY BY DESIGN — the caller reports, it never gates. That is also why
// the cut is by declared-test count and not by any promise of importance:
// a selector that silently drops the expensive spec must SAY so, and the
// output names every spec it skipped and why.
//
//   node tools/select-specs.mjs --since <ref>            # spec list, one per line
//   node tools/select-specs.mjs --since <ref> --json
//   node tools/select-specs.mjs --since <ref> --budget-min 15
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pick } from "./pick-tests.mjs";
import { MEASURED, capacity, declaredTests } from "./select-budget.mjs";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The advisory job's settings, per select-budget's table: a retry only doubles
// the cost of the news the job exists to deliver.
export const ADVISORY = { retries: 0, perTestTimeoutSec: 120 };

/** Largest test.setTimeout(N) a spec declares, in ms — 0 when none.
 *  THE COST MODEL'S BLIND SPOT, measured on CI run 31233088772: the selector
 *  billed every test at ~80 s, but 8 of the 10 specs it picked declare their
 *  own test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout —
 *  so a "14-minute" selection signed up for 3-7 minutes per test and failed
 *  the job. A spec that reserves more than the advisory per-test budget
 *  cannot be billed at advisory rates and is excluded by name. */
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
  const m = { ...MEASURED, ...ADVISORY };
  const cap = capacity(budgetMin, 1, m);
  const counted = [], overBudgetSpecs = [];
  for (const file of specs) {
    const tests = declaredTests(file);
    if (tests == null) continue;
    const own = maxDeclaredTimeout(file);
    if (own > ADVISORY.perTestTimeoutSec * 1000) {
      overBudgetSpecs.push({ file, tests, ownTimeoutSec: own / 1000 });
      continue;
    }
    counted.push({ file, tests });
  }
  counted.sort((a, b) => a.tests - b.tests);
  const selected = [], skipped = [];
  let used = 0;
  for (const r of counted) {
    if (used + r.tests <= cap.tests) { selected.push(r); used += r.tests; }
    else skipped.push(r);
  }
  return { selected, skipped, overBudgetSpecs, testsSelected: used, testsFit: cap.tests, cap };
}

export function select(changedRef, budgetMin = 15) {
  const changed = execFileSync("git", ["diff", "--name-only", changedRef], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const g = pick(changed);   // Map: group -> reasons (pick-tests' native shape)
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const browserGroups = [...g.keys()].map((n) => `test:${n}`)
    .filter((s) => scripts[s] && scripts[s].includes("run-playwright")).sort();
  const specs = specsOf(browserGroups, scripts);
  // Same three-way contract as pick-tests --json: "unmatched" means files
  // changed but no rule claimed them — the selection is NOT trustworthy and
  // the caller must fall back to a full run, not to running nothing.
  const reason = !changed.length ? "none" : (g.size ? "matched" : "unmatched");
  return { reason, changed: changed.length, groups: browserGroups, ...fit(specs, budgetMin) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--since");
  if (si < 0 || !argv[si + 1]) {
    console.error("usage: node tools/select-specs.mjs --since <ref> [--budget-min N] [--json]");
    process.exit(2);
  }
  const bi = argv.indexOf("--budget-min");
  const r = select(argv[si + 1], bi >= 0 ? Number(argv[bi + 1]) : 15);
  if (argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.error(`${r.changed} changed file(s) -> groups: ${r.groups.join(", ") || "(none)"}`);
  console.error(`budget fits ${r.testsFit} tests (retries ${ADVISORY.retries}, ` +
    `${ADVISORY.perTestTimeoutSec}s/test, surviving 1 timeout); selected ${r.testsSelected}`);
  for (const s of r.overBudgetSpecs) console.error(
    `EXCLUDED (declares ${s.ownTimeoutSec}s test budget > advisory ${ADVISORY.perTestTimeoutSec}s): ${s.file}`);
  for (const s of r.skipped) console.error(`SKIPPED (over budget): ${s.file} (${s.tests} tests)`);
  for (const s of r.selected) console.log(s.file);
}
