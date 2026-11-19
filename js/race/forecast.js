const Forecast = (function () {
  "use strict";

  const TAU_WET = 8, TAU_DRY = 36;
  const ERR_FRAC = 0.10, ERR_MIN = 20;
  const ERR_CAP = 0.5;
  const CONF_FLOOR = 0.35, CONF_SPAN = 0.6, CONF_TAU = 300;
  const WET_OF = { dry: 0, overcast: 0, fog: 0, wet: 0.5, rain: 1, storm: 1 };

  const hasTM = () => typeof TyreModel !== "undefined" && !!TyreModel && !!TyreModel.treadFor;
  function wetOf(w) {
    if (w in WET_OF && w !== "storm" && hasTM() && TyreModel.wetness) return TyreModel.wetness(w, null);
    return WET_OF[w] || 0;
  }
  const treadOf = (w) => hasTM() ? TyreModel.treadFor(null, w) : (w >= 0.72 ? 2 : w >= 0.25 ? 1 : 0);

  function wetAt(a, e) {
    const w0 = typeof a.w0 === "number" ? a.w0 : wetOf(a.from);
    if (!(e > 0)) return w0;
    const w1 = wetOf(a.to), dur = Math.max(1, a.dur || 60), s = (w1 - w0) / dur, tau = s >= 0 ? TAU_WET : TAU_DRY;
    const ramp = (u) => w0 + s * u - s * tau * (1 - Math.exp(-u / tau));
    if (e <= dur) return ramp(e);
    const wE = ramp(dur);
    return w1 + (wE - w1) * Math.exp(-(e - dur) / (w1 >= wE ? TAU_WET : TAU_DRY));
  }

  const KINDS = {
    rain: { what: "rain starts", tread: 1 },
    heavy: { what: "heavy rain", tread: 2 },
    easing: { what: "easing", tread: 1 },
    drying: { what: "drying", tread: 0 },
  };

  const _tl = new WeakMap();
  function timeline(a) {
    if (!a || !a.to) return [];
    const w0 = typeof a.w0 === "number" ? a.w0 : wetOf(a.from);
    const sig = [a.from, a.to, a.dur, w0, a.wetIn, !!a.cell].join("|");
    const hit = _tl.get(a);
    if (hit && hit.sig === sig) return hit.out;
    const w1 = wetOf(a.to), t0 = treadOf(w0), t1 = treadOf(w1), out = [];
    const hi = Math.max(1, a.dur || 60) + 20 * TAU_DRY;
    const first = (pred) => {
      let lo = 0, h = hi;
      for (let i = 0; i < 40; i++) { const m = (lo + h) / 2; if (pred(treadOf(wetAt(a, m)))) h = m; else lo = m; }
      return h;
    };
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

  function h01(str) { return RainCells.h01(str); }
  function errBound(lead) {
    if (!(lead > 0)) return 0;
    return Math.min(ERR_CAP * lead, Math.max(ERR_MIN, ERR_FRAC * lead));
  }
  function confidenceFor(lead) {
    const c = CONF_FLOOR + CONF_SPAN * Math.exp(-Math.max(0, lead) / CONF_TAU);
    return Math.round(c * 20) / 20;
  }

  function fmtLead(s) {
    if (s < 90) return "~" + Math.max(10, Math.round(s / 10) * 10) + " s";
    return "~" + (s < 300 ? Math.round(s / 30) / 2 : Math.round(s / 60)) + " min";
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
      const r = 2 * h01(base + "|" + ev.kind) - 1, u = (r < 0 ? -1 : 1) * (0.25 + 0.75 * Math.abs(r));
      const bound = errBound(lead);
      const said = Math.max(1, lead + u * bound);
      events.push({
        kind: ev.kind, what: a.to === "storm" && ev.kind === "heavy" ? "heavy rain/storm" : KINDS[ev.kind].what,
        at: Math.round(raceT + said), in: Math.round(said),
        lap: lapS > 0 ? Math.max(1, lap + Math.floor((lapPos * lapS + said) / lapS)) : null,
        confidence: confidenceFor(lead), spread: Math.round(bound), tread: KINDS[ev.kind].tread,
      });
    }
    const wetNow = a.cell && Number.isFinite(o.wetNow) ? o.wetNow : wetAt(a, elapsed);
    const where = Array.isArray(o.where) && o.where.length ? o.where.slice() : null;
    const text = textOf(events, a, wetNow) + (where ? " · rain at sector " + where.join(" & ") : "");
    return { events, text, wetNow, treadNow: treadOf(wetNow), to: a.to, from: a.from, where };
  }

  let latest = null;
  function publish(f) { latest = f || null; }
  function current() { return latest; }

  return { compute, timeline, wetAt, errBound, confidenceFor, publish, current, TAU_WET, TAU_DRY };
})();
Object.freeze(Forecast);
