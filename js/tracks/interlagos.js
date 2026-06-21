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
    pal: { zenith: [0.26, 0.4, 0.6], horizon: [0.72, 0.74, 0.72], grass: [0.22, 0.48, 0.18], fog: [0.55, 0.58, 0.6], fogDensity: 0.0019, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.95, 0.82], sunColor: [1, 0.93, 0.8] },
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
      tower(kpit, 1, 14, 15, 40, { col: [0.52, 0.50, 0.48], seg: 4, cap: true,
                                   capCol: [0.22, 0.24, 0.28], mast: 12 });   // tall slab control tower
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
      grandstand(0.02, -1, 10, 90, [0.42, 0.43, 0.48], [0.28, 0.50, 0.32]);
      grandstand(0.06, -1, 11, 64, [0.45, 0.46, 0.51], [0.30, 0.52, 0.34]);
      for (const s of [0.00, 0.03, 0.06]) billboard(K(s), -1, 22, 12, 5, [0.94, 0.92, 0.88]);

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
      const favCol = [[0.85, 0.35, 0.30], [0.95, 0.78, 0.25], [0.30, 0.55, 0.80],
                      [0.90, 0.90, 0.85], [0.60, 0.72, 0.52], [0.86, 0.46, 0.34],
                      [0.92, 0.62, 0.30], [0.40, 0.62, 0.62], [0.80, 0.30, 0.40]];
      every(18, (k) => {
        const side = -1;
        // bias the densest stacks toward the s=0.15 hillside; thinner band elsewhere
        const near = Math.min((k - K(0.15) + n) % n, (K(0.15) - k + n) % n) < n * 0.14;
        if (!near && hash(k * 61) > 0.55) return;     // continuous coverage, rarely skip
        const stack = (near ? 4 : 2) + Math.floor(hash(k * 62) * 2);
        for (let j = 0; j < stack; j++) {
          const d = 120 + j * 12 + hash(k * 63 + j) * 80;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 5 + hash(k * 64 + j) * 5;
          const w = 8 + hash(k * 66 + j) * 4;
          // stack each house a little higher up the slope (grounded base + slope lift)
          addBox(out, vadd(p.c, p.u, j * 7 + h / 2), [w, h, w],
                 favCol[Math.floor(hash(k * 65 + j) * 9) % 9], [p.r, p.u, p.t]);
        }
        if (hash(k * 8) > 0.55) tree(k, side, 110 + hash(k * 9) * 40, 8 + hash(k * 11) * 5, [0.20, 0.44, 0.20]);
      });
      // ---- Favela hillside landmark buildings (s=0.15–0.35) ----
      const FAV_COLS = [
        [0.82, 0.45, 0.38], [0.38, 0.62, 0.80], [0.85, 0.75, 0.30],
        [0.80, 0.35, 0.42], [0.42, 0.70, 0.45], [0.90, 0.55, 0.25],
        [0.35, 0.48, 0.78], [0.78, 0.42, 0.35],
      ];
      for (let i = 0; i < 8; i++) {
        const s = 0.15 + (i / 8) * 0.20;
        const dist = 60 + i * 7.5;
        const bh = 6 + hash(K(s) * 11 + i) * 8;
        building(K(s), -1, dist, 10, bh + i * 2, 10, { wall: FAV_COLS[i], window: [0.90, 0.90, 0.85], floor: 2 });
      }

      // --- Reta Oposta straight (s=0.25, R mid): open green banks + advert boards ---
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 8, 11, 4, [0.90, 0.90, 0.88]);
      hedge(0.20, 0.30, 1, 14, 2.2, GREEN);
      grandstand(0.27, -1, 11, 64, [0.45, 0.46, 0.51], [0.28, 0.50, 0.32]);   // Reta Oposta stand
      marshalPost(K(0.24), 1, 7);

      // --- Lago / Guarapiranga water (s=0.35, L far): muddy blue-green plane beyond trees ---
      // place the lake well off-track in the distant L so it never overlaps tarmac
      groundPlane(K(0.33), -1, 210, [150, 2, 140], [0.22, 0.42, 0.50]);
      groundPlane(K(0.30), -1, 220, [130, 2, 120], [0.20, 0.40, 0.48]);
      groundPlane(K(0.43), -1, 220, [120, 2, 110], [0.21, 0.41, 0.49]);
      // little jetties / reeds at the near shore
      for (const s of [0.33, 0.36, 0.39, 0.42]) {
        const k = K(s);
        tree(k, -1, 40 + hash(k) * 16, 9 + hash(k * 3) * 5, GREEN2);   // treeline screening the lake
        palm(k, -1, 52 + hash(k * 7) * 20, 10 + hash(k * 11) * 5, [0.24, 0.46, 0.20]);
        bush(k, -1, 30 + hash(k * 5) * 10, GREEN);
      }
      // ---- Reservoir infield water planes ----
      for (let i = 0; i < 4; i++) {
        groundPlane(K(0.35 + i * 0.05), -1, 70 + i * 15, [200, 2, 150], [0.22, 0.34, 0.48]);
      }

      // --- Descida do Lago (s=0.45, both mid): grass run-off + tan gravel trap ---
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);   // gravel trap (tan)
      hedge(0.42, 0.50, -1, 12, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      marshalPost(K(0.46), -1, 8);

      // --- São Paulo high-rise skyline (s=0.60, R far): row of haze-grey slabs on horizon ---
      // CONTINUOUS window-banded tower band on the R side — densest at s=0.60, but
      // packed all around so the city reads as a sprawl wrapping the park, no gaps.
      every(34, (k) => {
        const near = Math.min((k - K(0.60) + n) % n, (K(0.60) - k + n) % n) < n * 0.18;
        if (!near && hash(k * 71) > 0.45) return;     // continuous coverage
        const side = 1;
        const cluster = near ? 2 : 1;
        for (let c = 0; c < cluster; c++) {
          const d = 150 + c * 28 + hash(k * 72 + c) * 90;
          const h = 50 + hash(k * 73 + c) * 80;
          const w = 14 + hash(k * 74 + c) * 12;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 10)) continue;
          const tone = 0.50 + hash(k * 75 + c) * 0.14;
          building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.98, tone * 1.02],
                   window: [tone * 0.55, tone * 0.60, tone * 0.66], floor: 8 });
        }
      });
      // ---- Additional São Paulo city buildings (s=0.35–0.70 right side) ----
      const SP_BLDGS = [
        [0.35, 1, 220, 16, 120], [0.40, 1, 260, 14, 150], [0.44, 1, 200, 18, 100],
        [0.48, 1, 300, 15, 180], [0.52, 1, 240, 17, 130], [0.56, 1, 280, 13, 160],
        [0.60, 1, 210, 16, 140], [0.63, 1, 340, 14, 170], [0.66, 1, 190, 18, 110],
        [0.70, 1, 260, 15, 155],
      ];
      for (const [s, side, dist, bw, bh] of SP_BLDGS) {
        building(K(s), side, dist, bw, bh, bw, { wall: [0.50, 0.52, 0.58], window: [0.30, 0.38, 0.52], floor: 8 });
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
      tyreWall(0.67, 0.73, -1, 4, [0.90, 0.78, 0.25]);   // yellow-capped tyre wall
      grandstand(0.71, 1, 11, 56, [0.42, 0.43, 0.48], [0.30, 0.52, 0.34]);    // Ferradura stand
      marshalPost(K(0.70), -1, 8);
      for (const s of [0.66, 0.70, 0.74]) {
        const k = K(s);
        pine(k, -1, 18 + hash(k) * 12, 11 + hash(k * 3) * 5, [0.18, 0.40, 0.18]);
        tree(k, 1, 24 + hash(k * 5) * 14, 9 + hash(k * 7) * 5, GREEN2);
      }

      // --- Junção (s=0.82, L close): tight uphill left, kerbs, start of the climb ---
      const kj = K(0.82);
      place(kj, -1, 2, [0.5, 0.18, 8], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 8], [0.92, 0.92, 0.92]);
      tyreWall(0.80, 0.84, -1, 5, [0.30, 0.55, 0.85]);
      grandstand(0.84, 1, 10, 50, [0.43, 0.44, 0.49], [0.30, 0.52, 0.34]);    // Junção stand
      marshalPost(K(0.82), 1, 8);
      for (const s of [0.84, 0.86]) billboard(K(s), 1, 9, 11, 4, [0.92, 0.90, 0.86]);

      // --- Climb to s/f, Subida dos Boxes (s=0.92, both mid): banked ramp + pit-wall slabs (R) ---
      for (const s of [0.88, 0.92, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [1.0, 1.1, 9], [0.78, 0.78, 0.80]);   // pit-wall slab on the right
      }
      grandstand(0.90, -1, 9, 60, [0.44, 0.45, 0.50], [0.28, 0.50, 0.32]);

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
      for (let i = 0; i < 34; i++) {
        const a = i / 34 * 6.2832, h = hash(i * 17 + 3);
        const ring = rad + 200 + h * 90;
        const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
        if (onTrack(x, z, 12)) continue;
        ridge(x, z, pyMin, a + 1.5708, 200 + h * 120, 150 + h * 80, 36 + h * 30,
              [0.19, 0.40 + h * 0.07, 0.20]);
      }

      // ===================================================================
      // Pervasive vivid tropical-green vegetation around the lap (denser belt)
      // ===================================================================
      every(16, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.52) continue;
          const d = 26 + hash(k * 92 + side) * 70;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          if (r > 0.66) tree(k, side, d, 8 + hash(k * 94 + side) * 6, GREEN2);
          else if (r > 0.33) pine(k, side, d, 10 + hash(k * 95 + side) * 6, [0.18, 0.40, 0.18]);
          else bush(k, side, d, [0.22, 0.46, 0.22]);
        }
      });
      // ---- Additional tall tropical trees near reservoir ----
      for (let i = 0; i < 36; i++) {
        const s = i / 36;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.48) continue;
        const side = (i % 2) ? 1 : -1;
        const d = 20 + hash(kk * 98 + i) * 25;
        tree(kk, side, d, 10 + hash(kk * 99 + i) * 6, [0.18, 0.44, 0.16]);
      }
    },
  }
  );
})();
