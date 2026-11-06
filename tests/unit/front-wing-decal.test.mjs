// The front-wing endplate decal must land ON the plate, at every aero recipe.
//
// The plate is not a fixed box: its height (PLATE.hF/hR), its outboard kick,
// its thickness and its taper all move with the aero level and the recipe's
// `plate` pick — four profiles from a shallow 0 to the tall outwash 3. A decal
// placed from literals therefore sits in clear air on most of them, which is
// the same trap Car3D.numberBoard() exists to close on the rear wing. The
// first cut of this decal did exactly that, floating 641 mm inboard because it
// used the plate's half-thickness without its centreline.
//
// So: build the REAL decal quads (CarMesh.carDecalData) and the REAL car
// (Car3D.build), and measure every front-endplate decal vertex to the nearest
// car triangle. Anything beyond a few millimetres is a decal drawn onto
// nothing. This measures the shipped code, not a copy of its arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const PROUD = 0.004;          // the decal sits this far off the surface by design
const TOL = 0.012;            // 12 mm: proud + float, before it reads as detached

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));

// Point → triangle distance (Ericson, Real-Time Collision Detection §5.1.5).
function ptTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return len(sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]));
  }
  const n = cross(ab, ac), nl = len(n);
  return nl < 1e-12 ? len(ap) : Math.abs(dot(n, ap)) / nl;
}

// Recipes chosen to cover every plate profile 0..3 and several aero levels.
const RECIPES = ["", "minimal", "low", "high", "extreme", "swan_low",
                 "outwash_max", "reg26_concept", "twin_tier", "sig_redbull_concept"];

// The decal vertices that belong to the front endplate: the quads live outboard
// and forward, where nothing else on the car is drawn.
const isFrontPlate = (p) => Math.abs(p[0]) > 0.55 && p[2] > 1.90 && p[2] < 2.75;

test("Car3D exposes the front-plate placement the decal has to share", () => {
  assert.equal(typeof M.Car3D.frontPlate, "function", "Car3D.frontPlate is gone — the decal will float");
  const fp = M.Car3D.frontPlate(2, null);
  for (const k of ["front", "rear"])
    for (const f of ["z", "x", "y", "h", "t"])
      assert.ok(Number.isFinite(fp[k][f]), `frontPlate().${k}.${f} is not a number`);
  assert.ok(fp.front.z > fp.rear.z, "the front station must sit ahead of the rear one");
});

test("every front-endplate decal vertex sits on the plate, at every plate profile", () => {
  const seen = new Set();
  const bad = [];
  for (const tid of ["ferrari", "mclaren", "mercedes", "redbull"]) {
    const team = M.Teams.LIST.find((t) => t.id === tid);
    for (const aero of RECIPES) {
      let parts;
      try { parts = M.Parts.getVisualTiers(aero ? { aero } : {}, team); } catch (_) { continue; }
      const aeroV = parts._visual && parts._visual.aero;
      const aLvl = aeroV && aeroV.lvl != null ? aeroV.lvl : 2;
      seen.add(String(aeroV && aeroV.plate));
      const car = M.Car3D.build(team.color, team.color2, { livery: {}, teamId: tid, num: 1, parts });
      const dec = M.CarMesh.carDecalData(aLvl, parts, false, tid, null, null);
      // Car triangles near the plate, so the search stays cheap and honest.
      const tris = [];
      for (let i = 0; i + 2 < car.idx.length; i += 3) {
        const T = [0, 1, 2].map((k) => { const j = car.idx[i + k]; return [car.pos[j * 3], car.pos[j * 3 + 1], car.pos[j * 3 + 2]]; });
        if (T.every((p) => Math.abs(p[0]) > 0.45 && p[2] > 1.80 && p[2] < 2.85)) tris.push(T);
      }
      assert.ok(tris.length > 20, `${tid}/${aero || "default"}: no plate geometry to land on`);
      let n = 0;
      for (let j = 0; j < dec.pos.length / 3; j++) {
        const p = [dec.pos[j * 3], dec.pos[j * 3 + 1], dec.pos[j * 3 + 2]];
        if (!isFrontPlate(p)) continue;
        n++;
        let best = Infinity;
        for (const T of tris) { const d = ptTri(p, T[0], T[1], T[2]); if (d < best) best = d; }
        if (best > TOL)
          bad.push(`${tid}/${aero || "default"} plate=${aeroV && aeroV.plate} vertex (${p.map((v) => v.toFixed(3))}) is ${(best * 1000).toFixed(0)} mm off the car`);
      }
      assert.equal(n, 8, `${tid}/${aero || "default"}: expected 8 endplate decal vertices, got ${n}`);
    }
  }
  assert.deepEqual(bad, [], "front-wing decal vertices drawn onto nothing:\n" + bad.join("\n"));
  // The point of the accessor: the guard must actually exercise the profiles.
  for (const p of ["0", "1", "3"]) assert.ok(seen.has(p), `plate profile ${p} was never exercised`);
});

test("the decal sits proud of the plate, not buried in it", () => {
  const team = M.Teams.LIST.find((t) => t.id === "ferrari");
  const parts = M.Parts.getVisualTiers({}, team);
  const fp = M.Car3D.frontPlate(2, parts._visual && parts._visual.aero);
  const dec = M.CarMesh.carDecalData(2, parts, false, "ferrari", null, null);
  for (let j = 0; j < dec.pos.length / 3; j++) {
    const p = [dec.pos[j * 3], dec.pos[j * 3 + 1], dec.pos[j * 3 + 2]];
    if (!isFrontPlate(p)) continue;
    // Outboard of the plate's centreline by at least half a thickness.
    assert.ok(Math.abs(p[0]) > fp.front.x + fp.w * 0.5 * 0.6,
              `decal vertex x ${p[0].toFixed(3)} is inside the plate's skin`);
    assert.ok(Math.abs(p[0]) < fp.rear.x + fp.w * 0.5 + PROUD + 0.004,
              `decal vertex x ${p[0].toFixed(3)} stands off the plate`);
  }
});
