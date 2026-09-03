// @ts-check
// CHARACTERIZATION of the driving model — the guard that makes extracting from
// js/game.js safe.
//
// This is deliberately NOT a correctness test. It asserts nothing about whether
// the physics is good; it asserts only that it produces the SAME NUMBERS it
// produced before you touched it. That is what a characterization test is for,
// and it is the step the standard "change point -> seam -> characterize ->
// refactor" loop says never to skip.
//
// Why it did not exist. This repo already has an excellent example of the
// pattern in tools/track/graph-parity.cjs, which builds every track from a baseline
// ref AND the working tree and diffs prop geometry vertex for vertex. Nothing
// equivalent covered the physics side, so an extraction out of updateCar() or
// render() had no way to prove it changed nothing — and "the existing specs
// still pass" is much weaker, because they assert thresholds ("faster on tarmac
// than grass") that a small numerical drift sails straight through.
//
// How it differs from tests/specs/agent-determinism.spec.js: that spec proves the same
// seed and inputs reproduce WITHIN a session. This one pins the actual values
// ACROSS commits. Determinism without a baseline is reproducible drift.
//
// THE BASELINE IS COMMITTED (tests/data/physics-baseline.json), so this is a LIVE
// GATE. Regenerate it with:
//
//   APEX_UPDATE_BASELINE=1 npx playwright test physics-characterization
//
// Regenerating is how you SAY a physics change was intentional: the diff shows
// exactly which numbers moved, which is the whole point. NEVER regenerate to
// turn a red run green without reading that diff — that converts the one guard
// on the driving model into a rubber stamp.
//
// Verified non-vacuous: changing LAT_MAX from 22 to 27 fails "steady corner
// load" by name. It runs in ~25 s because it builds ONE track and uses
// __apex.reset() between scenarios.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../helpers/fixtures.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, "..", "data", "physics-baseline.json");
const UPDATING = !!process.env.APEX_UPDATE_BASELINE;

test.skip(!UPDATING && !fs.existsSync(BASELINE),
  "no physics baseline committed — generate with APEX_UPDATE_BASELINE=1 (see the header)");

// Fixed scenarios. Each is a seed, a start state and a scripted input sequence.
// Kept small and varied rather than long: the point is to touch several regions
// of the model (steady state, cornering load, trail braking, off-track) so a
// change anywhere shows up, not to simulate a whole lap.
const SCENARIOS = [
  { name: "straight-line accel", seed: 7, frac: 0.05, speed: 20,
    steps: [{ n: 120, in: { throttle: true, steer: 0 } }] },
  { name: "steady corner load", seed: 7, frac: 0.28, speed: 55,
    steps: [{ n: 90, in: { throttle: true, steer: 0.6 } }] },
  { name: "trail brake into rotation", seed: 11, frac: 0.28, speed: 70,
    steps: [{ n: 45, in: { brake: true, steer: 0.5 } }, { n: 45, in: { throttle: true, steer: 0.3 } }] },
  { name: "off-track recovery", seed: 3, frac: 0.5, speed: 45, x: 11,
    steps: [{ n: 90, in: { throttle: true, steer: -0.4 } }] },
];

// The fields that define "the car moved the same way". Rounded to 1e-4 so the
// comparison survives JSON round-tripping, and no tighter — a tolerance loose
// enough to hide a real change would defeat the point.
const R = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);

test("the driving model produces the same numbers it did before", async ({ page, loadTrack }) => {
  // ONE track build for the whole suite. Every scenario runs on monza and
  // __apex.reset() is a fast episode reset that does not reload assets, so
  // calling loadTrack() per scenario paid for four full builds and blew the
  // 120 s test budget on the second one under SwiftShader. Load once, reset
  // between scenarios.
  test.setTimeout(300_000);
  await loadTrack("monza");

  const got = await page.evaluate((scenarios) => {
    const a = window.__apex;
    const out = {};
    for (const s of scenarios) {
      a.seed(s.seed);
      a.reset(s.frac, s.speed, s.x || 0);
      const trace = [];
      for (const stage of s.steps) {
        a.setInput(stage.in);
        for (let i = 0; i < stage.n; i++) {
          a.step(1 / 60, 1);
          if (i % 15 === 0) {
            const p = a.physState();
            trace.push([p.s, p.x, p.speed, p.slipDeg, p.head, p.prog]);
          }
        }
      }
      a.clearInput();
      out[s.name] = trace;
    }
    return out;
  }, SCENARIOS);

  const rounded = {};
  for (const k of Object.keys(got)) rounded[k] = got[k].map((row) => row.map(R));

  if (UPDATING) {
    fs.writeFileSync(BASELINE, JSON.stringify(rounded, null, 2) + "\n");
    test.info().annotations.push({ type: "baseline", description: `wrote ${BASELINE}` });
    return;
  }

  const want = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  for (const sc of SCENARIOS) {
    expect(rounded[sc.name], `scenario "${sc.name}" drifted — if this change was intentional, ` +
      `regenerate with APEX_UPDATE_BASELINE=1 and READ THE DIFF`).toEqual(want[sc.name]);
  }
});
