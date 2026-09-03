/* test-coverage-audit.test.mjs — the audit's LOGIC, and the audit's VERDICT.
 *
 * The two synthetic tests below check that auditCoverage() classifies correctly.
 * They pass fabricated inputs ("alpha.spec.js") and never look at the repo, and
 * for a long time they were the whole file — which made this suite a guard that
 * did not guard the thing its name promises.
 *
 * That gap was found the expensive way. `tests/unit/css-tokens.test.mjs` was added
 * with a docs/TESTING.md row but no `test:*` group, and `npm run test:tooling-fast`
 * — which includes THIS file — reported green three times in a row while the
 * repository was genuinely broken. It only surfaced in CI, where `npm run
 * test:audit` runs the CLI as a separate step, and it failed the deploy gate's
 * guards job.
 *
 * So the real-repo assertion lives here now, in the suite everyone runs after an
 * edit, rather than only in a CLI that a person has to remember. The CI step
 * stays as well — it costs a second and gives a cleaner failure message — but it
 * is no longer the only thing standing between an orphaned test file and a red
 * gate an hour later.
 *
 * The general shape is worth naming, because this repo has now hit it twice in
 * one pass: A UNIT TEST OF A CHECKER IS NOT THE CHECK. Verifying that a function
 * would report a problem, using inputs you invented, says nothing about whether
 * the problem exists.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditCoverage } from "../../tools/ci/test-coverage-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("project-wide scripts do not count as topical coverage", () => {
  const result = auditCoverage(
    ["alpha.spec.js"],
    { "test:headless": "runner --project=headless" },
  );
  assert.deepEqual(result.orphans, ["alpha.spec.js"]);
});

test("explicit Playwright and Node test files count as named coverage", () => {
  const result = auditCoverage(
    ["alpha.spec.js", "worker.test.mjs"],
    {
      "test:alpha": "runner tests/alpha.spec.js",
      "test:runtime": "node --test tests/worker.test.mjs",
    },
  );
  assert.deepEqual(result.orphans, []);
});

test("every test file in THIS repo belongs to a topical test:* group", () => {
  // Deliberately duplicates what `npm run test:audit` does, against the same
  // inputs, because the CLI is a separate CI step and this suite is what an
  // agent runs locally after an edit. A new test file is added far more often
  // than the audit is invoked by hand.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  // specs/ and unit/ since the tests/ split; the root readdir stays so a stray
  // suite dropped at tests/ root is still audited (mirrors the tool's CLI).
  const testFiles = ["", "specs", "unit"]
    .flatMap((d) => fs.readdirSync(path.join(ROOT, "tests", d)))
    .filter((file) => /\.(spec\.js|test\.(mjs|cjs))$/.test(file))
    .sort();
  assert.ok(testFiles.length > 100, `only ${testFiles.length} test files found — the scan broke`);

  const { orphans } = auditCoverage(testFiles, pkg.scripts);
  assert.deepEqual(orphans, [],
    "a test file belongs to no topical test:* group, so nothing runs it. Add it to the right " +
    "`test:<group>` script in package.json (and give it a row in docs/TESTING.md, which " +
    "tests/unit/test-groups.test.mjs checks separately).");
});
