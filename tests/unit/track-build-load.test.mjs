/* track-build-load.test.mjs — the track build's load budget: the pine coplanar guard (js/track/scenery/nature.js
 * pine → clash) must not walk every facet pair of every neighbouring pine.
 *
 * A·H15 load hunt (2026-10-24; findings in the lane note on PR #3704). The guard tested all ~1764 facet pairs per
 * neighbour (42 cone facets × 42) for parallelism: 3.8 s self time of a 4× Spa build profile, ~40 % of each
 * build. Neighbours' facets are now kept sorted by n.x and only a ±0.045 window is tested (|n_F . n_G| >= 0.999
 * forces |nx_G ∓ nx_F| <= 0.0447), which left all 51 circuits' built geometry byte-identical (sha256 over every
 * typed array Tracks.build returns) and cut Nürburgring 2175 → 1532 ms, Spa 2156 → 1740 ms (TRACK_VM medians).
 *
 * The budget counts Math.abs calls in the VM during one Nürburgring build — the guard's inner test runs one per
 * candidate pair, and the count is deterministic: 11.2 M before, 4.1 M after. Wall time is not asserted.
 *
 * Run: node --test tests/unit/track-build-load.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const NURBURGRING_ABS_BUDGET = 6_000_000;

test("a Nürburgring build stays inside its Math.abs budget (the pine guard tests a window, not every pair)", () => {
  const Tracks = buildContext();
  const M = vm.runInContext("Math", Tracks._vmContext);
  const abs = M.abs;
  let n = 0;
  M.abs = (x) => { n++; return abs(x); };
  try {
    const def = Tracks.LIST.find((d) => d.id === "nurburgring");
    assert.ok(def, "nurburgring is in Tracks.LIST");
    const track = Tracks.build(def);
    assert.ok(track && track.meshes, "the build returned a world");
  } finally { M.abs = abs; }
  assert.ok(n > 500_000, `the counter saw the build (${n} calls)`);
  assert.ok(n <= NURBURGRING_ABS_BUDGET, `${n} Math.abs calls in one Nürburgring build (budget ${NURBURGRING_ABS_BUDGET}) — a scan over every facet pair is back`);
});

test("the windowed guard finds the same parallel facet pairs as the full scan", () => {
  // The guard's own superset argument, checked on random unit normals: every pair the brute force accepts lies
  // inside the ±0.045 n.x window around +fx or -fx.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const unit = () => { const a = rnd() * 2 * Math.PI, z = rnd() * 2 - 1, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
  let found = 0;
  for (let t = 0; t < 4000; t++) {
    const F = unit();
    // A near-parallel partner: F rotated by a tiny random amount, half of them flipped.
    const e = 0.03 * rnd(), q = unit(), s = rnd() < 0.5 ? -1 : 1;
    const G0 = [F[0] + e * q[0], F[1] + e * q[1], F[2] + e * q[2]], l = Math.hypot(...G0), G = G0.map((v) => s * v / l);
    const dot = F[0] * G[0] + F[1] * G[1] + F[2] * G[2];
    if (Math.abs(dot) < 0.999) continue;
    found++;
    const inWindow = Math.abs(G[0] - F[0]) <= 0.045 || Math.abs(G[0] + F[0]) <= 0.045;
    assert.ok(inWindow, `parallel pair outside the window: F=${F} G=${G}`);
  }
  assert.ok(found > 1000, "the sample exercised parallel pairs (" + found + ")");
});
