/* Apex 26 — persistence for js/game.js: the cached localStorage wrapper (`store`, all keys prefixed "apex26.", plus the uncached raw-string lane the settings panels persist through), the per-track time-trial leaderboard, season-point… */
const GameStore = (function () {
  "use strict";

  const store = {
    _cache: new Map(),   // full-key -> parsed value; kills per-frame getItem + JSON.parse in the render loop
    _keyRev: new Map(),  // full-key -> writes observed in this document (local or foreign)
    _clearRev: 0,        // storage.clear() invalidates every key without naming one
    _listeners: new Set(),
    rev: 0,              // bumped on every set — memo caches key off this to self-invalidate
    broken: null,
    get(k, d) {
      const key = "apex26." + k;
      let v = this._cache.get(key);
      if (v === undefined && !this._cache.has(key)) {
        try { const raw = localStorage.getItem(key); v = raw === null ? undefined : JSON.parse(raw); }
        catch (e) {
          // A read that throws is either storage being unavailable (same conditions
          // as set()) or a corrupt value. Either way the default is the right answer
          // — but say so once, because "your settings reset themselves" is otherwise
          // reported as a game bug with nothing in the console to go on.
          noteBroken(e, "read " + k);
          return d;
        }
        this._cache.set(key, v);
      }
      return v === undefined ? d : v;
    },
    // THE CACHE IS WRITTEN EVEN WHEN THE DISK WRITE FAILS, AND THAT IS DELIBERATE —
    // but it used to be silent, which made it a data-loss bug that looked like
    // nothing at all. Safari on iOS sets the localStorage quota to ZERO in Private
    // Browsing, so setItem throws on the very first write. The catch swallowed it,
    // _cache answered every subsequent get() with the right value, and the game ran
    // a whole career perfectly — until reload, when all of it was gone and the
    // player had no way to know it was never being saved.
    //
    // Still caching on failure is correct: dropping the value would break the
    // SESSION as well as the save, which is strictly worse. What was missing is
    // that anything noticed. `broken` is now the record, Log carries it once, and
    // __apex.persistState() exposes it so the failure is testable rather than
    // inferred from a player's reload.
    set(k, v) {
      return this.write(k, v).durable;
    },
    // Structured companion to set(). New domain save boundaries use this so a
    // write failure cannot be collapsed into an ignored boolean. `ok` describes
    // whether the requested value remains usable in this session; `durable`
    // describes whether it will survive a reload. The cache write below makes
    // ok:true even when durable:false, by design.
    write(k, v) {
      const key = "apex26." + k;
      let durable = true;
      try { localStorage.setItem(key, JSON.stringify(v)); }
      catch (e) { durable = false; noteBroken(e, "write " + k); }
      this._cache.set(key, v);
      this._keyRev.set(key, (this._keyRev.get(key) || 0) + 1);
      this.rev++;
      // Mirrored even when the disk write failed: a quota-refused career save
      // is exactly the write the durable copy exists for.
      if (mirrorKey(key)) mirrorQueue(key, v === null || v === undefined ? null : JSON.stringify(v));
      const result = { ok: true, durable, reason: durable ? null : (this.broken || "Error") };
      this._notify({ key: k, durable, reason: result.reason, local: true });
      return result;
    },
    keyRevision(k) {
      return this._clearRev + ":" + (this._keyRev.get(fullKey(k)) || 0);
    },
    // THE RAW STRING LANE. The settings panels (GfxQuality, CockpitOpts,
    // GameMetrics), the perf sentinel, BodyAttitude and the Spotify client keep
    // bare "1"/"0" flags and ids under the same "apex26." prefix, and each used
    // to reach localStorage on its own inside a `catch (_) {}`. Same storage,
    // same prefix (accepted spelled either way, like keyRevision), but NOT the
    // JSON cache above: a raw read hits the disk every call, so a devtools edit
    // or another tab's write is seen at once, and the on-disk form stays the
    // bare string the old call sites wrote — no key changes, no quoting. What
    // they gain is `broken`: a failed raw write is recorded and reported once,
    // the same as a failed JSON write, instead of vanishing.
    raw(k) {
      try { return localStorage.getItem(fullKey(k)); }
      catch (e) { noteBroken(e, "read " + k); return null; }
    },
    rawSet(k, v) {
      const key = fullKey(k);
      this._cache.delete(key);   // a key lives in one lane; if one ever strays, the disk wins
      try { localStorage.setItem(key, v); return true; }
      catch (e) { noteBroken(e, "write " + k); return false; }
    },
    rawDel(k) {
      const key = fullKey(k);
      this._cache.delete(key);
      try { localStorage.removeItem(key); return true; }
      catch (e) { noteBroken(e, "remove " + k); return false; }
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
    // THE CACHE MAKES A SECOND TAB DANGEROUS, and that is what this fixes. `_cache`
    // exists so the render loop never calls getItem/JSON.parse, and it is populated
    // on first read — so once tab A has read `career`, it answers every later get()
    // from memory and never learns that tab B wrote a newer save. Tab A then writes
    // its stale object back over B's on its next set(), and neither tab shows an
    // error: the player finishes a season in one window and finds it gone.
    //
    // The minimum correct behaviour is NOT a merge (two divergent career saves have
    // no defined join) — it is to stop answering from a cache the disk has moved on
    // from. `storage` fires only for writes made by OTHER documents of the same
    // origin, so dropping the named key is exactly "forget what I remembered about
    // the thing that changed"; the next get() re-reads the winner. `rev` bumps so
    // every memo keyed off it (the same contract set() offers) re-derives too.
    //
    // e.key === null is storage.clear() — nothing survives it, so drop everything.
    // Foreign writes to other origins' keys cannot reach us, but a non-apex26. key
    // in this origin is not ours and must not bump rev.
    onForeignWrite(e) {
      if (!e) return false;
      if (e.key === null) {
        this._cache.clear(); this._clearRev++; this.rev++; this.foreign++;
        this._notify({ key: null, foreign: true, clear: true });
        return true;
      }
      if (typeof e.key !== "string" || e.key.indexOf("apex26.") !== 0) return false;
      this._cache.delete(e.key);
      this._keyRev.set(e.key, (this._keyRev.get(e.key) || 0) + 1);
      this.rev++;
      this.foreign++;
      this._notify({ key: e.key.slice("apex26.".length), fullKey: e.key, foreign: true, clear: false });
      return true;
    },
    foreign: 0,          // applied foreign writes — surfaced by __apex.persistState()
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", (e) => { store.onForeignWrite(e); });
  }

  function fullKey(k) { return k.indexOf("apex26.") === 0 ? k : "apex26." + k; }

  // THE DURABLE MIRROR:
  // localStorage stays the synchronous source of truth and the cache above is
  // unchanged. But it is a 5 MB bucket shared with forty circuits' ghost laps,
  // and a career save that meets the quota is cached for the session and gone
  // at reload (write() above records that, it cannot prevent it). IndexedDB has
  // its own, far larger quota, so every `apex26.career*` / `apex26.season*`
  // write is ALSO queued — debounced, one transaction per burst — into a small
  // object store, and at boot any such key localStorage LACKS that the mirror
  // holds is written back (and its cache entry dropped) so the next read sees
  // it. Best effort in every direction: no indexedDB, a blocked open, a failed
  // transaction — the game runs exactly as before, and the mirror's state is
  // readable through __apex.persistState() rather than inferred from a reload.
  //
  // What it does NOT do: survive a "clear site data" (that clears IndexedDB
  // too), or Safari's 7-day script-storage sweep (same). What it does: a
  // quota-refused save is restored on the next boot that has room, and a
  // localStorage wiped on its own (a devtools clear, a corrupt store) comes
  // back from the mirror. Restoration lands AFTER the first read when the first
  // read is synchronous at boot (Career.load()), so a restored key is announced
  // through the same foreign-write notification a second tab's write gets —
  // career.js re-reads its live slot on that — and every later boot is whole.
  const MIRROR_KEY = /^apex26\.(career|season)/;
  const MIRROR_DB = "apex26-store";
  const MIRROR_STORE = "kv";
  const MIRROR_VERSION = 1;
  const MIRROR_OPEN_MS = 4000;      // a blocked/never-settling open() degrades to "no mirror"
  const MIRROR_FLUSH_MS = 500;      // settleRound() writes the slot and the season back to back
  const mirror = { supported: false, restored: 0, flushed: 0, failed: 0, pending: 0, ready: null };
  let _mirrorDb = null;             // memoised open (a failure is never memoised)
  let _mirrorPending = new Map();   // full key -> JSON string, or null for a delete
  let _mirrorTimer = null;

  function mirrorKey(key) { return MIRROR_KEY.test(key); }

  function mirrorOpen() {
    if (_mirrorDb) return _mirrorDb;
    _mirrorDb = new Promise((res) => {
      let settled = false, timer = null, r = null;
      const finish = (db) => {
        if (settled) { if (db) { try { db.close(); } catch (e) { /* late open after timeout: nothing owns it */ } } return; }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) db.onversionchange = () => { try { db.close(); } catch (e) { /* another lifecycle path closed it first */ } };
        res(db || null);
      };
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) { finish(null); return; }
        r = indexedDB.open(MIRROR_DB, MIRROR_VERSION);
      } catch (e) { finish(null); return; }   // SecurityError in some private modes: no mirror
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
      if (!db) _mirrorDb = null;   // never cache a failure: a slow open is not an absent store
      return db;
    });
    return _mirrorDb;
  }

  function mirrorQueue(key, json) {
    if (typeof indexedDB === "undefined" || !indexedDB) return;
    _mirrorPending.set(key, json);
    mirror.pending = _mirrorPending.size;
    if (_mirrorTimer !== null) return;
    if (typeof setTimeout !== "function") { mirrorFlush(); return; }
    _mirrorTimer = setTimeout(mirrorFlush, MIRROR_FLUSH_MS);
  }

  // One readwrite transaction per burst. Resolves on `oncomplete`, not on the
  // requests' success: a quota failure surfaces when the transaction commits.
  function mirrorFlush() {
    _mirrorTimer = null;
    const batch = _mirrorPending;
    _mirrorPending = new Map();
    mirror.pending = 0;
    if (!batch.size) return Promise.resolve(false);
    return mirrorOpen().then((db) => new Promise((res) => {
      if (!db) { res(false); return; }
      let t;
      try { t = db.transaction(MIRROR_STORE, "readwrite"); } catch (e) { res(false); return; }
      const os = t.objectStore(MIRROR_STORE);
      for (const [k, v] of batch) {
        if (v === null) os.delete(k); else os.put({ k, v });
      }
      t.oncomplete = () => { mirror.flushed += batch.size; res(true); };
      t.onerror = t.onabort = () => { res(false); };
    })).then((ok) => {
      if (!ok && batch.size) {
        mirror.failed += batch.size;
        Log.warn("game", "durable mirror write failed for " + batch.size + " key(s)");
      }
      return ok;
    });
  }

  // Boot: fill in whatever localStorage lacks. A key the disk already holds is
  // the newer truth (a save made before the mirror caught up) and is left alone.
  function mirrorRestore() {
    if (typeof indexedDB === "undefined" || !indexedDB || typeof localStorage === "undefined") return Promise.resolve(0);
    return mirrorOpen().then((db) => new Promise((res) => {
      if (!db) { res([]); return; }
      let r;
      try { r = db.transaction(MIRROR_STORE, "readonly").objectStore(MIRROR_STORE).getAll(); }
      catch (e) { res([]); return; }
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    })).then((rows) => {
      const restored = [];
      for (const row of rows) {
        if (!row || typeof row.k !== "string" || typeof row.v !== "string" || !mirrorKey(row.k)) continue;
        let present = null;
        try { present = localStorage.getItem(row.k); } catch (e) { return 0; }   // storage unreadable: nothing to restore into
        if (present !== null) continue;
        try { localStorage.setItem(row.k, row.v); } catch (e) { continue; }       // still no room: the mirror keeps it for next time
        store._cache.delete(row.k);
        store._keyRev.set(row.k, (store._keyRev.get(row.k) || 0) + 1);
        restored.push(row.k);
      }
      if (restored.length) {
        store.rev++;
        mirror.restored += restored.length;
        Log.info("game", "durable mirror restored " + restored.length + " key(s): " + restored.join(", "));
        for (const k of restored) store._notify({ key: k.slice("apex26.".length), fullKey: k, foreign: true, clear: false, restored: true });
      }
      return restored.length;
    }).catch((e) => {
      Log.warn("game", "durable mirror restore failed: " + ((e && e.message) || e));
      return 0;
    });
  }

  mirror.ready = mirrorRestore();
  store.mirror = mirror;           // { supported, restored, flushed, failed, pending, ready } — __apex.persistState()
  store.mirrorFlush = mirrorFlush; // flush the debounced batch now (tests; pagehide)

  // A tab closing mid-debounce would drop the last burst; pagehide is the one
  // reliable signal on mobile (unload never fires on iOS).
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pagehide", () => { mirrorFlush(); });
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
  function ttBoard(trackId) {
    const b = store.get("ttlb." + trackId, []);
    return Array.isArray(b) ? b : [];
  }
  function ttBoardAdd(trackId, entry) {
    if (!isFinite(entry.t) || entry.t <= 0) return ttBoard(trackId);
    const b = ttBoard(trackId);
    b.push(entry);
    b.sort((a, z) => a.t - z.t);
    if (b.length > TT_BOARD_MAX) b.length = TT_BOARD_MAX;
    store.set("ttlb." + trackId, b);
    return b;
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

  return { store, ttBoard, ttBoardAdd,
           hexToRgb, rgbToHex, seasonDriverId,
           migrateSeasonPoints,
           migrateCareer: SaveMigrate.migrateCareer,
           CAREER_V: SaveMigrate.CAREER_V };
})();
Object.freeze(GameStore);
