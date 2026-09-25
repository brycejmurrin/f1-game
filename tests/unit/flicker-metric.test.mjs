/* flicker-metric.test.mjs — the rendered flicker gate's metric, on synthetic frames.
 *
 * tools/shot/flicker-gate.mjs parks a still camera at known z-fight sites and
 * scores per-pixel temporal instability with tools/lib/flicker-metric.mjs. The
 * browser half cannot run here; this pins the arithmetic it relies on, so a
 * green or red from the job means the frames, not a broken counter:
 *   - a stable scene scores 0 and passes;
 *   - a z-fight (a region whose pixels re-roll between two colours on every
 *     jitter frame) is found and fails its ceiling;
 *   - a legitimately moving edge (a sub-pixel shift, the thing a tiny dolly
 *     actually does to real geometry) is NOT counted;
 *   - isolated speckle is dropped by the cluster floor;
 *   - A != A2 (an unfrozen clock) is reported as its own failure.
 *
 * Run: node --test tests/unit/flicker-metric.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, clusters, flickerScore, flipMask, frameDelta, judge, lumaFromRGBA,
} from "../../tools/lib/flicker-metric.mjs";
import { SITES, JITTER, dolly, parseArgs } from "../../tools/shot/flicker-gate.mjs";
import fs from "node:fs";

const W = 96, H = 64, N = W * H;

/** Deterministic PRNG (mulberry32) so the "random" fight pattern is repeatable. */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A textured but static scene: a gradient with a hard vertical edge at x = 40. */
function scene() {
  const f = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = x < 40 ? 30 + (y % 8) : 200 - (x % 5);
  return f;
}

/** Paint a z-fight into `f`: inside the box each pixel shows one of two surfaces at random. */
function fight(f, rand, box = { x0: 50, x1: 90, y0: 10, y1: 50 }, lo = 20, hi = 180) {
  const g = f.slice();
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) g[y * W + x] = rand() < 0.5 ? lo : hi;
  return g;
}

test("luma is Rec.601 and rejects a short buffer", () => {
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...lumaFromRGBA(rgba, 2, 2)], [76, 150, 29, 255]);
  assert.throws(() => lumaFromRGBA(rgba, 3, 2), /need 24 bytes/);
});

test("flip mask, frame delta and 8-connected clusters", () => {
  const a = Uint8Array.from([0, 0, 100, 0]), b = Uint8Array.from([0, 49, 100, 200]);
  assert.deepEqual([...flipMask(a, b, 48)], [0, 1, 0, 1]);
  assert.deepEqual(frameDelta(a, b), { maxDelta: 200, diffPx: 2 });
  // a diagonal line is ONE 8-connected component; a lone pixel is dropped by the floor
  const m = new Uint8Array(8 * 8);
  for (let i = 0; i < 6; i++) m[i * 8 + i] = 1;
  m[7 * 8 + 0] = 1;
  assert.deepEqual(clusters(m, 8, 8, 2), { pixels: 6, count: 1, largest: 6 });
  assert.deepEqual(clusters(m, 8, 8, 1), { pixels: 7, count: 2, largest: 6 });
  // a frame-sized blob must not blow the stack
  const big = new Uint8Array(400 * 400).fill(1);
  assert.equal(clusters(big, 400, 400, 9).largest, 160000);
});

test("a stable scene scores zero and passes", () => {
  const a = scene();
  const s = flickerScore({ a, a2: a.slice(), jit: JITTER.map(() => a.slice()), w: W, h: H });
  assert.equal(s.still.diffPx, 0);
  assert.equal(s.fight.px, 0);
  assert.equal(judge(s, { maxFrac: 0.001 }).ok, true);
});

test("a z-fight region re-rolling on every jitter frame is found and fails its ceiling", () => {
  const base = scene(), rand = rng(7);
  const a = fight(base, rand);
  const jit = JITTER.map(() => fight(base, rand));
  const s = flickerScore({ a, a2: a.slice(), jit, w: W, h: H });
  const area = 40 * 40;
  // 2-of-4 at p = 0.5 keeps ~69 % of the region; the cluster floor must keep nearly all of that
  assert.ok(s.fight.px > area * 0.5, `found ${s.fight.px} of ${area} fighting px`);
  assert.ok(s.fight.px <= area, "nothing outside the fight region may count");
  assert.ok(s.fight.largest > area * 0.4, "a fight at this density percolates into one large cluster");
  const v = judge(s, { maxFrac: 0.02 });
  assert.equal(v.ok, false);
  assert.match(v.reasons.join("\n"), /^fight:/m);
});

