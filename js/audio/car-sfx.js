"use strict";
var CarSfx = (() => {
  const SFX = { scrub: 0, lock: 0, surface: 0, pitLim: 0, wet: false };
  SFX.scrub = SFX.lock = SFX.surface = 0.5; SFX.scrub = SFX.lock = SFX.surface = 0;

  function create(G) {
    let lastPit = "none", lastCar = null, lastRaceT = NaN;
    const SEND_GAP_MS = 4;
    let lastSendMs = -Infinity, lastOnMask = -1;
    const wall = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

    function levels(c, v01, out) {
      const o = out || {};
      const moving = Math.max(0, Math.min(1, (v01 - 0.04) / 0.10));
      const fu = +c.frontUtil || 0;
      o.scrub = c.offroad ? 0 : Math.max(0, Math.min(1, (fu - 0.98) / 0.20)) * moving;
      o.lock = Math.max(0, Math.min(1, +c.wheelLock || 0)) * moving;
      o.surface = c.offroad ? Math.min(1, 0.25 + 0.75 * v01) * moving : 0;
      const held = G.pits && G.pits.held ? G.pits.held(c) : c.pitState === "lane";
      o.pitLim = held && v01 > 0.05 ? 1 : 0;
      return o;
    }

    function update(c) {
      if (!c) return;
      const v01 = Math.abs(+c.speed || 0) / Math.max(1, G.vTop());
      levels(c, v01, SFX);
      const mask = (SFX.scrub > 0) | (SFX.lock > 0) << 1 | (SFX.surface > 0) << 2 | (SFX.pitLim > 0) << 3;
      const ms = wall();
      if (mask !== lastOnMask || ms - lastSendMs >= SEND_GAP_MS || c !== lastCar) {
        lastOnMask = mask; lastSendMs = ms;
        SFX.wet = !!(G.isWetRoad && G.isWetRoad());
        GameAudio.setCarSfx(SFX);
      }
      const ps = c.pitState || "none";
      const rt = G.raceT;
      if (Number.isFinite(rt) && Number.isFinite(lastRaceT) && rt + 0.02 < lastRaceT) {
        lastCar = c; lastPit = ps;
      }
      if (Number.isFinite(rt)) lastRaceT = rt;
      if (c !== lastCar) { lastCar = c; lastPit = ps; }
      if (ps !== lastPit) {
        if (ps === "box") GameAudio.pitGun(false);
        else if (lastPit === "box" && ps === "out") GameAudio.pitGun(true);
        lastPit = ps;
      }
    }

    return { update, levels };
  }
  return { create };
})();
