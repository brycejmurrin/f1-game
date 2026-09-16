#!/usr/bin/env node
/**
 * @doc How much would occlusion culling save? Exact software visibility per 72 m cell, no GPU.
 * @skill webgl-debug
 * occlusion-estimate.mjs — the number that decides whether "render only what we
 * can see" is worth building.
 *
 * EXACT at this resolution, not an AABB approximation. An earlier cut rasterised
 * chunk BOUNDING RECTS and reported 93 % of cells occluded; that is nonsense in
 * the optimistic direction, because a 72 m cell's projected rect claims a solid
 * block of screen while the buildings inside it have sky and streets between
 * them. So: rasterise every prop TRIANGLE into a depth buffer carrying the cell
 * id that won each pixel. The cells present in the final buffer are exactly the
 * cells that contribute a visible pixel; every other frustum-submitted cell is
 * drawn for nothing and is what occlusion culling would remove.
 *
 *   node tools/check/occlusion-estimate.mjs [track] [cameras]
 *   OCC_W=512 OCC_H=288 node tools/check/occlusion-estimate.mjs vegas 4
 *
 * WHAT IT IS NOT. Props only — not the road, the terrain or the cars. Cameras
 * sit on the centreline at 1.3 m looking six nodes ahead, which is a driving
 * view and not a chase or a replay one. And the far plane here is 1500 m, so
 * any cell the shipped radial/fog cull already drops is still counted as
 * submitted: the baseline is therefore generous and the saving it reports is an
 * upper bound on what occlusion culling ALONE would add.
 *
 * The result is stable under resolution, which is the check that matters for a
 * rasterised estimate — vegas on four cameras reads 85.9 / 84.9 / 84.4 % of
 * cells wasted at 256x144, 512x288 and 1024x576. An earlier cut of this tool
 * rasterised chunk BOUNDING RECTS instead of triangles and reported 93 %; that
 * was nonsense in the optimistic direction, because a 72 m cell projects to a
 * solid rectangle while the buildings inside it have sky and streets between
 * them. Rects are why this rasterises triangles.
 */
import { createRequire } from "node:module";
import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const TRACK = process.argv[2] || "vegas";
const SAMPLES = +(process.argv[3] || 16);
const CELL = 72, W = +(process.env.OCC_W||256), H = +(process.env.OCC_H||144), FOV = 55 * Math.PI / 180, NEAR = 0.3, FAR = 1500;
const g = await createGame({ track: TRACK });
const M4 = g.ctx.M4, track = g.G.track;
const geo = track.propsGeo;
if (!geo || !geo.pos || !geo.idx) { console.error("no propsGeo/idx in the VM build"); process.exit(1); }
const pos = geo.pos, idx = geo.idx, triN = (idx.length / 3) | 0;

// Cell id per triangle, keyed as the chunked mesh keys its 72 m cells.
const cellOf = new Int32Array(triN), cellIds = new Map(), cellVerts = [];
for (let t = 0; t < triN; t++) {
  const a = idx[t * 3] * 3;
  const k = Math.floor(pos[a] / CELL) + "," + Math.floor(pos[a + 2] / CELL);
  let id = cellIds.get(k);
  if (id === undefined) { id = cellIds.size; cellIds.set(k, id); cellVerts.push(0); }
  cellOf[t] = id; cellVerts[id] += 3;
}
const view = M4.ident(), proj = M4.ident(), vp = M4.ident();
const depth = new Float64Array(W * H), owner = new Int32Array(W * H);
const sx = new Float64Array(3), sy = new Float64Array(3), sw = new Float64Array(3);

let subCells = 0, visCells = 0, subVerts = 0, visVerts = 0, subTris = 0, visTris = 0;
for (let s = 0; s < SAMPLES; s++) {
  const si = Math.floor(track.n * s / SAMPLES), j = (si + 6) % track.n;
  const ey = (track.py ? track.py[si] : 0) + 1.3;
  M4.lookAtTo(view, [track.px[si], ey, track.pz[si]],
              [track.px[j], (track.py ? track.py[j] : 0) + 1.3, track.pz[j]], [0, 1, 0]);
  M4.perspectiveTo(proj, FOV, W / H, NEAR, FAR);
  M4.mulTo(vp, proj, view);
  depth.fill(-Infinity); owner.fill(-1);   // 1/z: LARGER is nearer
  const submitted = new Set(); let stris = 0;
  for (let t = 0; t < triN; t++) {
    let ok = true;
    for (let v = 0; v < 3; v++) {
      const a = idx[t * 3 + v] * 3, x = pos[a], y = pos[a + 1], z = pos[a + 2];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 1e-4) { ok = false; break; }
      sw[v] = cw;
      sx[v] = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw * 0.5 + 0.5) * W;
      sy[v] = ((vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw * 0.5 + 0.5) * H;
    }
    if (!ok) continue;
    const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2]))), x1 = Math.min(W - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
    const y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2]))), y1 = Math.min(H - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
    if (x1 < x0 || y1 < y0) continue;
    submitted.add(cellOf[t]); stris++;
    const ax = sx[0], ay = sy[0], bx = sx[1], by = sy[1], cx = sx[2], cy = sy[2];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    const id = cellOf[t];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const pxc = x + 0.5, pyc = y + 0.5;
      const l0 = ((by - cy) * (pxc - cx) + (cx - bx) * (pyc - cy)) / den;
      const l1 = ((cy - ay) * (pxc - cx) + (ax - cx) * (pyc - cy)) / den;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const w = l0 / sw[0] + l1 / sw[1] + l2 / sw[2];   // perspective-correct 1/z
      const i = y * W + x;
      if (w > depth[i]) { depth[i] = w; owner[i] = id; }
    }
  }
  const vis = new Set();
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) vis.add(owner[i]);
  subCells += submitted.size; visCells += vis.size; subTris += stris;
  for (const c of submitted) subVerts += cellVerts[c];
  for (const c of vis) visVerts += cellVerts[c];
}
const pc = (a, b) => (100 * a / b).toFixed(1) + "%";
console.log(`${TRACK}: ${cellIds.size} prop cells, ${triN} triangles, ${SAMPLES} cameras on the racing line, ${W}x${H}`);
console.log(`  cells SUBMITTED per camera   ${(subCells / SAMPLES).toFixed(1)}`);
console.log(`  cells that show a pixel      ${(visCells / SAMPLES).toFixed(1)}   -> ${pc(subCells - visCells, subCells)} drawn for NOTHING`);
console.log(`  vertices in wasted cells     ${pc(subVerts - visVerts, subVerts)} of submitted prop vertices`);
g.close();
