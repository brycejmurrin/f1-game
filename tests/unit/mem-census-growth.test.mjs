// The track-switch growth verdict (tools/lib/mem-census.mjs sustainedGrowthMB), replayed on the
// numbers that motivated it. The bound is read from the spec so the two cannot drift, and it must
// stay 10 MB: the verdict changed from "one interval" to "the smallest of several", never the bound.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sustainedGrowthMB } from "../../tools/lib/mem-census.mjs";

const GROWTH_MB = +/const GROWTH_MB = (\d+);/.exec(readFileSync(new URL("../specs/track-switch-memory.spec.js", import.meta.url), "utf8"))[1];
const leaks = (heaps) => sustainedGrowthMB(heaps).min > GROWTH_MB;
// What the spec asserted before: the third visit against the second.
const oldVerdictFails = (heaps) => heaps[2] - heaps[1] > GROWTH_MB;

test("the bound stays 10 MB", () => assert.equal(GROWTH_MB, 10));

test("the leaks this spec was written for still fail it, every interval over the bound", () => {
  // #773 (docs/notes/TRACK-SWITCH-LEAKS-2026-10-02.md): monza 100 -> 151 -> 203 MB a cycle, continuing.
  assert.ok(leaks([100, 151, 203, 254, 306]), "#773 monza");
  // 2026-10-04 nodeBuilderCache key mismatch: +14 MB a round (14-26 measured).
  assert.ok(leaks([100, 114, 128, 142, 156]), "+14 MB a round");
  assert.ok(leaks([100, 126, 152, 178, 204]), "+26 MB a round");
  // The smallest leak the old assertion could see (just over the bound) fails both ways.
  assert.ok(leaks([100, 111, 122, 133, 144]), "11 MB a pick");
  assert.ok(oldVerdictFails([100, 111, 122, 133, 144]));
});

test("a Metal one-time warm-up step does not fail it, wherever the step lands", () => {
  // macos-latest, WebGPU, run 39019765029 attempt 1 / run 39017426292 attempt 2: monza, visits 1..5.
  assert.ok(!leaks([133.1, 148.6, 149.9, 150.5, 151.2]), "step at visit 2");
  assert.ok(!leaks([134.2, 151.5, 165.8, 166.4, 167.1]), "steps at visits 2 and 3");
  assert.ok(!leaks([134.7, 148.7, 149.4, 150.0, 150.9]), "monaco");
  // The original red (#2604 run 39012574309): 133 -> 150.4 -> 164.8, the step at visit 3; the old check failed it.
  assert.ok(oldVerdictFails([133, 150.4, 164.8]), "the old verdict failed on timing alone");
  assert.ok(!leaks([133, 150.4, 164.8, 165.4, 166.1]), "the same readings with the plateau that follows");
});

test("a step cannot hide a leak: growth in every later interval still fails", () => {
  assert.ok(leaks([133, 150, 165, 180, 195]), "a 15 MB step followed by 15 MB a pick");
});

test("fewer than three readings is an error, not a pass", () => {
  assert.throws(() => sustainedGrowthMB([100, 101]));
  assert.throws(() => sustainedGrowthMB([100, NaN, 102]));
});
