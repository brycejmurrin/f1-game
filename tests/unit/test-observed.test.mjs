// test-observed — the tool that answers "has this test EVER actually run here?"
//
// It exists because three tests landed this session that had never been
// executed, each red and unnoticed for as long as it had existed. The tool is
// only useful if its title extraction matches the reporter's EXACTLY: a title
// it derives differently from the way live-reporter.js prints it reads as
// "never observed" forever, and a tool that cries wolf on every spec gets
// ignored — which is the same failure as not having it.
//
// That is not hypothetical. The first version missed Playwright's implicit
// suite title (a top-level test prints as "file › basename › title", one inside
// a describe does not) and reported every describe-less spec as 100% never-run,
// including one verified green minutes earlier.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { titlesIn, audit, observedTitles } from "../../tools/ci/test-observed.mjs";

// The repo root, whose artifacts/logs is what tools/ci/test-observed.mjs reads.
// (Resolving "../artifacts/logs" from tests/unit pointed at tests/artifacts/logs,
// which never exists, so the observed half below never ran.)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a top-level test carries its testDir-relative path as an implicit suite", () => {
  const src = `import { test } from "./fixtures.js";\ntest("does a thing", async () => {});`;
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.equal(t.full, "tests/specs/smoke.spec.js › specs/smoke.spec.js › does a thing");
});

test("a test inside a describe does NOT get the implicit suite", () => {
  const src = `test.describe("group", () => { test("does a thing", async () => {}); });`;
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.equal(t.full, "tests/specs/smoke.spec.js › group › does a thing");
});

test("nested describes nest, and each test is emitted once", () => {
  const src = `test.describe("outer", () => {
    test.describe("inner", () => { test("leaf", async () => {}); });
    test("sibling", async () => {});
  });`;
  const titles = titlesIn(src, "tests/specs/smoke.spec.js").map((t) => t.full);
  assert.deepEqual(titles.sort(), [
    "tests/specs/smoke.spec.js › outer › inner › leaf",
    "tests/specs/smoke.spec.js › outer › sibling",
  ]);
});

test("sharedTest declarations are counted like test declarations", () => {
  // Six specs import `sharedTest as test`, so the alias is what appears; but a
  // spec importing it under its own name must not become invisible.
  const src = `sharedTest("shared thing", async () => {});`;
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.equal(t.full, "tests/specs/smoke.spec.js › specs/smoke.spec.js › shared thing");
});

test("a loop-generated title becomes a PATTERN, not a dropped declaration", () => {
  // 16 specs declare tests as test(`${id}: …`) inside a for-of over a track
  // list. Dropping them undercounts the denominator AND reports the spec as
  // fully observed — elevation-tracks read as 5 declared when it runs 47, so
  // the whole `circuit` group reported 0/20 against an actual 64.
  const src = "for (const id of X) { test(`${id}: holds on the grade`, async () => {}); }";
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.equal(t.dynamic, true);
  assert.ok(t.pattern.test("tests/specs/smoke.spec.js › specs/smoke.spec.js › cota: holds on the grade"));
  assert.ok(t.pattern.test("tests/specs/smoke.spec.js › specs/smoke.spec.js › spa: holds on the grade"));
  // and does not swallow an unrelated title from the same file
  assert.ok(!t.pattern.test("tests/specs/smoke.spec.js › specs/smoke.spec.js › something else"));
});

test("regex metacharacters in a template's literal chunks are escaped", () => {
  // A title containing "(" or "+" would otherwise build an invalid or
  // over-matching pattern — and the repo has plenty: "slope gravity behaves +
  // road-following holds on the grade".
  const src = "test(`${id}: a + b (c)`, async () => {});";
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.ok(t.pattern.test("tests/specs/smoke.spec.js › specs/smoke.spec.js › x: a + b (c)"));
  assert.ok(!t.pattern.test("tests/specs/smoke.spec.js › specs/smoke.spec.js › x: a  b  c "));
});

test("skipped tests are declared but not counted as unobserved", () => {
  // A skipped test is unobserved BY INTENT. Counting it beside the accidental
  // ones is how the accidental ones get lost in the noise.
  const src = `test.skip("not now", async () => {});`;
  const [t] = titlesIn(src, "tests/specs/smoke.spec.js");
  assert.equal(t.skipped, true);
});

test("every spec in the repo parses", () => {
  // A parse failure silently drops a whole file's tests from the denominator,
  // which reads as "nothing to worry about here".
  const bad = audit().filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

test("the audit finds real tests, and its titles match real log lines", (t) => {
  // End-to-end anti-vacuity: if the reporter's format drifted, or extraction
  // broke, `observed` would collapse to zero across the board and the tool
  // would report the entire suite as never-run rather than failing.
  const rows = audit();
  const declared = rows.reduce((a, r) => a + (r.declared || 0), 0);
  assert.ok(declared > 500, `expected the suite to declare 500+ tests, got ${declared}`);

  // The observed half needs Playwright logs to compare against, and
  // `artifacts/` is GITIGNORED — it does not exist in CI at all, and locally it
  // often holds only node TAP / gate logs, where every title is legitimately
  // unobserved. Asserting observed > 0 unconditionally turned CI red for an
  // environment fact rather than a defect. So gate on a live-reporter result
  // line naming a spec that still exists (a deleted spec's line can never
  // match a declared title), and say so when there is nothing to check.
  const reported = [...observedTitles().keys()]
    .filter((title) => fs.existsSync(path.join(ROOT, title.split(" › ")[0])));
  if (!reported.length) {
    t.skip("no Playwright live-reporter line for a current spec in artifacts/logs — observed half not checkable here");
    return;
  }
  const observed = rows.reduce((a, r) => a + (r.observed || 0), 0);
  assert.ok(observed > 0,
    `${reported.length} live-reporter titles in artifacts/logs, none matching a declared title — ` +
    "extraction and the live-reporter format have diverged, which makes the tool useless rather than wrong");
});
