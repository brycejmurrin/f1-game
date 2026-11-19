/* results-sheet-lazy.test.mjs — LAZY_RESULTS_SHEET roster (boot stub on FULL)
 * plus spoken-card MutationObserver teardown (hunt memory-leaks back).
 * Run: node --test tests/unit/results-sheet-lazy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("manifest keeps results-sheet.js lazy and results-boot.js eager", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.deepEqual(
    { boot: m.FULL.includes("js/ui/results-boot.js"), sheet: m.FULL.includes("js/ui/results-sheet.js"),
      chips: m.FULL.includes("js/share/share-card-chips.js"), lazy: m.LAZY_RESULTS_SHEET },
    { boot: true, sheet: false, chips: false, lazy: ["js/share/share-card-chips.js", "js/ui/results-sheet.js"] },
  );
});

test("replacing the results host disconnects the prior spoken-card observer", () => {
  const SRC = fs.readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8");
  const SAY = fnSource(SRC, "function sayCards(sheet, table, key) {");
  const SPOKEN = fnSource(SRC, "function spokenText(n) {");
  const observers = [];
  class MutationObserver {
    constructor(fn) { this.fn = fn; this.alive = true; observers.push(this); }
    observe() {}
    disconnect() { this.alive = false; }
  }
  const ctx = vm.createContext({
    MutationObserver, LiveRegion: { say() {} }, setTimeout: (fn) => fn(),
    Array, String,
  });
  // Absolute filename: tip vmSrcLoads is at ceiling; a missing filename would raise it.
  vm.runInContext(
    "var saidFor = null, saidWatch = null, saidMo = null;\n" + SPOKEN + "\n" + SAY,
    ctx,
    { filename: absSrc("js/ui/results-sheet.js") },
  );
  const run = (sheet, key) => {
    ctx.sheet = sheet;
    ctx.table = { querySelectorAll: () => [{ textContent: "P1", children: [] }] };
    ctx.key = key;
    vm.runInContext("sayCards(sheet, table, key)", ctx, { filename: absSrc("js/ui/results-sheet.js") });
  };
  const a = { hidden: false }, b = { hidden: false };
  run(a, ["cars-a"]);
  assert.equal(observers.length, 1);
  assert.equal(observers[0].alive, true);
  run(b, ["cars-b"]);
  assert.equal(observers.length, 2, "a new host gets a fresh observer");
  assert.equal(observers[0].alive, false, "the prior host's observer is disconnected");
  assert.equal(observers[1].alive, true);
});
