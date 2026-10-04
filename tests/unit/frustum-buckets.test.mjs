/* frustum-buckets.test.mjs — every instance of a batch lies inside its cell's
 * culling box, whatever its rotation.
 *
 * Frustum.bucketInstances is the ONE cell builder GLX, WGX and TLX share, and
 * the box it gives a cell is what the camera and shadow culls test. Until
 * 2026-09-24 the reach was the mesh's largest single |coordinate| — the
 * half-width of its axis box — so a rotated instance's corner (up to sqrt(3)x
 * farther) stuck out of the box and the prop popped at the screen edge.
 *
 * Run: node --test tests/unit/frustum-buckets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Frustum = new Function(readFileSync(join(ROOT, "js/render/shared/frustum.js"), "utf8") + "; return Frustum;")();

// A unit cube's 8 corners, the batch meshes' usual shape.
const CUBE = [];
for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) CUBE.push(x, y, z);

// Column-major 4x4: rotate by (yaw about Y, then pitch about X), uniform scale s, translate t.
function matrix(yaw, pitch, s, t) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // R = Ry * Rx
  const r = [cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp];
  return [r[0] * s, r[1] * s, r[2] * s, 0, r[3] * s, r[4] * s, r[5] * s, 0, r[6] * s, r[7] * s, r[8] * s, 0, t[0], t[1], t[2], 1];
}

test("a rotated instance's every vertex lies inside its cell box", () => {
  const n = 40, mats = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    const m = matrix(i * 0.37, (i % 5) * 0.31, 1 + (i % 3), [i * 9.5, (i % 4) * 2, (i % 7) * 11]);
    mats.set(m, i * 16);
  }
  const cells = Frustum.bucketInstances(mats, n, new Float32Array(CUBE), 72);
  let checked = 0;
  for (const c of cells) {
    for (const i of c.idx) {
      const m = mats.subarray(i * 16, i * 16 + 16);
      for (let v = 0; v < CUBE.length; v += 3) {
        const [x, y, z] = [CUBE[v], CUBE[v + 1], CUBE[v + 2]];
        const w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
        for (let a = 0; a < 3; a++) {
          assert.ok(w[a] >= c.mn[a] - 1e-4 && w[a] <= c.mx[a] + 1e-4,
            `instance ${i} vertex ${v / 3} axis ${a}: ${w[a].toFixed(3)} outside [${c.mn[a].toFixed(3)}, ${c.mx[a].toFixed(3)}]`);
        }
        checked++;
      }
    }
  }
  assert.equal(checked, n * 8);
});

test("an explicit radius still wins over the derived reach", () => {
  const mats = new Float32Array(matrix(0, 0, 1, [0, 0, 0]));
  const [c] = Frustum.bucketInstances(mats, 1, new Float32Array(CUBE), 72, 10);
  assert.deepEqual([...c.mn], [-10, -10, -10]);
  assert.deepEqual([...c.mx], [10, 10, 10]);
});

// ── Frustum.radialCulled: the draw-distance + FOG-WALL cull ─────────────────
// Every lit shader (glsl-lit / tsl-lit / wgsl-chunks) fogs a fragment by
//   f = 1 - exp(-(d * dist * exp(-max(y - eyeY, 0) * h))^2).
// The cull used ONE eye-level radius, ceil(3 / d), so anything standing above
// the eye — a floodlight, a hotel, a hill — was culled while the fog had thinned
// around it: 65-70 % fogged, and it popped out at 300-750 m in night, dusk, wet
// and fog sessions. The helper culls per chunk on the height-aware exponent.
const fogOf = (d, h, dist, lift) => 1 - Math.exp(-((d * dist * Math.exp(-Math.max(lift, 0) * h)) ** 2));
const box = (x, top, w = 20, bottom = 0) => [[x - w / 2, bottom, -w / 2], [x + w / 2, top, w / 2]];
const NIGHT = [0.004, 0.018];   // atmosphere.js night density, the FOG HEIGHT FALLOFF knob's default
const EYE = [0, 1.2, 0];        // a chase camera over the road
const culled = (b, cd, fog) => Frustum.radialCulled(b[0], b[1], EYE[0], EYE[1], EYE[2], cd, fog);

test("radialCulled keeps a TALL chunk past the eye-level fog wall and drops a LOW one", () => {
  const near = 800 + 10;                         // box centre: its nearest face is 800 m out
  const mast = box(near, 45), low = box(near, 0.5);
  // The old single radius, 3/d = 750 m, culled both.
  assert.ok(800 > Math.ceil(3 / NIGHT[0]), "the fixture sits past the old 750 m night wall");
  assert.equal(culled(low, 0, NIGHT), true, "a road-level chunk 800 m out is 99.99 % fogged: culled");
  assert.equal(culled(mast, 0, NIGHT), false, "a 45 m mast 800 m out stands in thinned fog: kept");
  const fMast = fogOf(NIGHT[0], NIGHT[1], 800, 45 - EYE[1]);
  assert.ok(fMast < 0.9, `the mast's top is only ${(fMast * 100).toFixed(1)} % fogged — the pop the old cull made`);
  // …and it does go, once even its top is past the wall.
  let far = 800;
  while (!culled(box(far + 10, 45), 0, NIGHT)) far += 10;
  assert.ok(fogOf(NIGHT[0], NIGHT[1], far, 45 - EYE[1]) > 0.9998, `culled at ${far} m only once >= 99.98 % fogged`);
});

test("radialCulled is CONSERVATIVE: every point of a culled chunk is >= 99.98 % fogged", () => {
  for (const [d, h] of [NIGHT, [0.0051, 0.03], [0.0088, 0.0505], [0.002, 0]]) {
    let checked = 0;
    for (let x = 200; x <= 2500; x += 37) for (const top of [0.5, 6, 18, 45, 120]) {
      const b = box(x, top, 72, -3);
      if (!culled(b, 0, [d, h])) continue;
      for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) {
        const p = [0, 1, 2].map((a) => b[0][a] + (b[1][a] - b[0][a]) * [fx, fy, fz][a]);
        const dist = Math.hypot(p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]);
        assert.ok(fogOf(d, h, dist, p[1] - EYE[1]) > 0.9998, `d ${d} h ${h}: a culled chunk's point ${p.map((v) => v.toFixed(0))} is visible`);
        checked++;
      }
    }
    assert.ok(checked > 0, `d ${d} h ${h}: the sweep culled nothing — the guard is vacuous`);
  }
});

test("radialCulled with h = 0 is the old ceil(3 / density) radius, to the metre", () => {
  for (const d of [0.0012, 0.004, 0.0051, 0.0088]) {
    const old = Math.ceil(3 / d);
    for (const top of [0.5, 45]) {
      // Walk the nearest face outward a metre at a time: the first culled
      // distance must sit within 1 m of the old radius.
      let r = old - 5;
      while (!culled(box(r + 10, top), 0, [d, 0])) r += 1;
      assert.ok(Math.abs(r - old) <= 1, `d ${d}, top ${top}: culls from ${r} m, the old rule ${old} m`);
    }
  }
});

test("radialCulled: the hard radius always wins, and no fog is no fog cull", () => {
  const mast = box(400 + 10, 45);
  assert.equal(culled(mast, 300, NIGHT), true, "a tall chunk is still culled past the hard radius (env probe, mirror, mobile)");
  assert.equal(culled(mast, 500, NIGHT), false);
  for (const fog of [null, undefined, [0, 0.018]]) {
    assert.equal(culled(box(5000, 0.5), 0, fog), false, "no density: nothing culled without a hard radius");
    assert.equal(culled(box(5000, 0.5), 900, fog), true, "…and the hard radius alone with one");
  }
  assert.equal(Frustum.FOG_CULL_FD, 3, "exp(-9): 99.99 % fogged at the cull");
});

test("every backend's chunk loop culls through radialCulled, and game.js feeds it the fog the shader renders", () => {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");
  for (const f of ["js/render/glx/chunked.js", "js/render/three/tlx-chunked.js", "js/render/webgpu/wgx-chunked.js"]) {
    const src = read(f);
    assert.match(src, /Frustum\.radialCulled\(ch\.min, ch\.max, ex, ey, ez, cd, cf\)/, `${f}: culls through the shared helper`);
    assert.doesNotMatch(src, /aabbDist2\([^)]*\)\s*>\s*cd2|dist2\s*>\s*cd2/, `${f}: still compares against one radius`);
  }
  const game = read("js/game.js");
  assert.match(game, /_cullFog\[0\] = \(dbgCam \|\| cine\) \? 0 : \(frame\.fogDensity \|\| 0\) \* \(LT\.fogDensityMul != null \? LT\.fogDensityMul : 1\);/,
    "the density the SHADER renders (frame.fogDensity * FOG DENSITY), off under the thinned-fog cameras");
  assert.match(game, /_cullFog\[1\] = LT\.fogHeight != null \? LT\.fogHeight : \(frame\.fogHeight \|\| 0\);/, "uFogHeight's own fallback");
  assert.doesNotMatch(game, /Math\.ceil\(3 \/ _fogDens\)/, "the single eye-level radius is gone");
  // The latch each backend reads it through.
  assert.match(read("js/render/glx/glx.js"), /frameCullFog = frame\.cullFog \|\| null;/);
  assert.match(read("js/render/glx/glx.js"), /get cullFog\(\) \{ return frameCullFog; \}/);
  assert.match(read("js/render/webgpu/wgx.js"), /frameCullFog = f\.cullFog \|\| null;/);
  assert.match(read("js/render/webgpu/wgx.js"), /get frameCullFog\(\) \{ return frameCullFog; \}/);
  assert.match(read("js/render/three/tlx.js"), /chunkedSys\.cull\(rec\.chunked, _frameVP, frameEye, frameCullDist, frameCullFog\)/);
});
