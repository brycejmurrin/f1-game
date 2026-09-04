#!/usr/bin/env node
// @doc Browser specs whose assertions a VM twin replays on the fast gate. `--json`; exits 1 if a twin drifted.
/**
 * twinned-specs — the browser specs a Node VM twin covers test-for-test.
 *
 *   node tools/ci/twinned-specs.mjs          # report; exit 1 if any twin drifted
 *   node tools/ci/twinned-specs.mjs --json
 *
 * WHY. Each spec below is a pure `__apex`-hook reader: no locator, no
 * screenshot, no DOM. Its twin under tests/unit/ is a VERBATIM port that runs
 * the same launch constants and the same step counts against
 * tools/lib/game-vm.cjs, in about a second, in a node group that the Pages gate
 * runs UNCONDITIONALLY and blocking. Running the browser copy on the selected
 * gate too buys nothing and costs SwiftShader minutes that the gate's
 * budget then denies to a spec with no twin at all.
 *
 * So the selected gate skips them BY NAME and says so (select-specs' honesty
 * contract: a spec that does not run must be reported, never silently dropped).
 * They still run in their own group on the nightly / dispatched boot run, which
 * is where the plan parks them until two green nightlies justify deleting them.
 *
 * WHAT THE TWINS DO NOT COVER, recorded here because it is the cost of the
 * trade: game-vm skips GLX and never pumps requestAnimationFrame, so a NaN that
 * only throws inside render() is invisible to a twin. Every spec below guards
 * page errors; the twin's `errorsSince(mark())` sees only throws inside
 * update()/step(). Mitigating evidence: physics-characterization-vm asserts the
 * VM reproduces tests/data/physics-baseline.json, generated from a real
 * Chromium run — so "the harness IS the browser's physics" is itself gated.
 *
 * THE ANTI-ROT CHECK is the whole reason this is a tool and not a comment. A
 * twin is only a substitute while it still covers the spec, and there are two
 * ways that quietly stops being true.
 *
 *   1. A test is added to one side and not the other. So every entry asserts
 *      the two files declare the SAME NUMBER of tests, counted by
 *      select-budget's AST walker — the same counter the gate bills with.
 *   2. The twin's group stops being gated. A twin that runs only on a nightly
 *      is no substitute for a spec that used to block a deploy, so the
 *      unconditional-gate set is DERIVED from .github/workflows/ci.yml's
 *      pure-node job rather than named here: drop `test:game-vm` from that job
 *      and every entry fails, instead of eleven specs going quietly unchecked.
 *
 * Both fail the fast gate and name the pair. The derivation caught its own
 * author: this tool first asserted the twins were in `test:tooling-fast`, and
 * all eleven failed — they are in `test:game-vm`, which the Pages gate's
 * "Pure-node unit suites" job runs unconditionally. Same guarantee, different
 * job; a hard-coded group name would have been wrong on the day it shipped.
 *
 * The count check earned itself on the first spec it refused.
 * tests/specs/world-physics.spec.js read as twinned — 5 of its 6 tests ported
 * verbatim — and the check would not take it, because its sixth drove the
 * `#pm-rate` DOM slider. Following that refusal instead of overriding it found
 * the test was doing two jobs: asserting the slider is WIRED to G.WHEELBASE,
 * and asserting a shorter wheelbase TURNS IN more. Splitting them showed the
 * wiring half was already covered, and better — sliders.spec.js drives the same
 * slider through a table checking the mapped `tuning().wheelbase`, its
 * direction, its label and its storage key. So the duplicate went, the physics
 * claim moved onto the hook the slider writes, and the pair is 6-for-6 and
 * listed. The claim that could break silently is now gated in the VM, where it
 * was previously reachable only through a DOM slider.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { declaredTests } from "./select-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** spec -> the VM twin that replays it. Every entry was read on both sides
 *  before it was added; the count check below is what keeps that true. */
