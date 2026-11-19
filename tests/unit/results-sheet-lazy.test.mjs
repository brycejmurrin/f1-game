/* results-sheet-lazy.test.mjs — LAZY_RESULTS_SHEET roster (boot stub on FULL).
 * Run: node --test tests/unit/results-sheet-lazy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

test("manifest keeps results-sheet.js and quali-sheet.js lazy and results-boot.js eager", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.deepEqual(
    { boot: m.FULL.includes("js/ui/results-boot.js"), sheet: m.FULL.includes("js/ui/results-sheet.js"), quali: m.FULL.includes("js/ui/quali-sheet.js"), lazy: m.LAZY_RESULTS_SHEET },
    { boot: true, sheet: false, quali: false, lazy: ["js/ui/results-sheet.js", "js/ui/quali-sheet.js"] },
  );
});

// GameResults.create hands out the #quali painter's stub: a call made before LAZY_RESULTS_SHEET lands
// replays on the real QualiSheet once the bundle evaluates, in call order; later calls go straight through.
test("the quali stub replays early calls on QualiSheet once the bundle loads", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const calls = [];
  let finish;
  const ctx = vm.createContext({
    Log: { info() {}, warn() {} },
    ApexRoster: { LAZY_RESULTS_SHEET: ["js/ui/results-sheet.js", "js/ui/quali-sheet.js"], LAZY_RESULTS_SHEET_EDGES: [] },
    ScriptLoader: { create: () => ({ load: () => new Promise((r) => { finish = r; }) }) },
    Promise,
  });
  vm.runInContext(readFileSync(new URL("../../js/ui/results-boot.js", import.meta.url), "utf8").replace(/^const\b/gm, "var"), ctx);
  const q = ctx.GameResults.create({}).quali;
  q.open(["row"]);
  q.close();
  assert.deepEqual(calls, [], "nothing paints before the bundle lands");
  ctx.GameResultsSheet = { create: () => ({}) };
  ctx.QualiSheet = { create: () => ({ build: (r) => calls.push(["build", r]), open: (r) => calls.push(["open", r]), close: () => calls.push(["close"]) }) };
  finish(true);
  await new Promise((r) => setTimeout(r, 0));
  q.build(["late"]);
  assert.deepEqual(calls, [["open", ["row"]], ["close"], ["build", ["late"]]]);
});
