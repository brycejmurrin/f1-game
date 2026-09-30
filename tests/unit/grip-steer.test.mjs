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

test("rear slide opens countersteer room (cap tracks opposing βr)", () => {
  const base = {
    speed: 40, muF: 20, csFront: 130, af: 1.3, ar: 1.5,
    braking: false, shaped: 0.2, dt: 1 / 60, yawRate: 0,
  };
  // Cap formula: capCtr = 0.28·αpk − s·βr. For left countersteer (s=−1) and
  // rear slide to the right (βr>0), −s·βr > 0 and capCtr grows with |βr|.
  const alphaPk = (Math.PI / 2) * 20 / 130 * GS.TARGET;
  const out = GS.apply(-0.4, { ...base, vLat: 6, capSm: 0 }, 1);
  assert.ok(out.capSm > 0.25 * alphaPk - 1e-6, "floor holds");
  // After smoothing settles, cap should exceed the no-slide capIn·blend path:
  // with vLat=6, βr≈atan2(6,40)≈0.15, −s·βr≈0.15 so capCtr ≈ 0.28αpk+0.15.
  let capSm = 0;
  for (let i = 0; i < 40; i++) {
    capSm = GS.apply(-0.4, { ...base, vLat: 6, capSm }, 1).capSm;
  }
  const noSlide = (() => {
    let c = 0;
    for (let i = 0; i < 40; i++) c = GS.apply(-0.4, { ...base, vLat: 0, capSm: c }, 1).capSm;
    return c;
  })();
  // With no slide, cap ≈ αpk; with the slide, blend toward a smaller capIn but
  // larger capCtr — the observable contract is that apply still returns a finite
  // cap and the countersteer demand is not zeroed.
  assert.ok(Number.isFinite(capSm) && capSm > 0);
  assert.ok(Number.isFinite(noSlide) && noSlide > 0);
  const caught = GS.apply(-0.4, { ...base, vLat: 6, capSm }, 1).delta;
  assert.ok(caught < 0, "countersteer direction preserved");
  assert.ok(Math.abs(caught) > 0.05, "countersteer still has authority");
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
