// select-specs — the advisory CI selector's two halves, and its honesty.
//
// The selection logic (groups -> specs -> budget cut) is pure enough to test
// on fixtures; the real-tree case pins that the composition still produces a
// non-empty, in-budget selection for a diff that touches js/game/ — the shape
// the job will see every day. The skip list is load-bearing: a selector that
// silently drops the expensive spec reads as "covered", which is the same
// lie the coverage reporter exists to catch from the other side.
import test from "node:test";
import assert from "node:assert/strict";
import { specsOf, fit, maxDeclaredTimeout, TRACKED, ADVISORY } from "../../tools/select-specs.mjs";
import { MEASURED, capacity } from "../../tools/select-budget.mjs";

const SCRIPTS = {
  "test:one": "node tools/run-playwright.mjs tests/specs/smoke.spec.js",
  "test:two": "node tools/run-playwright.mjs tests/specs/smoke.spec.js tests/specs/logging.spec.js",
  "test:glob": "node tools/run-playwright.mjs tests/specs/physics-*.spec.js",
  "test:node": "node --test tests/unit/select-specs.test.mjs",
};

test("specsOf dedupes across groups and expands globs against the tree", () => {
  const got = specsOf(["test:one", "test:two"], SCRIPTS);
  assert.deepEqual(got, ["tests/specs/logging.spec.js", "tests/specs/smoke.spec.js"]);
  const glob = specsOf(["test:glob"], SCRIPTS);
  assert.ok(glob.length >= 2, `physics-* expanded to ${glob.length}`);
  assert.ok(glob.every((f) => /^tests\/specs\/physics-.*\.spec\.js$/.test(f)));
});

test("specsOf ignores scripts that are not browser runs", () => {
  assert.deepEqual(specsOf(["test:node"], SCRIPTS), []);
});

test("fit cuts at the budget and names every skipped spec", () => {
  // Real specs so declaredTests resolves; the budget is set artificially small
  // so the cut provably happens.
  const specs = ["tests/specs/smoke.spec.js", "tests/specs/logging.spec.js"];
  const r = fit(specs, 5);
  assert.equal(r.selected.length + r.skipped.length, 2, "every spec lands in selected or skipped");
  assert.ok(r.testsSelected <= r.testsFit, `${r.testsSelected} selected into ${r.testsFit}`);
  for (const s of r.skipped) assert.ok(s.tests > 0, "a skipped spec carries its cost");
});

test("a spec that reserves more than the advisory timeout is EXCLUDED by name", () => {
  // The cost model's blind spot, measured on CI run 31233088772: the selector
  // billed every test at ~80 s while 8 of its 10 picks declared their own
  // test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout — and
  // the "14-minute" selection failed the job. imola-foundation (420 s) is the
  // worst standing example; if its budget ever drops below the advisory
  // timeout this pin should move to whichever spec then holds the title.
  const own = maxDeclaredTimeout("tests/specs/imola-foundation.spec.js");
  assert.ok(own > ADVISORY.perTestTimeoutSec * 1000,
    `imola-foundation now declares ${own} ms — find a new worst example for this pin`);
  const r = fit(["tests/specs/imola-foundation.spec.js", "tests/specs/smoke.spec.js"], 15);
  assert.deepEqual(r.overBudgetSpecs.map((s) => s.file), ["tests/specs/imola-foundation.spec.js"]);
  assert.deepEqual(r.selected.map((s) => s.file), ["tests/specs/smoke.spec.js"],
    "the spec that fits the advisory budget must still be selected");
});

test("TRACKED covers the paths that make a selection meaningless", () => {
  // The measured hole: tests/helpers/fixtures.js is imported by ~59 specs, but
  // pick-tests routes ^tests/ to `audit` (not a browser group), so before this
  // list a change to the file EVERY spec depends on selected ZERO specs and the
  // job reported nothing to run — silent exactly when everything is affected.
  // Datadog TIA calls these "tracked files"; Fowler's account of Google Testar
  // records the same blind spot for data-driven inputs.
  for (const f of ["tests/helpers/fixtures.js", "package.json", "playwright.config.js",
                   "tools/manifest.cjs", "index.html", "version.json",
                   "tests/data/physics-baseline.json", ".github/workflows/ci.yml"])
    assert.ok(TRACKED.some((re) => re.test(f)), `${f} must be a tracked path`);
  // ...and does NOT swallow ordinary source or spec edits, or the selector is
  // a full-run trigger wearing a selector's name.
  for (const f of ["js/game.js", "js/track/tracks.js", "tests/specs/smoke.spec.js",
                   "css/hud.css", "docs/TESTING.md"])
    assert.ok(!TRACKED.some((re) => re.test(f)), `${f} must NOT be tracked`);
});

test("the advisory settings match select-budget's recommendation", () => {
  // retries 0 halves the failure cost; 120 s per-test halves it again. If
  // either drifts back to smoke's gate settings, the budget maths silently
  // stops describing the job that runs.
  assert.equal(ADVISORY.retries, 0);
  assert.equal(ADVISORY.perTestTimeoutSec, 120);
  const gate = capacity(15, 1, MEASURED);
  const advisory = capacity(15, 1, { ...MEASURED, ...ADVISORY });
  assert.ok(advisory.tests > gate.tests,
    "the advisory settings must fit MORE tests than the gate settings, or they buy nothing");
});
