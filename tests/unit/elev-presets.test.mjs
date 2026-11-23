// ElevPresets: Flat / Rolling / Hilly → per-node heights[]; sanitize pads old
// saves to flat zeros. Pure module over a minimal VM (no DOM).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { absSrc } from "../helpers/abs-src.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
function load() {
  const ctx = { console, Math, Object, Array, Float64Array, Number, String };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, "js/editor/elev-presets.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/editor/elev-presets.js") });
  return ctx.ElevPresets;
}

function oval(n = 16, rx = 700, rz = 450) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.round(Math.cos(a) * rx * 4) / 4, Math.round(Math.sin(a) * rz * 4) / 4]);
  }
  return pts;
}

test("sanitize: missing heights → flat zeros; clamps to ±60 on the 0.25 m lattice", () => {
  const E = load();
  const pts = oval(12);
  assert.deepEqual(E.sanitize(pts, null), pts.map(() => 0));
  assert.deepEqual(E.sanitize(pts, []), pts.map(() => 0));
  // A short saved array keeps its prefix and pads the rest with flat zeros.
  assert.deepEqual(E.sanitize(pts, [1, 2]), [1, 2].concat(pts.slice(2).map(() => 0)));
  const big = E.sanitize(pts, pts.map(() => 999));
  assert.ok(big.every((h) => h === 60));
  const tiny = E.sanitize(pts, [0.12, -0.13].concat(pts.slice(2).map(() => 0)));
  assert.equal(tiny[0], 0, "0.12 m is under half a lattice step: rounds to 0");
  assert.equal(tiny[1], -0.25, "-0.13 m rounds to the nearest quarter metre, not toward 0");
  assert.equal(E.clampH(0.3), 0.25);
  assert.equal(E.clampH(-0.3), -0.25);
});

test("Flat / Rolling / Hilly presets write node heights; deterministic; undo-shaped replace", () => {
  const E = load();
  const pts = oval(20);
  const flat = E.apply("flat", pts, { seed: 7 });
  assert.equal(flat.style, "flat");
  assert.ok(E.isFlat(flat.heights));
  assert.equal(flat.heights.length, pts.length);

  const roll = E.apply("rolling", pts, { seed: 7 });
  assert.equal(roll.style, "rolling");
  assert.equal(roll.heights.length, pts.length);
  assert.equal(E.isFlat(roll.heights), false, "rolling moves some nodes");
  assert.ok(roll.heights.every((h) => Math.abs(h) <= 60));
  assert.equal(roll.heights[0], 0, "start pinned flat for a closed loop");

  const again = E.apply("rolling", pts, { seed: 7 });
  assert.deepEqual(again.heights, roll.heights, "deterministic per seed");

  const hilly = E.apply("hilly", pts, { seed: 7 });
  assert.equal(hilly.style, "hilly");
  // One seed can invert the order; compare the mean peak across many seeds.
  const meanPeak = (style) => {
    let sum = 0;
    for (let seed = 1; seed <= 24; seed++) sum += Math.max(...E.apply(style, pts, { seed }).heights.map(Math.abs));
    return sum / 24;
  };
  assert.ok(meanPeak("hilly") > meanPeak("rolling"), "hilly peaks higher than rolling on average");

  // One-shot replace (what commit uses): Flat clears Rolling.
  const cleared = E.apply("flat", pts, { seed: 99 });
  assert.ok(E.isFlat(cleared.heights));
});

test("pinning the start does not leave a wall where the lap closes", () => {
  const E = load();
  // Dense oval: the old feather scaled only the last three points, so seed 54
  // stepped 18 m → 4 m on one chord (30 %) and 8.5 m → 0 m across the start (20 %).
  const gradeRed = 0.15; // TrackValidate.LIMITS.gradeRed
  function worstGrade(pts, h) {
    let g = 0, seam = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gg = Math.abs(h[(i + 1) % h.length] - h[i]) / d;
      if (gg > g) g = gg;
      if (i === pts.length - 1) seam = gg;
    }
    return { g, seam };
  }
  const known = oval(80, 900, 550);
  const knownH = E.apply("hilly", known, { seed: 54 }).heights;
  const knownG = worstGrade(known, knownH);
  assert.equal(knownH[0], 0, "start stays pinned");
  assert.ok(knownG.g <= gradeRed, "hilly seed 54 grade " + (knownG.g * 100).toFixed(1) + "% is a wall");
  assert.ok(knownG.seam < 0.10, "closing chord grade " + (knownG.seam * 100).toFixed(1) + "%");
  for (const style of ["rolling", "hilly"]) {
    for (const n of [12, 40, 80]) {
      for (let seed = 1; seed <= 40; seed++) {
        const pts = oval(n, 900, 550);
        const h = E.apply(style, pts, { seed }).heights;
        assert.equal(h[0], 0);
        const w = worstGrade(pts, h);
        assert.ok(w.g <= gradeRed, style + " n=" + n + " seed " + seed + " grade " + (w.g * 100).toFixed(1) + "%");
      }
    }
  }
});

test("unknown style → flat; short pts → flat", () => {
  const E = load();
  assert.equal(E.apply("mystery", oval(10)).style, "flat");
  assert.deepEqual(E.apply("hilly", [[0, 0], [1, 0]]).heights, [0, 0]);
});

test("every planned bump respects the ~8 % grade cap (|rise| <= halfM / 19.6) for any seed and lap length", () => {
  const E = load();
  for (const style of ["rolling", "hilly"]) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const L of [1500, 4000, 7000]) {
        const bumps = E.plan(style, seed, L);
        assert.ok(bumps.length > 0, `${style} seed ${seed} planned no bumps`);
        for (const b of bumps) {
          assert.ok(Math.abs(b.rise) <= b.halfM / 19.6 + 1e-9, `${style} seed ${seed} L ${L}: rise ${b.rise} over halfM ${b.halfM}`);
          // Steepest slope of the cosine bump is rise * pi / (2 * halfM).
          assert.ok(Math.abs(b.rise) * Math.PI / (2 * b.halfM) <= Math.PI / (2 * 19.6) + 1e-9, `${style} seed ${seed}: grade over 8 %`);
        }
      }
    }
  }
});
