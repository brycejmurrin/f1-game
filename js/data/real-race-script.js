/* Apex 26 — pure OpenF1 race-script builder. One Grand Prix's timing bodies become the compact script RealRace replays: grid, laps, stops, flags, rain and the classification. No fetch and no DOM. */
const DataRealRaceScript = (function () {
  "use strict";

  const SCRIPT_V = 6;   // 2: stint ages, rain by lap, the complete flag; 3: the passes; 4: real timestamps (t0, lap starts, pass/stop/flag times), where a car went out, the fastest lap, the team radio; 5: per-driver timing coverage; 6: flag ending notices separate from release

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v != null && v !== "" && isFinite(+v) ? +v : null));
  // A lap index sizes per-driver arrays: one fractional or huge upstream row threw
  // (`Invalid array length`) or allocated millions of slots per driver (1e9 OOMed).
  const MAX_GP_LAPS = 100;   // a modern GP runs 44-78 laps (Monaco 78); headroom, not a real race
  const lapNo = (v) => { const n = num(v); return Number.isInteger(n) && n >= 1 && n <= MAX_GP_LAPS ? n : null; };
  const arr = (v) => (Array.isArray(v) ? v : []);

  // ── The script builder (pure; tests/unit/real-race-script.test.mjs) ──────

  /** The session's LOCAL calendar day (date_start + gmt_offset) as YYYY-MM-DD, or null. */
  function localDay(session) {
    const t = Date.parse(session.date_start || session.dateStart || "");
    if (!isFinite(t)) return null;
    const off = String(session.gmt_offset || "00:00:00").split(":");
    const sign = off[0].trim().startsWith("-") ? -1 : 1;
    return new Date(t + sign * (Math.abs(+off[0]) + (+off[1] || 0) / 60) * 3600000).toISOString().slice(0, 10);
  }

  /** Game circuit for an OpenF1 session: the circuit's own name first, then the
   *  2026 calendar by DATE (SeasonCal.REAL_2026 windows — a GP that moved venue,
   *  like the Bahrain GP run at Sepang, is named for its GP country but sits on
   *  the circuit the calendar gives it), then the venue aliases below (the Tracks
   *  handoff), then the country's current-season circuit, else any of that
   *  country, else null. F1API.placeLabel owns the display country. */
  function trackIdFor(session, tracks) {
    const list = arr(tracks);
    const country = String(session.country_name || session.country || "").toLowerCase();
    const circuit = String(session.circuit_short_name || session.circuit || "").toLowerCase();
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!list.length) return null;
    // Circuit first: a country with two circuits (Italy: Monza + Imola; USA: Miami/Austin/Vegas) tells them apart by name.
    const byCircuit = list.find((t) => circuit && (norm(t.id) === norm(circuit) || norm(t.name) === norm(circuit)));
    if (byCircuit) return byCircuit.id;
    const day = localDay(session);
    const win = day && typeof SeasonCal !== "undefined" && SeasonCal.REAL_2026
      ? SeasonCal.REAL_2026.find((r) => day >= r.from && day <= r.to && list.some((t) => t.id === r.id)) : null;
    if (win) return win.id;
    const alias = { "kuala lumpur": "sepang", "monte carlo": "monaco", "sakhir": "bahrain", "melbourne": "albert_park", "spielberg": "redbull", "austin": "cota",
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
    let open = null, ending = false;
    const at = (m) => (secs ? secs(m && m.date) : null);
    for (const m of arr(raceControl)) {
      const msg = String(m && m.message || "").toUpperCase();
      const lap = num(m && m.lap_number);
      if (lap == null) continue;
      const vsc = msg.indexOf("VIRTUAL SAFETY CAR") >= 0;
      const sc = !vsc && msg.indexOf("SAFETY CAR") >= 0;
      if (msg.indexOf("RED FLAG") >= 0 && (m.flag === "RED" || msg.indexOf("RED FLAG") === 0)) {
        if (open) { if (!ending) open.to = lap; if (secs) open.tTo = at(m); out.push(open); open = null; }
        const red = { level: 4, from: lap, to: lap, cause: "RED FLAG" };
        if (secs) { red.tFrom = at(m); red.tTo = null; }
        out.push(red);
        continue;
      }
      if ((vsc || sc) && msg.indexOf("DEPLOYED") >= 0) {
        if (open) { if (!ending) open.to = lap; if (secs) open.tTo = at(m); out.push(open); }
        ending = false;
        open = { level: vsc ? 2 : 3, from: lap, to: lap, cause: vsc ? "VSC" : "SAFETY CAR" };
        if (secs) { open.tFrom = at(m); open.tTo = null; }
      } else if (open && (vsc || sc) && (msg.indexOf("IN THIS LAP") >= 0 || msg.indexOf("ENDING") >= 0)) {
        ending = true; open.to = Math.max(open.from, lap); if (secs) open.tEnding = at(m);
      } else if (open && msg.indexOf("TRACK CLEAR") >= 0) {
        if (!ending) open.to = Math.max(open.from, lap);
        if (secs) open.tTo = at(m); out.push(open); open = null;
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
    for (const l of laps) { const n = lapNo(l && l.lap_number); if (n > totalLaps) totalLaps = n; }
    for (const r of arr(raw.result)) { const n = lapNo(r && r.number_of_laps); if (n > totalLaps) totalLaps = n; }
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
      const n = lapNo(l && l.lap_number);
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
      const n = lapNo(l && l.lap_number);
      if (d && n >= 1 && n <= totalLaps) d.lapStart[n - 1] = secs(l.date_start);
    }
    for (const p of arr(raw.pits)) {
      const d = byNum[num(p && p.driver_number)];
      const lap = num(p && p.lap_number);
      if (d && lap != null) { d.pits.push(lap); (d.pitT = d.pitT || []).push(secs(p.date)); (d.pitDur = d.pitDur || []).push(num(p.lane_duration ?? p.pit_duration)); }
    }
    for (const r of arr(raw.result)) {
      const d = byNum[num(r && r.driver_number)];
      if (!d) continue;
      d.pos = num(r.position);
      d.lapsDone = lapNo(r.number_of_laps) || 0;
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
      if (d.dnf && !d.dns && !d.dsq) {
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
    const complete = totalLaps > 0 && drivers.some((d) => d.pos === 1 && d.lapsDone === totalLaps && d.laps.some((t) => t > 0)) && drivers.every((d) => {
      const result = arr(raw.result).find((r) => r && num(r.driver_number) === d.num);
      if (!result) return false;
      if (d.dns) return d.lapsDone === 0;
      // Only an explicitly published untimed opening lap is exempt, not a missing
      // feed row. Retirees need only their classified distance, including zero.
      const done = num(result.number_of_laps);
      if (!Number.isInteger(done) || done < 0 || done > totalLaps) return false;
      for (let n = 1; n <= done; n++) {
        if (!laps.some((l) => l && num(l.driver_number) === d.num && lapNo(l.lap_number) === n &&
          (num(l.lap_duration) > 0 || (n === 1 && l.lap_duration === null)))) return false;
      }
      return true;
    });
    return {
      v: SCRIPT_V, source: "openf1", fetchedAt: new Date().toISOString(),
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
    for (const d of arr(drivers)) if (d && d.dnf && !d.dns && !d.dsq && d.num != null) ends[d.num] = (d.lapsDone | 0) + 1;
    const starts = {};   // num -> [lap start ms by lap]
    for (const l of arr(laps)) {
      const n = num(l && l.driver_number), k = lapNo(l && l.lap_number), t = Date.parse(l && l.date_start || "");   // a 1e9 index would make lapOf walk 1e9 slots
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
   *  [{num, t (lap time), cum, gap, interval, down, pitIn, pitOut, out}] fastest
   *  crossing first, then the cars that had stopped by then (last lap first). */
  function lapBoard(script, lap) {
    const cum = typeof RealRace !== "undefined" && RealRace.cumTable ? RealRace.cumTable(script) : null;
    if (!cum) return [];
    const running = [], stopped = [];
    const confidence = timingConfidence(script, cum);
    for (const d of script.drivers || []) {
      const row = cum[d.num];
      const pits = d.pits || [];
      // A classified finisher a lap or more down never reaches the later laps' crossings: its row ends at its own last
      // lap. It is still RUNNING, `down` laps behind, not out (only a retirement stops).
      const done = row.length - 1, down = !d.dnf && !d.dns && done >= 1 && done < lap ? lap - done : 0;
      if (row.length > lap || down) running.push({ num: d.num, code: d.code, down, t: d.laps[lap - 1] > 0 ? d.laps[lap - 1] : null, cum: row[Math.min(lap, done)], pitIn: pits.indexOf(lap) >= 0, pitOut: pits.indexOf(lap - 1) >= 0, tyre: compoundAt(d, lap), out: false });
      else stopped.push({ num: d.num, code: d.code, t: null, cum: null, done: row.length - 1, pitIn: false, pitOut: false, tyre: compoundAt(d, row.length - 1), out: true });
    }
    for (const r of running) r.approximate = !!(confidence[r.num] && confidence[r.num][Math.min(lap, cum[r.num].length - 1)]);
    running.sort((a, b) => a.down - b.down || a.cum - b.cum);
    stopped.sort((a, b) => b.done - a.done);
    const lead = running.length ? running[0].cum : 0;
    running.forEach((r, i) => {
      r.pos = i + 1;
      r.gapApproximate = r.approximate || !!(running[0] && running[0].approximate);
      r.intervalApproximate = r.approximate || !!(i && running[i - 1].approximate);
      r.gap = r.down ? null : +(r.cum - lead).toFixed(3);   // a lap down is not a time gap: the board says "+N LAP"
      r.interval = r.down ? null : i ? +(r.cum - running[i - 1].cum).toFixed(3) : 0;
    });
    stopped.forEach((r, i) => { r.pos = running.length + i + 1; r.gap = null; r.interval = null; });
    return running.concat(stopped);
  }
  // Display-only provenance; the cumulative times and simulator remain unchanged.
  function timingConfidence(script, cum) {
    const out = {};
    for (const d of script.drivers || []) {
      const row = cum[d.num] || []; let filled = false;
      out[d.num] = row.map((_, i) => { if (i && !((d.laps || [])[i - 1] > 0)) filled = true; return filled; });
    }
    return out;
  }
  function compoundAt(d, lap) {
    let c = null;
    for (const st of d.stints || []) if (st.from <= lap) c = st.c;
    return c ? c[0] : null;
  }

  /** Observed crossings only: never use cumTable's median-filled laps here. */
  function pitDuel(script, aNum, aStop, bNum, bStop) {
    const a = script.drivers.find((d) => d.num === +aNum), b = script.drivers.find((d) => d.num === +bNum);
    const before = Math.min(+aStop, +bStop) - 1, after = Math.max(+aStop, +bStop) + 1;
    const unavailable = (reason) => ({ available: false, reason, startLap: Math.max(1, before) });
    if (!a || !b || a === b || !(a.pits || []).includes(+aStop) || !(b.pits || []).includes(+bStop)) return unavailable("Choose two drivers and one stop each.");
    if (before < 1 || after > script.laps || a.dnf || b.dnf || a.dns || b.dns || a.lapsDone < after || b.lapsDone < after) return unavailable("Unavailable for retirement, lap-down or incomplete timing.");
    const crossing = (d, lap) => {
      const start = (d.lapStart || [])[lap - 1], duration = (d.laps || [])[lap - 1];
      return typeof start === "number" && isFinite(start) && typeof duration === "number" && isFinite(duration) && duration > 0 ? start + duration : null;
    };
    // Every selected lap must be present; a missing intermediate sample can hide a lap-down interval.
    for (let lap = before; lap <= after; lap++) {
      const x = crossing(a, lap), y = crossing(b, lap);
      if (x === null || y === null) return unavailable("Unavailable: missing real lap crossings.");
      if (Math.abs(x - y) >= Math.min(a.laps[lap - 1], b.laps[lap - 1])) return unavailable("Unavailable: possible lap-down mismatch.");
    }
    const gapBefore = crossing(a, before) - crossing(b, before), gapAfter = crossing(a, after) - crossing(b, after);
    return { available: true, before, after, startLap: before, gapBefore, gapAfter, change: gapAfter - gapBefore,
      compounds: [a, b].map((d) => (compoundAt(d, before) || "—") + " → " + (compoundAt(d, after) || "—")),
      caution: (script.cautions || []).some((c) => c.from <= after && (c.to || c.from) >= before),
      rain: script.rain ? script.rain.slice(before, after + 1).some(Boolean) : null };
  }

  /** Download facts, separate from sporting retirement and cache identity. */
  function traceDetails(script, traces) {
    return script.drivers.map((d) => {
      const raw = traces && traces.cars && traces.cars[d.num], count = raw ? Math.floor(raw.length / 3) : 0;
      const gaps = [];
      for (let i = 3; i < count * 3; i += 3) if (raw[i] - raw[i - 3] > 3) gaps.push([raw[i - 3], raw[i]]);
      return { num: d.num, code: d.code, dns: !!d.dns, retired: !!d.dnf && !d.dns, count,
        start: count ? raw[0] : null, end: count ? raw[(count - 1) * 3] : null, gaps,
        retry: !!(traces && (traces.failed || []).includes(d.num)) };
    });
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
        out: (script.drivers || []).filter((d) => d.dnf && !d.dns && !d.dsq && (d.lapsDone | 0) + 1 === lap && (d.lapsDone | 0) < laps).map((d) => d.code),
        fastest: fastest ? { code: fastest.code, t: fastest.t } : null,
      });
    }
    return book;
  }

  function fmtLap(t) {
    if (!(t > 0)) return "—";
    const ms = Math.round(t * 1000), m = Math.floor(ms / 60000), sec = (ms - m * 60000) / 1000;   // round first: never "1:60.000"
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

  return { build, trackIdFor, todFor, weatherFor, rainByLap, cautionsFor, passesFor, incidentFor, incidentsFor, gridFor, lapBoard, timingConfidence, raceBook, fmtLap, fmtGap, pitDuel, traceDetails, SCRIPT_V };
})();
Object.freeze(DataRealRaceScript);
