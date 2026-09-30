// @doc Barrier run-off jump probe: synthetic cliffs + feathered fleet caps (plan 2026-09-30 Slice 2).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  maxAdjDelta,
  maxAdjOver,
  maxWallAtStep,
  summariseTrack,
  syntheticCliff,
  featherBarrierEnds,
} = require(path.join(ROOT, "tools/track/barrier-jumps.cjs"));

test("synthetic one-node cliff of 7.9 is detected as maxAdj / maxWallStep", () => {
  // Open-circuit identity: RUNOFF_DEFAULT 9 − (tyreGap 2.2 − WALL_CLEAR 1.1) = 7.9.
  // Float32Array stores 7.9 imprecisely — compare with a centimetre tolerance.
  const arr = syntheticCliff(20, 5, 16.2, 8.3, 1);
  assert.ok(Math.abs(maxAdjDelta(arr) - 7.9) < 1e-5, `maxAdj=${maxAdjDelta(arr)}`);
  assert.ok(maxWallAtStep(arr) > 7.5, `maxWallStep=${maxWallAtStep(arr)}`);
});

test("a 3-node linear feather keeps adjacent Δ under 3 m", () => {
  // high 16.2, low 8.3, cliff 7.9 — three-step ramp → steps of 7.9/4 = 1.975.
  const arr = syntheticCliff(40, 10, 16.2, 8.3, 3);
  assert.ok(maxAdjDelta(arr) < 3.0, `feathered maxAdj=${maxAdjDelta(arr)}`);
  assert.ok(maxWallAtStep(arr) < 3.0, `feathered maxWallStep=${maxWallAtStep(arr)}`);
});

test("featherBarrierEnds turns a 7.9 cliff into steps under 3 m (would fail before)", () => {
  const n = 40;
  const hw = new Float32Array(n);
  for (let i = 0; i < n; i++) hw[i] = 7;
  // One-node cliff: over 9 → 1.1 at index 10 (absolute bar 16 → 8.1).
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = hw[i] + 9;
  arr[10] = hw[10] + 1.1;
  assert.ok(maxAdjOver(arr, hw) > 7.5, "precondition: cliff present");
  featherBarrierEnds(arr, hw, { nodes: 3, cliff: 3 });
  assert.ok(maxAdjOver(arr, hw) < 3.0, `after feather maxOver=${maxAdjOver(arr, hw)}`);
  // Tight face must not rise.
  assert.ok(Math.abs((arr[10] - hw[10]) - 1.1) < 1e-5, `tight face raised to ${arr[10] - hw[10]}`);
});

test("maxAdjOver ignores a pure hw step with constant clearance", () => {
  const n = 8;
  const bar = new Float32Array(n);
  const hw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hw[i] = i < 4 ? 7 : 9;
    bar[i] = hw[i] + 9; // constant over = 9
  }
  assert.equal(maxAdjOver(bar, hw), 0);
  assert.ok(maxAdjDelta(bar) >= 2); // absolute bar still steps with hw
});

test("fleet: open-circuit tyre termini stay under 3 m after feather (Slice 2)", () => {
  // Would fail on ship tip before featherBarrierEnds (maxOver ≈ 7.9).
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  for (const id of ["monza", "spa", "bahrain", "silverstone"]) {
    const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
    const s = summariseTrack(track);
    assert.ok(s.maxOver < 3.0, `${id} maxOver=${s.maxOver} (want < 3)`);
    assert.ok(s.maxWallStep < 3.0, `${id} maxWallStep=${s.maxWallStep} (want < 3)`);
  }
  // Interior of a known Monza stack face stays near hw+1.1 (feather must not raise it).
  const monza = Tracks.build(Tracks.LIST.find((d) => d.id === "monza"));
  const kTight = Math.round(0.305 * monza.n) % monza.n;
  const over = monza.barR[kTight] - monza.hw[kTight];
  assert.ok(over < 2.0, `mid-stack over should be ~1.1, got ${over} at k=${kTight}`);
});

test("monaco pit taper: feather after openBoundary keeps maxOver under 3 m", () => {
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === "monaco"));
  const s = summariseTrack(track);
  assert.ok(s.maxOver < 3.0, `monaco maxOver=${s.maxOver} (want < 3)`);
});
