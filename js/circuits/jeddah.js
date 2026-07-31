/* Apex 26 — JEDDAH circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9625, // GPS-derived (OpenF1 2025, conf=0.696)
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    street: true,
    barrierGap: 3.4,
    terrainOuter: 28,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // The generic city supplies the deep inland skyline behind the bespoke
      // cityFront sectors; only the Red Sea waterfront stays open so the
      // corniche landmarks read against the water.
      { kind: "city", s0: 0.05, s1: 0.66, side: 1 },
      // The bespoke 40 m LED-head rhythm is the circuit's lighting identity;
      // generic street lamps crowd the wall and clip the fastest curved sweeps.
      { kind: "lamps", s0: 0, s1: 1 },
      // The Red Sea, marina, and lagoon stay open on the seaward side. Bespoke
      // palms below supply the intentional waterfront planting.
      { kind: "foliage", s0: 0.05, s1: 0.66, side: 1 },
    ],
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.10, 0.08, 0.16], zenith: [0.05, 0.05, 0.15], sunColor: [0.65, 0.68, 0.82], ambientSky: [0.22, 0.22, 0.32], ambientGround: [0.20, 0.18, 0.24], fogColor: [0.08, 0.08, 0.14], fogDensity: 0.0018, concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: 80, l: 70 }, { t: -75, l: 60 }, { t: 0, l: 120 }, { t: 70, l: 65 }, { t: -70, l: 60 },
      { t: 0, l: 300 }, { t: -90, l: 80 }, { t: 0, l: 600 }, { t: -90, l: 80 }, { t: 65, l: 70 }, { t: -70, l: 70 },
    ],
    // Jeddah's headline vertical feature IS camber: three corners are banked up
    // to 12° in reality (the long left onto the north loop, the sweeper after it,
    // and the final right). Modelled a little shallower here so the AI line and
    // the wall geometry stay sane; the rest of the lap is street-crown 3°.
    bankZones: [
      { frac: 0.1825, angleDeg: 3.0, widthM: 90 },
      { frac: 0.2662, angleDeg: 3.0, widthM: 160 },
      { frac: 0.3188, angleDeg: 3.0, widthM: 160 },
      { frac: 0.4792, angleDeg: 7.0, widthM: 240 },   // banked left onto the north loop
      { frac: 0.5552, angleDeg: 6.0, widthM: 200 },   // banked sweeper
      { frac: 0.6110, angleDeg: 3.0, widthM: 120 },
      { frac: 0.9981, angleDeg: 6.0, widthM: 120 },   // banked final right
    ],
    // Reclaimed seafront: still a drainage-scale grade, but the trace shipped
    // essentially level (2.2 m) where the real corniche rolls ~9 m across the
    // lap. Long wavelengths only — every gradient stays under ~2 %.
    elevations: [
      { s: 0.16, halfM: 520, rise: 6.5 },
      { s: 0.30, halfM: 480, rise: -3.0 },
      { s: 0.62, halfM: 460, rise: 5.0 },
      { s: 0.84, halfM: 300, rise: -1.5 },
    ],
    scenery: function (api) {
      const { out, MAT, n, pyMin, place, backdrop,
        addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, anchor, vadd, building, tower, billboard,
        grandstand, gantry, marshalPost, guardrail, tyreWall, wall, palm,
        cityFront, modelGroup, waterSurface, waterBand, onTrack, hash, every, circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Night Corniche palette ─────────────────────────────────────────────
      const SEA     = [0.02, 0.04, 0.08];   // deep black-mirror water
      const SPANGLE = [1.0,  0.80, 0.40];   // warm amber reflections
      const LED     = [0.92, 0.96, 1.0 ];   // cool-white LED
      const WINWARM = [1.0,  0.84, 0.48];   // warm interior windows
      const WINCOOL = [0.58, 0.82, 1.0 ];   // cool glass tower windows
      const WINGOLD = [1.0,  0.76, 0.28];   // deep sodium glow
      const WINTEAL = [0.42, 0.96, 0.94];   // teal accent glass
      const GREEN   = [0.10, 0.56, 0.24];   // Saudi-green livery stripe
      const GOLD    = [0.95, 0.80, 0.12];   // Saudi gold accent
      const GREY    = [0.72, 0.72, 0.74];   // pale concrete canyon wall
      const MAGENTA = [0.96, 0.28, 0.64];   // neon magenta accent
      const DARKPOLE= [0.09, 0.09, 0.12];   // lamp-pole shaft
      const POOLAMB = [0.44, 0.38, 0.22];   // amber pool on tarmac

      const WALL_INL = [[0.17, 0.18, 0.23], [0.19, 0.20, 0.25],
                        [0.15, 0.16, 0.21], [0.21, 0.21, 0.26]];

      // ── Corniche hospitality decks — pit lane and marina hero pockets ─────
      // Atomic kit models stay well behind the barriers and frame the event
      // without adding tall masses to the circuit's high-speed sightlines.
      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:jeddah:pit-hospitality", frac: 0.035, side: -1, gap: 72,
          size: [20, 10, 42], modules: 6,
        });
        circuitKit.hospitality({
          id: "kit:jeddah:marina-hospitality", frac: 0.455, side: 1, gap: 112,
          size: [22, 11, 46], modules: 6,
        });
      }

      // ── Simple helpers ─────────────────────────────────────────────────────
      // Floodlight mast: pole + lamp bar + ambient pool (sparse drama accents)
      const floodMast = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 5)) return;
        addCyl(out, a.c, 0.65, 38, DARKPOLE, 6, b);
        addBox(out, vadd(a.c, a.u, 35.5), [8.0, 1.6, 1.0], LED, b);
        addBox(out, vadd(a.c, a.u, 0.20), [5.0, 0.28, 5.0], POOLAMB, b);
      };

      // Slim cool-white LED head — light-tunnel identity (cheap: thin pole + cap)
      const ledHead = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 2)) return;
        addCyl(out, a.c, 0.10, 7.5, DARKPOLE, 4, b);
        addBox(out, vadd(a.c, a.u, 7.5), [0.55, 0.45, 0.55], LED, b);
      };

      // Light tower: slim column + cool LED head (taller accents)
      const lightTower = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 3)) return;
        addCyl(out, a.c, 0.40, 22, DARKPOLE, 5, b);
        addBox(out, vadd(a.c, a.u, 22.0), [3.0, 1.2, 3.0], LED, b);
      };

      // ── 1. Grey concrete canyon + intermittent Saudi green/gold accents ───
      // Prefer shared helper when present; else pale wall() + sparse stripe boxes.
      // Heights 1.3–1.5 m read as Jersey barriers (not the solid-green night rails).
      const canyon = api.concreteCanyon || ((s0, s1, side, gap, opts) => {
        const h = (opts && opts.h) != null ? opts.h : 1.4;
        const col = (opts && opts.col) || GREY;
        const thick = (opts && opts.thick) != null ? opts.thick : 0.45;
        wall(s0, s1, side, gap, h, col, thick);
        const step = (opts && opts.stripeStep) != null ? opts.stripeStep : 0.028;
        let si = 0;
        for (let s = s0; s < s1 - 1e-6; s += step, si++) {
          if (hash(si * 7.3 + side * 2.1 + s * 40) > 0.38) continue; // intermittent
          const stripe = (si % 2) ? GREEN : GOLD;
          place(K(s), side, gap + 0.15, [0.12, 0.55, 3.2], stripe);
        }
      });
      for (const side of [-1, 1]) {
        canyon(0.00, 0.47, side, 3.50, { h: 1.35 + (side > 0 ? 0.05 : 0.10) });
        canyon(0.47, 0.53, side, 4.20, { h: 1.40 + (side > 0 ? 0.08 : 0.00) });
        canyon(0.53, 1.00, side, 3.50, { h: 1.40 + (side > 0 ? 0.08 : 0.00) });
      }

      // ── 3. Cool-white LED light tunnel — densify both sides ~every 40 m ───
      if (typeof api.floodMastRing === "function") {
        api.floodMastRing(40, { dist: 5.5, cool: true });
      } else {
        every(40, (k) => {
          ledHead(k, 1, 5.0 + hash(k * 1.7) * 1.2);
          ledHead(k, -1, 5.4 + hash(k * 2.3) * 1.4);
        });
      }
      // Sparse tall flood / tower accents (not the primary tunnel rhythm)
      for (let i = 0; i < 4; i++) {
        floodMast(K(i / 4 + 0.02), (i % 2) ? -1 : 1, 20 + (i % 2) * 6);
      }
      for (let i = 0; i < 4; i++) {
        lightTower(K(i / 4 + 0.08), (i % 2) ? 1 : -1, 11 + (i % 2) * 2);
      }

      // ── Palm trees: Corniche signature (inland + sparse marina/lagoon only) ─
      // Cull palms on the open Red Sea corridor (s≈0.05–0.40 R) so water reads.
      const PALMFROND = [0.12, 0.44, 0.19];
      for (let i = 0; i < 8; i++) {
        palm(K(0.42 + i * 0.04), 1, 18 + hash(i * 5) * 4, 6 + hash(i * 3) * 3, PALMFROND);
      }
      for (let i = 0; i < 8; i++) {
        palm(K(i / 8 + 0.01), -1, 22 + hash(i * 7) * 5, 7 + hash(i * 11) * 3, [0.08, 0.36, 0.14]);
      }
      // Dense, low Corniche promenade avenue around the lagoon hero sector.
      // The 13 m setback keeps trunks behind the concrete canyon and leaves the
      // open-sea straight (s 0.05–0.40) visually unobstructed.
      for (let i = 0; i < 9; i++) {
        palm(K(0.545 + i * 0.012), 1, 13 + (i % 2) * 3,
          6.5 + hash(i * 17 + 4) * 2.5, (i % 3) ? PALMFROND : [0.16, 0.50, 0.22]);
      }

      // ── Marshal posts ─────────────────────────────────────────────────────
      for (const [s, side] of [[0.06, -1], [0.13, 1], [0.34, -1], [0.49, 1],
        [0.62, -1], [0.74, 1], [0.81, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 2.4);
      }

      // ── Red Sea + marina: continuous bands, not spaced panels ─────────────
      // These were 8 and 7 fixed slabs dropped at even fractions. The stations
      // sit ~278 m apart while the slabs are only 100 m long, so two thirds of
      // the frontage was bare ground and the sea read as separated rectangles.
      // waterBand rasterises the whole stretch instead. The marina and lagoon
      // are ONE band: they used to overlap both radially and along the lap at
      // the same water height, which is a z-fight waiting to happen.
      waterBand(0.06, 0.375, 1, 35, 260, 12, SEA, { id: "jeddah-red-sea" });
      waterBand(0.43, 0.64, 1, 22, 150, 12, [0.018, 0.035, 0.080],
        { id: "jeddah-marina-water" });
      // Waterfront light ribbon: waist-high amber/cool bollards, concentrated
      // at the marina rather than repeated around the full lap.
      for (let i = 0; i < 11; i++) {
        const s = 0.425 + i * 0.019;
        const k = K(s), col = (i % 3 === 0) ? WINTEAL : SPANGLE;
        place(k, 1, 12 + (i % 2) * 1.5, [0.34, 1.7, 0.34], col);
        place(k, 1, 14.5 + (i % 2), [2.8, 0.12, 1.2], col);
      }

      // ── King Fahd's Fountain — offshore landmark ──────────────────────────
      {
        const a = anchor(K(0.20), 1, 380);
        const b = [a.r, a.u, a.t];
        modelGroup("jeddah-fountain", {
          center: [a.c[0], pyMin + 154, a.c[2]], size: [16, 312, 16], basis: b,
        }, (stage) => {
          addCyl(stage, [a.c[0], pyMin - 0.8, a.c[2]], 0.9, 255, LED, 6, b);
          addCone(stage, [a.c[0], pyMin + 255, a.c[2]], 7, 55, [0.94, 0.97, 1.0], 6, b);
          addCyl(stage, [a.c[0], pyMin - 0.4, a.c[2]], 5, 2, [0.16, 0.18, 0.22], 6, b);
        }, { required: true });
      }

      // ── START/FINISH gantries ─────────────────────────────────────────────
      gantry(0.0,   13, [0.12, 0.13, 0.17]);
      gantry(0.012, 11, [0.12, 0.13, 0.17]);

      // ── PIT BUILDING + MAIN GRANDSTAND — s 0.00 ──────────────────────────
      // One long low pit building with a lit window band (was five stacked raw
      // place() boxes reading as a row of blocks).
      building(K(0.0), -1, 16, 62, 8, 28, { wall: [0.26, 0.27, 0.30], window: WINWARM, floor: 4 });
      grandstand(0.0,  1, 15, 60, [0.14, 0.15, 0.19], [0.55, 0.45, 0.40]);
      grandstand(0.02, 1, 15, 50, [0.13, 0.14, 0.18], [0.50, 0.42, 0.46]);

      // ── 2. Open Red Sea corridor — no seaward cityFront on s≈0.05–0.40 ────
      // Keep sea / fountain / mosque; city mass stays inland (L). Thin residual
      // seaward frontage only near the start/finish pocket.
      cityFront(0.88, 0.98, 1, 28, {
        minH: 8, maxH: 16, depth: 12,
        palette: WALL_INL, lit: true,
        step: 70, floor: 3,
      });

      // ── INLAND CITY WALL — left (L), step=55m gives ~22 buildings total ──
      cityFront(0.04, 0.24, -1, 22, {
        minH: 14, maxH: 34, depth: 16,
        palette: WALL_INL, lit: true,
        step: 55, floor: 5,
      });
      cityFront(0.35, 0.48, -1, 18, {
        minH: 18, maxH: 40, depth: 18,
        palette: WALL_INL, lit: true,
        step: 55, floor: 5,
      });
      cityFront(0.56, 0.74, -1, 18, {
        minH: 14, maxH: 36, depth: 18,
        palette: WALL_INL, lit: true, windowCol: WINGOLD,
        step: 55, floor: 5,
      });

      // ── JEDDAH SKYLINE — 3 landmark towers at s 0.27–0.31 L ──────────────
      building(K(0.27), -1, 55, 28, 115, 26, { wall: [0.22, 0.22, 0.27], window: WINWARM,  lit: true, floor: 8 });
      building(K(0.30), -1, 88, 24, 172, 22, { wall: [0.18, 0.19, 0.24], window: WINCOOL,  lit: true, floor: 8 });
      tower(K(0.285), -1, 140, 18, 160, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: LED, mast: 12 });
      // Layered Corniche hotel frontage below the three landmark silhouettes.
      // Mid-rise spacing maintains depth while leaving the driver-facing edge
      // clear through the very fast sweep.
      cityFront(0.245, 0.335, -1, 96, {
        minH: 24, maxH: 62, depth: 20,
        palette: WALL_INL, lit: true, windowCol: WINCOOL,
        step: 68, floor: 5,
      });

      // ── MARINA — 6 yachts at s 0.42–0.48 R ───────────────────────────────
      for (let i = 0; i < 6; i++) {
        const k = K(0.42 + i * 0.011);
        const a = anchor(k, 1, 40 + (i % 3) * 12), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 9)) continue;
        const hl = 5.5 + (i % 3) * 1.5;
        addBox(out, vadd(a.c, a.u, 1.3), [2.8, 2.0, hl], [0.94, 0.94, 0.96], b);
        addBox(out, vadd(a.c, a.u, 2.3), [2.9, 0.3, hl], (i % 2) ? SPANGLE : WINCOOL, b);
        addCyl(out, vadd(a.c, a.u, 2.5), 0.18, 12, [0.88, 0.88, 0.92], 4, b);
      }
      // Yacht club building
      {
        const a = anchor(K(0.45), 1, 78), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 16)) {
          addBox(out, vadd(a.c, a.u, 3), [26, 6, 11], [0.25, 0.26, 0.29], b);
          addBox(out, vadd(a.c, a.u, 4.5), [26.3, 1.0, 11.3], WINWARM, b);
        }
      }

      // ── T13 BANKED SECTOR — s 0.50 ───────────────────────────────────────
      floodMast(K(0.49), -1, 22);
      floodMast(K(0.51),  1, 26);
      grandstand(0.50, 1, 18, 40, [0.14, 0.15, 0.19], [0.52, 0.44, 0.42]);
      // Packed night-event bowl: flanking stands create a concentrated crowd
      // wall at T13, with generous setbacks and gaps between each structure.
      grandstand(0.475, 1, 22, 52, [0.12, 0.13, 0.17], [0.66, 0.38, 0.42]);
      grandstand(0.525, 1, 22, 52, [0.12, 0.13, 0.17], [0.42, 0.54, 0.68]);
      tyreWall(0.485, 0.515, -1, 3.5, MAGENTA);

      // ── CORNICHE LAGOON — folded into the marina band above (s 0.43–0.64).
      // Kept as a separate set of panels it overlapped that band at the same
      // height, so the two surfaces fought for the same pixels.

      // ── HOTEL / COMMERCIAL CLUSTER — s 0.68–0.74 L ───────────────────────
      building(K(0.69), -1, 60, 26, 68, 22, { wall: [0.22, 0.22, 0.26], window: WINWARM, lit: true, floor: 8 });
      tower(K(0.71), -1, 100, 18, 105, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: LED, mast: 10 });

      // Billboards — Corniche signage character
      billboard(K(0.70), -1, 26, 10, 11, GREEN);
      billboard(K(0.69), -1, 20, 9,  11, MAGENTA);
      billboard(K(0.73), -1, 24, 9,  10, WINTEAL);

      // ── TIGHT TECHNICAL SECTOR — s 0.78–0.84 ─────────────────────────────
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          place(K(0.78 + i * 0.010), side, 5, [5.5, 0.28, 2.8],
                (i % 2) ? [0.92, 0.08, 0.08] : [0.96, 0.96, 0.97]);
        }
      }

      // ── FINAL SECTOR GRANDSTAND — s 0.89 R ───────────────────────────────
      grandstand(0.89, 1, 16, 45, [0.15, 0.15, 0.19], [0.50, 0.43, 0.47]);
      grandstand(0.925, 1, 22, 58, [0.12, 0.13, 0.17], [0.62, 0.42, 0.50]);
      lightTower(K(0.90),  1, 11);
      lightTower(K(0.93), -1, 11);
      floodMast(K(0.91), -1, 24);

      // ── CORNER PROTECTION ─────────────────────────────────────────────────
      tyreWall(0.07, 0.10, -1, 2.8, GREEN);
      tyreWall(0.79, 0.82,  1, 2.8, SPANGLE);
      guardrail(0.34, 0.38, -1, 2.4, [0.55, 0.56, 0.6]);
      guardrail(0.96, 0.99,  1, 2.4, [0.55, 0.56, 0.6]);

      // ── DRS STRAIGHT + CORNICHE SIGNAGE ──────────────────────────────────
      billboard(K(0.95),  1, 22, 10, 10, GREEN);
      billboard(K(0.96), -1, 22, 10,  9, SPANGLE);
      billboard(K(0.97), -1, 20, 10, 10, MAGENTA);
      billboard(K(0.10),  1, 15,  8,  8, [0.12, 0.68, 0.98]);
      billboard(K(0.55),  1, 13,  8,  7, [0.92, 0.12, 0.68]);

      // ── CORNICHE MONUMENT — s 0.50 R ─────────────────────────────────────
      {
        const sA = anchor(K(0.50), 1, 42), sBasis = [sA.r, sA.u, sA.t];
        if (!onTrack(sA.c[0], sA.c[2], 10)) {
          out._mat = MAT.STONE;
          addCyl(out, sA.c, 3.2, 22, [0.82, 0.78, 0.68], 8, sBasis);
          addCone(out, vadd(sA.c, sA.u, 22), 5, 9, [0.94, 0.86, 0.64], 8, sBasis);
          out._mat = 0;
        }
      }

      // ================= BESPOKE CORNICHE LANDMARKS =======================
      // Locale-specific hero silhouettes built from primitives: the Al-Rahma
      // "Floating Mosque", the record Jeddah Flagpole, and traditional lateen-
      // sail dhows moored along the waterfront. All emissive-lit for the night.

      // ── Al-Rahma (Floating) Mosque — offshore white dome + minaret ───────
      const floatingMosque = (k, gap) => {
        const a = anchor(k, 1, gap), b = [a.r, a.u, a.t];
        const base = [a.c[0], pyMin - 0.3, a.c[2]];   // sit on the sea plane
        modelGroup("jeddah-floating-mosque", {
          center: vadd(base, a.u, 21), size: [34, 44, 30], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(base, a.u, 2.0), [26, 4, 26], [0.90, 0.90, 0.86], b);
          addBox(stage, vadd(base, a.u, 4.3), [26.6, 0.6, 26.6], WINCOOL, b);
          addBox(stage, vadd(base, a.u, 7.5), [16, 7, 16], [0.93, 0.93, 0.90], b);
          addBox(stage, vadd(base, a.u, 8.0), [16.3, 3, 16.3], WINWARM, b);
          addFrustum(stage, vadd(base, a.u, 11), 7.2, 4.6, 5, [0.95, 0.95, 0.92], 12, b);
          addCone(stage, vadd(base, a.u, 16), 4.7, 5.5, [0.96, 0.96, 0.93], 12, b);
          for (const dx of [-6.5, 6.5]) for (const dz of [-6.5, 6.5]) {
            const cc = vadd(vadd(vadd(base, a.u, 11), a.r, dx), a.t, dz);
            addCone(stage, cc, 1.4, 3.2, [0.95, 0.95, 0.92], 8, b);
          }
          const mc = vadd(base, a.r, 14);
          addCyl(stage, vadd(mc, a.u, 2), 1.4, 26, [0.94, 0.94, 0.91], 8, b);
          addFrustum(stage, vadd(mc, a.u, 28), 2.0, 1.1, 3, WINWARM, 8, b);
          addCyl(stage, vadd(mc, a.u, 31), 1.0, 5, [0.94, 0.94, 0.91], 8, b);
          addCone(stage, vadd(mc, a.u, 36), 1.5, 4.5, [0.96, 0.90, 0.66], 8, b);
          stage._mat = 0;
          addBox(stage, vadd(mc, a.u, 41), [0.5, 2.2, 0.5], SPANGLE, b);
        }, { required: true });
      };
      floatingMosque(K(0.165), 230);

      // ── Jeddah Flagpole — the record 171 m mast + giant green flag ───────
      {
        const a = anchor(K(0.30), -1, 130), b = [a.r, a.u, a.t];
        modelGroup("jeddah-flagpole", {
          center: vadd(vadd(a.c, a.u, 84), a.t, 23), size: [10, 170, 50], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addFrustum(stage, a.c, 4.0, 2.6, 14, [0.55, 0.56, 0.60], 8, b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, 14), 1.15, 152, [0.82, 0.84, 0.88], 8, b);
          stage._mat = 0;
          addBox(stage, vadd(a.c, a.u, 166), [1.2, 0.8, 1.2], SPANGLE, b);
          stage._mat = MAT.FABRIC;
          addBox(stage, vadd(vadd(a.c, a.u, 132), a.t, 24), [0.4, 24, 44], GREEN, b);
          addBox(stage, vadd(vadd(a.c, a.u, 132), a.t, 24), [0.5, 4, 44], [0.95, 0.96, 0.98], b);
          stage._mat = 0;
        }, { required: true });
      }

      // ── Jeddah Tower — under-construction distant skyline silhouette ────
      // The city's single defining real landmark, previously unrepresented:
      // a tapered, flat-topped unfinished shaft still wearing its tower
      // crane. Placed as a far backdrop layer well behind the s 0.27–0.31
      // landmark-tower cluster (gap 260 vs. that group's 55–140) so it reads
      // as background depth, not a trackside competitor, and clearly taller
      // than every other tower on this skyline.
      {
        const a = anchor(K(0.29), -1, 260), b = [a.r, a.u, a.t];
        modelGroup("jeddah-tower-construction", {
          center: vadd(a.c, a.u, 134), size: [56, 272, 56], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addFrustum(stage, a.c, 26, 9, 250, [0.40, 0.41, 0.45], 8, b);       // tapered unfinished shaft
          stage._mat = 0;
          addBox(stage, vadd(a.c, a.u, 254), [7, 8, 7], [0.28, 0.28, 0.32], b);         // crane cab
          addBox(stage, vadd(a.c, a.u, 262), [0.6, 0.9, 34], [0.24, 0.24, 0.28], b);    // crane jib
          addBox(stage, vadd(vadd(a.c, a.u, 258), a.t, -14), [0.6, 0.6, 0.6], SPANGLE, b); // hazard beacon
        }, { required: false });
      }

      // ── Dhow — traditional lateen-sail boat moored at the waterfront ─────
      const dhow = (k, gap, sc) => {
        const a = anchor(k, 1, gap), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 6)) return;
        const hull = [a.c[0], pyMin + 0.4 * sc, a.c[2]];
        out._mat = MAT.WOOD;
        addBox(out, vadd(hull, a.u, 0.8 * sc), [2.6 * sc, 1.7 * sc, 9 * sc], [0.30, 0.20, 0.11], b);   // dark wood hull
        addBox(out, vadd(hull, a.u, 1.8 * sc), [2.2 * sc, 0.5 * sc, 8 * sc], [0.42, 0.29, 0.16], b);   // gunwale
        const mast = vadd(hull, a.u, 2.0 * sc);
        addCyl(out, mast, 0.13 * sc, 11 * sc, [0.5, 0.36, 0.2], 4, b);                                 // mast
        out._mat = MAT.FABRIC;
        addPrism(out, vadd(vadd(mast, a.u, 4.5 * sc), a.t, 2.2 * sc),
          [0.3, 8 * sc, 7 * sc], [0.90, 0.88, 0.82], b);                                               // lateen sail
        out._mat = 0;
        addBox(out, vadd(hull, a.u, 0.1), [3.0 * sc, 0.3, 9.6 * sc], SPANGLE, b);                      // water reflection
      };
      // dhow fleet alongside the marina + Corniche lagoon
      for (let i = 0; i < 5; i++) dhow(K(0.43 + i * 0.010), 56 + (i % 3) * 14, 1.0 + (i % 2) * 0.4);
      for (let i = 0; i < 3; i++) dhow(K(0.57 + i * 0.014), 46 + (i % 2) * 12, 0.9 + (i % 2) * 0.3);

      // ── FAR SKYLINE BACKDROP — inland only (open Red Sea corridor seaward) ─
      // Use backdrop() for all distant geometry — far cheaper than building()
      for (let i = 0; i < 12; i++) {
        const s = i / 12;
        const w = 40 + hash(i * 11) * 30, h = 80 + hash(i * 7) * 100;
        // Lifted from near-black so the towers register against the night sky
        // (backdrop() auto-adds lit window bands on tall night silhouettes).
        backdrop(K(s), -1, 260 + (i % 4) * 20, [w, h, w], [0.22, 0.23, 0.31]);
      }
      // Sparse seaward backdrop only outside the open water corridor (0.05–0.40)
      for (let i = 0; i < 4; i++) {
        const s = 0.55 + i * 0.10;
        const w = 30 + hash(i * 13) * 20, h = 50 + hash(i * 9) * 60;
        backdrop(K(s), 1, 240 + (i % 2) * 30, [w, h, w], [0.20, 0.20, 0.27]);
      }
    },
  }
  );
})();
