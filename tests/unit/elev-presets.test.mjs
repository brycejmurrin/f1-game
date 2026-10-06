// ElevPresets: Flat / Rolling / Hilly → per-node heights[]; sanitize pads old
// saves to flat zeros. Pure module over a minimal VM (no DOM).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
function load() {
  const ctx = { console, Math, Object, Array, Float64Array, Number, String };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, "js/editor/elev-presets.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: "elev-presets.js" });
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
  assert.deepEqual(E.sanitize(pts, [1, 2]), [1, 2].concat(pts.slice(2).map(() => 0)).map((h, i) => i < 2 ? h : 0));
  const big = E.sanitize(pts, pts.map(() => 999));
  assert.ok(big.every((h) => h === 60));
  const tiny = E.sanitize(pts, [0.12, -0.13].concat(pts.slice(2).map(() => 0)));
  assert.equal(tiny[0], 0); // 0.12 → 0 on quarter lattice? 0.12 rounds to 0.00? Math.round(0.12*4)/4 = Math.round(0.48)/4 = 0
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
  const maxR = Math.max(...roll.heights.map(Math.abs));
  const maxH = Math.max(...hilly.heights.map(Math.abs));
  assert.ok(maxH >= maxR, "hilly peaks at least as high as rolling for the same seed");

  // One-shot replace (what commit uses): Flat clears Rolling.
  const cleared = E.apply("flat", pts, { seed: 99 });
  assert.ok(E.isFlat(cleared.heights));
});

test("unknown style → flat; short pts → flat", () => {
  const E = load();
  assert.equal(E.apply("mystery", oval(10)).style, "flat");
  assert.deepEqual(E.apply("hilly", [[0, 0], [1, 0]]).heights, [0, 0]);
});