export const TWINNED = {
  "tests/specs/active-aero.spec.js":        "tests/unit/active-aero-vm.test.mjs",
  "tests/specs/aero-zones.spec.js":         "tests/unit/aero-zones-vm.test.mjs",
  "tests/specs/collision-ai-fixes.spec.js": "tests/unit/collision-ai-fixes-vm.test.mjs",
  "tests/specs/collisions-deep.spec.js":    "tests/unit/collisions-deep-vm.test.mjs",
  "tests/specs/collisions.spec.js":         "tests/unit/collisions-vm.test.mjs",
  "tests/specs/drift.spec.js":              "tests/unit/drift-vm.test.mjs",
  "tests/specs/elevation-tracks.spec.js":   "tests/unit/elevation-tracks-vm.test.mjs",
  "tests/specs/headless-api.spec.js":       "tests/unit/headless-api-vm.test.mjs",
  "tests/specs/longitudinal.spec.js":       "tests/unit/longitudinal-vm.test.mjs",
  "tests/specs/obs-act-edge.spec.js":       "tests/unit/obs-act-edge-vm.test.mjs",
  "tests/specs/offtrack.spec.js":           "tests/unit/offtrack-vm.test.mjs",
  "tests/specs/world-physics.spec.js":      "tests/unit/world-physics-vm.test.mjs",
};

export const isTwinned = (file) => Object.hasOwn(TWINNED, file);

/** Every node test file the Pages gate runs UNCONDITIONALLY: the `npm run
 *  test:*` lines of ci.yml's pure-node job, resolved through tests/groups.json,
 *  plus tooling-fast's own list. Derived, not listed — the point of the check
 *  is that it notices when a twin's group leaves the gate. */
export function gatedNodeFiles() {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const at = ci.indexOf("- name: Pure-node unit suites");
  if (at < 0) throw new Error("ci.yml has no \"Pure-node unit suites\" step — this check derives the gated set from it");
  const rest = ci.slice(at);
  const next = rest.indexOf("\n      - name:", 1);
  const step = next < 0 ? rest : rest.slice(0, next);
  const files = new Set(groups.toolingFast.filter((e) => !e.startsWith("//")));
  for (const m of step.matchAll(/npm run (test:[a-z0-9-]+)/g))
    for (const f of groups.groups[m[1]]?.files || []) files.add(f);
  return files;
}

/** Every entry: both files present, same declared test count, twin in a group
 *  the gate always runs. Returns the problems; empty means the substitution
 *  still holds. */
export function verify() {
  const fast = gatedNodeFiles();
  const problems = [], rows = [];
  for (const [spec, twin] of Object.entries(TWINNED)) {
    if (!fs.existsSync(path.join(ROOT, spec))) { problems.push(`${spec}: spec is gone — drop the entry (and its twin, if it went with it)`); continue; }
    if (!fs.existsSync(path.join(ROOT, twin))) { problems.push(`${spec}: twin ${twin} is gone — the spec is back on the blocking gate, so drop the entry`); continue; }
    const s = declaredTests(spec), t = declaredTests(twin);
    rows.push({ spec, twin, specTests: s, twinTests: t });
    if (s !== t) problems.push(
      `${spec} declares ${s} tests but ${twin} declares ${t} — the twin has stopped covering the spec, ` +
      `and the spec is skipped on the blocking gate. Port the missing test, or drop the entry so the browser copy gates again.`);
    if (!fast.has(twin)) problems.push(
      `${twin} is in no group the Pages gate runs unconditionally (tooling-fast, or a test:* named by ` +
      `ci.yml's "Pure-node unit suites" step) — a twin only substitutes for a blocking spec if it BLOCKS`);
  }
  return { ok: problems.length === 0, problems, rows };
}

function main() {
  const r = verify();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  for (const p of r.problems) console.log(`DRIFT  ${p}`);
  if (r.ok) console.log(`twinned-specs: ${r.rows.length} browser specs covered test-for-test by a VM twin on the unconditional node gate ` +
    `(${r.rows.reduce((n, x) => n + x.specTests, 0)} tests)`);
  process.exitCode = r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
