/* Apex 26 — BAHRAIN circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    name: "BAHRAIN",
    gp: "Bahrain GP",
    country: "Bahrain",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { horizon: [0.20, 0.10, 0.05], zenith: [0.06, 0.05, 0.16], sunColor: [0.80, 0.62, 0.40], ambientSky: [0.30, 0.22, 0.16], ambientGround: [0.28, 0.18, 0.10], fogColor: [0.16, 0.10, 0.06], fogDensity: 0.0028, sunDir: [0.5, 0.14, 0.4], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    segs: [
      { t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
      { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 },
    ],
    // T1 approach descends ~4 m from the start/finish line; mid-lap drops ~7 m
    // further to the lowest point (~15 m total relief on the real circuit).
    elevations: [{ s: 0.03, halfM: 260, rise: -4 }, { s: 0.45, halfM: 340, rise: -7 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd,
        place, anchor, addBox, addCyl, addCone, addFrustum,
        palm, bush, grandstand, building, tower, billboard, gantry, marshalPost,
        mountain, fence, wall, guardrail, tyreWall, onTrack } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Desert palette (night race, Sakhir) ──────────────────────────────
      const SAND       = [0.62, 0.50, 0.34], DUNE      = [0.74, 0.62, 0.44];
      const DUNE_LIT   = [0.70, 0.58, 0.40];
      const SAND_DARK  = [0.55, 0.44, 0.28], SAND_LIGHT= [0.75, 0.62, 0.42];
      const SEAT       = [0.18, 0.18, 0.21], STEEL     = [0.16, 0.16, 0.19];
      // Floodlights: bright near-white lamp caps + warm pool halo on the ground
      const FLOOD      = [0.95, 0.95, 0.88];
      const POOL       = [0.82, 0.80, 0.68];   // pale warm disc on tarmac/sand
      // Night-lit windows: warm amber (office glow), cool blue (control/tech rooms)
      const WIN_WARM   = [0.88, 0.76, 0.42];   // office/hospitality lit window
      const WIN_COOL   = [0.50, 0.68, 0.90];   // timing/technical lit window
      // Sakhir Tower: pale cream cylindrical shaft + LED video façade bands
      const TOWER_CYL  = [0.84, 0.83, 0.79];
      const TOWER_PALE = [0.85, 0.85, 0.80];
      const TOWER_LED  = [0.92, 0.88, 0.55];   // warm LED glow on façade rings
      // Night-race beacon: warm amber nav light + cool video-screen accent
      const BEACON_WARM= [0.98, 0.75, 0.35];
      const BEACON_COOL= [0.70, 0.88, 0.98];
      const TYRE_CAP   = [0.85, 0.13, 0.13];
      const BILLBOARD_LITE = [0.95, 0.93, 0.86];
      const HOSP_WALL  = [0.82, 0.82, 0.80];

      // ── Continuous dune backdrop ring ────────────────────────────────────
      // Two overlapping rings (near + far) give an unbroken desert horizon.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      for (const [extra, jit, wMin, hMin, count, forestCol, rockCol] of [
        [150, 60,  230, 26, 64, SAND_DARK,  SAND      ],  // near warm-sand band
        [360, 110, 320, 40, 56, SAND,       SAND_LIGHT],  // far lighter-horizon band
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const ring = rad + extra + (h - 0.5) * jit;
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * 120, hMin + h * 22, {
            seg: 8, seed: i * 3 + extra,
            rough: 0.24, snowline: 9,
            forest: forestCol, rock: rockCol, snow: DUNE_LIT,
          });
        }
      }

      // ── Floodlight mast: dark pole + bright lamp-bank cap + ground pool ──
      // The light pool is a flat pale box at ground level representing the
      // bright cone of light cast beneath each mast.
      const floodMast = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.4, h, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, h), [5.25, 1.75, 2.0], FLOOD, b);  // lamp bank
        // light pool: flat pale disc (box) on the ground under the mast
        addBox(out, vadd(a.c, a.u, 0.12), [8.0, 0.25, 8.0], POOL, b);
      };

      // ── Sculpted artificial dune wedge ──────────────────────────────────
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.28, h, DUNE, 7, b);
      };

      // ── Three-pole light bank (cluster of masts) ─────────────────────────
      const lightBank = (k, side, gap) => {
        for (const off of [-6, 0, 6]) {
          const kk = (k + off + n) % n;
          floodMast(kk, side, gap, 24 + hash(kk * 3) * 4);
        }
      };

      // ── Hospitality unit: glassy lit box with a bright parapet ──────────
      // The building center sits at gap + w/2, so we anchor the parapet there.
      const hospitality = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d, { wall: HOSP_WALL, window: WIN_WARM, floor: 3 });
        // lit parapet: anchor to building center (gap + w/2)
        const a = anchor(k, side, gap + w / 2), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h + 0.55), [w * 1.05, 0.65, d * 1.02], FLOOD, b);
      };

      // ================= START / FINISH =================
      // Pit/control building: long low building with warm lit office windows
      building(K(0.00), -1, 2, 14, 12, 70, { wall: [0.90, 0.90, 0.88], window: WIN_WARM, floor: 4 });
      // Pit wall + start gantry
      wall(0.97, 0.04, -1, 3, 1.1, [0.85, 0.85, 0.85]);
      gantry(0.005, 8.5, STEEL);
      // Main grandstands — pale shell, dark seats
      grandstand(0.00,  1, 16, 130, [0.42, 0.43, 0.47], SEAT);
      grandstand(0.985, 1, 18,  70, [0.42, 0.43, 0.47], SEAT);

      // ── Sakhir Tower ─────────────────────────────────────────────────────
      // Iconic 8-storey cylindrical tower with LED video façade, placed on
      // the left well back from the pit building (L, 48 m gap).
      // Structure: base cylinder → LED ring bands → crown cap → antenna beacon.
      // The LED bands are fractionally wider than the cylinder diameter so they
      // read as protruding rings/balconies rather than clipping inside it.
      (function sakhirTower() {
        const a = anchor(K(0.005), -1, 48), b = [a.r, a.u, a.t];
        const BASE = a.c;                          // ground anchor
        // Main shaft: tapered pale-cream cylinder (radius 7.2 → matches real 8-storey form)
        addCyl(out, BASE, 7.2, 62, TOWER_CYL, 12, b);
        // Eight horizontal LED bands: frustums protruding just beyond the shaft
        // (rBase 8.4 > shaft 7.2) so they read as balcony/façade rings, not interior clips.
        // Each band sits at the floor-line height for its storey.
        for (let i = 0; i < 8; i++) {
          const yBase = 4 + (i / 7) * 54;  // 4 m → 58 m (well within the 62 m shaft)
          addFrustum(out, vadd(BASE, b[1], yBase), 8.4, 8.0, 1.0, TOWER_LED, 12, b);
        }
        // Crown cap: wider disc on top of the shaft at 62 m
        addCyl(out, vadd(BASE, b[1], 62), 9.0, 2.5, FLOOD, 10, b);
        // Antenna / beacon above the crown (no overlap with cap: cap top = 64.5)
        addCyl(out, vadd(BASE, b[1], 64.5), 0.4, 6.0, STEEL, 5, b);      // slim mast 64.5→70.5
        addCone(out, vadd(BASE, b[1], 64.5), 3.8, 5.0, BEACON_WARM, 8, b); // warm beacon cone 64.5→69.5
        addBox(out, vadd(BASE, b[1], 70.5), [3.0, 1.2, 3.0], BEACON_COOL, b); // cool nav light at mast tip
        // Light pool at the tower base — strong downward glow footprint
        addBox(out, vadd(BASE, b[1], 0.15), [18.0, 0.30, 18.0], POOL, b);
      })();

      // ================= TURN 1 (s 0.05) =================
      grandstand(0.05,  1, 22, 80, [0.40, 0.41, 0.46], [0.16, 0.24, 0.42]);
      grandstand(0.025, 1, 22, 56, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]);
      grandstand(0.065, 1, 26, 64, [0.39, 0.40, 0.45], [0.20, 0.30, 0.50]);
      floodMast(K(0.05), 1, 30, 26);
      floodMast(K(0.03), -1, 30, 25);
      lightBank(K(0.06), 1, 34);
      billboard(K(0.07), -1, 8, 14, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.08), 1, 8, 12, 3.5, [0.05, 0.45, 0.75]);
      billboard(K(0.10), 1, 9, 12, 4, [0.10, 0.30, 0.70]);
      tyreWall(0.045, 0.085, 1, 4, TYRE_CAP);
      fence(0.03, 0.09, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      marshalPost(K(0.06), 1, 20);

      // ================= UNIVERSITY GRANDSTAND (s 0.18) =================
      for (const dz of [-66, -22, 22, 66]) {
        const k = (K(0.18) + Math.round(dz) + n) % n;
        grandstand(k / n, 1, 24, 40, [0.43, 0.44, 0.49], SEAT);
      }
      billboard(K(0.15), 1, 9, 12, 4, [0.90, 0.55, 0.05]);

      // ================= FLOODLIGHT MASTS (s 0.20, both sides) =================
      floodMast(K(0.20), -1, 28, 25);
      floodMast(K(0.20),  1, 28, 25);
      floodMast(K(0.23), -1, 30, 24);
      floodMast(K(0.16),  1, 32, 26);

      // ================= SCULPTED DUNES (s 0.30, L far) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.27) + i * Math.round(n * 0.015)) % n;
        duneWedge(k, -1, 58 + i * 14, 40 + hash(k) * 28, 3.5 + hash(k * 5) * 3);
      }

      // ================= TURN 3/4 COMPLEX (s 0.22–0.28) =================
      grandstand(0.24,  1, 22, 56, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.26, -1, 24, 46, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]);
      lightBank(K(0.25), -1, 32);
      lightBank(K(0.27),  1, 32);
      tyreWall(0.225, 0.255, 1, 4, TYRE_CAP);
      fence(0.22, 0.29, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.23), -1, 9, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.27),  1, 9, 12, 4, [0.90, 0.55, 0.05]);
      marshalPost(K(0.24), -1, 22);
      // small desert hospitality cluster at T4
      for (let i = 0; i < 3; i++) hospitality((K(0.255) + i * 4) % n, 1, 40 + i * 5, 11, 6, 14);

      // ================= TURNS 5-6-7 SWEEP (s 0.32–0.40) =================
      // Palm oasis clump filling the sparse left-side sweep
      for (let i = 0; i < 14; i++) {
        const k = (K(0.32) + Math.round(i * n * 0.006)) % n;
        const side = (i % 3 === 0) ? 1 : -1;
        const d = 22 + (i % 4) * 9 + hash(k * 7 + i) * 8;
        palm(k, side, d, 6.5 + hash(k * 11 + i) * 4.5, [0.16, 0.34, 0.14]);
        if (hash(k * 13 + i) > 0.5) bush((k + 1) % n, side, d - 4, [0.28, 0.31, 0.18]);
      }
      lightBank(K(0.35), -1, 34);
      grandstand(0.37, 1, 24, 44, [0.41, 0.42, 0.47], SEAT);
      fence(0.34, 0.41, 1, 6, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(0.36), -1, 10, 12, 4, [0.10, 0.30, 0.70]);

      // ================= TURN 8 HAIRPIN (s 0.42, R) =================
      grandstand(0.42, 1, 20, 60, [0.41, 0.42, 0.46], SEAT);
      grandstand(0.40, 1, 22, 44, [0.41, 0.42, 0.46], SEAT);
      grandstand(0.44, 1, 22, 50, [0.42, 0.43, 0.48], [0.20, 0.30, 0.50]);
      floodMast(K(0.42), 1, 32, 24);
      floodMast(K(0.44), -1, 30, 24);
      tyreWall(0.405, 0.44, 1, 4, TYRE_CAP);
      fence(0.40, 0.46, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.43), 1, 9, 12, 4, [0.05, 0.45, 0.75]);
      marshalPost(K(0.43), -1, 24);

      // ================= OPEN DESERT FLATS (s 0.50, both far) =================
      for (let i = 0; i < 3; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.016)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 92 + i * 18, 48, 3.2);
      }
      // Sparse dune wedges + scattered palms (mid-lap fill)
      for (let i = 0; i < 4; i++) {
        const k = (K(0.49) + Math.round(i * n * 0.014)) % n;
        for (const side of [-1, 1]) {
          duneWedge(k, side, 46 + i * 16, 35 + hash(k * 3 + side) * 24, 3.3 + hash(k * 5) * 2.2);
        }
        if (i % 3 === 0) palm(k, (i % 2 === 0) ? -1 : 1, 32 + i * 7, 6.5 + hash(k * 9) * 3, [0.15, 0.32, 0.13]);
      }
      grandstand(0.52, 1, 26, 48, [0.40, 0.41, 0.46], SEAT);
      lightBank(K(0.51), 1, 36);
      lightBank(K(0.54), -1, 36);
      marshalPost(K(0.50), -1, 24);

      // ================= MARSHAL / TIMING HUTS (s 0.62, L far) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.58) + i * 3) % n;
        marshalPost(k, -1, 26 + i * 3);
      }
      // Small white timing/control cubes with warm lit windows
      place(K(0.62), -1, 34, [4, 4, 5], [0.92, 0.92, 0.88]);
      place(K(0.65), -1, 30, [4, 3.5, 4.5], [0.90, 0.90, 0.86]);
      floodMast(K(0.60),  1, 32, 25);
      floodMast(K(0.66),  1, 30, 24);

      // ================= TURN 9-10 (s 0.58–0.66) =================
      tyreWall(0.585, 0.62, 1, 4, TYRE_CAP);
      fence(0.58, 0.67, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      grandstand(0.63, 1, 22, 46, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]);
      billboard(K(0.60), -1, 10, 12, 4, [0.90, 0.55, 0.05]);
      billboard(K(0.64),  1,  9, 12, 4, [0.85, 0.12, 0.12]);
      // Low timing/medical building cluster — cool lit windows for tech feel
      for (let i = 0; i < 3; i++) building((K(0.62) + i * 4) % n, -1, 38 + i * 6, 10, 6 + hash(i) * 3, 13,
        { wall: [0.90, 0.90, 0.86], window: WIN_COOL, floor: 3 });
      // Mid-circuit desert compound building
      building(K(0.55), -1, 40, 14, 8, 20, { wall: [0.62, 0.58, 0.50], window: WIN_WARM, floor: 2 });

      // ================= BACK STRAIGHT (s 0.74–0.90, R) =================
      fence(0.74, 0.88, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.74, 0.88, 1, 5, TYRE_CAP);
      guardrail(0.73, 0.90, -1, 8, [0.80, 0.80, 0.82]);
      floodMast(K(0.77), 1, 30, 26);
      floodMast(K(0.80), 1, 30, 26);
      floodMast(K(0.84), 1, 30, 26);
      floodMast(K(0.79), -1, 30, 25);
      lightBank(K(0.76), 1, 34);
      lightBank(K(0.86), 1, 34);
      grandstand(0.80, 1, 22, 70, [0.40, 0.41, 0.46], SEAT);
      grandstand(0.84, 1, 22, 50, [0.40, 0.41, 0.46], SEAT);
      grandstand(0.78, 1, 24, 60, [0.42, 0.43, 0.48], SEAT);
      billboard(K(0.75), -1, 10, 14, 4, BILLBOARD_LITE);
      billboard(K(0.78),  1, 12, 14, 4, [0.05, 0.45, 0.75]);
      billboard(K(0.82), -1,  9, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.86), -1, 10, 12, 4, [0.10, 0.55, 0.30]);
      marshalPost(K(0.82),  1, 22);
      marshalPost(K(0.86), -1, 24);
      // Mid-straight overhead scoring gantry
      gantry(0.81, 8.2, STEEL);

      // ================= PIT ENTRY (s 0.95, L) =================
      building(K(0.95), -1, 2, 12, 8, 50, { wall: [0.78, 0.78, 0.76], window: WIN_COOL, floor: 4 });
      wall(0.92, 0.99, -1, 4, 1.0, [0.85, 0.85, 0.85]);

      // ================= PADDOCK / HOSPITALITY ROW (s 0.00–0.95, L) =================
      for (let i = 0; i < 6; i++) {
        const k = (K(0.985) + i * 4) % n;
        hospitality(k, -1, 30 + (i % 2) * 6, 12, 7 + hash(k * 3) * 3, 16);
      }
      // Taller paddock office block (lit cool windows) + comms tower
      building(K(0.97), -1, 64, 20, 22, 26, { wall: [0.78, 0.78, 0.76], window: WIN_COOL, floor: 6 });
      tower(K(0.95), -1, 84, 5, 38, { col: TOWER_PALE, seg: 6, cap: true, capCol: FLOOD, mast: true });
      // Pit-lane furniture
      tyreWall(0.90, 0.98, -1, 5, TYRE_CAP);
      guardrail(0.985, 0.06, 1, 9, [0.80, 0.80, 0.82]);
      // Start-line advertising hoardings
      billboard(K(0.99), 1, 9, 13, 4, BILLBOARD_LITE);
      billboard(K(0.02), -1, 9, 12, 4, [0.10, 0.55, 0.30]);

      // ================= ROAMING PERIMETER FLOODLIGHTS =================
      // Dense floodlight infrastructure wrapping the whole lap — the key
      // night-race visual. Each mast now carries a ground pool.
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 24))) {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodMast(k, side, 32 + hash(k * 11) * 20, 26 + hash(k * 13) * 5);
      }

      // ================= EXTRA CATCH-FENCE RIBBONS =================
      fence(0.10, 0.16,  1, 7, 3.0, [0.70, 0.72, 0.76]);
      fence(0.66, 0.72, -1, 7, 3.0, [0.70, 0.72, 0.76]);

      // ================= DESERT PALMS (oasis planting) =================
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 64))) {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) > 0.58) continue;
          const d = 12 + hash(k * 19 + side) * 28;
          const palmH = 8 + hash(k * 23 + side) * 5;
          palm(k, side, d, palmH, [0.18, 0.36, 0.15]);
          if (hash(k * 29 + side) > 0.55) {
            palm((k + 2) % n, side, d + 6 + hash(k * 31) * 8, 7 + hash(k * 37 + side) * 4, [0.16, 0.34, 0.14]);
          }
          if (hash(k * 47 + side) > 0.70) {
            palm((k + 4) % n, side, d + 12 + hash(k * 53) * 6, 6 + hash(k * 59 + side) * 3, [0.15, 0.32, 0.13]);
          }
        }
      }

      // ================= DESERT SCRUB / ROCKS =================
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 90))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 41 + side * 7);
          if (r > 0.55) continue;
          const d = 8 + hash(k * 43 + side) * 22;
          if (r < 0.28) {
            bush(k, side, d, [0.32, 0.34, 0.20]);
          } else {
            place(k, side, d, [1.4 + hash(k * 47) * 2.0, 0.8 + hash(k * 53) * 1.4, 1.5 + hash(k * 59) * 1.8], SAND_DARK);
          }
        }
      }

      // ================= SAND RUNOFF PATCHES =================
      {
        const SAND_RUNOFF = [0.69, 0.59, 0.40];
        for (const [s0, s1] of [[0.10, 0.20], [0.60, 0.70]]) {
          let cnt = 0;
          for (let sf = s0; sf < s1; sf += 0.020) {
            const kk = K(sf);
            const a = anchor(kk, -1, 20 + hash(kk * 5) * 12), b = [a.r, a.u, a.t];
            addBox(out, vadd(a.c, a.u, 0.12), [5.5, 0.25, 9.5], SAND_RUNOFF, b);
            cnt++;
            if (cnt > 6) break;
          }
        }
      }

      // ================= DUNE SILHOUETTE RIDGES (L far, s 0.15–0.75) =================
      {
        const DUNE_RIDGE = [0.54, 0.43, 0.27];
        for (const [s, dist] of [[0.20, 124], [0.48, 162], [0.70, 196]]) {
          const a = anchor(K(s), -1, dist), b = [a.r, a.u, a.t];
          addFrustum(out, a.c, 88, 38, 9 + hash(K(s) * 7) * 5.5, DUNE_RIDGE, 6, b);
        }
      }

      // ================= DISTANT MANAMA CITY GLOW =================
      // Sparse silhouette ring beyond the dune band with warm lit tops.
      const cityRing = rad + 540;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * 6.2832 + 0.3, h = hash(i * 17 + 99);
        const x = cx + Math.cos(a) * (cityRing + (h - 0.5) * 100);
        const z = cz + Math.sin(a) * (cityRing + (h - 0.5) * 100);
        if (onTrack(x, z, 30)) continue;
        const bw = 14 + h * 18, bh = 22 + h * 50;
        addBox(out, [x, pyMin + bh * 0.5, z], [bw, bh, bw], [0.14, 0.14, 0.18]);
        // Warm amber lit crown — windows glow at night
        addBox(out, [x, pyMin + bh + 0.8, z], [bw * 0.65, 1.6, bw * 0.65], [0.86, 0.72, 0.40]);
      }
      // Slim comms/lighting towers on the city ring for skyline variety
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.2832 + 1.1, h = hash(i * 23 + 7);
        const x = cx + Math.cos(a) * (cityRing - 30), z = cz + Math.sin(a) * (cityRing - 30);
        if (onTrack(x, z, 20)) continue;
        const towerH = 68 + h * 46;
        addCyl(out, [x, pyMin, z], 2.2, towerH, [0.16, 0.16, 0.20], 6, null);
        addBox(out, [x, pyMin + towerH + 1, z], [3.5, 2.5, 3.5], [0.92, 0.60, 0.22], null);
      }

    },
  }
  );
})();
