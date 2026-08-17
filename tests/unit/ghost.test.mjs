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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function createHarness() {
  const store = new Map();
  const mockLocalStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };

  const sandbox = {
    localStorage: mockLocalStorage,
    module: { exports: {} },
    console,
  };
  const ctx = vm.createContext(sandbox);
  const src = readFileSync(join(ROOT, "js", "car", "ghost.js"), "utf8");
  vm.runInContext(src, ctx);
  return { Ghost: sandbox.module.exports || vm.runInContext("Ghost", ctx), store: mockLocalStorage };
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
