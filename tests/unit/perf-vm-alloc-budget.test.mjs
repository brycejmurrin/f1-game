/* perf-vm-alloc-budget.test.mjs — the race loop's garbage per frame may not creep up unnoticed.
 *
 * tools/perf/vm-alloc-census.mjs steps the real js/game.js race (monza, seeded field, renderer
 * stubbed) in a child Node with a 128 MB semi-space, warms 3,000 frames, and samples each GC-free
 * window with the heap profiler. Samples the size of one HeapNumber are `boxed` (V8 boxing a double;
 * JavaScriptCore on Bryce's phone has no such bytes), the rest `objects` (#5056). The gate is a ratio
 * of the checked-in baseline's OBJECTS mean (tools/perf/baselines/vm-alloc.json, MAX_RATIO 1.15);
 * both numbers live in the baseline. 2026-11-11, Node 22, 8 B interval: objects 9.4-9.5, boxed 60.4-61.1 KB/frame
 * over five runs (heap delta 77-78).
 *
 * Over budget? Find the new per-frame allocation (docs/notes/PERF-ALLOC-HUNT-2026-10-17.md has the
 * method) — do not raise the bound. A deliberate change (a new simulated system) rewrites the baseline
 * with `node tools/perf/vm-alloc-census.mjs --update` and says why in its commit. Well under it? The
 * census prints a hint to lower the baseline so the gain is kept.
 *
 * Run: node --test tests/unit/perf-vm-alloc-budget.test.mjs   (npm run test:game-vm)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "node:inspector";
import { measure, compare, loadBaseline, SCENARIO, MAX_RATIO, poster, sampleAllocations, calibrateBoxedSize, splitSamples } from "../../tools/perf/vm-alloc-census.mjs";

test("the baseline describes the scenario the census runs", () => {
  const base = loadBaseline();
  assert.ok(base, "tools/perf/baselines/vm-alloc.json is missing: node tools/perf/vm-alloc-census.mjs --update");
  for (const k of ["track", "warm", "windows", "frames"]) assert.equal(base[k], SCENARIO[k], `baseline ${k} differs from SCENARIO: re-run --update`);
  assert.ok(SCENARIO.warm >= 3000, "warm >= 3,000: at 600 frames the loop is still deoptimising and boxing more (#5056)");
  assert.ok(base.objectsKbPerFrame > 0, "baseline objectsKbPerFrame (the gated number) must be positive");
  assert.ok(base.boxedKbPerFrame >= 0, "baseline boxedKbPerFrame must be recorded");
  assert.ok(base.boxedSize > 0, "baseline records the calibrated HeapNumber sample size");
});

test("compare(): over the ratio fails, at or under it passes, far under asks for a lower baseline", () => {
  const base = { objectsKbPerFrame: 200, boxedKbPerFrame: 50 };
  assert.equal(compare({ objectsKbPerFrame: 200 * MAX_RATIO + 0.5 }, base).ok, false);
  assert.equal(compare({ objectsKbPerFrame: 200 * MAX_RATIO }, base).ok, true);
  assert.equal(compare({ objectsKbPerFrame: 200, boxedKbPerFrame: 5000 }, base).ok, true, "boxed doubles are reported, never gated");
  assert.ok(compare({ objectsKbPerFrame: 100 }, base).note.includes("lower it with --update"), "far under the baseline must ask for a lower one");
  assert.equal(compare({ objectsKbPerFrame: null }, base).ok, false, "all windows invalid is a failure, not a pass");
  assert.equal(compare({ objectsKbPerFrame: 1 }, null).ok, false, "no baseline is a failure");
  assert.equal(compare({ objectsKbPerFrame: 1 }, { meanKbPerFrame: 188 }).ok, false, "a pre-split baseline is a failure");
});

test("the split: a boxed-double-only loop is not garbage, an object-allocating loop is", async () => {
  const session = new Session(); session.connect();
  const post = poster(session);
  try {
    const boxedSize = await calibrateBoxedSize(post);
    assert.ok(boxedSize > 0, "calibration found the HeapNumber sample size");
    const slots = new Array(1024).fill(null);
    const boxedOnly = splitSamples(await sampleAllocations(post, () => { for (let i = 0; i < 2e5; i++) slots[i & 1023] = i * 0.37 + 0.5; }), boxedSize);
    const objs = splitSamples(await sampleAllocations(post, () => { for (let i = 0; i < 2e5; i++) slots[i & 1023] = { a: i, b: i, c: i }; }), boxedSize);
    // 2e5 boxes x 16 B = 3.2 MB; the sampler scales, so allow wide bands, but the classes must not mix
    assert.ok(boxedOnly.boxed > 1e6, `boxed loop reads as boxed bytes (${boxedOnly.boxed})`);
    assert.ok(boxedOnly.objects < boxedOnly.boxed * 0.05, `boxed loop must not read as objects (${boxedOnly.objects} vs ${boxedOnly.boxed})`);
    assert.ok(objs.objects > 2e6, `object loop reads as objects (${objs.objects})`);
    assert.ok(objs.boxed < objs.objects * 0.05, `object loop must not read as boxed (${objs.boxed} vs ${objs.objects})`);
  } finally { session.disconnect(); }
});

test("monza race loop: object bytes per frame stay within the baseline ratio", () => {
  const m = measure();
  assert.ok(m.valid >= SCENARIO.windows - 1, `GCs landed inside ${SCENARIO.windows - m.valid} windows: ${JSON.stringify(m.windows)}`);
  const v = compare(m, loadBaseline());
  assert.ok(v.ok, `${v.note}; windows ${JSON.stringify(m.windows)}`);
});
