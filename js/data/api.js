/* Apex 26 — F1API: Jolpica + OpenF1 endpoint mapping and session cache policy. Network lifecycle is owned by F1Transport. */
const F1API = (function () {
  "use strict";

  const JOLPICA = "https://api.jolpi.ca/ergast/f1";
  const OPENF1 = "https://api.openf1.org/v1";

  // THE SEASON IS READ FROM THE CLOCK, NOT BAKED INTO THE URL. Four Jolpica
  // URLs hardcoded /2026/ would have kept serving that season forever without
  // ever erroring — the worst kind of bug, because it looks like it works.
  // Computed per call, not once at load, so a tab left open across New Year
  // rolls over instead of pinning the year it booted in. Not Ergast's
  // `/current` alias: this sandbox's proxy blocks api.jolpi.ca, so it could
  // not be verified here — a safe swap once someone confirms it responds.
  //
  // Between Jan 1 and the opener, the standings endpoints return an empty
  // list — correct, and every caller already handles it.
  const season = () => String(new Date().getFullYear());
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const TTL_SCHEDULE = 24 * HOUR;
  const TTL_STANDINGS = HOUR;
  const TTL_LATEST = 10 * MINUTE;
  const TTL_HISTORIC = 7 * 24 * HOUR;
  const SESSION_FROZEN_MS = 6 * HOUR;
  let latestSessionKey = null;
  const sessionDates = {};              // sessionKey -> date_start ISO (seen sessions)
  const meetingDates = {};              // meetingKey -> date_start ISO (seen meetings)
  const { request, cancelAll, cacheEntryT } = F1Transport.create(OPENF1, TTL_HISTORIC);

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

  // `year` (optional) asks for another season's table — the Data Hub reads the
  // FINAL table of last season while the current one has no results yet
  // (js/data/standings.js). A finished season never changes: TTL_HISTORIC.
  function standingsUrl(year, what) {
    const y = year != null ? String(year | 0) : season();
    return { url: JOLPICA + "/" + y + "/" + what + ".json", ttl: y < season() ? TTL_HISTORIC : TTL_STANDINGS };
  }

  function driverStandings(year) {
    const q = standingsUrl(year, "driverstandings");
    return request(q.url, q.ttl).then(function (json) {
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

  function constructorStandings(year) {
    const q = standingsUrl(year, "constructorstandings");
    return request(q.url, q.ttl).then(function (json) {
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

  function sessionTtl(sessionKey) {
    // The known-latest session is always treated as live.
    if (sessionKey === latestSessionKey) return TTL_LATEST;
    // A session we've seen that started comfortably in the past is frozen — its
    // data never changes, so cache it for a week. This does not depend on
    // latestSession() having run first (a latestSessionKey guard leaves every
    // session on the 10 min TTL while that key is null).
    // The TTL is capped at the time since the freeze instant: freshness is
    // judged against it (age < ttl), so an entry written BEFORE the freeze
    // (an empty mid-race classification) reads stale and is refetched once,
    // instead of being served for a week.
    const ds = sessionDates[sessionKey];
    if (ds) {
      const sinceFrozen = Date.now() - (Date.parse(ds) + SESSION_FROZEN_MS);
      if (isFinite(sinceFrozen) && sinceFrozen > 0) return Math.max(TTL_LATEST, Math.min(TTL_HISTORIC, sinceFrozen));
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
      sessionKey: s.session_key != null ? s.session_key : null,
      meetingKey: s.meeting_key != null ? s.meeting_key : null,
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
    // encodeURIComponent(null) is the string "null" — refuse that URL and fall
    // back to the clock season so a cold picker never hits ?year=null.
    const y = (year == null || year === "") ? season() : year;
    return request(OPENF1 + "/meetings?year=" + encodeURIComponent(y), TTL_SCHEDULE).then(function (list) {
      return arr(list).map(function (m) {
        m = m || {};
        const out = {
          meetingKey: m.meeting_key != null ? m.meeting_key : null,
          name: str(m.meeting_name),
          country: str(m.country_name),
          circuit: str(m.circuit_short_name),
          dateStart: str(m.date_start)
        };
        if (out.meetingKey !== null && out.dateStart) meetingDates[out.meetingKey] = out.dateStart;
        // OpenF1 keeps CANCELLED rounds in the list (2026's Bahrain and Saudi
        // Arabia: is_cancelled true, https://api.openf1.org/v1/meetings?year=2026);
        // they have no sessions to show, so the picker never offers them.
        out.cancelled = m.is_cancelled === true;
        return out;
      }).filter(function (m) { return m.meetingKey !== null && !m.cancelled; });
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

  // Both /position and /intervals stream one row per sample, not per driver:
  // this folds a list down to each driver_number's most recent row. Shared by
  // the plain and delta (live*) variants of both endpoints.
  function latestByDriver(list) {
    const latest = {};
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row || row.driver_number == null) continue;
      const prev = latest[row.driver_number];
      if (!prev || String(row.date || "") >= String(prev.date || "")) latest[row.driver_number] = row;
    }
    return latest;
  }
  function byPos(x, y) {
    return (x.pos === null ? 99 : x.pos) - (y.pos === null ? 99 : y.pos);
  }

  function positionValues(list) {
    const latest = latestByDriver(list);
    const out = [];
    for (const k in latest) {
      if (Object.prototype.hasOwnProperty.call(latest, k)) {
        out.push({ num: num(latest[k].driver_number), pos: num(latest[k].position) });
      }
    }
    return out.sort(byPos);
  }

  function positions(sessionKey, ttl) {
    const url = OPENF1 + "/position?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
      const out = positionValues(arr(list));
      return out.length ? out : null;
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
      const a = arr(list);
      return { values: positionValues(a), cursor: cursorOf(a) };
    });
  }

  // gap_to_leader IS NOT ALWAYS A NUMBER. OpenF1 sends the string "+1 LAP"
  // (and "+2 LAPS", …) for a lapped driver, and parseFloat reads that as the
  // number 1 — so every lapped car in a race was shown on the LIVE tab as a
  // one-SECOND gap, with a near-zero gap bar to match. A lap down is not a
  // time gap and must not be rendered as one: pass the label through as a
  // STRING (null would be indistinguishable from missing data) and let the
  // renderer show it without a bar.
  function gapValue(raw) {
    return (typeof raw === "string" && /lap/i.test(raw)) ? raw.trim() : num(raw);
  }

  function intervalValues(list) {
    const latest = latestByDriver(list);
    const out = {};
    for (const k in latest) {
      if (Object.prototype.hasOwnProperty.call(latest, k)) out[k] = gapValue(latest[k].gap_to_leader);
    }
    return out;
  }

  function intervals(sessionKey, ttl) {
    const url = OPENF1 + "/intervals?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      return a.length ? intervalValues(a) : null;
    });
  }

  function liveIntervals(sessionKey, sinceISO) {
    return request(deltaUrl("/intervals", sessionKey, sinceISO), 0, { cache: false }).then(function (list) {
      const a = arr(list);
      return { values: intervalValues(a), cursor: cursorOf(a) };
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

  // `duration` and `gap_to_leader` change SHAPE with the session type: a number
  // for practice, sprint and race, a 3-element [Q1,Q2,Q3] array for qualifying,
  // and occasionally a string ("+1 LAP") for a lapped finisher. Passed through
  // in whichever shape arrived — results.js picks columns from the same signal.
  function durVal(v) {
    if (Array.isArray(v)) {
      return v.map(function (x) { return (typeof x === "number" && isFinite(x)) ? x : null; });
    }
    if (typeof v === "number" && isFinite(v)) return v;
    return str(v);
  }

  // Classification for ANY session — practice, qualifying, sprint or race.
  // Jolpica's /last/results only ever describes the most recent GRAND PRIX, so
  // this is the only path to "how did FP2 go".
  function sessionResult(sessionKey, ttl) {
    const url = OPENF1 + "/session_result?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
      // A session with nothing published answers {detail:"No results found."} —
      // an OBJECT, and a 200. arr() flattens that to [], which the tab renders
      // as "not published yet" rather than as a failed fetch.
      return arr(list).map(function (r) {
        r = r || {};
        return {
          pos: num(r.position),
          num: num(r.driver_number),
          laps: num(r.number_of_laps),
          points: num(r.points),
          dnf: !!r.dnf,
          dns: !!r.dns,
          dsq: !!r.dsq,
          duration: durVal(r.duration),
          gap: durVal(r.gap_to_leader)
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

  function windowed(path, sessionKey, driverNumber, startISO, endISO, options) {
    let url = OPENF1 + path + "?session_key=" + encodeURIComponent(sessionKey) +
      "&driver_number=" + encodeURIComponent(driverNumber);
    if (startISO) url += "&date>=" + encodeURIComponent(startISO);
    if (endISO) url += "&date<=" + encodeURIComponent(endISO);
    return request(url, sessionTtl(sessionKey), options);
  }

  // car telemetry samples within a time window: speed/throttle/brake/gear/rpm/drs
  function carData(sessionKey, driverNumber, startISO, endISO) {
    return windowed("/car_data", sessionKey, driverNumber, startISO, endISO).then(function (list) {
      // Same dropout rule as locationData: an unparseable date must not become
      // t:0 / date:0. That row sorted to the lap start (or broke monotonic t for
      // sampleAt / cumDist) and painted a bogus brake/speed spike on the trace.
      const a = arr(list);
      const out = [];
      let t0 = NaN;
      for (let i = 0; i < a.length; i++) {
        const c = a[i] || {};
        const cMs = Date.parse(c.date);
        if (!isFinite(cMs)) continue;
        if (!isFinite(t0)) t0 = cMs;
        out.push({
          t: (cMs - t0) / 1000,   // seconds from first valid sample
          speed: num(c.speed), throttle: num(c.throttle), brake: num(c.brake),
          gear: num(c.n_gear), rpm: num(c.rpm), drs: num(c.drs),
          date: cMs
        });
      }
      return out;
    });
  }

  // x/y track positions within a window (arbitrary track-local units)
  function locationData(sessionKey, driverNumber, startISO, endISO, options) {
    return windowed("/location", sessionKey, driverNumber, startISO, endISO, options).then(function (list) {
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
    if (driverNumber != null) url += "&driver_number=" + encodeURIComponent(driverNumber);
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
    if (driverNumber != null) url += "&driver_number=" + encodeURIComponent(driverNumber);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      return arr(list).map(function (p) {
        p = p || {};
        return { num: num(p.driver_number), lap: num(p.lap_number), duration: num(p.lane_duration ?? p.pit_duration) };
      });
    });
  }

  // OpenF1 meeting.country_name follows the GP title, not always the venue
  // (2026 Bahrain Grand Prix: circuit_short_name "Kuala Lumpur"). Display
  // mapping only — trackIdFor resolves the circuit by the calendar date window.
  const VENUE_COUNTRY = Object.freeze({
    "kuala lumpur": "Malaysia",
    "sepang": "Malaysia"
  });
  function placeLabel(circuit, country, sep) {
    const venue = str(circuit) || "";
    const nation = str(country) || "";
    const mapped = VENUE_COUNTRY[venue.toLowerCase()];
    const shown = mapped && nation && mapped.toLowerCase() !== nation.toLowerCase() ? mapped : nation;
    return [venue, shown].filter(Boolean).join(sep || ", ");
  }

  return {
    cancelAll,
    // The raw queued/timed/retried GET, JSON-parsed: `request(url, 0, { cache: false })`
    // is what __apex.openf1/jolpica use so an ad-hoc probe cannot bypass the
    // rate-limit queue or hang without the FETCH_TIMEOUT_MS abort.
    request,
    schedule,
    season,
    driverStandings,
    constructorStandings,
    latestSession,
    meetings,
    sessionsForMeeting,
    weather,
    positions,
    livePositions,
    intervals,
    liveIntervals,
    sessionDrivers,
    sessionResult,
    fastestLap,
    carData,
    locationData,
    stints,
    pits,
    placeLabel,
    cacheEntryT
  };
})();
