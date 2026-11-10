/* perf-hot-bench.test.mjs — step, physState and nodeAt stay under a hang ceiling.
 *
 * tools/perf/hot-bench.mjs times the real game VM (renderer stubbed). The
 * gate is 6x the checked-in per-call baseline, plus a within-run spread of
 * 4x across three windows. A slow box moves every window together and passes;
 * a stall in one window does not. APEX_PERF_HOT_STRICT=1 tightens to 1.75x.
 * The 6x scales with a same-process calibration (tests/helpers/
 * load-scaled-budget.mjs, shared with game-vm.test.mjs's boot wall); the
 * helper's own tests below prove a loaded box scales the cap and a real hang
 * past the absolute ceiling still fails.
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
import {
  REF_CAL_MS, calibrate, calibrationWork, scaledCap, timeWithinScaledCap, describeBudget,
} from "../helpers/load-scaled-budget.mjs";

// ── The load-scaled hang ceiling (tests/helpers/load-scaled-budget.mjs) ──────────
// An idle box keeps the base cap, a loaded box gets a proportionally larger one, and nothing — however loaded —
// lifts the cap past the absolute ceiling, so a real hang (an injected sleep beyond it) still fails.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const spin = (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { /* stolen CPU */ } };

test("load-scaled cap: an idle or fast box keeps exactly the base cap", () => {
  assert.equal(scaledCap({ baseCap: 12000, hardCap: 60000, calMs: REF_CAL_MS }).cap, 12000);
  const fast = scaledCap({ baseCap: 12000, hardCap: 60000, calMs: REF_CAL_MS / 3 });
  assert.equal(fast.scale, 1, "a faster box never tightens the cap below the base");
  assert.equal(fast.cap, 12000);
  assert.equal(scaledCap({ baseCap: 6, hardCap: 30, calMs: NaN }).cap, 6, "a failed calibration falls back to the base");
});

test("load-scaled cap: a loaded box scales in proportion, up to the hard ceiling only", () => {
  const loaded = scaledCap({ baseCap: 12000, hardCap: 60000, calMs: REF_CAL_MS * 2.5 });
  assert.equal(loaded.scale, 2.5);
  assert.equal(loaded.cap, 30000);
  const crushed = scaledCap({ baseCap: 12000, hardCap: 60000, calMs: REF_CAL_MS * 100 });
  assert.equal(crushed.cap, 60000, "no load lifts the cap past the absolute ceiling");
  assert.throws(() => scaledCap({ baseCap: 10, hardCap: 5, calMs: 1 }), /bad caps/);
  assert.equal(calibrationWork(), calibrationWork(), "the calibration workload is deterministic");
});

test("load-scaled cap: CPU taken from the process slows the calibration and scales the cap end to end", async () => {
  // interleave burns 3x a reference pass inside every timed pass: the process sees a pass take
  // at least 4x the reference, as on a box that gives it a quarter of a CPU.
  const steal = () => spin(REF_CAL_MS * 3);
  const calMs = calibrate({ interleave: steal });
  assert.ok(calMs >= REF_CAL_MS * 3, `the stolen CPU must show in the calibration (${calMs} ms)`);
  // 200 ms of work: over the 100 ms base, inside the cap the loaded box earns.
  const r = await timeWithinScaledCap(() => { sleep(200); }, { baseCap: 100, hardCap: 2000, interleave: steal });
  assert.ok(r.scale >= 3, `scale ${r.scale}`);
  assert.ok(r.cap >= 300 && r.cap <= 2000, `cap ${r.cap}`);
  assert.equal(r.pass, true, `200 ms under a loaded-box cap of ${r.cap} ms`);
  assert.equal(r.ms < scaledCap({ baseCap: 100, hardCap: 2000, calMs: REF_CAL_MS }).cap, false,
    "the same 200 ms is over the cap an idle box gets");
});

test("load-scaled cap: a real hang still fails, an injected sleep beyond the hard ceiling, on any box", async () => {
  // hardCap 150 ms; the work sleeps 400 ms. Whatever this box's load, cap <= hardCap < 400.
  const r = await timeWithinScaledCap(() => { sleep(400); }, { baseCap: 50, hardCap: 150 });
  assert.ok(r.cap <= 150, `cap ${r.cap}`);
  assert.ok(r.ms >= 400, `the sleep ran (${r.ms} ms)`);
  assert.equal(r.pass, false, `a 400 ms hang must fail a ${r.cap} ms cap`);
  // And with the stolen CPU that maxes the scale, it still fails.
  const loaded = await timeWithinScaledCap(() => { sleep(400); }, {
    baseCap: 50, hardCap: 150, interleave: () => spin(REF_CAL_MS * 10),
  });
  assert.equal(loaded.cap, 150, "the loaded box hits the ceiling");
  assert.equal(loaded.pass, false, "and the hang still fails");
});

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

// LOAD-SCALED (W29). The 6x ceiling failed at machine load ~11 on 4 CPUs and passed alone. The ratio now scales
// by a same-process calibration taken immediately around measureHot() (tests/helpers/load-scaled-budget.mjs),
// never below GENEROUS_RATIO, clamped at HARD_RATIO (30x baseline: a real hang). The within-run spread (one
// stalled window) scales by the same calibration: load that changes between windows stretches one of them on a
// busy box (4.77 at load 12.7, windows 26.9/15.7/5.6 ms), never below SPREAD_RATIO, clamped at HARD_SPREAD (a
// window 12x its sibling is a stall on any box). APEX_PERF_HOT_STRICT keeps its unscaled 1.75x.
const HARD_RATIO = GENEROUS_RATIO * 5;
const HARD_SPREAD = SPREAD_RATIO * 3;
test("monza hot functions stay within the hang ceiling and the within-run spread", async (t) => {
  const base = loadBaseline();
  const cal0 = calibrate();
  const measured = await measureHot();
  const calMs = Math.max(cal0, calibrate());
  const b = scaledCap({ baseCap: GENEROUS_RATIO, hardCap: HARD_RATIO, calMs });
  const sp = scaledCap({ baseCap: SPREAD_RATIO, hardCap: HARD_SPREAD, calMs });
  t.diagnostic(`ratio ${describeBudget(b)}; spread ${describeBudget(sp)}`);
  const notes = [];
  for (const name of Object.keys(BENCHES)) {
    const row = measured.benches[name];
    const verdict = judgeHot(row, base.benches[name], { generousRatio: b.cap, spreadRatio: sp.cap });
    t.diagnostic(`${name} best ${row.minMs / row.iters} ms/call, cap ${verdict.cap}`);
    notes.push(`${name} ${row.msPerCall} ms/call (cap ${verdict.cap}, spread ${row.ratio} of ${sp.cap}, windows ${row.samples.join("/")})`);
    assert.ok(verdict.pass, notes[notes.length - 1]);
  }
  // The line is the spread a reviewer reads. A pass still prints it via the assertion path on failure only;
  // keep the numbers on the test name's diagnostic by throwing nothing and exposing them if TAP is full.
  assert.ok(notes.length === 3, notes.join(" | "));
});
