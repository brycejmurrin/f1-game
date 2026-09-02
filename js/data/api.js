/* Apex 26 — F1API: Jolpica (Ergast) + OpenF1 clients. All methods return Promises of SIMPLIFIED plain objects (see docs/ARCHITECTURE.md). Single internal queue (>… */
const F1API = (function () {
  "use strict";

  const JOLPICA = "https://api.jolpi.ca/ergast/f1";
  const OPENF1 = "https://api.openf1.org/v1";

  // THE SEASON IS READ FROM THE CLOCK, NOT BAKED INTO THE URL.
  //
  // Four Jolpica URLs hardcoded /2026/, so the whole data hub — schedule,
  // both standings tables, last race — would have quietly kept serving 2026
  // for the rest of time. Nothing would have errored: the requests stay valid
  // forever, they just describe a season that is over, which is the worst
  // shape of bug because it looks like it works.
  //
  // Computed per call rather than once at module load, so a tab left open
  // across New Year rolls over instead of pinning the year it booted in.
  //
  // Not Ergast's `/current` alias, which would be the tidier answer: this
  // sandbox's egress proxy blocks api.jolpi.ca, so it could not be verified
  // here, and an unverified API dependency is a worse bug than the one being
  // fixed. `/current` is a safe swap for anyone who can confirm it responds.
  //
  // Between Jan 1 and the season opener the standings endpoints return an
  // empty list. That is CORRECT — there are no standings yet — and every
  // caller already handles the empty/null case.
  const season = () => String(new Date().getFullYear());
  const CACHE_PREFIX = "apex26.api.";
  const MIN_GAP_MS = 400;
  const MAX_RETRY = 2;         // retries on 429 / 5xx before giving up
  const RETRY_BASE_MS = 10000; // 10 s first retry — OpenF1 rate-limits hard; short
  const RETRY_CAP_MS = 25000;  //   delays only eat more quota, so wait longer
  // Retry-After is honoured AS SENT up to this ceiling. OpenF1 commonly asks
  // for 60 s, and the old 25 s clamp fired both retries INSIDE that window —
  // two more 429s, quota burned, nothing gained. Past the ceiling the request
  // fails fast instead (stale cache if there is one): that is what a tab can
  // act on; a 90 s+ sleep behind a spinner is not.
  const RETRY_AFTER_MAX_MS = 90000;
  const FETCH_TIMEOUT_MS = 15000;

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const TTL_SCHEDULE = 24 * HOUR;       // schedule / season info
  const TTL_STANDINGS = 1 * HOUR;       // standings + last race
  const TTL_LATEST = 10 * MINUTE;       // openf1 latest session (and its data)
  const TTL_HISTORIC = 7 * 24 * HOUR;   // openf1 data for finished, non-latest sessions
  const CACHE_SWEEP_MS = 5 * MINUTE;     // a response batch must not rescan localStorage per item

  const SESSION_FROZEN_MS = 6 * HOUR;   // a weekend session is well over after this

  let queue = Promise.resolve();        // promise chain serializing network hits
  let lastNetAt = 0;                    // time of last actual fetch start
  let netGen = 0;                       // bumped by cancelAll(); a request born before it is stale
  const liveControllers = new Set();    // AbortControllers of fetches on the wire
  const failWarnAt = Object.create(null); // endpoint name -> last Log.warn ms
  const FAIL_WARN_MS = 30 * 1000;
  let latestSessionKey = null;          // tracked from latestSession() responses
  let lastCacheSweepAt = -Infinity;
  const sessionDates = {};              // sessionKey -> date_start ISO (seen sessions)
  const meetingDates = {};              // meetingKey -> date_start ISO (seen meetings)

  // Cached payloads serialize as {"t":<ms>,"data":…} — t first — so sweeps can
  // read the timestamp with a prefix match instead of JSON.parsing every
  // multi-MB response body. Legacy/corrupt entries fall back to a full parse.
  function cacheEntryT(raw) {
    if (typeof raw !== "string") return null;
    const m = /^\{"t":(\d+)[,}]/.exec(raw);
    if (m) return +m[1];
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj.t === "number" ? obj.t : null;
    } catch (e) { return null; }
  }

  function purgeExpiredCache(maxAge) {
    if (maxAge == null) maxAge = TTL_HISTORIC;
    let removed = 0;
    try {
      if (typeof localStorage === "undefined" || localStorage == null) return 0;
      const n = localStorage.length;
      if (typeof n !== "number") return 0;
      const now = Date.now();
      const doomed = [];
      for (let i = 0; i < n; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
        const t = cacheEntryT(localStorage.getItem(key));
        if (t == null || (now - t) > maxAge || t > now) doomed.push(key);   // future-stamped = clock skew, not fresh
      }
      for (let i = 0; i < doomed.length; i++) {
        try { localStorage.removeItem(doomed[i]); removed++; } catch (e) { /* ignore */ }
      }
    } catch (e) { /* no storage */ }
    return removed;
  }

  // Quota fallback. Evict what is actually eating the quota: windowed
  // telemetry bodies (car_data / location — tens of KB per lap, cached 7 d)
  // go first, largest first; everything else follows oldest first. Pure age
  // order evicted the small, fresh schedule / standings entries that sit
  // between telemetry laps while the laps themselves survived the purge.
  function purgeOldestCache(count) {
    let removed = 0;
    try {
      const entries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
        const raw = localStorage.getItem(key);
        const t = cacheEntryT(raw);   // null (corrupt) → oldest
        entries.push({
          key: key, t: t || 0,
          size: typeof raw === "string" ? raw.length : 0,
          telem: /\/(car_data|location)\?/.test(key)
        });
      }
      entries.sort(function (a, b) {
        if (a.telem !== b.telem) return a.telem ? -1 : 1;
        if (a.telem) return b.size - a.size;
        return a.t - b.t;
      });
      const n = Math.min(count || 8, entries.length);
      for (let i = 0; i < n; i++) {
        try { localStorage.removeItem(entries[i].key); removed++; } catch (e) { /* ignore */ }
      }
    } catch (e) { /* no storage */ }
    return removed;
  }

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
    const key = CACHE_PREFIX + url;
    const payload = JSON.stringify({ t: Date.now(), data: data });
    const now = Date.now();
    let swept = false;
    if (now - lastCacheSweepAt >= CACHE_SWEEP_MS) {
      purgeExpiredCache();
      lastCacheSweepAt = now;
      swept = true;
    }
    try {
      localStorage.setItem(key, payload);
      return;
    } catch (e) {
      Log.warn("data", "apex26: api cache write failed (quota?)", e);
    }
    if (!swept) purgeExpiredCache();   // just ran above? once is enough
    purgeOldestCache(16);
    try {
      localStorage.setItem(key, payload);
    } catch (e2) {
      Log.warn("data", "apex26: api cache write still failing after purge", e2);
    }
  }

  function endpointName(url) {
    const noQ = String(url || "").split("?")[0];
    if (/driverstandings/i.test(noQ)) return "driverstandings";
    if (/constructorstandings/i.test(noQ)) return "constructorstandings";
    if (/\/last\/results/i.test(noQ)) return "last-results";
    if (/\/meetings/i.test(noQ)) return "meetings";
    if (/\/sessions/i.test(noQ)) return "sessions";
    if (/\/position/i.test(noQ)) return "position";
    if (/\/intervals/i.test(noQ)) return "intervals";
    if (/\/drivers/i.test(noQ)) return "drivers";
    if (/\/laps/i.test(noQ)) return "laps";
    if (/\/car_data/i.test(noQ)) return "car_data";
    if (/\/location/i.test(noQ)) return "location";
    if (/\/stints/i.test(noQ)) return "stints";
    if (/\/pits/i.test(noQ)) return "pits";
    if (/\/weather/i.test(noQ)) return "weather";
    if (/\d{4}\.json$/i.test(noQ)) return "schedule";
    const last = noQ.split("/").filter(Boolean).pop() || "api";
    return last.replace(/\.json$/i, "").slice(0, 32);
  }

  function fetchTimed(url) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (controller) liveControllers.add(controller);
    let timer = null;
    const timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error("Request timed out for " + url));
      }, FETCH_TIMEOUT_MS);
    });
    let network;
    try { network = fetch(url, controller ? { signal: controller.signal } : undefined); }
    catch (e) { network = Promise.reject(e); }
    // Promise.race is intentional even with AbortController: a broken fetch
    // implementation that ignores abort must still release the global queue.
    return Promise.race([network, timeout]).finally(function () {
      clearTimeout(timer);
      if (controller) liveControllers.delete(controller);
    });
  }

  // Single attempt: status/error handling only. Retries live in request(), where
  // the backoff sleep happens OUTSIDE the serialized queue slot — inside it, one
  // 429 stalled every other endpoint behind up to ~75 s of pure sleeping
  // (2 × 10-20 s backoff + 3 × 15 s timeouts on the shared chain).
  function fetchOnce(url) {
    lastNetAt = Date.now();
    return fetchTimed(url).then(function (res) {
      if (!res.ok) {
        const hdr = res.headers && res.headers.get && res.headers.get("retry-after");
        let ra = parseFloat(hdr);
        if (!isFinite(ra) && hdr) ra = (Date.parse(hdr) - Date.now()) / 1000;   // HTTP-date form
        const raMs = isFinite(ra) && ra > 0 ? Math.round(ra * 1000) : 0;        // as sent; request() applies the ceiling
        return res.text().then(function (txt) {
          try {
            const j = JSON.parse(txt);
            // j must be object-ish: JSON.parse("null") is a legal parse whose
            // .detail read would throw a TypeError — NOT a SyntaxError, so the
            // filter below would rethrow it as the request error, and that
            // error carries no .status and no "HTTP 401"/"HTTP 403" text,
            // letting a lockout serve stale cache after all.
            if (j && (j.detail || j.error)) {
              const err = new Error(j.detail || j.error);
              err.status = res.status;
              err.retryAfterMs = raMs;
              throw err;
            }
          } catch (e) {
            // A non-JSON error body just falls through to the generic
            // "HTTP <status>" error below; the deliberate detail/error throws
            // above must surface. Matched structurally: JSON.parse failures
            // are SyntaxErrors on every engine, where the V8 message strings
            // this used to match let Firefox/Safari parse errors escape —
            // and an escaped raw SyntaxError lacks "HTTP 401"/"HTTP 403",
            // defeating request()'s refusal to serve stale cache on lockouts.
            if (!(e instanceof SyntaxError)) throw e;
          }
          const httpErr = new Error("HTTP " + res.status + " for " + url);
          httpErr.status = res.status;
          httpErr.retryAfterMs = raMs;
          throw httpErr;
        });
      }
      return res.json();
    });
  }

  function warnFetchFail(name, kind) {
    const now = Date.now();
    if (now - (failWarnAt[name] || 0) < FAIL_WARN_MS) return;
    failWarnAt[name] = now;
    Log.warn("data", "fetch " + name + " fail" + (kind ? " " + kind : ""));
  }

  function cancelledError(url) {
    const e = new Error("Cancelled request for " + url);
    e.cancelled = true;   // the shape js/data/export.js already recognises
    return e;
  }

  function request(url, ttl, options) {
    const myGen = netGen;
    const cache = !options || options.cache !== false;
    const quiet = ttl <= 0 || (options && options.cache === false);
    const name = endpointName(url);
    const hit = cache ? readCache(url) : null;
    // age < 0 is an entry stamped by a clock that has since been stepped back:
    // it would read as fresh for as long as the skew lasts, so refetch instead.
    const age = hit ? Date.now() - hit.t : 0;
    if (ttl > 0 && hit && age >= 0 && age < ttl) return Promise.resolve(hit.data);

    // Each attempt claims ONE queue slot (MIN_GAP pacing included) and releases
    // it before any backoff sleep, so other endpoints proceed while this one
    // waits out a 429 — the chain stays alive per-slot, not per-job.
    // A cancelAll() between any two of these checks drops the request: a
    // queued one never waits or fetches, an aborted one never retries or
    // sleeps, a late completion never reaches the caller.
    function attempt(n) {
      const slot = queue
        .then(function () {
          if (myGen !== netGen) throw cancelledError(url);
          const wait = lastNetAt + MIN_GAP_MS - Date.now();
          if (wait > 0) return new Promise(function (res) { setTimeout(res, wait); });
          return null;
        })
        .then(function () {
          if (myGen !== netGen) throw cancelledError(url);
          return fetchOnce(url);
        });
      queue = slot.then(function () {}, function () {});
      return slot.catch(function (err) {
        if (myGen !== netGen) throw cancelledError(url);
        const status = err && err.status;
        if ((status === 429 || (status >= 500 && status < 600)) && n < MAX_RETRY) {
          const ra = (err && err.retryAfterMs) || 0;
          if (ra > RETRY_AFTER_MAX_MS) throw err;   // server wants longer than a tab will wait: fail fast, same error shape
          const back = ra || Math.min(RETRY_BASE_MS * Math.pow(2, n), RETRY_CAP_MS);
          return new Promise(function (r) { setTimeout(r, back); }).then(function () { return attempt(n + 1); });
        }
        throw err;
      });
    }

    const job = attempt(0)
      .then(function (json) {
        if (myGen !== netGen) throw cancelledError(url);
        if (cache) writeCache(url, json);
        if (!quiet) Log.info("data", "fetch " + name + " ok");
        return json;
      })
      .catch(function (err) {
        if (err && err.cancelled) throw err;   // asked for: no stale-cache fallback, no fail warning
        // Never paper over live-session auth lockouts with stale cache — that
        // makes LIVE look "updated" while silently serving old classification.
        const msg = (err && err.message) || "";
        const status = err && err.status;
        if (hit && status !== 401 && status !== 403 && msg.indexOf("Live F1 session") === -1 && msg.indexOf("HTTP 401") === -1 && msg.indexOf("HTTP 403") === -1) {
          warnFetchFail(name, "stale");
          return hit.data;
        }
        warnFetchFail(name, "");
        throw err;
      });

    return job;
  }

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

  function schedule() {
    return request(JOLPICA + "/" + season() + ".json", TTL_SCHEDULE).then(function (json) {
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

  function driverStandings() {
    return request(JOLPICA + "/" + season() + "/driverstandings.json", TTL_STANDINGS).then(function (json) {
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
    return request(JOLPICA + "/" + season() + "/constructorstandings.json", TTL_STANDINGS).then(function (json) {
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
    return request(JOLPICA + "/" + season() + "/last/results.json", TTL_STANDINGS).then(function (json) {
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

  function sessionTtl(sessionKey) {
    // The known-latest session is always treated as live.
    if (sessionKey === latestSessionKey) return TTL_LATEST;
    // A session we've seen that started comfortably in the past is frozen — its
    // data never changes, so cache it for a week. This no longer depends on
    // latestSession() having run first (the old guard left every session on the
    // 10 min TTL whenever latestSessionKey was still null).
    const ds = sessionDates[sessionKey];
    if (ds) {
      const age = Date.now() - Date.parse(ds);
      if (isFinite(age) && age > SESSION_FROZEN_MS) return TTL_HISTORIC;
    }
    // Unknown recency: stay conservative so genuinely-live data still refreshes.
    return TTL_LATEST;
  }

  function meetingTtl(meetingKey) {
    const ds = meetingDates[meetingKey];
    if (!ds) return TTL_LATEST;
    const age = Date.now() - Date.parse(ds);
    if (!isFinite(age) || age < 0) return TTL_LATEST;
    return age <= 7 * 24 * HOUR ? TTL_LATEST : TTL_HISTORIC;
  }

  function mapSession(s) {
    s = s || {};
    const out = {
      sessionKey: (s.session_key !== undefined && s.session_key !== null) ? s.session_key : null,
      meetingKey: (s.meeting_key !== undefined && s.meeting_key !== null) ? s.meeting_key : null,
      year: num(s.year),
      name: str(s.session_name),
      type: str(s.session_type),
      circuit: str(s.circuit_short_name),
      country: str(s.country_name),
      dateStart: str(s.date_start)
    };
    if (out.sessionKey !== null && out.dateStart) sessionDates[out.sessionKey] = out.dateStart;
    return out;
  }

  function latestSession(ttl) {
    return request(OPENF1 + "/sessions?session_key=latest", ttl == null ? TTL_LATEST : ttl).then(function (list) {
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
        const out = {
          meetingKey: (m.meeting_key !== undefined && m.meeting_key !== null) ? m.meeting_key : null,
          name: str(m.meeting_name),
          country: str(m.country_name),
          circuit: str(m.circuit_short_name),
          dateStart: str(m.date_start)
        };
        if (out.meetingKey !== null && out.dateStart) meetingDates[out.meetingKey] = out.dateStart;
        return out;
      }).filter(function (m) { return m.meetingKey !== null; });
    });
  }

  // All sessions (FP/Qualifying/Sprint/Race) within one meeting.
  function sessionsForMeeting(meetingKey) {
    return request(OPENF1 + "/sessions?meeting_key=" + encodeURIComponent(meetingKey), meetingTtl(meetingKey)).then(function (list) {
      return arr(list).map(mapSession).filter(function (s) { return s.sessionKey !== null; });
    });
  }

  function weather(sessionKey, ttl) {
    const url = OPENF1 + "/weather?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
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

  function positions(sessionKey, ttl) {
    const url = OPENF1 + "/position?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
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

  function deltaUrl(path, sessionKey, sinceISO) {
    let url = OPENF1 + path + "?session_key=" + encodeURIComponent(sessionKey);
    if (sinceISO) url += "&date%3E=" + encodeURIComponent(sinceISO);
    return url;
  }
  function cursorOf(list) {
    let cursor = null;
    for (let i = 0; i < list.length; i++) {
      const d = list[i] && list[i].date;
      if (typeof d === "string" && (!cursor || d > cursor)) cursor = d;
    }
    return cursor;
  }
  function livePositions(sessionKey, sinceISO) {
    return request(deltaUrl("/position", sessionKey, sinceISO), 0, { cache: false }).then(function (list) {
      const a = arr(list), latest = {}, out = [];
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        if (!p || p.driver_number === undefined || p.driver_number === null) continue;
        const prev = latest[p.driver_number];
        if (!prev || String(p.date || "") >= String(prev.date || "")) latest[p.driver_number] = p;
      }
      for (const k in latest) if (Object.prototype.hasOwnProperty.call(latest, k)) {
        out.push({ num: num(latest[k].driver_number), pos: num(latest[k].position) });
      }
      out.sort(function (x, y) { return (x.pos === null ? 99 : x.pos) - (y.pos === null ? 99 : y.pos); });
      return { values: out, cursor: cursorOf(a) };
    });
  }

  function intervals(sessionKey, ttl) {
    const url = OPENF1 + "/intervals?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      if (!a.length) return null;
      const latest = {}; // driver_number -> latest sample
      for (let i = 0; i < a.length; i++) {
        const iv = a[i];
        if (!iv || iv.driver_number === undefined || iv.driver_number === null) continue;
        const prev = latest[iv.driver_number];
        if (!prev || String(iv.date || "") >= String(prev.date || "")) latest[iv.driver_number] = iv;
      }
      const out = {};
      for (const k in latest) {
        if (Object.prototype.hasOwnProperty.call(latest, k)) {
          // gap_to_leader IS NOT ALWAYS A NUMBER. OpenF1 sends the string
          // "+1 LAP" (and "+2 LAPS", …) for a lapped driver, and parseFloat
          // reads that as the number 1 — so every lapped car in a race was
          // shown on the LIVE tab as a one-SECOND gap, with a near-zero gap
          // bar to match. A lap down is not a time gap and must not be
          // rendered as one: pass the label through as a STRING (null would
          // be indistinguishable from missing data) and let the renderer
          // show it without a bar.
          const raw = latest[k].gap_to_leader;
          out[k] = (typeof raw === "string" && /lap/i.test(raw)) ? raw.trim() : num(raw);
        }
      }
      return out;
    });
  }

  function liveIntervals(sessionKey, sinceISO) {
    return request(deltaUrl("/intervals", sessionKey, sinceISO), 0, { cache: false }).then(function (list) {
      const a = arr(list), latest = {}, out = {};
      for (let i = 0; i < a.length; i++) {
        const iv = a[i];
        if (!iv || iv.driver_number === undefined || iv.driver_number === null) continue;
        const prev = latest[iv.driver_number];
        if (!prev || String(iv.date || "") >= String(prev.date || "")) latest[iv.driver_number] = iv;
      }
      for (const k in latest) if (Object.prototype.hasOwnProperty.call(latest, k)) {
        const raw = latest[k].gap_to_leader;
        out[k] = (typeof raw === "string" && /lap/i.test(raw)) ? raw.trim() : num(raw);
      }
      return { values: out, cursor: cursorOf(a) };
    });
  }

  function sessionDrivers(sessionKey, ttl) {
    const url = OPENF1 + "/drivers?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
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
        return { x: num(p.x), y: num(p.y), date: Date.parse(p.date) };
      }).filter(function (p) {
        // DROPOUT ROWS. The feed emits x:0, y:0, z:0 when positioning is lost
        // (and while a car sits in the garage). num(0) is 0, not null, so the
        // old `!== null` test passed them straight through — and every consumer
        // fits its bounds to the samples, so ONE origin row rescales and
        // re-centres a whole track map: the same circuit drawn at a different
        // size in one session than another. A real sample sitting exactly on
        // the track-local origin is not a thing worth preserving over that.
        // A row whose timestamp doesn't parse goes too: it can't be ordered
        // against the car-data clock, and as a 0 it sorted before the lap and
        // never got clipped with it.
        return p.x !== null && p.y !== null && !(p.x === 0 && p.y === 0) && isFinite(p.date);
      });
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

  // Drop every request born before now: abort the fetches on the wire, and let
  // queued / backing-off / late-completing ones fall out at their next
  // generation check. DataHub.close() calls this so a reopened tab is not
  // queued behind 15 s timeouts and 60 s 429 backoffs nobody will ever render.
  function cancelAll() {
    netGen++;
    let aborted = 0;
    liveControllers.forEach(function (c) {
      try { c.abort(); aborted++; } catch (e) { /* already settled */ }
    });
    liveControllers.clear();
    if (aborted) Log.info("data", "api cancelAll aborted " + aborted);
    return aborted;
  }

  return {
    cancelAll: cancelAll,
    schedule: schedule,
    driverStandings: driverStandings,
    constructorStandings: constructorStandings,
    lastRace: lastRace,
    latestSession: latestSession,
    meetings: meetings,
    sessionsForMeeting: sessionsForMeeting,
    weather: weather,
    positions: positions,
    livePositions: livePositions,
    intervals: intervals,
    liveIntervals: liveIntervals,
    sessionDrivers: sessionDrivers,
    fastestLap: fastestLap,
    carData: carData,
    locationData: locationData,
    stints: stints,
    pits: pits,
    cacheEntryT: cacheEntryT
  };
})();
