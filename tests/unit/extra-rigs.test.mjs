import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { CAM_MODE_IDS, camModeStubs } from "../helpers/camera-modes.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const root = path.resolve(import.meta.dirname, "../..");

function loadExtraRigs() {
  const disk = new Map();
  const ctx = {
    M4: {
      clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
      lerp: (a, b, t) => a + (b - a) * t,
    },
    Tracks: {
      sample(track, s, out) {
        const L = track.total || 1000;
        let v = s % L; if (v < 0) v += L;
        out.p[0] = v; out.p[1] = 0; out.p[2] = 0;
        out.t[0] = 1; out.t[1] = 0; out.t[2] = 0;
        out.r[0] = 0; out.r[1] = 0; out.r[2] = 1;
        out.hw = 7;
      },
      curvature() { return 0; },
      pitLaneAt() { return null; },
    },
    Broadcast: undefined,
    CamTune: { cornerLead() { return null; } },
    CamModes: {
      CAM_MODES: camModeStubs(),   // the shipped ids at their shipped indices
    },
    GameStore: {
      store: {
        get(k, d) { return disk.has(k) ? disk.get(k) : d; },
        set(k, v) { disk.set(k, v); return true; },
      },
    },
    Log: { info() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/extra-rigs.js"), "utf8") +
      "\nthis.exported = ExtraRigs;",
    ctx, { filename: absSrc("js/camera/extra-rigs.js") });
  return { ExtraRigs: ctx.exported, disk, ctx };
}

test("CAM_MODES appends rival, pitwall, drone after trackside (save-format contract)", () => {
  // TRACKSIDE (#702) landed on ship first at index 14; our three append after it.
  // never reorder earlier ids — apex26.camMode is an index (tv at 18 is pinned in director.test).
  assert.deepEqual(CAM_MODE_IDS.slice(14, 18), ["trackside", "rival", "pitwall", "drone"]);
  assert.equal(CAM_MODE_IDS.length, 20);
});

test("ExtraRigs.pickRival uses Broadcast.battles when present", () => {
  const { ExtraRigs, ctx } = loadExtraRigs();
  const a = { prog: 100, speed: 50, s: 100, x: 0 };
  const b = { prog: 80, speed: 50, s: 80, x: 0 };
  const player = a;
  ctx.Broadcast = {
    battles(cars) {
      return [{ key: b, ahead: a, gapS: 0.4, score: 0.4 }];
    },
  };
  // Re-load so Broadcast is visible... pickRival reads Broadcast at call time.
  assert.equal(ExtraRigs.pickRival([a, b], player), b);
  assert.equal(ExtraRigs.pickRival([a, b], b), a);
});

test("ExtraRigs.pickRival falls back to nearest car within FALLBACK_S", () => {
  const { ExtraRigs } = loadExtraRigs();
  const player = { prog: 100, speed: 40, s: 100, x: 0 };
  const near = { prog: 60, speed: 40, s: 60, x: 0 };   // 1.0 s gap
  const far = { prog: 0, speed: 40, s: 0, x: 0 };      // 2.5 s gap — on the edge
  assert.equal(ExtraRigs.pickRival([player, near, far], player), near);
  assert.equal(ExtraRigs.pickRival([player], player), null);
});

test("ExtraRigs.pickRival: RIVAL LOCK picks the same rival at OVERALL SPEED 0.469 as at pace 1; WATCH keeps real m/s (4-F6)", () => {
  // Player P between X (22 m ahead) and Y (20 m behind), all at a 12 m/s crawl: at pace 1 neither
  // gap is a battle (≥ 1 s on the 20 m/s floor) and the fallback frames the nearer car, Y. The same
  // scene at pace 0.469 must agree: the floor is 20 × vTop()/VMAX, latched by tickPitAuto(G).
  // k scales the scene (gaps and speeds); pace is the sim's OVERALL SPEED that tickPitAuto latches.
  const rivalAt = (k, pace, broadcast, watch) => {
    const { ExtraRigs, ctx } = loadExtraRigs();
    ctx.PhysicsConsts = { VMAX: 72 };
    if (broadcast) {
      vm.runInContext(fs.readFileSync(path.join(root, "js/race/broadcast.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/race/broadcast.js") });
    }
    const car = (code, prog) => ({ code, prog: prog * k, s: prog * k, x: 0, speed: 12 * k, replayRate: watch ? 1 : undefined });
    const X = car("X", 1022), P = car("P", 1000), Y = car("Y", 980);
    ExtraRigs.tickPitAuto({ vTop: () => 72 * pace, player: P, camMode: 0 });
    return ExtraRigs.pickRival([X, P, Y], P).code;
  };
  for (const broadcast of [false, true]) {
    const tag = broadcast ? "Broadcast.battles" : "localBattles";
    assert.equal(rivalAt(1, 1, broadcast), "Y", tag + ": pace 1 frames the nearer car (no battle)");
    assert.equal(rivalAt(0.469, 0.469, broadcast), "Y", tag + ": pace 0.469 agrees with pace 1");
    // WATCH: a real 5.6 m/s crawl 10-11 m apart IS a battle on the bare 20 m/s floor (X, up the
    // order), whatever OVERALL SPEED the sim was left at — the latched scale must not reach it.
    assert.equal(rivalAt(0.469, 1, broadcast, true), "X", tag + ": WATCH at sim pace 1");
    assert.equal(rivalAt(0.469, 0.469, broadcast, true), "X", tag + ": WATCH at sim pace 0.469 ignores the latched scale");
  }
});

test("ExtraRigs.solve returns finite eye/tgt/fov for rival, pitwall, drone", () => {
  const { ExtraRigs } = loadExtraRigs();
  const track = { total: 1000, pit: { side: 1 }, def: {} };
  const eye = [0, 0, 0], tgt = [0, 0, 0];
  for (const mode of ["rival", "pitwall", "drone"]) {
    const fov = ExtraRigs.solve(mode, track, 100, 0, 50, 0, {
      bankDy: 0, reduceMotion: false, carPos: [100, 0], carHead: 0, snap: true,
    }, eye, tgt);
    assert.ok(Number.isFinite(fov) && fov > 20 && fov < 110, mode + " fov");
    assert.ok(eye.every(Number.isFinite), mode + " eye");
    assert.ok(tgt.every(Number.isFinite), mode + " tgt");
    assert.ok(Math.hypot(eye[0] - tgt[0], eye[2] - tgt[2]) > 1, mode + " has a view distance");
  }
});

// Rival mode used to allocate a fresh {s,x,p,t,r,hw} bag per frame via carSample.
// With a rival subject the solve must stay finite across many frames (pooled bag).
test("ExtraRigs.solve rival with a subject stays finite across many frames (carSample pooled)", () => {
  const { ExtraRigs } = loadExtraRigs();
  const track = { total: 1000, pit: { side: 1 }, def: {} };
  const eye = [0, 0, 0], tgt = [0, 0, 0];
  const rival = { s: 140, x: 1.5, speed: 50 };
  for (let i = 0; i < 120; i++) {
    rival.s = 140 + i * 2;
    const fov = ExtraRigs.solve("rival", track, 100 + i, 0, 50, 0, {
      bankDy: 0, rival, carPos: [100 + i, 0], carHead: 0, dt: 1 / 60,
    }, eye, tgt);
    assert.ok(Number.isFinite(fov), `fov at frame ${i}`);
    assert.ok(eye.every(Number.isFinite) && tgt.every(Number.isFinite), `pose at frame ${i}`);
  }
});

test("ExtraRigs.tickPitAuto cuts to pitwall on entry and restores on exit", () => {
  const { ExtraRigs } = loadExtraRigs();
  let mode = 0;
  const G = {
    player: { pitState: "none" },
    get camMode() { return mode; },
    set camMode(v) { mode = v; },
    setCamMode(i) { mode = i; return "x"; },
    store: { get: () => true, set() {} },
  };
  // Enter the pits from chase (index 0) → ephemeral cut to pitwall (its real CAM_MODES index).
  G.player.pitState = "lane";
  assert.equal(ExtraRigs.tickPitAuto(G), "pitwall");
  assert.equal(mode, CAM_MODE_IDS.indexOf("pitwall"), "cut lands on the real pitwall index");
  // Leave the pits → restore chase.
  G.player.pitState = "none";
  assert.equal(ExtraRigs.tickPitAuto(G), "chase");
  assert.equal(mode, 0);
});

test("ExtraRigs.tickPitAuto leaves the camera alone by default (opt-in only)", () => {
  const { ExtraRigs } = loadExtraRigs();
  let mode = 0;
  const G = {
    player: { pitState: "none" },
    get camMode() { return mode; },
    set camMode(v) { mode = v; },
    setCamMode(i) { mode = i; return "x"; },
    // A store that has never seen the key: get() hands back its default.
    store: { get: (k, d) => d, set() {} },
  };
  G.player.pitState = "lane";
  assert.equal(ExtraRigs.tickPitAuto(G), null, "no cut on pit entry unless pitCamAuto is set");
  assert.equal(mode, 0, "the player's camera stays put in the pit lane");
  G.player.pitState = "none";
  assert.equal(ExtraRigs.tickPitAuto(G), null);
  assert.equal(mode, 0);
});

test("ExtraRigs.pitCamAuto persists through GameStore", () => {
  const { ExtraRigs, disk } = loadExtraRigs();
  assert.equal(ExtraRigs.pitCamAuto(null), false, "off until the player opts in");
  assert.equal(ExtraRigs.pitCamAuto(null, false), false);
  assert.equal(disk.get("pitCamAuto"), false);
  assert.equal(ExtraRigs.pitCamAuto(null), false);
  assert.equal(ExtraRigs.pitCamAuto(null, true), true);
});

test("drone cornerLead is gated in CamTune.modes", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");
  assert.match(src, /modes:\s*\["chase",\s*"far",\s*"drone"\]/);
});

