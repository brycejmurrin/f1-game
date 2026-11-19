const RealRacePace = (function () {
  "use strict";

  const clamp = M4.clamp;

  const KP = 0.6;
  const MUL_MIN = 0.90, MUL_MAX = 1.10;
  const REL_MIN = 0.90, REL_MAX = 1.12;
  const COMPOUND = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "inter", WET: "wet" };
  const CLASSES = new Set(Object.keys(COMPOUND).map((k) => COMPOUND[k]));

  function realLapFor(simLap, simLaps, realLaps) {
    if (!(simLaps > 0) || !(realLaps > 0)) return simLap;
    return clamp(Math.round(simLap * realLaps / simLaps), 1, realLaps);
  }
  function simLapFor(realLap, simLaps, realLaps) {
    if (!(simLaps > 0) || !(realLaps > 0)) return realLap;
    return clamp(Math.round(realLap * simLaps / realLaps), 1, simLaps);
  }

  function paceTable(script) {
    const laps = script.laps | 0;
    const drivers = script.drivers || [];
    const pitLap = new Map();
    for (const d of drivers) {
      const set = new Set();
      for (const p of d.pits || []) { set.add(p); set.add(p + 1); }
      pitLap.set(d.num, set);
    }
    const clean = (d, lap) => {
      const t = d.laps && d.laps[lap - 1];
      return t > 0 && !pitLap.get(d.num).has(lap) ? t : null;
    };
    const ref = new Array(laps + 1).fill(null);
    for (let lap = 1; lap <= laps; lap++) {
      const ts = [];
      for (const d of drivers) { const t = clean(d, lap); if (t != null) ts.push(t); }
      if (!ts.length) continue;
      ts.sort((a, b) => a - b);
      ref[lap] = ts.length % 2 ? ts[(ts.length - 1) >> 1] : (ts[ts.length / 2 - 1] + ts[ts.length / 2]) / 2;
    }
    const rel = {};
    let best = Infinity;
    for (const d of drivers) {
      const row = new Array(laps + 1).fill(null);
      for (let lap = 1; lap <= laps; lap++) {
        const t = clean(d, lap);
        if (t == null || ref[lap] == null) continue;
        if (t < best) best = t;
        const r = t / ref[lap];
        row[lap] = r >= REL_MIN && r <= REL_MAX ? r : null;
      }
      rel[d.num] = row;
    }
    return { ref, rel, best: isFinite(best) ? best : 0 };
  }

  function cumTable(script) {
    const out = {};
    const ref = paceTable(script).ref;
    for (const d of script.drivers || []) {
      const laps = d.laps || [];
      let last = -1;
      for (let i = 0; i < laps.length; i++) if (laps[i] > 0) last = i;
      const end = Math.max(last + 1, Math.min(laps.length, d.dnf ? d.lapsDone | 0 : laps.length));
      const row = [0];
      let t = 0, fill = 0;
      for (let i = 0; i < laps.length; i++) if (laps[i] > 0) { fill = laps[i]; break; }
      for (let i = 0; i < end; i++) {
        const v = laps[i] > 0 ? laps[i] : (ref[i + 1] > 0 ? ref[i + 1] : fill);
        if (!(v > 0)) break;
        if (laps[i] > 0) fill = laps[i];
        t += v; row.push(t);
      }
      out[d.num] = row;
    }
    return out;
  }

  const classOf = (s) => (s ? COMPOUND[s.c] || (CLASSES.has(s.c) ? s.c : null) : null);

  function planFor(driver, simLaps, realLaps, pitLossLaps) {
    const stints = (driver.stints || []).filter(classOf);
    if (!stints.length) return null;
    const seq = [classOf(stints[0])];
    const lapsAt = [];
    for (let i = 1; i < stints.length; i++) {
      const prev = lapsAt.length ? lapsAt[lapsAt.length - 1] : 0;
      const inLap = Math.min(Math.max(simLapFor(stints[i].from - 1, simLaps, realLaps), prev + 1), simLaps - 1);
      if (inLap <= prev) {
        seq[seq.length - 1] = classOf(stints[i]);
        continue;
      }
      lapsAt.push(inLap); seq.push(classOf(stints[i]));
    }
    const stintLens = [];
    let prev = 0;
    for (const at of lapsAt) { stintLens.push(at - prev); prev = at; }
    stintLens.push(simLaps - prev);
    return { start: seq[0], seq, stints: stintLens, stops: lapsAt.length, lapsAt, cost: 0,
             pitLossLaps: pitLossLaps > 0 ? pitLossLaps : 0.18, scripted: true };
  }

  function dnfAtFor(driver, realLaps) {
    if (!driver || !driver.dnf || !(realLaps > 0)) return null;
    const done = Math.max(0, driver.lapsDone | 0);
    if (done >= realLaps) return null;
    return clamp((done + 0.5) / realLaps, 0.001, 0.999);
  }

  function cautionsFor(script, simLaps) {
    const realLaps = script.laps | 0;
    const out = [];
    for (const w of script.cautions || []) {
      if (!w || !(w.level >= 2)) continue;
      const from = simLapFor(w.from, simLaps, realLaps);
      const to = Math.max(from, simLapFor(w.to != null ? w.to : w.from, simLaps, realLaps));
      out.push({ level: Math.min(4, w.level | 0), from, to, cause: w.cause || (w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VSC"), done: false });
    }
    return out;
  }

  const nameCase = (w) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w);
  const properName = (n) => String(n || "").trim().split(/\s+/).filter(Boolean).map(nameCase).join(" ");
  function surnameOf(n) {
    const words = String(n || "").trim().split(/\s+/).filter(Boolean);
    const caps = words.find((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
    return nameCase(caps || words[words.length - 1] || "");
  }
  const COMPOUND_NAME = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "intermediate", WET: "full wet" };
  function situation(script, lap, seatCode, simLaps) {
    const realLaps = script && script.laps | 0;
    if (!(realLaps > 0)) return null;
    const L = clamp(lap | 0 || 1, 1, realLaps);
    const drivers = (script.drivers || []).filter((d) => d && d.num != null);
    const who = (d) => ({ code: d.code, name: properName(d.name) || d.code, surname: surnameOf(d.name) || d.code, team: d.team || "" });
    const tyreAt = (d, lp) => {
      let s = null;
      for (const st of d.stints || []) if (st && st.from <= lp) s = st;
      return s ? { compound: COMPOUND_NAME[String(s.c || "").toUpperCase()] || String(s.c || "").toLowerCase(), age: Math.max(0, lp - s.from) + (s.age | 0), used: (s.age | 0) > 0 && lp === s.from } : null;
    };
    const me = drivers.find((d) => d.code === seatCode) || null;
    const sim = simLaps > 0 ? simLaps | 0 : realLaps;
    const out = { lap: L, realLaps, toGo: Math.max(1, sim - simLapFor(L, sim, realLaps) + 1), condensed: sim !== realLaps, grid: L <= 1 };
    if (L <= 1) {
      const grid = drivers.filter((d) => d.grid > 0 && !d.dns).sort((a, b) => a.grid - b.grid);
      out.pole = grid[0] ? who(grid[0]) : null;
      out.front = grid[1] ? who(grid[1]) : null;
      out.starters = grid.length;
      if (me) {
        const k = grid.indexOf(me);
        out.you = Object.assign(who(me), { pos: me.grid | 0, gridPos: me.grid | 0, running: !me.dns, tyre: tyreAt(me, 1),
          ahead: k > 0 ? who(grid[k - 1]) : null, behind: k >= 0 && grid[k + 1] ? who(grid[k + 1]) : null });
      }
      out.weather = Array.isArray(script.rain) && script.rain[1] ? "rain" : script.weather || "dry";
      return out;
    }
    const done = L - 1;
    const cum = cumTable(script);
    const rowOf = (d) => cum[d.num] || [0];
    const orderAt = (k) => drivers.filter((d) => rowOf(d).length > k).sort((a, b) => rowOf(a)[k] - rowOf(b)[k]);
    const board = orderAt(done);
    const lead = board[0] || null;
    const t0 = lead ? rowOf(lead)[done] : 0;
    const lapT = lead && done >= 1 ? rowOf(lead)[done] - rowOf(lead)[done - 1] : 0;
    const gapOf = (d) => { const g = rowOf(d)[done] - t0; return lapT > 0 && g >= lapT ? { s: +g.toFixed(1), lapsDown: Math.floor(g / lapT) } : { s: +g.toFixed(1), lapsDown: 0 }; };
    out.leader = lead ? who(lead) : null;
    out.top = board.slice(0, 3).map((d, i) => Object.assign(who(d), { pos: i + 1, gap: gapOf(d) }));
    out.running = board.length;
    out.out = drivers.filter((d) => !d.dns && rowOf(d).length <= done).map((d) => Object.assign(who(d), { lap: Math.max(1, rowOf(d).length) }))
      .sort((a, b) => a.lap - b.lap);
    out.dns = drivers.filter((d) => d.dns).map(who);
    const leaders = [];
    for (let k = 1; k <= done; k++) { const o = orderAt(k); if (o[0]) leaders.push(o[0]); }
    const changes = [];
    for (let k = 1; k < leaders.length; k++) if (leaders[k] !== leaders[k - 1]) changes.push({ lap: k + 1, to: who(leaders[k]), from: who(leaders[k - 1]) });
    out.lead = { changes, from: leaders[0] ? who(leaders[0]) : null, allTheWay: leaders.length > 0 && changes.length === 0 };
    out.cautions = (script.cautions || []).filter((w) => w && w.level >= 2 && w.from < L).map((w) => {
      const to = w.to != null ? w.to : w.from;
      return { kind: w.level >= 4 ? "red flag" : w.level === 3 ? "safety car" : "virtual safety car", from: w.from, to: Math.min(to, done), now: to >= L };
    });
    let fastest = null;
    for (const d of drivers) (d.laps || []).slice(0, done).forEach((t, i) => { if (t > 0 && (!fastest || t < fastest.time)) fastest = Object.assign(who(d), { time: t, lap: i + 1 }); });
    out.fastest = fastest;
    const rain = Array.isArray(script.rain) ? script.rain : null;
    if (rain) {
      let since = 0, last = 0;
      for (let k = 1; k <= done; k++) if (rain[k]) { if (!since) since = k; last = k; }
      out.rain = { now: !!rain[L], since, last };
    }
    out.passes = (script.passes || []).filter((p) => p && p.lap < L).length;
    if (me) {
      const at = board.indexOf(me);
      const you = Object.assign(who(me), { running: at >= 0, gridPos: me.grid | 0 });
      if (at >= 0) {
        you.pos = at + 1;
        you.gap = gapOf(me);
        const ahead = board[at - 1], behind = board[at + 1];
        if (ahead) you.ahead = Object.assign(who(ahead), { gap: +(rowOf(me)[done] - rowOf(ahead)[done]).toFixed(1) });
        if (behind) you.behind = Object.assign(who(behind), { gap: +(rowOf(behind)[done] - rowOf(me)[done]).toFixed(1) });
      }
      you.tyre = tyreAt(me, L);
      you.stops = (me.pits || []).filter((p) => p < L);
      you.passesMade = (script.passes || []).filter((p) => p && p.lap < L && p.by === me.num).length;
      you.passesLost = (script.passes || []).filter((p) => p && p.lap < L && p.over === me.num).length;
      let best = null;
      (me.laps || []).slice(0, done).forEach((t, i) => { if (t > 0 && (!best || t < best.time)) best = { time: t, lap: i + 1 }; });
      you.best = best;
      you.penalties = (script.incidents || []).filter((m) => m && m.lap < L && /PENALTY/i.test(m.text) && m.text.indexOf("(" + me.code + ")") >= 0 && !/NO FURTHER|UNDER INVESTIGATION|NOTED/i.test(m.text))
        .map((m) => { const s = /(\d+)\s*SECOND/i.exec(m.text); return { lap: m.lap, seconds: s ? +s[1] : 0, driveThrough: /DRIVE.?THROUGH/i.test(m.text), stopGo: /STOP.?(AND|&)?.?GO/i.test(m.text) }; });
      out.you = you;
    }
    out.leaderStops = lead ? (lead.pits || []).filter((p) => p < L).length : 0;
    return out;
  }

  function mapField(script, teams) {
    const list = Array.isArray(teams) ? teams : [];
    const seats = [];
    for (const t of list) {
      if (!t || !t.drivers || t.custom || t.legends) continue;
      t.drivers.forEach((d, di) => seats.push({ driverId: t.id + ":" + di, teamId: t.id, di, code: d.code, num: null }));
    }
    const byCode = new Map(seats.map((s) => [s.code, s]));
    const pending = [];
    for (const d of script.drivers || []) {
      const s = byCode.get(d.code);
      if (s && s.num == null) s.num = d.num; else pending.push(d);
    }
    for (const d of pending) {
      const free = seats.find((s) => s.num == null && d.teamId && s.teamId === d.teamId);
      if (free) free.num = d.num;
    }
    return seats.filter((s) => s.num != null).map((s) => ({ driverId: s.driverId, num: s.num, teamId: s.teamId, di: s.di }));
  }

  function fieldAt(script, startLap) {
    const laps = script.laps | 0;
    const L = clamp(startLap | 0, 1, Math.max(1, laps));
    if (L <= 1) return null;
    const cum = cumTable(script);
    let t0 = Infinity;
    for (const d of script.drivers || []) { const row = cum[d.num]; if (row.length > L - 1 && row[L - 1] < t0) t0 = row[L - 1]; }
    if (!isFinite(t0)) return null;
    const by = {};
    let traceT0 = Infinity;
    for (const d of script.drivers || []) {
      const row = cum[d.num];
      let k = 0;
      while (k + 1 < row.length && row[k + 1] <= t0) k++;
      const retired = row.length <= k + 1 || (d.dnf && k >= (d.lapsDone | 0));
      const published = Array.isArray(d.lapStart) ? d.lapStart[L - 1] : null;
      if (!retired && !d.dns && Number.isFinite(published) && published >= 0) traceT0 = Math.min(traceT0, published);
      const dur = retired ? 0 : row[k + 1] - row[k];
      const frac = retired ? 0 : clamp((t0 - row[k]) / dur, 0, 0.98);
      const lap = k + 1;
      let stint = 0;
      const stints = d.stints || [];
      for (let i = 0; i < stints.length; i++) if (stints[i].from <= lap) stint = i;
      const s = stints[stint];
      const age = s ? Math.max(0, lap - s.from) + (s.age | 0) : 0;
      by[d.num] = { lap, frac, retired, stint, compound: classOf(s), age, into: retired ? 0 : t0 - row[k] };
    }
    return { lap: L, t0, traceT0: Number.isFinite(traceT0) ? traceT0 : t0, by };
  }

  function paceMul(err, lapS, rel) {
    const open = rel > 0 ? 1 / rel : 1;
    const corr = lapS > 0 && Number.isFinite(err) ? 1 + KP * err / lapS : 1;
    return clamp(open * corr, MUL_MIN, MUL_MAX);
  }
  return {
    KP, MUL_MIN, MUL_MAX,
    realLapFor, simLapFor, paceTable, cumTable, planFor, dnfAtFor, cautionsFor,
    properName, situation, mapField, fieldAt, paceMul, classOf,
  };
})();
Object.freeze(RealRacePace);
