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
  DOCS_ONLY, isDocsOnly, shards, shardTimeoutMin, maxTestsPerShard, MAX_OVERSIZE_SHARDS,
  SELECTED_GATE, FIXED_GATE_SPECS, dropBootFallback, BOOT_FALLBACK_REASONS,
  scopeCarryForward } from "../../tools/ci/select-specs.mjs";
import { pick } from "../../tools/ci/pick-tests.mjs";
import { failedSpecsFrom } from "../../tools/ci/junit-failed.mjs";
import { recall } from "../../tools/ci/select-recall.mjs";
import { MEASURED, capacity, declaredTests } from "../../tools/ci/select-budget.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
  // boot-guard, not logging: logging is ADAPTED (tools/ci/twinned-specs.mjs),
  // so fit() reports it as coveredByVmTwin before any budgeting happens.
  const specs = ["tests/specs/smoke.spec.js", "tests/specs/boot-guard.spec.js"];
  const r = fit(specs, 5);
  assert.equal(r.selected.length + r.skipped.length + r.unreachable.length
    + r.oversize.length + r.coveredByFixedGates.length, 2,
    "every spec lands in selected, skipped, unreachable, oversize, or an independent fixed gate");
  assert.ok(r.testsSelected <= r.testsFit, `${r.testsSelected} selected into ${r.testsFit}`);
  for (const s of r.skipped) assert.ok(s.tests > 0, "a skipped spec carries its cost");
});

test("a spec bigger than the whole pack runs as OVERSIZE shards, not unreachable", () => {
  // Was "unreachable": every js/net change listed multiplayer-session (19 tests
  // against a 10-test pack) as a permanent REPORT and nobody ran it. With
  // expanded per-circuit counts the same path would have dropped tracks-walls
  // (~63) after the undercount was fixed — skipping the tests the change
  // selected. Too-big-for-the-pack now means its own matrix shard(s); Playwright
  // --shard splits when the expanded count exceeds maxTestsPerShard.
  const big = "tests/specs/multiplayer-session.spec.js";
  const r = fit([big, "tests/specs/boot-guard.spec.js"], 15);
  assert.ok(r.oversize.some((s) => s.file === big),
    `${big} declares ${r.oversize.concat(r.skipped, r.selected, r.unreachable).find((s) => s.file === big)?.tests} ` +
    `tests against a ${r.testsFit}-test pack and must run as its own oversize shard`);
  assert.ok(!r.unreachable.some((s) => s.file === big), "oversize is not double-counted as unreachable");
  assert.ok(!r.skipped.some((s) => s.file === big), "oversize is not double-counted as skipped");
  assert.deepEqual(r.selected.map((s) => s.file), ["tests/specs/boot-guard.spec.js"],
    "a spec that does fit is still selected alongside the oversize plan");
  // A spec that fits the pack ON ITS OWN is ordinary skipping, never
  // oversize — 9 tests + 4 tests against a 10-test pack takes the 4 and
  // skips the 9, which a later change with fewer candidates would pick up.
  const small = fit(["tests/specs/multiplayer-seats.spec.js", "tests/specs/multiplayer-npeer.spec.js"], 15);
  assert.deepEqual(small.oversize.map((s) => s.file), [],
    "a spec smaller than the pack is skipped, not oversize");
  assert.deepEqual(small.unreachable.map((s) => s.file), [],
    "a spec smaller than the pack is skipped, not unreachable");
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
  // ...and the four tools that MOVED to tools/ci/, which is the drift this list
  // actually suffered: the entry named them at the tools/ root, so each matched
  // nothing and a selector edit stopped flagging itself as infra.
  for (const f of ["tools/ci/pick-tests.mjs", "tools/ci/select-specs.mjs",
                   "tools/ci/select-budget.mjs", "tools/ci/run-playwright.mjs"])
    assert.ok(TRACKED.some((re) => re.test(f)), `${f} must be a tracked path`);
});

