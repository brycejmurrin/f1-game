// livery-wheel-paths (#4907) — every WHEELS & BRAKES control of the livery editor reaches every car that shows
// wheels. Bryce: "some wheel and tyre changes don't show on the garage car or in the garage animations".
// The seven controls (js/garage/livery-design-editor.js section "WHEELS & BRAKES"): wheelsShape, brakesShape,
// tyresShape, rimTint, caliperTint, sidewallInk, rimFinish. The paths:
//   garage — CarWheels.createGarage: the showroom turntable AND the arrival / pit / drive-out moments
//            (setup-camera.js getSetupPreviewMesh → departureWheels.prepare; GarageDepartureWheels.create is it);
//   race   — CarDraw getPlayerWheelMeshes / buildPendingFieldWheels and the cockpit preview: CarWheels.spec over
//            the appearance tiers (setPlayerParts / teamDecalState apply Car3D.appearanceParts);
//   body   — Car3D.build's own wheels (no split): the reference the split paths must match.
// Before the fix the garage wheels took the FITTED parts (the three *Shape fields never showed there) and every
// split path dropped the WHEELS option's rim colour. Real js/car sources in a node vm, no browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String, Boolean, isFinite, isNaN, WeakMap, Map, Set };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/liveries.js", "js/car/helmets.js", "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-shade.js", "js/car/car-body-geom.js", "js/car/car3d.js"])
  vm.runInContext(read(f), ctx, { filename: absSrc(f) });
const { Car3D, CarWheels, Parts, Teams } = vm.runInContext("({ Car3D, CarWheels, Parts, Teams })", ctx);
const team = Teams.LIST ? Teams.LIST[0] : Teams[0];
const fitted = Parts.getVisualTiers(Parts.getFactorySetup(team), team);

// One value per control that must change what the wheels look like.
const FIELDS = {
  wheelsShape: "style_wheels_starburst",
  brakesShape: "style_brakes_open",
  tyresShape: "style_tyres_whitewall",
  rimTint: "#ff00ff",
  caliperTint: "#00ffff",
  sidewallInk: "#00ff00",
  rimFinish: "chrome",
};
const sig = (m) => JSON.stringify({ pos: Array.from(m.pos), col: Array.from(m.col), mat: Array.from(m.mat), idx: Array.from(m.idx) });

// The garage path, driven exactly as setup-camera.js drives it: same `next` key on every call (a livery edit does
// not change previewKey()'s string; it busts), the raw FITTED tiers, the resolved livery.
function garageBuild(liv, wheels = CarWheels.createGarage(fakeGfx())) {
  wheels.prepare("team:parts|L:custom:1|wheels", liv, fitted);
  return wheels;
}
function fakeGfx() {
  const made = [];
  return { made, createMesh(d) { made.push(d); return d; }, freeMesh() {} };
}
const garageSig = (liv) => { const g = fakeGfx(); garageBuild(liv, CarWheels.createGarage(g)); return g.made.map(sig).join("#"); };
// The race path: CarDraw applies the livery's part styles, then builds through CarWheels.spec.
const raceSpec = (liv) => CarWheels.spec(Car3D.appearanceParts(fitted, liv), liv);
const raceSig = (liv) => {
  const s = raceSpec(liv);
  const f = Car3D.buildWheelLayers(0.32, s.band, s.cal, s.rim, false, s.tyre, s.brake, s.wheel, s.ink, s.surf);
  const r = Car3D.buildWheelLayers(0.38, s.band, s.cal, s.rim, false, s.tyre, s.brake, s.wheel, s.ink, s.surf);
  return [f.rotating, f.fixed, r.rotating, r.fixed].map(sig).join("#");
};

