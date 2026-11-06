/* perf-hot-bench.test.mjs — step, physState and nodeAt stay under a hang ceiling.
 *
 * tools/perf/hot-bench.mjs times the real game VM (renderer stubbed). The
 * gate is 6x the checked-in per-call baseline, plus a within-run spread of
 * 4x across three windows. A slow box moves every window together and passes;
 * a stall in one window does not. APEX_PERF_HOT_STRICT=1 tightens to 1.75x.
 *
 * Run: node --test tests/unit/perf-hot-bench.test.mjs
 *      node tools/perf/hot-bench.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BENCHES, GENEROUS_RATIO, SPREAD_RATIO, STRICT_RATIO, WINDOWS,
  judgeHot, loadBaseline, measureHot, summariseWindows,
} from "../../tools/perf/hot-bench.mjs";

test("summariseWindows reports median ms/call and the window spread", () => {
  const row = summariseWindows([80, 100, 90], 80);
  assert.equal(row.medianMs, 90);
  assert.equal(row.msPerCall, 1.125);
  assert.ok(row.ratio < SPREAD_RATIO);
  const flat = judgeHot(row, { msPerCall: 1.125 }, { strict: false });
  assert.equal(flat.pass, true);
  assert.equal(flat.cap, 1.125 * GENEROUS_RATIO);
  const hung = judgeHot({ msPerCall: 20, ratio: 1.1 }, { msPerCall: 1 }, { strict: false });
  assert.equal(hung.pass, false);
  assert.equal(hung.overCap, true);
  const spiked = judgeHot({ msPerCall: 1, ratio: SPREAD_RATIO + 0.1 }, { msPerCall: 1 }, { strict: false });
  assert.equal(spiked.pass, false);
  assert.equal(spiked.overSpread, true);
  const strict = judgeHot({ msPerCall: 2, ratio: 1 }, { msPerCall: 1 }, { strict: true });
  assert.equal(strict.pass, false);
  assert.ok(strict.cap <= STRICT_RATIO + 1e-9);
});

test("the cap judges the fastest window: one noisy window passes, a hang in every window fails", () => {
  const base = { msPerCall: 0.011 };   // cap 0.066 ms/call at 6x
  const noisy = summariseWindows([13.871, 12.058, 24.743], 200);   // Pages #4559: median 0.069, fastest 0.060
  assert.ok(noisy.msPerCall > 0.066, "the median alone would have failed this run");
  assert.equal(judgeHot(noisy, base, { strict: false }).pass, true);
  const hung = summariseWindows([20, 22, 25], 200);   // every window slow: 0.1+ ms/call
  const verdict = judgeHot(hung, base, { strict: false });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.overCap, true);
});

test("the baseline matches the benches this file runs", () => {
  const base = loadBaseline();
  assert.ok(base, "tools/perf/baselines/hot-bench.json missing — node tools/perf/hot-bench.mjs --update");
  assert.equal(base.track, "monza");
  assert.equal(base.windows, WINDOWS);
  assert.equal(base.generousRatio, GENEROUS_RATIO);
  for (const [name, spec] of Object.entries(BENCHES)) {
    assert.equal(base.benches[name].iters, spec.iters, name);
    assert.ok(base.benches[name].msPerCall > 0, name);
  }
});

test("monza hot functions stay within the hang ceiling and the within-run spread", async () => {
  const base = loadBaseline();
  const measured = await measureHot();
  const notes = [];
  for (const name of Object.keys(BENCHES)) {
    const row = measured.benches[name];
    const verdict = judgeHot(row, base.benches[name]);
    notes.push(`${name} ${row.msPerCall} ms/call (cap ${verdict.cap}, spread ${row.ratio}, windows ${row.samples.join("/")})`);
    assert.ok(verdict.pass, notes[notes.length - 1]);
  }
  // The line is the spread a reviewer reads. A pass still prints it via the assertion path on failure only;
  // keep the numbers on the test name's diagnostic by throwing nothing and exposing them if TAP is full.
  assert.ok(notes.length === 3, notes.join(" | "));
});
