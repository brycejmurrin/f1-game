/* store-raw-fail-notify.test.mjs — a failed raw-lane write raises NOT SAVING (#5880).
 *
 * rawSet/rawDel recorded a refused localStorage write in failedKeys() but never
 * notified subscribers, so the save banner (js/ui/select-screen.js, which shows
 * on `change.local && change.durable === false`) stayed hidden while settings
 * written through the raw lane were lost on reload. They now notify like
 * write() does, once per failure, without re-entry from a listener.
 *
 * Run: node --test tests/unit/store-raw-fail-notify.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadStore() {
  const m = new Map();
  const disk = { full: false };
  const quota = () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
  const ctx = {
    console,
    Log: { warn() {}, info() {}, error() {}, debug() {} },
    localStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { if (disk.full) quota(); m.set(k, String(v)); },
      removeItem: (k) => { if (disk.full) quota(); m.delete(k); },
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/store.js"), "utf8") + "\n;globalThis.GameStore = GameStore;", ctx,
    { filename: absSrc("js/core/store.js") });
  return { store: ctx.GameStore.store, disk, m };
}

// The predicate select-screen.js uses to show #save-warning.
const raisesBanner = (c) => !!(c && c.local && c.durable === false);

test("a refused rawSet notifies a non-durable local change (the banner's trigger)", () => {
  const { store, disk } = loadStore();
  const seen = [];
  store.subscribe((c) => seen.push(c));
  assert.equal(store.rawSet("gfxProbe", "1"), true);
  assert.equal(seen.filter(raisesBanner).length, 0, "a durable raw write raises nothing");
  disk.full = true;
  assert.equal(store.rawSet("gfxProbe", "0"), false);
  const hits = seen.filter(raisesBanner);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, "gfxProbe");
  assert.equal(hits[0].reason, "QuotaExceededError");
  assert.equal(store.writeFailed(), "QuotaExceededError");
  assert.equal(store.raw("gfxProbe"), "0", "the session keeps the refused value");
});

test("a refused rawDel notifies too", () => {
  const { store, disk } = loadStore();
  store.rawSet("gfxProbe", "1");
  const seen = [];
  store.subscribe((c) => seen.push(c));
  disk.full = true;
  assert.equal(store.rawDel("gfxProbe"), false);
  const hits = seen.filter(raisesBanner);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, "gfxProbe");
});

test("a listener whose own raw write fails does not recurse", () => {
  const { store, disk } = loadStore();
  let calls = 0;
  store.subscribe((c) => { calls++; if (raisesBanner(c)) store.rawSet("echo", "x"); });
  disk.full = true;
  assert.equal(store.rawSet("gfxProbe", "1"), false);
  assert.equal(calls, 1, "the nested failure is recorded but not re-notified");
  assert.equal(store.failedKeys().map((f) => f.key).sort().join(","), "echo,gfxProbe");
  disk.full = false;
  assert.equal(store.retryFailed().durable, true);
  assert.equal(store.writeFailed(), null);
});
