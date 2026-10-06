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
//   APEX_UPDATE_BASELINE=1 APEX_BASELINE_REASON="why" npx playwright test physics-characterization
//
// Regenerating is how you SAY a physics change was intentional: the diff shows
// exactly which numbers moved, which is the whole point. NEVER regenerate to
// turn a red run green without reading that diff — that converts the one guard
// on the driving model into a rubber stamp.
//
// PROVENANCE. A regenerated file also carries `_blessed: { sha, reason, at,
// hash }` — the commit it was measured at, the reason given on the command
// line (REQUIRED: an empty APEX_BASELINE_REASON refuses to write), the time,
// and a sha256 of the scenario data. tests/unit/physics-baseline-provenance.test.mjs
// checks all four on the fast gate, so a hand-edited number, or a regen with no
// stated reason, cannot land as if it were a measurement. Neither this spec's
// compare loop nor the VM twin reads the key: both iterate SCENARIOS by name.
//
// Verified non-vacuous: changing LAT_MAX from 22 to 27 fails "steady corner
// load" by name. It runs in ~25 s because it builds ONE track and uses
// __apex.reset() between scenarios.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, pinFactorySeat } from "../helpers/fixtures.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, "..", "data", "physics-baseline.json");
const UPDATING = !!process.env.APEX_UPDATE_BASELINE;

// A MISSING BASELINE IS A FAILURE, NOT A SKIP (2026-10-04). This file-level
// skip turned a deleted or renamed baseline into a green "master gate near
// game.js" (driving-model, a required check): every scenario skipped, and the
// reporter counted skips as done. Only the regeneration run may proceed
// without one.
if (!UPDATING && !fs.existsSync(BASELINE)) {
  throw new Error(`no physics baseline at ${path.relative(path.join(HERE, "..", ".."), BASELINE)} — ` +
    "restore it, or generate it with APEX_UPDATE_BASELINE=1 and a stated APEX_BASELINE_REASON (see the header)");
}

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
  // Factory McLaren, empty sheet — GarageDefaults ships Mercedes-AMG with a
  // signature kit. This gate measures the driving model against
  // tests/data/physics-baseline.json, which is the factory car (same pin as
  // tools/lib/game-vm.cjs). Must land before loadTrack's goto.
  await pinFactorySeat(page);
  // A3: explicit dry pin — loadTrack defaults wx="dry", but grip-sensitive
  // baselines must not inherit a leftover wet enum / arc from a prior test.
  await loadTrack("monza", "day", "dry");

  const pin = await page.evaluate(() => {
    const a = window.__apex;
    a.weather("dry");
    a.step(0, 1);
    // weather() returns the discrete chip; physState has no wetness field —
    // grip pin is asserted in the VM twin via G.trackWetness / gripMult.
    return { weather: a.weather(), arc: a.weatherArc() };
  });
  expect(pin.weather, "characterization must pin dry weather").toBe("dry");
  expect(pin.arc, "characterization must clear any leftover weather arc").toBe(null);

  const got = await page.evaluate((scenarios) => {
    const a = window.__apex;
    const out = {};
    for (const s of scenarios) {
      a.weather("dry");
      a.step(0, 1);
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
    const reason = (process.env.APEX_BASELINE_REASON || "").trim();
    if (!reason) throw new Error("APEX_UPDATE_BASELINE=1 needs APEX_BASELINE_REASON=\"why the numbers moved\" — a baseline without a stated reason is a rubber stamp");
    const { blessing } = await import("../helpers/baseline-blessing.mjs");
    fs.writeFileSync(BASELINE, JSON.stringify({ ...rounded, _blessed: blessing(rounded, reason) }, null, 2) + "\n");
    test.info().annotations.push({ type: "baseline", description: `wrote ${BASELINE}` });
    return;
  }

  const want = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  for (const sc of SCENARIOS) {
    expect(rounded[sc.name], `scenario "${sc.name}" drifted — if this change was intentional, ` +
      `regenerate with APEX_UPDATE_BASELINE=1 and READ THE DIFF`).toEqual(want[sc.name]);
  }
});
