/* Apex 26 — HUNGARORING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.26, 0.44, 0.72], horizon: [0.74, 0.76, 0.76], grass: [0.26, 0.50, 0.22], runoff: [0.48, 0.44, 0.34], fogDensity: 0.0016, sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1, 0.88, 0.66], sunColor: [1, 0.86, 0.64] },
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
    // Undulating amphitheatre (~36 m): climb from Turn 1, long descent into the back.
    elevations: [{ s: 0.20, halfM: 280, rise: 7 }, { s: 0.55, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              mountain, peak, ridge, tree, pine, bush, hedge, grandstand, building, tower,
              billboard, gantry, marshalPost, fence, guardrail, tyreWall,
              anchor, addBox, addCyl, addCone, addFrustum, vadd, onTrack } = api;
      const k = (s) => Math.round(s * n) % n;

      // ---- Dry Hungarian-summer palette ----
      const GRASS = [0.42, 0.55, 0.27];     // base sun-baked grass
      const GRASS2 = [0.48, 0.58, 0.30];    // lighter dry grass
      const BANK = [0.58, 0.62, 0.34];      // bleached spectator banking
      const BANK2 = [0.62, 0.64, 0.40];     // lighter sun-baked banking
      const TREE = [0.20, 0.34, 0.18];      // dark tree masses
      const TREE2 = [0.26, 0.40, 0.20];     // mid tree green
      const SCRUB = [0.46, 0.50, 0.28];     // dry scrub bush
      const HAZE = [0.62, 0.64, 0.46];      // far haze-tinted hills
      const HAZE2 = [0.70, 0.70, 0.56];     // furthest hazed ridge
      const SHELL = [0.46, 0.47, 0.50];     // grandstand back shell
      const SHELL2 = [0.40, 0.42, 0.46];    // darker shell
      const WHITE = [0.90, 0.91, 0.93], RED = [0.82, 0.18, 0.18];
      const STEEL = [0.66, 0.68, 0.72];     // armco / fence steel
      const TYRE = [0.10, 0.10, 0.11];      // tyre stack black
      const WATER = [0.16, 0.30, 0.32];     // dark blue-green pond
      const PADDOCK = [0.55, 0.55, 0.57];   // paddock tarmac
      // crowd seating tints (used to vary stands so they read as packed)
      const CROWD = [[0.55, 0.32, 0.30], [0.50, 0.52, 0.58], [0.62, 0.58, 0.40], [0.48, 0.50, 0.54]];

      // ---- Continuous low grassy amphitheatre ring wrapping the lap ----
      // organic dry-green hills, NO snow (snowline>1), neighbours overlapping so
      // the bowl reads as one unbroken grassy bank framing the whole circuit.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ringPt = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      // inner continuous grassy banking ring — dense, low, dry-green, no snow.
      // extra=160 ensures (wMin+wVar)*0.62 < extra-8=152 so the guard won't skip these.
      const ring0 = rad + 160;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * 6.2832, h = hash(i * 7);
        mountain(cx + Math.cos(a) * ring0, cz + Math.sin(a) * ring0, pyMin,
                 80 + h * 50, 16 + h * 8,
                 { seg: 7, seed: i * 13, snowline: 2, forest: GRASS, col: BANK, rock: [0.50, 0.54, 0.36] });
      }
      // second overlapping grassy ring (offset half a step) — fills any seam,
      // slightly taller for stepped-banking depth.
      const ring1 = rad + 230;
      for (let i = 0; i < 32; i++) {
        const a = (i + 0.5) / 32 * 6.2832, h = hash(i * 11 + 90);
        mountain(cx + Math.cos(a) * ring1, cz + Math.sin(a) * ring1, pyMin,
                 250 + h * 90, 24 + h * 12,
                 { seg: 8, seed: i * 17 + 5, snowline: 2, forest: GRASS, col: BANK, rock: [0.52, 0.55, 0.37] });
      }
      // far hazed ridge ring — continuous, warm haze tint, low forested horizon
      const ring2 = rad + 380;
      for (let i = 0; i < 28; i++) {
        const a = (i + 0.25) / 28 * 6.2832, h = hash(i * 11 + 300);
        peak(cx + Math.cos(a) * ring2, cz + Math.sin(a) * ring2, pyMin,
             260 + h * 120, 32 + h * 18, HAZE);
      }
      // furthest pale-hazed horizon ridge — broad low ridges blending to sky tint
      const ring3 = rad + 560;
      for (let i = 0; i < 24; i++) {
        const a = (i + 0.6) / 24 * 6.2832, h = hash(i * 19 + 700);
        ridge(cx + Math.cos(a) * ring3, cz + Math.sin(a) * ring3, pyMin,
              a + Math.PI / 2, 340 + h * 180, 200 + h * 120, 40 + h * 26, HAZE2);
      }
      // dark forested crest line riding the inner banking ring (low horizon trees)
      for (let i = 0; i < 44; i++) {
        const a = i / 44 * 6.2832, h = hash(i * 23 + 40);
        const [tx, tz] = ringPt(a, ring1 - 24 - h * 30);
        if (onTrack(tx, tz, 8)) continue;
        const ty = pyMin + 18 + h * 8;
        addCone(out, [tx, ty, tz], 24 + h * 16, 30 + h * 16, h < 0.5 ? TREE : TREE2, 6, null);
      }

      // ---- Continuous stepped green crowd banking lining the whole lap ----
      // Three tiers of banking boxes ring the track so it sits in a grassy bowl,
      // with multiple levels creating dramatic amphitheatre effect.
      every(25, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 5 + side);
          // close inner banking tier (near spectator zone)
          backdrop(kk, side, 52 + hh * 26, [60, 8 + hh * 5, 60], hh < 0.45 ? BANK : GRASS2);
          // mid-range banking tier (stepped amphitheatre)
          backdrop(kk, side, 98 + hh * 48, [90, 13 + hh * 8, 85], hh < 0.5 ? BANK2 : GRASS);
          // outer tall banking tier (bowl rim)
          backdrop(kk, side, 160 + hh * 70, [120, 18 + hh * 12, 110], hh < 0.4 ? GRASS : BANK);
        }
      });

      // ---- Speckled crowd on the banking: small coloured caps reading as people ----
      // Placed by clearance on the banking slope, off the tarmac, all around the bowl.
      // Denser crowd placement for busier Hungarian GP atmosphere.
      every(18, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 31 + side * 3);
          if (hh < 0.35) continue;             // smaller gaps in the crowd
          const base = 25 + hh * 24;
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          prop(kk, side, base, [13, 1.7 + hh * 1.3, 15], col);
          if (hh > 0.6) prop(kk, side, base + 18 + hh * 10, [11, 1.5, 13],
                             CROWD[(kk + 2) % CROWD.length]);
          if (hh > 0.75) prop(kk, side, base + 35 + hh * 16, [12, 1.6, 14],
                              CROWD[(kk + 3) % CROWD.length]);
        }
      });

      // ---- Trees: dark-green clumps + dry scrub bushes scattered up the banks ----
      every(20, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 17 + side);
          if (s < 0.28) continue;
          const dist = 52 + s * 70;
          (s < 0.6 ? pine : tree)(kk, side, dist, 8 + s * 6, s < 0.5 ? TREE : TREE2);
          if (s > 0.55) tree(kk, side, dist + 10 + s * 14, 9 + s * 5, TREE);
          if (s > 0.80) pine(kk, side, dist + 22 + s * 16, 8 + s * 5, TREE);
        }
      });
      // dry scrub bushes dotted close to the run-off edge all around
      every(26, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 41 + side * 7);
          if (s < 0.55) continue;
          bush(kk, side, 16 + s * 16, SCRUB);
        }
      });
      // dense ridge tree-clump helper
      const clump = (s, side, dist) => {
        for (let j = 0; j < 6; j++) {
          const kk = (k(s) + j) % n;
          (j % 2 ? tree : pine)(kk, side, dist + hash(kk * 3 + j) * 20,
                                8 + hash(kk * 9 + j) * 6, j % 2 ? TREE2 : TREE);
        }
      };
      clump(0.30, -1, 80);
      clump(0.62, 1, 90);
      clump(0.45, -1, 86);
      clump(0.72, 1, 84);

      // ---- Continuous track furniture ringing the lap (off-tarmac) ----
      // Armco guardrail with a tyre-wall stack behind it where banking is close,
      // and tall catch fences in front of the main spectator zones.
      guardrail(0.00, 1.00, 1, 4.5, STEEL);     // outside-edge armco, full lap (R)
      guardrail(0.00, 1.00, -1, 4.5, STEEL);    // inside-edge armco, full lap (L)
      // catch fences in front of the busy stand/banking zones
      fence(0.95, 0.20, 1, 6.5, 7, STEEL);      // main straight + Turn 1 grandstands
      fence(0.30, 0.45, -1, 6.5, 7, STEEL);     // mid-sector inside stands
      fence(0.52, 0.62, 1, 6.5, 7, STEEL);      // twisty-sector stands
      // tyre walls at the high-risk braking points
      tyreWall(0.045, 0.075, 1, 5.5, RED);      // Turn 1 heavy braking
      tyreWall(0.14, 0.17, -1, 5.5, [0.95, 0.85, 0.15]);  // Turn 2-4 complex
      tyreWall(0.54, 0.57, 1, 5.5, [0.20, 0.40, 0.85]);   // twisty sector

      // ---- Marshal posts around the lap ----
      for (const [s, side] of [[0.05, 1], [0.16, -1], [0.30, -1], [0.42, 1],
                               [0.55, -1], [0.68, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(k(s), side, 5);
      }

      // ---- Billboards / advertising hoardings facing the crowd ----
      for (const [s, side] of [[0.04, 1], [0.10, -1], [0.20, 1], [0.34, -1],
                               [0.46, 1], [0.58, -1], [0.70, 1], [0.88, -1]]) {
        const c = CROWD[k(s) % CROWD.length];
        billboard(k(s), side, 9, 16, 5, hash(k(s)) < 0.5 ? RED : c);
      }

      // ---- s=0: new pit complex (L) facing the main covered grandstand (R) ----
      // Long low white/grey pit slab with a thin VIP terrace stacked on top.
      building(k(0.00), -1, 2, 14, 10, 70, { wall: WHITE, window: [0.36, 0.42, 0.48], floor: 5 });
      {
        const a = anchor(k(0.00), -1, 9);
        addBox(out, vadd(a.c, a.u, 11.5), [10, 2.6, 50], [0.80, 0.82, 0.86], [a.r, a.u, a.t]); // VIP terrace box
        addBox(out, vadd(a.c, a.u, 13.2), [14, 0.7, 64], [0.84, 0.86, 0.90], [a.r, a.u, a.t]); // roof blade
      }
      // Paddock buildings + hospitality behind the pits (L), set further back.
      groundPlane(k(0.00), -1, 26, [120, 1.0, 130], PADDOCK);   // paddock apron slab
      building(k(0.96), -1, 30, 18, 9, 40, { wall: [0.78, 0.80, 0.83], window: [0.34, 0.40, 0.48], floor: 4 });
      building(k(0.03), -1, 32, 16, 12, 34, { wall: WHITE, window: [0.40, 0.46, 0.52], floor: 5 });
      building(k(0.07), -1, 30, 20, 8, 30, { wall: [0.72, 0.74, 0.78], window: [0.34, 0.40, 0.46], floor: 3 });
      // motorhome / hospitality awnings (low bright boxes) in the paddock
      for (let j = 0; j < 5; j++) {
        const c = CROWD[j % CROWD.length];
        place(k(0.94 + j * 0.018), -1, 22 + (j % 2) * 5, [10, 4, 9], j % 2 ? WHITE : c);
      }
      // a comms tower behind the paddock for vertical interest
      tower(k(0.02), -1, 44, 8, 34, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: true });
      // pit wall + garage strip with red kerb trim
      place(k(0.02), -1, 3, [0.8, 1.3, 70], WHITE);
      place(k(0.02), -1, 2, [0.4, 0.3, 70], RED);
      // Start/finish gantry spanning the track
      gantry(0.005, 7.5, [0.30, 0.32, 0.36]);
      // Main covered grandstand (R), big stepped wedge with dark roof (deeper, taller)
      grandstand(0.00, 1, 9, 100, SHELL, CROWD[1]);
      grandstand(0.00, 1, 30, 90, SHELL2, CROWD[0]);            // upper-deck stand behind
      billboard(k(0.00), 1, 22, 26, 7, RED);                    // big sponsor board above main stand

      // ---- Turn 1 (s≈0.06): tall stacked spectator banking + pond in the basin ----
      grandstand(0.06, 1, 9, 62, SHELL, CROWD[0]);
      grandstand(0.08, 1, 28, 56, SHELL2, CROWD[1]);            // extra upper-deck stand
      backdrop(k(0.06), 1, 36, [110, 22, 90], BANK);            // mid tall banking
      backdrop(k(0.06), 1, 64, [130, 26, 100], BANK2);          // far tall banking
      groundPlane(k(0.08), 1, 70, [85, 1.0, 65], WATER);        // small lake in valley floor
      hedge(0.04, 0.11, 1, 32, 4, TREE);                        // treeline behind the banks

      // ---- s≈0.12 L: grass amphitheatre hill dotted with tree clumps ----
      backdrop(k(0.12), -1, 35, [110, 18, 95], BANK);
      grandstand(0.12, -1, 10, 44, SHELL, CROWD[2]);
      grandstand(0.15, -1, 26, 40, SHELL2, CROWD[3]);           // extra upper stand
      backdrop(k(0.12), -1, 60, [140, 24, 110], BANK2);         // far banking tier
      clump(0.12, -1, 50);
      clump(0.14, -1, 72);

      // ---- s≈0.18 R: low grandstand bleacher facing the slow complex ----
      grandstand(0.18, 1, 11, 50, SHELL, CROWD[3]);
      grandstand(0.22, 1, 11, 36, SHELL2, CROWD[1]);

      // ---- Twisty middle sector: densely lined with stands + banking ----
      backdrop(k(0.30), -1, 38, [125, 20, 115], BANK);          // s≈0.30 banking under treeline
      grandstand(0.32, -1, 10, 44, SHELL, CROWD[1]);
      grandstand(0.35, -1, 26, 40, SHELL2, CROWD[2]);           // upper deck
      backdrop(k(0.30), -1, 68, [145, 26, 125], BANK2);         // far banking
      backdrop(k(0.40), 1, 42, [120, 20, 110], BANK);           // s≈0.40 mid-sector banking
      grandstand(0.40, 1, 11, 46, SHELL, CROWD[0]);
      grandstand(0.43, 1, 26, 42, SHELL2, CROWD[3]);            // upper deck
      grandstand(0.47, 1, 10, 38, SHELL, CROWD[3]);             // s≈0.47 infill stand
      backdrop(k(0.50), -1, 40, [120, 20, 110], BANK);
      grandstand(0.55, -1, 10, 50, SHELL, CROWD[1]);            // s≈0.55 twisty-sector stand
      grandstand(0.57, -1, 26, 46, SHELL2, CROWD[0]);           // upper deck
      grandstand(0.58, 1, 11, 42, SHELL, CROWD[0]);             // s≈0.58 opposite stand
      clump(0.50, 1, 58);
      clump(0.58, -1, 62);
      backdrop(k(0.62), 1, 140, [140, 22, 120], HAZE);          // s≈0.62 distant haze hill
      grandstand(0.68, -1, 10, 44, SHELL, CROWD[2]);            // s≈0.68 exit-of-sector stand
      grandstand(0.71, -1, 26, 40, SHELL2, CROWD[1]);           // upper deck
      clump(0.68, 1, 60);

      // ---- s≈0.75 L: open dry-green run-off bank ----
      backdrop(k(0.75), -1, 32, [125, 16, 105], GRASS);
      backdrop(k(0.75), -1, 70, [145, 22, 120], GRASS2);        // far banking
      grandstand(0.80, 1, 10, 40, SHELL, CROWD[3]);
      grandstand(0.83, 1, 24, 36, SHELL2, CROWD[1]);            // upper deck

      // ---- s≈0.90 R: approach grandstand leading back to the line ----
      grandstand(0.90, 1, 10, 62, SHELL, CROWD[0]);
      grandstand(0.92, 1, 28, 54, SHELL2, CROWD[1]);            // upper deck behind
      backdrop(k(0.90), 1, 60, [130, 22, 110], BANK2);          // backing banking

      // ---- Red/white kerb accents + grass framing at key apexes ----
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.18, 1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(k(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.08, 12], GRASS);
      }

      // ================= DENSE HILLSIDE TREES (every 12 m, both sides) =================
      // Dense mix of tree() and pine() at distance 35–90 m on the valley slopes,
      // creating a forested amphitheatre rim effect.
      {
        const HILL_MID  = [0.22, 0.44, 0.20];
        const HILL_DARK = [0.12, 0.28, 0.12];
        every(12, (kk) => {
          for (const side of [-1, 1]) {
            const h = hash(kk * 37 + side * 5);
            if (h < 0.25) continue;
            const dist = 35 + h * 55;
            const ht = 8 + h * 9;
            (h < 0.50 ? pine : tree)(kk, side, dist, ht, h < 0.45 ? HILL_DARK : HILL_MID);
          }
        });
      }

      // ================= VILLAGE CHURCH SPIRE (s≈0.37, far hillside) =================
      // Church tower cylinder + conical steeple at ~90 m on the hillside.
      {
        const CHURCH_COL  = [0.82, 0.82, 0.78];
        const STEEPLE_COL = [0.48, 0.50, 0.58];
        const a = anchor(k(0.37), 1, 90);
        const b = [a.r, a.u, a.t];
        addCyl(out, a.c, 1.5, 22, CHURCH_COL, 8, b);
        addCone(out, vadd(a.c, a.u, 22), 2.0, 8, STEEPLE_COL, 8, b);
      }

      // ================= EXTRA GRANDSTANDS AT KEY POSITIONS =================
      // Additional grandstands for denser spectator experience throughout lap
      grandstand(0.10, 1, 12, 48, SHELL2, CROWD[2]);
      grandstand(0.22, 1, 11, 42, SHELL, CROWD[1]);             // s≈0.22 additional stand
      grandstand(0.28, 1, 10, 38, SHELL2, CROWD[0]);            // s≈0.28 high sector stand
      grandstand(0.65, -1, 12, 42, SHELL, CROWD[3]);
      grandstand(0.76, 1, 11, 34, SHELL, CROWD[2]);             // s≈0.76 late-lap stand
      grandstand(0.85, -1, 10, 36, SHELL2, CROWD[0]);           // s≈0.85 back-to-line stand

      // ================= HUNGARIAN FLAG ACCENT BILLBOARDS =================
      billboard(k(0.02), -1, 18, 10, 4, [0.20, 0.48, 0.20]);   // green
      billboard(k(0.04), 1,  17, 10, 4, [0.85, 0.20, 0.20]);   // red

      // ================= VALLEY BOWL TOPOGRAPHY RIDGES =================
      // 7 ridge calls at 100–160 m staggered around the circuit, creating forested
      // horizon with dark forest green slopes and varied heights.
      {
        const FOREST_SLOPE = [0.12, 0.28, 0.12];
        const DARK_FOREST = [0.10, 0.24, 0.10];
        const ridgePts = [
          [0.08, -1, 100],
          [0.15,  1, 140],
          [0.25, -1, 120],
          [0.42,  1, 130],
          [0.55, -1, 110],
          [0.62,  1, 160],
          [0.80, -1, 125],
        ];
        for (const [s, side, dist] of ridgePts) {
          const a = anchor(k(s), side, dist), b = [a.r, a.u, a.t];
          const col = hash(k(s) * 11) < 0.4 ? DARK_FOREST : FOREST_SLOPE;
          addFrustum(out, a.c, 90 + hash(k(s) * 7) * 20, 32 + hash(k(s) * 13) * 12,
                     20 + hash(k(s) * 11) * 14, col, 7, b);
        }
      }
    },
  }
  );
})();
