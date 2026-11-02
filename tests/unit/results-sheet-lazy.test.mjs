/* results-sheet-lazy.test.mjs — LAZY_RESULTS_SHEET roster (boot stub on FULL).
 * Run: node --test tests/unit/results-sheet-lazy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

test("manifest keeps results-sheet.js lazy and results-boot.js eager", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.deepEqual(
    { boot: m.FULL.includes("js/ui/results-boot.js"), sheet: m.FULL.includes("js/ui/results-sheet.js"), lazy: m.LAZY_RESULTS_SHEET },
    { boot: true, sheet: false, lazy: ["js/ui/results-sheet.js"] },
  );
});
