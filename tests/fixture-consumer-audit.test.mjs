import assert from "node:assert/strict";
import test from "node:test";
import { fixtureImportViolations } from "../tools/fixture-consumer-audit.mjs";

test("fixture consumer audit rejects direct Playwright imports", () => {
  const files = new Map([
    ["smoke.spec.js", 'import { test } from "@playwright/test";'],
    ["unrelated.spec.js", 'import { test } from "@playwright/test";'],
  ]);
  assert.deepEqual(fixtureImportViolations(files, ["smoke.spec.js"]), ["smoke.spec.js"]);
});

test("fixture consumer audit ignores unrelated direct imports", () => {
  const files = new Map([
    ["smoke.spec.js", 'import { test } from "./fixtures.js";'],
    ["unrelated.spec.js", 'import { test } from "@playwright/test";'],
  ]);
  assert.deepEqual(fixtureImportViolations(files, ["smoke.spec.js"]), []);
});
