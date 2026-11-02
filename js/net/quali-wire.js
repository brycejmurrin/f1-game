/* QualiWire — one validation site for a peer's qualifying time.
   Peeled from NetPlay. create(EV) binds QUALI and QLIVE; the names stay on
   NetPlay (validQuali, bindQuali, qualiReporters, the bounds) because the
   lobby registers the same handlers while it still holds the connection. */
"use strict";

const QualiWire = (function () {
  function create(EV) {
    // Both receivers — the lobby's (qualifying runs while the LOBBY still
    // holds the connection) and NetPlay's bindSession — share it: a bare
    // `d.t > 0` passes "70" and `true`, and quali-model.js throws on
    // `.toFixed` of the stored value. Coerced here, bounded to a lap a human
    // can drive (20 s .. 1 h), and handed on as a NUMBER.
    const QUALI_MIN_S = 20, QUALI_MAX_S = 3600;
    // NO TIME (every lap deleted for track limits) crosses as {noTime: true}
    // and arrives as t = Infinity — quali-model's own "drove, no valid lap"
    // value — never as the synthetic back-of-grid time the local sheet made.
    function validQuali(d) {
      if (!d || typeof d !== "object" || d.driverId == null) return null;
      if (d.noTime === true) return { driverId: d.driverId, t: Infinity, noTime: true };
      const t = Number(d.t);
      if (!(Number.isFinite(t) && t > QUALI_MIN_S && t < QUALI_MAX_S)) return null;
      return { driverId: d.driverId, t };
    }
    // QLIVE never reaches the classification — it is a clock on somebody
    // else's screen — so it is bounded rather than refused.
    function validQualiLive(d) {
      if (!d || typeof d !== "object" || d.driverId == null) return null;
      const t = Number(d.t), frac = Number(d.frac);
      return {
        driverId: d.driverId,
        t: Number.isFinite(t) && t >= 0 ? Math.min(t, QUALI_MAX_S) : 0,
        frac: Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) : 0,
      };
    }
    // QUALI + QLIVE flood cap, shared by the lobby and the in-race relay: per
    // connection, rolling window. A real client sends ~2.5 QLIVE/s plus one QUALI.
    const QUALI_RATE = 12, EVENT_WINDOW_MS = 1000;
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
    // Register the QUALI/QLIVE receivers on a session. `ownsDriver(d)` is the
    // caller's sender binding — the lobby keys it on the HELLO profile filed
    // under the connection, NetPlay on the remote car it seated — because the
    // two phases hold different truths about who a connection speaks for.
    // Rate limiting lives in the caller (lobby / bindSession) via rateGate so
    // QUALI and QLIVE share one window per connection (#1414).
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
    // The senders, one shape for both phases. A driven lap rides the reliable
    // channel: a lost qualifying time is a wrong grid for the whole race, not
    // one stuttered frame. The lap IN PROGRESS is allowed to be wrong, late or
    // lost, so it is fire-and-forget and never gated on anything.
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
      QUALI_MIN_S, QUALI_MAX_S, QUALI_RATE, EVENT_WINDOW_MS,
    };
  }
  return { create };
})();
Object.freeze(QualiWire);
