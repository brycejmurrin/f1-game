import assert from "node:assert/strict";
import test from "node:test";
import { auditCoverage } from "../tools/test-coverage-audit.mjs";

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
