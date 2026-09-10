/* store-cross-tab.test.mjs — GameStore must not answer from a cache the disk
 * has moved on from.
 *
 * THE BUG THIS GUARDS (docs/ARCHITECTURE-REVIEW.md §8). `store._cache` exists so
 * the render loop never calls getItem/JSON.parse; it is filled on first read and
 * never invalidated. So with two tabs open: tab A reads `career`, tab B plays and
 * saves, tab A still answers every get("career") from memory, and tab A's next
 * set() writes its stale object straight over B's. Neither tab reports anything
 * — the player finishes a season in one window and finds it gone in the other.
 *
 * The fix is deliberately NOT a merge (two divergent career saves have no
 * defined join): on a foreign write, forget the cached key so the next read goes
 * to disk, and bump `rev` so memoised derivations re-run. That is the same
 * contract set() already offers, applied to a write this document did not make.
 *
 * A VM suite because store.js is pure data + localStorage with no DOM: the
 * sandbox supplies a localStorage and a window whose addEventListener records
 * the handler, so "the module arms itself at load" is itself an assertion.
 *
 * Run: node --test tests/unit/store-cross-tab.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/core/store.js"), "utf8");

/** Load store.js over a fake localStorage + window, returning the pieces a test
 *  needs: the module's `store`, the disk behind it, and the `storage` handler it
 *  installed (null if it installed none — which is itself a failure). */
function load(writeError = null) {
  const disk = new Map();
  const listeners = new Map();
  const sandbox = {
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => {
        if (writeError) { const e = new Error("blocked"); e.name = writeError; throw e; }
        disk.set(k, String(v));
      },
      removeItem: (k) => { disk.delete(k); },
    },
    // store.js logs through Log; SaveMigrate reads Teams only when migration runs.
    Log: { warn() {}, info() {} },
    Teams: { LIST: [] },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (type, fn) => { listeners.set(type, fn); };
  const ctx = vm.createContext(sandbox);
  seedSaveMigrate(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/core/store.js" });
  const GameStore = vm.runInContext("GameStore", ctx);
  return { store: GameStore.store, disk, onStorage: listeners.get("storage") || null };
}

test("write reports session success separately from reload durability", () => {
  const { store } = load("QuotaExceededError");
  const changes = [];
  store.subscribe((change) => changes.push(change));
  const result = store.write("career.driver.0", { money: 900 });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true, durable: false, reason: "QuotaExceededError",
  });
  assert.equal(store.get("career.driver.0", null).money, 900,
    "a failed disk write must still preserve the live session");
  assert.equal(changes.at(-1).durable, false,
    "the UI observer must receive the durability failure");
});

/** What the browser hands a `storage` listener for a foreign write. */
const evt = (key, newValue) => ({ key, newValue, storageArea: null });

test("the module arms its own storage listener at load", () => {
  const { onStorage } = load();
  assert.equal(typeof onStorage, "function",
    "store.js must install the listener itself — nothing calls an init() on this module, " +
    "so a listener that waits to be wired is a listener nobody wires");
});

test("without the listener the cache lies — the setup this suite is about", () => {
  const { store, disk } = load();
  disk.set("apex26.career", JSON.stringify({ money: 100 }));
  assert.equal(store.get("career", null).money, 100);   // first read fills the cache
  disk.set("apex26.career", JSON.stringify({ money: 900 }));   // "the other tab saved"
  assert.equal(store.get("career", null).money, 100,
    "the cache is supposed to hold — that is why the foreign write has to invalidate it");
});

test("a foreign write to an apex26. key drops exactly that key and the next read is fresh", () => {
  const { store, disk, onStorage } = load();
  disk.set("apex26.career", JSON.stringify({ money: 100 }));
  disk.set("apex26.track", JSON.stringify(4));
  assert.equal(store.get("career", null).money, 100);
  assert.equal(store.get("track", -1), 4);

  disk.set("apex26.career", JSON.stringify({ money: 900 }));
  onStorage(evt("apex26.career", JSON.stringify({ money: 900 })));

  assert.equal(store.get("career", null).money, 900, "the changed key must re-read from disk");
  // The untouched key stays cached — invalidating everything on every foreign
  // write would put getItem/JSON.parse back in the render loop, which is the
  // cost _cache exists to avoid.
  disk.set("apex26.track", JSON.stringify(11));
  assert.equal(store.get("track", -1), 4, "an unrelated key must NOT be dropped");
});

