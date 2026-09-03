// Regression guard: no part of the visible road surface may sit below the flat
// world floor slab.
//
// `TrackSurface.profile` derives floorY from the lowest CENTRELINE height
// (pyMin - 1) and draws a flat slab across the world at that height. Banking
// pivots about the centre, so a banked node's low edge sits lift/2 BELOW py[k].
// Measure the centreline alone and the slab can be higher than the road it is
// supposed to sit under — it then renders straight over the inside of a banked
// corner, burying the kerb and the road edge in flat ground.
//
// Zandvoort shipped exactly that: its deepest banking (4.82 m lift, so a 2.41 m
// drop) coincides with the lowest part of the lap, putting the low edge 1.37 m
// under the slab. Nothing caught it — the geometry is valid, every mesh
// validates, props and terrain are provably clear of the road, and the only
// symptom is a pale slab lying over the track in the render. Ground-over-road
// probes miss it too, because the slab is a handful of enormous triangles that
// spatial indexes routinely skip as degenerate spans.
//
// Pure Node against the real track build in a VM, so it belongs in test:tooling.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

// Lowest vertex of an UPWARD-facing road triangle. The road mesh also carries a
// downward skirt that hangs ~1.2 m under the tarmac to hide the terrain seam;
// that is meant to be below everything and must not be measured.
function lowestVisibleRoadY(track) {
  const cap = track.meshes.road.__cap;
  const P = cap.pos, I = cap.idx;
  let lo = Infinity;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const ny = uz * vx - ux * vz;
    const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
    if (!(len > 1e-9) || Math.abs(ny) / len < 0.5) continue;
    for (const o of [a, b, c]) if (P[o + 1] < lo) lo = P[o + 1];
  }
  return lo;
}

test("the world floor slab never covers the road surface", () => {
  const env = buildContext();
  const covered = [];
  for (const def of env.Tracks.LIST) {
    const from = env.mark();
    const track = env.Tracks.build(def);
    // See the comment on trim() in track-build-vm.cjs. This suite never reads
    // env.prims/env.liveBufs, but Tracks.build() populates them as a side
    // effect regardless — without releasing them, a 40-circuit run in this
    // one process accumulated every circuit's full mesh buffers (4157 MB ->
    // 97 MB measured with this call in place).
    env.trim(from);
    const surface = track.surface;
    if (!surface) continue;
    const lo = lowestVisibleRoadY(track);
    // A slab exactly level with the road would z-fight, so require real daylight.
    const gap = surface.floorY - lo;
    if (gap > -0.05)
      covered.push(`${def.id}: floorY ${surface.floorY.toFixed(2)} vs lowest road ` +
        `surface ${lo.toFixed(2)} — slab is ${gap.toFixed(2)} m above the road`);
  }
  assert.deepEqual(covered, [],
    `the flat floor slab renders over the track:\n  ${covered.join("\n  ")}`);
});
