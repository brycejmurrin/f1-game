/* Apex 26 — telemetry channels, lane identities and GPS/distance interpolation. */
const DataTelemetryModel = (function () {
  "use strict";

  const clamp = M4.clamp;                     // shared scalar helper (js/core/mat4.js)

  function cumDist(car) {
    const t = [], d = [];
    let acc = 0;
    for (let i = 0; i < car.length; i++) {
      if (i > 0) {
        const dt = car[i].t - car[i - 1].t;
        const v = (car[i].speed || 0) / 3.6;   // km/h -> m/s
        acc += v * dt;
      }
      t.push(car[i].t); d.push(acc);
    }
    return { t: t, d: d };
  }
  function interp(xs, ys, x) {
    if (!xs.length) return 0;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; }
    const x0 = xs[lo - 1], x1 = xs[lo], f = (x - x0) / ((x1 - x0) || 1);
    return ys[lo - 1] + (ys[lo] - ys[lo - 1]) * f;
  }
  function distAtT(cum, t) { return interp(cum.t, cum.d, t); }
  function timeAtDist(cum, dist) { return interp(cum.d, cum.t, dist); }

  function lerpLoc(a, b, f) {
    if (!b) return a;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  function dateAtT(car, t) {
    if (!car || !car.length) return null;
    const n = car.length;
    if (t <= car[0].t) return +car[0].date;
    if (t >= car[n - 1].t) return +car[n - 1].date;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (car[mid].t <= t) lo = mid; else hi = mid;
    }
    const span = car[hi].t - car[lo].t;
    const f = span > 0 ? (t - car[lo].t) / span : 0;
    return +car[lo].date + f * (+car[hi].date - +car[lo].date);
  }
  // inverse of dateAtT: lap-time for a wall-clock date
  function tAtDate(car, date) {
    if (!car || !car.length) return 0;
    const n = car.length;
    if (date <= +car[0].date) return car[0].t;
    if (date >= +car[n - 1].date) return car[n - 1].t;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (+car[mid].date <= date) lo = mid; else hi = mid;
    }
    const span = +car[hi].date - +car[lo].date;
    const f = span > 0 ? (date - +car[lo].date) / span : 0;
    return car[lo].t + f * (car[hi].t - car[lo].t);
  }

  function locAt(view, tel, t) {
    const own = !!(tel.loc && tel.loc.length);
    const loc = own ? tel.loc : (view.primary.loc || []);
    if (!loc.length) return null;
    if (!own) {
      const ownMax = (tel.car && tel.car.length) ? tel.car[tel.car.length - 1].t : 0;
      const f = clamp(t / (ownMax || view.tMax || 1), 0, 1) * (loc.length - 1);
      const i = Math.floor(f);
      return lerpLoc(loc[i], loc[i + 1], f - i);
    }
    const target = dateAtT(tel.car, t);
    if (target === null) return loc[0];
    const n = loc.length;
    if (target <= +loc[0].date) return loc[0];
    if (target >= +loc[n - 1].date) return loc[n - 1];
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (+loc[mid].date <= target) lo = mid; else hi = mid;
    }
    const span = +loc[hi].date - +loc[lo].date;
    let f = span > 0 ? (target - +loc[lo].date) / span : 0;
    // WHERE BETWEEN THE TWO FIXES? The fixes themselves are ground truth — the
    // car really was there, at those instants — so the dot stays anchored to
    // them and never drifts. What is NOT true is that it crossed the ~20m gap at
    // a constant rate: braking from 300 into a hairpin it covers most of that
    // gap in the first third of the interval. So take the fraction from the
    // car's own DISTANCE TRAVELLED (its speed trace integrated, the same series
    // the delta chart runs on) rather than from elapsed time.
    // Every lane already carries .cum (buildTelemetryView computes it for the
    // delta chart); the fallback only covers a lane locAt sees first.
    const cum = tel.cum || (tel.cum = cumDist(tel.car || []));
    if (cum.t.length > 1) {
      const dA = distAtT(cum, tAtDate(tel.car, +loc[lo].date));
      const dB = distAtT(cum, tAtDate(tel.car, +loc[hi].date));
      if (dB > dA) f = clamp((distAtT(cum, t) - dA) / (dB - dA), 0, 1);
    }
    return lerpLoc(loc[lo], loc[hi], f);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  const STRAY_MARGIN = 0.35;
  function dropStrays(loc) {
    if (!loc || loc.length < 24) return loc || [];   // too few to judge a distribution
    const xs = loc.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
    const ys = loc.map(function (p) { return p.y; }).sort(function (a, b) { return a - b; });
    const x0 = quantile(xs, 0.02), x1 = quantile(xs, 0.98);
    const y0 = quantile(ys, 0.02), y1 = quantile(ys, 0.98);
    const mx = ((x1 - x0) || 1) * STRAY_MARGIN, my = ((y1 - y0) || 1) * STRAY_MARGIN;
    const kept = loc.filter(function (p) {
      return p.x >= x0 - mx && p.x <= x1 + mx && p.y >= y0 - my && p.y <= y1 + my;
    });
    return kept.length >= loc.length * 0.9 ? kept : loc;
  }
  function locBounds(loc) {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < (loc ? loc.length : 0); i++) {
      if (loc[i].x < minx) minx = loc[i].x; if (loc[i].x > maxx) maxx = loc[i].x;
      if (loc[i].y < miny) miny = loc[i].y; if (loc[i].y > maxy) maxy = loc[i].y;
    }
    if (!isFinite(minx)) { minx = 0; maxx = 1; miny = 0; maxy = 1; }
    return { minx: minx, miny: miny, spanx: (maxx - minx) || 1, spany: (maxy - miny) || 1 };
  }
  function gapLimitMs(loc) {
    if (!loc || loc.length < 8) return Infinity;
    const dts = [];
    for (let i = 1; i < loc.length; i++) {
      const dt = loc[i].date - loc[i - 1].date;
      if (isFinite(dt) && dt > 0) dts.push(dt);
    }
    if (dts.length < 4) return Infinity;
    dts.sort(function (a, b) { return a - b; });
    return Math.max(quantile(dts, 0.5) * 8, 1500);   // 8x the median cadence, min 1.5 s
  }
  function isGap(loc, i, limit) {
    if (!isFinite(limit)) return false;
    const dt = loc[i].date - loc[i - 1].date;
    return isFinite(dt) && dt > limit;
  }

  // Four lanes remain selectable for a useful field overview. Only the first
  // two receive full channel traces; lanes three and four are intentionally
  // speed-marker comparisons on the primary chart (and remain visible in the
  // map/gauge lane board). Naming that distinction in the DOM keeps the picker
  // affordance honest without discarding the extra-driver comparison.
  function laneRole(i) {
    return i === 0 ? "PRIMARY TRACE" : i === 1 ? "COMPARISON TRACE" : "SPEED MARKER";
  }

  function summaryTime(t) {
    if (typeof t !== "number" || !isFinite(t) || t < 0) return "—";
    const cs = Math.round(t * 100), m = Math.floor(cs / 6000), s = (cs - m * 6000) / 100;   // round first: never "1:60.00"
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  }

  // A signed delta, "+0.12" / "-0.12": the sign comes from the ROUNDED value,
  // so a delta of -0.0003 reads "+0.00", never "-0.00".
  function signed(v, digits) {
    const r = +v.toFixed(digits);
    return (r >= 0 ? "+" : "") + r.toFixed(digits);
  }

  function summaryValue(v, suffix) {
    return (typeof v === "number" && isFinite(v)) ? String(Math.round(v)) + suffix : "—";
  }

  function dcode(d) { return d.code || ("#" + d.num); }
  function sessionShort(meta) {
    if (!meta) return "";
    const name = String(meta.name || meta.type || "");
    const type = (name + " " + String(meta.type || "")).toLowerCase();
    if (type.indexOf("sprint") !== -1) return type.indexOf("qual") !== -1 ? "SQ" : "SPR";
    if (type.indexOf("qual") !== -1) return "Q";
    if (type.indexOf("race") !== -1) return "R";
    const m = name.match(/(\d+)/);
    if (type.indexOf("practice") !== -1) return "P" + (m ? m[1] : "");
    return name.slice(0, 3).toUpperCase();
  }
  // OpenF1 DRS codes: 10/12/14 = wing open, everything else closed/eligible.
  function drsOpen(v) { return v === 10 || v === 12 || v === 14; }

  const CHANNELS = [
    { id: "speed",    label: "SPEED",    color: "#39d0ff", w: 2,   norm: "speed", get: function (c) { return c.speed; },    fmt: function (v) { return Math.round(v) + " km/h"; } },
    { id: "throttle", label: "THR",      color: "#3fb950", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.throttle; }, fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "brake",    label: "BRAKE",    color: "#ff4d4d", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.brake; },    fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "gear",     label: "GEAR",     color: "#f6d200", w: 1.5, lo: 0, hi: 8, step: true, get: function (c) { return c.gear; }, fmt: function (v) { return v ? "G" + v : "N"; } },
    { id: "rpm",      label: "RPM",      color: "#c084fc", w: 1.5, norm: "rpm", get: function (c) { return c.rpm; }, fmt: function (v) { return Math.round(v); } },
    { id: "drs",      label: "DRS",      color: "#00e0c0", w: 3, lo: 0, hi: 1.1, step: true, get: function (c) { return c.drs == null ? null : (drsOpen(c.drs) ? 1 : null); }, fmt: function (v) { return v ? "OPEN" : "—"; } }
  ];

  const PADL = 36, PADR = 8, PADY = 6;
  function chartX(view, t, W) { return PADL + (t / view.tMax) * (W - PADL - PADR); }
  function chanRaw(ch, c) {
    const v = ch.get(c);
    return (v == null || isNaN(v)) ? null : v;
  }
  function chanNorm(ch, c, view) {
    const v = chanRaw(ch, c);
    if (v === null) return null;
    if (ch.norm === "speed") return clamp(v / view.speedMax, 0, 1);
    if (ch.norm === "rpm") return clamp(v / view.rpmMax, 0, 1);
    return clamp((v - ch.lo) / (ch.hi - ch.lo), 0, 1);
  }
  function sampleAt(car, t) {
    if (!car || !car.length) return null;
    let lo = 0, hi = car.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (car[mid].t < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(car[lo - 1].t - t) < Math.abs(car[lo].t - t)) lo--;
    return car[lo];
  }

  function create({ findTeam }) {
    function driverColor(d) {
      return DataTabUtils.driverColor(d, findTeam, [0.6, 0.6, 0.6]);
    }

    function laneColors(entries) {
      const seen = {};
      return entries.map(function (e) {
        let base = driverColor(e.d || e);
        const key = base.map(function (v) { return Math.round(v * 16); }).join(",");
        const n = seen[key] || 0; seen[key] = n + 1;
        if (n > 0) {
          const f = Math.min(0.66, n * 0.30);   // lighten each repeat of a colour
          base = [base[0] * (1 - f) + f, base[1] * (1 - f) + f, base[2] * (1 - f) + f];
        }
        return base;
      });
    }
    return { driverColor, laneColors };
  }

  return { create, clamp, laneRole, summaryTime, signed, summaryValue, dcode, sessionShort, drsOpen,
           CHANNELS, PADL, PADR, PADY, chartX, chanRaw, chanNorm, sampleAt, cumDist,
           distAtT, timeAtDist, locAt, dropStrays, locBounds, gapLimitMs, isGap };
})();
Object.freeze(DataTelemetryModel);
