/* driving-line.test.mjs — the DRIVING LINE ribbon builder as BEHAVIOUR on a
 * synthetic circuit: a stadium (two straights, two 180° turns). Pins the
 * things a player would notice and a screenshot on SwiftShader cannot prove:
 * the line moves to the inside of a corner, the speed profile brakes BEFORE
 * the corner and not at it, CORNERS mode marks the turns and not the
 * straights, and the strip is the layout the GLX pass expects. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const sandbox = { window: {}, Math, Float32Array, console, M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) } };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/shared/driving-line.js"), "utf8"), ctx,
    { filename: "js/render/shared/driving-line.js" });
  return vm.runInContext("DrivingLine", ctx);
}

/* A stadium: straights of `straight` m along ±z, semicircles of radius R.
   +k is a LEFT-hand turn (measured convention); this circuit turns left. */
function stadium({ straight = 600, R = 60, hw = 7 } = {}) {
  const arc = Math.PI * R, total = 2 * straight + 2 * arc;
  const sample = (s, out) => {
    s = ((s % total) + total) % total;
    let x, z, tx, tz;
    if (s < straight) { x = -R; z = s; tx = 0; tz = 1; }
    else if (s < straight + arc) { const a = (s - straight) / R; x = -R * Math.cos(a); z = straight + R * Math.sin(a); tx = Math.sin(a); tz = Math.cos(a); }
    else if (s < 2 * straight + arc) { const d = s - straight - arc; x = R; z = straight - d; tx = 0; tz = -1; }
    else { const a = (s - 2 * straight - arc) / R; x = R * Math.cos(a); z = -R * Math.sin(a); tx = -Math.sin(a); tz = -Math.cos(a); }
    out.p[0] = x; out.p[1] = 0; out.p[2] = z;
    out.t[0] = tx; out.t[1] = 0; out.t[2] = tz;
    // right = t × up  (x-right of a car heading along t)
    out.r[0] = -tz; out.r[1] = 0; out.r[2] = tx;
    out.hw = hw;
    return out;
  };
  const curvature = (s) => {
    s = ((s % total) + total) % total;
    const onArc = (s >= straight && s < straight + arc) || s >= 2 * straight + arc;
    return onArc ? 1 / R : 0;
  };
  return { id: "stadium", total, track: { n: 100, total, hw: new Float32Array(100).fill(hw) },
           sample, curvature, latMax: 22, brake: 22, accel: 7, vTop: 72, grip: 1, straight, arc, R };
}

test("the strip is the backends' layout: stride 7, two vertices per sample, closed, along runs 0 → L", () => {
  const DL = load();
  const api = stadium();
  const c = DL.build(api);
  assert.equal(DL.STRIDE, 7);
  assert.equal(c.verts.length, c.count * 7);
  assert.equal(c.count % 2, 0);
  // closed: the last pair repeats the first pair's position …
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(c.verts[i] - c.verts[(c.count - 2) * 7 + i]) < 1e-3);
  // … but its ALONG is the lap length, not 0, so the dash pattern does not jump at the line
  assert.equal(c.verts[6], 0);
  assert.ok(Math.abs(c.verts[(c.count - 2) * 7 + 6] - api.total) < 1e-3);
  // across alternates -1 / +1
  assert.equal(c.verts[3], -1); assert.equal(c.verts[10], 1);
});

test("through a left-hander the line sits INSIDE (−x of the centreline) and on a straight it is centred", () => {
  const DL = load();
  const api = stadium();
  DL.build(api);
  const c = DL._cache();
  const at = (s) => { const i = Math.round(s / c.step) % c.n; const o = i * 14; return [(c.verts[o] + c.verts[o + 7]) / 2, (c.verts[o + 2] + c.verts[o + 9]) / 2]; };
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  // mid-corner
  const sMid = api.straight + api.arc / 2;
  api.sample(sMid, smp);
  const [lx, lz] = at(sMid);
  const lateral = (lx - smp.p[0]) * smp.r[0] + (lz - smp.p[2]) * smp.r[2];
  assert.ok(lateral < -2, `mid-corner lateral ${lateral.toFixed(2)} m should be well inside (negative)`);
  // mid-straight, far from either corner
  const sStr = api.straight / 2;
  api.sample(sStr, smp);
  const [sx, sz] = at(sStr);
  const lat2 = (sx - smp.p[0]) * smp.r[0] + (sz - smp.p[2]) * smp.r[2];
  assert.ok(Math.abs(lat2) < 0.5, `mid-straight lateral ${lat2.toFixed(2)} m should be ~0`);
});