test("every TRACKED pattern matches a file that exists", () => {
  // THE LINT THAT WOULD HAVE CAUGHT IT, and the reason pick-tests has no dead
  // rules: tests/unit/pick-tests.test.mjs:120 has run exactly this check over
  // RULES for months. TRACKED never had it, so four dead alternatives sat in
  // one regex, silently, while the hand-listed examples above all passed —
  // they only ever probed the members someone thought to name.
  //
  // A dead pattern here FAILS OPEN: it selects nothing, flags nothing, and
  // every run still looks green. Checked against `git ls-files` because these
  // patterns name workflows, tests/data and the shell, which no manifest lists.
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .trim().split("\n");
  const dead = TRACKED.filter((re) => !tracked.some((f) => re.test(f))).map(String);
  assert.deepEqual(dead, [],
    "a TRACKED pattern matches no file in the tree — re-point it at where the file went, or drop it");
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

test("carry-forward only reorders specs this change already routed", () => {
  // Pages 33927358590: a livery lockup routed only test:car, but
  // .selected-failed.txt injected albert-park-foundation + physics-fixes,
  // those timed out first, and carview-parts never ran.
  const routed = ["tests/specs/carview-parts.spec.js", "tests/specs/garage-aero.spec.js"];
  const failed = [
    "tests/specs/albert-park-foundation.spec.js",
    "tests/specs/physics-fixes.spec.js",
    "tests/specs/garage-aero.spec.js",
  ];
  const { inScope, dropped } = scopeCarryForward(failed, routed);
  assert.deepEqual(inScope, ["tests/specs/garage-aero.spec.js"]);
  assert.deepEqual(dropped, [
    "tests/specs/albert-park-foundation.spec.js",
    "tests/specs/physics-fixes.spec.js",
  ]);
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

test("the renderer's blocking spec stays inside the gate it was written for", () => {
  /* tests/specs/render-boot.spec.js exists BECAUSE js/render/ routed to nothing
     that can fail a push: all six test:gfx specs declare 240-540 s against the
     gate's 180 s per-test cap, so a renderer diff emptied the plan and skipped
     the `selected` job entirely.

     That makes its cheapness load-bearing, not incidental. One `test.slow()`,
     one `test.setTimeout`, one `test.describe.configure({ timeout })` — the
     three things maxDeclaredTimeout() walks for — puts it back over the cap and
     silently restores the hole, with every other test in this file still green.
     So the property is asserted directly, on the same function the gate uses. */
  const SPEC = "tests/specs/render-boot.spec.js";
  assert.ok(fs.existsSync(path.join(ROOT, SPEC)), `${SPEC} is gone; so is the renderer's only blocking gate`);
  assert.equal(maxDeclaredTimeout(SPEC), 0,
    `${SPEC} declares a timeout, which excludes it from the selected gate — that is the hole it was written to close`);
  // …and it must actually fit: under the cap by declaration is not enough if it
  // declares more tests than the whole capacity (touch-steer, 25 against 10).
  const cut = fit([SPEC], 15, { rank: () => 3 });
  assert.deepEqual(cut.selected.map((r) => r.file), [SPEC],
    `${SPEC} did not fit the budgeted shard: ${JSON.stringify({ skipped: cut.skipped, unreachable: cut.unreachable, over: cut.overBudgetSpecs })}`);
  // And it is reachable from a renderer diff at all — it has to be in the group
  // js/render/ routes to, or being cheap buys nothing.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok([...specsOf(["test:gfx"], pkg.scripts)].includes(SPEC),
    `${SPEC} is not in test:gfx, which is the group js/render/ routes to`);
});

test("each missed case is attributed to the bucket that actually excluded it", () => {
  /* The footer of select-recall.mjs attributed all four misses to the
     deliberate `>=` per-test budget policy. That was right for three of them
     and WRONG for touch-steer.spec.js, which declares 120 s — comfortably under
     the 180 s cap — and was excluded because it declared 25 tests against a
     10-test capacity. It landed in `unreachable`, and no budget this gate could
     be handed would have admitted it; only splitting the file could.

     THE FILE HAS SINCE BEEN SPLIT (touch-steer / touch-buttons / touch-pedals,
     9 / 9 / 7), which is why this test no longer expects `unreachable` for it.
     That is the fix landing, not the assertion being relaxed: the two lines
     below are stricter than what they replaced, because they say NO spec in the
     tree is unreachable by count rather than merely naming the one that was.

     A wrong attribution is worse than none: it points the fix at the knob that
     cannot move the number. So the bucket stays machine-checked here rather
     than described in prose that drifts. */
  const rows = recall();
  const by = Object.fromEntries(rows.map((r) => [r.catches, r]));
  const touch = by["tests/specs/touch-steer.spec.js"];
  assert.ok(touch, "the touch-steer case left the history");
  assert.doesNotMatch(touch.why, /^unreachable/,
    `touch-steer was split to get it under the 10-test cap; "${touch.why}" says it is still over`);
  // The stronger form: nothing in the tree may be bigger than the whole
  // capacity. A spec that is reads as "not affected by this change" in the
  // plan, which is indistinguishable from being genuinely irrelevant — the
  // exact confusion the 2026-09-22 audit was about.
  const unreachable = rows.filter((r) => /^unreachable/.test(r.why || "")).map((r) => r.catches);
  assert.deepEqual(unreachable, [],
    `spec(s) declare more tests than the gate's whole capacity: ${unreachable.join(", ")}`);
  // The three that ARE the `>=` policy, so a future change that makes them
  // unreachable (or selectable) has to say so here.
  for (const f of ["tests/specs/terrain-over-road.spec.js", "tests/specs/props-over-road.spec.js",
                   "tests/specs/audio-smoke.spec.js"]) {
    assert.match(by[f].why, /^over budget/, `${f} should be the >= per-test policy`);
  }
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

test("every race-fixture spec the gate has starved DECLARES a budget above it", () => {
  // Pages #2048 (2026-09-05) failed its selected gate twice on three specs none
  // of which the change had touched: physics-hotpath declared 120 s (UNDER the
  // 180 s gate, so it was admitted, then its own budget killed it at 132-177 s
  // on the runner), map-hooks and projection declared nothing (read as "fits",
  // ran 185-190 s and 116-125 s + a context that never came). Each boots a full
  // race or two circuits; each belongs to a browser group, not the gate.
  //
  // Same RULE as hud-layout above, one row per victim: above whatever the gate's
  // cap is, and NAMED as over budget in the report. Add a spec here the day the
  // gate starves it — the declaration is the fix, this row keeps it fixed.
  //
  // projection.spec.js was the third row until 2026-09-22: it is ADAPTED now
  // (runs under the vm-page adapter, 13 s), so fit() files it as
  // coveredByVmTwin before budgeting and never as over budget. Its 300 s
  // declaration still stands in the file for the day it leaves ADAPTED.
  for (const spec of [
    "tests/specs/physics-hotpath.spec.js",
    "tests/specs/map-hooks.spec.js",
  ]) {
    const own = maxDeclaredTimeout(spec);
    assert.ok(own > SELECTED_GATE.perTestTimeoutSec * 1000,
      `${spec} declares ${own / 1000}s, at or under the ${SELECTED_GATE.perTestTimeoutSec}s gate — ` +
      "it boots a race fixture and cannot pass there; see Pages #2048");
    const r = fit([spec], 26);
    assert.deepEqual(r.selected, [], `the gate must not select ${spec}`);
    assert.ok(r.overBudgetSpecs.some((x) => x.file === spec), `${spec} must be NAMED as over budget`);
  }
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

test("the cut fills AFFECTED specs first, so the spec you edited cannot lose to smaller routed ones", () => {
  // 2026-09-10 audit: a changed 10-test assets spec was omitted while three
  // smaller routed specs consumed the 10-test budget, because the priority was
  // applied AFTER a smallest-first cut. Real specs so declaredTests resolves.
  const changed = "tests/specs/assets-api.spec.js";
  const small = ["tests/specs/output-paths.spec.js", "tests/specs/telemetry-compare.spec.js",
                 "tests/specs/race-control.spec.js"];
  const rank = (f) => f === changed ? 0 : 3;
  const r = fit([...small, changed], 15, { rank });
  const bigEnough = declaredTests(changed) + Math.min(...small.map(declaredTests)) > r.testsFit;
  assert.ok(bigEnough, "the fixture must not fit alongside the smallest routed spec, or this proves nothing");
  assert.ok(r.selected.some((s) => s.file === changed), "the edited spec is selected");
  assert.equal(r.selected[0].file, changed, "and it is first in the budgeted shard");
  // Under the old smallest-first cut the same inputs dropped it:
  const old = fit([...small, changed], 15);
  assert.ok(!old.selected.some((s) => s.file === changed), "the pre-fix ordering reproduces the audit's omission");
});

test("an affected spec that cannot fit the budget runs in its own OVERSIZE shard, bounded and named", () => {
  const big = "tests/specs/multiplayer-session.spec.js";   // 19 tests against a 10-test cap
  assert.ok(declaredTests(big) > fit([], 15).testsFit, "fixture must exceed the whole cap");
  const affected = fit([big, "tests/specs/boot-guard.spec.js"], 15, { rank: (f) => f === big ? 0 : 3 });
  assert.deepEqual(affected.oversize.map((s) => s.file), [big], "affected + too big = its own shard");
  assert.ok(!affected.unreachable.some((s) => s.file === big), "not reported as unreachable when it will run");
  // Merely routed + too big ALSO runs as oversize: after expanded counts,
  // dropping tracks-walls here would re-open the cancel-with-0-failures hole.
  const routed = fit([big, "tests/specs/boot-guard.spec.js"], 15);
  assert.deepEqual(routed.oversize.map((s) => s.file), [big], "routed + too big still gets a shard");
  assert.deepEqual(routed.unreachable.map((s) => s.file), [], "not parked as unreachable");
  const plan = shards({ ...affected, testsSelected: affected.testsSelected });
  const shard = plan.find((s) => s.name.startsWith("oversize-"));
  assert.ok(shard && shard.specs === big, "the plan carries the oversize spec as its own matrix entry");
  assert.equal(shard.timeout, shardTimeoutMin(declaredTests(big)), "billed at its own declared count");
  assert.ok(MAX_OVERSIZE_SHARDS >= 1 && MAX_OVERSIZE_SHARDS <= 4, "fan-out stays bounded");
});

test("a loop-expanded per-circuit spec is billed at fleet size and split across --shard jobs", () => {
  // The concrete failure: select billed tracks-walls as 4, packed it with
  // foundations into one selected shard (timeout 39), Playwright ran ~63 tests
  // at 45-58 s each, job cancelled at the cap with 0 failures.
  const walls = "tests/specs/tracks-walls.spec.js";
  const n = declaredTests(walls);
  assert.ok(n > maxTestsPerShard(), `walls expands to ${n}, must exceed one job's cap`);
  const r = fit([walls, "tests/specs/boot-guard.spec.js"], 15);
  assert.ok(r.oversize.some((s) => s.file === walls && s.tests === n),
    "walls must leave the packed shard as oversize at its expanded count");
  assert.ok(!r.selected.some((s) => s.file === walls), "must not pack into the budgeted shard");
  const plan = shards({ ...r, testsSelected: r.testsSelected });
  const wallShards = plan.filter((s) => s.specs === walls);
  assert.ok(wallShards.length >= 2, `expected multiple Playwright shards, got ${wallShards.length}`);
  assert.ok(wallShards.every((s) => s.shard && /^\d+\/\d+$/.test(s.shard)),
    "each piece must carry a Playwright --shard=i/n token");
  assert.ok(wallShards.every((s) => s.tests <= maxTestsPerShard()),
    "no piece may exceed the 90-minute-derived per-job cap");
  assert.ok(wallShards.every((s) => s.timeout === shardTimeoutMin(s.tests)),
    "each piece's kill timer matches its billed count");
});

test("a tracked-path change narrows the selection to the edited/imported specs instead of emptying it", () => {
  // Before: reason "infra" set selected = [] and the gate ran nothing for a
  // change to the shell or a shared fixture — silent exactly when everything
  // might be affected. The reason still reports "infra" so the log says why the
  // selection is narrower than the change; the selection itself stands.
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/select-specs.mjs"), "utf8");
  assert.ok(!/reason === "infra"\) \{ r\.skipped/.test(src), "select() no longer blanks the selection on infra");
  assert.match(src, /r\.shards = shards\(r\)/, "select() emits the matrix plan the CI job consumes");
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
  // The cap is now DERIVED per shard by shardTimeoutMin and handed to the job
  // through the matrix, so the workflow must read it from there and the
  // function must clear the worst case for the budgeted shard.
  assert.match(yml, /name: Selected specs[\s\S]*?timeout-minutes: \$\{\{ matrix\.timeout \}\}/,
    "the selected job's cap must come from the matrix (shardTimeoutMin), not a literal");
  const budgeted = fit([], 15).testsFit;
  const worstCaseMin = (budgeted * SELECTED_GATE.perTestTimeoutSec) / 60 + 4;
  assert.ok(shardTimeoutMin(budgeted) >= worstCaseMin,
    `shardTimeoutMin(${budgeted}) = ${shardTimeoutMin(budgeted)} is under the worst case (${worstCaseMin.toFixed(0)} min): ` +
    "the job would be CANCELLED, which reads as 0 failures and hides a dead deploy");
  // The deploy gate runs it now: no caller-key exclusion on the plan job.
  const selectJob = /\n  select:\n[\s\S]*?\n  selected:\n/.exec(yml)?.[0] || "";
  assert.ok(selectJob && !/concurrency_key == ''/.test(selectJob),
    "the select job must not skip itself on the Pages call — exact-commit deploys need the change-aware gate too");
});

test("raising the gate must not enrol specs that opted out of the lower one", () => {
  // The defect: the exclusion used `own > gate`, so a spec declaring EXACTLY
  // the gate's budget was SELECTED with zero headroom and then killed at its
  // own declared figure. Raising the gate 120 -> 180 s silently pulled in all
  // five specs that declare exactly 180 s — audio-smoke (115.5 s SOLO on an
  // idle 4-core), material-shimmer, and the qatar/spa/suzuka foundations —
  // each of which had opted out of the 120 s gate on purpose.
  //
  // The rule is about what must NOT happen (be selected), not about which
  // channel catches it: a spec can also be excluded earlier for being covered
  // by a fixed gate or replayed by a VM twin, and aero-zones.spec.js (540 s)
  // legitimately arrives that way.
  const gateMs = SELECTED_GATE.perTestTimeoutSec * 1000;
  const files = fs.readdirSync(path.join(ROOT, "tests/specs"))
    .filter((f) => f.endsWith(".spec.js")).map((f) => `tests/specs/${f}`);
  const r = fit(files, 15);
  const selected = new Set(r.selected.map((x) => x.file));
  const atOrOver = files.filter((f) => maxDeclaredTimeout(f) >= gateMs);
  assert.ok(atOrOver.length > 0, "no spec declares at or over the gate — this test is vacuous");
  for (const f of atOrOver) {
    assert.ok(!selected.has(f),
      `${f} declares ${maxDeclaredTimeout(f) / 1000}s against a ` +
      `${SELECTED_GATE.perTestTimeoutSec}s gate but was SELECTED — ` +
      "it would be killed at its own declared budget, which reads as a code failure");
  }
});

/* A DOCS-ONLY DEPLOY MUST NOT FAIL THE SELECTED GATE (2026-09-08).
 *
 * ci.yml's push trigger ignores docs/**, **&#47;*.md, .claude/** and .cursor/**, so a
 * docs commit never reaches the selected gate by push. pages.yml CALLS the
 * workflow, and workflow_call does not honour paths-ignore — so on the DEPLOY
 * path the gate saw a docs diff, matched no rule, and failed closed. An
 * AGENTS.md-only deploy took a Pages run red for a change that ships no code.
 * "unmatched" means the selection is untrustworthy; "no code changed" is a
 * different fact and now has its own reason. */
test("a docs-only change is 'nothing to select', never 'unmatched'", () => {
  assert.equal(isDocsOnly(["AGENTS.md"]), true, "the file that actually broke it");
  assert.equal(isDocsOnly(["docs/TESTING.md", "README.md"]), true);
  assert.equal(isDocsOnly([".claude/skills/x/SKILL.md"]), true);
  // .mdc is not .md, so this one rides on the .cursor/ PREFIX rule, not the
  // extension rule — which is exactly why the list needs both shapes.
  assert.equal(isDocsOnly([".cursor/rules/apex-shared.mdc"]), true);
  // A docs change RIDING ALONG with code is not docs-only: the code must select.
  assert.equal(isDocsOnly(["AGENTS.md", "js/game.js"]), false);
  assert.equal(isDocsOnly(["js/game.js"]), false);
  // No files changed at all is "none", handled before this predicate.
  assert.equal(isDocsOnly([]), false);
});

test("DOCS_ONLY still mirrors ci.yml's paths-ignore", () => {
  // The comment on DOCS_ONLY says these two lists move together. If someone
  // adds a path to the workflow's ignore list and not here, a deploy touching
  // only that path fails closed again — which is the whole defect.
  const ci = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const ignored = [...ci.matchAll(/^\s*-\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);
  for (const pat of ["docs/**", "**/*.md", ".claude/**", ".cursor/**"]) {
    assert.ok(ignored.includes(pat), `ci.yml no longer ignores ${pat} — re-derive DOCS_ONLY`);
  }
  assert.equal(DOCS_ONLY.length, 4, "a pattern was added or removed without updating this pin");
});


/* THE SELECTOR AIMED AT ITSELF — the three holes a 2026-09-20 survey found in
 * the machinery whose whole job is deciding what the gate runs. */

test("the TRACKED infra list names where the selector tools ACTUALLY live", () => {
  // These four moved tools/ -> tools/ci/ and this list kept the old paths, so
  // a change to the selection machinery matched no rule, selected ZERO browser
  // specs, and printed no "SELECTION NARROWER THAN THE CHANGE" warning. A
  // selector that goes silent precisely when it is the thing being edited is
  // the failure TRACKED exists to prevent, turned on itself.
  const hit = (p) => TRACKED.some((r) => r.test(p));
  for (const f of ["tools/ci/select-specs.mjs", "tools/ci/pick-tests.mjs",
                   "tools/ci/select-budget.mjs", "tools/ci/run-playwright.mjs"]) {
    assert.ok(hit(f), `${f} is selection machinery and must be TRACKED`);
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist — re-point TRACKED, do not pin a ghost`);
  }
  assert.ok(hit("tools/manifest.cjs"), "manifest.cjs is still at tools/, not tools/ci/");
});

test("an over-budget spec the diff EDITS still runs; one merely routed still does not", () => {
  /* 56 of 119 specs declare >= the gate's 180 s, and the over-budget test used
     to `continue` BEFORE ranking — so 47% of the suite could not be selected by
     any change, including a change that edits the spec itself. Four of the five
     faults select-recall.mjs records as CAUGHT are in that 56, so the harness
     was scoring a selector the gate does not run.

     The `>=` rule is unchanged and still right: declaring the whole budget opts
     a spec out of the BUDGETED shard. What it may not do is opt the spec out of
     running when you just edited it — that case already has its own shard. */
  const over = "tests/specs/career.spec.js";            // declares well over the gate
  assert.ok(maxDeclaredTimeout(over) >= 180000, "pick a spec that is still over budget");

  const edited = fit([over], 30, { rank: (f) => (f === over ? 0 : 3) });
  assert.deepEqual(edited.oversize.map((s) => s.file), [over], "an EDITED over-budget spec runs in its own shard");
  assert.equal(edited.overBudgetSpecs.length, 0);
  assert.equal(edited.selected.length, 0, "…but never inside the budgeted shard");

  const routed = fit([over], 30, { rank: () => 3 });
  assert.deepEqual(routed.overBudgetSpecs.map((s) => s.file), [over], "a merely ROUTED one is still excluded");
  assert.equal(routed.oversize.length, 0);

  // And each shard is billed at the spec's OWN declared figure, not the gate's:
  // deriving a 180 s cap for a spec that says it needs 300+ kills the job, and
  // a killed job reads as "0 failures". Loop-expanded / high-timeout specs
  // further split across --shard=i/n so each piece stays under the 90-minute
  // hard cap (career at 540 s/test → 9 tests/job).
  const pieces = shards(edited).filter((x) => x.name.startsWith("oversize-"));
  assert.ok(pieces.length >= 1, "the oversize spec gets at least one shard");
  assert.ok(pieces.every((s) => s.specs === over), "every piece names the edited spec");
  assert.ok(pieces.every((s) => s.timeout === shardTimeoutMin(s.tests, edited.oversize[0].ownTimeoutSec)),
    "each piece is billed at the spec's own per-test timeout");
  if (pieces.length > 1) {
    assert.ok(pieces.every((s) => /^\d+\/\d+$/.test(s.shard)),
      "a split plan carries Playwright --shard tokens");
  }
});

test("a spec this tool cannot READ is reported, never silently dropped", () => {
  // It used to `continue` into no bucket at all, in a file whose entire
  // contract is that nothing leaves the selection unaccounted for. Reachable
  // by any missing or renamed path — found by handing fit() a spec that does
  // not exist and watching it vanish from every list in the result.
  // BUILT, not written as a literal: docs-integrity.test.mjs scans source for
  // path-shaped tokens and fails on any that does not exist — correctly, and a
  // deliberately-absent path is exactly the case it cannot tell from a typo.
  const ghost = ["tests", "specs", "no-such-spec.spec.js"].join("/");
  assert.ok(!fs.existsSync(path.join(ROOT, ghost)), "the point of this test is that it is absent");
  const r = fit([ghost], 60, { rank: () => 3 });
  assert.deepEqual(r.unreadable.map((s) => s.file), [ghost]);
  for (const k of ["selected", "skipped", "unreachable", "oversize", "overBudgetSpecs"]) {
    assert.equal((r[k] || []).length, 0, `${k} must not claim a spec that could not be read`);
  }
});

test("fit bills each spec at its MEASURED rate, and an unmeasured selection cuts where it always did", () => {
  // 2026-09-24: the cut counted TESTS against a cap derived from one 79.7 s
  // mean, so the per-spec medians select-budget reports (3+ CI samples) never
  // moved a selection — ~12 % of routed specs ran. Synthetic histories pin it.
  // Budgeted specs only: none twinned, fixed-gate or over the per-test gate.
  const specs = ["tests/specs/output-paths.spec.js", "tests/specs/telemetry-compare.spec.js",
                 "tests/specs/assets-api.spec.js"];
  const empty = { specs: {} };
  const flat = fit(specs, 15, { db: empty });
  assert.ok(flat.testsSelected <= flat.testsFit, "no history: the old test-count boundary holds");
  const cheap = { specs: Object.fromEntries(specs.map((f) => [f,
    { s: [1, 2, 3].map((i) => [`2026-09-2${i}T00:00:00Z`, "llvmpipe", 5 * declaredTests(f), declaredTests(f)]) }])) };
  const measured = fit(specs, 15, { db: cheap });
  assert.equal(measured.selected.length, specs.length, "every spec at 5 s a test fits a 15-minute budget");
  assert.ok(measured.selected.length > flat.selected.length, "the measured rate must change the cut, or it is decoration");
  assert.ok(measured.secSelected <= measured.secFit, `${measured.secSelected} s billed into ${measured.secFit} s`);
  // Two samples are not a median: below MIN_SAMPLES the constant stands.
  const thin = { specs: Object.fromEntries(Object.entries(cheap.specs).map(([f, v]) => [f, { s: v.s.slice(0, 2) }])) };
  assert.deepEqual(fit(specs, 15, { db: thin }).selected.map((s) => s.file), flat.selected.map((s) => s.file));
  // A local sample never sets a CI budget.
  const local = { specs: Object.fromEntries(Object.entries(cheap.specs).map(([f, v]) => [f, { s: v.s.map((x) => [x[0], "local", x[2], x[3]]) }])) };
  assert.deepEqual(fit(specs, 15, { db: local }).selected.map((s) => s.file), flat.selected.map((s) => s.file));
  // More tests than the fallback cap counts may now share the shard; its
  // runner cap must still clear every one of them timing out.
  const plan = shards({ ...measured, oversize: [] });
  assert.equal(plan[0].timeout, shardTimeoutMin(Math.max(measured.testsFit, measured.testsSelected)));
});
