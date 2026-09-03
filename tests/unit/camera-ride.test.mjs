/* camera-ride.test.mjs — the chase camera must not bob on a gradient.
 *
 * THE BUG THIS GUARDS. The chase rig used to take its vertical framing from two
 * independent point samples of the centreline: the eye from the road `back` m
 * behind the car, the target from the road at the car. That makes the rig's
 * PITCH a finite difference of the elevation profile over ~12 m — the one
 * operator that amplifies short wavelengths — and this engine puts short
 * wavelengths in the profile deliberately (buildCenterline's "fine surface
 * undulation", three harmonics at 30-110 m, js/track/tracks.js).
 *
 * On flat road that difference is a constant and invisible, which is why the
 * report was specifically "on Monaco, going up the incline". Put a gradient
 * under it and it stops being constant: the camera pitched up and down about
 * once a second, riding ripples the car was meant to absorb.
 *
 * WHY A VM SUITE AND NOT A SPEC. GameCams.vantage is a pure function of
 * (track, mode, s, x, speed) — the seam is already there. In a browser the
 * elevation profile is whatever the circuit ships, so a threshold would pin
 * Monaco's terrain rather than the rig; here the profile is an argument, so the
 * ripple can be dialled to a known amplitude and the assertion is about the
 * CAMERA. It also runs in milliseconds instead of minutes.
 *
 * The bob assertion is RELATIVE — the smoothed rig against a raw two-point rig
 * on the same road — so it stays meaningful if the framing constants are ever
 * retuned. Absolute framing is pinned only where it must not move at all: flat
 * road, and a constant slope.
 *
 * Run: node --test tests/unit/camera-ride.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// cameras.js declares `const GameCams`, which lands in the context's lexical
// scope rather than on the global object — read it back by evaluating its name.
// Same shape as tests/unit/race-control.test.mjs.
function loadGameCams(Tracks, CamTune) {
  const globals = { Math, JSON, Object, Array, Number, console, Tracks };
  // Left UNDEFINED unless a test supplies one — cameras.js guards every use with
  // `typeof CamTune !== "undefined"`, so an absent tuner is the shipped default.
  if (CamTune) globals.CamTune = CamTune;
  const ctx = vm.createContext(globals);
  seedLog(ctx);
  // js/core/mat4.js first — it is the second <script> tag in the shell and the home of
  // the shared scalar helpers (M4.clamp/lerp), which cameras.js binds at eval.
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/cameras.js"), "utf8"), ctx,
    { filename: "js/game/cameras.js" });
  return vm.runInContext("GameCams", ctx);
}

/* The CAMERA TUNER's HEIGHT knob, reduced to what this file needs: translate the
   EYE only, leaving the aim point alone. That is exactly what js/game/cam-tune.js
   apply() does for `height` (the aim stays put so the car cannot leave frame). */
function camTuneHeight(dh) {
  return { get: () => 0, apply: (mode, eye, tgt, fov) => { eye[1] += dh; return fov; } };
}

/* A straight track running along +Z with the elevation profile `heightAt(s)`.
   Node spacing matches what buildCenterline uses (total/round(total/4) = 4 m).
   Only what vantage() actually reads is populated. */
