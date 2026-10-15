import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
const src = (file) => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");

// A transactional async fixture: readwrite transactions commit in creation
// order, requests can enqueue more work, and aborts never publish staged puts.
function database() {
  const dbs = new Map(); let failures = 0;
  return {
    dbs, failNext() { failures++; },
    open(name) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const stores = dbs.get(name); let tail = Promise.resolve();
      const db = {
        objectStoreNames: { contains: (s) => stores.has(s) },
        createObjectStore(s) { stores.set(s, new Map()); }, close() {},
        transaction(s, mode) {
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const operations = []; let active = false, busy = false, staged;
          const fail = mode === "readwrite" && failures > 0; if (fail) failures--;
          const finish = () => {
            if (operations.length || busy) { drain(); return; }
            if (fail) { if (tx.onabort) tx.onabort(); }
            else { if (mode === "readwrite") stores.set(s, staged); if (tx.oncomplete) tx.oncomplete(); }
            release();
          };
          const drain = () => {
            if (!active || busy) return; busy = true;
            queueMicrotask(() => {
              while (operations.length) { const [r, fn] = operations.shift(); r.result = fn(); if (r.onsuccess) r.onsuccess(); }
              busy = false; setImmediate(finish);
            });
          };
          function request(fn) { const r = { onsuccess: null, onerror: null }; operations.push([r, fn]); drain(); return r; }
          tx.objectStore = () => ({
            get: (k) => request(() => staged.get(k)),
            getAll: () => request(() => [...staged.values()]),
            put: (r) => request(() => { staged.set(r.k, structuredClone(r)); return r.k; }),
            delete: (k) => request(() => staged.delete(k)),
          });
          let release; const next = new Promise((r) => { release = r; });
          const prior = tail; tail = next;
          prior.then(() => { staged = new Map(stores.get(s) || []); active = true; drain(); });
          return tx;
        },
      };
      const r = { result: db }; queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); }); return r;
    },
  };
}
function boot({ idb = database(), initial = [] } = {}) {
  const disk = new Map(initial); let blocked = false;
  const storage = { get length() { return disk.size; }, key: (i) => [...disk.keys()][i], getItem: (k) => disk.get(k) ?? null,
    setItem(k, v) { if (blocked) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); disk.set(k, String(v)); }, removeItem: (k) => disk.delete(k) };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Promise, indexedDB: idb, localStorage: storage,
    Log: { info() {}, warn() {} }, Teams: { LIST: [] }, window: { addEventListener() {} } });
  seedSaveMigrate(c); vm.runInContext(src("js/core/store.js") + ";globalThis.store=GameStore.store", c);
  return { c, store: c.store, disk, storage, idb, block: (on) => { blocked = on; } };
}
const tick = () => new Promise((r) => setImmediate(r));

