/* #3413 — DRS slot-gap rail + actuator pod must not run through the closed
 * top rear flap (rearDrs / rearTop). Shipping placed the rail at crownY+3 mm
 * and the pod floor on crownY; from the wing-preset behind camera that read as
 * horizontal banding / z-fight on outwash_max (and every other drs:1 recipe).
 * The rail now sits in the rear↔rearDrs slot under the TE half; the pod sits
 * above the closed flap skin. VM-only via loadParts().
 *
 * Run: node --test tests/unit/rear-wing-drs-rail.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const { Car3D, Parts } = M;
const CLEAR = 0.003;   // m — same daylight floor as CarBodyGeom.SLOT_MIN

function recipe(aeroId) {
  const tiers = Parts.getVisualTiers({ aero: aeroId });
  const style = Car3D.aeroStyleOf(tiers);
  const lvl = Car3D.aeroLevelOf(tiers);
  const rear = Car3D.aeroFlaps(lvl, style).filter((e) => e.wing === "rear");
  assert.ok(rear.length >= 1, `${aeroId}: no rear flap`);
  return { tiers, style, lvl, top: rear[rear.length - 1], under: rear.length > 1 ? rear[rear.length - 2] : null };
}

function posed(e, ang, z, y) {
  const dy = y - e.y, dz = z - e.z, c = Math.cos(ang), s = Math.sin(ang);
  return { z: dy * s + dz * c + e.z, y: dy * c - dz * s + e.y };
}

/** Closed-pose chord samples of a rear element. */
function chord(e) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(posed(e, e.zAngle,
      e.le[0] + (e.te[0] - e.le[0]) * t,
      e.le[1] + (e.te[1] - e.le[1]) * t));
  }
  return pts;
}

function yAt(pts, zq) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.z - zq) * (b.z - zq) > 0) continue;
    const u = (zq - a.z) / ((b.z - a.z) || 1e-9);
    return a.y + (b.y - a.y) * u;
  }
  return null;
}

/** Mirror of the car3d.js rearAssembly DRS rail / pod anchors (#3413). */
function anchors(crownY) {
  return {
    railY: crownY - 0.048, railZ: -2.56, railDepth: 0.08, railH: 0.010,
    podFloor: crownY + 0.022, podH: 0.070, podHalfW: 0.08,
  };
}

function minGapAlong(pts, thick, z0, z1, aboveY, belowY, sense) {
  // sense "below": subject is below the flap → gap = flapBot - subjectTop
  // sense "above": subject is above the flap → gap = subjectBot - flapTop
  let min = Infinity;
  for (let i = 0; i <= 40; i++) {
    const z = z0 + (z1 - z0) * (i / 40);
    const y = yAt(pts, z);
    if (y == null) continue;
    const flapBot = y - thick / 2, flapTop = y + thick / 2;
    const gap = sense === "below" ? flapBot - aboveY : belowY - flapTop;
    if (gap < min) min = gap;
  }
  return min;
}

const DRS_AEROS = ["outwash_max", "medium", "extreme", "reg26_concept", "high_df"];

test("DRS rail sits in the closed rear↔rearDrs slot (#3413)", () => {
  for (const id of DRS_AEROS) {
    const { top, under, style } = recipe(id);
    if ((style.rwPlanes | 0) === 1) continue;
    if (!(style.drs || 0) && top.id !== "rearTop" && top.id !== "rear") continue;
    const crownY = top.te[1];
    const a = anchors(crownY);
    const pts = chord(top);
    const z0 = a.railZ - a.railDepth / 2, z1 = a.railZ + a.railDepth / 2;
    const gapDown = minGapAlong(pts, top.thick, z0, z1, a.railY + a.railH / 2, 0, "below");
    assert.ok(gapDown >= CLEAR,
      `${id}: rail top is only ${(gapDown * 1000).toFixed(1)} mm under closed ${top.id} (want ≥ ${CLEAR * 1000} mm)`);
    if (under) {
      const midPts = chord(under);
      const gapUp = minGapAlong(midPts, under.thick, z0, z1, 0, a.railY - a.railH / 2, "above");
      // "above" sense with belowY = railBot: gap = railBot - flapTop of the lower element
      // Recompute explicitly for the lower element (rail above it).
      let minUp = Infinity;
      for (let i = 0; i <= 40; i++) {
        const z = z0 + (z1 - z0) * (i / 40);
        const y = yAt(midPts, z);
        if (y == null) continue;
        const gap = (a.railY - a.railH / 2) - (y + under.thick / 2);
        if (gap < minUp) minUp = gap;
      }
      assert.ok(minUp >= CLEAR,
        `${id}: rail bot is only ${(minUp * 1000).toFixed(1)} mm over closed ${under.id}`);
      void gapUp;
    }
  }
});

