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
