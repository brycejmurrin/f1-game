// COCKPIT CHOICES (owner, 2026-09-29: "a bunch of different options like options
// for wheel, options for interior design, halo size" — all inside the same F1
// car). SETTINGS › DISPLAY › COCKPIT: WHEEL (F1 2026 / 2000s / CLASSIC / NONE),
// SEAT (STANDARD / LOW / HIGH / FORWARD), HALO (OFF / SLIM / STANDARD / THICK),
// INTERIOR (CARBON / TEAM / CLASSIC). Runs the real js/camera/cockpit-opts.js,
// js/camera/vantage.js and js/car/car-mesh.js in node vms; the draw path and the
// HUD gate are source pins. No browser (~0.2 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadOpts(disk, search = "", withCams = false) {
  const store = new Map(Object.entries(disk || {}));
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, console,
    GameStore: { store: { raw: (k) => (store.has(k) ? store.get(k) : null), rawSet: (k, v) => { store.set(k, v); return true; } } },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    location: { search },
    Tracks: {}, CamTune: { get: () => 0, cornerLead: () => 0, apply: (_, __, ___, fov) => fov },
  });
  vm.runInContext(read("js/camera/cockpit-opts.js") + "\n;this.CockpitOpts = CockpitOpts;", ctx);
  if (withCams) {
    vm.runInContext(read("js/core/mat4.js"), ctx);
    vm.runInContext(read("js/camera/vantage.js") + "\n;this.GameCams = GameCams;", ctx);
  }
  return { opts: ctx.CockpitOpts, cams: ctx.GameCams, store };
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

test("each choice defaults to what shipped, persists, falls back, and takes a URL override", () => {
  const { opts, store } = loadOpts({});
  assert.deepEqual([...opts.CHOICES.wheel.values], ["f1", "retro", "round", "none"]);
  assert.deepEqual([...opts.CHOICES.seat.values], ["std", "low", "high", "fwd"]);
  assert.deepEqual([...opts.CHOICES.interior.values], ["carbon", "team", "classic"]);
  assert.deepEqual([opts.wheel(), opts.seat(), opts.interior(), opts.haloSize()], ["f1", "std", "carbon", 2], "an untouched install is the cockpit that shipped");
  opts.setWheel("retro"); opts.setSeat("high"); opts.setInterior("team");
  assert.deepEqual([store.get("apex26.cockpitWheel"), store.get("apex26.cockpitSeat"), store.get("apex26.cockpitInterior")], ["retro", "high", "team"], "written raw");
  assert.equal(loadOpts({ "apex26.cockpitSeat": "low" }).opts.seat(), "low", "a stored choice survives a reload");
  assert.equal(loadOpts({ "apex26.cockpitWheel": "gt" }).opts.wheel(), "f1", "the retired GT wheel falls back to F1 2026");
  assert.equal(opts.setInterior("banana"), "carbon");
  const url = loadOpts({ "apex26.cockpitWheel": "retro" }, "?ckwheel=none&ckseat=fwd&ckint=classic").opts;
  assert.deepEqual([url.wheel(), url.seat(), url.interior()], ["none", "fwd", "classic"], "URL overrides for shots");
});

test("HALO has four sizes and still reads the old ON/OFF switch", () => {
  assert.deepEqual([...loadOpts({}).opts.HALO_VALUES], ["0", "slim", "1", "thick"]);
  const sizes = ["0", "slim", "1", "thick"].map((v) => loadOpts({ "apex26.cockpitHalo": v }).opts.haloSize());
  assert.deepEqual(sizes, [0, 1, 2, 3]);
  assert.equal(loadOpts({ "apex26.cockpitHalo": "0" }).opts.halo(), false, "a stored OFF stays off");
  assert.equal(loadOpts({ "apex26.cockpitHalo": "1" }).opts.halo(), true, "a stored ON is STANDARD");
  assert.equal(loadOpts({}, "?halo=off").opts.haloSize(), 0);
  assert.equal(loadOpts({}, "?halo=thick").opts.haloSize(), 3);
  const { opts, store } = loadOpts({});
  opts.setHalo(false); assert.equal(store.get("apex26.cockpitHalo"), "0", "the boolean form still works");
  opts.setHalo("slim"); assert.equal(opts.haloSize(), 1);
});