test("DRS actuator pod sits above the closed top rear flap (#3413)", () => {
  for (const id of DRS_AEROS) {
    const { top, style } = recipe(id);
    if ((style.rwPlanes | 0) === 1) continue;
    const crownY = top.te[1];
    const a = anchors(crownY);
    const pts = chord(top);
    // Pod footprint covers roughly z -2.62 .. -2.40
    const gap = minGapAlong(pts, top.thick, -2.62, -2.40, 0, a.podFloor, "above");
    assert.ok(gap >= CLEAR,
      `${id}: pod floor is only ${(gap * 1000).toFixed(1)} mm above closed ${top.id} (want ≥ ${CLEAR * 1000} mm)`);
  }
});

test("outwash_max rearAssembly rail verts stay under the closed flap skin", () => {
  // Mesh witness: the baked rearAssembly must actually carry the rail where the
  // anchors say, so a revert to crownY+0.003 cannot hide behind a test that only
  // re-states the new constants.
  const { tiers, top } = recipe("outwash_max");
  const crownY = top.te[1];
  const a = anchors(crownY);
  const mesh = Car3D.build([1, 0.55, 0.1], [0.1, 0.1, 0.1], {
    livery: {}, num: 4, parts: tiers, teamId: "mclaren", measure: true,
  });
  const ra = (mesh.parts || []).find((p) => p.name === "rearAssembly");
  assert.ok(ra, "no rearAssembly section");
  // Section centre/size alone is coarse; walk the mesh verts tagged to that
  // section via measure ranges when present, else the whole pos buffer's
  // rearAssembly AABB is enough for a Y-max check in the rail Z band.
  const z0 = a.railZ - a.railDepth / 2 - 0.005, z1 = a.railZ + a.railDepth / 2 + 0.005;
  let maxY = -Infinity, n = 0;
  // build() measure parts carry centreM/sizeM; fall back to scanning all verts
  // inside the rearAssembly AABB for the rail band.
  const cx = ra.centreM[0], cy = ra.centreM[1], cz = ra.centreM[2];
  const hx = ra.sizeM[0] / 2, hy = ra.sizeM[1] / 2, hz = ra.sizeM[2] / 2;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2];
    if (Math.abs(x - cx) > hx + 0.01 || Math.abs(y - cy) > hy + 0.01 || Math.abs(z - cz) > hz + 0.01) continue;
    if (Math.abs(x) > 0.22) continue;
    if (z < z0 || z > z1) continue;
    // Ignore the endplate / pod / lamp: rail is the low carbon strip under crown.
    if (y > crownY - 0.01) continue;
    if (y < crownY - 0.10) continue;
    if (y > maxY) maxY = y;
    n++;
  }
  assert.ok(n >= 8, `expected rail verts in the TE slot band, found ${n}`);
  const pts = chord(top);
  let minFlapBot = Infinity;
  for (let i = 0; i <= 20; i++) {
    const z = z0 + (z1 - z0) * (i / 20);
    const y = yAt(pts, z);
    if (y == null) continue;
    minFlapBot = Math.min(minFlapBot, y - top.thick / 2);
  }
  assert.ok(maxY < minFlapBot - CLEAR,
    `rail mesh maxY ${maxY.toFixed(3)} is not under closed flap bot ${minFlapBot.toFixed(3)} (Δ ${((minFlapBot - maxY) * 1000).toFixed(1)} mm)`);
});
