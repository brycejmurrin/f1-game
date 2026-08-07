// wait-polling — a declared timeout that cannot fire is not a bound.
//
// MEASURED (tests/manual/timeout-probe.spec.js), `{ timeout: 3000 }` against a
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
// A RATCHET, NOT A SWEEP. 353 call sites carry a declared timeout without
// `polling`. Rewriting them in one commit would be a 300-site behavioural
// change landing without a run behind it — the exact mistake `58614db2` already
// made once this session. So the population is frozen: new waits must pass
// `polling`, and the existing ones get fixed where they can be verified.
import test from "node:test";
import assert from "node:assert/strict";
import { lintSource, lintAll, count } from "../../tools/wait-polling-lint.mjs";

// Measured 2026-08-07: 353, then 319 once tests/specs/tlx-probes.spec.js — the file
// that produced the finding, and its largest single holder at 34 sites — was
// converted. LOWER this as call sites are fixed; raising it needs a
// reason, and "I added a new wait" is not one.
const CEILING = 319;
// Far enough below and the ratchet has stopped ratcheting — the same trap
// tools/fixture-consumer-audit.mjs records, where a floor sat at 31 while real
// adoption was 54.
const SLACK = 40;

test("a declared timeout with no polling is flagged", () => {
  const { sites } = lintSource(
    `await page.waitForFunction(() => window.x === 1, { timeout: 30_000 });`);
  assert.equal(sites.length, 1);
});

test("passing polling clears it", () => {
  const { sites } = lintSource(
    `await page.waitForFunction(() => window.x === 1, { polling: 100, timeout: 30_000 });`);
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

test("the population does not grow", () => {
  const n = count();
  assert.ok(n <= CEILING,
    `${n} waitForFunction calls declare a timeout without polling, ceiling is ${CEILING}. ` +
    "A declared timeout does not bound a wait on a rendering page — pass " +
    "{ polling: 100, timeout: N }. See docs/TESTING.md.");
  assert.ok(n > CEILING - SLACK,
    `only ${n} sites against a ceiling of ${CEILING} — lower the ceiling, or this ` +
    "ratchet has stopped ratcheting");
});

test("the tool finds real sites — anti-vacuity", () => {
  // If the analysis broke, the count would collapse to zero and the ratchet
  // would read as a clean repo rather than failing.
  assert.ok(count() > 100, `expected 100+ sites, got ${count()}`);
});
