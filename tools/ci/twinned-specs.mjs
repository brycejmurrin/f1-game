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
  "tests/specs/agent-view.spec.js":         "tests/unit/agent-view-vm.test.mjs",
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
  "tests/specs/wake-lock.spec.js":          "tests/unit/wake-lock-vm.test.mjs",
  "tests/specs/world-physics.spec.js":      "tests/unit/world-physics-vm.test.mjs",
};

/** spec -> ITSELF, run under the `vmPage` adapter (tests/helpers/vm-page.js,
 *  APEX_VM_PAGE=1) instead of a hand-written twin. Same substitution as
 *  TWINNED — the browser copy leaves the blocking gate, the node copy runs in
 *  `test:vm-page` (tests/unit/adapted-specs.test.mjs, one child process per
 *  spec), which ci.yml's pure-node job runs unconditionally — with ONE copy
 *  of the spec, so the count check is trivially equal and drift is impossible
 *  by construction. Each entry earned its place by RUNNING green under the
 *  adapter on 2026-09-22 (tools/check/vm-portable.mjs says eligible; only a
 *  run says adapted). The value is why the spec is sound without a renderer.
 *
 *  A spec that imports `test` from @playwright/test cannot see the
 *  APEX_VM_PAGE switch, and moving that import onto ../helpers/fixtures.js is
 *  NOT a no-op for its browser copy: the fixtures pin `apex26.gfxBackend` to
 *  GLX and tyre wear off. A bulk swap of 16 such specs failed
 *  bahrain-foundation's scenery audit on CI (2026-09-22, run 35689898056) and
 *  was reverted; move one only when its browser copy has been re-run green
 *  under the fixtures, in the same change that adapts it. */
export const ADAPTED = {
  "tests/specs/physics-fixes.spec.js":
    "pure __apex physics reads (wall scrub, lap-distance continuity); 2/2 under the adapter in 27 s vs 110 s of browser; mutant m-wall-scrub-flat proves it bites",
  "tests/specs/logging.spec.js":
    "js/core/log.js's ring and console thresholds through __apex.logs(); 6/6 in 6 s; m-log-ring-lags-console proves the ring-vs-console max() is watched",
  "tests/specs/projection.spec.js":
    "Tracks.project() round-trips and the +right lateral sign, pure geometry; 3/3 in 15 s; m-project-lat-sign proves a flipped sign is caught",
  "tests/specs/race-control.spec.js":
    "the caution layer's state through __apex.caution(); 3/3 in 12 s; m-caution-two-sectors (and m-caution-label-drift) prove the per-sector/label contract is watched",
  "tests/specs/parts-livery-contrast.spec.js":
    "livery ink/halo contrast and decal placement over car3d geometry, no raster; 8/8 in 7 s; m-wing-band-floats proves the wing band's seat is watched",
  "tests/specs/agent-drive-bench.spec.js":
    "agentview's corner facts and the bench policies against game-vm; 5/5 in 48 s; m-straight-exit-threshold proves the exitsOntoStraight derivation is watched",
  "tests/specs/pit-lane.spec.js":
    "the pit lane's limiter, box and lane geometry through __apex; 6/6 in 91 s; m-box-lat-swallows-line proves the box-vs-racing-line distinction is watched",
};

/** Portable by every static measure and deliberately NOT adapted: the
 *  reason is the whole entry. twinDebt() excludes these, so the ratchet can
 *  reach zero without asking for a substitution that would be a hole. */
