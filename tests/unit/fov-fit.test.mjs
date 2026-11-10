/* fov-fit.test.mjs — CamFovFit.fitFovY: landscape HFOV cap + portrait floor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gameSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/fov-fit.js"), "utf8") + "\nthis.exported = CamFovFit;",
    ctx, { filename: absSrc("js/camera/fov-fit.js") });
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

test("bad aspect / FOV never yields 0 or NaN (resize / orientation edge)", () => {
  const F = load();
  const inY = 64 * DEG;
  for (const aspect of [NaN, Infinity, -Infinity, 0, -1, undefined, null]) {
    const got = F.fitFovY(inY, /** @type {number} */ (aspect), { cine: false });
    assert.ok(Number.isFinite(got) && got > 0,
      `aspect=${String(aspect)} must stay a positive finite VFOV, got ${got}`);
  }
  // Infinite aspect used to collapse HFOV_MAX into fovYCap 0 → Inf perspective.
  assert.equal(F.fitFovY(inY, Infinity, {}), F.fitFovY(inY, 1, {}));
  for (const bad of [NaN, Infinity, -Infinity, 0, -0.5, undefined]) {
    const got = F.fitFovY(/** @type {number} */ (bad), 16 / 9, {});
    assert.ok(Number.isFinite(got) && got > 0, `fovY=${String(bad)} must fall back, got ${got}`);
  }
  // cine still refuses a poisoned authored FOV (projection safety).
  assert.ok(F.fitFovY(NaN, 16 / 9, { cine: true }) > 0);
});

// ---- #5015: the cap must not swallow the speed widen / deploy boost / lens deltas ----
function loadFovMode() {
  const ctx = { M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/camera/fov-mode.js"), "utf8") + "\nthis.exported = CamFov;", ctx,
    { filename: absSrc("js/camera/fov-mode.js") });
  return ctx.exported;
}

test("#5015 landscape: the cap fits the BASE and the dynamic boost survives on top (helmet/chase, phone and 16:9)", () => {
  const F = load(), M = loadFovMode();
  for (const aspect of [852 / 393, 844 / 390, 16 / 9, 21 / 9]) {
    for (const mode of ["helmet", "cockpit", "chase", "far"]) {
      const rest = M.modeFov(mode, 0, false), full = M.modeFov(mode, 1, true), boost = M.modeBoost(mode, 1, true);
      assert.equal(M.modeBoost(mode, 0, false), 0);
      assert.ok(Math.abs(full - rest - boost) < 1e-9, "modeBoost is exactly what modeFov added over its base");
      const atRest = F.fitFovY(rest * DEG, aspect, { boost: 0 });
      assert.equal(atRest, oldCapOnly(rest * DEG, aspect, false), "the rest framing is the old capped one, bit for bit");
      const old = F.fitFovY(full * DEG, aspect, {});
      assert.equal(old, atRest, `${mode} @${aspect.toFixed(2)}: without the boost the cap returns the same FOV at rest and flat out (the bug)`);
      const fitted = F.fitFovY(full * DEG, aspect, { boost: boost * DEG });
      assert.ok(Math.abs(fitted - (atRest + boost * DEG)) < 1e-9 || F.hfovFromVfov(fitted, aspect) >= F.HFOV_BOOST_MAX - 1e-9,
        `${mode} @${aspect.toFixed(2)}: full boost on top of the capped base (${(fitted / DEG).toFixed(1)}°)`);
      assert.ok(fitted > atRest + 5 * DEG, "the widen reaches the screen");
      const half = F.fitFovY(M.modeFov(mode, 0.5, false) * DEG, aspect, { boost: M.modeBoost(mode, 0.5, false) * DEG });
      assert.ok(half > atRest && half < fitted, "monotonic in speed");
    }
  }
});

test("#5015 boost edges: HFOV ceiling, negative lens delta, portrait and cine untouched, junk ignored", () => {
  const F = load();
  // Super-ultrawide: the boost stops at HFOV_BOOST_MAX and never drops below the plain cap.
  const wide = F.fitFovY(81 * DEG, 32 / 9, { boost: 17 * DEG });
  assert.ok(Math.abs(F.hfovFromVfov(wide, 32 / 9) - F.HFOV_BOOST_MAX) < 1e-9);
  assert.ok(wide > F.fitFovY(81 * DEG, 32 / 9, {}));
  // A punch-in (negative delta) still zooms in from the capped base.
  const a = 852 / 393, base = F.fitFovY(64 * DEG, a, {});
  assert.ok(Math.abs(F.fitFovY(61 * DEG, a, { boost: -3 * DEG }) - (base - 3 * DEG)) < 1e-9);
  // A base under the cap: the authored FOV passes whole (heli 36 + 6).
  assert.ok(Math.abs(F.fitFovY(42 * DEG, 16 / 9, { boost: 6 * DEG }) - 42 * DEG) < 1e-12);
  // Portrait and cine paths ignore the boost entirely.
  assert.equal(F.fitFovY(78 * DEG, 0.46, { boost: 14 * DEG }), F.fitFovY(78 * DEG, 0.46, {}));
  assert.equal(F.fitFovY(78 * DEG, 2.2, { cine: true, boost: 14 * DEG }), 78 * DEG);
  for (const junk of [NaN, Infinity, "3", null, undefined]) assert.equal(F.fitFovY(78 * DEG, a, { boost: junk }), F.fitFovY(78 * DEG, a, {}));
  assert.equal(F.fitFovY(10 * DEG, a, { boost: 20 * DEG }), 10 * DEG, "a boost larger than the FOV is not a base: plain fit");
});
