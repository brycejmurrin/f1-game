/* perf-sentinel.test.mjs — the crash sentinel's memory must not outlive the
 * build that earned it.
 *
 * WHY THIS EXISTS. A jetsam/OOM kill leaves no signal, so PerfGov infers one
 * from a race flag that survived to the next boot, and records "strikes" in
 * localStorage. Two strikes pin the feature floor at tier 4 and pre-drop the
 * render scale, and the only way back is finishing whole races — on a game
 * that, in safe mode, looks broken enough that nobody wants to.
 *
 * That is a one-way door, and a real device went through it: a build shipped
 * a Rapier world by accident, phones ran out of memory, and fixing the build
 * changed nothing for the devices already holding strikes. A strike is
 * evidence about CODE. Replace the code and the evidence expires.
 *
 * Run: node --test tests/unit/perf-sentinel.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();   // perf.js persists the sentinel through GameStore.store's raw lane
const SRC = fs.readFileSync(path.join(ROOT, "js/game/perf.js"), "utf8");

// A localStorage that is just a Map, and a fresh PerfGov evaluated against it.
// The raw lane reads the `localStorage` global live on every call, so
// swapping it per test is enough.
function boot(store, build) {
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  globalThis.window = { __APEX_BUILD: build };
  const PerfGov = eval(SRC + ";PerfGov");
  PerfGov.init({ isMobile: true, getRenderScale: () => 1, setRenderScale: () => true });
  return PerfGov;
}

test("a race that never ended is counted as a crash", () => {
  // The mechanism itself, so the expiry below cannot pass by breaking it.
  const store = { "apex26.crashStrikesBuild": "900", "apex26.raceActive": "1" };
  const g = boot(store, 900);
  assert.equal(g.strikes(), 1, "one strike for the race that did not finish");
  assert.equal(g.tierFloor(), 2, "one strike sheds the lamp-shadow/SSR tier");
  assert.equal(store["apex26.raceActive"], undefined, "the flag is consumed, not re-counted");
});

test("two strikes pin the heavy floor — the state that looks like a broken renderer", () => {
  const g = boot({ "apex26.crashStrikesBuild": "900", "apex26.crashStrikes": "2" }, 900);
  assert.equal(g.strikes(), 2);
  assert.equal(g.tierFloor(), 4, "SSAO, god rays and bloom all shed, and the floor holds them there");
});

test("a NEW BUILD clears the strikes", () => {
  // The fix. Same device, same localStorage, code that has been replaced.
  const store = { "apex26.crashStrikesBuild": "895", "apex26.crashStrikes": "3" };
  const g = boot(store, 898);
  assert.equal(g.strikes(), 0, "strikes earned by another build say nothing about this one");
  assert.equal(g.tierFloor(), 0, "and the safe-mode floor lifts with them");
  assert.equal(store["apex26.crashStrikesBuild"], "898", "the new build is recorded");
});

test("an update mid-race is not a crash", () => {
  // The shell version guard force-reloads a stale PWA, which can land while a
  // race is running. That leaves the race flag set through a build change —
  // which is an update, not a kill, and must not cost a strike.
  const store = { "apex26.crashStrikesBuild": "895", "apex26.raceActive": "1" };
  const g = boot(store, 898);
  assert.equal(g.strikes(), 0);
});

test("within the SAME build the strikes still accumulate", () => {
  // The expiry must not defeat the sentinel: a phone dying repeatedly on one
  // build has to keep degrading.
  const store = { "apex26.crashStrikesBuild": "898", "apex26.crashStrikes": "1", "apex26.raceActive": "1" };
  const g = boot(store, 898);
  assert.equal(g.strikes(), 2);
  assert.equal(g.tierFloor(), 4);
});

test("clearStrikes() is the manual way out", () => {
  const store = { "apex26.crashStrikesBuild": "898", "apex26.crashStrikes": "4" };
  const g = boot(store, 898);
  assert.equal(g.tierFloor(), 4);
  g.clearStrikes();
  assert.equal(g.strikes(), 0);
  assert.equal(g.tierFloor(), 0);
  assert.equal(store["apex26.crashStrikes"], "0", "and it survives the next boot");
});

test("desktop never enters safe mode at all", () => {
  // The suite runs on desktop; a governor that could pin itself there would
  // make every render spec depend on the last one that crashed.
  globalThis.localStorage = {
    getItem: () => "9", setItem: () => {}, removeItem: () => {},
  };
  globalThis.window = { __APEX_BUILD: 898 };
  const PerfGov = eval(SRC + ";PerfGov");
  PerfGov.init({ isMobile: false, getRenderScale: () => 1, setRenderScale: () => true });
  assert.equal(PerfGov.strikes(), 0);
  assert.equal(PerfGov.tierFloor(), 0);
});