test("a seat moves the eye and the wheel together; every wheel stays clear of the near plane", () => {
  const { opts } = loadOpts({});
  const std = opts.layout("f1", "std");
  assert.deepEqual([std.eyeF, std.eyeU, std.wheelY, std.wheelZ, std.wheelS], [-0.20, 0.82, 0.63, 0.26, 0.80], "STANDARD + F1 2026 is the cockpit that shipped");
  for (const w of opts.CHOICES.wheel.values) {
    const base = opts.layout(w, "std");
    for (const s of opts.CHOICES.seat.values) {
      const L = opts.layout(w, s);
      assert.ok(Math.abs((L.wheelZ - L.eyeF) - (base.wheelZ - base.eyeF)) < 1e-9 && Math.abs((L.wheelY - L.eyeU) - (base.wheelY - base.eyeU)) < 1e-9,
        `${w}/${s}: the wheel moved with the seat`);
      assert.ok(L.wheelZ - L.eyeF >= 0.40, `${w}/${s}: the hub is ${(L.wheelZ - L.eyeF).toFixed(2)} m ahead of the eye (near plane 0.30)`);
    }
  }
  assert.ok(opts.layout("f1", "low").eyeU < std.eyeU && opts.layout("f1", "high").eyeU > std.eyeU && opts.layout("f1", "fwd").eyeF > std.eyeF, "LOW is lower, HIGH higher, FORWARD further forward");
  assert.equal(opts.layout("f1", "high"), opts.layout("f1", "high"), "cached: the per-frame read allocates nothing");
});

test("the camera eye is the chosen seat; VISOR keeps its own", () => {
  const { opts, cams } = loadOpts({}, "", true);
  assert.deepEqual([cams.seatFwd("cockpit"), cams.seatUp("cockpit")], [cams.COCKPIT_EYE_FWD, cams.COCKPIT_EYE_UP], "STANDARD is vantage.js's cockpit eye");
  opts.setSeat("high");
  assert.ok(Math.abs(cams.seatUp("cockpit") - opts.layout().eyeU) < 1e-12 && cams.seatUp("cockpit") > cams.COCKPIT_EYE_UP);
  opts.setSeat("fwd");
  assert.ok(Math.abs(cams.seatFwd("cockpit") - opts.layout().eyeF) < 1e-12);
  assert.deepEqual([cams.seatFwd("visor"), cams.seatUp("visor")], [cams.VISOR_EYE_FWD, cams.VISOR_EYE_UP], "the phone's VISOR ignores SEAT");
});

test("only the F1 2026 wheel carries the readouts, and a change reaches listeners", () => {
  const { opts } = loadOpts({});
  assert.deepEqual([...opts.CHOICES.wheel.values].map((w) => opts.wheelHasScreen(w)), [true, false, false, false]);
  const seen = [];
  opts.onWheel((name, v) => seen.push(name + ":" + v));
  opts.setWheel("round"); opts.setSeat("low");
  assert.equal(opts.wheelHasScreen(), false, "no argument = the chosen wheel");
  assert.deepEqual(seen, ["wheel:round", "seat:low"]);
});

test("the wheels: F1 2026 is the shipped mesh, the others are their own shapes around the same hands", () => {
  const { CarMesh } = loadMesh();
  const f1 = CarMesh.getCockpitWheel(LIV, "f1").d;
  assert.equal(f1.pos.length / 3, 1032, "the wheel shipped before the choice existed, unchanged");
  assert.equal(CarMesh.getCockpitWheel(LIV).d.pos.length / 3, 1032, "no style = F1 2026");
  const lcd = [-0.056, -0.01, -0.031];
  assert.ok(hasVertex(f1, ...lcd), "F1 2026 carries the display the telemetry is drawn on");
  for (const st of ["retro", "round"]) {
    const d = CarMesh.getCockpitWheel(LIV, st).d, { mn, mx } = bounds(d);
    assert.ok(!hasVertex(d, ...lcd), `${st} has no big screen`);
    assert.ok(mx[0] <= 0.224 && mn[0] >= -0.224 && mx[1] <= 0.19 && mn[1] >= -0.19, `${st} fits the F1 wheel's footprint`);
    assert.ok(mn[2] >= -0.072, `${st}: nothing nearer the driver than the F1 wheel's wrists (${mn[2]})`);
    assert.ok(hasVertex(d, 0.192 - 0.026, -0.0725, -0.036), `${st}: hands at 9-and-3, where the F1 wheel's are`);
  }
  assert.deepEqual([...CarMesh.COCKPIT_WHEELS], ["f1", "retro", "round"], "NONE is getCockpitDash, not a wheel");
});

