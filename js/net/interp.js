/* NetInterp — draw a rival smoothly from late, reordered or missing poses.
   Peeled from NetSnapshot. The codec stays there; createInterp still lives on
   NetSnapshot and passes the shared drop counter plus the wire limits. */
"use strict";

const NetInterp = (function () {
  function create(opts, env) {
    const TAU = env.TAU;
    const MAX_AHEAD_MS = env.MAX_AHEAD_MS;
    const MAX_INTERP_GAP_MS = env.MAX_INTERP_GAP_MS;
    const dropped = env.dropped;
    // Both of these take the SHORT way round. Without that, a car crossing the
    // start/finish line appears to sprint backwards down the whole lap, and one
    // rotating through the heading wrap spins the wrong way — once per lap,
    // every lap, which reads as a physics bug rather than a netcode one.
    function lerpWrapped(a, b, u, period) {
      const d = M4.wrapDelta(b - a, period);   // shortest way round (js/core/mat4.js)
      const v = a + d * u;
      return ((v % period) + period) % period;
    }

    // Adaptive-delay bounds: the delay never exceeds MAX_DELAY_MS (a rival drawn
    // further in the past than that is a different game), a single lag reading
    // is capped at MAX_LAG_MS (a stall is not a latency), and the margin keeps
    // the target behind the newest packet's arrival.
    const MAX_DELAY_MS = 400, MAX_LAG_MS = 400, LAG_MARGIN_MS = 20;
    // Snapshot ticks are sent as uint32 milliseconds to keep the wire frame
    // compact.  performance.now() eventually crosses that boundary (~49.7 d),
    // while the interpolation target and arrival stamps remain full precision.
    // Rebase a wire tick to the epoch nearest a local reference before doing
    // ordering or clock-ahead checks.  Without this, the first post-wrap packet
    // sorts behind the whole buffer and a rival freezes until the ring expires.
    const TICK_MOD = 0x100000000;
    function tickRaw(t) {
      return ((t % TICK_MOD) + TICK_MOD) % TICK_MOD;
    }
    function tickNear(t, reference) {
      const raw = tickRaw(t);
      if (!Number.isFinite(reference)) return raw;
      return raw + Math.round((reference - raw) / TICK_MOD) * TICK_MOD;
    }
    function createInterp(opts) {
      opts = opts || {};
      const total = opts.total || 1;         // track length, for wrap-aware s
      let delayMs = opts.delayMs != null ? opts.delayMs : 100;
      const baseDelay = delayMs;
      let jitter = 0, lag = 0, interval = 0, lastArrival = null, lastTick = null, presentedAt = -Infinity;
      const maxExtrapMs = opts.maxExtrapMs != null ? opts.maxExtrapMs : 250;
      const maxInterpGapMs = opts.maxInterpGapMs != null ? opts.maxInterpGapMs : MAX_INTERP_GAP_MS;
      const keep = opts.keep || 32;
      let samples = [];                      // ascending by t

      // A tick this far AHEAD of the local clock at arrival is not latency or
      // clock-sync error (the offset is bounded by half the 4 s RTT cap in
      // session.js) — it is a bad or hostile peer. Accepted, one such packet
      // became the buffer's newest sample for good (nothing newer ever arrives)
      // and pinned lastTick, so every honest packet after it skipped the
      // adaptive-delay update: the rival froze and the delay stopped adapting.
      const maxAheadMs = opts.maxAheadMs != null ? opts.maxAheadMs : MAX_AHEAD_MS;

      function push(t, st, arrivalMs) {
        if (!Number.isFinite(t)) return false;
        // Arrival is in the receiver's full local clock domain.  It is the best
        // epoch anchor for a decoded uint32 tick; when absent, the newest sample
        // keeps direct unit-test/loopback pushes in the same epoch.
        const reference = Number.isFinite(arrivalMs) ? arrivalMs
          : (samples.length ? samples[samples.length - 1].t : null);
        t = tickNear(t, reference);
        if (Number.isFinite(arrivalMs) && t - arrivalMs > maxAheadMs) { dropped("tick ahead of clock"); return false; }
        if (opts.adaptive && Number.isFinite(arrivalMs) && (lastTick == null || t > lastTick)) {
          // LAG IS LATENCY, NOT ONLY JITTER. sample() aims at `now − delayMs` on
          // the synced clock, so a packet interpolates only if it arrived at
          // least delayMs after its tick. Tracking jitter alone left every link
          // slower than the base delay one way — and the host RELAY, whose
          // stamp is already a delay old — extrapolating EVERY frame: x, heading
          // and speed frozen between packets, the rival stepping sideways at the
          // publish rate. Follow the observed lag up at once and down slowly,
          // and cover the PUBLISH INTERVAL too: between two packets the target
          // keeps moving while the newest sample does not, so the delay has to
          // exceed lag + interval for the whole gap to interpolate.
          const lagNow = Math.max(0, Math.min(MAX_LAG_MS, arrivalMs - t));
          lag = lagNow > lag ? lagNow : lag + (lagNow - lag) * 0.02;
          if (lastArrival != null) {
            const deviation = Math.min(200, Math.abs((arrivalMs - lastArrival) - (t - lastTick)));
            jitter += (deviation - jitter) * 0.1;
            interval += (Math.min(200, Math.max(0, t - lastTick)) - interval) * 0.1;
            const target = Math.min(MAX_DELAY_MS, Math.max(baseDelay, lag + interval + LAG_MARGIN_MS) + jitter * 2);
            delayMs += (target - delayMs) * 0.08;
          }
          lastArrival = arrivalMs; lastTick = t;
        }
        const rec = Object.assign({ t }, st);
        // Fast path: the normal case is strictly newer than everything held.
        if (!samples.length || t > samples[samples.length - 1].t) {
          samples.push(rec);
        } else {
          let i = samples.length - 1;
          while (i >= 0 && samples[i].t > t) i--;
          if (i >= 0 && samples[i].t === t) return false;   // duplicate — ignore
          samples.splice(i + 1, 0, rec);
        }
        while (samples.length > keep) samples.shift();
        return true;
      }

      // Extrapolation cannot exceed this share of the car's speed, however hard
      // the last two packets say it was braking. Two samples a jitter apart can
      // imply an absurd rate; at a real 22 m/s^2 a car at 70 m/s sheds 8 % over a
      // 250 ms window and one at 20 m/s sheds 27 %, so a third is generous for
      // the honest case and still bounds the pathological one.
      const EXTRAP_SLOW_MAX = 0.35;

      // `decelMs2` is the OBSERVED rate from the last two packets (0 when the car
      // is not braking, or when there is only one sample). Observed rather than a
      // constant on purpose: a literal here would be a second copy of BRAKE that
      // has to be kept in step with the physics AND re-derived against PACE,
      // which is exactly the coupling `aStd` exists to prevent. The wire already
      // carries the answer, scaled correctly, for free.
      function advance(st, dtMs, out, decelMs2) {
        const dt = dtMs / 1000;
        // F_BRAKE WAS DECODED AND THROWN AWAY. `braking` rides in every packet
        // and nothing read it: s advanced at a flat st.speed, so a car standing
        // on the brakes was predicted to keep coming. predict() extrapolates by
        // delayMs EVERY frame, not only during a stall, so the follower's
        // predicted contact pose overshot continuously — the documented
        // last-millisecond-brake asymmetry from real P2P racing netcode.
        let v = st.speed, ds;
        const a = decelMs2 > 0 && v > 0 ? decelMs2 : 0;
        if (a > 0) {
          // Never predict past the stop, and never past the cap above.
          const te = Math.min(dt, v / a, (EXTRAP_SLOW_MAX * v) / a);
          ds = v * te - 0.5 * a * te * te + Math.max(0, v - a * te) * (dt - te);
          v = Math.max(0, v - a * te);
        } else {
          ds = v * dt;
        }
        const raw = st.s + ds, laps = Math.floor(raw / total);
        // Spread the source rather than re-listing its fields: a packet that
        // grows a field would otherwise silently lose it HERE ONLY, i.e. only
        // while extrapolating — invisible to any test that never stalls the
        // buffer. Only s moves; x is deliberately not extrapolated.
        const o = Object.assign(out || {}, st);
        o.s = raw - laps * total;
        // Speed follows s, because they are one claim about the same car: the
        // contact solver reads this as _nSpd to decide who is closing on whom,
        // and a pose that slowed with a speed that did not is a pair of
        // predictions that disagree.
        o.speed = v;
        o.lap = Number.isFinite(st.lap) ? st.lap + laps : st.lap;
        o.extrapolated = true;
        return o;
      }

      function blend(a, b, u, out) {
        const o = Object.assign(out || {}, u < 0.5 ? a : b);
        o.x = a.x + (b.x - a.x) * u;
        o.head = lerpWrapped(a.head, b.head, u, TAU);
        o.speed = a.speed + (b.speed - a.speed) * u;
        o.extrapolated = false;
        const d = M4.wrapDelta(b.s - a.s, total);   // shortest way round (js/core/mat4.js)
        const raw = a.s + d * u, laps = Math.floor(raw / total);
        o.s = raw - laps * total;
        if (Number.isFinite(a.lap)) o.lap = a.lap + laps;
        return o;
      }

      // `out` (optional) is a caller-owned scratch object reused per remote per
      // frame — sample/predict run for every rival every tick, and the fresh
      // copies were the netplay loop's steadiest allocation. Omitted, each call
      // returns a fresh object exactly as before. Assign-over-scratch relies on
      // the packet shape being stable within a session (it is; the protocol is
      // versioned) — fields never vanish mid-session, so no stale-key sweep.
      function at(target, out) {
        if (!samples.length) return null;
        // Callers normally pass full performance.now(); loopback/tests may pass
        // the modulo value.  Compare in the sample's epoch in either case.
        target = tickNear(target, samples[samples.length - 1].t);
        const newest = samples[samples.length - 1];
        if (target >= newest.t) {
          // Observed deceleration, only while the wire says the brakes are on.
          // Gating on the flag matters: without it a momentary dip between two
          // packets would be extrapolated as if it were sustained.
          let decel = 0;
          if (newest.braking && samples.length > 1) {
            const prev = samples[samples.length - 2];
            const dts = (newest.t - prev.t) / 1000;
            if (dts > 0.001 && Number.isFinite(prev.speed) && Number.isFinite(newest.speed)) {
              const d = (prev.speed - newest.speed) / dts;
              if (d > 0) decel = d;
            }
          }
          return advance(newest, Math.min(target - newest.t, maxExtrapMs), out, decel);
        }
        const oldest = samples[0];
        if (target <= oldest.t) { const o = Object.assign(out || {}, oldest); o.extrapolated = false; return o; }
        for (let i = samples.length - 1; i > 0; i--) {
          const a = samples[i - 1], b = samples[i];
          if (target >= a.t && target <= b.t) {
            const span = b.t - a.t;
            // A multi-second hole is not a publish interval: blending walks the
            // car back along the gap the moment the next pose lands. Snap to the
            // newer sample so recovery is a teleport, not a slide (#3288).
            if (span > maxInterpGapMs) {
              const o = Object.assign(out || {}, b);
              o.extrapolated = false;
              return o;
            }
            return blend(a, b, span > 0 ? (target - a.t) / span : 0, out);
          }
        }
        const o = Object.assign(out || {}, newest); o.extrapolated = false; return o;
      }

      function sample(nowMs, out) {
        const target = nowMs - delayMs;
        // Increasing the buffer during a burst may hold a pose, never rewind it.
        presentedAt = opts.adaptive ? Math.max(presentedAt, target) : target;
        return at(presentedAt, out);
      }

      return {
        push, sample,
        // Where the rival actually IS, as opposed to where it is DRAWN. Contact
        // must be resolved against this: sample() deliberately returns the pose
        // delayMs in the past, and hitting a car where it was 100 ms ago is a
        // phantom collision at one end and a missed one at the other. Same code
        // path, just without the delay — so it extrapolates along the road and is
        // bounded exactly as sample() is.
        predict: (nowMs, out) => at(nowMs, out),
        size: () => samples.length,
        newest: () => (samples.length ? samples[samples.length - 1] : null),
        oldest: () => (samples.length ? samples[0] : null),
        timing: () => ({ delayMs, jitterMs: jitter, lagMs: lag, adaptive: !!opts.adaptive }),
        // The time the last sample() posed — what a relay must stamp that pose with.
        presentedAt: () => presentedAt,
        clear: () => { samples = []; delayMs = baseDelay; jitter = 0; lag = 0; interval = 0; lastArrival = null; lastTick = null; presentedAt = -Infinity; },
      };
    }

    return createInterp(opts);
  }
  return { create };
})();
Object.freeze(NetInterp);
