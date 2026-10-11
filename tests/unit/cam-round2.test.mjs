// @doc Camera round-2 fixes (vantage.js / director.js / extra-rigs.js): street corridor vs CORNER HANG and the barrier, look-back scoped to the player, FOV re-clamp, ground clamp at the eye's arc, NaN hold, bend-side hysteresis, frame-rate independence.
/* cam-round2.test.mjs — GameCams.vantage is a pure function of (track, mode, s, x, speed), so every case here is a VM
 * solve: a synthetic curved track for the structural ones, the REAL Monaco / Spa / Monza builds (tools/track/verify-track.cjs
 * buildContext, TrackSurface attached so the ground clamp is live) for the ones about the street barrier and the terrain.
 * Run: node --test tests/unit/cam-round2.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAM_FILES = ["js/camera/drive-chase.js", "js/camera/drive-broadcast.js", "js/camera/drive-onboard.js",
  "js/camera/feel.js", "js/camera/extra-rigs.js", "js/camera/vantage.js"];

function runFiles(ctx, files) {
  for (const f of files) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
}
function camTune(state) {
  return { get: () => 0, cornerLead: () => null, cornerHang: () => (state.hang == null ? null : state.hang),
    speedFov: () => 1, bob: () => 1,
    apply: (_m, _e, _t, fov) => (state.fovAdd ? Math.max(20, Math.min(110, fov + state.fovAdd)) : fov) };
}

/* ---------------- synthetic track (straights + constant-curvature arcs; +k = left) ---------------- */
function makeTrack(segs, opts = {}) {
  const ds = 4;
  const total0 = segs.reduce((a, b) => a + b[0], 0);
  const n = Math.round(total0 / ds), total = n * ds;
  const px = new Float64Array(n), pz = new Float64Array(n), py = new Float64Array(n), tx = new Float64Array(n),
    tz = new Float64Array(n), kk = new Float64Array(n);
  let x = 0, z = 0, h = 0;
  for (let i = 0; i < n; i++) {
    const sI = i * ds; let acc = 0, k = 0;
    for (const sg of segs) { if (sI < acc + sg[0]) { k = sg[1]; break; } acc += sg[0]; }
    px[i] = x; pz[i] = z; tx[i] = Math.sin(h); tz[i] = Math.cos(h); kk[i] = k;
    h -= k * ds; x += Math.sin(h) * ds; z += Math.cos(h) * ds;
  }
  return { total, n, px, py, pz, tx, tz, kk, hw: new Float64Array(n).fill(opts.hw || 7), def: opts.def || {} };
}
function synthTracks() {
  const at = (arr, track, s) => {
    const n = track.n, L = track.total; let v = s % L; if (v < 0) v += L;
    const fi = v / L * n, i = Math.floor(fi) % n, j = (i + 1) % n;
    return arr[i] + (arr[j] - arr[i]) * (fi - Math.floor(fi));
  };
  return {
    sample(t, s, out) {
      out.p[0] = at(t.px, t, s); out.p[1] = at(t.py, t, s); out.p[2] = at(t.pz, t, s);
      const a = at(t.tx, t, s), b = at(t.tz, t, s), l = Math.hypot(a, b) || 1;
      out.t[0] = a / l; out.t[1] = 0; out.t[2] = b / l;
      out.r[0] = out.t[2]; out.r[1] = 0; out.r[2] = -out.t[0];
      out.hw = at(t.hw, t, s); return out;
    },
    curvature: (t, s) => at(t.kk, t, s),
    banking: (_t, _s, _l, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
}
function loadRig(extraCtx, files) {
  const state = { hang: null, fovAdd: 0 };
  const ctx = vm.createContext(Object.assign({ console, Math, Object, Array, Number, JSON, Float64Array,
    CamTune: camTune(state), Log: { info() {}, warn() {}, debug() {} } }, extraCtx || {}));
  runFiles(ctx, ["js/core/mat4.js"].concat(files || CAM_FILES));
  ctx.Tracks = synthTracks();
  const cams = vm.runInContext("GameCams", ctx), feel = vm.runInContext("CamFeel", ctx);
  cams.init({ vmax: 72 });
  return { ctx, cams, feel, state };
}
const BEND = [[400, 0], [Math.PI * 60, 1 / 60], [300, 0], [Math.PI * 90 * 2 / 3, -1 / 90], [600, 0]];

/* ---------------- real circuits ---------------- */
let _real = null;
function realEnv() {
  if (_real) return _real;
  const { buildContext } = require(join(ROOT, "tools/track/verify-track.cjs"));
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext, state = { hang: null, fovAdd: 0 };
  ctx.CamTune = camTune(state);
  runFiles(ctx, CAM_FILES);
  const cams = vm.runInContext("GameCams", ctx), feel = vm.runInContext("CamFeel", ctx);
  cams.init({ vmax: 72 });
  _real = { Tracks, ctx, cams, feel, state, tracks: {} };
  return _real;
}
function realTrack(id, withSurface) {
  const env = realEnv();
  const key = id + (withSurface ? "+s" : "");
  if (env.tracks[key]) return env.tracks[key];
  const def = env.Tracks.LIST.find((d) => d.id === id);
  const tr = env.Tracks.buildCenterline(def);
  if (withSurface) {
    tr.pit = env.ctx.TrackPit.build(tr, def, env.Tracks.curvature);
    tr.surface = env.ctx.TrackSurface.profile(def, tr);
  }
  return (env.tracks[key] = tr);
}
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
/** Eye lateral minus the barrier on its side, at the track node nearest the eye (positive = behind the barrier). */
function pastWall(env, tr, eye, sNear) {
  const n = tr.n, L = tr.total, k0 = Math.floor(sNear / L * n);
  let bi = 0, bd = 1e18;
  for (let d = -24; d <= 24; d++) {
    const i = ((k0 + d) % n + n) % n, dx = eye[0] - tr.px[i], dz = eye[2] - tr.pz[i], dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; bi = i; }
  }
  const lat = (eye[0] - tr.px[bi]) * tr.rx[bi] + (eye[2] - tr.pz[bi]) * tr.rz[bi];
  return Math.abs(lat) - env.Tracks.wallAt(tr, bi / n * L, lat >= 0 ? 1 : -1);
}
/** Ease the camera in over 60 frames approaching `s` (the hunter's wall2/hang pattern), return the last solve's eye. */
function approach(env, tr, mode, s, V, carX) {
  const L = tr.total;
  env.feel.resetFollow(); env.cams.resetSmoothing();
  let v = null;
  for (let j = -60; j <= 0; j++) {
    const ss = ((s + j * V / 60) % L + L) % L;
    env.Tracks.sample(tr, ss, smp);
    const hh = Math.atan2(smp.t[0], smp.t[2]);
    const cx = carX ? carX(ss) : 0;
    v = env.cams.vantage(tr, mode, ss, cx, V, 0, { att: {}, carPos: [smp.p[0] + smp.r[0] * cx, smp.p[2] + smp.r[2] * cx], carHead: hh, dt: 1 / 60, snap: j === -60 });
  }
  return v;
}

test("C2/C5: Monaco CORNER HANG 2 keeps heli/side/cinematic inside the barrier (the pinched 3.3 m wall too)", () => {
  const env = realEnv(), tr = realTrack("monaco"), L = tr.total;
  env.state.hang = 2;
  try {
    for (const mode of ["heli", "side", "cinematic"]) {
      let worst = -1e9, ws = 0;
      for (let s = 0; s < L; s += 12) {
        const v = approach(env, tr, mode, s, 48);
        const p = pastWall(env, tr, v.eye, s);
        if (p > worst) { worst = p; ws = s; }
      }
      assert.ok(worst <= 0, `${mode}: eye ${worst.toFixed(2)} m past the barrier at s=${ws}`);
    }
  } finally { env.state.hang = null; }
});

test("C3: Monaco chase/far/drift/reverse hang stays inside the barrier with the car at the outside wall", () => {
  const env = realEnv(), tr = realTrack("monaco"), L = tr.total;
  for (const mode of ["chase", "far", "drift", "reverse"]) {
    let worst = -1e9, ws = 0;
    for (let s = 1180; s < 1420; s += 10) {
      env.Tracks.sample(tr, s, smp);
      const outside = env.Tracks.curvature(tr, s) > 0 ? 1 : -1;
      const carX = (ss) => outside * Math.max(0, Math.min(7 * 0.9, env.Tracks.wallAt(tr, ((ss % L) + L) % L, outside) - 1.5));
      const v = approach(env, tr, mode, s, 45, carX);
      const p = pastWall(env, tr, v.eye, s);
      if (p > worst) { worst = p; ws = s; }
    }
    assert.ok(worst <= 0, `${mode}: eye ${worst.toFixed(2)} m past the barrier at s=${ws}`);
  }
});

test("C6: Spa reverse keeps real clearance over the Raidillon crest (ground read at the eye's arc)", () => {
  const env = realEnv(), tr = realTrack("spa", true), n = tr.n, L = tr.total, scr = { dy: 0, roll: 0 };
  const V = 60, dt = 1 / 60;
  env.feel.resetFollow(); env.cams.resetSmoothing();
  let minClr = 1e9;
  for (let f = 0; f * V * dt < 1500; f++) {
    const s = 900 + f * V * dt;
    env.Tracks.sample(tr, s, smp);
    const head = Math.atan2(smp.t[0], smp.t[2]), k = env.Tracks.curvature(tr, s);
    const bank = env.Tracks.banking(tr, s, 0, scr, true);
    const v = env.cams.vantage(tr, "reverse", s, 0, V, 0, { bankDy: bank ? bank.dy : 0, att: { yawRateCur: V * k },
      carPos: [smp.p[0], smp.p[2]], carHead: head, dt: f ? dt : 0, snap: !f });
    if (s < 1000) continue;
    const k0 = Math.floor((s + 5.5) / L * n); let bi = 0, bd = 1e18;
    for (let d = -16; d <= 16; d++) {
      const i = ((k0 + d) % n + n) % n, dx = v.eye[0] - tr.px[i], dz = v.eye[2] - tr.pz[i], dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; bi = i; }
    }
    const lat = (v.eye[0] - tr.px[bi]) * tr.rx[bi] + (v.eye[2] - tr.pz[bi]) * tr.rz[bi];
    const b2 = env.Tracks.banking(tr, bi / n * L, lat, scr, true);
    const ground = tr.surface.heightAt(bi, Math.max(0, Math.abs(lat) - tr.hw[bi])) + (b2 ? b2.dy : 0);
    minClr = Math.min(minClr, v.eye[1] - ground);
  }
  assert.ok(minClr >= 0.45, `reverse minimum clearance ${minClr.toFixed(2)} m (was 0.17 m at s=1125)`);
});

