import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
const src = (file) => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");

// A transactional async fixture: readwrite transactions commit in creation
// order, requests can enqueue more work, and aborts never publish staged puts.
function database() {
  const dbs = new Map(), handles = []; let failures = 0;
  return {
    dbs, handles, failNext() { failures++; },
    open(name) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const stores = dbs.get(name); let tail = Promise.resolve();
      let closed = false;
      const db = {
        objectStoreNames: { contains: (s) => stores.has(s) },
        createObjectStore(s) { stores.set(s, new Map()); }, close() { closed = true; },
        forceClose(notify = true) { closed = true; if (notify && db.onclose) db.onclose(); },
        transaction(s, mode) {
          if (closed) throw Object.assign(Error("closed"), { name: "InvalidStateError" });
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
      handles.push(db);
      const r = { result: db }; queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); }); return r;
    },
  };
}
function boot({ idb = database(), initial = [], disk = new Map(initial), navigator } = {}) {
  let blocked = false;
  const storage = { get length() { return disk.size; }, key: (i) => [...disk.keys()][i], getItem: (k) => disk.get(k) ?? null,
    setItem(k, v) { if (blocked) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); disk.set(k, String(v)); }, removeItem: (k) => disk.delete(k) };
  const c = vm.createContext({ console, setTimeout, clearTimeout, Promise, navigator, indexedDB: idb, localStorage: storage,
    Log: { info() {}, warn() {} }, Teams: { LIST: [] }, window: { addEventListener() {} } });
  seedSaveMigrate(c); vm.runInContext(src("js/core/store.js") + ";globalThis.store=GameStore.store", c, { filename: absSrc("js/core/store.js") });
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
  vm.runInContext(src("js/career/team-identity.js"), h.c, { filename: absSrc("js/career/team-identity.js") });
  vm.runInContext(src("js/career/restore-points.js") + ";globalThis.Points=CareerRestorePoints", h.c, { filename: absSrc("js/career/restore-points.js") });
  return h.c.Points.create({ store: h.store, indexedDB: h.idb, localStorage: h.storage, ...extra });
}
const save = (round = 0, flavour = "driver") => ({ v: 1, flavour, year: 2026, team: flavour === "myteam" ? "custom" : "haas", money: 100 + round, season: { round, pts: {}, teamPts: {}, results: [] } });
test("storage health and lazy restore history survive denied getters and recover without reload", async () => {
  const h = boot(); await h.store.mirror.ready;
  vm.runInContext(src("js/career/restore-points.js") + ";globalThis.Points=CareerRestorePoints", h.c, { filename: absSrc("js/career/restore-points.js") });
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c, { filename: absSrc("js/ui/save-health.js") });
  let denied = true;
  for (const [key, value] of [["indexedDB", h.idb], ["localStorage", h.storage]]) {
    Object.defineProperty(h.c, key, { configurable: true, get() {
      if (denied) throw Object.assign(new Error("Denied"), { name: "SecurityError" });
      return value;
    } });
  }
  assert.equal((await h.c.Health.inspect()).ok, false, "real lazy history must not escape the report's storage guard");
  assert.equal((await h.c.Points.list("driver", 0)).ok, false);
  denied = false;
  assert.equal((await h.c.Health.inspect()).ok, true);
  assert.equal((await h.c.Points.capture("driver", 0, save(1), { reason: "round" })).durable, true);
  const id = (await h.c.Points.list("driver", 0)).items[0].id;
  h.store.write("career.driver.0", save(5));
  denied = true;
  assert.equal((await h.c.Points.preview("driver", 0, id)).reason, "storage-unavailable");
  denied = false;
  const token = await h.c.Points.preview("driver", 0, id);
  assert.equal(token.ok, true);
  assert.equal((await h.c.Points.restore(token)).ok, true);
  assert.equal(h.store.get("career.driver.0").season.round, 1);
});
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
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c, { filename: absSrc("js/ui/save-health.js") });
  h.block(true); h.store.write("unrelated", "unsaved"); h.block(false);
  for (const k of ["api.one", "realrace.two", "setup.ferrari", "career.driver.0", "ghost.monza", "customTracks", "customTeam"]) h.disk.set("apex26." + k, "xx");
  const o = { store: h.store, localStorage: h.storage, storage: { estimate: async () => ({ usage: 2000, quota: 10000 }) } };
  const r = await h.c.Health.inspect(o); assert.equal(r.estimate.usage, 2000); assert.equal(r.failed.length, 1);
  assert.ok(r.categories.some((x) => x.name === "Authored circuits"));
  const cleanup = h.c.Health.cleanup(o); assert.equal(cleanup.removed, 2); assert.equal(cleanup.ok, true);
  for (const k of ["setup.ferrari", "career.driver.0", "ghost.monza", "customTracks", "customTeam"]) assert.equal(h.disk.get("apex26." + k), "xx");
  assert.equal(h.store.writeFailed(), "QuotaExceededError");
});
test("storage-health UI does no measurements or prompts until opened, and remains operable", async () => {
  const dom = makeDom(); let estimates = 0, prompts = 0;
  const h = boot(); await h.store.mirror.ready;
  h.c.document = dom.document; h.c.navigator = { storage: { estimate: async () => { estimates++; return { usage: 10, quota: 100 }; }, persist: () => { prompts++; } } };
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c, { filename: absSrc("js/ui/save-health.js") });
  const host = dom.byId("test-health-host"), handle = h.c.Health.mount(host, { store: h.store });
  assert.equal(estimates, 0); assert.equal(prompts, 0);
  const toggle = handle.root.children[0], panel = handle.root.children[1];
  assert.equal(panel.hidden, true); toggle.onclick(); await tick();
  assert.equal(panel.hidden, false); assert.equal(estimates, 1); assert.equal(prompts, 0);
  assert.equal(toggle.getAttribute("aria-expanded"), "true"); toggle.onclick(); assert.equal(panel.hidden, true);
});
test("storage health tolerates denied storage getters and keeps report and cleanup controls usable", async () => {
  const h = boot(); await h.store.mirror.ready;
  const dom = makeDom(); h.c.document = dom.document;
  vm.runInContext(`
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Object.assign(new Error("denied"), { name: "SecurityError" }); } });
    globalThis.navigator = {};
    Object.defineProperty(navigator, "storage", { get() { throw Object.assign(new Error("denied"), { name: "SecurityError" }); } });
  `, h.c);
  vm.runInContext(src("js/ui/save-health.js") + ";globalThis.Health=SaveHealth", h.c, { filename: absSrc("js/ui/save-health.js") });
  const report = await h.c.Health.inspect();
  assert.equal(report.ok, false); assert.equal(report.reason, "local-storage-unavailable");
  assert.equal(report.estimateUnavailable, true);
  assert.equal(h.c.Health.cleanup().ok, false);
  const handle = h.c.Health.mount(dom.byId("health-denied-storage"), { store: h.store });
  const panel = handle.root.children[1], status = panel.children[0], refresh = panel.children[2], clear = panel.children[3];
  await handle.refresh(); assert.equal(refresh.disabled, false);
  assert.ok(panel.children[1].children[0].textContent.includes("could not be read"));
  await clear.onclick(); assert.equal(clear.disabled, false); assert.equal(refresh.disabled, false);
  assert.equal(status.textContent.includes("could not be removed"), true);
  // A failure in a health provider must not strand the buttons either.
  const failing = h.c.Health.mount(dom.byId("health-failing-history"), { store: h.store, restorePoints: { health() { throw Error("history unavailable"); } } });
  const fp = failing.root.children[1]; await failing.refresh();
  assert.equal(fp.children[2].disabled, false); assert.ok(fp.children[0].textContent.includes("report is unavailable"));
  await fp.children[3].onclick(); assert.equal(fp.children[3].disabled, false);
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
  vm.runInContext(src('js/ui/save-health.js') + ';globalThis.Health=SaveHealth', h.c, { filename: absSrc("js/ui/save-health.js") });
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
  vm.runInContext(src('js/ui/save-health.js') + ';globalThis.Health=SaveHealth', h.c, { filename: absSrc("js/ui/save-health.js") });
  const handle = h.c.Health.mount(dom.byId('health-history-owner'), { store: h.store, restorePoints: p });
  handle.root.children[0].onclick(); await tick();
  const text = n => n.textContent + [...(n.children || [])].map(text).join(' ');
  assert.match(text(handle.root), /restore point unavailable \(invalid-or-too-large\)/);
  assert.match(text(handle.root), /Primary save status is separate/);
  assert.match(text(handle.root), /No failed primary writes/);
});


