"use strict";

const NetInterp = (function () {
  function create(opts, env) {
    const TAU = env.TAU;
    const MAX_AHEAD_MS = env.MAX_AHEAD_MS;
    const MAX_INTERP_GAP_MS = env.MAX_INTERP_GAP_MS;
    const dropped = env.dropped;
    function lerpWrapped(a, b, u, period) {
      const d = M4.wrapDelta(b - a, period);
      const v = a + d * u;
      return ((v % period) + period) % period;
    }

    const MAX_DELAY_MS = 400, MAX_LAG_MS = 400, LAG_MARGIN_MS = 20;
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
      const total = opts.total || 1;
      let delayMs = opts.delayMs != null ? opts.delayMs : 100;
      const baseDelay = delayMs;
      let jitter = 0, lag = 0, interval = 0, lastArrival = null, lastTick = null, presentedAt = -Infinity;
      const maxExtrapMs = opts.maxExtrapMs != null ? opts.maxExtrapMs : 250;
      const maxInterpGapMs = opts.maxInterpGapMs != null ? opts.maxInterpGapMs : MAX_INTERP_GAP_MS;
      const keep = opts.keep || 32;
      const samples = [];
      let head = 0;

      const maxAheadMs = opts.maxAheadMs != null ? opts.maxAheadMs : MAX_AHEAD_MS;

      function insert(t, st, arrivalMs, own) {
        if (!Number.isFinite(t)) return false;
        const reference = Number.isFinite(arrivalMs) ? arrivalMs
          : (samples.length > head ? samples[samples.length - 1].t : null);
        t = tickNear(t, reference);
        if (Number.isFinite(arrivalMs) && t - arrivalMs > maxAheadMs) { dropped("tick ahead of clock"); return false; }
        if (opts.adaptive && Number.isFinite(arrivalMs) && (lastTick == null || t > lastTick)) {
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
        let pos = samples.length;
        if (samples.length > head && t <= samples[samples.length - 1].t) {
          let i = samples.length - 1;
          while (i >= head && samples[i].t > t) i--;
          if (i >= head && samples[i].t === t) return false;
          pos = i + 1;
        }
        let rec;
        if (own) { rec = st; rec.t = t; } else rec = Object.assign({ t }, st);
        if (pos === samples.length) samples.push(rec);
        else samples.splice(pos, 0, rec);
        if (samples.length - head > keep) head = samples.length - keep;
        if (head >= keep) {
          samples.copyWithin(0, head);
          samples.length -= head;
          head = 0;
        }
        return true;
      }
      const push = (t, st, arrivalMs) => insert(t, st, arrivalMs, false);
      const adopt = (t, st, arrivalMs) => insert(t, st, arrivalMs, true);

      const EXTRAP_SLOW_MAX = 0.35;

      function advance(st, dtMs, out, decelMs2) {
        const dt = dtMs / 1000;
        let v = st.speed, ds;
        const a = decelMs2 > 0 && v > 0 ? decelMs2 : 0;
        if (a > 0) {
          const te = Math.min(dt, v / a, (EXTRAP_SLOW_MAX * v) / a);
          ds = v * te - 0.5 * a * te * te + Math.max(0, v - a * te) * (dt - te);
          v = Math.max(0, v - a * te);
        } else {
          ds = v * dt;
        }
        const raw = st.s + ds, laps = Math.floor(raw / total);
        const o = Object.assign(out || {}, st);
        o.s = raw - laps * total;
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
        const d = M4.wrapDelta(b.s - a.s, total);
        const raw = a.s + d * u, laps = Math.floor(raw / total);
        o.s = raw - laps * total;
        if (Number.isFinite(a.lap)) o.lap = a.lap + laps;
        return o;
      }

      function at(target, out) {
        if (samples.length <= head) return null;
        target = tickNear(target, samples[samples.length - 1].t);
        const newest = samples[samples.length - 1];
        if (target >= newest.t) {
          let decel = 0;
          if (newest.braking && samples.length - head > 1) {
            const prev = samples[samples.length - 2];
            const dts = (newest.t - prev.t) / 1000;
            if (dts > 0.001 && Number.isFinite(prev.speed) && Number.isFinite(newest.speed)) {
              const d = (prev.speed - newest.speed) / dts;
              if (d > 0) decel = d;
            }
          }
          return advance(newest, Math.min(target - newest.t, maxExtrapMs), out, decel);
        }
        const oldest = samples[head];
        if (target <= oldest.t) { const o = Object.assign(out || {}, oldest); o.extrapolated = false; return o; }
        for (let i = samples.length - 1; i > head; i--) {
          const a = samples[i - 1], b = samples[i];
          if (target >= a.t && target <= b.t) {
            const span = b.t - a.t;
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
        presentedAt = opts.adaptive ? Math.max(presentedAt, target) : target;
        return at(presentedAt, out);
      }

      return {
        push, sample,
        adopt,
        predict: (nowMs, out) => at(nowMs, out),
        size: () => samples.length - head,
        newest: () => (samples.length > head ? samples[samples.length - 1] : null),
        oldest: () => (samples.length > head ? samples[head] : null),
        timing: () => ({ delayMs, jitterMs: jitter, lagMs: lag, adaptive: !!opts.adaptive }),
        presentedAt: () => presentedAt,
        clear: () => { samples.length = 0; head = 0; delayMs = baseDelay; jitter = 0; lag = 0; interval = 0; lastArrival = null; lastTick = null; presentedAt = -Infinity; },
      };
    }

    return createInterp(opts);
  }
  return { create };
})();
Object.freeze(NetInterp);
