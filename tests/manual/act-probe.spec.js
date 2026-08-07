// @ts-check
// act() probe — WHERE does __apex.act() stop returning?
//
// Not a regression test. A measurement, run by explicit path (tests/manual/ is
// excluded from default discovery via playwright.config.js testIgnore), to
// answer one question before anyone rewrites tlx-probes' M6 skid test.
//
// WHAT IT IS CHASING. M6 skid does:
//     window.__apex.jump(0.1, 70);
//     window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 120);
// and never returns. It failed at 130.3 s and 140.9 s against a 120 s budget,
// then at 371.2 s against 360 s — so tripling the budget changed only the
// number in the message. It does NOT fail on its own inner 30 s
// waitForFunction, and its explicit waits total 120 s, so the missing time is
// inside that un-timeouted evaluate. The end state is byte-identical across
// every failure: s=644.073…, x=13.8999…, speed=2.552…, rescueT=0.6333… — the
// car 13.9 m off the centreline, nearly stopped, mid-rescue.
//
// WHY NO OTHER TEST SEES IT. Across every act() call site in the suite, full
// lock (`steer: 1`) is never held for more than 25 steps. M6 holds it for 120 —
// nearly five times longer, which is what it takes to leave the circuit
// entirely rather than merely slide. Nothing else reaches an off-track rescue
// state through this API.
//
// THE TWO CANDIDATES this separates:
//   (a) PRODUCT — act() hangs or degrades once an incident engages mid-batch.
//       Batch A/B/C changed jump() to clear rescueT/wallT/wrongT/wrongWay/offT
//       and call IncidentSim.release. If real, this is an agent-API bug far
//       beyond one spec.
//   (b) TEST DESIGN — the manoeuvre simply drives off the road, and marks are
//       never laid.
// Redesigning M6 first would paper over (a) with the test that found it, so
// this runs first.
import { test, expect } from "@playwright/test";

const TRACK = "monza";
const LAUNCH = 70;      // m/s, exactly M6's launch speed
const STEPS = 120;      // exactly M6's step count
const STALL_MS = 15_000;  // a single step taking this long IS the finding

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
  await page.evaluate((t) => window.__apex.race(t), TRACK);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
}

// Step ONE frame at a time, timing each, so the answer is a step INDEX rather
// than "the whole batch was slow". Bails on its own budget rather than relying
// on the outer timeout, so a hang still returns evidence instead of a stack.
const PROBE = ({ steer, steps, launch, stallMs }) => {
  window.__apex.jump(0.1, launch, 0);
  const rows = [];
  let stalledAt = -1;
  for (let i = 0; i < steps; i++) {
    const t0 = performance.now();
    window.__apex.act({ steer, throttle: true }, 1 / 60, 1);
    const dt = performance.now() - t0;
    const p = window.__apex.physState();
    rows.push({ i, ms: +dt.toFixed(2), x: +p.x.toFixed(2), speed: +p.speed.toFixed(2),
                rescueT: +(p.rescueT || 0).toFixed(3) });
    if (dt > stallMs) { stalledAt = i; break; }
  }
  return { rows, stalledAt };
};

function report(label, { rows, stalledAt }) {
  const total = rows.reduce((a, r) => a + r.ms, 0);
  const worst = rows.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);
  const offAt = rows.find((r) => Math.abs(r.x) > 8);
  const rescueAt = rows.find((r) => r.rescueT > 0);
  console.log(`\n=== ${label} — ${rows.length} steps, ${total.toFixed(0)} ms total`);
  console.log(`    slowest steps: ${worst.map((r) => `#${r.i} ${r.ms}ms`).join(", ")}`);
  console.log(`    first |x| > 8 m: ${offAt ? `#${offAt.i} (x=${offAt.x})` : "never"}`);
  console.log(`    first rescueT > 0: ${rescueAt ? `#${rescueAt.i}` : "never"}`);
  console.log(`    last: ${JSON.stringify(rows[rows.length - 1])}`);
  if (stalledAt >= 0) console.log(`    *** STALLED at step ${stalledAt} ***`);
  return { total, stalledAt };
}

test("full lock for 120 steps — the exact M6 manoeuvre", async ({ page }) => {
  test.slow();
  await boot(page);
  const r = report("steer 1.0 x120 (M6)", await page.evaluate(PROBE,
    { steer: 1, steps: STEPS, launch: LAUNCH, stallMs: STALL_MS }));
  // No pass/fail claim on the product here — the console output IS the result.
  // The one thing asserted is that the probe itself produced data, so a silent
  // empty run cannot be read as "nothing wrong".
  expect(r.total).toBeGreaterThan(0);
});

test("steer 0.3 for 120 steps — the shape another spec already uses", async ({ page }) => {
  // The control. Two specs hold steer 0.3 for 120 steps, so if THIS is fast the
  // step count is not the variable and full lock leaving the road is.
  test.slow();
  await boot(page);
  const r = report("steer 0.3 x120 (control)", await page.evaluate(PROBE,
    { steer: 0.3, steps: STEPS, launch: LAUNCH, stallMs: STALL_MS }));
  expect(r.total).toBeGreaterThan(0);
});

test("full lock for 25 steps — the longest full lock anywhere else in the suite", async ({ page }) => {
  // The second control. If 25 is fast and 120 is not, the boundary is between
  // them and the per-step timings above say exactly where.
  test.slow();
  await boot(page);
  const r = report("steer 1.0 x25 (control)", await page.evaluate(PROBE,
    { steer: 1, steps: 25, launch: LAUNCH, stallMs: STALL_MS }));
  expect(r.total).toBeGreaterThan(0);
});
