/* Apex 26 — SPA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    baseHW: 8,
    pal: { zenith: [0.34, 0.44, 0.56], horizon: [0.6, 0.65, 0.66], grass: [0.12, 0.34, 0.14], runoff: [0.4, 0.4, 0.4], fog: [0.66, 0.7, 0.72], fogDensity: 0.0026, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.98, 0.84, 0.64], sunColor: [0.9, 0.8, 0.62] },
    segs: [
      { t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 }, { t: -30, l: 80, h: 16 },
      { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 }, { t: -90, l: 160, h: -10 }, { t: 40, l: 90 },
      { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 }, { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 },
      { t: 30, l: 120 },
    ],
    // Eau Rouge dip, the Raidillon/Kemmel climb (the calendar's biggest, ~100 m
    // top-to-bottom), then the long descent back through the second sector.
    elevations: [{ s: 0.10, halfM: 280, rise: -6 }, { s: 0.17, halfM: 440, rise: 16 }, { s: 0.46, halfM: 520, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, prop, place, backdrop,
              addBox, vadd, anchor, mountain, pine, forestEdge, grandstand,
              building, tower, billboard, groundPlane, marshalPost } = api;
      // lap-fraction → node index
      const K = (s) => Math.round(s * n) % n;

      // --- Encircling Ardennes mountains: a near forested range with light snow
      // only on the highest tops, and a far hazed range. Centre-based ring so the
      // forested peaks sit on the horizon, not scattered across the infield.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Three concentric rings of organic peaks. Each ring is densely packed and
      // angularly offset from its neighbours so the summits OVERLAP into one
      // continuous forested wall with no gaps anywhere around the lap. Low `seg`
      // keeps each peak cheap so we can afford many. Snow only on the far tops.
      const ranges = [
        // near forested wall — wMin/wVar sized so max(w)*0.62 < extra-8 (guard won't fire)
        { extra: 280, wMin: 160, hMin: 56, hVar: 54, wVar: 80, count: 32, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.10, 0.32, 0.14], rock: [0.28, 0.32, 0.28], snow: [0.90, 0.93, 0.96], snowline: 1.2 } },
        // mid forested wall — offset to fill the seams of the near ring
        { extra: 290, wMin: 340, hMin: 92, hVar: 70, wVar: 150, count: 26, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.13, 0.36, 0.17], rock: [0.34, 0.38, 0.36], snow: [0.90, 0.93, 0.96], snowline: 0.92 } },
        // far hazed range — paler damp grey-green, light snow on the very tops
        { extra: 450, wMin: 380, hMin: 132, hVar: 110, wVar: 150, count: 22, phase: 0.0,
          opts: { seg: 7, rough: 0.34, forest: [0.18, 0.42, 0.20], rock: [0.46, 0.50, 0.50], snow: [0.92, 0.94, 0.97], snowline: 0.78 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          // jitter the radius inward/outward so the wall has depth but never opens a gap
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar, Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Forested ridgelines settling behind the trackside treeline.
      // 22 m height ≈ tall Ardennes pine — reads as a tree-top horizon, not a
      // looming wall. 200 m+ keeps the near face >140 m from the road edge.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 100, [110, 22, 90], [0.13, 0.30, 0.16]);
        }
      });

      // --- Dense Ardennes pine forest walling both sides of the track. Tighter
      // spacing and a low skip threshold so the woodland is continuous; a second
      // deeper rank thickens the wall behind the front line. Cool dark blue-green
      // spruce tint (low R, more B than typical green) for the plantation look.
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.16) continue;
          const dist = 8 + s * 18, h = 9 + s * 9;
          pine(k, side, dist, h, [0.07 + s * 0.04, 0.29, 0.18]);
          if (s > 0.55) pine(k, side, dist + 12 + s * 16, h + 3, [0.08 + s * 0.04, 0.27, 0.17]);
          if (s > 0.80) pine(k, side, dist + 28 + s * 18, h + 5, [0.09 + s * 0.04, 0.25, 0.16]);
        }
      });
      // Fill the sparse stretches: a staggered front-line rank offset from the above.
      every(48, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5 + 3);
          if (s < 0.40) continue;
          const dist = 6 + s * 10, h = 8 + s * 7;
          pine(k, side, dist, h, [0.08 + s * 0.04, 0.30, 0.18]);
        }
      });
      // Hero density at Eau Rouge / Raidillon (s≈0.05–0.10): crowd the climb with pines.
      every(12, (k) => {
        const s = k / n;
        if (s < 0.045 || s > 0.12) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 53 + side);
          pine(k, side, 7 + r * 10, 10 + r * 10, [0.07 + r * 0.04, 0.30, 0.18]);
          if (r > 0.5) pine(k, side, 20 + r * 18, 13 + r * 9, [0.08 + r * 0.04, 0.27, 0.17]);
        }
      });
      // --- Near-continuous dense conifer WALLS along the signature forested
      // stretches: Kemmel straight, Pouhon, Stavelot, Blanchimont. forestEdge keeps
      // the canopy clear of the road edge and packs a near-solid blue-green wall
      // (mostly pine) right up against the verge on both sides.
      const spruce = [0.07, 0.28, 0.17], spruce2 = [0.10, 0.33, 0.16];
      const fwall = (s0, s1) => {
        for (const side of [-1, 1]) {
          forestEdge(s0, s1, side, 5, { density: 1, hMin: 11, hMax: 22, pineFrac: 0.85, col: spruce, col2: spruce2 });
          // deeper second rank for thickness
          forestEdge(s0, s1, side, 24, { density: 0.85, hMin: 13, hMax: 24, pineFrac: 0.9, col: [0.06, 0.25, 0.16], col2: [0.09, 0.30, 0.15] });
        }
      };
      fwall(0.105, 0.165);   // Kemmel straight → Les Combes
      fwall(0.30, 0.38);     // Pouhon
      fwall(0.68, 0.76);     // Stavelot
      fwall(0.82, 0.90);     // Blanchimont

      // --- Modern pit/paddock building: long low white-grey mass on the pit straight.
      building(0, -1, 9, 14, 11, 64, { wall: [0.90, 0.91, 0.93], window: [0.40, 0.46, 0.50], floor: 5 });
      {
        // Thin cantilever roof blade over the pit lane.
        const a = anchor(0, -1, 20);
        addBox(out, vadd(a.c, a.u, 12.5), [16, 0.8, 60], [0.82, 0.84, 0.88], [a.r, a.u, a.t]);
      }
      // Lone weathered old pit building on the original Kemmel straight (s≈0.10, far left).
      building(Math.round(n * 0.10) % n, -1, 40, 12, 9, 40, { wall: [0.74, 0.72, 0.66], window: [0.34, 0.34, 0.32], floor: 4 });

      // --- Pit-straight HERO landmark: the modern ~32 m glass timing / race-control
      // tower (the Uhoda Tower silhouette) over the pit lane. Tall light glass slab,
      // set just behind the pit wall near the start line so it rises clear above the
      // pit building and reads as the Spa hero silhouette against the sky. A second
      // shorter glass volume beside it gives the terraced-tower massing.
      tower(K(0.012), -1, 13, 11, 32, {
        col: [0.76, 0.80, 0.86], seg: 4, cap: true, capCol: [0.28, 0.30, 0.36], mast: 5,
      });
      tower(K(0.026), -1, 13, 8, 20, {
        col: [0.70, 0.75, 0.82], seg: 4, cap: true, capCol: [0.28, 0.30, 0.36],
      });
      // Sponsor hoarding banner band on the pit wall opposite the tower.
      billboard(K(0.01), 1, 10, 16, 3, [0.88, 0.84, 0.30]);

      // --- Grandstands: La Source, Eau Rouge/Raidillon top, Les Combes, Bus Stop,
      // pit straight. The 2022 revamp added the big stand atop the Raidillon and a
      // new La Source stand — emit both sides at Raidillon for the wrap-around look.
      const shell = [0.42, 0.43, 0.47];
      grandstand(0.00, 1, 8, 44, shell, [0.50, 0.52, 0.56]);   // main grandstand, pit straight
      grandstand(0.02, 1, 8, 30, shell, [0.62, 0.16, 0.16]);   // La Source hairpin (2022 stand)
      grandstand(0.025, -1, 8, 22, shell, [0.86, 0.78, 0.20]); // La Source outside (yellow Wallonia)
      grandstand(0.07, 1, 8, 30, shell, [0.20, 0.36, 0.62]);   // Eau Rouge
      grandstand(0.095, 1, 8, 34, shell, [0.16, 0.16, 0.18]);  // Raidillon TOP (the big 4,600-seat 2022 stand)
      grandstand(0.16, 1, 8, 30, shell, [0.50, 0.52, 0.56]);   // Les Combes
      grandstand(0.92, 1, 8, 28, shell, [0.46, 0.48, 0.52]);   // Bus Stop chicane

      // --- Beige gravel run-off traps reinstated 2022 at the named corners. A flat
      // light grey-brown apron just off the outside of each corner (groundPlane is
      // culled if it would overlap any parallel stretch of track).
      const gravel = [0.62, 0.58, 0.47];
      groundPlane(K(0.02),  1, 5, [22, 0.4, 26], gravel);   // La Source outside
      groundPlane(K(0.165), 1, 5, [20, 0.4, 28], gravel);   // Les Combes
      groundPlane(K(0.33),  1, 5, [22, 0.4, 30], gravel);   // Pouhon
      groundPlane(K(0.72),  1, 5, [20, 0.4, 26], gravel);   // Stavelot
      groundPlane(K(0.86),  1, 5, [18, 0.4, 30], gravel);   // Blanchimont

      // --- Yellow-capped marshal posts dotted around the lap.
      every(120, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        marshalPost(k, side, 4);
      });
      // Extra marshal posts flanking pit entry (s≈0.97).
      marshalPost(Math.round(n * 0.97) % n, -1, 4);
      marshalPost(Math.round(n * 0.97) % n, 1, 4);

      // --- Eau Rouge: low concrete runoff wall boxes at the valley base (s≈0.06, left).
      {
        const kw = Math.round(n * 0.06) % n;
        place(kw, -1, 4, [1.0, 1.4, 22], [0.55, 0.55, 0.52]);
      }

      // --- Belgian-flag painted run-off accents (black-yellow-red) — one of Spa's
      // most recognisable signatures. Three side-by-side painted strips laid FLAT on
      // the run-off just past the edge at Raidillon (Eau Rouge exit) and the Bus Stop.
      // Anchored to the track basis so each strip runs along the racing line; very
      // thin in the up axis so it reads as paint on tarmac, sunk to grade.
      const belgian = [[0.04, 0.04, 0.05], [0.95, 0.82, 0.08], [0.82, 0.10, 0.10]];
      const flagPaint = (s, side, len) => {
        for (let i = 0; i < 3; i++) {
          // base dist 1.6 so the inner band's inner face (centre − 1.4) clears the
          // road edge — closer and addBox's on-track guard culls the whole strip.
          const a = anchor(K(s), side, 1.6 + i * 2.9);   // off the edge, 2.9 m bands
          // [r,u,t] basis: width across track (r)=2.8, length along (t). Raised as a
          // low painted run-off platform (top ~0.6 m) so the black-yellow-red block
          // reads clearly over the grass/asphalt verge from any angle.
          addBox(out, vadd(a.c, a.u, 0.30), [2.8, 0.60, len], belgian[i], [a.r, a.u, a.t]);
        }
      };
      flagPaint(0.085, 1, 34);   // Raidillon exit, outside (right)
      flagPaint(0.085, -1, 26);  // Raidillon exit, inside (left)
      flagPaint(0.935, 1, 30);   // Bus Stop chicane exit / start line

      // --- Wallonia kerb accents: yellow-and-red rumble strips just off the racing
      // line at the apex corners. Two thin alternating-coloured low strips hard
      // against the verge (sunk flush), the modern Spa kerb livery.
      const kerb = (s, side) => {
        const a0 = anchor(K(s), side, 0.45), a1 = anchor(K(s), side, 1.15);
        addBox(out, vadd(a0.c, a0.u, 0.10), [0.70, 0.22, 11], [0.94, 0.80, 0.10], [a0.r, a0.u, a0.t]); // yellow
        addBox(out, vadd(a1.c, a1.u, 0.10), [0.70, 0.22, 11], [0.84, 0.12, 0.10], [a1.r, a1.u, a1.t]); // red
      };
      kerb(0.02, 1);    // La Source apex
      kerb(0.085, 1);   // Raidillon
      kerb(0.165, 1);   // Les Combes
      kerb(0.33, 1);    // Pouhon
      kerb(0.72, 1);    // Stavelot
      kerb(0.935, -1);  // Bus Stop
    },
  }
  );
})();
