/* Apex 26 — LOCALIZED RAIN (RainCells): a shower that covers a WINDOW of the lap and drifts along it, instead of
 * F1 24/25's uniform "blanket" rain. Pure maths — no G, no clock of its own: WeatherArc (js/race/weather-arc.js)
 * owns the arc and hands this module its constants and the shared race clock.
 *
 * WHY LOCAL. Spa's microclimate leaves one part of the 7 km lap wet and another dry
 * (https://www.grandprix247.com/formula-1-news/rain-over-spa-francochamps-could-turn-the-belgian-grand-prix-into-a-lottery-f1-preview);
 * Red Bull Ring FP2 2016 was drying from T2 while T9 was still very wet, and F1's forecaster (Ubimet) can miss a
 * single cell by ~500 m (https://www.formula1.com/en/latest/features/2016/9/how-weather-forecasting-works-in-f1.html).
 * Notes: docs/notes/WEATHER-ROADMAP-2026-10-14.md.
 *
 * THE CELL is { c0, h, v, life, total }: its centre starts at lap fraction c0, it covers ±h of the lap, drifts at
 * v m/s along the arc coordinate (signed) and rains for `life` seconds of the arc, after which every segment dries.
 * It is drawn ONLY from data both peers of a friend race already share — the weather the race starts on, the
 * HOST's MIXED plan {to, dur} (it rides the lobby's wxArc) and the built track's length — so a guest derives the
 * same cell with no lobby change. Solo, `dur` is drawn from the sim seed (WeatherArc.planFor), so the cell is
 * deterministic per seed too. A third of MIXED plans that WET the road go local (LOCAL_ODDS); the rest stay global.
 *
 * THE ROAD per SEGMENT keeps WeatherArc's exact closed-form first-order lag (τ 8 s wetting / 36 s drying): a
 * segment under the cell chases the arc's linear target ramp, one outside it chases the dry base. The cell's edges
 * move linearly, so the instants a segment's centre enters or leaves the window are solved exactly and the lag is
 * integrated piecewise in closed form between them — a pure function of the clock, identical on every peer and at
 * every frame rate. With the cell covering the whole lap (h ≥ 0.5) it is one piece and equals wetAt to rounding.
 */
