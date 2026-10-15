/* dev-flags.test.mjs — DevFlags query / hash / storage resolution.
 *
 * Run: node --test tests/unit/dev-flags.test.mjs   (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/core/dev-flags.js"), "utf8");

function boot({ search = "", hash = "", store = {}, gameStore = null } = {}) {
  const disk = new Map(Object.entries(store).map(([k, v]) => ["apex26." + k, String(v)]));
  const loc = { search, hash };
  const sb = {
    location: loc,
    localStorage: {
      getItem(k) { return disk.has(k) ? disk.get(k) : null; },
      setItem(k, v) { disk.set(k, String(v)); },
      removeItem(k) { disk.delete(k); },
    },
  };
  if (gameStore) sb.GameStore = { store: { raw: (k) => (k in gameStore ? gameStore[k] : null) } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: "js/core/dev-flags.js" });
  return vm.runInContext("window.DevFlags", ctx);
}

test("upscale: legacy =1 query and storage only (no hash)", () => {
  const D = boot();
  assert.equal(D.get("upscale"), false);
  assert.equal(boot({ search: "?upscale=1" }).get("upscale"), true);
  assert.equal(boot({ search: "?upscale=on" }).get("upscale"), false);
  assert.equal(boot({ hash: "#upscale=1" }).get("upscale"), false);
  assert.equal(boot({ store: { spatialUpscale: "1" } }).get("upscale"), true);
  assert.equal(boot({ store: { spatialUpscale: "on" } }).get("upscale"), false);
});

test("metrics: full bool query, storage 1/0 only", () => {
  assert.equal(boot({ search: "?metrics=on" }).get("metrics"), true);
  assert.equal(boot({ search: "?metrics=0" }).get("metrics"), false);
  assert.equal(boot({ search: "?metrics=false" }).get("metrics"), false);
  assert.equal(boot({ store: { metrics: "1" } }).get("metrics"), true);
  assert.equal(boot({ store: { metrics: "0" } }).get("metrics"), false);
});

test("legacy =1 flags: the URL only turns ON — ?x=0 never overrides a stored \"1\" (old reader was query||storage)", () => {
  assert.equal(boot({ search: "?upscale=0", store: { spatialUpscale: "1" } }).get("upscale"), true);
  assert.equal(boot({ search: "?gfxdebug=0", store: { gfxDebug: "1" } }).get("gfxdebug"), true);
  assert.equal(boot({ search: "?inputdebug=0", store: { inputDebug: "1" } }).get("inputdebug"), true);
  assert.equal(boot({ search: "?upscale=0" }).get("upscale"), false);
  assert.equal(boot({ search: "?UPSCALE=1" }).get("upscale"), false, "param names stay case-sensitive, as the old regex was");
});

test("metrics: yes/no is not a flag value; the param name is case-insensitive like the old /i reader", () => {
  assert.equal(boot({ search: "?metrics=yes" }).get("metrics"), false);
  assert.equal(boot({ search: "?metrics=no", store: { metrics: "1" } }).get("metrics"), true, "an unknown value defers to storage");
  assert.equal(boot({ search: "?METRICS=ON" }).get("metrics"), true);
});

test("metrics storage goes through GameStore.store.raw when the store is up", () => {
  // localStorage says off, the store says on: the store wins (metrics-overlay's old read()).
  const D = boot({ store: { metrics: "0" }, gameStore: { "apex26.metrics": "1" } });
  assert.equal(D.get("metrics"), true);
  assert.equal(boot({ store: { metrics: "1" } }).get("metrics"), true, "no store yet: localStorage");
});

test("viz: string from query then storage", () => {
  assert.equal(boot({ search: "?viz=mat" }).get("viz"), "mat");
  assert.equal(boot({ store: { tlxViz: "normal" } }).get("viz"), "normal");
  assert.equal(boot().get("viz"), null);
});

test("flags() lists every registry key", () => {
  const all = boot({ search: "?gfxdebug=1" }).flags();
  assert.equal(typeof all.gfxdebug, "boolean");
  assert.ok("upscale" in all && "viz" in all);
  assert.equal(all.gfxdebug, true);
});

test("gen-flags-table --check stays in sync", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/gen/gen-flags-table.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});