test("C4: the player's look-back key and free-look glance do not spin the PiP or a TV-director solve", () => {
  let held = false;
  const rig = loadRig({ Input: { lookingBack: () => held } });
  const track = makeTrack(BEND);
  const solve = (extra) => { const v = rig.cams.vantage(track, "tcam", 200, 0, 60, 1000, extra); return { eye: v.eye.slice(), tgt: v.tgt.slice() }; };
  const aim = (v) => Math.atan2(v.tgt[0] - v.eye[0], v.tgt[2] - v.eye[2]);
  const pip = { bankDy: 0 };                                   // exactly what mirror-pass.js passes: no att
  const base = solve(pip);
  held = true;
  assert.deepEqual(solve(pip), base, "PiP aim unmirrored with the look-back key held");
  assert.deepEqual(solve({ att: {}, noLook: true }).tgt.map((x) => +x.toFixed(6)), solve({ att: {}, noLook: true }).tgt.map((x) => +x.toFixed(6)));
  const player = solve({ att: {} });
  assert.ok(Math.abs(Math.abs(aim(player) - aim(base)) - Math.PI) < 1e-6, "the player's own camera still looks back (control)");
  const tv = solve({ att: {}, noLook: true });
  assert.ok(Math.abs(aim(tv) - aim(base)) < 1e-6, "a noLook (TV director) solve is not mirrored");
  held = false;
  for (let i = 0; i < 60; i++) rig.feel.tick({ mode: "cockpit", dt: 1 / 60, racing: true, stickX: 1, stickY: 0 });
  assert.ok(Math.abs(rig.feel.freeLookState().yaw) > 0.1, "free-look glance is engaged");
  assert.ok(Math.abs(aim(solve(pip)) - aim(base)) < 1e-6, "PiP aim unmoved by the player's glance");
  assert.ok(Math.abs(aim(solve({ att: {}, noLook: true })) - aim(base)) < 1e-6, "TV shot unmoved by the player's glance");
  assert.ok(Math.abs(aim(solve({ att: {} })) - aim(base)) > 0.1, "the player's own camera still glances (control)");
  const dir = readFileSync(join(ROOT, "js/camera/director.js"), "utf8");
  assert.match(dir, /att: car, noLook: true/, "director.js flags every TV shot noLook");
});

