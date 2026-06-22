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

      // ---- Distant amphitheatre horizon (cleaner, fewer suppressed objects) ----
      // Hungaroring sits in a natural valley; the amphitheatre is more subtle.
      // Single far ring of haze-tinted peaks creates the bowl effect without clutter.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // far horizon ring: 20 gentle peaks ringing the valley (sparser to avoid clutter)
      const ringFar = rad + 450;
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * 6.2832, h = hash(i * 13 + 200);
        peak(cx + Math.cos(a) * ringFar, cz + Math.sin(a) * ringFar, pyMin,
             280 + h * 100, 26 + h * 14, HAZE);
      }
      // horizon hazed ridges (very far, very sparse — 12 ridges only)
      const ringHorizon = rad + 620;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832, h = hash(i * 17 + 400);
        ridge(cx + Math.cos(a) * ringHorizon, cz + Math.sin(a) * ringHorizon, pyMin,
              a + Math.PI / 2, 320 + h * 160, 180 + h * 100, 36 + h * 20, HAZE2);
      }
      // subtle inner trees on far slope (only 24 cones, placed far back)
      const ringMid = rad + 320;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * 6.2832, h = hash(i * 19 + 100);
        const tx = cx + Math.cos(a) * ringMid;
        const tz = cz + Math.sin(a) * ringMid;
        if (onTrack(tx, tz, 8)) continue;
        const ty = pyMin + 14 + h * 5;
        addCone(out, [tx, ty, tz], 20 + h * 12, 24 + h * 12, h < 0.4 ? TREE : TREE2, 6, null);
      }

      // ---- Distant banking terraces (selective placement, no continuous loop) ----
      // Place only 6 strategic banking zones far back to avoid onTrack conflicts.
      const bankPts = [0.08, 0.22, 0.38, 0.52, 0.70, 0.88];
      for (const s of bankPts) {
        for (const side of [-1, 1]) {
          const hh = hash(Math.round(s * n) * 7 + side);
          // far-distant banking at 150–200 m (horizon-only, never clip track)
          backdrop(k(s), side, 160 + hh * 50, [110, 18 + hh * 8, 100], hh < 0.5 ? BANK : GRASS2);
        }
      }

      // ---- Sparse crowd accents on select banking zones ----
      // Place small crowd groups only at key turns, not continuous, to avoid visual fatigue.
      every(30, (kk) => {
        for (const side of [-1, 1]) {
          const hh = hash(kk * 23 + side * 5);
          if (hh < 0.40) continue;             // sparse placement
          const base = 30 + hh * 20;
          const col = CROWD[((kk + (side > 0 ? 1 : 0)) | 0) % CROWD.length];
          // single crowd blob per zone, avoiding multi-layer density
          prop(kk, side, base, [14, 1.6 + hh * 1.2, 16], col);
        }
      });

      // ---- Scattered trackside trees and dry scrub (minimal, natural spacing) ----
      // Light tree placement to avoid visual clutter; Hungarian summer is sparse.
      every(32, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 19 + side);
          if (s < 0.45) continue;              // sparser than before
          const dist = 60 + s * 50;
          (s < 0.55 ? pine : tree)(kk, side, dist, 9 + s * 5, s < 0.50 ? TREE : TREE2);
        }
      });
      // dry scrub bushes close to the edge (very sparse, ~every 40 m)
      every(40, (kk) => {
        for (const side of [-1, 1]) {
          const s = hash(kk * 37 + side * 11);
          if (s < 0.60) continue;              // sparser placement
          bush(kk, side, 18 + s * 14, SCRUB);
        }
      });
      // 4 small tree clumps at key turns — understated, far back
      const clump = (s, side, dist) => {
        for (let j = 0; j < 4; j++) {
          const kk = (k(s) + j) % n;
          if (j % 2) tree(kk, side, dist + hash(kk * 5 + j) * 12, 8 + hash(kk * 7 + j) * 4, TREE2);
          else pine(kk, side, dist + hash(kk * 3 + j) * 12, 8 + hash(kk * 7 + j) * 4, TREE);
        }
      };
      clump(0.15, -1, 90);
      clump(0.50, 1, 95);
      clump(0.65, -1, 88);
      clump(0.82, 1, 92);

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

      // ---- s=0: pit complex (L) + main grandstand (R) ----
      // Pit slab with simple pitched roof, pit wall. Main stand on the right.
      building(k(0.00), -1, 2, 14, 9, 70, { wall: WHITE, window: [0.36, 0.42, 0.48], floor: 4 });
      // Paddock apron behind the pits
      groundPlane(k(0.00), -1, 65, [120, 1.0, 130], PADDOCK);
      // Paddock buildings (minimal set)
      building(k(0.03), -1, 32, 16, 10, 34, { wall: WHITE, window: [0.40, 0.46, 0.52], floor: 4 });
      // Comms tower for vertical interest
      tower(k(0.02), -1, 44, 8, 32, { col: [0.74, 0.76, 0.80], cap: [0.6, 0.62, 0.66], mast: true });
      // Pit wall + kerb trim
      place(k(0.02), -1, 3, [0.8, 1.3, 70], WHITE);
      place(k(0.02), -1, 2, [0.4, 0.3, 70], RED);
      // Start/finish gantry
      gantry(0.005, 7.5, [0.30, 0.32, 0.36]);
      // Main covered grandstand (R side, simple 2-tier)
      grandstand(0.00, 1, 9, 100, SHELL, CROWD[1]);
      grandstand(0.00, 1, 28, 90, SHELL2, CROWD[0]);
      billboard(k(0.00), 1, 28, 26, 7, RED);

      // ---- Key spectator zones: 8 strategic grandstands (not continuous clutter) ----
      grandstand(0.06, 1, 9, 62, SHELL, CROWD[0]);    // Turn 1
      grandstand(0.12, -1, 10, 44, SHELL, CROWD[2]);  // Mid-section L
      grandstand(0.35, -1, 10, 48, SHELL, CROWD[1]);  // Twisty sector L
      grandstand(0.40, 1, 11, 46, SHELL, CROWD[0]);   // Twisty sector R
      grandstand(0.55, -1, 10, 50, SHELL, CROWD[1]);  // Sector exit L
      grandstand(0.68, -1, 10, 44, SHELL, CROWD[2]);  // Late-lap L
      grandstand(0.80, 1, 10, 40, SHELL, CROWD[3]);   // Approach R
      grandstand(0.90, 1, 10, 62, SHELL, CROWD[0]);   // Final sector R

      // ---- Select accent features: minimal hedges and a pond ----
      // Water feature in the valley floor
      groundPlane(k(0.08), 1, 70, [85, 1.0, 65], WATER);
      hedge(0.04, 0.11, 1, 32, 4, TREE);              // subtle treeline

      // ---- Hungarian flag colours on the pit area ----
      billboard(k(0.02), -1, 22, 10, 4, [0.20, 0.48, 0.20]);  // green
      billboard(k(0.04), 1,  22, 10, 4, [0.85, 0.20, 0.20]);  // red

      // ---- Kerb accents at key turns (red/white) ----
      for (const [s, side] of [[0.06, 1], [0.12, -1], [0.40, 1], [0.55, -1], [0.90, 1]]) {
        place(k(s), side, 2, [0.4, 0.25, 6], side > 0 ? RED : WHITE);
        place(k(s), side, 7, [10, 0.08, 12], GRASS);
      }
    },
  }
  );
})();
