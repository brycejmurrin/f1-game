// COCKPIT INTERIORS (owner, 2026-09-29: "a few different cockpit models that
// we can choose between"): SETTINGS › DISPLAY › COCKPIT › WHEEL picks the
// steering wheel the COCKPIT view draws — F1 2026 (the shipped wheel), GT
// (flat-bottomed rim, same screen), CLASSIC (round three-spoke rim, no screen)
// or NONE (the bare column and bulkhead VISOR shows). Runs the real
// js/camera/cockpit-opts.js and js/car/car-mesh.js in node vms; the draw path
// and the HUD gate are source pins. No browser (~0.1 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadOpts(disk, search = "") {
  const store = new Map(Object.entries(disk || {}));
  const ctx = {
    GameStore: { store: { raw: (k) => (store.has(k) ? store.get(k) : null), rawSet: (k, v) => { store.set(k, v); return true; } } },
    Log: { info() {} },
    location: { search },
  };
  vm.runInNewContext(read("js/camera/cockpit-opts.js") + "\nthis.exported = CockpitOpts;", ctx);
  return { opts: ctx.exported, store };
}

function loadMesh() {
  const made = [], freed = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} } };
  vm.createContext(ctx);
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx, { filename: "car-mesh.js" });
  ctx.CarMesh.init({
    createMesh(d) { const m = { d }; made.push(m); return m; },
    freeMesh(m) { freed.push(m); },
  });
  return { CarMesh: ctx.CarMesh, made, freed };
}
const LIV = { c1: [0.8, 0.1, 0.1], c2: [0.9, 0.9, 0.9], accent: [1, 0.8, 0] };

function bounds(d) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < d.pos.length; i++) { mn[i % 3] = Math.min(mn[i % 3], d.pos[i]); mx[i % 3] = Math.max(mx[i % 3], d.pos[i]); }
  return { mn, mx };
}
// Is there a vertex at (x, y, z) within eps? The LCD's driver-side face is at z -0.031.
const hasVertex = (d, x, y, z, eps = 1e-6) => {
  for (let i = 0; i < d.pos.length; i += 3)
    if (Math.abs(d.pos[i] - x) < eps && Math.abs(d.pos[i + 1] - y) < eps && Math.abs(d.pos[i + 2] - z) < eps) return true;
  return false;
};

test("WHEEL defaults to the shipped F1 wheel, persists, and a bad value falls back", () => {
  const a = loadOpts({});
  assert.deepEqual([...a.opts.WHEELS], ["f1", "gt", "round", "none"]);
  assert.equal(a.opts.wheel(), "f1", "an untouched install keeps the wheel it always had");
  assert.equal(a.opts.setWheel("round"), "round");
  assert.equal(a.store.get("apex26.cockpitWheel"), "round", "written raw, like HALO");
  assert.equal(loadOpts({ "apex26.cockpitWheel": "gt" }).opts.wheel(), "gt", "a stored choice survives a reload");
  assert.equal(loadOpts({ "apex26.cockpitWheel": "banana" }).opts.wheel(), "f1");
  assert.equal(a.opts.setWheel("banana"), "f1");
  assert.equal(loadOpts({ "apex26.cockpitWheel": "gt" }, "?ckwheel=none").opts.wheel(), "none", "?ckwheel= overrides for shots");
});

test("only the wheels with a screen carry the readouts, and a change reaches listeners", () => {
  const { opts } = loadOpts({});
  assert.deepEqual(["f1", "gt", "round", "none"].map((w) => opts.wheelHasScreen(w)), [true, true, false, false]);
  const seen = [];
  opts.onWheel((w) => seen.push(w));
  opts.setWheel("round");
  assert.equal(opts.wheelHasScreen(), false, "no argument = the chosen wheel");
  opts.setWheel("gt");
  assert.deepEqual(seen, ["round", "gt"]);
});