test("the speed profile brakes BEFORE the corner: the cap is reached at entry, not after", () => {
  const DL = load();
  const api = stadium();
  DL.build(api);
  const vCorner = Math.sqrt(api.latMax / (1 / api.R));   // ~36 m/s at R 60
  const entry = DL.speedAt(api.straight);
  assert.ok(Math.abs(entry - vCorner) < 1.5, `entry speed ${entry.toFixed(1)} should be the cornering cap ${vCorner.toFixed(1)}`);
  // 100 m before the corner the line is already slowing (braking zone) …
  const before = DL.speedAt(api.straight - 100);
  assert.ok(before > entry + 5 && before < api.vTop, `100 m out: ${before.toFixed(1)} between the cap and vTop`);
  // … and the braking distance is what BRAKE·0.85 buys: v² = vC² + 2·a·d
  const dNeeded = (api.vTop ** 2 - vCorner ** 2) / (2 * api.brake * 0.85);
  const farOut = DL.speedAt(api.straight - dNeeded - 20);
  assert.ok(farOut > api.vTop - 0.5, `beyond the braking distance (${dNeeded.toFixed(0)} m) the line is at vTop, got ${farOut.toFixed(1)}`);
  // and never above vTop anywhere
  const c = DL._cache();
  for (let i = 0; i < c.n; i++) assert.ok(c.v[i] <= api.vTop + 1e-3);
});

test("CORNERS mode: lit through the turn and its exit, dark mid-straight, and never a cut", () => {
  const DL = load();
  const api = stadium();
  DL.build(api);
  assert.ok(DL.zoneAt(api.straight + api.arc / 2) > 0.95, "mid-corner is a corner");
  assert.ok(DL.zoneAt(api.straight / 2 - 100) < 0.05, "mid-straight is not");
  // the braking zone before the corner counts as a corner too
  assert.ok(DL.zoneAt(api.straight - 40) > 0.6, "40 m before the corner is in the braking zone");
  // the line stays lit past track-out (the cut a screenshot showed, 2026-09-08) …
  const exit = api.straight + api.arc;
  assert.ok(DL.zoneAt(exit + 30) > 0.9, `30 m past the exit is still lit (${DL.zoneAt(exit + 30).toFixed(2)})`);
  // … and fades over tens of metres: no two samples 5 m apart differ by more than 0.15
  const c = DL._cache();
  const per5m = Math.max(1, Math.round(5 / c.step));
  for (let i = 0; i < c.n; i++) {
    const d = Math.abs(c.zone[(i + per5m) % c.n] - c.zone[i]);
    assert.ok(d <= 0.15, `zone jumps ${d.toFixed(2)} over 5 m at sample ${i}`);
  }
});

test("draw() honours the mode and reports a backend without the pass", () => {
  const DL = load();
  const api = stadium();
  const calls = [];
  const gfx = { drawDrivingLine: (verts, n, dirty, opts) => { calls.push({ n, dirty, opts }); return true; } };
  DL.setMode("off");
  assert.equal(DL.draw(gfx, api, 50), false, "OFF draws nothing");
  DL.setMode("corner");
  assert.equal(DL.draw(gfx, api, 50), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].dirty, true, "first draw uploads");
  assert.equal(calls[0].opts.cornersOnly, true);
  assert.equal(calls[0].opts.speed, 50);
  DL.draw(gfx, api, 51);
  assert.equal(calls[1].dirty, false, "the strip is uploaded once per circuit");
  DL.setMode("full");
  DL.draw(gfx, api, 52);
  assert.equal(calls[2].opts.cornersOnly, false);
  // a backend with no pass (WGX / TLX today) returns false, and the strip stays dirty for the next backend
  assert.equal(DL.draw({ drawDrivingLine: () => false }, api, 50), false);
  assert.equal(DL.draw({}, api, 50), false, "no member at all is 'no pass' too");
  assert.equal(DL.setMode("bogus"), "off", "an unknown mode is OFF");
  assert.equal(load().mode(), "full", "the shipped default is the whole lap, Forza's default");
});

test("LINE COLOUR is a palette flag the draw carries, not a colour the module knows", () => {
  const DL = load();
  const api = stadium();
  DL.build(api);
  const seen = [];
  const gfx = { drawDrivingLine: (v, n, dirty, opts) => { seen.push(opts.palette); return true; } };
  DL.setMode("full");
  assert.equal(DL.setPalette("f1"), "f1");
  DL.draw(gfx, api, 40);
  assert.equal(DL.setPalette("safe"), "safe");
  DL.draw(gfx, api, 40);
  // An unknown value must not silently become the colour-blind palette.
  assert.equal(DL.setPalette("nonsense"), "f1");
  DL.draw(gfx, api, 40);
  assert.deepEqual(seen, [0, 1, 0], "draw() passes palette 0 for F1 and 1 for the safe triple");
});

