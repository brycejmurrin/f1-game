// Every unit file is either RUN by the pre-push gate or listed here with a
// reason. The gate is what `node tools/ci/deploy.mjs --gate-only` runs, which is
// what the deploy itself runs: tooling-fast plus ci.yml's "Pure-node unit
// suites" step, derived at runtime so the two cannot drift.
//
// WHY THIS EXISTS. `npm run test:tooling-fast` is the documented edit-loop
// check, and it is a SUBSET: 69 of 277 unit files are not on its list. That is
// deliberate — the list is tuned for a fast loop — but it reads as "the gate",
// and a file off it is invisible until something else happens to run it. It has
// cost real deploys twice:
//
//   2026-09-02 (runs 1888/1889) — two deploys went red on pins tooling-fast
//     never runs. The cure was gateNodeSuites(), which is why deploy.mjs runs
//     the Pages gate's node half at all.
//   2026-09-18 — quali-persist.test.mjs pins setPaused's teardown as an exact
//     source line. A fourth panel closer was added to that line, tooling-fast
//     passed 204/206, and the break surfaced only inside deploy.mjs.
//
// Both were the same shape: a source edit tripping a pin in a file the
// pre-push command does not execute. This test does not make the gate bigger.
// It makes the hole ENUMERATED, so the next file to fall out of it fails here
// with a name instead of surfacing three commands later.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLING_FAST_FILES } from "../../tools/ci/tooling-fast.mjs";
import { gateNodeSuites } from "../../tools/ci/deploy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UNIT = path.join(ROOT, "tests/unit");

/* The ONLY unit files the pre-push gate does not run, each with the group that
   does run it. These are the per-circuit geometry and parts sweeps: ci.yml
   gives them their OWN jobs ("Per-circuit geometry sweeps", "Parts
   option-resolution census"), not the "Pure-node unit suites" step the gate
   derives from, and deploy.mjs's header is explicit that sweeps are CI's —
   running them in the deploy duplicated ten minutes.

   Being on this list is not a free pass. Those CI jobs are CONDITIONAL, so a
   pin in one of these files can sit red for a while; if one starts breaking on
   source edits the way quali-persist did, move it into a gate group rather than
   widening this list.

   test:sweeps-parts left this list on 2026-09-22: its CI job is UNCONDITIONAL
   (no path filter), so deploy.mjs runs it before every push and --gate-only.

   props-over-road.test.mjs joined it the same day, and the conditionality
   warning above is the reason it is a net gain rather than a new hole: the
   audit it carries was in a browser spec declaring 1500 s, over the
   change-aware gate's 180 s cap, so it ran on NO push and only one night in
   eleven — and had been red on two circuits for as long as that. In
   test:sweeps it runs on every js/track and js/circuits diff, blocking, which
   is exactly the condition under which a prop can move. Conditional on the
   diffs that can cause the defect beats unconditional on none of them. */
const SWEEPS_ONLY = new Map([
  ["car-front-wing-width.test.mjs", "test:sweeps — per-circuit geometry"],
  ["coplanar-faces.test.mjs", "test:sweeps — per-circuit geometry"],
  ["debris-hazard-hint.test.mjs", "test:sweeps — per-circuit geometry"],
  ["driving-line-opts.test.mjs", "test:sweeps — per-circuit geometry"],
  ["driving-line.test.mjs", "test:sweeps — per-circuit geometry"],
  ["grid-boxes.test.mjs", "test:sweeps — per-circuit geometry"],
  ["lamp-fixture-anchor.test.mjs", "test:sweeps — per-circuit geometry"],
  ["pit-complex.test.mjs", "test:sweeps — per-circuit geometry"],
  ["pit-signs.test.mjs", "test:sweeps — per-circuit geometry"],
  ["prop-clipping.test.mjs", "test:sweeps — per-circuit geometry"],
  ["props-over-road.test.mjs", "test:sweeps — per-circuit geometry"],
  ["road-under-floor.test.mjs", "test:sweeps — per-circuit geometry"],
  ["scenery-grounding.test.mjs", "test:sweeps — per-circuit geometry"],
  ["shared-track-foundation-characterization.test.cjs", "test:sweeps — per-circuit geometry"],
  ["spline-project-height.test.mjs", "test:sweeps — per-circuit geometry"],
]);

