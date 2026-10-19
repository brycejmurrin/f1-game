// livery-sidewall — livery sidewallInk (GARAGE FINISHES/PARTS slice S5): the raised sidewall LETTERING rings
// take the livery ink on all four wheels; the compound BAND keeps its colour so the tyre stays readable.
// Unset must be byte-identical to today (geometry, surface ids AND colour arrays); set on a lettered tyre
// changes colour arrays only, and only lettering vertices. Real js/car sources in a node vm, no browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, WeakMap, Map, Set };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/liveries.js", "js/car/helmets.js", "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-shade.js", "js/car/car-body-geom.js", "js/car/car3d.js"])
  vm.runInContext(read(f), ctx, { filename: f });
const { Car3D, CarWheels, Parts, Teams } = vm.runInContext("({ Car3D, CarWheels, Parts, Teams })", ctx);
const team = Teams.LIST ? Teams.LIST[0] : Teams[0];
const parts = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
const visual = parts._visual || {};
const brake = visual.brakes, wheel = visual.wheels;
const BAND = [0.85, 0.10, 0.08], SW_DEF = [0.16, 0.16, 0.17], INK = [1, 1, 0];
// a tyre record with a double lettering ring, so band AND lettering are both on the mesh
const tyre = { ...(visual.tyres || {}), band: BAND, sidewall: 2 };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = (m) => JSON.stringify({ pos: m.pos, nrm: m.nrm, mat: m.mat, idx: m.idx });
const colAt = (m, i) => [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]];
const changed = (a, b) => {
  assert.equal(a.col.length, b.col.length);
  const out = [];
  for (let i = 0; i < a.col.length / 3; i++) if (!same(colAt(a, i), colAt(b, i))) out.push(i);
  return out;
};
const wheelsOf = (liv) => {
  const t = CarWheels.tints(liv);
  return Car3D.buildWheelLayers(0.32, BAND, t.cal || (brake && brake.cal), t.rim || (brake && brake.rim), false, tyre, brake, wheel, t.ink);
};

test("tints(): sidewallInk parses (array and #rrggbb), joins the key, and unset leaves the key empty", () => {
  assert.equal(CarWheels.tints({}).key, "");
  assert.equal(CarWheels.tints({ sidewallInk: null }).ink, null);
  const a = CarWheels.tints({ sidewallInk: "#ffff00" }), b = CarWheels.tints({ sidewallInk: INK });
  assert.equal(JSON.stringify(a.ink), JSON.stringify(INK));
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, "");
  assert.notEqual(a.key, CarWheels.tints({ sidewallInk: [0, 1, 1] }).key);
  // S2 keys are untouched when no ink is set
  assert.equal(CarWheels.tints({ rimTint: [1, 0, 1] }).key, "|w255,0,255;");
});

test("unset ink: standalone wheels are byte-identical to today's call", () => {
  const today = Car3D.buildWheelLayers(0.32, BAND, brake && brake.cal, brake && brake.rim, false, tyre, brake, wheel);
  const viaTints = wheelsOf({});
  for (const k of ["rotating", "fixed"]) assert.equal(JSON.stringify(today[k]), JSON.stringify(viaTints[k]));
});

test("set ink: only lettering vertices recolour, all to the ink; the compound band keeps its colour; geometry unchanged", () => {
  const base = wheelsOf({}), inked = wheelsOf({ sidewallInk: INK });
  for (const k of ["rotating", "fixed"]) assert.equal(plain(base[k]), plain(inked[k]), `${k}: geometry or surface ids moved`);
  assert.equal(changed(base.fixed, inked.fixed).length, 0, "ink touched the fixed layer");
  const diff = changed(base.rotating, inked.rotating);
  assert.ok(diff.length > 0, "sidewallInk changed nothing");
  const was = new Set();
  for (const i of diff) {
    assert.ok(same(colAt(inked.rotating, i), INK), `vertex ${i} is not the ink`);
    was.add(JSON.stringify(colAt(base.rotating, i).map((x) => +x.toFixed(4))));
  }
  assert.deepEqual([...was], [JSON.stringify(SW_DEF)], "expected exactly the lettering colour to be replaced");
  const RUBBER = Car3D.SURFACES.rubber;
  let bands = 0;
  for (let i = 0; i < base.rotating.col.length / 3; i++) {
    const c = colAt(base.rotating, i).map((x) => +x.toFixed(4));
    if (base.rotating.mat[i] !== RUBBER) continue;
    // every lettering vertex is now ink (nothing missed)
    if (same(c, SW_DEF)) assert.ok(diff.includes(i), `lettering vertex ${i} kept its colour`);
    // the compound band is how a tyre reads at a glance: the ink never touches it
    if (same(c, BAND)) { bands++; assert.ok(!diff.includes(i), `compound band vertex ${i} took the ink`); }
  }
  assert.ok(bands > 0, "the tyre has a compound band to keep");
});