test("foreign writes, deletes and clear supersede failed JSON retry records", async () => {
  for (const op of ["write", "delete", "clear"]) {
    const h = boot(); await h.store.mirror.ready;
    h.block(true); h.store.write("setup.ferrari", { label: "old" }); h.store.write("other", "retry-me"); h.block(false);
    if (op === "write") h.disk.set("apex26.setup.ferrari", '{"label":"foreign"}'); else h.disk.delete("apex26.setup.ferrari");
    h.store.onForeignWrite({ key: op === "clear" ? null : "apex26.setup.ferrari", storageArea: h.storage });
    const r = h.store.retryFailed();
    assert.equal(r.retried, op === "clear" ? 0 : 1);
    assert.equal(h.storage.getItem("apex26.setup.ferrari"), op === "write" ? '{"label":"foreign"}' : null);
    await h.store.mirrorFlush();
  }
});
test("foreign ownership also prevents a queued garage mirror from replaying old data", async () => {
  const h = boot(); await h.store.mirror.ready;
  h.block(true); h.store.write("setup.ferrari", { n: 1 }); h.block(false);
  h.disk.set("apex26.setup.ferrari", '{"n":2}'); h.store.onForeignWrite({ key: "apex26.setup.ferrari", storageArea: h.storage });
  await h.store.mirrorFlush();
  const row = h.idb.dbs.get("apex26-store").get("kv").get("apex26.setup.ferrari");
  assert.equal(row.v, '{"n":2}');
  h.disk.clear(); h.store.onForeignWrite({ key: null, storageArea: h.storage }); await h.store.mirrorFlush();
  assert.equal(h.idb.dbs.get("apex26-store").get("kv").get("apex26.setup.ferrari").v, null);
  const next = boot({ idb: h.idb }); await next.store.mirror.ready;
  assert.equal(next.store.get("setup.ferrari", null), null);
});
test("garage mirror allowlist restores quota-refused work, including presets, but excludes credentials and caches", async () => {
  const h = boot(); await h.store.mirror.ready; h.block(true);
  for (const k of ["setup.ferrari", "setupPresets.ferrari", "parts.mercedes", "livery.custom.custom", "customLogo"]) h.store.write(k, { authored: true });
  h.store.write("spotifyToken", "secret"); h.store.write("api.test", "cache"); await h.store.mirrorFlush();
  const rows = h.idb.dbs.get("apex26-store").get("kv"); assert.equal(rows.size, 5);
  const next = boot({ idb: h.idb }); await next.store.mirror.ready;
  assert.equal(next.store.get("setupPresets.ferrari").authored, true);
  assert.equal(next.store.get("spotifyToken", null), null);
});
test("garage mirrors enforce item, aggregate and key-count limits in transactions", async () => {
  const h = boot(); await h.store.mirror.ready;
  h.store.write("customLogo", "x".repeat(270000));
  for (let i = 0; i < 5; i++) h.store.write("setup.team" + i, "x".repeat(240000));
  await h.store.mirrorFlush();
  assert.equal(h.store.mirror.skipped, 2); assert.ok(h.store.mirror.authoredBytes <= 2 * 1024 * 1024);
  const q = boot(); await q.store.mirror.ready;
  for (let i = 0; i < 100; i++) q.store.write("parts.t" + i, { n: i });
  await q.store.mirrorFlush(); assert.equal(q.store.mirror.authoredKeys, 96); assert.equal(q.store.mirror.skipped, 4);
});
test("authored mirror catches a foreign write even before its storage event arrives", async () => {
  const h = boot(); await h.store.mirror.ready;
  h.store.write("setup.ferrari", { n: 1 }); h.disk.set("apex26.setup.ferrari", '{"n":99}');
  await h.store.mirrorFlush(); assert.equal(h.idb.dbs.get("apex26-store").get("kv").has("apex26.setup.ferrari"), false);
});
function points(h, extra = {}) {
  vm.runInContext(src("js/career/restore-points.js") + ";globalThis.Points=CareerRestorePoints", h.c);
  return h.c.Points.create({ store: h.store, indexedDB: h.idb, localStorage: h.storage, ...extra });
}
const save = (round = 0, flavour = "driver") => ({ v: 2, flavour, year: 2026, team: flavour === "myteam" ? "custom" : "haas", money: 100 + round, season: { round, pts: {}, teamPts: {}, results: [] } });
test("restore history is bounded per slot, captures only explicit boundaries and never fills primary storage", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h); const before = h.disk.size;
  assert.equal((await p.capture("driver", 0, save(), { reason: "autosave" })).ok, false);
  for (let r = 0; r < 5; r++) assert.equal((await p.capture("driver", 0, save(r), { reason: "round" })).durable, true);
  await p.capture("myteam", 1, save(9, "myteam"), { reason: "import" });
  assert.deepEqual(Array.from((await p.list("driver", 0)).items, (x) => x.summary.round), [4, 3, 2]);
  assert.equal((await p.list("myteam", 1)).items.length, 1); assert.equal(h.disk.size, before);
  assert.equal((await p.capture("driver", 0, { ...save(), large: "x".repeat(70000) }, { reason: "round" })).ok, false);
  assert.equal((await p.capture("driver", 0, { ...save(), v: 999 }, { reason: "round" })).ok, false);
});
test("restore preview requires its own token and refuses changed raw disk or revision", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  await p.capture("driver", 0, save(1), { reason: "round" }); const id = (await p.list("driver", 0)).items[0].id;
  h.store.write("career.driver.0", save(5));
  assert.equal((await p.restore({ ok: true })).reason, "preview-required");
  let token = await p.preview("driver", 0, id); h.store.write("career.driver.0", save(6));
  assert.equal((await p.restore(token)).reason, "slot-changed");
  token = await p.preview("driver", 0, id); h.disk.set("apex26.career.driver.0", JSON.stringify(save(7)));
  assert.equal((await p.restore(token)).reason, "slot-changed");
  assert.equal(JSON.parse(h.disk.get("apex26.career.driver.0")).season.round, 7); await h.store.mirrorFlush();
});
test("confirmed restore saves a replacement checkpoint and the selected progress, with no active-career overwrite", async () => {
  const h = boot(); await h.store.mirror.ready; let engaged = false; const p = points(h, { inCareer: () => engaged });
  await p.capture("driver", 0, save(1), { reason: "round" }); const id = (await p.list("driver", 0)).items[0].id;
  h.store.write("career.driver.0", save(5)); const token = await p.preview("driver", 0, id);
  engaged = true; assert.equal((await p.restore(token)).reason, "leave-career-first"); engaged = false;
  const r = await p.restore(await p.preview("driver", 0, id)); assert.equal(r.ok, true); assert.equal(r.durable, true);
  assert.equal(h.store.get("career.driver.0").season.round, 1);
  assert.ok((await p.list("driver", 0)).items.some((x) => x.summary.round === 5 && x.reason === "before-restore")); await h.store.mirrorFlush();
});
test("history transaction abort leaves prior points intact and reports unavailable history", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  await p.capture("driver", 0, save(1), { reason: "round" }); h.idb.failNext();
  assert.equal((await p.capture("driver", 0, save(2), { reason: "round" })).durable, false);
  assert.equal((await p.list("driver", 0)).items[0].summary.round, 1);
});
test("storage health reports measured categories; cleanup preserves every authored key and failed save", async () => {
  const h = boot(); await h.store.mirror.ready;
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c);
  h.block(true); h.store.write("unrelated", "unsaved"); h.block(false);
  for (const k of ["api.one", "realrace.two", "setup.ferrari", "career.driver.0", "ghost.monza", "customTracks", "customTeam"]) h.disk.set("apex26." + k, "xx");
  const o = { store: h.store, localStorage: h.storage, storage: { estimate: async () => ({ usage: 2000, quota: 10000 }) } };
  const r = await h.c.Health.inspect(o); assert.equal(r.estimate.usage, 2000); assert.equal(r.failed.length, 1);
  assert.ok(r.categories.some((x) => x.name === "Authored circuits"));
  const cleanup = h.c.Health.cleanup(o); assert.equal(cleanup.removed, 2); assert.equal(cleanup.ok, true);
  for (const k of ["setup.ferrari", "career.driver.0", "ghost.monza", "customTracks", "customTeam"]) assert.equal(h.disk.get("apex26." + k), "xx");
  assert.equal(h.store.writeFailed(), "QuotaExceededError");
});
test("native emergency export awaits acknowledgement, refuses re-entry and shows a visible failure", async () => {
  const dom = makeDom(), notes = []; let complete, reject, calls = 0;
  const native = { viable: () => true, saveBlob: () => { calls++; return new Promise((r, j) => { complete = r; reject = j; }); } };
  const G = { announce: (x) => notes.push(x), season: null }, store = { broken: "QuotaExceededError" };
  const c = vm.createContext({ Blob, Date, URL, document: dom.document, window: {}, G, store, NativeDownload: native,
    $: (id) => dom.byId(id), writeFailed: () => store.broken, Log: { warn() {} },
    saveWarning: dom.byId("save-warning"), saveWarningDetail: dom.byId("save-warning-detail"), setTimeout });
  const text = src("js/ui/select-screen.js"), start = text.indexOf("let recoveryExportBusy ="), end = text.indexOf('if ($("save-retry"))', start);
  vm.runInContext(text.slice(start, end) + ";globalThis.exportRecovery=exportRecovery", c);
  const first = c.exportRecovery(); assert.equal(notes.length, 0); assert.equal(dom.byId("save-export").disabled, true);
  assert.equal(await c.exportRecovery(), false); assert.equal(calls, 1); reject(Error("disk full"));
  assert.equal(await first, false); assert.match(notes.at(-1), /FAILED/); assert.match(dom.byId("save-warning-detail").textContent, /failed/);
  notes.length = 0; const second = c.exportRecovery(); complete({ ok: true }); assert.equal(await second, true);
  assert.deepEqual(notes, ["RECOVERY SHARED"]); assert.equal(dom.byId("save-export").disabled, false);
});

