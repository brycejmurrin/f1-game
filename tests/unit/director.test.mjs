/* director.test.mjs — live TV director (js/camera/director.js).
 *
 * Pure cut policy (dwell, battles, shot rotation, wantOn solo/net gates) and a
 * VM create() that writes G.dbgCam from camVantage without touching car forces.
 * Run: node --test tests/unit/director.test.mjs
 */
import { test } from "node:test";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot(globals = {}) {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    ...globals,
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

test("the live director's battle pick is the same at OVERALL SPEED 0.469 as at pace 1 (4-F6)", () => {
  // Broadcast.battles floors the chaser's speed at 20 × vScale; the director must pass
  // vTop()/VMAX for the sim's PACE-scaled field. Same scene at both paces: two cars 24 m
  // apart crawling at 12 m/s (1.2 s on the floor — not a battle), the field scaled by PACE.
  const subjectAt = (pace) => {
    const sb = {
      Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite,
      Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
      CamModes: { CAM_MODES: [{ id: "chase" }, { id: "tv" }] },
      PhysicsConsts: { VMAX: 72 },
    };
    sb.window = sb;
    const ctx = vm.createContext(sb);
    vm.runInContext(src("js/race/broadcast.js"), ctx, { filename: "broadcast.js" });
    vm.runInContext(src("js/camera/director.js"), ctx, { filename: "director.js" });
    const Dir = vm.runInContext("Director", ctx);
    const car = (code, prog) => ({ code, prog: prog * pace, s: prog * pace, x: 0, speed: 12 * pace, retired: false, finished: false });
    const field = [car("LEA", 1024), car("CHA", 1000), car("TAI", 0)];
    const G = {
      state: "race", camMode: 1, cars: field, player: field[2], track: { total: 5000 }, dbgCam: null,
      netPlay: { active: () => false }, vTop: () => 72 * pace,
      camVantage: (mode, s, x) => ({ eye: [s, 5, x], tgt: [s + 10, 2, x], fov: 50 }),
    };
    const api = Dir.create(G);
    api.tick(1);
    return api.status().subject;
  };
  assert.equal(subjectAt(1), "LEA", "pace 1: no battle, the director rotates onto the leader");
  assert.equal(subjectAt(0.469), subjectAt(1),
    "pace 0.469: the same scene is no battle either — the crawl floor scales with vTop()/VMAX");
});

test("CAM_MODES keeps tv at its shipped index — save-format index contract", () => {
  const text = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
  const ids = [...text.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.includes("tv"), "tv mode must be in CAM_MODES");
  // apex26.camMode stores the index: tv shipped at 18, later modes (HELMET) append after it.
  assert.equal(ids.indexOf("tv"), 18, "tv keeps index 18 — never reorder earlier ids");
  assert.ok(ids.indexOf("visor") < ids.indexOf("tv"), "visor stays before tv");
});

function cameraScene() {
  const D = boot({ CamModes: { CAM_MODES: [{ id: "chase" }, { id: "tv" }] } });
  const car = { code: "VER", prog: 100, s: 100, speed: 50 };
  const G = {
    state: "race", paused: false, photoMode: false, camMode: 1,
    player: car, cars: [car], track: {}, dbgCam: null,
    netPlay: { active: () => false },
    setCamMode(i) { G.camMode = i; },
    camVantage(_shot, s) { return { eye: [s, 5, 0], tgt: [s + 10, 2, 0], fov: 50 }; },
  };
  let eligible = true;
  const api = D.create(G, () => eligible);
  return { D, G, car, api, eligibility(v) { eligible = v; } };
}

test("WATCH or scrub ownership prevents live TV cuts and retired-seat auto-spectate", () => {
  const { G, car, api, eligibility } = cameraScene();
  eligibility(false);
  for (const mode of [0, 1]) {
    G.camMode = mode;
    for (const flag of ["finished", "retired"]) {
      car[flag] = true;
      api.tick(20);
      assert.equal(G.camMode, mode, "recorded playback keeps the selected camera");
      assert.equal(G.dbgCam, null);
      assert.equal(api.status().cuts, 0);
      car[flag] = false;
    }
  }
  eligibility(true);
  api.tick(1);
  assert.ok(G.dbgCam, "ordinary solo TV still takes shots");
  eligibility(false);
  api.tick(20);
  assert.equal(G.dbgCam, null, "replay ownership releases a previously owned live shot");
});

test("Pause holds the director's shot and clock without forcing a retired-seat camera", () => {
  const { G, car, api } = cameraScene();
  api.tick(1);
  const camera = G.dbgCam, status = api.status();
  const pose = JSON.parse(JSON.stringify(camera));
  G.paused = true;
  car.s = 400;
  api.tick(30);
  assert.equal(G.dbgCam, camera);
  assert.deepEqual(JSON.parse(JSON.stringify(G.dbgCam)), pose);
  assert.deepEqual(api.status(), status, "no elapsed wall time or cuts while paused");
  G.camMode = 0;
  car.retired = true;
  api.tick(30);
  assert.equal(G.camMode, 0, "auto-spectate cannot change a paused camera");
  assert.equal(G.dbgCam, null, "a different paused camera selection releases the held TV shot");
});

test("Photo and foreign debug cameras keep ownership through TV ticks, reset and exit", () => {
  const { G, api } = cameraScene();
  api.tick(1);
  const photo = { eye: [4, 8, 12], target: [14, 8, 12], fov: 70 };
  G.dbgCam = photo;
  G.photoMode = true;
  api.tick(20);
  assert.equal(G.dbgCam, photo, "Photo retains its published pose");
  G.photoMode = false;
  api.tick(20);
  assert.equal(G.dbgCam, photo, "an external tool's camera retains ownership too");
  assert.equal(api.status().on, false, "director does not report a foreign camera as its own");
  G.state = "menu";
  api.tick(1);
  api.reset();
  assert.equal(G.dbgCam, photo, "release and reset must not delete another camera");
  G.state = "race";
  G.dbgCam = null;
  api.tick(1);
  assert.ok(G.dbgCam, "TV resumes after the tool releases its camera");
});

/* THE SIDE FLIP (2026-10-04). applyShot solved every frame with no dt, so the
 * corner-side follow in vantage.js (CamFeel.follow "bendSide"/"bendHeli") returned
 * the raw ±1 and a curvature sign change mid-shot moved the TV SIDE eye the
 * whole flip (2 x its side offset: ~50 m on the shipped pose) in one frame. The real vantage.js + CamFeel solve it here, on a
 * straight whose curvature the test flips under a parked subject. */
function realCamScene() {
  const lerp = (a, b, t) => a + (b - a) * t;
  const total = 4000, n = 1000, hw = 6;
  const py = new Float64Array(n).fill(7.5), pz = new Float64Array(n), px = new Float64Array(n);
  for (let k = 0; k < n; k++) pz[k] = k * total / n;
  const track = { total, n, px, py, pz, rx: new Float64Array(n).fill(1), ry: new Float64Array(n), rz: new Float64Array(n),
    hw: new Float64Array(n).fill(hw), def: {}, surface: { heightAt: () => 7.5 - 0.12 } };
  const bend = { k: 0.01 };   // +k = LEFT turn; the test flips it
  const at = (arr, s) => { let v = s % total; if (v < 0) v += total; const fi = v / total * n, i = Math.floor(fi) % n; return lerp(arr[i], arr[(i + 1) % n], fi - Math.floor(fi)); };
  const Tracks = {
    sample(t, s, out) { out.p[0] = at(px, s); out.p[1] = at(py, s); out.p[2] = at(pz, s); out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.r[0] = 1; out.r[1] = 0; out.r[2] = 0; out.hw = hw; return out; },
    curvature: () => bend.k,
    banking: (t, s, lat, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite, parseFloat, parseInt, Float64Array,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    Tracks, CamModes: { CAM_MODES: [{ id: "chase" }, { id: "tv" }] },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/core/mat4.js", "js/camera/drive-chase.js", "js/camera/drive-broadcast.js", "js/camera/drive-onboard.js",
    "js/camera/feel.js", "js/camera/vantage.js", "js/camera/director.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const [Director, GameCams, CamFeel] = ["Director", "GameCams", "CamFeel"].map((g) => vm.runInContext(g, ctx));
  // A parked subject: nothing moves but the bend under it.
  const car = { code: "VER", prog: 100, s: 1000, x: 0, speed: 50, px: 0, pz: 1000, head: 0 };
  const G = {
    state: "race", paused: false, photoMode: false, camMode: 1, player: car, cars: [car], track, dbgCam: null,
    netPlay: { active: () => false }, setCamMode(i) { G.camMode = i; },
    camVantage: (mode, s, x, spd, now, extra) => GameCams.vantage(track, mode, s, x, spd, now, extra),
  };
  return { Director, CamFeel, G, bend, ctx, Tracks, api: Director.create(G) };
}

test("post-finish shots frame signed bank lift at the final interpolated pose, including unbanked and raw fallback poses", () => {
  const { G, Tracks, api } = realCamScene();
  G.player.finished = true;
  G.camMode = 0;
  let pose, bankCall, directorScratch;
  G.camPoseOf = () => pose;
  Tracks.banking = (track, s, x, scratch, smooth) => {
    bankCall = { track, s, x, scratch, smooth };
    if (s === 920) return null; // Leaving a bank must not retain the previous lift.
    scratch.dy = x * 0.5;
    scratch.roll = Math.atan(0.5);
    return scratch;
  };
  const vantage = G.camVantage;
  let expected;
  G.camVantage = (mode, s, x, speed, now, extra) => {
    assert.ok(bankCall, "Director samples the subject's bank before solving the shot");
    assert.equal(bankCall.track, G.track);
    assert.equal(bankCall.s, expected.s, "banking uses the resolved pose, not the raw physics s");
    assert.equal(bankCall.x, expected.x, "banking uses the resolved lateral offset");
    assert.equal(bankCall.smooth, true, "match the normal camera's smooth lift sampling");
    if (directorScratch) assert.equal(bankCall.scratch, directorScratch, "reuse the bank scratch across shots and held frames");
    directorScratch = bankCall.scratch;
    assert.equal(extra.bankDy, expected.dy);
    return vantage(mode, s, x, speed, now, extra);
  };
  for (expected of [{ s: 900, x: 4, dy: 2 }, { s: 900, x: -4, dy: -2 },
    { s: 920, x: 4, dy: 0 }, { s: 1000, x: -4, dy: -2, raw: true }]) {
    pose = expected.raw ? null : { s: expected.s, x: expected.x, carPos: [expected.x, expected.s], carHead: 0 };
    G.player.x = expected.raw ? expected.x : 0;
    G.player.px = G.player.x;
    for (const shot of ["chase", "side", "heli", "cinematic"]) {
      bankCall = null;
      api.tick(15);
      assert.equal(api.status().shot, shot);
      assert.ok(Math.abs(G.dbgCam.target[1] - (7.5 + expected.dy + 0.8)) < 1e-9,
        `${shot} aims at the car's bank-adjusted height (${expected.dy} m lift)`);
      bankCall = null;
      api.tick(1 / 60);
    }
  }
  delete Tracks.banking;
  G.camVantage = (...args) => {
    assert.equal(args[5].bankDy, 0, "tracks without banking retain the unbanked camera");
    return vantage(...args);
  };
  api.tick(1 / 60);
  assert.ok(Math.abs(G.dbgCam.target[1] - 8.3) < 1e-9);
});

test("a side-of-the-bend flip mid-shot pans the TV eye: a few % of the flip a frame, never a teleport", () => {
  const { G, bend, api, CamFeel } = realCamScene();
  const dt = 1 / 60;
  api.tick(dt);
  assert.equal(api.status().shot, "side", "the fallback rotation opens on TV SIDE");
  const opened = G.dbgCam.eye.slice();
  assert.ok(opened[0] > 10, "a cut lands whole on the outside of a left bend (+right): " + opened[0]);
  for (let i = 0; i < 30; i++) api.tick(dt);
  bend.k = -0.01;   // the bend ahead turns right: the outside is now -right
  let prev = G.dbgCam.eye.slice(), worst = 0;
  for (let i = 0; i < 180; i++) {
    api.tick(dt);
    const e = G.dbgCam.eye;
    worst = Math.max(worst, Math.hypot(e[0] - prev[0], e[1] - prev[1], e[2] - prev[2]));
    prev = e.slice();
  }
  assert.equal(api.status().shot, "side", "still the same shot: this is a pan inside it, not a cut");
  // Relative to the shot's own flip (2 x the side offset: ~50 m on the shipped
  // 25 m TV SIDE, ~28 m on #867's 14 m), so the bound holds on either pose. A
  // dt-less solve covers ALL of it in one frame; eased at lambda 2.6 a 60 Hz frame
  // covers 1 - e^(-2.6/60) = 4.2 % of it (2.1 m on 25 m, 1.2 m on 14 m).
  const flip = 2 * Math.abs(opened[0]);
  assert.ok(worst < 0.1 * flip, `the eye moved ${worst.toFixed(2)} m in one frame of a ${flip.toFixed(1)} m flip (a dt-less solve jumps all of it)`);
  assert.ok(G.dbgCam.eye[0] < -10, "and it arrives on the new outside: " + G.dbgCam.eye[0]);
  // The director's follows are its own: the player's rig keys are untouched.
  assert.equal(CamFeel.follow("bendSide", 1, 2.6, dt), 1, "an unscoped 'bendSide' was never written by the director");
});

test("the director ticks after the physics step, on the pose the car is drawn at", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const body = game.slice(game.indexOf("function tickBody("));
  const step = body.indexOf("update(PHYS_DT)"), alpha = body.indexOf("renderAlpha = clamp(physAcc / PHYS_DT"),
    tick = body.indexOf("director.tick(dt)");
  assert.ok(step > 0 && alpha > step, "fixture: the fixed-step loop, then renderAlpha");
  assert.ok(tick > alpha, "director.tick(dt) runs after the step and renderAlpha, not before the physics");
  assert.match(game, /function camPoseOf\(c\) \{\n  const pa = playerAnchor\(c\), rp = renderPosOf\(c\);/, "the subject pose is the interpolated render pose");
  const dir = fs.readFileSync(path.join(ROOT, "js/camera/director.js"), "utf8");
  assert.match(dir, /G\.camPoseOf \? G\.camPoseOf\(car\)/);
});

// Run the actual game render-pose helpers, including interpolation and the
// world-position anchor. No full game boot or copied heading implementation.
function poseScene() {
  const scene = realCamScene(), { ctx, G } = scene;
  Object.assign(ctx, {
    track: G.track, renderAlpha: 0.5,
    trackFrom: (x, z) => ({ s: x, x: -z }),
    netPlay: { owns: c => !!c.netOwned }, incidentSim: { owns: c => !!c.incidentOwned },
  });
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  vm.runInContext(game.slice(game.indexOf("const _rp ="), game.indexOf("function basisMat(")), ctx);
  G.camPoseOf = c => ctx.camPoseOf(c);
  return scene;
}

test("AI TV pose follows the interpolated drawn tangent/yaw, including scaled slope vectors and yaw wrap", () => {
  const { ctx, G, Tracks } = poseScene();
  const samples = [];
  Tracks.sample = (_track, s, out) => {
    samples.push(s);
    // Sloped +X forward and -Z right, with different interpolation shrinkage.
    out.t = [0.48, 0.36, 0]; out.r = [0, 0, -0.9]; return out;
  };
  const car = { human: false, s: 160, x: 0, px: 160, pz: -8, rPrevPx: 100, rPrevPz: -4,
    head: 0, rPrevHead: 0, yawVis: 0.6, rPrevYawVis: 0.2 };
  const before = JSON.stringify(car);
  for (const alpha of [0, 0.25, 0.5, 1]) {
    ctx.renderAlpha = alpha;
    const pose = G.camPoseOf(car), yaw = 0.2 + 0.4 * alpha;
    assert.equal(pose.s, 100 + 60 * alpha);
    assert.equal(samples.at(-1), pose.s, "sample at the body's interpolated world anchor");
    assert.deepEqual(Array.from(pose.carPos), [100 + 60 * alpha, -4 - 4 * alpha]);
    // Independently known normalized body forward is [.8*cos(yaw), .6*cos(yaw), -sin(yaw)].
    assert.ok(Math.abs(pose.carHead - Math.atan2(0.8 * Math.cos(yaw), -Math.sin(yaw))) < 1e-12);
  }
  assert.equal(JSON.stringify(car), before, "camera pose cannot write back into the AI model");
  Object.assign(car, { rPrevYawVis: Math.PI - 0.1, yawVis: -Math.PI + 0.1 });
  ctx.renderAlpha = 0.5;
  assert.ok(Math.abs(G.camPoseOf(car).carHead + Math.PI / 2) < 1e-12,
    "a wrapping yaw interpolates toward the rear, not through the nose");
});

test("player, remote human, network AI and dynamic incident poses preserve wrap-safe world heading", () => {
  const { ctx, G, Tracks } = poseScene();
  Tracks.sample = () => { throw new Error("an authoritative heading must not be road-derived"); };
  for (const owner of [{ human: true, local: true }, { human: true, local: false }, { netOwned: true }, { incidentOwned: true }]) {
    const car = { s: 100, x: 0, px: 100, pz: 0, head: -Math.PI + 0.2, rPrevHead: Math.PI - 0.2, yawVis: 0, ...owner };
    for (const alpha of [0, 0.5, 1]) {
      ctx.renderAlpha = alpha;
      assert.ok(Math.abs(G.camPoseOf(car).carHead - (Math.PI - 0.2 + 0.4 * alpha)) < 1e-12);
    }
  }
});

test("actual AI TV CHASE follows +X motion instead of the unchanged grid heading", () => {
  const { G, Tracks, api, bend } = poseScene();
  const sample = Tracks.sample;
  Tracks.sample = (track, s, out) => {
    sample(track, s, out);
    out.p[0] = s; out.p[2] = 0;
    out.t[0] = 1; out.t[2] = 0; out.r[0] = 0; out.r[2] = -1; return out;
  };
  bend.k = 0;
  Object.assign(G.player, { px: 1000, pz: 0, rPrevPx: 998, rPrevPz: 0, head: 0, yawVis: 0, human: false });
  // Use the real quiet-field shot rotation: side → tcam → chase.
  for (let i = 0; i < 12 && api.status().shot !== "chase"; i++) api.tick(15);
  assert.equal(api.status().shot, "chase");
  const { eye, target } = G.dbgCam;
  assert.ok(eye[0] < 999, "eye trails the interpolated subject along its real +X nose");
  assert.equal(target[0], 999, "automatic chase centres the interpolated subject");
  const heading = Math.atan2(target[0] - eye[0], target[2] - eye[2]);
  assert.ok(Math.abs(heading - Math.PI / 2) < 0.2,
    "only the intentional shoulder offset remains, not the former ~44° shipped-heading error");
});

// bug-hunt 9.8: in TV mode the running list (rows + array + sort) was rebuilt
// every rendered frame, even during the 5 s dwell where decideCut is always null.
test("create().tick skips the running-car scan while holding a fresh shot (SHOT_MIN_S dwell)", () => {
  const car = { code: "VER", s: 100, x: 0, speed: 60, prog: 1000, px: 1, pz: 2, head: 0.1, retired: false, finished: false };
  const field = [car, { code: "HAM", s: 90, x: 0, speed: 58, prog: 990, px: 0, pz: 0, head: 0, retired: false, finished: false }];
  let carReads = 0, vantageCalls = 0;
  const G = {
    state: "race", camMode: 1, player: car, track: { total: 5000 }, dbgCam: null,
    netPlay: { active: () => false }, setCamMode(i) { G.camMode = i; },
    get cars() { carReads++; return field; },
    camVantage(mode, s, x) { vantageCalls++; return { eye: [s, 5, x], tgt: [s + 10, 2, x], fov: 50 }; },
  };
  const sb = { Math, console, Object, Array, Number, String, JSON, Map, Set, isFinite,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "tv", label: "TV", cut: 0.5 }] } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/race/broadcast.js"), ctx, { filename: "broadcast.js" });
  vm.runInContext(src("js/camera/director.js"), ctx, { filename: "director.js" });
  const Dir = vm.runInContext("Director", ctx);
  const api = Dir.create(G);
  api.tick(Dir.SHOT_MIN_S + 1);                 // first cut scans the field
  assert.ok(carReads >= 1 && G.dbgCam, "the cut scanned the field and took the air");
  carReads = 0; vantageCalls = 0;
  for (let i = 0; i < 60; i++) api.tick(1 / 60);   // 1 s of dwell
  assert.equal(carReads, 0, "no running-list scan during the dwell");
  assert.equal(vantageCalls, 60, "the held shot is still solved every frame");
  for (const c of field) c.retired = true;      // the subject leaving must still re-cut at once
  api.tick(1 / 60);
  assert.ok(carReads >= 1, "a retired subject forces the scan again");
});

test("post-finish coverage opens on the car, rotates external shots, and respects a manual camera", () => {
  const { G, car, api } = cameraScene();
  const rival = { code: "NOR", prog: 800, s: 800, speed: 50 };
  G.cars.push(rival); G.camMode = 0; car.finished = true;
  const switches = [];
  G.setCamMode = (i, opts) => { G.camMode = i; switches.push({ i, persist: opts.persist }); };
  const shots = [];
  for (let i = 0; i < 4; i++) { api.tick(15); shots.push(api.status().shot); assert.equal(api.status().subject, "NOR"); }
  assert.deepEqual(shots, ["chase", "side", "heli", "cinematic"]);
  assert.deepEqual(switches, [{ i: 1, persist: false }], "auto entry never overwrites the driving preference");
  G.camMode = 0; api.tick(1);
  assert.equal(G.dbgCam, null, "manual selection releases TV");
  api.tick(20);
  assert.equal(G.camMode, 0, "the next frame must not force TV back on");
  G.camMode = 1; api.tick(1);
  assert.equal(api.status().on, true, "the viewer can return to TV");
  api.reset();
  assert.equal(G.camMode, 0, "new races restore the pre-spectate camera");
  api.tick(1);
  assert.equal(api.status().shot, "chase", "re-entry establishes the subject again");
});

test("manual TV handoff snaps to the player's camera once, including paused and post-finish handoffs", () => {
  for (const state of [{}, { paused: true }, { finished: true }]) {
    const { G, car, api } = cameraScene();
    car.finished = !!state.finished;
    api.tick(1);
    let snaps = 0;
    G.snapGameCam = () => { assert.equal(G.dbgCam, null, "release the override before solving the player's rig"); snaps++; };
    G.paused = !!state.paused; G.camMode = 0;
    api.tick(1); api.tick(1);
    assert.equal(snaps, 1, "only the actual TV release is a discontinuity");
  }
  for (const owner of ["photo", "foreign", "replay", "reset"]) {
    const { G, api, eligibility } = cameraScene();
    api.tick(1);
    G.snapGameCam = () => assert.fail(`${owner} retains camera authority`);
    G.camMode = 0;
    if (owner === "photo") G.photoMode = true;
    if (owner === "foreign") G.dbgCam = { eye: [100, 5, 0] };
    if (owner === "replay") eligibility(false);
    if (owner === "reset") api.reset(); else api.tick(1);
  }
});

test("WATCH cuts and held frames use subject framing and clear it when normal driving resumes", () => {
  const game = gameSource(), render = symbolSource("function render(dt)");
  const start = render.indexOf("_vantExtra.bankDy = bankDy;");
  const end = render.indexOf("const vant = camVantage", start);
  assert.ok(start > 0 && end > start);
  const pooled = game.slice(game.indexOf("const _vantExtra ="), game.indexOf("const _camAP ="));
  let watching = false, extra;
  const car = { s: 1000, x: 10, px: 10, pz: 1000, speed: 60, head: 0 };
  const ctx = vm.createContext({
    player: car, cars: [car], track: {}, camMode: 0, CAM_MODES: [{ id: "side" }],
    Tracks: { banking: () => ({ dy: 2, roll: 0 }) }, _bankScratch: {},
    realRace: { isWatch: () => watching }, camComfort: () => false, cameraBankScale: () => 0,
    GameCams: { resetSmoothing() {} },
    camVantage: (_mode, _s, _x, _speed, _now, e) => { extra = { ...e }; return { eye: [0, 5, 0], tgt: [10, 2, 1000], fov: 50 }; },
    camEye: [0, 0, 0], camTgt: [0, 0, 0], gfx: null,
    bankDy: 2, comfort: false, feel: { shake: 0, camRoll: 0, hitStop: 0 }, rpCam: { world: true, x: 10, z: 1000 },
    _vantCarPos: [0, 0], headInterp: (c) => c.head, dt: 1 / 60,
  });
  vm.runInContext(pooled + "\n" + symbolSource("function snapGameCam("), ctx);
  for (const watch of [false, true, false]) {
    watching = watch;
    vm.runInContext("snapGameCam()", ctx);
    assert.equal(extra.frameSubject, watch, "a follow/seek cut selects the WATCH framing policy");
    vm.runInContext(render.slice(start, end), ctx);
    assert.equal(vm.runInContext("_vantExtra.frameSubject", ctx), watch, "held frames match the cut and release the pooled flag after WATCH");
    assert.equal(extra.bankDy, 2, "WATCH still follows the banked road");
  }
});

test("automatic chase, side, helicopter and cinematic framing keeps a laterally displaced car near the centre", () => {
  const { G } = realCamScene();
  for (const mode of ["chase", "side", "heli", "cinematic"]) for (const x of [-10, 0, 10]) {
    const p = [x, 7.5 + 0.8, 1000];
    const v = G.camVantage(mode, 1000, x, 60, 0, { carPos: [x, 1000], frameSubject: true, noLook: true, snap: true });
    const aim = v.tgt.map((n, i) => n - v.eye[i]), car = p.map((n, i) => n - v.eye[i]);
    const dot = aim.reduce((sum, n, i) => sum + n * car[i], 0) / (Math.hypot(...aim) * Math.hypot(...car));
    const degrees = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    assert.ok(degrees < v.fov * .25, `${mode} x=${x}: subject ${degrees} degrees off-axis, FOV ${v.fov}`);
  }
});

test("subject framing preserves tuner pitch/yaw and the viewer's look-back", () => {
  const { G, ctx } = realCamScene();
  ctx.GameStore = { store: { get: () => null } };
  vm.runInContext(src("js/camera/offsets.js"), ctx, { filename: "offsets.js" });
  const tune = vm.runInContext("CamTune", ctx);
  let held = false;
  ctx.Input = { lookingBack: () => held };
  const close = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-8, `${n} != ${expected[i]}`));
  for (const mode of ["chase", "side", "heli", "cinematic"]) {
    const extra = { carPos: [10, 1000], att: G.player, frameSubject: true, snap: true };
    const solve = () => { const v = G.camVantage(mode, 1000, 10, 60, 0, extra); return { eye: v.eye.slice(), tgt: v.tgt.slice(), fov: v.fov }; };
    held = false;
    const base = solve();
    tune.set(mode, "pitch", 12); tune.set(mode, "yaw", 24);
    const expected = { eye: base.eye.slice(), tgt: base.tgt.slice() };
    tune.apply(mode, expected.eye, expected.tgt, base.fov);
    const adjusted = solve();
    close(adjusted.tgt, expected.tgt);
    assert.ok(Math.hypot(...adjusted.tgt.map((n, i) => n - base.tgt[i])) > 2, "the visible aim responds to both tuner controls");
    held = true;
    const back = solve();
    close(back.tgt, [2 * adjusted.eye[0] - adjusted.tgt[0], adjusted.tgt[1], 2 * adjusted.eye[2] - adjusted.tgt[2]]);
    extra.noLook = true;
    close(solve().tgt, adjusted.tgt);
  }
});