test("a tyre option with no lettering gets one inked ring only when sidewallInk is set; its band is untouched", () => {
  const bare = { ...tyre, sidewall: 0 };
  const build = (liv) => { const t = CarWheels.tints(liv); return Car3D.buildWheelLayers(0.32, BAND, brake && brake.cal, brake && brake.rim, false, bare, brake, wheel, t.ink); };
  const today = Car3D.buildWheelLayers(0.32, BAND, brake && brake.cal, brake && brake.rim, false, bare, brake, wheel);
  assert.equal(JSON.stringify(today.rotating), JSON.stringify(build({}).rotating), "unset ink adds nothing");
  const inked = build({ sidewallInk: INK }).rotating, n = (m) => m.col.length / 3;
  assert.ok(n(inked) > n(today.rotating), "an inked bare tyre gains a lettering ring");
  const count = (m, c) => { let k = 0; for (let i = 0; i < n(m); i++) if (same(colAt(m, i).map((x) => +x.toFixed(4)), c)) k++; return k; };
  assert.equal(count(inked, BAND), count(today.rotating, BAND), "band vertex count unchanged");
  assert.ok(count(inked, INK) > 0);
});

test("ink composes with rim/caliper tints on disjoint vertices", () => {
  const base = wheelsOf({}), ink = changed(base.rotating, wheelsOf({ sidewallInk: INK }).rotating);
  const rim = changed(base.rotating, wheelsOf({ rimTint: [1, 0, 1] }).rotating);
  assert.ok(rim.length > 0);
  for (const i of rim) assert.ok(!ink.includes(i), `vertex ${i} moved by both`);
});

test("Car3D.build: no ink = byte-identical car; ink changes only wheel-vertex colours on all four wheels", () => {
  const build = (livery) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: team.id, parts, livery, noDriver: true });
  const none = build(undefined);
  assert.equal(JSON.stringify(none), JSON.stringify(build({})));
  assert.equal(JSON.stringify(none), JSON.stringify(build({ sidewallInk: null })));
  const inked = build({ sidewallInk: INK });
  assert.equal(plain(none), plain(inked));
  const diff = changed(none, inked);
  assert.ok(diff.length > 0, "ink changed nothing on the full car");
  const A = Car3D.AXLES, centres = [[0.79, A.frontZ], [0.76, A.rearZ]].flatMap(([x, z]) => [[x, z], [-x, z]]);
  const corners = new Set();
  for (const i of diff) {
    const x = none.pos[i * 3], y = none.pos[i * 3 + 1], z = none.pos[i * 3 + 2];
    assert.ok(centres.some(([cx, cz]) => Math.hypot(x - cx, y - A.wheelY, z - cz) < 0.45), `vertex ${i} is not on a wheel`);
    corners.add((x > 0 ? "R" : "L") + (z > 0 ? "F" : "B"));
  }
  assert.equal(corners.size, 4, `ink reached ${[...corners]}`);
});

test("wheel mesh call sites pass the ink and the editor has the row (source pins)", () => {
  const draw = read("js/car/car-draw.js");
  // `, wt.surf` is the RIM FINISH surface (livery-paint-zones.test.mjs), passed after the ink.
  assert.equal((draw.match(/wt\.ink(, wt\.surf)?\)/g) || []).length, 4, "car-draw: player + field, front + rear");
  assert.equal((read("js/car/car3d.js").match(/wheelStyle, wt\.ink(, wt\.surf)?\)/g) || []).length, 2);
  assert.match(read("js/camera/cockpit-preview.js"), /visual\.wheels,wt\.ink(,wt\.surf)?\)/);
  assert.match(read("js/garage/livery-design-editor.js"), /section\("WHEELS & BRAKES"[^\n]*"sidewallInk"/);
  assert.match(read("js/garage/setup-sheet.js"), /colorRow\("SIDEWALL INK", "sidewallInk", true\)/);
});
