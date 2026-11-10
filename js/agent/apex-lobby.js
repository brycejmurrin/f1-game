/* Apex 26 — ApexLobby: session and field hooks of window.__apex.
   Pure move out of apex.js (#1660). Netplay hooks stay in apex-net.js. */
const ApexLobby = (function () {
  "use strict";

  const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);

  // PER-CAR LAP LOG. The game keeps only lastLap/best per car, so a headless
  // race could not answer "what did car 7 run on lap 3". afterStep() watches
  // every car's lap counter after each __apex step()/act()/rollout() tick: a
  // forward crossing past lap 1 banks _lapTimeAtLine (RaceControl.lineTransition),
  // valid when the game itself took it as lastLap and the lap was not deleted.
  // A backward undo keeps the entry and skips the re-crossing (it was timed once).
  // Keyed by car object: a new field (makeCars) starts empty.
  const lapLogs = new WeakMap();
  function logOf(c) {
    let e = lapLogs.get(c);
    if (!e) { e = { seen: c.lap || 0, laps: [], recross: 0, inv: !!c.incidentInvalidLap }; lapLogs.set(c, e); }
    return e;
  }
  function observeLaps(cars) {
    for (const c of cars || []) {
      const e = logOf(c), lap = c.lap || 0;
      if (lap === 0 && e.seen > 1) { e.laps.length = 0; e.recross = 0; }   // reset(): a new episode
      else if (lap < e.seen) e.recross += e.seen - lap;
      else if (lap > e.seen) {
        for (let n = e.seen + 1; n <= lap; n++) {
          if (e.recross > 0) { e.recross--; continue; }
          if (n < 2) continue;   // 0 → 1 is the start crossing
          const t = c._lapTimeAtLine;
          e.laps.push({ lap: n - 1, time: r3(t), valid: !e.inv && Number.isFinite(t) && c.lastLap === t });
        }
      }
      e.seen = lap; e.inv = !!c.incidentInvalidLap;
    }
  }
  const lapsOf = (c) => logOf(c).laps.map((l) => Object.assign({}, l));

  // FLAG HOLD (flagHold(true)): finishDelay ends a race 3.5 s after the first
  // AI finisher (2.2 s after the last human), so the rest of the field never
  // takes the flag headless. While held, afterStep() zeroes the result
  // countdown each tick until every car is flagged or retired; the 360 s/lap
  // hard cap still applies. Bound to one field: a new race drops it.
  let holdCars = null;
  function afterStep(G) {
    observeLaps(G.cars);
    if (holdCars !== G.cars || G.state !== "race" || !(G.resultT > 0)) return;
    if (G.raceT > 360 * Math.max(1, G.lapsTarget || 1)) return;
    if (G.cars.some((c) => !c.finished && !c.retired)) G.resultT = 0;
  }

  // step()/act() (apex.js): the rAF loop only steps 1/60 (a 22-car race changed winner at 120 Hz), so
  // d*n runs as whole 1/60 steps, the remainder carried like its physAcc, warned once; dt 0 stays a refresh.
  let dtWarned = false, dtAcc = 0;
  function simSteps(d, count) {
    if (d === 0) return [0, count];
    const k = d * 60;
    if (!dtWarned && Math.abs(k - Math.round(k)) > 1e-9) { dtWarned = true; Log.warn("apex", "step/act dt=" + d + " runs as whole 1/60 s steps (the game's only physics step)"); }
    dtAcc += d * count;
    const steps = Math.floor(dtAcc * 60 + 1e-9);
    dtAcc = Math.max(0, dtAcc - steps / 60);
    return [1 / 60, steps];
  }
  // One step()/act() tick: render anchors first (the rAF loop snapshots them before each step); in
  // "results" the rAF loop's finished-car loop (G.stepResultsField, once game.js exposes it), else update().
  function tick(G, d) {
    AgentView.syncRenderAnchors(G.cars);
    if (G.state === "results" && G.stepResultsField) G.stepResultsField(d); else G.update(d);
    afterStep(G);
  }

  function hooks(G, deps) {
    const { raceOrder } = deps;

    return {
// fieldLaps() — every car's lap log: [{id, code, name, team, lap, best, last,
// finished, retired, laps:[{lap, time, valid}]}]. Complete for laps stepped
// through step()/act()/rollout(); a live rAF race banks only what a call sees.
fieldLaps() {
    if (!G.track || !G.cars.length) return null;
    observeLaps(G.cars);
    return G.cars.map((c, id) => ({
      id, code: c.code, name: c.name, team: c.team && c.team.id, lap: c.lap || 0,
      best: r3(c.best), last: r3(c.lastLap), finished: !!c.finished, retired: !!c.retired,
      laps: lapsOf(c),
    }));
  },
// classification() — the finishing order. {final, state, lapsTarget, rows:[{pos,
// id, code, name, team, isPlayer, status finished|running|retired|dsq, laps,
// time, penalty, gap, lapsDown, gapM, classified, dnf}]}. final:true once the
// results sheet is settled (endRace's finPos); before that a provisional
// order: flagged cars by laps then clock, runners by progress, retirements.
classification() {
    if (!G.track || !G.cars.length) return null;
    const cars = G.cars, final = G.state === "results" && cars.every((c) => c.finPos > 0);
    const byProg = (a, b) => (b.prog || 0) - (a.prog || 0);
    const order = final ? cars.slice().sort((a, b) => a.finPos - b.finPos)
      : cars.filter((c) => c.finished && !c.retired && !c.dsq).sort(RaceControl.finishOrder)
        .concat(cars.filter((c) => !c.finished && !c.retired && !c.dsq).sort(byProg),
                cars.filter((c) => c.retired && !c.dsq).sort(byProg), cars.filter((c) => c.dsq));
    const done = (c) => Math.max(0, (c.lap || 0) - 1);
    const clock = (c) => (c.finished && Number.isFinite(c.finishT) ? c.finishT + (c.penalty || 0) : null);
    const lead = order[0];
    return { final, state: G.state, lapsTarget: G.lapsTarget, rows: order.map((c, i) => {
      const t = clock(c), lt = clock(lead), down = done(lead) - done(c);
      return {
        pos: i + 1, id: cars.indexOf(c), code: c.code, name: c.name, team: c.team && c.team.id,
        isPlayer: !!c.isPlayer,
        status: c.dsq ? "dsq" : c.retired ? "retired" : c.finished ? "finished" : "running",
        laps: done(c), time: r3(t), penalty: c.penalty || 0,
        gap: t != null && lt != null && down === 0 ? r3(t - lt) : null, lapsDown: down,
        gapM: +((lead.prog || 0) - (c.prog || 0)).toFixed(1),
        classified: final ? !!c.classified : null, dnf: c.dnf || c.dsq || null,
      };
    }) };
  },
// flagHold(on?) — keep a headless race running until EVERY car is flagged or
// retired (see afterStep). No arg reads; returns {on, running}.
flagHold(on) {
    if (on !== undefined) holdCars = on ? G.cars : null;
    return { on: !!G.cars && holdCars === G.cars, running: (G.cars || []).filter((c) => !c.finished && !c.retired).length };
  },
// Timing & field hooks
sectorState() {
    if (!G.player || !G.track) return null;
    const elapsed = (G.player.lapTime || 0) - G.sectorStartT;
    return {
      idx: G.sectorIdx,
      elapsed: +elapsed.toFixed(3),
      bests: G.sectorBests.map((v) => v === Infinity ? null : +v.toFixed(3)),
      last:  G.sectorLast.map((v) => v == null     ? null : +v.toFixed(3)),
      // The field's best per sector — the timing screen's purple (hud.js), and the
      // overlay's (OverlayPublisher): a sector is purple when it beats this too.
      fieldBest: (G.fieldSectorBests || []).map((v) => v == null || v === Infinity ? null : +v.toFixed(3)),
    };
  },
lapHistory() {
    if (!G.player) return null;
    return {
      mode: G.timeTrial ? "tt" : "race",
      // Race mode: the lap log fieldLaps() keeps (valid:false = a deleted lap, still timed).
      laps: G.timeTrial
        ? G.ttLaps.map((t, i) => ({ lap: i + 1, time: +t.toFixed(3) }))
        : (observeLaps(G.cars), lapsOf(G.player)),
      best:    isFinite(G.player.best)  ? +G.player.best.toFixed(3)    : null,
      lastLap: G.player.lastLap != null ? +G.player.lastLap.toFixed(3) : null,
    };
  },
timing() {
    if (!G.player || !G.track) return null;
    const sorted = raceOrder(G.cars);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const ahead  = pi > 0               ? sorted[pi - 1] : null;
    const behind = pi < sorted.length - 1 ? sorted[pi + 1] : null;
    return {
      raceT:         +G.raceT.toFixed(3),
      lapTime:       +(G.player.lapTime  || 0).toFixed(3),
      best:          isFinite(G.player.best) ? +G.player.best.toFixed(3) : null,
      lastLap:       G.player.lastLap != null ? +G.player.lastLap.toFixed(3) : null,
      lap:            G.player.lap || 0,
      pos:            pi + 1,
      total:          G.cars.length,
      gapAhead:      ahead  ? +(ahead.prog  - (G.player.prog || 0)).toFixed(2) : null,
      gapBehind:     behind ? +((G.player.prog || 0) - behind.prog).toFixed(2) : null,
      energy:        +(G.player.energy || 0).toFixed(3),
      aeroX:         +(G.player.aeroX || 0).toFixed(3),
      gear:           G.player.gear || 1,
      sector:         G.sectorIdx + 1,
      sectorElapsed: +((G.player.lapTime || 0) - G.sectorStartT).toFixed(3),
    };
  },
fieldState() {
    if (!G.track || !G.cars.length) return null;
    const sorted = raceOrder(G.cars);
    const leader = sorted[0];
    return sorted.map((c, pos) => ({
      pos:      pos + 1,
      id:       G.cars.indexOf(c),
      name:     c.name,
      code:     c.code,
      team:     c.team && c.team.id,
      isPlayer: !!c.isPlayer,
      lap:      c.lap || 0,
      frac:     +(c.s / G.track.total).toFixed(4),
      speed:    +c.speed.toFixed(2),
      gap:      +(leader.prog - c.prog).toFixed(2),
      finished: !!c.finished,
      finishT:  c.finishT != null ? +c.finishT.toFixed(2) : null,
      retired:  !!c.retired,
      dnf:      c.dnf || null,
    }));
  },
carRoles() {
    return G.cars.map((c, i) => ({
      id: i, code: c.code, team: c.team && c.team.id,
      human: !!c.human, local: !!c.local, isPlayer: !!c.isPlayer,
      hasPose: c.px != null && c.head != null,
      vLat: +(c.vLat || 0).toFixed(4),
      yawRateCur: +(c.yawRateCur || 0).toFixed(4),
      mods: c.mods ? Object.assign({}, c.mods) : null,
      netInput: c.netInput ? Object.assign({}, c.netInput) : null,
    }));
  },
carRole(idx, o) {
    const c = G.cars[idx];
    if (!c) return false;
    o = o || {};
    G.setCarRole(c,
      o.human === undefined ? !!c.human : !!o.human,
      o.local === undefined ? !!c.local : !!o.local);
    if (o.mods !== undefined) {
      c.mods = o.mods
        ? Object.assign({ speed: 1, accel: 1, cornering: 1, braking: 1 }, o.mods)
        : null;
    }
    if (!c.human) c.netInput = null;   // an AI car drives itself
    return {
      id: idx, human: !!c.human, local: !!c.local, isPlayer: !!c.isPlayer,
      mods: c.mods ? Object.assign({}, c.mods) : null,
    };
  },
// carInput(idx, {steer, throttle, brake, shiftUp?, shiftDown?, overtake?})
// — the controls a NON-LOCAL human car drives on, same shape as setInput().
// Pass null to clear (the car then coasts). Missing idx returns false;
// a successful clear returns { ok: true, cleared: true } so callers can
// tell "no such car" from "cleared". Ignored by the local car, which
// reads the real Input, and by AI cars, which drive themselves.
carInput(idx, input) {
    const c = G.cars[idx];
    if (!c) return false;
    c.netInput = input || null;
    if (input == null) return { ok: true, cleared: true };
    return Object.assign({ ok: true }, c.netInput);
  },
    };
  }

  return { hooks, afterStep, observeLaps, simSteps, tick };
})();
Object.freeze(ApexLobby);
