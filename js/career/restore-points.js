/* CareerRestorePoints — bounded local history at explicit round/import boundaries.
   This is local storage, not an off-device backup; clearing site data removes it. */
const CareerRestorePoints = (function () {
  "use strict";
  const LIMIT = 3, SNAPSHOT_BYTES = 128 * 1024, OPEN_MS = 4000;
  const SLOT_RE = /^(driver|myteam)\.[0-2]$/;
  function create(opts) {
    opts = opts || {};
    const store = opts.store || (typeof GameStore !== "undefined" && GameStore.store);
    const idb = opts.indexedDB || (typeof indexedDB !== "undefined" && indexedDB);
    const disk = opts.localStorage || (typeof localStorage !== "undefined" && localStorage);
    const now = opts.now || (() => Date.now());
    const previews = new WeakMap();
    let opening = null, sequence = 0;
    const captureHealth = new Map(), captureOwners = new Map();
    function health() {
      return [...captureHealth].map(([key, value]) => Object.assign({ flavour: key.split(".")[0], slot: +key.split(".")[1] }, value));
    }
    function slotKey(flavour, i) { const key = flavour + "." + i; return SLOT_RE.test(key) ? key : null; }
    function refused(reason) { return { ok: false, durable: false, reason }; }
    function open() {
      if (opening) return opening;
      if (!idb) return Promise.resolve(null);
      opening = new Promise((resolve) => {
        let settled = false, timer = null;
        const finish = (db) => {
          if (settled) { if (db) { try { db.close(); } catch (_) { /* late handle */ } } return; }
          settled = true; if (timer !== null) clearTimeout(timer);
          if (db) db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
        try {
          const r = idb.open("apex26-restore-points", 1);
          r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("slots")) r.result.createObjectStore("slots", { keyPath: "k" }); };
          r.onsuccess = () => finish(r.result);
          r.onerror = r.onblocked = () => finish(null);
          timer = setTimeout(() => finish(null), OPEN_MS);
        } catch (_) { finish(null); }
      }).then((db) => { if (!db) opening = null; return db; });
      return opening;
    }
    function clean(data, flavour) {
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      try {
        const raw = JSON.stringify(data);
        if (raw.length * 2 > SNAPSHOT_BYTES) return null;
        const copy = JSON.parse(raw);
        if (!Number.isSafeInteger(copy.v) || copy.v < 0 ||
            (typeof SaveMigrate !== "undefined" && copy.v > SaveMigrate.CAREER_V) ||
            (copy.flavour && copy.flavour !== flavour)) return null;
        const migrated = typeof SaveMigrate !== "undefined" ? SaveMigrate.migrateCareer(copy) : null;
        if (!migrated || migrated.flavour !== flavour) return null;
        const json = JSON.stringify(migrated);
        return json.length * 2 <= SNAPSHOT_BYTES ? json : null;
      } catch (_) { return null; }
    }
    function summary(json) {
      const d = JSON.parse(json), season = d.season || {};
      return { year: d.year, round: Number.isInteger(season.round) ? season.round : 0,
        team: typeof d.team === "string" ? d.team.slice(0, 64) : "", money: Number(d.money) || 0 };
    }
    async function capture(flavour, i, data, options) {
      const key = slotKey(flavour, i), json = key && clean(data, flavour);
      if (!key) return refused("invalid-or-too-large");
      const reason = options && options.reason;
      if (!["round", "import", "before-import", "before-restore"].includes(reason)) return refused("explicit-boundary-required");
      const owner = (captureOwners.get(key) || 0) + 1; captureOwners.set(key, owner);
      captureHealth.set(key, { state: "saving", at: now(), boundary: reason, reason: null });
      const finish = (result) => {
        if (captureOwners.get(key) === owner) captureHealth.set(key, {
          state: result.ok && result.durable ? "saved" : "unavailable", at: now(), boundary: reason, reason: result.reason || null,
        });
        return result;
      };
      if (!json) return finish(refused("invalid-or-too-large"));
      const db = await open(); if (!db) return finish(refused("history-unavailable"));
      return new Promise((resolve) => {
        let tx, result = null;
        try {
          tx = db.transaction("slots", "readwrite"); const os = tx.objectStore("slots"), req = os.get(key);
          req.onsuccess = () => {
            const items = validItems(req.result && req.result.items, flavour);
            if (items[0] && items[0].json === json) { result = { ok: true, durable: true, id: items[0].id, duplicate: true }; return; }
            const at = now(), id = at.toString(36) + "-" + (++sequence).toString(36) + "-" + Math.random().toString(36).slice(2, 8);
            items.unshift({ id, at, reason, json });
            os.put({ k: key, items: items.slice(0, LIMIT) }); result = { ok: true, durable: true, id };
          };
          tx.oncomplete = () => resolve(result || refused("history-write-failed"));
          tx.onerror = tx.onabort = () => resolve(refused("history-write-failed"));
        } catch (_) { resolve(refused("history-write-failed")); }
      }).then(finish);
    }
    function validItems(items, flavour) {
      if (!Array.isArray(items)) return [];
      return items.slice(0, LIMIT).filter((x) => x && typeof x.id === "string" && x.id.length <= 96 &&
        Number.isFinite(x.at) && typeof x.json === "string" && x.json.length * 2 <= SNAPSHOT_BYTES &&
        clean(parse(x.json), flavour) !== null);
    }
    function parse(json) { try { return JSON.parse(json); } catch (_) { return null; } }
    async function read(flavour, i) {
      const key = slotKey(flavour, i); if (!key) return { ok: false, reason: "invalid-slot", items: [] };
      const db = await open(); if (!db) return { ok: false, reason: "history-unavailable", items: [] };
      return new Promise((resolve) => {
        try {
          const r = db.transaction("slots", "readonly").objectStore("slots").get(key);
          r.onsuccess = () => resolve({ ok: true, items: validItems(r.result && r.result.items, flavour) });
          r.onerror = () => resolve({ ok: false, reason: "history-read-failed", items: [] });
        } catch (_) { resolve({ ok: false, reason: "history-read-failed", items: [] }); }
      });
    }
    async function list(flavour, i) {
      const r = await read(flavour, i);
      return { ok: r.ok, reason: r.reason || null, items: r.items.map((x) => ({ id: x.id, at: x.at, reason: x.reason, bytes: x.json.length * 2, summary: summary(x.json) })) };
    }
    function engaged() {
      return opts.inCareer ? opts.inCareer() : typeof Career !== "undefined" && Career.inCareer && Career.inCareer();
    }
    async function preview(flavour, i, id) {
      if (!store || !disk || engaged()) return refused(engaged() ? "leave-career-first" : "storage-unavailable");
      const r = await read(flavour, i), row = r.items.find((x) => x.id === id);
      if (!r.ok || !row) return refused(r.reason || "point-missing");
      const key = "career." + slotKey(flavour, i);
      try {
        const raw = disk.getItem("apex26." + key), current = store.get(key, null);
        const token = Object.freeze({ ok: true, flavour, slot: i, id,
          current: current ? summary(JSON.stringify(current)) : null, point: summary(row.json), at: row.at, reason: row.reason });
        previews.set(token, { key, revision: store.keyRevision(key), raw, session: JSON.stringify(current), json: row.json });
        return token;
      } catch (_) { return refused("storage-unavailable"); }
    }
    async function restore(token) {
      const p = token && previews.get(token);
      if (!p) return refused("preview-required");
      previews.delete(token);
      if (engaged()) return refused("leave-career-first");
      try {
        const unchanged = () => store.keyRevision(p.key) === p.revision && disk.getItem("apex26." + p.key) === p.raw &&
          JSON.stringify(store.get(p.key, null)) === p.session;
        if (!unchanged()) return refused("slot-changed");
        // Keep the value being replaced when possible; failure to retain it is
        // explicit and prevents an undo operation from silently losing its undo.
        const current = parse(p.session);
        if (current) {
          const saved = await capture(token.flavour, token.slot, current, { reason: "before-restore" });
          if (!saved.ok) return saved;
        }
        if (engaged()) return refused("leave-career-first");
        if (!unchanged()) return refused("slot-changed");
        const value = parse(p.json), checked = clean(value, token.flavour);
        if (!checked) return refused("invalid-point");
        const result = store.write(p.key, JSON.parse(checked));
        if (result.ok && opts.onRestored) opts.onRestored(token.flavour, token.slot);
        return Object.assign({}, result, { reloadRequired: result.ok === true });
      } catch (_) { return refused("restore-failed"); }
    }
    return { capture, list, preview, restore, health, limits: { perSlot: LIMIT, snapshotBytes: SNAPSHOT_BYTES, totalBytes: LIMIT * SNAPSHOT_BYTES * 6 } };
  }
  let instance;
  const current = () => instance || (instance = create());
  return { create, capture: (...args) => current().capture(...args), list: (...args) => current().list(...args),
    preview: (...args) => current().preview(...args), restore: (...args) => current().restore(...args), health: () => current().health() };
})();
Object.freeze(CareerRestorePoints);
