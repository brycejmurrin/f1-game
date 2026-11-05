import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// #4970: static-geometry guards that must tolerate swaying FOLIAGE.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (f) => readFileSync(join(ROOT, f), "utf8");
const FRUSTUM = src("js/render/shared/frustum.js");
const HF = new Function(
  "const MAT_FOLIAGE = 4; " + src("js/track/core/hidden-faces.js") + "; return TrackHiddenFaces;")();

test("tlx chunks pad their AABBs by Frustum.MOTION_PAD (source pin; the cull reads min/max as-is)", () => {
  assert.match(FRUSTUM, /return \{[^}]*MOTION_PAD/);
  assert.match(src("js/render/three/tlx-chunked.js"), /bk\.mn\.map\(\(v\) => v - Frustum\.MOTION_PAD\)/);
});

// addBox-shaped 24 vertices: face f = (axis f>>1, sign), 4 verts each, outward winding.
function box(c, h, mat, sway) {
  const pos = [], nrm = [], m = [], idx = [];
  for (let f = 0; f < 6; f++) {
    const ax = f >> 1, sg = f & 1 ? -1 : 1, u = (ax + 1) % 3, v = (ax + 2) % 3;
    const n = [0, 0, 0]; n[ax] = sg;
    const base = f * 4;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0]; p[ax] = c[ax] + sg * h; p[u] = c[u] + a * h; p[v] = c[v] + b * h;
      pos.push(...p); nrm.push(...n); m.push(mat + (sway || 0));
    }
    const o = sg > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of o) idx.push(base + i);
  }
  return { pos, nrm, m, idx };
}
function geoWith(outerSway) {
  const A = box([0, 0, 0], 2, 4, outerSway), B = box([0, 0, 0], 0.3, 7, 0);
  const pos = [...A.pos, ...B.pos], nrm = [...A.nrm, ...B.nrm], mat = [...A.m, ...B.m];
  const idx = [...A.idx, ...B.idx.map((i) => i + 24)];
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(pos.length).fill(0.5),
           mat: new Float32Array(mat), idx: new Uint32Array(idx) };
}
test("hidden-faces: a static box strips what it encloses, a swaying one does not", () => {
  const still = HF.strip(geoWith(0), {});
  assert.equal(still.enclosed, 12, "control: static encloser strips the inner box");
  const sway = HF.strip(geoWith(0.5), {});
  assert.equal(sway.enclosed, 0);
});
