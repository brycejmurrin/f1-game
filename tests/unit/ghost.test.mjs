/* ghost.test.mjs — unit tests for the Ghost recorder/player.
 *
 * Verifies:
 *   - Recording laps and forward-progress filtering
 *   - Pose lookup at(t) and interpolation with bounds safety
 *   - Inverse time lookup timeAt(s) with bounds safety and binary search
 *   - Best lap updates when time is beaten
 *   - Per-circuit persistence and migration
 *   - Clear functionality
 *
 * Run: node --test tests/unit/ghost.test.mjs
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function createHarness(opts = {}) {
  const store = new Map(Object.entries(opts.disk || {}));
  const microtasks = [];
  const timers = [];
  const mockLocalStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) {
      if (opts.failWrites) {
        const error = new Error("quota full");
        error.name = "QuotaExceededError";
        throw error;
      }
      store.set(k, String(v));
    },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };

  const sandbox = {
    localStorage: mockLocalStorage,
    module: { exports: {} },
    TextEncoder,
    queueMicrotask: (fn) => { microtasks.push(fn); },
    console,
  };
  if (opts.deferWrites) sandbox.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  const idles = [], listeners = {};
  if (opts.clock) sandbox.Date = { now: () => opts.clock.t };
  if (opts.idle) {
    sandbox.requestIdleCallback = (fn) => { idles.push(fn); return idles.length; };
    sandbox.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  }
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js", "core", "store.js"), "utf8"), ctx);
  const src = readFileSync(join(ROOT, "js", "car", "ghost.js"), "utf8");
  vm.runInContext(src, ctx);
  return {
    Ghost: sandbox.module.exports || vm.runInContext("Ghost", ctx),
    GameStore: vm.runInContext("GameStore", ctx),
    store: mockLocalStorage,
    flushMicrotasks: () => { while (microtasks.length) microtasks.shift()(); },
    flushTimers: () => { while (timers.length) timers.shift()(); },
    runIdle: (ms) => { const q = idles.splice(0); for (const f of q) f({ timeRemaining: () => ms, didTimeout: false }); },
    idleQueued: () => idles.length,
    fire: (type) => { for (const f of listeners[type] || []) f(); },
    disk: store,
  };
}

test("Ghost lap recording and playback basics", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("monza");
  assert.equal(Ghost.hasGhost(), false);
  assert.equal(Ghost.bestTime(), Infinity);

  Ghost.startLap();
  // Record at least 10 samples (MIN_SAMPLES = 8)
  for (let i = 0; i < 10; i++) {
    const t = i * 0.1;
    const s = i * 20;
    const x = i * 0.2;
    Ghost.record(t, s, x);
  }

  const beaten = Ghost.finishLap(1.0);
  assert.equal(beaten, true);
  assert.equal(Ghost.hasGhost(), true);
  assert.equal(Ghost.bestTime(), 1.0);

  // at(t) lookup
  const atStart = Ghost.at(0);
  assert.equal(atStart.s, 0);
  assert.equal(atStart.x, 0);
  assert.equal(atStart.done, false);

  const atMid = Ghost.at(0.45);
  assert.ok(atMid.s > 80 && atMid.s < 100);
  assert.equal(atMid.done, false);

  const atEnd = Ghost.at(2.0); // beyond end
  assert.equal(atEnd.done, true);
  assert.equal(atEnd.s, 180);

  // Negative time lookup safety
  const atNeg = Ghost.at(-1.0);
  assert.equal(atNeg.s, 0);
  assert.equal(atNeg.done, false);
});

test("Ghost.snapshot returns a defensive shareable copy of the current PB", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("monza");
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 20, i * 0.2);
  Ghost.finishLap(1, { medal: "gold" });

  const snap = Ghost.snapshot();
  assert.equal(snap.time, 1);
  assert.equal(snap.t.length, 10);
  assert.equal(snap.meta.medal, "gold");
  snap.t[0] = 999;
  snap.meta.medal = "bronze";
  assert.equal(Ghost.at(0).s, 0, "mutating an export cannot alter live replay data");
  assert.equal(Ghost.medal(), "gold");
});

test("Ghost.timeAt(s) inverse lookup with bounds protection", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("spa");
  Ghost.startLap();
  for (let i = 0; i < 10; i++) {
    Ghost.record(i * 0.5, i * 50, (i % 2) * 0.5);
  }
  Ghost.finishLap(5.0);

  // Inside range
  const tAt125 = Ghost.timeAt(125);
  assert.ok(Math.abs(tAt125 - 1.25) < 0.05);

  // At exact nodes
  assert.equal(Ghost.timeAt(0), 0);
  assert.equal(Ghost.timeAt(450), 4.5);

  // Outside / negative bounds
  assert.equal(Ghost.timeAt(-50), 0);
  assert.equal(Ghost.timeAt(9999), 4.5);
});

test("Ghost ignores non-beating laps", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("silverstone");
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 10, 0);
  assert.equal(Ghost.finishLap(50.0), true);
  assert.equal(Ghost.bestTime(), 50.0);

  // Slower lap
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 10, 0);
  assert.equal(Ghost.finishLap(55.0), false);
  assert.equal(Ghost.bestTime(), 50.0);

  // Faster lap
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 10, 0);
  assert.equal(Ghost.finishLap(48.5), true);
  assert.equal(Ghost.bestTime(), 48.5);
});

test("Ghost clear and track switching", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("monaco");
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 10, 0);
  Ghost.finishLap(40.0);
  assert.equal(Ghost.hasGhost(), true);

  Ghost.setTrack("suzuka");
  assert.equal(Ghost.hasGhost(), false);

  Ghost.setTrack("monaco");
  assert.equal(Ghost.hasGhost(), true);

  Ghost.clear("monaco");
  assert.equal(Ghost.hasGhost(), false);
});

test("finishLap meta rides with the ghost lap, survives a reload, and a slower lap keeps it", () => {
  const { Ghost } = createHarness();
  Ghost.setTrack("monza");
  const lap = (t) => { Ghost.startLap(); for (let i = 0; i < 12; i++) Ghost.record(i * t / 12, i * 100, 0); };
  lap(90);
  assert.equal(Ghost.finishLap(90, { medal: "silver", pole: 88 }), true);
  assert.equal(Ghost.medal(), "silver");
  assert.equal(Ghost.meta().pole, 88);
  lap(95);
  assert.equal(Ghost.finishLap(95, { medal: "bronze" }), false);
  assert.equal(Ghost.medal(), "silver", "a slower lap does not overwrite the medal");
  Ghost.setTrack("spa");
  assert.equal(Ghost.medal(), null);
  assert.equal(Ghost.meta(), null);
  Ghost.setTrack("monza");
  assert.equal(Ghost.medal(), "silver", "persisted beside the lap");
  lap(85);
  assert.equal(Ghost.finishLap(85), true);
  assert.equal(Ghost.medal(), null, "a lap saved without meta carries none");
});

test("a ghost store that is not a plain object starts empty and still saves", () => {
  // `JSON.parse(raw) || {}` accepted "5", "true" and "[]" (all truthy),
  // memoised them, and every later `store[id] = snap` threw (primitive) or
  // grew a stray array property for the rest of the session.
  for (const raw of ['"5"', "[]", "true"]) {
    const { Ghost, store } = createHarness();
    store.setItem("apex26.ghost.v1", raw);
    Ghost.setTrack("monza");
    assert.equal(Ghost.hasGhost(), false, `${raw}: no ghost from a corrupt store`);
    Ghost.startLap();
    for (let i = 0; i < 12; i++) Ghost.record(i * 90 / 12, i * 100, 0);
    assert.equal(Ghost.finishLap(90), true, `${raw}: the lap still becomes the ghost`);
    const saved = JSON.parse(store.getItem("apex26.ghost.v1"));
    assert.equal(Array.isArray(saved), false, `${raw}: the corrupt value is replaced by an object`);
    assert.equal(typeof saved, "object");
    assert.equal(saved.monza.time, 90, `${raw}: the ghost lap was written`);
  }
});

test("ghost persistence is capped by UTF-8 bytes and evicts the least-recently-used context", () => {
  const { Ghost, store } = createHarness();
  const save = (id, context, marker) => {
    Ghost.setTrack(id, context);
    Ghost.startLap();
    for (let i = 0; i < 500; i++) Ghost.record(i * 0.1, i * 10, marker);
    assert.equal(Ghost.finishLap(1000 + marker), true);
  };

  for (let i = 0; i < 149; i++) save("track-" + i, "setup-" + i, i);
  const before = JSON.parse(store.getItem("apex26.ghost.v1"));
  const byUse = Object.keys(before).sort((a, b) => before[a]._used - before[b]._used);
  const touched = byUse[0];
  const nextOldest = byUse[1];
  const match = touched.match(/^v2:track-(\d+):setup-(\d+)$/);
  assert.ok(match, "the oldest stored context has the expected key shape");
  Ghost.setTrack("track-" + match[1], "setup-" + match[2]);
  save("track-149", "setup-149", 149);

  const raw = store.getItem("apex26.ghost.v1");
  assert.ok(Buffer.byteLength(raw, "utf8") <= 512 * 1024, "the complete stored blob stays within its byte budget");
  const saved = JSON.parse(raw);
  assert.ok(Object.keys(saved).length < 150, "old contexts are evicted once the budget is reached");
  assert.ok(saved[touched], "reading an old context refreshes its LRU position");
  assert.equal(saved[nextOldest], undefined, "the untouched least-recently-used context is evicted first");
  assert.ok(saved["v2:track-149:setup-149"], "the newest context remains");
});

test("ghost quota failures flow through GameStore persistence health", () => {
  const { Ghost, GameStore } = createHarness({ failWrites: true });
  Ghost.setTrack("monza");
  Ghost.startLap();
  for (let i = 0; i < 12; i++) Ghost.record(i * 0.1, i * 10, 0);
  assert.equal(Ghost.finishLap(40), true, "the current session still keeps the personal best");
  assert.equal(GameStore.store.broken, "QuotaExceededError", "persistState can report the failed ghost write");
});

test("loading an inherited over-budget store trims it before other saves compete for quota", () => {
  const inherited = {};
  for (let n = 0; n < 100; n++) {
    inherited["v2:track-" + n + ":setup-" + n] = {
      time: 100 + n,
      t: Array.from({ length: 500 }, (_, i) => i * 0.1),
      s: Array.from({ length: 500 }, (_, i) => i * 10),
      x: Array(500).fill(n),
      _used: n,
    };
  }
  const { Ghost, store, flushMicrotasks } = createHarness({
    disk: { "apex26.ghost.v1": JSON.stringify(inherited) },
  });

  Ghost.setTrack("track-0");
  Ghost.setTrack("track-0", "setup-0");
  flushMicrotasks();

  const raw = store.getItem("apex26.ghost.v1");
  assert.ok(Buffer.byteLength(raw, "utf8") <= 512 * 1024, "first load repairs the inherited blob");
  assert.ok(JSON.parse(raw)["v2:track-0:setup-0"],
    "repair waits for the final comparable context and promotes it before LRU eviction");
});

test("one oversized valid trace is thinned to fit instead of evicting its own personal best", () => {
  const { Ghost, store } = createHarness();
  Ghost.setTrack("endurance");
  Ghost.startLap();
  for (let i = 0; i < 40_000; i++) Ghost.record(i * 0.1, i * 10, i % 7);
  assert.equal(Ghost.finishLap(5000), true);

  const raw = store.getItem("apex26.ghost.v1");
  assert.ok(Buffer.byteLength(raw, "utf8") <= 512 * 1024, "the single trace respects the total budget");
  const saved = JSON.parse(raw).endurance;
  assert.ok(saved, "the newest personal best remains durable");
  assert.ok(saved.t.length >= 8 && saved.t.length < 40_000, "samples are thinned but remain a valid trace");
  assert.equal(saved.t[0], 0);
  assert.equal(saved.t.at(-1), 3999.9, "the finish sample survives thinning");
  assert.equal(saved.t.length, saved.s.length);
  assert.equal(saved.t.length, saved.x.length);
});

test("an invalid selected entry is discarded before valid ghosts during budget repair", () => {
  const inherited = {
    broken: { time: 10, t: [], s: [], x: [], pad: "x".repeat(600_000), _used: Number.MAX_SAFE_INTEGER },
    sound: { time: 10, t: [0, 1, 2, 3, 4, 5, 6, 7], s: [0, 1, 2, 3, 4, 5, 6, 7],
      x: [0, 0, 0, 0, 0, 0, 0, 0], _used: 1 },
  };
  const { Ghost, store, flushMicrotasks } = createHarness({
    disk: { "apex26.ghost.v1": JSON.stringify(inherited) },
  });
  Ghost.setTrack("broken");
  flushMicrotasks();
  const repaired = JSON.parse(store.getItem("apex26.ghost.v1"));
  assert.equal(repaired.broken, undefined);
  assert.ok(repaired.sound, "valid history wins space over a malformed preferred entry");
});

test("a pending PB rebases onto a foreign tab's newer ghost blob", () => {
  const trace = (time, x = 0) => ({
    time,
    t: [0, 1, 2, 3, 4, 5, 6, 7],
    s: [0, 10, 20, 30, 40, 50, 60, 70],
    x: [x, x, x, x, x, x, x, x],
    _used: 1,
  });
  const { Ghost, GameStore, store, flushTimers } = createHarness({
    disk: { "apex26.ghost.v1": JSON.stringify({ monza: trace(50) }) },
    deferWrites: true,
  });
  Ghost.setTrack("monza");
  Ghost.startLap();
  for (let i = 0; i < 12; i++) Ghost.record(i, i * 10, 0);
  assert.equal(Ghost.finishLap(40), true);

  store.setItem("apex26.ghost.v1", JSON.stringify({ monza: trace(35), spa: trace(60, 1) }));
  GameStore.store.onForeignWrite({ key: "apex26.ghost.v1" });
  assert.equal(Ghost.bestTime(), 35, "the other tab's faster same-context PB wins immediately");
  flushTimers();

  const saved = JSON.parse(store.getItem("apex26.ghost.v1"));
  assert.equal(saved.monza.time, 35, "the pending slower PB cannot overwrite the newer durable one");
  assert.equal(saved.spa.time, 60, "unrelated ghosts written by the other tab survive the local save");
});

test("a foreign site-data clear cancels pending PBs instead of recreating the ghost blob", () => {
  const { Ghost, GameStore, store, flushTimers } = createHarness({ deferWrites: true });
  Ghost.setTrack("monza");
  Ghost.startLap();
  for (let i = 0; i < 12; i++) Ghost.record(i, i * 10, 0);
  Ghost.finishLap(40);

  store.clear();
  GameStore.store.onForeignWrite({ key: null });
  assert.equal(Ghost.hasGhost(), false);
  flushTimers();
  assert.equal(store.getItem("apex26.ghost.v1"), null, "the cancelled callback leaves cleared storage clear");
});

test("clearing one ghost cancels its pending PB before a foreign merge", () => {
  const trace = { time: 60, t: [0, 1, 2, 3, 4, 5, 6, 7], s: [0, 10, 20, 30, 40, 50, 60, 70],
    x: [0, 0, 0, 0, 0, 0, 0, 0], _used: 1 };
  const { Ghost, GameStore, store, flushTimers } = createHarness({ deferWrites: true });
  Ghost.setTrack("monza");
  Ghost.startLap();
  for (let i = 0; i < 12; i++) Ghost.record(i, i * 10, 0);
  Ghost.finishLap(40);
  Ghost.clear("monza");

  store.setItem("apex26.ghost.v1", JSON.stringify({ spa: trace }));
  GameStore.store.onForeignWrite({ key: "apex26.ghost.v1" });
  flushTimers();
  const saved = JSON.parse(store.getItem("apex26.ghost.v1"));
  assert.equal(saved.monza, undefined, "the cleared pending PB is not merged back");
  assert.equal(saved.spa.time, 60);
});

function recordLap(Ghost, time) {
  Ghost.startLap();
  for (let i = 0; i < 10; i++) Ghost.record(i * 0.1, i * 20, i * 0.2);
  return Ghost.finishLap(time);
}
const ghostOnDisk = (h) => { for (const k of h.disk.keys()) if (/ghost/i.test(k)) return true; return false; };

test("a new record is written in a LONG idle slot only, never a short mid-race one", () => {
  const h = createHarness({ idle: true });
  h.Ghost.setTrack("monza");
  assert.equal(recordLap(h.Ghost, 1.0), true);
  assert.equal(h.Ghost.bestTime(), 1.0, "visible at once, before the write");
  assert.equal(ghostOnDisk(h), false);
  h.runIdle(8);                                  // a frame's idle tail: too short
  assert.equal(ghostOnDisk(h), false, "no 5-30 ms store write inside an 8 ms slot");
  assert.equal(h.idleQueued(), 1, "re-queued for a longer slot");
  h.runIdle(40);                                 // pause / menu / results
  assert.equal(ghostOnDisk(h), true);
  assert.equal(h.idleQueued(), 0);
});

test("a record waits for a long idle slot, but not forever: a 60 Hz loop never offers one", () => {
  const clock = { t: 1000 };
  const h = createHarness({ idle: true, clock });
  h.Ghost.setTrack("monza");
  recordLap(h.Ghost, 1.0);
  for (let i = 0; i < 50; i++) { clock.t += 16; h.runIdle(8); }
  assert.equal(ghostOnDisk(h), false, "still preferring a long slot");
  clock.t += 25000;
  h.runIdle(8);
  assert.equal(ghostOnDisk(h), true, "the PB only ever lived in memory");
});

test("a record still pending when the page goes away is flushed on pagehide", () => {
  const h = createHarness({ idle: true });
  h.Ghost.setTrack("monza");
  recordLap(h.Ghost, 1.0);
  h.runIdle(8);
  assert.equal(ghostOnDisk(h), false);
  h.fire("pagehide");
  assert.equal(ghostOnDisk(h), true, "the new ghost must not die with the tab");
});
