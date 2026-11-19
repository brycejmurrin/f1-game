const RainCells = (function () {
  "use strict";

  const SEGS = 24;
  const LOCAL_ODDS = 0.35;

  function h01(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }

  function forPlan(from, to, dur, total, wetOf) {
    if (!(total > 0) || !(dur > 0) || !(wetOf(to) > wetOf(from))) return null;
    const key = [from, to, dur | 0, Math.round(total)].join("|");
    if (h01(key + "|local") >= LOCAL_ODDS) return null;
    const width = 0.22 + 0.20 * h01(key + "|w");
    const speed = 5 + 8 * h01(key + "|v");
    return {
      c0: h01(key + "|c"), h: width / 2,
      v: (h01(key + "|d") < 0.5 ? -1 : 1) * speed,
      life: Math.round(dur + 90 + 240 * h01(key + "|l")),
      total,
    };
  }

  function covered(cell, frac, t) {
    if (!cell) return true;
    if (t >= cell.life) return false;
    if (cell.h >= 0.5) return true;
    let d = frac - (cell.c0 + cell.v * t / cell.total);
    d -= Math.round(d);
    return Math.abs(d) <= cell.h;
  }

  function strength(cell, frac, t) {
    if (!cell) return 1;
    if (t >= cell.life) return 0;
    const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    let edge = 1;
    if (cell.h < 0.5) {
      let d = frac - (cell.c0 + cell.v * t / cell.total);
      d -= Math.round(d);
      edge = smooth((cell.h - Math.abs(d)) / Math.max(0.001, Math.min(0.02, cell.h * 0.2)));
    }
    return edge * smooth((cell.life - t) / Math.max(1, Math.min(10, cell.life * 0.1)));
  }

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

  const segFrac = (i, n) => (i + 0.5) / (n || SEGS);

  function sample(segs, frac) {
    const n = segs.length;
    let x = (frac - Math.floor(frac)) * n - 0.5;
    const i0 = Math.floor(x), f = x - i0;
    const a = segs[(i0 % n + n) % n], b = segs[((i0 + 1) % n + n) % n];
    return a + (b - a) * f;
  }

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

  return { SEGS, forPlan, strength, segWet, segFrac, sample, sectors, h01 };
})();
Object.freeze(RainCells);
