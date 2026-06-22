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
    pal: { zenith: [0.40, 0.54, 0.72], horizon: [0.68, 0.70, 0.68], grass: [0.28, 0.50, 0.24], fog: [0.60, 0.62, 0.65], fogDensity: 0.0025, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.95, 0.82], sunColor: [1, 0.93, 0.8] },
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
      const GREEN = [0.20, 0.44, 0.20], GREEN2 = [0.24, 0.48, 0.22];

      // ===================================================================
      // PIT / PADDOCK COMPLEX (s≈0.00, R close) — the iconic hub
      // ===================================================================
      const kpit = K(0.0);
      tower(kpit, 1, 14, 18, 56, { col: [0.52, 0.50, 0.48], seg: 6, cap: true,
                                   capCol: [0.22, 0.24, 0.28], mast: 18 });   // iconic tall slab control tower
      building(kpit, 1, 8, 14, 16, 32, { wall: [0.62, 0.62, 0.64],
               window: [0.22, 0.30, 0.38], floor: 3.6 });                     // pit building w/ prominent window bands
      // long low pit garages running back down the straight (22m+ buildings)
      for (const s of [0.97, 0.99, 0.01, 0.03]) {
        building(K(s), 1, 6, 11, 8, 24, { wall: [0.68, 0.68, 0.70],
                 window: [0.32, 0.36, 0.42], floor: 3.2, roof: [0.52, 0.52, 0.56] });
      }
      // Paddock hospitality / motorhomes behind the pits (Brazil service areas)
      for (const s of [0.95, 0.98, 0.02, 0.05]) {
        const k = K(s);
        addBox(out, anchor(k, 1, 42 + hash(k) * 16).c, [11, 6, 18],
               [0.82, 0.84, 0.86], [anchor(k, 1, 42).r, [0, 1, 0], anchor(k, 1, 42).t]);
      }
      // Pit wall: solid low concrete barrier on the R of the pit straight
      wall(0.96, 0.06, 1, 2.4, 1.1, [0.82, 0.82, 0.84], 0.45);
      grandstand(0.94, 1, 9, 80, [0.48, 0.49, 0.54], [0.32, 0.54, 0.36]);     // pit-straight stand (Brazil green crowd, 80m wide)

      // start/finish gantry over the line + a scoring gantry further back
      gantry(0.005, 8.2, [0.20, 0.22, 0.26]);      // larger, more prominent S/F gantry
      gantry(0.88, 7.0, [0.22, 0.24, 0.28]);       // second timing gantry before pits

      // ---- Helicopter pad in paddock (s≈0.02) ----
      {
        const ahp = anchor(K(0.025), 1, 40);
        addBox(out, vadd(ahp.c, ahp.u, 0.1), [20, 0.2, 20], [0.52, 0.54, 0.54], [ahp.r, ahp.u, ahp.t]);
        // H marking: two crossing beams in yellow
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [18, 0.2, 2.0], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [2.0, 0.2, 18], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
      }

      // ===================================================================
      // MAIN GRANDSTAND TIER (s≈0.02–0.08, L) — big stands on the climb to s/f
      // ===================================================================
      grandstand(0.01, -1, 10, 120, [0.42, 0.43, 0.48], [0.34, 0.54, 0.38]);   // massive main stand, 120m
      grandstand(0.05, -1, 11, 85, [0.44, 0.45, 0.50], [0.36, 0.56, 0.40]);    // secondary stand
      grandstand(0.09, -1, 12, 90, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);    // upper-climb stand
      for (const s of [0.00, 0.04, 0.08]) billboard(K(s), -1, 26, 16, 7, [0.94, 0.92, 0.88]);

      // ===================================================================
      // SENNA S (s≈0.05, both close): kerbs, tyre walls, lush tropical greenery
      // ===================================================================
      for (const [s, side] of [[0.045, -1], [0.065, 1], [0.085, -1]]) {
        const k = K(s);
        place(k, side, 2, [0.5, 0.18, 7], [0.80, 0.18, 0.18]);   // red kerb
        place(k, side, 4.2, [3.0, 0.18, 7], [0.92, 0.92, 0.92]);   // white kerb
      }
      // tyre walls on the OUTSIDE of each Senna S apex
      tyreWall(0.04, 0.07, 1, 5, [0.92, 0.92, 0.30]);
      tyreWall(0.06, 0.09, -1, 5, [0.30, 0.55, 0.85]);
      marshalPost(K(0.05), 1, 8);
      marshalPost(K(0.085), -1, 8);
      // Hero downhill plunge: LUSH tropical greenery framing the Senna S esses
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.08, 1], [0.10, -1]]) {
        const k = K(s);
        pine(k, side, 18 + hash(k) * 12, 13 + hash(k * 3) * 6, [0.18, 0.42, 0.18]);
        tree(k, side, 28 + hash(k * 5) * 16, 10 + hash(k * 7) * 6, [0.24, 0.48, 0.24]);
        palm(k, side, 22 + hash(k * 9) * 10, 11 + hash(k * 13) * 5, [0.26, 0.48, 0.22]);
        bush(k, side, 14 + hash(k * 11) * 8, [0.26, 0.50, 0.24]);
      }

      // --- Colourful favela hillside (s=0.15, L far): saturated cubes climbing a green slope ---
      // TRIMMED dense favela band: stacked saturated houses concentrated on the L side,
      // climbing the green slope; densest at the s=0.15 hillside, sparse elsewhere to avoid clutter.
      const favCol = [[0.88, 0.32, 0.28], [0.96, 0.80, 0.22], [0.28, 0.58, 0.84],
                      [0.92, 0.92, 0.88], [0.62, 0.74, 0.50], [0.88, 0.44, 0.32],
                      [0.94, 0.64, 0.28], [0.38, 0.64, 0.64], [0.82, 0.28, 0.38],
                      [0.86, 0.38, 0.60], [0.80, 0.72, 0.24], [0.44, 0.58, 0.78]];
      every(24, (k) => {
        const side = -1;
        // bias the densest stacks toward the s=0.15 hillside; sparser elsewhere
        const near = Math.min((k - K(0.15) + n) % n, (K(0.15) - k + n) % n) < n * 0.12;
        if (!near && hash(k * 61) > 0.65) return;     // thinned coverage outside core band
        const stack = (near ? 4 : 2) + Math.floor(hash(k * 62) * 1.5);
        for (let j = 0; j < stack; j++) {
          const d = 110 + j * 16 + hash(k * 63 + j) * 80;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 6 + hash(k * 64 + j) * 5.5;
          const w = 9 + hash(k * 66 + j) * 4;
          // stack each house a little higher up the slope (grounded base + slope lift)
          addBox(out, vadd(p.c, p.u, j * 7 + h / 2), [w, h, w],
                 favCol[Math.floor(hash(k * 65 + j) * 12) % 12], [p.r, p.u, p.t]);
        }
        if (hash(k * 8) > 0.55) tree(k, side, 100 + hash(k * 9) * 45, 10 + hash(k * 11) * 5, [0.22, 0.46, 0.20]);
      });
      // ---- Favela hillside landmark buildings (s=0.15–0.32) — taller accent structures ----
      const FAV_COLS = [
        [0.84, 0.42, 0.36], [0.36, 0.64, 0.82], [0.88, 0.76, 0.28],
        [0.82, 0.32, 0.40], [0.92, 0.56, 0.22], [0.32, 0.50, 0.80],
      ];
      for (let i = 0; i < 6; i++) {
        const s = 0.15 + (i / 6) * 0.17;
        const dist = 60 + i * 12;
        const bh = 10 + hash(K(s) * 11 + i) * 12;
        building(K(s), -1, dist, 13, bh, 13, { wall: FAV_COLS[i % 6], window: [0.92, 0.92, 0.88], floor: 2.8 });
      }

      // --- Reta Oposta straight (s=0.25, R mid): open green banks + advert boards ---
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 10, 13, 5, [0.92, 0.92, 0.90]);
      hedge(0.20, 0.32, 1, 15, 2.4, GREEN);
      grandstand(0.27, -1, 12, 72, [0.43, 0.44, 0.49], [0.32, 0.52, 0.36]);   // Reta Oposta stand — larger
      marshalPost(K(0.24), 1, 8);

      // --- Lago / Guarapiranga water (s=0.35, L far): muddy blue-green water beyond trees ---
      // Place the lake well off-track in the distant L so it never overlaps tarmac.
      // Consolidated water planes: two large rectangles for cleaner geometry.
      groundPlane(K(0.33), -1, 210, [280, 2, 220], [0.21, 0.41, 0.50]);
      groundPlane(K(0.42), -1, 220, [240, 2, 190], [0.20, 0.40, 0.48]);
      // Dense shoreline vegetation screen: trees + palms + reeds to hide the water seams
      for (const s of [0.30, 0.33, 0.36, 0.39, 0.42, 0.45]) {
        const k = K(s);
        tree(k, -1, 36 + hash(k) * 24, 11 + hash(k * 3) * 6, [0.18, 0.42, 0.18]);
        palm(k, -1, 50 + hash(k * 7) * 26, 12 + hash(k * 11) * 5, [0.24, 0.46, 0.20]);
        bush(k, -1, 28 + hash(k * 5) * 14, GREEN);
      }

      // --- Descida do Lago (s=0.45, both mid): grass run-off + tan gravel trap ---
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);   // gravel trap (tan)
      hedge(0.42, 0.50, -1, 12, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      marshalPost(K(0.46), -1, 8);

      // --- São Paulo high-rise skyline (s=0.50–0.75, R far): haze-grey tower band on horizon ---
      // STREAMLINED skyline: selective key buildings right-side (s=0.50–0.75), plus a sparse
      // far-ring so the city reads as a distant envelope without overwhelming the circuit.
      const SP_BLDGS = [
        [0.50, 1, 220, 20, 140], [0.55, 1, 260, 18, 160], [0.60, 1, 240, 22, 150],
        [0.65, 1, 280, 19, 175], [0.70, 1, 250, 21, 155], [0.75, 1, 270, 20, 170],
      ];
      for (const [s, side, dist, bw, bh] of SP_BLDGS) {
        building(K(s), side, dist, bw, bh, bw, { wall: [0.52, 0.54, 0.60], window: [0.28, 0.36, 0.50], floor: 9 });
      }
      // SPARSE far-haze skyline ring: a loose cityscape envelope on the horizon,
      // farther back so it reads as a distant backdrop, not a wall.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Single far-skyline ring: sparser, farther out, lower density
      const ring = rad + 280;
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * 6.2832, h = hash(i * 7 + 280);
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 10)) continue;
        const u = [0, 1, 0], r = [Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708)];
        const f = [Math.cos(a), 0, Math.sin(a)];
        const ht = 32 + h * 52, w = 24 + hash(i * 11 + 280) * 18;
        const tone = 0.55 + hash(i * 13 + 280) * 0.09;
        addBox(out, [x, pyMin + ht / 2, z], [w, ht, w * 0.75],
               [tone, tone * 1.01, tone * 1.04], [r, u, f]);
      }

      // --- Ferradura / infield esses (s=0.70, L mid): green banks + tyre walls ---
      tyreWall(0.67, 0.73, -1, 4, [0.92, 0.80, 0.22]);   // yellow-capped tyre wall
      grandstand(0.71, 1, 12, 64, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);    // Ferradura stand — larger
      marshalPost(K(0.70), -1, 9);
      for (const s of [0.66, 0.70, 0.74]) {
        const k = K(s);
        pine(k, -1, 16 + hash(k) * 14, 12 + hash(k * 3) * 6, [0.18, 0.40, 0.18]);
        tree(k, 1, 22 + hash(k * 5) * 16, 10 + hash(k * 7) * 6, [0.20, 0.44, 0.20]);
      }

      // --- Junção (s=0.82, L close): tight uphill left, kerbs, start of the climb ---
      const kj = K(0.82);
      place(kj, -1, 2, [0.5, 0.18, 9], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 9], [0.92, 0.92, 0.92]);
      tyreWall(0.80, 0.84, -1, 5, [0.30, 0.55, 0.85]);
      grandstand(0.84, 1, 11, 58, [0.41, 0.42, 0.47], [0.30, 0.52, 0.34]);    // Junção stand — enhanced
      marshalPost(K(0.82), 1, 9);
      for (const s of [0.84, 0.86]) billboard(K(s), 1, 11, 13, 5, [0.92, 0.90, 0.86]);

      // --- Climb to s/f, Subida dos Boxes (s=0.92, both mid): banked ramp + pit-wall slabs (R) ---
      for (const s of [0.88, 0.92, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [1.0, 1.1, 10], [0.78, 0.78, 0.80]);   // pit-wall slab on the right
      }
      grandstand(0.90, -1, 10, 70, [0.42, 0.43, 0.48], [0.30, 0.52, 0.34]);   // climb grandstand — enhanced

      // ===================================================================
      // CONTINUOUS TRACK FURNITURE — catch fences + armco rings the lap
      // (clearance-based; never reaches the tarmac, guarded off straights)
      // ===================================================================
      // debris/catch fence on the spectator (outer) side of the big stands
      fence(0.90, 0.10, -1, 4.0, 3.4, [0.66, 0.68, 0.70]);   // main-straight / S enclosure
      fence(0.24, 0.30, 1, 4.0, 3.0, [0.64, 0.66, 0.68]);    // Reta Oposta
      fence(0.68, 0.74, 1, 4.0, 3.0, [0.64, 0.66, 0.68]);    // Ferradura
      // waist-high armco around fast open corners
      guardrail(0.10, 0.22, 1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.30, 0.42, -1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.50, 0.66, 1, 3.0, [0.74, 0.74, 0.78]);

      // marshal posts spaced around the lap (orange roofs catch the eye)
      for (const s of [0.12, 0.20, 0.34, 0.56, 0.62, 0.76, 0.90]) {
        marshalPost(K(s), (hash(K(s)) > 0.5 ? 1 : -1), 7);
      }

      // ===================================================================
      // GREEN HILLS ringing the park (between track & city backdrop)
      // ===================================================================
      // Wide low wooded hill ring set BEHIND favela/tower bands (a green ridgeline,
      // not foreground pyramids) — broader & lower-rise for depth layering.
      for (let i = 0; i < 32; i++) {
        const a = i / 32 * 6.2832, h = hash(i * 17 + 3);
        const ring = rad + 240 + h * 110;
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 12)) continue;
        ridge(x, z, pyMin, a + 1.5708, 260 + h * 160, 180 + h * 100, 38 + h * 32,
              [0.22, 0.43 + h * 0.07, 0.23]);
      }

      // ===================================================================
      // Pervasive vivid tropical-green vegetation around the lap (moderate density)
      // ===================================================================
      every(18, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.54) continue;   // balanced coverage
          const d = 26 + hash(k * 92 + side) * 76;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          if (r > 0.62) tree(k, side, d, 10 + hash(k * 94 + side) * 6, [0.22, 0.46, 0.22]);
          else if (r > 0.31) pine(k, side, d, 12 + hash(k * 95 + side) * 6, [0.20, 0.42, 0.20]);
          else bush(k, side, d, [0.24, 0.48, 0.24]);
        }
      });
      // ---- Tall tropical trees near reservoir (less frequent) ----
      for (let i = 0; i < 28; i++) {
        const s = i / 28;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.52) continue;   // sparser, selective placement
        const side = (i % 2) ? 1 : -1;
        const d = 22 + hash(kk * 98 + i) * 32;
        tree(kk, side, d, 12 + hash(kk * 99 + i) * 6, [0.20, 0.46, 0.18]);
      }
    },
  }
  );
})();
