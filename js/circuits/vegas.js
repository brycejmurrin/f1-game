/* Apex 26 — LAS VEGAS circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "vegas",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline, 1 node before vertex 0 (timing line).
    // Was 0.8575, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.9899,
    sceneryStartFrac: 0.8575,
    name: "LAS VEGAS",
    gp: "Las Vegas GP",
    country: "USA",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    baseHW: 7,
    street: true,
    sceneryCoordinates: "racing",
    terrainOuter: 26,
    barrierGap: 1.0,
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.36, s1: 0.47 },
      { kind: "lamps", s0: 0.27, s1: 0.36, side: -1 },
      { kind: "lamps", s0: 0.65, s1: 0.71, side: 1 },
    ],
    pal: { horizon: [0.28, 0.12, 0.32], zenith: [0.08, 0.04, 0.14], sunColor: [0.65, 0.50, 0.88], ambientSky: [0.42, 0.28, 0.50], ambientGround: [0.50, 0.25, 0.38], fogColor: [0.22, 0.10, 0.26], fogDensity: 0.0030, sunDir: [0.75, 0.20, 0.12] },
    segs: [
      { t: 0, l: 140 }, { t: -90, l: 70 }, { t: 60, l: 60 }, { t: -60, l: 60 }, { t: 0, l: 120 }, { t: 60, l: 60 },
      { t: -70, l: 60 }, { t: 55, l: 60 }, { t: 0, l: 360 }, { t: -90, l: 80 }, { t: 50, l: 70 }, { t: 0, l: 900, t2: 0 },
      { t: 20, l: 200 }, { t: -90, l: 90 }, { t: 60, l: 60 }, { t: -70, l: 70 }, { t: -65, l: 120 },
    ],
    elevations: [{ s: 0.2075, halfM: 130, rise: -1.2 }],
    hwZones: [
      { s0: 0.2164, s1: 0.2374, hw: 6.2, ease: 0.012 },  // arc 0.400-0.432 T7
      { s0: 0.3139, s1: 0.4596, hw: 6.1, ease: 0.012 },  // arc 0.478-0.532 T9-T10
      { s0: 0.5623, s1: 0.6186, hw: 6.3, ease: 0.012 },  // arc 0.665-0.695 T13
      { s0: 0.8221, s1: 0.8832, hw: 6.3, ease: 0.012 },  // arc 0.985-0.012 T17
    ],
    // Public roads, so crown rather than banking: 2.5-3° on the sweeps only.
    bankZones: [
      { frac: 0.2080, angleDeg: 3.0, widthM: 190 },
      { frac: 0.2664, angleDeg: 3.0, widthM: 180 },
      { frac: 0.4893, angleDeg: 3.0, widthM: 220 },
      { frac: 0.5949, angleDeg: 2.5, widthM: 130 },
      { frac: 0.6481, angleDeg: 2.5, widthM: 130 },
    ],
    scenery: function (api) {
      const { out, MAT, seat, track, upOf, n, px, py, pz, hw, pyMin, place, prop, backdrop, addBox, addCyl,
        addFrustum, addPyramid, groundPlane, anchor, vadd, onTrack, building, tower, billboard,
        grandstand, grandstandEx, marshalPost, gantry, palm, fence, wall, guardrail, tyreWall, hash, addCone, addPrism,
        cityFront, modelGroup, overheadSpan, waterSurface, circuitKit, broadcastCompound, cameraTower,
        bakedModel } = api;
      const K = (s) => Math.round(s * n) % n;

      const ferrisWheel = (k, side, dist, radius) => {
        const a = anchor(k, side, dist);
        const hub = vadd(a.c, a.u, radius + 5);
        modelGroup("vegas-high-roller", {
          center: hub,
          size: [10, radius * 2 + 14, radius * 2 + 14],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
          const rim = [];
          const seg = 16;
          stage._mat = MAT.METAL;
          for (const along of [-4, 4]) {
            const foot = vadd(a.c, a.t, along);
            addBox(stage, vadd(foot, a.u, (radius + 5) / 2),
              [1.4, radius + 5, 1.4], [0.22, 0.22, 0.25], [a.r, a.u, a.t]);
          }
          const strut = (p0, p1, thick, col) => {
            const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const len = Math.hypot(d[0], d[1], d[2]) || 1;
            const axis = [d[0] / len, d[1] / len, d[2] / len];
            const face = [
              a.r[1] * axis[2] - a.r[2] * axis[1],
              a.r[2] * axis[0] - a.r[0] * axis[2],
              a.r[0] * axis[1] - a.r[1] * axis[0],
            ];
            addBox(stage,
              [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
              [thick, len, thick], col, [a.r, axis, face]);
          };
          for (let i = 0; i < seg; i++) {
            const ang = i / seg * 6.2832;
            rim.push(vadd(vadd(hub, a.t, Math.cos(ang) * radius), a.u, Math.sin(ang) * radius));
          }
          const HUB_R = 2.0;
          for (let i = 0; i < seg; i++) {
            const d = [rim[i][0] - hub[0], rim[i][1] - hub[1], rim[i][2] - hub[2]];
            const L = Math.hypot(d[0], d[1], d[2]) || 1;
            const root = [hub[0] + d[0] / L * HUB_R, hub[1] + d[1] / L * HUB_R,
                          hub[2] + d[2] / L * HUB_R];
            strut(root, rim[i], 0.28, [0.34, 0.36, 0.42]);
            strut(rim[i], rim[(i + 1) % seg], 0.38, [0.82, 0.90, 1.00]);
            const cabCol = [CYAN, MAGENTA, GOLD, LIME][i % 4];
            addBox(stage, vadd(rim[i], a.u, -1.2), [2.4, 2.2, 2.4], cabCol, [a.r, a.u, a.t]);
          }
          addBox(stage, hub, [3.5, 3.5, 3.5], [0.72, 0.78, 0.88], [a.r, a.u, a.t]);
        }, { required: true });
      };

      // Neon night palette — hyper-saturated Vegas colours
      const WARM = [1.0, 0.85, 0.45];     // casino gold glow / tungsten uplighting
      const GOLD = [1.0, 0.70, 0.20];     // hotter gold spotlights
      const MAGENTA = [1.0, 0.10, 0.70]; // hot neon magenta
      const CYAN = [0.20, 0.90, 1.00];    // bright neon cyan / aqua
      const VIOLET = [0.75, 0.20, 1.00];  // vivid neon purple / indigo
      const LIME = [0.60, 1.00, 0.35];    // neon lime green
      const ROSE = [1.00, 0.25, 0.55];    // hot rose / pink
      const BLUE = [0.25, 0.55, 1.00];    // neon blue
      const RED = [1.00, 0.15, 0.25];     // neon red
      const LED = [0.98, 0.98, 1.0];      // bright white LED facade / pixel lights
      const DARKROCK = [0.16, 0.06, 0.05];
      const NEON = [MAGENTA, CYAN, VIOLET, LIME, WARM, GOLD, ROSE, BLUE, RED];  // expanded palette

      const LOT_ASPHALT = [0.10, 0.10, 0.12];
      const LOT_STRIPE = [0.86, 0.82, 0.44];
      const TUBE = [0.62, 0.63, 0.66], PLANK = [0.74, 0.75, 0.78];
      const LOT_FANS = [
        [0.11, 0.12, 0.16], [0.16, 0.16, 0.21], [0.13, 0.14, 0.18], [0.20, 0.19, 0.24],
        [0.11, 0.12, 0.16], [2.4, 2.2, 1.9], [0.34, 0.20, 0.30], [0.18, 0.22, 0.32],
      ];
      const lotBleacher = (id, s, side, gap, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 7, pitch = 6.8, len = bays * pitch;
        const ribbon = opts.ribbon || NEON[Math.round(s * 31) % NEON.length];
        const k = K(s), a = anchor(k, side, gap + 8), b = [a.r, a.u, a.t];
        const IN = -side;                       // +1 along a.r faces the track
        const topH = 2.2 + rows * 1.38;
        modelGroup(id, {
          center: vadd(a.c, a.u, (topH + 2.5) / 2),
          size: [17, topH + 2.5, len + 4], basis: b,
        }, (stage) => {
          // The lot itself, stall lines still painted on it.
          addBox(stage, vadd(a.c, a.u, 0.08), [16, 0.16, len + 3], LOT_ASPHALT, b);
          for (let i = 0; i * 2.8 < len + 2; i++)
            addBox(stage, vadd(vadd(a.c, a.t, -len / 2 - 1 + i * 2.8), a.r, IN * 6.6),
              [3.2, 0.04, 0.14], LOT_STRIPE, b);
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, IN * 5.0), 0.14, 2.2, TUBE, 5, b);
            seat.cyl(stage, vadd(p, a.r, -IN * 5.0), 0.16, topH, TUBE, 5, b);
            // Scaffold lifts read as horizontal ledgers; one per 2.4 m.
            for (let y = 2.2; y < topH; y += 2.4)
              addBox(stage, vadd(p, a.u, y), [10.2, 0.11, 0.11], TUBE, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (4.5 - t * 1.28), y = 1.4 + t * 1.38;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.28, 0.14, len], PLANK, b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.14), [0.9, 0.7, len - 1.4],
              [0.60, 0.61, 0.64], b);
            stage._mat = MAT.FABRIC;
            // Crowd = one continuous dark BAND plus sparse speckle, never one
            // box per seat. At ~1 m spacing this loop was emitting ~30 bodies
            // per row on every row of every bleacher, and Vegas is already the
            // heaviest circuit in the fleet. A night crowd reads as an unbroken
            // dark mass anyway — the individual bodies were invisible; what the
            // eye actually picks up is the scatter of phone screens on top of
            // it, which is what the speckle below is for.
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.80),
              [0.58, 0.80, len - 2.2], LOT_FANS[0], b);
            // Speckle stands PROUD of the band — taller, and nudged trackward so
            // it is never coplanar with it. Buried inside the band it would cost
            // vertices and show nothing.
            const cnt = Math.min(13, Math.floor(len / 4.4));
            for (let j = 0; j < cnt; j++) {
              const h2 = hash(k * 19 + t * 53 + j * 41);
              if (h2 < 0.46) continue;
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.r, lat + IN * 0.08), a.t,
                  (j / (cnt - 1) - 0.5) * (len - 4)), a.u, y + 1.06),
                [0.50, 1.12, 1.5], LOT_FANS[Math.floor(h2 * 53) % LOT_FANS.length], b);
            }
            stage._mat = MAT.METAL;
          }
          // Bolt-on stair tower at one end — the giveaway that this is rented.
          {
            const e = vadd(a.c, a.t, -(len / 2 + 2.0));
            seat.box(stage, vadd(e, a.r, -IN * 1.5), [7.4, topH, 3.4], [0.30, 0.31, 0.34], b);
            for (let f = 0; f * 2.4 < topH; f++)
              addBox(stage, vadd(vadd(e, a.r, -IN * 1.5), a.u, 1.2 + f * 2.4),
                [7.6, 0.16, 3.6], TUBE, b);
          }
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.4), a.u, 1.6), [0.2, 1.5, len], ribbon, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.5), a.u, 0.55), [0.12, 0.3, len],
            [0.06, 0.06, 0.09], b);
        });
      };

      fence(0.0, 0.07, 1, 1.4, 3.6, [0.55, 0.56, 0.60]);             // pit/paddock straight
      fence(0.83, 0.91, -1, 1.4, 3.6, [0.55, 0.56, 0.60]);          // neon final straight
      guardrail(0.16, 0.21, 1, 1.0, [0.80, 0.80, 0.84]);            // T3 hard-right armco
      guardrail(0.45, 0.49, -1, 1.0, [0.80, 0.80, 0.84]);          // T8-T9 onto the Strip
      tyreWall(0.305, 0.345, -1, 1.2, MAGENTA);                     // Sphere chicane apex
      tyreWall(0.955, 0.985, 1, 1.2, CYAN);                        // Harmon chicane apex
      for (const [s0, s1, side] of [
        [0.07, 0.30,  1], [0.30, 0.50,  1], [0.50, 0.72,  1], [0.72, 0.99,  1],
        [0.00, 0.25, -1], [0.25, 0.48, -1], [0.48, 0.70, -1], [0.70, 0.83, -1],
        [0.91, 0.99, -1],
      ]) fence(s0, s1, side, 3.4, 3.6, [0.55, 0.56, 0.60]);
      // Lit hoarding band on the barrier top — continuous neon advertising.
      for (const [s0, s1, side] of [
        [0.00, 0.32,  1], [0.34, 0.64,  1], [0.66, 0.98,  1],
        [0.02, 0.33, -1], [0.35, 0.65, -1], [0.67, 0.97, -1],
      ]) wall(s0, s1, side, 2.4, 1.5,
              NEON[Math.round(s0 * 13) % NEON.length], 0.35);

      // Marshal posts dotted around the lap (off the tarmac via clearance guard)
      for (const [s, side] of [[0.12, 1], [0.22, -1], [0.33, 1], [0.49, -1],
                               [0.62, 1], [0.78, -1], [0.92, 1]]) {
        marshalPost(K(s), side, 4.5);
      }
      // Start/finish + DRS gantries spanning the track
      gantry(0.005, 9.5, [0.12, 0.12, 0.16]);
      gantry(0.50, 8.5, [0.12, 0.12, 0.16]);                       // DRS detection on Strip
      gantry(0.80, 8.5, [0.12, 0.12, 0.16]);

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ring = trad + 520;
      const desertN = 22;
      for (let i = 0; i < desertN; i++) {
        const a = i / desertN * 6.2832, h = hash(i * 7 + 3), h2 = hash(i * 13 + 2);
        const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
        if (onTrack(mx, mz, 60)) continue;
        const mh = 34 + h * 56, baseR = 150 + h2 * 130;
        const rock = [DARKROCK[0] * (0.9 + h * 0.4), DARKROCK[1] * (0.9 + h * 0.4), DARKROCK[2] * (0.95 + h * 0.5)];
        addFrustum(out, [mx, pyMin - 4, mz], baseR * 1.5, baseR * 0.95, mh * 0.42, [rock[0] * 1.1, rock[1] * 1.1, rock[2] * 1.1], 6);
        addFrustum(out, [mx, pyMin - 4 + mh * 0.30, mz], baseR, baseR * 0.58, mh * 0.7, rock, 6);
      }

      //     with per-tower radius jitter so it never reads as a cloned ring. ---
      {
        const sky = trad + 300;
        const skyN = 44;
        const SKYTINT = [CYAN, WARM, VIOLET, BLUE, ROSE];
        for (let i = 0; i < skyN; i++) {
          const a = i / skyN * 6.2832, h = hash(i * 11 + 17), h2 = hash(i * 23 + 5);
          const rr = sky + (hash(i * 31 + 9) - 0.5) * 160;
          const mx = cx + Math.cos(a) * rr, mz = cz + Math.sin(a) * rr;
          if (onTrack(mx, mz, 80)) continue;
          const bh = 50 + h * 130, bw = 34 + h2 * 30, bd = 34 + h2 * 26;
          const tint = SKYTINT[i % SKYTINT.length];
          const lvl = 0.46 + h2 * 0.16;
          const skin = [tint[0] * lvl + 0.06, tint[1] * lvl + 0.06, tint[2] * lvl + 0.08];
          const baseH = bh * 0.78;
          addBox(out, [mx, pyMin + baseH / 2, mz], [bw, baseH, bd], skin);
          // thin dark floor spandrels — storey rhythm without the checker
          const floors = Math.max(3, Math.round(baseH / 18));
          for (let f = 1; f < floors; f++) {
            addBox(out, [mx, pyMin + f * (baseH / floors), mz], [bw * 1.02, 0.9, bd * 1.02], [0.05, 0.05, 0.08]);
          }
          // TAPERED frustum crown → a slim top, not a flat box edge
          const crownCol = [tint[0] * 0.6 * lvl + 0.05, tint[1] * 0.6 * lvl + 0.05, tint[2] * 0.6 * lvl + 0.07];
          addFrustum(out, [mx, pyMin + baseH, mz], Math.max(bw, bd) * 0.5, Math.max(bw, bd) * 0.28, bh - baseH, crownCol, 6);
          const neon = NEON[i % NEON.length];
          addBox(out, [mx, pyMin + bh - 2, mz], [bw * 0.55, 3, bd * 0.55], neon);   // bright crown band
          // spires on the taller landmark towers
          if (h > 0.55) {
            addCyl(out, [mx, pyMin + bh, mz], 0.4, 6 + h * 16, [0.5, 0.5, 0.56], 4);
            addBox(out, [mx, pyMin + bh + 6 + h * 16, mz], [1.2, 1.2, 1.2], [3.2, 0.4, 0.3]);  // beacon
          }
        }
      }

      const lampPost = (k, side, dist) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        // Slim mast
        addCyl(out, a.c, 0.22, 12, [0.28, 0.28, 0.32], 5, b);
        // Cobra-arm angled box reaching over the track
        const armPt = vadd(a.c, a.u, 12);
        addBox(out, vadd(armPt, b[2], -side * 1.5), [0.2, 0.2, 3.0], [0.30, 0.30, 0.34], b);
        // Bright LED luminaire head — slightly warm white, large to cast a visual pool
        const headPt = vadd(vadd(armPt, b[2], -side * 3.0), a.u, -0.3);
        addBox(out, headPt, [2.8, 0.5, 1.8], [0.98, 0.95, 0.82], b);
      };

      // Lamp posts along the pit straight / paddock sector (s 0.00–0.10)
      for (let s = 0.01; s <= 0.09; s += 0.018) {
        lampPost(K(s), -1, 11);
        lampPost(K(s + 0.009), 1, 11);
      }
      // Lamp posts around T1–T5 sector (s 0.10–0.28)
      for (let s = 0.10; s <= 0.27; s += 0.022) {
        lampPost(K(s), (s < 0.18 ? 1 : -1), 12);
      }
      // Lamp posts along the full Strip (s 0.48–0.82) — both sides, denser
      for (let s = 0.48; s <= 0.82; s += 0.016) {
        lampPost(K(s), -1, 13);
        lampPost(K(s + 0.008), 1, 13);
      }
      // Lamp posts on the final straight / Harmon approach (s 0.83–0.97)
      for (let s = 0.83; s <= 0.97; s += 0.020) {
        lampPost(K(s), 1, 12);
        lampPost(K(s + 0.010), -1, 12);
      }

      {
        const stripNeon = (s0, s1, step, gap) => {
          let j = 0;
          for (let s = s0; s <= s1; s += step, j++) {
            const side = (j % 2) ? 1 : -1;
            const a = anchor(K(s), side, gap);
            const poolNeon = NEON[(j * 3 + (side > 0 ? 1 : 0)) % NEON.length];
            const dimN = [poolNeon[0] * 0.55, poolNeon[1] * 0.55, poolNeon[2] * 0.55];
            // Narrow lateral footprint (3.2 m) kept well past the edge; long along-track
            addBox(out, vadd(a.c, a.u, 0.12), [3.2, 0.18, 14], dimN, [a.r, a.u, a.t]);
          }
        };
        stripNeon(0.01, 0.08, 0.028, 3.2);   // pit/paddock verge
        stripNeon(0.485, 0.815, 0.022, 3.0); // Strip canyon verge
        stripNeon(0.83, 0.96, 0.028, 3.2);   // Harmon / final straight verge
      }

      const grandPrixPlaza = (k, side, gap) => {
        const W = 42, LEN = 118, H = 38;             // overall lateral / along-track / height envelope
        const dist = gap + W / 2;                    // podium CENTRE clearance (matches building()'s convention)
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const GLASS = [0.14, 0.30, 0.46];             // cool glazed curtain wall — a landmark, not a casino
        const GLASS_LIT = [0.55, 0.85, 1.10];         // HDR-bright lit tier band / roof accents
        const FRAME = [0.22, 0.23, 0.27];
        modelGroup("vegas-grand-prix-plaza", {
          center: vadd(a.c, a.u, H / 2),
          size: [W + 4, H + 2, LEN + 4],
          basis: b,
        }, (stage) => {
          // Level 1-2: wide glass podium (the "300,000 sq ft" base).
          addBox(stage, vadd(a.c, a.u, 9), [W, 18, LEN], GLASS, b);
          addBox(stage, vadd(a.c, a.u, 18.4), [W + 0.6, 0.8, LEN + 0.6], FRAME, b);
          // Level 3: setback upper floor (recedes from the street-facing edge).
          const l3 = LEN * 0.74;
          const c3 = vadd(vadd(a.c, a.r, side * 3), a.u, 24);
          addBox(stage, c3, [W * 0.82, 10, l3], GLASS, b);
          addBox(stage, vadd(vadd(a.c, a.r, side * 3), a.u, 29.2), [W * 0.82 + 0.5, 0.6, l3 + 0.5], FRAME, b);
          // Level 4: further-setback penthouse.
          const l4 = LEN * 0.5;
          const c4 = vadd(vadd(a.c, a.r, side * 6), a.u, 32.5);
          addBox(stage, c4, [W * 0.6, 6, l4], GLASS_LIT, b);
          // Roof deck: flat slab + lit rooftop-terrace accents.
          addBox(stage, vadd(vadd(a.c, a.r, side * 6), a.u, 36), [W * 0.62, 0.5, l4 + 1], FRAME, b);
          for (const off of [-l4 * 0.42, 0, l4 * 0.42])
            addBox(stage, vadd(vadd(vadd(a.c, a.r, side * 6), a.u, 37), a.t, off), [1.4, 1.6, 1.4], GLASS_LIT, b);
          for (const rs of [-1, 1])
            addBox(stage, vadd(vadd(a.c, a.r, rs * (W / 2 + 0.2)), a.u, 3), [0.6, 1.4, LEN], GLASS_LIT, b);
        }, { required: true });
      };
      grandPrixPlaza(K(0.012), 1, 15);
      grandstandEx(0.05, 1, 20, 82, null, null,
        { livery: "darkSteel", tiers: 3, roof: "truss", suites: true, endWalls: true, pylons: true });
      lotBleacher("vegas-lot-bleacher-paddock", 0.0745, -1, 16, 9,
        { rows: 8, ribbon: MAGENTA });
      // pit-lane light masts — bright LED headlights (supplement engine's generic posts)
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.01 + i * 0.012), 1, 9);
        addCyl(out, a.c, 0.28, 15, [0.35, 0.35, 0.38], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 15), [3.5, 1.2, 1.2], LED, [a.r, a.u, a.t]); // bright light head
      }
      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:vegas:paddock-hospitality", frac: 0.045,
          side: -1, gap: 30, size: [18, 9, 46], modules: 5,
        });
        circuitKit.serviceCompound({
          id: "kit:vegas:paddock-service", frac: 0.022,
          side: -1, gap: 15, size: [22, 5, 34], vehicles: 8,
        });
      }
      broadcastCompound(K(0.09), 1, 44, { vans: 4, dishes: 3, mastH: 11 });
      cameraTower(K(0.002), -1, 15, { h: 20, boom: 1.4 });

      {
        const pads = [
          ["kenney_com_building-f", 0.08, 1, 58],
          ["kenney_com_building-b", 0.11, -1, 48],
          ["kenney_com_building-skyscraper-b", 0.16, 1, 55],
          ["kenney_ind_building-q", 0.20, -1, 50],
        ];
        for (const [id, s, side, dist] of pads) {
          const sc = id.includes("skyscraper") ? 4.2 : 1.2;
          if (!bakedModel(id, K(s), side, dist, { scale: sc }))
            building(K(s), side, dist, 20, 40 * sc * 0.4, 18,
              { kind: "tiered", wall: [0.16, 0.17, 0.20], window: [0.30, 0.38, 0.48], floor: 8, lit: true });
        }
      }

      building(K(0.03), -1, 52, 34, 128, 30, { kind: "notch", wall: [0.07, 0.08, 0.13], window: [0.10, 0.22, 0.42], floor: 11, lit: true });
      place(K(0.03), -1, 20, [10, 1.0, 26], [0.15, 0.30, 0.55]);   // cool blue base uplight
      building(K(0.062), -1, 60, 30, 90, 26, { kind: "screen", wall: [0.14, 0.14, 0.18], window: LED, floor: 15, lit: true });
      place(K(0.062), -1, 44, [2.5, 16, 30], LED);                // giant LED megascreen

      const BOH_WALL = [0.16, 0.17, 0.20];   // flat concrete-grey, no warm cast
      const BOH_WIN  = [0.30, 0.38, 0.48];   // cool dim office glass, not neon
      // Prominent hotel towers either side of the start/finish straight approach
      building(K(0.10), -1, 22, 30, 46, 30, { kind: "twin", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });
      building(K(0.14), 1, 20, 26, 40, 26, { kind: "tiered", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });
      cityFront(0.12, 0.20, -1, 20, { minH: 20, maxH: 42, depth: 22, step: 30,
        palette: [[0.18, 0.18, 0.20], [0.19, 0.19, 0.20]], lit: true, windowCol: BOH_WIN });
      cityFront(0.12, 0.20,  1, 20, { minH: 18, maxH: 38, depth: 20, step: 30,
        palette: [[0.18, 0.18, 0.20], [0.17, 0.18, 0.21]], lit: true, windowCol: BOH_WIN });
      // Mid-sector buildings around T3-T5 corner — still low/dim, service-road massing
      building(K(0.22), 1, 26, 30, 40, 28, { kind: "tiered", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });
      building(K(0.28), -1, 30, 34, 46, 30, { kind: "notch", wall: BOH_WALL, window: BOH_WIN, floor: 8, lit: true });

      {
        const a = anchor(K(0.30), -1, 145);
        const rad = 66;
        const baseY = a.c[1];
        // Single cool cyan-blue LED wash (reads as one orb at race speed)
        const SPHERE = [0.18, 0.55, 1.00];
        const SPHERE_HI = [0.55, 0.85, 1.00];
        modelGroup("vegas-sphere", {
          center: [a.c[0], baseY + rad, a.c[2]],
          size: [rad * 2.05, rad * 2.05, rad * 2.05],
        }, (stage) => {
          addFrustum(stage, [a.c[0], baseY, a.c[2]], rad * 0.32, rad * 0.28, rad * 0.18,
            [0.25, 0.25, 0.28], 16, null);
          const bands = 5;
          for (let i = 0; i < bands; i++) {
            const t0 = i / bands, t1 = (i + 1) / bands;
            const phi0 = t0 * Math.PI, phi1 = t1 * Math.PI;
            const rB = rad * Math.sin(phi0), rT = rad * Math.sin(phi1);
            const yB = baseY + rad * (1 - Math.cos(phi0));
            const hB = rad * (Math.cos(phi0) - Math.cos(phi1));
            const tint = (i === 2) ? SPHERE_HI : SPHERE;
            addFrustum(stage, [a.c[0], yB, a.c[2]], Math.max(rB, 2), Math.max(rT, 2),
              Math.max(hB, 1), tint, 24, null);
          }
          addCyl(stage, [a.c[0], baseY + rad * 0.5, a.c[2]], rad * 0.90, 6.0, SPHERE_HI, 28, null);
        }, { required: true });
      }

      backdrop(K(0.45), 1, 240, [180, 30, 120], DARKROCK);

      building(K(0.49), -1, 20, 42, 98, 40, { kind: "pyramid", wall: [0.64, 0.60, 0.52], window: [1.0, 0.85, 0.35], floor: 8 });
      building(K(0.505), -1, 46, 32, 75, 32, { kind: "spire", wall: [0.62, 0.58, 0.50], window: [0.98, 0.80, 0.30], floor: 8 });
      tower(K(0.492), -1, 70, 18, 60, { col: [0.58, 0.54, 0.46], seg: 6, cap: true, capCol: [1.0, 0.82, 0.20], mast: true });
      place(K(0.49), -1, 9, [28, 1.8, 8], [1.0, 0.85, 0.25]); // golden uplighting

      ferrisWheel(K(0.55), -1, 85, 65);
      billboard(K(0.56), -1, 18, 16, 10, CYAN);
      building(K(0.55), -1, 22, 36, 18, 28, { kind: "screen", wall: [0.24, 0.24, 0.28], window: [0.15, 0.80, 1.00], floor: 4 });
      place(K(0.55), -1, 10, [24, 0.7, 24], [0.15, 0.45, 0.65]);
      place(K(0.55), -1, 10, [20, 0.5, 20], [0.10, 0.30, 0.50]);

      building(K(0.62), 1, 22, 62, 75, 46, { kind: "drum", wall: [0.68, 0.64, 0.56], window: [1.0, 0.85, 0.40], floor: 8 });
      place(K(0.62), 1, 12, [44, 2.4, 8], [1.0, 0.88, 0.30]);
      place(K(0.62), 1, 9, [50, 1.2, 10], [0.95, 0.75, 0.15]);

      building(K(0.68), 1, 40, 60, 55, 62, { wall: [0.58, 0.55, 0.50], window: [1.0, 0.85, 0.40], floor: 7 });
      place(K(0.68), 1, 52, [95, 2.0, 12], [1.0, 0.75, 0.20]);   // dist cleared past sz[0]/2 — was silently suppressed
      // Jets spread and height-varied across the full frontage (was 8 jets in a
      // tight 20 m cluster) — a real Bellagio show has jets of very different
      // reach, not a uniform picket line.
      const bellagioJets = 18;
      const jetCols = [CYAN, [0.15, 0.50, 1.00], LED, [0.30, 0.85, 1.00], BLUE, MAGENTA, [0.20, 0.90, 0.95], ROSE];
      for (let i = 0; i < bellagioJets; i++) {
        const s = 0.663 + (i / (bellagioJets - 1)) * 0.046;
        const a = anchor(K(s), 1, 26 + hash(i * 4.7) * 10);
        const jetH = 8 + hash(i * 9.3 + 2) * 16;   // 8-24 m: varied reach, not one height
        addBox(out, vadd(a.c, a.u, jetH / 2), [0.8, jetH, 0.8], jetCols[i % jetCols.length], [a.r, a.u, a.t]);
      }
      waterSurface(K(0.672), 1, 20, [110, 1.2, 150], [0.05, 0.10, 0.18],
        { id: "vegas-bellagio-lake-east", required: true });
      waterSurface(K(0.702), 1, 20, [105, 1.2, 135], [0.05, 0.10, 0.18],
        { id: "vegas-bellagio-lake-west" });

      tower(K(0.74), -1, 68, 22, 130, { col: [0.55, 0.48, 0.35], seg: 4, cap: true, capCol: [1.0, 0.85, 0.4], mast: true });
      place(K(0.74), -1, 20, [10, 1.6, 10], [1.0, 0.80, 0.25]);
      place(K(0.74), -1, 22, [14, 0.7, 14], [0.95, 0.75, 0.20]);
      building(K(0.73), -1, 24, 36, 55, 34, { wall: [0.62, 0.58, 0.48], window: [1.0, 0.82, 0.30], floor: 7 });
      {
        const a = anchor(K(0.748), -1, 26), b = [a.r, a.u, a.t];
        const RED   = [0.72, 0.12, 0.14], RED_D = [0.56, 0.09, 0.11];
        const GOLD  = [0.94, 0.74, 0.24], BLUE = [0.16, 0.22, 0.52];
        modelGroup("vegas-paris-balloon", {
          center: vadd(a.c, a.u, 21), size: [26, 44, 26], basis: b,
        }, (stage) => {
          // Marquee plinth the balloon stands on — the sign face itself.
          addBox(stage, vadd(a.c, a.u, 3.0), [12, 6, 16], [0.20, 0.18, 0.22], b);
          addBox(stage, vadd(vadd(a.c, a.r, -6.2), a.u, 3.4), [0.5, 4.2, 13], GOLD, b);
          // Envelope: widest a third of the way up, then closing to the crown.
          const bc = vadd(a.c, a.u, 7.5);
          const bands = [
            [0.0,  5.0,  8.6, 5.5, RED],
            [5.5,  8.6, 11.2, 5.5, GOLD],
            [11.0, 11.2, 11.6, 5.0, RED_D],
            [16.0, 11.6,  9.2, 5.0, GOLD],
            [21.0,  9.2,  5.4, 4.6, RED],
            [25.6,  5.4,  1.8, 3.0, GOLD],
          ];
          for (const [y, r0, r1, h, col] of bands) {
            addFrustum(stage, vadd(bc, a.u, y), r0, r1, h, col, 16, b);
          }
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const rr = 11.3;
            addBox(stage, vadd(vadd(vadd(bc, a.r, Math.cos(ang) * rr),
                                     a.t, Math.sin(ang) * rr), a.u, 13.0),
                   [0.5, 11.0, 0.5], BLUE, b);
          }
          // Basket slung under the envelope on its rigging.
          const gc = vadd(a.c, a.u, 6.6);
          addBox(stage, gc, [4.6, 3.2, 4.6], [0.46, 0.30, 0.16], b);
          addBox(stage, vadd(gc, a.u, 1.8), [5.0, 0.4, 5.0], GOLD, b);
          stage._mat = MAT.METAL;
          for (const [dx, dz] of [[-2.0, -2.0], [2.0, -2.0], [-2.0, 2.0], [2.0, 2.0]]) {
            addCyl(stage, vadd(vadd(vadd(gc, a.r, dx), a.t, dz), a.u, 1.8),
                   0.07, 2.6, [0.62, 0.55, 0.34], 4, b);
          }
          stage._mat = 0;
        });
      }

      for (const [side, col1, col2] of [[-1, MAGENTA, CYAN], [1, CYAN, MAGENTA]]) {
        billboard(K(0.85), side, 26, 20, 12, col1);
        billboard(K(0.87), side, 26, 18, 11, col2);
        billboard(K(0.89), side, 26, 16, 10, [col1[2], col1[0], col1[1]]); // rotated hue
        place(K(0.86), side, 16, [10, 1.4, 10], col1);
        place(K(0.88), side, 20, [12, 1.0, 8], col2);
      }

      grandstandEx(0.965, 1, 16, 70, null, null,
        { livery: "crimson", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      lotBleacher("vegas-lot-bleacher-harmon", 0.90, -1, 16, 9, { rows: 8, ribbon: CYAN });
      grandstandEx(0.945, 1, 20, 40, null, null,
        { livery: "alu", tiers: 1, roof: "none" });
      building(K(0.93), 1, 22, 28, 52, 26, { wall: [0.22, 0.18, 0.24], window: VIOLET, floor: 7, lit: true });
      building(K(0.97), -1, 20, 26, 46, 24, { wall: [0.20, 0.18, 0.22], window: ROSE, floor: 7, lit: true });
      billboard(K(0.94), -1, 18, 18, 11, CYAN);
      billboard(K(0.96), 1, 17, 16, 10, MAGENTA);

      {
        const s0 = 0.485, s1 = 0.815;
        const span = s1 - s0;

        const STEP = 0.009;
        const backdropCols = [[0.20, 0.18, 0.24], [0.18, 0.16, 0.22], [0.22, 0.20, 0.20]];
        let idx = 0;
        for (let s = s0; s <= s1; s += STEP, idx++) {
          const k = K(s);
          for (const side of [-1, 1]) {
            const h1 = hash(idx * 5 + (side > 0 ? 13 : 71));
            const neon = NEON[(idx + (side > 0 ? 4 : 1)) % NEON.length];
            const fh = 80 + h1 * 100;
            backdrop(k, side, 185, [50, fh, 30], backdropCols[idx % 3]);
            // Bright neon crown bands on top — Strip glow visible over the midground
            backdrop(k, side, 182, [52, 7.0, 26], neon);
          }
        }

        const casinoPalL = [[0.22, 0.18, 0.22], [0.18, 0.17, 0.24], [0.24, 0.20, 0.20], [0.20, 0.18, 0.26]];
        const casinoPalR = [[0.20, 0.19, 0.26], [0.24, 0.20, 0.22], [0.18, 0.18, 0.22], [0.22, 0.21, 0.20]];
        // Near facade row — primary casino street-wall (gap 56, step 38)
        cityFront(s0, s1, -1, 19, { minH: 40, maxH: 85, depth: 20, step: 26,
          palette: casinoPalL, lit: true, windowCol: WARM });
        cityFront(s0, s1,  1, 19, { minH: 40, maxH: 85, depth: 20, step: 26,
          palette: casinoPalR, lit: true, windowCol: CYAN });

        // Tall signature casino towers punched along the canyon (prominent landmarks)
        for (let j = 0; j < 8; j++) {
          const s = s0 + (j + 0.5) / 8 * span, side = (j % 2) ? -1 : 1;
          const windowCol = [WARM, CYAN, MAGENTA, GOLD, VIOLET][j % 5];
          building(K(s), side, 17, 28, 120 + hash(j * 17) * 65, 36,
            { wall: [0.22, 0.20, 0.22], window: windowCol, floor: 16, lit: true });
        }

        // Strip-side neon billboards (spaced, not every step — avoids overdraw)
        for (let j = 0; j < 8; j++) {
          const s = s0 + (j + 0.3) / 8 * span, side = (j % 2) ? 1 : -1;
          billboard(K(s), side, 16, 16 + hash(j * 3) * 6, 10, NEON[(j + 2) % NEON.length]);
        }
        for (let j = 0; j < 34; j++) {
          const s = s0 + (j + 0.2) / 34 * span, side = (j % 2) ? 1 : -1;
          palm(K(s), side, 15, 11 + hash(j * 23) * 4, LIME);
          palm(K(s + 0.004), -side, 15, 10 + hash(j * 29) * 3, LIME);
        }
        for (let j = 0; j < 40; j++) {
          const s = s0 + (j + 0.6) / 40 * span, side = (j % 2) ? -1 : 1;
          billboard(K(s), side, 9, 11 + hash(j * 7.3) * 5, 4.6, NEON[j % NEON.length]);
        }
        const vegasStandLiveries = ["scaffold", "alu", "crimson"];
        for (let j = 0; j < 10; j++) {
          const s = s0 + (j + 0.35) / 10 * span, side = (j % 2) ? 1 : -1;
          if (j % 3 === 1) {
            lotBleacher(`vegas-lot-bleacher-${j}`, s, side, 15, 8,
              { rows: j > 5 ? 8 : 6 });
            continue;
          }
          grandstandEx(s, side, 15, 56, null, null, {
            livery: vegasStandLiveries[j % vegasStandLiveries.length],
            tiers: (j % 3 === 0) ? 2 : 1,
            roof: (j % 2) ? "truss" : "cantilever",
            endWalls: (j % 4) === 0,
            pylons: true,
          });
        }
      }

      for (const [s, side] of [[0.02, 1], [0.08, -1], [0.42, 1], [0.46, 1], [0.72, 1], [0.78, -1],
                               [0.20, -1], [0.27, 1], [0.38, -1], [0.95, -1]]) {
        palm(K(s), side, 18, 10 + hash(s * 100) * 3, LIME);
        palm(K(s + 0.006), side, 22, 9 + hash(s * 131) * 3, LIME);
      }
      billboard(K(0.34), -1, 24, 16, 10, VIOLET);
      billboard(K(0.58), 1, 17, 16, 10, GOLD);
      billboard(K(0.67), 1, 16, 14, 9, LIME);
      billboard(K(0.18), 1, 18, 14, 9, ROSE);
      billboard(K(0.26), -1, 18, 14, 9, BLUE);

      building(K(0.40), -1, 34, 28, 66, 26, { wall: [0.20, 0.19, 0.20], window: ROSE, floor: 8, lit: true });

      for (let j = 0; j < 6; j++) {
        const a = j / 6 * 6.2832 + 0.4, h = hash(j * 13 + 5);
        const mx = cx + Math.cos(a) * (ring - 180), mz = cz + Math.sin(a) * (ring - 180);
        if (onTrack(mx, mz, 60)) continue;
        const mw = 180 + h * 140, mh = 18 + h * 22;
        addFrustum(out, [mx, pyMin, mz], mw * 0.5, mw * 0.3, mh, DARKROCK, 5, null);
      }
      overheadSpan({
        id: "vegas-finish-halo", frac: 0.98, clearance: 7.2,
        thickness: 0.8, depth: 1.4, color: MAGENTA, required: true,
      });

      {
        const k = K(0.66);
        const aL = anchor(k, -1, 3.5), aR = anchor(k, 1, 3.5);
        const span = (hw[k] || 7) * 2 + 10;
        // Piers
        for (const [sd, a] of [[-1, aL], [1, aR]]) {
          const b = [a.r, a.u, a.t];
          out._mat = MAT.METAL;
          addBox(out, vadd(a.c, a.u, 6), [2.6, 12, 2.6], [0.10, 0.10, 0.14], b);
          out._mat = 0;
          addBox(out, vadd(a.c, a.u, 6), [2.8, 10, 0.8], sd > 0 ? CYAN : MAGENTA, b);   // neon strip
        }
        overheadSpan({
          id: "vegas-strip-gateway", frac: 0.66, clearance: 12.5,
          thickness: 1.4, depth: 1.8, span: span * 0.96,
          color: MAGENTA, required: true,
        });
      }
    },
  }
  );
})();
