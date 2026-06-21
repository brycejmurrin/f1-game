/* Apex 26 — MONZA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 8,
    pal: {
      zenith:        [0.22, 0.42, 0.72],
      horizon:       [0.78, 0.68, 0.50],
      sun:           [1.0,  0.90, 0.62],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.48, 0.50, 0.56],
      ambientGround: [0.26, 0.24, 0.18],
      fogColor:      [0.70, 0.66, 0.55],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    segs: [
      { t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
      { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
      { t: 0, l: 360 }, { t: 150, l: 220 },
    ],
    // Royal-park circuit is nearly flat — a gentle rise through the Lesmos.
    elevations: [{ s: 0.55, halfM: 320, rise: 7 }],
    scenery: function (api) {
      const { n, ds, pyMin, place, prop, backdrop, groundPlane, groundYAt, every,
        onTrack, hash, pine, tree, bush, hedge, ridge, building, tower, grandstand,
        billboard, gantry, marshalPost, wall, fence, guardrail, tyreWall,
        addBox, addCyl, addCone, addPrism, addFrustum, anchor, along, vadd,
        px, pz } = api;
      const K = (s) => Math.round(s * n) % n;

      // Royal-park greens.
      const PINE_D = [0.08, 0.26, 0.12], PINE = [0.10, 0.30, 0.14], PINE_L = [0.13, 0.34, 0.17];
      const LEAF = [0.18, 0.45, 0.20], LEAF_L = [0.24, 0.50, 0.24], LEAF_D = [0.15, 0.38, 0.18];
      const GRAVEL = [0.68, 0.60, 0.42];

      // =====================================================================
      // 1. ROYAL PARK FOREST — very dense broadleaf + umbrella-pine corridor
      //    lining nearly the whole lap on BOTH sides, in several staggered ranks
      //    so the canopy reads as a deep wood, not a thin hedge.
      // =====================================================================
      // Rank A — front pines, close to the verge, almost gapless.
      every(13, (k) => {
        const h = hash(k * 31);
        if (h < 0.12) return;                       // tiny breathing gaps only
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 9 + h * 6, 18 + h * 13, h < 0.3 ? PINE_D : PINE);
        // mirror on the other side most of the time → two-sided corridor
        if (h > 0.4) pine(k, -side, 10 + h * 7, 16 + h * 12, PINE);
      });
      // Rank B — broadleaf trees interleaved with the pines (warmer, rounder).
      every(15, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.2) return;
        const side = h < 0.5 ? -1 : 1;
        tree(k, side, 12 + h * 8, 11 + h * 8, h < 0.4 ? LEAF_D : LEAF);
        if (h > 0.55) tree(k, -side, 13 + h * 9, 10 + h * 7, LEAF_L);
      });
      // Rank C — set-back interior wall of taller pines (the deep park).
      every(18, (k) => {
        const h = hash(k * 41 + 3);
        if (h < 0.28) return;
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 24 + h * 18, 22 + h * 16, PINE_D);
        if (h > 0.6) pine(k, -side, 30 + h * 16, 24 + h * 14, PINE_D);
      });
      // Rank D — outermost broadleaf rank, blends into the backdrop ring.
      every(24, (k) => {
        const h = hash(k * 67 + 17);
        if (h < 0.4) return;
        tree(k, h < 0.5 ? -1 : 1, 42 + h * 30, 13 + h * 10, LEAF_D);
      });
      // Low underbrush / shrubs scattered along the verge for ground texture.
      every(11, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.55) return;
        bush(k, h < 0.77 ? -1 : 1, 6.5 + h * 4, h < 0.66 ? [0.16, 0.36, 0.16] : [0.20, 0.42, 0.18]);
      });
      // Clipped park hedge banding through several sweeps for a manicured edge.
      hedge(0.06, 0.18, -1, 20, 6, [0.12, 0.33, 0.16]);
      hedge(0.06, 0.18,  1, 21, 6, [0.12, 0.33, 0.16]);
      hedge(0.32, 0.46, -1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.66, 0.78,  1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.82, 0.94, -1, 24, 5, [0.12, 0.33, 0.16]);

      // =====================================================================
      // 2. PIT STRAIGHT / START–FINISH — grandstands, tifosi, podium, pit boxes
      // =====================================================================
      // Tribuna Centrale — long stepped main grandstand (pit-side, left).
      grandstand(0.005, -1, 10, 160, [0.55, 0.58, 0.62], [0.74, 0.26, 0.22]);
      grandstand(0.955, -1, 10, 110, [0.55, 0.58, 0.62], [0.70, 0.26, 0.22]);
      // Facing grandstand across the straight (right side).
      grandstand(0.02, 1, 12, 120, [0.52, 0.55, 0.60], [0.72, 0.28, 0.24]);
      // Red trim band fronting the main stand.
      prop(K(0.01), -1, 8, [2, 1.6, 130], [0.80, 0.16, 0.14]);

      // Pit building / garages along the pit wall (right side), with roof banner.
      const pitWall = [0.86, 0.86, 0.84];
      for (let i = 0; i < 8; i++) {
        const s = 0.965 + i * 0.0085;
        building(K(s), 1, 14, 16, 9, 11,
          { wall: pitWall, window: [0.30, 0.34, 0.40], floor: 4.5, roof: false });
      }
      // Long flat pit-roof banner over the garages.
      const aPit = anchor(K(0.99), 1, 18);
      addBox(aPit.out || api.out, vadd(aPit.c, aPit.u, 10), [4, 0.6, 70], [0.82, 0.20, 0.18], [aPit.r, aPit.u, aPit.t]);
      // Podium / timing tower at the line — slim white with red cap.
      tower(K(0.0), 1, 13, 6, 46, { col: [0.92, 0.92, 0.90], cap: true, capCol: [0.78, 0.14, 0.12], mast: 7 });
      // Start gantry spanning the straight.
      gantry(0.0, 9, [0.14, 0.14, 0.17]);
      gantry(0.98, 8.5, [0.14, 0.14, 0.17]);

      // Pit-straight furniture: armco both sides, debris fence behind left stand.
      guardrail(0.93, 0.07, 1, 3.5, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 8, 4, [0.74, 0.76, 0.80]);
      // Sponsor billboards lining the main straight.
      for (const s of [0.94, 0.97, 0.015, 0.04]) billboard(K(s), -1, 7, 11, 4.5, [0.92, 0.88, 0.30]);
      for (const s of [0.95, 0.03]) billboard(K(s), 1, 26, 12, 5, [0.88, 0.84, 0.80]);

      // =====================================================================
      // 3. CHICANES & PARABOLICA — gravel traps, kerb trim, tyre walls, stands
      // =====================================================================
      // Variante del Rettifilo (s~0.04) — heavy braking, big gravel, tyre wall.
      groundPlane(K(0.04), 1, 5, [24, 34], GRAVEL);
      tyreWall(0.03, 0.055, 1, 4, [0.88, 0.20, 0.18]);
      grandstand(0.05, -1, 12, 76, [0.54, 0.57, 0.61], [0.70, 0.28, 0.24]);
      marshalPost(K(0.045), 1, 10);

      // Variante della Roggia (s~0.30) — shaded chicane, gravel both sides.
      groundPlane(K(0.30), -1, 6, [22, 28], GRAVEL);
      groundPlane(K(0.305), 1, 5, [20, 26], GRAVEL);
      tyreWall(0.29, 0.315, -1, 4, [0.20, 0.40, 0.85]);
      grandstand(0.30, 1, 13, 70, [0.53, 0.56, 0.60], [0.68, 0.28, 0.24]);
      marshalPost(K(0.31), -1, 9);

      // Lesmo 1 & 2 (s~0.45–0.52) — tight woodland curves, gravel + tyre.
      groundPlane(K(0.46), 1, 5, [18, 26], GRAVEL);
      groundPlane(K(0.51), 1, 5, [18, 24], GRAVEL);
      tyreWall(0.45, 0.47, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.48), 1, 9);

      // Variante Ascari (s~0.78) — triple chicane, gravel run-offs, grandstand.
      groundPlane(K(0.78), -1, 6, [28, 40], GRAVEL);
      groundPlane(K(0.795), 1, 6, [24, 32], GRAVEL);
      tyreWall(0.77, 0.80, -1, 4, [0.88, 0.20, 0.18]);
      grandstand(0.78, -1, 14, 80, [0.54, 0.57, 0.61], [0.70, 0.28, 0.24]);
      marshalPost(K(0.785), 1, 9);

      // Parabolica / Curva Alboreto (s~0.88–0.93) — wide outer gravel, big arc stand.
      groundPlane(K(0.90), -1, 8, [50, 110], GRAVEL);
      grandstand(0.905, 1, 14, 96, [0.53, 0.56, 0.60], [0.72, 0.30, 0.26]);
      tyreWall(0.885, 0.92, -1, 6, [0.88, 0.20, 0.18]);
      marshalPost(K(0.91), 1, 11);
      // Sponsor hoardings around the Parabolica outside.
      for (const s of [0.87, 0.89, 0.91]) billboard(K(s), -1, 12, 13, 5, [0.90, 0.86, 0.30]);

      // Catch fences behind the major spectator zones.
      fence(0.03, 0.06, 1, 7, 4, [0.74, 0.76, 0.80]);
      fence(0.295, 0.32, 1, 8, 4, [0.74, 0.76, 0.80]);
      fence(0.77, 0.80, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.89, 0.93, 1, 9, 4, [0.74, 0.76, 0.80]);

      // Marshal posts sprinkled around the rest of the lap.
      for (const s of [0.12, 0.20, 0.38, 0.58, 0.66, 0.84, 0.96]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 4. SOPRAELEVATA — old steep banked-oval ruin landmark (s~0.50–0.58 L)
      //    A raised, curved, tilted concrete bank built from a fan of leaning
      //    prism/box segments, weathered grey with moss-green streaks. Placed
      //    well off-track in the infield/park so it reads as a historic relic.
      // =====================================================================
      (function buildBanking() {
        const out = api.out;
        const conc = [0.64, 0.62, 0.58], concDk = [0.52, 0.50, 0.47], moss = [0.34, 0.46, 0.30];
        // Anchor the structure in the park to the LEFT of the Lesmo area.
        const a = anchor(K(0.535), -1, 95);
        // Lay the banking as a gentle arc of N tilted panels.
        const N = 16, arcSpan = 1.9, radius = 120;
        const baseY = a.c[1];
        // local frame: r = lateral (right), t = forward
        for (let i = 0; i < N; i++) {
          const f = i / (N - 1);
          const ang = -arcSpan / 2 + f * arcSpan;
          // centre of this panel out along the arc (in r/t plane)
          const ox = Math.sin(ang) * radius, oz = (1 - Math.cos(ang)) * radius;
          const cx = a.c[0] + a.r[0] * ox + a.t[0] * oz;
          const cz = a.c[2] + a.r[2] * ox + a.t[2] * oz;
          if (onTrack(cx, cz, 18)) continue;
          // tilt the panel so its top leans outward → banked look. Build the
          // tilted "up" by blending world-up with the outward lateral dir.
          const outward = [Math.sin(ang), 0, Math.cos(ang)]; // arc-local outward in r/t
          const ow = [a.r[0] * outward[0] + a.t[0] * outward[1] /*0*/, 0,
                      a.r[2] * outward[0] + a.t[2] * outward[1]];
          // outward world vector (lateral component only)
          const owx = a.r[0] * Math.sin(ang) + a.t[0] * Math.cos(ang);
          const owz = a.r[2] * Math.sin(ang) + a.t[2] * Math.cos(ang);
          const owl = Math.hypot(owx, owz) || 1;
          const od = [owx / owl, 0, owz / owl];
          const tilt = 0.55; // lean factor
          const upv = [od[0] * tilt, 1, od[2] * tilt];
          const ul = Math.hypot(upv[0], upv[1], upv[2]);
          const u = [upv[0] / ul, upv[1] / ul, upv[2] / ul];
          // forward along the arc (tangent)
          const tfx = a.r[0] * Math.cos(ang) - a.t[0] * Math.sin(ang);
          const tfz = a.r[2] * Math.cos(ang) - a.t[2] * Math.sin(ang);
          const tfl = Math.hypot(tfx, tfz) || 1;
          const fw = [tfx / tfl, 0, tfz / tfl];
          const rr = od; // right = outward
          const h = 11 + (i % 3) * 1.5;
          const col = (i % 4 === 0) ? concDk : conc;
          // banked slab
          addBox(out, [cx, baseY + h * 0.42, cz], [8.5, h, 14], col, [rr, u, fw]);
          // moss streak band on the face
          if (i % 2 === 0)
            addBox(out, [cx + od[0] * 0.6, baseY + h * 0.30, cz + od[2] * 0.6], [0.6, h * 0.5, 13], moss, [rr, u, fw]);
        }
        // Crumbling support pillars along the base of the bank.
        for (let i = 0; i < N; i += 2) {
          const f = i / (N - 1);
          const ang = -arcSpan / 2 + f * arcSpan;
          const ox = Math.sin(ang) * radius, oz = (1 - Math.cos(ang)) * radius;
          const cx = a.c[0] + a.r[0] * ox + a.t[0] * oz;
          const cz = a.c[2] + a.r[2] * ox + a.t[2] * oz;
          if (onTrack(cx, cz, 6)) continue;
          addCyl(out, [cx, baseY, cz], 1.0, 6 + (i % 3), concDk, 6, null);
        }
      })();

      // =====================================================================
      // 5. PARK STRUCTURES — Villa Reale, paddock buildings, ornamental lakes
      // =====================================================================
      // Villa Reale — cream neoclassical block in the park (s~0.62 R far).
      building(K(0.62), 1, 70, 64, 24, 30, { wall: [0.87, 0.81, 0.67], window: [0.70, 0.64, 0.50], floor: 6 });
      // Two flanking wings.
      building(K(0.605), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });
      building(K(0.635), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });

      // Paddock / hospitality buildings behind the pits (left, s~0.97–0.02).
      for (let i = 0; i < 4; i++) {
        const s = 0.93 + i * 0.022;
        building(K(s), -1, 40, 24, 12, 18,
          { wall: [0.78, 0.79, 0.80], window: [0.34, 0.40, 0.48], floor: 4.5, roof: true });
      }
      // Motorhome / truck row in the paddock (low coloured boxes).
      every(40, (k) => {
        const h = hash(k * 71 + 31);
        if (h < 0.5) return;
        const s = k / n;
        if (s > 0.10 && s < 0.90) return;   // only behind pit/paddock
        prop(k, -1, 55 + h * 10, [10, 4, 6], [0.6 + h * 0.3, 0.6, 0.62]);
      });

      // Ornamental park lakes (reflective blue slabs).
      groundPlane(K(0.40), 1, 95, [180, 230], [0.30, 0.50, 0.70]);
      groundPlane(K(0.24), -1, 90, [140, 170], [0.28, 0.48, 0.68]);
      // A few lakeside broadleaf clusters.
      for (const [s, sd] of [[0.40, 1], [0.24, -1]]) {
        for (let i = 0; i < 4; i++) tree(K(s + (i - 2) * 0.01), sd, 70 + i * 8, 12 + i, LEAF_L);
      }

      // =====================================================================
      // 6. MILAN SKYLINE — distant faint towers on the horizon (s~0.96 R far)
      // =====================================================================
      const kmilan = K(0.96);
      for (let i = 0; i < 7; i++) {
        building(kmilan, 1, 210 + i * 28, 16, 36 + i * 10, 16,
          { wall: [0.60 + i * 0.02, 0.64 + i * 0.02, 0.70 + i * 0.02], window: [0.50, 0.54, 0.60] });
      }

      // =====================================================================
      // 7. CONTINUOUS FOREST BACKDROP — unbroken low canopy wall ringing the lap
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // [extraRadius, count, ridgeLen, ridgeW, hMin, hVar, colour]
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 58, 92, 26, 10, 6, [0.16, 0.36, 0.20]],   // near treeline, gapless
        [185, 50, 110, 30, 12, 7, [0.13, 0.33, 0.17]],  // mid forest band
        [260, 42, 132, 34, 14, 8, [0.11, 0.30, 0.15]],  // far hazed forest wall
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 28;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // =====================================================================
      // 8. ADDED SCENERY IMPROVEMENTS
      // =====================================================================

      // 8a. Denser front pine pass — fills the gaps between Rank A pines.
      every(9, (k) => {
        const h = hash(k * 43 + 7);
        const s = k / n;
        if (h < 0.05) return;                       // only tiny gaps allowed
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 8 + h * 5, 16 + h * 10, PINE);
        if (h > 0.45) pine(k, -side, 9 + h * 6, 15 + h * 9, PINE_L);
      });

      // 8b. Expand Parabolica grandstand — two extra sections widening the arc.
      grandstand(0.875, 1, 14, 80, [0.53, 0.56, 0.60], [0.72, 0.30, 0.26]);
      grandstand(0.935, 1, 14, 80, [0.53, 0.56, 0.60], [0.72, 0.30, 0.26]);

      // 8c. Red/white kerb stripes on start straight (pit-wall side, s=0.0–0.07).
      {
        const kerbR = [0.88, 0.18, 0.14], kerbW = [0.92, 0.92, 0.90];
        for (let i = 0; i < 15; i++) {
          const sFrac = i * (0.07 / 15);
          const k = K(sFrac);
          const a = anchor(k, -1, 5);
          const col = (i % 2 === 0) ? kerbR : kerbW;
          addBox(a.out || api.out, vadd(a.c, a.u, 0.2), [0.8, 0.4, 3.5], col, [a.r, a.u, a.t]);
        }
      }

      // 8d. Tifosi banner billboards near the start (side=1, Italian red atmosphere).
      billboard(K(0.01), 1, 30, 14, 6, [0.90, 0.15, 0.15]);
      billboard(K(0.02), 1, 30, 14, 6, [0.90, 0.15, 0.15]);

      // Pine silhouettes breaking the near canopy edge into a tree texture.
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * 6.2832, h = hash(i * 11 + 5);
        const r = rad + 100 + h * 55;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a, 20, 20, 15 + h * 11, PINE_D);
      }
    },
  }
  );
})();
