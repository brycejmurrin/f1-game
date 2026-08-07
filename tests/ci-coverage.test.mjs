// ci-coverage — a REPORTER needs a guard more than a gate does.
//
// Nothing consumes this tool's number automatically, so if its ci.yml parse
// broke it would quietly report "CI executes 0 specs" and read as an alarming
// finding, or "110" and read as reassurance. Both are worse than no report.
// These tests pin the mechanism, never the number: the count is expected to
// move as the gate grows, and a test that pins it would just be a chore.
import test from "node:test";
import assert from "node:assert/strict";
import { report, ALL_SPECS, expand, groupSpecs } from "../tools/ci-coverage.mjs";

test("it sees the specs on disk", () => {
  assert.ok(ALL_SPECS.length > 50, `only ${ALL_SPECS.length} specs found — the scan is broken`);
  assert.ok(ALL_SPECS.every((s) => s.startsWith("tests/") && s.endsWith(".spec.js")));
});

test("a single-star glob expands the way package.json means it", () => {
  // test:parts is written as tests/parts-*.spec.js — if this stopped expanding,
  // every group defined by a glob would silently contribute zero.
  const hits = expand("tests/parts-*.spec.js");
  assert.ok(hits.length >= 5, `parts-*.spec.js expanded to ${hits.length}`);
  assert.ok(hits.includes("tests/parts-physics.spec.js"));
  assert.ok(!hits.includes("tests/smoke.spec.js"));
});

test("a literal path resolves, and a bogus one does not", () => {
  assert.deepEqual(expand("tests/smoke.spec.js"), ["tests/smoke.spec.js"]);
  assert.deepEqual(expand("tests/there-is-no-such.spec.js"), []);
  assert.deepEqual(expand("js/game.js"), []);
});

test("group scripts resolve to their spec lists", () => {
  assert.deepEqual(groupSpecs("test:smoke"), ["tests/smoke.spec.js"]);
  assert.equal(groupSpecs("test:there-is-no-such-group"), null);
});

test("the ci.yml parse finds SOMETHING — anti-vacuity", () => {
  // The failure mode this exists for: a workflow edit changes the `run:` shape,
  // the regex stops matching, and the tool reports a gate that runs nothing.
  assert.ok(report.specsExecutedByCI > 0,
    "ci-coverage found NO specs executed by CI — the ci.yml parse has broken, " +
    "or the gate really has stopped running browser tests. Check which before " +
    "believing the number.");
  assert.ok(report.specsExecutedByCI <= report.specsOnDisk);
});

test("smoke and the driving-model gate are both seen", () => {
  // These two are what the ci.yml header promises the gate covers. If either
  // stops being detected, the report is wrong in the reassuring direction.
  assert.ok(report.executed.includes("tests/smoke.spec.js"),
    "CI runs test:smoke but ci-coverage did not see it");
  assert.ok(report.executed.includes("tests/physics-characterization.spec.js"),
    "CI runs the driving-model gate by path but ci-coverage did not see it");
});

test("it does not claim to cover what it cannot", () => {
  // test:render / test:headless drive whole PROJECTS and name no spec, so they
  // must resolve to nothing rather than being counted as blanket coverage.
  for (const g of ["test:render", "test:headless"]) {
    const specs = groupSpecs(g);
    if (specs !== null) assert.deepEqual(specs, [],
      `${g} names no spec on its command line, so it must not contribute specs`);
  }
});
