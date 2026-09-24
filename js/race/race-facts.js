/* Apex 26 — RACE FACTS: what is happening in the race, as numbers and events a
 * radio can talk about (js/race/race-radio.js is the only reader).
 *
 * THE TIMING LOOP. A gap in the HUD is `(a.prog - b.prog) / speed`, which is
 * honest for a glance and useless for a sentence: it swings by a second every
 * time either car brakes. Real timing does not divide a distance by a speed —
 * it compares the moments two cars crossed the SAME line. So every car's clock
 * time is written down at K checkpoints a lap, and the gap from A to B is how
 * much later B reached the last checkpoint B has crossed. That number moves
 * only when somebody actually gains time, which is the only time a radio should
 * say it moved. Two laps of history per car also give the TREND for free: the
 * gap now minus the gap one lap ago is "closing 0.3 a lap".
 *
 * A PASS MUST HOLD. Two cars side by side swap the prog order a dozen times in
 * a corner; announcing each swap is how a commentator ends up yelling nonsense.
 * A pair's order has to stay flipped for HOLD_S before it is a pass, and a
 * swap involving a car in the pit lane is a pit stop, not an overtake.
 *
 * READ-ONLY. It reads cars and the G façade and writes nothing but its own
 * state; no car field is touched, no sim RNG is drawn.
 */