test("C7: the solved FOV stays inside the documented 20-110 clamp after CamFeel.drive adds its lens delta", () => {
  const rig = loadRig();
  const track = makeTrack(BEND);
  rig.state.fovAdd = 35;
  let maxFov = 0;
  for (const mode of ["heli", "far", "hood", "chase"]) {
    rig.feel.resetFollow();
    for (let f = 0; f < 180; f++) {
      const v = rig.cams.vantage(track, mode, 100 + f, 0, 72, 0, { att: { yawRateCur: 0.8, baPitch: 0.02 }, slipLat: 4, dt: f ? 1 / 60 : 0, snap: !f, deploy: true });
      maxFov = Math.max(maxFov, v.fov);
    }
  }
  assert.ok(maxFov <= 110 + 1e-9, `max solved FOV ${maxFov.toFixed(2)}`);
});

test("C8: a non-finite input never reaches the camera damper (inputs sanitised, last finite pose held)", () => {
  const rig = loadRig();
  const track = makeTrack(BEND);
  const ex = { att: {}, carPos: [0, 200], carHead: 0, dt: 1 / 60 };
  const good = rig.cams.vantage(track, "chase", 200, 0, 60, 0, Object.assign({ snap: true }, ex));
  const finite = (v) => v.eye.concat(v.tgt, [v.fov]).every(Number.isFinite);
  assert.ok(finite(rig.cams.vantage(track, "chase", 200, 0, NaN, 0, ex)), "spd NaN");
  const lastOk = rig.cams.vantage(track, "heli", 200, NaN, 60, 0, ex);
  assert.ok(finite(lastOk), "x NaN");
  const g = { eye: lastOk.eye.slice(), fov: lastOk.fov };
  void good;
  const bad = rig.cams.vantage(track, "chase", NaN, 0, 60, 0, ex);
  assert.ok(finite(bad), "s NaN");
  assert.deepEqual(bad.eye, g.eye, "the last finite pose is held");
  assert.equal(bad.fov, g.fov);
  let cam = 100; const damp = (c, t, l, d) => c + (t - c) * (1 - Math.exp(-l * d));
  for (let i = 0; i < 600; i++) cam = damp(cam, bad.eye[0], 18, 1 / 60);
  assert.ok(Number.isFinite(cam), "an exponential damper fed the vantage output stays finite");
});

