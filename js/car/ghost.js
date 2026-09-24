/* Ghost: records the player's lap and replays the best one as a translucent "ghost" car to race against — the core time-attack loop. Pure data layer (no rendering): one apex26.ghost.v1 store keyed by circuit id. */
"use strict";

const Ghost = (function () {
  const STORE_KEY = "ghost.v1";
  const KEY = "apex26." + STORE_KEY;
  const OLD_KEY = "apex_ghost_v1";   // pre-convention key; migrated once on load
  // One full trace measures about 40 KiB at 20 Hz. Reserve at most 512 KiB
  // (roughly twelve traces) in the shared localStorage bucket so ghosts cannot
  // crowd out career/settings saves.
  const MAX_STORE_BYTES = 512 * 1024;
  const HZ = 20;                 // samples per second while recording
  const MIN_SAMPLES = 8;         // ignore degenerate "laps"

  // One-time migration: adopt any store saved under the old, non-conforming key.
  (function migrateKey() {
    try {
      if (typeof localStorage === "undefined") return;
      if (localStorage.getItem(KEY) === null) {
        const old = localStorage.getItem(OLD_KEY);
        if (old !== null) {
          const parsed = JSON.parse(old);
          const result = GameStore.store.write(STORE_KEY, parsed);
          if (result.durable) localStorage.removeItem(OLD_KEY);
        }
      }
    } catch { /* storage disabled — nothing to migrate */ }
  })();

  let trackId = null, context = null, storageId = null;
  let best = null;               // { time, t:[], s:[], x:[] } for current track
  let rec = null;                // in-progress lap: { t:[], s:[], x:[] }
  let lastSampleT = -1;

  function round(v, places = 0) {
    const m = Math.pow(10, places);
    return Math.round(v * m) / m;
  }

  // Parsed once and kept: setTrack() runs on EVERY loadTrack (each menu-flyby
  // build), and re-parsing the whole store to read one entry was a ~40 KB
  // JSON.parse per circuit browse. Only a plain object is accepted —
  // `JSON.parse(raw) || {}` let "5", "true" and "[]" through, and every later
  // `store[id] = snap` then threw for the rest of the session. The `{}`
  // fallback is memoised too, so a corrupt key costs one parse.
  let storeCache = null;
  let accessClock = Date.now();
  let repairQueued = false;
  const pending = new Map();
  function loadStore() {
    if (storeCache) return storeCache;
    let parsed = GameStore.store.get(STORE_KEY, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (parsed !== null) Log.warn("car", "ghost store was not an object; starting empty");
      parsed = {};
    }
    for (const g of Object.values(parsed)) {
      if (g && Number.isFinite(g._used)) accessClock = Math.max(accessClock, g._used);
    }
    storeCache = parsed;
    return storeCache;
  }
  function touch(g) {
    accessClock = Math.max(accessClock + 1, Date.now());
    g._used = accessClock;
  }
  // ONE encoder, not one per call. trimStore() asks for a byte length after
  // every eviction, so a fresh TextEncoder per question allocated one per
  // iteration on top of encoding the whole store again.
  let _enc = null;
  function byteLength(json) {
    if (typeof TextEncoder === "function") {
      if (!_enc) _enc = new TextEncoder();
      return _enc.encode(json).byteLength;
    }
    // Ghost payloads are numeric arrays plus ASCII ids in normal play. Twice
    // UTF-16 length is a conservative fallback where TextEncoder is absent.
    return json.length * 2;
  }
  function thinTrace(g) {
    if (!g || !Array.isArray(g.t) || !Array.isArray(g.s) || !Array.isArray(g.x)) return false;
    const n = g.t.length;
    if (n <= MIN_SAMPLES || g.s.length !== n || g.x.length !== n) return false;
    const count = Math.max(MIN_SAMPLES, Math.ceil(n / 2));
    const indices = Array.from({ length: count }, (_, i) => Math.round(i * (n - 1) / (count - 1)));
    g.t = indices.map(i => g.t[i]);
    g.s = indices.map(i => g.s[i]);
    g.x = indices.map(i => g.x[i]);
    return true;
  }
  function trimStore(store) {
    let json = JSON.stringify(store);
    if (byteLength(json) <= MAX_STORE_BYTES) return { changed: false };
    let changed = false;
    for (const id of Object.keys(store)) {
      if (!valid(store[id])) { delete store[id]; changed = true; }
    }
    json = JSON.stringify(store);
    const oldest = Object.keys(store).sort((a, b) => {
      const at = Number.isFinite(store[a] && store[a]._used) ? store[a]._used : 0;
      const bt = Number.isFinite(store[b] && store[b]._used) ? store[b]._used : 0;
      return at - bt;
    });
    // O(n) rather than O(n^2). Re-serialising the WHOLE store after each
    // eviction meant encoding up to MAX_STORE_BYTES (512 KB) once per entry
    // dropped, on a path that already runs on the lap-line frame's idle
    // callback. A JSON object's length is its entries plus their separators,
    // so an entry's own contribution is exactly computable and can simply be
    // subtracted; the loop then costs one stringify per entry it measures
    // instead of one per entry it drops, and the exact length is recomputed
    // once at the end so nothing downstream reads an estimate.
    let size = byteLength(json);
    while (oldest.length > 1 && size > MAX_STORE_BYTES) {
      const id = oldest.shift();
      // `"id":<value>,` — the comma is present for every entry but the last,
      // and one over-count per eviction only makes the estimate conservative.
      size -= byteLength(JSON.stringify(id) + ":" + JSON.stringify(store[id]) + ",");
      delete store[id];
      changed = true;
    }
    json = JSON.stringify(store);
    const last = oldest[0];
    while (last && byteLength(json) > MAX_STORE_BYTES && thinTrace(store[last])) {
      changed = true;
      json = JSON.stringify(store);
    }
    if (last && byteLength(json) > MAX_STORE_BYTES) {
      delete store[last];
      changed = true;
    }
    return { changed };
  }
  function queueRepair() {
    if (repairQueued) return;
    repairQueued = true;
    const run = () => {
      repairQueued = false;
      if (!storeCache) return;
      const repaired = trimStore(storeCache);
      if (!repaired.changed) return;
      const result = GameStore.store.write(STORE_KEY, storeCache);
      if (!result.durable) Log.warn("car", "ghost budget repair is session-only");
    };
    // loadTrack selects the plain circuit first; time-trial records.begin()
    // selects its comparable context later in the same task. Repair afterward
    // so that final entry gets its LRU promotion before anything is evicted.
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else if (typeof setTimeout === "function") setTimeout(run, 0);
    else run();
  }
  function betterGhost(a, b) {
    const av = valid(a), bv = valid(b);
    if (!av) return bv ? b : null;
    if (!bv) return a;
    const winner = a.time <= b.time ? a : b;
    winner._used = Math.max(Number(a._used) || 0, Number(b._used) || 0);
    return winner;
  }
  function onStoreChange(change) {
    if (!change || !change.foreign) return;
    if (change.clear) {
      pending.clear();
      storeCache = null;
      best = null;
      return;
    }
    if (change.key !== STORE_KEY) return;
    let fresh = GameStore.store.get(STORE_KEY, {});
    if (!fresh || typeof fresh !== "object" || Array.isArray(fresh)) fresh = {};
    for (const [id, snap] of pending) {
      const winner = betterGhost(fresh[id], snap);
      if (winner) fresh[id] = winner;
    }
    storeCache = fresh;
    const current = storageId == null ? null : fresh[storageId];
    best = valid(current) ? current : null;
  }
  if (typeof GameStore.store.subscribe === "function") GameStore.store.subscribe(onStoreChange);
  function saveStore(store) {
    storeCache = store;
    trimStore(store);
    const result = GameStore.store.write(STORE_KEY, store);
    return result;
  }

  // Canonical JSON is collision-free and stable across object insertion order.
  function contextKey(value) {
    const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
    return JSON.stringify(stable(value));
  }
  function valid(g) {
    if (!g || !(g.time > 0) || !Number.isFinite(g.time)) return false;
    const { t, s, x } = g;
    if (!Array.isArray(t) || !Array.isArray(s) || !Array.isArray(x) || s.length < MIN_SAMPLES || t.length !== s.length || x.length !== s.length) return false;
    return t.every((v, i) => Number.isFinite(v) && Number.isFinite(s[i]) && Number.isFinite(x[i])
      && v >= 0 && (i === 0 || (v >= t[i - 1] && s[i] >= s[i - 1])));
  }
  function setTrack(id, eventContext = null) {
    trackId = id; context = eventContext;
    storageId = context == null ? id : "v2:" + id + ":" + context;
    const g = loadStore()[storageId];
    const good = valid(g);
    if (good) touch(g);
    queueRepair();
    best = good ? g : null;
    rec = null;
    lastSampleT = -1;
    Log.info("car", `ghost load ${id}${best ? " ok" : " none"}`);
  }

  function hasGhost() { return !!best; }
  function bestTime() { return best ? best.time : Infinity; }
  // Export a detached lap for GhostShare. The portable guest path must never
  // retain or mutate this module's live PB arrays or metadata.
  function snapshot() {
    if (!best) return null;
    const out = { time: best.time, t: best.t.slice(), s: best.s.slice(), x: best.x.slice() };
    if (best.meta && typeof best.meta === "object") out.meta = Object.assign({}, best.meta);
    return out;
  }
  function meta() { return best && best.meta && typeof best.meta === "object" ? best.meta : null; }
  function medal() {
    const m = meta();
    return m && typeof m.medal === "string" ? m.medal : null;
  }

  // Begin recording a fresh lap (call at each lap start / lights-out).
  function startLap() {
    rec = { t: [], s: [], x: [] };
    lastSampleT = -1;
  }

  function record(t, s, x) {
    if (!rec) return;
    if (rec.t.length && t - lastSampleT < 1 / HZ) return;
    if (rec.s.length && s < rec.s[rec.s.length - 1]) return;
    lastSampleT = t;
    rec.t.push(round(t, 3));
    rec.s.push(round(s, 2));
    rec.x.push(round(x, 2));
  }

  // The store write is deferred: loadStore/saveStore parse and stringify EVERY
  // circuit's ghost (~40 KB each) and finishLap runs inside updateCar on the
  // lap-line frame of a new record — the one-frame hitch PERF-FINDINGS §2 records.
  function scheduleSave(id, snap) {
    touch(snap);
    pending.set(id, snap);
    loadStore()[id] = snap;   // immediately visible if another class is selected before idle
    const write = () => {
      _flushes.delete(write);
      if (pending.get(id) !== snap) return;   // cleared or superseded before the deferred write
      try {
        const store = loadStore();
        const result = saveStore(store);
        if (result.durable) {
          if (pending.get(id) === snap) pending.delete(id);
          Log.info("car", `ghost save ${id}`);
        }
        else Log.warn("car", `ghost save ${id} is session-only`);
      } catch { Log.warn("car", "ghost save fail"); }
    };
    if (typeof requestIdleCallback === "function") {
      // A LONG idle slot only: the write (trim + 2-3 stringifies of a store of up
      // to 512 KB + setItem) is one 5-30 ms job on a phone. With a 2 s timeout it
      // ran mid-race — a frame's idle tail is < 16 ms, so it overran into the next
      // frame. A 25 ms slot comes with pause, menus or results; pagehide flushes.
      const idle = (dl) => {
        if (pending.get(id) !== snap) return;
        if (dl && typeof dl.timeRemaining === "function" && dl.timeRemaining() < 25) { requestIdleCallback(idle); return; }
        write();
      };
      requestIdleCallback(idle);
      armFlush(write);
    }
    else if (typeof setTimeout === "function") setTimeout(write, 0);
    else write();   // bare VM harness: no scheduler, write now
  }
  // Leaving the page with a record still pending: write it now (synchronous
  // localStorage is allowed in pagehide), or the new ghost dies with the tab.
  const _flushes = new Set();
  let _flushArmed = false;
  function armFlush(fn) {
    _flushes.add(fn);
    if (_flushArmed || typeof addEventListener !== "function") return;
    _flushArmed = true;
    addEventListener("pagehide", () => {
      const fns = Array.from(_flushes); _flushes.clear();
      for (const f of fns) { try { f(); } catch (_) { /* best effort on the way out */ } }
    });
  }

  // `meta` (optional, a plain object — medal, pole, pace, weather) is stored
  // beside the lap it belongs to and only when that lap becomes the ghost, so
  // Ghost.meta() always describes the lap the player is racing against.
  function finishLap(lapTime, meta) {
    if (!Number.isFinite(lapTime) || lapTime <= 0) { rec = null; return false; }
    if (!rec || rec.t.length < MIN_SAMPLES) { rec = null; return false; }
    const done = rec;
    rec = null;
    if (lapTime >= bestTime()) return false;
    best = { time: round(lapTime, 3), t: done.t, s: done.s, x: done.x };
    if (meta && typeof meta === "object") best.meta = meta;
    if (storageId != null) scheduleSave(storageId, best);
    return true;
  }

  // Binary search: largest index with arr[i] <= val.
  function findFloorIndex(arr, val) {
    let lo = 0, hi = arr.length - 1;
    if (val <= arr[0]) return 0;
    if (val >= arr[hi]) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= val) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Pooled return — at() runs per HUD tick (minimap dot + gap delta); callers
  // read it synchronously and never retain it.
  const atOut = { s: 0, x: 0, done: false };
  function at(t) {
    if (!best) return null;
    const ts = best.t, ss = best.s, xs = best.x, n = ts.length;
    if (n === 0) return null;
    if (t >= ts[n - 1]) {
      atOut.s = ss[n - 1]; atOut.x = xs[n - 1]; atOut.done = true;
      return atOut;
    }
    if (t <= ts[0]) {
      atOut.s = ss[0]; atOut.x = xs[0]; atOut.done = false;
      return atOut;
    }
    const i = findFloorIndex(ts, t);
    const j = Math.min(i + 1, n - 1);
    const span = ts[j] - ts[i];
    const f = span > 1e-6 ? Math.max(0, Math.min(1, (t - ts[i]) / span)) : 0;
    atOut.s = ss[i] + (ss[j] - ss[i]) * f; atOut.x = xs[i] + (xs[j] - xs[i]) * f; atOut.done = false;
    return atOut;
  }

  function timeAt(s) {
    if (!best || !best.s || !best.s.length) return null;
    const ss = best.s, ts = best.t, n = ss.length;
    if (n === 0) return null;
    if (s <= ss[0]) return ts[0];
    if (s >= ss[n - 1]) return ts[n - 1];
    const lo = findFloorIndex(ss, s);
    const j = Math.min(lo + 1, n - 1);
    const span = ss[j] - ss[lo];
    const f = span > 0.1 ? Math.max(0, Math.min(1, (s - ss[lo]) / span)) : 0;
    return ts[lo] + (ts[j] - ts[lo]) * f;
  }

  function clear(id) {
    if (id == null) {
      pending.clear();
      saveStore({});
      best = null;
      return;
    }
    const store = loadStore();
    const target = context != null && id === trackId ? storageId : id;
    pending.delete(target);
    delete store[target];
    saveStore(store);
    if (id === trackId) best = null;
  }
  function speedAt(t) {
    if (!best || !Number.isFinite(t) || t < 0 || t > best.time) return null;
    const i = Math.min(best.t.length - 2, Math.max(0, findFloorIndex(best.t, t)));
    const dt = best.t[i + 1] - best.t[i];
    return dt > 1e-6 ? (best.s[i + 1] - best.s[i]) / dt : null;
  }

  return {
    setTrack, startLap, record, finishLap, at, timeAt, contextKey,
    context: () => context, track: () => trackId,
    hasGhost, bestTime, snapshot, meta, medal, clear, speedAt,
  };
})();

// Allow use under Node for unit tests (and as a browser global otherwise).
if (typeof module !== "undefined" && module.exports) module.exports = Ghost;