test("rev bumps on a foreign write, so memoised derivations re-run", () => {
  const { store, onStorage } = load();
  const before = store.rev;
  onStorage(evt("apex26.career", "{}"));
  assert.ok(store.rev > before, "rev is the invalidation signal set() already publishes");
});

test("keyRevision changes only for the key that moved", () => {
  const { store, onStorage } = load();
  const career0 = store.keyRevision("career.driver.0");
  const track0 = store.keyRevision("track");
  onStorage(evt("apex26.career.driver.0", "{}"));
  assert.notEqual(store.keyRevision("career.driver.0"), career0);
  assert.equal(store.keyRevision("track"), track0);
  store.set("track", 4);
  assert.notEqual(store.keyRevision("track"), track0, "local writes move the generation too");
});

test("subscribers receive named foreign changes and can unsubscribe", () => {
  const { store, onStorage } = load();
  const seen = [];
  const off = store.subscribe((change) => seen.push(change.key));
  onStorage(evt("apex26.seasonCfg", "{}"));
  off();
  onStorage(evt("apex26.track", "1"));
  assert.deepEqual(seen, ["seasonCfg"]);
});

test("a foreign clear() drops the whole cache", () => {
  const { store, disk, onStorage } = load();
  disk.set("apex26.career", JSON.stringify({ money: 100 }));
  disk.set("apex26.track", JSON.stringify(4));
  assert.equal(store.get("career", null).money, 100);
  assert.equal(store.get("track", -1), 4);

  disk.clear();
  onStorage(evt(null, null));   // storage.clear() in another tab: key === null

  assert.equal(store.get("career", "gone"), "gone");
  assert.equal(store.get("track", -1), -1);
});

test("a foreign write to someone else's key is ignored entirely", () => {
  const { store, onStorage } = load();
  const before = store.rev;
  for (const k of ["theme", "otherapp.career", "apex27.career", ""]) {
    assert.equal(store.onForeignWrite(evt(k, "x")), false, `${k} is not ours`);
  }
  assert.equal(store.rev, before, "a foreign key must not invalidate anything");
  assert.equal(store.onForeignWrite(null), false, "a missing event is inert, not a throw");
  onStorage(evt("theme", "dark"));   // through the installed handler too
  assert.equal(store.rev, before);
});

test("a write this tab made still wins its own cache — no self-invalidation loop", () => {
  const { store, disk } = load();
  store.set("track", 7);
  assert.equal(disk.get("apex26.track"), "7");
  assert.equal(store.get("track", -1), 7);
  // `storage` never fires for the document that wrote it, so the local value
  // survives; if that ever changed, set()-then-get() would round-trip the disk.
  assert.equal(store.get("track", -1), 7);
});


/* ── the durable mirror (IndexedDB) ──────────────────────────────────────────
 * Same module, second store: every apex26.career* / apex26.season* write is
 * also queued into an IndexedDB object store, and at boot a key localStorage
 * LACKS that the mirror holds comes back. The fake below is the smallest IDB
 * that answers open / transaction / put / delete / getAll with the async
 * callback shape the module drives; requests settle on a microtask and the
 * transaction's oncomplete on a macrotask, like the real thing. */
function fakeIndexedDb(seed = []) {
  const rows = new Map(seed);
  const request = (result) => {
    const r = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_name, _mode) {
      const t = { error: null, oncomplete: null, onerror: null, onabort: null };
      t.objectStore = () => ({
        put(row) { rows.set(row.k, row.v); return request(row.k); },
        delete(k) { rows.delete(k); return request(undefined); },
        getAll() { return request(Array.from(rows, ([k, v]) => ({ k, v }))); },
      });
      setTimeout(() => { if (t.oncomplete) t.oncomplete(); }, 0);
      return t;
    },
  };
  return {
    rows,
    open() {
      const r = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
      return r;
    },
  };
}

