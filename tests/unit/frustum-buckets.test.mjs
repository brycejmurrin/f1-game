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
