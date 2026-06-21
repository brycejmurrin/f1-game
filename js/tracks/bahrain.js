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
        place, prop, backdrop, anchor, addBox, addCyl, addCone, addFrustum, addPrism,
        palm, bush, grandstand, building, tower, billboard, gantry, marshalPost,
        peak, mountain, fence, wall, guardrail, tyreWall, groundYAt, onTrack } = api;
      const K = (s) => Math.round(s * n) % n;

      // Palettes from the brief
      const SAND = [0.62, 0.50, 0.34], DUNE = [0.74, 0.62, 0.44], DUNE_N = [0.46, 0.39, 0.28];
      const DUNE_LIT = [0.70, 0.58, 0.40], DUNE_ROCK = [0.52, 0.44, 0.33];
      const CONC = [0.66, 0.66, 0.62], SEAT = [0.18, 0.18, 0.21], STEEL = [0.16, 0.16, 0.19];
      const FLOOD = [0.95, 0.95, 0.88], TOWER_PALE = [0.85, 0.85, 0.80];

      // ---- CONTINUOUS DUNE BACKDROP: a low organic dune band wrapping the whole
      // lap, computed as a ring from the track centre so it reads as an unbroken
      // desert horizon rather than scattered lumps. Two overlapping rings (a near
      // and a slightly-further band) close every gap; sand tones, no snow. ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // [extraDist, ringRadialJitter, baseW, baseH, count, snowline]
      for (const [extra, jit, wMin, hMin, count] of [
        [150, 60, 230, 26, 64],   // near dune band — dense overlap, low + warm
        [360, 110, 320, 40, 56],  // far hazed dune band — taller, fills horizon
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const ring = rad + extra + (h - 0.5) * jit;
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * 120, hMin + h * 22, {
            seg: 8, seed: i * 3 + extra,
            rough: 0.22, snowline: 9,
            forest: DUNE_ROCK, rock: DUNE, snow: DUNE_LIT,
          });
        }
      }

      // ---- A floodlit mast: dark pole + a bright lamp cap box. ----
      const floodMast = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.4, h, STEEL, 6, b);
        addBox(out, vadd(a.c, a.u, h), [5.25, 1.75, 2.0], FLOOD, b);  // lamp bank cap
      };

      // ---- Sculpted artificial dunes: low rounded tan wedges near the track. ----
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.28, h, DUNE, 7, b);
      };

      // ================= START / FINISH =================
      // Pit/control building: long low white box (L, close)
      building(K(0.00), -1, 2, 14, 12, 70, { wall: [0.90, 0.90, 0.88], window: [0.30, 0.34, 0.40], floor: 4 });
      // Pit wall + start gantry
      wall(0.97, 0.04, -1, 3, 1.1, [0.85, 0.85, 0.85]);
      gantry(0.005, 8.5, STEEL);
      // Main Grandstand: stepped grey slab (R, close)
      grandstand(0.00, 1, 16, 130, [0.42, 0.43, 0.47], SEAT);
      grandstand(0.985, 1, 18, 70, [0.42, 0.43, 0.47], SEAT);

      // Sakhir Tower: tall pale curved "sail" tower (L, far) — the hero silhouette.
      (function sakhirTower() {
        const a = anchor(K(0.005), -1, 46), b = [a.r, a.u, a.t];
        // tapered concrete shaft
        addFrustum(out, a.c, 6.5, 4.0, 58, TOWER_PALE, 10, b);
        // leaning "sail" fins flanking the shaft
        for (const o of [-7, 7]) {
          addBox(out, vadd(vadd(a.c, a.r, o), a.u, 28), [2.2, 52, 5.5], [0.80, 0.80, 0.74], b);
        }
        // lit crown
        addBox(out, vadd(a.c, a.u, 58), [9, 4, 9], FLOOD, b);
        addBox(out, vadd(a.c, a.u, 62), [3, 6, 3], [0.90, 0.40, 0.08], b);
      })();

      // ================= TURN 1 (s 0.05) =================
      grandstand(0.05, 1, 22, 80, [0.40, 0.41, 0.46], [0.16, 0.24, 0.42]);  // blue-trim seating
      grandstand(0.025, 1, 22, 56, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]); // extra wrap toward S/F
      floodMast(K(0.05), 1, 30, 26);
      floodMast(K(0.03), -1, 30, 25);
      billboard(K(0.07), -1, 8, 14, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.10), 1, 9, 12, 4, [0.10, 0.30, 0.70]);

      // ================= UNIVERSITY GRANDSTAND (triple, s 0.18) =================
      for (const dz of [-66, -22, 22, 66]) {
        const k = (K(0.18) + Math.round(dz) + n) % n;
        grandstand(k / n, 1, 24, 40, [0.43, 0.44, 0.49], SEAT);
      }
      billboard(K(0.15), 1, 9, 12, 4, [0.90, 0.55, 0.05]);

      // ================= FLOODLIGHT MASTS (s 0.20, both) =================
      floodMast(K(0.20), -1, 28, 25);
      floodMast(K(0.20), 1, 28, 25);
      floodMast(K(0.23), -1, 30, 24);
      floodMast(K(0.16), 1, 32, 26);

      // ================= SCULPTED DUNES (s 0.30, L far) =================
      for (let i = 0; i < 8; i++) {
        const k = (K(0.27) + i * Math.round(n * 0.009)) % n;
        duneWedge(k, -1, 56 + i * 12, 38 + hash(k) * 30, 4 + hash(k * 5) * 3);
      }

      // ================= TURN 8 HAIRPIN (s 0.42, R) =================
      grandstand(0.42, 1, 20, 60, [0.41, 0.42, 0.46], SEAT);   // low grey arc
      grandstand(0.40, 1, 22, 44, [0.41, 0.42, 0.46], SEAT);
      floodMast(K(0.42), 1, 32, 24);
      floodMast(K(0.44), -1, 30, 24);
      marshalPost(K(0.43), -1, 24);

      // ================= OPEN DESERT FLATS (s 0.50, both far) =================
      for (let i = 0; i < 4; i++) {
        const k = (K(0.48) + i * Math.round(n * 0.012)) % n;
        for (const side of [-1, 1]) duneWedge(k, side, 90 + i * 20, 50, 3.5);
      }

      // ================= MARSHAL / TIMING HUTS (s 0.62, L far) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.58) + i * 3) % n;
        marshalPost(k, -1, 26 + i * 3);
      }
      place(K(0.62), -1, 34, [4, 4, 5], [0.92, 0.92, 0.88]);   // small white cube
      place(K(0.65), -1, 30, [4, 3.5, 4.5], [0.90, 0.90, 0.86]);
      floodMast(K(0.60), 1, 32, 25);
      floodMast(K(0.66), 1, 30, 24);

      // ================= BACK STRAIGHT (s 0.80, R) =================
      fence(0.74, 0.88, 1, 6, 3.2, [0.70, 0.72, 0.76]);        // catch fence
      floodMast(K(0.77), 1, 30, 26);
      floodMast(K(0.80), 1, 30, 26);
      floodMast(K(0.84), 1, 30, 26);
      floodMast(K(0.79), -1, 30, 25);
      grandstand(0.80, 1, 22, 70, [0.40, 0.41, 0.46], SEAT);
      grandstand(0.84, 1, 22, 50, [0.40, 0.41, 0.46], SEAT);
      billboard(K(0.82), -1, 9, 12, 4, [0.85, 0.12, 0.12]);
      marshalPost(K(0.86), -1, 24);

      // ================= PIT ENTRY (s 0.95, L) =================
      building(K(0.95), -1, 2, 12, 8, 50, { wall: [0.78, 0.78, 0.76], window: [0.26, 0.30, 0.36], floor: 4 });
      wall(0.92, 0.99, -1, 4, 1.0, [0.85, 0.85, 0.85]);

      // ---- Desert palms scattered behind the runoff (oasis planting), denser
      // than before and clustered so sparse stretches get filled. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 60))) {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) > 0.66) continue;
          const d = 14 + hash(k * 19 + side) * 26;
          palm(k, side, d, 7 + hash(k * 23 + side) * 4, [0.16, 0.34, 0.14]);
          // occasional second palm a little deeper for a small oasis clump
          if (hash(k * 29 + side) > 0.62) {
            palm((k + 2) % n, side, d + 8 + hash(k * 31) * 6, 6 + hash(k * 37 + side) * 4, [0.15, 0.32, 0.13]);
          }
        }
      }

      // ---- Scattered low desert scrub / rocks filling the runoff fringe. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 80))) {
        for (const side of [-1, 1]) {
          const r = hash(k * 41 + side * 7);
          if (r > 0.6) continue;
          const d = 10 + hash(k * 43 + side) * 20;
          if (r < 0.3) {
            bush(k, side, d, [0.30, 0.32, 0.18]);                // dry scrub
          } else {
            // low tan boulder
            place(k, side, d, [1.6 + hash(k * 47) * 1.8, 0.9 + hash(k * 53) * 1.2, 1.6 + hash(k * 59) * 1.6], DUNE_ROCK);
          }
        }
      }

      // ---- Roaming floodlight masts to sell the night-race lighting. ----
      for (let k = 0; k < n; k += Math.max(1, Math.round(n / 22))) {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        floodMast(k, side, 36 + hash(k * 11) * 18, 24 + hash(k * 13) * 4);
      }

      // ============================================================
      // ====  ADDED DETAIL — richer paddock, stands, desert  =======
      // ============================================================

      const HOSP_GLASS = [0.34, 0.40, 0.50], HOSP_WALL = [0.82, 0.82, 0.80];
      const TYRE_CAP = [0.85, 0.13, 0.13], BILLBOARD_LITE = [0.95, 0.93, 0.86];

      // ---- A floodlit mast helper variant placed in clusters for a "bank" of
      // lights (three poles in a short row). ----
      const lightBank = (k, side, gap) => {
        for (const off of [-6, 0, 6]) {
          const kk = (k + off + n) % n;
          floodMast(kk, side, gap, 24 + hash(kk * 3) * 4);
        }
      };

      // ---- A small hospitality / team motorhome: a low glassy box with a
      // bright lit parapet, for the paddock area. ----
      const hospitality = (k, side, dist, w, h, d) => {
        building(k, side, dist, w, h, d, { wall: HOSP_WALL, window: HOSP_GLASS, floor: 3 });
        // lit roof parapet line
        const a = anchor(k, side, dist + d * 0.5), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h + 0.5), [w * 1.05, 0.6, d * 1.02], FLOOD, b);
      };

      // ================= PADDOCK / HOSPITALITY ROW (behind pits, s 0.00–0.95) =================
      // Cluster of team motorhomes & hospitality units set well back on the
      // left (paddock side) behind the pit building — adds depth at S/F.
      for (let i = 0; i < 6; i++) {
        const k = (K(0.985) + i * 4) % n;
        hospitality(k, -1, 30 + (i % 2) * 6, 12, 7 + hash(k * 3) * 3, 16);
      }
      // taller paddock office block + comms tower behind the Sakhir Tower side
      building(K(0.97), -1, 64, 20, 22, 26, { wall: [0.78, 0.78, 0.76], window: [0.30, 0.34, 0.42], floor: 6 });
      tower(K(0.95), -1, 84, 5, 38, { col: TOWER_PALE, seg: 6, cap: true, capCol: FLOOD, mast: true });
      // pit-lane tyre wall + guardrail edging on the pit side
      tyreWall(0.90, 0.98, -1, 5, TYRE_CAP);
      guardrail(0.985, 0.06, 1, 9, [0.80, 0.80, 0.82]);
      // extra start-line advertising hoardings
      billboard(K(0.99), 1, 9, 13, 4, BILLBOARD_LITE);
      billboard(K(0.02), -1, 9, 12, 4, [0.10, 0.55, 0.30]);

      // ================= TURN 1 — denser stands + furniture (s 0.05) =================
      grandstand(0.065, 1, 26, 64, [0.39, 0.40, 0.45], [0.20, 0.30, 0.50]); // outer second tier
      lightBank(K(0.06), 1, 34);
      tyreWall(0.045, 0.085, 1, 4, TYRE_CAP);        // T1 apex tyre stack
      fence(0.03, 0.09, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.08), 1, 8, 12, 3.5, [0.05, 0.45, 0.75]);
      marshalPost(K(0.06), 1, 20);

      // ================= TURN 3/4 COMPLEX (s 0.22–0.28) — was sparse =================
      grandstand(0.24, 1, 22, 56, [0.42, 0.43, 0.48], SEAT);
      grandstand(0.26, -1, 24, 46, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]);
      lightBank(K(0.25), -1, 32);
      lightBank(K(0.27), 1, 32);
      tyreWall(0.225, 0.255, 1, 4, TYRE_CAP);
      fence(0.22, 0.29, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      billboard(K(0.23), -1, 9, 12, 4, [0.85, 0.12, 0.12]);
      billboard(K(0.27), 1, 9, 12, 4, [0.90, 0.55, 0.05]);
      marshalPost(K(0.24), -1, 22);
      // small desert hospitality cluster set back at T4
      for (let i = 0; i < 3; i++) hospitality((K(0.255) + i * 4) % n, 1, 40 + i * 5, 11, 6, 14);

      // ================= TURNS 5-6-7 SWEEP (s 0.32–0.40) — palm oasis + furniture =================
      // A genuine palm oasis clump filling the sparse left-side sweep.
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

      // ================= TURN 8 HAIRPIN — extra detail (s 0.42) =================
      tyreWall(0.405, 0.44, 1, 4, TYRE_CAP);          // outer hairpin tyre wall
      fence(0.40, 0.46, -1, 7, 3.2, [0.70, 0.72, 0.76]);
      grandstand(0.44, 1, 22, 50, [0.42, 0.43, 0.48], [0.20, 0.30, 0.50]);
      billboard(K(0.43), 1, 9, 12, 4, [0.05, 0.45, 0.75]);

      // ================= OPEN DESERT (s 0.48–0.56) — fill empty foreground =================
      // Mid-distance dune wedges + scrub on both sides plus a couple of
      // distant hospitality boxes so the flats aren't bare.
      for (let i = 0; i < 6; i++) {
        const k = (K(0.49) + Math.round(i * n * 0.01)) % n;
        for (const side of [-1, 1]) {
          duneWedge(k, side, 44 + i * 14, 32 + hash(k * 3 + side) * 26, 3.5 + hash(k * 5) * 2.5);
        }
        if (i % 2 === 0) palm(k, (i % 4 < 2) ? -1 : 1, 30 + i * 6, 6 + hash(k * 9) * 3, [0.15, 0.32, 0.13]);
      }
      grandstand(0.52, 1, 26, 48, [0.40, 0.41, 0.46], SEAT);
      lightBank(K(0.51), 1, 36);
      lightBank(K(0.54), -1, 36);
      marshalPost(K(0.50), -1, 24);

      // ================= TURN 9-10 (s 0.58–0.66) — paddock annex + furniture =================
      tyreWall(0.585, 0.62, 1, 4, TYRE_CAP);
      fence(0.58, 0.67, 1, 6, 3.2, [0.70, 0.72, 0.76]);
      grandstand(0.63, 1, 22, 46, [0.41, 0.42, 0.47], [0.16, 0.24, 0.42]);
      billboard(K(0.60), -1, 10, 12, 4, [0.90, 0.55, 0.05]);
      billboard(K(0.64), 1, 9, 12, 4, [0.85, 0.12, 0.12]);
      // a low timing/medical building cluster set back
      for (let i = 0; i < 3; i++) building((K(0.62) + i * 4) % n, -1, 38 + i * 6, 10, 6 + hash(i) * 3, 13,
        { wall: [0.90, 0.90, 0.86], window: [0.28, 0.32, 0.40], floor: 3 });

      // ================= BACK STRAIGHT (s 0.72–0.90) — denser banks + walls =================
      tyreWall(0.74, 0.88, 1, 5, TYRE_CAP);
      guardrail(0.73, 0.90, -1, 8, [0.80, 0.80, 0.82]);
      lightBank(K(0.76), 1, 34);
      lightBank(K(0.86), 1, 34);
      grandstand(0.78, 1, 24, 60, [0.42, 0.43, 0.48], SEAT);
      billboard(K(0.75), -1, 10, 14, 4, BILLBOARD_LITE);
      billboard(K(0.78), 1, 12, 14, 4, [0.05, 0.45, 0.75]);
      billboard(K(0.86), -1, 10, 12, 4, [0.10, 0.55, 0.30]);
      marshalPost(K(0.82), 1, 22);
      // mid-straight overhead gantry (DRS / scoring)
      gantry(0.81, 8.2, STEEL);

      // ---- Distant Manama-style desert-city glow on the far horizon: a sparse
      // ring of low lit boxes well beyond the dune band, kept off any tarmac. ----
      const cityRing = rad + 540;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * 6.2832 + 0.3, h = hash(i * 17 + 99);
        const x = cx + Math.cos(a) * (cityRing + (h - 0.5) * 120);
        const z = cz + Math.sin(a) * (cityRing + (h - 0.5) * 120);
        if (onTrack(x, z, 30)) continue;
        const bw = 16 + h * 22, bh = 18 + h * 70;
        addBox(out, [x, pyMin + bh * 0.5, z], [bw, bh, bw], [0.16, 0.17, 0.24]);
        // lit crown / window glow on the city towers
        addBox(out, [x, pyMin + bh + 1, z], [bw * 0.7, 2, bw * 0.7], [0.85, 0.78, 0.55]);
      }

      // ---- A few tall slim distant comms / lighting towers on the city ring for
      // silhouette variety. ----
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.2832 + 1.1, h = hash(i * 23 + 7);
        const x = cx + Math.cos(a) * (cityRing - 40), z = cz + Math.sin(a) * (cityRing - 40);
        if (onTrack(x, z, 20)) continue;
        addCyl(out, [x, pyMin, z], 2.5, 70 + h * 50, [0.18, 0.19, 0.26], 6, null);
        addBox(out, [x, pyMin + 72 + h * 50, z], [4, 3, 4], [0.90, 0.40, 0.10], null);
      }

      // ---- Extra catch-fence ribbon along sweeping mid-lap corners for visual
      // density of trackside furniture (kept at safe clearance). ----
      fence(0.10, 0.16, 1, 7, 3.0, [0.70, 0.72, 0.76]);
      fence(0.66, 0.72, -1, 7, 3.0, [0.70, 0.72, 0.76]);

      // ================= DUNE SILHOUETTE RIDGES (outer desert, s 0.15–0.75) =================
      // Three ridge calls on the outer (L) side at 120–200 m, suggesting dune
      // crests beyond the circuit perimeter in tan/dark-sand tones.
      {
        const DUNE_RIDGE = [0.55, 0.44, 0.28];
        const rdPts = [[0.18, 120], [0.45, 160], [0.68, 200]];
        for (const [s, dist] of rdPts) {
          const a = anchor(K(s), -1, dist), b = [a.r, a.u, a.t];
          // ridge: wide flat-bottomed wedge approximated as a low frustum
          addFrustum(out, a.c, 90, 40, 10 + hash(K(s) * 7) * 6, DUNE_RIDGE, 6, b);
        }
      }

      // ================= SAND RUNOFF PATCHES (s 0.10–0.20 and s 0.60–0.70, outer) =================
      // Small low boxes on the outer side suggesting sand drifting onto the apron.
      {
        const SAND_RUNOFF = [0.70, 0.60, 0.42];
        for (const [s0, s1] of [[0.10, 0.20], [0.60, 0.70]]) {
          const steps = Math.round((s1 - s0) / (20 / (n * 1.0 / n)));
          const stepFrac = (s1 - s0) / Math.max(1, steps);
          let cnt = 0;
          for (let sf = s0; sf < s1; sf += 0.018) {
            const kk = K(sf);
            const a = anchor(kk, -1, 18 + hash(kk * 5) * 14), b = [a.r, a.u, a.t];
            addBox(out, a.c, [6, 0.2, 10], SAND_RUNOFF, b);
            cnt++;
            if (cnt > 7) break;
          }
        }
      }

      // ================= MID-CIRCUIT DESERT COMPOUND BUILDING (s 0.55) =================
      building(K(0.55), -1, 40, 14, 8, 20, { wall: [0.62, 0.58, 0.50], window: [0.30, 0.35, 0.40], floor: 2 });

      // ================= BRIGHT BEACON ON SAKHIR TOWER (s 0.005) =================
      // Add a warm light cone at the very peak of the Sakhir Tower.
      {
        const a = anchor(K(0.005), -1, 46), b = [a.r, a.u, a.t];
        addCone(out, vadd(a.c, a.u, 68), 1.5, 4, [1.0, 0.90, 0.60], 8, b);
      }
    },
  }
  );
})();
