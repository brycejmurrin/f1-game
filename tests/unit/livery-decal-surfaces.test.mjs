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
// The ROUNDED car (CarShade on, the game's default): its cover foot is pinched
// (the coke bottle) and its decal sheet is built from bodyAnchors(.., true).
const S = loadParts({ shade: true });
const sPartsFor = (setup) => S.Parts.getVisualTiers(setup || {}, S.Teams.LIST.find((t) => t.id === "ferrari"));
// The same parts with one engine knob moved (coke: the pinch and the ramp follow it).
const withEngine = (parts, knobs) => Object.assign({}, parts, { _visual: Object.assign({}, parts._visual, { engine: Object.assign({}, parts._visual.engine, knobs) }) });

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

for (const [label, X, round, pf] of [["flat", M, false, partsFor], ["rounded", S, true, sPartsFor]])
test(`the flank band clears the pinstripe and the service hatches — ${label} car`, () => {
  const { Car3D, CarMesh } = X;
  const bad = [];
  for (const spineHeight of Car3D.SPINE_HEIGHT_IDS) {
    for (const [engine, knobs] of [["stock"], ["race"], ["quali_engine"], ["stock", { coke: 1.38 }]]) {   // + the deepest pinch
      const parts = knobs ? withEngine(pf({ engine }), knobs) : pf({ engine });
      const anchors = Car3D.bodyAnchors(parts, TEAM.id, spineHeight, round);
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

// ── the flank band on the ROUNDED (coke-bottle) cover ───────────────────────
// The rounded cover's FOOT is pinched between its stations (CarShade.cokeFoot),
// so its flank is curved along z. One straight quad edge from z -0.66 to -1.90
// is a chord across that curve and floats off the skin at the waist (up to
// 40 mm at coke 1.38, against 14 mm at its ends); the band is a strip of
// sub-quads at the rings the cover is lofted at (CarShade.COVER_Z).
// Measured against the REAL rounded mesh: the cover's skin is the triangles in
// the cover's own (sentinel) colour whose corners all sit on those rings — the
// airbox and roll hoop share the colour but not the rings.
const SENT = [0.31, 0.62, 0.93];
function coverSkin(X, parts, spineHeight) {
  const car = X.Car3D.build(TEAM.color, TEAM.color2, { livery: { spineHeight, cover: SENT }, teamId: TEAM.id, num: 16, parts, noWheels: true });
  const rings = new Set(Array.from(X.CarShade.COVER_Z, (z) => z.toFixed(9)));
  const isCover = (j) => car.col[j * 3] === SENT[0] && car.col[j * 3 + 1] === SENT[1] && car.col[j * 3 + 2] === SENT[2]
    && rings.has(car.pos[j * 3 + 2].toFixed(9));
  const tris = [];
  for (let i = 0; i < car.idx.length; i += 3) {
    const q = [car.idx[i], car.idx[i + 1], car.idx[i + 2]];
    if (q.every(isCover)) tris.push(q.map((j) => [car.pos[j * 3], car.pos[j * 3 + 1], car.pos[j * 3 + 2]]));
  }
  return tris;
}
// One EDGE of a flank region (v at its bottom or top), front to rear, as a polyline.
function flankEdge(dec, region, top) {
  const R = LiveryTex.REGIONS[region], SZ = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || SZ;
  const uL = R.x / SZ, uR = (R.x + R.w) / SZ, v0 = top ? 1 - R.y / SH : 1 - (R.y + R.h) / SH, pts = [];
  for (let j = 0; j < dec.pos.length / 3; j++) {
    const u = dec.uv[j * 2], v = dec.uv[j * 2 + 1];
    if (u < uL - 1e-6 || u > uR + 1e-6 || Math.abs(v - v0) > 1e-6) continue;
    const p = [dec.pos[j * 3], dec.pos[j * 3 + 1], dec.pos[j * 3 + 2]];
    if (!pts.some((q) => q.every((x, k) => Math.abs(x - p[k]) < 1e-12))) pts.push(p);
  }
  return pts.sort((a, b) => b[2] - a[2]);
}
const along = (line, z) => {   // the polyline's point at z
  const i = Math.max(0, line.findIndex((p, k) => k < line.length - 1 && z <= p[2] + 1e-12 && z >= line[k + 1][2] - 1e-12));
  const a = line[i], b = line[i + 1], u = (a[2] - z) / (a[2] - b[2]);
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u);
};

test("rounded: the flank band's edges stay their 14 mm off the coke-bottle skin, sampled every 1 cm", () => {
  const PROUD = S.Car3D.COVER_STACK.flankDecal, bad = [];
  let worstStraight = 0;
  for (const coke of [0.72, 1.38]) for (const spineHeight of S.Car3D.SPINE_HEIGHT_IDS) {
    const parts = withEngine(sPartsFor({}), { coke }), skin = coverSkin(S, parts, spineHeight);
    assert.ok(skin.length >= 100, `coke ${coke}/${spineHeight}: only ${skin.length} cover-skin triangles found`);
    const dec = S.CarMesh.carDecalData(2, parts, false, TEAM.id, "none", spineHeight);
    for (const region of ["spineSide", "spineSideL"]) for (const top of [false, true]) {
      const line = flankEdge(dec, region, top), tag = `coke ${coke}/${spineHeight}/${region} ${top ? "top" : "bottom"} edge`;
      assert.ok(Math.abs(line[0][2] + 0.66) < 1e-9 && Math.abs(line[line.length - 1][2] + 1.90) < 1e-9, `${tag}: does not run -0.66..-1.90`);
      for (let i = 66; i <= 190; i++) {
        const z = -i / 100, d = nearest(along(line, z), skin);
        if (Math.abs(d - PROUD) > 0.002) bad.push(`${tag} at z ${z}: ${(d * 1000).toFixed(1)} mm off the skin (meant ${(PROUD * 1000).toFixed(0)})`);
        // The straight edge the flat car draws, end to end, against the same skin:
        // what the strip is for (the test can see a floating band).
        const a = line[0], b = line[line.length - 1], u = (a[2] - z) / (a[2] - b[2]);
        worstStraight = Math.max(worstStraight, nearest([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u), skin) - PROUD);
      }
    }
  }
  assert.deepEqual(bad, [], "the flank band floats off (or dives into) the rounded cover:\n" + bad.slice(0, 20).join("\n"));
  assert.ok(worstStraight > 0.008, `a single straight quad would sit only ${(worstStraight * 1000).toFixed(1)} mm off at coke 1.38 — the strip is not needed`);
});

test("rounding OFF draws today's decal sheet, and ON moves only the flank band", () => {
  const strip = (dec) => {   // the sheet without the two flank regions, in emission order
    const R = LiveryTex.REGIONS, SZ = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || SZ;
    const inR = (r, u, v) => r && u >= r.x / SZ - 1e-6 && u <= (r.x + r.w) / SZ + 1e-6 && v >= 1 - (r.y + r.h) / SH - 1e-6 && v <= 1 - r.y / SH + 1e-6;
    const out = [];
    for (let j = 0; j < dec.pos.length / 3; j++) {
      const u = dec.uv[j * 2], v = dec.uv[j * 2 + 1];
      if (inR(R.spineSide, u, v) || inR(R.spineSideL, u, v)) continue;
      out.push([dec.pos[j * 3], dec.pos[j * 3 + 1], dec.pos[j * 3 + 2], dec.nrm[j * 3], dec.nrm[j * 3 + 1], dec.nrm[j * 3 + 2], u, v]);
    }
    return out;
  };
  const A = (d) => ({ pos: Array.from(d.pos), nrm: Array.from(d.nrm), uv: Array.from(d.uv), idx: Array.from(d.idx) });
  for (const spineHeight of Car3D.SPINE_HEIGHT_IDS) {
    for (const [engine, knobs] of [["stock"], ["race"], ["stock", { coke: 1.38 }], ["stock", { coke: 0.72 }]]) {
      const today = (() => { const p = knobs ? withEngine(partsFor({ engine }), knobs) : partsFor({ engine });
        return CarMesh.carDecalData(2, p, false, TEAM.id, "standard", spineHeight); })();   // no CarShade at all
      const parts = knobs ? withEngine(sPartsFor({ engine }), knobs) : sPartsFor({ engine });
      S.CarShade.set("0");   // the player's opt-out: CarShade loaded, rounding off
      let off;
      try { off = S.CarMesh.carDecalData(2, parts, false, TEAM.id, "standard", spineHeight); } finally { S.CarShade.set(null); }
      assert.deepEqual(A(off), A(today), `${spineHeight}/${engine}${knobs ? " coke " + knobs.coke : ""}: the opted-out sheet is not today's`);
      const on = S.CarMesh.carDecalData(2, parts, false, TEAM.id, "standard", spineHeight);
      assert.deepEqual(strip(on), strip(today), `${spineHeight}/${engine}: rounding moved a decal other than the flank band`);
      assert.equal(on.idx.length / 3, today.idx.length / 3 + 20, "the flank band is 6 sub-quads a side where it was 1");
    }
  }
  // An imported body never takes the rounded sheet.
  assert.deepEqual(A(S.CarMesh.carDecalData(2, sPartsFor({}), true, TEAM.id, "standard", "dorsal")),
                   A(CarMesh.carDecalData(2, partsFor({}), true, TEAM.id, "standard", "dorsal")), "an imported body's sheet changed");
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
