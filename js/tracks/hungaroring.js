/* Apex 26 — HUNGARORING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.30, 0.46, 0.70], horizon: [0.80, 0.78, 0.70], grass: [0.56, 0.54, 0.34], runoff: [0.58, 0.50, 0.36], fogDensity: 0.0019, sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1, 0.90, 0.68], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
    // Undulating amphitheatre (~36 m): climb from Turn 1, long descent into the back.
    elevations: [{ s: 0.20, halfM: 280, rise: 7 }, { s: 0.55, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, ds, px, py, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, ridge, tree, pine, bush, hedge, grandstand, building, tower,
              billboard, gantry, marshalPost, fence, guardrail, tyreWall,
              anchor, addBox, addCyl, addCone, addFrustum, vadd, onTrack, groundYAt,
              forestEdge, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette: dry, dusty Pannonian summer (sandy soil, straw grass) ----
      const GRASS  = [0.56, 0.54, 0.34];    // straw / sun-bleached dry grass
      const GRASS2 = [0.60, 0.56, 0.36];    // paler dusty patch
      const DUST   = [0.62, 0.55, 0.40];    // bare sandy/dusty earth
      // Amphitheatre banks stay barely green-dominant so the engine still renders
      // them as rounded organic mounds (G > R and G > B*1.05), but desaturated and
      // dusty so they read as dry summer hillsides, not a wet spring meadow.
      const AMPH   = [0.46, 0.49, 0.30];    // dry-grass bank (just green-dominant)
      const AMPH2  = [0.50, 0.52, 0.32];    // sunlit dusty terrace variant
      const TREE   = [0.30, 0.36, 0.22];    // dusty dry-summer oak canopy
      const TREE2  = [0.40, 0.42, 0.26];    // yellowing / sun-faded foliage
      const SCRUB  = [0.54, 0.52, 0.32];    // dry scrub bush
      const HAZE   = [0.64, 0.62, 0.48];    // far haze-tinted hills
      const HAZE2  = [0.70, 0.68, 0.56];    // furthest hazed ridge
      const SHELL  = [0.46, 0.47, 0.50];    // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE  = [0.90, 0.91, 0.93];
      const RED    = [0.82, 0.18, 0.18];
      const STEEL  = [0.66, 0.68, 0.72];
      const PADDOCK = [0.55, 0.55, 0.57];
      const SENNA_G = [0.16, 0.55, 0.22];   // Senna-tribute kerb green
      const SENNA_Y = [0.95, 0.82, 0.12];   // Senna-tribute kerb yellow
      const LAMP_POST = [0.28, 0.29, 0.30];
      const LAMP_HEAD = [0.96, 0.94, 0.84];
      const LAMP_ARM  = [0.34, 0.35, 0.36];
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];
      const WIN_WARM = [0.92, 0.78, 0.42];
      const WIN_COOL = [0.78, 0.84, 0.96];

      // ---- Track centre + radius ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      // ====================================================================
      // DISTANT HORIZON — haze-tinted far peaks ring the bowl
      // ====================================================================
      const ringFar = rad + 460;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 28 + h * 16, HAZE);
      }
      // Furthest haze ridges
      const ringHorizon = rad + 640;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 340 + h * 160, 190 + h * 100, 38 + h * 22, HAZE2);
      }

      // ====================================================================
      // AMPHITHEATRE BOWL WALLS — green backdrop() rounded mounds
      // The Hungaroring's signature feature: natural grassy hillsides visible
      // through the fences all the way around the circuit. Green-dominant
      // colours trigger the ROUNDED ORGANIC MOUND rendering path (frustum+dome
      // cap instead of a flat box), so these read as true hillsides.
      // 12 mounds total (same count as original backdrop zones) for perf parity.
      // ====================================================================
      const amphPts = [
        [0.05, 1, 180], [0.15, -1, 195], [0.25, 1, 185],
        [0.35, -1, 190], [0.48,  1, 185], [0.58, -1, 195],
        [0.68,  1, 188], [0.78, -1, 192], [0.88,  1, 180],
        [0.92, -1, 190], [0.97,  1, 185], [0.02, -1, 195],
      ];
      for (const [s, side, dist] of amphPts) {
        const hh = hash(Math.round(s * n) * 11 + side * 3);
        // Strongly green-dominant (G > R and G > B*1.05) → renders as rounded hill
        backdrop(K(s), side, dist, [120 + hh * 40, 34 + hh * 14, 110], AMPH);
      }

      // Scattered oak woodland on the far bowl crests (sparse, NOT a ring).
      // Only ~half the slots fire, so open dry-grass banks show between the
      // wooded patches — the surrounding Gödöllő Hills are oak woods + meadow.
      const ringMid = rad + 300;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * 6.2832, h = hash(i * 19 + 100);
        if (h < 0.5) continue;                       // leave big open gaps
        const tx = cx + Math.cos(a) * ringMid;
        const tz = cz + Math.sin(a) * ringMid;
        if (onTrack(tx, tz, 14)) continue;
        addCone(out, [tx, pyMin, tz], 20 + h * 10, 18 + h * 10,
                h < 0.72 ? TREE : TREE2, 7, null);
      }

      // ====================================================================
      // STADIUM SECTION — Turns 1–4 cluster (large natural-bowl grandstands)
      // The famous Hungaroring stadium section has tiered stands on both sides.
      // ====================================================================
      // Grid stands: pit straight right, main covered Tribune
      grandstand(0.00, 1,  9, 100, SHELL,  CROWD[1]);   // Grid 1 (main straight)
      grandstand(0.00, 1, 28,  90, SHELL2, CROWD[0]);   // Grid 2 (behind Grid 1)
      billboard(K(0.00), 1, 28, 26, 7, RED);
      // T1 grandstand group: outside of Turn 1 braking zone
      grandstand(0.06,  1,  9,  70, SHELL,  CROWD[0]);
      // Stadium inside: Apex 1/2 banked stands inside Turn 1-2
      grandstand(0.10, -1, 10,  56, SHELL,  CROWD[2]);
      // Sector grandstands across the back of the circuit
      grandstand(0.12, -1, 10, 44, SHELL,  CROWD[2]);
      grandstand(0.35, -1, 10, 48, SHELL,  CROWD[1]);
      grandstand(0.40,  1, 11, 46, SHELL,  CROWD[0]);
      grandstand(0.55, -1, 10, 50, SHELL,  CROWD[1]);
      grandstand(0.68, -1, 10, 44, SHELL,  CROWD[2]);
      grandstand(0.80,  1, 10, 40, SHELL,  CROWD[3]);
      grandstand(0.90,  1, 10, 62, SHELL,  CROWD[0]);   // Club stand — final corner

      // ====================================================================
      // GRANDSTAND ACCENT STRIPS — lit fascia + concourse window bands
      // ====================================================================
      const FASCIA  = [0.94, 0.92, 0.84];
      const FASCIA2 = [0.78, 0.80, 0.82];
      const standAccent = (s, side, gap, len) => {
        const a = anchor(K(s), side, gap + 5);
        if (onTrack(a.c[0], a.c[2], len * 0.5)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 13.15), [0.3, 0.5, len + 2], FASCIA, b);
        addBox(out, vadd(a.c, a.u, 7.5), [0.2, 0.6, len - 2], FASCIA2, b);
      };
      standAccent(0.00, 1, 9,  100);
      standAccent(0.00, 1, 28,  90);
      standAccent(0.06, 1, 9,   70);
      standAccent(0.10, -1, 10, 56);
      standAccent(0.12, -1, 10, 44);
      standAccent(0.35, -1, 10, 48);
      standAccent(0.40,  1, 11, 46);
      standAccent(0.55, -1, 10, 50);
      standAccent(0.68, -1, 10, 44);
      standAccent(0.80,  1, 10, 40);
      standAccent(0.90,  1, 10, 62);

      // Grandstand lit-window concourse strips
      const gsLit = [
        { s: 0.00, side: 1, gap: 18, len: 96 },
        { s: 0.06, side: 1, gap: 14, len: 66 },
        { s: 0.10, side: -1, gap: 15, len: 52 },
        { s: 0.35, side: -1, gap: 15, len: 44 },
        { s: 0.55, side: -1, gap: 15, len: 46 },
        { s: 0.90, side: 1, gap: 15, len: 58 },
      ];
      for (const g of gsLit) {
        const k = K(g.s);
        const a = anchor(k, g.side, g.gap);
        addBox(out, vadd(a.c, a.u, 1.4), [0.22, 1.0, g.len - 4], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.6), [0.22, 0.8, g.len - 6], WIN_COOL, [a.r, a.u, a.t]);
      }

      // ====================================================================
      // SPARSE OAK WOODLAND — scattered clumps on the crests, OPEN banks between
      // The Gödöllő Hills are "oak woods, sandy meadows and wildflowers": NOT a
      // dense forest wall. We keep small clustered broadleaf (oak) stands on the
      // hill crests only, set well back (gap≥40) so the spectator-facing dry-grass
      // amphitheatre banks stay open — the bowl's whole point is ~80% visibility.
      // Pushed far back behind the stands, the clumps read as woodland on the
      // surrounding ridges rather than a treeline hugging the fences.
      // ====================================================================
      const oakClumps = [
        // [s, side, gap, count, spread, hMin, hMax]
        [0.04,  1, 64, 5, 26, 9, 15], [0.16,  1, 58, 4, 22, 8, 13],
        [0.27,  1, 70, 6, 30, 9, 14], [0.40,  1, 60, 4, 20, 8, 12],
        [0.52,  1, 66, 5, 26, 9, 14], [0.64,  1, 58, 4, 22, 8, 13],
        [0.76,  1, 70, 6, 30, 9, 15], [0.88,  1, 60, 4, 22, 8, 13],
        [0.10, -1, 52, 4, 20, 8, 13], [0.22, -1, 60, 5, 24, 9, 14],
        [0.33, -1, 50, 4, 20, 8, 12], [0.46, -1, 58, 5, 24, 9, 14],
        [0.60, -1, 54, 4, 22, 8, 13], [0.72, -1, 60, 5, 26, 9, 14],
        [0.84, -1, 52, 4, 20, 8, 13], [0.95, -1, 56, 5, 24, 9, 14],
      ];
      for (const [s, side, gap, count, spread, hMin, hMax] of oakClumps) {
        const a = anchor(K(s), side, gap);
        for (let j = 0; j < count; j++) {
          const h = hash(K(s) * 53 + side * 17 + j * 7);
          const h2 = hash(K(s) * 29 + side * 13 + j * 5);
          // scatter the clump along-track and a little further out
          const c = vadd(vadd(a.c, a.t, (h - 0.5) * spread), a.r, side * h2 * spread * 0.55);
          if (onTrack(c[0], c[2], 12)) continue;
          const ht = hMin + h * (hMax - hMin);
          const col = h2 < 0.5 ? TREE : TREE2;
          // broadleaf oak: short trunk + a broad rounded canopy
          addCyl(out, c, 0.45, ht * 0.42, [0.34, 0.27, 0.18], 5, null);
          addCone(out, [c[0], c[1] + ht * 0.40, c[2]], ht * 0.62, ht * 0.66, col, 7, null);
          addCone(out, [c[0], c[1] + ht * 0.72, c[2]], ht * 0.42, ht * 0.40, col, 7, null);
        }
      }

      // Occasional lone tree + dry scrub dotting the open meadow banks (sparse)
      every(70, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 37 + side * 11);
          if (s < 0.74) continue;
          tree(kk, side, 30 + s * 26, 9 + s * 5, s < 0.87 ? TREE2 : TREE);
        }
      });
      every(56, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 41 + side * 9);
          if (s < 0.70) continue;
          bush(kk, side, 11 + s * 14, SCRUB);
        }
      });

      // ====================================================================
      // LAMP POSTS — double-arm, every ~80 m, full circuit
      // ====================================================================
      every(80, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 31 + side * 7);
          if (hh < 0.15) continue;
          const a = anchor(kk, side, 5);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          const armC = vadd(vadd(a.c, a.u, 9.6), a.r, side * 1.2);
          addBox(out, armC, [2.4, 0.18, 0.18], LAMP_ARM, b);
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 2.2);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
        }
      });
      // Extra lamp clusters at key braking zones
      for (const [s0, s1, side] of [[0.95, 0.08, 1], [0.52, 0.62, 1], [0.30, 0.44, -1]]) {
        let kk = K(s0);
        const kEnd = K(s1), step = Math.max(1, Math.round(50 / ds));
        for (let iter = 0; iter < n; iter++, kk = (kk + step) % n) {
          if (kk === kEnd) break;
          const a = anchor(kk, side, 5);
          if (onTrack(a.c[0], a.c[2], 1.5)) continue;
          const b = [a.r, a.u, a.t];
          addCyl(out, a.c, 0.12, 10, LAMP_POST, 5, b);
          const headC = vadd(vadd(a.c, a.u, 9.2), a.r, side * 1.8);
          addBox(out, headC, [1.0, 0.3, 0.7], LAMP_HEAD, b);
        }
      }

      // ====================================================================
      // TRACK FURNITURE — guardrails, catch fences, tyre walls
      // ====================================================================
      guardrail(0.00, 1.00,  1, 4.5, STEEL);  // outside armco, full lap
      guardrail(0.00, 1.00, -1, 4.5, STEEL);  // inside armco, full lap
      // Catch fences in front of busy spectator zones
      fence(0.95, 0.20,  1, 6.5, 7, STEEL);   // main straight + Turn 1
      fence(0.30, 0.45, -1, 6.5, 7, STEEL);   // mid-sector inside
      fence(0.52, 0.62,  1, 6.5, 7, STEEL);   // twisty-sector stands
      // Tyre walls at high-risk braking points
      tyreWall(0.045, 0.075,  1, 5.5, RED);
      tyreWall(0.14,  0.17,  -1, 5.5, [0.95, 0.85, 0.15]);
      tyreWall(0.54,  0.57,   1, 5.5, [0.20, 0.40, 0.85]);

      // ====================================================================
      // MARSHAL POSTS
      // ====================================================================
      for (const [s, side] of [[0.05, 1], [0.12, -1], [0.16, -1], [0.30, -1],
                                [0.42, 1], [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 5);
      }

      // ====================================================================
      // PIT COMPLEX (inside, s≈0) + MAIN GRANDSTAND (outside, s≈0)
      // ====================================================================
      building(K(0.00), -1, 2, 14, 9, 70, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      groundPlane(K(0.00), -1, 65, [120, 1.0, 130], PADDOCK);
      // Rear hospitality/paddock building
      building(K(0.03), -1, 32, 16, 10, 34, { wall: WHITE, window: WIN_WARM, lit: true, floor: 4 });
      // Comms/broadcast tower — vertical landmark
      tower(K(0.02), -1, 44, 8, 32, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: true });
      // Pit wall + kerb trim
      place(K(0.02), -1, 3, [0.8, 1.3, 70], WHITE);
      place(K(0.02), -1, 2, [0.4, 0.3, 70], RED);
      // Start/finish gantry
      gantry(0.005, 7.5, [0.30, 0.32, 0.36]);

      // Pit building lit window detail
      {
        const aW = anchor(K(0.00), -1, 9);
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 2.6),
                 [0.18, 1.6, 3.8], WIN_WARM, [aW.r, aW.u, aW.t]);
        }
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 10;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 6.8),
                 [0.18, 1.6, 3.8], WIN_COOL, [aW.r, aW.u, aW.t]);
        }
      }

      // ====================================================================
      // ACCENT FEATURES — open dusty infield, hedge, Hungarian flags
      // NOTE: no infield pond/lake. The natural spring was culverted underground
      // in 1989; the only water (Aquaréna) is a separate waterpark OUTSIDE the
      // venue. The infield is open dry grass + dusty bare-earth banks instead.
      // ====================================================================
      // Dusty bare-earth patch on the infield floor (gap=75 clears track)
      groundPlane(K(0.08), 1, 75, [80, 1.0, 60], DUST);
      hedge(0.04, 0.11, 1, 32, 4, TREE);

      // Hungarian tricolour accent billboards (red/white/green)
      billboard(K(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);   // green
      billboard(K(0.04),  1, 22, 10, 4, [0.85, 0.20, 0.20]);   // red

      // ====================================================================
      // KERB ACCENTS at key corners — standard red/white kerbs,
      // plus the green+yellow Senna-tribute kerb pair at T6–T7.
      // ====================================================================
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(K(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(K(s), side, 7, [10, 0.08, 12], GRASS);
      }
      // Senna kerbs (green & yellow, Brazilian colours) at Turns 6–7.
      for (const [s, side] of [[0.44, -1], [0.49, 1]]) {
        place(K(s), side, 2,   [0.45, 0.28, 7], SENNA_G);
        place(K(s), side, 2.6, [0.45, 0.27, 7], SENNA_Y);
      }

      // ====================================================================
      // SPARSE CROWD ACCENTS on the natural amphitheatre banking
      // Small flat props representing spectators on the grassy slopes —
      // the Hungaroring's famous "hill-viewing" areas.
      // ====================================================================
      every(30, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.40) continue;
          const base = 32 + hh * 22;
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          prop(kk, side, base, [14, 1.8 + hh * 1.2, 16], col);
        }
      });
    },
  }
  );
})();