// bug-hunt 9.8: pickRival ran every rendered frame in RIVAL mode, allocating a
// row per car + an array + a sort; the rows are now pooled.
test("ExtraRigs.pickRival reuses its running-car rows and array across calls", () => {
  const { ExtraRigs, ctx } = loadExtraRigs();
  const a = { prog: 100, speed: 50, s: 100, x: 0 };
  const b = { prog: 80, speed: 50, s: 80, x: 0 };
  const seen = [];
  ctx.Broadcast = { battles(cars) { seen.push({ arr: cars, rows: cars.slice() }); return []; } };
  ExtraRigs.pickRival([a, b], a);
  ExtraRigs.pickRival([b, a], a);   // different order: still the same pooled rows
  assert.equal(seen[0].arr, seen[1].arr, "the same running array is reused");
  assert.ok(seen[1].rows.every((r) => seen[0].rows.includes(r)), "the same row objects are reused");
  assert.equal(seen[1].arr.length, 2);
  assert.equal(seen[1].arr[0].key, a, "rows are re-filled and re-sorted (a leads on prog)");
});

// localBattles is the no-Broadcast fallback on every RIVAL frame — pool fight bags like Broadcast.battles.
test("ExtraRigs.localBattles reuses its fight bags across calls", () => {
  const { ExtraRigs } = loadExtraRigs();
  const a = { key: { id: "a" }, prog: 100, speed: 50 };
  const b = { key: { id: "b" }, prog: 80, speed: 50 };   // 0.4 s gap → a battle
  const c = { key: { id: "c" }, prog: 60, speed: 50 };
  const first = ExtraRigs.localBattles([a, b, c], 1);
  assert.ok(first.length >= 1);
  const bag0 = first[0];
  const second = ExtraRigs.localBattles([a, b, c], 1);
  assert.equal(second, first, "the same fights array is reused");
  assert.equal(second[0], bag0, "the same fight bag object is reused");
  assert.equal(second[0].key, b.key);
  assert.equal(second[0].ahead, a.key);
});

