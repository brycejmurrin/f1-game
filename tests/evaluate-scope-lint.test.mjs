// evaluate-scope-lint — page.evaluate() callbacks may not close over Node.
//
// `page.evaluate(fn)` does not CALL fn. It serialises it, ships it to the
// browser and evaluates it there, so the callback has no access to the module
// scope it was written in. A Node-side `const` read inside it is not a closure,
// it is a ReferenceError in the page — and the test then fails for a reason
// with nothing to do with what it asserts.
//
// This cost a commit. 58614db2 introduced FLAT_LAUNCH / CLIMB_LAUNCH as module
// constants and used them inside the evaluate; every elevation track died, four
// of which had been green, and it read as a physics regression. The lint finds
// exactly those two sites in that commit — asserted below against the real
// file, not a fixture, because a lint that only catches its own examples
// catches nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintSource, lintAll } from "../tools/evaluate-scope-lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a Node-side const read inside evaluate() is an error", () => {
  const src = `const LAUNCH = 40;
    await page.evaluate(() => { window.__apex.jump(0, LAUNCH, 0); });`;
  const bad = lintSource(src);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].name, "LAUNCH");
});

test("passing it in as an argument is the fix, and lints clean", () => {
  const src = `const LAUNCH = 40;
    await page.evaluate(({ LAUNCH }) => { window.__apex.jump(0, LAUNCH, 0); }, { LAUNCH });`;
  assert.deepEqual(lintSource(src), []);
});

test("page globals and the game's own globals are allowed", () => {
  const src = `await page.evaluate(() => {
      const a = window.__apex; Tracks.LIST.length; Math.max(1, 2);
      return document.querySelectorAll("div").length;
    });`;
  assert.deepEqual(lintSource(src), []);
});

test("waitForFunction is checked too — same boundary, same trap", () => {
  const src = `const TIMEOUT_SPEED = 5;
    await page.waitForFunction(() => window.__apex.probe().speed > TIMEOUT_SPEED);`;
  const bad = lintSource(src);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].method, "waitForFunction");
});

test("it catches the REAL bug it was written for, at both sites", () => {
  // Anti-vacuity against the actual commit rather than a hand-made example: if
  // the analysis ever stops resolving module bindings, the synthetic cases
  // above could keep passing while the lint silently detects nothing.
  const broken = execFileSync("git", ["show", "58614db2:tests/elevation-tracks.spec.js"],
                              { cwd: ROOT, encoding: "utf8", maxBuffer: 8 << 20 });
  const bad = lintSource(broken);
  assert.deepEqual(bad.map((b) => b.name).sort(), ["CLIMB_LAUNCH", "FLAT_LAUNCH"]);
});

test("the tree is clean", () => {
  const rows = lintAll();
  const msg = rows.flatMap((r) => r.parseError
    ? [`${r.file}: ${r.parseError}`]
    : r.violations.map((v) => `${r.file}:${v.line} ${v.method}() closes over ${v.name}`));
  assert.deepEqual(msg, []);
});
