/* Apex 26 — DATA HUB RACE IT tab (DataRealRace.create(deps)) Turns one real Grand Prix's OpenF1 timing (drivers, laps, stints, pits, overtakes, race control, weather, classification, the pre-start position snapshot) into the compact race SCRIPT js/race/real-race.js replays, shows the race lap by lap (the order, the gaps, every pass, stop, flag and retirement), and offers a JUMP IN at any lap in any real driver's seat. */
const DataRealRace = (function () {
  "use strict";

  const OPENF1 = "https://api.openf1.org/v1";
  const TTL = 7 * 24 * 60 * 60 * 1000;   // a finished race never changes; the same TTL api.js gives a historic session
  const CACHE_KEY = "apex26.realrace.v1.";   // one compact script per session key (the raw laps body is 480 KB and never cached)
  const SCRIPT_V = 4;   // 2: stint ages, rain by lap, the complete flag; 3: the passes; 4: real timestamps (t0, lap starts, pass/stop/flag times), where a car went out, the fastest lap, the team radio
  const DATA_CREDIT = "Timing data: OpenF1 (CC BY-NC-SA 4.0) · pace, stops, flags and the grid are the real ones; the racing is yours.";
  const NO_TRACK_MSG = "This circuit is not in Apex 26 yet — pick another Grand Prix.";
  const NO_RACE_MSG = "No race timing published for this weekend yet.";
  const FETCH_FAIL_MSG = "Could not fetch the race timing — try again in a minute.";
  const INCOMPLETE_MSG = "Timing is still coming in for this race — it plays as far as the data goes.";
  const NO_SEAT_MSG = "no seat in this roster";
  const API_CACHE_PREFIX = "apex26.api.";   // js/data/api.js CACHE_PREFIX — the bodies of an unfinished race are dropped so the next open refetches them
  const RAW_PATHS = ["/sessions?", "/drivers?", "/laps?", "/stints?", "/pit?", "/overtakes?", "/race_control?", "/weather?", "/session_result?", "/position?", "/team_radio?"];
  // The real positions (OpenF1 /location, ~3.7 Hz per car, 2-5 MB a car for a race) — fetched once
  // per car, kept at TRACE_HZ in IndexedDB (a 22-car race is ~1.5 MB there), never in localStorage.
  const TRACE_V = 1;
  const TRACE_HZ = 2;
  const TRACE_DB = "apex26.replay", TRACE_STORE = "traces";
  const TRACE_PAD_S = 90;   // seconds of positions before lights out (the grid) and after the last lap
  const DISTANCES = [1, 0.5, 0.2, 0.1];   // FULL, half, a fifth, a tenth of the real distance

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v != null && v !== "" && isFinite(+v) ? +v : null));
  const arr = (v) => (Array.isArray(v) ? v : []);

  // ── The script builder (pure; tests/unit/real-race-script.test.mjs) ──────

  /** Game circuit for an OpenF1 session: the country's current-season circuit
   *  first (Tracks.SEASON order), else any circuit of that country, else null. */
  function trackIdFor(session, tracks) {
    const list = arr(tracks);
    const country = String(session.country_name || session.country || "").toLowerCase();
    const circuit = String(session.circuit_short_name || session.circuit || "").toLowerCase();
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!list.length) return null;
    // Circuit first: a country with two circuits (Italy: Monza + Imola; USA: Miami/Austin/Vegas) tells them apart by name.
    const byCircuit = list.find((t) => circuit && (norm(t.id) === norm(circuit) || norm(t.name) === norm(circuit)));
    if (byCircuit) return byCircuit.id;
    const alias = { "monte carlo": "monaco", "sakhir": "bahrain", "melbourne": "albert_park", "spielberg": "redbull", "austin": "cota",
                    "mexico city": "mexico", "yas marina": "abudhabi", "lusail": "qatar", "las vegas": "vegas", "spa-francorchamps": "spa",
                    "marina bay": "singapore", "budapest": "hungaroring", "montreal": "montreal", "imola": "imola", "barcelona": "catalunya" };
    if (alias[circuit] && list.some((t) => t.id === alias[circuit])) return alias[circuit];
    const same = list.filter((t) => String(t.country || "").toLowerCase() === country || (country === "united states" && t.country === "USA") || (country === "united kingdom" && t.country === "UK") || (country === "united arab emirates" && t.country === "UAE"));
    const current = same.find((t) => !t.classic);
    return (current || same[0] || {}).id || null;
  }

  /** Time of day from the session's local start hour (date_start + gmt_offset). */
  function todFor(session) {
    const iso = session.date_start || session.dateStart;
    const t = Date.parse(iso || "");
    if (!isFinite(t)) return "default";
    const off = String(session.gmt_offset || "00:00:00").split(":");
    const sign = off[0].trim().startsWith("-") ? -1 : 1;
    const h = (new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60 + sign * (Math.abs(+off[0]) + (+off[1] || 0) / 60) + 24) % 24;
    if (h < 7) return "dawn";
    if (h < 17) return "day";
    if (h < 19.5) return "dusk";
    return "night";
  }

  /** The race's weather chip from the session's rainfall samples. */
  function weatherFor(weatherRows) {
    const rows = arr(weatherRows);
    if (!rows.length) return "dry";
    const wet = rows.filter((w) => w && num(w.rainfall) > 0).length;
    if (!wet) return "dry";
    return wet / rows.length > 0.5 ? "rain" : "wet";
  }

  /** Safety-car / VSC / red windows from the race-control feed, on the leader's lap. */
  function cautionsFor(raceControl, secs) {
    const out = [];
    let open = null;
    const at = (m) => (secs ? secs(m && m.date) : null);
    for (const m of arr(raceControl)) {
      const msg = String(m && m.message || "").toUpperCase();
      const lap = num(m && m.lap_number);
      if (lap == null) continue;
      const vsc = msg.indexOf("VIRTUAL SAFETY CAR") >= 0;
      const sc = !vsc && msg.indexOf("SAFETY CAR") >= 0;
      if (msg.indexOf("RED FLAG") >= 0 && (m.flag === "RED" || msg.indexOf("RED FLAG") === 0)) {
        if (open) { open.to = lap; if (secs) open.tTo = at(m); out.push(open); open = null; }
        const red = { level: 4, from: lap, to: lap, cause: "RED FLAG" };
        if (secs) { red.tFrom = at(m); red.tTo = null; }
        out.push(red);
        continue;
      }
      if ((vsc || sc) && msg.indexOf("DEPLOYED") >= 0) {
        if (open) { open.to = lap; if (secs) open.tTo = at(m); out.push(open); }
        open = { level: vsc ? 2 : 3, from: lap, to: lap, cause: vsc ? "VSC" : "SAFETY CAR" };
        if (secs) { open.tFrom = at(m); open.tTo = null; }
      } else if (open && (vsc || sc) && (msg.indexOf("IN THIS LAP") >= 0 || msg.indexOf("ENDING") >= 0)) {
        open.to = Math.max(open.from, lap); if (secs) open.tTo = at(m); out.push(open); open = null;
      }
    }
    if (open) out.push(open);
    return out;
  }

  /** The grid: each driver's FIRST position snapshot of the race session (taken on the grid, before the start). */
  function gridFor(positions) {
    const first = {};
    for (const p of arr(positions)) {
      const n = num(p && p.driver_number), pos = num(p && p.position);
      if (n == null || pos == null) continue;
      const d = String(p.date || "");
      if (!(n in first) || d < first[n].date) first[n] = { date: d, pos };
    }
    const out = {};
    for (const n in first) out[n] = first[n].pos;
    return out;
  }

  /**
   * raw = { session, drivers, laps, stints, pits, raceControl, weather, result, positions }
   * (each an OpenF1 body, `session` one /sessions row). `findTeam(name)` maps
   * an OpenF1 team name to a roster team (js/data/hub.js). `tracks` is Tracks.LIST.
   */
  function build(raw, findTeam, tracks) {
    const s = raw.session || {};
    const laps = arr(raw.laps);
    let totalLaps = 0;
    for (const l of laps) { const n = num(l && l.lap_number); if (n > totalLaps) totalLaps = n; }
    for (const r of arr(raw.result)) { const n = num(r && r.number_of_laps); if (n > totalLaps) totalLaps = n; }
    const grid = gridFor(raw.positions);
    const byNum = {};
    for (const d of arr(raw.drivers)) {
      const n = num(d && d.driver_number);
      if (n == null || byNum[n]) continue;
      const team = findTeam ? findTeam(d.team_name) : null;
      byNum[n] = { num: n, code: String(d.name_acronym || "").toUpperCase().slice(0, 3), name: String(d.full_name || d.broadcast_name || ""),
                   team: String(d.team_name || ""), teamId: team ? team.id : null, grid: grid[n] || null,
                   pos: null, lapsDone: 0, dnf: false, laps: new Array(totalLaps).fill(null), stints: [], pits: [] };
    }
    for (const l of laps) {
      const d = byNum[num(l && l.driver_number)];
      const n = num(l && l.lap_number);
      if (!d || !(n >= 1) || n > totalLaps) continue;
      d.laps[n - 1] = num(l.lap_duration);
    }
    for (const st of arr(raw.stints)) {
      const d = byNum[num(st && st.driver_number)];
      if (!d) continue;
      d.stints.push({ c: String(st.compound || "").toUpperCase(), from: num(st.lap_start) || 1, to: num(st.lap_end) || totalLaps, age: num(st.tyre_age_at_start) || 0 });
    }
    // Lights out: the earliest first-lap start in the field (a driver's lap 1 begins as the lights go out).
    let t0 = NaN;
    for (const l of laps) { if (num(l && l.lap_number) === 1) { const t = Date.parse(l.date_start || ""); if (isFinite(t) && !(t >= t0)) t0 = t; } }
    if (!isFinite(t0)) t0 = Date.parse(s.date_start || "") || 0;
    const secs = (iso) => { const t = Date.parse(iso || ""); return isFinite(t) ? Math.round((t - t0) / 1000 * 1000) / 1000 : null; };
    for (const d of drivers0(byNum)) d.lapStart = new Array(totalLaps).fill(null);
    for (const l of laps) {
      const d = byNum[num(l && l.driver_number)];
      const n = num(l && l.lap_number);
      if (d && n >= 1 && n <= totalLaps) d.lapStart[n - 1] = secs(l.date_start);
    }
    for (const p of arr(raw.pits)) {
      const d = byNum[num(p && p.driver_number)];
      const lap = num(p && p.lap_number);
      if (d && lap != null) { d.pits.push(lap); (d.pitT = d.pitT || []).push(secs(p.date)); (d.pitDur = d.pitDur || []).push(num(p.pit_duration)); }
    }
    for (const r of arr(raw.result)) {
      const d = byNum[num(r && r.driver_number)];
      if (!d) continue;
      d.pos = num(r.position);
      d.lapsDone = num(r.number_of_laps) || 0;
      d.dnf = !!(r.dnf || r.dns || r.dsq) || d.pos == null;
      d.dsq = !!r.dsq; d.dns = !!r.dns;
    }
    const drivers = Object.keys(byNum).map((k) => byNum[k]);
    for (const d of drivers) {
      d.stints.sort((a, b) => a.from - b.from);
      if (d.pitT) { const idx = d.pits.map((_, i) => i).sort((a, b) => d.pits[a] - d.pits[b]); d.pits = idx.map((i) => d.pits[i]); d.pitT = idx.map((i) => d.pitT[i]); d.pitDur = idx.map((i) => d.pitDur[i]); }
      else d.pits.sort((a, b) => a - b);
      if (!d.lapsDone) d.lapsDone = d.laps.filter((t) => t > 0).length;
      // Where and when the car went out: the incident row naming it on the lap it stopped, else the end of its last timed lap.
      if (d.dnf && !d.dns) {
        const inc = incidentFor(raw.raceControl, d, (d.lapsDone | 0) + 1);
        d.outWhere = inc ? inc.where : null;
        // WHEN: the start of the lap it did not finish (the stewards' note is dated when it was posted, laps later).
        d.outT = d.lapStart[d.lapsDone] != null ? d.lapStart[d.lapsDone] : (d.lapStart[d.lapsDone - 1] != null && d.laps[d.lapsDone - 1] > 0 ? d.lapStart[d.lapsDone - 1] + d.laps[d.lapsDone - 1] : null);
      }
    }
    // The race's fastest lap.
    let fastest = null;
    for (const d of drivers) d.laps.forEach((t, i) => { if (t > 0 && (!fastest || t < fastest.dur)) fastest = { num: d.num, lap: i + 1, dur: t, t: d.lapStart[i] != null ? d.lapStart[i] + t : null }; });
    // Grid order first (a driver with no snapshot goes to the back, by number), so the table reads like the grid.
    drivers.sort((a, b) => (a.grid || 99) - (b.grid || 99) || a.num - b.num);
    // COMPLETE means a classification with a winner and every driver's laps in:
    // a race still running (or one OpenF1 has not finished publishing) builds,
    // and can be played, but is never cached — the next open fetches it again.
    const complete = totalLaps > 0 && arr(raw.result).some((r) => r && num(r.position) === 1) && drivers.some((d) => d.laps.filter((t) => t > 0).length === totalLaps);
    return {
      v: SCRIPT_V, source: "openf1",
      sessionKey: num(s.session_key), meetingKey: num(s.meeting_key), year: num(s.year),
      name: String(s.meeting_name || s.name || ((s.country_name || "") + " Grand Prix")).trim(),
      session: String(s.session_name || "Race"),
      circuit: String(s.circuit_short_name || ""), country: String(s.country_name || ""),
      trackId: trackIdFor(s, tracks), dateStart: String(s.date_start || ""),
      tod: todFor(s), weather: weatherFor(raw.weather), rain: rainByLap(laps, raw.weather, totalLaps),
      laps: totalLaps, drivers, cautions: cautionsFor(raw.raceControl, secs), passes: passesFor(raw.overtakes, laps, totalLaps, drivers, secs), complete,
      t0: t0 || null, fastest,
      radio: arr(raw.teamRadio).map((r) => ({ t: secs(r && r.date), num: num(r && r.driver_number), url: String(r && r.recording_url || "") }))
        .filter((r) => r.t != null && r.t >= -60 && r.num != null && /^https:\/\//.test(r.url))   // t >= -60: the pre-race chatter is not the race
        .map((r) => { const d = byNum[r.num]; let lap = 0; if (d) d.lapStart.forEach((ls, i) => { if (ls != null && ls <= r.t) lap = i + 1; }); return { t: r.t, num: r.num, lap, url: r.url }; }),
      incidents: incidentsFor(raw.raceControl, secs),
    };
  }
  function drivers0(byNum) { return Object.keys(byNum).map((k) => byNum[k]); }

  /** The race-control row that names a driver's retirement on the lap it happened (or the next): {where: "TURN 1", t}. */
  function incidentFor(raceControl, d, lap) {
    for (const m of arr(raceControl)) {
      const msg = String(m && m.message || "").toUpperCase();
      const ml = num(m && m.lap_number);
      if (ml == null || ml < lap || ml > lap + 4 || msg.indexOf("INCIDENT") < 0) continue;   // the stewards note it a few laps on
      if (msg.indexOf("(" + d.code + ")") < 0 && !new RegExp("CARS? [^A-Z]*\\b" + d.num + "\\b").test(msg)) continue;
      const turn = /TURN (\d+)/.exec(msg);
      return { where: turn ? "TURN " + turn[1] : null, t: m.date || null };
    }
    return null;
  }
  /** Race control's story beyond the flags: incidents, penalties, lapped cars released, marshals — [{lap, t, text}]. */
  function incidentsFor(raceControl, secs) {
    const out = [];
    for (const m of arr(raceControl)) {
      const msg = String(m && m.message || "");
      const lap = num(m && m.lap_number);
      if (lap == null || !/INCIDENT|LAPPED CARS|MARSHALS|DELETED|PENALTY|OVERTAKE (ENABLED|DISABLED)/i.test(msg)) continue;
      const t = secs ? secs(m.date) : null;
      if (t != null && t < -60) continue;   // the pre-race notes (practice-start infringements) are not the race
      out.push({ lap, t, text: msg.replace(/\s+/g, " ").trim().slice(0, 140) });
    }
    return out;
  }

  /** Every pass, on the lap the overtaking car was on: [{lap, by, over, pos}] —
   *  OpenF1's /overtakes rows dated against that driver's lap start times. */
  function passesFor(overtakes, laps, totalLaps, drivers, secs) {
    // A car that stopped on lap L is "passed" by the whole field as it drops
    // down the order (the feed logged 24 passes on Norris and Gasly the lap
    // they retired at Baku 2026): a pass on either side of a retiring car is
    // the retirement, not an overtake.
    const ends = {};   // num -> the lap the car's race ended on (dnf only)
    for (const d of arr(drivers)) if (d && d.dnf && d.num != null) ends[d.num] = (d.lapsDone | 0) + 1;
    const starts = {};   // num -> [lap start ms by lap]
    for (const l of arr(laps)) {
      const n = num(l && l.driver_number), k = num(l && l.lap_number), t = Date.parse(l && l.date_start || "");
      if (n == null || !(k >= 1) || !isFinite(t)) continue;
      (starts[n] = starts[n] || [])[k] = t;
    }
    const lapOf = (n, t) => {
      const row = starts[n];
      let lap = 0;
      if (row) for (let k = 1; k < row.length; k++) if (row[k] != null && row[k] <= t && k > lap) lap = k;
      return lap;
    };
    const out = [];
    for (const o of arr(overtakes)) {
      const by = num(o && o.overtaking_driver_number), over = num(o && o.overtaken_driver_number), pos = num(o && o.position);
      const t = Date.parse(o && o.date || "");
      if (by == null || over == null || !isFinite(t)) continue;
      const lap = lapOf(by, t) || lapOf(over, t) || 1;
      if (lap > totalLaps) continue;
      if (ends[by] <= lap || ends[over] <= lap) continue;
      const p = { lap, by, over, pos };
      if (secs) { p.t = secs(o.date); const st = starts[by] && starts[by][lap]; const dur = (drivers || []).find((d) => d && d.num === by); const ld = dur && dur.laps ? dur.laps[lap - 1] : null; if (st != null && ld > 0) p.frac = Math.max(0, Math.min(0.999, (t - st) / 1000 / ld)); }
      out.push(p);
    }
    out.sort((a, b) => (a.t != null && b.t != null ? a.t - b.t : a.lap - b.lap));
    return out;
  }

  // ── The race book (pure): the order at every lap, and what each lap held ──

  /** The classification at the end of real lap L, from the crossing times:
   *  [{num, t (lap time), cum, gap, interval, pitIn, pitOut, out}] fastest
   *  crossing first, then the cars that had stopped by then (last lap first). */
  function lapBoard(script, lap) {
    const cum = typeof RealRace !== "undefined" && RealRace.cumTable ? RealRace.cumTable(script) : null;
    if (!cum) return [];
    const running = [], stopped = [];
    for (const d of script.drivers || []) {
      const row = cum[d.num];
      const pits = d.pits || [];
      if (row.length > lap) running.push({ num: d.num, code: d.code, t: d.laps[lap - 1] > 0 ? d.laps[lap - 1] : null, cum: row[lap], pitIn: pits.indexOf(lap) >= 0, pitOut: pits.indexOf(lap - 1) >= 0, tyre: compoundAt(d, lap), out: false });
      else stopped.push({ num: d.num, code: d.code, t: null, cum: null, done: row.length - 1, pitIn: false, pitOut: false, tyre: compoundAt(d, row.length - 1), out: true });
    }
    running.sort((a, b) => a.cum - b.cum);
    stopped.sort((a, b) => b.done - a.done);
    const lead = running.length ? running[0].cum : 0;
    running.forEach((r, i) => { r.pos = i + 1; r.gap = +(r.cum - lead).toFixed(3); r.interval = i ? +(r.cum - running[i - 1].cum).toFixed(3) : 0; });
    stopped.forEach((r, i) => { r.pos = running.length + i + 1; r.gap = null; r.interval = null; });
    return running.concat(stopped);
  }
  function compoundAt(d, lap) {
    let c = null;
    for (const st of d.stints || []) if (st.from <= lap) c = st.c;
    return c ? c[0] : null;
  }

  /** One entry per real lap: who led, the passes, the stops, who went out, the
   *  flag flying, the rain, the lap's fastest. The picker and the lap list read it. */
  function raceBook(script) {
    const laps = script.laps | 0;
    const byNum = {};
    for (const d of script.drivers || []) byNum[d.num] = d;
    const code = (n) => (byNum[n] ? byNum[n].code : String(n));
    const book = [];
    for (let lap = 1; lap <= laps; lap++) {
      const board = lapBoard(script, lap);
      const lead = board.find((r) => !r.out);
      const flags = (script.cautions || []).filter((w) => lap >= w.from && lap <= (w.to != null ? w.to : w.from));
      const flag = flags.some((w) => w.level >= 4) ? "RED FLAG" : flags.some((w) => w.level === 3) ? "SAFETY CAR" : flags.some((w) => w.level === 2) ? "VSC" : "";
      let fastest = null;
      for (const r of board) if (r.t != null && (!fastest || r.t < fastest.t)) fastest = r;
      book.push({
        lap, leader: lead ? lead.code : "", flag,
        rain: !!(Array.isArray(script.rain) && script.rain[lap]),
        passes: (script.passes || []).filter((p) => p.lap === lap).map((p) => ({ by: code(p.by), over: code(p.over), pos: p.pos })),
        pits: board.filter((r) => r.pitIn).map((r) => r.code),
        out: (script.drivers || []).filter((d) => d.dnf && (d.lapsDone | 0) + 1 === lap && (d.lapsDone | 0) < laps).map((d) => d.code),
        fastest: fastest ? { code: fastest.code, t: fastest.t } : null,
      });
    }
    return book;
  }

  function fmtLap(t) {
    if (!(t > 0)) return "—";
    const m = Math.floor(t / 60), sec = t - m * 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec.toFixed(3);
  }
  function fmtGap(v) { return v == null ? "—" : v === 0 ? "" : "+" + v.toFixed(3); }

  /** Rain lap by lap (index = real lap, true when any weather sample inside that
   *  lap's window — the leader's lap start to the next — reports rainfall), or
   *  null when the lap rows carry no timestamps to align the samples to. */
  function rainByLap(laps, weatherRows, totalLaps) {
    const starts = new Array(totalLaps + 2).fill(Infinity);
    let any = false;
    for (const l of arr(laps)) {
      const n = num(l && l.lap_number), t = Date.parse(l && l.date_start || "");
      if (n >= 1 && n <= totalLaps && isFinite(t) && t < starts[n]) { starts[n] = t; any = true; }
    }
    if (!any) return null;
    for (let n = 2; n <= totalLaps; n++) if (!isFinite(starts[n])) starts[n] = starts[n - 1];   // a lap nobody timed inherits the previous start
    const out = new Array(totalLaps + 1).fill(false);
    for (const w of arr(weatherRows)) {
      if (!(num(w && w.rainfall) > 0)) continue;
      const t = Date.parse(w.date || "");
      if (!isFinite(t)) continue;
      for (let n = 1; n <= totalLaps; n++) {
        const end = n < totalLaps && isFinite(starts[n + 1]) ? starts[n + 1] : Infinity;
        if (t >= starts[n] && t < end) { out[n] = true; break; }
      }
    }
    return out;
  }

  // ── Fetching: one script per session, through F1API's queue and rate window ──
  function fetchRaw(sessionKey) {
    const q = (path, opts) => F1API.request(OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey), TTL, opts);
    return Promise.all([
      q("/sessions?"), q("/drivers?"), q("/laps?", { cache: false }), q("/stints?"), q("/pit?"), q("/overtakes?"),
      q("/race_control?"), q("/weather?"), q("/session_result?"), q("/position?"), q("/team_radio?"),
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
      for (const path of RAW_PATHS) localStorage.removeItem(API_CACHE_PREFIX + OPENF1 + path + "session_key=" + encodeURIComponent(sessionKey));
    } catch (e) { /* no storage: nothing was cached */ }
  }

  // ── The real positions: one /location pull per car, kept in IndexedDB ──
  function traceDb() {
    return new Promise((res) => {
      let r;
      try { if (typeof indexedDB === "undefined" || !indexedDB) { res(null); return; } r = indexedDB.open(TRACE_DB, 1); }
      catch (e) { res(null); return; }
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(TRACE_STORE)) db.createObjectStore(TRACE_STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = r.onblocked = () => res(null);
    });
  }
  function traceGet(sessionKey) {
    return traceDb().then((db) => new Promise((res) => {
      if (!db) { res(null); return; }
      try {
        const rq = db.transaction(TRACE_STORE, "readonly").objectStore(TRACE_STORE).get(String(sessionKey));
        rq.onsuccess = () => { const v = rq.result; res(v && v.v === TRACE_V && v.cars ? v : null); };
        rq.onerror = () => res(null);
      } catch (e) { res(null); }
    }));
  }
  function tracePut(traces) {
    return traceDb().then((db) => new Promise((res) => {
      if (!db) { res(false); return; }
      try {
        const t = db.transaction(TRACE_STORE, "readwrite");
        t.objectStore(TRACE_STORE).put(traces, String(traces.sessionKey));
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
    for (const r of arr(rows)) {
      const t = r && r.date != null ? +r.date : NaN;
      if (!isFinite(t) || t - last < gap || !(isFinite(r.x) && isFinite(r.y))) continue;
      last = t;
      out.push((t - t0) / 1000, r.x / 10, r.y / 10);
    }
    return Float32Array.from(out);
  }
  /** The field's positions for a script: cached, else fetched car by car (onProgress(done, total)). */
  function fetchTraces(script, onProgress) {
    if (!script || !script.t0 || !script.drivers) return Promise.reject(new Error("no timestamps in the script"));
    return traceGet(script.sessionKey).then((hit) => {
      if (hit) return hit;
      const t0 = script.t0;
      let end = 0;
      for (const d of script.drivers) d.lapStart.forEach((ls, i) => { if (ls != null && d.laps[i] > 0 && ls + d.laps[i] > end) end = ls + d.laps[i]; });
      const startISO = new Date(t0 - TRACE_PAD_S * 1000).toISOString(), endISO = new Date(t0 + (end + TRACE_PAD_S) * 1000).toISOString();
      const traces = { v: TRACE_V, sessionKey: script.sessionKey, t0, hz: TRACE_HZ, cars: {} };
      let done = 0;
      const total = script.drivers.length;
      return Promise.all(script.drivers.map((d) => F1API.locationData(script.sessionKey, d.num, startISO, endISO)
        .then((rows) => { traces.cars[d.num] = packTrace(rows, t0); }, () => { traces.cars[d.num] = new Float32Array(0); })
        .then(() => { done++; if (onProgress) onProgress(done, total); })))
        .then(() => tracePut(traces).then(() => traces));
    });
  }

  function cached(sessionKey) {
    try {
      const raw = localStorage.getItem(CACHE_KEY + sessionKey);
      const s = raw ? JSON.parse(raw) : null;
      return s && s.v === SCRIPT_V && s.complete === true && s.laps > 0 && Array.isArray(s.drivers) ? s : null;
    } catch (e) { return null; }
  }
  function remember(script) {
    try { localStorage.setItem(CACHE_KEY + script.sessionKey, JSON.stringify(script)); } catch (e) { /* quota: the next open refetches */ }
  }

  function create(deps) {
    const { el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker, teamChip, fmtDateTime, findTeam, close } = deps;
    let bodyGen = 0;
    let distance = 1;   // the fraction of the real distance the player races (DISTANCES)
    let startLap = 1;   // the REAL lap the player drops into (1 = the grid)
    let seatCode = null;   // the DRIVE AS pick, a driver code (null: the first seated driver)
    let traces = null;     // the real positions for the painted script, once loaded
    let loading = null;    // {done, total} while the positions load

    function tracks() { return typeof Tracks !== "undefined" && Tracks.LIST ? Tracks.LIST : []; }

    /** The script for a session: the cache, else nine OpenF1 requests. */
    function scriptFor(sessionKey) {
      const hit = cached(sessionKey);
      if (hit) return Promise.resolve(hit);
      return fetchRaw(sessionKey).then((raw) => {
        const script = build(raw, findTeam, tracks());
        if (script.complete && script.drivers.length) remember(script); else forgetRaw(sessionKey);
        return script;
      });
    }

    /** The RACE (or the Sprint the picker chose) of the selected meeting. */
    function raceSession(meta) {
      const isRace = (m) => m && /^(race|sprint)$/i.test(String(m.name || "")) && /race/i.test(String(m.type || ""));
      if (isRace(meta)) return Promise.resolve(meta);
      const mk = meta && meta.meetingKey != null ? meta.meetingKey : sel.meetingKey;
      if (mk == null) return Promise.resolve(null);
      return F1API.sessionsForMeeting(mk).then((ss) => {
        const races = ss.filter(isRace);
        return races.find((m) => /^race$/i.test(m.name)) || races[0] || null;
      });
    }

    function loadRealRace() {
      return ensureSession(false).then(() => {
        const wrap = el("div");
        wrap.appendChild(buildPicker((meta) => renderBody(meta, body)));
        const body = el("div");
        wrap.appendChild(body);
        renderBody(sel.meta, body);
        return wrap;
      });
    }

    function renderBody(meta, body) {
      const myGen = ++bodyGen;
      clear(body);
      if (!meta || meta.sessionKey == null) { body.appendChild(emptyMsg(NO_RACE_MSG)); return; }
      const slot = el("div");
      slot.appendChild(spinner());
      body.appendChild(slot);
      raceSession(meta).then((race) => {
        if (myGen !== bodyGen) return;
        if (!race) { clear(slot); slot.appendChild(emptyMsg(NO_RACE_MSG)); return; }
        return scriptFor(race.sessionKey).then((script) => {
          if (myGen !== bodyGen) return;
          clear(slot);
          if (!script.laps || !script.drivers.length) { slot.appendChild(emptyMsg(NO_RACE_MSG)); return; }
          paint(script, slot);
        });
      }).then(null, (e) => {
        if (myGen !== bodyGen) return;
        Log.warn("data", "real race script failed: " + (e && e.message ? e.message : e));
        clear(slot);
        slot.appendChild(emptyMsg(FETCH_FAIL_MSG));
      });
    }

    function simLaps(script) { return Math.max(1, Math.round(script.laps * distance)); }

    /** What each real lap is remembered for — the labels of the JUMP IN AT picker. */
    function lapEvents(script) {
      const ev = {};
      const add = (lap, text) => { if (lap >= 1 && lap <= script.laps) (ev[lap] = ev[lap] || []).push(text); };
      for (const w of script.cautions || []) add(w.from, w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VSC");
      for (const d of script.drivers || []) { if (d.dnf && d.lapsDone >= 0) add(d.lapsDone + 1, d.code + " out"); }
      const rain = Array.isArray(script.rain) ? script.rain : [];
      for (let n = 1; n <= script.laps; n++) if (rain[n] && !rain[n - 1]) add(n, "rain");
      return ev;
    }

    /** DRIVE AS: the seat every JUMP IN uses — the drivers with a roster seat, in grid order. */
    function seatPicker(script, seats) {
      const field = el("label", "dh-pick-field");
      field.appendChild(el("span", "dh-pick-label", "DRIVE AS"));
      const pick = el("select", "dh-pick-select");
      const seated = script.drivers.filter((d) => !seats || seats.has(d.num));
      if (!seated.some((d) => d.code === seatCode)) seatCode = seated.length ? seated[0].code : null;
      seated.forEach((d) => {
        const op = el("option", null, (d.grid != null ? "P" + d.grid + " · " : "") + d.code + " · " + d.name);
        op.value = d.code;
        if (d.code === seatCode) op.selected = true;
        pick.appendChild(op);
      });
      pick.addEventListener("change", () => { seatCode = pick.value || seatCode; });
      field.appendChild(pick);
      return field;
    }

    /** REAL POSITIONS: load the field's real x/y (OpenF1 /location) once, then WATCH the
     *  whole race or its HIGHLIGHTS with the camera on the DRIVE AS pick — every car
     *  where it really was. Until they load, the WATCH buttons load them first. */
    function replayRow(script, slot) {
      const row = el("div", "dh-rounds");
      const have = traces && traces.sessionKey === script.sessionKey;
      const canReplay = !!script.t0 && typeof RealRace !== "undefined" && !!RealRace.replay;
      if (!canReplay) { row.appendChild(el("span", "dh-lr-meta", "Real positions need a script with timestamps — reopen the tab to refetch it.")); return row; }
      const state = el("span", "dh-lr-meta", have ? "REAL POSITIONS LOADED · " + Object.keys(traces.cars).length + " CARS" : loading ? "LOADING REAL POSITIONS · " + loading.done + " / " + loading.total : "REAL POSITIONS · " + script.drivers.length + " CARS, ONE PULL EACH (≈ 60 MB, CACHED)");
      row.appendChild(state);
      // A race loaded on an earlier visit is in IndexedDB: say so once it answers (a repaint, not a fetch).
      if (!have && !loading) traceGet(script.sessionKey).then((hit) => { if (hit && !traces && slot && slot.isConnected !== false) { traces = hit; clear(slot); paint(script, slot); } });
      const mk = (label, aria, fn) => { const b = el("button", "dh-pill", label); b.type = "button"; b.setAttribute("aria-label", aria); b.disabled = !!loading; b.addEventListener("click", fn); row.appendChild(b); return b; };
      if (!have) mk("LOAD", "Load the real positions of every car", () => loadTraces(script, slot, null));
      mk("HIGHLIGHTS", "Watch the highlights of the race, recreated", () => watch(script, slot, 1, true));
      mk("WATCH FROM L" + startLap, "Watch the race recreated from lap " + startLap, () => watch(script, slot, startLap, false));
      return row;
    }
    function loadTraces(script, slot, then) {
      if (loading) return;
      loading = { done: 0, total: script.drivers.length };
      const repaint = () => { if (slot) { clear(slot); paint(script, slot); } };
      repaint();
      fetchTraces(script, (done, total) => { loading = { done, total }; repaint(); })
        .then((tr) => { traces = tr; loading = null; repaint(); if (then) then(tr); },
              (e) => { loading = null; Log.warn("data", "real positions: " + (e && e.message || e)); repaint(); });
    }
    /** WATCH / HIGHLIGHTS: the positions first (if not yet), then the replay in the DRIVE AS seat. */
    function watch(script, slot, fromLap, reel) {
      const go = (tr) => {
        if (typeof RealRace === "undefined" || !RealRace.launch) return false;
        startLap = fromLap;
        Log.info("data", "real replay " + script.sessionKey + (reel ? " highlights" : " from " + fromLap) + " follow=" + seatCode);
        if (close) close();
        return !!RealRace.launch(script, { seat: seatCode, laps: script.laps, startLap: fromLap, watch: true, reel: !!reel, traces: tr, intro: true });   // intro: the pre-race card and announcer (js/race/real-race.js launch)
      };
      if (traces && traces.sessionKey === script.sessionKey) return go(traces);
      loadTraces(script, slot, go);
      return true;
    }

    /** The race lap by lap: one row per lap with what it held and a JUMP IN; a
     *  click on the lap opens its classification (gaps, intervals, lap times, sets). */
    function lapList(script) {
      const book = raceBook(script);
      const wrap = el("div");
      wrap.appendChild(el("div", "dh-lr-name", "LAP BY LAP"));
      wrap.appendChild(el("div", "dh-lr-meta", "Every pass, stop, flag and retirement as it happened. Open a lap for the order and the gaps; JUMP IN drops you into the race as it stood at the start of that lap."));
      const table = el("table", "dh-table");
      const thead = el("thead"), hr = el("tr");
      ["LAP", "LEADER", "WHAT HAPPENED", "FASTEST", ""].forEach((h) => hr.appendChild(el("th", null, h)));
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = el("tbody");
      book.forEach((b) => {
        const tr = el("tr");
        tr.appendChild(el("td", null, "L" + b.lap));
        tr.appendChild(el("td", null, b.leader || "—"));
        const bits = [];
        if (b.flag) bits.push(b.flag);
        if (b.rain) bits.push("RAIN");
        b.passes.forEach((p) => bits.push(p.by + " passed " + p.over + (p.pos ? " for P" + p.pos : "")));
        if (b.pits.length) bits.push("pit: " + b.pits.join(", "));
        b.out.forEach((c) => bits.push(c + " OUT"));
        tr.appendChild(el("td", null, bits.length ? bits.join(" · ") : (b.lap === 1 ? "lights out" : "")));
        tr.appendChild(el("td", null, b.fastest ? b.fastest.code + " " + fmtLap(b.fastest.t) : "—"));
        const cell = el("td");
        const go = el("button", "dh-pill", b.lap === 1 ? "START" : "JUMP IN");
        go.type = "button";
        go.setAttribute("aria-label", "Jump in at lap " + b.lap);
        go.addEventListener("click", (e) => { if (e && e.stopPropagation) e.stopPropagation(); startLap = b.lap; jumpIn(script, seatCode); });
        cell.appendChild(go);
        if (script.t0 && typeof RealRace !== "undefined" && RealRace.replay) {
          const w = el("button", "dh-pill", "WATCH");
          w.type = "button";
          w.setAttribute("aria-label", "Watch the race recreated from lap " + b.lap);
          w.addEventListener("click", (e) => { if (e && e.stopPropagation) e.stopPropagation(); watch(script, tbody.parentNode && tbody.parentNode.parentNode, b.lap, false); });
          cell.appendChild(w);
        }
        tr.appendChild(cell);
        tr.setAttribute("role", "button");
        tr.tabIndex = 0;
        tr.setAttribute("aria-expanded", "false");
        let open = null;
        const toggle = () => {
          if (open) { open.hidden = !open.hidden; tr.setAttribute("aria-expanded", open.hidden ? "false" : "true"); return; }
          open = boardRow(script, b.lap);
          tr.setAttribute("aria-expanded", "true");
          if (tr.nextSibling) tbody.insertBefore(open, tr.nextSibling); else tbody.appendChild(open);
        };
        tr.addEventListener("click", toggle);
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    /** The classification at the end of a lap, as one full-width row of the lap list. */
    function boardRow(script, lap) {
      const tr = el("tr");
      const td = el("td");
      td.colSpan = 5;
      const table = el("table", "dh-table");
      const thead = el("thead"), hr = el("tr");
      ["POS", "DRIVER", "GAP", "INT", "LAP", "TYRE", ""].forEach((h) => hr.appendChild(el("th", null, h)));
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = el("tbody");
      lapBoard(script, lap).forEach((r) => {
        const row = el("tr");
        if (r.pos <= 3 && !r.out) row.className = r.pos === 1 ? "dh-lr-p1" : r.pos === 2 ? "dh-lr-p2" : "dh-lr-p3";
        row.appendChild(el("td", null, r.out ? "OUT" : "P" + r.pos));
        row.appendChild(el("td", null, r.code));
        row.appendChild(el("td", null, r.out ? "L" + r.done : fmtGap(r.gap)));
        row.appendChild(el("td", null, r.out ? "" : fmtGap(r.interval)));
        row.appendChild(el("td", null, fmtLap(r.t)));
        row.appendChild(el("td", null, r.tyre || "—"));
        row.appendChild(el("td", null, r.pitIn ? "IN" : r.pitOut ? "OUT LAP" : ""));
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      td.appendChild(table);
      tr.appendChild(td);
      return tr;
    }

    /** The roster seats this script's drivers take (RealRace.mapField), or null before the game is up. */
    function seatsFor(script) {
      if (typeof RealRace === "undefined" || !RealRace.mapField || typeof Teams === "undefined") return null;
      const nums = new Set(RealRace.mapField(script, Teams.LIST).map((s) => s.num));
      return nums;
    }

    function paint(script, slot) {
      const head = el("div");
      head.appendChild(el("div", "dh-lr-name", (script.year ? script.year + " " : "") + script.name + (script.session !== "Race" ? " · " + script.session : "")));
      const meta = [script.circuit, script.country].filter(Boolean).join(", ");
      const winner = script.drivers.find((d) => d.pos === 1);
      head.appendChild(el("div", "dh-lr-meta", [meta, script.dateStart ? fmtDateTime(script.dateStart) : "", script.laps + " laps",
        winner ? "won by " + winner.name : "", script.cautions.filter((c) => c.level < 4).length + " safety car / VSC", script.weather.toUpperCase()].filter(Boolean).join(" · ")));
      slot.appendChild(head);
      const playable = !!script.trackId && tracks().some((t) => t.id === script.trackId);
      if (!playable) { slot.appendChild(emptyMsg(NO_TRACK_MSG)); return; }
      if (!script.complete) slot.appendChild(el("div", "dh-lr-meta", INCOMPLETE_MSG));
      if (startLap > script.laps) startLap = 1;
      const seats = seatsFor(script);

      // Distance pills — the whole race, or a condensed one that keeps every stop and flag in proportion.
      const pills = el("div", "dh-rounds");
      DISTANCES.forEach((f) => {
        const n = Math.max(1, Math.round(script.laps * f));
        const b = el("button", "dh-pill" + (f === distance ? " active" : ""), f === 1 ? n + " LAPS (FULL)" : n + " LAPS");
        b.type = "button";
        b.setAttribute("aria-pressed", f === distance ? "true" : "false");
        b.addEventListener("click", () => { if (f !== distance) { distance = f; clear(slot); paint(script, slot); } });
        pills.appendChild(b);
      });
      slot.appendChild(pills);
      const pickRow = el("div", "dh-pick-fields");
      pickRow.appendChild(seatPicker(script, seats));
      slot.appendChild(pickRow);
      slot.appendChild(replayRow(script, slot));
      slot.appendChild(lapList(script));

      slot.appendChild(el("div", "dh-lr-name", "ENTRY LIST"));
      const table = el("table", "dh-table");
      const thead = el("thead"), hr = el("tr");
      ["GRID", "DRIVER", "TEAM", "TYRES", "RESULT", ""].forEach((h) => hr.appendChild(el("th", null, h)));
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = el("tbody");
      script.drivers.forEach((d) => {
        const tr = el("tr");
        tr.appendChild(el("td", null, d.grid != null ? "P" + d.grid : "—"));
        const who = el("td");
        who.appendChild(teamChip(d.code, d.team));
        who.appendChild(el("span", null, " " + d.name));
        tr.appendChild(who);
        tr.appendChild(el("td", null, d.team));
        tr.appendChild(el("td", null, d.stints.map((s) => (s.c[0] || "?") + (s.to - s.from + 1)).join(" ") || "—"));
        tr.appendChild(el("td", null, d.dnf ? "DNF L" + d.lapsDone : d.pos != null ? "P" + d.pos : "—"));
        const cell = el("td");
        const seated = !seats || seats.has(d.num);
        const go = el("button", "dh-pill", seated ? "JUMP IN" : NO_SEAT_MSG);
        go.type = "button";
        go.disabled = !seated;
        go.setAttribute("aria-label", seated ? "Race as " + d.name : d.name + ": " + NO_SEAT_MSG);
        if (seated) go.addEventListener("click", () => { seatCode = d.code; jumpIn(script, d.code); });
        cell.appendChild(go);
        tr.appendChild(cell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      slot.appendChild(table);
      slot.appendChild(el("div", "dh-footnote", DATA_CREDIT));
    }

    function jumpIn(script, code) {
      if (typeof RealRace === "undefined" || !RealRace.launch) { Log.warn("data", "RealRace is not loaded"); return false; }
      Log.info("data", "real race jump in " + script.sessionKey + " as " + code + " laps=" + simLaps(script) + " from=" + startLap);
      if (close) close();
      const tr = traces && traces.sessionKey === script.sessionKey ? traces : null;
      return !!RealRace.launch(script, { seat: code, laps: simLaps(script), startLap, traces: tr, intro: true });   // intro: the pre-race card and announcer, as RACE! has
    }

    return { loadRealRace, scriptFor, jumpIn, lapEvents, watch, loadTraces,
             traces: () => traces, setTraces: (tr) => { traces = tr || null; return traces; },
             setDistance: (f) => { distance = DISTANCES.includes(f) ? f : 1; return distance; },
             setStartLap: (n) => { startLap = Math.max(1, n | 0); return startLap; },
             setSeat: (code) => { seatCode = code || null; return seatCode; } };
  }

  return { create, build, trackIdFor, todFor, weatherFor, rainByLap, cautionsFor, passesFor, incidentFor, incidentsFor, gridFor, lapBoard, raceBook, fmtLap, fetchRaw, forgetRaw, cached,
           fetchTraces, packTrace, traceGet, tracePut, SCRIPT_V, TRACE_V, TRACE_HZ, DISTANCES, CACHE_KEY };
})();
Object.freeze(DataRealRace);
