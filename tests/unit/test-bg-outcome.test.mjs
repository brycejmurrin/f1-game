/* test-bg-outcome.test.mjs — a background run's verdict never reads green when
 * its process exited non-zero.
 *
 * test-bg.mjs reads a run's outcome out of its own log. A group can be two
 * commands (`test:tooling` is tooling-fast && sweeps; a twinned group runs its
 * VM twins, then Playwright), and until 2026-09-24 the FIRST half's
 * `= run passed` or `# fail 0` beat the `= bg exit N` trailer, so a red second
 * half — or a Playwright half killed before its summary — read as passed and
 * `--wait` exited 0.
 *
 * Run: node --test tests/unit/test-bg-outcome.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { outcomeOf } from "../../tools/ci/test-bg.mjs";

test("a non-zero exit wins over an earlier passing summary", () => {
  const log = "[tooling-fast] = run passed (249 passed, 0 failed)\n…sweeps…\n# pass 3\n# fail 1\n= bg exit 1\n";
  assert.match(outcomeOf(log), /^failed \(exit 1; last summary: passed/);
  const killed = "# pass 12\n# fail 0\n[pw] running…\n= bg exit 137\n";
  assert.match(outcomeOf(killed), /^failed \(exit 137/, "a twin's `# fail 0` never covers a killed Playwright half");
});

test("exit 0 keeps the rich summary; the old formats still read", () => {
  assert.equal(outcomeOf("= run passed (12 passed, 0 failed)\n= bg exit 0\n"), "passed (12 passed, 0 failed)");
  assert.equal(outcomeOf("= run failed (11 passed, 1 failed)\n"), "failed (11 passed, 1 failed)", "no trailer yet: the summary");
  assert.equal(outcomeOf("# pass 4\n# fail 0\n= bg exit 0\n"), "passed (4 passed, 0 failed)");
  assert.equal(outcomeOf("✓ all covered\n= bg exit 0\n"), "passed (exit 0)", "a plain-script group");
  assert.equal(outcomeOf("booting…\n"), "died before finishing");
});