test("storage-health UI does no measurements or prompts until opened, and remains operable", async () => {
  const dom = makeDom(); let estimates = 0, prompts = 0;
  const h = boot(); await h.store.mirror.ready;
  h.c.document = dom.document; h.c.navigator = { storage: { estimate: async () => { estimates++; return { usage: 10, quota: 100 }; }, persist: () => { prompts++; } } };
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c);
  const host = dom.byId("test-health-host"), handle = h.c.Health.mount(host, { store: h.store });
  assert.equal(estimates, 0); assert.equal(prompts, 0);
  const toggle = handle.root.children[0], panel = handle.root.children[1];
  assert.equal(panel.hidden, true); toggle.onclick(); await tick();
  assert.equal(panel.hidden, false); assert.equal(estimates, 1); assert.equal(prompts, 0);
  assert.equal(toggle.getAttribute("aria-expanded"), "true"); toggle.onclick(); assert.equal(panel.hidden, true);
});
test("history unavailable and active-career preview are explicit refusals", async () => {
  const h = boot(); await h.store.mirror.ready;
  const p = points(h, { indexedDB: { open() { throw Error("blocked"); } } });
  assert.equal((await p.capture("driver", 0, save(), { reason: "round" })).reason, "history-unavailable");
  const active = h.c.Points.create({ store: h.store, indexedDB: h.idb, localStorage: h.storage, inCareer: () => true });
  assert.equal((await active.preview("driver", 0, "unknown")).reason, "leave-career-first");
});


