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
  assert.deepEqual(M.Car3D.FIN_SHAPE_IDS, ["standard", "swept", "stub", "none"]);
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
