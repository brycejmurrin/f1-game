// select-specs — the blocking CI selector's two halves, and its honesty.
//
// The selection logic (groups -> specs -> budget cut) is pure enough to test
// on fixtures; the real-tree case pins that the composition still produces a
// non-empty, in-budget selection for a diff that touches js/game/ — the shape
// the job will see every day. The skip list is load-bearing: a selector that
// silently drops the expensive spec reads as "covered", which is the same
// lie the coverage reporter exists to catch from the other side.
import test from "node:test";
import assert from "node:assert/strict";
import { specsOf, fit, maxDeclaredTimeout, specsImporting, prioritise, TRACKED,
  SELECTED_GATE, FIXED_GATE_SPECS, dropBootFallback, BOOT_FALLBACK_REASONS } from "../../tools/ci/select-specs.mjs";
import { pick } from "../../tools/ci/pick-tests.mjs";
import { failedSpecsFrom } from "../../tools/ci/junit-failed.mjs";
import { recall } from "../../tools/ci/select-recall.mjs";
import { MEASURED, capacity } from "../../tools/ci/select-budget.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCRIPTS = {
  "test:one": "node tools/ci/run-playwright.mjs tests/specs/smoke.spec.js",
  "test:two": "node tools/ci/run-playwright.mjs tests/specs/smoke.spec.js tests/specs/logging.spec.js",
  "test:glob": "node tools/ci/run-playwright.mjs tests/specs/physics-*.spec.js",
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
  assert.equal(r.selected.length + r.skipped.length + r.unreachable.length + r.coveredByFixedGates.length, 2,
    "every spec lands in selected, skipped, unreachable, or an independent fixed gate");
  assert.ok(r.testsSelected <= r.testsFit, `${r.testsSelected} selected into ${r.testsFit}`);
  for (const s of r.skipped) assert.ok(s.tests > 0, "a skipped spec carries its cost");
});

test("a spec bigger than the whole cap is UNREACHABLE, not merely skipped", () => {
  // The hole this exists for: the cut is greedy smallest-first, so a spec whose
  // declared test count exceeds the ENTIRE cap can never be selected — not
  // "did not fit this time", but "cannot fit on any change, ever". Every
  // js/net/ change duly listed multiplayer-session.spec.js (19 tests against a
  // 10-test cap) as skipped, which reads as routine, and it sat red for weeks
  // with nothing running it. Two categories, so the permanent one is legible.
  const big = "tests/specs/multiplayer-session.spec.js";
  const r = fit([big, "tests/specs/boot-guard.spec.js"], 15);
  assert.ok(r.unreachable.some((s) => s.file === big),
    `${big} declares ${r.unreachable.concat(r.skipped, r.selected).find((s) => s.file === big)?.tests} ` +
    `tests against a ${r.testsFit}-test cap and must be reported as unreachable`);
  assert.ok(!r.skipped.some((s) => s.file === big), "unreachable is not double-counted as skipped");
  assert.deepEqual(r.selected.map((s) => s.file), ["tests/specs/boot-guard.spec.js"],
    "a spec that does fit is still selected alongside the report");
  // A spec that fits the cap ON ITS OWN is ordinary skipping, never
  // unreachable — 9 tests + 4 tests against a 10-test cap takes the 4 and
  // skips the 9, which a later change with fewer candidates would pick up.
  const small = fit(["tests/specs/multiplayer-seats.spec.js", "tests/specs/multiplayer-npeer.spec.js"], 15);
  assert.deepEqual(small.unreachable.map((s) => s.file), [],
    "a spec smaller than the cap is skipped, not unreachable");
  assert.deepEqual(small.skipped.map((s) => s.file), ["tests/specs/multiplayer-seats.spec.js"]);
});

test("a spec that reserves more than the selected-gate timeout is EXCLUDED by name", () => {
  // The cost model's blind spot, measured on CI run 31233088772: the selector
  // billed every test at ~80 s while 8 of its 10 picks declared their own
  // test.setTimeout of 180-420 s — which OVERRIDES the job's --timeout — and
  // the "14-minute" selection failed the job. imola-foundation (420 s) is the
  // worst standing example; if its budget ever drops below the selected-gate
  // timeout this pin should move to whichever spec then holds the title.
  const own = maxDeclaredTimeout("tests/specs/imola-foundation.spec.js");
  assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
    `imola-foundation now declares ${own} ms — find a new worst example for this pin`);
  const r = fit(["tests/specs/imola-foundation.spec.js", "tests/specs/boot-guard.spec.js"], 15);
  assert.deepEqual(r.overBudgetSpecs.map((s) => s.file), ["tests/specs/imola-foundation.spec.js"]);
  assert.deepEqual(r.selected.map((s) => s.file), ["tests/specs/boot-guard.spec.js"],
    "the spec that fits the selected-gate budget must still be selected");
});

