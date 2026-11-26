/* QualiWire — one validation site for a peer's qualifying time.
   Peeled from NetPlay. create(EV) binds QUALI and QLIVE through NetWire
   (wire-schema.js owns the decoders and the rate caps); the names stay on
   NetPlay (validQuali, bindQuali, qualiReporters, the bounds) because the
   lobby registers the same handlers while it still holds the connection. */
"use strict";

const QualiWire = (function () {
  function create(EV) {
    // The validators and the rate caps are NetWire's rows (wire-schema.js, the
    // one declaration of the reliable wire): a bare `d.t > 0` passed "70" and
    // `true`, and quali-model.js throws on `.toFixed` of the stored value, so
    // a time is coerced, bounded to a lap a human can drive (20 s .. 1 h) and
    // handed on as a NUMBER. NO TIME (every lap deleted for track limits)
    // crosses as {noTime: true} and arrives as t = Infinity. Both receivers —
    // the lobby's (qualifying runs while the LOBBY still holds the
    // connection) and NetPlay's bindSession — share them. QUALI and QLIVE draw
    // from ONE bucket per connection (RATES.quali): a real client sends
    // ~2.5 QLIVE/s plus one QUALI, and a GUEST's one link is the host relaying
    // the whole room, so it gets four drivers' worth (#5012).
    const { validQuali, validQualiLive, QUALI_MIN_S, QUALI_MAX_S, EVENT_WINDOW_MS } = NetWire;
    const QUALI_RATE = NetWire.RATES.quali.host, QUALI_GUEST_RATE = NetWire.RATES.quali.guest;
    // Register the QUALI/QLIVE receivers on a session. `ownsDriver(d)` is the
    // caller's sender binding — the lobby keys it on the HELLO profile filed
    // under the connection, NetPlay on the remote car it seated — because the
    // two phases hold different truths about who a connection speaks for.
    // Rate limiting lives in the caller (lobby / bindSession) via NetWire.gate
    // ("quali") so QUALI and QLIVE share one bucket per connection (#1414).
    // `sink` is game.js's qualiNet (onPeerQuali / onPeerQualiLive), handed in by the caller.
    function bindQuali(s, ownsDriver, sink, onAccepted) {
      NetWire.on(s, EV.QUALI, (q) => {
        if (ownsDriver(q)) {
          if (sink && sink.onPeerQuali) sink.onPeerQuali(q);
          if (onAccepted) onAccepted(EV.QUALI, q);
        }
      });
      NetWire.on(s, EV.QLIVE, (q) => {
        if (ownsDriver(q)) {
          if (sink && sink.onPeerQualiLive) sink.onPeerQualiLive(q);
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
      validQuali, validQualiLive, bindQuali, qualiReporters,
      QUALI_MIN_S, QUALI_MAX_S, QUALI_RATE, QUALI_GUEST_RATE, EVENT_WINDOW_MS,
    };
  }
  return { create };
})();
Object.freeze(QualiWire);
