/* results-sheet-lazy.test.mjs — LAZY_RESULTS_SHEET roster (boot stub on FULL)
 * plus spoken-card MutationObserver teardown (hunt memory-leaks back) and the quali stub (C1 #5807).
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

test("manifest keeps results-sheet.js and quali-sheet.js lazy and results-boot.js eager", () => {
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.deepEqual(
    { boot: m.FULL.includes("js/ui/results-boot.js"), sheet: m.FULL.includes("js/ui/results-sheet.js"),
      chips: m.FULL.includes("js/share/share-card-chips.js"), quali: m.FULL.includes("js/ui/quali-sheet.js"), lazy: m.LAZY_RESULTS_SHEET },
    { boot: true, sheet: false, chips: false, quali: false,
      lazy: ["js/share/share-card-data.js", "js/share/share-card-layout.js", "js/share/share-card.js", "js/share/share-card-chips.js", "js/ui/results-sheet.js", "js/ui/quali-sheet.js"] },
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
    "var saidFor = null, saidWatch = null, saidMo = null, saidPending = null;\n" + SPOKEN + "\n" + SAY,
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

// #5898: a race quit during the ceremony (sheet still hidden) left its show-then-speak observer
// behind; the next results screen then spoke every earlier race's winner before its own.
test("a results screen speaks only its own race, however many were quit during the ceremony", () => {
  const SRC = fs.readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8");
  const observers = [], said = [];
  class MutationObserver {
    constructor(fn) { this.fn = fn; this.alive = true; observers.push(this); }
    observe() {}
    disconnect() { this.alive = false; }
  }
  const ctx = vm.createContext({ MutationObserver, LiveRegion: { say(t) { said.push(t); } }, setTimeout: (fn) => fn(), Array, String });
  vm.runInContext("var saidFor = null, saidWatch = null, saidMo = null, saidPending = null;\n"
    + fnSource(SRC, "function spokenText(n) {") + "\n" + fnSource(SRC, "function sayCards(sheet, table, key) {"),
  ctx, { filename: absSrc("js/ui/results-sheet.js") });
  const sheet = { hidden: true };
  const run = (winner) => {
    Object.assign(ctx, { sheet, key: [winner], table: { querySelectorAll: () => [{ textContent: "P1 " + winner, children: [] }] } });
    vm.runInContext("sayCards(sheet, table, key)", ctx, { filename: absSrc("js/ui/results-sheet.js") });
  };
  run("LEC"); run("NOR"); run("VER");   // two ceremonies quit, the third shows
  sheet.hidden = false;
  for (const o of observers) if (o.alive) o.fn();
  assert.deepEqual(said, ["P1 VER"]);
});

// GameResults.create hands out the #quali painter's stub: a call made before LAZY_RESULTS_SHEET lands
// replays on the real QualiSheet once the bundle evaluates, in call order; later calls go straight through.
test("the quali stub replays early calls on QualiSheet once the bundle loads", async () => {
  const calls = [];
  let finish;
  const ctx = vm.createContext({
    Log: { info() {}, warn() {} },
    ApexRoster: { LAZY_RESULTS_SHEET: ["js/ui/results-sheet.js", "js/ui/quali-sheet.js"], LAZY_RESULTS_SHEET_EDGES: [] },
    ScriptLoader: { create: () => ({ load: () => new Promise((r) => { finish = r; }) }) },
    Promise,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/results-boot.js"), "utf8").replace(/^const\b/gm, "var"), ctx,
    { filename: absSrc("js/ui/results-boot.js") });
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