test("engaging a career while pre-restore history commits cannot overwrite the active slot", async () => {
  const h = boot(); await h.store.mirror.ready; let engaged = false;
  const p = points(h, { inCareer: () => engaged });
  await p.capture("driver", 0, save(1), { reason: "round" });
  const id = (await p.list("driver", 0)).items[0].id;
  h.store.write("career.driver.0", save(5));
  const token = await p.preview("driver", 0, id);
  const pending = p.restore(token); // awaits the before-restore IndexedDB commit
  engaged = true;
  const result = await pending;
  assert.equal(result.reason, "leave-career-first");
  assert.equal(result.ok, false);
  assert.equal(h.store.get("career.driver.0").season.round, 5);
  assert.equal(JSON.parse(h.disk.get("apex26.career.driver.0")).season.round, 5);
  await h.store.mirrorFlush();
});


test("failed authored mirror cannot replace a newer primary after restart before its writer flushed", async () => {
  const h = boot({ initial: [["apex26.setup.ferrari", '{"n":0}']] }); await h.store.mirror.ready;
  h.block(true); h.store.write("setup.ferrari", { n: 1 }); await h.store.mirrorFlush(); h.block(false);
  const rows = h.idb.dbs.get("apex26-store").get("kv");
  assert.equal(rows.get("apex26.setup.ferrari").baseline, '{"n":0}');
  const fresh = boot({ idb: h.idb, initial: [["apex26.setup.ferrari", '{"n":2}']] });
  await fresh.store.mirror.ready;
  assert.equal(fresh.store.get("setup.ferrari").n, 2);
  assert.equal(fresh.disk.get("apex26.setup.ferrari"), '{"n":2}');
});
test("failed authored mirror still heals its exact failure baseline and a missing primary", async () => {
  for (const present of ['{"n":0}', null]) {
    const h = boot({ initial: [["apex26.setup.ferrari", '{"n":0}']] }); await h.store.mirror.ready;
    h.block(true); h.store.write("setup.ferrari", { n: 1 }); await h.store.mirrorFlush();
    const fresh = boot({ idb: h.idb, initial: present === null ? [] : [["apex26.setup.ferrari", present]] });
    await fresh.store.mirror.ready; assert.equal(fresh.store.get("setup.ferrari").n, 1); await fresh.store.mirrorFlush();
  }
});
test("legacy failed authored rows without a persisted baseline preserve an existing primary", async () => {
  const h = boot(); await h.store.mirror.ready;
  h.idb.dbs.get("apex26-store").get("kv").set("apex26.setup.ferrari", { k: "apex26.setup.ferrari", v: '{"n":1}', lsOk: false });
  const fresh = boot({ idb: h.idb, initial: [["apex26.setup.ferrari", '{"n":2}']] }); await fresh.store.mirror.ready;
  assert.equal(fresh.store.get("setup.ferrari").n, 2);
});

