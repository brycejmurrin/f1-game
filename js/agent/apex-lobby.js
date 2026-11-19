const ApexLobby = (function () {
  "use strict";

  function hooks(G, deps) {
    const { raceOrder } = deps;

    return {
sectorState() {
    if (!G.player || !G.track) return null;
    const elapsed = (G.player.lapTime || 0) - G.sectorStartT;
    return {
      idx: G.sectorIdx,
      elapsed: +elapsed.toFixed(3),
      bests: G.sectorBests.map((v) => v === Infinity ? null : +v.toFixed(3)),
      last:  G.sectorLast.map((v) => v == null     ? null : +v.toFixed(3)),
      fieldBest: (G.fieldSectorBests || []).map((v) => v == null || v === Infinity ? null : +v.toFixed(3)),
    };
  },
lapHistory() {
    if (!G.player) return null;
    return {
      mode: G.timeTrial ? "tt" : "race",
      laps: G.timeTrial
        ? G.ttLaps.map((t, i) => ({ lap: i + 1, time: +t.toFixed(3) }))
        : [],
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
    if (!c.human) c.netInput = null;
    return {
      id: idx, human: !!c.human, local: !!c.local, isPlayer: !!c.isPlayer,
      mods: c.mods ? Object.assign({}, c.mods) : null,
    };
  },
carInput(idx, input) {
    const c = G.cars[idx];
    if (!c) return false;
    c.netInput = input || null;
    if (input == null) return { ok: true, cleared: true };
    return Object.assign({ ok: true }, c.netInput);
  },
    };
  }

  return { hooks };
})();
Object.freeze(ApexLobby);
