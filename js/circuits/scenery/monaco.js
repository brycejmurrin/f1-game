/* Apex 26 — MONACO scenery (data only), split out of js/circuits/monaco.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["monaco"] =
  function (api) {
      const { out, MAT, def, track, n, ds, px, py, pz, hw, pyMin, terrainYAt, addBox, addPrism, addCyl, addCone, addFrustum, addPyramid, modelGroup, overheadSpan, lampPost, waterSurface, waterField, groundedSegments, onTrack, hash, upOf, vadd, anchor, along, place, prop, building, tower, palm, tree, bush, hedge, grandstand, grandstandEx, scaffoldStand, bleacher, cypress, stonePine, plane, broadcastCompound, cameraTower, billboard, gantry, marshalPost, fence, guardrail, wall, cityFront, backdrop, bakedModel } = api;
      const K = (s) => Math.round(s * n) % n;
      const KR = (s) => TrackSpace.sourceNodeToRacing(def, K(s), n);
      /* KOLD: OLD-RACING frac -> current racing node. Most of this file's raw
         px/rx/tx readers were authored when startFrac was 0.28; 7a17351 moved
         the origin to 0.2516 and renumbered the control points, but raw index
         users never got the renumbering. NOT the engine's own shift: the
         engine's def._sceneryShift is ARC-LENGTH (tracks.js `dlen[j*SUB]/total`,
         -51 nodes here) and governs the wrapped helpers; this INDEX shift
         (-24 nodes) is an empirical calibration of the raw px/rx/tx readers.
         Measured 2026-09-01 in the Node build: every one of the seven KOLD
         sites sits closer to its measured corner under this shift than under
         the arc shift, which would move each 108 m earlier and drop the tunnel
         onto Portier — keep it. MEASURED racing positions (curvature
         peak-pick, build 1188): Ste Devote 0.056 | hairpin (r=10.1m) 0.383 |
         Portier 0.434 | tunnel 0.449-0.524 | chicane 0.641 | pool ~0.77 |
         Rascasse 0.88. The authored fracs in this file do NOT equal these. */
      const _offNew = Math.round((((def.startFrac % 1) + 1) % 1) * n) % n;
      const _offOld = Math.round(((((def.sceneryStartFrac ?? def.startFrac) % 1) + 1) % 1) * n) % n;
      const _kShift = ((def.reverse ? _offNew - _offOld : _offOld - _offNew) % n + n) % n;
      const KOLD = (s) => (K(s) + _kShift) % n;
      const racingSide = (side) => def.reverse ? -side : side;

      const CREAM  = [0.95, 0.90, 0.78];
      const TERRA  = [0.80, 0.45, 0.32];
      const OCHRE  = [0.85, 0.70, 0.45];
      const DUSTY  = [0.88, 0.82, 0.78];
      const STONE  = [0.78, 0.74, 0.62];
      const SAGE   = [0.72, 0.78, 0.68];
      const PASTELS = [CREAM, TERRA, OCHRE, DUSTY, STONE, SAGE,
                       [0.86, 0.78, 0.74], [0.78, 0.85, 0.82]];
      const WIN    = [0.20, 0.30, 0.36];
      const ARMCO  = [0.70, 0.72, 0.74];
      // Warm emissive window colour — reads as lit interior at dusk/night
      const WINLIT = [0.95, 0.88, 0.55];
      // Street lamp sodium-yellow cap
      const LAMP   = [1.0, 0.90, 0.60];

      // Cream/ochre canyon palette only (no terra/sage noise for the street wall)
      const CANYON = [CREAM, OCHRE, DUSTY, [0.92, 0.86, 0.72]];
      const { pastelStreetRow } = api;

      // ── Continuous Armco lining both sides — tight street feel ───────────
      // 1.2 m leaves the collision limit just outside the authored 5 m road,
      // instead of narrowing the usable tarmac while remaining Monaco-tight.
      // FULL_LAP stops one node short of 1.0, not 1.0 itself. This circuit is
      // `sceneryCoordinates: "source"` + `reverse: true`; TrackSpace.range()
      // maps a SOURCE frac through toRacingFrac(def, s) = wrap01(phi - s), and
      // wrap01(1.0) === wrap01(0.0), so an exact [0.0, 1.0] source range maps
      // BOTH ends to the identical racing frac (phi) before sceneryRange()'s
      // own "whole lap" guard (`|s1-s0| >= 1-1e-9`) ever sees it — the guard
      // checks the racing-space span, which is already zero by then, not the
      // 1.0 the caller wrote. along()'s k0===k1 wraparound then duplicates
      // exactly one node's wall geometry, and because this circuit's origin
      // is shifted, that node lands mid-lap (k=156, the Casino/Massenet
      // climb) instead of the harmless start/finish it would be on a
      // straight source-space circuit — a same-facing, zero-gap coplanar
      // pair (17.3 m2, 0.0 mm) at that exact spot. Measured: reverting only
      // the Casino block's KOLD+raw-frame fix (which is unrelated and
      // correct) does not change this pair; disabling each wall() call in
      // isolation does, one node-fraction short of a full lap is enough to
      // break the alias without leaving a visible gap (along()'s own station
      // spacing here is ~8 m, four times this shim).
      const FULL_LAP = 1 - 1 / n;
      wall(0.0, FULL_LAP, -1, 1.2, 0.8, ARMCO, 0.22);
      wall(0.0, FULL_LAP, 1, 1.2, 0.8, ARMCO, 0.22);
      guardrail(0.02, 0.07, -1, 0.5, ARMCO);

      // Sainte Devote chapel (s=0.05, R mid)
      {
        const k = K(0.05), a = anchor(k, 1, 18);
        const b = [a.r, a.u, a.t];
        modelGroup("monaco-sainte-devote", {
          center: vadd(a.c, a.u, 5.6), size: [9.4, 11.2, 11.2], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4), [9, 8, 11], CREAM, b);
          addPrism(stage, vadd(a.c, a.u, 9.2), [9.4, 3.2, 11.2], [0.32, 0.22, 0.20], b);
        }, { required: true });
      }

      bleacher(0.055, 0.078, 1, 7, {
        rows: 6, rise: 0.68, setback: 0.85,
        frameCol: [0.70, 0.72, 0.75], plankCol: [0.74, 0.72, 0.68],
        crowd: [[0.86, 0.84, 0.80], [0.30, 0.36, 0.52], [0.72, 0.28, 0.24], OCHRE],
        density: 0.62,
      });

      {
        // Hand-spaced Beau Rivage climb (L) — step helper would over-fill.
        const spots = [
          [0.09, -1], [0.13, -1], [0.16, -1],                 // L inland climb
          [0.10,  1], [0.135, 1], [0.17, 1], [0.22, 1], [0.255, 1], // R street wall
        ];
        for (let i = 0; i < spots.length; i++) {
          const [sf, sd] = spots[i];
          const k = K(sf);
          const hv = hash(k * 5.3 + sd * 0.9);
          const w = 10 + hv * 8;
          const h = 14 + hash(k * 9.1 + sd) * 12;
          const gap = 2 + hash(k * 2.7) * 2;   // 2–4 m
          building(k, sd, gap, w, h, 10,
            { kind: ["tiered", "notch", "chevron", "podium"][i % 4],
              wall: CANYON[i % CANYON.length], window: WIN, floor: 3.5 + hv,
              lit: true, windowCol: WINLIT });
        }
      }
      for (let i = 0; i < 6; i++) {
        const k = K(0.09 + i * 0.028);
        const hv = hash(k * 3.1 + 7);
        backdrop(k, -1, 44 + hv * 16, [60 + hv * 28, 24 + hv * 18, 52],
                 [0.20 + hv * 0.05, 0.42 + hv * 0.06, 0.22]);
        backdrop(k, -1, 78 + hv * 20, [72 + hv * 30, 36 + hv * 22, 58],
                 [0.16 + hv * 0.04, 0.34 + hv * 0.05, 0.18]);
      }
      // Far towers on LEFT — set at 80m+, clear of hillside mounds.
      for (const [sf, ht] of [[0.10, 60], [0.15, 68], [0.20, 56], [0.24, 72]]) {
        const k = K(sf);
        const tDist = 84 + hash(k * 5) * 14;
        const a = anchor(k, -1, tDist);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          tower(k, -1, tDist, 14 + hash(k * 3) * 4, ht,
            { col: PASTELS[K(sf) % PASTELS.length], cap: true, capCol: [0.55, 0.58, 0.56], mast: 5 });
          const bW = 14 + hash(k * 3) * 4;
          addBox(out, vadd(a.c, a.u, ht * 0.62), [bW * 1.15, ht * 0.14, bW * 1.15],
                 WINLIT, [a.r, a.u, a.t]);
        }
      }

      {
        const k = KOLD(0.20);
        const rr = [track.rx[k], track.ry[k], track.rz[k]];
        const uu = upOf(track, k);
        const tt = [track.tx[k], track.ty[k], track.tz[k]];
        const dist = 36;   // dist clears the 44-wide mass off the track (inner face ~14m back)
        const oo = -1 * (hw[k] + dist);
        const cxw = px[k] + rr[0] * oo, czw = pz[k] + rr[2] * oo;
        const gy = terrainYAt(cxw, czw);
        const a = { c: [cxw, (gy == null ? py[k] : gy) - 0.3, czw], r: rr, u: uu, t: tt };
        if (!onTrack(a.c[0], a.c[2], 26)) {
          const b = [a.r, a.u, a.t];
          // Beaux-Arts cream limestone + oxidised-copper roofs (Garnier/Dutrou).
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, 13), [44, 26, 30], CREAM, b);
          for (const o of [-13, 13]) {
            addBox(out, vadd(vadd(a.c, a.t, o), a.u, 30), [9, 18, 9], [0.90, 0.85, 0.74], b);
          }
          out._mat = MAT.METAL;
          addBox(out, vadd(a.c, a.u, 28), [46, 4, 32], [0.30, 0.45, 0.38], b);
          for (const o of [-13, 13]) {
            addPrism(out, vadd(vadd(a.c, a.t, o), a.u, 40.5), [9.2, 5, 9.2], [0.28, 0.42, 0.36], b);
          }
          // window bands + lit evening glow
          out._mat = MAT.GLASS;
          for (let f = 0; f < 4; f++) {
            addBox(out, vadd(a.c, a.u, 5 + f * 6), [44.4, 2.2, 30.4], WIN, b);
            addBox(out, vadd(a.c, a.u, 6.0 + f * 6), [44.6, 1.1, 30.6], WINLIT, b);
          }
          out._mat = MAT.METAL;
          for (const o of [-8, 8]) {
            const lc = vadd(vadd(a.c, a.t, o), a.u, 0);
            addCyl(out, lc, 0.10, 5.5, [0.72, 0.74, 0.76], 5, b);
            addCyl(out, vadd(lc, a.u, 5.3), 0.55, 0.18, LAMP, 6, b);
          }
          out._mat = 0;
        }
      }

      {
        const k = K(0.21);
        const HOTEL = [0.92, 0.88, 0.82];
        const a = anchor(k, 1, 14.5);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          // Cream limestone palace + terracotta mansard (Hôtel de Paris, 1864).
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, 20), [22, 40, 18], HOTEL, b);
          addBox(out, vadd(vadd(a.c, a.t, 14), a.u, 14), [14, 28, 12], HOTEL, b);
          out._mat = MAT.GLASS;
          for (let f = 0; f < 7; f++) {
            addBox(out, vadd(a.c, a.u, 5 + f * 5), [22.3, 1.8, 18.3], WIN, b);
          }
          for (let f = 0; f < 5; f++) {
            addBox(out, vadd(vadd(a.c, a.t, 14), a.u, 4 + f * 5), [14.3, 1.6, 12.3], WIN, b);
          }
          out._mat = MAT.ROOF;
          addBox(out, vadd(a.c, a.u, 41), [23, 3.2, 19], OCHRE, b);
          out._mat = 0;
        }
      }

      {
        const k = K(0.228);
        const CAFE  = [0.94, 0.90, 0.83];
        const AWN_R = [0.68, 0.16, 0.16], AWN_W = [0.93, 0.92, 0.88];
        // Raw primitives, not building() — same reason as the Hotel de Paris
        // opposite: the `city` exclusion over s 0.17-0.24 drops building() here
        // silently, and this landmark had the identical floating-decoration bug
        // (awnings, parasols and barrel roof hanging at ~20 m over nothing).
        // dist 14, not 11.5. At 11.5 the onTrack(...,12) guard below
        // rejected the WHOLE block and this landmark drew nothing at all —
        // verified by vertex count, which is the only thing that catches a
        // silently-skipped guard: verify-track prints OK either way.
        const a = anchor(k, 1, 14);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          // Cream pavilion, glazed barrel, terracotta cornice, canvas terrace.
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, 9.5), [16, 19, 34], CAFE, b);
          out._mat = MAT.GLASS;
          for (let f = 0; f < 4; f++) {
            addBox(out, vadd(a.c, a.u, 3.5 + f * 4), [16.3, 1.6, 34.3], WIN, b);
          }
          // addCyl extrudes along basis[1]; the glazed barrel runs the roof's
          // LENGTH (t), ring in the r-u plane — the old basis sent 32 m of
          // glass across-track out of the facade.
          addCyl(out, vadd(vadd(a.c, a.t, -16), a.u, 21.4), 3.6, 32, [0.72, 0.80, 0.84], 9,
            [a.r, a.t, a.u]);
          out._mat = MAT.ROOF;
          addBox(out, vadd(a.c, a.u, 19.6), [17, 1.4, 35], OCHRE, b);
          for (let i = 0; i < 7; i++) {
            const p = vadd(vadd(a.c, a.t, (i - 3) * 4.6), a.r, -8.5);
            out._mat = MAT.FABRIC;
            addBox(out, vadd(p, a.u, 3.5), [5.2, 0.35, 4.2],
              i % 2 ? AWN_R : AWN_W, b);
            addCone(out, vadd(vadd(p, a.r, -1.6), a.u, 2.1), 1.5, 0.7, AWN_W, 7, b);
            out._mat = MAT.METAL;
            addCyl(out, p, 0.10, 3.4, [0.66, 0.64, 0.60], 4, b);
            addCyl(out, vadd(p, a.r, -1.6), 0.08, 2.3, [0.72, 0.70, 0.66], 4, b);
          }
          out._mat = 0;
        }
      }

      {
        const k = K(0.185), a = anchor(k, -1, 11);
        if (!onTrack(a.c[0], a.c[2], 7)) {
          const b = [a.r, a.u, a.t];
          const STONE = [0.82, 0.80, 0.74], BRONZE = [0.34, 0.30, 0.20];
          out._mat = MAT.STONE;
          addBox(out, vadd(a.c, a.u, 0.22), [3.4, 0.45, 3.4], STONE, b);
          addBox(out, vadd(a.c, a.u, 0.72), [2.6, 0.55, 2.6], STONE, b);
          addBox(out, vadd(a.c, a.u, 2.05), [1.5, 2.1, 1.5], [0.86, 0.84, 0.78], b);
          out._mat = MAT.METAL;
          // Seated composer: torso, head, and the cloak mass behind him.
          addBox(out, vadd(a.c, a.u, 3.75), [1.0, 1.3, 0.9], BRONZE, b);
          addCyl(out, vadd(a.c, a.u, 4.45), 0.26, 0.42, BRONZE, 6, b);
          addBox(out, vadd(vadd(a.c, a.u, 3.6), a.r, 0.5), [0.4, 1.5, 1.1], BRONZE, b);
          out._mat = 0;
        }
      }

      // Casino Square gardens — formal hedges, palms, fountain
      hedge(0.195, 0.235, -1, 7, 1.6, [0.22, 0.42, 0.20]);
      for (let i = 0; i < 10; i++) {
        const k = K(0.20 + i * 0.0035);
        place(k, -1, 3, [3, 1.2, 4], [0.55, 0.55, 0.58]);
        prop(k, -1, 3, [2, 0.5, 2], [0.25, 0.45, 0.22]);
        palm(k, i % 2 ? 1 : -1, 4, 9, [0.25, 0.45, 0.22]);
      }
      {
        const k = K(0.215), a = anchor(k, -1, 14);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addCyl(out, vadd(a.c, a.u, 0.5), 3.0, 1.0, [0.70, 0.72, 0.76], 10, b);
          addCyl(out, vadd(a.c, a.u, 1.6), 0.5, 2.2, [0.78, 0.80, 0.84], 8, b);
          addCyl(out, vadd(a.c, a.u, 3.4), 1.2, 0.4, [0.85, 0.90, 0.96], 8, b);
        }
        for (let j = 0; j < 6; j++) bush(K(0.198 + j * 0.007), -1, 9 + (j % 2) * 3, [0.24, 0.44, 0.22]);
      }

      for (let i = 0; i < 4; i++) {
        const k = K(0.29 + i * 0.035);
        const hv = hash(k * 4.1 + 3);
        backdrop(k, -1, 46 + hv * 18, [65 + hv * 30, 20 + hv * 14, 50],
                 [0.22 + hv * 0.04, 0.40 + hv * 0.05, 0.24]);
      }

      // ── FAIRMONT HAIRPIN HOTEL (s=0.40, R) ──────────────────────────────
      {
        // Gaps 9-11, not 4-5: a 20-30 m mass at gap 4 beside a 10 m-radius
        // loop lays its podium courses ACROSS the street on the inside of the
        // hairpin — measured as flat wall bands 0.1-1.0 m above the tarmac at
        // racing 0.376-0.390 ("white bars lying on the road"). The real hotel
        // reads close because it is TALL, not because its plinth is on the
        // racing line.
        const k = K(0.40);
        building(k, 1, 9, 20, 48, 30,
          { kind: "notch", wall: [0.90, 0.88, 0.82], window: WIN, floor: 6, lit: true, windowCol: WINLIT, setback: true });
        building(K(0.385), 1, 10, 22, 40, 18,
          { kind: "chevron", wall: CREAM, window: WIN, floor: 6, lit: true, windowCol: WINLIT });
        building(K(0.415), 1, 10, 22, 42, 18,
          { kind: "podium", wall: [0.88, 0.84, 0.76], window: WIN, floor: 6, lit: true, windowCol: WINLIT });
      }

      {
        // KOLD, not K and not KR. This block was authored against the RAW
        // racing arrays as they were when startFrac was 0.28 — pre-7a17351,
        // when array index == authored frac. That commit moved the origin to
        // 0.2516 and renumbered the control points by (offNew - offOld); raw
        // index users like this block never got the same renumbering, so the
        // walls slid ~0.028 laps off the geometric tunnel (and off their own
        // roof, whose overheadSpan path DID get shifted). Same formula the
        // engine uses at tracks.js (`j = offNew - iOld`), same result: the
        // measured hairpin sits at racing 0.383 and the corner sequence puts
        // the tunnel at ~0.48-0.56, which is exactly KOLD(0.51..0.585).
        // 0.478..0.553 (old-racing) => racing 0.449..0.524: entry ~50 m after
        // Portier (measured apex 0.434), a 247 m bore, exit with a run down to
        // the chicane (0.641). Real Monaco: the tunnel starts immediately after
        // Portier and exits 188 m before the Nouvelle Chicane — entry-after-
        // Portier is the constraint worth matching; the game's Portier->chicane
        // gap is 170 m longer than the real one, so the exit run stretches.
        const TUN0 = 0.478, TUN1 = 0.553;
        const tunS = KOLD(TUN0), tunE = KOLD(TUN1);
        const tunLen = ((tunE - tunS) + n) % n;
        const step = Math.max(2, Math.round(8.0 / ds));
        const dz = ds * step;                    // station pitch (~8 m)
        // Tunnel palette — sooty concrete, not the flat slate the lid used.
        const VAULT   = [0.25, 0.24, 0.26];      // springing course, darkest
        const VAULT2  = [0.31, 0.30, 0.32];      // mid haunch
        const VAULT3  = [0.38, 0.37, 0.39];      // crown, washed by the lamps
        const WALLHI  = [0.60, 0.58, 0.54];      // upper wall panel
        const WALLLO  = [0.17, 0.17, 0.19];      // tyre-soot plinth
        const DUCT    = [0.40, 0.41, 0.43];      // cable tray
        const RIB     = [0.29, 0.28, 0.30];      // pilaster
        const LUM     = [1.36, 1.30, 1.08];      // luminaire line
        const STUD    = [1.12, 1.02, 0.66];      // wall-base delineator
        const EXITGRN = [0.30, 1.24, 0.52];      // emergency-exit sign
        const KERB    = [0.44, 0.43, 0.41];      // service kerb over the verge
        const ROCK    = [0.42, 0.40, 0.35];      // headland above the bore
        const SCRUB   = [0.34, 0.40, 0.29];
        const LIVERY = [[0.82, 0.16, 0.18], [0.10, 0.26, 0.62], [0.94, 0.90, 0.30],
                        [0.92, 0.92, 0.94], [0.14, 0.52, 0.32]];

        const lastStation = Math.floor((tunLen - 1) / step);
        let si = 0;
        for (let i = 0; i < tunLen; i += step, si++) {
          const k = (tunS + i) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const b = [r, u, t];
          const base = [px[k], py[k], pz[k]];
          const cw = hw[k] * 2 + 5;
          const lat = (o, h) => vadd([px[k] + r[0] * o, py[k], pz[k] + r[2] * o], u, h);

          // ── VAULT ────────────────────────────────────────────────────────
          // Crown highest, springing lowest, so the soffit steps DOWN toward the
          // walls and the section reads as an arch from the cockpit. Band depths
          // differ (1.06 / 1.02 / 1.10) so no two bands share a front/back plane
          // — same-facing coplanar pairs are exactly what the z-fighting ratchet
          // in tests/unit/coplanar-faces.test.mjs exists to catch.
          overheadSpan({
            id: `monaco-tunnel-roof-${k}`, frac: k / n, rawFrac: true, clearance: 6.45,
            thickness: 1.35, depth: dz * 1.06, span: cw * 0.34,
            color: VAULT3, supports: false, required: true,
          });
          for (const sd of [-1, 1]) {
            const side = sd < 0 ? "l" : "r";
            overheadSpan({
              id: `monaco-tunnel-haunch-${side}-${k}`, frac: k / n, rawFrac: true, clearance: 6.05,
              thickness: 1.75, depth: dz * 1.02, span: cw * 0.28, offset: sd * cw * 0.26,
              color: VAULT2, supports: false, required: true,
            });
            overheadSpan({
              id: `monaco-tunnel-springing-${side}-${k}`, frac: k / n, rawFrac: true, clearance: 5.55,
              thickness: 2.25, depth: dz * 1.10, span: cw * 0.32, offset: sd * cw * 0.44,
              color: VAULT, supports: false, required: true,
            });
            overheadSpan({
              id: `monaco-tunnel-lamp-${side}-${k}`, frac: k / n, rawFrac: true, clearance: 5.70,
              thickness: 0.90, depth: dz * 0.99, span: cw * 0.075, offset: sd * cw * 0.155,
              color: LUM, supports: false, required: true,
            });
            // …and the light it actually casts. Registered every OTHER station
            // (16 m) per side so the pair of runs stays well inside the shader's
            // 32-light budget while still reading as a continuous ceiling.
            // `always` because a tunnel's lamps are on at noon — and this bore is
            // in permanent shadow, so without it the one part of Monaco the sun
            // never reaches would be the one part with no light at all. Aimed
            // straight DOWN the vault (the default near-lane aim is for a mast
            // standing beside the road, and would rake these into the wall).
            if (si % 2 === 0) {
              lampPost({
                id: `monaco-tunnel-luminaire-${side}-${k}`, k, side: sd,
                pos: lat(sd * cw * 0.155, 5.66), aim: [-u[0], -u[1], -u[2]],
                kind: "fluor", always: true, energy: 0.62, radius: 21,
              });
            }
          }

          // ── SIDE WALLS ───────────────────────────────────────────────────
          // Inner faces sit at hw+1.35..1.45 — clear of the armco run (which
          // ends at hw+1.31) and comfortably outside hw, so nothing here meets
          // the road-footprint guard. Each course is set a few centimetres
          // proud of the one above it: that reveal is what stops three stacked
          // boxes reading as one flat slab (and keeps their faces off a shared
          // plane).
          // (Outer faces are pulled in to ~hw+2.35: they are buried in the
          // headland and never drawn, but Monaco's streets run so close in world
          // space that the hairpin hotel's wall sections land within millimetres
          // of the tunnel's back face and z-fight it.)
          for (const sd of [-1, 1]) {
            addBox(out, lat(sd * (hw[k] + 1.92), 0.61),  [0.99, 1.22, dz * 1.12], WALLLO, b);
            addBox(out, lat(sd * (hw[k] + 1.89), 2.95),  [0.88, 3.30, dz * 1.02], WALLHI, b);
            addBox(out, lat(sd * (hw[k] + 1.88), 5.08),  [1.06, 0.96, dz * 1.07], VAULT,  b);
            // Cable tray / service duct running the length at shoulder height.
            addBox(out, lat(sd * (hw[k] + 1.30), 3.95),  [0.34, 0.30, dz * 1.01], DUCT,   b);
            addBox(out, lat(sd * (hw[k] + 1.36), 1.42),  [0.10, 0.13, 0.34],      STUD,   b);
            // Livery panel on the armco face.
            addBox(out, lat(sd * (hw[k] + 1.34), 0.46),  [0.06, 0.58, dz * 0.72],
                   LIVERY[(si + (sd < 0 ? 0 : 2)) % LIVERY.length], b);
            addBox(out, lat(sd * (hw[k] + 0.85), 0.15),  [1.10, 0.30, dz * 1.03], KERB,   b);
            // Pilaster rib every other station, starting above the armco.
            if (si % 2 === 0)
              addBox(out, lat(sd * (hw[k] + 1.28), 3.25), [0.36, 4.70, 0.52],     RIB,    b);
            // Emergency exit + sign every ~48 m.
            if (si % 6 === 3) {
              addBox(out, lat(sd * (hw[k] + 1.38), 1.95), [0.14, 2.10, 1.05], [0.26, 0.28, 0.30], b);
              addBox(out, lat(sd * (hw[k] + 1.34), 1.95), [0.07, 1.90, 0.86], [0.19, 0.21, 0.23], b);
              addBox(out, lat(sd * (hw[k] + 1.36), 3.34), [0.09, 0.30, 0.78], EXITGRN, b);
            }
          }

          if (si % 4 === 0 && si + 4 <= lastStation) {
            const kc = (k + step * 2) % n;
            const ridge = 3.0 + hash(k * 5.1) * 2.6;
            overheadSpan({
              id: `monaco-tunnel-overburden-${k}`, frac: kc / n, rawFrac: true, clearance: 7.80,
              thickness: 5.20, depth: dz * 4.06, span: cw * 1.04,
              color: ROCK, supports: false, required: true,
            });
            overheadSpan({
              id: `monaco-tunnel-headland-${k}`, frac: kc / n, rawFrac: true, clearance: 13.00,
              thickness: ridge, depth: dz * 4.02, span: cw * (0.66 + hash(k * 2.7) * 0.22),
              color: hash(k * 1.9) > 0.62 ? SCRUB : ROCK, supports: false, required: true,
            });
          }
        }

        const tunnelPortal = (frac, tag) => {
          const k = KOLD(frac);  // raw-array reader — same KOLD rule as tunS/tunE
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const b = [r, u, t];
          const cw = hw[k] * 2 + 5;
          out._mat = MAT.STONE;
          for (const sd of [-1, 1]) {
            const c = [px[k] + r[0] * sd * (hw[k] + 2.6), py[k], pz[k] + r[2] * sd * (hw[k] + 2.6)];
            addBox(out, vadd(c, u, 4.70), [2.60, 9.40, 3.12], STONE, b);
            addBox(out, vadd(c, u, 9.70), [3.20, 0.80, 3.56], [0.70, 0.68, 0.62], b);
          }
          out._mat = 0;
          overheadSpan({
            id: `monaco-tunnel-portal-${tag}-arch`, frac: k / n, rawFrac: true, clearance: 8.00,
            thickness: 1.70, depth: 2.60, span: cw * 1.10,
            color: [0.72, 0.70, 0.64], supports: false, required: true,
          });
          overheadSpan({
            id: `monaco-tunnel-portal-${tag}-face`, frac: k / n, rawFrac: true, clearance: 9.70,
            thickness: 4.20, depth: 2.00, span: cw * 0.98,
            color: ROCK, supports: false, required: true,
          });
          overheadSpan({
            id: `monaco-tunnel-portal-${tag}-crest`, frac: k / n, rawFrac: true, clearance: 13.90,
            thickness: 3.20, depth: 1.60, span: cw * 0.72,
            color: SCRUB, supports: false, required: true,
          });
          overheadSpan({
            id: `monaco-tunnel-portal-${tag}-sign`, frac: k / n, rawFrac: true, clearance: 6.90,
            thickness: 0.55, depth: 0.30, span: cw * 0.13,
            color: [0.94, 0.92, 0.86], supports: false, required: true,
          });
          for (const sd of [-1, 1]) {
            const c = [px[k] + r[0] * sd * (hw[k] + 2.6), py[k], pz[k] + r[2] * sd * (hw[k] + 2.6)];
            const head = vadd(vadd(c, r, -sd * 1.15), u, 8.30);
            addBox(out, vadd(head, u, 0.55), [0.34, 1.10, 0.34], [0.22, 0.22, 0.25], b);   // stalk
            addBox(out, head, [1.15, 0.62, 0.85], [0.34, 0.35, 0.37], b);                  // cowl
            addBox(out, vadd(head, u, -0.30), [0.98, 0.16, 0.70], [1.24, 1.26, 1.34], b);  // lens
            lampPost({
              id: `monaco-tunnel-portal-${tag}-flood-${sd < 0 ? "l" : "r"}`, k, side: sd,
              pos: vadd(head, u, -0.30), aim: [-u[0] * 0.72 + r[0] * sd * 0.69,
                                               -u[1] * 0.72 + r[1] * sd * 0.69,
                                               -u[2] * 0.72 + r[2] * sd * 0.69],
              kind: "halide", always: true, energy: 0.85, radius: 26,
            });
            // Transition-zone luminaire, hung inside the reveal.
            lampPost({
              id: `monaco-tunnel-portal-${tag}-mouth-${sd < 0 ? "l" : "r"}`, k, side: sd,
              pos: vadd([px[k] + r[0] * sd * cw * 0.16, py[k], pz[k] + r[2] * sd * cw * 0.16], u, 5.55),
              aim: [-u[0], -u[1], -u[2]],
              kind: "fluor", always: true, energy: 1.30, radius: 27,
            });
          }
        };
        tunnelPortal(TUN0, "entry");
        tunnelPortal(TUN1, "exit");
      }

      pastelStreetRow(0.595, 0.655, 1, 4, {
        palette: [CREAM, DUSTY, OCHRE, STONE],
        minH: 12, maxH: 20, depth: 8, step: 20,
        window: WIN, windowCol: WINLIT, lit: true,
      });
      broadcastCompound(K(0.615), 1, 16, { vans: 3, dishes: 2, mastH: 12 });
      cameraTower(K(0.625), -1, 26, { h: 16, boom: 1.4 });   // clear of the quay scaffold stand (9-19 m)

      // Distant landmark towers behind harbour apartments.
      for (let i = 0; i < 5; i++) {
        const k = K(0.61 + i * 0.076);
        const hv = hash(k * 2.9 + i);
        const h = 40 + hv * 30;
        backdrop(k, 1, 48 + hv * 20, [22 + hv * 12, h, 18], PASTELS[(i * 3) % PASTELS.length]);
      }

      {
        const k = KOLD(0.665);
        const gap = 150;
        const rr = [track.rx[k], track.ry[k], track.rz[k]];
        const uu = upOf(track, k);
        const cxw = px[k] - rr[0] * gap, czw = pz[k] - rr[2] * gap;
        const gy = terrainYAt(cxw, czw);
        const a = { c: [cxw, Math.min(gy == null ? py[k] : gy, py[k]) - 2, czw],
                    r: rr, u: uu, t: [track.tx[k], track.ty[k], track.tz[k]] };
        if (!onTrack(a.c[0], a.c[2], 30)) {
          const b = [a.r, a.u, a.t];
          const ROCK = [0.48, 0.46, 0.40], ROCK2 = [0.54, 0.52, 0.44];
          // Rock cliff climbing from the waterline (organic frustum tiers).
          // addFrustum/addBox anchor at the BASE (js/track/geom.js); these
          // offsets were authored as centres, floating the whole stack 21 m.
          addFrustum(out, vadd(a.c, a.u, 0), 46, 32, 42, ROCK, 8, b);
          addFrustum(out, vadd(a.c, a.u, 21), 32, 22, 16, ROCK2, 8, b);
          // Palace fortress crowning the rock — everything within the r=22 top.
          const py0 = 29;
          addFrustum(out, vadd(a.c, a.u, py0 + 10), 18, 12, 20, CREAM, 8, b);
          for (const sd of [-1, 1]) {
            addBox(out, vadd(vadd(a.c, a.r, sd * 10), a.u, py0 + 8), [7, 16, 14], [0.92, 0.88, 0.82], b);
            addCyl(out, vadd(vadd(a.c, a.r, sd * 13), a.u, py0 + 18), 2.0, 10, [0.72, 0.70, 0.66], 7, b);
          }
          addBox(out, vadd(a.c, a.u, py0 + 3), [24, 1.2, 26], [0.86, 0.85, 0.82], b);
          // lit palace windows (reads at any time of day as a warm accent)
          addBox(out, vadd(a.c, a.u, py0 + 16), [24.4, 3.6, 16], WINLIT, b);
        }
      }

      // ── HARBOUR WATER & QUAY ─────────────────────────────────────────────
      const SEA = [0.10, 0.34, 0.55], SEA2 = [0.13, 0.40, 0.60];
      // Low stone quay wall between track and water
      wall(0.585, 0.99, -1, 1.0, 1.4, [0.74, 0.70, 0.62], 1.0);

      // ── YACHT BUILDER ─────────────────────────────────────────────────────
      const yacht = (yc, b, u, r, t, sc, hullCol) => {
        yc = [yc[0], pyMin - 0.8 - 0.25 * sc, yc[2]];
        const HULL = hullCol || [0.97, 0.97, 0.99];
        const L = 22 * sc, W = 7 * sc;
        out._mat = MAT.METAL;
        addBox(out, vadd(yc, u, 1.6 * sc), [W, 3.0 * sc, L], HULL, b);
        addBox(out, vadd(yc, u, 0.4 * sc), [W * 0.82, 1.2 * sc, L * 0.96], [0.20, 0.30, 0.40], b);
        addBox(out, vadd(vadd(yc, t, L * 0.46), u, 1.8 * sc), [W * 0.6, 2.0 * sc, L * 0.16], HULL, b);
        const sup = vadd(yc, t, -L * 0.06);
        addBox(out, vadd(sup, u, 4.2 * sc), [W * 0.78, 2.6 * sc, L * 0.55], [0.90, 0.91, 0.94], b);
        out._mat = MAT.GLASS;
        addBox(out, vadd(sup, u, 5.8 * sc), [W * 0.74, 1.0 * sc, L * 0.58], [0.40, 0.55, 0.70], b);
        out._mat = MAT.METAL;
        addBox(out, vadd(sup, u, 6.8 * sc), [W * 0.6, 2.2 * sc, L * 0.40], [0.94, 0.95, 0.97], b);
        addBox(out, vadd(sup, u, 9.0 * sc), [W * 0.42, 1.8 * sc, L * 0.26], [0.84, 0.86, 0.90], b);
        addBox(out, vadd(sup, u, 9.95 * sc), [W * 0.5, 0.5 * sc, 0.6 * sc], [0.80, 0.82, 0.86], b);
        addCyl(out, vadd(sup, u, 10.0 * sc), 0.18 * sc, 5 * sc, [0.85, 0.85, 0.88], 4, b);
        addBox(out, vadd(vadd(yc, t, L * 0.30), u, 3.4 * sc), [W * 0.7, 0.7 * sc, 0.3 * sc], [0.85, 0.86, 0.9], b);
        out._mat = 0;
        // lit cabin windows
        addBox(out, vadd(sup, u, 5.9 * sc), [W * 0.75, 0.5 * sc, L * 0.59], WINLIT, b);
      };

      // Marina rows — two spaced ranks (reduced count for performance).
      for (let i = 0; i < 10; i++) {
        const s = 0.59 + i * 0.038;
        const k = K(s);
        const rank = i % 2;
        const dist = 18 + rank * 22 + hash(k * 7) * 4;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 12)) continue;
        const b = [a.r, a.u, a.t];
        const sc = 0.75 + hash(k * 9 + i) * 0.8;
        const hull = (i % 5 === 0) ? [0.18, 0.20, 0.26] : (i % 7 === 0) ? [0.85, 0.86, 0.9] : [0.97, 0.97, 0.99];
        yacht(vadd(a.c, a.r, -2 + (i % 3) * 4), b, a.u, a.r, a.t, sc, hull);
      }
      for (let i = 0; i < 6; i++) {
        const k = K(0.62 + i * 0.05), a = anchor(k, -1, 90 + hash(k) * 22);
        const mastBase = [a.c[0], pyMin - 0.8, a.c[2]];
        addCyl(out, mastBase, 0.25, 12 + hash(k * 3) * 6, [0.86, 0.86, 0.9], 4, [a.r, a.u, a.t]);
      }
      for (let i = 0; i < 4; i++) {
        const k = K(0.66 + i * 0.05), a = anchor(k, -1, 125);
        addBox(out, vadd(a.c, a.u, 0.5), [40, 2.6, 8], [0.70, 0.66, 0.58], [a.r, a.u, a.t]);
      }

      // ── QUAY BOLLARDS ─────────────────────────────────────────────────────
      {
        const BOLLARD = [0.74, 0.72, 0.70];
        const RING    = [0.68, 0.65, 0.60];
        for (let i = 0; i < 8; i++) {
          const k = K(0.61 + i * 0.012);
          const a = anchor(k, -1, 6 + (i % 2) * 1.5);
          if (!onTrack(a.c[0], a.c[2], 2.8)) {
            addCyl(out, vadd(a.c, a.u, 0), 0.28, 1.2, BOLLARD, 6, [a.r, a.u, a.t]);
            if (i % 2 === 0) addCyl(out, vadd(a.c, a.u, 0.9), 0.35, 0.24, RING, 7, [a.r, a.u, a.t]);
          }
        }
      }

      {
        pastelStreetRow(0.72, 0.82, 1, 3, {
          palette: [CREAM, TERRA, OCHRE, DUSTY],
          minH: 12, maxH: 20, depth: 9, step: 55,
          window: WIN, windowCol: WINLIT, lit: true,
        });
      }
      {
        const k = KOLD(0.80);
        const gap = hw[k] + 8;
        const rr = [track.rx[k], track.ry[k], track.rz[k]];
        const uu = upOf(track, k);
        const cxw = px[k] - rr[0] * gap, czw = pz[k] - rr[2] * gap;
        const gy = terrainYAt(cxw, czw);
        const a = { c: [cxw, (gy == null ? py[k] : gy) - 0.3, czw],
                    r: rr, u: uu, t: [track.tx[k], track.ty[k], track.tz[k]] };
        // EVERY corner of the 24x23 deck footprint, not just the centre. The
        // centre-only check passed while a deck EDGE lay across the hairpin
        // street — Monaco's folds put roads within metres of everything, so a
        // single-point guard on a 20 m prop is no guard at all. Measured: the
        // white 16 m edge read as a bar on the road at racing 0.389.
        const deckClear = [[12, 11.6], [12, -11.6], [-12, 11.6], [-12, -11.6]]
          .every(([dr, dt]) => !onTrack(cxw + a.r[0] * dr + a.t[0] * dt,
                                        czw + a.r[2] * dr + a.t[2] * dt, 3));
        if (deckClear && !onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.3), [14, 0.5, 22], [0.20, 0.60, 0.65], b);
          for (const o of [-7.4, 7.4]) addBox(out, vadd(vadd(a.c, a.r, o), a.u, 0.6), [1.4, 0.7, 23], [0.94, 0.94, 0.96], b);
          for (const o of [-11.4, 11.4]) addBox(out, vadd(vadd(a.c, a.t, o), a.u, 0.6), [16, 0.7, 1.4], [0.94, 0.94, 0.96], b);
          for (let j = 0; j < 4; j++) {
            const pc = vadd(vadd(a.c, a.r, -5 + (j % 2) * 10), a.t, -8 + j * 5);
            addCyl(out, vadd(pc, a.u, 1.3), 0.08, 2.6, [0.8, 0.8, 0.82], 4, b);
            addCone(out, vadd(pc, a.u, 3.0), 1.8, 0.8, j % 2 ? [0.9, 0.4, 0.35] : [0.95, 0.95, 0.97], 7, b);
          }
          addBox(out, vadd(vadd(a.c, a.r, 7.4), a.u, 2.2), [1.4, 0.4, 4], [0.85, 0.86, 0.88], b);
        }
      }
      // Waterfront terrace lip follows the sloping ground at every segment.
      // K(), NOT KR(): these fracs are OLD-RACING (Tabac->pool = racing
      // 0.68-0.78) and groundedSegments goes through the engine's SHIFT-ONLY
      // wrapper, whose SK() applies exactly the old->new renumbering (-24
      // nodes, the same delta as KOLD). KR() read them as SOURCE first, so the
      // points landed on the Portier/hairpin bends where the straight chord
      // between two quay points 66 m apart CUT ACROSS THE ROAD — measured as a
      // 14 x 0.8 m lip 0.28 m above the street at racing 0.389, the last white
      // bar on the hairpin.
      groundedSegments({
        id: "monaco-tabac-terrace",
        points: Array.from({ length: 6 }, (_, i) => ({
          k: K(0.71 + i * 0.02), side: racingSide(1), dist: 18,
        })),
        width: 0.8, height: 0.8, color: [0.88, 0.86, 0.80],
      });

      cityFront(0.87, 0.95, 1, 9, {
        minH: 10, maxH: 16, depth: 7, step: 18,
        palette: [CREAM, STONE, DUSTY, OCHRE],
        lit: true, windowCol: WINLIT,
      });
      {
        const houses = [
          ["kenney_sub_building-type-a", 0.88, 1, 22],
          ["kenney_sub_building-type-c", 0.91, 1, 24],
          ["kenney_sub_building-type-h", 0.94, 1, 23],
          ["kenney_sub_building-type-k", 0.89, -1, 16],
        ];
        for (const [id, s, side, dist] of houses) {
          if (!bakedModel(id, K(s), side, dist, { scale: 1.15 }))
            building(K(s), side, dist, 12, 10, 10,
              { kind: "slab", wall: CREAM, window: WIN, floor: 3 });
        }
        bakedModel("kenney_sub_planter", K(0.90), 1, 7, { scale: 1.2 });
      }
      guardrail(0.88, 0.95, 1, 1.0, ARMCO);

      {
        const k = K(0.905);
        const RASCASSE_WALL = [0.86, 0.80, 0.62];
        const aBldg = anchor(k, -1, 9);
        if (!onTrack(aBldg.c[0], aBldg.c[2], 9)) {
          const b = [aBldg.r, aBldg.u, aBldg.t];
          addBox(out, vadd(aBldg.c, aBldg.u, 4.0), [11, 8.0, 9], RASCASSE_WALL, b);
          addBox(out, vadd(aBldg.c, aBldg.u, 8.4), [11.4, 0.8, 9.4], [0.30, 0.28, 0.26], b);
          addBox(out, vadd(aBldg.c, aBldg.u, 5.6), [11.2, 1.8, 9.2], WIN, b);
          addBox(out, vadd(aBldg.c, aBldg.u, 6.1), [11.4, 0.9, 9.4], WINLIT, b);
        }
        const aBalc = anchor(k, -1, 4.5);
        if (!onTrack(aBalc.c[0], aBalc.c[2], 4)) {
          const bb = [aBalc.r, aBalc.u, aBalc.t];
          addBox(out, vadd(aBalc.c, aBalc.u, 4.4), [7, 0.3, 7], [0.72, 0.70, 0.66], bb);
          addBox(out, vadd(aBalc.c, aBalc.u, 4.9), [7.1, 0.7, 0.15], [0.65, 0.20, 0.18], bb);
          for (const o of [-3.2, 3.2])
            addCyl(out, vadd(vadd(aBalc.c, aBalc.t, o), aBalc.u, 2.2), 0.14, 4.4, [0.55, 0.55, 0.55], 5, bb);
          addBox(out, vadd(aBalc.c, aBalc.u, 5.6), [7.4, 1.4, 7.4], [0.85, 0.20, 0.18], bb);
        }
      }

      {
        const k = KOLD(0.955);
        const rr = [track.rx[k], track.ry[k], track.rz[k]];
        const uu = upOf(track, k);
        const tt = [track.tx[k], track.ty[k], track.tz[k]];
        const dist = 34;
        const oo = -1 * (hw[k] + dist);
        const cxw = px[k] + rr[0] * oo, czw = pz[k] + rr[2] * oo;
        const gy = terrainYAt(cxw, czw);
        const a = { c: [cxw, (gy == null ? py[k] : gy) - 0.3, czw], r: rr, u: uu, t: tt };
        if (!onTrack(a.c[0], a.c[2], 28)) {
          const b = [a.r, a.u, a.t];
          const YWHITE = [0.94, 0.95, 0.97], YDECK = [0.86, 0.88, 0.90], YNAVY = [0.10, 0.22, 0.34];
          let up = 1.2, w = 34, d = 16;
          for (let i = 0; i < 4; i++) {
            addBox(out, vadd(a.c, a.u, up), [w, 3.4, d], i % 2 ? YDECK : YWHITE, b);
            // glazed band facing the water
            addBox(out, vadd(a.c, a.u, up + 1.9), [w * 0.98, 1.1, d * 1.01], [0.30, 0.42, 0.52], b);
            up += 3.6; w -= 4; d -= 1.2;
          }
          // Undulating wave roof — five overlapping slabs stepping toward the sea.
          for (let i = 0; i < 5; i++) {
            const rc = vadd(vadd(a.c, a.r, (i - 2) * 6.4), a.u, up + Math.sin(i * 1.1) * 1.6 + i * 0.6);
            addPrism(out, rc, [7.2, 1.0, 20 - i * 1.4], YWHITE, b);
          }
          // Navy waterline trim + a single flagmast.
          addBox(out, vadd(a.c, a.u, 0.4), [36, 0.8, 18], YNAVY, b);
          addCyl(out, vadd(a.c, a.u, 1.2), 0.14, 9, [0.80, 0.82, 0.85], 4, b);
        }
      }

      // ── STREET LAMP POSTS (~every 55m, staggered) ────────────────────────
      for (let i = 0; i < 24; i++) {
        const s = i / 24;
        const k = K(s);
        const side = (i % 2 === 0) ? 1 : -1;
        if (s > 0.50 && s < 0.60) continue; // skip tunnel interior
        const aL = anchor(k, side, 1.8);
        if (onTrack(aL.c[0], aL.c[2], 1.2)) continue;
        const b = [aL.r, aL.u, aL.t];
        addCyl(out, aL.c, 0.09, 6.5, [0.68, 0.70, 0.72], 5, b);
        addCyl(out, vadd(aL.c, aL.u, 6.3), 0.65, 0.22, LAMP, 7, b);
      }

      // Harbour-side lamp posts along the quay (sparser)
      for (let i = 0; i < 8; i++) {
        const s = 0.585 + i * 0.05;
        const k = K(s);
        const aQ = anchor(k, -1, 2.4);
        if (onTrack(aQ.c[0], aQ.c[2], 1.2)) continue;
        const bQ = [aQ.r, aQ.u, aQ.t];
        addCyl(out, aQ.c, 0.09, 5.8, [0.70, 0.72, 0.74], 5, bQ);
        addCyl(out, vadd(aQ.c, aQ.u, 5.6), 0.55, 0.20, LAMP, 7, bQ);
      }

      // ── PIT WALL & START GRANDSTAND (s=0.03, R) ──────────────────────────
      wall(0.0, 0.06, 1, 1.5, 1.0, [0.66, 0.67, 0.69], 0.6);
      scaffoldStand(0.016, 0.048, 1, 9, {
        rows: 5, rise: 1.1, setback: 1.7, legEvery: 1,
        tubeCol: [0.74, 0.76, 0.78], deckCol: [0.72, 0.68, 0.60],
        bench: [[0.86, 0.84, 0.80], [0.30, 0.36, 0.52], [0.72, 0.28, 0.24]],
        density: 0.66,
      });
      for (let i = 0; i < 5; i++) {
        const k = (K(0.02) + i * 2) % n;
        place(k, 1, 4, [0.4, 1.1, 5], [0.80, 0.80, 0.82]);
      }

      for (let i = 0; i < 12; i++) {
        const k = K(0.59 + i * 0.029);
        palm(k, -1, 5, 8 + hash(k * 3) * 3, [0.25, 0.45, 0.22]);
      }
      // Extra harbour promenade density
      for (let i = 0; i < 8; i++) {
        const k = K(0.60 + i * 0.038);
        palm(k, -1, 6.5, 7 + hash(k * 11) * 3, [0.24, 0.45, 0.21]);
      }
      // Inland street palms (Beau Rivage / Mirabeau climb)
      for (let i = 0; i < 10; i++) {
        const k = K(0.06 + i * 0.045);
        palm(k, -1, 6, 7 + hash(k * 5) * 4, [0.24, 0.44, 0.21]);
      }

      const CYPRESS = [0.16, 0.32, 0.14];
      const PINEGRN = [0.20, 0.36, 0.20];
      const PLANEGRN = [0.32, 0.46, 0.26];
      for (const [sf, cnt, sd, gap] of [[0.20, 2, 0, 10], [0.832, 3, 1, 8]]) {
        for (let j = 0; j < cnt; j++) {
          const k = K(sf + j * 0.012);
          const side = sd || ((j & 1) ? -1 : 1);
          cypress(k, side, gap + (j & 1) * 3, 13 + hash(k * 3.7) * 5, CYPRESS,
                  { slim: 0.75 });
        }
      }
      for (let i = 0; i < 7; i++) {
        const k = K(0.095 + i * 0.032);
        stonePine(k, -1, 30 + hash(k * 2.3) * 12, 13 + hash(k * 5.1) * 6, PINEGRN,
                  { lean: 1.15, spread: 1.05 });
      }
      along(0.672, 0.728, 28, (k) => {
        plane(k, -1, 9 + hash(k * 7.9) * 2, 9 + hash(k * 4.1) * 3, PLANEGRN,
              { stages: 2, spread: 0.62 });
      });

      for (const [sf, sd, ht] of [
        [0.12, -1, 70], [0.34, -1, 64], [0.74,  1, 66], [0.88, 1, 58], [0.50, -1, 62]
      ]) {
        const k = K(sf);
        const tDist = 68 + hash(k) * 18;
        const a = anchor(k, sd, tDist);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const bW = 14 + hash(k * 3) * 5;
          tower(k, sd, tDist, bW, ht, {
            col: PASTELS[K(sf) % PASTELS.length], cap: true,
            capCol: [0.55, 0.58, 0.56], mast: 6
          });
          addBox(out, vadd(a.c, a.u, ht * 0.60), [bW * 1.2, ht * 0.14, bW * 1.2],
                 WINLIT, [a.r, a.u, a.t]);
        }
      }

      // ── TRACK FURNITURE ───────────────────────────────────────────────────
      gantry(0.0, 8.2, [0.20, 0.22, 0.26]);
      gantry(0.235, 8.0, [0.22, 0.24, 0.28]);

      scaffoldStand(0.615, 0.665, -1, 9, {
        rows: 5, rise: 1.15, setback: 1.8, legEvery: 1, awning: true,
        awningCols: [[0.90, 0.88, 0.84], [0.72, 0.20, 0.22]],
        tubeCol: [0.74, 0.76, 0.78], deckCol: [0.72, 0.68, 0.60],
        bench: [CREAM, [0.28, 0.34, 0.50], TERRA], density: 0.62,
      });
      // Grandstand K, split into twelve 15 m stands instead of one 180 m run.
      // grandstandEx's "truss" roof lays braces by walking ±len/2 off ONE
      // anchor's straight tangent (js/track/scenery-nature.js) — over 180 m
      // of this curving harbourfront the far bays drift off the actual
      // ground and float (float-audit: 6 clusters, up to 30 m gap; three
      // 60 m stands still left 4 floating at ~19 m, six 30 m stands left 1
      // at ~19 m). Each 15 m stand re-anchors at its own node, so no brace
      // walks more than 7.5 m off a tangent that tracks the curve closely.
      // The twelve still cover the same overall span, edge to edge — the
      // end walls this introduces at the eleven internal seams face each
      // other (anti-parallel), so they do not register as new coplanar
      // pairs (checked: coplanar-audit unchanged at 5 after this split).
      const gsLen = 15, gsHalf = gsLen / track.total;
      for (let i = -5.5; i <= 5.5; i++) {
        grandstandEx(0.76 + i * gsHalf, -1, 9, gsLen, null, null,
          { livery: "scaffold", tiers: 2, roof: "truss", endWalls: true, pylons: true }); // Grandstand K
      }
      grandstandEx(0.25,  1, 7, 40, null, null, { livery: "alu", tiers: 1, roof: "flat" });
      grandstandEx(0.72,  1, 9, 36, null, null, { livery: "pastel", tiers: 1, roof: "cantilever", suites: true });

      for (const [s, sd] of [[0.07, 1], [0.18, -1], [0.33, 1], [0.62, -1], [0.74, 1], [0.84, -1], [0.93, 1]]) {
        const col = [[0.85, 0.20, 0.20], [0.10, 0.30, 0.70], [0.95, 0.80, 0.10], [0.10, 0.55, 0.45]][K(s) % 4];
        billboard(K(s), sd, 2.5, 7, 3.2, col);
      }

      fence(0.66, 0.71, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);
      fence(0.82, 0.87, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);

      for (const [s, sd] of [[0.04, 1], [0.13, -1], [0.30, 1], [0.42, -1], [0.50, 1], [0.62, -1], [0.79, 1], [0.91, -1]]) {
        marshalPost(K(s), sd, 1.8);
      }

      guardrail(0.29, 0.34,  1, 0.5, ARMCO);
      guardrail(0.38, 0.43,  1, 0.5, ARMCO);
      guardrail(0.78, 0.84, -1, 0.5, ARMCO);
      guardrail(0.15, 0.19, -1, 0.4, ARMCO);
      guardrail(0.62, 0.68, -1, 0.4, ARMCO);

      const harbourStations = [0.365, 0.545, 0.59]; // racing fractions
      for (let station = 0; station < harbourStations.length; station++) {
        waterField(K(harbourStations[station]), 1, 16, 300, 72, 12, SEA,
          { id: `monaco-harbour-water-${station}`, required: true });
      }
      // NOTE: do not widen this by adding more stations around the lap. It was
      // tried (0.63…0.07, 72 of 96 panels placed, build stayed green) and the
      // result was visibly WRONG: side +1 is only the harbour for this handful
      // of fractions, so most of the new panels laid sea between the city
      // buildings on the inland side. The onTrack guard only rejects geometry
      // that overlaps the ROAD — it has no idea what is land. Widening the
      // basin needs a real harbour polygon in world XZ, not more track-relative
      // stations.

      const megaYacht = (a, sc, hullCol) => {
        a = Object.assign({}, a, { c: [a.c[0], pyMin - 0.8 - 0.2 * sc, a.c[2]] });
        const b = [a.r, a.u, a.t];
        const HULL = hullCol || [0.97, 0.97, 0.99];
        const NAVY = [0.14, 0.20, 0.30];
        const L = 44 * sc, W = 10 * sc;
        // Hull body + raked bow prism (triangular prism gives the sheer bow)
        out._mat = MAT.METAL;
        addBox(out, vadd(a.c, a.u, 2.2 * sc), [W, 4.0 * sc, L * 0.86], HULL, b);
        addPrism(out, vadd(vadd(a.c, a.t, L * 0.47), a.u, 2.2 * sc), [W, 4.0 * sc, L * 0.18], HULL, b);
        // Dark waterline / hull stripe
        addBox(out, vadd(a.c, a.u, 0.7 * sc), [W * 1.02, 1.0 * sc, L * 0.88], NAVY, b);
        // Teak swim platform at the stern
        out._mat = MAT.WOOD;
        addBox(out, vadd(vadd(a.c, a.t, -L * 0.46), a.u, 1.4 * sc), [W * 0.8, 0.4 * sc, L * 0.08], [0.72, 0.58, 0.38], b);
        // Superstructure: three stacked, tapering white decks set forward
        out._mat = MAT.METAL;
        const sup = vadd(a.c, a.t, L * 0.02);
        addBox(out, vadd(sup, a.u, 5.4 * sc), [W * 0.9, 3.0 * sc, L * 0.5], [0.95, 0.95, 0.97], b);
        addBox(out, vadd(sup, a.u, 8.4 * sc), [W * 0.78, 2.8 * sc, L * 0.4], [0.92, 0.93, 0.96], b);
        addBox(out, vadd(vadd(sup, a.t, L * 0.03), a.u, 11.2 * sc), [W * 0.6, 2.6 * sc, L * 0.28], [0.90, 0.91, 0.95], b);
        // Tinted glazing bands on each deck
        out._mat = MAT.GLASS;
        for (const [y, ln] of [[5.4, 0.5], [8.4, 0.4], [11.2, 0.28]]) {
          addBox(out, vadd(sup, a.u, (y + 0.2) * sc), [W * 0.92, 0.9 * sc, L * ln * 1.01], [0.18, 0.28, 0.40], b);
        }
        out._mat = MAT.METAL;
        for (const o of [-W * 0.28, W * 0.28]) {
          addCyl(out, vadd(vadd(sup, a.r, o), a.u, 12.3 * sc), 0.16 * sc, 2.4 * sc, [0.85, 0.86, 0.90], 5, b);
        }
        addBox(out, vadd(sup, a.u, 13.5 * sc), [W * 0.62, 0.4 * sc, 0.6 * sc], [0.85, 0.86, 0.90], b);
        // Mast + navigation lights
        addCyl(out, vadd(sup, a.u, 13.7 * sc), 0.14 * sc, 5.5 * sc, [0.86, 0.86, 0.90], 4, b);
        out._mat = 0;
        addBox(out, vadd(sup, a.u, 18.9 * sc), [0.5 * sc, 0.5 * sc, 0.5 * sc], [0.95, 0.30, 0.25], b);
        out._mat = MAT.METAL;
        // Foredeck helipad — pale disc with an "H" bar
        const heli = vadd(vadd(a.c, a.t, L * 0.34), a.u, 4.0 * sc);
        addCyl(out, heli, W * 0.34, 0.2 * sc, [0.86, 0.86, 0.82], 12, b);
        addBox(out, vadd(heli, a.u, 0.2 * sc), [W * 0.18, 0.1 * sc, W * 0.30], [0.95, 0.20, 0.20], b);
        // Aft-deck tender (a little boat carried on the stern)
        addBox(out, vadd(vadd(a.c, a.t, -L * 0.34), a.u, 4.6 * sc), [W * 0.42, 1.0 * sc, L * 0.1], [0.90, 0.90, 0.94], b);
        // Wrap-around deck railings — a run of thin stanchions each side
        for (let s = -6; s <= 6; s++) {
          for (const sd of [-1, 1]) {
            addCyl(out, vadd(vadd(vadd(a.c, a.t, s * L * 0.06), a.r, sd * W * 0.5), a.u, 4.6 * sc), 0.05 * sc, 1.0 * sc, [0.86, 0.86, 0.9], 3, b);
          }
        }
        out._mat = 0;
        // Warm lit interior glow band (evening party lights)
        addBox(out, vadd(sup, a.u, 6.0 * sc), [W * 0.92, 0.4 * sc, L * 0.5], WINLIT, b);
      };
      // Two flagship yachts moored bows-out at prime harbour berths.
      {
        const a1 = anchor(K(0.645), -1, 30);
        if (!onTrack(a1.c[0], a1.c[2], 12)) megaYacht(a1, 0.9, [0.97, 0.97, 0.99]);
        const a2 = anchor(K(0.71), -1, 34);
        if (!onTrack(a2.c[0], a2.c[2], 12)) megaYacht(a2, 1.05, [0.20, 0.22, 0.28]);
        const a3 = anchor(K(0.78), -1, 30);
        if (!onTrack(a3.c[0], a3.c[2], 12)) megaYacht(a3, 0.8, [0.94, 0.90, 0.82]);
      }

      const terraceStack = (a, tiers, baseCol) => {
        const b = [a.r, a.u, a.t];
        let up = 0, back = 0, w = 26;
        for (let i = 0; i < tiers; i++) {
          const c = vadd(vadd(a.c, a.t, back), a.u, up + 4.5);
          const col = PASTELS[(K(a.c[0] | 0) + i * 3) % PASTELS.length] || baseCol;
          out._mat = MAT.CONCRETE;
          addBox(out, c, [w, 9, 12], col, b);
          // balcony window band + warm glow
          out._mat = MAT.GLASS;
          addBox(out, vadd(vadd(a.c, a.t, back), a.u, up + 5.5), [w * 1.01, 2.4, 12.4], WIN, b);
          out._mat = 0;
          addBox(out, vadd(vadd(a.c, a.t, back), a.u, up + 6.0), [w * 1.02, 0.9, 12.6], WINLIT, b);
          // planter ledge on each terrace
          out._mat = MAT.FOLIAGE;
          addBox(out, vadd(vadd(a.c, a.t, back + 6), a.u, up + 9.4), [w * 0.9, 0.6, 1.4], [0.30, 0.45, 0.24], b);
          out._mat = 0;
          up += 8.5; back += 7; w -= 3.2;
        }
      };
      for (const sf of [0.11, 0.16, 0.21]) {
        const k = K(sf), a = anchor(k, -1, 58 + hash(k) * 10);
        if (!onTrack(a.c[0], a.c[2], 16)) terraceStack(a, 4, DUSTY);
      }

      for (let i = 0; i < 4; i++) {
        const k = K(0.63 + i * 0.052);
        const a = anchor(k, -1, 66 + (i & 1) * 8);
        const b = [a.r, a.u, a.t];
        modelGroup(`monaco-marina-pontoon-${i}`, {
          center: vadd(a.c, a.u, 1.4), size: [14, 3, 46], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 0.35), [3.2, 0.7, 42], [0.68, 0.58, 0.42], b);
          addBox(stage, vadd(vadd(a.c, a.t, 19), a.u, 0.35), [13, 0.7, 3.2], [0.68, 0.58, 0.42], b);
          for (const o of [-18, -6, 6, 18]) {
            addCyl(stage, vadd(vadd(a.c, a.t, o), a.u, 0.7), 0.12, 2.0, [0.78, 0.80, 0.82], 5, b);
          }
        });
      }
      for (let i = 0; i < 6; i++) {
        const k = K(0.625 + i * 0.032);
        const a = anchor(k, -1, 104 + (i % 3) * 13);
        const b = [a.r, a.u, a.t];
        const sc = 0.72 + hash(k * 4.7) * 0.24;
        modelGroup(`monaco-far-sailboat-${i}`, {
          center: vadd(a.c, a.u, 8 * sc), size: [8 * sc, 18 * sc, 20 * sc], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 1.2 * sc), [5.5 * sc, 2.4 * sc, 17 * sc], [0.95, 0.96, 0.98], b);
          addCyl(stage, vadd(a.c, a.u, 2.0 * sc), 0.12 * sc, 14 * sc, [0.82, 0.84, 0.86], 4, b);
          addPrism(stage, vadd(vadd(a.c, a.r, 1.5 * sc), a.u, 9 * sc),
            [0.25 * sc, 11 * sc, 9 * sc], i & 1 ? CREAM : DUSTY, b);
        });
      }

      for (const [sf, side, gap, w, h, d, col] of [
        [0.182,  1, 7, 18, 31, 16, [0.94, 0.90, 0.83]],
        [0.238,  1, 6, 20, 34, 17, [0.88, 0.82, 0.72]],
        [0.226, -1, 9, 16, 27, 14, [0.93, 0.88, 0.78]],
      ]) {
        building(K(sf), side, gap, w, h, d, {
          kind: side > 0 ? "tiered" : "chevron",
          wall: col, window: WIN, floor: 4.6, lit: true, windowCol: WINLIT,
        });
      }

      for (let i = 0; i < 4; i++) {
        const k = K(0.285 + i * 0.029);
        const a = anchor(k, -1, 35 + (i & 1) * 9);
        const b = [a.r, a.u, a.t];
        const h = 29 + hash(k * 6.3) * 12;
        const w = 14 + hash(k * 2.1) * 4;
        modelGroup(`monaco-mirabeau-balconies-${i}`, {
          center: vadd(a.c, a.u, h * 0.5), size: [w + 2, h + 2, 13], basis: b,
        }, (stage) => {
          const wall = PASTELS[(i + 2) % PASTELS.length];
          stage._mat = wall[0] > wall[1] + 0.16 ? MAT.BRICK : MAT.STONE;
          addBox(stage, vadd(a.c, a.u, h * 0.5), [w, h, 11], wall, b);
          for (let floor = 1; floor * 4.3 < h - 1; floor++) {
            const fc = vadd(vadd(a.c, a.t, -5.8), a.u, floor * 4.3);
            stage._mat = MAT.STONE;
            addBox(stage, fc, [w + 1.2, 0.35, 1.5], [0.84, 0.82, 0.78], b);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(fc, a.u, 1.0), [w + 0.8, 0.18, 0.25], [0.48, 0.52, 0.54], b);
          }
          stage._mat = 0;
        });
      }

      for (const [sf, side] of [[0.515, -1], [0.575, 1]]) {
        const k = K(sf);
        building(k, side, 12, 22, 28, 24, { kind: "tiered",
          wall: [0.82, 0.80, 0.75], window: WIN, floor: 4.5,
          lit: true, windowCol: WINLIT, setback: true,
        });
        const a = anchor(k, side, 31);
        const b = [a.r, a.u, a.t];
        modelGroup(`monaco-tunnel-vent-${side < 0 ? "entry" : "exit"}`, {
          center: vadd(a.c, a.u, 6), size: [11, 12, 11], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, 3.4), [10, 6.8, 10], STONE, b);
          stage._mat = MAT.METAL;
          addFrustum(stage, vadd(a.c, a.u, 6.6), 4.2, 3.2, 3.0, [0.46, 0.48, 0.46], 8, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [4.8, 1.0, 4.8], [0.34, 0.36, 0.36], b);
          stage._mat = 0;
        });
      }

      for (let i = 0; i < 4; i++) {
        const k = K(0.66 + i * 0.052);
        const a = anchor(k, 1, 25 + (i & 1) * 7);
        const b = [a.r, a.u, a.t];
        const h = 22 + hash(k * 8.2) * 8;
        modelGroup(`monaco-harbour-balcony-wall-${i}`, {
          center: vadd(a.c, a.u, h * 0.5), size: [24, h + 2, 12], basis: b,
        }, (stage) => {
          const wall = PASTELS[(i * 2 + 1) % PASTELS.length];
          stage._mat = wall[0] > wall[1] + 0.16 ? MAT.BRICK : MAT.STONE;
          addBox(stage, vadd(a.c, a.u, h * 0.5), [22, h, 10], wall, b);
          for (let floor = 1; floor * 4.2 < h - 1; floor++) {
            const fc = vadd(vadd(a.c, a.t, -5.3), a.u, floor * 4.2);
            stage._mat = MAT.STONE;
            addBox(stage, fc, [23, 0.32, 1.2], CREAM, b);
            stage._mat = MAT.METAL;
            for (const x of [-8, -4, 0, 4, 8]) {
              addCyl(stage, vadd(vadd(fc, a.r, x), a.u, 0.45), 0.05, 0.9, [0.50, 0.52, 0.54], 3, b);
            }
          }
          stage._mat = 0;
        });
      }
    };
