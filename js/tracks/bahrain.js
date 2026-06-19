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
    pal: { horizon: [0.20, 0.10, 0.05], zenith: [0.04, 0.04, 0.10], sunColor: [0.80, 0.62, 0.40], ambientSky: [0.26, 0.20, 0.14], ambientGround: [0.28, 0.18, 0.10], fogColor: [0.16, 0.10, 0.06], fogDensity: 0.0028, sunDir: [0.5, 0.14, 0.4], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    segs: [
      { t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
      { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 },
    ],
    // Gentle mid-lap dip — the real circuit drops ~15 m below its high point.
    elevations: [{ s: 0.45, halfM: 340, rise: -7 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd,
        place, prop, backdrop, anchor, addBox, addCyl, addFrustum,
        palm, bush, grandstand, building, tower, billboard, gantry, marshalPost,
        peak, mountain, fence, wall } = api;
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
        addBox(out, vadd(a.c, a.u, h), [4.2, 1.4, 1.6], FLOOD, b);   // lamp bank cap
      };

      // ---- Sculpted artificial dunes: low rounded tan wedges near the track. ----
      const duneWedge = (k, side, gap, w, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addFrustum(out, a.c, w * 0.6, w * 0.28, h, DUNE, 7, b);
      };

      // ================= START / FINISH =================
      // Pit/control building: long low white box (L, close)
      building(K(0.00), -1, 9, 14, 12, 70, { wall: [0.90, 0.90, 0.88], window: [0.30, 0.34, 0.40], floor: 4 });
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
      building(K(0.95), -1, 8, 12, 8, 50, { wall: [0.78, 0.78, 0.76], window: [0.26, 0.30, 0.36], floor: 4 });
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
    },
  }
  );
})();
