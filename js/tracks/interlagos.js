/* Apex 26 — INTERLAGOS circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "interlagos",
    name: "INTERLAGOS",
    gp: "São Paulo GP",
    country: "Brazil",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    terrainOuter: 45,
    pal: { zenith: [0.32, 0.50, 0.72], horizon: [0.58, 0.68, 0.60], grass: [0.26, 0.48, 0.22], fog: [0.52, 0.58, 0.56], fogDensity: 0.0018, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.96, 0.84], sunColor: [1, 0.94, 0.82] },
    segs: [
      { t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 }, { t: -60, l: 110 }, { t: -50, l: 100, h: 6 },
      { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: -70, l: 100 },
      { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 },
    ],
    // Climb from the Senna S up to the start/finish (the lap's ~40 m of relief).
    elevations: [{ s: 0.86, halfM: 480, rise: 10 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              addBox, every, onTrack, hash, vadd, anchor, along, building, tower,
              grandstand, billboard, gantry, marshalPost, fence, guardrail, wall,
              tyreWall, pine, tree, palm, bush, hedge, peak, ridge, mountain,
              addCyl, addCone, addPrism, addPyramid } = api;
      const K = (s) => Math.round(s * n) % n;

      // Tropical palette constants
      const GREEN  = [0.20, 0.44, 0.20];
      const GREEN2 = [0.24, 0.48, 0.22];
      // Lit-window yellow (simulates emissive glow; bright warm amber)
      const LIT_WIN = [0.98, 0.90, 0.38];
      // Dim lamp-head colour (warm white)
      const LAMP    = [0.96, 0.96, 0.82];

      // ===================================================================
      // PIT / PADDOCK COMPLEX (s≈0.00, R close) — the iconic hub
      // ===================================================================
      const kpit = K(0.0);
      tower(kpit, 1, 14, 18, 56, { col: [0.52, 0.50, 0.48], seg: 6, cap: true,
                                   capCol: [0.22, 0.24, 0.28], mast: 18 });
      building(kpit, 1, 8, 14, 16, 32, { wall: [0.62, 0.62, 0.64],
               window: [0.24, 0.32, 0.40], floor: 3.6 });

      // Long low pit garages running down the pit straight
      for (const s of [0.97, 0.99, 0.01, 0.03]) {
        building(K(s), 1, 6, 11, 8, 24, { wall: [0.68, 0.68, 0.70],
                 window: [0.30, 0.34, 0.42], floor: 3.2, roof: [0.52, 0.52, 0.56] });
      }

      // Paddock hospitality / motorhomes behind the pits
      for (const s of [0.95, 0.98, 0.02, 0.05]) {
        const k = K(s);
        const anc = anchor(k, 1, 42 + hash(k) * 16);
        addBox(out, vadd(anc.c, anc.u, 3), [11, 6, 18],
               [0.82, 0.84, 0.86], [anc.r, anc.u, anc.t]);
      }

      // Pit wall: solid low concrete barrier on the R of the pit straight
      wall(0.96, 0.06, 1, 2.4, 1.1, [0.82, 0.82, 0.84], 0.45);

      // Pit-straight grandstand (Brazil green crowd)
      grandstand(0.94, 1, 9, 80, [0.48, 0.49, 0.54], [0.32, 0.54, 0.36]);

      // Start/finish gantry + second timing gantry
      gantry(0.005, 8.2, [0.20, 0.22, 0.26]);
      gantry(0.88,  7.0, [0.22, 0.24, 0.28]);

      // ---- Helicopter pad in paddock (s≈0.025) ----
      {
        const ahp = anchor(K(0.025), 1, 40);
        addBox(out, vadd(ahp.c, ahp.u, 0.1), [20, 0.2, 20], [0.52, 0.54, 0.54], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [18, 0.2, 2.0], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [2.0, 0.2, 18], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
      }

      // ---- Lamp posts along pit straight (night-ready warm fixtures) ----
      for (const s of [0.94, 0.96, 0.98, 0.00, 0.02, 0.04]) {
        const k = K(s);
        for (const side of [-1, 1]) {
          const anc = anchor(k, side, 14);
          if (onTrack(anc.c[0], anc.c[2], 3)) continue;
          // post
          addCyl(out, anc.c, 0.14, 10, [0.32, 0.32, 0.34], 5, [anc.r, anc.u, anc.t]);
          // lamp head (bright warm disc on top)
          addBox(out, vadd(anc.c, anc.u, 10.3), [2.2, 0.35, 0.7], LAMP, [anc.r, anc.u, anc.t]);
        }
      }

      // ===================================================================
      // MAIN GRANDSTAND TIER (s≈0.01–0.09, L) — big stands on the climb
      // ===================================================================
      grandstand(0.01, -1, 10, 120, [0.42, 0.43, 0.48], [0.34, 0.54, 0.38]);
      grandstand(0.05, -1, 11,  85, [0.44, 0.45, 0.50], [0.36, 0.56, 0.40]);
      grandstand(0.09, -1, 12,  90, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);
      for (const s of [0.00, 0.04, 0.08]) billboard(K(s), -1, 26, 16, 7, [0.94, 0.92, 0.88]);

      // ===================================================================
      // SENNA S (s≈0.05, both close): kerbs, tyre walls, lush tropical greenery
      // ===================================================================
      for (const [s, side] of [[0.045, -1], [0.065, 1], [0.085, -1]]) {
        const k = K(s);
        place(k, side, 2,   [0.5, 0.18, 7], [0.80, 0.18, 0.18]);
        place(k, side, 4.2, [3.0, 0.18, 7], [0.92, 0.92, 0.92]);
      }
      tyreWall(0.04, 0.07,  1, 5, [0.92, 0.92, 0.30]);
      tyreWall(0.06, 0.09, -1, 5, [0.30, 0.55, 0.85]);
      marshalPost(K(0.05),   1, 8);
      marshalPost(K(0.085), -1, 8);

      // Hero downhill plunge: LUSH tropical greenery framing the Senna S
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.08, 1], [0.10, -1]]) {
        const k = K(s);
        pine(k, side, 18 + hash(k)       * 12, 13 + hash(k * 3)  * 6, [0.18, 0.42, 0.18]);
        tree(k, side, 28 + hash(k * 5)   * 16, 10 + hash(k * 7)  * 6, [0.24, 0.48, 0.24]);
        palm(k, side, 22 + hash(k * 9)   * 10, 11 + hash(k * 13) * 5, [0.26, 0.48, 0.22]);
        bush(k, side, 14 + hash(k * 11)  *  8, [0.26, 0.50, 0.24]);
      }

      // ===================================================================
      // FAVELA HILLSIDE (s≈0.10–0.30, L far)
      // Dense colourful casa stacks anchored individually to their own ground point
      // so each house sits on the slope rather than floating/intersecting.
      // Each "house" is a separate anchor call so groundYAt() gives correct
      // terrain height at that specific lateral distance — this prevents the whole
      // stack being offset from a single anchor point while the terrain drops away.
      // ===================================================================
      const favCol = [
        [0.88, 0.32, 0.28], [0.96, 0.80, 0.22], [0.28, 0.58, 0.84],
        [0.92, 0.92, 0.88], [0.62, 0.74, 0.50], [0.88, 0.44, 0.32],
        [0.94, 0.64, 0.28], [0.38, 0.64, 0.64], [0.82, 0.28, 0.38],
        [0.86, 0.38, 0.60], [0.80, 0.72, 0.24], [0.44, 0.58, 0.78],
      ];
      // Lit-window favela colours (bright amber for night-ready glow simulation)
      const favWin = [
        [0.98, 0.88, 0.30], [0.96, 0.84, 0.26], [0.92, 0.80, 0.20],
      ];

      every(24, (k) => {
        const side = -1;
        const near = Math.min((k - K(0.15) + n) % n, (K(0.15) - k + n) % n) < n * 0.12;
        if (!near && hash(k * 61) > 0.65) return;

        const cols = (near ? 4 : 2) + Math.floor(hash(k * 62) * 1.5);
        // Each column is at a fixed lateral distance; rows climb uphill
        for (let col = 0; col < cols; col++) {
          // Each column sits at its own distance; rows within a column
          // step further out (uphill on the slope), each re-anchored
          const baseDist = 90 + col * 22 + hash(k * 63 + col) * 18;
          const rows = 2 + Math.floor(hash(k * 71 + col) * 2);
          for (let row = 0; row < rows; row++) {
            // Further out = higher up the slope; each row gets its own anchor
            const d = baseDist + row * 14 + hash(k * 72 + col + row * 7) * 8;
            const p = anchor(k, side, d);
            if (onTrack(p.c[0], p.c[2], 9)) continue;
            const hw = 7  + hash(k * 66 + col + row) * 4;
            const hh = 5  + hash(k * 64 + col + row) * 4.5;
            const hd = hw + hash(k * 67 + col + row) * 2;
            const colIdx = Math.floor(hash(k * 65 + col + row) * 12) % 12;
            // Centre of box is h/2 above the terrain at this exact anchor point
            const centre = vadd(p.c, p.u, hh / 2);
            addBox(out, centre, [hw, hh, hd], favCol[colIdx], [p.r, p.u, p.t]);
            // Window slots: bright warm squares on the facade — two small bright bands
            // that read as lit windows (simulated emissive) at night
            const winH  = 1.0;
            const winW  = hw * 0.82;
            const winD  = hd * 1.01;
            if (hh > 6) {
              const winC = favWin[Math.floor(hash(k * 68 + col + row) * 3) % 3];
              addBox(out, vadd(centre, p.u,  hh * 0.28), [winW, winH, winD], winC, [p.r, p.u, p.t]);
            }
            if (hh > 9) {
              const winC = favWin[Math.floor(hash(k * 69 + col + row + 1) * 3) % 3];
              addBox(out, vadd(centre, p.u, -hh * 0.15), [winW, winH, winD], winC, [p.r, p.u, p.t]);
            }
            // Simple A-frame terracotta roof (prism) on top of house
            addPrism(out,
              vadd(p.c, p.u, hh),
              [hw * 1.08, hh * 0.28, hd * 1.04],
              [0.76, 0.38, 0.22],
              [p.r, p.u, p.t]);
          }
        }

        // Scatter a tree between house groups for natural break
        if (hash(k * 8) > 0.55)
          tree(k, side, 100 + hash(k * 9) * 45, 10 + hash(k * 11) * 5, [0.22, 0.46, 0.20]);
      });

      // ---- Favela hillside landmark buildings (s=0.15–0.32) — taller accent ----
      const FAV_COLS = [
        [0.84, 0.42, 0.36], [0.36, 0.64, 0.82], [0.88, 0.76, 0.28],
        [0.82, 0.32, 0.40], [0.92, 0.56, 0.22], [0.32, 0.50, 0.80],
      ];
      for (let i = 0; i < 6; i++) {
        const s = 0.15 + (i / 6) * 0.17;
        const dist = 55 + i * 14;
        const bh = 10 + hash(K(s) * 11 + i) * 12;
        // Window colour: warm amber (lit look) for night-ready fidelity
        building(K(s), -1, dist, 13, bh, 13,
          { wall: FAV_COLS[i % 6], window: LIT_WIN, floor: 2.8 });
      }

      // ---- Lamp posts along the favela hillside road (s=0.12–0.28) ----
      for (const s of [0.12, 0.16, 0.20, 0.24, 0.28]) {
        const k = K(s);
        const d = 72 + hash(k * 31) * 20;
        const anc = anchor(k, -1, d);
        if (!onTrack(anc.c[0], anc.c[2], 3)) {
          addCyl(out, anc.c, 0.12, 8, [0.38, 0.36, 0.32], 5, [anc.r, anc.u, anc.t]);
          addBox(out, vadd(anc.c, anc.u, 8.2), [1.8, 0.3, 0.6], LAMP, [anc.r, anc.u, anc.t]);
        }
      }

      // ===================================================================
      // RETA OPOSTA straight (s=0.25, R mid): open green banks + advert boards
      // ===================================================================
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 10, 13, 5, [0.92, 0.92, 0.90]);
      hedge(0.20, 0.32, 1, 15, 2.4, GREEN);
      grandstand(0.27, -1, 12, 72, [0.43, 0.44, 0.49], [0.32, 0.52, 0.36]);
      marshalPost(K(0.24), 1, 8);

      // ===================================================================
      // LAGO / GUARAPIRANGA water (s=0.35, L far)
      // Water planes placed well off-track; shoreline vegetation screens seams.
      // ===================================================================
      groundPlane(K(0.33), -1, 210, [280, 2, 220], [0.21, 0.41, 0.50]);
      groundPlane(K(0.42), -1, 220, [240, 2, 190], [0.20, 0.40, 0.48]);

      // Dense shoreline vegetation screen
      for (const s of [0.30, 0.33, 0.36, 0.39, 0.42, 0.45]) {
        const k = K(s);
        tree(k, -1, 36 + hash(k)      * 24, 11 + hash(k * 3) * 6,  [0.18, 0.42, 0.18]);
        palm(k, -1, 50 + hash(k * 7)  * 26, 12 + hash(k * 11) * 5, [0.24, 0.46, 0.20]);
        bush(k, -1, 28 + hash(k * 5)  * 14, GREEN);
      }

      // ===================================================================
      // DESCIDA DO LAGO (s=0.45, both mid): gravel trap + hedge + tyre wall
      // ===================================================================
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);
      hedge(0.42, 0.50, -1, 12, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      marshalPost(K(0.46), -1, 8);

      // ===================================================================
      // SÃO PAULO HIGH-RISE SKYLINE (s=0.50–0.75, R far)
      // Mid-distance towers with warm-amber lit window bands (day: blue-grey glaze;
      // night-ready: bands read as glow). Heights trimmed to plausible São Paulo
      // mid-rises (40–70 m) so they don't dominate the circuit.
      // ===================================================================
      const SP_BLDGS = [
        [0.50, 1, 220, 20,  58], [0.54, 1, 255, 18,  72], [0.58, 1, 238, 22,  65],
        [0.62, 1, 272, 19,  80], [0.66, 1, 248, 21,  62], [0.70, 1, 265, 20,  75],
        [0.74, 1, 242, 17,  68],
      ];
      for (const [s, side, dist, bw, bh] of SP_BLDGS) {
        building(K(s), side, dist, bw, bh, bw,
          { wall: [0.50, 0.52, 0.58], window: LIT_WIN, floor: 8 });
      }

      // ---- Far-haze skyline ring (distant city envelope on the horizon) ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // Outer ring: haze-toned distant towers, NOT too tall (30–65 m)
      const ring = rad + 290;
      for (let i = 0; i < 44; i++) {
        const a = i / 44 * 6.2832, h = hash(i * 7 + 280);
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 10)) continue;
        const u = [0, 1, 0];
        const r = [Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708)];
        const f = [Math.cos(a), 0, Math.sin(a)];
        const ht = 30 + h * 48, w = 20 + hash(i * 11 + 280) * 16;
        // Warm grey tones with slight blue-purple atmospheric haze
        const base = 0.48 + hash(i * 13 + 280) * 0.08;
        addBox(out, [x, pyMin + ht / 2, z], [w, ht, w * 0.7],
               [base, base * 1.01, base * 1.06], [r, u, f]);
        // Lit window band on each far building (reads as emissive amber strip)
        addBox(out, [x, pyMin + ht * 0.62, z], [w * 1.01, ht * 0.06, w * 0.71],
               LIT_WIN, [r, u, f]);
      }

      // ===================================================================
      // FERRADURA / INFIELD ESSES (s=0.70, L mid): tyre walls + grandstand + trees
      // ===================================================================
      tyreWall(0.67, 0.73, -1, 4, [0.92, 0.80, 0.22]);
      grandstand(0.71, 1, 12, 64, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);
      marshalPost(K(0.70), -1, 9);
      for (const s of [0.66, 0.70, 0.74]) {
        const k = K(s);
        pine(k, -1, 16 + hash(k) * 14,      12 + hash(k * 3) * 6, [0.18, 0.40, 0.18]);
        tree(k,  1, 22 + hash(k * 5) * 16,  10 + hash(k * 7) * 6, [0.20, 0.44, 0.20]);
      }

      // ===================================================================
      // JUNÇÃO (s=0.82, L close): tight uphill left, kerbs + grandstand
      // ===================================================================
      const kj = K(0.82);
      place(kj, -1, 2,   [0.5, 0.18, 9], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 9], [0.92, 0.92, 0.92]);
      tyreWall(0.80, 0.84, -1, 5, [0.30, 0.55, 0.85]);
      grandstand(0.84, 1, 11, 58, [0.41, 0.42, 0.47], [0.30, 0.52, 0.34]);
      marshalPost(K(0.82), 1, 9);
      for (const s of [0.84, 0.86]) billboard(K(s), 1, 11, 13, 5, [0.92, 0.90, 0.86]);

      // ===================================================================
      // CLIMB TO S/F — Subida dos Boxes (s=0.88–0.96, both mid)
      // ===================================================================
      for (const s of [0.88, 0.92, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [1.0, 1.1, 10], [0.78, 0.78, 0.80]);
      }
      grandstand(0.90, -1, 10, 70, [0.42, 0.43, 0.48], [0.30, 0.52, 0.34]);

      // ===================================================================
      // CONTINUOUS TRACK FURNITURE — fences, armco, guardrails
      // ===================================================================
      fence(0.90, 0.10, -1, 4.0, 3.4, [0.66, 0.68, 0.70]);
      fence(0.24, 0.30,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      fence(0.68, 0.74,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      guardrail(0.10, 0.22,  1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.30, 0.42, -1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.50, 0.66,  1, 3.0, [0.74, 0.74, 0.78]);

      // Marshal posts spaced around the lap (orange roofs)
      for (const s of [0.12, 0.20, 0.34, 0.56, 0.62, 0.76, 0.90]) {
        marshalPost(K(s), (hash(K(s)) > 0.5 ? 1 : -1), 7);
      }

      // ===================================================================
      // GREEN HILLS ringing the park (between track & city backdrop)
      // Wide low wooded ridges set behind favela/tower bands — green ridgeline
      // for depth layering, not foreground pyramids.
      // ===================================================================
      for (let i = 0; i < 32; i++) {
        const a = i / 32 * 6.2832, h = hash(i * 17 + 3);
        const rng = rad + 240 + h * 110;
        const x = cx + Math.cos(a) * rng, z = cz + Math.sin(a) * rng;
        if (onTrack(x, z, 12)) continue;
        ridge(x, z, pyMin, a + 1.5708, 260 + h * 160, 180 + h * 100, 38 + h * 32,
              [0.22, 0.43 + h * 0.07, 0.23]);
      }

      // ===================================================================
      // PERVASIVE TROPICAL-GREEN VEGETATION around the lap
      // ===================================================================
      every(18, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.54) continue;
          const d = 26 + hash(k * 92 + side) * 76;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          if      (r > 0.62) tree(k, side, d, 10 + hash(k * 94 + side) * 6, [0.22, 0.46, 0.22]);
          else if (r > 0.31) pine(k, side, d, 12 + hash(k * 95 + side) * 6, [0.20, 0.42, 0.20]);
          else               bush(k, side, d, [0.24, 0.48, 0.24]);
        }
      });

      // ---- Tall tropical trees near the reservoir (sparser, selective) ----
      for (let i = 0; i < 28; i++) {
        const s = i / 28;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.52) continue;
        const side = (i % 2) ? 1 : -1;
        const d = 22 + hash(kk * 98 + i) * 32;
        tree(kk, side, d, 12 + hash(kk * 99 + i) * 6, [0.20, 0.46, 0.18]);
      }
    },
  }
  );
})();
