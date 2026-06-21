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

  function mapSession(s) {
    s = s || {};
    return {
      sessionKey: (s.session_key !== undefined && s.session_key !== null) ? s.session_key : null,
      meetingKey: (s.meeting_key !== undefined && s.meeting_key !== null) ? s.meeting_key : null,
      year: num(s.year),
      name: str(s.session_name),
      type: str(s.session_type),
      circuit: str(s.circuit_short_name),
      country: str(s.country_name),
      dateStart: str(s.date_start)
    };
  }

  function latestSession() {
    return request(OPENF1 + "/sessions?session_key=latest", TTL_LATEST).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      const s = mapSession(a[a.length - 1]);
      if (s.sessionKey !== null) latestSessionKey = s.sessionKey;
      return s;
    });
  }

  // Grand Prix weekends for a season (for the session picker).
  function meetings(year) {
    return request(OPENF1 + "/meetings?year=" + encodeURIComponent(year), TTL_SCHEDULE).then(function (list) {
      return arr(list).map(function (m) {
        m = m || {};
        return {
          meetingKey: (m.meeting_key !== undefined && m.meeting_key !== null) ? m.meeting_key : null,
          name: str(m.meeting_name),
          country: str(m.country_name),
          circuit: str(m.circuit_short_name),
          dateStart: str(m.date_start)
        };
      }).filter(function (m) { return m.meetingKey !== null; });
    });
  }

  // All sessions (FP/Qualifying/Sprint/Race) within one meeting.
  function sessionsForMeeting(meetingKey) {
    return request(OPENF1 + "/sessions?meeting_key=" + encodeURIComponent(meetingKey), TTL_HISTORIC).then(function (list) {
      return arr(list).map(mapSession).filter(function (s) { return s.sessionKey !== null; });
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

  /* ---------- telemetry (OpenF1, free historical) ---------- */

  function sessionLaps(sessionKey, driverNumber) {
    const url = OPENF1 + "/laps?session_key=" + encodeURIComponent(sessionKey) +
      "&driver_number=" + encodeURIComponent(driverNumber);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      return arr(list).map(function (l) {
        l = l || {};
        return {
          lapNumber: num(l.lap_number),
          lapDuration: num(l.lap_duration),
          s1: num(l.duration_sector_1), s2: num(l.duration_sector_2), s3: num(l.duration_sector_3),
          i1Speed: num(l.i1_speed), i2Speed: num(l.i2_speed), stSpeed: num(l.st_speed),
          isPitOut: !!l.is_pit_out_lap,
          dateStart: str(l.date_start)
        };
      });
    });
  }

  // fastest valid (non pit-out, has a start time) lap for a driver, or null
  function fastestLap(sessionKey, driverNumber) {
    return sessionLaps(sessionKey, driverNumber).then(function (laps) {
      let best = null;
      for (let i = 0; i < laps.length; i++) {
        const l = laps[i];
        if (l.lapDuration === null || !l.dateStart || l.isPitOut) continue;
        if (!best || l.lapDuration < best.lapDuration) best = l;
      }
      return best;
    });
  }

  function windowed(path, sessionKey, driverNumber, startISO, endISO) {
    let url = OPENF1 + path + "?session_key=" + encodeURIComponent(sessionKey) +
      "&driver_number=" + encodeURIComponent(driverNumber);
    if (startISO) url += "&date>=" + encodeURIComponent(startISO);
    if (endISO) url += "&date<=" + encodeURIComponent(endISO);
    return request(url, sessionTtl(sessionKey));
  }

  // car telemetry samples within a time window: speed/throttle/brake/gear/rpm/drs
  function carData(sessionKey, driverNumber, startISO, endISO) {
    return windowed("/car_data", sessionKey, driverNumber, startISO, endISO).then(function (list) {
      const a = arr(list);
      const t0ms = a.length ? Date.parse(a[0].date) : NaN;
      const t0 = isFinite(t0ms) ? t0ms : 0;
      return a.map(function (c) {
        c = c || {};
        const cMs = Date.parse(c.date);
        return {
          t: isFinite(cMs) ? (cMs - t0) / 1000 : 0,   // seconds from window start
          speed: num(c.speed), throttle: num(c.throttle), brake: num(c.brake),
          gear: num(c.n_gear), rpm: num(c.rpm), drs: num(c.drs),
          date: isFinite(cMs) ? cMs : 0
        };
      });
    });
  }

  // x/y track positions within a window (arbitrary track-local units)
  function locationData(sessionKey, driverNumber, startISO, endISO) {
    return windowed("/location", sessionKey, driverNumber, startISO, endISO).then(function (list) {
      return arr(list).map(function (p) {
        p = p || {};
        return { x: num(p.x), y: num(p.y), date: Date.parse(p.date) || 0 };
      }).filter(function (p) { return p.x !== null && p.y !== null; });
    });
  }

  function stints(sessionKey, driverNumber) {
    let url = OPENF1 + "/stints?session_key=" + encodeURIComponent(sessionKey);
    if (driverNumber !== undefined && driverNumber !== null) url += "&driver_number=" + encodeURIComponent(driverNumber);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      return arr(list).map(function (s) {
        s = s || {};
        return {
          num: num(s.driver_number), compound: str(s.compound),
          lapStart: num(s.lap_start), lapEnd: num(s.lap_end),
          age: num(s.tyre_age_at_start), stint: num(s.stint_number)
        };
      });
    });
  }

  function pits(sessionKey, driverNumber) {
    let url = OPENF1 + "/pit?session_key=" + encodeURIComponent(sessionKey);
    if (driverNumber !== undefined && driverNumber !== null) url += "&driver_number=" + encodeURIComponent(driverNumber);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      return arr(list).map(function (p) {
        p = p || {};
        return { num: num(p.driver_number), lap: num(p.lap_number), duration: num(p.pit_duration) };
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
    meetings: meetings,
    sessionsForMeeting: sessionsForMeeting,
    weather: weather,
    positions: positions,
    sessionDrivers: sessionDrivers,
    sessionLaps: sessionLaps,
    fastestLap: fastestLap,
    carData: carData,
    locationData: locationData,
    stints: stints,
    pits: pits
  };
})();
