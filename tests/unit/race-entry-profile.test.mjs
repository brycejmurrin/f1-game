/* race-entry-profile.test.mjs — RaceEntryProfile legs, marks, longtask ring.
 *
 * The freeze outside loadTrack is what PERF-OPTIONS-2026-09-16.md measured;
 * this module is the stopwatch that attributes it. Behaviour under test is
 * the profiler itself (would fail before the module existed): begin/lap/mark
 * order, synthetic longtasks sum into blockMs/maxBlockMs, notePresent records
 * warming then ready once, and tickFrame ends the window after ready.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/race-entry-profile.js"), "utf8");

function load(env = {}) {
  const sandbox = { console, performance: { now: () => env.now ?? 1000 }, ...env };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  // IIFE assigns `const RaceEntryProfile` — promote to var so the sandbox sees it.
  vm.runInNewContext(SRC.replace(/^const\b/m, "var"), sandbox, { filename: "race-entry-profile.js" });
  return sandbox.RaceEntryProfile;
}

test("legs match the startRaceBody stopwatch shape", () => {
  let t = 1000;
  const P = load({ performance: { now: () => t } });
  P.begin("startRace");
  t = 1010; P.lap("scenery");
  t = 1050; P.lap("resets");
  t = 2050; P.lap("loadTrack");
  const legs = P.legs();
  assert.equal(legs.length, 3);
  assert.equal(legs[0].n, "scenery"); assert.equal(legs[0].ms, 10);
  assert.equal(legs[1].n, "resets"); assert.equal(legs[1].ms, 40);
  assert.equal(legs[2].n, "loadTrack"); assert.equal(legs[2].ms, 1000);
  const snap = P.snapshot().legs;
  assert.equal(snap.length, 3);
  assert.equal(snap[2].n, "loadTrack");
});

test("marks record handoff / warm / present readiness once", () => {
  let t = 0;
  const P = load({ performance: { now: () => t } });
  P.begin("startRace");
  t = 100; P.mark("handoff:raise");
  t = 200; P.notePresent(true);
  t = 250; P.notePresent(true);   // second warming: ignored
  t = 500; P.notePresent(false);
  t = 550; P.notePresent(false);  // second ready: ignored
  const names = P.snapshot().marks.map((m) => m.n);
  assert.ok(names.includes("begin:startRace"));
  assert.ok(names.includes("handoff:raise"));
  assert.equal(names.filter((n) => n === "present:warming").length, 1);
  assert.equal(names.filter((n) => n === "present:ready").length, 1);
});

test("synthetic longtasks feed blockMs and maxBlockMs", () => {
  const P = load();
  P.begin("startRace");
  P._injectTask(400, 10, "self");
  P._injectTask(1200, 50, "self");
  const s = P.snapshot();
  assert.equal(s.blockMs, 1600);
  assert.equal(s.maxBlockMs, 1200);
  assert.equal(s.longTasks.length, 2);
});

test("tickFrame ends the window two frames after present:ready", () => {
  const P = load();
  P.begin("startRace");
  assert.equal(P.armed(), true);
  P.notePresent(false);
  assert.equal(P.armed(), true);
  P.tickFrame();
  assert.equal(P.armed(), true);
  P.tickFrame();
  assert.equal(P.armed(), false);
  assert.ok(P.snapshot().marks.some((m) => m.n === "end"));
});

test("PerformanceObserver longtask entries are recorded when supported", () => {
  let cb = null;
  class FakePO {
    constructor(fn) { cb = fn; }
    observe() {}
    disconnect() { cb = null; }
  }
  FakePO.supportedEntryTypes = ["longtask"];
  const P = load({ PerformanceObserver: FakePO, performance: { now: () => 1000 } });
  P.begin("x");
  assert.equal(P.supported(), true);
  assert.ok(cb);
  cb({
    getEntries: () => [
      { startTime: 1005, duration: 800, name: "self" },
      { startTime: 100, duration: 50, name: "self" }, // before window — dropped
    ],
  });
  const s = P.snapshot();
  assert.equal(s.longTasks.length, 1);
  assert.equal(s.longTasks[0].ms, 800);
  P.end();
  assert.equal(P.armed(), false);
});

test("manifest lists the module before quality-preset (load order)", () => {
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  const a = man.indexOf('"js/perf/race-entry-profile.js"');
  const b = man.indexOf('"js/perf/quality-preset.js"');
  assert.ok(a > 0 && b > a, "race-entry-profile must be in FULL ahead of quality-preset");
});
