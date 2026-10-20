/* The rear wing's active-aero travel, pinned to FIA 2026 C3.11.6 (Section C,
 * Issue 17, 2026-04-28 — docs/notes/REAR-WING-ACTIVE-AERO-2026-10-19.md):
 *   - the forwardmost element (main plane) is fixed; every element above it is
 *     the "RW Flap" and moves as ONE rigid body ("maintain the geometric
 *     relationship between all parts of RW Flap"),
 *   - about ONE axis aligned with Y, lying between the flap's mid-point and its
 *     rearmost point in X,
 *   - and Straight Mode is a DECREASE in incidence — it flattens the flap, it
 *     does not flip it nose-up.
 * The solver used to hinge each rear element on its own axis at 45 % chord and
 * open it to -26 deg (leading edge ABOVE the trailing edge); this is its gate.
 * VM-only: loadParts() runs the real car geometry modules.
 *
 * Run: node --test tests/unit/rear-wing-active-aero.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const { Car3D, Parts } = M;
const DEG = 180 / Math.PI;

// Every aero recipe a car can actually carry: the bare default, the 2026
// default (drs:1), and each catalog aero option as the garage resolves it.
function recipes() {
  const out = [["default", null], ["2026", Car3D.aeroStyleOf({})]];
  const cat = Parts.CATALOG.find((c) => c.id === "aero");
  for (const o of (cat && cat.options) || []) {
    out.push([o.id, Car3D.aeroStyleOf({ _visual: { aero: o.visual }, aero: o.visualTier })]);
  }
  return out;
}
function rearOf(style) {
  const lvl = style && style.lvl != null ? style.lvl : 2;
  return Car3D.aeroFlaps(lvl, style).filter((e) => e.wing === "rear");
}
// The draw's own rotation (drawAeroFlaps): about local X through (y, z).
function posed(e, ang, [z, y]) {
  const dy = y - e.y, dz = z - e.z, c = Math.cos(ang), s = Math.sin(ang);
  return [dy * s + dz * c + e.z, dy * c - dz * s + e.y];
}
const incidence = (e, ang) => {
  const le = posed(e, ang, e.le), te = posed(e, ang, e.te);
  return Math.atan2(te[1] - le[1], le[0] - te[0]);
};

test("the RW Flap is ONE rigid body: one pivot, one pair of end angles", () => {
  for (const [id, st] of recipes()) {
    const rear = rearOf(st);
    assert.ok(rear.length >= 1, `${id}: no moveable rear element`);
    for (const e of rear) {
      assert.equal(e.z, rear[0].z, `${id}/${e.id}: pivot z differs from ${rear[0].id}`);
      assert.equal(e.y, rear[0].y, `${id}/${e.id}: pivot y differs from ${rear[0].id}`);
      assert.equal(e.zAngle, rear[0].zAngle, `${id}/${e.id}: corner angle differs`);
      assert.equal(e.xAngle, rear[0].xAngle, `${id}/${e.id}: straight angle differs`);
    }
  }
});

test("the pivot lies in the REAR half of the flap, inside its height band", () => {
  for (const [id, st] of recipes()) {
    const rear = rearOf(st);
    const front = Math.max(...rear.map((e) => e.le[0]));   // +z is forward
    const back = Math.min(...rear.map((e) => e.te[0]));
    const mid = (front + back) / 2, p = rear[0];
    assert.ok(p.z <= mid + 1e-9 && p.z >= back - 1e-9,
      `${id}: pivot z ${p.z.toFixed(3)} not between mid ${mid.toFixed(3)} and rear ${back.toFixed(3)}`);
    const lo = Math.min(...rear.map((e) => Math.min(e.le[1], e.te[1])));
    const hi = Math.max(...rear.map((e) => Math.max(e.le[1], e.te[1])));
    assert.ok(p.y >= lo - 0.02 && p.y <= hi + 0.02, `${id}: pivot y ${p.y.toFixed(3)} outside the stack`);
  }
});

test("Straight Mode flattens every element — never past flat, never steeper", () => {
  for (const [id, st] of recipes()) {
    for (const e of rearOf(st)) {
      const z = incidence(e, e.zAngle), x = incidence(e, e.xAngle);
      assert.ok(x < z - 0.30, `${id}/${e.id}: travel ${((z - x) * DEG).toFixed(1)} deg — will not read`);
      assert.ok(x >= -2 / DEG, `${id}/${e.id}: X-mode incidence ${(x * DEG).toFixed(1)} deg is nose-UP`);
      assert.ok(x <= 10 / DEG, `${id}/${e.id}: X-mode incidence ${(x * DEG).toFixed(1)} deg is not flat`);
      assert.ok(z >= 20 / DEG && z <= 40 / DEG,
        `${id}/${e.id}: corner incidence ${(z * DEG).toFixed(1)} deg outside a 2026 downforce wing's 20-40`);
    }
  }
});

test("the slot opens: the leading edge rises a DRS-sized amount, the trailing edge barely moves", () => {
  for (const [id, st] of recipes()) {
    const rear = rearOf(st);
    let lift = 0;
    for (const e of rear) {
      const a = posed(e, e.zAngle, e.le), b = posed(e, e.xAngle, e.le);
      lift = Math.max(lift, b[1] - a[1]);
      const ta = posed(e, e.zAngle, e.te), tb = posed(e, e.xAngle, e.te);
      const teMove = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
      const leMove = Math.hypot(b[0] - a[0], b[1] - a[1]);
      assert.ok(teMove < leMove, `${id}/${e.id}: TE moves ${(teMove * 1000).toFixed(0)} mm, more than the LE`);
    }
    assert.ok(lift >= 0.060, `${id}: slot opens only ${(lift * 1000).toFixed(0)} mm`);
  }
});

test("the drs plane flies with the stack, in the livery's REAR WING colour", () => {
  // car3d.js used to bake it static in rearC; it is part of the RW Flap, so
  // drawAeroFlaps hands its rest set and its moving mesh `rearCol` instead of
  // the flap colour, and a different rear colour must not share a cached set.
  const { Car3D: C, CarMesh } = loadParts();
  CarMesh.init({ createMesh: (data) => ({ data }), freeMesh() {} });
  const st = C.aeroStyleOf({});
  assert.equal(st.drs ? 1 : 0, 1, "the 2026 default lost drs:1");
  const rear = C.aeroFlaps(st.lvl, st).filter((e) => e.wing === "rear");
  const top = rear[rear.length - 1];
  assert.equal(top.id, "rearDrs");
  assert.equal(top.paint, "rearWing");
  const wing = [0.9, 0.1, 0.1], blue = [0.55, 0.72, 0.88];
  const has = (mesh, c) => {
    for (let i = 0; i < mesh.data.col.length; i += 3) {
      if (Math.abs(mesh.data.col[i] - c[0]) < 1e-6 && Math.abs(mesh.data.col[i + 1] - c[1]) < 1e-6) return true;
    }
    return false;
  };
  for (const open of [false, true]) {
    const set = CarMesh.getAeroFlapSet(st.lvl, wing, st, "", open, "rear", "paint", blue);
    assert.ok(has(set, blue), `open=${open}: the drs plane lost its rear-wing colour`);
    assert.ok(has(set, wing), `open=${open}: the flaps under it lost the wing colour`);
    const plain = CarMesh.getAeroFlapSet(st.lvl, wing, st, "", open, "rear", "paint", wing);
    assert.notEqual(plain, set, "a different rear colour shared one cached set");
    assert.equal(CarMesh.getAeroFlapSet(st.lvl, wing, st, "", open, "rear", "paint", blue), set);
  }
});
