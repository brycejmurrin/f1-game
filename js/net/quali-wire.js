"use strict";

const QualiWire = (function () {
  function create(EV) {
    const QUALI_MIN_S = 20, QUALI_MAX_S = 3600;
    function validQuali(d) {
      if (!d || typeof d !== "object" || d.driverId == null) return null;
      if (d.noTime === true) return { driverId: d.driverId, t: Infinity, noTime: true };
      const t = Number(d.t);
      if (!(Number.isFinite(t) && t > QUALI_MIN_S && t < QUALI_MAX_S)) return null;
      return { driverId: d.driverId, t };
    }
    function validQualiLive(d) {
      if (!d || typeof d !== "object" || d.driverId == null) return null;
      const t = Number(d.t), frac = Number(d.frac);
      return {
        driverId: d.driverId,
        t: Number.isFinite(t) && t >= 0 ? Math.min(t, QUALI_MAX_S) : 0,
        frac: Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) : 0,
      };
    }
    const QUALI_RATE = 12, EVENT_WINDOW_MS = 1000;
    const QUALI_GUEST_RATE = QUALI_RATE * 4;
    function rateGate(limit, windowMs = EVENT_WINDOW_MS) {
      const times = [];
      return () => {
        const now = performance.now();
        while (times.length && now - times[0] > windowMs) times.shift();
        if (times.length >= limit) return false;
        times.push(now);
        return true;
      };
    }
    function bindQuali(s, ownsDriver, G, onAccepted) {
      s.onEvent(EV.QUALI, (d) => {
        const q = validQuali(d);
        if (q && ownsDriver(q)) {
          if (G.onPeerQuali) G.onPeerQuali(q);
          if (onAccepted) onAccepted(EV.QUALI, q);
        }
      });
      s.onEvent(EV.QLIVE, (d) => {
        const q = validQualiLive(d);
        if (q && ownsDriver(q)) {
          if (G.onPeerQualiLive) G.onPeerQualiLive(q);
          if (onAccepted) onAccepted(EV.QLIVE, q);
        }
      });
    }
    function qualiReporters(broadcast, live) {
      return {
        reportQuali(driverId, t) {
          if (!live() || !(t > 0)) return false;
          if (t === Infinity) return broadcast(EV.QUALI, { driverId, t: null, noTime: true });
          return broadcast(EV.QUALI, { driverId, t: +Number(t).toFixed(3) });
        },
        reportQualiLive(driverId, t, frac) {
          if (!live() || !(t >= 0)) return false;
          return broadcast(EV.QLIVE, { driverId, t: +Number(t).toFixed(2), frac: +(Number(frac) || 0).toFixed(3) });
        },
      };
    }
    return {
      validQuali, validQualiLive, rateGate, bindQuali, qualiReporters,
      QUALI_MIN_S, QUALI_MAX_S, QUALI_RATE, QUALI_GUEST_RATE, EVENT_WINDOW_MS,
    };
  }
  return { create };
})();
Object.freeze(QualiWire);
