/* free-cam.test.mjs — the FREE CAMERA panel (js/camera/free-cam.js).
 *
 * Holds the pure half (log speed dial, wheel step, roll clamp, the COPY VIEW
 * line, the car and corner snap framings) and the lifecycle against a fake
 * photo mode in a VM with tests/helpers/mini-dom.mjs: opening flies from the
 * game camera, roll/lens decorate the dbgCam photo mode publishes, Q/E roll,
 * arrow keys over the panel are left to its focused control, and every exit
 * (DONE, photo mode leaving by another door) hands the game camera back level.
 *
 * Run: node --test tests/unit/free-cam.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const plain = (v) => JSON.parse(JSON.stringify(v));   // VM-realm arrays fail deepStrictEqual on prototype
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

// A straight track along +Z: s metres out, lateral +right = +X. Four corners.
const FlybySeq = {
  FAR: 6000, FOG: 0.15, NEAR: 0.9,
  cornerS(track, n) { track._fbCorners = [{ f: 0.1 }, { f: 0.3 }, { f: 0.5 }, { f: 0.7 }]; return track._fbCorners[(n | 0) - 1 || 0].f * track.total; },
  cornerSide: (track, n) => (n % 2 ? 1 : -1),
  poseFromWorld: () => ({ pose: { at: "corner", n: 2, off: -12.5, x: 30 }, err: 0.01 }),
  shotFromView: (track, eye, target, fov) => ({ shot: { id: "freecam", eye: [{ at: "corner", n: 2 }], fov: [fov, fov] }, err: { eye: 0.01, look: 0.2 } }),
  // The planner stand-in: a corner pose sits at its apex, +x outside by cornerSide, off along +Z.
  solve(track, u, shots) {
    const at = (q) => { const s0 = track._fbCorners[q.n - 1].f * track.total, sd = this.cornerSide(track, q.n); return [(q.x || 0) * sd, 2 + (q.y || 0), s0 + (q.off || 0)]; };
    this.lastShot = shots[0]; this.resets = this.resets || 0;
    return { eye: at(shots[0].eye[0]), tgt: at(shots[0].look[0]) };
  },
  reset() { this.resets = (this.resets || 0) + 1; },
};
const Tracks = {
  sample(track, s, out) { out.p[0] = 0; out.p[1] = 2; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1; out.r[0] = 1; out.r[1] = 0; out.r[2] = 0; return out; },
};

function boot() {
  const dom = makeDom();
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error, parseFloat, parseInt, isFinite,
    document: dom.document, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, FlybySeq, Tracks,
    _wl: {}, addEventListener(t, fn) { sb._wl[t] = fn; }, removeEventListener(t) { delete sb._wl[t]; },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/clipboard.js", "js/camera/free-cam.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const FC = vm.runInContext("FreeCam", ctx);
  const G = {
    $: (id) => dom.byId(id), photoCam: { pos: [0, 0, 0], yaw: 0, pitch: 0, fov: 60 },
    track: { total: 1000 }, player: { px: 5, pz: 100, head: 0, s: 100 },
    paused: true, soundOn: false, photoMode: false, dbgCam: null,
  };
  let api = null;
  const photo = {
    enter() { G.photoMode = true; G.photoCam.pos = [1, 2, 3]; },           // initPhotoCam from the game camera
    exit() { G.photoMode = false; api.onPhotoExit(); G.dbgCam = null; },   // exitPhotoMode's order
    publish() {
      const e = G.photoCam.pos;
      G.dbgCam = { eye: e.slice(), target: [e[0], e[1], e[2] - 100], fov: G.photoCam.fov, far: 2500, fog: 1 };
      api.decorate(G.dbgCam, 0);
    },
    releaseKeys() {},
  };
  api = FC.create(G, photo);
  return { dom, G, FC, api, sb };
}

test("speed dial is logarithmic 5-200 m/s and round-trips; the wheel steps and clamps", () => {
  const { FC } = boot();
  assert.equal(FC.speedFromSlider(0), 5);
  assert.ok(Math.abs(FC.speedFromSlider(1000) - 200) < 1e-9);
  assert.ok(Math.abs(FC.speedFromSlider(500) - Math.sqrt(5 * 200)) < 1e-9, "the midpoint is the geometric mean");
  for (const s of [5, 12, 34, 90, 200]) assert.ok(Math.abs(FC.speedFromSlider(FC.sliderFromSpeed(s)) - s) / s < 0.005, `${s} m/s round-trips`);
  assert.equal(FC.sliderFromSpeed(1e6), 1000); assert.equal(FC.sliderFromSpeed(-3), 0);
  assert.ok(Math.abs(FC.wheelSpeed(34, -100) - 34 * 1.15) < 1e-9, "wheel up is faster");
  assert.ok(FC.wheelSpeed(34, 100) < 34, "wheel down is slower");
  assert.equal(FC.wheelSpeed(199, -1), 200); assert.equal(FC.wheelSpeed(5, 1), 5);
  assert.equal(FC.wheelSpeed(34, 0), 34);
});

test("roll clamps to ±45°, junk is level", () => {
  const { FC } = boot();
  assert.equal(FC.clampRoll(10), 10);
  assert.equal(FC.clampRoll(90), 45); assert.equal(FC.clampRoll(-400), -45);
  assert.equal(FC.clampRoll("abc"), 0); assert.equal(FC.clampRoll(undefined), 0);
});

test("COPY VIEW is an __apex.view() call rounded to centimetres", () => {
  const { FC } = boot();
  assert.equal(FC.viewSnippet([1.234, 2, -3.456], [10, 0.005, 7], 61.25),
    "__apex.view({eye:[1.23,2,-3.46],target:[10,0.01,7],fov:61.25})");
});

test("snap maths: behind the car along its heading; a corner from its outside, before the apex", () => {
  const { FC } = boot();
  const p = FC.carPose({ px: 5, pz: 100, head: 0 }, 2);    // heading 0 = +Z
  assert.deepEqual(plain(p.eye.map((v) => +v.toFixed(3))), [5, 5.2, 91]);
  assert.deepEqual(plain(p.target.map((v) => +v.toFixed(3))), [5, 3, 114]);
  const q = FC.carPose({ px: 0, pz: 0, head: Math.PI / 2 }, 0);   // +X
  assert.ok(q.eye[0] < 0 && Math.abs(q.eye[2]) < 1e-9 && q.target[0] > 0);
  const c1 = FC.cornerPose({ total: 1000 }, 1);             // apex at s=100, side +1
  assert.equal(c1.n, 1); assert.equal(c1.count, 4);
  assert.deepEqual(plain(c1.target), [0, 3, 100]);
  assert.ok(c1.eye[0] > 0 && c1.eye[2] < 100 && c1.eye[1] > 2, "outside (+x on a +1 corner), before the apex, above the road");
  const c2 = FC.cornerPose({ total: 1000 }, 2);
  assert.ok(c2.eye[0] < 0, "side −1 puts the eye on the other side");
  assert.equal(FC.cornerPose({ total: 1000 }, 5).n, 1, "n wraps past the last corner");
  assert.equal(FC.cornerPose({ total: 1000 }, 0).n, 4, "and before the first");
  const shot = FlybySeq.lastShot;
  assert.equal(shot.eye[0].at, "corner"); assert.equal(shot.look[0].at, "corner");
  assert.ok(FlybySeq.resets >= 4, "a borrowed solve resets the flyby's cut state every time");
  const a = FC.aim([0, 0, 0], [0, 0, -10]);
  assert.ok(Math.abs(a.yaw) < 1e-9 && Math.abs(a.pitch) < 1e-9, "photo mode's convention: yaw 0 looks down −Z");
});

test("open flies from the game camera; roll, lens and Q/E decorate dbgCam; DONE restores", () => {
  const { dom, G, api, sb } = boot();
  assert.equal(api.isOpen(), false);
  dom.byId("pm-freecam").click();
  assert.equal(api.isOpen(), true); assert.equal(G.photoMode, true);
  assert.equal(dom.byId("freecam").hidden, false);
  assert.equal(dom.byId("pmsettings").hidden, true, "the settings page stands down for the live view");
  assert.ok(dom.body.classList.contains("lt-open"));
  assert.deepEqual(plain(G.dbgCam.eye), [1, 2, 3], "starts where the game camera was");
  assert.equal(typeof sb._wl.wheel, "function", "wheel speed is live while open");
  assert.equal(G.dbgCam.roll, 0);

  const st = api.cmd({ roll: 20, lens: "flyby" });
  assert.equal(st.roll, 20); assert.equal(st.lens, "flyby");
  assert.ok(Math.abs(G.dbgCam.roll - 20 * Math.PI / 180) < 1e-12);
  assert.equal(G.dbgCam.cine, true); assert.equal(G.dbgCam.far, 6000); assert.equal(G.dbgCam.fog, 0.15);

  assert.equal(api.key("KeyE", true, null), 1, "E is the free camera's key");
  api.decorate(G.dbgCam, 1);                                 // one second of E: +40°, clamped at 45
  assert.equal(api.state().roll, 45);
  api.key("KeyE", false, null);
  assert.equal(api.key("KeyW", true, null), 0, "WASD stays photo mode's");
  assert.equal(api.key("ArrowLeft", true, dom.byId("fc-speed")), -1, "arrows over the panel belong to its control");
  assert.equal(api.key("ArrowLeft", true, null), 0, "arrows elsewhere look");

  const before = api.state().speed;
  sb._wl.wheel({ deltaY: -1, target: null });
  assert.ok(api.state().speed > before);

  dom.byId("fc-close").click();
  assert.equal(api.isOpen(), false); assert.equal(G.photoMode, false);
  assert.equal(G.dbgCam, null, "the game camera is handed back");
  assert.equal(dom.byId("freecam").hidden, true);
  assert.equal(dom.byId("pmsettings").hidden, false, "back to the settings page it was opened from");
  assert.equal(dom.body.classList.contains("lt-open"), false);
  assert.equal(sb._wl.wheel, undefined);
  assert.equal(api.state().roll, 0, "the next photo mode starts level");
  assert.equal(api.state().lens, "race");
});

test("photo mode leaving by another door (resume / quit) closes the panel without reopening the menu", () => {
  const { dom, G, api } = boot();
  api.open();
  G.paused = false;
  dom.byId("pmsettings").hidden = true;
  api.onPhotoExit();
  assert.equal(api.isOpen(), false);
  assert.equal(dom.byId("pmsettings").hidden, true);
});

test("__apex.freeCam: state, place, snap, copy and exit", () => {
  const { G, FC } = boot();
  assert.equal(FC.cmd().open, false, "no arg is state");
  const s = FC.cmd({ eye: [0, 10, 0], target: [0, 10, -50], fov: 45 });
  assert.equal(s.open, true); assert.deepEqual(plain(s.eye), [0, 10, 0]); assert.equal(s.fov, 45);
  assert.equal(FC.cmd({ fov: 500 }).fov, 110, "FOV clamps to photo mode's range");
  const car = FC.cmd({ snap: "car" });
  assert.deepEqual(plain(car.eye), [5, 5.2, 91]);
  const c = FC.cmd({ snap: "corner", n: 3 });
  assert.equal(c.corner, 3);
  assert.equal(FC.cmd({ snap: "corner" }).corner, 4, "no n steps to the next corner");
  assert.match(c.anchor, /^T2 -12\.5 m, \+30 m out$/);
  G.player = null;
  assert.equal(FC.cmd({ snap: "car" }), false, "no car, no snap");
  assert.equal(FC.cmd(false).open, false);
  assert.equal(G.dbgCam, null);
});

test("COPY VIEW / COPY FLYBY POSE write the textarea and report the round trip", () => {
  const { dom, api } = boot();
  api.cmd({ eye: [1, 2, 3], target: [1, 2, -97], fov: 50 });
  assert.equal(api.copyView(), "__apex.view({eye:[1,2,3],target:[1,2,-97],fov:50})");
  assert.equal(dom.byId("fc-out").hidden, false);
  const r = api.copyPose();
  assert.equal(r.shot.id, "freecam");
  assert.match(dom.byId("fc-out").value, /"at": "corner"/);
  assert.match(api.state().poseErr, /eye 0\.01 m, look 0\.2 m/);
});

test("wired into the real photo mode: speed dial drives the fly-cam, Q rolls, EXIT closes to the menu, resume closes", () => {
  const dom = makeDom();
  const wl = {};
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error, parseFloat, parseInt, isFinite,
    document: dom.document,
    addEventListener(t, fn) { (wl[t] = wl[t] || []).push(fn); },
    removeEventListener(t, fn) { if (wl[t]) wl[t] = wl[t].filter((f) => f !== fn); },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    navigator: { getGamepads: () => [], maxTouchPoints: 5, userAgent: "node" },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    screen: { orientation: { type: "landscape-primary", angle: 0, addEventListener() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "" }, performance: { now: () => 0 }, innerWidth: 1000, innerHeight: 600,
    GameAudio: { uiSelect() {}, uiTick() {} }, PerfGov: { tier: () => 0, setAutoRes() {} }, FlybySeq, Tracks,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/clipboard.js", "js/input/input.js", "js/camera/free-cam.js", "js/camera/photo-cam.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const G = {
    $: (id) => dom.byId(id), gfx: {}, photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 },
    photoKeys: {}, photoMouse: {}, photoMove: { x: 0, y: 0 }, photoLook: { x: 0, y: 0 },
    applyResMode() {}, camEye: [0, 10, 0], camTgt: [0, 10, -1], camFov: 60,
    track: { total: 1000 }, paused: true, photoMode: false, dbgCam: null,
  };
  const pm = vm.runInContext("Photomode", ctx).create(G);
  const fc = pm.freeCam;
  dom.byId("pm-freecam").click();
  assert.equal(fc.isOpen(), true); assert.equal(G.photoMode, true);
  assert.deepEqual(plain(G.dbgCam.eye), [0, 10, 0], "published at once, from the game camera");
  const key = (code, type) => (wl[type] || []).forEach((fn) => fn({ code, type, preventDefault() {}, stopPropagation() {} }));
  dom.byId("fc-speed").value = "1000"; dom.dispatch(dom.byId("fc-speed"), { type: "input" });
  key("KeyW", "keydown"); pm.updatePhotoCam(0.05); key("KeyW", "keyup");
  assert.ok(Math.abs(G.dbgCam.eye[2] - (-10)) < 1e-6, "200 m/s x 0.05 s straight down -Z");
  key("KeyQ", "keydown"); pm.updatePhotoCam(0.5); key("KeyQ", "keyup");
  assert.ok(G.dbgCam.roll < 0, "Q rolls left");
  dom.byId("pc-exit").click();
  assert.equal(fc.isOpen(), false); assert.equal(G.photoMode, false); assert.equal(G.dbgCam, null);
  assert.equal(dom.byId("pmsettings").hidden, false, "EXIT from the free camera returns to the settings page");
  dom.byId("pm-freecam").click();
  G.paused = false; dom.byId("pmsettings").hidden = true;
  pm.exitPhotoMode();                                        // setPaused(false) / quitToMenu
  assert.equal(fc.isOpen(), false); assert.equal(dom.byId("freecam").hidden, true);
  assert.equal(dom.byId("pmsettings").hidden, true, "resume does not bring the menu back");
});
