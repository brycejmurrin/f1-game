/* metrics.test.mjs — GameMetrics toggle + snapshot, in a VM.
 *
 * The overlay is DOM; the contract that must not rot is the persist key, the
 * default-off, the URL override, and that snapshot() always returns a plain
 * object (never throws) even when __apex / PerfGov are missing.
 *
 * Run: node --test tests/unit/metrics.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/game/metrics.js"), "utf8");

function load(opts) {
  const disk = new Map(Object.entries(opts.store || {}));
  const search = opts.search || "";
  const sandbox = {
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => { disk.set(k, String(v)); },
      removeItem: (k) => { disk.delete(k); },
    },
    location: { search },
    document: undefined,
    window: undefined,
    requestAnimationFrame: undefined,
    PerfGov: opts.PerfGov,
    __apex: opts.apex,
  };
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/game/metrics.js" });
  return { M: vm.runInContext("GameMetrics", ctx), disk, Log: vm.runInContext("Log", ctx) };
}

test("METRICS defaults off and persists on toggle", () => {
  const { M, disk } = load({});
  assert.equal(M.on(), false);
  assert.equal(M.KEY, "apex26.metrics");
  assert.equal(M.set(true), true);
  assert.equal(M.on(), true);
  assert.equal(disk.get("apex26.metrics"), "1");
  assert.equal(M.toggle(), false);
  assert.equal(disk.get("apex26.metrics"), "0");
});

test("?metrics=1 overrides storage for the session", () => {
  const { M, disk } = load({ store: { "apex26.metrics": "0" }, search: "?metrics=1" });
  assert.equal(M.on(), true);
  assert.equal(disk.get("apex26.metrics"), "0", "URL form must not write storage");
});

test("snapshot() is a plain object and never throws without __apex", () => {
  const { M } = load({});
  const s = M.snapshot();
  assert.equal(typeof s, "object");
  assert.equal(s.on, false);
  assert.ok(Array.isArray(s.logs));
});

test("turning metrics on raises the log buffer so the overlay tail fills", () => {
  const { M, Log } = load({});
  assert.equal(Log.level().buffer, "info");
  M.set(true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().console, "warn");
  M.set(false);
  assert.equal(Log.level().buffer, "info", "OFF restores the buffer it raised");
});

test("boot-ON (?metrics=1) raises the buffer without set()", () => {
  const { M, Log } = load({ search: "?metrics=1" });
  assert.equal(M.on(), true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().console, "warn");
});

test("metrics ON keeps per-namespace buffer overrides", () => {
  const { M, Log } = load({});
  Log.level("buffer:scenery:trace");
  M.set(true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().bufferNs.scenery, "trace");
  M.set(false);
  assert.equal(Log.level().buffer, "info");
  assert.equal(Log.level().bufferNs.scenery, "trace");
});

test("snapshot keeps frame EMA off the governor budget", () => {
  const { M } = load({
    PerfGov: { fpsEMA: () => 16.7, floorMs: () => 22.2, tier: () => 2 },
  });
  const s = M.snapshot();
  assert.equal(s.ms, 16.7);
  assert.equal(s.budget, 22.2);
  assert.equal(s.fps, 59.9);
  assert.equal(s.tier, 2);
});

test("snapshot uses probe(), never obs()", () => {
  let obs = 0, probe = 0;
  const { M } = load({
    apex: {
      obs() { obs++; return { speedKph: 99, s: 1, x: 2 }; },
      probe() { probe++; return { speed: 20, s: 12.5, x: -0.4 }; },
      timing() { return { lap: 3, pos: 4, total: 20, gear: 6, energy: 0.5 }; },
    },
  });
  const s = M.snapshot();
  assert.equal(obs, 0);
  assert.equal(probe, 1);
  assert.equal(s.speedKph, 72);
  assert.equal(s.s, 12.5);
  assert.equal(s.x, -0.4);
  assert.equal(s.lap, 3);
});

test("overlay sits below the top-right chrome, not on the minimap", () => {
  const { M } = load({});
  assert.match(M.PANEL_STYLE, /right:\s*8px/);
  assert.match(M.PANEL_STYLE, /top:\s*140px/);
  assert.doesNotMatch(M.PANEL_STYLE, /left:\s*8px/);
});
