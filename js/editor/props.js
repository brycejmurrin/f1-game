/* Apex 26 — TrackDesignerProps: capped place/remove scenery props for custom
   tracks (slice H). Themes stay primary; this is a small authored list the
   designer palette writes into design.props and TrackThemes.sceneryFor dresses
   through the existing scenery api (grandstandEx, gantry, forestEdge,
   waterSurface, floodMast, billboard) — no second scenery system, no kit
   rewrites. Caps keep custom circuits cheap. FULL boot (before custom-tracks)
   so sanitize + dress run at sync()/share without waiting for LAZY_EDITOR. */
const TrackDesignerProps = (function () {
  "use strict";
  // Order is the codec kind index — never reorder; append only.
  const KINDS = Object.freeze(["stand", "gantry", "trees", "water", "flood", "billboard"]);
  const LABELS = Object.freeze({
    stand: "STAND", gantry: "GANTRY", trees: "TREES",
    water: "WATER", flood: "FLOOD", billboard: "BOARD",
  });
  // Per-kind and total caps: custom tracks stay under the fleet prop budget.
  const CAPS = Object.freeze({ stand: 4, gantry: 4, trees: 6, water: 2, flood: 2, billboard: 8 });
  const TOTAL = 16;
  const DEFAULT_GAP = Object.freeze({
    stand: 18, gantry: 0, trees: 34, water: 40, flood: 28, billboard: 9,
  });
  const GAP_MAX = 120;
  const BOARD_COLS = Object.freeze([
    [0.86, 0.12, 0.10], [0.10, 0.28, 0.66], [0.96, 0.78, 0.10],
    [0.10, 0.52, 0.30], [0.92, 0.92, 0.92],
  ]);

  const has = (k) => KINDS.indexOf(k) >= 0;
  const frac = (v) => {
    if (!Number.isFinite(v)) return null;
    let f = v - Math.floor(v);
    if (f < 0) f += 1;
    return Math.round(f * 65535) % 65535 / 65535;
  };
  const sideOf = (v) => (v < 0 ? -1 : 1);
  const gapOf = (kind, v) => {
    const d = DEFAULT_GAP[kind] != null ? DEFAULT_GAP[kind] : 20;
    const n = Number.isFinite(+v) ? +v : d;
    return Math.min(GAP_MAX, Math.max(0, Math.round(n)));
  };

  /** Count placed props by kind (and total). */
  function counts(list) {
    const out = { total: 0 };
    for (const k of KINDS) out[k] = 0;
    if (!Array.isArray(list)) return out;
    for (const p of list) {
      if (!p || !has(p.kind)) continue;
      out[p.kind]++; out.total++;
    }
    return out;
  }

  /** Repair rather than discard; null / empty → null (absent like look defaults). */
  function sanitize(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const out = [];
    const n = counts([]);
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const kind = String(raw.kind || "");
      if (!has(kind)) continue;
      if (n[kind] >= CAPS[kind] || n.total >= TOTAL) continue;
      const s = frac(raw.s);
      if (s == null) continue;
      out.push({ kind, s, side: sideOf(raw.side), gap: gapOf(kind, raw.gap) });
      n[kind]++; n.total++;
    }
    return out.length ? out : null;
  }

  /** Can we add one more of this kind under the caps? */
  function canPlace(list, kind) {
    if (!has(kind)) return false;
    const c = counts(list);
    return c[kind] < CAPS[kind] && c.total < TOTAL;
  }

  /** Control-polygon arc fraction at index i (0…1). */
  function pointFrac(pts, i) {
    if (!Array.isArray(pts) || !pts.length) return 0;
    const N = pts.length;
    const idx = ((i % N) + N) % N;
    let L = 0, at = 0;
    for (let k = 0; k < N; k++) {
      const a = pts[k], b = pts[(k + 1) % N];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (k < idx) at += d;
      L += d;
    }
    return L > 0 ? at / L : 0;
  }

  /** Append one prop; returns the new list or null when refused. */
  function place(list, kind, opts) {
    opts = opts || {};
    if (!canPlace(list, kind)) return null;
    const s = frac(opts.s != null ? opts.s : 0);
    if (s == null) return null;
    const next = Array.isArray(list) ? list.slice() : [];
    next.push({ kind, s, side: sideOf(opts.side), gap: gapOf(kind, opts.gap) });
    return sanitize(next) || next;
  }

  /** Remove by index; returns the new list (possibly empty → []). */
  function removeAt(list, i) {
    if (!Array.isArray(list) || i < 0 || i >= list.length) return list ? list.slice() : [];
    const next = list.slice();
    next.splice(i, 1);
    return next;
  }

  /** Remove the last prop of `kind`, or the last prop when kind is null. */
  function removeLast(list, kind) {
    if (!Array.isArray(list) || !list.length) return [];
    let i = list.length - 1;
    if (kind) {
      while (i >= 0 && list[i].kind !== kind) i--;
      if (i < 0) return list.slice();
    }
    return removeAt(list, i);
  }

  /** Dress authored props through the live scenery api (sceneryFor call site). */
  function dress(api, sv, props) {
    const list = sanitize(props);
    if (!list || !list.length || !api || !sv) return 0;
    let placed = 0;
    const K = api.K || ((f) => Math.round((((f % 1) + 1) % 1) * sv.n) % sv.n);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      try {
        if (placeOne(api, sv, K, p, i)) placed++;
      } catch (e) {
        if (typeof Log !== "undefined") Log.warn("track", "custom prop " + p.kind + " failed: " + (e && e.message || e));
      }
    }
    return placed;
  }

  function placeOne(api, sv, K, p, i) {
    const side = p.side || 1;
    const gap = p.gap;
    const k = K(p.s);
    if (p.kind === "stand") {
      if (!api.grandstandEx) return false;
      api.grandstandEx(p.s, side, Math.max(14, gap), 70, null, null, { tiers: 1, h: 11 });
      return true;
    }
    if (p.kind === "gantry") {
      if (!api.gantry) return false;
      api.gantry(p.s, 5.5, [0.72, 0.74, 0.78], {});
      return true;
    }
    if (p.kind === "trees") {
      if (!api.forestEdge) return false;
      const half = 0.01;
      api.forestEdge(p.s - half, p.s + half, side, Math.max(20, gap), {
        hMin: 9, hMax: 15, density: 0.35, pineFrac: 0.35,
        col: [0.18, 0.36, 0.16], col2: [0.24, 0.40, 0.18],
      });
      return true;
    }
    if (p.kind === "water") {
      if (!api.waterSurface) return false;
      api.waterSurface(k, side, Math.max(24, gap), [220, 0.25, 280], [0.14, 0.36, 0.48], { id: "custom-prop-water-" + i });
      return true;
    }
    if (p.kind === "flood") {
      if (!api.floodMast) return false;
      api.floodMast(k, side, Math.max(18, gap), { h: 24, cool: true, pool: true });
      return true;
    }
    if (p.kind === "billboard") {
      if (!api.billboard) return false;
      const col = BOARD_COLS[i % BOARD_COLS.length];
      api.billboard(k, side, Math.max(6, gap), 10, 4.2, col);
      return true;
    }
    return false;
  }

  return {
    KINDS, LABELS, CAPS, TOTAL, DEFAULT_GAP,
    has, sanitize, counts, canPlace, place, removeAt, removeLast, pointFrac, dress,
  };
})();
Object.freeze(TrackDesignerProps);
