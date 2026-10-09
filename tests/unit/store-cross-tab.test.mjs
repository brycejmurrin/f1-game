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
  return { store: GameStore.store, GameStore, disk, onStorage: listeners.get("storage") || null };
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
  const rows = new Map(seed.map(([k, v]) => [k, v]));
  const lsOk = new Map(seed.filter((e) => e.length > 2).map(([k, , ok]) => [k, ok]));   // [k, v, lsOk]
  let writeFailures = 0;
  let writeHolds = 0;
  let writeTransactions = 0;
  const heldWrites = [];
  const request = (result) => {
    const r = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_name, mode) {
      const fail = mode === "readwrite" && writeFailures > 0;
      if (fail) writeFailures--;
      if (mode === "readwrite") writeTransactions++;
      const writes = [];
      const t = { error: null, oncomplete: null, onerror: null, onabort: null };
      t.objectStore = () => ({
        put(row) { writes.push(() => { rows.set(row.k, row.v); lsOk.set(row.k, row.lsOk); }); return request(row.k); },
        delete(k) { writes.push(() => { rows.delete(k); lsOk.delete(k); }); return request(undefined); },
        get(k) { return request(rows.has(k) ? { k, v: rows.get(k), lsOk: lsOk.get(k) } : undefined); },
        getAll() { return request(Array.from(rows, ([k, v]) => ({ k, v, lsOk: lsOk.get(k) }))); },
      });
      const settle = () => {
        if (fail) { if (t.onabort) t.onabort(); }
        else {
          writes.forEach((write) => write());
          if (t.oncomplete) t.oncomplete();
        }
      };
      if (mode === "readwrite" && writeHolds > 0) {
        writeHolds--;
        heldWrites.push(settle);
      } else setTimeout(settle, 0);
      return t;
    },
  };
  return {
    rows, lsOk,
    failNextWrite() { writeFailures++; },
    holdNextWrite() { writeHolds++; },
    releaseNextWrite() { const settle = heldWrites.shift(); if (settle) settle(); },
    get heldWrites() { return heldWrites.length; },
    get writeTransactions() { return writeTransactions; },
    open() {
      const r = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
      return r;
    },
  };
}

