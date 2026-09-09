/* fin-design.test.mjs — the tail DESIGN a livery can pick, without a browser.
 *
 * Until now the shark fin was one frozen outline carrying one per-team graphic
 * and a copy of the crest that ALSO sat on the engine-cover spine — so from a
 * chase camera the same mark read twice and nothing about the tail was the
 * player's to change. Four livery fields now are: finShape (Car3D.FIN_SHAPES),
 * finStyle, finBadge and spineLogo (LiveryTex). Every one of them has a
 * default that must reproduce the shipped car EXACTLY, because 22 AI cars and
 * every saved livery carry none of them.
 *
 * Geometry runs the real Car3D.build; the atlas runs the real buildAtlas into
 * the recording 2D context tools/car/crest-sweep.mjs already trusts for the
 * crests, and reads back which region each paint op landed in.
 *
 * Run: node --test tests/unit/fin-design.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { loadCrests } from "../../tools/car/crest-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { RecCtx } = loadCrests();

// ── geometry ────────────────────────────────────────────────────────────────
const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "ferrari");
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
const build = (liv) => M.Car3D.build([0.9, 0.1, 0.1], [1, 1, 1], { livery: liv, teamId: team.id, num: 16, parts });
const samePos = (a, b) => a.pos.length === b.pos.length && a.pos.every((v, i) => v === b.pos[i]);

test("an absent finShape is the shipped car, byte for byte", () => {
  assert.ok(samePos(build({}), build({ finShape: "standard" })));
  assert.deepEqual(M.Car3D.FIN_SHAPE_IDS, ["standard", "swept", "stub", "stepped", "none"]);
});

// car-mesh.js calls sharkFinBadge()/sharkFinPanel() with NO shape, as every
// legacy caller did. The badge window moved from absolute z to base fractions
// so the stub could carry one; on the standard blade the fractions must land
// on the old numbers or every shipped fin badge moves.
test("the argument-less badge still lands on z -1.235 / -1.465", () => {
  const b = M.Car3D.sharkFinBadge();
  [-1.235, -1.465, -1.465, -1.235].forEach((want, i) =>
    assert.ok(Math.abs(b[i].z - want) < 1e-9, `corner ${i} z ${b[i].z} != ${want}`));
});

test("every shape moves the blade, and its own badge and panel stay on it", () => {
  const base = build({});
  for (const id of ["swept", "stub"]) {
    assert.ok(!samePos(base, build({ finShape: id })), `${id} built the standard blade`);
    const F = M.Car3D.FIN_SHAPES[id];
    for (const [what, quad] of [["badge", M.Car3D.sharkFinBadge(null, 1, id)],
                                ["panel", M.Car3D.sharkFinPanel(null, null, 1, id)]]) {
      for (const c of quad) {
        assert.ok(c.z <= F.baseLE[0] + 1e-9 && c.z >= F.baseTE[0] - 1e-9, `${id} ${what} z ${c.z} off the blade`);
        assert.ok(c.y <= F.topLE[1] + 1e-9, `${id} ${what} y ${c.y} above the crown`);
      }
    }
    // Level crown — the reason finTop() scales both ends together.
    assert.equal(F.topLE[1], F.topTE[1], `${id} has a wedge crown`);
  }
});

// "none" is the pick that can leave a graphic floating: the blade goes but the
// decal quads that were stretched over it must go WITH it.
test("finShape none removes the blade and its decal quads together", () => {
  const std = build({}), none = build({ finShape: "none" });
  assert.ok(none.pos.length < std.pos.length, "no vertices were removed");
  const quads = (shape) => M.CarMesh.carDecalData(2, parts, false, team.id, shape).idx.length / 6;
  assert.equal(quads("standard") - quads("none"), 4, "the fin panel and badge are two quads each side");
  assert.equal(quads("swept"), quads("standard"));
});

// ── atlas ───────────────────────────────────────────────────────────────────
// Own loader rather than loadCrests(): buildAtlas draws into the canvas
// document.createElement hands it, and this keeps a handle on that context.
function loadAtlas() {
  let last = null;
  const sb = {
    console, Math, Object, Array, String, Number, JSON, Map, Set, isNaN, isFinite, parseInt, parseFloat,
    document: { querySelector: () => null,
                createElement: () => ({ getContext: () => (last = new RecCtx()), width: 0, height: 0 }) },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/data/teams.js", "js/car/liveries.js", "js/car/crest-paths.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  const LT = vm.runInContext("LiveryTex", sb);
  const Teams = vm.runInContext("Teams", sb), Liveries = vm.runInContext("Liveries", sb);
  return { LT, Teams, Liveries,
           paint: (teamId, colors) => { LT.buildAtlas(teamId, colors, 16, true); return last.ops; } };
}
const A = loadAtlas();
const R = A.LT.REGIONS;
// An op "lands" in a region when a path point is inside it AND inside the
// op's own clip, if it had one — a clipped stroke authored past its panel edge
// paints nothing there, and counting it would report a bleed that the clip
// exists to prevent.
const bbox = (rings) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
// An op counts for a region only where it would actually LAND: inside the
// region AND inside every clip in force when it was recorded. RecCtx keeps
// those as a list because a canvas clip intersects and never widens — before
// it did, a crown painter reaching into a flank recorded as a hit and this
// helper called the saddle's (entirely clipped) flank band a pass.
const inRect = (op, r) => {
  const cs = (op.clip || []).map((c) => bbox(c.pts));
  return op.pts.some((ring) => ring.some(([x, y]) =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h &&
    cs.every((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)));
};
const opsIn = (ops, r) => ops.filter((op) => inRect(op, r));
const BASE = { c1: [0.9, 0.1, 0.1], c2: [1, 1, 1] };

test("finStyle none paints nothing on the fin panel, and the crown never carries the wash", () => {
  const def = A.paint("ferrari", BASE), none = A.paint("ferrari", { ...BASE, finStyle: "none" });
  assert.ok(opsIn(def, R.fin).length > 0, "the default fin is painted");
  assert.equal(opsIn(none, R.fin).length, 0, "a plain fin carries paint ops");
  // The crown carries the crest and NO tail wash (hard edges only, by the
  // owner's call), so the fin's motif pick cannot change the crown at all.
  const c0 = opsIn(def, R.crest).length, c1 = opsIn(none, R.crest).length;
  assert.ok(c0 > 0 && c1 === c0, `cover ops ${c0} -> ${c1}: the fin motif must stop at the fin`);
  assert.equal(opsIn(A.paint("ferrari", { ...BASE, spineLogo: "none" }), R.crest).length, 0, "a bare crown is bare — no wash");
});

test("every named motif paints the fin, and a foreign one falls back to the team's", () => {
  for (const id of ["diag", "sweep", "chevron", "streak", "check"]) {
    assert.ok(opsIn(A.paint("mercedes", { ...BASE, finStyle: id }), R.fin).length > 0, id);
  }
  const team = opsIn(A.paint("mercedes", BASE), R.fin).length;
  assert.equal(opsIn(A.paint("mercedes", { ...BASE, finStyle: "tablecloth" }), R.fin).length, team);
});

test("spineLogo none drops the crest from the cover and keeps it on the fin", () => {
  const def = A.paint("ferrari", BASE), none = A.paint("ferrari", { ...BASE, spineLogo: "none" });
  assert.ok(opsIn(none, R.crest).length < opsIn(def, R.crest).length, "the spine kept its crest");
  assert.equal(opsIn(none, R.finBadge).length, opsIn(def, R.finBadge).length, "the fin badge changed");
});

// The flank band is not a constant-height strip: it tapers along the car and the
// whole thing rises with spineHeight. LiveryTex squashes flank marks by that
// height so they come out square in METRES, and it holds the height as a small
// measured table because the atlas is built without Car3D in scope. A table of
// measurements goes stale the first time the cover geometry moves — and when it
// did, every mark on a dorsal cover came out 14 % too narrow and the owner saw
// it as "the side designs look squished". So re-measure it here, against the
// real Car3D, rather than trusting the number.
test("the flank squash table still matches the cover Car3D actually builds", () => {
  const FLANK = A.LT.FLANK, R = A.LT.REGIONS.spineSide;
  const z = FLANK.zF - 0.19 * FLANK.zLen;   // the mark's station, as buildAtlas uses it
  // Driven by the CAR's id list, not by the table's own keys: iterating the
  // table can only check the rows that are there, and the row that is MISSING
  // is the bug — it falls back to `standard` and squishes that cover's marks by
  // the very amount this table exists to correct. `high` shipped missing.
  assert.deepEqual(Object.keys(A.LT.FLANK_H).sort(), Array.from(M.Car3D.SPINE_HEIGHT_IDS).sort(),
                   "every spine height needs a measured flank height");
  for (const id of M.Car3D.SPINE_HEIGHT_IDS) {
    const claimed = A.LT.FLANK_H[id];
    const anchors = M.Car3D.bodyAnchors(parts, team.id, id === "standard" ? null : id);
    const p = M.Car3D.coverProfile(anchors.coverAt(z));
    const real = p.shoulder - p.bottom;
    assert.ok(Math.abs(real - claimed) < 0.005,
      `FLANK_H.${id} says ${claimed} m but the cover is ${real.toFixed(4)} m at z ${z.toFixed(3)}`);
  }
  // …and the squash it yields is the ratio that makes a metre square a pixel
  // square, so a region resize cannot quietly un-square the marks either.
  const sq = (h) => (R.w / FLANK.zLen) * (A.LT.FLANK_H[h] / R.h);
  assert.ok(sq("dorsal") > sq("raised") && sq("raised") > sq("standard"),
            "a taller cover is a taller band, so its marks are drawn wider");
});

test("every SPINE TOP design paints the crown; wordmark and number carry text", () => {
  assert.deepEqual(Array.from(A.LT.SPINE_LOGO_IDS), ["logo", "none", "wrap", "bigmark", "saddle", "panel", "stripe", "twin", "chevron", "tricolour", "wordmark", "carbon", "number"]);
  // The wrap is ONE shape over crown and flanks: it paints the crest region
  // AND the flank band with no spineSide picked, and leaves the tail bare.
  const wrap = A.paint("redbull", { ...BASE, spineLogo: "wrap" });
  assert.ok(opsIn(wrap, R.crest).length > 0 && opsIn(wrap, R.spineSide).length > 0, "wrap reaches both the crown and the flank band");
  // Each flank is its own region, authored in its own outside-view frame:
  // whatever paints the right flank paints the left one too, and the atlas
  // is taller than it is wide to hold it.
  assert.ok(A.LT.SIZE_H > A.LT.SIZE && R.spineSideL && R.spineSideL.y + R.spineSideL.h <= A.LT.SIZE_H, "the left flank lives in the atlas's extra rows");
  assert.ok(opsIn(wrap, R.spineSideL).length > 0, "wrap paints the left flank too");
  for (const id of ["number", "logo", "plate", "wordmark", "duo", "slash", "split", "bars"]) {
    const ops = A.paint("ferrari", { ...BASE, spineSide: id });
    assert.ok(opsIn(ops, R.spineSide).length > 0 && opsIn(ops, R.spineSideL).length > 0, `${id} paints both flanks`);
  }
  assert.equal(opsIn(A.paint("ferrari", BASE), R.spineSideL).length, 0, "the left flank is bare by default too");
  assert.equal(opsIn(wrap, R.tail).length, 0, "wrap leaves the tail bare");
  // A SIDE pick under the wrap yields the front of the flank to the mark, and
  // that band is derived from the mark's own path — a stale constant left it
  // NaN, and NaN coordinates land in no region at all, so the side design
  // silently vanished. Counted AGAINST the same wrap with no side pick: the
  // wrap paints these regions itself, so "the flank has ops" proves nothing.
  // This is the one combination (a crown design AND a side design) that no
  // other case here covers.
  for (const team of ["redbull", "ferrari"]) {
    const bare = A.paint(team, { ...BASE, spineLogo: "wrap", spineSide: "none" });
    for (const side of ["duo", "wordmark", "slash", "number"]) {
      const ops = A.paint(team, { ...BASE, spineLogo: "wrap", spineSide: side });
      for (const reg of [R.spineSide, R.spineSideL]) {
        assert.ok(opsIn(ops, reg).length > opsIn(bare, reg).length,
                  `${team} wrap+${side} adds paint to the flank`);
      }
    }
  }
  // The saddle too runs down the flanks (the SF-26's white), so it paints the
  // band with no side pick; the panel stays on the crown alone.
  assert.ok(opsIn(A.paint("ferrari", { ...BASE, spineLogo: "saddle" }), R.spineSide).length > 0, "saddle reaches the flank band");
  assert.equal(opsIn(A.paint("ferrari", { ...BASE, spineLogo: "panel" }), R.spineSide).length, 0, "panel stays on the crown");
  // The big mark is the crest without its plate at crown scale: it paints the
  // crown, with FEWER ops than the crest (the disc is gone) and none on the
  // tail (it is a mark, not a band).
  const big = opsIn(A.paint("redbull", { ...BASE, spineLogo: "bigmark" }), R.crest).length;
  assert.ok(big > 0 && big < opsIn(A.paint("redbull", BASE), R.crest).length, `bigmark: ${big} ops, the disc dropped`);
  assert.equal(opsIn(A.paint("redbull", { ...BASE, spineLogo: "bigmark" }), R.tail).length, 0, "bigmark leaves the tail bare");
  const bare = opsIn(A.paint("ferrari", { ...BASE, spineLogo: "none" }), R.crest).length;
  // The tail strip: bare for the marks and "none", painted by every band design.
  for (const id of ["none", "logo", "number"]) assert.equal(opsIn(A.paint("ferrari", { ...BASE, spineLogo: id }), R.tail).length, 0, `${id}: the tail stays bare`);
  for (const id of ["saddle", "panel", "stripe", "twin", "carbon", "wordmark"]) assert.ok(opsIn(A.paint("ferrari", { ...BASE, spineLogo: id }), R.tail).length > 0, `${id} runs down the tail`);
  for (const id of ["saddle", "panel", "stripe", "twin", "wordmark", "carbon", "number"]) {
    const ops = opsIn(A.paint("ferrari", { ...BASE, spineLogo: id }), R.crest);
    // The band designs REPLACE the wash (bare paint under them), so they are
    // compared against an empty crown; the text designs sit on the wash.
    assert.ok(ops.length > (id === "wordmark" || id === "number" ? bare : 0), `${id} paints the crown`);
    const texts = ops.filter((op) => op.kind === "text").map((op) => op.text);
    if (id === "number") assert.ok(texts.includes("16"), `number: ${texts}`);
    // drawWordmark sets each letter on its own, so the name is the join.
    if (id === "wordmark") assert.ok(texts.join("").length >= 3, `wordmark: ${texts}`);
    if (id === "saddle" || id === "panel" || id === "stripe" || id === "twin" || id === "carbon") assert.equal(texts.length, 0, `${id} carries no text`);
  }
});

test("finBadge number puts the race number on the fin; none leaves the plate bare", () => {
  const num = A.paint("ferrari", { ...BASE, finBadge: "number" });
  const texts = opsIn(num, R.finBadge).filter((op) => op.kind === "text").map((op) => op.text);
  assert.ok(texts.includes("16"), `fin texts: ${texts}`);
  const def = A.paint("ferrari", BASE);
  assert.ok(!opsIn(def, R.finBadge).some((op) => op.kind === "text" && op.text === "16"), "the crest badge already carried the number");
  assert.equal(opsIn(A.paint("ferrari", { ...BASE, finBadge: "none" }), R.finBadge).length, 0);
});

// ── body details, same editor, same defaults-reproduce-the-car rule ──────────

const sameCol = (a, b) => a.col.length === b.col.length && a.col.every((v, i) => v === b.col[i]);

test("the stepped fin adds a rear block behind an unchanged front-blade outline", () => {
  const std = build({}), st = build({ finShape: "stepped" });
  assert.ok(st.pos.length > std.pos.length, "the step is extra geometry");
  // The panel and badge are placed off the FRONT blade, whose base ends at z -1.45.
  const badge = M.Car3D.sharkFinBadge(null, 1, "stepped");
  assert.ok(badge.every((c) => c.z >= -1.45 && c.z <= -0.65), "badge stays on the front blade");
  assert.ok(M.Car3D.FIN_SHAPE_IDS.includes("stepped") && M.Car3D.FIN_SHAPE_IDS.at(-1) === "none", "\"none\" stays last");
});

test("cover vents are geometry; the T-cam pick is colour only", () => {
  const base = build({});
  for (const v of ["gills", "spine"]) {
    assert.ok(build({ coverVents: v }).pos.length > base.pos.length, `coverVents ${v} adds vertices`);
  }
  const bl = build({ tcam: "black" }), ye = build({ tcam: "yellow" });
  assert.ok(samePos(bl, ye) && !sameCol(bl, ye), "black vs yellow: same vertices, different colours");
  assert.ok(samePos(base, build({ tcam: "team" })) && sameCol(base, build({ tcam: "team" })), "\"team\" is the shipped car");
});

// SPINE HEIGHT lifts the engine-cover crown's TOP line only, tapering to the
// tail, and the lift flows through bodyAnchors so the crest decal, vents and
// fin root all ride up with the skin. The fin's top must NOT move: it is where
// the regulation ceiling puts it and where the fin decal is placed.
test("spineHeight lifts the cover crown top-only and leaves the fin top alone", () => {
  assert.deepEqual(Array.from(M.Car3D.SPINE_HEIGHT_IDS), ["standard", "raised", "high", "dorsal"]);
  const base = build({}), std = build({ spineHeight: "standard" });
  assert.ok(samePos(base, std), "\"standard\" is the shipped car");
  const a0 = M.Car3D.bodyAnchors(parts, team.id), a1 = M.Car3D.bodyAnchors(parts, team.id, "raised"),
        a2 = M.Car3D.bodyAnchors(parts, team.id, "high");
  assert.strictEqual(M.Car3D.bodyAnchors(parts, team.id, "standard"), a0, "standard shares the cached anchors");
  const rise = (a, z) => a.coverAt(z).top - a0.coverAt(z).top;
  assert.ok(Math.abs(rise(a1, -0.55) - M.Car3D.spineRise("raised")) < 1e-9, "raised lifts the front crown by its rise");
  assert.ok(Math.abs(rise(a2, -0.55) - M.Car3D.spineRise("high")) < 1e-9, "high lifts the front crown by its rise");
  assert.ok(rise(a2, -2.0) > 0 && rise(a2, -2.0) < rise(a2, -0.55), "the lift tapers toward the tail but does not vanish");
  assert.strictEqual(a2.coverAt(-0.55).bottom, a0.coverAt(-0.55).bottom, "the cover floor does not move");
  assert.ok(a2.coverAt(-0.55).top < 0.938, "\"high\" stays under the roll hoop's rear crown");
  const a3 = M.Car3D.bodyAnchors(parts, team.id, "dorsal");
  assert.ok(a3.coverAt(-0.55).top > a2.coverAt(-0.55).top && a3.coverAt(-0.55).top < 0.968,
    "\"dorsal\" is the tallest and stays under the hoop's front crown, the regulation top of the car");
  // The mesh: the same triangles, lifted by at most the rise, and the fin's
  // top (the tallest sharkFin vertex) exactly where it was.
  const finTop = (liv) => {
    const m = M.Car3D.build([0.9, 0.1, 0.1], [1, 1, 1], { livery: liv, teamId: team.id, num: 16, parts, measure: true });
    const f = m.parts.find((p) => p.name === "sharkFin");
    return f.centreM[1] + f.sizeM[1] / 2;
  };
  const top0 = finTop({});
  for (const id of ["raised", "high", "dorsal"]) {
    const m = build({ spineHeight: id });
    assert.strictEqual(m.pos.length, base.pos.length, `${id}: same triangle count — a lift, not new parts`);
    let maxDy = 0, lowered = 0;
    for (let i = 1; i < m.pos.length; i += 3) {
      const dy = m.pos[i] - base.pos[i];
      if (dy > maxDy) maxDy = dy;
      if (dy < -1e-6) lowered++;
    }
    assert.ok(Math.abs(maxDy - M.Car3D.spineRise(id)) < 1e-9, `${id}: the crown rises by exactly its rise (got ${maxDy})`);
    assert.strictEqual(lowered, 0, `${id}: nothing moves DOWN — the floor and the fin stay put`);
    // The regulation top, asserted on the number the blade is CUT from —
    // build()'s part measure rounds centre and size to 10 mm, so the derived
    // top carries that much slack and a 1e-9 bound on it only ever passed by
    // luck (it broke the moment the fin ROOT started following the crown).
    const rootTop = (h) => M.Car3D.sharkFinRoot(
      M.Car3D.bodyAnchors(parts, team.id, h), 1, "standard").top;
    assert.strictEqual(rootTop(id), rootTop(null), `${id}: the fin top stays on the regulation line`);
    assert.ok(Math.abs(finTop({ spineHeight: id }) - top0) <= 0.011, `${id}: and the mesh agrees`);
  }
});

// SPINE SIDE: the mark on the engine-cover flank. Atlas: the region is bare by
// default (pixel-identical shipped atlas) and carries the number, the driver
// code or the crest on pick. Mesh: the service panels leave the band's z range
// so a grey hatch never sits through the number — same vertex count, moved.
test("spineSide paints the flank band on pick only, and clears the service panels from under it", () => {
  assert.deepEqual(Array.from(A.LT.SPINE_SIDE_IDS), ["none", "number", "logo", "code", "plate", "wordmark", "duo", "slash", "split", "bars"]);
  assert.equal(opsIn(A.paint("ferrari", BASE), R.spineSide).length, 0, "the shipped atlas paints the flank band");
  const texts = (liv) => opsIn(A.paint("ferrari", { ...BASE, ...liv }), R.spineSide)
    .filter((op) => op.kind === "text").map((op) => op.text);
  assert.ok(texts({ spineSide: "number" }).includes("16"), "number on the flank");
  assert.ok(texts({ spineSide: "code" }).includes("LEC"), "driver code on the flank");
  // The photo-derived side designs: a plate carries the number, the wordmark a
  // name, the slashes only bars.
  assert.ok(texts({ spineSide: "plate" }).includes("16"), "plate: number on the plate");
  assert.ok(texts({ spineSide: "wordmark" }).join("").length >= 3, "wordmark: a sponsor name on the flank");
  assert.ok(texts({ spineSide: "duo" }).join("").length > texts({ spineSide: "wordmark" }).join("").length, "duo: two names on the flank");
  const slash = opsIn(A.paint("ferrari", { ...BASE, spineSide: "slash" }), R.spineSide);
  assert.ok(slash.length >= 4 && slash.every((op) => op.kind !== "text"), "slash: bars, no text");
  assert.ok(opsIn(A.paint("ferrari", { ...BASE, spineSide: "logo" }), R.spineSide).length > 0, "the crest on the flank");
  const base = build({}), side = build({ spineSide: "number" });
  assert.strictEqual(side.pos.length, base.pos.length, "the panels move, they are not removed");
  assert.ok(!samePos(base, side), "a flank mark relocates the service panels");
  // No metal-surface vertex (the panels) inside the band's z range on the upper flank.
  const metal = M.Car3D.SURFACES.metal;
  const inBand = (m) => { let n = 0; for (let i = 0; i < m.pos.length / 3; i++) {
    const x = Math.abs(m.pos[i * 3]), y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    if (m.mat[i] === metal && z < -0.70 && z > -1.24 && x > 0.15 && y > 0.45) n++; } return n; };
  assert.ok(inBand(base) > 0, "the shipped car has a panel in the band's z range");
  assert.equal(inBand(side), 0, "no panel vertex sits under the flank band");
});

// The engine-cover cross-section is ROUNDED: one profile (Car3D.coverProfile)
// serves the loft, the crest strip and the flank band, so it has to be sane at
// every station and spine height — monotonic in x and y, a flat crown narrower
// than the shoulder, and the skin samplers agreeing with it.
test("the cover profile rounds the crown and its samplers sit on the skin", () => {
  for (const spine of ["standard", "dorsal"]) {
    const a = M.Car3D.bodyAnchors(parts, team.id, spine);
    for (const z of [-0.55, -0.97, -1.42, -2.0]) {
      const c = a.coverAt(z), p = M.Car3D.coverProfile(c);
      for (let i = 1; i < p.pts.length; i++) {
        assert.ok(p.pts[i][0] < p.pts[i - 1][0] && p.pts[i][1] > p.pts[i - 1][1], `${spine} z${z}: pts step inward and upward`);
      }
      assert.ok(p.pts.at(-1)[1] === c.top && p.pts[0][1] === c.bottom, "the profile spans bottom to crown");
      assert.ok(p.shoulder < c.top && p.shoulder > c.bottom, "the shoulder sits below the crown");
      assert.ok(Math.abs(M.Car3D.coverSurfaceY(c, 0) - c.top) < 1e-12, "the centre is the crown");
      assert.ok(Math.abs(M.Car3D.coverSurfaceY(c, p.pts[1][0]) - p.shoulder) < 1e-12, "the shoulder x samples the shoulder y");
      assert.ok(Math.abs(M.Car3D.coverFlankX(c, p.shoulder) - p.pts[1][0]) < 1e-12 &&
                Math.abs(M.Car3D.coverFlankX(c, c.bottom) - c.x) < 1e-12, "the flank sampler ends on the profile's corners");
    }
  }
});

// The real rule, read off the driver slot: car 1 black, car 2 yellow. Compared
// at the SAME number each time — the number already colours other parts of the
// mesh, so a cross-number comparison says nothing about the T-cam.
test("T-cam auto paints car 1 black and car 2 yellow", () => {
  const team = M.Teams.LIST.find((t) => t.id === "ferrari");
  const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);
  const b = (liv, num) => M.Car3D.build([0.9, 0.1, 0.1], [1, 1, 1], { livery: liv, teamId: "ferrari", num, parts });
  const [n1, n2] = team.drivers.map((d) => d.num);
  assert.ok(sameCol(b({ tcam: "auto" }, n1), b({ tcam: "black" }, n1)), "car 1 reads black");
  assert.ok(sameCol(b({ tcam: "auto" }, n2), b({ tcam: "yellow" }, n2)), "car 2 reads yellow");
});

test("finBadge code puts the driver's three letters on the fin", () => {
  // Ferrari, car 16 (A.paint's fixed number), badge "code" -> LEC in the badge box.
  const ops = A.paint("ferrari", { ...BASE, finBadge: "code" });
  const texts = opsIn(ops, R.finBadge).filter((o) => o.kind === "text").map((o) => o.text);
  assert.ok(texts.includes("LEC"), `fin badge texts: ${JSON.stringify(texts)}`);
  assert.ok(!opsIn(A.paint("ferrari", { ...BASE, finBadge: "number" }), R.finBadge).some((o) => o.kind === "text" && o.text === "LEC"),
    "the number badge does not also carry the code");
});

test("mirror lamp anchors follow the team's mirror style and are cached", () => {
  const a = M.Car3D.mirrorLightAnchors("ferrari", 1);
  assert.equal(a.length, 2);
  assert.ok(a[0].x < 0 && a[1].x > 0 && a[0].x === -a[1].x, "one per side, mirrored");
  assert.strictEqual(M.Car3D.mirrorLightAnchors("ferrari", 1), a, "same call, same object — no per-frame garbage");
  // Mercedes runs the swept (wider) housing: its lamp sits further outboard.
  assert.ok(M.Car3D.mirrorLightAnchors("mercedes", 1)[1].x > a[1].x);
});

// The 2026 code, sampled across one second. Two things must hold: the deploy
// flash is SHORT (one pulse a second, not a strobe — the note in game.js
// records why), and a cruising car returns -1 so the weather / night gate keeps
// its old behaviour untouched.
test("the ERS light code flashes once at full deploy, rapidly when clipping, and stands aside otherwise", () => {
  const code = M.CarMesh.ersLightCode;
  const sample = (c) => Array.from({ length: 40 }, (_, i) => code(c, i / 40));
  const dep = sample({ deploying: true, energy: 0.5 });
  assert.ok(dep.every((v) => v === 0 || v === 1), "deploying: the code owns the lamp");
  const lit = dep.filter((v) => v === 1).length;
  assert.ok(lit >= 4 && lit <= 12, `one short pulse per second, not a strobe (lit ${lit}/40)`);
  const clip = sample({ deploying: false, energy: 1, axEstSm: -6 });
  assert.ok(clip.filter((v, i) => i > 0 && v !== clip[i - 1]).length >= 6, "clipping: rapid flash");
  assert.ok(sample({ deploying: false, energy: 0.6, axEstSm: 0 }).every((v) => v === -1), "cruising: gate decides");
  assert.ok(sample({ deploying: false, energy: 1, axEstSm: 0 }).every((v) => v === -1), "full but not braking: no clip");
  assert.equal(code(null, 0), -1);
});

// ── the two the spine sweep found (2026-09-09) ──────────────────────────────

test("the wrap sun clears the cover it is painted on, for every team", () => {
  // The sun is the largest single area any livery colour ever covers — a disc
  // across the whole crown AND both cover flanks — and it was the one place the
  // cover check never reached. Measured before the fix: Ferrari painted #ffec00
  // on its #f2f2f5 cover at 1.09, Mercedes #00b4ab on #c2c7d1 at 1.52, Alpine
  // #ff87bc on #0093cc at 1.56. The crown BAND has cleared 2.0 against the cover
  // since the "white on white" saddle; this holds the sun to the same floor.
  for (const t of A.Teams.LIST) {
    const liv = A.Liveries.forTeam(t)[0];
    const cover = liv.cover || liv.c1;
    const c = A.LT.contrast(A.LT.sunColour(t.id, liv), cover);
    assert.ok(c >= 2.0, `${t.id}: the wrap sun reads ${c.toFixed(2)}:1 on its own cover`);
  }
});

test("bigmark is BIG — not logo at 1.087x", () => {
  // Both branches draw the mark in a square box under CROWN_SQUASH; they used to
  // differ only in `sq = Rc.w` vs `Rc.w * 0.92`, which is 8.7 % linear and
  // measured +18 % area on ten of eleven teams — invisible at chase distance,
  // and SMALLER than logo on Red Bull, the car the design is named for. bigmark
  // now cancels CREST_MARGIN so the mark's own bbox reaches the crown's width.
  // The floor is 1.25x linear: the real gain is 1.30x, and pinning the exact
  // number would fail on any future change to a team's mark rather than on a
  // regression of this one.
  const span = (spineLogo, team) => {
    const liv = Object.assign({}, A.Liveries.forTeam(team)[0], { spineLogo });
    const ops = A.paint(team.id, liv);
    let x0 = Infinity, x1 = -Infinity;
    for (const op of ops) for (const ring of op.pts || []) for (const [x, y] of ring)
      if (x >= R.crest.x && x <= R.crest.x + R.crest.w && y >= R.crest.y && y <= R.crest.y + R.crest.h) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      }
    return x1 > x0 ? (x1 - x0) / R.crest.w : 0;
  };
  for (const t of A.Teams.LIST) {
    const lo = span("logo", t), big = span("bigmark", t);
    assert.ok(lo > 0 && big > 0, `${t.id}: no crown mark measured`);
    assert.ok(big >= lo * 1.25, `${t.id}: bigmark spans ${(big * 100).toFixed(1)}% of the crown, logo ${(lo * 100).toFixed(1)}% — only ${(big / lo).toFixed(3)}x`);
    assert.ok(big <= 1.001, `${t.id}: bigmark spans ${(big * 100).toFixed(1)}% — past the crown, into the atlas's neighbours`);
  }
});
