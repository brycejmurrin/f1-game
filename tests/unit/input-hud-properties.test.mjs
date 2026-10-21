/* input-hud-properties.test.mjs — property-based checks (fast-check) for the stick response the car gets and the
 * gap formatters every race HUD prints (B·H11 testing research, PR #3384).
 *
 * The stick: a real Input in the key-binds VM rig, a fake standard pad, Input.poll() then Input.steer() — the
 * whole pad path (rest, dead zone, saturation, response curve) over generated DEAD ZONE / SATURATION settings.
 * The formatters: HudReadouts.fmtGapSec / fmtGap over generated seconds. A failure prints fast-check's seed and
 * path; pass them back as { seed, path } to replay the shrunk case.
 *
 * Run: node --test tests/unit/input-hud-properties.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { boot, fakePad } from "../helpers/key-binds-rig.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNS = { numRuns: 300 };

// One rig for every sample: settings and the axis are set per call, the pad path is stateless (padAxisShape).
const { Input, sb, fire } = boot();
const { pad } = fakePad(sb, fire);
const stickSteer = (x, dz, sat) => {
  Input.setPadDeadzone(dz);
  Input.setPadSaturation(sat);
  pad.axes = [x, 0, 0, 0];
  Input.poll();
  return Input.steer();
};
const settings = fc.record({ dz: fc.double({ min: 0, max: 0.3, noNaN: true }), sat: fc.double({ min: 0, max: 0.3, noNaN: true }) });
const axis = fc.double({ min: -1, max: 1, noNaN: true });

test("stick response is odd-symmetric, bounded and finite at every DEAD ZONE / SATURATION", () => {
  fc.assert(fc.property(settings, axis, ({ dz, sat }, x) => {
    const a = stickSteer(x, dz, sat), b = stickSteer(-x, dz, sat);
    assert.ok(Number.isFinite(a), `finite: ${a}`);
    assert.ok(Math.abs(a) <= 1 + 1e-12, `bounded: ${a}`);
    assert.ok(Math.abs(a + b) < 1e-9, `odd: f(${x})=${a}, f(${-x})=${b}`);
  }), RUNS);
});

test("stick response is monotone: more deflection never steers less", () => {
  fc.assert(fc.property(settings, axis, axis, ({ dz, sat }, p, q) => {
    const [lo, hi] = p <= q ? [p, q] : [q, p];
    assert.ok(stickSteer(lo, dz, sat) <= stickSteer(hi, dz, sat) + 1e-12, `f(${lo}) > f(${hi})`);
  }), RUNS);
});

test("inside the dead zone the stick is centred; past the saturation edge it is full lock", () => {
  fc.assert(fc.property(settings, fc.double({ min: 0, max: 1, noNaN: true }), ({ dz, sat }, t) => {
    if (dz > 0.001) assert.equal(stickSteer(t * dz * 0.99, dz, sat), 0, `|x| < dz=${dz} must not steer`);
    const edge = 1 - sat + t * sat;   // between the saturation edge and the rim
    assert.ok(Math.abs(stickSteer(edge, dz, sat) - 1) < 1e-6, `x=${edge} >= 1-sat=${1 - sat} is full lock`);
  }), RUNS);
});

test("leaving the dead zone is continuous: a hair past it steers a hair, never a jump", () => {
  fc.assert(fc.property(settings, fc.double({ min: 0, max: 0.01, noNaN: true }), ({ dz, sat }, d) => {
    const out = stickSteer(dz + d, dz, sat);
    assert.ok(Math.abs(out) <= 0.05, `x = dz+${d} (dz=${dz}) steered ${out}`);
  }), RUNS);
});

// The formatters, from the shipped file.
const ctx = vm.createContext({ Math, Number, String, Object, Array, isFinite });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/hud-readouts.js"), "utf8").replace(/^const HudReadouts\b/m, "var HudReadouts"), ctx,
  { filename: absSrc("js/ui/hud-readouts.js") });
const HR = vm.runInContext("HudReadouts", ctx);
const profile = fc.constantFrom("standard", "minimal", "broadcast", undefined);
const secs = fc.double({ min: -200, max: 200, noNaN: true });

test("gap chip magnitude: unsigned, within its printed precision, monotone", () => {
  fc.assert(fc.property(secs, profile, (s, p) => {
    const out = HR.fmtGapSec(s, p);
    assert.equal(out, HR.fmtGapSec(-s, p), "no sign on the chip");
    assert.ok(/^\d+\.\d{1,2}$/.test(out), `digits.digits: ${out}`);
    const dp = out.split(".")[1].length;
    assert.ok(Math.abs(parseFloat(out) - Math.abs(s)) <= 0.5 * 10 ** -dp + 1e-9, `${s} -> ${out}`);
  }), RUNS);
  fc.assert(fc.property(fc.double({ min: 0, max: 99, noNaN: true }), fc.double({ min: 0, max: 99, noNaN: true }), profile, (a, b, p) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    assert.ok(parseFloat(HR.fmtGapSec(lo, p)) <= parseFloat(HR.fmtGapSec(hi, p)), `${lo} prints above ${hi}`);
  }), RUNS);
});

test("REL/tower gap: the sign is the direction, the length is bounded, 99+ past the board, -- for no number", () => {
  fc.assert(fc.property(secs, fc.boolean(), profile, (s, ahead, p) => {
    const out = HR.fmtGap(s, ahead, p);
    assert.equal(out[0], ahead ? "-" : "+", out);
    assert.ok(out.length <= 6, `fits the column: ${out}`);
    if (Math.abs(s) >= 99.5) assert.equal(out.slice(1), "99+");
    else assert.equal(out.slice(1), HR.fmtGapSec(s, p), "same digits as the chip");
  }), RUNS);
  for (const bad of [NaN, Infinity, -Infinity, "x"]) {
    assert.equal(HR.fmtGapSec(bad), "--");
    assert.equal(HR.fmtGap(bad, true), "---");
  }
});
