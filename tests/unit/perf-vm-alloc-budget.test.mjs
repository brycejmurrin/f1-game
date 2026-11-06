/* perf-vm-alloc-budget.test.mjs — the race loop's garbage per frame may not creep up unnoticed.
 *
 * tools/perf/vm-alloc-census.mjs steps the real js/game.js race (monza, seeded field, renderer
 * stubbed) in a child Node with a 128 MB semi-space and reads the JS bytes each frame allocates, in
 * GC-free windows. The window MEAN repeats within ~1 % run to run, idle or beside three busy loops
 * (2026-10-24: 186.9–189.2 KB/frame), so the gate is a ratio of the checked-in baseline
 * (tools/perf/baselines/vm-alloc.json, MAX_RATIO 1.15).
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
import { measure, compare, loadBaseline, SCENARIO, MAX_RATIO } from "../../tools/perf/vm-alloc-census.mjs";

test("the baseline describes the scenario the census runs", () => {
  const base = loadBaseline();
  assert.ok(base, "tools/perf/baselines/vm-alloc.json is missing: node tools/perf/vm-alloc-census.mjs --update");
  for (const k of ["track", "warm", "windows", "frames"]) assert.equal(base[k], SCENARIO[k], `baseline ${k} differs from SCENARIO: re-run --update`);
  assert.ok(base.meanKbPerFrame > 0, "baseline mean must be positive");
});

test("compare(): over the ratio fails, at or under it passes, far under asks for a lower baseline", () => {
  const base = { meanKbPerFrame: 200 };
  assert.equal(compare({ meanKbPerFrame: 200 * MAX_RATIO + 0.5 }, base).ok, false);
  assert.equal(compare({ meanKbPerFrame: 200 * MAX_RATIO }, base).ok, true);
  assert.ok(compare({ meanKbPerFrame: 100 }, base).note.includes("lower it with --update"), "far under the baseline must ask for a lower one");
  assert.equal(compare({ meanKbPerFrame: null }, base).ok, false, "all windows invalid is a failure, not a pass");
  assert.equal(compare({ meanKbPerFrame: 1 }, null).ok, false, "no baseline is a failure");
});

test("monza race loop: JS bytes per frame stay within the baseline ratio", () => {
  const m = measure();
  assert.ok(m.valid >= SCENARIO.windows - 1, `GCs landed inside ${SCENARIO.windows - m.valid} windows: ${JSON.stringify(m.windows)}`);
  const v = compare(m, loadBaseline());
  assert.ok(v.ok, `${v.note}; windows ${JSON.stringify(m.windows)}`);
});
