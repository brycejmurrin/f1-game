/* Apex 26 — SceneryVenue: grounded, bounded race-day facilities shared by every circuit. */
const SceneryVenue = (function () {
  "use strict";

  const UP = [0, 1, 0], WIDTH = 6, DEPTH = 8;
  const KINDS = ["marshalShelter", "recoveryTruck", "concessionBooth", "serviceAwning",
                 "medicalVan", "spectatorShade"];

  function build(ctx, theme, excluded) {
    const { track, def, n, ds, hw, anchor, terrainYAt, barrierClear,
            massBlocked, massAdd, indexSolidAt, models, RAW, MAT, note } = ctx;
    const palette = theme && theme.palette || {};
    const shell = palette.shell || [0.72, 0.74, 0.78];
    const accent = palette.accent || [0.86, 0.30, 0.20];
    const roof = palette.roof || [0.25, 0.28, 0.30];
    const dark = [0.10, 0.12, 0.14], glass = palette.glass || [0.28, 0.42, 0.58];
    const facilities = track.venueFacilities = [];
    const shift = TrackSpace.sceneryOriginDelta(def);

    function place(slot, k, side, dist) {
      if (excluded("venue", k, side)) return false;
      const a = anchor(k, side, dist);
      // Upright facilities sit on a level slab, even beside banked tarmac.
      const r = TrackGeom.norm([a.r[0], 0, a.r[2]]);
      const t = TrackGeom.norm([a.t[0], 0, a.t[2]]), basis = [r, UP, t];
      const heights = [terrainYAt(a.c[0], a.c[2])];
      for (const x of [-WIDTH / 2, WIDTH / 2]) for (const z of [-DEPTH / 2, DEPTH / 2])
        heights.push(terrainYAt(a.c[0] + r[0] * x + t[0] * z, a.c[2] + r[2] * x + t[2] * z));
      if (!heights.every(Number.isFinite)) return false;
      const low = Math.min(...heights), high = Math.max(...heights);
      if (high - low > 0.65 || !barrierClear(a.c[0], a.c[2], 5.2) ||
          massBlocked(a.c, WIDTH, DEPTH, basis, 1)) return false;
      const base = [a.c[0], high + 0.06, a.c[2]], kind = KINDS[slot];
      const id = `venue-${slot}-${k}-${side}`;
      const ok = models.modelGroup(id, {
        center: [base[0], high + 1.4, base[2]], size: [WIDTH, 4.8, DEPTH], basis,
      }, (stage) => {
        const box = (x, y, z, size, color, mat) => {
          stage._mat = mat == null ? MAT.METAL : mat;
          RAW.addBox(stage, [base[0] + r[0] * x + t[0] * z, base[1] + y,
                            base[2] + r[2] * x + t[2] * z], size, color, basis);
        };
        const slab = high - low + 0.18;
        box(0, -slab / 2, 0, [WIDTH, slab, DEPTH], [0.47, 0.48, 0.46], MAT.CONCRETE);
        const person = (x, z, shirt) => {
          box(x, 0.38, z, [0.30, 0.76, 0.28], dark, MAT.FABRIC);
          box(x, 1.08, z, [0.49, 0.66, 0.32], shirt, MAT.FABRIC);
          box(x, 1.56, z, [0.29, 0.30, 0.29], [0.83, 0.62, 0.44], MAT.FLAT);
        };
        if (slot === 0) {
          box(0, 2.55, 0, [4.6, 0.18, 4.2], accent, MAT.FABRIC);
          for (const x of [-2.1, 2.1]) box(x, 1.23, 1.85, [0.12, 2.46, 0.12], shell);
          box(0.7, 0.5, 1, [1.6, 1, 0.8], roof);
          box(1.8, 0.3, -1.2, [0.30, 0.60, 0.30], [0.86, 0.12, 0.10]);
          person(-0.8, -0.7, [1.0, 0.38, 0.05]);
        } else if (slot === 1) {
          // Cab, windscreen, open pickup bed, wheel pairs and roof beacon.
          box(0, 0.72, 0, [1.9, 0.50, 4.6], shell);
          box(0, 1.39, -1.2, [1.8, 0.84, 1.75], accent);
          box(0, 1.54, -2.09, [1.5, 0.42, 0.045], glass, MAT.GLASS);
          box(0, 1.05, 0.9, [1.7, 0.16, 2.4], dark);
          box(0, 1.22, 2.13, [1.8, 0.44, 0.16], accent);
          for (const x of [-1, 1]) for (const z of [-1.45, 1.5])
            box(x, 0.38, z, [0.28, 0.76, 0.76], dark);
          box(0, 1.91, -1.2, [0.75, 0.20, 0.25], [1.3, 0.61, 0.08]);
          box(0, 1.33, 0.6, [0.9, 0.4, 0.8], roof);
        } else if (slot === 2) {
          box(0, 0.6, 0.7, [3.4, 1.2, 2.4], shell);
          for (const x of [-1.62, 1.62]) box(x, 1.62, 0.7, [0.16, 0.84, 2.4], shell);
          box(0, 2.16, 0.7, [3.4, 0.32, 2.4], accent);
          box(0, 2.43, 0.35, [4.0, 0.22, 3.3], roof, MAT.ROOF);
          box(0, 1.22, -0.65, [3.7, 0.12, 0.8], [0.86, 0.82, 0.70], MAT.WOOD);
          box(2.3, 0.5, 0.5, [0.6, 1.0, 0.6], dark);
          person(-0.65, -1.8, [0.15, 0.37, 0.65]);
        } else if (slot === 3) {
          box(0, 2.65, 0, [5.4, 0.18, 5.8], roof, MAT.FABRIC);
          for (const x of [-2.45, 2.45]) for (const z of [-2.65, 2.65])
            box(x, 1.28, z, [0.12, 2.56, 0.12], shell);
          box(0, 0.4, 1.8, [3.4, 0.8, 0.7], accent);
          box(1.6, 0.35, -0.9, [0.9, 0.7, 1.1], shell);
          person(-0.8, -0.6, [0.80, 0.15, 0.16]);
        } else if (slot === 4) {
          // White response van: tall equipment cabin, cab glass and blue lightbar.
          const white = [0.89, 0.90, 0.88];
          box(0, 0.52, 0, [2.1, 0.30, 4.8], dark);
          box(0, 1.38, 0.5, [2.05, 1.68, 3.4], white);
          box(0, 1.13, -1.65, [1.9, 1.15, 1.55], white);
          box(0, 1.40, -2.44, [1.6, 0.48, 0.03], glass, MAT.GLASS);
          for (const x of [-1.08, 1.08]) for (const z of [-1.6, 1.65])
            box(x, 0.38, z, [0.34, 0.76, 0.76], dark);
          box(0, 2.31, -0.75, [1.4, 0.18, 0.30], [0.12, 0.45, 1.15]);
          box(-side * 1.04, 1.02, 0.5, [0.03, 0.22, 2.7], [0.85, 0.12, 0.10]);
          box(0, 1.65, 2.215, [1.4, 0.62, 0.03], glass, MAT.GLASS);
        } else {
          // Two seating banks give spectators a shaded rest area off the fence.
          box(0, 2.65, 0, [5.4, 0.18, 5.8], accent, MAT.FABRIC);
          for (const x of [-2.45, 2.45]) for (const z of [-2.65, 2.65])
            box(x, 1.28, z, [0.12, 2.56, 0.12], shell);
          for (const z of [-1.2, 1.2]) {
            box(0, 0.32, z, [3.8, 0.64, 0.70], roof, MAT.WOOD);
            box(z * 0.6, 0.99, z, [0.50, 0.70, 0.36], shell, MAT.FABRIC);
            box(z * 0.6, 1.49, z, [0.29, 0.30, 0.29], [0.73, 0.51, 0.36], MAT.FLAT);
          }
        }
        return true;
      }, { kind: "venue", maxVertices: 288 });
      if (!ok) return false;
      massAdd(base, WIDTH, DEPTH, basis);
      indexSolidAt(k, side, dist, WIDTH / 2, DEPTH / 2);
      note(kind, [base[0], high + 1.4, base[2]], [WIDTH, 4.8, DEPTH], { k, side });
      facilities.push({ kind, k, side, dist });
      return true;
    }

    // Six bounded slots; search nearby free terrain rather than duplicating
    // landmarks or forcing facilities into a circuit's road/harbour geometry.
    for (let slot = 0; slot < KINDS.length; slot++) {
      const start = Math.round((0.10 + slot / KINDS.length + shift) * n);
      let placed = false;
      for (let attempt = 0; attempt < 32 && !placed; attempt++) {
        const k = ((start + Math.round(attempt * 40 / ds)) % n + n) % n;
        for (const side of [-1, 1]) {
          const barrier = side < 0 ? track.barL[k] : track.barR[k];
          const gap = Math.max(11, barrier - hw[k] + 6);
          for (const extra of [0, 10, 22]) {
            if (place(slot, k, side, gap + extra)) { placed = true; break; }
          }
          if (placed) break;
        }
      }
    }
    return facilities;
  }

  return { build };
})();

Object.freeze(SceneryVenue);