function loadMirrored({ seed = [], disk = new Map(), writeError = null } = {}) {
  const idb = fakeIndexedDb(seed);
  const sandbox = {
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console, Promise,
    setTimeout, clearTimeout, queueMicrotask,
    indexedDB: idb,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => {
        if (writeError) { const e = new Error("blocked"); e.name = writeError; throw e; }
        disk.set(k, String(v));
      },
      removeItem: (k) => { disk.delete(k); },
    },
    Log: { warn() {}, info() {} },
    window: { addEventListener() {} },
    Teams: { LIST: [] },
  };
  const ctx = vm.createContext(sandbox);
  seedSaveMigrate(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/core/store.js" });
  return { store: vm.runInContext("GameStore", ctx).store, disk, idb };
}

test("career and season writes are mirrored into IndexedDB; other keys are not", async () => {
  const { store, idb } = loadMirrored();
  await store.mirror.ready;
  store.set("career.driver.0", { money: 100 });
  store.set("season", { round: 3 });
  store.set("seasonCfg", { drop: 2 });
  store.set("careerSlot", "driver:0");
  store.set("musicSource", "all");           // a preference: localStorage only
  assert.equal(store.mirror.pending, 4, "the burst is queued, not written per call");
  await store.mirrorFlush();
  assert.deepEqual(Array.from(idb.rows.keys()).sort(),
    ["apex26.career.driver.0", "apex26.careerSlot", "apex26.season", "apex26.seasonCfg"]);
  assert.equal(JSON.parse(idb.rows.get("apex26.career.driver.0")).money, 100);
  assert.equal(store.mirror.flushed, 4);
  store.set("career.driver.0", null);        // deleteSlot() writes null
  await store.mirrorFlush();
  assert.equal(idb.rows.has("apex26.career.driver.0"), false, "a deleted slot leaves the mirror too");
});

test("a quota-refused save still reaches the mirror", async () => {
  const { store, idb } = loadMirrored({ writeError: "QuotaExceededError" });
  await store.mirror.ready;
  const r = store.write("career.myteam.1", { money: 7 });
  assert.equal(r.durable, false);
  await store.mirrorFlush();
  assert.equal(JSON.parse(idb.rows.get("apex26.career.myteam.1")).money, 7,
    "the write localStorage refused is exactly the one the mirror exists for");
});

test("at boot the mirror restores only what localStorage lacks, and announces it", async () => {
  const disk = new Map([["apex26.career.driver.0", JSON.stringify({ money: 999 })]]);
  const { store } = loadMirrored({
    disk,
    seed: [
      ["apex26.career.driver.0", JSON.stringify({ money: 1 })],     // disk has a newer one: left alone
      ["apex26.career.myteam.0", JSON.stringify({ money: 55 })],    // evicted from localStorage: restored
      ["apex26.season", JSON.stringify({ round: 9 })],
      ["apex26.musicSource", JSON.stringify("all")],                // not a mirrored key: ignored
    ],
  });
  assert.equal(store.get("career.myteam.0", null), null, "the synchronous first read predates the restore");
  const changes = [];
  store.subscribe((c) => changes.push(c));
  const n = await store.mirror.ready;
  assert.equal(n, 2);
  assert.equal(store.get("career.driver.0").money, 999, "the disk's copy wins over the mirror's");
  assert.equal(store.get("career.myteam.0").money, 55, "the cached miss was dropped so the restore is read");
  assert.equal(store.get("season").round, 9);
  assert.equal(disk.has("apex26.musicSource"), false);
  assert.deepEqual(changes.map((c) => c.key).sort(), ["career.myteam.0", "season"]);
  assert.ok(changes.every((c) => c.foreign && c.restored), "announced like a second tab's write, flagged restored");
  assert.equal(store.mirror.restored, 2);
});

test("without indexedDB the mirror is inert and the store is unchanged", async () => {
  const { store } = load();
  assert.equal(store.mirror.supported, false);
  assert.equal(await store.mirror.ready, 0);
  store.set("career.driver.0", { money: 1 });
  assert.equal(store.mirror.pending, 0);
  assert.equal(await store.mirrorFlush(), false);
});
