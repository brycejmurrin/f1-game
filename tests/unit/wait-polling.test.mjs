// wait-polling — a declared timeout that cannot fire is not a bound.
//
// MEASURED (tests/manual/timeout-probe.spec.js), `null, { timeout: 3000 }` against a
// predicate that can never be true:
//
//   parked Monza, rendering   109,665 ms   36x the declared bound
//   menu page                 also overran
//   predicate that THROWS         11 ms    terminates promptly
//
// Playwright's default `polling: 'raf'` re-evaluates once per animation frame,
// and a page running the game loop under SwiftShader starves that so badly the
// timeout never gets a turn. The throwing case is the tell: an exception
// propagates without polling, so an absent global fails fast while a plain
// `false` does not — which is why the same wait behaves completely differently
// depending on whether a backend happens to be installed.
//
// A RATCHET, NOT A POLLING SWEEP. Option objects have been moved mechanically
// into Playwright's third argument, so their timeouts are real. Adding timer
// polling at hundreds of sites is a separate behavioural change; freeze that
// population and fix existing waits where their timing can be verified.
import test from "node:test";
import assert from "node:assert/strict";
import { lintSource, lintAll, count } from "../../tools/check/wait-polling-lint.mjs";

// The POPULATION ratchet on these sites is now `waitNoPolling` in
// tests/data/ratchets.json (slack 39, the rule this file used); its history
// is docs/notes/CEILING-HISTORY.md. What stays here is the LINT's behaviour:
// what counts as a site, what does not, and that it still finds real ones.

test("a declared timeout with no polling is flagged", () => {
  const { sites } = lintSource(
    `await page.waitForFunction(() => window.x === 1, null, { timeout: 30_000 });`);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].kind, "missing-polling");
});

test("passing polling clears it", () => {
  const { sites } = lintSource(
    `await page.waitForFunction(() => window.x === 1, null, { polling: 100, timeout: 30_000 });`);
  assert.deepEqual(sites, []);
});

test("an options-looking second argument is flagged because Playwright treats it as predicate data", () => {
  const { sites } = lintSource(
    `await page.waitForFunction(() => window.x === 1, { polling: 100, timeout: 30_000 });`);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].kind, "misplaced-options");
});

test("a real object predicate argument is not mistaken for options", () => {
  const { sites } = lintSource(
    `await page.waitForFunction((expected) => window.x === expected.timeout, { timeout: 7 });`);
  assert.deepEqual(sites, []);
});

test("a wait with NO declared timeout is not flagged — it is honest", () => {
  // It inherits the test budget and says so. The defect being caught is a
  // bound that LOOKS like a bound and is not.
  const { sites } = lintSource(`await page.waitForFunction(() => window.x === 1);`);
  assert.deepEqual(sites, []);
});

test("waitForSelector and locator.waitFor are NOT exposed to this", () => {
  // They are driven by the DOM mutation observer rather than by rAF, so their
  // timeouts fire normally. Flagging them would be noise, and a lint with
  // noise gets switched off.
  const src = `await page.waitForSelector("#hud", { timeout: 5000 });
    await page.locator("#hud").waitFor({ state: "visible", timeout: 5000 });`;
  assert.deepEqual(lintSource(src).sites, []);
});

test("tests/manual is exempt, and timeout-probe MUST stay exempt", () => {
  // That file exists to measure what the DEFAULT does. Linting it into
  // compliance would delete the evidence for this lint.
  const rows = lintAll();
  assert.deepEqual(rows.filter((r) => r.file.startsWith("tests/manual/")), []);
});

test("every scanned file parses", () => {
  const bad = lintAll().filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

test("the tool finds real sites — anti-vacuity", () => {
  // If the analysis broke, the count would collapse to zero and the ratchet
  // would read as a clean repo rather than failing. The floor tracks the
  // remaining tools/ population (tests/ went to zero in the 2026-08-27
  // sweep); detection itself is proven by the synthetic lintSource cases
  // above, and the walk by the file count here.
  assert.ok(count() > 20, `expected 20+ sites (tools/ backlog), got ${count()}`);
});

test("check-physics.mjs does not declare a timeout without polling", () => {
  // Six waitForFunction calls on a rendering page. Two already declared a
  // timeout (the SwiftShader trap); the rest must not grow a fake bound.
  const row = lintAll().find((r) => r.file.replace(/\\/g, "/").endsWith("tools/check/check-physics.mjs"));
  assert.deepEqual(row?.sites ?? [], [],
    `check-physics.mjs still has waitForFunction timeout without polling: ${JSON.stringify(row?.sites)}`);
});
