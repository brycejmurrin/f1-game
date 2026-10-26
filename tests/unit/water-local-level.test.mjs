// water-local-level.test.mjs — local water sheets sit on local ground (#3281).
// waterSurface / waterEmit used to pin every sheet at pyMin - 0.8, so Spa's
// Eau Rouge brook (and any hillside pond) sat ~25–50 m under the valley floor
// while coastal basins whose terrainY ≈ pyMin looked fine by accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

function waterYRange(Tracks, id) {
  const def = Tracks.LIST.find((d) => d.id === id);
  assert.ok(def, id);
  Tracks.setKeepGeometry(true);
  const track = Tracks.build(def);
  const pos = track.waterGeo && track.waterGeo.pos;
  assert.ok(pos && pos.length >= 12, `${id} must emit water verts`);
  let yMin = Infinity, yMax = -Infinity, pyMin = Infinity;
  for (let i = 0; i < track.n; i++) if (track.py[i] < pyMin) pyMin = track.py[i];
  for (let i = 1; i < pos.length; i += 3) {
    const y = pos[i];
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  // Sample mid-box verts against Tracks.terrainY at their XZ.
  let maxAbsGap = 0, samples = 0;
  for (let i = 0; i < pos.length; i += 72) {          // one corner of every ~third box
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const gy = Tracks.terrainY(track, x, z);
    if (gy == null || !Number.isFinite(gy)) continue;
    maxAbsGap = Math.max(maxAbsGap, Math.abs(y - (gy - 0.8)));
    samples++;
  }
  return { yMin, yMax, pyMin, maxAbsGap, samples };
}

test("Spa Eau Rouge brook sits near local terrain, not the lap's pyMin floor", () => {
  const Tracks = buildContext(null, { quiet: true });
  const { yMin, yMax, pyMin, maxAbsGap, samples } = waterYRange(Tracks, "spa");
  // Pre-fix: every water vert was at pyMin - 0.8 (~ -50.5). The valley road
  // near the authored brook is ~-25; a 15 m lift off the global floor is the
  // regression signal.
  assert.ok(yMin > pyMin + 15,
    `spa water yMin ${yMin.toFixed(2)} still near pyMin ${pyMin.toFixed(2)}`);
  assert.ok(yMax - yMin < 8,
    `spa brook sheets should share a valley band, got span ${(yMax - yMin).toFixed(2)} m`);
  assert.ok(samples >= 1, "terrain under at least one water sample");
  assert.ok(maxAbsGap < 1.5,
    `spa water should track terrainY - 0.8 (max gap ${maxAbsGap.toFixed(2)} m)`);
});

test("Singapore marina water stays within a few metres of pyMin (coastal)", () => {
  const Tracks = buildContext(null, { quiet: true });
  const { yMin, yMax, pyMin } = waterYRange(Tracks, "singapore");
  // Coastal sheets must not jump onto quay-height road; they follow bay
  // terrain near the lap floor.
  assert.ok(yMin > pyMin - 4 && yMax < pyMin + 4,
    `singapore water [${yMin.toFixed(2)}, ${yMax.toFixed(2)}] vs pyMin ${pyMin.toFixed(2)}`);
});