export const BROWSER_ONLY = {
  "tests/specs/smoke.spec.js": "the boot gate: it proves a real Chromium boots the shell, which is the one thing no VM can",
  "tests/specs/physics-characterization.spec.js": "tests/data/physics-baseline.json is a real-Chromium measurement; the VM twin asserts parity WITH it, so the browser copy is the reference",
  // Measured 2026-09-22 by RUNNING every statically portable spec under the
  // adapter (artifacts/logs/vmpage/*.log): these fail for a reason no static
  // scan sees, and the reason is structural, not a flake.
  "tests/specs/new-hooks.spec.js": "6 of 56 are first-load assertions (`lapHistory()` null before a track loads); createGame settles the boot circuit, so they can never hold in the VM",
  "tests/specs/car-effects.spec.js": "every test reads the shell DOM inside evaluate (querySelector on a node the VM's document does not build): 0/9",
  "tests/specs/multiplayer-npeer.spec.js": "reads the lobby DOM inside evaluate (querySelector → null): 0/4",
  "tests/specs/multiplayer-roles.spec.js": "reads the lobby DOM inside evaluate (querySelector → null): 0/5",
  "tests/specs/parts-ers.spec.js": "reads the setup screen's DOM inside evaluate (querySelector → null): 0/4",
  "tests/specs/parts-factory-presets.spec.js": "reads the setup screen's DOM inside evaluate (querySelector → null): 0/1",
  "tests/specs/parts-mesh-cache.spec.js": "waits on garage state the VM never reaches (three real 45 s waitForFunction timeouts) plus a DOM read: 1/5",
  "tests/specs/tracks-walls.spec.js": "one circuit (catalunya) drives the frame loop, which throws with no renderer attached: 62/63 — the spec is a unit, not a set",
  "tests/specs/understeer-cue.spec.js": "portable by every static measure and 0/7 under the adapter (317 s) — the standing proof that eligibility is not fidelity (docs/TESTING.md §vmPage)",
  "tests/specs/audit.spec.js": "two evaluate bodies do not survive source serialisation into the VM (`Unexpected token ';'`): 8/10",
  "tests/specs/debris.spec.js": "loads rapier through a dynamic import, which node:vm has no import callback for (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING): 1/5",
  // Measured 2026-09-22, right after the 25-test file was split: the 9-test
  // drag half became statically portable (the auto-throttle test that drives a
  // real race moved to touch-pedals.spec.js) and immediately appeared in
  // twinDebt. RUNNING it settles the question the static scan cannot.
  "tests/specs/touch-steer.spec.js": "8/9 in 1.7 s, and the ninth is structural: the release ramp is rate x dt off the wall clock, and pump()'s waitForTimeout does not advance the VM's, so `lifting off ramps back to centre` reads 0.98 where a browser reads 0 — three runs, same single failure",
};

export const isTwinned = (file) => Object.hasOwn(TWINNED, file) || Object.hasOwn(ADAPTED, file);
/** The node file that replays `file`: its hand twin, or itself under the adapter. */
export const twinOf = (file) => TWINNED[file] || (Object.hasOwn(ADAPTED, file) ? file : undefined);
export const isAdapted = (file) => Object.hasOwn(ADAPTED, file);
/** The runner `test:vm-page` executes; every ADAPTED spec is gated through it. */
export const ADAPTED_RUNNER = "tests/unit/adapted-specs.test.mjs";

/** Browser specs that tools/check/vm-portable.mjs finds portable, that no
 *  twin or adaptation covers, and that are not BROWSER_ONLY by name: the
 *  SwiftShader minutes still being spent on assertions the VM could run.
 *  A `tree` ratchet in tests/data/ratchets.json holds this shrink-only.
 *  Async because vm-portable parses every spec (espree); partitionArgs, on
 *  every playwright spawn, never pays for it. */
export async function twinDebt() {
  const { auditAll } = await import("../check/vm-portable.mjs");
  return auditAll()
    .filter((r) => r.portable && !isTwinned(r.file) && !Object.hasOwn(BROWSER_ONLY, r.file))
    .map((r) => r.file);
}

