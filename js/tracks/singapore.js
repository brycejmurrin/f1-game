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
    pal: { horizon: [0.18, 0.12, 0.06], zenith: [0.03, 0.04, 0.08], sunColor: [0.9, 0.80, 0.55], ambientSky: [0.30, 0.24, 0.16], ambientGround: [0.38, 0.28, 0.14], fogColor: [0.14, 0.10, 0.06], fogDensity: 0.0030 },
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
      const WIN_WARM = [0.95, 0.85, 0.7];
      const WIN_CYAN = [0.45, 0.75, 0.95];
      const NEON = [[0.95, 0.15, 0.7], [0.15, 0.85, 0.98], [1.0, 0.7, 0.15], [0.55, 0.3, 0.95]];

      // ===================================================================
      // CONTINUOUS CBD SKYLINE — a packed Marina Bay nightscape that wraps the
      // inland side of the WHOLE lap. Two layers: a far dark silhouette band so
      // no empty sky shows between towers, and a dense near band of lit-window
      // towers of varied height/width butted edge to edge. The "inland" side
      // alternates so the city reads as a continuous wall around the circuit.
      // ===================================================================
      // Far continuous silhouette band — dense, no gaps, fills sky behind towers.
      {
        const N = 96;
        for (let i = 0; i < N; i++) {
          const k = K(i / N);
          const side = (i % 2) ? 1 : -1;
          const w = 30 + hash(i * 5) * 38;
          const h = 50 + hash(i * 9) * 110;
          backdrop(k, side, 280 + hash(i * 13) * 220, [w, h, 28], [0.06, 0.07, 0.14]);
          if (i % 2) backdrop(k, -side, 300 + hash(i * 17) * 200, [w * 0.9, h * 0.8, 26], [0.05, 0.06, 0.12]);
        }
      }
      // Near continuous lit-window tower band — varied heights, butted together
      // so the camera never sees empty sky between towers. Cheap floor spacing
      // keeps the dense ring within the vertex budget.
      {
        const N = 70;
        for (let i = 0; i < N; i++) {
          const k = K(i / N);
          const side = (i % 2) ? 1 : -1;
          const dist = 130 + hash(i * 7) * 120;          // behind barriers
          const w = 18 + hash(i * 3) * 22;
          const h = 55 + hash(i * 11) * 130;             // tall, varied CBD
          const tint = hash(i * 19);
          building(k, side, dist, w, h, w, {
            wall: [0.09, 0.11, 0.18],
            window: tint < 0.2 ? WIN_WARM : (tint < 0.5 ? WIN_CYAN : WIN_BLUE),
            floor: 22,
          });
          // a shorter infill tower hard against it on the same side fills any gap
          const w2 = 14 + hash(i * 23) * 14;
          const h2 = 40 + hash(i * 29) * 70;
          building(k, side, dist + w * 0.6 + w2 * 0.6 + 6, w2, h2, w2, {
            wall: [0.08, 0.1, 0.16], window: WIN_BLUE, floor: 22,
          });
        }
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
        for (let i = 0; i < 12; i++) {
          const a = anchor(k, 1, 64 + i * 12);
          const h = 30 + (i % 4) * 12;
          const c = vadd(a.c, a.r, ((i % 6) - 3) * 7 + (i >= 6 ? 4 : 0));
          const z = vadd(c, a.t, (i >= 6 ? 20 : 0));
          addCyl(out, vadd(z, a.u, h / 2), 2.4, h, [0.16, 0.4, 0.22], 7, [a.r, a.u, a.t]); // trunk
          addCone(out, vadd(z, a.u, h + 4), 9 + (i % 2) * 3, 9, NEON[(i % 2) ? 0 : 3], 9, [a.r, a.u, a.t]); // glowing canopy
          addCone(out, vadd(z, a.u, h - 3), 6, 5, NEON[(i % 3)], 8, [a.r, a.u, a.t]); // mid glow band
        }
      }

      // ===================================================================
      // s 0.34 L mid — mid-rise hotels + bright billboards
      // ===================================================================
      {
        const k = K(0.34);
        for (let i = 0; i < 5; i++)
          building(k, -1, 56 + i * 26, 24, 40 + i * 12, 24, { wall: [0.12, 0.14, 0.2], window: i % 2 ? WIN_WARM : WIN_BLUE, floor: 12 });
        billboard(k, -1, 12, 20, 12, NEON[0]);
        billboard(K(0.355), -1, 11, 18, 11, NEON[1]);
        billboard(K(0.37), -1, 10, 16, 10, NEON[2]);
        billboard(K(0.38), -1, 10, 17, 11, NEON[3]);
      }

      // s 0.45 R far — distant skyline band over the bay (denser, lit-window reflections)
      for (let i = 0; i < 10; i++) {
        backdrop(K(0.45), 1, 190 + i * 22, [34, 50 + hash(i * 13) * 80, 30], [0.07, 0.09, 0.16]);
        if (i % 2) building(K(0.45), 1, 150 + i * 22, 18, 50 + hash(i * 7) * 60, 18, { wall: [0.08, 0.1, 0.17], window: WIN_CYAN, floor: 22 });
      }
      // bright reflection strip on the black bay water (s 0.45)
      for (let i = 0; i < 6; i++) {
        const a = anchor(K(0.45), 1, 50 + i * 14);
        addBox(out, vadd(a.c, a.u, 0.4), [10, 0.6, 5], NEON[i % 4], [a.r, a.u, a.t]);
      }

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
        billboard(K(0.92), 1, 11, 18, 11, NEON[3]);
        billboard(K(0.92), -1, 11, 18, 11, NEON[2]);
        billboard(K(0.94), 1, 10, 16, 10, NEON[1]);
        billboard(K(0.94), -1, 10, 16, 10, NEON[0]);
        billboard(K(0.96), 1, 10, 16, 10, NEON[0]);
        billboard(K(0.96), -1, 10, 17, 11, NEON[3]);
        billboard(K(0.98), 1, 10, 15, 10, NEON[2]);
        // pit straight low buildings L / stand R supported by CBD already above
        building(K(0.0), -1, 30, 30, 16, 20, { wall: [0.15, 0.16, 0.2], window: WIN_WARM });
        building(K(0.02), -1, 34, 26, 22, 20, { wall: [0.12, 0.14, 0.2], window: WIN_BLUE, floor: 12 });
      }

      // ===================================================================
      // Extra illuminated billboards punctuating the long straights, and lit
      // waterfront window-band detail to thicken the nightscape (~1.5x density).
      // ===================================================================
      for (const [s, side, hue] of [[0.04, 1, 1], [0.14, -1, 0], [0.5, -1, 2], [0.58, 1, 3], [0.72, 1, 1], [0.84, -1, 0]]) {
        billboard(K(s), side, 10, 16, 10, NEON[hue]);
      }
      // low warm waterfront promenade window strips (s 0.18-0.45, 0.80-0.86)
      for (const s of [0.2, 0.3, 0.42, 0.82, 0.88]) {
        const a = anchor(K(s), 1, 18);
        addBox(out, vadd(a.c, a.u, 2.4), [3, 1.4, 26], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 0.6), [3.2, 1.0, 26], NEON[1], [a.r, a.u, a.t]);
      }
    },
  }
  );
})();