// #4745 D — the pit-entry shot: a short, drivable tracking cut on the entry road of a called stop.
function pitEntryRig({ motion = null, now = { t: 0 }, initialMode = 0 } = {}) {
  const { ExtraRigs, ctx } = loadExtraRigs();
  ctx.performance = { now: () => now.t };
  ctx.PitGeom = { inSpan: (a, b, s) => s >= a && s <= b };
  const calls = [];
  let mode = initialMode;
  const G = {
    state: "race", paused: false,
    track: { total: 1000, pit: { sA: 100, sIn: 300, side: 1 } },
    player: { s: 50, pitArmed: true, brakeDemand: 0, steerCommand: 0, pitState: "none" },
    get camMode() { return mode; },
    setCamMode(i, o) { calls.push(o); mode = o && o.release ? 0 : i; },
    store: { get: (k, d) => (k === "motion" ? motion : d), set() {} },
  };
  return { ExtraRigs, G, calls, now, mode: () => mode };
}
const PITWALL = CAM_MODE_IDS.indexOf("pitwall");

test("helmet stays selected throughout a called pit entry", () => {
  const helmet = CAM_MODE_IDS.indexOf("helmet");
  const r = pitEntryRig({ initialMode: helmet });
  for (const s of [50, 110, 160, 280, 310]) {
    r.G.player.s = s;
    r.ExtraRigs.tickPitAuto(r.G);
    assert.equal(r.mode(), helmet);
  }
  assert.deepEqual(r.calls, []);
});

