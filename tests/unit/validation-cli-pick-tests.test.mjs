// validation-cli-pick-tests.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/ci/pick-tests.mjs: a selection receipt keeps uncovered config and skill-only routing, and a typo or missing-value flag is refused before any diff is read.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-pick-tests.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { selectionReceipt, validateSelectionArgs } from "../../tools/ci/pick-tests.mjs";
import { cli } from "../helpers/validation-cli.mjs";

test("selection receipts retain uncovered config in a mixed change and route skill-only changes", () => {
  const scripts = { "test:tooling-fast": "node test" };
  const mixed = selectionReceipt(["docs/DEBUG-HOOKS.md", "playwright.config.js"], scripts);
  assert.equal(mixed.reason, "partial");
  assert.deepEqual(mixed.unclaimed, ["playwright.config.js"]);
  assert.deepEqual(mixed.receipts.map((r) => r.claimed), [true, false]);
  const skill = selectionReceipt([".claude/skills/agent-view/SKILL.md", "AGENTS.md"], scripts);
  assert.equal(skill.reason, "matched");
  assert.ok(skill.receipts.every((r) => r.groups.includes("tooling-fast")));
  assert.equal(selectionReceipt(["docs/DEBUG-HOOKS.md"], {}).reason, "unmatched", "a missing script is not coverage");
});

test("selector and verifier reject typo and missing-value flags before diff selection", () => {
  for (const args of [["--snice", "HEAD"], ["--since"], ["--since", "--json"]]) {
    assert.throws(() => validateSelectionArgs(args), /Unknown|requires/);
    for (const tool of ["pick-tests", "verify-change"]) {
      const result = cli(`tools/ci/${tool}.mjs`, args);
      assert.equal(result.status, 2, result.stderr);   // a usage error exits 2 (audit4 cli-help)
      assert.match(result.stderr, /Unknown|requires/);
    }
  }
  const plan = cli("tools/ci/verify-change.mjs", ["--plan", "docs/DEBUG-HOOKS.md", "playwright.config.js"]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).selection, "partial");
  assert.deepEqual(JSON.parse(plan.stdout).unclaimed, ["playwright.config.js"]);
});
