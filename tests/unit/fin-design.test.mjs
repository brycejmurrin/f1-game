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
  return { LT, paint: (teamId, colors) => { LT.buildAtlas(teamId, colors, 16, true); return last.ops; } };
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
const inRect = (op, r) => {
  const c = op.clip ? bbox(op.clip.pts) : null;
  return op.pts.some((ring) => ring.some(([x, y]) =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h &&
    (!c || (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1))));
};
const opsIn = (ops, r) => ops.filter((op) => inRect(op, r));
const BASE = { c1: [0.9, 0.1, 0.1], c2: [1, 1, 1] };

test("finStyle none paints nothing on the fin panel or the cover wash", () => {
  const def = A.paint("ferrari", BASE), none = A.paint("ferrari", { ...BASE, finStyle: "none" });
  assert.ok(opsIn(def, R.fin).length > 0, "the default fin is painted");
  assert.equal(opsIn(none, R.fin).length, 0, "a plain fin carries paint ops");
  // The cover keeps its crest but loses the wash: fewer ops, not zero.
  const c0 = opsIn(def, R.crest).length, c1 = opsIn(none, R.crest).length;
  assert.ok(c1 > 0 && c1 < c0, `cover ops ${c0} -> ${c1}`);
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
  assert.deepEqual(Array.from(M.Car3D.SPINE_HEIGHT_IDS), ["standard", "raised", "high"]);
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
  // The mesh: the same triangles, lifted by at most the rise, and the fin's
  // top (the tallest sharkFin vertex) exactly where it was.
  const finTop = (liv) => {
    const m = M.Car3D.build([0.9, 0.1, 0.1], [1, 1, 1], { livery: liv, teamId: team.id, num: 16, parts, measure: true });
    const f = m.parts.find((p) => p.name === "sharkFin");
    return f.centreM[1] + f.sizeM[1] / 2;
  };
  const top0 = finTop({});
  for (const id of ["raised", "high"]) {
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
    assert.ok(Math.abs(finTop({ spineHeight: id }) - top0) < 1e-9, `${id}: the fin top stays on the regulation line`);
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