test("the rejected AND-of-two-moves design would have erased the same fight (why 2-of-4)", () => {
  const base = scene(), rand = rng(11);
  const a = fight(base, rand);
  const jit = [fight(base, rand), fight(base, rand)];
  // Two frames AND-ed == minFlips 2 of 2: ~25 % density, below the 8-neighbour percolation threshold.
  const and2 = flickerScore({ a, a2: a.slice(), jit, w: W, h: H, minFlips: 2 });
  const two4 = flickerScore({ a, a2: a.slice(), jit: JITTER.map(() => fight(base, rand)), w: W, h: H });
  assert.ok(two4.fight.px > 3 * and2.fight.px, `2-of-4 ${two4.fight.px} px vs AND-of-2 ${and2.fight.px} px`);
});

test("a sub-pixel edge shift (real geometry under a tiny dolly) is not counted", () => {
  const a = scene();
  // Each jitter frame blends the edge column 20 % toward its neighbour: the most
  // a <= 0.1 px shift can do to a 170-luma edge is ~34, under the 48 step.
  const jit = JITTER.map((m) => {
    const f = a.slice();
    for (let y = 0; y < H; y++) {
      const i = y * W + (m > 0 ? 40 : 39), j = y * W + (m > 0 ? 39 : 40);
      f[i] = Math.round(f[i] * 0.8 + f[j] * 0.2);
    }
    return f;
  });
  const s = flickerScore({ a, a2: a.slice(), jit, w: W, h: H });
  assert.equal(s.fight.px, 0);
  assert.ok(judge(s, { maxFrac: 0 }).ok);
});

test("isolated speckle below the cluster floor is dropped", () => {
  const a = scene();
  const jit = JITTER.map(() => {
    const f = a.slice();
    for (const [x, y] of [[5, 5], [20, 30], [70, 12], [88, 60]]) f[y * W + x] ^= 0xff;
    return f;
  });
  const s = flickerScore({ a, a2: a.slice(), jit, w: W, h: H });
  assert.ok(s.jitter.flipPx.every((n) => n === 4), "every jitter frame did flip the speckle");
  assert.equal(s.fight.px, 0, "4 lone pixels are not a fight");
});

test("A != A2 (an unfrozen time source) is its own failure, even with no fight", () => {
  const a = scene();
  const a2 = a.slice();
  for (let i = 0; i < 30; i++) a2[i] = 255 - a2[i];
  const s = flickerScore({ a, a2, jit: JITTER.map(() => a.slice()), w: W, h: H });
  assert.equal(s.fight.px, 0);
  assert.ok(s.still.flipPx > 0);
  const v = judge(s, { maxFrac: 1 });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /^still-frames-differ/);
});

test("frame-size and jitter-count mismatches throw instead of scoring garbage", () => {
  const a = scene();
  assert.throws(() => flickerScore({ a, a2: a, jit: [a], w: W, h: H }), /jitter frames/);
  assert.throws(() => flickerScore({ a, a2: a.subarray(1), jit: [a, a], w: W, h: H }), /frame a2/);
});

test("the gate's site table is well-formed and names real circuits", () => {
  assert.ok(SITES.length >= 6 && SITES.length <= 12, `${SITES.length} sites`);
  const ids = new Set();
  for (const s of SITES) {
    assert.ok(!ids.has(s.id), `duplicate site ${s.id}`); ids.add(s.id);
    assert.ok(fs.existsSync(new URL(`../../js/circuits/${s.track}.js`, import.meta.url)), `${s.id}: no js/circuits/${s.track}.js`);
    assert.ok(s.space === "scenery" || s.space === "racing", `${s.id}: space`);
    assert.ok(s.frac >= 0 && s.frac < 1, `${s.id}: frac`);
    assert.ok(Array.isArray(s.eye) && s.eye.length === 3 && Array.isArray(s.look) && s.look.length === 3, `${s.id}: pose`);
    assert.ok(s.maxFrac > 0 && s.maxFrac < 0.1, `${s.id}: ceiling ${s.maxFrac}`);
    assert.ok(s.jitterM > 0 && s.jitterM <= 0.01, `${s.id}: jitter ${s.jitterM} m would move real edges`);
    assert.ok(s.why && s.target, `${s.id}: every site says what it holds and what its ceiling is a tenth of`);
  }
  assert.ok(ids.has("madrid-overpass-soffit"), "the positive-control site must stay in the table");
  assert.ok(JITTER.length >= DEFAULTS.minFlips);
});

test("dolly moves eye and target together along the view ray", () => {
  const p = dolly({ eye: [0, 0, 0], target: [3, 4, 0], fov: 60 }, 0.005);
  assert.deepEqual(p.eye.map((v) => +v.toFixed(6)), [0.003, 0.004, 0]);
  assert.deepEqual(p.target.map((v) => +v.toFixed(6)), [3.003, 4.004, 0]);
  assert.throws(() => parseArgs(["--backend", "vulkan"]), /--backend/);
  assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);
  assert.deepEqual(parseArgs(["--site", "a", "--site", "b"]).sites, ["a", "b"]);
});