for (const [field, value] of Object.entries(FIELDS)) {
  const liv = { [field]: value };
  test(`${field}: the garage showroom / arrival wheels change`, () => {
    assert.notEqual(garageSig(liv), garageSig({}), `${field}=${value} left the garage wheels as they were`);
  });
  test(`${field}: the garage wheels match the race wheels`, () => {
    assert.equal(garageSig(liv), raceSig(liv), `${field}: garage and race build different wheels`);
  });
  test(`${field}: the race wheel cache key changes (player and field rebuild)`, () => {
    assert.notEqual(raceSpec(liv).key, raceSpec({}).key, `${field}: same key, so the cached wheels are reused`);
  });
  test(`${field}: an edit with an unchanged preview key still rebuilds the garage wheels`, () => {
    const g = fakeGfx(), wheels = CarWheels.createGarage(g);
    garageBuild({}, wheels); const n = g.made.length;
    garageBuild(liv, wheels);
    assert.ok(g.made.length > n, `${field}: prepare() kept the stale wheels`);
  });
}

test("the split recipe takes the body build's rim precedence: tint, then WHEELS rim, then BRAKES rim", () => {
  const T = Car3D.appearanceParts(fitted, { wheelsShape: "style_wheels_starburst", brakesShape: "style_brakes_open" });
  const wheelRim = T._visual.wheels.rim, brakeRim = T._visual.brakes.rim;
  assert.ok(wheelRim && brakeRim && JSON.stringify(wheelRim) !== JSON.stringify([0, 0, 0]));
  assert.equal(CarWheels.spec(T, {}).rim, wheelRim, "the WHEELS option's rim wins over the BRAKES option's");
  assert.deepEqual(Array.from(CarWheels.spec(T, { rimTint: "#ff00ff" }).rim), [1, 0, 1], "the livery tint wins");
  const noWheelRim = Car3D.appearanceParts(fitted, { brakesShape: "style_brakes_open" });
  if (!(noWheelRim._visual.wheels && noWheelRim._visual.wheels.rim)) assert.equal(CarWheels.spec(noWheelRim, {}).rim, brakeRim);
});

test("a brakes option with cal:null draws no caliper on every path (the body build's rule)", () => {
  const std = Parts.CATALOG.find((c) => c.id === "brakes").options.find((o) => o.visual && o.visual.cal === null);
  assert.ok(std, "a catalog brakes option with cal:null");
  const T = Object.assign({}, fitted, { _visual: Object.assign({}, fitted._visual, { brakes: Object.assign({ id: std.id }, std.visual) }) });
  assert.equal(CarWheels.spec(T, {}).cal, null);
  assert.deepEqual(Array.from(CarWheels.spec(T, { caliperTint: "#00ffff" }).cal), [0, 1, 1]);
});

test("Car3D.build's own wheels change for every field too (the reference the split paths match)", () => {
  const build = (liv) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: team.id, parts: fitted, livery: liv, noDriver: true });
  const base = sig(build({}));
  for (const [field, value] of Object.entries(FIELDS)) {
    if (field === "rimFinish") continue;   // a finish is a surface id applied by the finish pass (refinish), pinned in livery-finish-contract
    assert.notEqual(sig(build({ [field]: value })), base, `${field}: the body build ignores it`);
  }
});

test("every split-wheel builder in js/ goes through CarWheels.spec (no path keeps its own recipe)", () => {
  const sites = { "js/car/car-draw.js": 2, "js/camera/cockpit-preview.js": 1 };
  for (const [file, n] of Object.entries(sites)) {
    const src = read(file);
    assert.equal((src.match(/CarWheels\.spec\(/g) || []).length, n, `${file}: CarWheels.spec call count`);
    assert.ok(!/Car3D\.BRAKE_CALIPER\[/.test(src), `${file}: a private caliper fallback is back`);
  }
  const wheels = read("js/car/car-wheels.js");
  assert.match(wheels, /function prepare\(next, liv, tiers\) \{[\s\S]{0,400}Car3D\.appearanceParts\(/, "createGarage applies the livery's part styles");
  assert.match(read("js/garage/setup-camera.js"), /departureWheels\.prepare\(key, liv, /, "setup-camera hands prepare the resolved livery");
});
