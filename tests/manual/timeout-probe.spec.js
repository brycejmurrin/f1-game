// @ts-check
// Does `{ timeout: N }` on a Playwright wait actually bound it?
//
// NOT an M6 detail — a property of how this whole suite fails, which is why it
// gets its own file.
//
// tlx-probes' M6 skid ends with
//     await page.waitForFunction(() => GLX.__tlx.fxState().skidVerts > 0,
//                                { timeout: 30_000 });
// and a step-by-step probe measured that call running for **344.4 seconds**
// before dying on the TEST budget (360 s) rather than on its own 30 s.
//
// WHY THAT MATTERS BEYOND ONE SPEC. Reasoning of the form "this test's explicit
// waits total 120 s, so the missing time must be somewhere else" was used all
// through this session's investigation, and it is only sound if declared
// timeouts fire. If they do not, every inner timeout in the suite is decoration
// and every such deduction is unsafe — including one that sent two probes
// chasing act(), which turned out to take 309 ms.
//
// So: three cases, each with a deliberately unsatisfiable predicate and a SHORT
// declared timeout, differing only in how the page behaves while waiting.
// Elapsed time is measured on the Node side, because the question is precisely
// whether Playwright's own bound holds.
//
// Run: npm test -- tests/manual/timeout-probe.spec.js
import { test, expect } from "@playwright/test";

const SHORT = 3_000;      // the declared bound under examination
const TOLERANCE = 12_000; // generous: SwiftShader is slow, but not 100x slow

async function timed(fn) {
  const t0 = Date.now();
  let err = "(no error — the wait RESOLVED, which the predicate forbids)";
  try { await fn(); } catch (e) { err = e.message.split("\n")[0]; }
  return { ms: Date.now() - t0, err };
}

function report(label, r) {
  console.log(`\n=== ${label}`);
  console.log(`    declared timeout ${SHORT} ms — actual ${r.ms} ms`);
  console.log(`    ${r.err}`);
  return r;
}

test("a never-true predicate on a QUIET page respects its declared timeout", async ({ page }) => {
  // The control. Nothing unusual about the page; if this overruns, the bound is
  // simply not honoured and nothing further needs explaining.
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 30_000 });
  const r = report("quiet page", await timed(() =>
    page.waitForFunction(() => window.__neverEverTrue === 42, null, { timeout: SHORT })));
  expect(r.ms).toBeLessThan(SHORT + TOLERANCE);
});

test("a predicate that THROWS every evaluation still respects its timeout", async ({ page }) => {
  // M6's shape. `GLX.__tlx.fxState()` throws outright when the TLX backend is
  // absent — reading `.fxState` of undefined — so the predicate never returns
  // false, it raises. If Playwright treats a throwing predicate differently
  // from a falsy one, that is the difference between a 30 s failure and a
  // 344 s one, and it would explain M6 without any product being at fault.
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 30_000 });
  const r = report("throwing predicate", await timed(() =>
    page.waitForFunction(() => window.__nothing.atAll.here === 1, null, { timeout: SHORT })));
  expect(r.ms).toBeLessThan(SHORT + TOLERANCE);
});

test("a never-true predicate on a BUSY page respects its declared timeout", async ({ page }) => {
  // The other candidate: the default polling is `raf`, so a page whose main
  // thread is saturated may starve the poll. A race under SwiftShader is
  // exactly that page — and it is the page M6 waits on.
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 30_000 });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 60_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  const r = report("busy page (monza rendering)", await timed(() =>
    page.waitForFunction(() => window.__neverEverTrue === 42, null, { timeout: SHORT })));
  expect(r.ms).toBeLessThan(SHORT + TOLERANCE);
});