test("C9: a chicane does not flip the heli/side/cinematic bend side faster than the dwell allows", () => {
  // 14 m alternating kinks at 45 m/s: the stateless sign crossed 14 times; the 0.7 s dwell allows ~1 flip per 0.7 s (<= 6 over the 3.7 s chicane).
  const segs = [[300, 0]]; for (let i = 0; i < 12; i++) segs.push([14, (i % 2 ? -1 : 1) / 40]); segs.push([300, 0]);
  const track = makeTrack(segs);
  for (const mode of ["heli", "side", "cinematic"]) {
    const rig = loadRig();
    rig.feel.resetFollow(); rig.cams.resetSmoothing();
    const V = 45, dt = 1 / 60; let prev = 0, crossings = 0;
    for (let s = 230; s < 480; s += V * dt) {
      rig.ctx.Tracks.sample(track, s, smp);
      const v = rig.cams.vantage(track, mode, s, 0, V, 0, { att: {}, carPos: [smp.p[0], smp.p[2]], carHead: Math.atan2(smp.t[0], smp.t[2]), dt, snap: s < 231 });
      const lat = (v.eye[0] - smp.p[0]) * smp.r[0] + (v.eye[2] - smp.p[2]) * smp.r[2];
      if (prev * lat < 0) crossings++;
      if (lat !== 0) prev = lat;
    }
    assert.ok(crossings <= 6, `${mode}: ${crossings} side crossings through a 12-kink chicane`);
  }
  // the one-shot solve (no dt) is stateless: the sign follows the curvature, as before
  const rig = loadRig(); rig.cams.resetSmoothing();
  const lat = (k) => { const tr = makeTrack([[400, 0], [200, k], [400, 0]]); rig.ctx.Tracks.sample(tr, 450, smp);
    const v = rig.cams.vantage(tr, "heli", 450, 0, 40, 0, {}); return (v.eye[0] - smp.p[0]) * smp.r[0] + (v.eye[2] - smp.p[2]) * smp.r[2]; };
  assert.ok(lat(1 / 80) > 5 && lat(-1 / 80) < -5, "left bend: +r side, right bend: -r side");
});

