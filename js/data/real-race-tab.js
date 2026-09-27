/* Apex 26 — DATA HUB RACE IT tab (DataRealRace.create(deps)) Turns one real Grand Prix's OpenF1 timing (drivers, laps, stints, pits, race control, weather, classification, the pre-start position snapshot) into the compact race SCRIPT js/race/real-race.js replays, and offers every real driver's seat as a JUMP IN button. */
const DataRealRace = (function () {
  "use strict";

  const OPENF1 = "https://api.openf1.org/v1";
  const TTL = 7 * 24 * 60 * 60 * 1000;   // a finished race never changes; the same TTL api.js gives a historic session
  const CACHE_KEY = "apex26.realrace.v1.";   // one compact script per session key (the raw laps body is 480 KB and never cached)
  const SCRIPT_V = 2;   // 2: stint ages, rain by lap, the complete flag
  const DATA_CREDIT = "Timing data: OpenF1 (CC BY-NC-SA 4.0) · pace, stops, flags and the grid are the real ones; the racing is yours.";
  const NO_TRACK_MSG = "This circuit is not in Apex 26 yet — pick another Grand Prix.";
  const NO_RACE_MSG = "No race timing published for this weekend yet.";
  const FETCH_FAIL_MSG = "Could not fetch the race timing — try again in a minute.";
  const INCOMPLETE_MSG = "Timing is still coming in for this race — it plays as far as the data goes.";
  const NO_SEAT_MSG = "no seat in this roster";
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
  function cautionsFor(raceControl) {
    const out = [];
    let open = null;
    for (const m of arr(raceControl)) {
      const msg = String(m && m.message || "").toUpperCase();
      const lap = num(m && m.lap_number);
      if (lap == null) continue;
      const vsc = msg.indexOf("VIRTUAL SAFETY CAR") >= 0;
      const sc = !vsc && msg.indexOf("SAFETY CAR") >= 0;
      if (msg.indexOf("RED FLAG") >= 0 && (m.flag === "RED" || msg.indexOf("RED FLAG") === 0)) {
        if (open) { open.to = lap; out.push(open); open = null; }
        out.push({ level: 4, from: lap, to: lap, cause: "RED FLAG" });
        continue;
      }
      if ((vsc || sc) && msg.indexOf("DEPLOYED") >= 0) {
        if (open) { open.to = lap; out.push(open); }
        open = { level: vsc ? 2 : 3, from: lap, to: lap, cause: vsc ? "VSC" : "SAFETY CAR" };
      } else if (open && (vsc || sc) && (msg.indexOf("IN THIS LAP") >= 0 || msg.indexOf("ENDING") >= 0)) {
        open.to = Math.max(open.from, lap); out.push(open); open = null;
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
    for (const p of arr(raw.pits)) {
      const d = byNum[num(p && p.driver_number)];
      const lap = num(p && p.lap_number);
      if (d && lap != null) d.pits.push(lap);
    }
    for (const r of arr(raw.result)) {
      const d = byNum[num(r && r.driver_number)];
      if (!d) continue;
      d.pos = num(r.position);
      d.lapsDone = num(r.number_of_laps) || 0;
      d.dnf = !!(r.dnf || r.dns || r.dsq) || d.pos == null;
    }
    const drivers = Object.keys(byNum).map((k) => byNum[k]);
    for (const d of drivers) {
      d.stints.sort((a, b) => a.from - b.from);
      d.pits.sort((a, b) => a - b);
      if (!d.lapsDone) d.lapsDone = d.laps.filter((t) => t > 0).length;
    }
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
      laps: totalLaps, drivers, cautions: cautionsFor(raw.raceControl), complete,
    };
  }

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
      q("/sessions?"), q("/drivers?"), q("/laps?", { cache: false }), q("/stints?"), q("/pit?"),
      q("/race_control?"), q("/weather?"), q("/session_result?"), q("/position?"),
    ]).then((r) => {
      const session = arr(r[0])[0] || { session_key: sessionKey };
      const raw = { session, drivers: r[1], laps: r[2], stints: r[3], pits: r[4], raceControl: r[5], weather: r[6], result: r[7], positions: r[8] };
      // The weekend's NAME lives on the meeting, not the session (F1API.meetings is the picker's cached list).
      if (session.meeting_key == null || !session.year) return raw;
      return F1API.meetings(session.year).then((ms) => {
        const m = ms.find((x) => x.meetingKey === session.meeting_key);
        if (m && m.name) session.meeting_name = m.name;
        return raw;
      }, () => raw);
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

    function tracks() { return typeof Tracks !== "undefined" && Tracks.LIST ? Tracks.LIST : []; }

    /** The script for a session: the cache, else nine OpenF1 requests. */
    function scriptFor(sessionKey) {
      const hit = cached(sessionKey);
      if (hit) return Promise.resolve(hit);
      return fetchRaw(sessionKey).then((raw) => {
        const script = build(raw, findTeam, tracks());
        if (script.complete && script.drivers.length) remember(script);
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

    function lapPicker(script) {
      const field = el("label", "dh-pick-field");
      field.appendChild(el("span", "dh-pick-label", "JUMP IN AT"));
      const sel = el("select", "dh-pick-select");
      const ev = lapEvents(script);
      for (let n = 1; n <= script.laps; n++) {
        const op = el("option", null, n === 1 ? "Lap 1 · the grid" : "Lap " + n + (ev[n] ? " · " + ev[n].join(", ") : ""));
        op.value = String(n);
        if (n === startLap) op.selected = true;
        sel.appendChild(op);
      }
      sel.addEventListener("change", () => { startLap = Math.max(1, Math.min(script.laps, +sel.value || 1)); });
      field.appendChild(sel);
      return field;
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
      pickRow.appendChild(lapPicker(script));
      slot.appendChild(pickRow);

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
        if (seated) go.addEventListener("click", () => jumpIn(script, d.code));
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
      return !!RealRace.launch(script, { seat: code, laps: simLaps(script), startLap });
    }

    return { loadRealRace, scriptFor, jumpIn, lapEvents,
             setDistance: (f) => { distance = DISTANCES.includes(f) ? f : 1; return distance; },
             setStartLap: (n) => { startLap = Math.max(1, n | 0); return startLap; } };
  }

  return { create, build, trackIdFor, todFor, weatherFor, rainByLap, cautionsFor, gridFor, fetchRaw, cached, SCRIPT_V, DISTANCES, CACHE_KEY };
})();
Object.freeze(DataRealRace);
