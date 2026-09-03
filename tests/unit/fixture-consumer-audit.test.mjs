import assert from "node:assert/strict";
import test from "node:test";
import {
  fixtureImportViolations, adoption, readSpecs, FLOOR, FLOOR_SLACK,
} from "../../tools/ci/fixture-consumer-audit.mjs";

test("fixture consumer audit rejects direct Playwright imports", () => {
  const files = new Map([
    ["smoke.spec.js", 'import { test } from "@playwright/test";'],
    ["unrelated.spec.js", 'import { test } from "@playwright/test";'],
  ]);
  assert.deepEqual(fixtureImportViolations(files, ["smoke.spec.js"]), ["smoke.spec.js"]);
});

test("fixture consumer audit ignores unrelated direct imports", () => {
  const files = new Map([
    ["smoke.spec.js", 'import { test } from "../helpers/fixtures.js";'],
    ["unrelated.spec.js", 'import { test } from "@playwright/test";'],
  ]);
  assert.deepEqual(fixtureImportViolations(files, ["smoke.spec.js"]), []);
});

// The two synthetic tests above prove the FUNCTIONS work; nothing ran them
// against the real tree, so from CI's point of view the ratchet was dead code —
// only the tool's CLI entry (which no test group invokes) enforced it.
test("the load-bearing consumers really import the shared fixture", () => {
  assert.deepEqual(fixtureImportViolations(readSpecs()), [],
    "a load-bearing consumer stopped importing ../helpers/fixtures.js — it just lost " +
    "its mocks and failure attachments");
});

test("real fixture adoption sits within the ratchet band", () => {
  const { uses, total } = adoption(readSpecs());
  assert.ok(uses >= FLOOR,
    `fixture adoption fell to ${uses}/${total}; the floor is ${FLOOR}. ` +
    `Migrating a spec OFF the shared fixture drops its failure attachments.`);
  assert.ok(uses - FLOOR <= FLOOR_SLACK,
    `adoption is ${uses} but FLOOR is ${FLOOR} — raise FLOOR in ` +
    `tools/ci/fixture-consumer-audit.mjs so the ratchet keeps its grip ` +
    `(allowed slack: ${FLOOR_SLACK}).`);
});
