/* Apex 26 — IMOLA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -70, l: 90 }, { t: 60, l: 80 },
      { t: 80, l: 100 }, { t: 0, l: 400 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 0, l: 180 }, { t: 80, l: 90 },
      { t: -100, l: 110 },
    ],
    // Hilly Italian classic (~40 m): dip to Acque Minerali, climb to Piratella,
    // then the descent through the Rivazza.
    elevations: [{ s: 0.28, halfM: 300, rise: -6 }, { s: 0.52, halfM: 300, rise: 10 }, { s: 0.78, halfM: 240, rise: -5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, place, prop, backdrop, groundPlane,
              groundYAt, onTrack, addBox, addCyl, addCone, addPrism, vadd, anchor,
              along, mountain, tree, pine, hedge, bush,
              grandstand, building, tower, billboard, marshalPost, gantry,
              fence, guardrail, tyreWall, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (Imola riverside parkland greens) ----
      const CANOPY = [0.20, 0.46, 0.22];   // sunlit deciduous canopy
      const WOODS  = [0.11, 0.30, 0.15];   // shaded woods
      const BANK   = [0.42, 0.63, 0.30];   // sunlit grass bank
      const RIVER  = [0.28, 0.42, 0.52];   // blue-green Santerno water
      const GRAVEL = [0.78, 0.70, 0.52];   // pale tan gravel
      const RED    = [0.82, 0.16, 0.14];
      const WHITE  = [0.92, 0.92, 0.90];

      // ---- Encircling WOODED IMOLA HILLS — CONTINUOUS green ring, no snow (snowline > 1) ----
      // Centre-based ring so peaks sit on the horizon, not in the infield.
      // Counts are sized so neighbouring peaks overlap (touch) — an unbroken wooded wall.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        // near low wooded hills — wMin sized so w*0.62 < extra-8 (guard won't fire)
        { extra: 230, wMin: 140, hMin: 38, hVar: 28, wVar: 80, count: 26, seg: 7,
          opts: { snowline: 2, forest: [0.13, 0.32, 0.16], rock: [0.30, 0.40, 0.26], col: [0.18, 0.36, 0.20] } },
        // mid wooded hills — fills the gaps behind the near ring
        { extra: 380, wMin: 220, hMin: 58, hVar: 40, wVar: 80, count: 20, seg: 7,
          opts: { snowline: 2, forest: [0.17, 0.38, 0.20], rock: [0.36, 0.46, 0.34], col: [0.21, 0.40, 0.23] } },
        // far hazed wooded ridges — paler green, still no snow; continuous backdrop
        { extra: 540, wMin: 320, hMin: 82, hVar: 52, wVar: 80, count: 16, seg: 7,
          opts: { snowline: 2, forest: [0.20, 0.42, 0.22], rock: [0.40, 0.48, 0.40], col: [0.24, 0.42, 0.26] } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          const w = rg.wMin + h * rg.wVar;
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar,
                   Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }
      // Tiered dark-green box ridges settling behind the trackside treeline (Imola hills enclosing the back).
      // 24 m height ≈ tall deciduous canopy; 200 m+ keeps near face >140 m from road edge.
      every(70, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 90, [110, 24, 90], [0.16, 0.34, 0.18]);
        }
      });

      // ---- DENSE PARKLAND: deciduous canopy + conifers walling both sides ----
      every(18, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.22) continue;
          const dist = 9 + s * 20, h = 9 + s * 8;
          if (s < 0.62) tree(k, side, dist, h, [0.18 + s * 0.06, 0.44, 0.21]);
          else pine(k, side, dist, h + 2, [0.10 + s * 0.04, 0.30, 0.15]);
        }
      });
      // Second, deeper rank of forest behind the first wall for thickness.
      every(30, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5);
          if (s < 0.46) continue;
          const dist = 30 + s * 26, h = 12 + s * 8;
          if (s < 0.70) pine(k, side, dist, h + 2, WOODS);
          else tree(k, side, dist, h, [0.15 + s * 0.05, 0.40, 0.19]);
        }
      });
      // Sunlit broadleaf verge trees scattered between.
      every(70, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.45) return;
        tree(k, h < 0.7 ? -1 : 1, 13 + h * 9, 11 + h * 6, CANOPY);
      });
      // Third, far rank: a deep mature woodland mass — clusters of large broadleaf
      // crowns + the odd tall pine, set well back so the parkland reads as endless.
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 91 + side * 13);
          if (s < 0.5) continue;
          const dist = 56 + s * 50;
          if (onTrack(px[k], pz[k], 0)) continue; // cheap guard; tree() also guards
          if (s < 0.78) tree(k, side, dist, 14 + s * 8, [0.13 + s * 0.05, 0.36, 0.18]);
          else pine(k, side, dist, 16 + s * 8, WOODS);
        }
      });
      // Low understory shrubs dotted along the verge for ground texture.
      every(46, (k) => {
        const s = hash(k * 29 + 3);
        if (s < 0.6) return;
        bush(k, s < 0.8 ? -1 : 1, 7 + s * 6, [0.18 + s * 0.06, 0.40, 0.20]);
      });

      // ---- Dense forest lining Tamburello approach ----
      for (let i = 0; i < 28; i++) {
        const s = i / 28;  // 0.0 → 1.0 full lap but focused on start straight
        if (s > 0.10 && s < 0.90) continue;  // only start/finish straight approach
        const kk = K(s);
        for (const side of [-1, 1]) {
          const h2 = hash(kk * 81 + side + i);
          const dist = 10 + h2 * 10;
          if (h2 < 0.45) pine(kk, side, dist, 10 + h2 * 6, [0.10, 0.28, 0.14]);
          else tree(kk, side, dist, 9 + h2 * 5, [0.18, 0.38, 0.20]);
        }
      }

      // ---- s 0.00 R — Santerno river: CONTINUOUS flat water slab paralleling the river run ----
      // Overlapping slabs from the pit straight through the run to Tosa, no gaps.
      for (let i = 0; i <= 10; i++) {
        const s = i * 0.018;            // 0.00 → 0.18, the river-side stretch
        groundPlane(K(s), 1, 15, [34, 90], RIVER);
      }
      groundPlane(K(0.00), 1, 16, [70, 220], RIVER);
      groundPlane(K(0.05), 1, 18, [60, 180], RIVER);
      // grassy bank between road and river, running the whole river stretch
      groundPlane(K(0.02), 1, 6, [16, 200], BANK);
      groundPlane(K(0.10), 1, 6, [16, 160], BANK);
      // tree line hugging the back run to Tosa (s≈0.20, right, mid)
      hedge(0.16, 0.26, 1, 26, 7, WOODS);

      // ---- s 0.00 L — Old pit building + main grandstand on the pit straight ----
      building(K(0.00), -1, 1, 16, 11, 130, { wall: [0.58, 0.60, 0.63], window: [0.34, 0.36, 0.40], floor: 5 });
      // red trim row fronting the old pit building
      prop(K(0.01), -1, 7, [2.5, 1.6, 120], RED);
      grandstand(0.965, -1, 10, 90, [0.55, 0.58, 0.62], RED);
      // packed start-straight stands opposite the pits (river side) + extra pit-straight stand
      grandstand(0.02, 1, 22, 80, [0.52, 0.55, 0.60], [0.78, 0.30, 0.22]);
      grandstand(0.93, -1, 10, 70, [0.55, 0.58, 0.62], RED);

      // ---- s 0.05 L — Tamburello chicane + Ayrton Senna memorial ----
      // green lawn with a small bronze statue box reading as the memorial
      groundPlane(K(0.05), -1, 8, [26, 30], BANK);
      place(K(0.05), -1, 14, [2, 3.2, 2], [0.45, 0.40, 0.30]);   // bronze Senna memorial
      tree(K(0.05), -1, 22, 12, CANOPY);
      // red/white kerb accents
      place(K(0.05), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.06), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- s 0.12 L — Villeneuve chicane kerbs + gravel trap beyond ----
      groundPlane(K(0.12), -1, 5, [24, 30], GRAVEL);
      place(K(0.12), -1, 2, [0.4, 0.3, 7], RED);
      place(K(0.13), -1, 2, [0.4, 0.3, 7], WHITE);

      // ---- s 0.28 L — Tosa tight hairpin: stepped grandstand + gravel run-off ----
      grandstand(0.28, -1, 12, 60, [0.52, 0.55, 0.60], RED);
      grandstand(0.31, -1, 12, 50, [0.54, 0.57, 0.61], [0.20, 0.42, 0.72]);
      groundPlane(K(0.28), -1, 6, [34, 40], GRAVEL);

      // ---- s 0.35 L+R far — Piratella blind hill-crest: dark wooded green walls ----
      for (const side of [-1, 1]) {
        backdrop(K(0.35), side, 70 + side * 6, [60, 30, 90], [0.14, 0.32, 0.17]);
        pine(K(0.35), side, 30, 13, WOODS);
        pine(K(0.36), side, 24, 12, WOODS);
      }

      // ---- s 0.50 R mid — Acque Minerali right-left in a green hollow: dense trees + fog ----
      for (let i = 0; i < 6; i++) {
        const k = K(0.48 + i * 0.012);
        pine(k, 1, 16 + hash(k * 9) * 14, 12 + hash(k * 5) * 6, WOODS);
        tree(k, 1, 30 + hash(k * 7) * 16, 11, WOODS);
      }
      // thin fog band lingering in the river-valley hollow
      groundPlane(K(0.50), 1, 10, [40, 60], [0.74, 0.78, 0.74]);

      // ---- s 0.60 L far — Wooded hills backdrop: tiered dark-green box ridges ----
      for (let i = 0; i < 4; i++) {
        backdrop(K(0.58 + i * 0.012), -1, 100 + i * 18, [120, 26 + i * 6, 80], [0.16, 0.34, 0.18]);
      }

      // ---- s 0.66 L+R near — Variante Alta chicane over a crest: tall sausage kerbs ----
      for (const side of [-1, 1]) {
        place(K(0.66), side, 2, [0.7, 0.5, 8], RED);
        place(K(0.67), side, 2, [0.7, 0.5, 8], WHITE);
      }
      bush(K(0.66), -1, 10, BANK);

      // ---- s 0.80 L mid — Rivazza double-left descent: grass banks, gravel, grandstand ----
      grandstand(0.80, -1, 12, 55, [0.52, 0.55, 0.60], RED);
      grandstand(0.84, -1, 12, 48, [0.54, 0.57, 0.61], [0.78, 0.30, 0.22]);
      groundPlane(K(0.80), -1, 6, [30, 50], GRAVEL);
      groundPlane(K(0.81), -1, 14, [40, 60], BANK);
      // shaded fog dip at Rivazza
      groundPlane(K(0.82), -1, 8, [30, 40], [0.74, 0.78, 0.74]);

      // ---- s 0.92 R near — Variante Bassa / pit approach kerbs back toward river ----
      place(K(0.92), 1, 2, [0.4, 0.3, 7], RED);
      place(K(0.93), 1, 2, [0.4, 0.3, 7], WHITE);
      groundPlane(K(0.92), 1, 16, [50, 120], RIVER);   // river rejoins by pit straight

      // ---- Advertising hoardings + marshal posts for rhythm ----
      billboard(K(0.28), -1, 16, 12, 5, [0.86, 0.30, 0.20]);
      billboard(K(0.80), -1, 16, 12, 5, [0.20, 0.40, 0.70]);
      every(130, (k) => {
        marshalPost(k, hash(k * 33) < 0.5 ? -1 : 1, 4);
      });

      // ---- thin cantilever roof blade over the old pit lane ----
      {
        const a = anchor(K(0.00), -1, 12);
        addBox(out, vadd(a.c, a.u, 12), [18, 0.7, 120], [0.66, 0.68, 0.70], [a.r, a.u, a.t]);
      }

      // ============================================================
      //  ENRICHMENT — buildings, town backdrop, crowds, furniture
      // ============================================================
      const STONE   = [0.74, 0.70, 0.60];  // warm Italian stucco
      const STONE2  = [0.80, 0.74, 0.62];
      const TERRA   = [0.66, 0.34, 0.22];  // terracotta roof
      const CONC    = [0.62, 0.63, 0.66];  // concrete grey
      const PITWALL = [0.86, 0.86, 0.84];  // white pit/paddock wall
      const TYRE    = [0.10, 0.10, 0.11];
      const CROWD_A = [0.62, 0.34, 0.30];
      const CROWD_B = [0.30, 0.40, 0.66];
      const CROWD_C = [0.70, 0.62, 0.30];

      // ---- Start/finish overhead gantry + scoring gantry into turn 1 ----
      gantry(0.00, 7.5, [0.14, 0.14, 0.17]);
      gantry(0.965, 7.0, [0.18, 0.18, 0.20]);

      // ---- Pit / paddock complex along the pit straight (left) ----
      // long low pit garages behind the old pit building, plus a small paddock block
      building(K(0.97), -1, 18, 14, 7, 90, { wall: PITWALL, window: [0.30, 0.34, 0.40], floor: 4 });
      building(K(0.90), -1, 20, 22, 9, 40, { wall: [0.66, 0.67, 0.70], window: [0.28, 0.32, 0.38], floor: 4, roof: true });
      building(K(0.94), -1, 46, 30, 12, 34, { wall: STONE, window: [0.34, 0.30, 0.26], floor: 4 }); // paddock hospitality
      // race control / timing tower above the pits
      tower(K(0.99), -1, 16, 9, 22, { col: [0.78, 0.80, 0.82], cap: true, capCol: [0.2, 0.2, 0.24], mast: 6 });
      // pit wall separating pit lane from track
      wall(0.95, 0.06, -1, 2, 1.0, PITWALL, 0.5);

      // ============================================================
      //  HILLSIDE TOWN BACKDROP — Imola old town with church + tower
      //  Placed as a cluster on far hill (left of pit straight / T1).
      // ============================================================
      {
        // anchor the town on the hill behind the main straight, well off-track.
        // Use ONE consistent ground baseline + manual hill tiers so houses spread
        // along the basis don't drift off mismatched per-node terrain samples.
        const at = anchor(K(0.02), -1, 150);
        const r = at.r, u = at.u, t = at.t;
        const baseY = groundYAt(K(0.02), 150);
        const base = [at.c[0], baseY, at.c[2]];
        const put = (alongM, outM, rise, w, h, d, col) => {
          // build the ground footing point, then lift onto the up axis by rise
          const foot = vadd(vadd(vadd(base, t, alongM), r, -outM), u, rise);
          addBox(out, vadd(foot, u, h / 2), [w, h, d], col, [r, u, t]);
          addPrism(out, vadd(foot, u, h + 1.4), [w, 2.8, d], TERRA, [r, u, t]); // hip roof
        };
        // rows of town houses stepping UP the hill (rise grows with how far back)
        for (let i = 0; i < 9; i++) {
          const h2 = hash(i * 17 + 5);
          put(-90 + i * 24, h2 * 26, 6 + h2 * 10, 14 + h2 * 6, 9 + h2 * 7, 12 + h2 * 4, h2 < 0.5 ? STONE : STONE2);
        }
        for (let i = 0; i < 7; i++) {
          const h2 = hash(i * 31 + 9);
          put(-60 + i * 26, 44 + h2 * 30, 16 + h2 * 12, 16 + h2 * 8, 8 + h2 * 6, 13, h2 < 0.5 ? STONE2 : CONC);
        }
        // ---- church: nave + bell tower (campanile) with a conical spire ----
        const churchFoot = vadd(vadd(vadd(base, t, 30), r, -36), u, 22);
        addBox(out, vadd(churchFoot, u, 7), [16, 14, 26], STONE2, [r, u, t]);          // nave
        addPrism(out, vadd(churchFoot, u, 14 + 2), [16, 5, 26], TERRA, [r, u, t]);      // gable roof
        const towerFoot = vadd(churchFoot, t, 16);
        addBox(out, vadd(towerFoot, u, 13), [7, 26, 7], STONE, [r, u, t]);              // campanile
        addCone(out, vadd(towerFoot, u, 26 + 4), 5, 9, [0.40, 0.30, 0.26], 6, [r, u, t]); // spire
      }

      // ============================================================
      //  GRANDSTANDS + CROWDS at the marquee corners
      // ============================================================
      // Main straight — twin decks both sides already; add a third tier opposite.
      grandstand(0.99, -1, 11, 60, [0.50, 0.53, 0.58], CROWD_C);
      grandstand(0.05, 1, 20, 70, [0.52, 0.55, 0.60], CROWD_B);
      // Tamburello / Variante Tamburello viewing bank stand (left, s≈0.07)
      grandstand(0.07, -1, 16, 56, [0.54, 0.56, 0.60], CROWD_A);
      // Tosa hairpin — extra stand + opposite-side terrace
      grandstand(0.27, 1, 16, 44, [0.52, 0.55, 0.60], CROWD_B);
      // Acque Minerali — packed natural amphitheatre stand on the right bank
      grandstand(0.51, 1, 16, 60, [0.52, 0.55, 0.60], CROWD_A);
      grandstand(0.54, 1, 18, 46, [0.54, 0.57, 0.61], CROWD_C);
      // Rivazza — big banked stand on the descent
      grandstand(0.82, -1, 14, 64, [0.52, 0.55, 0.60], CROWD_B);

      // ============================================================
      //  TRACK FURNITURE — fences, guardrails, tyre walls, billboards
      // ============================================================
      // Catch / debris fencing in front of the main grandstands
      fence(0.96, 0.10, -1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.49, 0.56, 1, 4, 4, [0.62, 0.64, 0.66]);
      fence(0.79, 0.86, -1, 4, 4, [0.62, 0.64, 0.66]);
      // Armco guardrails lining the river-side run and fast sweeps
      guardrail(0.00, 0.18, 1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.20, 0.30, -1, 3, [0.78, 0.78, 0.80]);
      guardrail(0.60, 0.70, 1, 3, [0.78, 0.78, 0.80]);
      // Tyre walls protecting the chicane apexes + hairpin outside
      tyreWall(0.05, 0.075, -1, 2, RED);
      tyreWall(0.115, 0.135, -1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.27, 0.295, -1, 2, RED);
      tyreWall(0.655, 0.675, 1, 2, [0.20, 0.40, 0.70]);
      tyreWall(0.79, 0.815, -1, 2, RED);
      tyreWall(0.915, 0.93, 1, 2, RED);

      // ---- Billboards / sponsor hoardings around the lap ----
      billboard(K(0.02), 1, 18, 14, 5, [0.86, 0.16, 0.14]);   // start straight
      billboard(K(0.12), -1, 16, 12, 5, [0.20, 0.40, 0.70]);
      billboard(K(0.27), 1, 18, 12, 5, [0.90, 0.80, 0.20]);
      billboard(K(0.51), 1, 20, 14, 5, [0.86, 0.30, 0.20]);
      billboard(K(0.66), -1, 16, 12, 5, [0.20, 0.44, 0.70]);
      billboard(K(0.82), -1, 18, 12, 5, [0.86, 0.16, 0.14]);
      billboard(K(0.93), 1, 16, 12, 5, [0.90, 0.80, 0.20]);

      // ---- Denser marshal posts at every flag point ----
      every(95, (k) => {
        marshalPost(k, hash(k * 47) < 0.5 ? -1 : 1, 4);
      });

      // ---- Trackside hospitality / TV compound near Acque Minerali ----
      building(K(0.49), 1, 30, 20, 6, 16, { wall: PITWALL, window: [0.30, 0.34, 0.40], floor: 3, roof: true });
      // a couple of marquee tents (prism roofs) at the paddock
      {
        const a = anchor(K(0.92), -1, 30);
        addBox(out, vadd(a.c, a.u, 2.2), [16, 4.4, 12], [0.90, 0.90, 0.88], [a.r, a.u, a.t]);
        addPrism(out, vadd(a.c, a.u, 4.4 + 1.4), [16, 2.8, 12], [0.94, 0.94, 0.92], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
