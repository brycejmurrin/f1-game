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
import { titlesIn, audit } from "../tools/test-observed.mjs";

test("a top-level test carries the file's basename as an implicit suite", () => {
  const src = `import { test } from "./fixtures.js";\ntest("does a thing", async () => {});`;
  const [t] = titlesIn(src, "tests/smoke.spec.js");
  assert.equal(t.full, "tests/smoke.spec.js › smoke.spec.js › does a thing");
});

test("a test inside a describe does NOT get the implicit suite", () => {
  const src = `test.describe("group", () => { test("does a thing", async () => {}); });`;
  const [t] = titlesIn(src, "tests/smoke.spec.js");
  assert.equal(t.full, "tests/smoke.spec.js › group › does a thing");
});

test("nested describes nest, and each test is emitted once", () => {
  const src = `test.describe("outer", () => {
    test.describe("inner", () => { test("leaf", async () => {}); });
    test("sibling", async () => {});
  });`;
  const titles = titlesIn(src, "tests/smoke.spec.js").map((t) => t.full);
  assert.deepEqual(titles.sort(), [
    "tests/smoke.spec.js › outer › inner › leaf",
    "tests/smoke.spec.js › outer › sibling",
  ]);
});

test("sharedTest declarations are counted like test declarations", () => {
  // Six specs import `sharedTest as test`, so the alias is what appears; but a
  // spec importing it under its own name must not become invisible.
  const src = `sharedTest("shared thing", async () => {});`;
  const [t] = titlesIn(src, "tests/smoke.spec.js");
  assert.equal(t.full, "tests/smoke.spec.js › smoke.spec.js › shared thing");
});

test("skipped tests are declared but not counted as unobserved", () => {
  // A skipped test is unobserved BY INTENT. Counting it beside the accidental
  // ones is how the accidental ones get lost in the noise.
  const src = `test.skip("not now", async () => {});`;
  const [t] = titlesIn(src, "tests/smoke.spec.js");
  assert.equal(t.skipped, true);
});

test("every spec in the repo parses", () => {
  // A parse failure silently drops a whole file's tests from the denominator,
  // which reads as "nothing to worry about here".
  const bad = audit().filter((r) => r.parseError);
  assert.deepEqual(bad.map((b) => `${b.file}: ${b.parseError}`), []);
});

test("the audit finds real tests, and its titles match real log lines", () => {
  // End-to-end anti-vacuity: if the reporter's format drifted, or extraction
  // broke, `observed` would collapse to zero across the board and the tool
  // would report the entire suite as never-run rather than failing.
  const rows = audit();
  const declared = rows.reduce((a, r) => a + (r.declared || 0), 0);
  const observed = rows.reduce((a, r) => a + (r.observed || 0), 0);
  assert.ok(declared > 500, `expected the suite to declare 500+ tests, got ${declared}`);
  assert.ok(observed > 0,
    "no declared title matched any artifacts/logs line — extraction and the " +
    "live-reporter format have diverged, which makes the tool useless rather than wrong");
});
