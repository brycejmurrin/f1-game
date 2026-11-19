const GameStore = (function () {
  "use strict";

  function parseStored(raw, label) {
    const v = JSON.parse(raw);
    if (typeof v === "number" && !Number.isFinite(v)) {
      throw new Error("non-finite number" + (label ? " in " + label : ""));
    }
    return v;
  }

  const _writeFails = new Map();
  const _rawOverrides = new Map();

  const cloneDef = (v) => (v !== null && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

  const store = {
    _cache: new Map(),
    _keyRev: new Map(),
    _clearRev: 0,
    _listeners: new Set(),
    rev: 0,
    rawRev: 0,
    broken: null,
    _def(k, d) {
      if (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(k))
        return cloneDef(SettingsDefaults.get(k));
      if (typeof GarageDefaults !== "undefined" && GarageDefaults.has(k))
        return cloneDef(GarageDefaults.get(k));
      return d;
    },
    get(k, d) {
      const key = "apex26." + k;
      let v = this._cache.get(key);
      if (v === undefined && !this._cache.has(key)) {
        let raw;
        try {
          raw = localStorage.getItem(key);
        } catch (e) {
          noteBroken(e, "read " + k);
          this._cache.set(key, undefined);
          return this._def(k, d);
        }
        try {
          v = raw === null ? undefined : parseStored(raw, k);
        } catch (e) {
          dropCorrupt(key, k, raw, e);
          this._cache.set(key, undefined);
          return this._def(k, d);
        }
        this._cache.set(key, v);
      }
      if (v === null && d !== null && typeof d === "object") return this._def(k, d);
      return v === undefined ? this._def(k, d) : v;
    },
    getStored(k) {
      const key = fullKey(k);
      if (!this._cache.has(key)) this.get(k);
      return this._cache.get(key);
    },
    set(k, v, options) {
      return this.write(k, v, options).durable;
    },
    write(k, v, options) {
      const ownership = careerWriteStatus(k);
      if (!ownership.ok) return ownership;
      schemaNoteWrite(k, "json");
      const key = "apex26." + k;
      const requireDurable = options && options.requireDurable === true;
      let json;
      try { json = v === undefined ? undefined : JSON.stringify(v); }
      catch (e) {
        noteBroken(e, "write " + k);
        if (!requireDurable) _writeFails.set(key, { name: (e && e.name) || "Error", k, lane: "json", v });
        return { ok: false, durable: false, reason: this.broken || (e && e.name) || "Error" };
      }
      if (v !== undefined && json === undefined) {
        const e = new TypeError("value is not JSON-serializable");
        noteBroken(e, "write " + k);
        if (!requireDurable) _writeFails.set(key, { name: e.name, k, lane: "json", v });
        return { ok: false, durable: false, reason: this.broken || e.name };
      }
      let durable = true;
      let beforeDisk;
      if (options && options.migration && mirrorKey(key)) {
        try { beforeDisk = localStorage.getItem(key); } catch (_) {  }
      }
      try {
        if (json === undefined) localStorage.removeItem(key);
        else setRoomy(key, json);
        _writeFails.delete(key);
      } catch (e) {
        noteBroken(e, "write " + k);
        if (requireDurable) return { ok: false, durable: false, reason: this.broken || (e && e.name) || "Error" };
        durable = false;
        _writeFails.set(key, { name: (e && e.name) || "Error", k, lane: "json", v });
      }
      _rawOverrides.delete(key);
      this._cache.set(key, v);
      this._keyRev.set(key, (this._keyRev.get(key) || 0) + 1);
      this.rev++;
      if (mirrorKey(key)) mirrorQueue(key, v === null || json === undefined ? null : json, durable,
        options && options.migration ? { ...options, beforeDisk } : options);
      const result = { ok: true, durable, reason: durable ? null : (this.broken || "Error") };
      this._notify({ key: k, durable, reason: result.reason, local: true });
      return result;
    },
    writeFailed() {
      for (const f of _writeFails.values()) return f.name;
      return null;
    },
    retryFailed() {
      let durable = true, reason = null, retried = 0;
      for (const f of [..._writeFails.values()]) {
        retried++;
        const r = f.lane === "raw"
          ? { durable: f.op === "delete" ? this.rawDel(f.k) : this.rawSet(f.k, f.v), reason: this.broken || f.name }
          : this.write(f.k, f.v);
        if (!r.durable) { durable = false; reason = reason || r.reason; }
      }
      return { ok: true, durable, reason, retried };
    },
    failedKeys() {
      return [..._writeFails.values()].map((f) => ({ key: shortKey(f.k), lane: f.lane, reason: f.name }));
    },
    keyRevision(k) {
      return this._clearRev + ":" + (this._keyRev.get(fullKey(k)) || 0);
    },
    raw(k) {
      const short = shortKey(k);
      const def = () => (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(short))
        ? SettingsDefaults.get(short) : null;
      if (_rawOverrides.has(fullKey(k))) { const v = _rawOverrides.get(fullKey(k)); return v === null ? def() : v; }
      try { const v = localStorage.getItem(fullKey(k)); return v === null ? def() : v; }
      catch (e) { noteBroken(e, "read " + k); return def(); }
    },
    rawSet(k, v) {
      if (!careerWriteStatus(k).ok) return false;
      schemaNoteWrite(k, "raw");
      const key = fullKey(k);
      this._cache.delete(key);
      this.rawRev++;
      v = String(v);
      this._keyRev.set(key, (this._keyRev.get(key) || 0) + 1);
      try { setRoomy(key, v); _writeFails.delete(key); _rawOverrides.delete(key); return true; }
      catch (e) { noteBroken(e, "write " + k); _rawOverrides.set(key, v); _writeFails.set(key, { name: (e && e.name) || "Error", k, lane: "raw", op: "set", v }); return false; }
    },
    rawDel(k) {
      if (!careerWriteStatus(k).ok) return false;
      const key = fullKey(k);
      this._cache.delete(key);
      this.rawRev++;
      this._keyRev.set(key, (this._keyRev.get(key) || 0) + 1);
      try { localStorage.removeItem(key); _writeFails.delete(key); _rawOverrides.delete(key); return true; }
      catch (e) { noteBroken(e, "remove " + k); _rawOverrides.set(key, null); _writeFails.set(key, { name: (e && e.name) || "Error", k, lane: "raw", op: "delete" }); return false; }
    },
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      this._listeners.add(fn);
      return () => { this._listeners.delete(fn); };
    },
    _notify(change) {
      for (const fn of this._listeners) {
        try { fn(change); }
        catch (e) { Log.warn("game", "persistence observer failed: " + ((e && e.message) || e)); }
      }
    },
    onForeignWrite(e) {
      if (!e) return false;
      try { if (e.storageArea && e.storageArea !== localStorage) return false; } catch (_) {  }
      if (e.key === null) {
        _writeFails.clear();
        mirrorForeign(null);
        _rawOverrides.clear(); this.rawRev++;
        this._cache.clear(); this._clearRev++; this.rev++; this.foreign++;
        this._notify({ key: null, foreign: true, clear: true });
        return true;
      }
      if (typeof e.key !== "string" || e.key.indexOf("apex26.") !== 0) return false;
      _rawOverrides.delete(e.key);
      _writeFails.delete(e.key);
      mirrorForeign(e.key);
      this.rawRev++;
      this._cache.delete(e.key);
      this._keyRev.set(e.key, (this._keyRev.get(e.key) || 0) + 1);
      this.rev++;
      this.foreign++;
      this._notify({ key: e.key.slice("apex26.".length), fullKey: e.key, foreign: true, clear: false });
      return true;
    },
    foreign: 0,
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", (e) => { store.onForeignWrite(e); });
  }

  function shortKey(k) { return k.indexOf("apex26.") === 0 ? k.slice("apex26.".length) : k; }
  function fullKey(k) { return "apex26." + shortKey(k); }
  const careerKey = (k) => /^apex26\.career/.test(fullKey(k));
  const careerWriter = { state: typeof navigator === "undefined" ? "owned" : "pending", ready: null };
  function careerWriteStatus(k) {
    const ok = (k != null && !careerKey(k)) || careerWriter.state === "owned";
    return { ok, durable: false, reason: ok ? null : "writer-" + careerWriter.state };
  }
  const WRITER_WAIT_MS = 1500;
  function acquireCareerWriter() {
    if (typeof navigator === "undefined") return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (state) => {
        if (done) return;
        done = true; careerWriter.state = state;
        const keys = new Set(["careerSlot", "career", ...["driver", "myteam"].flatMap(f => [0, 1, 2].map(i => `career.${f}.${i}`))]);
        for (const key of store._cache.keys()) if (careerKey(key)) keys.add(shortKey(key));
        for (const key of keys) {
          store._cache.delete(fullKey(key));
          store._keyRev.set(fullKey(key), (store._keyRev.get(fullKey(key)) || 0) + 1);
        }
        store.rev++;
        store._notify({ key: null, keys: [...keys], foreign: true, restoredBatch: true, writer: true });
        resolve(state === "owned");
      };
      try {
        if (!navigator.locks || typeof navigator.locks.request !== "function") { finish("unavailable"); return; }
        const locks = navigator.locks, name = "apex26-career-writer";
        const hold = () => { finish("owned"); return new Promise(() => {}); };
        const queue = () => {
          if (typeof AbortController !== "function" || typeof setTimeout !== "function") { finish("busy"); return; }
          const ac = new AbortController(), timer = setTimeout(() => ac.abort(), WRITER_WAIT_MS);
          locks.request(name, { mode: "exclusive", signal: ac.signal }, () => { clearTimeout(timer); return hold(); })
            .catch((e) => { clearTimeout(timer); finish(e && e.name === "AbortError" ? "busy" : "unavailable"); });
        };
        locks.request(name, { mode: "exclusive", ifAvailable: true }, (lock) => {
          if (lock) return hold();
          queue();
        }).catch(() => { finish("unavailable"); });
      } catch (_) { finish("unavailable"); }
    });
  }
  store.careerWriter = careerWriter;
  store.careerWriteStatus = () => careerWriteStatus();
  function schemaNoteWrite(k, lane) {
    if (typeof SaveSchemaRegistry === "undefined" || !SaveSchemaRegistry.noteWrite) return;
    SaveSchemaRegistry.noteWrite(shortKey(k), lane);
  }
  const DISPOSABLE_PREFIXES = ["apex26.api.", "apex26.realrace."];
  function setRoomy(key, str) {
    try { localStorage.setItem(key, str); return; } catch (e) {
      let freed = 0;
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && DISPOSABLE_PREFIXES.some((p) => k.indexOf(p) === 0)) { localStorage.removeItem(k); freed++; }
        }
      } catch (err) { Log.warn("game", "quota recovery could not scan storage:", err && err.message); }
      if (!freed) throw e;
      localStorage.setItem(key, str);
    }
  }

  const MIRROR_KEY = /^apex26\.(career|season)/;
  const MIRROR_DB = "apex26-store";
  const MIRROR_STORE = "kv";
  const MIRROR_VERSION = 1;
  const MIRROR_OPEN_MS = 4000;
  const MIRROR_FLUSH_MS = 500;
  const MIRROR_RETRY_MS = 2000;
  const AUTHORED_KEY = /^apex26\.(?:customTeam|customLogo|(?:parts|setup|setupPresets)\.[A-Za-z0-9_-]{1,64}|livery\.(?:custom\.)?[A-Za-z0-9_-]{1,64})$/;
  const AUTHORED_ROW_BYTES = 512 * 1024, AUTHORED_TOTAL_BYTES = 2 * 1024 * 1024, AUTHORED_KEYS = 96;
  const mirror = { supported: false, restored: 0, flushed: 0, failed: 0, pending: 0, inFlight: 0, settled: false, skipped: 0, authoredBytes: 0, authoredKeys: 0, limitReason: null, ready: null };
  let _mirrorHandle = null;
  let _mirrorDb = null;
  let _mirrorPending = new Map();
  const _mirrorSeen = new Map();
  let _mirrorTimer = null;
  let _mirrorFlight = null;
  let _restoreDone = false;

  function mirrorKey(key) { return MIRROR_KEY.test(key) || AUTHORED_KEY.test(key); }
  function authoredBytes(k, v, baseline) { return (k.length + (v === null ? 0 : typeof v === "string" ? v.length : AUTHORED_ROW_BYTES) + (typeof baseline === "string" ? baseline.length : 0)) * 2; }
  let _foreignEpoch = 0;
  const _foreignKeys = new Map();
  const _mirrorKnown = new Set();
  function mirrorEpoch(k) { return _foreignEpoch + ":" + (_foreignKeys.get(k) || 0); }
  function mirrorForeign(key) {
    if (key === null) {
      _foreignEpoch++;
      const keys = new Set([..._mirrorKnown, ..._mirrorPending.keys(), ..._mirrorSeen.keys()]);
      _mirrorPending.clear(); _mirrorSeen.clear();
      mirror.pending = 0;
      for (const k of keys) mirrorQueue(k, null, true);
      return;
    }
    _foreignKeys.set(key, (_foreignKeys.get(key) || 0) + 1);
    _mirrorPending.delete(key); _mirrorSeen.delete(key); mirror.pending = _mirrorPending.size;
    if (!mirrorKey(key)) return;
    try { mirrorQueue(key, localStorage.getItem(key), true, { foreign: true }); } catch (_) {  }
  }

  function mirrorInvalidate(db) {
    if (_mirrorHandle !== db) return;
    _mirrorHandle = null;
    _mirrorDb = null;
    mirror.supported = false;
  }
  function mirrorTransactionFailed(db, error) {
    if (error && (error.name === "InvalidStateError" || error.name === "UnknownError")) mirrorInvalidate(db);
  }

  function mirrorOpen() {
    if (_mirrorDb) return _mirrorDb;
    _mirrorDb = new Promise((res) => {
      let settled = false, timer = null, r = null;
      const finish = (db) => {
        if (settled) { if (db) { try { db.close(); } catch (e) {  } } return; }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) {
          _mirrorHandle = db;
          db.onclose = () => mirrorInvalidate(db);
          db.onversionchange = () => {
            mirrorInvalidate(db);
            try { db.close(); } catch (_) {  }
          };
        }
        res(db || null);
      };
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) { finish(null); return; }
        r = indexedDB.open(MIRROR_DB, MIRROR_VERSION);
      } catch (e) { finish(null); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(MIRROR_STORE)) db.createObjectStore(MIRROR_STORE, { keyPath: "k" });
      };
      r.onsuccess = () => finish(r.result);
      r.onerror = () => finish(null);
      r.onblocked = () => finish(null);
      if (typeof setTimeout === "function") timer = setTimeout(() => finish(null), MIRROR_OPEN_MS);
    }).then((db) => {
      mirror.supported = !!db;
      if (!db) _mirrorDb = null;
      return db;
    });
    return _mirrorDb;
  }

  function mirrorQueue(key, json, lsOk, options) {
    if (!careerWriteStatus(key).ok) return;
    try { if (typeof indexedDB === "undefined" || !indexedDB) return; }
    catch (_) { return; }
    _mirrorKnown.add(key);
    const prior = _mirrorPending.get(key);
    const v = json === null && lsOk === false ? "null" : json;
    const user = !(options && options.migration) || !!(prior && prior.user);
    let disk;
    try { disk = localStorage.getItem(key); } catch (_) { disk = undefined; }
    _mirrorPending.set(key, { v, lsOk: lsOk !== false, user, disk,
      beforeDisk: options && options.migration ? (prior && !prior.user ? prior.beforeDisk : options.beforeDisk) : disk,
      foreign: !!(options && options.foreign), epoch: mirrorEpoch(key) });
    mirror.pending = _mirrorPending.size;
    if (_mirrorTimer !== null) return;
    if (typeof setTimeout !== "function") { mirrorFlush(); return; }
    _mirrorTimer = setTimeout(mirrorFlush, MIRROR_FLUSH_MS);
  }

  function mirrorBatchAuthored(batch) {
    for (const k of batch.keys()) if (AUTHORED_KEY.test(k)) return true;
    return false;
  }

  function mirrorFlush(retryOnFailure = true) {
    if (_mirrorTimer !== null && typeof clearTimeout === "function") clearTimeout(_mirrorTimer);
    _mirrorTimer = null;
    if (!_restoreDone && mirror.ready) {
      _mirrorTimer = -1;
      return mirror.ready.then(() => { if (_mirrorTimer === -1) _mirrorTimer = null; return mirrorFlush(retryOnFailure); });
    }
    if (_mirrorFlight) {
      const prior = _mirrorFlight;
      return prior.then(() => mirrorFlush(retryOnFailure), () => mirrorFlush(retryOnFailure));
    }
    const batch = _mirrorPending;
    _mirrorPending = new Map();
    mirror.pending = 0;
    if (!batch.size) return Promise.resolve(false);
    mirror.inFlight = batch.size;
    const work = mirrorOpen().then((db) => new Promise((res) => {
      if (!db) { res(false); return; }
      let t;
      try { t = db.transaction(MIRROR_STORE, "readwrite"); } catch (e) { mirrorTransactionFailed(db, e); res(false); return; }
      const os = t.objectStore(MIRROR_STORE), committed = new Map();
      let authoredTotals = null;
      const applyBatch = (rows, scan) => {
        let bytes = scan ? scan.bytes : 0, keys = scan ? scan.keys : 0;
        for (const [k, e] of batch) {
          if (!careerWriteStatus(k).ok || e.epoch !== mirrorEpoch(k)) continue;
          const prev = rows.get(k), authored = AUTHORED_KEY.test(k);
          const value = e.v === null ? "null" : e.v;
          if (!e.foreign && prev && prev.lsOk === false && e.lsOk === true && value !== prev.v && _mirrorSeen.get(k) !== prev.v) {
            if (!authored && Object.prototype.hasOwnProperty.call(prev, "baseline")) {
              let disk; try { disk = localStorage.getItem(k); } catch (_) {  }
              if (disk === e.disk) os.put({ ...prev, baseline: disk });
            }
            continue;
          }
          if (authored) {
            if (prev && !e.lsOk && e.v !== prev.v && _mirrorSeen.get(k) !== prev.v) continue;
            let disk;
            try { disk = localStorage.getItem(k); } catch (_) { continue; }
            if (disk !== e.disk) continue;
            const baseline = e.lsOk ? null : e.disk;
            const size = authoredBytes(k, e.v, baseline), old = prev ? authoredBytes(k, prev.v, prev.baseline) : 0;
            const count = keys + (prev ? 0 : 1), total = bytes - old + size;
            if ((!prev && count > AUTHORED_KEYS) || (e.v !== null && (size > AUTHORED_ROW_BYTES || total > AUTHORED_TOTAL_BYTES))) {
              mirror.skipped++; mirror.limitReason = "authored mirror limit"; continue;
            }
            bytes = total; keys = count;
            os.put({ k, v: e.v, lsOk: e.lsOk, baseline });
            rows.set(k, { k, v: e.v, lsOk: e.lsOk, baseline });
          } else if (e.v === null) { os.delete(k); rows.delete(k); }
          else { const row = { k, v: e.v, lsOk: e.lsOk, baseline: e.lsOk ? null : e.disk }; os.put(row); rows.set(k, row); }
          committed.set(k, e.v);
        }
        if (scan) authoredTotals = { bytes, keys };
      };
      if (mirrorBatchAuthored(batch)) {
        const all = os.getAll();
        all.onsuccess = () => {
          const rows = new Map((all.result || []).map((r) => [r.k, r]));
          let bytes = 0, keys = 0;
          for (const [k, row] of rows) if (AUTHORED_KEY.test(k)) { bytes += authoredBytes(k, row.v, row.baseline); keys++; }
          applyBatch(rows, { bytes, keys });
        };
      } else {
        const rows = new Map();
        let left = batch.size;
        for (const k of batch.keys()) {
          let req;
          try { req = os.get(k); } catch (e) { res(false); return; }
          req.onsuccess = () => {
            if (req.result) rows.set(k, req.result);
            if (--left === 0) applyBatch(rows, null);
          };
        }
      }
      t.oncomplete = () => {
        if (authoredTotals) { mirror.authoredBytes = authoredTotals.bytes; mirror.authoredKeys = authoredTotals.keys; }
        for (const [k, v] of committed) { if (v === null) _mirrorSeen.delete(k); else _mirrorSeen.set(k, v); }
        mirror.flushed += committed.size; res(true);
      };
      t.onerror = t.onabort = (ev) => { mirrorTransactionFailed(db, t.error || (ev && ev.target && ev.target.error)); res(false); };
    })).then((ok) => {
      if (!ok && batch.size) {
        mirror.failed += batch.size;
        for (const [k, v] of batch) if (v.epoch === mirrorEpoch(k) && !_mirrorPending.has(k)) _mirrorPending.set(k, v);
        mirror.pending = _mirrorPending.size;
        Log.warn("game", "durable mirror write failed for " + batch.size + " key(s)");
        if (retryOnFailure && typeof setTimeout === "function" && _mirrorTimer === null) {
          _mirrorTimer = setTimeout(() => mirrorFlush(false), MIRROR_RETRY_MS);
        }
      }
      return ok;
    });
    let flight;
    flight = work.finally(() => { if (_mirrorFlight === flight) { _mirrorFlight = null; mirror.inFlight = 0; } });
    _mirrorFlight = flight;
    return flight;
  }

  function mirrorRestore() {
    const epoch = _foreignEpoch, foreignKeys = new Map(_foreignKeys);
    let canRestore = false;
    try { canRestore = typeof indexedDB !== "undefined" && !!indexedDB && typeof localStorage !== "undefined"; }
    catch (_) {  }
    if (!canRestore) { _restoreDone = mirror.settled = true; return Promise.resolve(0); }
    return mirrorOpen().then((db) => new Promise((res) => {
      if (!db) { res([]); return; }
      let r;
      try { r = db.transaction(MIRROR_STORE, "readonly").objectStore(MIRROR_STORE).getAll(); }
      catch (e) { mirrorTransactionFailed(db, e); res([]); return; }
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => { mirrorTransactionFailed(db, r.error); res([]); };
    })).then((rows) => {
      const restored = [];
      let authoredTotal = 0, authoredCount = 0;
      for (const row of rows) {
        if (!row || typeof row.k !== "string" || !mirrorKey(row.k) || !careerWriteStatus(row.k).ok) continue;
        if (epoch !== _foreignEpoch) { if (!_mirrorPending.has(row.k)) mirrorQueue(row.k, null, true); continue; }
        if ((foreignKeys.get(row.k) || 0) !== (_foreignKeys.get(row.k) || 0)) continue;
        _mirrorKnown.add(row.k);
        const authored = AUTHORED_KEY.test(row.k), tombstone = authored && row.v === null;
        if (!tombstone && typeof row.v !== "string") continue;
        if (authored) {
          const size = authoredBytes(row.k, row.v, row.baseline);
          if (size > AUTHORED_ROW_BYTES || authoredTotal + size > AUTHORED_TOTAL_BYTES || authoredCount >= AUTHORED_KEYS) {
            mirror.skipped++; mirror.limitReason = "authored mirror limit"; continue;
          }
          authoredTotal += size; authoredCount++;
        }
        _mirrorSeen.set(row.k, row.v);
        const p = _mirrorPending.get(row.k);
        if (p && p.user) continue;
        let present = null;
        try { present = localStorage.getItem(row.k); } catch (e) { return 0; }
        const primary = p && !p.user && p.beforeDisk !== undefined ? p.beforeDisk : present;
        if (row.lsOk === false && primary !== null && primary !== row.v &&
            (Object.prototype.hasOwnProperty.call(row, "baseline") ? primary !== row.baseline : authored)) continue;
        const newer = row.lsOk === false && present !== row.v;
        if (present !== null && !newer) continue;
        if (newer && p) _mirrorPending.delete(row.k);
        let landed = true;
        try { if (tombstone) localStorage.removeItem(row.k); else localStorage.setItem(row.k, row.v); } catch (e) { landed = false; }
        if (!landed) {
          if (!newer) continue;
          try { store._cache.set(row.k, tombstone ? undefined : parseStored(row.v, row.k)); } catch (e) { continue; }
        } else {
          if (newer) mirrorQueue(row.k, row.v, true, { migration: true });
          store._cache.delete(row.k);
        }
        store._keyRev.set(row.k, (store._keyRev.get(row.k) || 0) + 1);
        restored.push(row.k);
      }
      mirror.authoredBytes = authoredTotal; mirror.authoredKeys = authoredCount;
      if (restored.length) {
        store.rev++;
        mirror.restored += restored.length;
        Log.info("game", "durable mirror restored " + restored.length + " key(s): " + restored.join(", "));
        const restoredKeys = restored.map((k) => k.slice("apex26.".length));
        for (let i = 0; i < restored.length; i++) store._notify({
          key: restoredKeys[i], fullKey: restored[i], foreign: true, clear: false, restored: true,
        });
        store._notify({
          key: null, keys: restoredKeys.slice(), foreign: true, clear: false,
          restored: true, restoredBatch: true,
        });
      }
      return restored.length;
    }).catch((e) => {
      Log.warn("game", "durable mirror restore failed: " + ((e && e.message) || e));
      return 0;
    }).then((n) => { _restoreDone = mirror.settled = true; return n; });
  }

  careerWriter.ready = acquireCareerWriter();
  mirror.ready = careerWriter.state === "owned" && typeof navigator === "undefined"
    ? mirrorRestore() : careerWriter.ready.then(() => mirrorRestore());
  store.mirror = mirror;
  store.mirrorPolicy = Object.freeze({ authoredRowBytes: AUTHORED_ROW_BYTES, authoredTotalBytes: AUTHORED_TOTAL_BYTES, authoredKeys: AUTHORED_KEYS,
    includes: (key) => mirrorKey(fullKey(key)) });
  store.mirrorFlush = mirrorFlush;

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") mirrorFlush();
    });
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", () => { mirrorFlush(); });
  }

  function dropCorrupt(key, k, raw, e) {
    let removed = true;
    try { if (careerWriteStatus(key).ok) localStorage.removeItem(key); else removed = false; } catch (err) { removed = false; noteBroken(err, "remove " + k); }
    Log.warn("game", `${key} was unreadable (${(e && e.name) || "Error"}: ${(e && e.message) || e}; ${String(raw).length} chars)` +
      (removed ? " — removed, using the default" : " — using the default"));
  }

  function noteBroken(e, what) {
    const name = (e && e.name) || "Error";
    const first = !store.broken;
    if (first) store.broken = name;
    const msg = `localStorage ${what} failed (${name}) — settings and saves will NOT survive a reload` +
      (name === "QuotaExceededError" ? "; iOS Safari sets the quota to 0 in Private Browsing" : "");
    if (first) Log.warn("game", msg); else Log.info("game", msg);
  }

  const TT_BOARD_MAX = 10;
  const TT_CLASS_MAX = 6;
  function ttParseBoard(b) {
    let laps = [];
    if (Array.isArray(b)) laps = b;
    else if (b && b.v === 2 && Array.isArray(b.laps)) {
      const cls = Array.isArray(b.classes) ? b.classes : [];
      laps = b.laps.map(e => {
        if (!e || typeof e !== "object") return null;
        const o = {};
        for (const k of Object.keys(e)) if (k !== "c") o[k] = e[k];
        if (Number.isInteger(e.c) && cls[e.c]) o.context = cls[e.c];
        return o;
      });
    }
    return laps.filter(e => e && Number.isFinite(e.t) && e.t > 0);
  }
  function ttRead(trackId) {
    return ttParseBoard(store.get("ttlb." + trackId, []));
  }
  function ttWrite(trackId, laps) {
    const classes = [], at = new Map();
    return store.write("ttlb." + trackId, { v: 2, classes, laps: laps.map(e => {
      const o = {};
      for (const k of Object.keys(e)) if (k !== "context") o[k] = e[k];
      if (e.context) {
        if (!at.has(e.context)) { at.set(e.context, classes.length); classes.push(e.context); }
        o.c = at.get(e.context);
      }
      return o;
    }) });
  }
  function ttBoard(trackId, context) {
    return ttRead(trackId).filter(e => context === undefined || (e.context || null) === context);
  }
  function ttBoardAddResult(trackId, entry) {
    if (!isFinite(entry.t) || entry.t <= 0) return { ok: false, durable: false, reason: "invalid-lap", laps: ttBoard(trackId) };
    const b = ttBoard(trackId);
    b.push(entry);
    b.sort((a, z) => a.t - z.t);
    const counts = new Map();
    let kept = b.filter(e => { const k = e.context || null; const n = (counts.get(k) || 0) + 1; counts.set(k, n); return n <= TT_BOARD_MAX; });
    const last = new Map();
    for (const e of kept) { const k = e.context || null; last.set(k, Math.max(last.has(k) ? last.get(k) : -Infinity, Number(e.ts) || 0)); }
    if (last.size > TT_CLASS_MAX) {
      const keep = new Set([kept[0].context || null, entry.context || null]);
      const rest = [...last.keys()].filter(k => !keep.has(k)).sort((a, z) => last.get(z) - last.get(a));
      for (const k of rest.slice(0, TT_CLASS_MAX - keep.size)) keep.add(k);
      kept = kept.filter(e => keep.has(e.context || null));
    }
    return { ...ttWrite(trackId, kept), laps: kept };
  }
  function ttBoardAdd(trackId, entry) {
    return ttBoardAddResult(trackId, entry).laps;
  }
  function ttBoardSaveResult(trackId) {
    return ttWrite(trackId, ttBoard(trackId));
  }

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  function rgbToHex(c) {
    const cl = (v) => Math.max(0, Math.min(1, v));
    const f = (v) => ("0" + Math.round(cl(v) * 255).toString(16)).slice(-2);
    return "#" + f(c[0]) + f(c[1]) + f(c[2]);
  }

  function seasonDriverId(teamId, driverIndex) { return teamId + ":" + driverIndex; }

  function migrateSeasonPoints(season) {
    return SaveMigrate.migrateSeasonPoints(store, season);
  }

  return { store, ttBoard, ttBoardAdd, ttBoardAddResult, ttBoardSaveResult, ttParseBoard,
           hexToRgb, rgbToHex, seasonDriverId,
           migrateSeasonPoints,
           migrateCareer: SaveMigrate.migrateCareer,
           CAREER_V: SaveMigrate.CAREER_V };
})();
Object.freeze(GameStore);