test("LINE OPACITY is a multiplier the draw carries, and an unknown value is NORMAL", () => {
  const DL = load();
  const api = stadium();
  DL.build(api);
  const seen = [];
  const gfx = { drawDrivingLine: (v, n, dirty, opts) => { seen.push(opts.opacity); return true; } };
  DL.setMode("full");
  // NORMAL is 1 exactly: the shipped line must not change because the option exists.
  assert.equal(DL.opacity(), "normal");
  assert.equal(DL.opacityMul(), 1);
  DL.draw(gfx, api, 40);
  assert.equal(DL.setOpacity("subtle"), "subtle");
  DL.draw(gfx, api, 40);
  assert.equal(DL.setOpacity("solid"), "solid");
  DL.draw(gfx, api, 40);
  assert.equal(DL.setOpacity("nonsense"), "normal", "an unknown value falls back to the shipped look");
  DL.draw(gfx, api, 40);
  assert.deepEqual(seen, [1, 0.65, 1.35, 1]);
  // SUBTLE below and SOLID above, so the row reads as one axis in both directions.
  const mul = Object.fromEntries(DL.OPACITIES);
  assert.ok(mul.subtle < mul.normal && mul.normal < mul.solid);
});

test("the BRAKING CUE is the ribbon's own colour ramp as a number, and silent on the line's pace", () => {
  const DL = load();
  const api = stadium();
  // No profile baked yet: null, not 0 — "no opinion" and "on the pace" differ.
  assert.equal(DL.cue(50, 0), null);
  DL.build(api);
  const sMid = api.straight + api.arc / 2;
  // The reference is the LINE's speed here, read back, not the cornering cap
  // derived from R: the baked profile eases a little under the cap mid-corner,
  // so a car at the cap is genuinely a shade over the line and the cue is
  // right to say so. Anchoring on the derived number instead is how this test
  // first claimed a defect that was its own arithmetic.
  const vCorner = DL.speedAt(sMid);
  // On the line's pace, and under it, the layer says nothing at all.
  assert.equal(DL.cue(vCorner, sMid), 0);
  assert.equal(DL.cue(vCorner * 0.5, sMid), 0);
  // The ramp saturates with the shaders' red (1.16) but opens at 1.0, NOT at
  // their 0.98: a tone that sounds while the player is exactly on the pace is
  // one they switch off. This assertion is the reason the code says 1.0.
  assert.equal(DL.cue(vCorner * 0.99, sMid), 0, "just under the line is still silent");
  assert.equal(DL.cue(vCorner * 1.2, sMid), 1, "past 1.16 it is pinned at full");
  const mid = DL.cue(vCorner * 1.07, sMid);
  assert.ok(mid > 0.2 && mid < 0.8, `mid-ramp urgency ${mid.toFixed(3)} sits between the ends`);
  // Monotone, so the tone can only tighten as the player goes further over.
  let prev = -1;
  for (let k = 0.95; k <= 1.25; k += 0.02) {
    const u = DL.cue(vCorner * k, sMid);
    assert.ok(u >= prev, `urgency must never fall as speed rises (at ${k.toFixed(2)})`);
    prev = u;
  }
  // It is the SAME quantity on a straight, where the line's speed is vTop: a
  // car at vTop on the straight is on the pace, so the cue must be silent there
  // even though it would be screaming at that speed in the corner.
  assert.equal(DL.cue(api.vTop, api.straight / 2), 0);
  assert.ok(DL.cue(api.vTop, sMid) > 0.9, "the same speed mid-corner is a full cue");
});

test("with a baked racing line the ribbon follows IT, easing to the centre where the line has no opinion", () => {
  const DL = load();
  const api = stadium();
  // outside-inside-outside through the first corner, no opinion elsewhere
  api.lineAt = (s) => {
    s = ((s % api.total) + api.total) % api.total;
    const mid = api.straight + api.arc / 2;
    if (Math.abs(s - mid) < api.arc * 0.25) return { x: -5.5, w: 1 };            // apex: inside edge (−x)
    if (s > api.straight - 60 && s < api.straight) return { x: 5.5, w: 1 };     // turn-in: outside
    return { x: 5.5, w: 0 };                                                     // straight: no opinion
  };
  DL.build(api);
  const c = DL._cache();
  const lat = (s) => {
    const i = Math.round(s / c.step) % c.n, o = i * 14;
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 }; api.sample(i * c.step, smp);
    const x = (c.verts[o] + c.verts[o + 7]) / 2, z = (c.verts[o + 2] + c.verts[o + 9]) / 2;
    return (x - smp.p[0]) * smp.r[0] + (z - smp.p[2]) * smp.r[2];
  };
  assert.ok(Math.abs(lat(api.straight + api.arc / 2) - -5.5) < 0.3, `apex follows the baked line: ${lat(api.straight + api.arc / 2).toFixed(2)}`);
  assert.ok(Math.abs(lat(api.straight - 30) - 5.5) < 0.3, `turn-in follows the baked line: ${lat(api.straight - 30).toFixed(2)}`);
  assert.ok(Math.abs(lat(api.straight / 2)) < 0.3, `no opinion = centre: ${lat(api.straight / 2).toFixed(2)}`);
});