function career(h) {
  h.c.Teams = { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], isReal: (t) => t.id !== "custom",
    LIST: [{ id: "haas", tier: 4, stats: {}, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] }] };
  h.c.Tracks = { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 };
  h.c.Parts = { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0 };
  for (const file of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js", "js/career/career-planning.js", "js/career/career.js"])
    vm.runInContext(src(file), h.c, { filename: absSrc(file) });
  return vm.runInContext("Career", h.c);
}
test("refused calendar adoption cannot enter the mirror or remove scored progress after recovery and reload", async () => {
  for (const ids of [["a", "gone"], ["gone"]]) {
    const key = "apex26.career.driver.0", original = save(1);
    original.season.calIds = ids; original.season.pts = { "haas:0": 25 };
    original.season.finishes = { "haas:0": [1] }; original.results = [{ r: 0, p: 1, pts: 25 }];
    const raw = JSON.stringify(original, null, 2);
    const h = boot({ initial: [[key, raw]] }); await h.store.mirror.ready;
    const c = career(h);
    // Establish the original checkpoint so recovery from a missing primary
    // proves the scored save survives, as well as protecting an existing primary.
    h.store.write("career.driver.0", original); await h.store.mirrorFlush();
    h.disk.set(key, raw); c.load();
    h.block(true); assert.equal(c.planning().adopt(), false); await h.store.mirrorFlush();
    const row = h.idb.dbs.get("apex26-store").get("kv").get(key);
    assert.deepEqual(JSON.parse(row.v), original); assert.equal(row.lsOk, true);
    assert.deepEqual(Array.from(h.store.get("career.driver.0").season.calIds), ids);
    h.block(false); assert.equal(h.store.retryFailed().retried, 0); assert.equal(h.disk.get(key), raw);
    for (const initial of [[[key, raw]], []]) {
      const fresh = boot({ idb: h.idb, initial }); await fresh.store.mirror.ready;
      const reloaded = career(fresh); reloaded.load();
      assert.deepEqual(Array.from(reloaded.data().season.calIds), ids);
      assert.equal(reloaded.data().results.length, 1); assert.equal(reloaded.data().season.pts["haas:0"], 25);
      assert.deepEqual(Array.from(reloaded.data().season.finishes["haas:0"]), [1]);
      assert.equal(reloaded.conflicted(), true); await fresh.store.mirrorFlush();
    }
  }
});
test("ordinary quota-refused career saves keep session progress, retry and mirror recovery", async () => {
  const h = boot(); await h.store.mirror.ready; const c = career(h);
  h.store.write("career.driver.0", save()); c.load(); h.block(true);
  c.data().money = 876; c.save();
  assert.equal(c.saveStatus().ok, true); assert.equal(c.saveStatus().durable, false);
  assert.equal(h.store.get("career.driver.0").money, 876);
  assert.ok(h.store.failedKeys().some((r) => r.key === "career.driver.0")); await h.store.mirrorFlush();
  const fresh = boot({ idb: h.idb, initial: [...h.disk] }); await fresh.store.mirror.ready;
  assert.equal(fresh.store.get("career.driver.0").money, 876);
  h.block(false); assert.equal(h.store.retryFailed().durable, true);
  assert.equal(JSON.parse(h.disk.get("apex26.career.driver.0")).money, 876); await h.store.mirrorFlush();
});
test("supported MY TEAM emblems retain round history and before-restore undo at the identity size limit", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  const old = save(1, "myteam"), latest = save(5, "myteam");
  const prefix = "data:image/png;base64,", logo = prefix + "A".repeat(400000 - prefix.length);
  latest.myTeamIdentity = { customLogo: logo, "livery.custom": "my-paint" };
  assert.equal(vm.runInContext("CareerTeamIdentity.value", h.c)("customLogo", logo), logo);
  assert.equal((await p.capture("myteam", 0, old, { reason: "round" })).durable, true);
  const oldId = (await p.list("myteam", 0)).items[0].id;
  assert.equal((await p.capture("myteam", 0, latest, { reason: "round" })).durable, true);
  const latestId = (await p.list("myteam", 0)).items[0].id;
  h.store.write("career.myteam.0", latest);
  assert.equal((await p.restore(await p.preview("myteam", 0, oldId))).durable, true);
  assert.equal(h.store.get("career.myteam.0").season.round, 1);
  const latestPoint = (await p.list("myteam", 0)).items.find((r) => r.id === latestId);
  assert.equal(latestPoint.summary.round, 5);
  assert.ok(latestPoint.bytes > p.limits.progressBytes); assert.ok(latestPoint.bytes <= p.limits.snapshotBytes);
  assert.equal((await p.restore(await p.preview("myteam", 0, latestId))).durable, true);
  assert.equal(h.store.get("career.myteam.0").myTeamIdentity.customLogo, logo);
  assert.equal(h.store.get("career.myteam.0").myTeamIdentity["livery.custom"], "my-paint");
  assert.equal(p.limits.totalBytes, p.limits.perSlot * p.limits.snapshotBytes * 6);
  await h.store.mirrorFlush();
});
test("restoring an older MY TEAM point captures a large current emblem even without a prior large point", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  await p.capture("myteam", 0, save(1, "myteam"), { reason: "round" });
  const id = (await p.list("myteam", 0)).items[0].id;
  const current = { ...save(5, "myteam"), myTeamIdentity: { customLogo: "data:image/png;base64," + "A".repeat(70000) } };
  h.store.write("career.myteam.0", current);
  assert.equal((await p.restore(await p.preview("myteam", 0, id))).durable, true);
  const undo = (await p.list("myteam", 0)).items.find((r) => r.reason === "before-restore");
  assert.equal(undo.summary.round, 5);
  assert.equal((await p.restore(await p.preview("myteam", 0, undo.id))).durable, true);
  assert.equal(h.store.get("career.myteam.0").myTeamIdentity.customLogo, current.myTeamIdentity.customLogo);
  await h.store.mirrorFlush();
});
test("history identity allowance rejects invalid or excessive emblems and preserves the progress budget", async () => {
  const h = boot(); await h.store.mirror.ready; const p = points(h);
  const prefix = "data:image/png;base64,", valid = prefix + "A".repeat(70000);
  for (const data of [
    { ...save(0, "myteam"), myTeamIdentity: { customLogo: "x".repeat(70000) } },
    { ...save(0, "myteam"), myTeamIdentity: { customLogo: prefix + "A".repeat(400000) } },
    { ...save(0, "myteam"), myTeamIdentity: { customLogo: valid }, huge: "x".repeat(70000) },
    { ...save(), myTeamIdentity: { customLogo: valid } },
  ]) {
    assert.equal((await p.capture(data.flavour, 0, data, { reason: "round" })).reason, "invalid-or-too-large");
    assert.equal((await p.list(data.flavour, 0)).items.length, 0);
  }
});

