/* Apex 26 — real-race session cache and position traces. One localStorage script per session, and one IndexedDB recording of every car's OpenF1 /location samples. */
const DataRealRaceFetch = (function () {
  "use strict";

  const { SCRIPT_V } = DataRealRaceScript;
  const OPENF1 = "https://api.openf1.org/v1";
  const TTL = 7 * 24 * 60 * 60 * 1000;   // a finished race never changes; the same TTL api.js gives a historic session
  const CACHE_KEY = "apex26.realrace.v1.";   // one compact script per session key (the raw laps body is 480 KB and never cached)
  // A script is ~45 KB; one per watched session with no eviction filled the 5 MB origin quota
  // after ~115 sessions and starved every save. Keep the newest few (an LRU index, newest first).
  const CACHE_LRU = "apex26.realrace.lru";
  const CACHE_MAX = 8;
  const API_CACHE_PREFIX = "apex26.api.";   // js/data/api.js CACHE_PREFIX — the bodies of an unfinished race are dropped so the next open refetches them
  const RAW_PATHS = ["/sessions?", "/drivers?", "/laps?", "/stints?", "/pit?", "/overtakes?", "/race_control?", "/weather?", "/session_result?", "/position?", "/team_radio?"];
  // The real positions (OpenF1 /location, ~3.7 Hz per car, 2-5 MB a car for a race) — fetched once
  // per car, kept at TRACE_HZ in IndexedDB (a 22-car race is ~1.5 MB there), never in localStorage.
  const TRACE_V = 2;
  const TRACE_HZ = 2;
  const TRACE_DB = "apex26.replay", TRACE_STORE = "traces";
  const TRACE_MAX = 8;              // races kept (~1.5 MB each); the newest-first order lives in the store under TRACE_LRU
  const TRACE_LRU = "__lru";
  const TRACE_OPEN_MS = 4000;       // a blocked/never-settling open() degrades to "no cache"
  const TRACE_PAD_S = 90;   // seconds of positions before lights out (the grid) and after the last lap

  const arr = (v) => (Array.isArray(v) ? v : []);

  // ── Fetching: one script per session, through F1API's queue and rate window ──
  function fetchRaw(sessionKey, fresh) {
    const q = (path, opts) => F1API.request(OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey), TTL, fresh ? Object.assign({}, opts, { cache: false }) : opts);
    return Promise.all([
      q("/sessions?"), q("/drivers?"), q("/laps?", { cache: false }), q("/stints?"), q("/pit?"), q("/overtakes?"),
      q("/race_control?"), q("/weather?"), q("/session_result?"), q("/position?", { cache: "memory" }), q("/team_radio?"),
    ]).then((r) => {
      const session = arr(r[0])[0] || { session_key: sessionKey };
      const raw = { session, drivers: r[1], laps: r[2], stints: r[3], pits: r[4], overtakes: r[5], raceControl: r[6], weather: r[7], result: r[8], positions: r[9], teamRadio: r[10] };
      // The weekend's NAME lives on the meeting, not the session (F1API.meetings is the picker's cached list).
      if (session.meeting_key == null || !session.year) return raw;
      return F1API.meetings(session.year).then((ms) => {
        const m = ms.find((x) => x.meetingKey === session.meeting_key);
        if (m && m.name) session.meeting_name = m.name;
        return raw;
      }, () => raw);
    });
  }

  /** Drop the cached bodies of a race that was not complete, so the next open
   *  refetches them: api.js caches each for seven days, which would otherwise
   *  freeze an unfinished classification for a week. */
  function forgetRaw(sessionKey) {
    try {
      for (const path of RAW_PATHS) {
        const url = OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey);
        if (typeof F1API !== "undefined" && F1API.forget) F1API.forget(url);   // memory too: a body over 256K never reaches localStorage
        else localStorage.removeItem(API_CACHE_PREFIX + url);
      }
    } catch (e) { /* no storage: nothing was cached */ }
  }

  // ── The real positions: one /location pull per car, kept in IndexedDB ──
  // ONE connection per page, memoised (the js/core/store.js mirrorOpen pattern): a get or put
  // each opened its own and never closed it, and a version bump would block on every one.
  let _traceDb = null;
  function traceDb() {
    if (_traceDb) return _traceDb;
    _traceDb = new Promise((res) => {
      let settled = false, timer = null, r = null;
      const finish = (db) => {
        if (settled) { if (db) { try { db.close(); } catch (e) { /* late open after a block or timeout: nothing owns it */ } } return; }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) db.onversionchange = db.onclose = () => { try { db.close(); } catch (e) { /* already closed */ } _traceDb = null; };
        res(db || null);
      };
      try { if (typeof indexedDB === "undefined" || !indexedDB) { finish(null); return; } r = indexedDB.open(TRACE_DB, 1); }
      catch (e) { finish(null); return; }
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(TRACE_STORE)) db.createObjectStore(TRACE_STORE); };
      r.onsuccess = () => finish(r.result);
      r.onerror = r.onblocked = () => finish(null);
      if (typeof setTimeout === "function") timer = setTimeout(() => finish(null), TRACE_OPEN_MS);
    }).then((db) => { if (!db) _traceDb = null; return db; });   // never memoise a failure
    return _traceDb;
  }
  function traceGet(sessionKey, script) {
    return traceDb().then((db) => new Promise((res) => {
      if (!db) { res(null); return; }
      try {
        const key = String(sessionKey), tx = db.transaction(TRACE_STORE, "readwrite"), st = tx.objectStore(TRACE_STORE);
        let hit = null;
        const rq = st.get(key);
        rq.onsuccess = () => {
          const v = rq.result;
          if (!(v && v.v === TRACE_V && v.complete && v.cars && (!script || traceFits(v, script)))) return;
          hit = v;
          let order;
          try { order = st.get(TRACE_LRU); } catch (e) { res(null); return; }
          order.onsuccess = () => {
            try { const prev = Array.isArray(order.result) ? order.result.map(String) : [];
              st.put([key].concat(prev.filter((k) => k !== key)).slice(0, TRACE_MAX), TRACE_LRU); }
            catch (e) { try { tx.abort(); } catch (_) { /* already finished */ } res(null); }
          };
        };
        tx.oncomplete = () => res(hit);
        tx.onerror = tx.onabort = () => res(null);
      } catch (e) { res(null); }
    }));
  }
  /** Store one race's positions and keep only the newest TRACE_MAX races (the photo-studio
   *  LIMIT pattern: the read, the prune and the put share one readwrite transaction). */
  function tracePut(traces) {
    return traceDb().then((db) => new Promise((res) => {
      if (!db) { res(false); return; }
      try {
        const key = String(traces.sessionKey);
        const t = db.transaction(TRACE_STORE, "readwrite"), st = t.objectStore(TRACE_STORE);
        const rq = st.get(TRACE_LRU);
        rq.onsuccess = () => {
          try {
            const prev = Array.isArray(rq.result) ? rq.result.map(String) : [];
            const order = [key].concat(prev.filter((k) => k !== key)).slice(0, TRACE_MAX);
            for (const k of prev) if (order.indexOf(k) < 0) st.delete(k);
            if (typeof st.getAllKeys === "function") {   // races stored before the order existed
              const all = st.getAllKeys();
              all.onsuccess = () => { for (const k of all.result || []) if (k !== TRACE_LRU && order.indexOf(String(k)) < 0) st.delete(k); };
            }
            st.put(traces, key);
            st.put(order, TRACE_LRU);
          } catch (e) { try { t.abort(); } catch (_) { /* already finished */ } }
        };
        t.oncomplete = () => res(true);
        t.onerror = t.onabort = () => res(false);   // quota: the next visit fetches again
      } catch (e) { res(false); }
    }));
  }
  /** One car's /location rows → Float32Array [t, x, y, …] at TRACE_HZ (t seconds from t0, x/y metres). */
  function packTrace(rows, t0) {
    const out = [];
    let last = -Infinity;
    const gap = 1000 / TRACE_HZ - 50;
    for (const r of arr(rows).filter((r) => r && r.date != null && isFinite(+r.date) &&
      typeof r.x === "number" && typeof r.y === "number" && isFinite(r.x) && isFinite(r.y)).sort((a, b) => a.date - b.date)) {
      const t = r && r.date != null ? +r.date : NaN;
      if (!isFinite(t) || t - last < gap || !(isFinite(r.x) && isFinite(r.y))) continue;
      last = t;
      out.push((t - t0) / 1000, r.x / 10, r.y / 10);
    }
    return Float32Array.from(out);
  }
  function traceEnd(script) {
    let end = 0;
    for (const d of script.drivers) arr(d.lapStart).forEach((ls, i) => { if (ls != null && d.laps[i] > 0) end = Math.max(end, ls + d.laps[i]); });
    return end;
  }
  // Session identity alone is not coverage: timing can grow after a successful
  // download. Include its clock, window, roster and completion state; legacy
  // entries without this stamp must be fetched again rather than trusted.
  function traceCoverage(script) {
    return JSON.stringify([script.t0, traceEnd(script), script.complete === true,
      script.drivers.map((d) => [d.num, !!d.dns, d.lapsDone || 0]).sort((a, b) => a[0] - b[0])]);
  }
  function traceFits(traces, script) {
    return !!(traces && traces.v === TRACE_V && traces.sessionKey === script.sessionKey &&
      traces.coverage === traceCoverage(script) && (!traces.complete || script.drivers.every((d) => d.dns || usableTrace(traces.cars && traces.cars[d.num], d))));
  }
  function usableTrace(car, driver) {
    let start = Infinity, end = 0;
    arr(driver.lapStart).forEach((ls, i) => {
      if (ls != null && Number.isFinite(ls)) {
        start = Math.min(start, ls);
        if (driver.laps[i] > 0) end = Math.max(end, ls + driver.laps[i]);
      }
    });
    const minimum = Math.max(2, Math.min(102, Math.floor(end * TRACE_HZ / 2))) * 3;
    if (!car || car.length < minimum || car.length % 3 || !isFinite(start)) return false;
    for (let i = 0; i < car.length; i += 3) {
      if (!Number.isFinite(car[i]) || !Number.isFinite(car[i + 1]) || !Number.isFinite(car[i + 2]) || (i && car[i] <= car[i - 3])) return false;
    }
    // Allow positioning dropouts around the line, but a dense minute of a long
    // race is not full coverage. Retirements use their own last timed lap.
    return car[0] <= start + 5 && car[car.length - 3] >= end - 5;
  }
  /** The field's positions for a script: cached, else fetched car by car (onProgress(done, total)).
   *  options.refresh skips IndexedDB and the in-memory recording and downloads every car again. */
  function fetchTraces(script, onProgress, previous, options) {
    const refresh = !!(options && options.refresh);
    const checkCurrent = () => {
      if (options && options.current && !options.current()) {
        const error = new Error("positions download cancelled"); error.name = "AbortError"; throw error;
      }
    };
    try { checkCurrent(); } catch (error) { return Promise.reject(error); }
    if (!script || !script.t0 || !script.drivers) return Promise.reject(new Error("no timestamps in the script"));
    return (refresh ? Promise.resolve(null) : traceGet(script.sessionKey, script)).then((hit) => {
      checkCurrent();
      if (hit) return hit;
      const t0 = script.t0;
      const end = traceEnd(script);
      const startISO = new Date(t0 - TRACE_PAD_S * 1000).toISOString(), endISO = new Date(t0 + (end + TRACE_PAD_S) * 1000).toISOString();
      const traces = { v: TRACE_V, sessionKey: script.sessionKey, t0, hz: TRACE_HZ,
        coverage: traceCoverage(script), complete: script.complete === true, cars: {}, failed: [] };
      if (!refresh && traceFits(previous, script)) {
        for (const k in previous.cars || {}) if (!(previous.failed || []).includes(+k) && previous.cars[k].length >= 6) traces.cars[k] = previous.cars[k];
      }
      for (const d of script.drivers) if (traces.cars[d.num] && !usableTrace(traces.cars[d.num], d)) delete traces.cars[d.num];
      let done = 0;
      const total = script.drivers.length;
      return Promise.all(script.drivers.map((d) => {
        checkCurrent();
        const work = d.dns
          ? Promise.resolve().then(() => { checkCurrent(); traces.cars[d.num] = new Float32Array(0); })
          : Object.prototype.hasOwnProperty.call(traces.cars, d.num)
          // Coverage-aware caching belongs here, rather than in the HTTP cache.
          ? Promise.resolve() : F1API.locationData(script.sessionKey, d.num, startISO, endISO, { cache: false })
            .then((rows) => {
              checkCurrent();
              const car = packTrace(rows, t0); traces.cars[d.num] = car;
              if (!usableTrace(car, d)) traces.failed.push(d.num);
            }, () => {
              checkCurrent(); traces.failed.push(d.num); traces.cars[d.num] = new Float32Array(0);
            });
        return work.then(() => { checkCurrent(); done++; if (onProgress) onProgress(done, total, traces); });
      }))
        // A failed request is not "no positions": a hub closed mid-load (F1API.cancelAll) or a dropped
        // connection. Such a set is NEVER cached (it would read as loaded, and every WATCH replay nothing).
        .then(() => {
          checkCurrent();
          const participating = script.drivers.filter((d) => !d.dns);
          // RealReplay needs >100 samples to fit a reference car to the circuit.
          // Sparse fulfilled responses must remain retryable just like errors.
          if (!participating.some((d) => traces.cars[d.num] && traces.cars[d.num].length > 300)) {
            for (const d of participating) if (!traces.failed.includes(d.num)) traces.failed.push(d.num);
          }
          // A partial refresh must not replace a recording the player can already watch.
          if (refresh && traces.failed.length) throw new Error("the positions refresh did not load every car");
          traces.complete = traces.complete && traces.failed.length === 0;
          if (!participating.length || participating.every((d) => traces.failed.includes(d.num))) throw new Error("the positions did not load");
          return traces.complete ? tracePut(traces).then(() => traces) : traces;
        });
    });
  }

  function cached(sessionKey) {
    try {
      const raw = localStorage.getItem(CACHE_KEY + sessionKey);
      const s = raw ? JSON.parse(raw) : null;
      const ok = s && s.v === SCRIPT_V && s.complete === true && s.laps > 0 && Array.isArray(s.drivers) ? s : null;
      if (ok) lruWrite(lruFront(sessionKey));
      return ok;
    } catch (e) { return null; }
  }
  function lruRead() {
    try { const a = JSON.parse(localStorage.getItem(CACHE_LRU) || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; }
  }
  function lruFront(sessionKey) {
    const k = String(sessionKey);
    return [k].concat(lruRead().filter((x) => x !== k)).slice(0, CACHE_MAX);
  }
  function lruWrite(order) { try { localStorage.setItem(CACHE_LRU, JSON.stringify(order)); } catch (e) { /* quota: the order is advisory */ } }
  /** Drop every cached script not in `keep` — indexed ones and any written before the index existed. */
  function pruneScripts(keep) {
    try {
      const drop = new Set(lruRead().filter((k) => keep.indexOf(k) < 0).map((k) => CACHE_KEY + k));
      const n = typeof localStorage.length === "number" && typeof localStorage.key === "function" ? localStorage.length : 0;
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(CACHE_KEY) === 0 && keep.indexOf(k.slice(CACHE_KEY.length)) < 0) drop.add(k);
      }
      for (const k of drop) localStorage.removeItem(k);
    } catch (e) { /* no storage */ }
  }
  function remember(script) {
    const order = lruFront(script.sessionKey);
    pruneScripts(order);   // before the write, so the room it frees is there for it
    try { localStorage.setItem(CACHE_KEY + script.sessionKey, JSON.stringify(script)); lruWrite(order); } catch (e) { /* quota: the next open refetches */ }
  }

  return { fetchRaw, forgetRaw, cached, remember, fetchTraces, packTrace, traceGet, tracePut, traceFits, OPENF1, TRACE_V, TRACE_MAX, CACHE_KEY, CACHE_MAX };
})();
Object.freeze(DataRealRaceFetch);
