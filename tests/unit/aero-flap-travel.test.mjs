/* Front AND rear flaps must travel a visible amount between Z (corner) and
 * X (straight). The garage CORNER/STRAIGHT button used to look broken because
 * the front hinge sat on the trailing edge (TE travel ≈ 0) and the rear
 * endplates were a blank slab. This is the NODE gate: loadParts() runs the
 * real car3d / car-mesh in a VM, same numbers the garage draws.
 *
 * Run: node --test tests/unit/aero-flap-travel.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const INTAKE = [0.03, 0.03, 0.04];

function posed(e, ang, localY, localZ) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return [localY * ca - localZ * sa + e.y, localY * sa + localZ * ca + e.z];
}
function teTravelMm(e) {
  const ly = e.te[1] - e.y, lz = e.te[0] - e.z;
  const a = posed(e, e.zAngle, ly, lz), b = posed(e, e.xAngle, ly, lz);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000;
}
function leTravelMm(e) {
  const u = (0 - e.hinge) * e.chord;
  const at = (ang) => [e.z - u * Math.cos(ang), e.y + u * Math.sin(ang)];
  const a = at(e.zAngle), b = at(e.xAngle);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000;
}

test("default garage flaps travel on BOTH wings (TE front, LE rear)", () => {
  const els = M.Car3D.aeroFlaps(2, null);
  const front = els.filter((e) => e.wing === "front");
  const rear = els.filter((e) => e.wing === "rear");
  assert.ok(front.length >= 2, "expected at least two front elements");
  assert.ok(rear.length >= 2, "expected at least two rear elements");
  for (const e of front) {
    assert.ok(teTravelMm(e) > 20, `${e.id} front TE travel ${teTravelMm(e).toFixed(0)} mm — silhouette will not change`);
  }
  assert.ok(Math.max(...front.map(teTravelMm)) > 80,
    "at least one front flap must drop its TE by a garage-visible amount");
  for (const e of rear) {
    assert.ok(leTravelMm(e) > 80, `${e.id} rear LE travel ${leTravelMm(e).toFixed(0)} mm — DRS slot will not open`);
    assert.ok(teTravelMm(e) > 80, `${e.id} rear TE travel ${teTravelMm(e).toFixed(0)} mm — wingRear silhouette will not flatten`);
  }
});

test("hinges are not TE-parked on the front (plan #5)", () => {
  // HINGE.front used to be 0.80: the trailing edge sat still and the cascade
  // hid the slot. Mid-chord (~0.5) is what makes the TE drop.
  const front = M.Car3D.aeroFlaps(2, null).filter((e) => e.wing === "front");
  for (const e of front) {
    assert.ok(e.hinge <= 0.65, `${e.id} hinge ${e.hinge.toFixed(2)} is too close to the TE`);
  }
});

test("rear endplates carry window cut-outs and a louvre stack", () => {
  const mesh = M.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
  let intake = 0;
  const ys = new Set();
  for (let i = 0; i < mesh.pos.length / 3; i++) {
    const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
    if (Math.abs(x) < 0.48 || z > -2.10 || z < -2.55 || y < 0.45) continue;
    if (mesh.col[i * 3] !== INTAKE[0] || mesh.col[i * 3 + 1] !== INTAKE[1]) continue;
    intake++;
    ys.add(+y.toFixed(3));
  }
  assert.ok(intake >= 400, `endplate INTAKE verts ${intake} — windows/louvres went missing`);
  assert.ok(ys.size >= 12, `endplate INTAKE y-bands ${ys.size} — need two windows + a louvre stack`);
});

test("baked rain-light emissive is bloom-capped (channel ≤ 1.90)", () => {
  const mesh = M.Car3D.build([0.7, 0.05, 0.05], [0.95, 0.8, 0.1], { noWheels: true });
  const cols = new Set();
  let n = 0, peak = 0;
  for (let i = 0; i < mesh.mat.length; i++) {
    if (mesh.mat[i] !== M.Car3D.SURFACES.emissive) continue;
    const z = mesh.pos[i * 3 + 2];
    if (z > -2.50) continue;
    n++;
    const r = mesh.col[i * 3], g = mesh.col[i * 3 + 1], b = mesh.col[i * 3 + 2];
    peak = Math.max(peak, r, g, b);
    cols.add([r, g, b].join(","));
  }
  assert.ok(n > 0, "no rain-light emissive verts aft of z -2.50");
  assert.ok(peak <= 1.90, `rain-light peak ${peak} — bloom will wash the rear wing`);
  assert.ok(cols.size >= 2, "want a brighter core on a dimmer housing");
});

test("CarMesh.drawAeroEdge is opt-in debug, not the shipped wing look", () => {
  assert.equal(typeof M.CarMesh.drawAeroEdge, "function");
  const src = M.CarMesh.drawAeroEdge.toString();
  assert.match(src, /aeroEdgeOn/, "strip is gated, not drawn on every X-mode frame");
  const file = fs.readFileSync(new URL("../../js/car/car-mesh.js", import.meta.url), "utf8");
  assert.match(file, /apex26\.aeroEdge/, "off-by-default localStorage latch");
});
