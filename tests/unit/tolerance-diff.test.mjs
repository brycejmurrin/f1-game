/* tolerance-diff.test.mjs — tools/check/tolerance-diff.mjs (#1685): a PR that loosens a test tolerance next to
 * production changes fails, unless tests/data/tolerance-exceptions.json names it. Fixture diffs, pure node, < 0.3 s. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check, loosenings, parseDiff, loadExceptions } from "../../tools/check/tolerance-diff.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const diff = (testFile, removed, added, { prod = true } = {}) => [
  `diff --git a/${testFile} b/${testFile}`, `--- a/${testFile}`, `+++ b/${testFile}`, "@@ -10 +10 @@",
  `-${removed}`, `+${added}`,
  ...(prod ? ["diff --git a/js/game.js b/js/game.js", "--- a/js/game.js", "+++ b/js/game.js", "@@ -5 +5 @@", "-let a = 1;", "+let a = 2;"] : []),
].join("\n");

test("a widened toBeCloseTo next to a production change fails", () => {
  const r = check(diff("tests/specs/physics-fixes.spec.js", "expect(x).toBeCloseTo(1.5, 3);", "expect(x).toBeCloseTo(1.5, 1);"));
  assert.equal(r.fail, true);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.from, f.to]), [["toBeCloseTo digits", 3, 1]]);
  assert.deepEqual(r.production, ["js/game.js"]);
});

test("tightening, an unrelated edit and a loop bound are not findings", () => {
  assert.equal(check(diff("tests/unit/ratchets.test.mjs", "expect(x).toBeCloseTo(1.5, 1);", "expect(x).toBeCloseTo(1.5, 3);")).findings.length, 0);
  assert.equal(check(diff("tests/unit/ratchets.test.mjs", "assert.ok(err < 0.5);", "assert.ok(err < 0.25);")).findings.length, 0);
  assert.equal(check(diff("tests/unit/ratchets.test.mjs", "for (let i = 0; i < 5; i++) run(i);", "for (let i = 0; i < 9; i++) run(i);")).findings.length, 0);
  // masked text differs: a different assertion, not a loosened one
  assert.equal(check(diff("tests/unit/ratchets.test.mjs", "assert.ok(a < 1);", "assert.ok(b < 9);")).findings.length, 0);
});

test("each bound direction: upper raised, lower dropped, a named tolerance grown", () => {
  const rule = (a, b) => loosenings(a, b).map((f) => f.rule);
  assert.deepEqual(rule("assert.ok(Math.abs(a - b) < 0.5);", "assert.ok(Math.abs(a - b) < 2);"), ["upper bound"]);
  assert.deepEqual(rule("expect(n).toBeLessThanOrEqual(10);", "expect(n).toBeLessThanOrEqual(12);"), ["upper bound"]);
  assert.deepEqual(rule("expect(n).toBeGreaterThan(5);", "expect(n).toBeGreaterThan(1);"), ["lower bound"]);
  assert.deepEqual(rule("assert.ok(v >= 30);", "assert.ok(v >= 20);"), ["lower bound"]);
  assert.deepEqual(rule("const TOL = 0.01; assert.ok(x);", "const TOL = 0.5; assert.ok(x);"), ["named tolerance"]);
  assert.deepEqual(rule("assert.ok(v <= 3);", "assert.ok(v <= 1);"), [], "a tighter upper bound");
  // an arrow body is not a >= bound
  assert.deepEqual(rule("expect(f(x => 5)).toBe(1);", "expect(f(x => 2)).toBe(1);"), []);
});

test("a test-only PR passes unless --always; production files are js/ css/ index.html sw.js", () => {
  const d = diff("tests/unit/ratchets.test.mjs", "expect(x).toBeCloseTo(1, 4);", "expect(x).toBeCloseTo(1, 2);", { prod: false });
  assert.equal(check(d).fail, false);
  assert.equal(check(d, { always: true }).fail, true);
  assert.equal(check(d).findings.length, 1, "still reported");
});

test("an excepted row passes; a stale or reasonless row is reported", () => {
  const d = diff("tests/specs/physics-fixes.spec.js", "expect(x).toBeCloseTo(1.5, 3);", "expect(x).toBeCloseTo(1.5, 1);");
  const ok = check(d, { exceptions: [{ file: "tests/specs/physics-fixes.spec.js", line: "toBeCloseTo(1.5, 1)", reason: "sensor quantised to 0.1 by #1234" }] });
  assert.equal(ok.fail, false);
  assert.equal(ok.excepted.length, 1);
  assert.equal(ok.staleExceptions.length, 0);
  const noReason = check(d, { exceptions: [{ file: "tests/specs/physics-fixes.spec.js", line: "toBeCloseTo(1.5, 1)" }] });
  assert.equal(noReason.fail, true, "a row without a reason excuses nothing");
  assert.equal(noReason.staleExceptions.length, 1);
  const stale = check(d, { exceptions: [{ file: "tests/specs/steering.spec.js", line: "x", reason: "r" }] });
  assert.equal(stale.fail, true);
  assert.equal(stale.staleExceptions.length, 1);
});

test("parseDiff keeps files and hunks apart; the shipped exceptions file parses", () => {
  const files = parseDiff(diff("tests/unit/ratchets.test.mjs", "a", "b"));
  assert.deepEqual(files.map((f) => f.file), ["tests/unit/ratchets.test.mjs", "js/game.js"]);
  assert.ok(Array.isArray(loadExceptions()));
});

test("the CLI: --diff-file exits 1 on a finding, 0 once excepted via --advisory, and is wired into ci.yml", () => {
  const f = path.join(ROOT, "scratch", "tolerance-diff-fixture.diff");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, diff("tests/specs/physics-fixes.spec.js", "expect(x).toBeCloseTo(1.5, 3);", "expect(x).toBeCloseTo(1.5, 1);"));
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, "tools/check/tolerance-diff.mjs"), ...a], { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  try {
    const bad = run("--diff-file", f);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /LOOSENED tests\/specs\/physics-fixes\.spec\.js: toBeCloseTo digits 3 -> 1/);
    assert.equal(run("--diff-file", f, "--advisory").status, 0);
    assert.equal(run("--help").status, 0);
    assert.equal(run("--bogus").status, 1, "unknown flag");
  } finally { fs.rmSync(f, { force: true }); }
  assert.match(fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"), /tools\/check\/tolerance-diff\.mjs --base/);
});
