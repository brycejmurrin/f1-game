/* Apex 26 — MONTREAL circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.28, 0.44, 0.7], horizon: [0.68, 0.74, 0.8], grass: [0.22, 0.48, 0.18], runoff: [0.42, 0.4, 0.38], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    segs: [
      { t: 0, l: 380 }, { t: 80, l: 90 }, { t: -90, l: 100 }, { t: 0, l: 300 }, { t: 90, l: 90 }, { t: 0, l: 420 },
      { t: -80, l: 90 }, { t: 60, l: 70 }, { t: -60, l: 70 }, { t: 0, l: 220 }, { t: 100, l: 110 }, { t: -100, l: 110 },
    ],
    // Île Notre-Dame: very slight rise through the casino hairpin complex.
    elevations: [{ s: 0.52, halfM: 340, rise: 4 }],
    // The lap sits on a man-made ISLAND in the St. Lawrence. End the green
    // terrain ribbon at a believable shoreline (~70 m) so river water takes over
    // beyond it — no green extending to infinity, no bare grey void.
    terrainOuter: 70,
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, wall, grandstand,
        tree, building, anchor, addBox, addCyl, addFrustum, addCone, vadd, hash,
        fence, guardrail, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        ferrisWheel, tower, onTrack, groundYAt, forestEdge, cityFront } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Île Notre-Dame palette (bright June day) ----
      const WALL     = [0.78, 0.79, 0.80];   // pale concrete
      const RIVER    = [0.16, 0.46, 0.52];   // St. Lawrence — vivid turquoise river
      const RIVER2   = [0.20, 0.52, 0.58];   // lighter near-shore turquoise
      const BASIN    = [0.13, 0.34, 0.46];   // Olympic rowing lake (deeper clean blue)
      const GRASS    = [0.28, 0.52, 0.26];   // park green
      const FOLIAGE  = [0.20, 0.44, 0.24];   // deep tree green
      const FOLIAGE2 = [0.26, 0.50, 0.26];   // lighter June foliage
      const HEDGE    = [0.20, 0.40, 0.20];   // clipped hedge green

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      // ── Lamp-post helper: upright mast + luminaire head (day silhouette, night emissive read) ──
      // Placed at dist metres beyond the edge; small enough to never conflict with barriers.
      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 2)) return;
        // mast
        addCyl(out, a.c, 0.09, 8.5, [0.32, 0.32, 0.34], 5, b);
        // arm bracket
        addBox(out, vadd(a.c, a.u, 8.5), [0.08, 0.08, 1.6], [0.30, 0.30, 0.32], b);
        // luminaire head (bright warm yellow-white — reads emissive at night)
        addBox(out, vadd(vadd(a.c, a.u, 8.5), a.t, 0.8), [0.5, 0.22, 0.7], [0.98, 0.97, 0.82], b);
      };

      // ── Flag mast helper: slender pole with a coloured pennant box at the top ──
      const flagMast = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist);
        const b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 1.5)) return;
        addCyl(out, a.c, 0.07, h, [0.30, 0.30, 0.33], 5, b);
        addBox(out, vadd(a.c, a.u, h - 0.7), [0.04, 1.4, 2.4], col, b);
      };

      // ===================================================================
      // St. Lawrence River — broad water surround framing the whole island.
      // The lap reads as a flat green island ringed by water; the green
      // terrain ribbon (terrainOuter) ends at a shoreline ~70 m out and these
      // big flat slabs take over beyond it, out toward the horizon. Water top
      // sits just below road grade (pyMin - 1.0) so it never covers the road
      // but hides the universal green ground-floor, removing the "grass to
      // infinity" look. Cheap: a handful of very large flat boxes.
      // ===================================================================
      {
        // Lap bounding box in world XZ (centreline extent).
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, cx = 0, cz = 0;
        for (let i = 0; i < n; i++) {
          if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i];
          if (pz[i] < minz) minz = pz[i]; if (pz[i] > maxz) maxz = pz[i];
          cx += px[i]; cz += pz[i];
        }
        cx /= n; cz /= n;
        const base = pyMin || 0;
        // (1) One broad flat WATER plane filling the whole world out to the
        //     horizon. CRITICAL: the engine's universal floor plane sits below
        //     pyMin (≈ pyMin-3), so the water surface (pyMin - 0.45) sits above it
        //     and reads as the St. Lawrence ringing the island.
        const wTop = base - 0.45, TH = 8;
        addBox(out, [cx, wTop - TH / 2, cz],
               [(maxx - minx) + 4800, TH, (maxz - minz) + 4800], RIVER);
        // (1b) Lighter near-shore turquoise band just inside the broad river, to
        //      give the water depth gradient seen in the aerial (paler shallows
        //      hugging the island, deeper river beyond). Sits a hair above (1).
        addBox(out, [cx, base - 0.42 - TH / 2, cz],
               [(maxx - minx) + 900, TH, (maxz - minz) + 900], RIVER2);
        // (2) The flat green ISLAND itself: a NARROW slab hugging the lap footprint
        //     plus a tight shoreline margin, sitting just ABOVE the water (top at
        //     pyMin - 0.2). Île Notre-Dame is a thin island, so the margin is kept
        //     small — river then shows on BOTH long sides right up near the track,
        //     reading as the narrow island between two channels.
        const M = 58;                        // tight shoreline margin past the track
        addBox(out, [cx, base - 0.2 - 3, cz],
               [(maxx - minx) + 2 * M, 6, (maxz - minz) + 2 * M], GRASS);
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
        // a.c sits on the lap baseline (pyMin) out here; lift the slab so its top
        // is at pyMin - 0.3, i.e. just proud of the water surface (pyMin - 1.0).
        addBox(out, vadd(a.c, a.u, -0.3 - H / 2),
               [lenM, H, depth], col || FARBANK, [a.r, a.u, a.t]);
      };

      // ── Inner lagoon + Jean-Doré Beach (per aerial reference) ──────────────
      // A distinctive irregular lake with a pale tan SAND beach crescent sits in
      // the island interior. Seated just ABOVE the green island slab (whose top
      // is pyMin-0.2) so the water reads instead of being hidden by it.
      {
        const LAGOON = [0.13, 0.34, 0.42];   // clean blue-green lagoon water
        const SAND   = [0.88, 0.80, 0.58];   // Jean-Doré beach sand (pale tan)
        // Anchor the lagoon in the wide infield off the inside of the back straight
        // (track-aligned basis), so it nests in the island interior at a known spot
        // and reads from above instead of landing on/near the road centroid.
        const lk = K(0.65);
        const a = anchor(lk, -1, 80);        // ~80 m into the infield, track-left
        const b = [a.r, a.u, a.t];
        // NOTE: with a track basis [r,u,t], addBox sz maps as
        // [lateral(r), vertical(u), tangent(t)]. Water = wide+long, thin vertical.
        // irregular lagoon body — overlapping lobes for an organic shoreline.
        addBox(out, vadd(a.c, a.u, -1.9),                 [135, 4, 175], LAGOON, b);
        addBox(out, vadd(vadd(a.c, a.t, 70), a.u, -1.9),  [92,  4, 105], LAGOON, b);
        addBox(out, vadd(vadd(a.c, a.t, -64), a.u, -1.9), [80,  4, 78],  LAGOON, b);
        // pale tan SAND beach crescent on the track-facing edge (Jean-Doré),
        // raised clearly above the water so it reads as the signature beach.
        addBox(out, vadd(vadd(a.c, a.r, 64), a.u, 0.30),                [38, 0.6, 150], SAND, b);
        addBox(out, vadd(vadd(vadd(a.c, a.t, 58), a.r, 50), a.u, 0.30), [30, 0.6, 82],  SAND, b);
        addBox(out, vadd(vadd(vadd(a.c, a.t, -56), a.r, 46), a.u, 0.30),[26, 0.6, 56],  SAND, b);
        // low green spit poking into the lagoon
        addBox(out, vadd(vadd(a.c, a.t, -6), a.u, 0.20), [30, 0.7, 44], GRASS, b);
      }

      // ===================================================================
      // Continuous pale concrete walls lining both edges (FLAT island)
      // ===================================================================
      wall(0.0, 1.0, -1, 2.5, 1.5, WALL);
      wall(0.0, 1.0,  1, 2.5, 1.5, WALL);

      // Catch / debris fence behind the walls — the tight street-style corridor.
      fence(0.0, 1.0, -1, 3.4, 3.0, [0.72, 0.74, 0.78]);
      fence(0.0, 1.0,  1, 3.4, 3.0, [0.72, 0.74, 0.78]);

      // Wide parkland ground planes both sides — groundPlane() aligns to local track
      // height so patches don't clip through elevated sections.
      // Right verge: park lawns from Senna S through the Casino complex
      for (let i = 0; i < 14; i++) {
        groundPlane(K(0.08 + i * 0.058),  1, 9, [55, 0.6, 52], GRASS);
      }
      // Left verge: island interior from basin entry to back straight
      for (let i = 0; i < 10; i++) {
        groundPlane(K(0.10 + i * 0.068), -1, 9, [50, 0.6, 48], GRASS);
      }

      // Continuous low clipped hedge / treeline ribbon framing the verges
      hedge(0.13, 0.24,  1, 9, 1.6, HEDGE);
      hedge(0.38, 0.50,  1, 9, 1.4, HEDGE);   // mid-island right verge
      hedge(0.62, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.90,  1, 9, 1.6, HEDGE);

      // Marshal posts spaced around the lap (orange-roofed bunkers + flag pole)
      for (const s of [0.05, 0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, 8.5);
      }

      // Lamp posts: pit straight + back half of lap (both sides, 40 m spacing)
      for (let i = 0; i < 20; i++) {
        const s = 0.96 + i * 0.002;   // pit straight approach (short spacing)
        lampPost(K(s), (i % 2) ? 1 : -1, 6.5);
      }
      for (let i = 0; i < 28; i++) {
        const s = 0.60 + i * 0.013;   // back straight / Casino straight
        lampPost(K(s), (i % 2) ? 1 : -1, 6.5);
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
      for (let i = 0; i < 10; i++) {
        groundPlane(K(0.063 + i * 0.0155), -1, 15, [200, 2, 300], BASIN);
      }
      // Far bank of the basin: dense broadleaf forestEdge (pushed out across the water)
      forestEdge(0.07, 0.21, -1, 36, {
        density: 0.75, hMin: 9, hMax: 16,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.2
      });
      // Far bank low treeline backdrop across the water (green → engine renders as rounded mounds)
      for (let i = 0; i < 12; i++) {
        const k = K(0.08 + (i / 12) * 0.12);
        backdrop(k, -1, 140 + hash(i * 11) * 25, [20, 7 + hash(i * 5) * 5, 20], [0.22, 0.40, 0.22]);
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
      forestEdge(0.13, 0.35, 1, 12, {
        density: 0.72, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      // Left verge: treeline on the inner infield side
      forestEdge(0.13, 0.30, -1, 12, {
        density: 0.60, hMin: 7, hMax: 12,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.10
      });

      // Shrub clumps for low-level ground greenery detail
      for (let i = 0; i < 18; i++) {
        bush(K(0.16 + i * 0.0088), (i % 2) ? 1 : -1, 9 + hash(i * 11) * 5,
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
      // s 0.25 R far — Casino de Montréal (faceted pale Expo pavilion)
      // ===================================================================
      {
        // Main hall: inner face at gap 170 m, footprint 40 m wide × 40 m deep, 70 m tall
        const k = K(0.25);
        building(k, 1, 170, 40, 70, 40,
          { wall: [0.80, 0.82, 0.86], window: [0.60, 0.72, 0.84], floor: 6,
            lit: true, windowCol: [0.90, 0.95, 1.0] });

        // Stepped upper blocks placed via anchor, ABOVE the main hall roof.
        const a = anchor(k, 1, 190);
        // First step: 30×30 × 16 m, rising from height 72 (2 m above roof to avoid z-fight)
        addBox(out, vadd(a.c, a.u, 72 + 8),  [30, 16, 30], [0.84, 0.86, 0.90], [a.r, a.u, a.t]);
        // Second step: 18×18 × 12 m, on top of first step
        addBox(out, vadd(a.c, a.u, 72 + 16 + 2 + 6), [18, 12, 18], [0.87, 0.89, 0.93], [a.r, a.u, a.t]);
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
      for (let i = 0; i < 4; i++) {
        farBank(K(0.35 + i * 0.018), -1, 1500, 1760, 320, [0.36, 0.41, 0.40]);
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
        const a = anchor(k, 1, 5);
        // Deck: 28 m span, 1.0 m thick, 4 m wide — sits at 8 m height (clear of cars)
        addBox(out, vadd(a.c, a.u, 8.5), [28, 1.0, 4], [0.68, 0.70, 0.72], [a.r, a.u, a.t]);
        // Two support legs on the right side; left side anchors to the grandstand
        for (const ot of [-1.5, 1.5]) {
          addCyl(out, vadd(vadd(a.c, a.t, ot), a.u, 0), 0.35, 8.5,
                 [0.60, 0.62, 0.64], 6, [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.45 R far — La Ronde amusement park ferris wheel across the water
      // ===================================================================
      ferrisWheel(K(0.42), 1, 150, 34);
      // a couple of fairground towers beside it
      tower(K(0.40), 1, 175, 14, 46,
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
      for (let i = 0; i < 9; i++) {
        groundPlane(K(0.565 + i * 0.0145), 1, 15, [180, 2, 320], BASIN);
      }
      // Small white regatta lane/start towers standing in the basin water
      for (const s of [0.60, 0.67, 0.73]) {
        const a = anchor(K(s), 1, 22);
        if (onTrack(a.c[0], a.c[2], 2)) continue;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3.0), [2.0, 6.0, 2.0], [0.86, 0.87, 0.90], b);
        addBox(out, vadd(a.c, a.u, 6.2), [2.6, 0.5, 2.6], [0.70, 0.72, 0.76], b);
      }
      // Right verge: island parkland trees on the FAR bank beyond the basin
      forestEdge(0.575, 0.75, 1, 30, {
        density: 0.80, hMin: 8, hMax: 15,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.20
      });
      // Left verge: infield trees along the Casino straight
      forestEdge(0.58, 0.72, -1, 12, {
        density: 0.65, hMin: 7, hMax: 13,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });

      // ── s 0.65 L — Concrete spectator grandstand on the Casino straight ──
      // Modelled after the permanent stands that overlook the run between
      // L'Épingle and the final chicane (the busiest spectator zone on the island).
      grandstand(0.65, -1, 11, 80, [0.48, 0.50, 0.55], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.66–0.90 — Back stretch through Parc Jean-Drapeau (parkland)
      // ===================================================================
      // Grandstand midway on the back straight
      grandstand(0.74, -1, 11, 64, [0.48, 0.49, 0.54], [0.56, 0.40, 0.36]);

      // Canal / water feature off the right verge — island park internal canal
      for (let i = 0; i < 3; i++) {
        groundPlane(K(0.78 + i * 0.020), 1, 16, [130, 2, 160], RIVER);
      }
      // Far treeline backdrop on the canal's far bank (green → organic mounds in engine)
      for (let i = 0; i < 8; i++) {
        backdrop(K(0.78 + (i / 8) * 0.08), 1, 135 + hash(i * 11) * 25, [22, 8, 22], [0.20, 0.40, 0.22]);
      }
      billboard(K(0.84), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // Parkland forestEdge: back straight and final sector
      // (replaces scattered tree() calls with clipping-safe placement)
      forestEdge(0.75, 0.92, 1, 14, {
        density: 0.68, hMin: 8, hMax: 14,
        col: FOLIAGE, col2: FOLIAGE2, pineFrac: 0.15
      });
      forestEdge(0.66, 0.90, -1, 12, {
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
      // s 0.95–0.99 R — Wall of Champions: iconic concrete wall + red stripe
      // ===================================================================
      // The outer wall sits at gap=0.8 m from the road edge, 1.8 m tall.
      wall(0.955, 0.99, 1, 0.8, 1.8, [0.80, 0.81, 0.82], 0.6);

      // Red "Bienvenue" signature stripe on the wall face.
      {
        const k = K(0.97);
        const a = anchor(k, 1, 0.78);
        addBox(out, vadd(a.c, a.u, 1.0), [0.08, 0.50, 18], [0.88, 0.20, 0.18], [a.r, a.u, a.t]);
      }
      // "Bonjour Québec" tourism banner above the Wall of Champions — the
      // defining signage of the final-chicane exit. A long fleur-de-lis blue
      // billboard panel raised on slim posts just behind the outer wall.
      {
        const k = K(0.965);
        const a = anchor(k, 1, 2.2);
        const b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 2)) {
          for (const ot of [-9, 9]) {
            addCyl(out, vadd(a.c, a.t, ot), 0.12, 4.6, [0.30, 0.30, 0.33], 5, b);
          }
          // Banner panel: Québec blue field
          addBox(out, vadd(a.c, a.u, 4.6), [0.12, 1.8, 19], [0.16, 0.34, 0.66], b);
          // White fleur-de-lis cross band across the panel
          addBox(out, vadd(vadd(a.c, a.u, 4.6), a.t, 0), [0.16, 0.45, 19], [0.92, 0.93, 0.96], b);
        }
      }
      // Grandstand viewing the Wall + final chicane
      grandstand(0.97, -1, 12, 90, [0.50, 0.51, 0.56], [0.60, 0.36, 0.30]);
      billboard(K(0.96), -1, 12, 14, 4, [0.88, 0.82, 0.22]);
    },
  }
  );
})();