const RainCells = (function () {
  "use strict";

  const SEGS = 24;           // the lap's wetness grid: ~290 m segments at Spa, ~140 m at Monaco
  const LOCAL_ODDS = 0.35;   // the share of road-wetting MIXED plans that arrive as a local shower

  // A 32-bit FNV-1a of the key → [0, 1) (forecast.js h01's mixer). No Math.random, no wall clock.
  function h01(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }

  /** The cell a MIXED plan brings, or null for the global (blanket) behaviour. `wetOf` maps a weather to its
   *  wetness (WeatherArc's own). Only a plan that WETS the road can be local: a drying arc stays global. */
  function forPlan(from, to, dur, total, wetOf) {
    if (!(total > 0) || !(dur > 0) || !(wetOf(to) > wetOf(from))) return null;
    const key = [from, to, dur | 0, Math.round(total)].join("|");
    if (h01(key + "|local") >= LOCAL_ODDS) return null;
    const width = 0.22 + 0.20 * h01(key + "|w");                   // 22–42 % of the lap under the cloud
    const speed = 5 + 8 * h01(key + "|v");                          // 5–13 m/s, a convective cell's drift
    return {
      c0: h01(key + "|c"), h: width / 2,
      v: (h01(key + "|d") < 0.5 ? -1 : 1) * speed,
      life: Math.round(dur + 90 + 240 * h01(key + "|l")),          // rains past the ramp, then passes
      total,
    };
  }

  /** Is lap fraction `frac` under the cell `t` s into the arc? No cell = the whole lap (global rain). */
  function covered(cell, frac, t) {
    if (!cell) return true;
    if (t >= cell.life) return false;
    if (cell.h >= 0.5) return true;
    let d = frac - (cell.c0 + cell.v * t / cell.total);
    d -= Math.round(d);
    return Math.abs(d) <= cell.h;
  }

  /** The instants in (0, min(T, life)) at which `frac` enters or leaves the cell, ascending. The window's
   *  edges move linearly, so q(t) = frac − c0 + h − r·t is covered iff frac(q) < 2h; the flips are where q
   *  crosses an integer or an integer + 2h. */
  function flips(cell, frac, T, out) {
    if (!cell || cell.h >= 0.5) return out;
    const r = cell.v / cell.total, end = Math.min(T, cell.life);
    if (!r || !(end > 0)) return out;
    const q0 = frac - cell.c0 + cell.h, q1 = q0 - r * end;
    const lo = Math.min(q0, q1), hi = Math.max(q0, q1);
    for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
      for (let j = 0; j < 2; j++) {
        const b = k + j * 2 * cell.h;
        if (b > lo && b < hi) out.push((q0 - b) / r);
      }
    }
    return out;
  }

  /** Road wetness at lap fraction `frac`, `t` s into an arc. p = { rs (this segment's wetness at the arc's
   *  start), w1 (the destination's wetness), dur, wOut (what an uncovered segment chases), cell, tauW, tauD }.
   *  Under the cell the target is the arc's ramp rs → w1 over dur (then w1); outside it, wOut. Each piece is
   *  the exact solution of dw/dt = (target − w)/τ, wetting at tauW and drying at tauD — WeatherArc.wetAt's rule. */
  const _cuts = [];
  function segWet(p, frac, t) {
    if (!(t > 0)) return p.rs;
    const cuts = _cuts; cuts.length = 0;
    flips(p.cell, frac, t, cuts);
    if (p.dur < t) cuts.push(p.dur);
    if (p.cell && p.cell.life < t) cuts.push(p.cell.life);
    cuts.sort((a, b) => a - b);
    cuts.push(t);
    const s = (p.w1 - p.rs) / p.dur;
    let w = p.rs, ta = 0;
    for (let i = 0; i < cuts.length; i++) {
      const tb = cuts[i];
      if (!(tb > ta)) continue;
      const mid = (ta + tb) / 2;
      const cov = covered(p.cell, frac, mid);
      if (cov && mid < p.dur) {
        const tau = s >= 0 ? p.tauW : p.tauD;
        const Ra = p.rs + s * ta, Rb = p.rs + s * tb;
        w = Rb - s * tau + (w - Ra + s * tau) * Math.exp(-(tb - ta) / tau);
      } else {
        const T = cov ? p.w1 : p.wOut, tau = T >= w ? p.tauW : p.tauD;
        w = T + (w - T) * Math.exp(-(tb - ta) / tau);
      }
      ta = tb;
    }
    return w;
  }

  /** The centre of segment i as a lap fraction. */
  const segFrac = (i, n) => (i + 0.5) / (n || SEGS);

  /** Linear read of a segment grid at lap fraction `frac` (between segment centres, wrapping), so grip has no
   *  step at a segment edge. */
  function sample(segs, frac) {
    const n = segs.length;
    let x = (frac - Math.floor(frac)) * n - 0.5;
    const i0 = Math.floor(x), f = x - i0;
    const a = segs[(i0 % n + n) % n], b = segs[((i0 + 1) % n + n) % n];
    return a + (b - a) * f;
  }

  /** Per-sector picture: the mean wetness of each timing sector and whether the cell is over any of it now.
   *  `bounds` = the circuit's two sector splits as lap fractions (def.sectors), else thirds. 1-based sectors. */
  function sectors(segs, cell, t, bounds) {
    const b = bounds && bounds.length === 2 ? bounds : [1 / 3, 2 / 3];
    const out = [0, 1, 2].map((k) => ({ sector: k + 1, wet: 0, raining: false, n: 0 }));
    for (let i = 0; i < segs.length; i++) {
      const fr = segFrac(i, segs.length), k = fr < b[0] ? 0 : fr < b[1] ? 1 : 2, o = out[k];
      o.wet += segs[i]; o.n++;
      if (cell && covered(cell, fr, t)) o.raining = true;
    }
    for (const o of out) { o.wet = o.n ? o.wet / o.n : 0; delete o.n; }
    return out;
  }

  return { SEGS, LOCAL_ODDS, forPlan, covered, flips, segWet, segFrac, sample, sectors, h01 };
})();
Object.freeze(RainCells);
