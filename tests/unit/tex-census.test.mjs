/* tex-census.test.mjs — the texture-byte instrument.
 *
 * WHY THIS EXISTS. docs/plans/2026-09-14-texture-memory-plan.md opens with a
 * number nobody has measured: car liveries at ~147 MB of VRAM, roughly TEN
 * TIMES the packed world geometry. That figure is ARITHMETIC from source
 * constants (liverytex.js SIZE 1024 x SIZE_H 1280, RGBA, mipmapped, one atlas a
 * car) and nothing in the tree could confirm or refute it — there was no
 * texture-memory hook at all, and __tlx.memState() covers three's retained
 * counts on the TLX leg only.
 *
 * notes/PERF-FINDINGS.md §0 is blunt about why that matters: the wrong
 * instrument here does not give a worse number, it gives a CONFIDENT NUMBER
 * ABOUT THE WRONG THING. So the census comes before the change that would act
 * on it, and it is tested against the REAL glx.js through the recording mock
 * (tests/helpers/glx-mock.mjs) rather than a reimplementation.
 *
 * The assertions that matter:
 *   1. bytes are the EXACT mip-chain sum, not w*h*4*1.333 — the rule of thumb
 *      is wrong for a non-square texture, and 1024x1280 is non-square;
 *   2. a freed texture leaves the ledger, so the census tracks RESIDENT bytes
 *      rather than bytes ever created;
 *   3. an empty census reports 0, never undefined. §2i and §2j of the ledger
 *      are both about instruments that could not say "I measured nothing", and
 *      a hook that reads undefined-as-zero is how a 147 MB problem gets
 *      reported as solved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootGlx } from "../helpers/glx-mock.mjs";

// The exact resident size of a full mip chain. Every level down to 1x1, each
// level's dimensions halved and floored at 1 — which is NOT w*h*4*4/3 once the
// texture stops being square: 1024x1280 keeps a 1-wide column of levels after
// the width bottoms out.
function mipBytes(w, h, layers = 1, bpt = 4) {
  let total = 0, mw = w, mh = h;
  for (;;) {
    total += mw * mh * layers * bpt;
    if (mw === 1 && mh === 1) return total;
    mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
  }
}

const img = (w, h) => ({ width: w, height: h });

test("an empty census reports zero, not undefined", () => {
  const h = bootGlx();
  const c = h.GLX.texCensus();
  assert.ok(c, "texCensus() must return an object even with nothing resident");
  assert.equal(typeof c.bytes, "number", "bytes must be a NUMBER when empty");
  assert.equal(c.bytes, 0);
  assert.equal(c.count, 0);
  // The distinction §2j is about: a census that cannot name what it left out is
  // not a measurement, it is a number with a silent denominator.
  assert.ok(Array.isArray(c.excludes) && c.excludes.length > 0,
    "the census must name what it does NOT account for");
});

test("a 2D texture is counted at its exact mip-chain size", () => {
  const h = bootGlx();
  h.GLX.createTexture(img(1024, 1280));            // one livery atlas
  const c = h.GLX.texCensus();
  assert.equal(c.count, 1);
  assert.equal(c.bytes, mipBytes(1024, 1280));
  // The rule of thumb everyone quotes is w*h*4*1.333. On a NON-square texture
  // it is wrong, and the livery atlas is non-square — so the census must not be
  // implemented with it.
  assert.notEqual(c.bytes, Math.round(1024 * 1280 * 4 * 1.333));
});

test("the census reproduces the livery arithmetic the plan opens with", () => {
  const h = bootGlx();
  for (let i = 0; i < 22; i++) h.GLX.createTexture(img(1024, 1280));
  const c = h.GLX.texCensus();
  assert.equal(c.count, 22);
  const mb = c.bytes / 1048576;
  // The plan's figure is ~147 MB for a full grid. This pins the INSTRUMENT
  // against that arithmetic; what it cannot do is prove 22 atlases are actually
  // resident in a real race, which is what the live reading is for.
  assert.ok(mb > 140 && mb < 155, `expected ~147 MB for 22 atlases, got ${mb.toFixed(1)}`);
});

test("a texture array counts every layer", () => {
  const h = bootGlx();
  // The baked PBR material array: 17 layers, 256², RGBA8, full chain.
  h.GLX.createTextureArray(256, Array.from({ length: 17 }, () => img(256, 256)), 17);
  const c = h.GLX.texCensus();
  assert.equal(c.count, 1);
  assert.equal(c.bytes, mipBytes(256, 256, 17));
  assert.ok(c.byKind.materialArray > 0, "the array must be attributed to its own kind");
});

test("freeing a texture removes its bytes — the census is RESIDENT, not cumulative", () => {
  const h = bootGlx();
  const a = h.GLX.createTexture(img(512, 512));
  h.GLX.createTexture(img(256, 256));
  const before = h.GLX.texCensus();
  assert.equal(before.count, 2);
  h.GLX.freeTexture(a);
  const after = h.GLX.texCensus();
  assert.equal(after.count, 1, "a freed texture must leave the ledger");
  assert.equal(after.bytes, mipBytes(256, 256));
  // Guard the guard: if freeTexture silently did nothing, the two readings
  // would be equal and every assertion above would still pass.
  assert.ok(after.bytes < before.bytes);
});

test("kinds are separated, so the livery share is readable off the census", () => {
  const h = bootGlx();
  h.GLX.createTexture(img(1024, 1280));
  h.GLX.createTextureArray(256, Array.from({ length: 17 }, () => img(256, 256)), 17);
  const c = h.GLX.texCensus();
  const kinds = Object.keys(c.byKind).sort();
  assert.deepEqual(kinds, ["content2D", "materialArray"]);
  assert.equal(c.byKind.content2D + c.byKind.materialArray, c.bytes,
    "the kind breakdown must sum to the total — a missing kind is a silent hole");
});

test("a lost context does not leave stale bytes on the books", () => {
  const h = bootGlx();
  h.GLX.createTexture(img(512, 512));
  assert.ok(h.GLX.texCensus().bytes > 0);
  h.loseContext();
  // Every GLX entry point fails closed after a context loss; the census must
  // report the truth (nothing is resident on a dead context) rather than the
  // last number it happened to hold.
  const c = h.GLX.texCensus();
  assert.equal(c.bytes, 0, "a lost context frees every texture");
  assert.equal(c.count, 0);
});
