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
});
