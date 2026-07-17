/* Apex 26 — MONTREAL circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9150, // GPS-derived (OpenF1 2025, conf=0.661)
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // Bespoke parkland below owns Montreal's foliage; avoid a duplicate shared row.
      { kind: "foliage", s0: 0, s1: 1 },
      // Preserve the open-water read along the Olympic Basin and island canals.
      { kind: "lamps", s0: 0.065, s1: 0.21, side: -1 },
      { kind: "lamps", s0: 0.565, s1: 0.75, side: 1 },
      { kind: "lamps", s0: 0.78, s1: 0.86, side: 1 },
      // Foldbacks need a furniture-free envelope on both sides.
      { kinds: ["lamps", "floodlights"], s0: 0.19, s1: 0.23 },
      { kinds: ["lamps", "floodlights"], s0: 0.69, s1: 0.73 },
      // Keep the Wall of Champions sightline free of generic furniture.
      { kind: "lamps", s0: 0.94, s1: 0.995, side: 1 },
    ],
    pal: { zenith: [0.30, 0.50, 0.82], horizon: [0.74, 0.80, 0.86], grass: [0.24, 0.50, 0.20], runoff: [0.18, 0.38, 0.16], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    segs: [
      { t: 0, l: 380 }, { t: 80, l: 90 }, { t: -90, l: 100 }, { t: 0, l: 300 }, { t: 90, l: 90 }, { t: 0, l: 420 },
      { t: -80, l: 90 }, { t: 60, l: 70 }, { t: -60, l: 70 }, { t: 0, l: 220 }, { t: 100, l: 110 }, { t: -100, l: 110 },
    ],
    // Île Notre-Dame is nearly level; retain only the faint bridge approach.
    elevations: [{ s: 0.52, halfM: 220, rise: 1.25 }],
    // Île Notre-Dame is a flat, man-made island sitting ~level with the water.
    // flatTerrain makes the terrain ribbon a WIDE, dead-level grass shelf so there
    // is real green land all around the road (trees/props sit on it instead of
    // floating over a sunk fallback), out to the shoreline ~70 m from the edge.
    flatTerrain: true,
    terrainOuter: 70,
    scenery: function (api) {
      const { out, n, py, pyMin, place, backdrop, wall, grandstand,
        building, anchor, addBox, addCyl, addFrustum, vadd, hash,
        fence, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        ferrisWheel, tower, onTrack, forestEdge, cityFront,
        modelGroup, overheadSpan, waterSurface, groundPatch,
        cross, norm, MAT, COL } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── strut(): thin cylinder between two world points (geodesic lattice) ────
      const strut = (a, c, rad, col, seg) => {
        const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1e-6;
        const up = [d[0] / L, d[1] / L, d[2] / L];
        const ref = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const right = norm(cross(ref, up));
        const fwd = norm(cross(up, right));
        addCyl(out, a, rad, L, col, seg || 3, [right, up, fwd]);
      };

      // ── Island Y-level reference constants ────────────────────────────────
      // All features are anchored to these absolute Y values so they sit at
      // the correct height relative to the island slab regardless of how deep
      // groundYAt() goes for large lateral distances on a flat island.
      const BASE   = pyMin || 0;
      const BANK_T = BASE - 0.35;   // far-bank shore: above river (−0.45), below main island

      // ---- Île Notre-Dame palette (bright June day) ----
      const WALL     = [0.78, 0.79, 0.80];   // pale concrete
      // Bright teal Olympic Basin + St. Lawrence — COL.basinTeal when available
      const TEAL     = (COL && COL.basinTeal) || [0.08, 0.55, 0.62];
      const RIVER    = TEAL;                 // St. Lawrence — bright basin teal
      const RIVER2   = [TEAL[0] + 0.06, TEAL[1] + 0.08, TEAL[2] + 0.06]; // lighter near-shore
      const BASIN    = TEAL;                 // Olympic rowing lake (bright teal)
      const GRASS    = [0.22, 0.43, 0.20];   // park green (muted, avoids neon under sun)
      const FOLIAGE  = [0.16, 0.34, 0.18];   // deep tree green (darker summer deciduous)
      const FOLIAGE2 = [0.20, 0.40, 0.20];   // lighter June foliage
      const HEDGE    = [0.16, 0.32, 0.17];   // clipped hedge green

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      // ── Flag mast helper: slender pole with a coloured pennant box at the top ──
      const flagMast = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 1.5)) return;
        addCyl(out, a.c, 0.07, h, [0.30, 0.30, 0.33], 5, b);
        addBox(out, vadd(a.c, a.u, h - 0.7), [0.04, 1.4, 2.4], col, b);
      };

      // St. Lawrence River: typed water strips begin beyond the 70 m terrain
      // ribbon. Segmenting the surround keeps each footprint away from foldbacks
      // and sends reflections through the dedicated water mesh.
      for (let i = 0; i < 16; i++) {
        const k = K(i / 16);
        for (const side of [-1, 1]) {
          if ((i === 4 && side === 1) || (i === 7 && side === -1) ||
              (i === 11 && side === 1)) continue;
          waterSurface(k, side, 72, [70, 0.3, 150], i % 2 ? RIVER : RIVER2, {
            id: `montreal-river-${i}-${side < 0 ? "l" : "r"}`,
          });
        }
      }

      // ── Far-bank land strip: a flat shoreline slab across the water that the
      // downtown skyline / Biosphère / La Ronde stand ON (so they read as a city
      // and islands ACROSS the river, never floating on water). Raised just above
      // the water surface; track-aligned so its long face parallels the road.
      const FARBANK  = [0.34, 0.40, 0.30];   // muted river-bank green-grey
      const farBank = (k, side, near, far, lenM, col) => {
        const a = anchor(k, side, (near + far) / 2);
        const depth = far - near;
        const H = 5;
        // Lift so top face is at BANK_T (pyMin−0.35) — above river (−0.45) but
        // below the main island slab (−0.10), reading as a separate island bank.
        // anchor().c[1] reflects groundYAt for large dist (≈−2.46), NOT pyMin,
        // so we must compute the lift explicitly from BANK_T and that value.
        addBox(out, vadd(a.c, a.u, BANK_T - H / 2 - a.c[1]),
               [lenM, H, depth], col || FARBANK, [a.r, a.u, a.t]);
      };

      // ── Inner lagoon + Jean-Doré Beach (per aerial reference) ──────────────
      // A compact typed lagoon with a terrain-conforming Jean-Doré beach.
      {
        const LAGOON = [0.13, 0.28, 0.38];   // park lagoon water (darker, muted)
        const SAND   = [0.88, 0.80, 0.58];   // Jean-Doré beach sand (pale tan)
        const lk = K(0.65);
        waterSurface(lk, -1, 54, [72, 0.25, 126], LAGOON, {
          id: "montreal-jean-dore-lagoon",
        });
        groundPatch(lk, -1, 40, [18, 0.35, 112], SAND, {
          id: "montreal-jean-dore-beach", samples: 6,
        });
      }

      // ===================================================================
      // Continuous pale concrete walls lining both edges. Pull the walls one
      // metre outward at the two tight foldbacks so their connected chords do
      // not cut across the neighbouring racing surface.
      // ===================================================================
      for (const side of [-1, 1]) {
        for (const [s0, s1, gap] of [
          [0.0, 0.19, 2.5], [0.19, 0.23, 3.5], [0.23, 0.69, 2.5],
          [0.69, 0.73, 3.5], [0.73, 1.0, 2.5],
        ]) wall(s0, s1, side, gap, 1.5, WALL);
      }

      // Catch / debris fence behind the walls — the tight street-style corridor.
      fence(0.0, 1.0, -1, 3.4, 3.0, [0.72, 0.74, 0.78]);
      fence(0.0, 1.0,  1, 3.4, 3.0, [0.72, 0.74, 0.78]);

      // Wide parkland ground planes — fill verges so the island slab shows green
      // everywhere instead of bare terrain-ribbon steps.
      // Pit straight + approach: both sides (fraction 0.88–0.08, wrapping through 1)
      for (let i = 0; i < 8; i++) {
        const s = (0.88 + i * 0.025) % 1;
        groundPatch(K(s),  1, 8, [48, 0.35, 42], GRASS,
          { id: `montreal-pit-lawn-r-${i}`, samples: 6 });
        groundPatch(K(s), -1, 8, [44, 0.35, 40], GRASS,
          { id: `montreal-pit-lawn-l-${i}`, samples: 6 });
      }
      // Right verge: park lawns from Senna S through the Casino complex
      for (let i = 0; i < 14; i++) {
        if ([4, 9, 11, 12].includes(i)) continue; // nearby foldbacks own this ground
        groundPatch(K(0.08 + i * 0.058), 1, 9, [42, 0.35, 40], GRASS,
          { id: `montreal-park-lawn-r-${i}`, samples: 6 });
      }
      // Left verge: island interior from basin entry to back straight
      for (let i = 0; i < 10; i++) {
        groundPatch(K(0.10 + i * 0.068), -1, 9, [40, 0.35, 38], GRASS,
          { id: `montreal-park-lawn-l-${i}`, samples: 6 });
      }

      // Continuous low clipped hedge / treeline ribbon framing the verges
      hedge(0.13, 0.19,  1, 9, 1.6, HEDGE);
      hedge(0.23, 0.24,  1, 9, 1.6, HEDGE);
      hedge(0.38, 0.50,  1, 9, 1.4, HEDGE);   // mid-island right verge
      hedge(0.62, 0.69, -1, 9, 1.6, HEDGE);
      hedge(0.73, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.90,  1, 9, 1.6, HEDGE);

      // Marshal posts spaced around the lap (orange-roofed bunkers + flag pole)
      for (const s of [0.05, 0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, 8.5);
      }

      // ===================================================================
      // s 0.02 R — Pit wall & main grandstand on the start straight
      // ===================================================================
      grandstand(0.02,  1,  8, 120, [0.50, 0.51, 0.56], [0.62, 0.34, 0.30]);
      grandstand(0.0,  -1, 10,  90, [0.46, 0.47, 0.52], [0.55, 0.40, 0.38]);
      grandstand(0.06,  1,  9,  90, [0.48, 0.49, 0.55], [0.58, 0.36, 0.34]);
      grandstand(0.96, -1, 11,  80, [0.47, 0.48, 0.53], [0.56, 0.38, 0.36]);

      // Start/finish gantry spanning the main straight + a second timing arch
      gantry(0.005, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.97,  6.5, [0.16, 0.16, 0.20]);

      // Flag masts flanking the start/finish line (Canadian red + maple leaf red)
      flagMast(K(0.005),  1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.005), -1, 10, 12, [0.88, 0.12, 0.16]);
      flagMast(K(0.999),  1,  9, 11, [0.88, 0.12, 0.16]);

      // Pit lane garages / paddock buildings behind the left pit wall (long low row)
      for (let i = 0; i < 6; i++) {
        const s = 0.965 + i * 0.012;
        building(K(s), -1, 13, 16, 9, 14,
          { wall: [0.66, 0.67, 0.71], window: [0.44, 0.54, 0.64], floor: 4 });
      }
      // Paddock hospitality block + media centre, taller, set further back
      building(K(0.0), -1, 30, 26, 16, 22,
        { wall: [0.72, 0.74, 0.78], window: [0.52, 0.64, 0.76], floor: 4, setback: true, roof: true });
      building(K(0.03), -1, 32, 22, 13, 20,
        { wall: [0.68, 0.70, 0.74], window: [0.50, 0.60, 0.72], floor: 4, roof: true });

      // Pit-straight billboards / advertising hoardings (right verge, well clear)
      for (const s of [0.01, 0.04, 0.97, 0.94]) {
        billboard(K(s), 1, 10, 14, 4, [0.88, 0.82, 0.22]);
      }
      billboard(K(0.07), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // ===================================================================
      // s 0.04 both — Senna S chicane: angled kerb slabs + tyre-wall funnel
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          place(K(0.04 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
        }
      }
      // Tyre barriers stacked against the apex walls of the Senna S
      tyreWall(0.038, 0.058,  1, 3.2, [0.85, 0.30, 0.20]);
      tyreWall(0.042, 0.06,  -1, 3.2, [0.90, 0.90, 0.30]);
      marshalPost(K(0.05), 1, 9);

      // ===================================================================
      // s 0.07–0.20 L — Olympic Basin rowing lake (continuous water band)
      // ===================================================================
      {
        for (let i = 0; i < 10; i++) {
          const bk = K(0.065 + i * 0.015);
          waterSurface(bk, -1, 26, [58, 0.3, 110], BASIN, {
            id: `montreal-olympic-basin-north-${i}`,
          });
        }
      }
      // Far bank of the basin: dense broadleaf forestEdge (pushed out across the water)
      // (increased gap from 36m to 42m to clear curve intrusion around s=0.20)
      forestEdge(0.07, 0.19, -1, 42, {
        density: 0.75, hMin: 9, hMax: 16,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.2
      });
      // Far bank low treeline backdrop across the water (green → engine renders as rounded mounds)
      for (let i = 0; i < 12; i++) {
        const k = K(0.08 + (i / 12) * 0.12);
        backdrop(k, -1, 140 + hash(i * 11) * 25, [20, 7 + hash(i * 5) * 5, 20], [0.16, 0.30, 0.17]);
      }

      // ── s 0.10 L — Rowing regatta spectator platform overlooking the basin ──
      // A simple concrete deck on stilts — like the permanent grandstand at the
      // 1976 Olympic rowing venue on the island.
      {
        const k = K(0.10);
        const a = anchor(k, -1, 28);
        const b = [a.r, a.u, a.t];
        // Platform deck: 30 m long, 6 m wide, 3 m above ground
        addBox(out, vadd(a.c, a.u, 3.0), [6, 0.4, 30], [0.76, 0.77, 0.80], b);
        // Low railing walls along the long edges (track-side and water-side)
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r,  3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        addBox(out, vadd(vadd(a.c, a.u, 3.5), a.r, -3.1), [0.18, 0.8, 30], [0.72, 0.72, 0.74], b);
        // Four support columns
        for (const ot of [-11, -4, 4, 11]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.28, 3.0, [0.68, 0.68, 0.70], 6, b);
        }
      }

      // ===================================================================
      // s 0.13–0.35 — Parc Jean-Drapeau: parkland forestEdge both sides
      // (replaces old manual tree() loops that clipped into fences)
      // ===================================================================
      // Right verge: park trees from Senna S through the back of the island
      forestEdge(0.13, 0.19, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.23, 0.35, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left verge: treeline on the inner infield side
      forestEdge(0.13, 0.19, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      forestEdge(0.23, 0.30, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      // Shrub clumps for low-level ground greenery detail
      for (let i = 0; i < 18; i++) {
        const s = 0.16 + i * 0.0088;
        if (s >= 0.19 && s <= 0.23) continue;
        bush(K(s), (i % 2) ? 1 : -1, 9 + hash(i * 11) * 5,
          (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.38, 0.18]);
      }

      // ===================================================================
      // s 0.35–0.50 — Mid-island gap: forestEdge (previously bare)
      // The infield and outer park between the Casino complex and L'Épingle.
      // ===================================================================
      forestEdge(0.35, 0.50, 1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.12
      });
      forestEdge(0.35, 0.48, -1, 12, {
        density: 0.55, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });
      // Scattered bushes in the mid-island infield near the Casino approach
      for (let i = 0; i < 10; i++) {
        bush(K(0.37 + i * 0.012), (i % 2) ? 1 : -1, 10 + hash(i * 7) * 4,
          (i % 2) ? [0.20, 0.40, 0.18] : [0.24, 0.44, 0.20]);
      }

      // ===================================================================
      // s 0.25 R far — Casino de Montréal (Expo 67 French Pavilion silhouette)
      // Shorter finned pale mass (~30 m), NOT a 70 m glass tower.
      // ===================================================================
      {
        const k = K(0.25);
        const a = anchor(k, 1, 175);
        const b = [a.r, a.u, a.t];
        const PALE   = [0.82, 0.84, 0.88];   // Expo concrete / aluminium
        const PALE2  = [0.88, 0.90, 0.93];   // brighter fin faces
        const WIN    = [0.55, 0.68, 0.78];   // recessed glazing between fins
        const H = 30;                        // pavilion height (~25–35 m band)
        const W = 48, D = 36;                // wide low footprint
        out._mat = MAT.CONCRETE;
        // Main hall mass
        addBox(out, vadd(a.c, a.u, H / 2), [W, H, D], PALE, b);
        // Recessed glass ribbon mid-façade (reads as Expo curtain wall between fins)
        addBox(out, vadd(vadd(a.c, a.u, H * 0.42), a.r, -W / 2 - 0.15),
               [0.4, H * 0.55, D * 0.88], WIN, b);
        // Vertical fins along the track-facing façade (Expo 67 French Pavilion read)
        const NFIN = 9;
        for (let i = 0; i < NFIN; i++) {
          const ot = ((i / (NFIN - 1)) - 0.5) * (D - 4);
          addBox(out, vadd(vadd(vadd(a.c, a.u, H * 0.52), a.r, -W / 2 - 1.2), a.t, ot),
                 [2.4, H * 0.92, 1.1], PALE2, b);
        }
        // Low podium plinth under the hall
        addBox(out, vadd(a.c, a.u, 1.2), [W + 8, 2.4, D + 8], [0.76, 0.78, 0.82], b);
        // Shallow roof cap / parapet
        addBox(out, vadd(a.c, a.u, H + 1.0), [W + 2, 2.0, D + 2], PALE2, b);
        out._mat = 0;
      }

      // ── Near far-bank (Île Sainte-Hélène) strip across a water channel on the
      // NW (left) side: the Biosphère + La Ronde stand on THIS, beyond the river
      // margin, so they read as a neighbouring island across the water. ──
      for (let i = 0; i < 7; i++) {
        farBank(K(0.27 + i * 0.030), -1, 185, 320, 220);
      }

      // ===================================================================
      // s 0.30 L far — Biosphère geodesic dome (landmark across St. Lawrence)
      // Bare silver-grey steel lattice sphere (acrylic skin burned off 1976):
      // ~76 m wide, ~62 m high. Built as a stack of many thin frustum rings
      // following a near-spherical profile so the silhouette reads as a rounded
      // open dome, not a tiered tower. 18-sided frusta keep the geodesic feel.
      // ===================================================================
      {
        const k = K(0.30);
        const a = anchor(k, -1, 205);
        const DOME   = [0.86, 0.88, 0.91];  // bright steel-grey lattice
        const DOME_D = [0.80, 0.82, 0.86];  // very lightly shaded lower rings

        const R = 40;            // sphere radius → 80 m diameter
        const Y0 = -6;           // bury just the very bottom so it sits like a sphere
        const STK = 10;          // ring count over the visible hemisphere+
        let yPrev = Y0;
        // radius of the sphere at height y (relative to centre at R)
        const rAt = (y) => {
          const t = (y - R) / R;            // -1 (bottom) … +1 (top)
          return R * Math.sqrt(Math.max(0, 1 - t * t));
        };
        out._mat = MAT.METAL;
        for (let i = 1; i <= STK; i++) {
          const yTop = Y0 + ((R * 2 - Y0) * i) / STK;   // climb to ~80 m apex
          const h = yTop - yPrev;
          const rb = rAt(yPrev), rt = rAt(yTop);
          // keep the whole dome bright (only the very base slightly shaded) so the
          // silhouette reads as a rounded pale sphere, never a dark cone.
          const col = yPrev < R * 0.45 ? DOME_D : DOME;
          addFrustum(out, vadd(a.c, a.u, (yPrev + yTop) / 2), Math.max(rb, 1.5),
                     Math.max(rt, 1.0), h, col, 18, [a.r, a.u, a.t]);
          yPrev = yTop;
        }
        // Faint equatorial belt to read the geodesic banding at the widest point
        addFrustum(out, vadd(a.c, a.u, R), R + 0.4, R + 0.4, 1.2, DOME_D, 18, [a.r, a.u, a.t]);
        out._mat = 0;

        // ── GEODESIC STRUT LATTICE ──────────────────────────────────────────
        // Meridian ribs + latitude rings + a band of diagonals stretched over the
        // frustum shell so the silhouette reads as Buckminster Fuller's open steel
        // lattice (the acrylic skin burned off in 1976), not a smooth dome.
        const LAT = [0.60, 0.62, 0.66];               // steel lattice grey
        const surf = (y, phi) => vadd(vadd(vadd(a.c, a.u, y),
                     a.r, rAt(y) * Math.cos(phi)), a.t, rAt(y) * Math.sin(phi));
        const MER = 14, RN = 12;
        const yTopMax = R * 2 - 1.5;                  // stop just shy of the pole
        out._mat = MAT.METAL;
        // meridian ribs
        for (let m = 0; m < MER; m++) {
          const phi = m / MER * 6.2832;
          let prev = surf(0.5, phi);
          for (let j = 1; j <= RN; j++) {
            const y = 0.5 + (yTopMax - 0.5) * j / RN;
            const cur = surf(y, phi);
            strut(prev, cur, 0.28, LAT, 3);
            prev = cur;
          }
        }
        // latitude rings
        for (let j = 1; j < RN; j++) {
          const y = 0.5 + (yTopMax - 0.5) * j / RN;
          let prev = surf(y, 0);
          for (let m = 1; m <= MER; m++) {
            const cur = surf(y, m / MER * 6.2832);
            strut(prev, cur, 0.24, LAT, 3);
            prev = cur;
          }
        }
        // diagonal bracing on the mid bands → triangulated geodesic read
        for (let j = 3; j <= 8; j++) {
          const y0 = 0.5 + (yTopMax - 0.5) * j / RN;
          const y1 = 0.5 + (yTopMax - 0.5) * (j + 1) / RN;
          for (let m = 0; m < MER; m++) {
            const phi0 = m / MER * 6.2832, phi1 = (m + 1) / MER * 6.2832;
            strut(surf(y0, phi0), surf(y1, phi1), 0.16, LAT, 3);
          }
        }
        out._mat = 0;
      }

      // ===================================================================
      // s 0.28–0.48 L far — Montreal downtown skyline ACROSS the St. Lawrence
      //
      // A single cohesive cluster of mid-rise glass towers grounded on a far-bank
      // strip BEYOND a broad water channel on the NW bearing. Capped ~200–226 m
      // (1250 René-Lévesque 226 m / 1000 de La Gauchetière 205 m as the tallest)
      // — a downtown across the river, not a wall ringing the lap.
      // ===================================================================

      // Far-bank land the city stands on — pushed VERY far back and confined to a
      // narrow bearing so downtown reads as a faint hazy cluster on the horizon
      // (per the aerial, the city is far and small, NOT a near wall of towers).
      // Widened s-span (0.32→0.43) to fully cover the skyline placement below.
      for (let i = 0; i < 6; i++) {
        farBank(K(0.32 + i * 0.019), -1, 1500, 1760, 320, [0.36, 0.41, 0.40]);
      }

      // A single compact cluster of distant mid-rise towers on a narrow bearing,
      // pushed far back into the fog so they read as a faint hazy downtown — not
      // a wall ringing the lap. Tighter s-span, lower, fewer, much farther out.
      cityFront(0.36, 0.41, -1, 1520, {
        minH: 55, maxH: 130, depth: 26, step: 30,
        palette: [
          [0.56, 0.60, 0.66], [0.60, 0.62, 0.68],
          [0.52, 0.56, 0.62], [0.58, 0.60, 0.66],
        ],
        lit: false,
        windowCol: [0.64, 0.78, 0.96],
        floor: 6,
      });
      // A couple of taller hero towers in the middle of the cluster (René-Lévesque)
      for (let i = 0; i < 5; i++) {
        const k = K(0.37 + (i / 5) * 0.03);
        backdrop(k, -1, 1560 + hash(i * 19) * 70,
                 [22, 100 + hash(i * 13) * 70, 22], [0.54, 0.58, 0.64]);
      }

      // ===================================================================
      // s 0.45 R close — Casino corner footbridge spanning the track
      // ===================================================================
      {
        const k = K(0.45);
        const deckY = py[k] + 8;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 5);
          const h = deckY - a.c[1];
          const legH = h - 0.4;
          const center = vadd(a.c, a.u, h / 2);
          const basis = [a.r, a.u, a.t];
          modelGroup(`montreal-casino-footbridge-support-${side < 0 ? "left" : "right"}`, {
            center,
            size: [1.1, h, 3.4],
            basis,
          }, (stage) => {
            for (const along of [-1.2, 1.2]) {
              addBox(stage, vadd(vadd(a.c, a.t, along), a.u, legH / 2),
                [0.65, legH, 0.65], [0.60, 0.62, 0.64], basis);
            }
            addBox(stage, vadd(a.c, a.u, h - 0.2),
              [1.1, 0.4, 3.4], [0.66, 0.68, 0.70], basis);
          }, { required: true });
        }
        overheadSpan({
          id: "montreal-casino-footbridge",
          frac: 0.45,
          clearance: 8,
          thickness: 1,
          depth: 4,
          supportGap: 5,
          color: [0.68, 0.70, 0.72],
          required: true,
        });
      }

      // ===================================================================
      // s 0.45 R far — La Ronde amusement park ferris wheel across the water
      // ===================================================================
      // La Ronde sits on Île Sainte-Hélène across the water — place on the farBank
      // strip (near=185) so the bases don't float over open water.
      ferrisWheel(K(0.42), 1, 200, 34);
      // fairground tower beside ferris wheel
      tower(K(0.40), 1, 220, 14, 46,
        { col: [0.78, 0.62, 0.40], seg: 6, cap: true, capCol: [0.8, 0.3, 0.2], mast: 10 });

      // ===================================================================
      // s 0.55 both — L'Épingle hairpin: tight U of walls + grandstand
      // ===================================================================
      grandstand(0.55,  1, 12, 70, [0.48, 0.49, 0.54], [0.60, 0.36, 0.32]);
      grandstand(0.53, -1, 12, 60, [0.46, 0.47, 0.52], [0.58, 0.38, 0.34]);
      grandstand(0.57,  1, 13, 60, [0.50, 0.51, 0.55], [0.62, 0.38, 0.34]);
      for (const side of [-1, 1]) {
        for (let j = 0; j < 3; j++) place(K(0.55 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_R : KERB_W);
      }
      // Tyre walls + marshal post packed around the slow hairpin apex
      tyreWall(0.545, 0.565, -1, 3.0, [0.90, 0.85, 0.20]);
      tyreWall(0.548, 0.568,  1, 3.0, [0.85, 0.30, 0.20]);
      marshalPost(K(0.55), -1, 9);
      billboard(K(0.52),  1, 11, 12, 4, [0.30, 0.50, 0.85]);
      billboard(K(0.58), -1, 11, 12, 4, [0.88, 0.82, 0.22]);

      // ===================================================================
      // s 0.58–0.75 R — Casino/back Straight: the long Olympic Basin flanks the
      // straight (the island's identity — ~half the lap runs alongside it).
      // Water slab sits close to the verge so it reads as the immediate flank;
      // the parkland treeline is pushed out to the far bank behind it.
      // ===================================================================
      {
        for (let i = 0; i < 7; i++) {
          const bk = K(0.565 + i * 0.019);
          waterSurface(bk, 1, 24, [62, 0.3, 120], BASIN, {
            id: `montreal-olympic-basin-straight-${i}`,
          });
        }
      }
      // Small white regatta lane/start towers standing in the basin water
      for (const s of [0.60, 0.67]) {
        const a = anchor(K(s), 1, 22);
        if (onTrack(a.c[0], a.c[2], 2)) continue;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3.0), [2.0, 6.0, 2.0], [0.86, 0.87, 0.90], b);
        addBox(out, vadd(a.c, a.u, 6.2), [2.6, 0.5, 2.6], [0.70, 0.72, 0.76], b);
      }
      // Right verge: island parkland trees on the FAR bank beyond the basin
      forestEdge(0.575, 0.65, 1, 38, {
        density: 0.70, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.20
      });
      // Left verge: infield trees along the Casino straight
      forestEdge(0.58, 0.65, -1, 28, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });

      // ── s 0.65 L — Concrete spectator grandstand on the Casino straight ──
      // Modelled after the permanent stands that overlook the run between
      // L'Épingle and the final chicane (the busiest spectator zone on the island).
      // (increased gap from 11m→14m→18m to clear curve intrusion at s=0.72)
      grandstand(0.65, -1, 18, 80, [0.48, 0.50, 0.55], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.66–0.90 — Back stretch through Parc Jean-Drapeau (parkland)
      // ===================================================================
      // Grandstand midway on the back straight
      // (increased gap from 11m→14m→18m to clear curve intrusion)
      grandstand(0.74, -1, 18, 64, [0.48, 0.49, 0.54], [0.56, 0.40, 0.36]);

      // Canal / water feature off the right verge — island park internal canal
      {
        for (let i = 0; i < 2; i++) {
          const ck = K(0.78 + i * 0.023);
          waterSurface(ck, 1, 70, [28, 0.3, 74], RIVER, {
            id: `montreal-park-canal-${i}`,
          });
        }
      }
      billboard(K(0.84), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // Parkland forestEdge: back straight and final sector
      // (replaces scattered tree() calls with clipping-safe placement)
      forestEdge(0.84, 0.92, 1, 14, {
        density: 0.68, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left-side forestEdge resumes beyond the foldback around s=0.72.
      forestEdge(0.78, 0.90, -1, 25, {
        density: 0.60, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      // ── s 0.80 R — Small park pavilion / timing tower beside the back straight ──
      // Montreal's infield contains several permanent buildings from the 1976 Games
      // including the lightweight pavilions that now house race infrastructure.
      {
        const k = K(0.80);
        building(k, 1, 28, 18, 12, 16,
          { wall: [0.74, 0.76, 0.80], window: [0.52, 0.64, 0.76], floor: 3, roof: true });
      }

      // ===================================================================
      // s 0.92 both — Final chicane: tight kerb funnel + tyre walls
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) place(K(0.92 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
      }
      tyreWall(0.915, 0.935, -1, 3.0, [0.90, 0.85, 0.20]);
      marshalPost(K(0.93), -1, 9);
      grandstand(0.93, -1, 12, 70, [0.48, 0.49, 0.54], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.95–0.99 R — Wall of Champions: taller pale hero wall + signage
      // ===================================================================
      // Iconic outer wall right on the final-chicane exit — taller pale concrete
      // so it reads as a hero beat at speed (not a low verge barrier).
      wall(0.955, 0.99, 1, 0.8, 3.6, [0.84, 0.85, 0.87], 0.7);

      // Red "Bienvenue" signature stripe on the wall face.
      {
        const k = K(0.97);
        const a = anchor(k, 1, 0.78);
        addBox(out, vadd(a.c, a.u, 1.8), [0.10, 0.70, 22], [0.88, 0.20, 0.18], [a.r, a.u, a.t]);
      }
      // "Bienvenue / Bonjour Québec" tourism panel — the defining signage of the
      // Wall of Champions exit. Long Québec-blue board on posts just behind the
      // outer wall, with a white cross band (fleur-de-lis read at distance).
      {
        const k = K(0.972);
        const a = anchor(k, 1, 2.4);
        const b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 2)) {
          for (const ot of [-11, -4, 4, 11]) {
            addCyl(out, vadd(a.c, a.t, ot), 0.14, 5.8, [0.32, 0.32, 0.35], 5, b);
          }
          // Main panel: Québec blue field
          addBox(out, vadd(a.c, a.u, 5.4), [0.14, 2.4, 26], [0.14, 0.32, 0.64], b);
          // White horizontal cross band
          addBox(out, vadd(a.c, a.u, 5.4), [0.18, 0.55, 26], [0.94, 0.95, 0.98], b);
          // White vertical cross (centre fleur-de-lis stub)
          addBox(out, vadd(a.c, a.u, 5.4), [0.18, 2.4, 0.7], [0.94, 0.95, 0.98], b);
          // Thin red "Bienvenue" accent bar under the panel
          addBox(out, vadd(a.c, a.u, 4.0), [0.12, 0.35, 22], [0.88, 0.18, 0.16], b);
        }
      }
      // Grandstand viewing the Wall + final chicane
      grandstand(0.97, -1, 12, 90, [0.50, 0.51, 0.56], [0.60, 0.36, 0.30]);
      billboard(K(0.96), -1, 12, 14, 4, [0.88, 0.82, 0.22]);
    },
  }
  );
})();