test("fixed blocking specs can never run under the selected gate's timeout", () => {
  assert.ok(FIXED_GATE_SPECS.has("tests/specs/smoke.spec.js"));
  assert.ok(FIXED_GATE_SPECS.has("tests/specs/physics-characterization.spec.js"));
  const r = fit([...FIXED_GATE_SPECS], 60);
  assert.deepEqual(r.selected, [], "even a huge selected budget must not duplicate fixed specs");
  assert.deepEqual(r.coveredByFixedGates.map((s) => s.file).sort(), [...FIXED_GATE_SPECS].sort());
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

test("the import graph finds specs a path RULE cannot — helper -> spec", () => {
  // Playwright's --only-changed walks the import graph; here it would find
  // almost nothing (specs load the game over HTTP, so no graph reaches js/),
  // but it is exactly right for helper -> spec, where the RULES are weakest:
  // ^tests/ routes to `audit` and nothing else.
  const hit = specsImporting(["tests/helpers/qr-camera.js"]);
  assert.ok(hit.includes("tests/specs/multiplayer-scan.spec.js"), `got ${hit.join(", ")}`);
  assert.ok(hit.length < 10, "a NARROW helper must not fan out to the whole suite");
  assert.deepEqual(specsImporting(["js/game.js"]), [],
    "js/ is invisible to the import graph in this architecture — say so by returning nothing");
});

test("fail-fast order: edited, then previously-failed, then imported, then routed", () => {
  // Fowler's TIA survey records Microsoft and Google Testar both running
  // newly-added and previously-failing tests unconditionally; Playwright's CI
  // guidance is the ordering half. The gate should report the likeliest failure
  // first instead of spending its budget on a lower-signal spec.
  const specs = [{ file: "d.spec.js", tests: 1 }, { file: "c.spec.js", tests: 1 },
                 { file: "b.spec.js", tests: 1 }, { file: "a.spec.js", tests: 1 }];
  const got = prioritise(specs, { changedSpecs: ["a.spec.js"], failed: ["b.spec.js"],
                                  imported: ["c.spec.js"] });
  assert.deepEqual(got.map((s) => s.file), ["a.spec.js", "b.spec.js", "c.spec.js", "d.spec.js"]);
});

test("FAULTY-CHANGE RECALL: no real regression is dropped in silence", () => {
  // The metric Facebook's Predictive Test Selection reports separately and for
  // good reason: their model catches >99.9% of faulty CHANGES while catching
  // only >95% of individual test failures, because a bad change is usually
  // caught by several tests. So a selector is judged on whether the regression
  // would still have been reported — never on how much of the suite it copies.
  //
  // A "silent miss" is the one true failure: the catching spec neither selected
  // nor named. Being unaffordable (a 25-minute sweep) or infra is fine — those
  // are honest answers the gates then own. This ratchet caught a REAL routing
  // bug on its first run: js/track/tracks.js holds buildProps but did not route
  // to `scenery`, so the two specs that reported both of 2026-08-08's scenery
  // defects were silently absent.
  const rows = recall();
  const silent = rows.filter((r) => !r.hit && !r.named && r.reason !== "infra");
  assert.deepEqual(silent.map((r) => `${r.name} -> ${r.catches}`), [],
    "a spec that caught a real regression was dropped with no word — fix the routing, " +
    "the budget, or the case, but never leave the selector silent");
  assert.ok(rows.length >= 5, "the case history is the harness — do not let it shrink");
});

test("the selected-gate settings match select-budget's recommendation", () => {
  // retries 0 halves the failure cost, and a per-test timeout under smoke's
  // 240 s halves it again. If either drifts back to smoke's gate settings, the
  // budget maths silently stops describing the job that runs.
  assert.equal(SELECTED_GATE.retries, 0);
  assert.equal(SELECTED_GATE.perTestTimeoutSec, 180);
  const gate = capacity(15, 1, MEASURED);
  const selected = capacity(15, 1, { ...MEASURED, ...SELECTED_GATE });
  assert.ok(selected.tests > gate.tests,
    "the selected settings must fit MORE tests than smoke's settings, or they buy nothing");
});

test("the boot group is not selected for a blanket source edit — the fixed smoke gate owns that question", () => {
  // 2026-09-02: every js/css edit routed to `tiny`, whose cheapest-by-count
  // specs (boot-guard, logging) are the slowest per test; they timed out the
  // deploy gate twice on starved runners for diffs that never touched them.
  const g = pick(["js/ui/hud.js", "index.html"]);
  assert.ok(g.has("tiny"), "the blanket rules still route to the boot group for a human reader");
  for (const why of g.get("tiny")) assert.ok(BOOT_FALLBACK_REASONS.has(why), `unexpected boot reason: ${why}`);
  assert.equal(dropBootFallback(g), true);
  assert.ok(!g.has("tiny"), "the selected gate drops the boot group when only the blanket rules named it");
  // A group named for a specific reason stays.
  const specific = new Map([["tiny", new Set(["js/core/log.js"])]]);
  assert.equal(dropBootFallback(specific), false);
  assert.ok(specific.has("tiny"));
});

test("junit-failed reads Playwright's junit shape (system-out BEFORE the failure) and normalises the path", () => {
  const xml = `<testsuites>
<testsuite name="specs/logging.spec.js">
<testcase name="a" classname="specs/logging.spec.js" time="1.0"/>
<testcase name="b" classname="specs/logging.spec.js" time="135.7">
<system-out>
<![CDATA[ noise ]]>
</system-out>
<error message="Test timeout of 120000ms exceeded." type="Error">
<![CDATA[ stack ]]>
</error>
</testcase>
<testcase name="c" classname="specs/boot-guard.spec.js" time="120.0">
<failure message="expect failed" type="FAILURE">x</failure>
</testcase>
<testcase name="d" classname="specs/smoke.spec.js" time="9.0">
<system-out><![CDATA[ passed with output ]]></system-out>
</testcase>
</testsuite></testsuites>`;
  assert.deepEqual(failedSpecsFrom(xml), ["tests/specs/boot-guard.spec.js", "tests/specs/logging.spec.js"]);
  assert.deepEqual(failedSpecsFrom("<testsuites></testsuites>"), []);
});

test("a spec that cannot pass at the gate's per-test cap declares so, and is excluded", () => {
  // hud-layout.spec.js boots a full race — 22 cars, a built circuit, the maps
  // pass — for every one of its ~19 generated cases, just to measure HUD box
  // geometry. On a CI runner the page log puts that fixture at 76-80 s before
  // the test body starts.
  //
  // It declared no budget, so `fit()` read "undeclared" as "fits in 120 s" and
  // let it into the change-aware gate that every other race-fixture spec is
  // excluded from. It then failed 6 of its first 7 cases at exactly "Test
  // timeout of 120000ms exceeded" and burned the job's whole 26-minute cap,
  // which CANCELLED Pages #1967 — run 33822785596, job 100868882762. A deploy
  // stopped by a spec that never had a chance to pass.
  //
  // Pinned as the RULE, not the number: whatever the gate's cap is, this spec
  // must sit above it and must therefore be excluded. Raising the gate later
  // does not quietly re-admit it.
  const own = maxDeclaredTimeout("tests/specs/hud-layout.spec.js");
  assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
    `hud-layout.spec.js declares ${own / 1000}s, at or under the ${SELECTED_GATE.perTestTimeoutSec}s gate — ` +
    "it boots a full race per case and cannot pass there; see Pages #1967");

  const r = fit(["tests/specs/hud-layout.spec.js"], 26);
  assert.deepEqual(r.selected, [], "the gate must not select it");
  assert.ok(r.overBudgetSpecs.some((s) => s.file === "tests/specs/hud-layout.spec.js"),
    "and must NAME it as over budget — silent truncation reads as covered");
});

test("the gate's per-test timeout clears the SLOWEST spec, not the average one", () => {
  // The defect this pins: 120 s bounded the mean test (79.7 s) and not the
  // slowest, so the gate failed specs that pass. Measured on an idle box,
  // one worker, 2026-09-04 — raise these only against a fresh measurement.
  const SLOWEST_MEASURED_SEC = 124.2;   // physics-fixes, Monaco lap continuity
  assert.ok(SELECTED_GATE.perTestTimeoutSec > SLOWEST_MEASURED_SEC,
    `gate ${SELECTED_GATE.perTestTimeoutSec}s does not clear the slowest measured ` +
    `spec (${SLOWEST_MEASURED_SEC}s) — it will fail specs that pass`);
  // ...with real margin, not by a second: CI runners are shared and slower.
  assert.ok(SELECTED_GATE.perTestTimeoutSec > SLOWEST_MEASURED_SEC * 1.25,
    "a timeout that only just clears the slowest spec fails on any contention");
});

test("ci.yml runs the selected gate with the settings the selector models", () => {
  // Three files encode this one number (select-specs, select-budget, ci.yml) and
  // the workflow is the only one the runner actually obeys. When they drifted,
  // the model described a job that did not exist.
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const ms = SELECTED_GATE.perTestTimeoutSec * 1000;
  assert.match(yml, new RegExp(`--retries=0 --timeout=${ms} --max-failures=3`),
    `ci.yml's selected step does not run --timeout=${ms}`);
  // cap >= (tests x per-test timeout) + setup + margin, per the job's own comment.
  const cap = Number(/name: Selected specs[\s\S]*?timeout-minutes: (\d+)/.exec(yml)?.[1]);
  const worstCaseMin = (10 * SELECTED_GATE.perTestTimeoutSec) / 60 + 4;
  assert.ok(cap >= worstCaseMin,
    `timeout-minutes ${cap} is under the worst case (${worstCaseMin.toFixed(0)} min): ` +
    "the job would be CANCELLED, which reads as 0 failures and hides a dead deploy");
});
