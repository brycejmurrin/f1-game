/* Apex 26 — BAHRAIN circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
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
        palm, bush, grandstand, building, cityFront, tower, billboard, gantry, marshalPost,
        mountain, backdrop, fence, wall, guardrail, tyreWall, onTrack } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Desert palette (night race, Sakhir) ──────────────────────────────
      // Base sand tones for dunes and desert backdrop
      const SAND        = [0.62, 0.50, 0.34];
      const DUNE        = [0.74, 0.62, 0.44];
      const DUNE_LIT    = [0.70, 0.58, 0.40];
      const SAND_DARK   = [0.55, 0.44, 0.28];
      const SAND_LIGHT  = [0.75, 0.62, 0.42];
      // Grandstand / pit building colours: Bahrain's iconic pale cream + slate seats
      const SEAT        = [0.18, 0.18, 0.21];
      const SEAT_BLUE   = [0.14, 0.22, 0.42];
      const STEEL       = [0.16, 0.16, 0.19];
      const PIT_CREAM   = [0.91, 0.89, 0.84];  // cream-white for main pit building
      const STAND_CREAM = [0.84, 0.82, 0.76];  // slightly warm for grandstand shells
      // Floodlights: bright near-white lamp caps + warm pool halo on the ground
      const FLOOD       = [0.95, 0.95, 0.88];
      const POOL        = [0.82, 0.80, 0.68];  // pale warm disc on tarmac/sand
      // Night-lit windows: warm amber (office glow), cool blue (control/tech rooms)
      const WIN_WARM    = [0.92, 0.80, 0.44];  // office/hospitality lit window — warm amber
      const WIN_COOL    = [0.52, 0.70, 0.94];  // timing/technical lit window — cool blue
      // Sakhir Tower: pale cream cylindrical shaft + LED video façade bands
      const TOWER_CYL   = [0.84, 0.83, 0.79];
      const TOWER_PALE  = [0.85, 0.85, 0.80];
      const TOWER_LED   = [0.92, 0.88, 0.55];  // warm LED glow on façade rings
      // Night-race beacon: warm amber nav light + cool video-screen accent
      const BEACON_WARM = [0.98, 0.75, 0.35];
      const BEACON_COOL = [0.70, 0.88, 0.98];
      const TYRE_CAP    = [0.85, 0.13, 0.13];
      const BILLBOARD_LITE = [0.95, 0.93, 0.86];
      // Hospitality buildings: sandy desert palette with lit windows
      const HOSP_SAND   = [0.82, 0.78, 0.68];  // sandy beige hospitality exterior
      const HOSP_WARM   = [0.78, 0.74, 0.65];
      // Desert scrub: dried, dusty vegetation — warm ochre not green
      const SCRUB_DRY   = [0.46, 0.40, 0.24];  // dried desert scrub / dead grass
      const SCRUB_MID   = [0.52, 0.44, 0.28];  // mid-tone desert scrub

      // ── Continuous dune backdrop ring ────────────────────────────────────
      // Two overlapping rings (near + far) give an unbroken desert horizon.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));

      for (const [extra, jit, wMin, hMin, count, forestCol, rockCol] of [
        [140, 55,  220, 24, 72, SAND_DARK,  SAND      ],  // near warm-sand band
        [340, 100, 300, 38, 60, SAND,       SAND_LIGHT],  // far lighter-horizon band
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

      // ── Distant Manama skyline: lit towers on the night horizon ──────────
      // Sakhir is desert, but the capital's towers glow on one side of the sky.
      // backdrop() auto-adds lit window bands on night circuits; a few carry red
      // aircraft beacons. Confined to one arc (a city in one direction) and pushed
      // well beyond the far dune band so the dunes stay the foreground.
      const SKY_SIL  = [0.26, 0.29, 0.38];   // dark blue-grey tower silhouette (lifted so it reads)
      const SKY_SIL2 = [0.21, 0.24, 0.34];   // deeper varied tone
      (function manamaSkyline() {
        // Two clusters on opposite arcs so the capital reads from more of the lap,
        // plus a couple of taller landmark spires. Pulled closer + taller than
        // before (towers were too faint/narrow to notice).
        const clusters = [[0.22, 22, 1], [0.66, 12, -1]];   // [arcStart, count, side]
        for (const [arc0, count, side] of clusters) {
          for (let i = 0; i < count; i++) {
            const sFrac = (arc0 + i * 0.018) % 1;
            const hf = hash(i * 7 + arc0 * 30), wf = hash(i * 3 + arc0 * 17);
            const dist = 400 + hash(i * 5 + arc0 * 70) * 170;
            const landmark = hash(i * 4.4 + arc0) > 0.86;
            const w = 9 + wf * 12, h = (landmark ? 130 : 58) + hf * 150, d = w * 1.3;
            backdrop(K(sFrac), side, dist, [w, h, d], hash(i * 11 + arc0) > 0.5 ? SKY_SIL : SKY_SIL2);
            if (landmark || hash(i * 13 + 1.7) > 0.5) {
              const a = anchor(K(sFrac), side, dist), bv = [a.r, a.u, a.t];
              addBox(out, vadd(a.c, a.u, h + 2.5), [1.8, 4.0, 1.8], BEACON_WARM, bv);  // aircraft beacon
            }
          }
        }
      })();

      // ── Floodlight mast: dark pole + bright lamp-bank cap + ground pool ──
      // Gap is measured from road edge — always call with gap >= 16 to clear barriers.
      const floodMast = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.4, h, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, h), [5.25, 1.75, 2.0], FLOOD, b);  // lamp bank
        // light pool: flat pale disc (box) at ground level under the mast
        addBox(out, vadd(a.c, a.u, 0.12), [8.0, 0.25, 8.0], POOL, b);
      };

      // ── Sculpted organic dune mound (replaces flat frustum wedge) ───────
      // Uses mountain() for irregular silhouette — more dune-like than a frustum.
      // gap is road-edge clearance; w/h are footprint/height in metres.
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap + w * 0.3);
        mountain(a.c[0], a.c[2], pyMin, w * 0.55, h, {
          seg: 6, seed: k * 3 + side * 17,
          rough: 0.32, snowline: 99,
          forest: DUNE, rock: SAND_DARK, snow: DUNE_LIT,
        });
      };

      // ── Three-pole light bank (cluster of masts) ─────────────────────────
      const lightBank = (k, side, gap) => {
        for (const off of [-6, 0, 6]) {
          const kk = (k + off + n) % n;
          floodMast(kk, side, gap, 24 + hash(kk * 3) * 4);
        }
      };

      // ── Hospitality unit: sandy desert-coloured box with lit warm windows ──
      // Min gap 18m so the building's outer face clears all barrier/fence zones.
      const hospitality = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: HOSP_SAND, window: WIN_WARM, lit: true, floor: 3 });
        // lit parapet strip: bright white ledge mimicking the real Bahrain hospitality roofline
        const a = anchor(k, side, gap + w / 2), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h + 0.55), [w * 1.05, 0.65, d * 1.02], FLOOD, b);
      };

      // ── Small access/marshal box ──────────────────────────────────────────
      // Replaces bare `place()` cubes with a proper building that has lit windows.
      const accessBox = (k, side, gap, w, h, d) => {
        building(k, side, gap, w, h, d,
          { wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 2 });
      };

      // ================= START / FINISH =================
      // Main pit building: long cream facade representing the real Bahrain pit lane
      // complex — wide, 3-storey cream structure with warm amber lit offices.
      building(K(0.00), -1,  2, 16, 14, 80,
        { wall: PIT_CREAM, window: WIN_WARM, lit: true, floor: 4, setback: true });
      // Pit wall + start gantry
      wall(0.97, 0.04, -1, 3, 1.1, [0.85, 0.85, 0.85]);
      gantry(0.005, 8.5, STEEL);
      // Main grandstands on the pit straight — large pale-cream shells with dark navy seats.
      // Bahrain's main stands are tall (sand/cream colours) with blue seats.
      grandstand(0.00,   1, 18, 140, STAND_CREAM, SEAT_BLUE);
      grandstand(0.985,  1, 20,  80, STAND_CREAM, SEAT_BLUE);
      // Second pit-side building: timing/media centre with cool lit windows
      building(K(0.01), -1, 2, 10, 9, 40,
        { wall: [0.86, 0.85, 0.80], window: WIN_COOL, lit: true, floor: 3 });

      // ── Sakhir Tower ─────────────────────────────────────────────────────
      // Iconic 8-storey cylindrical tower with LED video façade, placed on
      // the left well back from the pit building (L, 52 m gap).
      // Structure: base cylinder → LED ring bands → crown cap → antenna beacon.
      (function sakhirTower() {
        const a = anchor(K(0.005), -1, 52), b = [a.r, a.u, a.t];
        const BASE = a.c;
        // Main shaft: tapered pale-cream cylinder
        addCyl(out, BASE, 7.2, 62, TOWER_CYL, 12, b);
        // Eight horizontal LED bands — frustums protruding just beyond the shaft
        for (let i = 0; i < 8; i++) {
          const yBase = 4 + (i / 7) * 54;
          addFrustum(out, vadd(BASE, b[1], yBase), 8.4, 8.0, 1.0, TOWER_LED, 12, b);
        }
        // Crown cap: wider disc on top of the shaft at 62 m
        addCyl(out, vadd(BASE, b[1], 62), 9.0, 2.5, FLOOD, 10, b);
        // Antenna / beacon above the crown
        addCyl(out, vadd(BASE, b[1], 64.5), 0.4, 6.0, STEEL, 5, b);
        addCone(out, vadd(BASE, b[1], 64.5), 3.8, 5.0, BEACON_WARM, 8, b);
        addBox(out, vadd(BASE, b[1], 70.5), [3.0, 1.2, 3.0], BEACON_COOL, b);
        // Light pool at tower base
        addBox(out, vadd(BASE, b[1], 0.15), [18.0, 0.30, 18.0], POOL, b);
      })();

      // Paddock buildings behind pit complex (left side, s 0.97–0.04)
      // A continuous row of sandy-coloured hospitality/paddock structures
      cityFront(0.97, 0.05, -1, 30, {
        minH: 6, maxH: 14, depth: 18, step: 18,
        palette: [HOSP_SAND, HOSP_WARM, [0.80, 0.75, 0.64], [0.86, 0.82, 0.72]],
        lit: true, windowCol: WIN_WARM,
      });

      // ── Desert backdrop slabs on main straight (sand-tone horizon fill) ──
      // backdrop() places track-aligned wall panels at distance; sand colours
      // (non-green, sz[1] ≤ sz[2] so isBld=false) render as plain dune masses.
      backdrop(K(0.00), 1, 160, [280, 16, 14], SAND_DARK);
      backdrop(K(0.97), 1, 180, [240, 18, 14], SAND);

      // ================= TURN 1 (s 0.05) =================
      // T1 is the famous heavy-braking zone into a 90-degree right-hander.
      // Grandstands wrap around the outside on both sides — blue-seated.
      grandstand(0.05,   1, 24, 90, STAND_CREAM, SEAT_BLUE);
      grandstand(0.025,  1, 24, 60, STAND_CREAM, SEAT_BLUE);
      grandstand(0.065,  1, 28, 72, STAND_CREAM, SEAT);
      // Inside of T1: access road + small pit buildings
      accessBox(K(0.03), -1, 36, 10, 6, 16);
      lightBank(K(0.06), 1, 36);
      floodMast(K(0.05), 1, 32, 26);
      floodMast(K(0.03), -1, 32, 25);
      billboard(K(0.07), -1, 10, 14, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.08),  1, 10, 12, 3.5, [0.05, 0.45, 0.75]);
      billboard(K(0.10),  1, 11, 12, 4, [0.10, 0.30, 0.70]);
      tyreWall(0.045, 0.085, 1, 4, TYRE_CAP);
      fence(0.03, 0.09, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      marshalPost(K(0.06), 1, 22);

      // ================= UNIVERSITY GRANDSTAND (s 0.15–0.22) =================
      // The University grandstand complex runs along the back of T3-T4-T5.
      // Four separate stand sections — cream shells, blue/dark seats.
      for (const [ds, dGap, seLen, seatC] of [
        [-0.040, 26, 44, SEAT_BLUE],
        [-0.010, 24, 38, SEAT],
        [ 0.025, 24, 42, SEAT_BLUE],
        [ 0.060, 28, 38, SEAT],
      ]) {
        grandstand(0.18 + ds, 1, dGap, seLen, STAND_CREAM, seatC);
      }
      billboard(K(0.15), 1, 11, 12, 4, [0.90, 0.55, 0.05]);
      floodMast(K(0.16), 1, 34, 26);

      // ================= FLOODLIGHT MASTS (s 0.18–0.28, both sides) =================
      floodMast(K(0.20), -1, 30, 25);
      floodMast(K(0.20),  1, 30, 25);
      floodMast(K(0.23), -1, 32, 24);
      floodMast(K(0.16), -1, 34, 26);

      // ================= SCULPTED DUNES (s 0.28–0.36, L far) =================
      // Organic desert dune mounds on the far left — pushed well back (gap 64+)
      // using mountain() for irregular silhouettes instead of flat frustums.
      for (let i = 0; i < 6; i++) {
        const k = (K(0.27) + i * Math.round(n * 0.015)) % n;
        duneWedge(k, -1, 64 + i * 14, 40 + hash(k) * 28, 3.5 + hash(k * 5) * 3);
      }

      // ================= TURN 3/4 COMPLEX (s 0.22–0.28) =================
      grandstand(0.24,  1, 24, 60, STAND_CREAM, SEAT_BLUE);
      grandstand(0.26, -1, 26, 50, STAND_CREAM, SEAT);
      lightBank(K(0.25), -1, 34);
      lightBank(K(0.27),  1, 34);
      tyreWall(0.225, 0.255, 1, 4, TYRE_CAP);
      fence(0.22, 0.29, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.23), -1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.27),  1, 11, 12, 4, [0.90, 0.55, 0.05]);
      marshalPost(K(0.24), -1, 24);
      // Small desert hospitality cluster at T4: sandy buildings with lit windows
      // Push gap to 22+ so inner face clears barriers, use proper hospitality helper.
      for (let i = 0; i < 3; i++) {
        hospitality((K(0.255) + i * 5) % n, 1, 44 + i * 6, 11, 6, 14);
      }
      // Desert backdrop slab on the L (infield) side at T3 — fills horizon gap
      backdrop(K(0.24), -1, 120, [200, 14, 12], SAND_DARK);

      // ================= TURNS 5-6-7 SWEEP (s 0.32–0.42) =================
      // This long sweeping section has open desert on the left and a grandstand
      // on the right. Palms are placed on BOTH sides but well back — minimum 20m
      // from road edge to keep canopy clear of barriers. Scrub min dist 16m.
      for (let i = 0; i < 14; i++) {
        const k = (K(0.32) + Math.round(i * n * 0.006)) % n;
        const side = (i % 3 === 0) ? 1 : -1;
        // Minimum 20m from road edge for palm canopy clearance (fronds ~4m wide)
        const d = 20 + (i % 4) * 8 + hash(k * 7 + i) * 10;
        palm(k, side, d, 7 + hash(k * 11 + i) * 4, [0.16, 0.34, 0.14]);
        // Dried desert scrub clusters only where there's ample clearance — min 16m
        if (hash(k * 13 + i) > 0.5 && d > 26) {
          bush((k + 1) % n, side, d - 6, SCRUB_DRY);
        }
      }
      lightBank(K(0.35), -1, 36);
      grandstand(0.37,  1, 26, 48, STAND_CREAM, SEAT_BLUE);
      grandstand(0.39, -1, 26, 38, [0.80, 0.78, 0.72], SEAT);
      fence(0.34, 0.41, 1, 6, 3.0, [0.70, 0.72, 0.76]);
      billboard(K(0.36), -1, 12, 12, 4, [0.10, 0.30, 0.70]);

      // ================= TURN 8 HAIRPIN (s 0.40–0.46) =================
      // The T8 hairpin has large grandstands wrapping the outside.
      grandstand(0.42,  1, 22, 64, STAND_CREAM, SEAT_BLUE);
      grandstand(0.40,  1, 24, 48, STAND_CREAM, SEAT_BLUE);
      grandstand(0.44,  1, 24, 56, [0.80, 0.78, 0.72], [0.20, 0.30, 0.50]);
      floodMast(K(0.42), 1, 34, 24);
      floodMast(K(0.44), -1, 32, 24);
      tyreWall(0.405, 0.44, 1, 4, TYRE_CAP);
      fence(0.40, 0.46, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.43), 1, 11, 12, 4, [0.05, 0.45, 0.75]);
      marshalPost(K(0.43), -1, 26);

      // ================= OPEN DESERT FLATS (s 0.47–0.56) =================
      // Wide open desert section — organic dune mounds pushed far back (90m+).
      for (let i = 0; i < 3; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.016)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 96 + i * 18, 48, 3.2);
      }
      // Sparse organic dune mounds (mid-lap desert fill) — min gap 48 on far side
      for (let i = 0; i < 4; i++) {
        const k = (K(0.49) + Math.round(i * n * 0.014)) % n;
        for (const side of [-1, 1]) {
          duneWedge(k, side, 48 + i * 16, 35 + hash(k * 3 + side) * 24, 3.3 + hash(k * 5) * 2.2);
        }
        // Palms well back from road (min 22m)
        if (i % 3 === 0) {
          const ps = 22 + i * 8;
          palm(k, (i % 2 === 0) ? -1 : 1, ps, 6.5 + hash(k * 9) * 3, [0.15, 0.32, 0.13]);
        }
      }
      grandstand(0.52,  1, 28, 52, STAND_CREAM, SEAT);
      lightBank(K(0.51), 1, 38);
      lightBank(K(0.54), -1, 38);
      marshalPost(K(0.50), -1, 26);
      // Desert accessory buildings: sandy compound structures (e.g. TV compound)
      building(K(0.50), -1, 44, 16, 8, 22,
        { wall: [0.72, 0.67, 0.56], window: WIN_WARM, lit: true, floor: 2 });
      // Desert backdrop slab behind open section — fills the distant horizon
      backdrop(K(0.50), -1, 140, [260, 15, 12], SAND);

      // ================= TIMING / MARSHAL ZONE (s 0.58–0.67, L) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.58) + i * 3) % n;
        marshalPost(k, -1, 28 + i * 3);
      }
      // Timing/control buildings: proper lit structures replacing bare `place()` cubes
      accessBox(K(0.62), -1, 36, 8, 5, 12);
      accessBox(K(0.65), -1, 32, 7, 4, 10);
      floodMast(K(0.60),  1, 34, 25);
      floodMast(K(0.66),  1, 32, 24);

      // ================= TURN 9-10 (s 0.58–0.66) =================
      tyreWall(0.585, 0.62, 1, 4, TYRE_CAP);
      fence(0.58, 0.67, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      grandstand(0.63,  1, 24, 50, STAND_CREAM, [0.16, 0.24, 0.42]);
      billboard(K(0.60), -1, 12, 12, 4, [0.90, 0.55, 0.05]);
      billboard(K(0.64),  1, 11, 12, 4, [0.85, 0.12, 0.12]);
      // Low timing/medical building cluster — cool lit windows for tech feel.
      // Gap 40+ keeps inner face well clear of fences at s 0.62.
      for (let i = 0; i < 3; i++) {
        building((K(0.62) + i * 4) % n, -1, 42 + i * 6, 10, 6 + hash(i) * 3, 14,
          { wall: [0.88, 0.87, 0.82], window: WIN_COOL, lit: true, floor: 3 });
      }
      // Mid-circuit desert compound: sandy-coloured infrastructure block
      building(K(0.55), -1, 42, 14, 8, 20,
        { wall: [0.68, 0.62, 0.50], window: WIN_WARM, lit: true, floor: 2 });

      // ================= BACK STRAIGHT (s 0.68–0.90) =================
      // The long back straight has grandstands on the right and desert on the left.
      fence(0.74, 0.88, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      tyreWall(0.74, 0.88, 1, 5, TYRE_CAP);
      guardrail(0.73, 0.90, -1, 8, [0.80, 0.80, 0.82]);
      floodMast(K(0.77),  1, 32, 26);
      floodMast(K(0.80),  1, 32, 26);
      floodMast(K(0.84),  1, 32, 26);
      floodMast(K(0.79), -1, 32, 25);
      lightBank(K(0.76), 1, 36);
      lightBank(K(0.86), 1, 36);
      // Back straight grandstands: large cream shells, blue navy seats
      grandstand(0.80,  1, 24, 74, STAND_CREAM, SEAT_BLUE);
      grandstand(0.84,  1, 24, 54, STAND_CREAM, SEAT_BLUE);
      grandstand(0.78,  1, 26, 64, [0.80, 0.78, 0.72], SEAT);
      billboard(K(0.75), -1, 12, 14, 4, BILLBOARD_LITE);
      billboard(K(0.78),  1, 14, 14, 4, [0.05, 0.45, 0.75]);
      billboard(K(0.82), -1, 11, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.86), -1, 12, 12, 4, [0.10, 0.55, 0.30]);
      marshalPost(K(0.82),  1, 24);
      marshalPost(K(0.86), -1, 26);
      // Mid-straight scoring gantry
      gantry(0.81, 8.2, STEEL);
      // Back straight desert buildings (R/L far): sandy compound structures
      building(K(0.72), -1, 48, 14, 10, 22,
        { wall: [0.72, 0.67, 0.56], window: WIN_WARM, lit: true, floor: 2 });
      building(K(0.90), -1, 46, 12, 8, 18,
        { wall: [0.70, 0.65, 0.54], window: WIN_COOL, lit: true, floor: 2 });
      // Desert backdrop slabs along the back straight left (desert) side
      backdrop(K(0.75), -1, 130, [300, 16, 13], SAND_DARK);
      backdrop(K(0.85), -1, 150, [260, 18, 13], SAND);

      // ================= PIT ENTRY (s 0.93–0.99, L) =================
      // Second pit building: media/control centre with cool lit windows
      building(K(0.95), -1, 2, 14, 10, 56,
        { wall: [0.86, 0.85, 0.80], window: WIN_COOL, lit: true, floor: 4 });
      wall(0.92, 0.99, -1, 4, 1.0, [0.85, 0.85, 0.85]);

      // ================= PADDOCK / HOSPITALITY ROW (s 0.985–0.97, L) =================
      // Bahrain has a large paddock with multi-storey hospitality units — sandy
      // coloured with lit warm windows, typical of Sakhir circuit.
      for (let i = 0; i < 6; i++) {
        const k = (K(0.985) + i * 4) % n;
        hospitality(k, -1, 32 + (i % 2) * 6, 12, 7 + hash(k * 3) * 3, 16);
      }
      // Taller paddock office block: media/comms tower complex
      building(K(0.97), -1, 68, 22, 24, 28,
        { wall: [0.78, 0.76, 0.70], window: WIN_COOL, lit: true, floor: 6, setback: true });
      tower(K(0.95), -1, 88, 5, 40,
        { col: TOWER_PALE, seg: 6, cap: true, capCol: FLOOD, mast: true });
      // Pit-lane furniture
      tyreWall(0.90, 0.98, -1, 5, TYRE_CAP);
      guardrail(0.985, 0.06, 1, 9, [0.80, 0.80, 0.82]);
      // Start-line advertising hoardings
      billboard(K(0.99), 1, 11, 13, 4, BILLBOARD_LITE);
      billboard(K(0.02), -1, 11, 12, 4, [0.10, 0.55, 0.30]);

      // ================= ROAMING PERIMETER FLOODLIGHTS =================
      // Dense floodlight infrastructure around the whole lap — key night-race visual.
      // All placed at gap >= 28 to avoid clipping barriers/fences.
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 22))) {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        const gap = 28 + hash(k * 11) * 18;
        floodMast(k, side, gap, 26 + hash(k * 13) * 5);
      }

      // ================= EXTRA CATCH-FENCE RIBBONS =================
      fence(0.10, 0.16,  1, 7, 3.0, [0.70, 0.72, 0.76]);
      fence(0.66, 0.72, -1, 7, 3.0, [0.70, 0.72, 0.76]);

      // ================= DESERT PALMS (oasis planting — well clear of barriers) =================
      // Minimum 20m from road edge to keep fronds (~4m canopy) clear of all barriers.
      // The half-track barrier gap is typically 7m + fence at 6m = ~13m, so 20m is safe.
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 56))) {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) > 0.54) continue;
          const d = 20 + hash(k * 19 + side) * 26;
          const palmH = 8 + hash(k * 23 + side) * 5;
          palm(k, side, d, palmH, [0.18, 0.36, 0.15]);
          if (hash(k * 29 + side) > 0.58) {
            palm((k + 2) % n, side, d + 8 + hash(k * 31) * 8,
              7 + hash(k * 37 + side) * 4, [0.16, 0.34, 0.14]);
          }
          if (hash(k * 47 + side) > 0.72) {
            palm((k + 4) % n, side, d + 14 + hash(k * 53) * 6,
              6 + hash(k * 59 + side) * 3, [0.15, 0.32, 0.13]);
          }
        }
      }

      // ================= DESERT SCRUB / ROCKS (min 16m from road edge) =================
      // Low dried scrub clumps and sand-coloured rocks — minimum distance 16m.
      // Scrub colour is warm ochre (dried desert vegetation), not green.
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 80))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 41 + side * 7);
          if (r > 0.52) continue;
          const d = 16 + hash(k * 43 + side) * 20;
          if (r < 0.26) {
            // dried desert scrub — warm ochre, not green
            bush(k, side, d, hash(k * 71 + side) > 0.5 ? SCRUB_DRY : SCRUB_MID);
          } else {
            // small sand-coloured rock/rubble box
            place(k, side, d,
              [1.4 + hash(k * 47) * 2.0, 0.8 + hash(k * 53) * 1.4, 1.5 + hash(k * 59) * 1.8],
              SAND_DARK);
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
      // Organic dune formations using mountain() for irregular silhouettes — three
      // distant ridges at increasing range give a layered desert depth.
      for (const [s, side, dist, wBase, hBase] of [
        [0.20, -1, 120, 86, 10],   // T3 infield dune ridge
        [0.48,  1, 155, 96, 12],   // desert section right-side ridge
        [0.70, -1, 192, 90, 11],   // back straight left-side ridge
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + wBase * 0.3);
        mountain(a.c[0], a.c[2], pyMin, wBase * 0.55 + hash(k * 7) * 30,
          hBase + hash(k * 11) * 5,
          { seg: 7, seed: k * 5 + dist, rough: 0.28, snowline: 99,
            forest: SAND_DARK, rock: SAND, snow: DUNE_LIT });
      }
      // Additional dune ridges on the opposite side to balance the horizon
      for (const [s, side, dist] of [
        [0.35,  1, 128],
        [0.60, -1, 148],
        [0.88,  1, 118],
      ]) {
        const k = K(s);
        const a = anchor(k, side, dist + 24);
        mountain(a.c[0], a.c[2], pyMin, 44 + hash(k * 9) * 28,
          8 + hash(k * 13) * 4,
          { seg: 6, seed: k * 7 + dist, rough: 0.25, snowline: 99,
            forest: SAND, rock: SAND_LIGHT, snow: DUNE_LIT });
      }

      // ================= DISTANT MANAMA CITY GLOW =================
      // Sparse Manama skyline ring beyond the dune band.
      // Inner ring: medium-height buildings with multi-band window treatment.
      // Outer ring: taller slender towers for skyline depth + slim antennas.
      const cityRing = rad + 540;
      const MANAMA_WALL = [0.18, 0.17, 0.24];
      const MANAMA_MID  = [0.15, 0.15, 0.21];

      for (let i = 0; i < 18; i++) {
        const ang = i / 18 * 6.2832 + 0.3, hf = hash(i * 17 + 99);
        const ringR = cityRing + (hf - 0.5) * 80;
        const x = cx + Math.cos(ang) * ringR, z = cz + Math.sin(ang) * ringR;
        if (onTrack(x, z, 30)) continue;
        const bw = 16 + hf * 20, bh = 24 + hf * 36, bd = bw * 0.7;
        // Main building mass
        addBox(out, [x, pyMin + bh * 0.5, z], [bw, bh, bd], MANAMA_WALL);
        // Two amber window bands — lower and upper thirds light up at night
        addBox(out, [x, pyMin + bh * 0.28, z], [bw * 1.01, bh * 0.14, bd * 1.01], [0.86, 0.72, 0.42]);
        addBox(out, [x, pyMin + bh * 0.60, z], [bw * 1.01, bh * 0.12, bd * 1.01], [0.90, 0.78, 0.45]);
        // Warm amber parapet crown
        addBox(out, [x, pyMin + bh + 0.7, z], [bw * 0.68, 1.8, bd * 0.68], [0.88, 0.74, 0.40]);
      }
      // Outer tower ring — taller slender blocks (44–90 m) for skyline variety
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * 6.2832 + 1.1, hf = hash(i * 23 + 7);
        const x = cx + Math.cos(ang) * (cityRing + 110), z = cz + Math.sin(ang) * (cityRing + 110);
        if (onTrack(x, z, 22)) continue;
        const tw = 8 + hf * 8, th = 44 + hf * 46, td = tw * 0.8;
        addBox(out, [x, pyMin + th * 0.5, z], [tw, th, td], MANAMA_MID);
        // Cool blue window band mid-height (office tower feel)
        addBox(out, [x, pyMin + th * 0.55, z], [tw * 1.02, th * 0.22, td * 1.02], [0.50, 0.68, 0.92]);
        // Warm amber crown beacon
        addBox(out, [x, pyMin + th + 1.0, z], [tw * 0.5, 2.4, td * 0.5], [0.95, 0.60, 0.22]);
        // Slim communication antenna
        addCyl(out, [x, pyMin + th + 3.4, z], 0.18, 14 + hf * 10, [0.30, 0.30, 0.34], 4, null);
      }

    },
  }
  );
})();