function loadMirrored({ seed = [], disk = new Map(), writeError = null, quota = null, idb = fakeIndexedDb(seed) } = {}) {
  const sandbox = {
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console, Promise,
    setTimeout, clearTimeout, queueMicrotask,
    indexedDB: idb,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => {
        const err = writeError || (quota && quota.on ? "QuotaExceededError" : null);
        if (err) { const e = new Error("blocked"); e.name = err; throw e; }
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
  return { store: vm.runInContext("GameStore", ctx).store, disk, idb, ctx };
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
  const keyChanges = changes.filter((c) => !c.restoredBatch);
  assert.deepEqual(keyChanges.map((c) => c.key).sort(), ["career.myteam.0", "season"]);
  assert.ok(changes.every((c) => c.foreign && c.restored), "announced like a second tab's write, flagged restored");
  const batch = changes.find((c) => c.restoredBatch);
  assert.deepEqual(Array.from(batch.keys).sort(), ["career.myteam.0", "season"],
    "owners get one coherent notification after every restored row is on disk");
  assert.equal(store.mirror.restored, 2);
});

test("a failed mirror transaction retains its batch and a later flush retries it", async () => {
  const { store, idb } = loadMirrored({ writeError: "QuotaExceededError" });
  await store.mirror.ready;
  idb.failNextWrite();
  store.write("career.driver.0", { money: 321 });

  assert.equal(await store.mirrorFlush(), false);
  assert.equal(store.mirror.pending, 1, "an aborted transaction must remain pending");
  assert.equal(idb.rows.has("apex26.career.driver.0"), false);

  assert.equal(await store.mirrorFlush(), true, "the retained batch is retryable");
  assert.equal(store.mirror.pending, 0);
  assert.equal(JSON.parse(idb.rows.get("apex26.career.driver.0")).money, 321);
});

test("a failed mirror batch never replaces a newer pending value for the same key", async () => {
  const { store, idb } = loadMirrored();
  await store.mirror.ready;
  idb.failNextWrite();
  store.set("season", { round: 1 });
  const failed = store.mirrorFlush();
  store.set("season", { round: 2 });
  assert.equal(await failed, false);

  assert.equal(await store.mirrorFlush(), true);
  assert.equal(JSON.parse(idb.rows.get("apex26.season")).round, 2,
    "the write queued during the failed transaction is the one that survives");
});

test("overlapping mirror flushes serialize so an older value cannot commit last", async () => {
  const { store, idb } = loadMirrored();
  await store.mirror.ready;
  idb.holdNextWrite();
  store.set("season", { round: 1 });
  const older = store.mirrorFlush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(idb.heldWrites, 1, "the older transaction is in flight");

  store.set("season", { round: 2 });
  const newer = store.mirrorFlush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(idb.writeTransactions, 1,
    "the newer burst must wait instead of opening a competing transaction");

  idb.releaseNextWrite();
  assert.equal(await older, true);
  assert.equal(await newer, true);
  assert.equal(idb.writeTransactions, 2);
  assert.equal(JSON.parse(idb.rows.get("apex26.season")).round, 2,
    "transaction completion order cannot roll the durable mirror back");
});

test("a quota-refused save to an EXISTING slot wins at the next boot, over the stale disk copy and its re-save", async () => {
  // Bug hunt 2026-09-22: the slot existed (V1 on disk), the quota refused V2,
  // so the mirror held V2 with the disk still on V1. Boot read V1, Career.load()
  // re-saved it, and the flush overwrote V2 in the mirror — the one case the
  // mirror exists for, lost.
  const disk = new Map([["apex26.career.driver.0", JSON.stringify({ money: 1 })]]);
  const { store, idb } = loadMirrored({
    disk,
    seed: [["apex26.career.driver.0", JSON.stringify({ money: 2 }), false]],
  });
  assert.equal(store.get("career.driver.0").money, 1, "the synchronous boot read sees the stale disk copy");
  store.set("career.driver.0", store.get("career.driver.0"), { migration: true });   // Career.load() persists what it read
  await store.mirror.ready;
  assert.equal(store.get("career.driver.0").money, 2, "the refused (newer) save is restored");
  assert.equal(JSON.parse(disk.get("apex26.career.driver.0")).money, 2, "…onto the disk, now that it fits");
  await store.mirrorFlush();
  assert.equal(JSON.parse(idb.rows.get("apex26.career.driver.0")).money, 2, "the boot re-save did not overwrite the mirror");
  assert.equal(idb.lsOk.get("apex26.career.driver.0"), true, "and the row now agrees with the disk");
});

test("a peer tab cannot replace an lsOk:false mirror row with an older lsOk:true value", async () => {
  // BUGS.md B5: Tab A quota-refused V2 (mirror lsOk:false). Tab B never saw
  // storage, still holds V1, and a successful save queues lsOk:true with V1.
  // THIS tab never restored V2 (it booted before the refusal; the row appears
  // afterwards, written by the peer). A tab that DID restore it owns the key
  // and may supersede it — that is the next test's case, and the 2026-09-29
  // restore test's. Seeding the row at this tab's boot used to stand in for
  // the peer, which stopped being equivalent once restore marks ownership.
  const key = "apex26.career.driver.0";
  const v2 = JSON.stringify({ money: 2 });
  const { store, idb } = loadMirrored();
  await store.mirror.ready;
  idb.rows.set(key, v2);         // the peer's quota-refused save lands in the mirror
  idb.lsOk.set(key, false);
  store.write("career.driver.0", { money: 1 });   // disk accepts (no writeError)
  await store.mirrorFlush();
  assert.equal(JSON.parse(idb.rows.get(key)).money, 2,
    "older lsOk:true must not overwrite the quota-refused newer row");
  assert.equal(idb.lsOk.get(key), false);
});

test("the tab that wrote the quota-refused row can still supersede it (no rollback on reload)", async () => {
  // B5's guard refused EVERY later lsOk:true write, including this tab's own
  // newer saves once the disk had room again: the reload then restored the
  // refused row over them (money 4 -> 2).
  const key = "apex26.career.driver.0";
  const disk = new Map(), quota = { on: false };
  const { store, idb } = loadMirrored({ disk, quota });
  await store.mirror.ready;
  store.set("career.driver.0", { money: 1 });
  await store.mirrorFlush();
  quota.on = true;
  store.set("career.driver.0", { money: 2 });   // refused: the mirror row is the newest copy
  await store.mirrorFlush();
  assert.equal(idb.lsOk.get(key), false);
  quota.on = false;
  store.set("career.driver.0", { money: 3 });
  store.set("career.driver.0", { money: 4 });
  await store.mirrorFlush();
  assert.equal(JSON.parse(disk.get(key)).money, 4);
  assert.equal(JSON.parse(idb.rows.get(key)).money, 4, "this tab's newer save replaced its own refused row");
  assert.equal(idb.lsOk.get(key), true, "so a reload restores nothing over the disk");
});

test("without indexedDB the mirror is inert and the store is unchanged", async () => {
  const { store } = load();
  assert.equal(store.mirror.supported, false);
  assert.equal(await store.mirror.ready, 0);
  store.set("career.driver.0", { money: 1 });
  assert.equal(store.mirror.pending, 0);
  assert.equal(await store.mirrorFlush(), false);
});


/* ── the time-trial board's CLASS cap ────────────────────────────────────────
 * ttBoardAdd caps ten laps per comparable class; nothing capped the classes.
 * A class key is a whole stringified car config (~550 chars, stored in every
 * entry), and career progression mints a new one every round, so one circuit's
 * board grew without bound until the quota refused the write and the SESSION
 * ONLY banner went up for good. The trap: the select screen reads board[0].t as
 * the circuit record, so eviction must never drop the class that holds it. */
test("the time-trial board caps classes but keeps the record and the class in use", () => {
  const { GameStore } = load();
  // The record, set long ago in a class never driven again.
  GameStore.ttBoardAdd("monza", { t: 80, ts: 1, context: "old-record" });
  for (let i = 0; i < 20; i++) GameStore.ttBoardAdd("monza", { t: 90 + i, ts: 100 + i, context: "cfg" + i });
  const b = GameStore.ttBoard("monza");
  const classes = new Set(b.map((e) => e.context));
  assert.equal(classes.size, 6, `class count is not capped: ${classes.size}`);
  assert.equal(b[0].t, 80, "the circuit record was evicted");
  assert.ok(classes.has("cfg19"), "the class just written was evicted");
  assert.ok(classes.has("cfg15") && !classes.has("cfg14"), "the rest are not the most recently driven");
  // A slow lap in a brand-new class is written even though it records nothing.
  const after = GameStore.ttBoardAdd("monza", { t: 200, ts: 999, context: "fresh" });
  assert.ok(after.some((e) => e.context === "fresh"), "the class in use lost its only lap");
  assert.equal(after[0].t, 80);
});


test("BLOCKED storage: a read that throws is remembered, not retried (and re-logged) every frame", () => {
  let logs = 0, touches = 0;
  const ctx = {
    Log: { info() { logs++; }, warn() { logs++; } }, setTimeout, clearTimeout,
    get localStorage() { touches++; const e = new Error("The operation is insecure."); e.name = "SecurityError"; throw e; },
  };
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/store.js"), "utf8") + ";this.GS=GameStore;", ctx);
  const s = ctx.GS.store; logs = 0; touches = 0;
  for (let i = 0; i < 600; i++) assert.equal(s.get("hudProfile", "standard"), "standard");
  assert.equal(touches, 1, "one storage access, then memory");
  assert.equal(logs, 1, "one log line, not one per frame");
});

test("a restored newer row that LANDED makes this session its owner: its later saves replace the row, no rollback next boot", async () => {
  // Bug hunt 2026-09-29: the restore wrote the quota-refused row back to disk
  // but did not mark this session as its owner, so the flush guard refused
  // every later save over the lsOk:false row — and the NEXT boot restored that
  // stale value over all of this session's progress, every boot after.
  const key = "apex26.career.driver.0";
  const disk = new Map([[key, JSON.stringify({ money: 1 })]]);
  const { store, idb } = loadMirrored({ disk, seed: [[key, JSON.stringify({ money: 2 }), false]] });
  await store.mirror.ready;
  assert.equal(store.get("career.driver.0").money, 2, "the refused save is restored onto the disk");
  store.set("career.driver.0", { money: 3 });   // the session plays on
  await store.mirrorFlush();
  assert.equal(JSON.parse(idb.rows.get(key)).money, 3, "this session's save replaced the row");
  assert.equal(idb.lsOk.get(key), true);
  const next = loadMirrored({ disk, seed: [[key, idb.rows.get(key), idb.lsOk.get(key)]] });
  await next.store.mirror.ready;
  assert.equal(next.store.get("career.driver.0").money, 3, "the next boot keeps the progress");
});

// Fuzz-found 2026-09-30: JSON.parse turns an oversized numeric literal into
// Infinity without throwing, and store.get returned it into live state
// (career money / season points). Same shape as treating player input as a
// promise — refuse non-finite top-level numbers like a SyntaxError.
test("an oversized numeric literal on disk is refused, not returned as Infinity", () => {
  const { store, disk } = load();
  disk.set("apex26.career.money", "8".repeat(400));
  assert.equal(store.get("career.money", 0), 0,
    "digit overflow must fall back to the call-site default, not Infinity");
  disk.set("apex26.career.money", "1e309");
  store._cache.delete("apex26.career.money");
  assert.equal(store.get("career.money", 7), 7,
    "1e309 (JSON Infinity) must also fall back");
  disk.set("apex26.career.money", "42");
  store._cache.delete("apex26.career.money");
  assert.equal(store.get("career.money", 0), 42, "a finite number still loads");
});

// review-race-career-data #4 (2026-10-04): one corrupt key set `broken`, the
// flag a quota or blocked storage sets, so the SESSION ONLY banner came up on
// every boot while every write still succeeded — and the bytes stayed on disk.
test("a corrupt key is removed and logged; storage is not flagged broken", () => {
  const { store, disk, warns } = bootLogged();
  disk.set("apex26.bad", "{oops");
  disk.set("apex26.good", JSON.stringify({ ok: 1 }));
  assert.equal(store.get("bad", "dflt"), "dflt", "the default is served");
  assert.equal(store.broken, null, "a corrupt value is not broken storage");
  assert.equal(store.writeFailed(), null);
  assert.equal(disk.has("apex26.bad"), false, "the corrupt key is removed from disk");
  assert.ok(warns.some((m) => /apex26\.bad was unreadable \(SyntaxError/.test(m) && /removed/.test(m)), "and Log says so");
  assert.deepEqual(store.get("good", null), { ok: 1 }, "other keys are untouched");
  assert.equal(disk.has("apex26.good"), true);
});

test("write(k, undefined) removes the key instead of storing the string \"undefined\"", () => {
  const { store, disk } = load();
  store.write("u", { a: 1 });
  assert.equal(disk.has("apex26.u"), true);
  const r = store.write("u", undefined);
  assert.equal(r.ok, true);
  assert.equal(r.durable, true);
  assert.equal(disk.has("apex26.u"), false, "no literal \"undefined\" on disk");
  assert.equal(store.get("u", "D"), "D", "this session reads the default");
  store.set("v", undefined);
  assert.equal(disk.has("apex26.v"), false);
  // The next boot reads the default with nothing flagged.
  const again = load();
  for (const [k, val] of disk) again.disk.set(k, val);
  assert.equal(again.store.get("u", "D"), "D");
  assert.equal(again.store.broken, null);
});

/** store.js over a disk whose setItem throws `fail.name` while it is set, with
 *  Log.warn captured. */
function bootLogged(fail = { name: null }) {
  const disk = new Map();
  const warns = [];
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => { if (fail.name) { const e = new Error("full"); e.name = fail.name; throw e; } disk.set(k, String(v)); },
      removeItem: (k) => { disk.delete(k); },
      key: (i) => [...disk.keys()][i], get length() { return disk.size; },
    },
    Log: { warn(ns, ...m) { warns.push(m.join(" ")); }, info() {} }, Teams: { LIST: [] },
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  seedSaveMigrate(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/core/store.js" });
  return { store: vm.runInContext("GameStore", ctx).store, disk, warns };
}

test("writeFailed() names a failed write until that key is written durably again", () => {
  const fail = { name: "QuotaExceededError" };
  const { store } = bootLogged(fail);
  assert.equal(store.writeFailed(), null, "nothing failed yet");
  assert.equal(store.write("career.driver.0", { money: 1 }).durable, false);
  assert.equal(store.writeFailed(), "QuotaExceededError");
  fail.name = null;
  store.write("other", 1);
  assert.equal(store.writeFailed(), "QuotaExceededError", "a different key's success does not clear it");
  store.write("career.driver.0", { money: 2 });
  assert.equal(store.writeFailed(), null, "the same key written durably clears it");
});

// Exercise the domain owners too: migrations alter a save's bytes before the
// first write, and failed localStorage writes give Career no storage event.
function loadCareerMirrored(options = {}) {
  const h = loadMirrored(options);
  h.ctx.Teams = {
    LIST: [{ id: "haas", tier: 4, drivers: [
      { name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 },
    ] }],
    POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    isReal: (t) => !!t && !t.custom && !t.legends,
  };
  h.ctx.Tracks = { LIST: [{ id: "a" }], SEASON: [{ id: "a" }] };
  h.ctx.Parts = { getFactorySetup: () => ({}), setLegality() {} };
  for (const file of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js",
    "js/career/career.js", "js/career/season-cal.js", "js/career/career-backup.js"]) {
    vm.runInContext(readFileSync(join(ROOT, file), "utf8"), h.ctx, { filename: file });
  }
  for (const name of ["Career", "SeasonCal", "CareerBackup"]) h[name] = vm.runInContext(name, h.ctx);
  return h;
}
const careerKey = "apex26.career.driver.0";
const savedCareer = (money) => JSON.stringify({ v: 0, money, team: "haas", flavour: "driver" });

test("an explicit backup import before mirror restore survives Career.load migration re-saves", async () => {
  const disk = new Map([[careerKey, savedCareer(100)]]);
  const h = loadCareerMirrored({ disk, seed: [[careerKey, savedCareer(200), false]] });
  h.Career.load();
  const result = h.CareerBackup.apply({ format: h.CareerBackup.FORMAT,
    slots: [{ flavour: "driver", i: 0, data: JSON.parse(savedCareer(300)) }] });
  assert.equal(result.ok, true);
  assert.equal(h.Career.data().money, 300);
  await h.store.mirror.ready;
  await h.store.mirrorFlush();
  assert.equal(h.Career.data().money, 300);
  assert.equal(JSON.parse(disk.get(careerKey)).money, 300);
  assert.equal(JSON.parse(h.idb.rows.get(careerKey)).money, 300);
});

test("automatic Career.load migration still adopts the newer refused mirror save", async () => {
  const disk = new Map([[careerKey, savedCareer(100)]]);
  const h = loadCareerMirrored({ disk, seed: [[careerKey, savedCareer(200), false]] });
  h.Career.load();
  assert.equal(h.Career.data().v, 1, "boot migration changes the stored bytes");
  await h.store.mirror.ready;
  await h.store.mirrorFlush();
  assert.equal(h.Career.data().money, 200);
  assert.equal(JSON.parse(disk.get(careerKey)).money, 200);
  assert.equal(JSON.parse(h.idb.rows.get(careerKey)).money, 200);
});

test("deleting a career before restore cannot resurrect it, even when localStorage is full", async () => {
  for (const full of [false, true]) {
    const disk = new Map([[careerKey, savedCareer(100)]]);
    const h = loadCareerMirrored({ disk, quota: { on: full }, seed: [[careerKey, savedCareer(200), false]] });
    h.Career.load();
    assert.equal(h.Career.clear().ok, true);
    await h.store.mirror.ready;
    await h.store.mirrorFlush();
    assert.equal(h.Career.data(), null);
    assert.equal(h.store.get("career.driver.0"), null);
    const next = loadCareerMirrored({ disk, idb: h.idb });
    next.Career.load();
    await next.store.mirror.ready;
    await next.store.mirrorFlush();
    assert.equal(next.Career.data(), null, "deletion survives a reload after storage recovers");
    assert.equal(JSON.parse(disk.get(careerKey)), null);
  }
});

test("a former mirror owner cannot overwrite another tab's finished career round", async () => {
  const disk = new Map(), idb = fakeIndexedDb(), quota = { on: false };
  const a = loadCareerMirrored({ disk, idb, quota });
  await a.store.mirror.ready;
  a.Career.start({ teamId: "haas", seed: 7 });
  await a.store.mirrorFlush();
  const b = loadCareerMirrored({ disk, idb, quota });
  await b.store.mirror.ready;
  b.Career.load(); await b.store.mirrorFlush();
  a.Career.load(); await a.store.mirrorFlush();
  for (const h of [a, b]) { h.Career.engage(true); h.SeasonCal.engage("career"); }
  quota.on = true;
  a.Career.markWeekendStarted(); await a.store.mirrorFlush();
  const player = { driverId: "haas:0", team: { id: "haas" }, code: "YOU",
    finished: true, retired: false, cuts: 0, penalty: 0, gridPos: 1 };
  const mate = { ...player, driverId: "haas:1", code: "BBB" };
  assert.equal(b.Career.scoreRound([player, mate], player, null).pos, 1);
  await b.store.mirrorFlush();
  const winner = idb.rows.get(careerKey);
  assert.equal(JSON.parse(winner).season.round, 1);
  assert.equal(a.Career.conflicted(), false, "quota failures generate no storage event");
  quota.on = false;
  a.Career.data().season.qualiOrder = [{ driverId: "haas:0", t: 90, pos: 1, human: true }];
  a.Career.save(); await a.store.mirrorFlush();
  assert.equal(idb.rows.get(careerKey), winner, "the peer's completed round stays durable");
  assert.equal(idb.lsOk.get(careerKey), false, "reload must still restore that round over stale disk");
  const next = loadCareerMirrored({ disk, idb });
  next.Career.load(); await next.store.mirror.ready; await next.store.mirrorFlush();
  assert.equal(next.Career.data().season.round, 1);
});

test("an aborted mirror transaction cannot grant ownership of a peer's next payload", async () => {
  const quota = { on: true };
  const h = loadMirrored({ quota });
  await h.store.mirror.ready;
  h.store.write("career.driver.0", { money: 1 }); await h.store.mirrorFlush();
  quota.on = false;
  h.idb.failNextWrite();
  h.store.write("career.driver.0", { money: 2 });
  assert.equal(await h.store.mirrorFlush(false), false);
  h.idb.rows.set(careerKey, JSON.stringify({ money: 2 }));
  h.idb.lsOk.set(careerKey, false);
  h.store.write("career.driver.0", { money: 3 }); await h.store.mirrorFlush();
  assert.equal(JSON.parse(h.idb.rows.get(careerKey)).money, 2);
  assert.equal(h.idb.lsOk.get(careerKey), false);
});


test("standalone season migration yields to recovery but an explicit replacement survives it", async () => {
  for (const explicit of [false, true]) {
    const key = "apex26.season";
    const disk = new Map([[key, JSON.stringify({ round: 0, pts: {} })]]);
    const h = loadCareerMirrored({ disk, seed: [[key, JSON.stringify({ round: 1, pts: { "haas:0": 25 } }), false]] });
    h.SeasonCal.load();
    if (explicit) h.SeasonCal.applyConfig(h.SeasonCal.config());
    await h.store.mirror.ready;
    await h.store.mirrorFlush();
    assert.equal(JSON.parse(disk.get(key)).round, explicit ? 0 : 1);
    assert.equal(JSON.parse(h.idb.rows.get(key)).round, explicit ? 0 : 1);
  }
});

test("a stale deletion cannot remove a peer's newer mirror-only career", async () => {
  const quota = { on: true };
  const h = loadMirrored({ quota });
  await h.store.mirror.ready;
  h.store.write("career.driver.0", { money: 1 }); await h.store.mirrorFlush();
  h.idb.rows.set(careerKey, JSON.stringify({ money: 2 }));
  h.idb.lsOk.set(careerKey, false);
  quota.on = false;
  h.store.write("career.driver.0", null); await h.store.mirrorFlush();
  assert.equal(JSON.parse(h.idb.rows.get(careerKey)).money, 2);
  assert.equal(h.idb.lsOk.get(careerKey), false);
});


test("legacy slot migration cannot displace a newer current-layout mirror save", async () => {
  for (const legacy of ["apex26.career", "apex26.career.2"]) {
    const disk = new Map([[legacy, savedCareer(100)]]);
    const h = loadCareerMirrored({ disk, seed: [[careerKey, savedCareer(200), false]] });
    h.Career.load();
    assert.equal(h.Career.data().money, 100, "the synchronous load first migrates the legacy layout");
    assert.equal(JSON.parse(disk.get(legacy)), null, "the old key is retired after the copy succeeds");
    await h.store.mirror.ready;
    await h.store.mirrorFlush();
    assert.equal(h.Career.data().money, 200, legacy + ": recovery supersedes the automatic copy");
    assert.equal(JSON.parse(disk.get(careerKey)).money, 200);
    assert.equal(JSON.parse(h.idb.rows.get(careerKey)).money, 200);
    const next = loadCareerMirrored({ disk, idb: h.idb });
    next.Career.load(); await next.store.mirror.ready; await next.store.mirrorFlush();
    assert.equal(next.Career.data().money, 200, "another boot keeps the recovered save");
  }
});

// bug-hunt 1.7: write() stringified twice — once inside the try, once OUTSIDE it
// for the mirror — so a BigInt / cyclic value threw out of write() after the
// cache and `rev` had already moved.
test("write() stringifies once and survives a value JSON cannot encode (bug-hunt 1.7)", async () => {
  const { store, idb } = loadMirrored();
  await store.mirror.ready;
  let calls = 0;
  store.write("career.driver.0", { money: 1, toJSON() { calls++; return { money: 1 }; } });
  assert.equal(calls, 1, "one JSON.stringify per write, mirror key included");
  await store.mirrorFlush();
  assert.equal(JSON.parse(idb.rows.get("apex26.career.driver.0")).money, 1);

  const cyclic = { money: 2 }; cyclic.self = cyclic;
  const before = store.rev;
  let r;
  assert.doesNotThrow(() => { r = store.write("career.driver.0", cyclic); });
  assert.equal(r.ok, true);
  assert.equal(r.durable, false, "an unencodable value is a non-durable write, not an exception");
  assert.equal(store.rev, before + 1);
  assert.equal(store.get("career.driver.0").money, 2, "the session keeps the value");
  assert.equal(store.mirror.pending, 0, "nothing is queued for the mirror, least of all a delete tombstone");
  assert.doesNotThrow(() => store.write("career.driver.1", BigInt(5)));
  assert.equal(store.writeFailed() !== null, true);
});

// bug-hunt 1.7: onversionchange closed the IDB handle but mirrorOpen() kept
// resolving the memo to it, so every later flush failed its transaction.
test("a versionchange drops the memoised mirror handle so the next flush reopens (bug-hunt 1.7)", async () => {
  const base = fakeIndexedDb();
  let opens = 0, handle = null;
  const idb = { rows: base.rows, lsOk: base.lsOk, open() {
    opens++;
    const r = base.open();
    handle = r.result;
    return r;
  } };
  const { store } = loadMirrored({ idb });
  await store.mirror.ready;
  assert.equal(opens, 1);
  assert.equal(typeof handle.onversionchange, "function", "the module arms onversionchange on its handle");
  handle.onversionchange();
  store.set("career.driver.0", { money: 3 });
  await store.mirrorFlush();
  assert.equal(opens, 2, "the flush after a versionchange opens a fresh handle");
  assert.equal(JSON.parse(base.rows.get("apex26.career.driver.0")).money, 3);
});