test("pit-entry shot: cuts on the entry road of a called stop, frames the car from a fixed eye, hands back after 2.2 s", () => {
  const r = pitEntryRig();
  r.ExtraRigs.tickPitAuto(r.G);
  assert.equal(r.mode(), 0, "before the peel: no shot");
  r.G.player.s = 110; r.ExtraRigs.tickPitAuto(r.G);
  assert.equal(r.mode(), PITWALL, "on the entry road: the shot is on air");
  assert.equal(r.calls[0].owner, "pit-entry"); assert.equal(r.calls[0].persist, false, "never saved as the player's camera");
  assert.ok(r.ExtraRigs.pitEntryShot());
  const eye = [0, 0, 0], tgt = [0, 0, 0];
  r.ExtraRigs.solve("pitwall", r.G.track, 110, 0, 40, 0, { carPos: [110, 0] }, eye, tgt);
  const e1 = eye.slice();
  r.ExtraRigs.solve("pitwall", r.G.track, 150, 0, 40, 0, { carPos: [150, 0] }, eye, tgt);
  assert.deepEqual(eye, e1, "the eye stands still");
  assert.equal(tgt[0], 150, "and turns to follow the car");
  r.now.t = 2300; r.G.player.s = 160; r.ExtraRigs.tickPitAuto(r.G);
  assert.equal(r.mode(), 0, "released after PE_S"); assert.equal(r.calls.at(-1).release, true);
  r.now.t = 2400; r.ExtraRigs.tickPitAuto(r.G);
  assert.equal(r.mode(), 0, "once per entry");
});

test("pit-entry shot: a hard brake or a steer ends it early (the lane is driven)", () => {
  for (const poke of [(p) => { p.brakeDemand = 0.9; }, (p) => { p.steerCommand = 0.6; }]) {
    const r = pitEntryRig();
    r.G.player.s = 110; r.ExtraRigs.tickPitAuto(r.G);
    assert.equal(r.mode(), PITWALL);
    poke(r.G.player); r.now.t = 100; r.ExtraRigs.tickPitAuto(r.G);
    assert.equal(r.mode(), 0);
  }
});

// #5585 — the shot is temporary: nothing the player does during it may write the shot's camera as their saved choice.
// The REAL switch (js/camera/mode-switch.js) under the REAL shot, driven the way game.js and the CAM button drive them.
function pitEntryWithRealSwitch() {
  const r = pitEntryRig();
  const saved = new Map([["camMode", 0]]);
  const ctx = vm.createContext({ console, Math, Map, Number, document: { body: { classList: { toggle() {} }, toggleAttribute() {} }, getElementById: () => null } });
  ctx.window = ctx;
  ctx.Log = { info() {}, debug() {}, warn() {} };
  ctx.CamTunerPanel = { refresh() {} };
  ctx.ExtraRigs = r.ExtraRigs;
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  load("js/camera/cam-picker.js"); load("js/camera/mode-switch.js");
  const G = {
    $: () => null, camMode: 0, camCutT: 0, state: "race", paused: false,
    track: r.G.track, player: r.G.player,
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set(k, v) { saved.set(k, v); } },
  };
  const cams = ctx.CamModes.create(G);
  G.setCamMode = cams.setCamMode;
  const tick = (t) => { r.now.t = t; r.ExtraRigs.tickPitAuto(G); };
  G.player.s = 110; tick(0);
  assert.equal(G.camMode, PITWALL, "the shot is on air");
  assert.equal(saved.get("camMode"), 0, "and was never saved");
  return { G, cams, saved, tick, ExtraRigs: r.ExtraRigs };
}
const DRONE = CAM_MODE_IDS.indexOf("drone");