test('capture health is per-slot, bounded, separate from primary durability and clears on success', async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  assert.equal(h.store.write('career.driver.0', save(1)).durable, true);
  h.idb.failNext();
  assert.equal((await p.capture('driver', 0, save(1), { reason: 'round' })).ok, false);
  assert.equal(p.health()[0].state, 'unavailable'); assert.equal(p.health()[0].reason, 'history-write-failed');
  assert.equal(h.store.failedKeys().length, 0, 'history failure does not invent primary save failure');
  await p.capture('myteam', 1, save(2, 'myteam'), { reason: 'round' });
  assert.equal(p.health().find(r => r.flavour === 'myteam').state, 'saved');
  await p.capture('driver', 0, { ...save(3), huge: 'x'.repeat(70000) }, { reason: 'round' });
  assert.equal(p.health().find(r => r.flavour === 'driver').reason, 'invalid-or-too-large');
  await p.capture('driver', 0, save(4), { reason: 'round' });
  const status = p.health().find(r => r.flavour === 'driver'); assert.equal(status.state, 'saved'); assert.equal(status.reason, null);
  status.state = 'corrupt'; assert.equal(p.health().find(r => r.flavour === 'driver').state, 'saved', 'status returns a detached snapshot');
  for (let i = 0; i < 20; i++) await p.capture('driver', 999 + i, save(), { reason: 'round' });
  assert.equal(p.health().length, 2, 'invalid keys cannot expand health storage');
  vm.runInContext(src('js/ui/save-health.js') + ';globalThis.Health=SaveHealth', h.c);
  const report = await h.c.Health.inspect({ store: h.store, localStorage: h.storage, restorePoints: p });
  assert.equal(report.history.length, 2); assert.equal(report.failed.length, 0);
  await h.store.mirrorFlush();
});

test('older capture completion cannot overwrite newer failure health, and UI labels history independently', async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  const older = p.capture('driver', 0, save(1), { reason: 'round' });
  await p.capture('driver', 0, { ...save(2), huge: 'x'.repeat(70000) }, { reason: 'round' });
  await older;
  assert.equal(p.health()[0].reason, 'invalid-or-too-large');
  const dom = makeDom(); h.c.document = dom.document;
  vm.runInContext(src('js/ui/save-health.js') + ';globalThis.Health=SaveHealth', h.c);
  const handle = h.c.Health.mount(dom.byId('health-history-owner'), { store: h.store, restorePoints: p });
  handle.root.children[0].onclick(); await tick();
  const text = n => n.textContent + [...(n.children || [])].map(text).join(' ');
  assert.match(text(handle.root), /restore point unavailable \(invalid-or-too-large\)/);
  assert.match(text(handle.root), /Primary save status is separate/);
  assert.match(text(handle.root), /No failed primary writes/);
});
