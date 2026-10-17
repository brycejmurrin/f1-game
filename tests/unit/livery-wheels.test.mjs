// livery-wheels — livery rimTint / caliperTint (GARAGE FINISHES/PARTS slice S2): paint-only overrides of
// the BRAKES catalog rim and caliper colours on all four wheels. Unset must be byte-identical to today
// (same pos/nrm/mat/idx AND colour arrays); set must change colour arrays only. Real js/car sources
// in a node vm, no browser.
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
const tyre = visual.tyres, brake = visual.brakes, wheel = visual.wheels;

const MAG = [1, 0, 1], CYAN = [0, 1, 1];
const plain = (m) => JSON.stringify({ pos: m.pos, nrm: m.nrm, mat: m.mat, idx: m.idx });
const colDiff = (a, b) => {
  const out = new Set();
  assert.equal(a.col.length, b.col.length);
  for (let i = 0; i < a.col.length; i += 3)
    if (a.col[i] !== b.col[i] || a.col[i + 1] !== b.col[i + 1] || a.col[i + 2] !== b.col[i + 2]) out.add(i / 3);
  return out;
};
const wheelsOf = (liv) => {
  const t = CarWheels.tints(liv);
  const band = (tyre && tyre.band) || Car3D.TYRE_BAND[parts.tyres || 1];
  const cal = t.cal || (brake ? brake.cal : Car3D.BRAKE_CALIPER[parts.brakes || 1]);
  const rim = t.rim || (brake && brake.rim);
  return Car3D.buildWheelLayers(0.32, band, cal, rim, false, tyre, brake, wheel);
};
const buildCar = (livery) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: team.id, parts, livery, noDriver: true });

test("tints(): unset is the shared empty record with an empty cache key", () => {
  for (const liv of [undefined, null, {}, { rimTint: null, caliperTint: "" }, { rimTint: "nope" }]) {
    const t = CarWheels.tints(liv);
    assert.equal(t.rim, null); assert.equal(t.cal, null); assert.equal(t.key, "");
  }
  assert.equal(CarWheels.tints({}), CarWheels.tints({ stripe: [1, 0, 0] }), "one shared NO_TINTS record");
});

test("tints(): arrays and #rrggbb parse, and the key tracks the colours", () => {
  const a = CarWheels.tints({ rimTint: "#ff00ff", caliperTint: [0, 1, 1] });
  assert.equal(JSON.stringify(a.rim), JSON.stringify(MAG)); assert.equal(JSON.stringify(a.cal), JSON.stringify(CYAN));
  const b = CarWheels.tints({ rimTint: [1, 0, 1], caliperTint: [0, 1, 1] });
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, "");
  assert.notEqual(CarWheels.tints({ rimTint: MAG }).key, CarWheels.tints({ caliperTint: MAG }).key);
});

test("unset tint: standalone wheels are byte-identical to today's call", () => {
  const today = Car3D.buildWheelLayers(0.32, (tyre && tyre.band) || Car3D.TYRE_BAND[parts.tyres || 1],
    brake ? brake.cal : Car3D.BRAKE_CALIPER[parts.brakes || 1], brake && brake.rim, false, tyre, brake, wheel);
  const viaTints = wheelsOf({});
  for (const k of ["rotating", "fixed"]) assert.equal(JSON.stringify(today[k]), JSON.stringify(viaTints[k]));
});

test("set tint: wheel colour arrays change, geometry and surface ids do not; rim and caliper hit disjoint vertices", () => {
  const base = wheelsOf({});
  const rim = wheelsOf({ rimTint: MAG }), cal = wheelsOf({ caliperTint: CYAN });
  for (const [name, w] of [["rim", rim], ["cal", cal]]) {
    for (const k of ["rotating", "fixed"]) assert.equal(plain(base[k]), plain(w[k]), `${name}/${k}: geometry or surface ids moved`);
  }
  const rimSet = colDiff(base.rotating, rim.rotating), calSet = new Set([...colDiff(base.rotating, cal.rotating), ...colDiff(base.fixed, cal.fixed)]);
  assert.ok(rimSet.size > 0, "rimTint changed nothing");
  assert.ok(colDiff(base.fixed, rim.fixed).size === 0, "rimTint touched the fixed layer");
  for (const i of rimSet) assert.ok(!colDiff(base.rotating, cal.rotating).has(i), "rim vertex also moved by caliper");
  assert.ok(calSet.size > 0 || !(brake && brake.cal), "caliperTint changed nothing");
});

test("Car3D.build: no tint = byte-identical car; tint changes only wheel-vertex colours", () => {
  const none = buildCar(undefined), empty = buildCar({}), unsetFields = buildCar({ rimTint: null, caliperTint: null });
  assert.equal(JSON.stringify(none), JSON.stringify(empty));
  assert.equal(JSON.stringify(none), JSON.stringify(unsetFields));
  const tinted = buildCar({ rimTint: MAG, caliperTint: CYAN });
  assert.equal(plain(none), plain(tinted));
  const diff = colDiff(none, tinted);
  const A = Car3D.AXLES, centres = [[0.79, A.frontZ], [0.76, A.rearZ]].flatMap(([x, z]) => [[x, z], [-x, z]]);
  const nearWheel = (i) => centres.some(([x, z]) => Math.hypot(none.pos[i * 3] - x, none.pos[i * 3 + 1] - A.wheelY, none.pos[i * 3 + 2] - z) < 0.45);
  assert.ok(diff.size > 0, "tint changed nothing on the full car");
  for (const i of diff) assert.ok(nearWheel(i), `vertex ${i} is not on a wheel`);
  // all four wheels: the tint lands in four x/z corners
  const corners = new Set();
  for (const i of diff) corners.add((none.pos[i * 3] > 0 ? "R" : "L") + (none.pos[i * 3 + 2] > 0 ? "F" : "B"));
  assert.equal(corners.size, 4, `tint reached ${[...corners]}`);
});

test("wheel mesh caches key on the tints (source pins)", () => {
  const draw = read("js/car/car-draw.js");
  assert.match(draw, /playerWheelId \+ wt\.key/, "player wheel key lacks the tint key");
  assert.match(draw, /wt\.key \? base \+ wt\.key : base/, "field wheel key lacks the tint key");
  assert.match(draw, /wt\.cal \|\| \(playerBrakeVisual/);
  assert.match(draw, /wt\.rim \|\| \(brake && brake\.rim\)/);
  assert.match(read("js/camera/cockpit-preview.js"), /CarWheels\.tints\(s\.livery\)/);
});

test("editor: WHEELS & BRAKES section carries rimTint and caliperTint rows", () => {
  assert.match(read("js/garage/livery-design-editor.js"), /section\("WHEELS & BRAKES"[^\n]*"rimTint", "caliperTint"/);
  assert.match(read("js/garage/setup-sheet.js"), /colorRow\("RIM", "rimTint", true\)[^\n]*colorRow\("CALIPER", "caliperTint", true\)/);
});