function makeTrack(heightAt, { total = 4000, hw = 6 } = {}) {
  const n = Math.round(total / 4), ds = total / n;
  const py = new Float64Array(n), pz = new Float64Array(n), px = new Float64Array(n);
  for (let k = 0; k < n; k++) { pz[k] = k * ds; py[k] = heightAt(k * ds); }
  const rx = new Float64Array(n).fill(1), ry = new Float64Array(n), rz = new Float64Array(n);
  const hws = new Float64Array(n).fill(hw);
  return {
    total, n, px, py, pz, rx, ry, rz, hw: hws,
    def: { street: true },
    // Street lateral profile, matching TrackSurface.profile: a shelf just under
    // the road. Enough for the eye's ground clamp to be exercised, not stubbed out.
    surface: { heightAt: (k, beyond) => py[((Math.round(k) % n) + n) % n] - 0.12 - beyond * 0.004 },
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
function makeTracksStub(track) {
  const at = (arr, s) => {
    const n = track.n, L = track.total;
    let v = s % L; if (v < 0) v += L;
    const fi = v / L * n, i = Math.floor(fi) % n, j = (i + 1) % n;
    return lerp(arr[i], arr[j], fi - Math.floor(fi));
  };
  return {
    sample(t, s, out) {
      out.p[0] = at(t.px, s); out.p[1] = at(t.py, s); out.p[2] = at(t.pz, s);
      out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
      out.r[0] = 1; out.r[1] = 0; out.r[2] = 0;
      out.hw = at(t.hw, s);
      return out;
    },
    curvature: () => 0,
    banking: (t, s, lat, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
}

/* The rig as the player sees it: the free-world branch, which is the one the
   live game takes (render() always passes carPos). Car at world (0, s) heading
   +Z, matching makeTrack's layout. */
function chaseAt(cams, track, s, mode = "chase") {
  return cams.vantage(track, mode, s, 0, 60, 0, { carPos: [0, s], carHead: 0 });
}
const pitchOf = (v) => Math.atan2(v.tgt[1] - v.eye[1], Math.hypot(v.tgt[0] - v.eye[0], v.tgt[2] - v.eye[2])) * 180 / Math.PI;

const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

/* Short-wavelength content: a series minus its own 60 m moving average. At
   racing speed that band IS the bob — the hill itself lives hundreds of metres
   out and survives the subtraction. */
function ripple(series, stepM) {
  const W = Math.round(30 / stepM), N = series.length, out = [];
  for (let i = W; i < N - W; i++) {
    let sum = 0;
    for (let j = -W; j <= W; j++) sum += series[i + j];
    out.push(series[i] - sum / (2 * W + 1));
  }
  return out;
}

// The profile that reproduces the report: Monaco's climb (a 30 m rise over a
// 340 m half-width cosine, straight from js/circuits/monaco.js) with the
// engine's own fine undulation on top. The 30 m harmonic is the one that
// matters — bob scales as amplitude ÷ wavelength².
const HILL = (s) => (Math.abs(s - 1200) < 340 ? 15 * (1 + Math.cos(Math.PI * (s - 1200) / 340)) : 0);
const RIPPLE = (s) => 0.037 * Math.sin(s * 2 * Math.PI / 30)
                    + 0.075 * Math.sin(s * 2 * Math.PI / 68 + 1.1)
                    + 0.112 * Math.sin(s * 2 * Math.PI / 110 + 2.3);

test("flat road: the chase rig frames exactly as its constants say", () => {
  const track = makeTrack(() => 7.5);
  const cams = loadGameCams(makeTracksStub(track));
  const v = chaseAt(cams, track, 1000);
  // eyeUp 2.1 above the road, target 0.7 above it — no gradient, no correction.
  assert.ok(Math.abs(v.eye[1] - (7.5 + 2.1)) < 1e-6, `eye ${v.eye[1]}`);
  assert.ok(Math.abs(v.tgt[1] - (7.5 + 0.7)) < 1e-6, `tgt ${v.tgt[1]}`);
});

test("constant slope: unchanged from a raw two-point rig, to the millimetre", () => {
  // The smoothing must be invisible wherever the road has no curvature — this is
  // what makes the fix safe to apply to every circuit at once. A Hann average of
  // a straight line is the line; the gradient of a straight line is its slope.
  for (const g of [0.05, 0.12, -0.09]) {
    const track = makeTrack((s) => 40 + s * g);
    const cams = loadGameCams(makeTracksStub(track));
    const v = chaseAt(cams, track, 2000);
    const roadBehind = 40 + (2000 - 5.8) * g;      // what the old rig sampled
    assert.ok(Math.abs(v.eye[1] - (roadBehind + 2.1)) < 1e-3,
      `slope ${g}: eye ${v.eye[1]} vs ${roadBehind + 2.1}`);
    assert.ok(Math.abs(v.tgt[1] - (40 + 2000 * g + 0.7)) < 1e-3,
      `slope ${g}: tgt ${v.tgt[1]}`);
  }
});

test("a hill with the engine's own undulation does not bob the chase pitch", () => {
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  const cams = loadGameCams(makeTracksStub(track));

  const STEP = 1, pitch = [], rawPitch = [];
  const roadY = (s) => HILL(s) + RIPPLE(s);
  for (let s = 700; s < 1700; s += STEP) {
    pitch.push(pitchOf(chaseAt(cams, track, s)));
    // The rig as it was built before this fix: eye from the road 5.8 m behind,
    // target from the road at the car. Same constants, raw samples.
    rawPitch.push(Math.atan2((roadY(s) + 0.7) - (roadY(s - 5.8) + 2.1), 11.8) * 180 / Math.PI);
  }
  const bob = rms(ripple(pitch, STEP)), rawBob = rms(ripple(rawPitch, STEP));

  // The raw rig has to actually bob, or this test proves nothing.
  assert.ok(rawBob > 0.05, `the two-point reference rig should bob on this profile, got ${rawBob.toFixed(4)}°`);
  assert.ok(bob < rawBob / 4,
    `chase pitch bob ${bob.toFixed(4)}° must be well under the two-point rig's ${rawBob.toFixed(4)}°`);
});

test("the eye still follows the hill — smoothing is not flattening", () => {
  // The opposite failure: a filter wide enough to kill the bob could also stop
  // the camera climbing with the road at all. Over Monaco's 30 m rise the eye
  // must gain essentially the whole of it.
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  const cams = loadGameCams(makeTracksStub(track));
  const foot = chaseAt(cams, track, 800).eye[1];
  const crest = chaseAt(cams, track, 1200).eye[1];
  assert.ok(crest - foot > 28, `eye climbed ${(crest - foot).toFixed(2)} m of a 30 m hill`);
});

test("far chase gets the same treatment", () => {
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  const cams = loadGameCams(makeTracksStub(track));
  const STEP = 1, pitch = [], rawPitch = [];
  const roadY = (s) => HILL(s) + RIPPLE(s);
  for (let s = 700; s < 1700; s += STEP) {
    pitch.push(pitchOf(chaseAt(cams, track, s, "far")));
    rawPitch.push(Math.atan2((roadY(s) + 1.0) - (roadY(s - 10.5) + 4.2), 19.5) * 180 / Math.PI);
  }
  const bob = rms(ripple(pitch, STEP)), rawBob = rms(ripple(rawPitch, STEP));
  assert.ok(rawBob > 0.05, `reference rig should bob, got ${rawBob.toFixed(4)}°`);
  assert.ok(bob < rawBob / 4, `far pitch bob ${bob.toFixed(4)}° vs raw ${rawBob.toFixed(4)}°`);
});

test("a camera LOWERED into the ground clamp does not ride a node staircase", () => {
  // THE REPORTED BUG. surface.heightAt() rounds its node index, so asking it once
  // per frame makes the clamp floor a staircase with one step per ~4 m node. At
  // the shipped framing the eye rides ~0.5 m clear of that floor and never sees
  // it — which is why this hid behind every default-valued test. Lower the eye
  // with the CAMERA TUNER and it lands ON the floor, inheriting the steps: on a
  // gradient each one is nodeSpacing x grade (0.45 m measured on Monaco),
  // snapping ~11 times a second at racing speed. Flat road is immune (adjacent
  // nodes are level), and a parked car is immune (nothing crosses a node), which
  // is exactly the "fast judder only while climbing" signature.
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  const cams = loadGameCams(makeTracksStub(track), camTuneHeight(-1.5));

  // Sample far finer than the 4 m node spacing, or the staircase aliases away.
  const ys = [];
  for (let s = 1000; s < 1120; s += 0.25) ys.push(chaseAt(cams, track, s).eye[1]);
  const d = ys.map((v, i) => (i ? v - ys[i - 1] : 0)).slice(1);

  const held = d.filter((v) => Math.abs(v) < 1e-9).length;
  const snaps = d.filter((v) => Math.abs(v) > 0.2).length;
  // A staircase is mostly-flat with occasional big jumps; a slide is neither.
  assert.equal(snaps, 0, `eye snapped ${snaps} time(s), max jump ${Math.max(...d.map(Math.abs)).toFixed(3)} m`);
  assert.ok(held < d.length * 0.25, `eye held flat for ${held}/${d.length} samples — that is a staircase`);

  // ...and it must genuinely be sitting on the clamp, or the test proves nothing.
  const free = loadGameCams(makeTracksStub(track), camTuneHeight(-1.5e-9));
  assert.ok(chaseAt(cams, track, 1050).eye[1] > chaseAt(free, track, 1050).eye[1] - 1.5 + 0.05,
    "the lowered eye was never actually caught by the clamp — nothing was exercised");
});

test("the camera path is C1 — no node-rate or clamp-handover acceleration spikes", () => {
  // The two defects a position-driven judder is made of, and neither shows up in
  // a position or even a velocity check:
  //   1. elevation lerped between ~4 m nodes is only C0, so vertical VELOCITY
  //      steps at every node boundary (~11 Hz at racing speed);
  //   2. a hard max() ground clamp is C0 too, so its slope jumps every time the
  //      eye engages or disengages the floor.
  // Both are invisible at the shipped framing — the eye rides clear of the floor
  // and the rig sits several degrees nose-down, so these differences are noise.
  // Lower and shorten the rig with the CAMERA TUNER and they become the signal.
  //
  // The instrument is the ratio of the WORST vertical acceleration to its own
  // rms: a smooth curve keeps that small, while a discontinuity is a spike by
  // definition. Ratio, not an absolute bound, so the test says "no kinks" rather
  // than pinning a particular hill's steepness.
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  for (const dh of [0, -1.5]) {
    const cams = loadGameCams(makeTracksStub(track), dh ? camTuneHeight(dh) : null);
    const ys = [];
    for (let s = 950; s < 1250; s += 0.2) ys.push(chaseAt(cams, track, s).eye[1]);
    const d1 = ys.map((v, i) => (i ? v - ys[i - 1] : 0)).slice(1);
    const d2 = d1.map((v, i) => (i ? v - d1[i - 1] : 0)).slice(1);
    const rms = Math.sqrt(d2.reduce((a, b) => a + b * b, 0) / d2.length);
    const spike = Math.max(...d2.map(Math.abs)) / (rms || 1);
    assert.ok(spike < 6,
      `HEIGHT ${dh}: worst vertical acceleration is ${spike.toFixed(1)}x its own rms — that is a discontinuity, not a curve`);
  }
});

test("EVERY world-facing camera mode is C1 on a gradient", () => {
  // chase/far were fixed first, and the rest were left on the raw sample. That
  // was worse, not better: MEASURED at stock framing on Monaco's climb, drift
  // read 8.6, heli 9.4 and tcam/rear/cinematic/reverse 10.2 — i.e. a player who
  // never touched the CAMERA TUNER still got the judder, just in a different
  // mode. This sweeps the lot so a new mode cannot quietly join them.
  //
  // cockpit and hood are excluded ON PURPOSE: they are bolted to the car and
  // must match the raw profile the chassis is drawn from. Riding the car's own
  // bumps is what an onboard camera is for.
  const MODES = ["chase", "far", "drift", "overhead", "heli", "reverse", "side",
                 "cinematic", "low", "tcam", "rear"];
  const track = makeTrack((s) => HILL(s) + RIPPLE(s));
  const cams = loadGameCams(makeTracksStub(track));
  const bad = [];
  for (const mode of MODES) {
    const ys = [];
    for (let s = 950; s < 1250; s += 0.2) ys.push(chaseAt(cams, track, s, mode).eye[1]);
    const d1 = ys.map((v, i) => (i ? v - ys[i - 1] : 0)).slice(1);
    const d2 = d1.map((v, i) => (i ? v - d1[i - 1] : 0)).slice(1);
    const rms = Math.sqrt(d2.reduce((a, b) => a + b * b, 0) / d2.length);
    const spike = Math.max(...d2.map(Math.abs)) / (rms || 1);
    if (!(spike < 6)) bad.push(`${mode} ${spike.toFixed(1)}x`);
  }
  assert.deepEqual(bad, [], `these modes step their vertical velocity at node rate: ${bad.join(", ")}`);
});

// The guaranteed clearance over the ROAD is MIN_CLEAR - FLOOR_LEAD = 0.55 m,
// not the old 0.8: the clamp floor now references the SMOOTHED ride height
// (so a CAMERA TUNER-lowered eye stops riding raw ripple crests through the
// floor — see the clamp comment in cameras.js), and the smoothed reference is
// allowed to sit at most FLOOR_LEAD = 0.25 below raw where the profile
// genuinely drops. These synthetic cliffs are exactly that worst case. On
// every real circuit raw-above-smooth measures <= 0.202 m (suzuka), inside
// FLOOR_LEAD, so the smooth reference governs and the full 0.8 m holds there.
const CLIFF_CLEAR = 0.8 - 0.25;

test("the soft floor never lets the eye end up below the hard floor", () => {
  // Softening the clamp handover must not weaken what the clamp is FOR. The
  // blend may only ever push the eye up.
  const track = makeTrack((s) => (s > 2000 ? -6 : 0));
  const cams = loadGameCams(makeTracksStub(track), camTuneHeight(-4));
  for (let s = 1900; s < 2200; s += 2) {
    const v = chaseAt(cams, track, s);
    const groundHere = (s > 2000 ? -6 : 0) - 0.12;
    assert.ok(v.eye[1] >= groundHere + CLIFF_CLEAR - 1e-6,
      `eye ${v.eye[1].toFixed(3)} below the floor ${(groundHere + CLIFF_CLEAR).toFixed(3)} at s=${s}`);
  }
});

test("the ground clamp still catches an eye below the surface", () => {
  // The smoothing must not cost the eye its terrain floor. A track whose road
  // drops away sharply under the eye is the case the clamp exists for.
  const track = makeTrack((s) => (s > 2000 ? -6 : 0));
  const cams = loadGameCams(makeTracksStub(track));
  for (let s = 1900; s < 2200; s += 5) {
    const v = chaseAt(cams, track, s);
    const groundHere = (s > 2000 ? -6 : 0) - 0.12;
    assert.ok(v.eye[1] >= groundHere + CLIFF_CLEAR - 1e-6,
      `eye ${v.eye[1].toFixed(3)} sank below the clamp floor ${(groundHere + CLIFF_CLEAR).toFixed(3)} at s=${s}`);
  }
});
