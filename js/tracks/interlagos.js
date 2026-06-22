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
              tyreWall, pine, tree, palm, bush, hedge, peak, ridge,
              addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;
      const GREEN = [0.20, 0.44, 0.20], GREEN2 = [0.24, 0.48, 0.22];

      // ===================================================================
      // PIT / PADDOCK COMPLEX (s≈0.00, R close) — the recognisable hub
      // ===================================================================
      const kpit = K(0.0);
      tower(kpit, 1, 14, 16, 52, { col: [0.50, 0.48, 0.46], seg: 5, cap: true,
                                   capCol: [0.20, 0.22, 0.26], mast: 16 });   // iconic tall slab control tower
      building(kpit, 1, 7, 12, 14, 30, { wall: [0.60, 0.60, 0.62],
               window: [0.20, 0.28, 0.34], floor: 4 });                       // pit building w/ window bands
      // long low pit garages running back down the straight
      for (const s of [0.97, 0.99, 0.01, 0.03]) {
        building(K(s), 1, 6, 9, 7, 22, { wall: [0.66, 0.66, 0.68],
                 window: [0.30, 0.34, 0.40], floor: 3, roof: [0.50, 0.50, 0.54] });
      }
      // paddock hospitality / motorhomes behind the pits
      for (const s of [0.95, 0.98, 0.02, 0.05]) {
        const k = K(s);
        addBox(out, anchor(k, 1, 40 + hash(k) * 14).c, [10, 5, 16],
               [0.80, 0.82, 0.84], [anchor(k, 1, 40).r, [0, 1, 0], anchor(k, 1, 40).t]);
      }
      // pit wall: solid low concrete wall on the R of the pit straight
      wall(0.96, 0.06, 1, 2.2, 1.0, [0.80, 0.80, 0.82], 0.4);
      grandstand(0.94, 1, 9, 70, [0.46, 0.47, 0.52], [0.30, 0.52, 0.34]);     // pit-straight stand (Brazil green crowd)

      // start/finish gantry over the line + a scoring gantry further on
      gantry(0.005, 7.0, [0.18, 0.20, 0.24]);
      gantry(0.92, 6.5, [0.20, 0.22, 0.26]);

      // ---- Helicopter pad in paddock (s≈0.02) ----
      {
        const ahp = anchor(K(0.025), 1, 40);
        addBox(out, vadd(ahp.c, ahp.u, 0.1), [20, 0.2, 20], [0.52, 0.54, 0.54], [ahp.r, ahp.u, ahp.t]);
        // H marking: two crossing beams in yellow
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [18, 0.2, 2.0], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [2.0, 0.2, 18], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
      }

      // ===================================================================
      // MAIN GRANDSTAND TIER (s≈0.02, L) — the big stand on the climb
      // ===================================================================
      grandstand(0.02, -1, 11, 110, [0.40, 0.41, 0.46], [0.32, 0.52, 0.36]);
      grandstand(0.06, -1, 12, 72, [0.43, 0.44, 0.49], [0.34, 0.54, 0.38]);
      for (const s of [0.00, 0.03, 0.06]) billboard(K(s), -1, 24, 14, 6, [0.94, 0.92, 0.88]);

      // ===================================================================
      // SENNA S (s≈0.05, both close): kerbs, tyre walls, greenery
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
      // hero downhill plunge: tropical greenery hugging the Senna S esses
      for (const [s, side] of [[0.05, 1], [0.07, -1], [0.09, 1]]) {
        const k = K(s);
        pine(k, side, 16 + hash(k) * 10, 12 + hash(k * 3) * 6, [0.18, 0.40, 0.18]);
        tree(k, side, 26 + hash(k * 5) * 14, 9 + hash(k * 7) * 5, GREEN2);
        palm(k, side, 20 + hash(k * 9) * 8, 9 + hash(k * 13) * 4, [0.24, 0.46, 0.20]);
      }

      // --- Colourful favela hillside (s=0.15, L far): saturated cubes climbing a green slope ---
      // CONTINUOUS dense favela band: stacked saturated houses wrap most of the L side,
      // climbing the green slope; densest at the s=0.15 hillside, never gapping out.
      const favCol = [[0.88, 0.32, 0.28], [0.96, 0.80, 0.22], [0.28, 0.58, 0.84],
                      [0.92, 0.92, 0.88], [0.62, 0.74, 0.50], [0.88, 0.44, 0.32],
                      [0.94, 0.64, 0.28], [0.38, 0.64, 0.64], [0.82, 0.28, 0.38],
                      [0.86, 0.38, 0.60], [0.80, 0.72, 0.24], [0.44, 0.58, 0.78]];
      every(16, (k) => {
        const side = -1;
        // bias the densest stacks toward the s=0.15 hillside; thinner band elsewhere
        const near = Math.min((k - K(0.15) + n) % n, (K(0.15) - k + n) % n) < n * 0.16;
        if (!near && hash(k * 61) > 0.45) return;     // continuous coverage, even denser
        const stack = (near ? 5 : 3) + Math.floor(hash(k * 62) * 2);
        for (let j = 0; j < stack; j++) {
          const d = 110 + j * 14 + hash(k * 63 + j) * 90;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 6 + hash(k * 64 + j) * 6;
          const w = 9 + hash(k * 66 + j) * 5;
          // stack each house a little higher up the slope (grounded base + slope lift)
          addBox(out, vadd(p.c, p.u, j * 8 + h / 2), [w, h, w],
                 favCol[Math.floor(hash(k * 65 + j) * 12) % 12], [p.r, p.u, p.t]);
        }
        if (hash(k * 8) > 0.50) tree(k, side, 100 + hash(k * 9) * 50, 9 + hash(k * 11) * 6, [0.20, 0.44, 0.20]);
      });
      // ---- Favela hillside landmark buildings (s=0.15–0.38) — taller, more saturated ----
      const FAV_COLS = [
        [0.84, 0.42, 0.36], [0.36, 0.64, 0.82], [0.88, 0.76, 0.28],
        [0.82, 0.32, 0.40], [0.40, 0.72, 0.42], [0.92, 0.56, 0.22],
        [0.32, 0.50, 0.80], [0.80, 0.40, 0.32], [0.84, 0.36, 0.58],
        [0.78, 0.74, 0.20],
      ];
      for (let i = 0; i < 10; i++) {
        const s = 0.15 + (i / 10) * 0.23;
        const dist = 55 + i * 8;
        const bh = 8 + hash(K(s) * 11 + i) * 10;
        building(K(s), -1, dist, 12, bh + i * 2.5, 12, { wall: FAV_COLS[i % 10], window: [0.92, 0.92, 0.88], floor: 2.5 });
      }

      // --- Reta Oposta straight (s=0.25, R mid): open green banks + advert boards ---
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 10, 13, 5, [0.92, 0.92, 0.90]);
      hedge(0.20, 0.32, 1, 15, 2.4, GREEN);
      grandstand(0.27, -1, 12, 72, [0.43, 0.44, 0.49], [0.32, 0.52, 0.36]);   // Reta Oposta stand — larger
      marshalPost(K(0.24), 1, 8);

      // --- Lago / Guarapiranga water (s=0.35, L far): muddy blue-green plane beyond trees ---
      // place the lake well off-track in the distant L so it never overlaps tarmac
      groundPlane(K(0.31), -1, 200, [180, 2, 160], [0.21, 0.41, 0.49]);
      groundPlane(K(0.35), -1, 220, [160, 2, 150], [0.22, 0.42, 0.50]);
      groundPlane(K(0.39), -1, 230, [150, 2, 140], [0.21, 0.41, 0.50]);
      groundPlane(K(0.43), -1, 220, [140, 2, 130], [0.20, 0.40, 0.48]);
      // little jetties / reeds at the near shore — thicker vegetation screen
      for (const s of [0.32, 0.35, 0.38, 0.41, 0.44]) {
        const k = K(s);
        tree(k, -1, 35 + hash(k) * 20, 10 + hash(k * 3) * 6, [0.18, 0.42, 0.18]);
        palm(k, -1, 48 + hash(k * 7) * 24, 11 + hash(k * 11) * 6, [0.24, 0.46, 0.20]);
        bush(k, -1, 25 + hash(k * 5) * 12, GREEN);
      }
      // ---- Reservoir infield water planes — more extensive ----
      for (let i = 0; i < 5; i++) {
        groundPlane(K(0.33 + i * 0.06), -1, 60 + i * 18, [220, 2, 170], [0.21, 0.40, 0.48]);
      }

      // --- Descida do Lago (s=0.45, both mid): grass run-off + tan gravel trap ---
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);   // gravel trap (tan)
      hedge(0.42, 0.50, -1, 12, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      marshalPost(K(0.46), -1, 8);

      // --- São Paulo high-rise skyline (s=0.60, R far): row of haze-grey slabs on horizon ---
      // CONTINUOUS window-banded tower band on the R side — densest at s=0.60, but
      // packed all around so the city reads as a sprawl wrapping the park, no gaps.
      every(30, (k) => {
        const near = Math.min((k - K(0.60) + n) % n, (K(0.60) - k + n) % n) < n * 0.20;
        if (!near && hash(k * 71) > 0.40) return;     // even denser coverage
        const side = 1;
        const cluster = near ? 3 : 2;
        for (let c = 0; c < cluster; c++) {
          const d = 140 + c * 32 + hash(k * 72 + c) * 100;
          const h = 55 + hash(k * 73 + c) * 85;
          const w = 16 + hash(k * 74 + c) * 14;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 10)) continue;
          const tone = 0.52 + hash(k * 75 + c) * 0.12;
          building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.97, tone * 1.03],
                   window: [tone * 0.52, tone * 0.58, tone * 0.65], floor: 8 });
        }
      });
      // ---- Additional São Paulo city buildings (s=0.30–0.75 right side) — more comprehensive ----
      const SP_BLDGS = [
        [0.30, 1, 200, 18, 110], [0.35, 1, 240, 16, 130], [0.40, 1, 280, 15, 160],
        [0.44, 1, 220, 18, 105], [0.48, 1, 320, 14, 190], [0.52, 1, 260, 17, 140],
        [0.56, 1, 300, 16, 170], [0.60, 1, 230, 17, 150], [0.63, 1, 360, 15, 180],
        [0.66, 1, 210, 19, 120], [0.70, 1, 280, 16, 165], [0.74, 1, 240, 18, 135],
      ];
      for (const [s, side, dist, bw, bh] of SP_BLDGS) {
        building(K(s), side, dist, bw, bh, bw, { wall: [0.52, 0.54, 0.60], window: [0.28, 0.36, 0.50], floor: 8 });
      }
      // CONTINUOUS far-haze skyline ring computed from the lap centre, so a dense
      // unbroken band of high-rise slabs encircles the whole park on the horizon.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, hMin, hVar, wMin] of [
        [120, 96, 34, 70, 26],    // inner dense high-rise band
        [260, 72, 24, 44, 40],    // far hazed backdrop band
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          if (onTrack(x, z, 10)) continue;
          const u = [0, 1, 0], r = [Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708)];
          const f = [Math.cos(a), 0, Math.sin(a)];
          const ht = hMin + h * hVar, w = wMin + hash(i * 11 + extra) * 22;
          const tone = 0.53 + hash(i * 13 + extra) * 0.10;
          addBox(out, [x, pyMin + ht / 2, z], [w, ht, w * 0.8],
                 [tone, tone * 1.01, tone * 1.04], [r, u, f]);
        }
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
      // GREEN HILLS + WOODED BANKS ringing the park (between track & city)
      // reuses cx/cz/rad computed for the skyline ring above
      // ===================================================================
      // wide low wooded hill ring set BEHIND the favela/tower bands (a green
      // ridgeline on the horizon, not foreground pyramids) — broad & low-rise
      for (let i = 0; i < 42; i++) {
        const a = i / 42 * 6.2832, h = hash(i * 17 + 3);
        const ring = rad + 210 + h * 100;
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 12)) continue;
        ridge(x, z, pyMin, a + 1.5708, 220 + h * 140, 160 + h * 90, 40 + h * 35,
              [0.20, 0.41 + h * 0.08, 0.21]);
      }

      // ===================================================================
      // Pervasive vivid tropical-green vegetation around the lap (denser belt)
      // ===================================================================
      every(14, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.48) continue;   // denser coverage
          const d = 24 + hash(k * 92 + side) * 80;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          if (r > 0.64) tree(k, side, d, 9 + hash(k * 94 + side) * 7, [0.20, 0.44, 0.20]);
          else if (r > 0.32) pine(k, side, d, 11 + hash(k * 95 + side) * 7, [0.18, 0.40, 0.18]);
          else bush(k, side, d, [0.22, 0.46, 0.22]);
        }
      });
      // ---- Additional tall tropical trees near reservoir ----
      for (let i = 0; i < 44; i++) {
        const s = i / 44;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.45) continue;   // denser
        const side = (i % 2) ? 1 : -1;
        const d = 18 + hash(kk * 98 + i) * 30;
        tree(kk, side, d, 11 + hash(kk * 99 + i) * 7, [0.18, 0.44, 0.16]);
      }
    },
  }
  );
})();
