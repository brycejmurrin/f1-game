const F1API = (function () {
  "use strict";

  const JOLPICA = "https://api.jolpi.ca/ergast/f1";
  const OPENF1 = "https://api.openf1.org/v1";

  const season = () => String(new Date().getFullYear());
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const TTL_SCHEDULE = 24 * HOUR;
  const TTL_STANDINGS = HOUR;
  const TTL_LATEST = 10 * MINUTE;
  const TTL_HISTORIC = 7 * 24 * HOUR;
  const SESSION_FROZEN_MS = 6 * HOUR;
  const JOLPICA_LIMIT = 100;
  const JOLPICA_MAX_PAGES = 10;
  let latestSessionKey = null;
  const sessionDates = {};
  const meetingDates = {};
  const { request, cancelAll, cacheEntryT, staleMark, staleSince, forget } = F1Transport.create(OPENF1, TTL_HISTORIC);

  function num(v) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  }
  function str(v) { return (typeof v === "string" && v.length) ? v : null; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function jolpicaRows(path, ttl, rowsOf) {
    const base = JOLPICA + path + "?limit=" + JOLPICA_LIMIT;
    const page = function (offset) { return request(offset ? base + "&offset=" + offset : base, ttl); };
    return page(0).then(function (first) {
      const rows = arr(rowsOf(first)).slice();
      const total = num(first && first.MRData && first.MRData.total);
      let pages = 1;
      function more() {
        if (total == null || rows.length >= total || pages >= JOLPICA_MAX_PAGES) return { first, rows };
        pages++;
        return page(rows.length).then(function (json) {
          const next = arr(rowsOf(json));
          if (!next.length) return { first, rows };
          for (let i = 0; i < next.length; i++) rows.push(next[i]);
          return more();
        });
      }
      return more();
    });
  }

  function jRaces(json) {
    return arr(json && json.MRData && json.MRData.RaceTable && json.MRData.RaceTable.Races);
  }
  function jStandingsList(json) {
    const lists = json && json.MRData && json.MRData.StandingsTable && json.MRData.StandingsTable.StandingsLists;
    return (Array.isArray(lists) && lists[0]) || null;
  }

  function scheduleSessions(r) {
    const out = {};
    const fields = [
      ["fp1", "FirstPractice"], ["fp2", "SecondPractice"], ["fp3", "ThirdPractice"],
      ["sq", r && r.SprintQualifying ? "SprintQualifying" : "SprintShootout"],
      ["s", "Sprint"], ["q", "Qualifying"]
    ];
    for (const pair of fields) {
      const raw = r && r[pair[1]];
      const date = str(raw && raw.date), time = str(raw && raw.time);
      if (date && time) out[pair[0]] = { date, time };
    }
    const raceDate = str(r && r.date), raceTime = str(r && r.time);
    if (raceDate && raceTime) out.r = { date: raceDate, time: raceTime };
    return out;
  }

  function schedule(year) {
    const y = year != null ? String(year | 0) : season();
    const path = "/" + y + ".json";
    return jolpicaRows(path, y < season() ? TTL_HISTORIC : TTL_SCHEDULE, jRaces).then(function (page) {
      if (!page.rows.length) forget(JOLPICA + path + "?limit=" + JOLPICA_LIMIT);
      return page.rows.map(function (r) {
        const c = (r && r.Circuit) || {};
        const loc = c.Location || {};
        return {
          season: num(r && r.season) || num(y),
          round: num(r && r.round),
          circuitId: str(c.circuitId),
          name: str(r && r.raceName),
          circuit: str(c.circuitName),
          locality: str(loc.locality),
          country: str(loc.country),
          date: str(r && r.date),
          time: str(r && r.time),
          hasSprint: !!(r && (r.Sprint || r.SprintQualifying || r.SprintShootout)),
          sessions: scheduleSessions(r)
        };
      });
    });
  }

  function standingsUrl(year, what) {
    const y = year != null ? String(year | 0) : season();
    return { path: "/" + y + "/" + what + ".json", ttl: y < season() ? TTL_HISTORIC : TTL_STANDINGS };
  }

  function standingsSeasonOk(sl, year) {
    const want = year != null ? String(year | 0) : season();
    const got = sl && str(sl.season);
    if (got && got !== want) {
      Log.warn("data", "standings season mismatch: asked " + want + " got " + got);
      return false;
    }
    return true;
  }

  function driverStandings(year) {
    const q = standingsUrl(year, "driverstandings");
    return jolpicaRows(q.path, q.ttl, function (json) {
      const sl = jStandingsList(json);
      return sl && sl.DriverStandings;
    }).then(function (page) {
      if (!standingsSeasonOk(jStandingsList(page.first), year)) return [];
      return page.rows.map(function (s) {
        const d = (s && s.Driver) || {};
        const list = s && Array.isArray(s.Constructors) ? s.Constructors : [];
        const cons = list[list.length - 1] || {};
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
    return jolpicaRows(q.path, q.ttl, function (json) {
      const sl = jStandingsList(json);
      return sl && sl.ConstructorStandings;
    }).then(function (page) {
      if (!standingsSeasonOk(jStandingsList(page.first), year)) return [];
      return page.rows.map(function (s) {
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
    if (sessionKey === latestSessionKey) return TTL_LATEST;
    const ds = sessionDates[sessionKey];
    if (ds) {
      const sinceFrozen = Date.now() - (Date.parse(ds) + SESSION_FROZEN_MS);
      if (isFinite(sinceFrozen) && sinceFrozen > 0) return Math.max(TTL_LATEST, Math.min(TTL_HISTORIC, sinceFrozen));
    }
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
      dateStart: str(s.date_start),
      dateEnd: str(s.date_end)
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

  function meetings(year) {
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
        out.cancelled = m.is_cancelled === true;
        return out;
      }).filter(function (m) { return m.meetingKey !== null && !m.cancelled; });
    });
  }

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

  function sessionPositions(sessionKey) {
    const url = OPENF1 + "/position?session_key=" + encodeURIComponent(sessionKey);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      return { values: positionValues(a), cursor: cursorOf(a) };
    });
  }
  function sessionIntervals(sessionKey) {
    const url = OPENF1 + "/intervals?session_key=" + encodeURIComponent(sessionKey);
    return request(url, sessionTtl(sessionKey)).then(function (list) {
      const a = arr(list);
      return { values: intervalValues(a), cursor: cursorOf(a) };
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

  function durVal(v) {
    if (Array.isArray(v)) {
      return v.map(function (x) { return (typeof x === "number" && isFinite(x)) ? x : null; });
    }
    if (typeof v === "number" && isFinite(v)) return v;
    return str(v);
  }

  function sessionResult(sessionKey, ttl) {
    const url = OPENF1 + "/session_result?session_key=" + encodeURIComponent(sessionKey);
    return request(url, ttl != null ? ttl : sessionTtl(sessionKey)).then(function (list) {
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
    if (startISO) url += "&date%3E=" + encodeURIComponent(startISO);
    if (endISO) url += "&date%3C=" + encodeURIComponent(endISO);
    return request(url, sessionTtl(sessionKey), options);
  }

  function carData(sessionKey, driverNumber, startISO, endISO, originISO) {
    return windowed("/car_data", sessionKey, driverNumber, startISO, endISO).then(function (list) {
      const a = arr(list);
      const out = [];
      for (let i = 0; i < a.length; i++) {
        const c = a[i] || {};
        const cMs = Date.parse(c.date);
        if (!isFinite(cMs)) continue;
        out.push({
          speed: num(c.speed), throttle: num(c.throttle), brake: num(c.brake),
          gear: num(c.n_gear), rpm: num(c.rpm), drs: num(c.drs),
          date: cMs
        });
      }
      const ordered = orderedSamples(out);
      const origin = Date.parse(originISO);
      const start = isFinite(origin) ? origin : Date.parse(startISO);
      const t0 = isFinite(start) ? start : ordered.length ? ordered[0].date : 0;
      return ordered.map(function (row) { row.t = (row.date - t0) / 1000; return row; });
    });
  }

  function locationData(sessionKey, driverNumber, startISO, endISO, options) {
    return windowed("/location", sessionKey, driverNumber, startISO, endISO, options).then(function (list) {
      return orderedSamples(arr(list).map(function (p) {
        p = p || {};
        return { x: num(p.x), y: num(p.y), date: Date.parse(p.date) };
      }).filter(function (p) {
        return p.x !== null && p.y !== null && !(p.x === 0 && p.y === 0) && isFinite(p.date);
      }));
    });
  }

  function orderedSamples(rows) {
    return rows.sort(function (a, b) { return a.date - b.date; }).filter(function (row, i, all) {
      return i === 0 || row.date !== all[i - 1].date;
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
    sessionPositions,
    intervals,
    liveIntervals,
    sessionIntervals,
    sessionDrivers,
    sessionResult,
    fastestLap,
    carData,
    locationData,
    stints,
    pits,
    placeLabel,
    cacheEntryT,
    staleMark,
    staleSince,
    forget
  };
})();
