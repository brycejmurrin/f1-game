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
    // `d` is the CALL-SITE default; js/data/settings-defaults.js outranks it when
    // it names this key, so a shipped default lives in one file instead of in
    // whichever module happened to read the key first. Opt-in per key, and
    // guarded on typeof so store.js still loads alone in a unit test.
    _def(k, d) {
      return (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(k))
        ? SettingsDefaults.get(k) : d;
    },
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
          return this._def(k, d);
        }
        this._cache.set(key, v);
      }
      return v === undefined ? this._def(k, d) : v;
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
      if (mirrorKey(key)) mirrorQueue(key, v === null || v === undefined ? null : JSON.stringify(v), durable);
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
      // null means NEVER SET on this lane, and several call sites read that as
      // meaningful — so a shipped default is substituted only for a key
      // js/data/settings-defaults.js actually names. Everything else still
      // answers null exactly as before.
      const short = shortKey(k);
      const def = () => (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(short))
        ? SettingsDefaults.get(short) : null;
      try { const v = localStorage.getItem(fullKey(k)); return v === null ? def() : v; }
      catch (e) { noteBroken(e, "read " + k); return def(); }
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

  function shortKey(k) { return k.indexOf("apex26.") === 0 ? k.slice("apex26.".length) : k; }
  function fullKey(k) { return "apex26." + shortKey(k); }

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
  // through the same foreign-write notification a second tab's write gets,
  // flagged `restored`, then once more as a `restoredBatch` naming every key —
  // career.js reloads its slot and pointer together on that, and the title menu
  // repaints — and every later boot is whole.
  const MIRROR_KEY = /^apex26\.(career|season)/;
  const MIRROR_DB = "apex26-store";
  const MIRROR_STORE = "kv";
  const MIRROR_VERSION = 1;
  const MIRROR_OPEN_MS = 4000;      // a blocked/never-settling open() degrades to "no mirror"
  const MIRROR_FLUSH_MS = 500;      // settleRound() writes the slot and the season back to back
  const MIRROR_RETRY_MS = 2000;     // one automatic retry; a later write/pagehide retries retained failures again
  const mirror = { supported: false, restored: 0, flushed: 0, failed: 0, pending: 0, ready: null };
  let _mirrorDb = null;             // memoised open (a failure is never memoised)
  let _mirrorPending = new Map();   // full key -> { v: JSON string or null for a delete, lsOk }
  // Keys THIS tab holds the newest value of (it wrote one the quota refused, or
  // restored a refused row): its later lsOk:true saves supersede that row — only
  // a PEER's lsOk:true write is the stale downgrade the B5 guard refuses.
  const _ownNewer = new Set();
  let _mirrorTimer = null;
  let _mirrorFlight = null;         // serialize bursts so an older transaction cannot finish last
  let _restoreDone = false;         // flush waits for mirrorRestore: a boot re-save must not overwrite the row it restores

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

  // lsOk: did localStorage accept this same write? A row stored with lsOk
  // false holds a value NEWER than the disk's copy (the quota refused it), so
  // restore must prefer it even though the key is present on disk.
  function mirrorQueue(key, json, lsOk) {
    if (typeof indexedDB === "undefined" || !indexedDB) return;
    if (lsOk === false) _ownNewer.add(key);
    _mirrorPending.set(key, { v: json, lsOk: lsOk !== false, own: _ownNewer.has(key) });
    mirror.pending = _mirrorPending.size;
    if (_mirrorTimer !== null) return;
    if (typeof setTimeout !== "function") { mirrorFlush(); return; }
    _mirrorTimer = setTimeout(mirrorFlush, MIRROR_FLUSH_MS);
  }

  // One readwrite transaction per burst. Resolves on `oncomplete`, not on the
  // requests' success: a quota failure surfaces when the transaction commits.
  function mirrorFlush(retryOnFailure = true) {
    // A manual/pagehide flush supersedes the debounce or retry already armed.
    // Without the clear, that stale callback wakes later and performs a second,
    // empty flush (and keeps a Node VM alive for the whole delay in unit tests).
    if (_mirrorTimer !== null && typeof clearTimeout === "function") clearTimeout(_mirrorTimer);
    _mirrorTimer = null;
    // Restore first: a flush before it could overwrite the lsOk:false row the
    // restore is about to prefer. The sentinel keeps mirrorQueue from arming a timer.
    if (!_restoreDone && mirror.ready) {
      _mirrorTimer = -1;
      return mirror.ready.then(() => { if (_mirrorTimer === -1) _mirrorTimer = null; return mirrorFlush(retryOnFailure); });
    }
    // IndexedDB normally queues overlapping readwrite transactions for the same
    // object store, but this owner must not depend on backend scheduling for its
    // newest-value guarantee. Wait before taking the next batch so a failed old
    // write can merge back without hiding a newer pending value for the key.
    if (_mirrorFlight) {
      const prior = _mirrorFlight;
      return prior.then(() => mirrorFlush(retryOnFailure), () => mirrorFlush(retryOnFailure));
    }
    const batch = _mirrorPending;
    _mirrorPending = new Map();
    mirror.pending = 0;
    if (!batch.size) return Promise.resolve(false);
    const work = mirrorOpen().then((db) => new Promise((res) => {
      if (!db) { res(false); return; }
      let t;
      try { t = db.transaction(MIRROR_STORE, "readwrite"); } catch (e) { res(false); return; }
      const os = t.objectStore(MIRROR_STORE);
      for (const [k, e] of batch) {
        if (e.v === null) { os.delete(k); continue; }
        // Cross-tab: a quota-refused (lsOk:false) row is the only durable copy
        // of a newer save. A peer tab that never saw storage events can still
        // flush lsOk:true with an OLDER value — refuse that downgrade (BUGS.md B5).
        // Same payload with lsOk:true is fine (boot healed the disk and agrees).
        const getReq = os.get(k);
        getReq.onsuccess = () => {
          const prev = getReq.result;
          if (prev && prev.lsOk === false && e.lsOk === true && e.v !== prev.v && !e.own) return;
          os.put({ k, v: e.v, lsOk: e.lsOk });
        };
      }
      t.oncomplete = () => { mirror.flushed += batch.size; res(true); };
      t.onerror = t.onabort = () => { res(false); };
    })).then((ok) => {
      if (!ok && batch.size) {
        mirror.failed += batch.size;
        // The batch stopped being pending before the transaction opened. Put it
        // back on failure, but never replace a newer value queued for the same
        // key while this transaction was in flight. Otherwise a transient IDB
        // abort is permanent data loss precisely when localStorage also refused
        // the write and the mirror is the only durable route left.
        for (const [k, v] of batch) if (!_mirrorPending.has(k)) _mirrorPending.set(k, v);
        mirror.pending = _mirrorPending.size;
        Log.warn("game", "durable mirror write failed for " + batch.size + " key(s)");
        // Retry once automatically. If storage remains unavailable, retain the
        // batch for the next write or pagehide instead of spinning forever.
        if (retryOnFailure && typeof setTimeout === "function" && _mirrorTimer === null) {
          _mirrorTimer = setTimeout(() => mirrorFlush(false), MIRROR_RETRY_MS);
        }
      }
      return ok;
    });
    let flight;
    flight = work.finally(() => { if (_mirrorFlight === flight) _mirrorFlight = null; });
    _mirrorFlight = flight;
    return flight;
  }

  // Boot: fill in whatever localStorage lacks. A key the disk already holds is
  // the newer truth (a save made before the mirror caught up) and is left alone
  // — UNLESS the row says the disk REFUSED that write (lsOk false): then the
  // disk holds the older value, and the boot's own re-save of it (Career.load)
  // must neither win here nor overwrite the row when the queue flushes.
  function mirrorRestore() {
    if (typeof indexedDB === "undefined" || !indexedDB || typeof localStorage === "undefined") { _restoreDone = true; return Promise.resolve(0); }
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
        const newer = row.lsOk === false && present !== row.v;
        if (present !== null && !newer) continue;
        if (newer) {
          // Drop the boot's re-save of the stale disk copy; a genuinely new
          // write in the meantime (a different value) is kept and wins.
          const p = _mirrorPending.get(row.k);
          if (p && p.v === present) _mirrorPending.delete(row.k);
        }
        let landed = true;
        try { localStorage.setItem(row.k, row.v); } catch (e) { landed = false; }
        if (!landed) {
          if (!newer) continue;             // still no room: the mirror keeps it for next time
          // Still no room, but the session must run on the newer value, not the
          // stale disk copy: serve it from the cache; the row stays lsOk:false.
          try { store._cache.set(row.k, JSON.parse(row.v)); } catch (e) { continue; }
          _ownNewer.add(row.k);             // this session runs on the newest value: its saves supersede the row
        } else {
          if (newer) mirrorQueue(row.k, row.v, true);   // the disk has it now
          store._cache.delete(row.k);
        }
        store._keyRev.set(row.k, (store._keyRev.get(row.k) || 0) + 1);
        restored.push(row.k);
      }
      if (restored.length) {
        store.rev++;
        mirror.restored += restored.length;
        Log.info("game", "durable mirror restored " + restored.length + " key(s): " + restored.join(", "));
        const restoredKeys = restored.map((k) => k.slice("apex26.".length));
        for (let i = 0; i < restored.length; i++) store._notify({
          key: restoredKeys[i], fullKey: restored[i], foreign: true, clear: false, restored: true,
        });
        // Every row is already back on disk before notifications begin. The
        // batch event lets owners reconcile related keys atomically — notably a
        // career slot and the careerSlot pointer that selects it — rather than
        // trying to infer completeness from IndexedDB's key order.
        store._notify({
          key: null, keys: restoredKeys.slice(), foreign: true, clear: false,
          restored: true, restoredBatch: true,
        });
      }
      return restored.length;
    }).catch((e) => {
      Log.warn("game", "durable mirror restore failed: " + ((e && e.message) || e));
      return 0;
    }).then((n) => { _restoreDone = true; return n; });
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
  // CLASSES are capped too. A context is a whole stringified car config (ghost.js
  // config(), ~550 chars stored in every entry), and career progression mints a
  // new one each round (tierV moves with tdev), so an uncapped board filled the
  // quota with no player intent — and the failed write raised the permanent
  // SESSION ONLY banner. Keep the class holding the circuit record (the select
  // screen reads board[0].t as "best across setups": a plain LRU would silently
  // regress it), the class being written, and the most recently driven rest.
  const TT_CLASS_MAX = 6;
  function ttBoard(trackId, context) {
    const b = store.get("ttlb." + trackId, []);
    return Array.isArray(b) ? b.filter(e => e && Number.isFinite(e.t) && e.t > 0 && (context === undefined || (e.context || null) === context)) : [];
  }
  function ttBoardAdd(trackId, entry) {
    if (!isFinite(entry.t) || entry.t <= 0) return ttBoard(trackId);
    const b = ttBoard(trackId);
    b.push(entry);
    b.sort((a, z) => a.t - z.t);
    // Ten laps PER comparable class. Existing unversioned entries stay legacy.
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
    store.set("ttlb." + trackId, kept);
    return kept;
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
