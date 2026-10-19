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
  let lastSave = { durable: false, reason: "no recording" };
  let replayStep = 0, replayNative = false;            // cursor while driving a ghost car

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
    if (inp.throttle != null ? inp.throttle : (inp.throttleLevel != null && inp.throttleLevel > 0)) f |= 1;
    if (inp.brake != null ? inp.brake : (inp.brakeLevel != null && inp.brakeLevel > 0)) f |= 2;
    if (inp.aero) f |= 4;
    if (inp.overtake) f |= 8;
    if (inp.boost) f |= 16;
    if (inp.shiftUp) f |= 32;
    if (inp.shiftDown) f |= 64;
    if (inp.aeroToggle) f |= 128;
    return f;
  }
  function quantizePedal(level, enabled) {
    return Math.round(clamp(Number.isFinite(level) ? level : (enabled ? 1 : 0), 0, 1) * 255);
  }
  function decodeStep(steerQ, flags, throttleQ, brakeQ) {
    return {
      steer: (steerQ | 0) / 127,
      throttle: !!(flags & 1),
      brake: !!(flags & 2),
      aero: !!(flags & 4), overtake: !!(flags & 8), boost: !!(flags & 16),
      shiftUp: !!(flags & 32), shiftDown: !!(flags & 64), aeroToggle: !!(flags & 128),
      throttleLevel: throttleQ == null ? ((flags & 1) ? 1 : 0) : throttleQ / 255,
      brakeLevel: brakeQ == null ? ((flags & 2) ? 1 : 0) : brakeQ / 255,
    };
  }

  function valid(g) {
    if (!g || !(g.time > 0) || !Number.isFinite(g.time)) return false;
    if (!Number.isFinite(g.seed) || g.seed <= 0) return false;
    if (!(g.dt > 0) || !Number.isFinite(g.dt) || (g.steer && g.steer.length > MAX_LAP_S / g.dt)) return false;
    if (typeof g.physRev !== "string" || !g.physRev) return false;
    if (!Number.isFinite(g.build)) return false;
    if (g.v != null && g.v !== 1 && g.v !== 2 && g.v !== 3) return false;
    if (g.v >= 2 && ![g.throttle, g.brake].every(a => Array.isArray(a)
      && a.length === g.steer?.length && a.every(v => Number.isInteger(v) && v >= 0 && v <= 255))) return false;
    if (g.v === 3) {
      const start = g.initialState;
      if (!start || !start.car || ![start.seed, start.rngState, start.raceT, start.car.s, start.car.x, start.car.speed].every(Number.isFinite)
          || typeof g.context !== "string" || !g.context) return false;
    }
    if (g.v === 3 && ![g.rawSteer, g.rawThrottle, g.rawBrake].every(a => Array.isArray(a) && a.length === g.steer?.length && a.every((v) => Number.isFinite(v) && v >= (a === g.rawSteer ? -1 : 0) && v <= 1))) return false;
    const st = g.steer, fl = g.flags;
    if (!Array.isArray(st) || !Array.isArray(fl) || st.length < MIN_STEPS || st.length !== fl.length)
      return false;
    return st.every((v, i) => Number.isFinite(v) && Number.isInteger(fl[i])
      && v >= -127 && v <= 127 && fl[i] >= 0 && fl[i] <= (g.v === 3 ? 255 : 3));
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

  // Lossless v3 disk channels: constants cost one number; varying doubles
  // use explicit little-endian bytes. Quantized legacy mirrors are rebuilt.
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function encodeBytes(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const n = bytes[i] * 65536 + (bytes[i + 1] || 0) * 256 + (bytes[i + 2] || 0);
      out += B64[n >>> 18] + B64[(n >>> 12) & 63] + (i + 1 < bytes.length ? B64[(n >>> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
    }
    return out;
  }
  function decodeBytes(text, count) {
    if (typeof text !== "string" || text.length !== Math.ceil(count / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error("invalid input-ghost channel");
    const bytes = new Uint8Array(count); let j = 0;
    for (let i = 0; i < text.length; i += 4) {
      const n = B64.indexOf(text[i]) * 262144 + B64.indexOf(text[i + 1]) * 4096 + Math.max(0, B64.indexOf(text[i + 2])) * 64 + Math.max(0, B64.indexOf(text[i + 3]));
      for (const shift of [16, 8, 0]) if (j < count) bytes[j++] = (n >>> shift) & 255;
    }
    if (encodeBytes(bytes) !== text) throw new Error("noncanonical input-ghost channel");
    return bytes;
  }
  function encodeValues(values, flags) {
    const bytes = new Uint8Array(values.length * (flags ? 1 : 8)), view = new DataView(bytes.buffer);
    values.forEach((v, i) => flags ? bytes[i] = v : view.setFloat64(i * 8, v, true));
    return encodeBytes(bytes);
  }
  function packChannel(values, flags) {
    if (!Object.is(values[0], -0) && values.every(v => Object.is(v, values[0]))) return values[0];
    const dense = encodeValues(values, flags), pieces = [];
    let from = 0;
    for (let i = 0; i < values.length;) {
      let end = i + 1;
      while (end < values.length && Object.is(values[end], values[i])) end++;
      // Zero/full-pedal plateaus are common even with analog controls. Keep
      // negative zero in binary literals so every original bit survives JSON.
      if (end - i >= 4 && !Object.is(values[i], -0)) {
        if (from < i) pieces.push([i - from, encodeValues(values.slice(from, i), flags)]);
        pieces.push([end - i, values[i]]); from = end;
      }
      i = end;
    }
    if (from < values.length) pieces.push([values.length - from, encodeValues(values.slice(from), flags)]);
    const sparse = { pieces };
    return JSON.stringify(sparse).length < dense.length + 2 ? sparse : dense;
  }
  function unpackChannel(value, count, flags) {
    if (typeof value === "number") return Array(count).fill(value);
    if (value && typeof value === "object") {
      if (!Array.isArray(value.pieces) || value.pieces.length > count) throw new Error("invalid input-ghost runs");
      const out = [];
      for (const p of value.pieces) {
        if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || p[0] <= 0 || p[0] > count - out.length || !["number", "string"].includes(typeof p[1])) throw new Error("invalid input-ghost run");
        for (const v of unpackChannel(p[1], p[0], flags)) out.push(v);
      }
      if (out.length !== count) throw new Error("input-ghost run length differs");
      return out;
    }
    const bytes = decodeBytes(value, count * (flags ? 1 : 8)), view = new DataView(bytes.buffer);
    return Array.from({ length: count }, (_, i) => flags ? bytes[i] : view.getFloat64(i * 8, true));
  }
  function packedGhost(g) {
    if (!g || !valid(g)) return g;
    if (g.v === 2 && g.steer.every(Number.isInteger)) {
      const out = Object.assign({}, g, { packedV2: { count: g.steer.length,
        steer: packChannel(g.steer.map(v => v & 255), true), flags: packChannel(g.flags, true),
        throttle: packChannel(g.throttle, true), brake: packChannel(g.brake, true) } });
      for (const k of ["steer", "flags", "throttle", "brake"]) delete out[k];
      return out;
    }
    if (g.v !== 3) return g;
    const out = Object.assign({}, g, { packedV3: { count: g.steer.length,
      steer: packChannel(g.rawSteer), throttle: packChannel(g.rawThrottle), brake: packChannel(g.rawBrake), flags: packChannel(g.flags, true) } });
    for (const k of ["steer", "flags", "throttle", "brake", "rawSteer", "rawThrottle", "rawBrake"]) delete out[k];
    return out;
  }
  function unpackedGhost(g) {
    if (!g || (!g.packedV3 && !g.packedV2)) return g;
    if (g.packedV2) {
      try {
        const p = g.packedV2, n = p.count;
        if (g.v !== 2 || !Number.isInteger(n) || n < MIN_STEPS || n > MAX_LAP_S / currentDt()) return null;
        const out = Object.assign({}, g, { steer: unpackChannel(p.steer, n, true).map(v => v > 127 ? v - 256 : v),
          flags: unpackChannel(p.flags, n, true), throttle: unpackChannel(p.throttle, n, true), brake: unpackChannel(p.brake, n, true) });
        delete out.packedV2;
        return valid(out) ? out : null;
      } catch (_) { return null; }
    }
    try {
      const p = g.packedV3, n = p.count;
      if (g.v !== 3 || !Number.isInteger(n) || n < MIN_STEPS || n > MAX_LAP_S / currentDt()) return null;
      const out = Object.assign({}, g, { rawSteer: unpackChannel(p.steer, n), rawThrottle: unpackChannel(p.throttle, n), rawBrake: unpackChannel(p.brake, n), flags: unpackChannel(p.flags, n, true) });
      delete out.packedV3;
      out.steer = out.rawSteer.map(quantizeSteer);
      out.throttle = out.rawThrottle.map((v, i) => quantizePedal(v, out.flags[i] & 1));
      out.brake = out.rawBrake.map((v, i) => quantizePedal(v, out.flags[i] & 2));
      return valid(out) ? out : null;
    } catch (_) { return null; }
  }
  const packedStore = store => Object.fromEntries(Object.entries(store).map(([id, g]) => [id, packedGhost(g)]));

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
    parsed = Object.fromEntries(Object.entries(parsed).map(([id, g]) => [id, unpackedGhost(g)]));
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
    let json = JSON.stringify(packedStore(store));
    if (byteLength(json) <= MAX_STORE_BYTES) return { changed: false };
    let changed = false;
    for (const id of Object.keys(store)) {
      if (!valid(store[id])) { delete store[id]; changed = true; }
    }
    json = JSON.stringify(packedStore(store));
    const oldest = Object.keys(store).sort((a, b) => {
      const at = Number.isFinite(store[a] && store[a]._used) ? store[a]._used : 0;
      const bt = Number.isFinite(store[b] && store[b]._used) ? store[b]._used : 0;
      return at - bt;
    });
    let size = byteLength(json);
    while (oldest.length > 0 && size > MAX_STORE_BYTES) {
      const id = oldest.shift();
      size -= byteLength(JSON.stringify(id) + ":" + JSON.stringify(packedGhost(store[id])) + ",");
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
    return GameStore.store.write(STORE_KEY, packedStore(store));
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
    fresh = Object.fromEntries(Object.entries(fresh).map(([id, g]) => [id, unpackedGhost(g)]));
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
        lastSave = { durable: !!result.durable, reason: result.durable ? "saved" : "quota or storage unavailable" };
        if (result.durable) {
          if (pending.get(id) === snap) pending.delete(id);
          if (typeof Log !== "undefined") Log.info("car", `input-ghost save ${id}`);
        } else if (typeof Log !== "undefined") {
          Log.warn("car", `input-ghost save ${id} is session-only`);
        }
      } catch {
        lastSave = { durable: false, reason: "storage failed" };
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
    replayStep = 0; replayNative = false;
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
    rec = { steer: [], flags: [], throttle: [], brake: [], rawSteer: [], rawThrottle: [], rawBrake: [], native: false, initialState: null, n: 0 };
    replayStep = 0; replayNative = false;
  }

  function record(inp) {
    if (!rec) return;
    if (rec.n >= MAX_LAP_S / (meta && meta.dt > 0 ? meta.dt : DEFAULT_DT)) { rec = null; return; }
    if (rec.n === 0 && inp && inp.initialState) rec.initialState = inp.initialState;
    rec.native = rec.native || !!(inp && inp.native);
    rec.rawSteer.push(Number.isFinite(inp && inp.steer) ? inp.steer : 0);
    rec.rawThrottle.push(Number.isFinite(inp && inp.throttleLevel) ? inp.throttleLevel : (inp && inp.throttle ? 1 : 0));
    rec.rawBrake.push(Number.isFinite(inp && inp.brakeLevel) ? inp.brakeLevel : (inp && inp.brake ? 1 : 0));
    rec.steer.push(quantizeSteer(inp && inp.steer));
    const flags = packFlags(inp);
    rec.flags.push(flags);
    rec.throttle.push(quantizePedal(inp && inp.throttleLevel, flags & 1));
    rec.brake.push(quantizePedal(inp && inp.brakeLevel, flags & 2));
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
      v: done.native || done.flags.some(f => f > 3) ? 3 : 2,
      kind: "input-ghost",
      track: trackId,
      time: round(lapTime, 3),
      seed: m.seed,
      physRev: m.physRev,
      build: m.build,
      dt: m.dt,
      steer: done.steer,
      flags: done.flags,
      throttle: done.throttle, brake: done.brake,
      ...(done.native || done.flags.some(f => f > 3) ? { rawSteer: done.rawSteer, rawThrottle: done.rawThrottle, rawBrake: done.rawBrake, initialState: done.initialState, replayControls: "native Input adapter for edge actions" } : {}),
    };
    if (context != null) snap.context = context;
    if (extraMeta && typeof extraMeta === "object") snap.meta = Object.assign({}, extraMeta);
    if (!valid(snap)) return false;
    const diskBytes = byteLength(JSON.stringify({ [storageId || "recording"]: packedGhost(snap) })) + 64;
    if (diskBytes > MAX_STORE_BYTES) {
      lastSave = { durable: false, reason: "recording exceeds storage budget", bytes: diskBytes };
      if (typeof Log !== "undefined") Log.warn("car", "input-ghost recording exceeds storage budget; previous best retained");
      return false;
    }
    lastSave = { durable: false, reason: "pending" };
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
      throttle: best.v >= 2 ? best.throttle.slice() : undefined,
      brake: best.v >= 2 ? best.brake.slice() : undefined,
      ...(best.v === 3 ? { rawSteer: best.rawSteer.slice(), rawThrottle: best.rawThrottle.slice(), rawBrake: best.rawBrake.slice(), initialState: best.initialState ? JSON.parse(JSON.stringify(best.initialState)) : null, replayControls: best.replayControls } : {}),
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
    const step = decodeStep(best.steer[idx], best.flags[idx],
      best.v >= 2 ? best.throttle[idx] : undefined,
      best.v >= 2 ? best.brake[idx] : undefined);
    if (best.v === 3) Object.assign(step, { steer: best.rawSteer[idx], throttleLevel: best.rawThrottle[idx], brakeLevel: best.rawBrake[idx] });
    return step;
  }

  /** Begin driving the stored ghost from step 0. Returns false if incompatible. */
  function beginReplay(opts) {
    if (!best || !compatible(best) || (best.v === 3 && !(opts && opts.nativeControls))) { replayStep = 0; replayNative = false; return false; }
    replayStep = 0; replayNative = !!(opts && opts.nativeControls);
    return true;
  }
  /** Next fixed-timestep input for a ghost car (`c.netInput = InputGhost.next()`). */
  function next() {
    if (best && best.v === 3 && !replayNative) return null;
    const inp = atStep(replayStep);
    if (inp) replayStep++;
    return inp;
  }
  function replayIndex() { return replayStep; }

  function clear(id) {
    const store = loadStore();
    if (id == null) {
      for (const k of Object.keys(store)) delete store[k];
      pending.clear();
      best = null;
      replayStep = 0;
      replayNative = false;
    } else {
      const contextPrefix = id.startsWith("v2:") ? null : "v2:" + id + ":";
      const matches = key => key === id || (contextPrefix != null && key.startsWith(contextPrefix));
      for (const key of pending.keys()) if (matches(key)) pending.delete(key);
      for (const key of Object.keys(store)) if (matches(key)) delete store[key];
      if (storageId != null && matches(storageId)) {
        best = null;
        replayStep = 0;
        replayNative = false;
      }
    }
    saveStore(store);
  }

  function flush() {
    for (const [id, snap] of pending) {
      try {
        const store = loadStore();
        // A storage event may already have merged a faster foreign lap into
        // the cache while this local snapshot waited for an idle slot.
        const winner = betterGhost(store[id], snap);
        if (winner) store[id] = winner;
        const result = saveStore(store);
        if (result.durable && pending.get(id) === snap) pending.delete(id);
      } catch { /* best effort */ }
    }
  }

  return {
    STORE_KEY, KEY, MIN_STEPS, MAX_LAP_S, DEFAULT_DT,
    setTrack, startLap, record, finishLap,
    hasGhost, bestTime, snapshot, envelope, steps,
    atStep, beginReplay, next, replayIndex,
    needsState: () => !!rec && rec.n === 0,
    persistence: () => Object.assign({}, lastSave),
    compatible, valid, contextKey, quantizeSteer, packFlags, decodeStep,
    clear, flush, track: () => trackId, context: () => context,
    currentBuild, currentPhysRev, currentDt,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = InputGhost;
