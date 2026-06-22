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
    pal: { horizon: [0.18, 0.12, 0.06], zenith: [0.03, 0.04, 0.08], sunColor: [0.9, 0.80, 0.55], ambientSky: [0.30, 0.24, 0.16], ambientGround: [0.38, 0.28, 0.14], fogColor: [0.14, 0.10, 0.06], fogDensity: 0.0021},
    segs: [
      { t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
      { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
      { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 },
    ],
    // Marina Bay: Anderson Bridge descent into the Padang section, then the climb
    // back up through the Singapore Sling complex — real change ~10 m.
    elevations: [{ s: 0.40, halfM: 360, rise: -7 }, { s: 0.65, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, n, hw, px, pz, place, backdrop, groundPlane, groundYAt, ferrisWheel,
              building, billboard, anchor, along, every, onTrack, addBox, addCyl, addCone,
              addPrism, addPyramid, addFrustum, grandstand, gantry, marshalPost, palm, bush,
              fence, guardrail, tyreWall, vadd, hash } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Neon palette (night street race) ----
      const WIN_BLUE = [0.6, 0.7, 0.95];
      const WIN_WARM = [0.95, 0.85, 0.7];
      const WIN_CYAN = [0.45, 0.75, 0.95];
      const NEON = [[1.0, 0.2, 0.85], [0.15, 0.85, 0.98], [1.0, 0.7, 0.15], [0.55, 0.3, 0.95]];
      const CONC = [0.30, 0.31, 0.36];   // night concrete barrier grey

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
      // keeps the dense ring within the vertex budget. Enhanced night palette.
      {
        const N = 70;
        for (let i = 0; i < N; i++) {
          const k = K(i / N);
          const side = (i % 2) ? 1 : -1;
          const dist = 130 + hash(i * 7) * 120;          // behind barriers
          const w = 18 + hash(i * 3) * 22;
          const h = 55 + hash(i * 11) * 130;             // tall, varied CBD
          const tint = hash(i * 19);
          const mainWin = tint < 0.15 ? [1.0, 0.82, 0.62] :
                          tint < 0.35 ? [0.55, 0.8, 1.0] :
                          tint < 0.65 ? [0.62, 0.75, 0.98] : WIN_BLUE;
          building(k, side, dist - w / 2, w, h, w, {
            wall: [0.08, 0.10, 0.16],
            window: mainWin,
            floor: 20,
          });
          // a shorter infill tower hard against it on the same side fills any gap
          const w2 = 14 + hash(i * 23) * 14;
          const h2 = 40 + hash(i * 29) * 70;
          const infillWin = hash(i * 37) < 0.5 ? WIN_CYAN : WIN_BLUE;
          building(k, side, dist + w * 0.6 + w2 * 0.6 + 6 - w2 / 2, w2, h2, w2, {
            wall: [0.07, 0.09, 0.15], window: infillWin, floor: 20,
          });
        }
      }

      // ===================================================================
      // s 0.18 R far — MARINA BAY SANDS: 3 tall towers + roof skypark slab + detail
      // ===================================================================
      {
        const k = K(0.18);
        const a = anchor(k, 1, 150);
        const wall = [0.88, 0.88, 0.92], win = [0.65, 0.75, 0.98];
        const H = 215, gap = 34;
        const tops = [];
        for (let t = -1; t <= 1; t++) {
          // lean the slabs slightly towards the centre by offsetting along right
          const c = vadd(a.c, a.r, t * gap);
          addBox(out, vadd(c, a.u, H / 2), [16, H, 26], wall, [a.r, a.u, a.t]);
          // lit window face with strong cyan glow
          addBox(out, vadd(c, a.u, H * 0.55), [16.4, H * 0.7, 26.4], win, [a.r, a.u, a.t]);
          // vertical lit bands on each tower for night detail
          addBox(out, vadd(c, a.u, H * 0.3), [1.6, H * 0.5, 26.8], [0.35, 0.6, 1.0], [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, H * 0.7), [1.6, H * 0.4, 26.8], [0.4, 0.55, 0.95], [a.r, a.u, a.t]);
          tops.push(vadd(c, a.u, H));
        }
        // skypark slab bridging the three tops — the boat-shaped roof
        const mid = tops[1];
        addBox(out, vadd(mid, a.u, 4), [gap * 2 + 18, 13, 30], [0.80, 0.81, 0.88], [a.r, a.u, a.t]);
        // bright neon rim of skypark, the iconic glow
        addBox(out, vadd(mid, a.u, 17), [gap * 2 + 18, 1.5, 30], NEON[1], [a.r, a.u, a.t]);
        // additional skypark detail — central atrium lights
        addBox(out, vadd(mid, a.u, 10.5), [8, 2.5, 12], [0.9, 0.75, 0.2], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.22 R mid — ARTSCIENCE MUSEUM: white lotus petals (5 shells)
      // ===================================================================
      {
        const k = K(0.22);
        const a = anchor(k, 1, 85);
        const petal_h = 22, base_r = 18;
        // 5 lotus petals (shells) radiating from center
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + 0.3;
          const dx = Math.cos(ang) * base_r * 0.65;
          const dz = Math.sin(ang) * base_r * 0.65;
          const petal_c = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                           a.c[1],
                           a.c[2] + a.r[2] * dx + a.t[2] * dz];
          addCone(out, vadd(petal_c, a.u, petal_h / 2), 7, petal_h, [0.92, 0.93, 0.96], 9, [a.r, a.u, a.t]);
          // inner lit shell face (warm glow)
          addCone(out, vadd(petal_c, a.u, petal_h * 0.55), 5.2, petal_h * 0.65, [1.0, 0.90, 0.75], 8, [a.r, a.u, a.t]);
        }
        // central stem/podium
        addCyl(out, vadd(a.c, a.u, 4), 4.5, 8, [0.80, 0.80, 0.84], 7, [a.r, a.u, a.t]);
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
          addCone(out, vadd(z, a.u, h + 4), 13.5 + (i % 2) * 4.5, 9, NEON[(i % 2) ? 0 : 3], 9, [a.r, a.u, a.t]); // glowing canopy
          addCone(out, vadd(z, a.u, h - 3), 9, 5, NEON[(i % 3)], 8, [a.r, a.u, a.t]); // mid glow band
          addCone(out, vadd(z, a.u, h + 11), 6, 5, NEON[(i + 1) % 4], 7, [a.r, a.u, a.t]); // upper branch cone
        }
      }

      // ===================================================================
      // s 0.34 L mid — mid-rise hotels + bright billboards
      // ===================================================================
      {
        const k = K(0.34);
        for (let i = 0; i < 5; i++)
          building(k, -1, 44 + i * 26, 24, 40 + i * 12, 24, { wall: [0.12, 0.14, 0.2], window: i % 2 ? WIN_WARM : WIN_BLUE, floor: 12 });
        billboard(k, -1, 12, 20, 12, NEON[0]);
        billboard(K(0.355), -1, 11, 18, 11, NEON[1]);
        billboard(K(0.37), -1, 10, 16, 10, NEON[2]);
        billboard(K(0.38), -1, 10, 17, 11, NEON[3]);
      }

      // s 0.45 R far — distant skyline band over the bay (denser, lit-window reflections)
      for (let i = 0; i < 10; i++) {
        backdrop(K(0.45), 1, 190 + i * 22, [34, 50 + hash(i * 13) * 80, 30], [0.07, 0.09, 0.16]);
        if (i % 2) building(K(0.45), 1, 141 + i * 22, 18, 50 + hash(i * 7) * 60, 18, { wall: [0.08, 0.1, 0.17], window: WIN_CYAN, floor: 22 });
      }
      // bright reflection strip on the black bay water (s 0.45)
      for (let i = 0; i < 12; i++) {
        const a = anchor(K(0.45), 1, 50 + i * 14);
        addBox(out, vadd(a.c, a.u, 0.4), [10, 0.6, 5], NEON[i % 4], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.55 L near — FULLERTON HOTEL: wide low warm-uplit classical block
      // ===================================================================
      {
        const k = K(0.55);
        place(k, -1, 38, [48, 22, 30], [1.0, 0.85, 0.55]);
        place(k, -1, 39, [50, 6, 32], [1.0, 0.78, 0.45]); // warm uplit base band
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
      // Esplanade ribs — 8 thin vertical prisms around the base perimeter
      {
        const k = K(0.66);
        for (let i = 0; i < 2; i++) {
          const a = anchor(k, -1, 40 + i * 24);
          for (let r = 0; r < 8; r++) {
            const ang = (r / 8) * Math.PI * 2;
            const dx = Math.cos(ang) * 14;
            const dz = Math.sin(ang) * 14;
            const rc = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                        a.c[1],
                        a.c[2] + a.r[2] * dx + a.t[2] * dz];
            addBox(out, vadd(rc, a.u, 7), [0.8, 14, 0.8], [0.55, 0.5, 0.42], [a.r, a.u, a.t]);
          }
        }
      }

      // s 0.70 L mid — The Padang: dark flat open field box
      place(K(0.70), -1, 46, [70, 1.5, 70], [0.04, 0.08, 0.05]);

      // ===================================================================
      // s 0.80 R mid — HELIX BRIDGE: white spiraling lattice tube arc + detail
      // ===================================================================
      {
        const k = K(0.80);
        const a = anchor(k, 1, 30);
        // main arch spine (16 segments for smoother curve)
        for (let j = 0; j < 16; j++) {
          const t = j / 15;
          const ang = t * Math.PI;
          const up = Math.sin(ang) * 12;
          const c = vadd(vadd(a.c, a.t, (t - 0.5) * 62), a.u, up + 2);
          // main tube
          addCyl(out, c, 2.2, 4.2, [0.90, 0.92, 0.96], 6, [a.r, a.u, a.t]);
          // lattice detail on tube sides
          addBox(out, vadd(c, a.r, Math.sin(t * 11) * 5.5), [0.8, 1.2, 1.4], [0.88, 0.90, 0.94], [a.r, a.u, a.t]);
          // crossbar structure
          if (j % 2 === 0) {
            addBox(out, vadd(c, a.t, Math.cos(t * 7) * 3), [0.6, 1.0, 4.8], [0.85, 0.87, 0.92], [a.r, a.u, a.t]);
          }
          // night accent lights on the structure
          if (j % 3 === 0) {
            addBox(out, vadd(vadd(c, a.r, 3), a.u, 1), [0.4, 0.4, 0.4], NEON[1], [a.r, a.u, a.t]);
            addBox(out, vadd(vadd(c, a.r, -3), a.u, 1), [0.4, 0.4, 0.4], NEON[1], [a.r, a.u, a.t]);
          }
        }
      }

      // ===================================================================
      // s 0.86 R near — SINGAPORE FLYER (ferris wheel), cyan-lit rim + spokes
      // ===================================================================
      {
        const k = K(0.86);
        const a = anchor(k, 1, 40);
        const r = 30, h = 80;
        // central hub + main axle
        addCyl(out, vadd(a.c, a.u, h), 2.2, 2, [0.35, 0.35, 0.38], 8, [a.r, a.u, a.t]);
        // 8 major spokes radiating from hub
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const dx = Math.cos(ang) * r;
          const dz = Math.sin(ang) * r;
          const rim_c = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1] + a.u[1] * h,
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
          addCyl(out, vadd(rim_c, a.u, -h / 2), 0.4, h, [0.55, 0.55, 0.6], 5, [a.r, a.u, a.t]); // spoke
          // cabin pods along rim
          addBox(out, rim_c, [3.2, 3.8, 3.2], [0.25, 0.6, 0.95], [a.r, a.u, a.t]);
        }
        // rim cylinder (the famous lit necklace of the Flyer)
        const seg = 32;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
          const p0 = [a.c[0] + a.r[0] * Math.cos(a0) * r + a.t[0] * Math.sin(a0) * r,
                      a.c[1] + a.u[1] * h,
                      a.c[2] + a.r[2] * Math.cos(a0) * r + a.t[2] * Math.sin(a0) * r];
          const p1 = [a.c[0] + a.r[0] * Math.cos(a1) * r + a.t[0] * Math.sin(a1) * r,
                      a.c[1] + a.u[1] * h,
                      a.c[2] + a.r[2] * Math.cos(a1) * r + a.t[2] * Math.sin(a1) * r];
          addBox(out, [(p0[0] + p1[0]) / 2, h + a.c[1], (p0[2] + p1[2]) / 2], [1, 0.8, (r * 2 * Math.PI / seg)], NEON[1], [a.r, a.u, a.t]);
        }
      }

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
        building(K(0.0), -1, 15, 30, 16, 20, { wall: [0.15, 0.16, 0.2], window: WIN_WARM });
        building(K(0.02), -1, 21, 26, 22, 20, { wall: [0.12, 0.14, 0.2], window: WIN_BLUE, floor: 12 });
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

      // ===================================================================
      // BAY WATER — dark mirror groundPlanes along the open harbour stretches,
      // with bright coloured reflection streaks of the skyline lights + detail.
      // ===================================================================
      const BAY = [0.04, 0.06, 0.12];  // darker water for night
      for (const s of [0.2, 0.3, 0.4, 0.45, 0.82, 0.86]) {
        groundPlane(K(s), 1, 36, [70, 60], BAY);
      }
      // dense reflection strips — the famous Marina Bay light trails
      for (const s of [0.20, 0.24, 0.28, 0.32, 0.38, 0.42, 0.46, 0.80, 0.84, 0.88]) {
        const a = anchor(K(s), 1, 42);
        for (let i = 0; i < 12; i++) {
          const c = vadd(vadd(a.c, a.t, (i - 3) * 10), a.u, 0.38);
          const hue = (i + Math.round(s * 17)) % 4;
          const intensity = 0.3 + Math.sin(i * 0.8) * 0.2;
          const col = [NEON[hue][0] * intensity, NEON[hue][1] * intensity, NEON[hue][2] * intensity];
          addBox(out, c, [6.5, 0.4, 2.8], col, [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // CATCH FENCES along the concrete barriers (the signature street-circuit
      // look) on both sides, broken into spans so the lap reads as fully fenced.
      // Posts + pale mesh sit just behind the auto barrier (gap ~1.4 m).
      // ===================================================================
      for (const [s0, s1, side] of [
        [0.00, 0.18, -1], [0.20, 0.40, -1], [0.42, 0.62, -1], [0.64, 0.85, -1], [0.87, 0.99, -1],
        [0.00, 0.16, 1], [0.30, 0.44, 1], [0.55, 0.66, 1], [0.92, 0.99, 1],
      ]) {
        fence(s0, s1, side, 1.4, 3.4, [0.66, 0.70, 0.78]);
      }

      // ===================================================================
      // FLOODLIGHT MASTS — dense banks of tall lighting rigs ringing the lap
      // (the defining Marina Bay night look). Hero masts with multi-lamp heads,
      // staggered every ~110 m for dense, dramatic stadium-style lighting.
      // ===================================================================
      every(90, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 3 + side) < 0.32) return;   // skip some for variation
          const a = anchor(k, side, 12 + hash(k + side) * 5);
          const H = 18 + hash(k * 7 + side) * 7;
          addCyl(out, vadd(a.c, a.u, H / 2), 0.48, H, [0.10, 0.10, 0.13], 6, [a.r, a.u, a.t]); // mast
          // angled head bar with array of powerful lamps
          const head = vadd(a.c, a.u, H);
          addBox(out, head, [6.2, 0.85, 1.8], [0.12, 0.12, 0.15], [a.r, a.u, a.t]);
          // 5 bright floodlamps along the bar
          for (let j = -2; j <= 2; j++) {
            const lampC = vadd(head, a.r, j * 1.2);
            addBox(out, lampC, [1.35, 1.35, 0.8], [1.0, 0.97, 0.80], [a.r, a.u, a.t]);
            // extra glow ring around each lamp for night effect
            if (j % 2 === 0) {
              addBox(out, vadd(lampC, a.u, 0.7), [1.8, 0.2, 1.1], [0.95, 0.92, 0.75], [a.r, a.u, a.t]);
            }
          }
          // base support strut
          addBox(out, vadd(a.c, a.u, 1.5), [3.6, 1.2, 2], [0.15, 0.15, 0.18], [a.r, a.u, a.t]);
        }
      });

      // ===================================================================
      // MAIN STRAIGHT — pit building (L) + Float@Marina Bay grandstands with
      // crowds (R), start gantry, marshal posts. Night detail.
      // ===================================================================
      // Pit building — long low garage block on the left of the start straight.
      {
        for (let i = 0; i < 5; i++) {
          const k = K(0.965 + i * 0.012);
          building(k, -1, 9, 16, 9, 12, { wall: [0.16, 0.17, 0.22], window: WIN_WARM, floor: 4 });
        }
        // pit wall (low) and a tall lit timing tower — the control center
        const a = anchor(K(0.99), -1, 26);
        addBox(out, vadd(a.c, a.u, 16), [10, 32, 10], [0.13, 0.14, 0.18], [a.r, a.u, a.t]);
        // bright cyan-lit tower cap visible from all viewing angles
        addBox(out, vadd(a.c, a.u, 22), [10.4, 12, 10.4], WIN_CYAN, [a.r, a.u, a.t]);
        // vertical accent lights on tower
        addBox(out, vadd(a.c, a.u, 18), [1.2, 8, 10.8], [0.35, 0.65, 1.0], [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 26), [1.2, 6, 10.8], [0.4, 0.6, 0.95], [a.r, a.u, a.t]);
      }
      // Float@Marina Bay grandstands on the right of the main straight — the
      // famous floating platform stands packed with crowd.
      grandstand(0.99, 1, 8, 60, [0.20, 0.22, 0.28], [0.45, 0.32, 0.42]);
      grandstand(0.02, 1, 8, 60, [0.20, 0.22, 0.28], [0.42, 0.30, 0.40]);
      grandstand(0.05, 1, 8, 48, [0.22, 0.24, 0.30], [0.48, 0.34, 0.44]);
      // a couple more stands at the lap's end section (under-grandstand straight)
      grandstand(0.93, 1, 8, 50, [0.20, 0.22, 0.28], [0.44, 0.31, 0.41]);
      grandstand(0.70, -1, 30, 46, [0.20, 0.22, 0.28], [0.40, 0.30, 0.40]); // Padang stand
      // Start/finish gantry over the line + a second scoring gantry.
      gantry(0.0, 7.5, [0.12, 0.12, 0.16]);
      gantry(0.5, 7.0, [0.12, 0.12, 0.16]);
      // lit start-light box on the gantry
      {
        const a = anchor(K(0.0), 0, 0);
        addBox(out, [px[K(0.0)], a.c[1] + 7.6, pz[K(0.0)]], [4, 1.2, 0.8], [0.9, 0.05, 0.05], null);
      }

      // ===================================================================
      // MARSHAL POSTS — orange-roofed bunkers at corner approaches.
      // ===================================================================
      for (const s of [0.07, 0.16, 0.28, 0.36, 0.47, 0.6, 0.68, 0.76, 0.84, 0.94]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 7);
      }

      // ===================================================================
      // PALMS & LANDSCAPING — tropical roadside palms along the promenade and
      // boulevard sections; low planter boxes for the harbourfront.
      // ===================================================================
      every(46, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 5 + side) < 0.5) return;
          palm(k, side, 9 + hash(k + side) * 6, 8 + hash(k * 2 + side) * 5, [0.18, 0.40, 0.20]);
        }
      });
      every(60, (k) => {
        if (hash(k * 9) < 0.6) return;
        bush(k, hash(k) < 0.5 ? -1 : 1, 8 + hash(k) * 5, [0.14, 0.34, 0.18]);
      });

      // ===================================================================
      // TYRE WALLS at the tight 90-degree apex/exit kerbs (street-circuit
      // staple) — bright conveyor caps for visibility.
      // ===================================================================
      for (const [s0, s1, side] of [
        [0.085, 0.10, 1], [0.235, 0.25, -1], [0.475, 0.49, -1], [0.66, 0.675, 1], [0.82, 0.835, -1],
      ]) {
        tyreWall(s0, s1, side, 1.6, NEON[K(s0) % 4]);
      }

      // ===================================================================
      // EXTRA LIT BILLBOARDS & NEON SIGNAGE around the lap — punctuate every
      // straight with shifting neon hoardings (set back, never on tarmac).
      // ===================================================================
      for (const [s, side, hue] of [
        [0.03, -1, 0], [0.08, 1, 2], [0.24, -1, 3], [0.31, 1, 1], [0.39, -1, 0],
        [0.47, 1, 2], [0.53, -1, 1], [0.61, 1, 3], [0.69, -1, 0], [0.77, 1, 2],
        [0.85, -1, 3], [0.90, 1, 1], [0.97, -1, 0],
      ]) {
        billboard(K(s), side, 12, 14 + hash(K(s)) * 6, 9, NEON[hue]);
      }

      // ===================================================================
      // ANDERSON BRIDGE — pale arched truss flanking the road over the river
      // (improved with prism arch ribs).
      // ===================================================================
      {
        const k = K(0.62);
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 3);
          for (let j = 0; j < 5; j++) {
            const c = vadd(a.c, a.t, (j - 2) * 9);
            // arch rib: a low prism ridge
            addPrism(out, vadd(c, a.u, 6), [2, 4, 8], [0.86, 0.86, 0.9], [a.r, a.u, a.t]);
            addCyl(out, vadd(c, a.u, 3), 0.5, 6, [0.80, 0.80, 0.84], 5, [a.r, a.u, a.t]);
          }
        }
      }

      // ===================================================================
      // CBD HERO TOWERS — a few extra-tall tapered skyscrapers behind the near
      // band for skyline depth (frustum spires + lit caps).
      // ===================================================================
      for (const [s, side] of [[0.12, -1], [0.5, -1], [0.58, 1], [0.74, -1], [0.06, 1]]) {
        const a = anchor(K(s), side, 200 + hash(K(s)) * 80);
        const H = 150 + hash(K(s) * 3) * 90;
        addFrustum(out, vadd(a.c, a.u, H / 2), 16, 8, H, [0.09, 0.10, 0.17], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, H * 0.55), [22, H * 0.6, 6], hash(K(s)) < 0.5 ? WIN_CYAN : WIN_BLUE, [a.r, a.u, a.t]);
        addCone(out, vadd(a.c, a.u, H + 6), 3, 12, NEON[1], 6, [a.r, a.u, a.t]); // lit antenna
      }
    },
  }
  );
})();
