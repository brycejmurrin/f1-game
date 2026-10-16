/* Apex 26 — WEATHER FORECAST (Forecast): what the pit wall KNOWS about a dynamic-weather race, as a timed,
 * located-in-laps statement with honest uncertainty. Pure: a WeatherArc arc (or the MIXED plan before the green)
 * + the race clock + an expected lap time in, a forecast object out. The engineer speaks it (js/race/engineer.js);
 * any UI reads Forecast.current().
 *
 * WHY TIMED, NOT A PERCENTAGE. F1's own forecaster (Ubimet) gives teams statements of WHEN rain arrives, where it
 * hits first and how much, to the minute, and still misses a single cell by ~500 m
 * (https://www.formula1.com/en/latest/features/2016/9/how-weather-forecasting-works-in-f1.html). Players ask the
 * same of a game: the timed information, not a %; GT7 answers with a live rain radar
 * (https://traxion.gg/gran-turismo-7-features-detailed-dynamic-weather-but-not-at-every-track/).
 * WHY IT CAN BE WRONG. iRacing's Tempest forecast is deliberately imperfect, and its uncertainty grows with the
 * lead time (https://www.iracing.com/?p=272386). So the STATED time here is the true time plus an error whose
 * bound grows with lead — ±10 % of the lead, never under ±20 s, and never more than half the lead so the call
 * cannot point into the past — drawn ONCE per (seed, arc, event): the stated lead then falls monotonically and
 * converges on the truth as the event approaches (d/dt of lead + u·bound is −1 − 0.1u < 0), so a re-read never
 * jumps backwards and the exact answer is only known when it is nearly here.
 *
 * DETERMINISM. The seed the caller passes is the sim seed solo (a replay says the same thing) and 0 in a friend
 * race, where the error is keyed off the HOST's plan alone (from/to/dur ride the lobby's wxArc), so both peers
 * hear the same forecast. Nothing here reads Math.random or a wall clock.
 *
 * THE ROAD MODEL is WeatherArc's own closed-form lag (js/race/weather-arc.js wetAt: τ 8 s wetting / 36 s drying),
 * mirrored here because that module exports no per-arc wetness accessor; tests/unit/forecast.test.mjs runs the
 * real weather-arc.js beside this one and fails on drift. A WeatherArc arc's own `wetIn` (the second the road
 * turns inter-wet) is used for the rain onset when present. Event thresholds are TyreModel.treadFor's
 * (0.25 inter, 0.72 full wet) — read-only, with the same numbers inline for a VM with no tyre model.
 */
