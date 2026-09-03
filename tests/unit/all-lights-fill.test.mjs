/* all-lights-fill.test.mjs — _fillAllLights must write the SAME bytes it used to.
 *
 * Of the 15 lanes per baked lamp, twelve are static (position, radius, cone
 * dir/cos, bleed, volW, glareW) and three are not (rgb, which flicker and the
 * warm-up ramp scale). The function rewrote all fifteen every frame, for every
 * lamp, on both backends, whenever per-chunk lamps are on — which is now every
 * preset in every condition. It copies the statics once per source array now.
 *
 * That is only safe if the invalidation is right, so this asserts the whole
 * contract against a reference implementation that always writes everything:
 * a flicker sequence, a source SWAP (the case a static cache gets wrong), and
 * the generation counter that LampChunks and WGX both key their caches on.
 *
 * Run: node --test tests/unit/all-lights-fill.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// frame-lights.js is an IIFE exporting a fixed surface, and _fillAllLights is
// internal to it. Widen the export list for the test rather than reaching past
// the IIFE — the same shape the lamp-chunks drag guard uses. Asserting the
// anchor first means this fails loudly if the export list is reformatted,
// instead of silently testing nothing.
function loadFill() {
  const src = readFileSync(path.join(ROOT, "js/lighting/frame-lights.js"), "utf8");
  const anchor = "  return { setFrameLights, appendCarTailLights };";
  assert.ok(src.includes(anchor), "frame-lights.js export list moved — update this loader");
  const patched = src.replace(anchor,
    "  return { setFrameLights, appendCarTailLights, _fillAllLights };");
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sb.window = sb;
  sb.Log = { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false };
  vm.createContext(sb);
  // FrameLights destructures LightKnobs.LT at eval — the registry loads first.
  vm.runInContext(readFileSync(path.join(ROOT, "js/lighting/knobs.js"), "utf8"), sb);
  vm.runInContext(patched, sb);
  const LT = vm.runInContext("FrameLights", sb);
  assert.equal(typeof LT._fillAllLights, "function", "_fillAllLights not exported by the patch");
  return LT._fillAllLights;
}

// A stride-15 baked set with DISTINCT values in every lane, so a lane that is
// silently dropped or written from the wrong offset cannot coincidentally match.
function makeSet(n, seed) {
  const L = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 15; k++) L.push(seed + i * 15 + k * 0.125);
  return L;
}
// The reference: what the function did before — every lane, every call.
function reference(src, sr, sg, sb2, fl) {
  const out = [];
  for (let i = 0; i < src.length; i += 15) {
    const f = fl(i);
    for (let k = 0; k < 15; k++) out[i + k] = src[i + k];
    out[i + 3] = src[i + 3] * sr * f[0];
    out[i + 4] = src[i + 4] * sg * f[1];
    out[i + 5] = src[i + 5] * sb2 * f[2];
  }
  return out;
}

test("every lane matches a full rewrite, across a flicker sequence and a source swap", () => {
  const fill = loadFill();

  const A = makeSet(37, 1), B = makeSet(23, 500);   // different length AND content
  // A flicker function that actually moves, and differs per lamp and per step.
  const mk = (step) => (o) => [1 + 0.3 * Math.sin(o + step), 1 - 0.2 * Math.cos(o * 0.5 + step),
                               1 + 0.1 * Math.sin(o * 0.25 - step)];
  const plan = [
    [A, 1.0, 1.0, 1.0], [A, 1.0, 1.0, 1.0], [A, 0.7, 0.8, 0.9],
    [B, 1.0, 1.0, 1.0],                 // SWAP — statics must be re-copied
    [B, 0.5, 0.5, 0.5], [A, 1.0, 1.0, 1.0],   // and swapped BACK
  ];
  plan.forEach(([src, sr, sg, sb2], step) => {
    const fl = mk(step);
    const frame = {};
    fill(frame, src, sr, sg, sb2, fl);
    const want = reference(src, sr, sg, sb2, fl);
    assert.equal(frame.allLights.length, want.length, `length differs at step ${step}`);
    for (let i = 0; i < want.length; i++)
      assert.equal(frame.allLights[i], want[i],
        `lane ${i % 15} of lamp ${(i / 15) | 0} differs at step ${step}`);
  });
});

test("the generation counter still moves exactly when consumers need it to", () => {
  // LampChunks memoises on the lights ARRAY IDENTITY and WGX on this counter,
  // so a missed bump means a stale GPU buffer and a spurious one undoes the
  // round-7 work that stopped WGX re-uploading 64 KB a frame.
  const fill = loadFill();
  const A = makeSet(12, 3), B = makeSet(12, 77);
  const steady = () => [1, 1, 1];
  const gen = (src, sr) => { const f = {}; fill(f, src, sr, 1, 1, steady); return f.allLightsGen; };

  const g0 = gen(A, 1);
  assert.equal(gen(A, 1), g0, "an identical frame must NOT bump the generation");
  const g1 = gen(A, 0.5);
  assert.notEqual(g1, g0, "a colour change must bump the generation");
  const g2 = gen(B, 0.5);
  assert.notEqual(g2, g1, "a new source array must bump the generation");

  // THE CASE THAT HIDES. A rebuild mints a new array whose COLOURS happen to
  // match the old one but whose static lanes moved — a lamp-position knob, say.
  // The colour comparison cannot see that, so without an explicit bump on a
  // fresh source the generation stays put and WGX keeps a GPU buffer holding
  // the OLD positions while the CPU side has the new ones. A first version of
  // this test swapped in a set whose colours also differed, which made the
  // whole hazard invisible: mutation-testing caught that, not review.
  const C = makeSet(12, 3);                 // identical to A, then move statics
  for (let i = 0; i < C.length; i += 15) { C[i] += 900; C[i + 6] += 5; }
  const gA = gen(A, 1);
  const gC = gen(C, 1);                     // same rgb lanes as A, moved positions
  assert.notEqual(gC, gA,
    "a new source array with unchanged colours but MOVED positions must still bump");
  // And the buffer must be the SAME object throughout — LampChunks' identity
  // memo and the pooling both depend on it never being reallocated.
  const f1 = {}, f2 = {};
  fill(f1, A, 1, 1, 1, steady);
  fill(f2, A, 1, 1, 1, steady);
  assert.equal(f1.allLights, f2.allLights, "the pooled buffer was replaced");
});
