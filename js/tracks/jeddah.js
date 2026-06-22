/* Apex 26 — JEDDAH circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    street: true,
    barrierGap: 0.6,
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.10, 0.08, 0.16], zenith: [0.05, 0.05, 0.15], sunColor: [0.65, 0.68, 0.82], ambientSky: [0.22, 0.22, 0.32], ambientGround: [0.20, 0.18, 0.24], fogColor: [0.08, 0.08, 0.14], fogDensity: 0.0018, concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: -80, l: 70 }, { t: 75, l: 60 }, { t: 0, l: 120 }, { t: -70, l: 65 }, { t: 70, l: 60 },
      { t: 0, l: 300 }, { t: 90, l: 80 }, { t: 0, l: 600 }, { t: 90, l: 80 }, { t: -65, l: 70 }, { t: 70, l: 70 },
    ],
    // Jeddah Corniche: the circuit grades down from the sweeping first sector
    // then recovers along the seafront — real circuit has ~12 m total change.
    elevations: [{ s: 0.30, halfM: 480, rise: -8 }, { s: 0.62, halfM: 400, rise: 6 }],
    scenery: function (api) {
      const { out, n, pyMin, place, backdrop,
        addBox, addCyl, addCone, anchor, vadd, building, tower, billboard,
        grandstand, gantry, marshalPost, guardrail, tyreWall, palm,
        onTrack, hash, every } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Night Corniche palette: warm amber floodlights vs cool LED strips ──
      const SEA       = [0.02, 0.04, 0.08];        // deep black-mirror water
      const SPANGLE   = [1.0,  0.80, 0.40];        // warm amber reflections / path lamps
      const LED       = [0.92, 0.96, 1.0 ];        // cool-white LED lamp banks
      const WINWARM   = [1.0,  0.84, 0.48];        // warm interior windows
      const WINCOOL   = [0.58, 0.82, 1.0 ];        // cool glass tower windows
      const WINGOLD   = [1.0,  0.76, 0.28];        // deep sodium / tungsten glow
      const WINTEAL   = [0.42, 0.96, 0.94];        // bright teal accent glass
      const GREEN     = [0.10, 0.56, 0.24];        // Saudi-green livery stripe
      const MAGENTA   = [0.96, 0.28, 0.64];        // neon magenta accent
      const BARRIER   = [0.32, 0.32, 0.35];        // grey concrete barrier
      const DARKPOLE  = [0.09, 0.09, 0.12];        // dark lamp-pole shaft
      const LAMPGLOW  = [1.0,  0.88, 0.52];        // warm sodium lamp head
      const POOLAMB   = [0.44, 0.38, 0.22];        // muted amber pool on tarmac

      // ── Helpers ────────────────────────────────────────────────────────────
      // Corniche lamp post: slim dark shaft, warm glowing head, amber pool at base.
      // Uses anchor() so it sits on local terrain height rather than floating.
      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 2)) return;
        // Shaft — dark galvanised steel, 8 m tall
        addCyl(out, a.c, 0.12, 8.0, DARKPOLE, 4, b);
        // Lamp head at crown — small warm box reads as lantern
        addBox(out, vadd(a.c, a.u, 8.0), [0.55, 0.55, 0.55], LAMPGLOW, b);
        // Light-spill pool on ground — flat amber disc just above surface
        addBox(out, vadd(a.c, a.u, 0.12), [2.8, 0.18, 2.8], POOLAMB, b);
      };

      // Floodlight mast: tall truss tower + bank of LED fixtures + large pool.
      // Uses onTrack guard so masts never appear on the racing surface.
      const floodMast = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 5)) return;
        // Main mast — 38 m hexagonal shaft
        addCyl(out, a.c, 0.65, 38, DARKPOLE, 6, b);
        // Horizontal lamp gantry crossbar at 34 m
        addBox(out, vadd(a.c, a.u, 34), [8.0, 0.9, 1.6], [0.10, 0.10, 0.14], b);
        // Three LED lamp banks arrayed along the crossbar
        for (let j = -1; j <= 1; j++) {
          const off = vadd(vadd(a.c, a.u, 35.2), a.r, side * j * 2.6);
          addBox(out, off, [2.4, 1.8, 1.2], LED, b);
          // Small downward emissive patch simulating spill on the crossbar underside
          addBox(out, vadd(off, a.u, -0.9), [2.2, 0.25, 1.0], [0.7, 0.76, 0.82], b);
        }
        // Large warm light-pool on ground — reads as the lit tarmac under the mast
        addBox(out, vadd(a.c, a.u, 0.20), [5.0, 0.28, 5.0], POOLAMB, b);
        // Secondary pool ring — larger, dimmer, for realistic falloff halo
        addBox(out, vadd(a.c, a.u, 0.08), [10.0, 0.14, 10.0], [0.22, 0.18, 0.09], b);
      };

      // LED light tower: medium column, cool lamp head, small pool.
      const lightTower = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 3)) return;
        addCyl(out, a.c, 0.40, 22, DARKPOLE, 5, b);
        // Lamp head box at apex
        addBox(out, vadd(a.c, a.u, 22.0), [3.0, 1.2, 3.0], LED, b);
        // Underside emissive strip — reads as reflected light on the head housing
        addBox(out, vadd(a.c, a.u, 21.2), [2.6, 0.22, 2.6], [0.55, 0.60, 0.68], b);
        // Ground pool — small warm disc at base
        addBox(out, vadd(a.c, a.u, 0.12), [3.2, 0.20, 3.2], POOLAMB, b);
      };

      // ── Full-lap floodlight masts (ring the entire circuit) ─────────────
      // 16 masts staggered both sides at wider spacing so the whole lap is lit.
      for (let i = 0; i < 16; i++) {
        floodMast(K(i / 16 + 0.015), (i % 2) ? -1 : 1, 18 + (i % 3) * 5);
      }

      // ── Supplementary LED light towers between masts ─────────────────────
      // 24 towers fill the gaps; alternating sides, staggered depth.
      for (let i = 0; i < 24; i++) {
        lightTower(K(i / 24 + 0.03), (i % 2) ? 1 : -1, 10 + (i % 3) * 2);
      }

      // ── Corniche lamp posts along both barrier lines ──────────────────────
      // Right side (seaward Corniche promenade): warm amber posts every ~15 m.
      for (let i = 0; i < 42; i++) {
        lampPost(K(i / 42), 1, 4.5 + (i % 2) * 1.2);
      }
      // Left side (inland / pit side): sparser, slightly further out.
      for (let i = 0; i < 28; i++) {
        lampPost(K(i / 28 + 0.008), -1, 5.0 + (i % 2) * 1.5);
      }

      // ── Palm trees: Corniche signature vegetation ─────────────────────────
      // Seaward row (lit fronds, prominent) + sparse inland row (darker).
      const PALMFROND = [0.12, 0.44, 0.19];
      for (let i = 0; i < 60; i++) {
        const s = i / 60;
        // Seaward (R) row — dist 9+ so they clear the lamp posts at dist 4-6
        const h   = 6.5 + hash(i * 3) * 3.5;
        const dist = 9 + hash(i * 5) * 4;
        palm(K(s), 1, dist, h, PALMFROND);
        // Inland (L) row — every 2nd, darker frond, further back
        if (i % 2 === 0) {
          const h2 = 7 + hash(i * 11) * 3;
          palm(K(s + 0.008), -1, 11 + hash(i * 7) * 4, h2, [0.08, 0.36, 0.14]);
        }
      }
      // Warm uplight pools at the base of prominent seaward palms
      for (let i = 0; i < 24; i++) {
        const a = anchor(K(i / 24), 1, 9);
        if (onTrack(a.c[0], a.c[2], 1.5)) continue;
        addBox(out, vadd(a.c, a.u, 0.20), [1.4, 0.32, 1.4], [0.98, 0.78, 0.42], [a.r, a.u, a.t]);
      }

      // ── Marshal posts at corner exits ─────────────────────────────────────
      for (const [s, side] of [[0.06, -1], [0.13, 1], [0.34, -1], [0.49, 1],
        [0.62, -1], [0.74, 1], [0.81, -1], [0.92, 1], [0.97, -1]]) {
        marshalPost(K(s), side, 1.8);
      }

      // ── Red Sea: continuous flat dark water, sub-grade ────────────────────
      // Three depth bands anchored via anchor() to follow the track heading.
      // All top faces sit below pyMin so the on-track rejection guard (topY check)
      // never incorrectly culls them.
      for (let i = 0; i < 36; i++) {
        const k = K(i / 36);
        const a = anchor(k, 1, 110);
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.8, a.c[2]], [260, 1.2, 95], SEA, b);
      }
      for (let i = 0; i < 32; i++) {
        const k = K(i / 32);
        const a = anchor(k, 1, 270);
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 2.2, a.c[2]], [500, 1.6, 125], [0.025, 0.045, 0.095], b);
      }
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24);
        const a = anchor(k, 1, 430);
        const b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 2.6, a.c[2]], [750, 2.0, 150], [0.018, 0.035, 0.080], b);
      }
      // Reflection spangles on the water surface — warm amber, cool LED, occasional magenta.
      for (let i = 0; i < 28; i++) {
        const s = i / 28;
        const dist = 75 + hash(i * 5) * 180;
        const a = anchor(K(s), 1, dist);
        const col = (i % 5 === 0) ? MAGENTA : (i % 5 === 1) ? LED : SPANGLE;
        addBox(out, [a.c[0], pyMin - 1.2, a.c[2]],
               [6 + hash(i * 7) * 5, 0.22, 6 + hash(i * 11) * 5], col);
      }

      // ── King Fahd's Fountain — far offshore landmark ──────────────────────
      // One of the world's tallest fountains (260m+). Very slender jet far out so
      // it never intersects any shoreside scenery.
      {
        const a = anchor(K(0.20), 1, 380);
        const b = [a.r, a.u, a.t];
        // Main jet: very thin cool-white column
        addCyl(out, [a.c[0], pyMin - 0.8, a.c[2]], 0.9, 255, LED, 6, b);
        // Spray crown cone at the apex
        addCone(out, [a.c[0], pyMin + 255, a.c[2]], 7, 55, [0.94, 0.97, 1.0], 6, b);
        // Dark pier base just above water
        addCyl(out, [a.c[0], pyMin - 0.4, a.c[2]], 5, 2, [0.16, 0.18, 0.22], 6, b);
      }

      // ── START/FINISH gantries ─────────────────────────────────────────────
      gantry(0.0,   9, [0.12, 0.13, 0.17]);
      gantry(0.012, 7, [0.12, 0.13, 0.17]);

      // ── PIT / PADDOCK — s 0.00 L ─────────────────────────────────────────
      // 7 garage bays: main mass + lit opening + LED strip above opening.
      for (let i = 0; i < 7; i++) {
        place(K(0.0 + i * 0.011), -1, 16, [12, 8, 28], [0.26, 0.27, 0.30]);
        place(K(0.0 + i * 0.011), -1, 16, [12.4, 1.0, 29], WINWARM);
        place(K(0.0 + i * 0.011), -1, 16, [12.4, 0.5, 29], LED);
      }
      // Pit wall (low concrete lip on the lane side)
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), -1, 3.0, [0.4, 1.1, 26], [0.40, 0.41, 0.44]);
      }
      // Paddock motorhomes set well back — at 38m+ they clear the garage fascias.
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.0 + i * 0.014), -1, 40), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 14)) continue;
        addBox(out, vadd(a.c, a.u, 5), [22, 10, 20], [0.20, 0.21, 0.25], b);
        addBox(out, vadd(a.c, a.u, 5.9), [22.4, 0.9, 20.4], (i % 2) ? WINCOOL : WINWARM, b);
        // Upper lit strip — hospitality suite windows
        addBox(out, vadd(a.c, a.u, 7.2), [22.4, 0.7, 20.4], (i % 2) ? WINWARM : WINCOOL, b);
      }

      // ── MAIN GRANDSTAND — s 0.00 R ───────────────────────────────────────
      grandstand(0.0,  1, 12, 70, [0.14, 0.15, 0.19], [0.55, 0.45, 0.40]);
      grandstand(0.02, 1, 12, 60, [0.13, 0.14, 0.18], [0.50, 0.42, 0.46]);
      // Phone-light band across the crowd
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), 1, 13, [12.4, 0.6, 22], LED);
      }

      // ── JEDDAH SKYLINE — s 0.26–0.32 L mid (primary cluster) ─────────────
      // Towers spaced ≥15 m apart in dist to prevent intersection.
      // dist values: 40, 55, 72, 88, 110, 130, 155 — all non-overlapping.
      building(K(0.27), -1, 40,  36, 118, 34, { wall: [0.22, 0.22, 0.27], window: WINWARM,  floor:  8 });
      building(K(0.26), -1, 55,  32, 147, 32, { wall: [0.20, 0.21, 0.26], window: WINCOOL,  floor:  9 });
      building(K(0.30), -1, 72,  28, 178, 28, { wall: [0.18, 0.19, 0.24], window: WINCOOL,  floor: 10 });
      building(K(0.28), -1, 88,  30, 158, 30, { wall: [0.19, 0.20, 0.25], window: WINTEAL,  floor: 22 });
      building(K(0.31), -1, 110, 34, 128, 34, { wall: [0.21, 0.21, 0.27], window: WINGOLD,  floor: 20 });
      // Slender towers: dist staggered far out so they sit behind the buildings.
      tower(K(0.29),  -1, 135, 24, 175, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: LED,     mast: true  });
      tower(K(0.305), -1, 160, 20, 154, { col: [0.15, 0.16, 0.21], seg: 4, cap: true, capCol: MAGENTA, mast: true  });
      tower(K(0.255), -1, 100, 18, 142, { col: [0.17, 0.18, 0.23], seg: 4, cap: true, capCol: LED,     mast: false });
      tower(K(0.285), -1, 120, 22, 160, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: [0.50, 0.80, 1.0], mast: true });
      tower(K(0.315), -1, 145, 20, 132, { col: [0.16, 0.17, 0.22], seg: 4, cap: true, capCol: SPANGLE, mast: false });
      // Extra emissive crown strips on the two tallest buildings — reads as lit rooftop plant
      {
        const a1 = anchor(K(0.30), -1, 72 + 14), b1 = [a1.r, a1.u, a1.t];
        addBox(out, vadd(a1.c, a1.u, 178 + 2), [28, 0.8, 28], [0.30, 0.42, 0.58], b1);
        const a2 = anchor(K(0.26), -1, 55 + 16), b2 = [a2.r, a2.u, a2.t];
        addBox(out, vadd(a2.c, a2.u, 147 + 2), [32, 0.8, 32], [0.38, 0.24, 0.52], b2);
      }

      // ── MARINA / Jeddah Yacht Club — s 0.41–0.49 R ───────────────────────
      // 10 yachts at staggered depths (36–60 m). All guarded by onTrack.
      for (let i = 0; i < 10; i++) {
        const k   = K(0.41 + i * 0.0075);
        const dp  = 38 + (i % 3) * 12;
        const a   = anchor(k, 1, dp), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 9)) continue;
        // Pontoon finger (dock)
        addBox(out, vadd(a.c, a.u, 0.4), [16, 0.8, 3.5], [0.28, 0.28, 0.30], b);
        // Sleek hull
        const hullLen = 6 + (i % 3) * 1.5;
        addBox(out, vadd(a.c, a.u, 1.3), [2.8, 2.0, hullLen], [0.94, 0.94, 0.96], b);
        // Deck light strip
        addBox(out, vadd(a.c, a.u, 2.3), [2.9, 0.32, hullLen], (i % 2) ? SPANGLE : WINCOOL, b);
        // Mast
        addCyl(out, vadd(a.c, a.u, 2.5), 0.18, 14, [0.88, 0.88, 0.92], 4, b);
        // Masthead light
        addBox(out, vadd(a.c, a.u, 10.2), [0.25, 0.55, 1.2], SPANGLE, b);
      }
      // Yacht club main building (72 m out) + annex (58 m out — different k so no overlap)
      {
        const a = anchor(K(0.45), 1, 78), b = [a.r, a.u, a.t];
        if (!onTrack(a.c[0], a.c[2], 16)) {
          addBox(out, vadd(a.c, a.u, 3.2), [26, 6.0, 11], [0.25, 0.26, 0.29], b);
          addBox(out, vadd(a.c, a.u, 4.5), [26.3, 1.0, 11.3], WINWARM, b);
          addBox(out, vadd(a.c, a.u, 5.6), [26.3, 0.8, 11.3], WINGOLD, b);
        }
      }
      {
        const a2 = anchor(K(0.47), 1, 60), b2 = [a2.r, a2.u, a2.t];
        if (!onTrack(a2.c[0], a2.c[2], 13)) {
          addBox(out, vadd(a2.c, a2.u, 3.5), [20, 7.5, 9], [0.23, 0.24, 0.27], b2);
          addBox(out, vadd(a2.c, a2.u, 4.8), [20.3, 0.9, 9.3], WINCOOL, b2);
          // Second lit floor
          addBox(out, vadd(a2.c, a2.u, 6.0), [20.3, 0.7, 9.3], WINWARM, b2);
        }
      }

      // ── T13 BANKED SECTOR — s 0.50 ───────────────────────────────────────
      // Extra masts + grandstand + tyre wall.
      floodMast(K(0.49), -1, 22);
      floodMast(K(0.51),  1, 26);
      lightTower(K(0.50), -1, 12);
      grandstand(0.50, 1, 14, 55, [0.14, 0.15, 0.19], [0.52, 0.44, 0.42]);
      for (let i = 0; i < 4; i++) {
        place(K(0.50 + i * 0.008), 1, 15, [16.4, 0.7, 14], LED);
      }
      tyreWall(0.485, 0.515, -1, 2.0, MAGENTA);

      // ── CORNICHE LAGOON PROMENADE — s 0.55–0.64 R ────────────────────────
      // Sheltered lagoon water + lamp posts every ~10 m along the waterfront.
      for (let i = 0; i < 12; i++) {
        const k = K(0.55 + i * 0.0075);
        const a = anchor(k, 1, 65), b = [a.r, a.u, a.t];
        addBox(out, [a.c[0], pyMin - 1.4, a.c[2]], [160, 1.0, 55], [0.05, 0.08, 0.14], b);
      }
      // Corniche promenade lamp posts at the water's edge (dist 5–6 m).
      for (let i = 0; i < 18; i++) {
        lampPost(K(0.55 + i * 0.005), 1, 5.0 + (i % 2) * 0.8);
      }

      // ── HOTEL / COMMERCIAL CLUSTER — s 0.68–0.74 L ───────────────────────
      // Spaced at dist 48, 64, 82 (well separated to avoid intersection).
      building(K(0.68), -1, 48, 30, 68, 26, { wall: [0.22, 0.22, 0.26], window: WINWARM, floor: 8 });
      building(K(0.72), -1, 64, 26, 78, 24, { wall: [0.20, 0.21, 0.25], window: WINCOOL, floor: 9 });
      // Accent tower well behind the mid-rise buildings
      tower(K(0.70), -1, 90, 20, 105, { col: [0.18, 0.19, 0.24], seg: 4, cap: true, capCol: LED, mast: true });
      // Emissive billboards: gaps must exceed w/2 + 1 per billboard helper rule.
      // w=10 → min gap 6; w=9 → min gap 5.5 — all values here are safe.
      billboard(K(0.70), -1, 26, 10, 11, GREEN);
      billboard(K(0.71), -1, 50, 10, 10, SPANGLE);
      billboard(K(0.69), -1, 20, 9,  11, MAGENTA);
      billboard(K(0.73), -1, 24, 9,  10, WINTEAL);

      // ── TIGHT TECHNICAL SECTOR — s 0.78–0.84 ─────────────────────────────
      // Red/white alternating kerb strips on both sides (safety visibility).
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const col = (i % 2) ? [0.92, 0.08, 0.08] : [0.96, 0.96, 0.97];
          place(K(0.78 + i * 0.0075), side, 5, [5.5, 0.28, 2.8], col);
        }
      }

      // ── FINAL SECTOR GRANDSTAND + FUNNEL LIGHTS — s 0.89–0.93 R ──────────
      grandstand(0.89, 1, 14, 60, [0.15, 0.15, 0.19], [0.50, 0.43, 0.47]);
      for (let i = 0; i < 4; i++) {
        place(K(0.89 + i * 0.008), 1, 15, [16.4, 0.7, 14], LED);
      }
      lightTower(K(0.90),  1, 11);
      lightTower(K(0.93), -1, 11);
      floodMast(K(0.91), -1, 24);

      // ── CORNER PROTECTION ─────────────────────────────────────────────────
      tyreWall(0.07, 0.10, -1, 2.0, GREEN);
      tyreWall(0.79, 0.82,  1, 2.0, SPANGLE);
      guardrail(0.34, 0.38, -1, 1.8, [0.55, 0.56, 0.6]);
      guardrail(0.96, 0.99,  1, 1.8, [0.55, 0.56, 0.6]);

      // ── FINAL DRS STRAIGHT SIGNAGE — s 0.94–0.99 ─────────────────────────
      billboard(K(0.95),  1, 22, 10, 10, GREEN);
      billboard(K(0.96), -1, 22, 10,  9, SPANGLE);
      billboard(K(0.97), -1, 20, 10, 10, MAGENTA);
      billboard(K(0.98),  1, 20, 10,  9, WINTEAL);

      // ── ACCENT SIGNAGE around the Corniche ───────────────────────────────
      billboard(K(0.10),  1, 15, 8, 8, [0.12, 0.68, 0.98]);
      billboard(K(0.30), -1, 18, 8, 8, [0.98, 0.32, 0.12]);
      billboard(K(0.55),  1, 13, 8, 7, [0.92, 0.12, 0.68]);
      billboard(K(0.75), -1, 16, 8, 7, [0.12, 0.68, 0.98]);

      // ── CORNICHE MONUMENT — s 0.50 R (at 42 m, clear of marina yachts) ───
      {
        const sA = anchor(K(0.50), 1, 42), sBasis = [sA.r, sA.u, sA.t];
        if (!onTrack(sA.c[0], sA.c[2], 10)) {
          addCyl(out, sA.c, 3.2, 22, [0.82, 0.78, 0.68], 8, sBasis);
          const sTop = vadd(sA.c, sA.u, 22);
          addCone(out, sTop, 5, 9, [0.94, 0.86, 0.64], 8, sBasis);
          // Uplight pool at the monument base — amber glow
          addBox(out, vadd(sA.c, sA.u, 0.15), [7.0, 0.25, 7.0], [0.55, 0.44, 0.20], sBasis);
        }
      }

      // ── URBAN CANYON — random buildings at 28 m intervals ────────────────
      // 32% density, both sides, 50–80 m out. onTrack guard prevents road overlap.
      every(28, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side) > 0.68) continue;
          const dist = 50 + hash(k * 77 + side) * 28;
          const h    = 28 + hash(k * 61 + side) * 28;
          const w    = 15 + hash(k * 43 + side) * 14;
          const p    = anchor(k, side, dist);
          if (onTrack(p.c[0], p.c[2], 11)) continue;
          const winCol = side > 0
            ? [0.30, 0.42, 0.56]  // cooler glass on sea side
            : [0.24, 0.28, 0.35]; // darker inland side
          building(k, side, dist, w, h, w * 0.85,
            { wall: [0.34, 0.31, 0.29], window: winCol, floor: 7 });
        }
      });

      // ── CONTINUOUS JEDDAH SKYLINE (inland L) ─────────────────────────────
      // Near mid-rise band + far high-rise band. Window palettes cycle through all
      // four warm/cool tones so the skyline glows continuously.
      const WINPAL  = [WINWARM, WINCOOL, WINGOLD, WINTEAL];
      const WALLPAL = [[0.18, 0.19, 0.24], [0.20, 0.21, 0.26], [0.22, 0.22, 0.27], [0.16, 0.17, 0.22]];

      // Near band — 20 mid-rise lit blocks
      for (let i = 0; i < 20; i++) {
        const s = i / 20;
        // Skip pit-straight and banked-stand frontages
        if (Math.abs(((s + 0.5) % 1) - 0.5) < 0.024) continue;
        if (Math.abs(((s - 0.5 + 0.5) % 1) - 0.5) < 0.024) continue;
        const r1 = hash(i * 13), r2 = hash(i * 29 + 3);
        const w    = 28 + r1 * 18;
        const h    = 24 + r2 * 32;
        const dist = 50 + r1 * 20;
        const win  = WINPAL[i % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.82,
          { wall: WALLPAL[i % 4], window: win, floor: 12 });
      }

      // Far high-rise band — 16 tall towers
      for (let i = 0; i < 16; i++) {
        const s  = (i + 0.5) / 16;
        const r1 = hash(i * 17 + 7), r2 = hash(i * 41 + 1);
        const w    = 20 + r1 * 12;
        const h    = 80 + r2 * 100;
        const dist = 145 + i * 6 + r1 * 24;
        const win  = WINPAL[(i + 1) % WINPAL.length];
        building(K(s), -1, dist - w / 2, w, h, w * 0.8,
          { wall: WALLPAL[(i + 2) % 4], window: win, floor: 24 });
      }

      // Cheap silhouette backdrop behind towers to prevent sky-gap
      for (let i = 0; i < 20; i++) {
        const s = i / 20;
        const w = 32 + hash(i * 11) * 20, h = 60 + hash(i * 7) * 70;
        backdrop(K(s), -1, 295 + (i % 4) * 16, [w, h, w], [0.13, 0.14, 0.19]);
      }
    },
  }
  );
})();
