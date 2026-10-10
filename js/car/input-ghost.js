/* InputGhost: local deterministic ghosts — record player inputs + seed +
 * physics/build version at the fixed physics timestep, and replay them as a
 * ghost car. Sibling of pose Ghost (js/car/ghost.js): pose stays the cheap
 * visual/PB path; this module is for sim-faithful local replay only (no
 * backend, no online leaderboards). */
"use strict";

const InputGhost = (function () {
  const STORE_KEY = "inputGhost.v1";
  const KEY = "apex26." + STORE_KEY;
  const MAX_STORE_BYTES = 256 * 1024;   // half the pose budget — inputs pack denser
  const MIN_STEPS = 30;                 // half a second at 60 Hz
  // A lap left open (parked, stuck, AFK) grew two arrays per physics step without
  // bound (~3-4 MB/h), and with no best yet a one-hour lap became the ghost.
  // Ten minutes is several times the slowest lap of the longest circuit (7 km):
  // past it the lap is dropped, as an invalid one is.
  const MAX_LAP_S = 600;
  const DEFAULT_DT = 1 / 60;

  let trackId = null, context = null, storageId = null;
  let best = null;               // finished envelope for current track/class
  let rec = null;                // in-progress: { steer:Int8[], flags:Uint8[], n }
  let meta = null;               // { seed, physRev, build, dt } for the open lap
  let replayStep = 0;            // cursor while driving a ghost car

  let storeCache = null;
  let accessClock = Date.now();
  const pending = new Map();
  let _enc = null;
  const clamp = M4.clamp;

  function round(v, places) {
    const m = Math.pow(10, places);
    return Math.round(v * m) / m;
  }
  function byteLength(json) {
    if (typeof TextEncoder === "function") {
      if (!_enc) _enc = new TextEncoder();
      return _enc.encode(json).byteLength;
    }
    return json.length * 2;
  }
  function contextKey(value) {
    const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
    return JSON.stringify(stable(value));
  }
  function currentBuild() {
    try {
      if (typeof window !== "undefined" && Number.isFinite(window.__APEX_BUILD))
        return window.__APEX_BUILD >>> 0;
    } catch { /* no window */ }
    return 0;
  }
  function currentPhysRev() {
    try {
      if (typeof PhysicsConsts !== "undefined" && PhysicsConsts && PhysicsConsts.REVISION)
        return String(PhysicsConsts.REVISION);
    } catch { /* harness */ }
    return "";
  }
  function currentDt() {
    try {
      if (typeof PhysicsConsts !== "undefined" && PhysicsConsts && PhysicsConsts.FIXED_DT > 0)
        return PhysicsConsts.FIXED_DT;
    } catch { /* harness */ }
    return DEFAULT_DT;
  }

  function quantizeSteer(steer) {
    return clamp(Math.round((Number(steer) || 0) * 127), -127, 127);
  }
  function packFlags(inp) {
    let f = 0;
    if (!inp) return f;
    if (inp.throttle || (inp.throttleLevel != null && inp.throttleLevel > 0.5)) f |= 1;
    if (inp.brake || (inp.brakeLevel != null && inp.brakeLevel > 0.5)) f |= 2;
    return f;
  }
  function decodeStep(steerQ, flags) {
    return {
      steer: (steerQ | 0) / 127,
      throttle: !!(flags & 1),
      brake: !!(flags & 2),
      throttleLevel: (flags & 1) ? 1 : 0,
      brakeLevel: (flags & 2) ? 1 : 0,
    };
  }

  function valid(g) {
    if (!g || !(g.time > 0) || !Number.isFinite(g.time)) return false;
    if (!Number.isFinite(g.seed) || g.seed <= 0) return false;
    if (!(g.dt > 0) || !Number.isFinite(g.dt)) return false;
    if (typeof g.physRev !== "string" || !g.physRev) return false;
    if (!Number.isFinite(g.build)) return false;
    const st = g.steer, fl = g.flags;
    if (!Array.isArray(st) || !Array.isArray(fl) || st.length < MIN_STEPS || st.length !== fl.length)
      return false;
    return st.every((v, i) => Number.isFinite(v) && Number.isFinite(fl[i])
      && v >= -127 && v <= 127 && fl[i] >= 0 && fl[i] <= 3);
  }
  function compatible(g) {
    if (!valid(g)) return false;
    if (g.physRev !== currentPhysRev()) return false;
    // Build 0 means "dev / unknown" on either side — accept so VM harnesses and
    // unstamped shells still round-trip. A stamped recording refuses a different
    // stamped build.
    const here = currentBuild();
    if (g.build !== 0 && here !== 0 && g.build !== here) return false;
    const dt = currentDt();
    if (Math.abs(g.dt - dt) > 1e-9) return false;
    return true;
  }

  function loadStore() {
    if (storeCache) return storeCache;
    let parsed = null;
    try {
      if (typeof GameStore !== "undefined" && GameStore && GameStore.store)
        parsed = GameStore.store.get(STORE_KEY, null);
    } catch { parsed = null; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (parsed !== null && typeof Log !== "undefined")
        Log.warn("car", "input-ghost store was not an object; starting empty");
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
    let size = byteLength(json);
    while (oldest.length > 0 && size > MAX_STORE_BYTES) {
      const id = oldest.shift();
      size -= byteLength(JSON.stringify(id) + ":" + JSON.stringify(store[id]) + ",");
      delete store[id];
      changed = true;
    }
    return { changed };
  }
  function saveStore(store) {
    storeCache = store;
    trimStore(store);
    if (typeof GameStore === "undefined" || !GameStore || !GameStore.store)
      return { durable: false };
    return GameStore.store.write(STORE_KEY, store);
  }
  // Another tab wrote the store (GameStore's `storage` listener): forget the
  // cached copy, re-read it, and lay this tab's unsaved laps back on top, so the
  // next save does not write a stale whole-object over the other tab's ghosts.
  function betterGhost(a, b) {
    const av = valid(a), bv = valid(b);
    if (!av) return bv ? b : null;
    if (!bv) return a;
    const ac = compatible(a), bc = compatible(b);
    if (ac !== bc) return ac ? a : b;
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
    let fresh = null;
    try { fresh = GameStore.store.get(STORE_KEY, {}); } catch { fresh = null; }
    if (!fresh || typeof fresh !== "object" || Array.isArray(fresh)) fresh = {};
    for (const [id, snap] of pending) {
      const winner = betterGhost(fresh[id], snap);
      if (winner) fresh[id] = winner;
    }
    storeCache = fresh;
    const current = storageId == null ? null : fresh[storageId];
    best = valid(current) ? current : null;
  }
  if (typeof GameStore !== "undefined" && GameStore && GameStore.store && typeof GameStore.store.subscribe === "function")
    GameStore.store.subscribe(onStoreChange);

  function scheduleSave(id, snap) {
    touch(snap);
    pending.set(id, snap);
    loadStore()[id] = snap;
    const write = () => {
      if (pending.get(id) !== snap) return;
      try {
        const store = loadStore();
        const result = saveStore(store);
        if (result.durable) {
          if (pending.get(id) === snap) pending.delete(id);
          if (typeof Log !== "undefined") Log.info("car", `input-ghost save ${id}`);
        } else if (typeof Log !== "undefined") {
          Log.warn("car", `input-ghost save ${id} is session-only`);
        }
      } catch {
        if (typeof Log !== "undefined") Log.warn("car", "input-ghost save fail");
      }
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => write());
    else if (typeof setTimeout === "function") setTimeout(write, 0);
    else write();
  }

  function setTrack(id, eventContext) {
    trackId = id;
    context = eventContext == null ? null : eventContext;
    storageId = context == null ? id : "v2:" + id + ":" + context;
    const g = loadStore()[storageId];
    const good = valid(g);
    if (good) touch(g);
    best = good ? g : null;
    rec = null;
    meta = null;
    replayStep = 0;
    if (typeof Log !== "undefined")
      Log.info("car", `input-ghost load ${id}${best ? " ok" : " none"}`);
  }

  function startLap(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    meta = {
      seed: Number.isFinite(o.seed) && o.seed > 0 ? (o.seed >>> 0) : 1,
      physRev: o.physRev != null ? String(o.physRev) : currentPhysRev(),
      build: Number.isFinite(o.build) ? (o.build >>> 0) : currentBuild(),
      dt: o.dt > 0 ? +o.dt : currentDt(),
    };
    rec = { steer: [], flags: [], n: 0 };
    replayStep = 0;
  }

  function record(inp) {
    if (!rec) return;
    if (rec.n >= MAX_LAP_S / (meta && meta.dt > 0 ? meta.dt : DEFAULT_DT)) { rec = null; return; }
    rec.steer.push(quantizeSteer(inp && inp.steer));
    rec.flags.push(packFlags(inp));
    rec.n++;
  }

  function finishLap(lapTime, extraMeta) {
    if (!Number.isFinite(lapTime) || lapTime <= 0) { rec = null; return false; }
    if (!rec || rec.n < MIN_STEPS || !meta) { rec = null; return false; }
    const done = rec;
    const m = meta;
    rec = null;
    meta = null;
    // A stored ghost from another physics revision / build is not a record to
    // beat: it cannot be replayed, and it would otherwise block every later lap.
    if (best && compatible(best) && lapTime >= best.time) return false;
    const snap = {
      v: 1,
      kind: "input-ghost",
      track: trackId,
      time: round(lapTime, 3),
      seed: m.seed,
      physRev: m.physRev,
      build: m.build,
      dt: m.dt,
      steer: done.steer,
      flags: done.flags,
    };
    if (context != null) snap.context = context;
    if (extraMeta && typeof extraMeta === "object") snap.meta = Object.assign({}, extraMeta);
    best = snap;
    if (storageId != null) scheduleSave(storageId, best);
    return true;
  }

  function hasGhost() { return !!best; }
  function bestTime() { return best ? best.time : Infinity; }
  function snapshot() {
    if (!best) return null;
    return {
      v: best.v, kind: best.kind, track: best.track, time: best.time,
      seed: best.seed, physRev: best.physRev, build: best.build, dt: best.dt,
      steer: best.steer.slice(), flags: best.flags.slice(),
      context: best.context, meta: best.meta ? Object.assign({}, best.meta) : undefined,
    };
  }
  function envelope() { return best; }
  function steps() { return best ? best.steer.length : 0; }

  function atStep(i) {
    if (!best || !compatible(best)) return null;
    const n = best.steer.length;
    if (n === 0) return null;
    const idx = i < 0 ? 0 : (i >= n ? n - 1 : i | 0);
    return decodeStep(best.steer[idx], best.flags[idx]);
  }

  /** Begin driving the stored ghost from step 0. Returns false if incompatible. */
  function beginReplay() {
    if (!best || !compatible(best)) { replayStep = 0; return false; }
    replayStep = 0;
    return true;
  }
  /** Next fixed-timestep input for a ghost car (`c.netInput = InputGhost.next()`). */
  function next() {
    const inp = atStep(replayStep);
    if (inp) replayStep++;
    return inp;
  }
  function replayIndex() { return replayStep; }

  function clear(id) {
    const store = loadStore();
    if (id == null) {
      for (const k of Object.keys(store)) delete store[k];
      best = null;
    } else {
      delete store[id];
      if (storageId === id) best = null;
    }
    saveStore(store);
    pending.clear();
  }

  function flush() {
    for (const [id, snap] of pending) {
      try {
        const store = loadStore();
        store[id] = snap;
        saveStore(store);
      } catch { /* best effort */ }
    }
    pending.clear();
  }

  return {
    STORE_KEY, KEY, MIN_STEPS, MAX_LAP_S, DEFAULT_DT,
    setTrack, startLap, record, finishLap,
    hasGhost, bestTime, snapshot, envelope, steps,
    atStep, beginReplay, next, replayIndex,
    compatible, valid, contextKey, quantizeSteer, packFlags, decodeStep,
    clear, flush, track: () => trackId, context: () => context,
    currentBuild, currentPhysRev, currentDt,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = InputGhost;