test("the F1 wheel is the shipped one; GT keeps its screen; CLASSIC has none", () => {
  const { CarMesh } = loadMesh();
  const f1 = CarMesh.getCockpitWheel(LIV, "f1").d;
  assert.equal(f1.pos.length / 3, 1032, "43 boxes: the wheel shipped before the choice existed, unchanged");
  assert.equal(CarMesh.getCockpitWheel(LIV).d.pos.length / 3, 1032, "no style = F1 (the pre-choice call shape)");
  const gt = CarMesh.getCockpitWheel(LIV, "gt").d, round = CarMesh.getCockpitWheel(LIV, "round").d;
  // The LCD's driver-side corner (car-draw.js lays the digits on it): present on
  // the two screen wheels, absent on the classic.
  const lcd = [-0.056, -0.01, -0.031];
  assert.ok(hasVertex(f1, ...lcd) && hasVertex(gt, ...lcd), "F1 and GT carry the display block the telemetry is placed on");
  assert.ok(!hasVertex(round, ...lcd), "CLASSIC has no screen");
  for (const [name, d] of [["gt", gt], ["round", round]]) {
    const { mn, mx } = bounds(d);
    // Both rims hold at the F1 wheel's grip line and stay the F1 wheel's size
    // give or take: same hands, same eye, nothing new in the driver's face.
    assert.ok(mx[0] <= 0.224 && mn[0] >= -0.224, `${name} no wider than the F1 wheel and its gloves: ${mn[0]}..${mx[0]}`);
    assert.ok(mx[1] <= 0.19 && mn[1] >= -0.19, `${name} rim radius ~0.165: ${mn[1]}..${mx[1]}`);
    assert.ok(mn[2] >= -0.072, `${name} nothing nearer the driver than the F1 wheel's wrists: ${mn[2]}`);
    assert.ok(hasVertex(d, 0.192 - 0.026, -0.0725, -0.036), `${name} hands at 9-and-3, where the F1 wheel's are`);
  }
});

test("the wheel mesh is keyed by style and livery, and a change frees the old one", () => {
  const { CarMesh, made, freed } = loadMesh();
  const a = CarMesh.getCockpitWheel(LIV, "f1");
  assert.equal(CarMesh.getCockpitWheel(LIV, "f1"), a, "cached");
  const b = CarMesh.getCockpitWheel(LIV, "round");
  assert.notEqual(b, a);
  assert.deepEqual(freed, [a], "switching wheels frees the one it replaces");
  assert.equal(CarMesh.getCockpitWheel(LIV, "round"), b);
  CarMesh.getCockpitWheel({ ...LIV, c1: [0.1, 0.1, 0.8] }, "round");
  assert.equal(freed.length, 2, "a livery edit still rebuilds");
  assert.equal(made.length, 3);
  assert.deepEqual([...CarMesh.COCKPIT_WHEELS], ["f1", "gt", "round"], "NONE is getCockpitDash, not a wheel");
});

test("the rig draws the chosen wheel, and a screenless one draws no readouts and gives the HUD back", () => {
  const draw = read("js/car/car-draw.js");
  const rig = draw.slice(draw.indexOf("function drawCockpitRig("), draw.indexOf("function playerBodyMesh("));
  assert.match(rig, /const wheelStyle = noWheel \? "none" : CockpitOpts\.wheel\(\);/);
  const none = rig.indexOf('if (wheelStyle === "none") {'), wheel = rig.indexOf("getCockpitWheel(deps.resolveLivery(c.team), wheelStyle)");
  const gate = rig.indexOf("if (!CockpitOpts.wheelHasScreen(wheelStyle)) return;"), gear = rig.indexOf("getGearDigit(");
  assert.ok(none > 0 && none < wheel, "NONE (and VISOR) return with the column and bulkhead before any wheel");
  assert.ok(wheel < gate && gate < gear, "no screen, no gear/LED/speed/ERS/OT draws");
  const ms = read("js/camera/mode-switch.js");
  assert.match(ms, /"cockpit-cam", CAM_MODES\[G\.camMode\]\.id === "cockpit"\s*&& \(typeof CockpitOpts === "undefined" \|\| CockpitOpts\.wheelHasScreen\(\)\)\);/,
    "body.cockpit-cam (which hides the HUD gear/speed) needs a wheel with a screen");
  assert.match(ms, /CockpitOpts\.onWheel\(refreshCamBtn\);/, "a mid-race wheel change re-evaluates it");
  const exp = read("js/ui/settings-export.js");
  assert.match(exp, /k: "cockpitWheel", lane: "raw", group: "camera", def: "f1",[^\n]*oneOf: \["f1", "gt", "round", "none"\]/, "exported and imported with the other camera settings");
});