test("the interiors build inside the tub, keyed by livery, and only CLASSIC has glass", () => {
  const { CarMesh, freed } = loadMesh();
  for (const kind of ["team", "classic"]) {
    const d = CarMesh.getCockpitCabin(kind, LIV).d, { mn, mx } = bounds(d);
    assert.ok(d.pos.length > 0 && d.idx.length % 3 === 0, `${kind} builds`);
    assert.ok(mn[0] >= -0.33 && mx[0] <= 0.33, `${kind} stays between the tub walls (±0.315): ${mn[0].toFixed(3)}..${mx[0].toFixed(3)}`);
    // Nothing may crowd the eye: CLASSIC's scuttle starts ahead of it (run back
    // past it, the rails filled the lower corners); TEAM's pads run alongside the
    // driver but stay under the LOW seat's eye (0.76).
    if (kind === "classic") assert.ok(mn[2] >= -0.20, `classic starts at or ahead of the STANDARD eye (z -0.20): ${mn[2].toFixed(3)}`);
    else assert.ok(mx[1] < 0.76, `team stays under the LOW seat's eye: top ${mx[1].toFixed(3)}`);
  }
  const a = CarMesh.getCockpitCabin("team", LIV);
  assert.equal(CarMesh.getCockpitCabin("team", LIV), a, "cached");
  CarMesh.getCockpitCabin("team", { ...LIV, c1: [0.1, 0.1, 0.8] });
  assert.ok(freed.includes(a), "a livery change frees and rebuilds");
  const glass = CarMesh.getCockpitGlass("classic").d;
  assert.equal(glass.pos.length / 3, 12, "three aeroscreen panels");
  const { mx } = bounds(glass);
  assert.ok(mx[1] < 0.90, "the screen's top stays under the HIGH seat's eye line");
});

test("the rig draws the chosen wheel, seat and interior; a screenless wheel gives the HUD back", () => {
  const draw = read("js/car/car-draw.js");
  const rig = draw.slice(draw.indexOf("function drawCockpitRig("), draw.indexOf("function playerBodyMesh("));
  assert.match(rig, /const wheelStyle = noWheel \? "none" : CockpitOpts\.wheel\(\), lay = CockpitOpts\.layout\(wheelStyle, noWheel \? "std" : null\);/);
  assert.match(rig, /_rigT\[0\] = _rigT\[5\] = _rigT\[10\] = lay\.wheelS; _rigT\[13\] = lay\.wheelY; _rigT\[14\] = lay\.wheelZ;/, "the wheel mount follows the seat");
  assert.match(rig, /if \(cab !== "carbon"\) \{/, "INTERIOR draws its trim");
  const none = rig.indexOf('if (wheelStyle === "none") {'), wheel = rig.indexOf("getCockpitWheel(deps.resolveLivery(c.team), wheelStyle)");
  const gate = rig.indexOf("if (!CockpitOpts.wheelHasScreen(wheelStyle)) return;"), gear = rig.indexOf("getGearDigit(");
  assert.ok(none > 0 && none < wheel, "NONE (and VISOR) return with the column and bulkhead before any wheel");
  assert.ok(wheel < gate && gate < gear, "no screen, no gear/LED/speed/ERS/OT draws");
  assert.match(draw, /":H" \+ haloSz \+ ":"/, "the cockpit body is cached per halo size");
  assert.match(read("js/car/car3d.js"), /opts\.halo === true \? 1 : \[0, 0\.64, 1, 1\.44\]/, "car3d sizes the first-person hoop");
  const ms = read("js/camera/mode-switch.js");
  assert.match(ms, /"cockpit-cam", CAM_MODES\[G\.camMode\]\.id === "cockpit"\s*&& \(typeof CockpitOpts === "undefined" \|\| CockpitOpts\.wheelHasScreen\(\)\)\);/,
    "body.cockpit-cam (which hides the HUD gear/speed) needs a wheel with a screen");
  assert.match(ms, /CockpitOpts\.onWheel\(refreshCamBtn\);/, "a mid-race change re-evaluates it");
  const exp = read("js/ui/settings-export.js");
  for (const [k, def, one] of [["cockpitWheel", "f1", '"f1", "retro", "round", "none"'], ["cockpitSeat", "std", '"std", "low", "high", "fwd"'],
    ["cockpitInterior", "carbon", '"carbon", "team", "classic"']])
    assert.ok(exp.includes(`k: "${k}", lane: "raw", group: "camera", def: "${def}"`) && exp.includes(`oneOf: [${one}]`), `${k} is exported and imported`);
  assert.ok(exp.includes('oneOf: ["0", "slim", "1", "thick"]'), "cockpitHalo accepts the four sizes");
});
