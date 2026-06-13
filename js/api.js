/* Apex 26 — F1API: Jolpica (Ergast) + OpenF1 clients.
   All methods return Promises of SIMPLIFIED plain objects (see docs/ARCHITECTURE.md).
   Single internal queue (>= 400 ms between real network requests), localStorage
   cache ("apex26.api.<url>" -> {t, data}). On failure/429 serves stale cache if
   present (with console.warn), else rejects. Never auto-polls.
   No DOM / localStorage access at module top level. */
const F1API = (function () {
  "use strict";

  const JOLPICA = "https://api.jolpi.ca/ergast/f1";
  const OPENF1 = "https://api.openf1.org/v1";
  const CACHE_PREFIX = "apex26.api.";
  const MIN_GAP_MS = 400;

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const TTL_SCHEDULE = 24 * HOUR;       // schedule / season info
  const TTL_STANDINGS = 1 * HOUR;       // standings + last race
  const TTL_LATEST = 10 * MINUTE;       // openf1 latest session (and its data)
  const TTL_HISTORIC = 7 * 24 * HOUR;   // openf1 data for finished, non-latest sessions

  let queue = Promise.resolve();        // promise chain serializing network hits
  let lastNetAt = 0;                    // time of last actual fetch start
  let latestSessionKey = null;          // tracked from latestSession() responses

  /* ---------- cache ---------- */

  function readCache(url) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + url);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj && typeof obj.t === "number" && Object.prototype.hasOwnProperty.call(obj, "data")) return obj;
    } catch (e) { /* corrupt entry / no storage: ignore */ }
    return null;
  }

  function writeCache(url, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ t: Date.now(), data: data }));
    } catch (e) {
      console.warn("apex26: api cache write failed (quota?)", e);
    }
  }

  /* ---------- queued, cached fetch ---------- */

  function request(url, ttl) {
    const hit = readCache(url);
    if (hit && (Date.now() - hit.t) < ttl) return Promise.resolve(hit.data);

    const job = queue
      .then(function () {
        const wait = lastNetAt + MIN_GAP_MS - Date.now();
        if (wait > 0) return new Promise(function (res) { setTimeout(res, wait); });
        return null;
      })
      .then(function () {
        lastNetAt = Date.now();
        return fetch(url);
      })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return res.json();
      })
      .then(function (json) {
        writeCache(url, json);
        return json;
      })
      .catch(function (err) {
        if (hit) {
          console.warn("apex26: fetch failed, serving stale cache for " + url, err);
          return hit.data;
        }
        throw err;
      });

    // keep the chain alive whatever happens, without swallowing the caller's error
    queue = job.then(function () {}, function () {});
    return job;
  }

  /* ---------- small mapping helpers (tolerate anything) ---------- */

  function num(v) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  }
  function str(v) { return (typeof v === "string" && v.length) ? v : null; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function jRaces(json) {
    return arr(json && json.MRData && json.MRData.RaceTable && json.MRData.RaceTable.Races);
  }
  function jStandingsList(json) {
    const lists = json && json.MRData && json.MRData.StandingsTable && json.MRData.StandingsTable.StandingsLists;
    return (Array.isArray(lists) && lists[0]) || null;
  }

  /* ---------- Jolpica methods ---------- */

  function schedule() {
    return request(JOLPICA + "/2026.json", TTL_SCHEDULE).then(function (json) {
      return jRaces(json).map(function (r) {
        const c = (r && r.Circuit) || {};
        const loc = c.Location || {};
        return {
          round: num(r && r.round),
          name: str(r && r.raceName),
          circuit: str(c.circuitName),
          locality: str(loc.locality),
          country: str(loc.country),
          date: str(r && r.date),
          time: str(r && r.time),
          hasSprint: !!(r && (r.Sprint || r.SprintQualifying || r.SprintShootout))
        };
      });
    });
  }

  function nextRace() {
    return schedule().then(function (list) {
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < list.length; i++) {
        if (list[i].date && list[i].date >= today) return list[i];
      }
      return null;
    });
  }

  function driverStandings() {
    return request(JOLPICA + "/2026/driverstandings.json", TTL_STANDINGS).then(function (json) {
      const sl = jStandingsList(json);
      return arr(sl && sl.DriverStandings).map(function (s) {
        const d = (s && s.Driver) || {};
        const cons = (s && Array.isArray(s.Constructors) && s.Constructors[0]) || {};
        const name = ((d.givenName || "") + " " + (d.familyName || "")).trim();
        return {
          pos: num(s && s.position),
          points: num(s && s.points) || 0,
          wins: num(s && s.wins) || 0,
          name: name || null,
          code: str(d.code),
          number: num(d.permanentNumber),
          team: str(cons.name)
        };
      });
    });
  }

  function constructorStandings() {
    return request(JOLPICA + "/2026/constructorstandings.json", TTL_STANDINGS).then(function (json) {
      const sl = jStandingsList(json);
      return arr(sl && sl.ConstructorStandings).map(function (s) {
        const cons = (s && s.Constructor) || {};
        return {
          pos: num(s && s.position),
          points: num(s && s.points) || 0,
          wins: num(s && s.wins) || 0,
          name: str(cons.name)
        };
      });
    });
  }

  function lastRace() {
    return request(JOLPICA + "/current/last/results.json", TTL_STANDINGS).then(function (json) {
      const race = jRaces(json)[0];
      if (!race) return null;
      return {
        name: str(race.raceName),
        round: num(race.round),
        date: str(race.date),
        results: arr(race.Results).map(function (r) {
          const d = (r && r.Driver) || {};
          const cons = (r && r.Constructor) || {};
          const name = ((d.givenName || "") + " " + (d.familyName || "")).trim();
          return {
            pos: num(r && r.position),
            name: name || null,
            code: str(d.code),
            team: str(cons.name),
            grid: num(r && r.grid),
            points: num(r && r.points) || 0,
            status: str(r && r.status),
            time: (r && r.Time && str(r.Time.time)) || null
          };
        })
      };
    });
  }

  /* ---------- OpenF1 methods ---------- */

  function sessionTtl(sessionKey) {
    // historical (non-latest) session data is effectively frozen: 7 d.
    if (latestSessionKey !== null && sessionKey !== latestSessionKey) return TTL_HISTORIC;
    return TTL_LATEST;
  }

  function latestSession() {
    return request(OPENF1 + "/sessions?session_key=latest", TTL_LATEST).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      const s = a[a.length - 1] || {};
      if (s.session_key !== undefined && s.session_key !== null) latestSessionKey = s.session_key;
      return {
        sessionKey: (s.session_key !== undefined && s.session_key !== null) ? s.session_key : null,
        name: str(s.session_name),
        type: str(s.session_type),
        circuit: str(s.circuit_short_name),
        country: str(s.country_name),
        dateStart: str(s.date_start)
      };
    });
  }

  function weather(sessionKey) {
    const url = OPENF1 + "/weather?session_key=" + encodeURIComponent(sessionKey);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      const w = a[a.length - 1] || {};
      return {
        airT: num(w.air_temperature),
        trackT: num(w.track_temperature),
        humidity: num(w.humidity),
        rainfall: num(w.rainfall),
        windSpeed: num(w.wind_speed)
      };
    });
  }

  function positions(sessionKey) {
    const url = OPENF1 + "/position?session_key=" + encodeURIComponent(sessionKey);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      const latest = {}; // driver_number -> latest sample
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        if (!p || p.driver_number === undefined || p.driver_number === null) continue;
        const prev = latest[p.driver_number];
        if (!prev || String(p.date || "") >= String(prev.date || "")) latest[p.driver_number] = p;
      }
      const out = [];
      for (const k in latest) {
        if (Object.prototype.hasOwnProperty.call(latest, k)) {
          out.push({ num: num(latest[k].driver_number), pos: num(latest[k].position) });
        }
      }
      if (!out.length) return null;
      out.sort(function (x, y) {
        return (x.pos === null ? 99 : x.pos) - (y.pos === null ? 99 : y.pos);
      });
      return out;
    });
  }

  function sessionDrivers(sessionKey) {
    const url = OPENF1 + "/drivers?session_key=" + encodeURIComponent(sessionKey);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      return a.map(function (d) {
        d = d || {};
        return {
          num: num(d.driver_number),
          code: str(d.name_acronym),
          name: str(d.full_name) || str(d.broadcast_name),
          team: str(d.team_name),
          color: str(d.team_colour)
        };
      });
    });
  }

  return {
    schedule: schedule,
    nextRace: nextRace,
    driverStandings: driverStandings,
    constructorStandings: constructorStandings,
    lastRace: lastRace,
    latestSession: latestSession,
    weather: weather,
    positions: positions,
    sessionDrivers: sessionDrivers
  };
})();
