/* workflow-lint.test.mjs — tools/check/workflow-lint.mjs (actionlint + zizmor over .github/workflows).
 *
 * The tree must be clean, and the check must FAIL on a planted bad workflow (tests/fixtures/workflow-lint/bad)
 * while passing a good one — otherwise a green run could mean "the linter never ran".
 *
 * The binaries come from tools/env/install-lint-bins.sh. Absent: this test SKIPS and says so on stderr; under
 * APEX_REQUIRE_LINT_BINS=1 (the CI `lints` job) an absent binary is a FAILURE, never a silent pass.
 *
 * Run: node --test tests/unit/workflow-lint.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lintWorkflows } from "../../tools/check/workflow-lint.mjs";
import { ROOT, requireBins, resolveBin } from "../../tools/lib/lint-bins.mjs";

const FIX = "tests/fixtures/workflow-lint";
const need = (tool) => {
  if (resolveBin(tool)) return false;
  const msg = `${tool} not installed - NOT CHECKED (bash tools/env/install-lint-bins.sh ${tool})`;
  if (requireBins([])) assert.fail(msg);
  console.error(`SKIP workflow-lint.test: ${msg}`);
  return msg;
};
const row = (rows, tool) => rows.find((r) => r.tool === tool);

test("the tree's workflows are clean under actionlint", { skip: need("actionlint") }, () => {
  const r = row(lintWorkflows(), "actionlint");
  assert.equal(r.status, "clean", r.output);
});

test("the tree's workflows are clean under zizmor (offline)", { skip: need("zizmor") }, () => {
  const r = row(lintWorkflows(), "zizmor");
  assert.equal(r.status, "clean", r.output);
});

test("actionlint FAILS the planted bad workflow and passes the good one", { skip: need("actionlint") }, () => {
  const bad = row(lintWorkflows({ dir: `${FIX}/bad/.github/workflows`, useRepoConfig: false }), "actionlint");
  assert.equal(bad.status, "findings");
  assert.match(bad.output, /evnet/, "names the planted unknown context property");
  const good = row(lintWorkflows({ dir: `${FIX}/good/.github/workflows`, useRepoConfig: false }), "actionlint");
  assert.equal(good.status, "clean", good.output);
});

test("zizmor FAILS the planted bad workflow and passes the good one", { skip: need("zizmor") }, () => {
  const bad = row(lintWorkflows({ dir: `${FIX}/bad/.github/workflows`, useRepoConfig: false }), "zizmor");
  assert.equal(bad.status, "findings");
  assert.match(bad.output, /template-injection/);
  assert.match(bad.output, /unpinned-uses/);
  const good = row(lintWorkflows({ dir: `${FIX}/good/.github/workflows`, useRepoConfig: false }), "zizmor");
  assert.equal(good.status, "clean", good.output);
});

test("the suppression configs stay narrow and reasoned (no blanket off)", () => {
  const al = fs.readFileSync(path.join(ROOT, ".github/actionlint.yaml"), "utf8");
  for (const m of al.matchAll(/ignore:\s*\[?([^\n]*)/g)) assert.doesNotMatch(m[1], /['"]\.\*['"]/, "no catch-all actionlint ignore");
  const ignores = [...al.matchAll(/^\s+- '(.+)'/gm)].map((m) => m[1]);
  assert.ok(ignores.length >= 1 && ignores.every((p) => p.length > 8), `ignore patterns are specific messages: ${ignores}`);
  const zz = fs.readFileSync(path.join(ROOT, ".github/zizmor.yml"), "utf8");
  const disabled = [...zz.matchAll(/^  ([a-z-]+):\n\s+disable: true/gm)].map((m) => m[1]);
  assert.deepEqual(disabled, ["self-repository"], "only the reviewed audit is disabled");
  assert.match(zz, /#.*(actionlint|\$\/)/, "the disable carries its reason");
  // Inline `zizmor: ignore[...]` always names the audit and gives a reason after it.
  for (const f of fs.readdirSync(path.join(ROOT, ".github/workflows"))) {
    const text = fs.readFileSync(path.join(ROOT, ".github/workflows", f), "utf8");
    for (const m of text.matchAll(/zizmor: ignore(\[[^\]]*\])?(.*)$/gm)) {
      assert.match(m[1] || "", /^\[[a-z-]+\]$/, `${f}: a zizmor ignore names one audit`);
      assert.ok(m[2].trim().length >= 12, `${f}: a zizmor ignore says why`);
    }
  }
});