/** The LOCAL half of the substitution (2026-09-16). select-specs skipped the
 *  twins on CI's blocking gate from the day they landed, but every local
 *  runner — `npm run test:<group>`, test-bg, verify-change — still spawned
 *  them: the `collisions` group is 32/32 twinned, `aero` 30/37, and a
 *  js/game.js edit routes to both, so a physics change paid ~16 minutes of
 *  SwiftShader for assertions test:game-vm had already run in seconds.
 *
 *  Splits a `playwright test` argv into what still runs and what a twin
 *  covers. Flags and non-spec paths pass through untouched; a twinned spec is
 *  dropped unless `--with-twinned` is on the command line or
 *  APEX_WITH_TWINNED=1 is set (CI's dispatched wide run sets it, so a
 *  dispatched `collisions` group still runs its browser copies).
 *
 *  `nothingToRun` means every spec named was a twin, so Playwright must not be
 *  spawned at all — an empty spec list runs the WHOLE suite. It does NOT mean
 *  the group is green. run-playwright.mjs runs the dropped twins in node and
 *  reports THEIR verdict. The first cut printed `= run passed  (0/0 done,
 *  0 failed)` instead, and within hours a 32/32-twinned `collisions` group had
 *  been read as a verified gate for a change to the contact solver, having
 *  executed nothing. A twin that is named but never run is not a substitution,
 *  it is a hole. */
export function partitionArgs(argv, env = process.env) {
  const withTwinned = argv.includes("--with-twinned") || env.APEX_WITH_TWINNED === "1";
  const keep = [], dropped = [];
  let specs = 0;
  for (const a of argv) {
    if (a === "--with-twinned") continue;
    const rel = a.startsWith("-") ? null : a.replace(/^\.\//, "").replace(/^\/.*\/(tests\/specs\/)/, "$1");
    const isSpec = rel != null && /^tests\/specs\/[^/]+\.spec\.js$/.test(rel);
    if (isSpec) specs++;
    if (isSpec && !withTwinned && isTwinned(rel)) { dropped.push(isAdapted(rel) ? { spec: rel, twin: rel, adapted: true } : { spec: rel, twin: TWINNED[rel] }); continue; }
    keep.push(a);
  }
  return { args: keep, dropped, nothingToRun: specs > 0 && specs === dropped.length };
}

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
  // BOUNDED AT THE JOB, not merely at the next NAMED step (2026-09-22). A step
  // with no `- name:` ends the slice nowhere, so this read past the end of the
  // node-suites job and swallowed the next job's steps — `sweeps-parts`, whose
  // one step was a bare `- run: npm run test:sweeps-parts`. Its file has read
  // as GATED ever since, by a parser accident rather than by anything running
  // it in that step, and the day that job's step got a name of its own the
  // guard below went red on a file nothing about had changed.
  //
  // ci-coverage.mjs's header records the identical defect in the identical
  // shape: an unbounded slice from one anchor reads whatever was appended after
  // it. Both bounds are cheap; neither is optional.
  const nextStep = rest.indexOf("\n      - ", 1);
  const nextJob = rest.search(/\n  [a-z][\w-]*:\n/);
  const end = Math.min(...[nextStep, nextJob].filter((i) => i >= 0));
  const step = Number.isFinite(end) ? rest.slice(0, end) : rest;
  const files = new Set(groups.toolingFast.filter((e) => !e.startsWith("//")));
  for (const m of step.matchAll(/npm run (test:[a-z0-9-]+)/g))
    for (const f of groups.groups[m[1]]?.files || []) files.add(f);
  return files;
}

/** The node groups tools/ci/deploy.mjs runs in its own gate, UNCONDITIONALLY —
 *  read out of its source, never listed here. This is the second half of the
 *  answer to "what covers a file no CI fast-tier step runs": `test:sweeps` is
 *  covered CONDITIONALLY (deploy.mjs runs it when the union can move geometry),
 *  and a group like `test:sweeps-parts` is covered unconditionally. Both are
 *  real cover; a guard that knows only about the first reads the second as a
 *  hole. */
export function deployGateGroups() {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/deploy.mjs"), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");                 // comments never count as cover
  return new Set([...src.matchAll(/run\("npm", \["run", "(test:[a-z0-9-]+)"\]/g)].map((m) => m[1]));
}

