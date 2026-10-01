// @doc Barrier run-off jump probe: synthetic cliffs + ship-tip characterisation (plan 2026-09-30).
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

test("ship tip: monza open-circuit tyre termini still cliff at ~7.9 m (characterisation)", () => {
  // Locks the OPEN ledger defect until Slice 2 feathers termini. Do not turn
  // this into an upper bound here — that lands with the feather in one commit.
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const { Tracks } = buildContext();
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === "monza"));
  const s = summariseTrack(track);
  assert.ok(s.maxOver > 7.5, `expected open-circuit cliff > 7.5, got maxOver=${s.maxOver}`);
  assert.ok(s.maxWallStep > 7.5, `expected wallAt step > 7.5, got ${s.maxWallStep}`);
  // Interior of a known stack face stays near hw+1.1 (not the runoff default).
  // Monza R enters a tyre stack at k≈440 (frac 0.304): mid-stack over ≈ 1.1.
  const kTight = Math.round(0.305 * track.n) % track.n;
  const over = track.barR[kTight] - track.hw[kTight];
  assert.ok(over < 2.0, `mid-stack over should be ~1.1, got ${over} at k=${kTight}`);
});
