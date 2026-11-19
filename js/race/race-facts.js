var RaceFacts = (function () {
  "use strict";

  const K = 32;
  const RING = K * 2;
  const HOLD_S = 1.0;
  const NET_GRACE_S = 0.5;
  const PAIR_SPAN = 2;
  const BATTLE_GAP = 0.8;
  const RANK_S = 0.1;

  const inPits = (c) => !!(c && c.pitState && c.pitState !== "none");

  function create() {
    let t = 0, lapLen = 0, cars = null, nextId = 1, pairVisit = 0;
    const st = new Map();
    const pairs = new Map();
    const battles = new Map();
    const hist = new Map();
    let pitEndT = -1e9;
    let order = [];
    let fastest = { time: Infinity, car: null };
    let pos = 0, pendPos = 0, pendT = 0;
    let grid = null, started = false, caution = 0, playerHits = 0, playerSev = 0;
    let leadLap = 0;
    let rankAcc = 0, primed = false;

    function reset() {
      t = 0; lapLen = 0; cars = null; nextId = 1; pairVisit = 0;
      st.clear(); pairs.clear(); battles.clear(); hist.clear();
      order = []; fastest = { time: Infinity, car: null };
      pitEndT = -1e9;
      pos = 0; pendPos = 0; pendT = 0; grid = null; started = false; caution = 0; playerHits = 0; playerSev = 0;
      leadLap = 0; rankAcc = 0; primed = false;
    }

    function bag(c) {
      let s = st.get(c);
      if (!s) {
        s = { id: nextId++, cp: -1, fresh: true, times: new Float64Array(RING), idx: new Int32Array(RING).fill(-1),
          lap: c.lap || 0, lastLap: c.lastLap || 0, retired: !!c.retired, finished: !!c.finished,
          stops: c.pitStops || 0, pit: inPits(c), pitT: -99, errs: c.errCount | 0 };
        const l0 = s.lastLap; s.lastLap = s.pitT = 0.5; s.lastLap = l0; s.pitT = -99;
        st.set(c, s);
      }
      return s;
    }

    function timeAt(c, i) {
      const s = st.get(c);
      if (!s || i < 0) return null;
      const k = i % RING;
      return s.idx[k] === i ? s.times[k] : null;
    }

    function gap(a, b) {
      if (!a || !b) return null;
      const sb = st.get(b);
      if (!sb || sb.cp < 0) return null;
      const ta = timeAt(a, sb.cp), tb = timeAt(b, sb.cp);
      return ta != null && tb != null ? Math.max(0, tb - ta) : null;
    }

    const distOf = (c) => {
      const s = st.get(c);
      return c.finished && s && s.finProg != null ? s.finProg : (c.prog || 0);
    };
    const _live = new Set(), _shoved = new Set();
    const pairKey = (x, y) => x * 1048576 + y;
    const clockOf = (c) => {
      const s = st.get(c);
      return (c.finishT > 0 ? c.finishT : (s && s.finT) || 0) + (c.penalty || 0);
    };
    const byRace = (a, b) => {
      if (a.finished && b.finished) {
        return ((b.lap || 0) - (a.lap || 0)) || (clockOf(a) - clockOf(b));
      }
      const d = distOf(b) - distOf(a);
      if (Math.abs(d) > 1) return d;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return clockOf(a) - clockOf(b);
      return d;
    };
    function rank(list) {
      order.length = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].retired) order.push(list[i]);
      order.sort(byRace);
      return order;
    }

    const _out = { f: null, ev: [] }, _fastestOut = { car: null, time: 0 }, _finishers = [];
    const _f = { t: 0, laps: 0, lap: 0, toGo: null, leaderToGo: null, pos: 0, rawPos: 0, n: 0, gridPos: null, ahead: null,
      behind: null, gapA: null, gapB: null, rateA: null, rateB: null, leader: null, second: null, leadGap: null,
      lastLap: 0.5, best: 0.5, fastest: null, energy: null, finished: false, retired: false, pitting: false, caution: 0, started: false };
    _f.lastLap = _f.best = 0; _fastestOut.time = 0.5; _fastestOut.time = 0;
    function observe(G, dt) {
      const ev = _out.ev, finishers = _finishers;
      ev.length = 0; finishers.length = 0; _out.f = null;
      const p = G.player;
      if (!p || !G.cars || !G.track) return _out;
      if (G.cars !== cars) { reset(); cars = G.cars; }
      lapLen = G.track.total || lapLen || 1;
      t = G.raceT || 0;
      const seg = lapLen / K;

      let regrid = false; _shoved.clear();
      for (let ci = 0; ci < cars.length; ci++) {
        const c = cars[ci], s = bag(c);
        const i = Math.floor((c.prog || 0) / seg);
        if (s.fresh) { s.fresh = false; s.cp = i; }
        if (i < s.cp) {
          s.cp = i;
          regrid = true; _shoved.add(s.id);
          if (c === p) hist.clear();
        }
        while (s.cp < i) {
          s.cp++;
          if (s.cp >= 0) { const k = s.cp % RING; s.times[k] = t; s.idx[k] = s.cp; }
        }
        if (c.retired && !s.retired) ev.push({ type: "retire", car: c, why: c.dnf || c.dnfWhy || "mechanical", pos: order.indexOf(c) + 1 });
        s.retired = !!c.retired;
        const errs = c.errCount | 0;
        if (errs > (s.errs | 0) && !c.isPlayer && !c.human) {
          ev.push({ type: "mistake", car: c, pos: order.indexOf(c) + 1 });
        }
        s.errs = errs;
        const pit = inPits(c);
        if (c === p && pit !== s.pit) { hist.clear(); if (!pit) pitEndT = t; }
        if (pit && !s.pit) ev.push({ type: "pitIn", car: c, pos: order.indexOf(c) + 1 });
        if (pit || s.pit) s.pitT = t;
        s.pit = pit;
        s.stops = c.pitStops || 0;
        if (c.lastLap > 0 && c.lastLap !== s.lastLap) {
          const lt = c.lastLap;
          ev.push({ type: "lap", car: c, time: lt, pb: lt <= (c.best || Infinity) + 1e-6 });
          if (lt < fastest.time) {
            const prev = fastest.car;
            fastest = { time: lt, car: c };
            ev.push({ type: "fastest", car: c, time: lt, prev });
          }
        }
        if ((c.lap || 0) > s.lap && c === p) ev.push({ type: "playerLap", lap: c.lap });
        s.lap = c.lap || 0; s.lastLap = c.lastLap || 0;
        if (c.finished && !s.finished) { s.finProg = c.prog || 0; s.finT = t; s.finDue = t + (c.penalty || 0) + (G.netPlay && G.netPlay.active && G.netPlay.active() ? NET_GRACE_S : 0); }
        s.finished = !!c.finished;
        if (s.finDue != null && t >= s.finDue - 1e-9) { s.finDue = null; finishers.push(c); }
      }
      let allIn = true;
      for (let i = 0; i < cars.length; i++) if (!(cars[i].finished || cars[i].retired)) { allIn = false; break; }
      if (allIn)
        for (const c of cars) { const s = bag(c); if (s.finDue != null) { s.finDue = null; finishers.push(c); } }

      rankAcc += dt;
      const lvl = G.cautionLevel ? G.cautionLevel() | 0 : 0;
      if (!(rankAcc >= RANK_S - 1e-9 || !primed || ev.length || finishers.length || regrid || lvl !== caution ||
          (p.hits | 0) > playerHits || inPits(p) !== _f.pitting || (!started && G.state === "race" && t > 0))) {
        _f.t = t; _f.energy = p.energy == null ? null : p.energy;
        _out.f = _f;
        return _out;
      }
      dt = rankAcc; rankAcc = 0; primed = true;
      order = rank(cars);
      for (const c of finishers) ev.push({ type: "finish", car: c, pos: order.indexOf(c) + 1 });
      if (!started && G.state === "race" && t > 0) {
        started = true;
        grid = new Map(order.map((c, i) => [c, i + 1]));
        ev.push({ type: "start", leader: order[0] || null });
      }

      if (regrid) {
        if (_shoved.size > 3) pairs.clear();
        else for (const k of pairs.keys()) if (_shoved.has(Math.floor(k / 1048576)) || _shoved.has(k % 1048576)) pairs.delete(k);
        _shoved.clear();
      }
      pairVisit++;
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j <= i + PAIR_SPAN && j < order.length; j++) {
          const a = order[i], b = order[j];
          const ia = bag(a).id, ib = bag(b).id;
          const key = ia < ib ? pairKey(ia, ib) : pairKey(ib, ia);
          let r = pairs.get(key);
          if (!r) { pairs.set(key, r = { ahead: a, pend: 0.5, key, visit: pairVisit }); r.pend = 0; continue; }
          r.visit = pairVisit;
          if (r.ahead === a) { r.pend = 0; continue; }
          r.pend += dt;
          if (r.pend < HOLD_S) continue;
          r.ahead = a; r.pend = 0;
          const sa = st.get(a), sb = st.get(b);
          const pitty = inPits(a) || inPits(b) || t - sa.pitT < 4 || t - sb.pitT < 4;
          if (started && t > 2 && !pitty && !a.finished && !b.finished) {
            ev.push({ type: "pass", a, b, pos: i + 1 });
          }
        }
      }

      for (const r of pairs.values()) if (r.visit !== pairVisit) pairs.delete(r.key);

      const raw = order.indexOf(p) + 1;
      if (!pos) pos = raw;
      else if (raw && raw !== pos) {
        if (raw !== pendPos) { pendPos = raw; pendT = 0; }
        pendT += dt;
        if (pendT >= HOLD_S) { ev.push({ type: "playerPos", pos: raw, prev: pos }); pos = raw; pendT = 0; }
      } else { pendPos = 0; pendT = 0; }

      if (lvl !== caution) { ev.push({ type: "caution", level: lvl, prev: caution }); caution = lvl; hist.clear(); }
      const hits = p.hits | 0;
      const sev = p.hitSev || 0;
      if (hits > playerHits) ev.push({ type: "hit", sev, rose: sev > playerSev });
      playerHits = hits; playerSev = sev;

      const at = order.indexOf(p);
      const ahead = at > 0 ? order[at - 1] : null;
      const behind = at >= 0 && at + 1 < order.length ? order[at + 1] : null;
      const gA = ahead ? gap(ahead, p) : null;
      const gB = behind ? gap(p, behind) : null;
      const sp = st.get(p);
      let rateA = null, rateB = null;
      if (sp && sp.cp >= 0) {
        if (!hist.has(sp.cp)) {
          hist.set(sp.cp, { a: ahead, ga: gA, b: behind, gb: gB, t });
          hist.delete(sp.cp - RING);
        }
        const old = hist.get(sp.cp - K);
        if (old && old.t - pitEndT >= 5) {
          if (ahead && old.a === ahead && old.ga != null && gA != null) rateA = gA - old.ga;
          if (behind && old.b === behind && old.gb != null && gB != null) rateB = gB - old.gb;
        }
      }

      const live = _live; live.clear();
      for (let i = 0; i + 1 < order.length; i++) {
        const a = order[i], b = order[i + 1];
        if (a.finished || b.finished || inPits(a) || inPits(b)) continue;
        const g = gap(a, b);
        if (g == null || g > BATTLE_GAP) continue;
        const key = pairKey(bag(a).id, bag(b).id);
        live.add(key);
        let bt = battles.get(key);
        if (!bt) battles.set(key, bt = { since: t, a, b, pos: i + 1 });
        bt.gap = g; bt.pos = i + 1;
      }
      for (const k of battles.keys()) if (!live.has(k)) battles.delete(k);

      const leader = order[0] || null, second = order[1] || null;
      if (leader && (leader.lap || 0) > leadLap) {
        if (leadLap > 0) ev.push({ type: "leaderLap", car: leader, lap: leader.lap });
        leadLap = leader.lap || 0;
      }
      const laps = G.lapsTarget || 0;
      const leaderToGo = laps > 0 && leader ? Math.max(0, laps - (leader.lap || 0) + 1) : null;
      let toGo = laps > 0 ? Math.max(0, laps - (p.lap || 0) + 1) : null;
      const lapped = leader && leader !== p && !p.finished && (leader.prog || 0) - (p.prog || 0) >= lapLen;
      if (toGo != null && lapped && leader.lastLap > 0 && p.lastLap > 0) {
        const vL = lapLen / leader.lastLap, vP = lapLen / p.lastLap;
        {
          const tL = leader.finished ? 0 : Math.max(0, laps * lapLen - (leader.prog || 0)) / vL;
          const at = (p.prog || 0) + tL * vP;
          toGo = Math.max(1, Math.min(toGo, Math.floor(at / lapLen) - Math.floor((p.prog || 0) / lapLen) + 1));
        }
      }
      const f = _f;
      f.t = t; f.laps = laps;
      f.lap = p.lap || 0;
      f.toGo = toGo;
      f.leaderToGo = leaderToGo;
      f.pos = pos || raw; f.rawPos = raw; f.n = order.length;
      f.gridPos = grid && grid.has(p) ? grid.get(p) : null;
      f.ahead = ahead; f.behind = behind; f.gapA = gA; f.gapB = gB; f.rateA = rateA; f.rateB = rateB;
      f.leader = leader; f.second = second; f.leadGap = leader && second ? gap(leader, second) : null;
      f.lastLap = p.lastLap || 0; f.best = Number.isFinite(p.best) ? p.best : 0;
      if (fastest.car) { _fastestOut.car = fastest.car; _fastestOut.time = fastest.time; f.fastest = _fastestOut; } else f.fastest = null;
      f.energy = p.energy == null ? null : p.energy;
      f.finished = !!p.finished; f.retired = !!p.retired; f.pitting = inPits(p);
      f.caution = caution;
      f.started = started;
      _out.f = f;
      return _out;
    }

    return {
      observe, reset, gap,
      order: () => order.slice(),
      gridOf: (c) => (grid && grid.has(c) ? grid.get(c) : null),
      battles: () => Array.from(battles.values()),
    };
  }

  return Object.freeze({ create });
})();
Object.freeze(RaceFacts);
