/* Apex 26 — ESTORIL scenery (data only), split out of js/circuits/estoril.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["estoril"] =
  function (api) {
      const { K, lapBounds, out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz, seat,
        tree, bush, ridge, mountain, grandstandEx, spectatorHill, sponsorHoarding,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup,
        addBox, addCyl, addFrustum, forestEdge } = api;

      const LIME = [0.95, 0.94, 0.90], LIME_D = [0.86, 0.85, 0.80];
      const TILE = [0.68, 0.33, 0.21], TILE_D = [0.54, 0.27, 0.18];
      const AZUL = [0.24, 0.42, 0.66];          // azulejo blue
      const TUBE = [0.60, 0.58, 0.56];
      const PINE = [0.16, 0.31, 0.17], PINE_D = [0.12, 0.25, 0.14];
      const SCRUB = [0.33, 0.38, 0.21], SCRUB_D = [0.27, 0.32, 0.18];
      const GRAVEL = [0.66, 0.58, 0.42];

      const stonePine = (k, side, dist, h, col) => {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const lean = (hash(k * 13 + dist) - 0.5) * 0.9;   // the Atlantic wind
        const foot = vadd(a.c, a.r, lean * 0.6);
        out._mat = MAT.WOOD;
        seat.cyl(out, foot, 0.20 + h * 0.014, h * 0.66, [0.40, 0.31, 0.23], 5, b);
        out._mat = MAT.FOLIAGE;
        const crown = vadd(vadd(foot, a.u, h * 0.60), a.r, lean);
        // Flared underside then a shallow dome: a parasol, not a spire.
        seat.frustum(out, crown, h * 0.12, h * 0.44, h * 0.16, col, 7, b);
        seat.cone(out, vadd(crown, a.u, h * 0.16), h * 0.44, h * 0.22, col, 7, b);
        out._mat = 0;
      };
      const openArea = (s) => (s >= 0.92 || s <= 0.10) || (s >= 0.34 && s <= 0.46);
      every(26, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.36) return;
        stonePine(k, h < 0.5 ? -1 : 1, 12 + h * 12, 11 + h * 8, h < 0.55 ? PINE : PINE_D);
        if (h > 0.74) stonePine(k, h > 0.88 ? -1 : 1, 30 + h * 18, 13 + h * 8, PINE_D);
      });
      every(22, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.44) return;
        bush(k, h < 0.72 ? -1 : 1, 7 + h * 6, h < 0.6 ? SCRUB : SCRUB_D);
      });
      every(46, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 67 + 19);
        if (h < 0.58) return;
        tree(k, h < 0.5 ? -1 : 1, 44 + h * 24, 8 + h * 4, [0.29, 0.34, 0.20]);
      });

      // 2. PIT COMPLEX — one long masonry terrace under one continuous
      //    pantile roof, with an open first-floor balcony over the garages.
      //    Estoril never had a glazed paddock: the building is limewash, tile
      //    and shade, so it is modelled as a single hero rather than assembled
      //    from repeated office blocks.
      const pitBlock = (id, frac, bays) => {
        const a = anchor(K(frac), 1, 18), b = [a.r, a.u, a.t];
        const pitch = 7.8, len = bays * pitch;
        modelGroup(id, {
          center: vadd(a.c, a.u, 7), size: [16, 15, len + 4], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [13, 7.0, len], LIME, b);
          for (let i = 0; i < bays; i++) {
            const p = vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch), a.r, -6.3);
            seat.box(stage, p, [0.4, 4.4, 5.4], [0.19, 0.21, 0.23], b);
          }
          // Azulejo band at first-floor level — the one piece of colour on it.
          seat.box(stage, vadd(vadd(a.c, a.u, 4.6), a.r, -6.55), [0.3, 0.7, len], AZUL, b);
          // Balcony deck, balustrade and the posts carrying the roof over it.
          seat.box(stage, vadd(a.c, a.u, 7.0), [15, 0.4, len], LIME_D, b);
          seat.box(stage, vadd(vadd(a.c, a.u, 7.4), a.r, -7.2), [0.3, 1.05, len], LIME, b);
          for (let i = 0; i <= bays; i++) {
            const p = vadd(vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, -6.4), a.u, 7.4);
            seat.cyl(stage, p, 0.15, 3.4, LIME, 6, b);
          }
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(a.c, a.u, 10.8), [15.4, 2.1, len + 2], TILE, b);
          stage._mat = 0;
        }, { required: true });
      };
      pitBlock("estoril-pit-terrace-a", 0.960, 7);
      pitBlock("estoril-pit-terrace-b", 0.996, 7);
      {
        const a = anchor(K(0.978), 1, 22), b = [a.r, a.u, a.t];
        modelGroup("estoril-timing-tower", {
          center: vadd(a.c, a.u, 13), size: [14, 30, 14], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          seat.box(stage, a.c, [8, 19, 8], LIME, b);
          for (let f = 1; f <= 4; f++)                       // shaded window slots
            seat.box(stage, vadd(vadd(a.c, a.u, f * 4.0), a.r, -4.15), [0.3, 1.6, 6.4], [0.18, 0.21, 0.25], b);
          // Open observation deck under the cap.
          seat.box(stage, vadd(a.c, a.u, 19), [11, 0.4, 11], LIME_D, b);
          seat.box(stage, vadd(vadd(a.c, a.u, 19.4), a.r, -5.4), [0.3, 1.1, 11], LIME, b);
          for (const [dr, dt] of [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]])
            seat.cyl(stage, vadd(vadd(vadd(a.c, a.r, dr), a.t, dt), a.u, 19.4), 0.16, 3.0, LIME, 6, b);
          // External stair — a leaning slab, which is how it reads at speed.
          seat.box(stage, vadd(vadd(a.c, a.r, 4.6), a.u, 0), [1.6, 19, 1.6], LIME_D, b);
          stage._mat = MAT.ROOF;
          // Base was 22.4, flush with the four corner posts' own top (base
          // 19.4 + height 3.0 = 22.4) — measured via float-audit as still
          // unsupported at that exact touch. 0.2 m overlap into the posts.
          // Base was flush with the four corner posts' own top (22.4) —
          // measured via float-audit as still unsupported there even at
          // 0.2 m overlap into the posts. The posts (thin, 0.16 r) aren't a
          // reliable support in the audit's own accounting; based on the
          // main tower shaft's top (19, `seat.box(stage, a.c, [8, 19, 8]...`
          // above) instead — the one primitive here with real footprint and
          // direct ground contact. Widens through the deck/railing zone (a
          // stone roof genuinely oversails its walls), unchanged top (26).
          addFrustum(stage, vadd(a.c, a.u, 18.8), 6.4, 1.0, 7.2, TILE, 4, b);
        }, { required: true });
      }
      gantry(0.0, 8, [0.15, 0.15, 0.18]);
      gantry(0.968, 7.5, [0.15, 0.15, 0.18]);
      every(48, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.55) return;
        motorhome(k, 1, 52 + h * 10, 10, 4, 6, { wall: [0.70 + h * 0.2, 0.70, 0.72] });
      });
      broadcastCompound(K(0.918), 1, 68, { vans: 2, dishes: 2, mastH: 9 });
      sponsorHoarding(0.955, 0.045, -1, 6.5, { h: 2.2, step: 11,
        palette: [[0.14, 0.36, 0.22], [0.86, 0.22, 0.18], [0.94, 0.86, 0.24], LIME] });

      const BENCH = [[0.84, 0.30, 0.24], [0.90, 0.88, 0.82], [0.28, 0.42, 0.66], [0.72, 0.64, 0.32]];
      const CROWD = [[0.90, 0.88, 0.84], [0.22, 0.28, 0.40], [0.78, 0.26, 0.20],
                     [0.26, 0.46, 0.32], [0.92, 0.76, 0.28], [0.46, 0.40, 0.36]];
      const scaffoldStand = (id, k, side, dist, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 4, pitch = 6.4, len = bays * pitch;
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const IN = -side;                       // +1 along a.r points at the track
        const topH = 2.6 + rows * 1.55;
        modelGroup(id, {
          center: vadd(a.c, a.u, topH * 0.6), size: [11, topH + (opts.awning ? 6 : 1), len + 2], basis: b,
        }, (stage) => {
          stage._mat = MAT.METAL;
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            seat.cyl(stage, vadd(p, a.r, IN * -3.6), 0.15, topH, TUBE, 6, b);
            seat.cyl(stage, vadd(p, a.r, IN * 3.6), 0.15, 2.4, TUBE, 6, b);
            // One leaning tube per bay reads as the full X-brace at speed.
            addBox(stage, vadd(vadd(p, a.r, 0), a.u, topH * 0.45),
              [7.6, 0.13, 0.13], TUBE, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (3.2 - t * 1.55), y = 1.5 + t * 1.55;
            stage._mat = MAT.WOOD;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.5, 0.22, len], [0.70, 0.66, 0.60], b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.22), [1.1, 0.85, len - 2],
              BENCH[t % BENCH.length], b);
            // Spectators on the planks. An unpeopled bespoke stand reads as
            // bare scaffolding next to grandstandEx's built-in crowd, which is
            // the one thing this form must not look like.
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.9 < len - 3; j++) {
              const h2 = hash(k * 17 + t * 89 + j * 29);
              if (h2 < 0.45) continue;
              seat.box(stage, vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1.5 + j * 0.9), a.u, y + 1.07),
                [0.55, 0.95, 0.45], CROWD[Math.floor(h2 * 89) % CROWD.length], b);
            }
          }
          if (opts.awning) {
            stage._mat = MAT.FABRIC;
            for (let i = 0; i <= bays; i++)
              seat.cyl(stage, vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, IN * -3.6),
                0.12, topH + 3.4, TUBE, 6, b);
            // Striped canvas awning, the period alternative to a cantilever.
            for (let i = 0; i < bays; i++)
              seat.box(stage, vadd(vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch), a.u, topH + 3.4), a.r, IN * -0.6),
                [8.4, 0.22, pitch - 0.5], (i % 2) ? [0.92, 0.90, 0.86] : [0.80, 0.24, 0.20], b);
          }
          stage._mat = 0;
        });
      };
      scaffoldStand("estoril-stand-pit", K(0.005), -1, 13, 18, { rows: 5, awning: true });
      scaffoldStand("estoril-stand-t1", K(0.078), -1, 22, 11, { rows: 4 });
      scaffoldStand("estoril-stand-esses", K(0.140), 1, 20, 9, { rows: 4 });
      scaffoldStand("estoril-stand-parabolica", K(0.900), 1, 18, 14, { rows: 5, awning: true });
      grandstandEx(0.955, -1, 12, 78, null, null,
        { livery: "terracotta", roof: "none", endWalls: true, h: 8 });

      groundPatch(K(0.078), 1, 5, [30, 0.18, 40], GRAVEL,
        { id: "estoril-t1-gravel", samples: 7 });
      tyreWall(0.062, 0.096, 1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.072), -1, 9);

      groundPatch(K(0.420), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "estoril-esses-gravel", samples: 6 });
      tyreWall(0.406, 0.436, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.424), 1, 9);

      groundPatch(K(0.780), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "estoril-t12-gravel", samples: 6 });
      marshalPost(K(0.775), -1, 9);

      groundPatch(K(0.900), -1, 6, [40, 0.18, 90], GRAVEL,
        { id: "estoril-parabolica-gravel", samples: 9 });
      tyreWall(0.880, 0.925, -1, 5, [0.85, 0.78, 0.20]);
      spectatorHill(0.865, 0.935, 1, 32, { rows: 4, rise: 1.2, depth: 1.9, density: 0.46, step: 8 });
      marshalPost(K(0.895), 1, 10);
      for (const s of [0.875, 0.905]) billboard(K(s), -1, 14, 12, 4.5, [0.88, 0.20, 0.16]);

      for (const [s0, s1] of [[0.11, 0.32], [0.37, 0.52], [0.57, 0.72], [0.78, 0.86]]) {
        guardrail(s0, s1, -1, 7, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 7, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.26, 0.48, 0.62, 0.70, 0.83]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const { cx, cz, radius: rad } = lapBounds();
      // ── NO ATLANTIC. THE CIRCUIT IS INLAND. ──────────────────────────────
      // There used to be a waterBand here, 210 m off the back section, with a
      // matching `seaward` wedge that punched a hole in the hill ring so you
      // could see it. Both are gone. Estoril sits on the Alcabideche plateau
      // at 38.7506 N 9.3942 W; the nearest water is Guincho at 7.2 km on
      // bearing 254° and Cascais bay at 7.1 km on 198°, and the Malveira
      // ridge stands between. A sheet of sea two hundred metres from the
      // Parabolica is not a stylisation of that, it is a different place —
      // and the hole it cut in the ring removed the one thing you really can
      // see from the track, which is hills in every direction.
      //
      // The lighthouse that stood next to it went the same way; see
      // `estoril-deposito` below.
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 42, 130, 42, 14, 8, [0.24, 0.34, 0.19]],
        [220, 32, 180, 58, 26, 16, [0.26, 0.31, 0.21]],
        [360, 24, 240, 76, 48, 28, [0.36, 0.38, 0.36]],
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 32;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }
      // ── SERRA DE SINTRA ──────────────────────────────────────────────────
      // What actually closes the skyline here, and the reason the plateau is
      // called one. Cruz Alta (528 m) is at 38.7878 N 9.4283 W: 5.09 km from
      // the circuit on bearing 324.4°, and the circuit stands at ~180 m, so
      // 348 m of relief subtending 3.9°. +X is WEST and +Z is NORTH
      // (tools/track/import-circuit-path.mjs), so bearing θ is (-sin θ, cos θ).
      {
        const bear = (deg) => { const r = deg * Math.PI / 180; return [-Math.sin(r), Math.cos(r)]; };
        for (const [deg, dist, w, h, sd] of [
          [324.4, 5090, 3400, 348, 7],    // Cruz Alta, the massif's high point
          [312.0, 5400, 2300, 262, 13],   // the eastern shoulder toward Pena
          [336.5, 5600, 2100, 224, 19],   // the western fall to Peninha
        ]) {
          const [dx, dz] = bear(deg);
          mountain(cx + dx * dist, cz + dz * dist, pyMin - 10, w, h,
            { seg: 14, seed: sd, rough: 0.34, snowline: 1.6,
              forest: [0.17, 0.26, 0.17], rock: [0.38, 0.36, 0.33] });
        }
      }

      {
        const a = anchor(K(0.30), -1, 96), b = [a.r, a.u, a.t];
        modelGroup("estoril-aldeia", {
          center: vadd(a.c, a.u, 11), size: [32, 26, 64], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let i = 0; i < 7; i++) {
            const h = hash(i * 29 + 5);
            const p = vadd(vadd(a.c, a.t, (i - 3) * 8.6), a.r, (h - 0.5) * 11);
            const w = 7 + h * 3, ht = 4.5 + h * 2.5, d = 7 + hash(i * 41) * 3;
            seat.box(stage, p, [w, ht, d], h < 0.4 ? LIME_D : LIME, b);
            stage._mat = MAT.ROOF;
            seat.prism(stage, vadd(p, a.u, ht), [w + 0.5, 1.6, d + 0.5], h < 0.5 ? TILE : TILE_D, b);
            stage._mat = MAT.CONCRETE;
          }
          const c = vadd(a.c, a.r, 9);
          seat.box(stage, c, [11, 8, 20], LIME, b);
          seat.box(stage, vadd(vadd(c, a.t, -12), a.u, 0), [6, 17, 6], LIME, b);
          seat.box(stage, vadd(vadd(vadd(c, a.t, -12), a.u, 12.5), a.r, -3.1),
            [0.3, 3.2, 3.0], [0.16, 0.16, 0.18], b);        // belfry opening
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(c, a.u, 8), [11.5, 2.6, 20.5], TILE, b);
          addFrustum(stage, vadd(vadd(c, a.t, -12), a.u, 17), 4.4, 0.5, 3.2, TILE_D, 4, b);
          stage._mat = 0;
        });
      }
      {
        // A DEPÓSITO DE ÁGUA, not the lighthouse that used to stand here.
        // The farol was the other half of the coastal fiction removed above:
        // Cabo Raso and Santa Marta are 7 km away on the actual coast, and one
        // 150 m off the back section put a navigation light on an inland
        // plateau. What does stand over every Portuguese town of this size is
        // the elevated water tank — same tall pale cylinder the author wanted
        // as an outfield accent, and it is really there.
        const a = anchor(K(0.62), -1, 150), b = [a.r, a.u, a.t];
        modelGroup("estoril-deposito", {
          center: vadd(a.c, a.u, 13), size: [20, 32, 40], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addFrustum(stage, a.c, 2.6, 2.1, 17, LIME, 10, b);                        // shaft
          seat.cyl(stage, vadd(a.c, a.u, 8.5), 2.35, 0.5, LIME_D, 10, b);           // mid collar
          addFrustum(stage, vadd(a.c, a.u, 17), 3.0, 4.6, 5.4, LIME, 12, b);        // flared tank underside
          seat.cyl(stage, vadd(a.c, a.u, 22.4), 4.6, 2.6, LIME, 12, b);             // tank barrel
          seat.cyl(stage, vadd(a.c, a.u, 21.2), 4.75, 0.35, LIME_D, 12, b);         // shadow band
          stage._mat = MAT.ROOF;
          seat.cyl(stage, vadd(a.c, a.u, 25.0), 4.8, 0.4, TILE_D, 12, b);           // cap slab
          seat.cone(stage, vadd(a.c, a.u, 25.4), 3.6, 1.6, TILE_D, 12, b);
          stage._mat = MAT.CONCRETE;
          seat.cyl(stage, vadd(a.c, a.u, 27.0), 0.5, 1.4, [0.42, 0.42, 0.44], 6, b); // vent stack
          const cot = vadd(a.c, a.t, 11);
          seat.box(stage, cot, [9, 4.2, 12], LIME, b);                              // pump house
          stage._mat = MAT.ROOF;
          seat.prism(stage, vadd(cot, a.u, 4.2), [9.5, 1.5, 12.5], TILE, b);
          stage._mat = 0;
        });
      }
      {
        const a = anchor(K(0.44), 1, 118), b = [a.r, a.u, a.t];
        modelGroup("estoril-moinho", {
          center: vadd(a.c, a.u, 8), size: [18, 20, 18], basis: b,
        }, (stage) => {
          stage._mat = MAT.STONE;
          addFrustum(stage, a.c, 3.4, 2.6, 7.5, LIME, 9, b);
          stage._mat = MAT.ROOF;
          seat.cone(stage, vadd(a.c, a.u, 7.5), 3.2, 2.6, TILE_D, 9, b);
          stage._mat = MAT.WOOD;
          // Four sails on a hub facing out from the hill.
          const hub = vadd(vadd(a.c, a.u, 8.4), a.t, -3.0);
          for (let i = 0; i < 4; i++) {
            const ang = i * 1.5708 + 0.4;
            const dr = Math.cos(ang), du = Math.sin(ang);
            const mid = vadd(vadd(hub, a.r, dr * 3.6), a.u, du * 3.6);
            addBox(stage, mid, [Math.abs(dr) * 7 + 0.35, Math.abs(du) * 7 + 0.35, 0.25],
              [0.62, 0.55, 0.44], b);
          }
          stage._mat = 0;
        });
      }
      // Camera masts.
      for (const [s, side, gap] of [[0.030, -1, 24], [0.078, -1, 40], [0.900, 1, 34]]) {
        const a = anchor(K(s), side, gap);
        addCyl(out, a.c, 0.19, 16, [0.22, 0.22, 0.25], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 16.4), [1.3, 0.6, 2.6], [0.94, 0.92, 0.82], [a.r, a.u, a.t]);
      }
      for (const [s0, s1] of [[0.12, 0.32], [0.48, 0.9]]) {
        for (const side of [-1, 1])
          forestEdge(s0, s1, side, 20, { density: 0.46, hMin: 8, hMax: 14, pineFrac: 0.82, col: PINE, col2: PINE_D });
      }
    };