const RaceFacts = (function () {
  "use strict";

  const K = 32;              // timing checkpoints per lap
  const RING = K * 2;        // two laps of crossing times per car
  const HOLD_S = 1.0;        // a changed order must hold this long to count
  const PAIR_SPAN = 2;       // each car is compared with the next two in order
  const BATTLE_GAP = 0.8;    // seconds — two cars this close are a fight

  const inPits = (c) => !!(c && c.pitState && c.pitState !== "none");

  function create() {
    let t = 0, lapLen = 0, cars = null, nextId = 1;
    const st = new Map();          // car -> per-car timing + edge memory
    const pairs = new Map();       // "id|id" -> { ahead, pend }
    const battles = new Map();     // "id|id" -> { since, a, b }
    const hist = new Map();        // player checkpoint -> { a, ga, b, gb }
    let order = [];
    let fastest = { time: Infinity, car: null };
    let pos = 0, pendPos = 0, pendT = 0;
    let grid = null, started = false, caution = 0, playerHits = 0, playerSev = 0;

    function reset() {
      t = 0; lapLen = 0; cars = null; nextId = 1;
      st.clear(); pairs.clear(); battles.clear(); hist.clear();
      order = []; fastest = { time: Infinity, car: null };
      pos = 0; pendPos = 0; pendT = 0; grid = null; started = false; caution = 0; playerHits = 0; playerSev = 0;
    }

    function bag(c) {
      let s = st.get(c);
      if (!s) {
        s = { id: nextId++, cp: -1, fresh: true, times: new Float64Array(RING), idx: new Int32Array(RING).fill(-1),
          lap: c.lap || 0, lastLap: c.lastLap || 0, retired: !!c.retired, finished: !!c.finished,
          stops: c.pitStops || 0, pit: inPits(c), pitT: -99 };
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

    /** Seconds from `a` (ahead) back to `b`, by the timing loop — or null until
     *  both have crossed one line since they were first seen. A radio that
     *  says a guessed number is worse than one that waits a checkpoint. */
    function gap(a, b) {
      if (!a || !b) return null;
      const sb = st.get(b);
      if (!sb || sb.cp < 0) return null;
      const ta = timeAt(a, sb.cp), tb = timeAt(b, sb.cp);
      return ta != null && tb != null ? Math.max(0, tb - ta) : null;
    }

    // By distance, with a finished car held at the prog it took the flag with
    // (it stops there, and the field would otherwise "pass" it). NOT c.finPos:
    // that stays 0 until endRace builds the results, so it cannot order anything
    // mid-race. Equal distance — the lead lap all flagged — goes by flag time.
    // A lapped car flagged at its next crossing froze a lap short, so it stays
    // below the lead-lap cars still running to the line.
    const distOf = (c) => {
      const s = st.get(c);
      return c.finished && s && s.finProg != null ? s.finProg : (c.prog || 0);
    };
    function rank(list) {
      const out = [];
      for (const c of list) if (!c.retired) out.push(c);
      out.sort((a, b) => {
        const d = distOf(b) - distOf(a);
        if (Math.abs(d) > 1) return d;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return (st.get(a).finT || 0) - (st.get(b).finT || 0);
        return d;
      });
      return out;
    }

    function observe(G, dt) {
      const ev = [], finishers = [];
      const p = G.player;
      if (!p || !G.cars || !G.track) return { f: null, ev };
      if (G.cars !== cars) { reset(); cars = G.cars; }
      lapLen = G.track.total || lapLen || 1;
      t = G.raceT || 0;
      const seg = lapLen / K;

      // ── per car: timing loop and edges ──────────────────────────────────
      for (const c of cars) {
        const s = bag(c);
        const i = Math.floor((c.prog || 0) / seg);
        // FIRST SIGHT stamps nothing: the lines behind a car were crossed before
        // anyone was watching, and stamping them "now" would invent gaps.
        if (s.fresh) { s.fresh = false; s.cp = i; }
        if (i < s.cp) {                             // shoved backwards: give the checkpoints back
          s.cp = i;
          // …and the player's gap history with them. A red-flag restart puts the
          // field back on the grid, bunched; comparing those gaps with the
          // pre-flag ones logged at the same checkpoints read as "6.5 quicker".
          if (c === p) hist.clear();
        }
        while (s.cp < i) {
          s.cp++;
          if (s.cp >= 0) { const k = s.cp % RING; s.times[k] = t; s.idx[k] = s.cp; }
        }
        if (c.retired && !s.retired) ev.push({ type: "retire", car: c, why: c.dnf || c.dnfWhy || "mechanical", pos: order.indexOf(c) + 1 });
        s.retired = !!c.retired;
        const pit = inPits(c);
        if (pit && !s.pit) ev.push({ type: "pitIn", car: c, pos: order.indexOf(c) + 1 });
        if (pit || s.pit) s.pitT = t;
        s.pit = pit;
        s.stops = c.pitStops || 0;
        if ((c.lap || 0) > s.lap && c.lastLap > 0 && c.lastLap !== s.lastLap) {
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
        if (c.finished && !s.finished) { s.finProg = c.prog || 0; s.finT = t; finishers.push(c); }
        s.finished = !!c.finished;
      }

      order = rank(cars);
      // The finish position is the flagged car's place in the ranking — after
      // ranking, so a car that just took the flag is placed by it.
      for (const c of finishers) ev.push({ type: "finish", car: c, pos: order.indexOf(c) + 1 });
      if (!started && G.state === "race" && t > 0) {
        started = true;
        grid = new Map(order.map((c, i) => [c, i + 1]));
        ev.push({ type: "start", leader: order[0] || null });
      }

      // ── passes: a flipped pair that HOLDS ───────────────────────────────
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j <= i + PAIR_SPAN && j < order.length; j++) {
          const a = order[i], b = order[j];
          const ia = bag(a).id, ib = bag(b).id;
          const key = ia < ib ? ia + "|" + ib : ib + "|" + ia;
          let r = pairs.get(key);
          if (!r) { pairs.set(key, { ahead: a, pend: 0 }); continue; }
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

      // ── the player's position, with the same hold ───────────────────────
      const raw = order.indexOf(p) + 1;
      if (!pos) pos = raw;
      else if (raw && raw !== pos) {
        if (raw !== pendPos) { pendPos = raw; pendT = 0; }
        pendT += dt;
        if (pendT >= HOLD_S) { ev.push({ type: "playerPos", pos: raw, prev: pos }); pos = raw; pendT = 0; }
      } else { pendPos = 0; pendT = 0; }

      // ── flags and contact ───────────────────────────────────────────────
      const ci = G.cautionInfo ? G.cautionInfo() : null;
      const lvl = ci ? ci.level | 0 : 0;
      if (lvl !== caution) { ev.push({ type: "caution", level: lvl, prev: caution }); caution = lvl; }
      const hits = p.hits | 0;
      // hitSev is the race's WORST impact, not this one's, so "rose" is the
      // only honest signal that this contact was a big one.
      const sev = p.hitSev || 0;
      if (hits > playerHits) ev.push({ type: "hit", sev, rose: sev > playerSev });
      playerHits = hits; playerSev = sev;

      // ── the player's neighbours, and how the gaps are moving ────────────
      const at = order.indexOf(p);
      const ahead = at > 0 ? order[at - 1] : null;
      const behind = at >= 0 && at + 1 < order.length ? order[at + 1] : null;
      const gA = ahead ? gap(ahead, p) : null;
      const gB = behind ? gap(p, behind) : null;
      const sp = st.get(p);
      let rateA = null, rateB = null;
      if (sp && sp.cp >= 0) {
        if (!hist.has(sp.cp)) {
          hist.set(sp.cp, { a: ahead, ga: gA, b: behind, gb: gB });
          hist.delete(sp.cp - RING);
        }
        const old = hist.get(sp.cp - K);
        if (old) {
          if (ahead && old.a === ahead && old.ga != null && gA != null) rateA = gA - old.ga;
          if (behind && old.b === behind && old.gb != null && gB != null) rateB = gB - old.gb;
        }
      }

      // ── battles anywhere on the road ────────────────────────────────────
      const live = new Set();
      for (let i = 0; i + 1 < order.length; i++) {
        const a = order[i], b = order[i + 1];
        if (a.finished || b.finished || inPits(a) || inPits(b)) continue;
        const g = gap(a, b);
        if (g == null || g > BATTLE_GAP) continue;
        const key = bag(a).id + ">" + bag(b).id;
        live.add(key);
        let bt = battles.get(key);
        if (!bt) battles.set(key, bt = { since: t, a, b, pos: i + 1 });
        bt.gap = g; bt.pos = i + 1;
      }
      for (const k of Array.from(battles.keys())) if (!live.has(k)) battles.delete(k);

      const leader = order[0] || null, second = order[1] || null;
      const laps = G.lapsTarget || 0;
      const f = {
        t, laps,
        lap: p.lap || 0,
        toGo: laps > 0 ? Math.max(0, laps - (p.lap || 0) + 1) : null,
        leaderToGo: laps > 0 && leader ? Math.max(0, laps - (leader.lap || 0) + 1) : null,
        pos: pos || raw, rawPos: raw, n: order.length,
        gridPos: grid && grid.has(p) ? grid.get(p) : null,
        ahead, behind, gapA: gA, gapB: gB, rateA, rateB,
        leader, second, leadGap: leader && second ? gap(leader, second) : null,
        lastLap: p.lastLap || 0, best: Number.isFinite(p.best) ? p.best : 0,
        fastest: fastest.car ? { car: fastest.car, time: fastest.time } : null,
        energy: p.energy == null ? null : p.energy,
        finished: !!p.finished, retired: !!p.retired, pitting: inPits(p),
        caution,
        started,
      };
      return { f, ev };
    }

    return {
      observe, reset, gap,
      order: () => order.slice(),
      gridOf: (c) => (grid && grid.has(c) ? grid.get(c) : null),
      battles: () => Array.from(battles.values()),
    };
  }

  return Object.freeze({ create, K, HOLD_S, BATTLE_GAP });
})();
Object.freeze(RaceFacts);