test("the render loop keeps a remote TV/results subject even beyond the player's driving fog", () => {
  const game = gameSource();
  const start = game.indexOf("for (const c of cars) {", game.indexOf("// Driving fog culls"));
  const end = game.indexOf("// Player: reuse frame-cached", start);
  assert.ok(start > 0 && end > start);
  // Run the actual early render culls; the later frustum/LOD still handles the active view.
  const run = game.slice(start, end) + "seen.push(c.code); }";
  const player = { code: "ME", isPlayer: true, s: 50 };
  const ctx = vm.createContext({ state: "race", player, track: { total: 5000 }, dbgCam: null,
    cars: [player, { code: "NEAR", s: 4900 }, { code: "FAR", s: 2500 }], seen: [] });
  vm.runInContext(run, ctx);
  assert.deepEqual(Array.from(ctx.seen), ["ME", "NEAR"], "ordinary driving keeps the wrap-safe fog cull");
  for (const camera of [{ eye: [0, 5, 2500] }, { _resultsCam: true, eye: [0, 5, 2500] }]) {
    ctx.dbgCam = camera; ctx.seen = [];
    vm.runInContext(run, ctx);
    assert.deepEqual(Array.from(ctx.seen), ["ME", "NEAR", "FAR"], "a camera override is independent of player location");
  }
});