test("mirror reopens after unexpected close or an InvalidStateError without losing a quota-refused batch", async () => {
  for (const notify of [true, false]) {
    const h = boot(); await h.store.mirror.ready;
    const old = h.idb.handles[0];
    old.forceClose(notify);
    if (notify) assert.equal(h.store.mirror.supported, false);
    h.block(true); h.store.write("career.driver.0", save(8));
    if (!notify) {
      assert.equal(await h.store.mirrorFlush(), false);
      assert.equal(h.store.mirror.pending, 1, "failed transaction retains its batch");
      assert.equal(h.store.mirror.supported, false);
    }
    assert.equal(await h.store.mirrorFlush(), true);
    assert.equal(h.idb.handles.length, 2, "closed handles are never reused");
    assert.equal(h.store.mirror.pending, 0);
    const row = h.idb.dbs.get("apex26-store").get("kv").get("apex26.career.driver.0");
    assert.equal(JSON.parse(row.v).season.round, 8);
    assert.equal(row.lsOk, false);
    old.onclose();
    assert.equal(h.store.mirror.supported, true, "a late event from the old handle cannot poison its replacement");
  }
});

test("a non-owning tab cannot restore, mirror, retry, import or checkpoint career saves", async () => {
  const idb = database(), disk = new Map([["apex26.career.driver.0", JSON.stringify(save(1))]]);
  const owner = boot({ idb, disk, navigator: { locks: { request: (_n, _o, cb) => Promise.resolve().then(() => cb({})) } } });
  await owner.store.mirror.ready;
  owner.block(true); owner.store.write("career.driver.0", save(9));
  await owner.store.mirrorFlush();
  const viewer = boot({ idb, disk, navigator: { locks: { request: (_n, _o, cb) => Promise.resolve().then(() => cb(null)) } } });
  await viewer.store.mirror.ready;
  assert.equal(viewer.store.careerWriter.state, "busy");
  assert.equal(JSON.parse(disk.get("apex26.career.driver.0")).season.round, 1, "viewer restore never publishes primary bytes");
  viewer.store.onForeignWrite({ key: "apex26.career.driver.0", storageArea: viewer.storage });
  assert.equal(await viewer.store.mirrorFlush(), false, "storage events cannot mirror stale career bytes from a viewer");
  assert.equal((await points(viewer).capture("driver", 0, save(2), { reason: "round" })).reason, "writer-busy");
  vm.runInContext(src("js/career/career-backup.js") + ";globalThis.backup=CareerBackup", viewer.c, { filename: absSrc("js/career/career-backup.js") });
  assert.equal(viewer.c.backup.writeSlot("driver", 0, save(2)).reason, "writer-busy");
  assert.equal(viewer.c.backup.wipeAllSlots().reason, "writer-busy");
  assert.equal(viewer.store.write("career.driver.0", save(3)).reason, "writer-busy");
  assert.equal(viewer.store.retryFailed().retried, 0);
  const row = idb.dbs.get("apex26-store").get("kv").get("apex26.career.driver.0");
  assert.equal(JSON.parse(row.v).season.round, 9, "quota-refused owner's durable mirror is preserved");
});