test("eye path stays frame-rate independent (30/60 vs 144 Hz rms < 0.2 m), through the hysteresis too", () => {
  const track = makeTrack(BEND), V = 60, T = 14, damp = (c, t, l, d) => c + (t - c) * (1 - Math.exp(-l * d));
  const LAM = { heli: 9, side: 9, cinematic: 9, overhead: 9, low: 9 };
  function run(mode, hz, rig) {
    rig.feel.resetFollow(); rig.cams.resetSmoothing();
    const dt = 1 / hz, out = [], cam = [0, 0, 0]; let aP = null, init = false;
    for (let f = 0; f <= Math.round(T * hz); f++) {
      const t = f * dt, s = 10 + V * t;
      rig.ctx.Tracks.sample(track, s, smp);
      const k = rig.ctx.Tracks.curvature(track, s);
      const v = rig.cams.vantage(track, mode, s, 0, V, t * 1000, { att: { yawRateCur: V * k }, carPos: [smp.p[0], smp.p[2]], carHead: Math.atan2(smp.t[0], smp.t[2]), dt: f ? dt : 0, snap: !f });
      const aN = [smp.p[0], smp.p[2]], lam = LAM[mode] || 18;
      if (!init) { cam[0] = v.eye[0]; cam[1] = v.eye[1]; cam[2] = v.eye[2]; init = true; }
      else { cam[0] = aN[0] + damp(cam[0] - aP[0], v.eye[0] - aN[0], lam, dt); cam[1] = damp(cam[1], v.eye[1], lam, dt); cam[2] = aN[1] + damp(cam[2] - aP[1], v.eye[2] - aN[1], lam, dt); }
      aP = aN; out.push({ t, e: cam.slice() });
    }
    return out;
  }
  const at = (p, t) => { const dt = p[1].t - p[0].t, i = Math.min(p.length - 2, Math.floor(t / dt)), u = (t - p[i].t) / dt; return p[i].e.map((x, j) => x + (p[i + 1].e[j] - x) * u); };
  for (const mode of ["chase", "far", "drift", "reverse", "heli", "side", "cinematic", "overhead"]) {
    const rig = loadRig(), ref = run(mode, 144, rig);
    for (const hz of [30, 60]) {
      const p = run(mode, hz, rig); let sq = 0, n = 0;
      for (let t = 1; t < T - 0.1; t += 0.01) { const a = at(p, t), b = at(ref, t); sq += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; n++; }
      const rms = Math.sqrt(sq / n);
      assert.ok(rms < 0.2, `${mode} ${hz} Hz rms ${rms.toFixed(3)} m vs 144 Hz`);
    }
  }
});

