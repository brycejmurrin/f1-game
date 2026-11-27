/* cam-surge-hold.test.mjs — #7095 (D-053): the chase-cam ACCELERATION SURGE (I1)
 * and the render-only IMPACT HOLD + FLASH (I3), js/camera/feel-fx.js (CamFx).
 *
 * I1 Done-when: the camera offset tracks normalised longitudinal acceleration
 * with lag under 150 ms. I3 Done-when: the hold is render-only — obs() and the
 * lap clock are identical with the hold on and off (determinism-replay-vm.test.mjs
 * is unchanged and still gates the sim).
 *
 * Run: node --test tests/unit/cam-surge-hold.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

// One straight +Z road (the camera-feel.test.mjs fixture, no bend).
function straightFixture() {
  const n = 1000, total = 4000;
  const track = { total, n, px: new Float64Array(n), py: new Float64Array(n),
    pz: Float64Array.from({ length: n }, (_, k) => k * 4), rx: new Float64Array(n).fill(1),
    ry: new Float64Array(n), rz: new Float64Array(n), hw: new Float64Array(n).fill(6), def: {},
    surface: { heightAt: () => -0.12 } };
  const at = (arr, s) => { let v = s % total; if (v < 0) v += total; const fi = v / total * n, i = Math.floor(fi) % n, j = (i + 1) % n; return arr[i] + (arr[j] - arr[i]) * (fi - Math.floor(fi)); };
  const Tracks = {
    sample(t, s, o) { o.p[0] = at(t.px, s); o.p[1] = at(t.py, s); o.p[2] = at(t.pz, s); o.t[0] = 0; o.t[1] = 0; o.t[2] = 1; o.r[0] = 1; o.r[1] = 0; o.r[2] = 0; o.hw = 6; return o; },
    curvature: () => 0,
    banking: (t, s, l, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
  return { track, Tracks };
}

const FILES = ["js/core/mat4.js", "js/camera/fov-mode.js", "js/camera/feel.js", "js/camera/vantage-ride.js",
  "js/camera/vantage.js", "js/camera/feel-fx.js"];
function boot(disk, { withFx = true } = {}) {
  const { track, Tracks } = straightFixture();
  const store = new Map(Object.entries(disk || {}));
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Tracks,
    PhysicsConsts: { VMAX: 72, ACCEL: 7 },
    GameStore: { store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => { store.set(k, v); return true; }, raw: () => null, rawSet: () => true } },
    Log: { info() {}, debug() {}, warn() {}, error() {} }, document: undefined });
  for (const f of withFx ? FILES : FILES.slice(0, -1))
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: absSrc(f) });
  vm.runInContext("this.GC = GameCams; this.Fx = typeof CamFx === 'undefined' ? null : CamFx;", ctx);
  ctx.GC.init({ vmax: 72 });
  return { ctx, track, store };
}

// The chase eye's distance behind the car (+Z road, car at z = s).
function chaseBack(b, ax, dt, reduceMotion, mode = "chase") {
  const s = 500;
  const v = b.ctx.GC.vantage(b.track, mode, s, 0, 40, 0,
    { carPos: [0, s], carHead: 0, dt, att: { axEstSm: ax }, reduceMotion: !!reduceMotion });
  return s - v.eye[2];
}
const settle = (b, ax, n, ...rest) => { let v = 0; for (let i = 0; i < n; i++) v = chaseBack(b, ax, ...rest); return v; };

test("I1: the chase eye surges back with normalised acceleration, lag under 150 ms", () => {
  const b = boot();
  const DT = 1 / 60;
  const base = settle(b, 0, 121, DT);
  const trace = [];
  for (let i = 0; i < 120; i++) trace.push(chaseBack(b, 7, DT) - base);   // a step to aN = 1
  const final = trace.at(-1);
  assert.ok(final > 0.4 && final < 0.6, `full surge ${final.toFixed(3)} m (expected ~0.5 m back)`);
  // First-order lag: the time to reach 63 % of the step is the time constant.
  const k63 = trace.findIndex((d) => d >= 0.632 * final);
  const lagMs = (k63 + 1) * DT * 1000;
  assert.ok(k63 >= 1, "the surge is eased, not a pop");
  assert.ok(lagMs < 150, `surge lag ${lagMs.toFixed(0)} ms must stay under 150 ms`);
  // Half throttle g tracks half the surge.
  const half = settle(b, 3.5, 120, DT) - base;
  assert.ok(Math.abs(half - final / 2) < 0.01, `aN 0.5 → ${half.toFixed(3)} m, want ${(final / 2).toFixed(3)}`);
  // Braking never pulls the eye back: the same pose as a board without CamFx.
  const plain = boot(null, { withFx: false });
  assert.ok(Math.abs(settle(b, -20, 120, DT) - settle(plain, -20, 120, DT)) < 1e-9, "braking framing is the shipped dolly");
});

test("I1: comfort halves the surge; one-shot solves, no CamFx and PACE leave it alone", () => {
  const DT = 1 / 60;
  const a = settle(boot(), 7, 240, DT) - settle(boot(), 0, 240, DT);
  const c = settle(boot(), 7, 240, DT, true) - settle(boot(), 0, 240, DT, true);
  assert.ok(Math.abs(c - a / 2) < 0.01, `comfort surge ${c.toFixed(3)} vs half of ${a.toFixed(3)}`);
  const Fx = boot().ctx.Fx;
  assert.equal(Fx.surgeScale(true), 0.5);
  assert.equal(Fx.surgeScale(false), 1);
  // No timestep (snapCam, the unit framings): the shipped pose, whatever the accel.
  assert.equal(chaseBack(boot(), 7, 0), chaseBack(boot(), 0, 0));
  // Before the session bundle lands (no CamFx) the rig is exactly today's.
  assert.equal(settle(boot(null, { withFx: false }), 7, 60, DT), settle(boot(null, { withFx: false }), 0, 60, DT));
  // aStd: at PACE 2 (vTop doubled) twice the m/s^2 is the same normalised surge.
  assert.equal(Fx.surgeN(14, 144), Fx.surgeN(7, 72));
  assert.equal(Fx.surgeN(7, 72), 1);
  assert.equal(Fx.surgeN(-9, 72), 0);
  // Far surges further; the onboard rigs never see it.
  const far = boot();
  const f0 = settle(far, 0, 120, DT, false, "far");
  assert.ok(settle(far, 7, 120, DT, false, "far") - f0 > 0.6, "far surges");
  assert.equal(Fx.surge("cockpit", 1, DT, false), 0);
});

test("I3: an impact holds the external eye for a blink, never onboard or under comfort", () => {
  const b = boot();
  const Fx = b.ctx.Fx, DT = 1 / 60;
  assert.equal(Fx.holdOn(), true, "ships ON");
  assert.equal(Fx.impact(0.1), false, "a graze does not hold");
  assert.equal(Fx.impact(1), true);
  const eye = [1, 2, 3];
  assert.equal(Fx.holdEye(eye, false, DT, false), false, "first frame captures the pose");
  eye[0] = 9; eye[2] = 40;
  assert.equal(Fx.holdEye(eye, false, DT, false), true);
  assert.deepEqual(eye, [1, 2, 3], "the held eye stays put");
  let frames = 2;
  while (Fx.holdEye([0, 0, 0], false, DT, false)) frames++;
  assert.ok(frames >= 6 && frames <= 8, `0.12 s at full severity, held ${frames} frames`);
  // Onboard rigs ride the car; comfort and a snap (no dt) clear the hold.
  Fx.impact(1);
  const onb = [5, 5, 5];
  Fx.holdEye(onb, true, DT, false); onb[0] = 6;
  assert.equal(Fx.holdEye(onb, true, DT, false), false);
  assert.deepEqual(onb, [6, 5, 5]);
  Fx.impact(1); Fx.holdEye([0, 0, 0], false, DT, true);
  assert.equal(Fx.state().t, 0, "comfort clears it");
  Fx.impact(1); Fx.holdEye([0, 0, 0], false, 0, false);
  assert.equal(Fx.state().t, 0, "a snap clears it");
  // SETTINGS › CAMERA FEEL › IMPACT HOLD: OFF never holds.
  b.store.set(Fx.K_HOLD, false);
  assert.equal(Fx.impact(1), false);
  assert.equal(Fx.state().t, 0);
});

test("I3: the hold reaches the live chase solve through vantage", () => {
  const b = boot();
  const DT = 1 / 60;
  settle(b, 0, 30, DT);
  b.ctx.Fx.impact(1);
  const solve = (z) => b.ctx.GC.vantage(b.track, "chase", z, 0, 40, 0,
    { carPos: [0, z], carHead: 0, dt: DT, att: { axEstSm: 0 } }).eye[2];
  const e0 = solve(500), e1 = solve(501), e2 = solve(502);
  assert.equal(e1, e0, "the eye holds while the car moves on");
  assert.equal(e2, e0);
  for (let i = 0; i < 10; i++) solve(503 + i);
  assert.ok(solve(520) > e0 + 10, "the hold releases and the rig follows again");
});

// Review on #7186: the TV director and broadcast chooseShot also pass extra.att (with noLook), and
// a cut-time shot has dt 0. Only the player's own solve may drive CamFx's single state.
test("I1/I3: a TV-director solve between player frames never touches the surge or the hold", () => {
  const b = boot();
  const DT = 1 / 60;
  const player = (z) => b.ctx.GC.vantage(b.track, "chase", z, 0, 40, 0,
    { carPos: [0, z], carHead: 0, dt: DT, att: { axEstSm: 7 } }).eye[2];
  const tv = (dt) => b.ctx.GC.vantage(b.track, "chase", 900, 0, 40, 0,
    { carPos: [0, 900], carHead: 0, dt, snap: !dt, noLook: true, frameSubject: true, att: { axEstSm: 0 } });
  for (let i = 0; i < 120; i++) player(500);
  const surged = 500 - player(500);
  tv(DT); tv(0);
  assert.ok(Math.abs((500 - player(500)) - surged) < 1e-9, "a TV solve neither eased nor zeroed the player's surge");
  b.ctx.Fx.impact(1);
  const e0 = player(500);
  tv(0); tv(DT);                       // a director cut (dt 0) and a live TV frame
  assert.equal(player(501), e0, "the player's eye is still held");
  assert.ok(b.ctx.Fx.state().t > 0.08, `one decrement per player frame (${b.ctx.Fx.state().t.toFixed(3)} s left)`);
});

// The Done-when for I3, on the real game: obs() and the lap clock are identical
// with the hold on and off while impacts fire and real frames (sim + render) pump.
test("I3: obs() and lap time are identical with the hold on and off (game VM)", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  try {
    const Fx = g.ctx.CamFx;
    assert.ok(Fx && Fx.holdEye, "CamFx (LAZY_RACE_SESSION) loaded for the race");
    let now = 1e6;   // one monotonic clock, so every run sees the same frame dt sequence
    const run = (on) => {
      g.G.store.set(Fx.K_HOLD, on);
      g.apex.reset(0.02, 55, 0, 42);
      g.apex.setInput({ throttle: true, steer: 0.02 });
      g.apex.camera("chase");   // the hold is external-camera only (the VM seat boots in HELMET)
      let held = 0;
      for (let f = 0; f < 240; f++) {
        if (f % 40 === 10) Fx.impact(1);
        g.pumpFrame(now += 1000 / 60);
        if (Fx.state().held) held++;
      }
      const obs = g.apex.obs();
      delete obs.driving.insights;   // session odometer: accumulates across reset(), hold or not
      const cars = g.G.cars.map((c) => [c.prog, c.x, c.speed, c.lap]);
      return { held, raceT: obs.raceT, digest: JSON.stringify({ obs, cars }) };
    };
    for (let f = 0; f < 3; f++) g.pumpFrame(now += 1000 / 60);   // the boot's last frame time is not ours
    const on = run(true), off = run(false), on2 = run(true);
    assert.ok(on.held > 0, `the render path held the eye (${on.held} frames)`);
    assert.equal(off.held, 0, "OFF never holds");
    assert.ok(on.raceT > 3, `the lap clock ran (${on.raceT} s)`);
    assert.equal(on.digest, off.digest, "obs() / field state differ with the hold on");
    assert.equal(on2.digest, on.digest, "the hold-on replay is itself deterministic");
  } finally { try { g.G.store.set("impactHold", true); } catch (_) {} g.close(); }
});

// #7350 C1: the white flash obeys comfort / REDUCE MOTION like the eye hold does.
function flashSpy(b) {
  const calls = [];
  const el = { style: {}, setAttribute() {}, animate: (k) => { calls.push(k); } };
  b.ctx.document = { createElement: () => el, getElementById: () => null, body: { appendChild() {} } };
  return calls;
}
test("C1: no impact flash under comfort; the flash and hold are unchanged with it off", () => {
  const DT = 1 / 60;
  const off = boot(), offCalls = flashSpy(off);
  off.ctx.Fx.hold([0, 0, 0], false, { dt: DT, reduceMotion: false });
  assert.equal(off.ctx.Fx.impact(0.8), true);
  assert.equal(offCalls.length, 1, "comfort off: one flash");
  assert.ok(Math.abs(offCalls[0][0].opacity - 0.22 * 0.8) < 1e-12);
  const on = boot(), onCalls = flashSpy(on);
  on.ctx.Fx.hold([0, 0, 0], false, { dt: DT, reduceMotion: true });
  assert.equal(on.ctx.Fx.impact(0.8), true, "impact() still reports the hit");
  assert.equal(onCalls.length, 0, "REDUCE MOTION / comfort: no white flash");
  // Comfort switched back off on a later solve: the flash returns.
  on.ctx.Fx.hold([0, 0, 0], false, { dt: DT, reduceMotion: false });
  on.ctx.Fx.impact(0.8);
  assert.equal(onCalls.length, 1, "comfort off again: the flash is back");
});

// #7350 C2: CamFx.reset rides the camera-mode cut, so a hold or surge never leaks into a new vantage.
test("C2: a camera-mode cut clears the hold and the surge", () => {
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Error, Set, Map,
    GameStore: { store: { get: (k, d) => d } }, Log: { info() {}, debug() {}, warn() {}, error() {} }, document: undefined });
  for (const f of ["js/core/mat4.js", "js/core/scopes.js", "js/camera/feel-fx.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: absSrc(f) });
  const Fx = vm.runInContext("CamFx", ctx), S = vm.runInContext("Scopes", ctx);
  assert.ok(S.ids("camera-mode").includes("cam-fx"));
  Fx.impact(1);
  Fx.surge("chase", 1, 1 / 60, false);
  assert.ok(Fx.state().t > 0);
  S.exit("camera-mode", { why: "cut", mode: "chase" });
  assert.equal(Fx.state().t, 0, "the hold is gone after a cut");
  assert.ok(Fx.surge("chase", 0, 1 / 60, false) === 0, "the surge restarts from rest");
});
