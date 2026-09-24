// baked-model-road-guard.test.mjs — A BAKED MODEL MAY NOT STAND ON THE ROAD.
//
// `js/track/tracks.js` guards every prop emitter against the racing surface —
// addBox, addCyl, addCone, addFrustum, addPrism and addPyramid all go through
// `GUARDED`, which rejects anything whose footprint is on the tarmac. `addMesh`
// did not. So a model from `assets/pack/` could be stamped straight across the
// track, and one was: monza's `kenney_ind_building-d` is anchored 60 m off node
// 17 at the Variante del Rettifilo, where the track turns about 90 degrees, so
// 60 m "outward" lands back ON the road two corners along. A 10 x 18 x 15 m
// industrial building sat across the racing line with its window band 0.75 m
// above the tarmac, and `tests/specs/props-over-road.spec.js` reported it as
// 0.75 m of prop over the road.
//
// NOTHING CAUGHT IT FOR TWO REASONS, and this file is the second one's fix.
// That spec declares 1500 s, over the change-aware gate's 180 s cap, so it runs
// on no push. And the node audits cannot see baked models at all:
// `js/render/shared/assets.js` is in the manifest's FULL list, not TRACK_VM, so
// `Assets` is undefined inside `tools/lib/track-build-vm.cjs` and
// `bakedModel()` returns false before it builds anything. Every fleet sweep is
// blind to all 36 models in the pack. This file supplies `Assets` itself, which
// is the only way to test the guard in node today; teaching the harness to do
// it for every sweep is the larger follow-up (docs/notes/DEFECT-LEDGER.md).
//
// Measured on this tree: with the pack visible and no guard, 15 of 52 circuits
// read over the tolerance; with the guard, 14 — monza is the one it fixes, and
// the other 14 are the pre-existing overhang class the spec's baselines cover
// (a model anchored legally off-track whose upper parts reach over it, which a
// footprint test cannot reject and this guard does not claim to).
//
// Run: node --test tests/unit/baked-model-road-guard.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

const PACK = path.join(ROOT, "assets", "pack");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PACK, "manifest.json"), "utf8"));

const { parseModel, readModel } = require(path.join(ROOT, "tools", "lib", "pack-assets.cjs"));

/** monza built with the pack visible (or not), and the worst prop intrusion on
 *  its racing line. Same band and ladder as tests/unit/props-over-road.test.mjs. */
function monza({ assets }) {
  const ctx = buildContext({ assets });
  const T = ctx.Tracks;
  T.setKeepGeometry(true);
  const t = T.build(T.LIST.find((d) => d.id === "monza"));
  const M = 1200, r3 = (v) => +v.toFixed(3), TOL = 0.20, CEIL = 5.0;
  const px = [], pz = [], py = [], rx = [], rz = [], hw = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const k = Math.round(i / M * t.n) % t.n;
    px.push(r3(t.px[k])); pz.push(r3(t.pz[k])); py.push(r3(t.py[k]));
    rx.push(r3(t.rx[k])); rz.push(r3(t.rz[k]));
  }
  const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
  const rp = t.roadGeo.pos;
  for (let v = 0; v < rp.length; v += 3) {
    const k = near(rp[v], rp[v + 2]);
    const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]);
    if (lat < 13 && lat > hw[k]) hw[k] = lat;
  }
  for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
  const g = t.propsGeo, pos = g.pos, idx = g.idx;
  let max = 0, worst = null;
  for (let q = 0; q < idx.length; q += 3) {
    const a = idx[q] * 3, b = idx[q + 1] * 3, c = idx[q + 2] * 3;
    const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
    if (cy > CEIL + 30) continue;
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const k = near(cx, cz), over = cy - py[k];
    if (over <= TOL || over >= CEIL) continue;
    const lat = (cx - px[k]) * rx[k] + (cz - pz[k]) * rz[k];
    if (Math.abs(lat) < 0.75 * hw[k] && over > max) {
      max = over;
      worst = { over: +over.toFixed(2), lat: +lat.toFixed(2), xyz: [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)] };
    }
  }
  return { verts: (pos.length / 3) | 0, max: +max.toFixed(2), worst };
}

test("the mirrored pack decoder agrees with the manifest on every model", () => {
  const ids = Object.keys(MANIFEST.models || {});
  assert.ok(ids.length >= 30, `the pack should carry its models; manifest lists ${ids.length}`);
  const bad = [];
  for (const id of ids) {
    const rec = MANIFEST.models[id], m = readModel(rec);
    if (!m) { bad.push(`${id}: did not decode`); continue; }
    if (m.pos.length / 3 !== rec.verts || m.idx.length / 3 !== rec.tris)
      bad.push(`${id}: ${m.pos.length / 3}v/${m.idx.length / 3}t against the manifest's ${rec.verts}v/${rec.tris}t`);
  }
  assert.deepEqual(bad, [],
    "this file's decoder has drifted from js/render/shared/assets.js's _parseModel, " +
    "so every assertion below is measuring the wrong geometry:\n  " + bad.join("\n  "));
});

test("the pack is actually stamped when Assets is there — the guard is not passing vacuously", () => {
  // ANTI-VACUITY, and the reason this file exists. Without `Assets` the whole
  // baked path returns false at its first line and monza builds as if the pack
  // were empty — which is exactly the state every fleet sweep runs in today.
  // If that were still true here, the road assertion below would pass while
  // testing nothing at all.
  const off = monza({ assets: false }), on = monza({ assets: true });
  assert.ok(on.verts > off.verts,
    `monza should gain geometry from the pack: ${off.verts} verts without Assets, ${on.verts} with`);
});

test("no baked model puts geometry over monza's racing line", () => {
  const r = monza({ assets: true });
  assert.ok(r.max <= 0.20,
    `monza reads ${r.max} m of prop over the racing line: ${JSON.stringify(r.worst)}. ` +
    "A baked model is being stamped on the road — bakedModel()'s rejBox guard in " +
    "js/track/tracks.js is what keeps it off, and the anchor that reaches across " +
    "a corner is the usual cause (monza's was 60 m off node 17, at a 90-degree turn).");
});