test("SAVE RETRY heals unrelated settings in a read-only career tab and still retries the owning career", async () => {
  const source = src("js/ui/select-screen.js");
  const begin = source.indexOf("const retrySave = () => {");
  const end = source.indexOf("let recoveryExporting", begin);
  assert.ok(begin >= 0 && end > begin);
  for (const owns of [false, true]) {
    const h = boot({ navigator: { locks: { request: (_n, _o, cb) => Promise.resolve().then(() => cb(owns ? {} : null)) } } });
    await h.store.mirror.ready;
    const notices = [], warnings = []; let careerSaves = 0, hidden = 0, result;
    const career = save(2);
    h.c.Career = {
      data: () => career, inCareer: () => owns,
      save() { careerSaves++; result = h.store.write("career.driver.0", career); },
      saveStatus: () => result,
    };
    h.c.G = { season: null, announce: message => notices.push(message) };
    h.c.hideSaveWarning = () => { hidden++; };
    h.c.showSaveWarning = reason => warnings.push(reason);
    vm.runInContext(source.slice(begin, end) + ";globalThis.retrySaveAction=retrySave", h.c, { filename: absSrc("js/ui/select-screen.js") });
    h.block(true); h.store.write("volume", 0.25);
    if (owns) h.c.Career.save();
    h.block(false); h.c.retrySaveAction();
    assert.equal(careerSaves, owns ? 2 : 0, "intentional career read-only state is not a failed save retry");
    assert.equal(h.storage.getItem("apex26.volume"), "0.25");
    if (owns) assert.equal(JSON.parse(h.storage.getItem("apex26.career.driver.0")).season.round, 2);
    assert.equal(hidden, 1);
    assert.deepEqual(warnings, []);
    assert.deepEqual(notices, ["SAVE RESTORED"]);
    assert.equal(h.store.writeFailed(), null);
    await h.store.mirrorFlush();
  }
});
