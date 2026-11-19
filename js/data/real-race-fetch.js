const DataRealRaceFetch = (function () {
  "use strict";

  const { SCRIPT_V } = DataRealRaceScript;
  const OPENF1 = "https://api.openf1.org/v1";
  const TTL = 7 * 24 * 60 * 60 * 1000;
  const CACHE_KEY = "apex26.realrace.v1.";
  const CACHE_LRU = "apex26.realrace.lru";
  const CACHE_MAX = 8;
  const API_CACHE_PREFIX = "apex26.api.";
  const RAW_PATHS = ["/sessions?", "/drivers?", "/laps?", "/stints?", "/pit?", "/overtakes?", "/race_control?", "/weather?", "/session_result?", "/position?", "/team_radio?"];
  const TRACE_V = 2;
  const TRACE_HZ = 2;
  const TRACE_DB = "apex26.replay", TRACE_STORE = "traces";
  const TRACE_MAX = 8;
  const TRACE_LRU = "__lru";
  const TRACE_OPEN_MS = 4000;
  const TRACE_PAD_S = 90;

  const arr = (v) => (Array.isArray(v) ? v : []);

  function fetchRaw(sessionKey, fresh) {
    const q = (path, opts) => F1API.request(OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey), TTL, fresh ? Object.assign({}, opts, { cache: false }) : opts);
    return Promise.all([
      q("/sessions?"), q("/drivers?"), q("/laps?", { cache: false }), q("/stints?"), q("/pit?"), q("/overtakes?"),
      q("/race_control?"), q("/weather?"), q("/session_result?"), q("/position?", { cache: "memory" }), q("/team_radio?"),
    ]).then((r) => {
      const session = arr(r[0])[0] || { session_key: sessionKey };
      const raw = { session, drivers: r[1], laps: r[2], stints: r[3], pits: r[4], overtakes: r[5], raceControl: r[6], weather: r[7], result: r[8], positions: r[9], teamRadio: r[10] };
      if (session.meeting_key == null || !session.year) return raw;
      return F1API.meetings(session.year).then((ms) => {
        const m = ms.find((x) => x.meetingKey === session.meeting_key);
        if (m && m.name) session.meeting_name = m.name;
        return raw;
      }, () => raw);
    });
  }

  function forgetRaw(sessionKey) {
    try {
      for (const path of RAW_PATHS) {
        const url = OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey);
        if (typeof F1API !== "undefined" && F1API.forget) F1API.forget(url);
        else localStorage.removeItem(API_CACHE_PREFIX + url);
      }
    } catch (e) {  }
  }

  let _traceDb = null;
  function traceDb() {
    if (_traceDb) return _traceDb;
    _traceDb = new Promise((res) => {
      let settled = false, timer = null, r = null;
      const finish = (db) => {
        if (settled) { if (db) { try { db.close(); } catch (e) {  } } return; }
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (db) db.onversionchange = db.onclose = () => { try { db.close(); } catch (e) {  } _traceDb = null; };
        res(db || null);
      };
      try { if (typeof indexedDB === "undefined" || !indexedDB) { finish(null); return; } r = indexedDB.open(TRACE_DB, 1); }
      catch (e) { finish(null); return; }
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(TRACE_STORE)) db.createObjectStore(TRACE_STORE); };
      r.onsuccess = () => finish(r.result);
      r.onerror = r.onblocked = () => finish(null);
      if (typeof setTimeout === "function") timer = setTimeout(() => finish(null), TRACE_OPEN_MS);
    }).then((db) => { if (!db) _traceDb = null; return db; });
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
            catch (e) { try { tx.abort(); } catch (_) {  } res(null); }
          };
        };
        tx.oncomplete = () => res(hit);
        tx.onerror = tx.onabort = () => res(null);
      } catch (e) { res(null); }
    }));
  }
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
            if (typeof st.getAllKeys === "function") {
              const all = st.getAllKeys();
              all.onsuccess = () => { for (const k of all.result || []) if (k !== TRACE_LRU && order.indexOf(String(k)) < 0) st.delete(k); };
            }
            st.put(traces, key);
            st.put(order, TRACE_LRU);
          } catch (e) { try { t.abort(); } catch (_) {  } }
        };
        t.oncomplete = () => res(true);
        t.onerror = t.onabort = () => res(false);
      } catch (e) { res(false); }
    }));
  }
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
    return car[0] <= start + 5 && car[car.length - 3] >= end - 5;
  }
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
        .then(() => {
          checkCurrent();
          const participating = script.drivers.filter((d) => !d.dns);
          if (!participating.some((d) => traces.cars[d.num] && traces.cars[d.num].length > 300)) {
            for (const d of participating) if (!traces.failed.includes(d.num)) traces.failed.push(d.num);
          }
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
  function lruWrite(order) { try { localStorage.setItem(CACHE_LRU, JSON.stringify(order)); } catch (e) {  } }
  function pruneScripts(keep) {
    try {
      const drop = new Set(lruRead().filter((k) => keep.indexOf(k) < 0).map((k) => CACHE_KEY + k));
      const n = typeof localStorage.length === "number" && typeof localStorage.key === "function" ? localStorage.length : 0;
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(CACHE_KEY) === 0 && keep.indexOf(k.slice(CACHE_KEY.length)) < 0) drop.add(k);
      }
      for (const k of drop) localStorage.removeItem(k);
    } catch (e) {  }
  }
  function remember(script) {
    const order = lruFront(script.sessionKey);
    pruneScripts(order);
    try { localStorage.setItem(CACHE_KEY + script.sessionKey, JSON.stringify(script)); lruWrite(order); } catch (e) {  }
  }

  return { fetchRaw, forgetRaw, cached, remember, fetchTraces, packTrace, traceGet, tracePut, traceFits, OPENF1, TRACE_V, TRACE_MAX, CACHE_KEY, CACHE_MAX };
})();
Object.freeze(DataRealRaceFetch);
