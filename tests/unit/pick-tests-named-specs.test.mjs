// pick-tests (#5674): a spec a selected group already runs is not reported as one "the group rules do not name".
import { test } from "node:test";
import assert from "node:assert/strict";
import { extraSpecs } from "../../tools/ci/pick-tests.mjs";

const FILES = ["js/data/standings.js", "js/data/api.js"];

test("data-lifecycle.spec.js is named once test:hooks is selected", () => {
  const all = extraSpecs(FILES).map((r) => r.spec);
  assert.deepEqual(all.filter((s) => s === "tests/specs/data-lifecycle.spec.js"), ["tests/specs/data-lifecycle.spec.js"], "the loader scan still finds it");
  const named = extraSpecs(FILES, { selected: ["hooks", "lifecycle-unit", "tiny", "tooling-fast"] }).map((r) => r.spec);
  assert.deepEqual(named.filter((s) => s === "tests/specs/data-lifecycle.spec.js"), []);
});

test("with no selection the extras are unchanged", () => {
  assert.deepEqual(extraSpecs(FILES, { selected: [] }), extraSpecs(FILES));
});
