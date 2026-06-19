/* Apex 26 — SINGAPORE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    pal: { horizon: [0.08, 0.05, 0.14] },
    segs: [
      { t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
      { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
      { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 },
    ],
    scenery: function (api) {
      const { out, n, place, backdrop, ferrisWheel, building, billboard, anchor, addBox, addCyl, addCone, vadd, hash } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Neon palette (night street race) ----
      const WIN_BLUE = [0.6, 0.7, 0.95];
      const NEON = [[0.95, 0.15, 0.7], [0.15, 0.85, 0.98], [1.0, 0.7, 0.15], [0.55, 0.3, 0.95]];

      // ===================================================================
      // Dense CBD skyline — layered bands of lit tower boxes pushed far back
      // so they never wall in the camera. Both sides, several depths.
      // ===================================================================
      for (let i = 0; i < 9; i++) {
        const s = i / 9;
        const k = K(s);
        const side = (i % 2) ? 1 : -1;
        const dist = 150 + hash(i * 7) * 130;          // far behind barriers
        const w = 20 + hash(i * 3) * 20;
        const h = 60 + hash(i * 11) * 120;             // tall CBD
        building(k, side, dist, w, h, w, {
          wall: [0.1, 0.12, 0.18],
          window: WIN_BLUE,
          floor: 24,
        });
      }
      // a back horizon band of dark silhouette blocks (fewer, larger)
      for (let i = 0; i < 14; i++) {
        const k = K(i / 14);
        const side = (i % 2) ? 1 : -1;
        backdrop(k, side, 300 + hash(i) * 200, [30 + hash(i * 5) * 34, 40 + hash(i * 9) * 90, 30], [0.06, 0.07, 0.13]);
      }

      // ===================================================================
      // s 0.18 R far — MARINA BAY SANDS: 3 tall towers + roof skypark slab
      // ===================================================================
      {
        const k = K(0.18);
        const a = anchor(k, 1, 150);
        const wall = [0.9, 0.9, 0.94], win = [0.7, 0.78, 0.95];
        const H = 165, gap = 34;
        const tops = [];
        for (let t = -1; t <= 1; t++) {
          // lean the slabs slightly toward the centre by offsetting along right
          const c = vadd(a.c, a.r, t * gap);
          addBox(out, vadd(c, a.u, H / 2), [16, H, 26], wall, [a.r, a.u, a.t]);
          // lit window face
          addBox(out, vadd(c, a.u, H * 0.55), [16.4, H * 0.7, 26.4], win, [a.r, a.u, a.t]);
          tops.push(vadd(c, a.u, H));
        }
        // skypark slab bridging the three tops
        const mid = tops[1];
        addBox(out, vadd(mid, a.u, 4), [gap * 2 + 18, 6, 30], [0.85, 0.86, 0.9], [a.r, a.u, a.t]);
        addBox(out, vadd(mid, a.u, 8.5), [gap * 2 + 18, 1.5, 30], NEON[1], [a.r, a.u, a.t]); // glowing edge
      }

      // ===================================================================
      // s 0.26 R far — GARDENS BY THE BAY SUPERTREES: tapered cyl + glow cap
      // ===================================================================
      {
        const k = K(0.26);
        for (let i = 0; i < 7; i++) {
          const a = anchor(k, 1, 70 + i * 16);
          const h = 34 + (i % 3) * 12;
          const c = vadd(a.c, a.r, (i - 3) * 6);
          addCyl(out, vadd(c, a.u, h / 2), 2.4, h, [0.16, 0.4, 0.22], 7, [a.r, a.u, a.t]); // trunk
          addCone(out, vadd(c, a.u, h + 4), 9 + (i % 2) * 3, 9, NEON[(i % 2) ? 0 : 3], 9, [a.r, a.u, a.t]); // glowing canopy
        }
      }

      // ===================================================================
      // s 0.34 L mid — mid-rise hotels + bright billboards
      // ===================================================================
      {
        const k = K(0.34);
        for (let i = 0; i < 3; i++)
          building(k, -1, 60 + i * 30, 24, 40 + i * 12, 24, { wall: [0.12, 0.14, 0.2], window: WIN_BLUE, floor: 12 });
        billboard(k, -1, 6, 20, 12, NEON[0]);
        billboard(K(0.36), -1, 6, 18, 11, NEON[1]);
      }

      // s 0.45 R far — distant skyline band over the bay (fewer, wider blocks)
      for (let i = 0; i < 6; i++)
        backdrop(K(0.45), 1, 200 + i * 30, [34, 50 + hash(i * 13) * 70, 34], [0.07, 0.09, 0.16]);

      // ===================================================================
      // s 0.55 L near — FULLERTON HOTEL: wide low warm-uplit classical block
      // ===================================================================
      {
        const k = K(0.55);
        place(k, -1, 26, [48, 22, 30], [1.0, 0.85, 0.55]);
        place(k, -1, 26, [50, 6, 32], [1.0, 0.78, 0.45]); // warm uplit base band
      }

      // ===================================================================
      // s 0.62 both near — ANDERSON BRIDGE: pale arched truss boxes
      // ===================================================================
      {
        const k = K(0.62);
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 4);
          for (let j = 0; j < 3; j++) {
            const c = vadd(a.c, a.t, (j - 1) * 12);
            addCyl(out, vadd(c, a.u, 7), 1.2, 10, [0.88, 0.88, 0.9], 6, [a.r, a.u, a.t]);
          }
        }
      }

      // ===================================================================
      // s 0.66 L mid — ESPLANADE: two spiky low-poly dome boxes
      // ===================================================================
      {
        const k = K(0.66);
        for (let i = 0; i < 2; i++) {
          const a = anchor(k, -1, 40 + i * 24);
          addCone(out, vadd(a.c, a.u, 10), 16, 14, [0.55, 0.5, 0.42], 7, [a.r, a.u, a.t]);
          // spiky cap
          addCone(out, vadd(a.c, a.u, 20), 8, 8, NEON[2], 6, [a.r, a.u, a.t]);
        }
      }

      // s 0.70 L mid — The Padang: dark flat open field box
      place(K(0.70), -1, 30, [70, 1.5, 70], [0.04, 0.08, 0.05]);

      // ===================================================================
      // s 0.80 R mid — HELIX BRIDGE: white spiraling lattice tube arc
      // ===================================================================
      {
        const k = K(0.80);
        const a = anchor(k, 1, 30);
        for (let j = 0; j < 14; j++) {
          const t = j / 13;
          const ang = t * Math.PI;
          const up = Math.sin(ang) * 12;
          const c = vadd(vadd(a.c, a.t, (t - 0.5) * 60), a.u, up + 2);
          addCyl(out, c, 2.2, 4, [0.92, 0.94, 0.98], 6, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.r, Math.sin(t * 9) * 5), [1, 1, 1.2], NEON[1], [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.86 R near — SINGAPORE FLYER (ferris wheel), cyan-lit rim
      // ===================================================================
      ferrisWheel(K(0.86), 1, 40, 30);

      // ===================================================================
      // s 0.92 both — illuminated billboards funnel back to start
      // ===================================================================
      {
        billboard(K(0.92), 1, 6, 18, 11, NEON[3]);
        billboard(K(0.92), -1, 6, 18, 11, NEON[2]);
        billboard(K(0.96), 1, 6, 16, 10, NEON[0]);
        // pit straight low buildings L / stand R supported by CBD already above
        building(K(0.0), -1, 30, 30, 16, 20, { wall: [0.15, 0.16, 0.2], window: WIN_BLUE });
      }
    },
  }
  );
})();