/** Node test files that belong to a topical group but that NOTHING runs before
 *  a Pages publish — not tooling-fast, not the Pages gate's own node suites.
 *
 *  This set is why the release train sat blocked from 01:44 to past 03:00 on
 *  2026-09-18. tests/unit/debris-hazard-hint.test.mjs lives only in
 *  `test:sweeps`, which is neither in tooling-fast nor in ci.yml's "Pure-node
 *  unit suites" step, so a one-ULP float comparison could fail every Pages
 *  publish for hours while CI stayed green and every local gate passed. The
 *  failure was real and the guard was right; what was missing is that nothing
 *  ran it at the moment it mattered.
 *
 *  DERIVED, not listed, for the same reason gatedNodeFiles() is: a hand-kept
 *  list of "things no gate runs" is exactly the list nobody updates. Add a test
 *  file to a sweeps-only group tomorrow and it joins this set by itself, and
 *  tools/ci/deploy.mjs runs it before it pushes. */
export function ungatedNodeFiles() {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const gated = gatedNodeFiles();
  const out = new Set();
  for (const grp of Object.values(groups.groups || {})) {
    if ((grp.kind || "node") === "browser") continue;
    for (const f of grp.files || []) if (!gated.has(f) && !f.startsWith("//")) out.add(f);
  }
  return [...out].sort();
}

/** Every entry: both files present, same declared test count, twin in a group
 *  the gate always runs. Returns the problems; empty means the substitution
 *  still holds. */
export function verify() {
  const fast = gatedNodeFiles();
  const problems = [], rows = [];
  for (const spec of Object.keys(ADAPTED)) {
    if (!fs.existsSync(path.join(ROOT, spec))) { problems.push(`${spec}: spec is gone — drop the ADAPTED entry`); continue; }
    if (Object.hasOwn(TWINNED, spec)) problems.push(`${spec} is both TWINNED and ADAPTED — one substitution per spec`);
    const src = fs.readFileSync(path.join(ROOT, spec), "utf8");
    if (/from "@playwright\/test"/.test(src)) problems.push(
      `${spec} imports \`test\` from @playwright/test, so it cannot see the APEX_VM_PAGE switch — import from ../helpers/fixtures.js`);
    // Equal counts are VACUOUS for an adapted spec (the twin is the spec), so
    // the fidelity gate stands in: at least one mutant in tests/data/mutants.json
    // must name this spec and a test it reddens. tools/check/twin-fidelity.mjs
    // proves each mutant bites; docs/TESTING.md §vmPage is the rule this keeps.
    const mutants = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/mutants.json"), "utf8")).mutants;
    if (!mutants.some((m) => m.spec === spec && Object.values(m.catchers || {}).some((v) => v === true))) problems.push(
      `${spec} is ADAPTED but no mutant in tests/data/mutants.json names it with a test it reddens — ` +
      `without one the substitution is unproven (equal counts say nothing when the twin IS the spec)`);
    const s = declaredTests(spec);
    rows.push({ spec, twin: spec, specTests: s, twinTests: s, adapted: true });
    if (!fast.has(ADAPTED_RUNNER)) problems.push(
      `${ADAPTED_RUNNER} is in no group the Pages gate runs unconditionally — an adapted spec only substitutes for a blocking spec if the runner BLOCKS`);
  }
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

async function main() {
  const r = verify();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  for (const p of r.problems) console.log(`DRIFT  ${p}`);
  if (r.ok) console.log(`twinned-specs: ${r.rows.length} browser specs covered test-for-test by a VM twin on the unconditional node gate ` +
    `(${r.rows.reduce((n, x) => n + x.specTests, 0)} tests; ${r.rows.filter((x) => x.adapted).length} run as themselves under the adapter)`);
  const debt = await twinDebt();
  console.log(`twin debt: ${debt.length} portable spec(s) still on the browser gate` + (debt.length ? `\n  ${debt.join("\n  ")}` : ""));
  process.exitCode = r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