const base = (f) => path.basename(f);

/** Every unit file the pre-push gate executes, by basename. */
function gateCoverage() {
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const covered = new Set(TOOLING_FAST_FILES.filter((e) => !e.startsWith("//")).map(base));
  // test:sweeps-parts is not in ci.yml's node step (it has its own unconditional
  // job), but deploy.mjs runs it before every push and in --gate-only since
  // 2026-09-22, so its files ARE gate-covered. Pinned below by source-slice.
  for (const script of [...gateNodeSuites(), "test:sweeps-parts"]) {
    const def = groups.groups[script];
    assert.ok(def, `ci.yml's Pure-node unit suites names ${script}, tests/groups.json has no such group`);
    for (const f of def.files || []) covered.add(base(f));
  }
  return covered;
}

const unitFiles = () =>
  fs.readdirSync(UNIT).filter((f) => /\.test\.(mjs|cjs)$/.test(f)).sort();

test("every unit file is run by the pre-push gate, or named here with the group that runs it", () => {
  const covered = gateCoverage();
  const uncovered = unitFiles().filter((f) => !covered.has(f));
  const unexplained = uncovered.filter((f) => !SWEEPS_ONLY.has(f));
  assert.deepEqual(unexplained, [],
    "these unit files are run by NO pre-push gate suite. Put each one in a group the gate " +
    "derives (tests/groups.json toolingFast, or a group in ci.yml's \"Pure-node unit suites\"), " +
    "or add it to SWEEPS_ONLY above naming the CI job that does run it — and read that list's " +
    "note first, because 'a CI job runs it' is weaker than it sounds");
});

test("the exemption list has no stale entries", () => {
  // A file that moved INTO the gate must leave this list, or the list stops
  // describing the hole and starts hiding that the hole shrank. Same reason
  // gen-test-groups deletes a script whose group left groups.json.
  const covered = gateCoverage();
  const stale = [...SWEEPS_ONLY.keys()].filter((f) => covered.has(f));
  assert.deepEqual(stale, [], "these are in the gate now — drop them from SWEEPS_ONLY");

  const gone = [...SWEEPS_ONLY.keys()].filter((f) => !fs.existsSync(path.join(UNIT, f)));
  assert.deepEqual(gone, [], "these files no longer exist — drop them from SWEEPS_ONLY");
});

test("the gate's node half is derived, not hard-coded", () => {
  // gateNodeSuites() reads ci.yml and THROWS on a rename rather than returning
  // [] — losing it silently is what let the 2026-09-02 deploys through. Assert
  // it still yields real groups, so this test fails loudly if that derivation
  // ever degrades to an empty list.
  const suites = gateNodeSuites();
  assert.ok(suites.length >= 8, `expected the Pages gate's node half, got ${suites.length} suite(s)`);
  for (const s of suites) assert.match(s, /^test:/, `${s} is not a test:* script`);
});

test("deploy.mjs runs test:sweeps-parts unconditionally, in the deploy and in --gate-only", () => {
  // Its CI job has no path filter, so a red there takes every push red; the
  // gate must therefore run it every time, not only when geometry moved.
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/deploy.mjs"), "utf8");
  const gateOnly = src.slice(src.indexOf("export function gateOnly()"), src.indexOf("export function main()"));
  const deploy = src.slice(src.indexOf("export function main()"));
  for (const [name, body] of [["gateOnly", gateOnly], ["main", deploy]]) {
    assert.match(body, /run\("npm", \["run", "test:sweeps-parts"\]/, `${name}() must run test:sweeps-parts`);
    assert.doesNotMatch(body.slice(0, body.indexOf('"test:sweeps-parts"')), /touchesGeometry\(/,
      `${name}(): test:sweeps-parts must not sit behind the geometry condition`);
  }
});
