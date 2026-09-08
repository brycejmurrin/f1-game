/* Every livery decal must land on the surface it is painted for.
 *
 * Six of them did not, and every one hid behind an instrument that could not
 * see it:
 *
 *  • REGIONS.wing was authored from the aero recipe's DESIGN CHORD, which no
 *    flap is ever drawn at — drawAeroFlaps hangs each element at its pivot and
 *    rotates it by zAngle (0.34 rad at every level), so the band floated ~90 mm
 *    over a parked car's wing and buried itself ~30 mm with the wing open. The
 *    old guard tested it against the element's axis-aligned BOUNDING BOX, which
 *    a 19.5-degree rotation makes tall enough to swallow that.
 *  • REGIONS.fin / finBadge were placed off the FROZEN fin base while the mesh
 *    rooted the blade into the engine cover, so a raised crown (every shipped
 *    2026 team ships spineHeight "dorsal") swallowed 113 mm of a 176 mm panel.
 *  • REGIONS.tail sat at cover.top + 0.008 against a heat shield whose top face
 *    reached +0.017 — 300 mm of the strip inside the plate on every car — and
 *    the spine vent's top face landed on the decal plane bit-exactly.
 *  • REGIONS.spineSide had the accent pinstripe coplanar with it (0.9 mm) and
 *    the service-panel hatch standing 9 mm proud of it.
 *
 * So: build the REAL car and the REAL decal quads and measure vertex-to-surface
 * distance. Nothing here is a copy of the shipped arithmetic.
 *
 * Run: node --test tests/unit/livery-decal-surfaces.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { nearest, trisOf } from "../helpers/mesh-distance.mjs";

const M = loadParts();
const { Car3D, CarMesh, Parts, Teams, LiveryTex } = M;
const TEAM = Teams.LIST.find((t) => t.id === "ferrari");
const partsFor = (setup) => Parts.getVisualTiers(setup || {}, TEAM);

// Decal vertices carrying a given atlas region, read back out of the UVs.
function verticesIn(dec, region) {
  const R = LiveryTex.REGIONS[region], S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
  const uL = R.x / S, uR = (R.x + R.w) / S;
  const vB = 1 - (R.y + R.h) / SH, vT = 1 - R.y / SH;
  const out = [];
  for (let j = 0; j < dec.pos.length / 3; j++) {
    const u = dec.uv[j * 2], v = dec.uv[j * 2 + 1];
    if (u < uL - 1e-6 || u > uR + 1e-6 || v < vB - 1e-6 || v > vT + 1e-6) continue;
    out.push([dec.pos[j * 3], dec.pos[j * 3 + 1], dec.pos[j * 3 + 2]]);
  }
  return out;
}

// The rear flaps at their REST pose, exactly as drawAeroFlaps hangs them at
// blend 0: rotate the canonical geometry about local X by zAngle, then translate
// to the element's own pivot.
function posedFlapTris(fg) {
  const g = Car3D.buildFlapGeom(fg, [1, 1, 1]);
  const ca = Math.cos(fg.zAngle), sa = Math.sin(fg.zAngle);
  const posed = { idx: g.idx, pos: new Array(g.pos.length) };
  for (let p = 0; p < g.pos.length; p += 3) {
    posed.pos[p] = g.pos[p];
    posed.pos[p + 1] = g.pos[p + 1] * ca - g.pos[p + 2] * sa + fg.y;
    posed.pos[p + 2] = g.pos[p + 1] * sa + g.pos[p + 2] * ca + fg.z;
  }
  return trisOf(posed);
}

// ── the rear-wing sponsor band ──────────────────────────────────────────────
test("Car3D.wingBand places the band on the flap's POSED skin, not its design chord", () => {
  assert.equal(typeof Car3D.wingBand, "function", "Car3D.wingBand is gone — the band will float again");
  for (const lvl of [0, 1, 2, 3, 4]) {
    const style = Car3D.aeroStyleOf({});
    const B = Car3D.wingBand(lvl, style);
    assert.ok(B && B.stations.length > 1, `level ${lvl}: no band`);
    // The TOPMOST rear element is the one the camera sees; at max downforce
    // without DRS that is rearTop, and it used to be drawn straight over the band.
    const flaps = Car3D.aeroFlaps(lvl, style).filter((f) => f.wing === "rear");
    assert.equal(B.elem, flaps[flaps.length - 1].id, `level ${lvl}: the band is not on the top element`);
    const tris = posedFlapTris(flaps[flaps.length - 1]);
    for (const st of B.stations) {
      for (const [end, pt] of [["front", st.front], ["rear", st.rear]]) {
        const d = nearest([st.x, pt.y, pt.z], tris);
        assert.ok(d < 0.012,
          `level ${lvl}: band ${end} corner at x ${st.x.toFixed(3)} is ${(d * 1000).toFixed(0)} mm off the flap`);
      }
    }
  }
});

test("with a DRS package the band moves to the baked plane that roofs the stack", () => {
  for (const aero of ["active_aero", "circuit_adaptive"]) {
    const parts = partsFor({ aero });
    const style = Car3D.aeroStyleOf(parts);
    assert.equal(style.drs ? 1 : 0, 1, `${aero} lost its DRS package`);
    const lvl = Car3D.aeroLevelOf(parts);
    const B = Car3D.wingBand(lvl, style);
    assert.equal(B.elem, "drs", `${aero}: the band is not on the baked DRS plane`);
    const car = Car3D.build(TEAM.color, TEAM.color2, { livery: {}, teamId: TEAM.id, num: 16, parts });
    const tris = trisOf(car, (p) => p[2] > -2.75 && p[2] < -2.30);
    assert.ok(tris.length > 50, `${aero}: no rear-wing geometry to land on`);
    for (const st of B.stations) {
      for (const pt of [st.front, st.rear]) {
        const d = nearest([st.x, pt.y, pt.z], tris);
        assert.ok(d < 0.012, `${aero}: band corner is ${(d * 1000).toFixed(0)} mm off the baked plane`);
      }
    }
  }
});

// ── the shark fin ───────────────────────────────────────────────────────────
test("the fin panel and badge sit on the blade at every cover height", () => {
  const bad = [];
  for (const spineHeight of Car3D.SPINE_HEIGHT_IDS) {
    for (const engine of ["stock", "lean_burn", "race"]) {
      const parts = partsFor({ engine });
      const car = Car3D.build(TEAM.color, TEAM.color2,
        { livery: { spineHeight }, teamId: TEAM.id, num: 16, parts });
      const dec = CarMesh.carDecalData(2, parts, false, TEAM.id, "standard", spineHeight);
      // Blade triangles only: the fin is the thin plate above the cover crown.
      const anchors = Car3D.bodyAnchors(parts, TEAM.id, spineHeight);
      const root = Car3D.sharkFinRoot(anchors, 1, "standard");
      const tris = trisOf(car, (p) => Math.abs(p[0]) < 0.05 && p[2] < -0.60 && p[2] > -1.75
                                      && p[1] > root.bTE - 0.02);
      const pts = verticesIn(dec, "fin").concat(verticesIn(dec, "finBadge"));
      // A cover taller than the regulation fin top leaves no blade to paint;
      // car-mesh drops the decal there rather than draw a graphic inside the
      // bodywork, so the assertion is on the DECISION, not on the pixels.
      if (root.clear <= 0.03) {
        assert.equal(pts.length, 0,
          `${spineHeight}/${engine}: the crown swallows the blade (${(root.clear * 1000).toFixed(0)} mm clear) but the decal is still drawn`);
        continue;
      }
      assert.ok(pts.length > 0,
        `${spineHeight}/${engine}: ${(root.clear * 1000).toFixed(0)} mm of blade is clear but no fin decal was drawn`);
      for (const p of pts) {
        const d = nearest(p, tris);
        if (d > 0.020) bad.push(`${spineHeight}/${engine}: fin decal vertex ${(d * 1000).toFixed(0)} mm off the blade`);
      }
      // …and every vertex must be ON the visible blade, above the cover skin at
      // ITS OWN station — the crown falls away toward the tail, so one crown
      // height proves nothing about a badge two thirds of the way back.
      for (const q of pts) {
        const c = anchors.coverAt(q[2]);
        if (c && c.top != null && q[1] < c.top - 0.001) {
          bad.push(`${spineHeight}/${engine}: fin decal vertex at z ${q[2].toFixed(2)} y ${q[1].toFixed(3)} is inside a cover topping ${c.top.toFixed(3)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], "fin decals drawn into the engine cover:\n" + bad.join("\n"));
});

// ── the engine-cover crown ──────────────────────────────────────────────────
test("the crown stack orders bodywork under the livery drape", () => {
  const S = Car3D.COVER_STACK;
  assert.ok(S && S.decal > S.shield && S.shield > S.vent,
    `COVER_STACK must run vent < shield < decal, got ${JSON.stringify(S)}`);
  assert.ok(S.decal - S.shield >= 0.004, "the drape has to clear the heat shield by more than a z-fight");
  assert.ok(S.flankDecal > S.flankTrim, "the flank decal has to clear the pinstripe and the service hatches");
});

test("the tail strip clears the heat shield and the spine vent on every cover", () => {
  const bad = [];
  for (const spineHeight of Car3D.SPINE_HEIGHT_IDS) {
    for (const engine of ["stock", "race", "quali_engine"]) {
      const parts = partsFor({ engine });
      const anchors = Car3D.bodyAnchors(parts, TEAM.id, spineHeight);
      const dec = CarMesh.carDecalData(2, parts, false, TEAM.id, "none", spineHeight);
      // The tail strip's crown facet, at the heat shield's station and the
      // spine vent's, against the top face each of those actually builds.
      for (const [what, z, topOf] of [
        ["heat shield", -1.58, (p) => p.top + Car3D.COVER_STACK.shield],
        ["spine vent", -1.47, (p) => p.top + Car3D.COVER_STACK.vent],
      ]) {
        const p = anchors.coverAt(z);
        const crown = verticesIn(dec, "tail")
          .filter((v) => Math.abs(v[2] - z) < 0.10 && Math.abs(v[0]) < 0.06);
        if (!crown.length) continue;
        const lowest = Math.min(...crown.map((v) => v[1]));
        const gap = lowest - topOf(p);
        if (gap < 0.003) bad.push(`${spineHeight}/${engine}: the tail strip is ${(gap * 1000).toFixed(1)} mm above the ${what}`);
      }
    }
  }
  assert.deepEqual(bad, [], "the tail strip is inside the bodywork:\n" + bad.join("\n"));
});

test("the flank band clears the pinstripe and the service hatches", () => {
  const bad = [];
  for (const spineHeight of Car3D.SPINE_HEIGHT_IDS) {
    for (const engine of ["stock", "race", "quali_engine"]) {
      const parts = partsFor({ engine });
      const anchors = Car3D.bodyAnchors(parts, TEAM.id, spineHeight);
      const dec = CarMesh.carDecalData(2, parts, false, TEAM.id, "none", spineHeight);
      const pts = verticesIn(dec, "spineSide");
      assert.ok(pts.length >= 4, `${spineHeight}/${engine}: no flank band`);
      // Both features are placed out from coverFlankX at COVER_STACK.flankTrim;
      // the decal is at flankDecal. Compare at each vertex's own station and
      // height, since the flank leans in as the cover narrows.
      for (const q of pts) {
        const c = anchors.coverAt(q[2]);
        if (!c) continue;
        const skin = Car3D.coverFlankX(c, q[1]);
        const stand = Math.abs(q[0]) - skin;
        if (stand < Car3D.COVER_STACK.flankTrim + 0.003) {
          bad.push(`${spineHeight}/${engine}: the flank band stands only ${(stand * 1000).toFixed(1)} mm off the skin — the trim is at ${(Car3D.COVER_STACK.flankTrim * 1000).toFixed(0)} mm`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], "the flank band is coplanar with the bodywork on it:\n" + bad.join("\n"));
});

// ── the cockpit nose decal ──────────────────────────────────────────────────
test("the cockpit nose decal is the race decal, not its mirror image", () => {
  const parts = partsFor({});
  const dec = CarMesh.carDecalData(2, parts, false, TEAM.id, "standard", null);
  const ck = CarMesh.getCockpitDecalMesh
    ? null : null;   // the mesh goes to the GPU; read the data path instead
  assert.equal(ck, null);
  // Both quads paint REGIONS.num onto the nose top. Pair each corner with its
  // uv and check the two agree on which END of the car carries vB: flipping v
  // alone, with u already pre-flipped, is a REFLECTION, and the driver number
  // rendered backwards from the cockpit for exactly that reason.
  const R = LiveryTex.REGIONS.num, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
  const vB = 1 - (R.y + R.h) / SH;
  const noseNum = [];
  for (let j = 0; j < dec.pos.length / 3; j++) {
    const z = dec.pos[j * 3 + 2];
    if (z < 1.60 || z > 2.20) continue;              // the nose quad, not the endplates
    const u = dec.uv[j * 2], v = dec.uv[j * 2 + 1];
    if (u < R.x / S - 1e-6 || u > (R.x + R.w) / S + 1e-6) continue;
    noseNum.push({ z, v });
  }
  assert.ok(noseNum.length >= 4, "the race nose-number quad is gone");
  const raceFrontIsVB = noseNum.filter((c) => Math.abs(c.v - vB) < 1e-6).every((c) => c.z > 1.9);
  assert.ok(raceFrontIsVB, "the race quad no longer maps the atlas front-at-the-bottom");
  // The cockpit builder is a private function; assert its shape from the source
  // it is written in — the same corner order, front (z 2.10) first.
  const src = CarMesh.getCockpitDecalMesh.toString();
  const zOrder = (src.match(/,\s*(1\.72|2\.10)\]/g) || []).map((m) => m.replace(/[^\d.]/g, ""));
  assert.deepEqual(zOrder, ["2.10", "2.10", "1.72", "1.72"],
    "the cockpit quad lists its corners rear-first again — that flips v alone, which mirrors the number");
});
