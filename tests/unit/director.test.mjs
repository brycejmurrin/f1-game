/* director.test.mjs — live TV director (js/camera/director.js).
 *
 * Pure cut policy (dwell, battles, shot rotation, wantOn solo/net gates) and a
 * VM create() that writes G.dbgCam from camVantage without touching car forces.
 * Run: node --test tests/unit/director.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  // Broadcast first: Director reuses its battles/shotFor when present.
  vm.runInContext(src("js/race/broadcast.js"), ctx, { filename: "broadcast.js" });
  vm.runInContext(src("js/camera/director.js"), ctx, { filename: "director.js" });
  return vm.runInContext("Director", ctx);
}

test("decideCut holds under SHOT_MIN_S and cuts by SHOT_MAX_S onto a battle", () => {
  const D = boot();
  const a = { code: "AAA" }, b = { code: "BBB" }, c = { code: "CCC" };
  // prog desc: a ahead of b by ~10 m at 50 m/s → 0.2 s gap (a battle)
  const running = [
    { key: a, prog: 1000, speed: 50 },
    { key: b, prog: 990, speed: 50 },
    { key: c, prog: 800, speed: 50 },
  ];
  assert.equal(D.decideCut({ wall: 1, lastCut: 0, subject: a, onAirShot: "side", cuts: 0, running }), null,
    "no cut before SHOT_MIN_S even when a battle exists");
  const mid = D.decideCut({ wall: D.SHOT_MIN_S + 0.1, lastCut: 0, subject: a, onAirShot: "side", cuts: 0, running });
  assert.ok(mid, "after SHOT_MIN_S a battle may cut");
  assert.equal(mid.subject, b, "the chaser in the tightest battle is the subject");
  assert.equal(mid.kind, "pass");
  assert.ok(D.SHOTS.includes(mid.shot));
  assert.notEqual(mid.shot, "side", "shotFor never repeats the shot on air");

  // Quiet field: same subject, under SHOT_MAX — hold
  const quiet = [{ key: a, prog: 1000, speed: 50 }, { key: c, prog: 500, speed: 50 }];
  assert.equal(
    D.decideCut({ wall: D.SHOT_MIN_S + 1, lastCut: 0, subject: a, onAirShot: "heli", cuts: 1, running: quiet }),
    null,
    "no battle and under SHOT_MAX_S keeps the current subject");
  const forced = D.decideCut({
    wall: D.SHOT_MAX_S + 0.1, lastCut: 0, subject: a, onAirShot: "heli", cuts: 2, running: quiet,
  });
  assert.ok(forced, "SHOT_MAX_S forces a cut on a quiet field");
  assert.ok(forced.subject === a || forced.subject === c);
});

test("wantOn is solo-only and requires tv mode or finished/retired auto-spectate", () => {
  const D = boot();
  assert.equal(D.wantOn({ net: true, modeId: "tv", autoSpectate: true, finished: true }), false);
  assert.equal(D.wantOn({ net: false, modeId: "tv", autoSpectate: false, finished: false }), true);
  assert.equal(D.wantOn({ net: false, modeId: "chase", autoSpectate: true, finished: true }), true);
  assert.equal(D.wantOn({ net: false, modeId: "chase", autoSpectate: true, finished: false, retired: false }), false);
  assert.equal(D.wantOn({ net: false, modeId: "chase", autoSpectate: false, finished: true }), false);
});

test("create().tick writes dbgCam from camVantage and never mutates car speed", () => {
  const D = boot();
  const car = { code: "VER", s: 100, x: 0, speed: 60, prog: 1000, px: 1, pz: 2, head: 0.1, retired: false, finished: false };
  const field = [
    car,
    { code: "HAM", s: 90, x: 0, speed: 58, prog: 990, px: 0, pz: 0, head: 0, retired: false, finished: false },
  ];
  let vantageCalls = 0;
  const G = {
    state: "race",
    camMode: 0,
    cars: field,
    player: car,
    track: { total: 5000 },
    dbgCam: null,
    netPlay: { active: () => false },
    setCamMode(i) { G.camMode = i; },
    camVantage(mode, s, x, spd) {
      vantageCalls++;
      return { eye: [s, 5, x], tgt: [s + 10, 2, x], fov: 50 };
    },
  };
  // Pretend CAM_MODES so modeId() resolves — inject via a fake CamModes global.
  // Re-boot with CamModes present.
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "tv", label: "TV", cut: 0.5 }] },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/race/broadcast.js"), ctx, { filename: "broadcast.js" });
  vm.runInContext(src("js/camera/director.js"), ctx, { filename: "director.js" });
  const Dir = vm.runInContext("Director", ctx);
  G.camMode = 1;   // tv
  const api = Dir.create(G);
  const speed0 = car.speed;
  api.tick(D.SHOT_MIN_S + 1);
  assert.ok(G.dbgCam, "director owns dbgCam while TV is on");
  assert.ok(G.dbgCam.eye && G.dbgCam.target);
  assert.ok(vantageCalls >= 1, "shots go through camVantage (broadcast-only curvature)");
  assert.equal(car.speed, speed0, "director never writes car forces");
  const st = api.status();
  assert.equal(st.on, true);
  assert.ok(Dir.SHOTS.includes(st.shot));
  // Leave TV → clears dbgCam
  G.camMode = 0;
  api.tick(0.1);
  assert.equal(G.dbgCam, null);
});

test("CAM_MODES keeps tv at its shipped index — save-format index contract", () => {
  const text = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const ids = [...text.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.includes("tv"), "tv mode must be in CAM_MODES");
  // apex26.camMode stores the index: tv shipped at 18, later modes (HELMET) append after it.
  assert.equal(ids.indexOf("tv"), 18, "tv keeps index 18 — never reorder earlier ids");
  assert.ok(ids.indexOf("visor") < ids.indexOf("tv"), "visor stays before tv");
});