const Forecast = (function () {
  "use strict";

  const TAU_WET = 8, TAU_DRY = 36;            // s — js/race/weather-arc.js TAU_WET / TAU_DRY (guarded by the test)
  const ERR_FRAC = 0.10, ERR_MIN = 20;       // the stated time's error bound: ±10 % of the lead, min ±20 s…
  const ERR_CAP = 0.5;                        // …but never more than half the lead (a call never points into the past)
  const CONF_FLOOR = 0.35, CONF_SPAN = 0.6, CONF_TAU = 300;   // confidence 0.95 at arrival → 0.35 far out
  // A future "storm" stage (another session adds it to weather-arc.js) is heavy rain for the road.
  const WET_OF = { dry: 0, overcast: 0, fog: 0, wet: 0.5, rain: 1, storm: 1 };

  const hasTM = () => typeof TyreModel !== "undefined" && !!TyreModel && !!TyreModel.treadFor;
  function wetOf(w) {
    if (w in WET_OF && w !== "storm" && hasTM() && TyreModel.wetness) return TyreModel.wetness(w, null);
    return WET_OF[w] || 0;
  }
  const treadOf = (w) => hasTM() ? TyreModel.treadFor(null, w) : (w >= 0.72 ? 2 : w >= 0.25 ? 1 : 0);

  /** Road wetness `e` s into arc `a` — weather-arc.js wetAt, verbatim maths. */
  function wetAt(a, e) {
    const w0 = typeof a.w0 === "number" ? a.w0 : wetOf(a.from);
    if (!(e > 0)) return w0;
    const w1 = wetOf(a.to), dur = Math.max(1, a.dur || 60), s = (w1 - w0) / dur, tau = s >= 0 ? TAU_WET : TAU_DRY;
    const ramp = (u) => w0 + s * u - s * tau * (1 - Math.exp(-u / tau));
    if (e <= dur) return ramp(e);
    const wE = ramp(dur);
    return w1 + (wE - w1) * Math.exp(-(e - dur) / (w1 >= wE ? TAU_WET : TAU_DRY));
  }

  // What each tread crossing is CALLED. Wetting crosses 0→1 (rain starts) and 1→2 (heavy); drying 2→1 (easing,
  // inters) and 1→0 (drying, slicks). `tread` is what TyreModel.treadFor wants once it has happened.
  const KINDS = {
    rain: { what: "rain starts", tread: 1 },
    heavy: { what: "heavy rain", tread: 2 },
    easing: { what: "easing", tread: 1 },
    drying: { what: "drying", tread: 0 },
  };

  /** The TRUE event times of an arc, in seconds into it — what the weather will actually do. Monotone within one
   *  arc (a linear ramp under a first-order lag), so each crossing is found once by bisection. */
  const _tl = new WeakMap();
  function timeline(a) {
    if (!a || !a.to) return [];
    const w0 = typeof a.w0 === "number" ? a.w0 : wetOf(a.from);
    const sig = [a.from, a.to, a.dur, w0, a.wetIn, !!a.cell].join("|");
    const hit = _tl.get(a);
    if (hit && hit.sig === sig) return hit.out;
    const w1 = wetOf(a.to), t0 = treadOf(w0), t1 = treadOf(w1), out = [];
    const hi = Math.max(1, a.dur || 60) + 20 * TAU_DRY;
    // First second at which pred(tread) holds; pred is monotone along the arc.
    const first = (pred) => {
      let lo = 0, h = hi;
      for (let i = 0; i < 40; i++) { const m = (lo + h) / 2; if (pred(treadOf(wetAt(a, m)))) h = m; else lo = m; }
      return h;
    };
    // A LOCAL SHOWER (js/race/rain-cells.js): tread advice follows the LAP MEAN, which this global mirror does
    // not model — so the only event is WeatherArc's own wetIn (the mean's inter crossing), when there is one.
    if (a.cell) {
      if (t0 < 1 && Number.isFinite(a.wetIn)) out.push({ kind: "rain", T: a.wetIn });
    } else if (t1 > t0) {
      if (t0 < 1) out.push({ kind: "rain", T: Number.isFinite(a.wetIn) ? a.wetIn : first((t) => t >= 1) });
      if (t1 >= 2) out.push({ kind: "heavy", T: first((t) => t >= 2) });
    } else if (t1 < t0) {
      if (t0 >= 2) out.push({ kind: "easing", T: first((t) => t <= 1) });
      if (t1 < 1) out.push({ kind: "drying", T: first((t) => t <= 0) });
    }
    _tl.set(a, { sig, out });
    return out;
  }

  // A 32-bit FNV-1a of the key → [0, 1). Deterministic on every peer and every replay.
  function h01(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }
  /** The ± bound on a statement `lead` seconds out. */
  function errBound(lead) {
    if (!(lead > 0)) return 0;
    return Math.min(ERR_CAP * lead, Math.max(ERR_MIN, ERR_FRAC * lead));
  }
  /** How sure the pit wall is of a call `lead` seconds out (0.05 steps, falls with lead). */
  function confidenceFor(lead) {
    const c = CONF_FLOOR + CONF_SPAN * Math.exp(-Math.max(0, lead) / CONF_TAU);
    return Math.round(c * 20) / 20;
  }

  function fmtLead(s) {
    if (s < 90) return "~" + Math.max(10, Math.round(s / 10) * 10) + " s";
    return "~" + (s < 300 ? Math.round(s / 30) / 2 : Math.round(s / 60)) + " min";   // half-minutes while it is close
  }
  function textOf(ev, a, now) {
    if (!ev.length) {
      const tr = treadOf(now);
      return tr >= 2 ? "Heavy rain — no change expected" : tr >= 1 ? "Wet track — no change expected" : "No rain expected";
    }
    const e = ev[0], lap = (x) => (x.lap != null ? " (lap " + x.lap + ")" : ""), pct = " — " + Math.round(e.confidence * 100) + "%";
    const storm = a.to === "storm";
    if (e.kind === "rain") {
      const h = ev[1] && ev[1].kind === "heavy" ? ev[1] : null;
      return "Rain expected in " + fmtLead(e.in) + lap(e)
        + (h ? ", " + (storm ? "storm" : "heavy") + " from" + (h.lap != null ? " ~lap " + h.lap : " " + fmtLead(h.in)) : "") + pct;
    }
    if (e.kind === "heavy") return (storm ? "Storm" : "Heavy rain") + " expected in " + fmtLead(e.in) + lap(e) + pct;
    if (e.kind === "easing") {
      const d = ev[1] && ev[1].kind === "drying" ? ev[1] : null;
      return "Rain easing in " + fmtLead(e.in) + lap(e) + (d && d.lap != null ? ", slicks from ~lap " + d.lap : "") + pct;
    }
    return "Track drying — slicks in " + fmtLead(e.in) + lap(e) + pct;
  }

  /** The forecast. o = {
   *    arc     the live WeatherArc arc ({from,to,dur,t,w0?,wetIn?}), or null;
   *    plan    the MIXED plan {to, dur} before the green (with `from`, the chip's weather) when no arc is armed;
   *    raceT   the shared race clock (s) — `at` is stated on it; defaults to the arc's own elapsed time;
   *    lapS    an expected lap time (s); lap / lapPos the car's lap and fraction through it, to place events;
   *    seed    the sim seed solo, 0 in a friend race; rainAt  an override for the rain onset (arc seconds);
   *    where   the sectors a local shower is over now (1-based), when the arc carries a rain cell;
   *    wetNow  the live lap-mean wetness, used in place of the global mirror for such an arc }.
   *  Returns null when nothing changes the weather (no arc, no plan — a stable race), else
   *  { events:[{kind, what, at, in, lap, confidence, spread, tread}], text, wetNow, treadNow }. */
  function compute(o) {
    o = o || {};
    let a = o.arc, elapsed;
    if (a && a.to) elapsed = Math.max(0, +a.t || 0);
    else if (o.plan && o.plan.to) { a = { from: o.from || "dry", to: o.plan.to, dur: o.plan.dur, t: 0 }; elapsed = 0; }
    else return null;
    const raceT = Number.isFinite(o.raceT) ? o.raceT : elapsed;
    const lapS = o.lapS > 0 ? o.lapS : 0;
    const lap = (o.lap | 0) || 0, lapPos = Math.min(1, Math.max(0, +o.lapPos || 0));
    const w0 = typeof a.w0 === "number" ? a.w0 : wetOf(a.from);
    const base = [o.seed >>> 0 || 0, a.from, a.to, Math.round(a.dur || 0), Math.round(w0 * 1000)].join("|");
    const events = [];
    for (const ev of timeline(a)) {
      const T = ev.kind === "rain" && Number.isFinite(o.rainAt) ? o.rainAt : ev.T;
      const lead = T - elapsed;
      if (!(lead > 0)) continue;
      // |u| >= 0.25: far out the stated time is never the true one by luck of the draw.
      const r = 2 * h01(base + "|" + ev.kind) - 1, u = (r < 0 ? -1 : 1) * (0.25 + 0.75 * Math.abs(r));
      const bound = errBound(lead);
      const said = Math.max(1, lead + u * bound);
      events.push({
        kind: ev.kind, what: a.to === "storm" && ev.kind === "heavy" ? "heavy rain/storm" : KINDS[ev.kind].what,
        at: Math.round(raceT + said), in: Math.round(said),
        lap: lapS > 0 ? Math.max(1, lap + Math.floor((lapPos * lapS + said) / lapS)) : null,   // the grid is lap 0; racing starts on 1
        confidence: confidenceFor(lead), spread: Math.round(bound), tread: KINDS[ev.kind].tread,
      });
    }
    // A local shower's road is a grid this mirror does not model: the caller passes the lap mean (o.wetNow).
    const wetNow = a.cell && Number.isFinite(o.wetNow) ? o.wetNow : wetAt(a, elapsed);
    // o.where: the sectors a local shower is over now (the engineer reads G.rainSectors) — "rain at sector 2".
    const where = Array.isArray(o.where) && o.where.length ? o.where.slice() : null;
    const text = textOf(events, a, wetNow) + (where ? " · rain at sector " + where.join(" & ") : "");
    return { events, text, wetNow, treadNow: treadOf(wetNow), to: a.to, from: a.from, where };
  }

  // The last forecast the local car's engineer computed: the read-only accessor for UI and tests.
  let latest = null;
  function publish(f) { latest = f || null; }
  function current() { return latest; }

  return { compute, timeline, wetAt, errBound, confidenceFor, publish, current, TAU_WET, TAU_DRY, ERR_FRAC, ERR_MIN };
})();
Object.freeze(Forecast);
