/* fov-fit.test.mjs — CamFovFit.fitFovY: landscape HFOV cap + portrait floor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/fov-fit.js"), "utf8") + "\nthis.exported = CamFovFit;",
    ctx);
  return ctx.exported;
}

/** Old game.js inline formula (cap only) — landscape must stay bit-identical. */
function oldCapOnly(fovYRad, aspect, cine) {
  if (cine) return fovYRad;
  const HFOV_MAX = 86 * Math.PI / 180;
  const fovYCap = 2 * Math.atan(Math.tan(HFOV_MAX / 2) / Math.max(aspect, 0.0001));
  return Math.min(fovYRad, fovYCap);
}

const DEG = Math.PI / 180;

test("16:9 landscape: bit-identical to the old HFOV_MAX cap", () => {
  const F = load();
  const aspect = 16 / 9;
  for (const deg of [18, 20, 30, 48, 62, 64, 78, 90]) {
    const inY = deg * DEG;
    const got = F.fitFovY(inY, aspect, { cine: false });
    const legacy = oldCapOnly(inY, aspect, false);
    assert.equal(got, legacy, `${deg}° VFOV @16:9 must match old formula`);
  }
});

test("21:9 ultrawide: cap unchanged vs old formula", () => {
  const F = load();
  const aspect = 21 / 9;
  for (const deg of [18, 20, 30, 62, 64, 78]) {
    const inY = deg * DEG;
    assert.equal(F.fitFovY(inY, aspect, {}), oldCapOnly(inY, aspect, false));
  }
  // Cap binds: resulting HFOV equals HFOV_MAX.
  const fitted = F.fitFovY(78 * DEG, aspect, {});
  assert.ok(Math.abs(F.hfovFromVfov(fitted, aspect) - F.HFOV_MAX) < 1e-12);
});

test("square and near-landscape keep authored telephoto framing", () => {
  const F = load();
  for (const aspect of [1, 1.0001, 4 / 3]) {
    for (const deg of [18, 20, 30, 64, 90]) {
      const inY = deg * DEG;
      assert.equal(F.fitFovY(inY, aspect), oldCapOnly(inY, aspect, false),
        `${deg}° @${aspect} must use the cap-only policy`);
    }
  }
});

test("portrait floor remains active up to the square boundary", () => {
  const F = load();
  for (const aspect of [0.46, 9 / 16, 0.8, 0.9999]) {
    const got = F.fitFovY(20 * DEG, aspect);
    const expected = Math.min(2 * Math.atan(Math.tan(F.HFOV_MIN / 2) / aspect), F.FOVY_MAX);
    assert.equal(got, expected, `portrait @${aspect} must retain the floor and ceiling`);
  }
});

test("0.46 portrait: HFOV floor widens VFOV (chase / cockpit range)", () => {
  const F = load();
  const aspect = 0.46;
  for (const deg of [64, 70, 78]) {
    const inY = deg * DEG;
    const legacy = oldCapOnly(inY, aspect, false);
    const got = F.fitFovY(inY, aspect, { cine: false });
    assert.ok(got > legacy, `${deg}° portrait must widen vs cap-only`);
    assert.ok(got > inY, `${deg}° portrait must raise authored VFOV`);
    const hfov = F.hfovFromVfov(got, aspect);
    // Floor applied; FOVY_MAX may soft-limit a few degrees under HFOV_MIN.
    const hfovAtMax = F.hfovFromVfov(F.FOVY_MAX, aspect);
    const target = Math.min(F.HFOV_MIN, hfovAtMax);
    assert.ok(hfov + 1e-9 >= target, `HFOV ${hfov / DEG}° must reach floor-or-ceiling`);
    assert.ok(got <= F.FOVY_MAX + 1e-12, "VFOV must not exceed FOVY_MAX");
  }
});

test("cine passthrough: authored VFOV untouched on every aspect", () => {
  const F = load();
  for (const deg of [18, 60, 120]) {
    const inY = deg * DEG;
    for (const aspect of [16 / 9, 21 / 9, 0.46, 1]) {
      assert.equal(F.fitFovY(inY, aspect, { cine: true }), inY);
      assert.equal(F.fitFovY(inY, aspect, { cine: true }), oldCapOnly(inY, aspect, true));
    }
  }
});

test("reduce-motion is irrelevant: helper has no motion / store / DOM dependency", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/camera/fov-fit.js"), "utf8");
  assert.doesNotMatch(src, /reduce-?motion|prefers-reduced-motion|GameStore|localStorage|\bdocument\b|\bwindow\b/i);
  const F = load();
  // Pure: identical inputs → identical outputs (no ambient motion/store side channel).
  const a = F.fitFovY(64 * DEG, 0.46, { cine: false });
  const b = F.fitFovY(64 * DEG, 0.46, { cine: false });
  assert.equal(a, b);
});

test("game.js calls CamFovFit.fitFovY; no inline HFOV_MAX block remains", () => {
  // Through gameSource() so the pin survives the next carve (source-pin-hygiene).
  const g = gameSource();
  assert.match(g, /CamFovFit\.fitFovY\(/);
  assert.doesNotMatch(g, /const HFOV_MAX\s*=\s*86/);
});