test("pit-entry shot: a CAM press dismisses it and is spent — the saved camera and the camera after the shot are the player's own (#5585)", () => {
  const r = pitEntryWithRealSwitch();
  r.cams.cycleCam();                       // the CAM button / C key
  assert.equal(r.G.camMode, 0, "back on CHASE at once, not PIT WALL + 1");
  assert.equal(r.saved.get("camMode"), 0, "the saved choice is untouched");
  r.tick(100);                             // the shot notices it lost the picture and ends
  assert.ok(!r.ExtraRigs.pitEntryShot(), "the shot is over");
  assert.equal(r.G.camMode, 0); assert.equal(r.saved.get("camMode"), 0);
  r.tick(2400);                            // past PE_S: a late release changes nothing
  assert.equal(r.G.camMode, 0); assert.equal(r.saved.get("camMode"), 0);
  r.cams.cycleCam();                       // the next press is an ordinary cycle from the player's camera
  assert.equal(r.G.camMode, 1); assert.equal(r.saved.get("camMode"), 1, "CHASE -> FAR, saved");
});

test("pit-entry shot: left alone it hands back the player's camera, and the saved choice never moved (#5585)", () => {
  const r = pitEntryWithRealSwitch();
  r.G.player.s = 160; r.tick(2300);
  assert.equal(r.G.camMode, 0, "released to CHASE after PE_S"); assert.equal(r.saved.get("camMode"), 0);
});

test("pit-entry shot: an explicit pick (the picker grid) during it ends the shot and IS the player's choice (#5585)", () => {
  const r = pitEntryWithRealSwitch();
  r.cams.setCamMode(DRONE);
  assert.equal(r.G.camMode, DRONE); assert.equal(r.saved.get("camMode"), DRONE, "the camera they picked, saved");
  r.tick(100); r.tick(2400);
  assert.equal(r.G.camMode, DRONE, "the shot's release does not pull the camera back");
  assert.equal(r.saved.get("camMode"), DRONE);
});

test("pit-entry shot: reduced motion, an uncalled stop, a paused race and the PIT WALL opt-in skip it", () => {
  const quiet = pitEntryRig({ motion: "reduce" });
  quiet.G.player.s = 110; quiet.ExtraRigs.tickPitAuto(quiet.G);
  assert.equal(quiet.mode(), 0, "MOTION reduce");
  const uncalled = pitEntryRig();
  uncalled.G.player.pitArmed = false; uncalled.G.player.s = 110; uncalled.ExtraRigs.tickPitAuto(uncalled.G);
  assert.equal(uncalled.mode(), 0, "a car only passing the peel");
  const paused = pitEntryRig();
  paused.G.paused = true; paused.G.player.s = 110; paused.ExtraRigs.tickPitAuto(paused.G);
  assert.equal(paused.mode(), 0, "paused");
  const off = pitEntryRig();
  off.G.store = { get: (k, d) => (k === "pitEntryShot" ? false : d), set() {} };
  off.G.player.s = 110; off.ExtraRigs.tickPitAuto(off.G);
  assert.equal(off.mode(), 0, "PIT ENTRY SHOT off");
  const optIn = pitEntryRig();
  optIn.G.store = { get: (k, d) => (k === "pitCamAuto" ? true : d), set() {} };
  optIn.G.player.s = 110; optIn.ExtraRigs.tickPitAuto(optIn.G);
  assert.ok(!optIn.ExtraRigs.pitEntryShot(), "PIT WALL auto-cut owns the lane");
});
