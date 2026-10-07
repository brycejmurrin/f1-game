/* grip-steer.test.mjs — own-state steering cap (plan slice 1).
 *
 * Fail-before: without GripSteer, notch-1 identity / peak clamp / no-curvature
 * contract cannot hold. Run: node --test tests/unit/grip-steer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/physics/grip-steer.js"), "utf8");
const ctx = {
  M4: {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
  },
};
vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
const GS = ctx.GripSteer;
assert.ok(GS && GS.apply, "GripSteer IIFE must assign the global");

test("source never names Tracks, curvature, or kCur", () => {
  assert.equal(/Tracks/.test(SRC), false);
  assert.equal(/\bcurvature\b/.test(SRC), false);
  assert.equal(/\bkCur\b/.test(SRC), false);
});

test("assistK: notch 1 is OFF, 10 is full", () => {
  assert.equal(GS.assistK(1), 0);
  assert.equal(GS.assistK(0), 0);
  assert.equal(GS.assistK(10), 1);
  assert.ok(GS.assistK(8) > GS.assistK(6));
  assert.ok(GS.assistK(6) > 0);
});

test("apply at k=0 is identity (characterization bit-identical path)", () => {
  const d = 0.42;
  const out = GS.apply(d, { speed: 40, vLat: 2, yawRate: 0.3, muF: 20, csFront: 130, af: 1.3, ar: 1.5, shaped: 1, dt: 1 / 60 }, 0);
  assert.equal(out.delta, d);
});

test("apply at rest / reverse is identity even when k>0", () => {
  const d = 0.35;
  assert.equal(GS.apply(d, { speed: 0, muF: 20, csFront: 130, af: 1, ar: 1, dt: 1 / 60 }, 1).delta, d);
  assert.equal(GS.apply(d, { speed: -12, muF: 20, csFront: 130, af: 1, ar: 1, dt: 1 / 60 }, 1).delta, d);
});

test("at speed with full lock demand, |delta| is capped near the front peak", () => {
  const muF = 22, cs = 130;
  const alphaPk = (Math.PI / 2) * muF / cs * GS.TARGET;
  const demand = 0.7;
  let capSm = 0;
  let delta = demand;
  for (let i = 0; i < 30; i++) {
    const out = GS.apply(demand, {
      speed: 45, vLat: 0, yawRate: 0, muF, csFront: cs,
      af: 1.3, ar: 1.5, braking: false, shaped: 1, capSm, dt: 1 / 60,
    }, 1);
    delta = out.delta;
    capSm = out.capSm;
  }
  assert.ok(Math.abs(delta) < Math.abs(demand), "must reduce full-lock demand");
  assert.ok(Math.abs(delta) <= alphaPk * 1.15 + 1e-6,
    `capped delta ${delta} should sit near alphaPk ${alphaPk}`);
});

test("normal cornering (βr opposite steer) stays on the peak-slip cap, not the tight countersteer blend", () => {
  // Real bicycle sign: right steer (s>0) with positive yaw → βr typically < 0.
  // The old −s·βr weight fired the countersteer blend here and crushed lock
  // well below αpk (hairpin 0.27 → 0.15 at notch 8). +s·βr keeps w≈0.
  const muF = 18, cs = 130, af = 1.3, ar = 1.5;
  const alphaPk = (Math.PI / 2) * muF / cs * GS.TARGET;
  const driver = 0.27;
  const st = {
    speed: 12, vLat: 0.3, yawRate: 0.65, muF, csFront: cs, af, ar,
    braking: false, shaped: 1, dt: 1 / 60,
  };
  const vx = Math.max(Math.abs(st.speed), GS.VX_FLOOR);
  const betaR = Math.atan2(st.vLat - ar * st.yawRate, vx);
  assert.ok(betaR < 0, `expected βr opposite right steer, got ${betaR}`);
  let capSm = 0, delta = driver;
  for (let i = 0; i < 50; i++) {
    const out = GS.apply(driver, { ...st, capSm }, GS.assistK(8));
    delta = out.delta;
    capSm = out.capSm;
  }
  // Must not be crushed toward 0.28·αpk (the old false countersteer blend).
  // A tiny raise from the −βr self term is fine; the bug was a ~40% cut.
  assert.ok(delta > 0.22, `hairpin lock must not collapse below peak (got ${delta}, αpk=${alphaPk})`);
  assert.ok(Math.abs(delta - driver) / driver < 0.08, `lock stays near driver (got ${delta} vs ${driver})`);
});

test("rear slide opens countersteer room (cap tracks same-sign s·βr) and preserves correction", () => {
  const base = {
    speed: 40, muF: 20, csFront: 130, af: 1.3, ar: 1.5,
    braking: false, shaped: 0.2, dt: 1 / 60, yawRate: 0,
  };
  // Cap formula: capCtr = 0.28·αpk + s·βr. Steering into a right slide
  // (s=+1, βr>0) raises +s·βr and opens room; left countersteer (s=−1, βr>0)
  // keeps w≈0 and stays on capIn so the correction is not stripped.
  const alphaPk = (Math.PI / 2) * 20 / 130 * GS.TARGET;
  let capSm = 0;
  for (let i = 0; i < 40; i++) {
    capSm = GS.apply(-0.4, { ...base, vLat: 6, capSm }, 1).capSm;
  }
  assert.ok(capSm > 0.25 * alphaPk - 1e-6, `settled floor holds (capSm=${capSm}, floor=${0.25 * alphaPk})`);
  const caught = GS.apply(-0.4, { ...base, vLat: 6, capSm }, 1).delta;
  assert.ok(caught < 0, "countersteer direction preserved");
  assert.ok(Math.abs(caught) > 0.05, "countersteer still has authority");
  // Same-state slide: assist must not strip a modest left correction.
  const driver = -0.15;
  const slide = {
    speed: 20, vLat: 5, yawRate: 0.9, muF: 18, csFront: 130,
    af: 1.3, ar: 1.5, braking: false, shaped: -0.5, dt: 1 / 60,
  };
  let d = driver, c = 0;
  for (let i = 0; i < 50; i++) {
    const o = GS.apply(driver, { ...slide, capSm: c }, GS.assistK(8));
    d = o.delta; c = o.capSm;
  }
  assert.ok(d / driver >= 0.95, `slide countersteer retained ${(d / driver * 100).toFixed(1)}% (need ≥95%)`);
});

test("VX_FLOOR matches the player-forces slip |vx| floor (4 m/s)", () => {
  assert.equal(GS.VX_FLOOR, 4);
});

test("forPlayer is identity at OFF and pools without changing the apply result", () => {
  GS.setLevel(1);
  const c = { vLat: 1, yawRateCur: 0.2, speed: 30, gripSteerCapSm: 0 };
  const opts = { muF: 18, csFront: 130, af: 1.3, ar: 1.5, braking: false, shaped: 0.5, dt: 1 / 60 };
  assert.equal(GS.forPlayer(0.3, c, opts), 0.3);
  GS.setLevel(8);
  const a = GS.forPlayer(0.3, c, opts);
  const b = GS.forPlayer(0.3, c, opts);
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.ok(Math.abs(a) <= 0.3 + 1e-9);
});

test("PRESETS bundle gripSteer: ROOKIE/RELAX on, STANDARD/PRO off", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/input/steer-tuning.js"), "utf8");
  const at = src.indexOf("const PRESETS = {");
  assert.notEqual(at, -1);
  const open = src.indexOf("{", at);
  let depth = 0, end = open;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end++; break; } }
  }
  const body = src.slice(open, end);
  const grab = (name) => {
    const m = body.match(new RegExp(name + ":\\s*\\{([^}]*)\\}", "s"));
    assert.ok(m, `preset ${name} missing`);
    const g = m[1].match(/gripSteer:\s*(\d+)/);
    assert.ok(g, `preset ${name} missing gripSteer`);
    return +g[1];
  };
  assert.equal(grab("rookie"), 8);
  assert.equal(grab("relax"), 6);
  assert.equal(grab("standard"), 1);
  assert.equal(grab("pro"), 1);
});