test("a real Monza lap at 60 Hz solves finite in every mode and never jumps beyond the car's own travel", () => {
  const env = realEnv(), tr = realTrack("monza", true), L = tr.total, V = 60, dt = 1 / 60, scr = { dy: 0, roll: 0 };
  for (const mode of ["chase", "far", "drift", "reverse", "low", "heli", "side", "overhead", "cockpit", "tcam"]) {
    env.feel.resetFollow(); env.cams.resetSmoothing();
    let prev = null, prevCar = null, worst = 0;
    for (let f = 0; f * V * dt < L; f++) {
      const s = f * V * dt;
      env.Tracks.sample(tr, s, smp);
      const k = env.Tracks.curvature(tr, s), bank = env.Tracks.banking(tr, s, 0, scr, true);
      const v = env.cams.vantage(tr, mode, s, 0, V, f * 16.7, { bankDy: bank ? bank.dy : 0, att: { yawRateCur: V * k },
        carPos: [smp.p[0], smp.p[2]], carHead: Math.atan2(smp.t[0], smp.t[2]), dt: f ? dt : 0, snap: !f });
      assert.ok(v.eye.concat(v.tgt, [v.fov]).every(Number.isFinite), `${mode} non-finite at s=${s.toFixed(0)}`);
      if (prev) worst = Math.max(worst, Math.hypot((v.eye[0] - prev[0]) - (smp.p[0] - prevCar[0]), (v.eye[2] - prev[2]) - (smp.p[2] - prevCar[1])));
      prev = v.eye.slice(); prevCar = [smp.p[0], smp.p[2]];
    }
    // 3 m: the chase hang's fast chicane catch-up (Monza's Rettifilo, 2.6 m in one frame, unchanged by this file's fixes) is the largest legitimate step; a teleport is 10 m+.
    assert.ok(worst <= 3, `${mode}: per-frame eye jump beyond the car's own travel ${worst.toFixed(2)} m`);
  }
});

test("C13: the drone's steady-state lag behind a moving car is the same at 30, 60 and 144 Hz", () => {
  const lag = (hz) => {
    const rig = loadRig(), track = makeTrack([[2000, 0]]), V = 60, dt = 1 / hz;
    let eyeZ = 0, carZ = 0;
    for (let f = 0; f < 4 * hz; f++) {
      carZ = 100 + V * f * dt;
      const v = rig.cams.vantage(track, "drone", carZ, 0, V, 0, { att: {}, carPos: [0, carZ], carHead: 0, dt: f ? dt : 0, snap: !f });
      eyeZ = v.eye[2];
    }
    return carZ - eyeZ;
  };
  const l30 = lag(30), l60 = lag(60), l144 = lag(144);
  assert.ok(Math.abs(l30 - l144) < 0.15 && Math.abs(l60 - l144) < 0.15, `lag 30/60/144 Hz = ${l30.toFixed(2)}/${l60.toFixed(2)}/${l144.toFixed(2)} m`);
});

test("C12: ExtraRigs.resetAuto clears the pit auto-cut bookkeeping", () => {
  const rig = loadRig();
  const ER = rig.ctx.ExtraRigs ?? vm.runInContext("ExtraRigs", rig.ctx);
  assert.equal(typeof ER.resetAuto, "function");
  const modes = [{ id: "chase" }, { id: "pitwall" }];
  const G = { player: { pitState: "none" }, camMode: 0, store: { get: () => true }, setCamMode(i) { G.camMode = i; } };
  rig.ctx.CamModes = { CAM_MODES: modes };
  G.player.pitState = "in";
  assert.equal(ER.tickPitAuto(G), "pitwall", "auto-cut onto PIT WALL on pit entry");
  ER.resetAuto();                 // the player quit the race mid auto-cut
  G.camMode = 0; G.player.pitState = "none";
  assert.equal(ER.tickPitAuto(G), null, "the next session does not 'restore' a stale mode");
});
