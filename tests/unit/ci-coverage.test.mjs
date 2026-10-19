// ci-coverage — the fixed-spec census and dynamic-gate contract both need guards.
//
// Nothing consumes this report automatically. A broken parse could claim zero
// fixed specs or a non-blocking/push-only selector and still look plausible.
// These tests pin the mechanism and event/base semantics, never the count.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { report, ALL_SPECS, expand, groupSpecs } from "../../tools/ci/ci-coverage.mjs";

test("it sees the specs on disk", () => {
  assert.ok(ALL_SPECS.length > 50, `only ${ALL_SPECS.length} specs found — the scan is broken`);
  assert.ok(ALL_SPECS.every((s) => s.startsWith("tests/") && s.endsWith(".spec.js")));
});

test("a single-star glob expands the way package.json means it", () => {
  // test:car is written with tests/specs/parts-*.spec.js — if this stopped expanding,
  // every group defined by a glob would silently contribute zero.
  const hits = expand("tests/specs/parts-*.spec.js");
  assert.ok(hits.length >= 5, `parts-*.spec.js expanded to ${hits.length}`);
  assert.ok(hits.includes("tests/specs/parts-physics.spec.js"));
  assert.ok(!hits.includes("tests/specs/smoke.spec.js"));
});

test("a literal path resolves, and a bogus one does not", () => {
  assert.deepEqual(expand("tests/specs/smoke.spec.js"), ["tests/specs/smoke.spec.js"]);
  assert.deepEqual(expand("tests/specs/there-is-no-such.spec.js"), []);
  assert.deepEqual(expand("js/game.js"), []);
});

test("group scripts resolve to their spec lists", () => {
  assert.deepEqual(groupSpecs("test:smoke"), ["tests/specs/smoke.spec.js"]);
  assert.equal(groupSpecs("test:there-is-no-such-group"), null);
});

test("the ci.yml parse finds SOMETHING — anti-vacuity", () => {
  // The failure mode this exists for: a workflow edit changes the `run:` shape,
  // the regex stops matching, and the tool reports a gate that runs nothing.
  assert.ok(report.specsInFixedGates > 0,
    "ci-coverage found NO specs executed by CI — the ci.yml parse has broken, " +
    "or the gate really has stopped running browser tests. Check which before " +
    "believing the number.");
  assert.ok(report.specsInFixedGates <= report.specsOnDisk);
  assert.equal(report.specsInFixedGates + report.specsOutsideFixedGates, report.specsOnDisk);
});

test("the fixed blocking floor: 3 specs, named, and it may not drift down", () => {
  /* A REPORT WITH NO FLOOR IS A NUMBER NOBODY DEFENDS. ci-coverage.mjs was
     written to describe the gate, not to constrain it, so "3 of 119 specs in
     fixed gates" could have walked to 0 — one `if:` on the smoke job, one
     deleted `run:` line — and the only thing that would have noticed is a
     person reading a routine report line. The anti-vacuity test above catches
     `> 0`, which the driving-model gate alone satisfies.

     The floor is taken on the BLOCKING count, not on `specsInFixedGates`: the
     RAISE THIS when a spec genuinely joins a fixed blocking gate. Lowering it
     means the deploy gate got weaker, which is the event this exists to make
     loud — not a number to edit until the test is quiet. */
  const FIXED_BLOCKING_FLOOR = 3;
  assert.ok(report.specsInBlockingFixedGates >= FIXED_BLOCKING_FLOOR,
    `only ${report.specsInBlockingFixedGates} spec(s) run in a fixed BLOCKING gate, floor is ` +
    `${FIXED_BLOCKING_FLOOR}. A fixed gate stopped gating: ${report.blocking.join(", ") || "(none)"}`);
  // Named, so "still 3" cannot be satisfied by three different specs after the core quietly left. Only the core is
  // pinned: pinning the whole blocking list made every legitimate blocking-spec change a red here (T2-16).
  const CORE_BLOCKING = ["tests/specs/smoke.spec.js", "tests/specs/physics-characterization.spec.js", "tests/specs/render-boot.spec.js"];
  assert.deepEqual(CORE_BLOCKING.filter((s) => !report.blocking.includes(s)), [],
    "a core spec left the fixed BLOCKING gates — the deploy gate got weaker");
  // The golden baseline is now blocking on scheduled/manual runs.
  assert.ok(report.executed.includes("tests/specs/menu-baseline.spec.js"));
  assert.ok(report.blocking.includes("tests/specs/menu-baseline.spec.js"));
  assert.equal(report.specsInFixedGates - report.specsInBlockingFixedGates, 0);
});

test("smoke and the driving-model gate are both seen", () => {
  // These two are what the ci.yml header promises the gate covers. If either
  // stops being detected, the report is wrong in the reassuring direction.
  assert.ok(report.executed.includes("tests/specs/smoke.spec.js"),
    "CI runs test:smoke but ci-coverage did not see it");
  assert.ok(report.executed.includes("tests/specs/physics-characterization.spec.js"),
    "CI runs the driving-model gate by path but ci-coverage did not see it");
});

test("it does not claim to cover what it cannot", () => {
  // test:render / test:headless drive whole PROJECTS and name no spec, so they
  // must resolve to nothing rather than being counted as blanket coverage.
  // NAME ONLY LIVE GROUPS, AND PROVE THEY ARE LIVE. This read
  // `["test:render", "test:headless"]` behind `if (specs !== null)`.
  // test:headless was dropped on 2026-09-10 (docs/TESTING.md), so groupSpecs
  // returned null, the `if` swallowed it, and half this guard was unreachable —
  // green because it checked nothing. A dead name in a list must fail, not skip:
  // that is the same fail-open shape as a regex that matches no path.
  for (const g of ["test:render"]) {
    const specs = groupSpecs(g);
    assert.notEqual(specs, null,
      `${g} is named here but no longer resolves to a group — drop the name or restore the script`);
    assert.deepEqual(specs, [],
      `${g} names no spec on its command line, so it must not contribute specs`);
  }
});

// The change-aware gate (2026-09-10): `select` plans, `selected` runs the plan
// as a matrix. The plan job is the trigger; the step script it delegates to
// carries the fail-closed strings.
// Both bounded at the next job head. An unbounded `split("\n  selected:")[1]`
// reads every job appended after it as part of it, so a later job's
