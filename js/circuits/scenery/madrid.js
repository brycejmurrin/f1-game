/* Apex 26 — MADRID scenery (data only), split out of js/circuits/madrid.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["madrid"] =
  function (api) {
      const {
        out, MAT, seat, n, px, pz, hw, pyMin, night, hash, anchor, vadd,
        modelGroup, overheadSpan, groundPatch, groundedSegments,
        addBox, addCyl, addPrism, addFrustum,
        ridge, floodMast, tree, bush, hedge,
        billboard, marshalPost, wall, fence, guardrail, tyreWall,
        grandstandEx, cameraTower, broadcastCompound, sponsorHoarding,
        runoffApron,
      } = api;

      const WHITE = [0.92, 0.93, 0.94];
      const OFFWHITE = [0.86, 0.86, 0.83];
      const GLASS = night ? [0.82, 0.90, 1.00] : [0.60, 0.76, 0.88];
      const DARK_GLASS = [0.30, 0.42, 0.56];
      const CONCRETE = [0.72, 0.73, 0.75];
      const STEEL = [0.46, 0.49, 0.54];
      const STONE = [0.76, 0.70, 0.54];
      const MADRID_RED = [0.58, 0.22, 0.16];
      const ARCADE_DARK = [0.25, 0.14, 0.13];
      const STRAW = [0.76, 0.68, 0.45];
      const STRAW_DARK = [0.67, 0.59, 0.39];
      const OLIVE = [0.40, 0.46, 0.28];
      const CROWD = [0.48, 0.25, 0.24];
      const GOLD = [0.84, 0.66, 0.22];
      const SEAT_COL = [
        [0.66, 0.16, 0.16], [0.80, 0.62, 0.20], [0.62, 0.15, 0.15], [0.86, 0.68, 0.24],
      ];
      // Summer Madrid: short sleeves, sun hats, a lot of white.
      const FANS = [
        [0.92, 0.90, 0.86], [0.72, 0.20, 0.18], [0.88, 0.72, 0.26], [0.26, 0.32, 0.46],
        [0.90, 0.88, 0.82], [0.58, 0.24, 0.28], [0.34, 0.44, 0.36], [0.94, 0.92, 0.90],
      ];

      const at = (frac) => Math.round(frac * n) % n;
      const basis = (a) => [a.r, a.u, a.t];

      function venueGroup(id, frac, side, gap, size, required, emit) {
        const k = at(frac);
        const a = anchor(k, side, gap + size[0] / 2);
        const center = vadd(a.c, a.u, size[1] / 2);
        return modelGroup(id, { center, size, basis: basis(a) }, (stage) => {
          emit(stage, a, k);
        }, { required: !!required });
      }

      function ifemaHall(id, frac, side, gap, required, opts) {
        opts = opts || {};
        const roof = opts.roof || "sawtooth";
        const sign = opts.sign || MADRID_RED;
        venueGroup(id, frac, side, gap, [36, 25, 82], required, (stage, a) => {
          const b = basis(a);
          const IN = -side;                       // +a.r * IN faces the track
          addBox(stage, vadd(a.c, a.u, 8), [32, 16, 74], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 12.5), [32.4, 2.2, 74.4], GLASS, b);
          if (roof === "vault") {
            for (const off of [-8.2, 8.2]) {
              addCyl(stage, vadd(vadd(vadd(a.c, a.r, off), a.t, -35), a.u, 16),
                7.6, 70, OFFWHITE, 9, [a.u, a.t, a.r]);
            }
            addBox(stage, vadd(a.c, a.u, 16.4), [1.6, 0.8, 72], STEEL, b);   // valley gutter
          } else if (roof === "deck") {
            // Flat deck with rooftop plant — the newest halls on the campus.
            addBox(stage, vadd(a.c, a.u, 16.4), [32.6, 0.8, 74.6], OFFWHITE, b);
            for (let i = -2; i <= 2; i++) {
              const p = vadd(vadd(a.c, a.t, i * 14), a.u, 18.4);
              addBox(stage, vadd(p, a.r, IN * 5), [7, 3.2, 8], STEEL, b);     // AHU plant
              addBox(stage, vadd(vadd(vadd(a.c, a.t, i * 14), a.r, -IN * 7), a.u, 17.6),
                [4.2, 1.6, 5], CONCRETE, b);
            }
            addCyl(stage, vadd(vadd(a.c, a.t, 30), a.u, 16.8), 0.22, 9, STEEL, 5, b);
          } else {
            for (let i = -2; i <= 2; i++) {
              const p = vadd(vadd(a.c, a.t, i * 13), a.u, 16);
              addPrism(stage, p, [31, 3.4, 11], i % 2 ? STEEL : OFFWHITE, b);
              // Glazed face on the shaded flank of each tooth.
              addBox(stage, vadd(vadd(p, a.t, -4.6), a.u, 1.7),
                [30, 3.2, 0.35], GLASS, b);
            }
          }
          const entrance = vadd(vadd(a.c, a.r, IN * 11), a.u, 6);
          addBox(stage, entrance, [7, 12, 34], GLASS, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 14.4), a.u, 13.2),
            [1.0, 2.2, 26], sign, b);
        });
      }

      const TENDIDO = [STONE, CROWD, WHITE];
      function monumentalStand(id, frac, side, gap, required) {
        venueGroup(id, frac, side, gap, [22, 22, 34], required, (stage, a) => {
          const b = basis(a);
          for (let tier = 0; tier < 3; tier++) {
            const c = vadd(vadd(a.c, a.r, side * tier * 2.4), a.u, 3.0 + tier * 3.0);
            addBox(stage, c, [17 - tier * 1.8, 5.6, 31 - tier * 1.6], TENDIDO[tier], b);
          }
          addPrism(stage, vadd(vadd(a.c, a.r, side * 4.0), a.u, 11.9),
            [18, 3.2, 33], WHITE, b);
          const wall = vadd(a.c, a.r, -side * 7.5);
          addBox(stage, vadd(wall, a.u, 5.0), [1.0, 10, 33], OFFWHITE, b);
          addBox(stage, vadd(wall, a.u, 9.4), [1.15, 1.2, 33], MADRID_RED, b);   // capping band
          addBox(stage, vadd(wall, a.u, 8.5), [1.2, 0.3, 33], GOLD, b);          // pinstripe
          for (let gate = -1; gate <= 1; gate++) {
            addBox(stage, vadd(vadd(wall, a.t, gate * 10.5), a.u, 2.4),
              [1.25, 4.6, 3.0], ARCADE_DARK, b);                                  // callejón gate
          }
        });
      }

      const RENDER_COLS = [
        [0.78, 0.66, 0.50],   // ochre render
        [0.66, 0.42, 0.34],   // Madrid brick red
        [0.80, 0.76, 0.70],   // pale limestone render
        [0.70, 0.60, 0.48],   // weathered ochre
      ];
      let urbanSeq = 0;
      function urbanBlock(id, frac, side, gap, w, h, d, col) {
        const seq = urbanSeq++;
        const hv = hash(seq * 37 + 11);
        const type = Math.floor(hv * 3) % 3;
        const rc = RENDER_COLS[(seq + Math.floor(hv * 4)) % RENDER_COLS.length];
        const wall = [(col[0] * 0.45 + rc[0] * 0.55), (col[1] * 0.45 + rc[1] * 0.55),
                      (col[2] * 0.45 + rc[2] * 0.55)];
        const trim = [wall[0] * 1.12 + 0.06, wall[1] * 1.12 + 0.06, wall[2] * 1.12 + 0.06];
        venueGroup(id, frac, side, gap, [w + 2, h + 4, d + 2], false, (stage, a) => {
          const b = basis(a);
          const IN = -side;                       // +a.r * IN faces the track
          const bodyH = h * 0.72;
          stage._mat = MAT.STONE;
          addBox(stage, vadd(a.c, a.u, bodyH * 0.5), [w, bodyH, d], wall, b);
          stage._mat = 0;

          if (type === 0) {
            const bands = 3;
            for (let i = 0; i < bands; i++) {
              const y = bodyH * (0.28 + i * 0.22);
              stage._mat = MAT.CONCRETE;
              addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 + 0.25)), a.u, y),
                [0.9, 0.22, d * 0.86], trim, b);
              stage._mat = MAT.METAL;
              addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 + 0.62)), a.u, y + 0.55),
                [0.12, 0.9, d * 0.86], STEEL, b);
              stage._mat = 0;
              addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 - 0.45)), a.u, y + 0.95),
                [0.3, 1.5, d * 0.80], GLASS, b);
            }
            // Cornice + mansard-ish attic cap, both flush with the body.
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, bodyH + 0.25), [w, 0.5, d], trim, b);
            addBox(stage, vadd(a.c, a.u, bodyH + 1.6), [w * 0.86, 2.2, d * 0.88],
              [0.34, 0.30, 0.30], b);
            stage._mat = 0;
          } else if (type === 1) {
            // Ático: top storey stepped back behind an open roof terrace.
            addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 - 0.25)), a.u, bodyH * 0.52),
              [0.4, bodyH * 0.66, d * 0.86], GLASS, b);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(a.c, a.u, bodyH + 0.2), [w, 0.4, d], trim, b);
            addBox(stage, vadd(vadd(a.c, a.r, -IN * w * 0.16), a.u, bodyH + 1.9),
              [w * 0.62, 3.0, d * 0.72], OFFWHITE, b);          // set-back top storey
            // Terrace parapet along the street edge of the setback.
            addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 - 0.4)), a.u, bodyH + 0.9),
              [0.25, 1.0, d * 0.84], trim, b);
            stage._mat = 0;
            addBox(stage, vadd(vadd(a.c, a.r, -IN * w * 0.16), a.u, bodyH + 2.0),
              [0.3, 2.0, d * 0.66], GLASS, b);
          } else {
            stage._mat = MAT.STONE;
            for (let i = 0; i < 2; i++) {
              addBox(stage, vadd(vadd(a.c, a.r, IN * (w * 0.5 - 0.45)), a.u,
                bodyH * (0.36 + i * 0.30)), [0.5, bodyH * 0.16, d * 0.82],
                ARCADE_DARK, b);
            }
            // Ground-floor arcade openings — the shaded street level.
            for (let bay = -2; bay <= 2; bay++) {
              addBox(stage, vadd(vadd(vadd(a.c, a.t, bay * (d * 0.17)),
                a.r, IN * (w * 0.5 - 0.3)), a.u, 2.0),
                [0.6, 3.2, d * 0.09], ARCADE_DARK, b);
            }
            addBox(stage, vadd(a.c, a.u, bodyH + 0.3), [w, 0.6, d], trim, b);
            stage._mat = MAT.ROOF;
            addPrism(stage, vadd(a.c, a.u, bodyH + 0.6), [w, 1.8, d], [0.40, 0.28, 0.24], b);
            stage._mat = 0;
          }

          const roofTop = bodyH + (type === 1 ? 3.4 : 2.7);
          const headroom = h * 0.90 - roofTop;
          if (headroom > 1.2) {
            const ch = Math.min(2.6, headroom);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.t, (hv - 0.5) * d * 0.5), a.u, roofTop + ch * 0.35),
              [1.8, ch * 0.7, 2.2], [0.62, 0.60, 0.56], b);
            stage._mat = MAT.STONE;
            addBox(stage, vadd(vadd(a.c, a.t, (0.5 - hv) * d * 0.34), a.u, roofTop + ch * 0.5),
              [1.1, ch, 1.1], trim, b);
            stage._mat = 0;
          }
        });
      }

      function avenueOffice(id, frac, side, gap, h) {
        venueGroup(id, frac, side, gap, [20, h + 5, 32], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, h * 0.5), [17, h, 29], OFFWHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -side * 8.7), a.u, h * 0.56),
            [0.7, h * 0.72, 26], DARK_GLASS, b);
          for (let bay = -2; bay <= 2; bay++) {
            const col = vadd(vadd(a.c, a.t, bay * 5.1), a.r, -side * 9.3);
            addBox(stage, vadd(col, a.u, 3.4), [0.65, 6.8, 0.65], STEEL, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, -side * 10.0), a.u, 7.1),
            [3.0, 0.7, 29], WHITE, b);
        });
      }

      function monumentalArcade(id, frac, side) {
        venueGroup(id, frac, side, 35, [20, 18, 36], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, 4.5), [17, 9, 33], MADRID_RED, b);
          for (let bay = -3; bay <= 3; bay++) {
            const opening = vadd(vadd(a.c, a.t, bay * 4.2), a.r, -side * 8.7);
            addBox(stage, vadd(opening, a.u, 4.3), [0.7, 5.4, 2.4], ARCADE_DARK, b);
          }
          addBox(stage, vadd(a.c, a.u, 9.5), [18, 1.0, 34], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 12.0), [15, 4.0, 31], CROWD, b);
          addPrism(stage, vadd(a.c, a.u, 15.0), [17, 2.2, 34], WHITE, b);
        });
      }

      function madringDeck(id, frac, side, gap, bays, opts) {
        opts = opts || {};
        const rows = opts.rows || 7, pitch = 6.6, len = bays * pitch;
        const topH = 2.4 + rows * 1.42;
        const banner = opts.banner || MADRID_RED;
        venueGroup(id, frac, side, gap, [15, topH + 5.5, len + 3], false, (stage, a) => {
          const b = basis(a);
          const IN = -side;                       // +1 along a.r faces the track
          const run = 10.4, dl = Math.hypot(run, topH);
          const dv = [(a.r[0] * run * IN + a.u[0] * topH) / dl,
                      (a.r[1] * run * IN + a.u[1] * topH) / dl,
                      (a.r[2] * run * IN + a.u[2] * topH) / dl];
          const pv = [(-a.r[0] * topH * IN + a.u[0] * run) / dl,
                      (-a.r[1] * topH * IN + a.u[1] * run) / dl,
                      (-a.r[2] * topH * IN + a.u[2] * run) / dl];
          for (let i = 0; i <= bays; i++) {
            const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
            stage._mat = MAT.CONCRETE;
            addBox(stage, vadd(p, a.u, 0.22), [12.4, 0.44, 1.7], CONCRETE, b);   // precast pad
            stage._mat = MAT.METAL;
            seat.cyl(stage, vadd(p, a.r, IN * 5.2), 0.16, 2.4, STEEL, 6, b);     // front leg
            seat.cyl(stage, vadd(p, a.r, -IN * 5.2), 0.16, topH, STEEL, 6, b);   // back leg
            addBox(stage, vadd(p, a.u, topH * 0.5), [0.15, dl, 0.15], STEEL, [pv, dv, a.t]);
            addBox(stage, vadd(p, a.u, topH * 0.34), [10.6, 0.13, 0.13], STEEL, b);
            addBox(stage, vadd(p, a.u, topH * 0.72), [10.6, 0.13, 0.13], STEEL, b);
          }
          for (let t = 0; t < rows; t++) {
            const lat = IN * (4.7 - t * 1.32), y = 1.5 + t * 1.42;
            stage._mat = MAT.METAL;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.32, 0.16, len],
              [0.74, 0.75, 0.78], b);
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 0.16), [0.95, 0.78, len - 1.6],
              SEAT_COL[t % SEAT_COL.length], b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.95 < len - 3; j++) {
              const h2 = hash(Math.round(frac * 997) + t * 83 + j * 31);
              if (h2 < 0.42) continue;
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1.6 + j * 0.95), a.u, y + 0.9),
                [0.52, 0.94, 0.44], FANS[Math.floor(h2 * 83) % FANS.length], b);
            }
          }
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.6), a.u, 1.3), [0.22, 2.0, len], banner, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 5.68), a.u, 0.6), [0.14, 0.44, len], GOLD, b);
          if (opts.canopy !== false) {
            stage._mat = MAT.FABRIC;
            for (let i = 0; i <= bays; i++)
              seat.cyl(stage, vadd(vadd(a.c, a.t, (i - bays / 2) * pitch), a.r, -IN * 5.2),
                0.13, topH + 3.6, STEEL, 5, b);
            for (let i = 0; i < bays; i++)
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch), a.r, -IN * 0.8),
                  a.u, topH + 3.4),
                [9.4, 0.2, pitch - 0.5], (i % 2) ? OFFWHITE : [0.90, 0.84, 0.74], b);
            stage._mat = 0;
          }
        });
      }

      function madringPitBay(id, frac, side, gap, bays) {
        const pitch = 7.0, len = bays * pitch;
        venueGroup(id, frac, side, gap, [17, 15, len + 2], false, (stage, a) => {
          const b = basis(a);
          const IN = -side;
          addBox(stage, vadd(a.c, a.u, 3.1), [15, 6.2, len], WHITE, b);          // garage deck
          for (let i = 0; i < bays; i++) {
            const p = vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch);
            addBox(stage, vadd(vadd(p, a.r, IN * 7.4), a.u, 2.3),
              [0.5, 4.2, pitch - 1.5], ARCADE_DARK, b);                          // shutter opening
            addBox(stage, vadd(vadd(p, a.r, IN * 7.5), a.u, 5.2),
              [0.34, 1.0, pitch - 2.4], i % 2 ? MADRID_RED : GOLD, b);           // bay header
          }
          addBox(stage, vadd(vadd(a.c, a.r, -IN * 1.6), a.u, 8.9),
            [11.4, 5.0, len - 2], GLASS, b);                                     // suite storey
          addBox(stage, vadd(vadd(a.c, a.r, -IN * 1.6), a.u, 11.6),
            [11.8, 0.5, len - 1.4], OFFWHITE, b);
          addBox(stage, vadd(a.c, a.u, 6.5), [15.4, 0.5, len + 0.6], OFFWHITE, b); // terrace slab
          for (let i = 0; i < bays * 2; i++) {                                    // terrace railing
            const p = vadd(a.c, a.t, (i - (bays * 2 - 1) / 2) * (pitch / 2));
            seat.cyl(stage, vadd(vadd(p, a.r, IN * 7.0), a.u, 6.7), 0.06, 1.1, STEEL, 4, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, IN * 7.0), a.u, 7.7),
            [0.12, 0.42, len], MADRID_RED, b);
        });
      }

      ifemaHall("madrid-ifema-hall", 0.975, 1, 32, true, { roof: "sawtooth", sign: MADRID_RED });
      ifemaHall("madrid-ifema-hall-east", 0.035, 1, 34, false, { roof: "vault", sign: GOLD });
      ifemaHall("madrid-ifema-hall-west", 0.965, -1, 30, false, { roof: "deck", sign: MADRID_RED });
      ifemaHall("madrid-ifema-hall-north", 0.945, -1, 38, false, { roof: "sawtooth", sign: GOLD });
      ifemaHall("madrid-ifema-hall-northeast", 0.008, -1, 52, false, { roof: "deck", sign: MADRID_RED });
      ifemaHall("madrid-ifema-hall-far", 0.075, 1, 42, false, { roof: "vault", sign: GOLD });

      venueGroup("madrid-ifema-south-entrance", 0.055, -1, 24,
        [30, 22, 50], false, (stage, a) => {
          const b = basis(a);
          addBox(stage, vadd(a.c, a.u, 6.5), [26, 13, 46], GLASS, b);
          addBox(stage, vadd(vadd(a.c, a.r, 8), a.u, 9.0), [9, 18, 44], WHITE, b);
          for (let i = -2; i <= 2; i++) {
            addPrism(stage, vadd(vadd(a.c, a.t, i * 8.5), a.u, 14.5),
              [25, 2.4, 7.2], i % 2 ? STEEL : WHITE, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, 14.0), a.u, 7.0),
            [3.0, 1.0, 34], MADRID_RED, b);
        });

      // Barajas backdrop — the venue's single most distinctive real-world fact
      // (it sits minutes from Adolfo Suárez Madrid-Barajas airport) and until
      // now nothing in the file referenced it. Floated far beyond the terrain
      // ribbon like the Sierra ridge below, so it never needs real terrain
      // grounding: a control tower silhouette plus one low-poly airliner on
      // approach, s≈0.02 L per the brief.
      {
        const TOWER_COL = [0.80, 0.81, 0.83];
        const TOWER_GLASS = night ? [0.85, 0.92, 1.00] : [0.55, 0.72, 0.86];
        venueGroup("madrid-barajas-tower", 0.02, -1, 590, [16, 44, 16], false, (stage, a) => {
          const b = basis(a);
          addFrustum(stage, a.c, 5.0, 3.0, 34, TOWER_COL, 8, b);       // tapered shaft
          addBox(stage, vadd(a.c, a.u, 36), [9, 4, 9], TOWER_GLASS, b); // glass cab
          addCyl(stage, vadd(a.c, a.u, 38), 0.35, 6, STEEL, 6, b);      // radar mast
          addBox(stage, vadd(a.c, a.u, 44.4), [1.6, 0.3, 1.6],
            night ? [1.6, 0.2, 0.16] : MADRID_RED, b);                  // beacon
        });

        const AIR_BODY = [0.82, 0.84, 0.87];
        const AIR_TAIL = MADRID_RED;
        venueGroup("madrid-barajas-airliner", 0.024, -1, 640, [40, 180, 40], false, (stage, a) => {
          const alt = 90;
          const centre = vadd(a.c, a.u, alt);
          addCyl(stage, vadd(centre, a.t, -17), 1.7, 34, AIR_BODY, 8, [a.u, a.t, a.r]);
          addPrism(stage, vadd(centre, a.u, -0.4), [4.2, 0.9, 26], AIR_BODY, [a.t, a.u, a.r]);
          // Tail fin: a vertical ridge near the tail.
          addPrism(stage, vadd(centre, a.t, -16.6), [0.6, 5.2, 4.2], AIR_TAIL, [a.r, a.u, a.t]);
        });
      }

      // Pit wall & main grandstand (brief s≈0.00 R) — the brief's very first
      // landmark, and until now there was no grandstand() call anywhere in the
      // file. The pit/paddock modules below already occupy side R at gap 8-22,
      // so the main stand is built facing them from the OPPOSITE side of the
      // straight (side L) — fans across from the pits, not stacked on top of
      // them. Three raked tiers + glazed suites + end walls reads as a proper
      // international-broadcast main grandstand instead of a grey slab.
      // Kept to one 52 m bay. grandstandEx lays its crowd risers as rigid boxes
      // along ONE node's tangent, so the original 100 m span chorded across a
      // start "straight" that is not actually straight — props-over-road measured
      // the riser 0.77 m onto the tarmac.
      grandstandEx(0.00, -1, 10, 52, null, null,
        { livery: "crimson", tiers: 3, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.085, -1, 16, 45, null, null,
        { livery: "sandstone", tiers: 1, roof: "truss", h: 8 });
      grandstandEx(0.50, -1, 20, 40, null, null,
        { livery: "steel", tiers: 2, roof: "flat", endWalls: true, pylons: true });

      madringDeck("madrid-deck-avenue", 0.135, 1, 12, 7, { rows: 7 });
      madringDeck("madrid-deck-avenue-far", 0.300, 1, 14, 6, { rows: 6, banner: GOLD });
      madringDeck("madrid-deck-return", 0.620, -1, 13, 7, { rows: 8 });

      for (let i = 0; i < 5; i++) {
        madringPitBay(`madrid-pit-${i}`, (0.985 + i * 0.014) % 1, 1, 8, 3);
      }
      venueGroup("madrid-race-control", 0.058, 1, 10, [16, 30, 18], false, (stage, a) => {
        const b = basis(a);
        addBox(stage, vadd(a.c, a.u, 6.5), [14, 13, 16], WHITE, b);
        addBox(stage, vadd(a.c, a.u, 17.5), [12.5, 8.5, 14.5], GLASS, b);   // glazed control deck
        addBox(stage, vadd(a.c, a.u, 22.2), [13.2, 0.7, 15.2], OFFWHITE, b);
        addBox(stage, vadd(vadd(a.c, a.r, -7.2), a.u, 11.0),
          [0.3, 9.0, 3.4], MADRID_RED, b);
        seat.cyl(stage, vadd(a.c, a.u, 22.5), 0.16, 7, STEEL, 5, b);        // aerial mast
      });

      for (const side of [-1, 1]) {
        let i = 0;
        for (let f = 0.680; f <= 0.845; f += 0.0062, i++) {
          const id = side === 1 && i === 11
            ? "madrid-monumental"
            : `madrid-monumental-${side < 0 ? "l" : "r"}-${i}`;
          monumentalStand(id, f, side, 16, side === 1 && i === 11);
        }
      }
      for (let i = 0; i < 3; i++) {
        monumentalArcade(`madrid-monumental-arcade-${i}`, 0.705 + i * 0.05, 1);
      }
      for (const frac of [0.70, 0.74, 0.78, 0.82]) {
        const k = at(frac);
        floodMast(k, 1, 44, { h: 34, cool: true, pool: false });
        floodMast(k, -1, 44, { h: 34, cool: true, pool: false });
      }

      // ── THE BANKING, MADE VISIBLE ───────────────────────────────────────
      // bankZones tilts the ROAD through La Monumental at 13.5° (a 24% grade,
      // the circuit's single most-quoted fact) but nothing trackside said so:
      // from the car the bowl read as an ordinary flat corner with a white
      // stand ring behind it. These three layers are what makes a banked
      // section legible, and both inherit the track basis, so they tilt WITH
      // the road rather than needing a hand-built angle.
      //   1. a paved apron at the bottom of the bank where cars run wide
      //   2. raked buttress fins on the outside, so the bowl reads as a
      //      built structure rather than a painted corner
      // NOT bankedKerbStrip(): the shared ribbon is tuned for the shallow
      // bowls that use it (zandvoort/miami/qatar). Measured on THIS bank —
      // 13.5°, a 24% grade, on a 180° hairpin with hw 9 — it lands its kerb
      // boxes ~2 m over the racing line (measure-props-over-road 1.03 → 1.97,
      // isolated by removing each layer in turn). The apron and the fins carry
      // the same read without touching the road.
      // Aprons are laid in SHORT bays. runoffApron emits one rigid box along a
      // single node's tangent, and this is the tightest, most steeply banked
      // arc on the lap — a 30 m bay chorded straight across it and put paving
      // ~1 m over the racing line (measure-props-over-road went 1.03 → 1.97).
      // 10 m bays at twice the station count cover the same ground and follow
      // the curve. Same lesson as the pit bays and the main grandstand above.
      for (let f = 0.712; f <= 0.812; f += 0.0074) {
        runoffApron(at(f), 1, 6.0, [11, 0.3, 10], [0.44, 0.42, 0.40]);
        runoffApron(at(f), -1, 6.0, [11, 0.3, 10], [0.44, 0.42, 0.40]);
      }
      for (let f = 0.688; f <= 0.838; f += 0.0088) {
        for (const side of [-1, 1]) {
          const a = anchor(at(f), side, 9.5);
          if (!a) continue;
          const b = basis(a);
          out._mat = MAT.CONCRETE;
          addPrism(out, a.c, [4.6, 5.2, 1.6], CONCRETE, b);                  // raking fin
          addBox(out, vadd(a.c, a.u, 5.45), [5.0, 0.5, 2.0], OFFWHITE, b);   // capping pad
          out._mat = 0;
        }
      }

      const TUNNEL_DARK = [0.08, 0.08, 0.10];

      overheadSpan({
        id: "madrid-motorway-overpass",
        frac: 0.085,
        clearance: 6.2,
        thickness: 2.0,
        depth: 11,
        supportGap: 2.4,
        supportWidth: 1.2,
        color: CONCRETE,
        required: true,
              supports: false,
      });
      overheadSpan({
        id: "madrid-motorway-overpass-soffit",
        frac: 0.085,
        clearance: 6.2,
        thickness: 0.22,
        depth: 10.4,
        supportGap: 2.4,
        supportWidth: 1.2,
        // The soffit is the underside of the overpass directly above, at the
        // same frac — it is one bridge drawn in two layers, so it must not
        // raise a second set of legs on top of that bridge's own.
        supports: false,
        color: TUNNEL_DARK,
      });
      overheadSpan({
        id: "madrid-start-gantry",
        frac: 0.0,
        clearance: 6.8,
        thickness: 0.8,
        depth: 1.8,
        supportGap: 2.0,
        color: STEEL,
              supports: false,
      });
      overheadSpan({
        id: "madrid-ifema-access-bridge",
        frac: 0.885,
        clearance: 6.4,
        thickness: 1.6,
        depth: 10,
        supportGap: 2.8,
        supportWidth: 0.9,
        color: GLASS,
              supports: false,
      });
      overheadSpan({
        id: "madrid-ifema-access-bridge-soffit",
        frac: 0.885,
        clearance: 6.4,
        thickness: 0.22,
        depth: 9.4,
        supportGap: 2.8,
        supportWidth: 0.9,
        color: TUNNEL_DARK,
              supports: false,
      });
      for (const side of [-1, 1]) {
        venueGroup(`madrid-overpass-pier-${side}`, 0.085, side, 2.6,
          [1.4, 6.2, 16], false, (stage, a) => {
            addBox(stage, vadd(a.c, a.u, 3.1), [1.2, 6.2, 15], CONCRETE, basis(a));
          });
      }

      const bunkerPts = [];
      for (let f = 0.35; f <= 0.55; f += 0.003)
        bunkerPts.push({ k: at(f), side: 1, dist: 4.5 });
      groundedSegments({
        id: "madrid-el-bunker",
        points: bunkerPts,
        width: 0.9,
        height: 6.5,
        color: CONCRETE,
      });
      function bunkerSlotBand(yBase, thick, col) {
        const pts = [];
        for (let f = 0.35; f <= 0.55; f += 0.006) pts.push(at(f));
        for (let i = 0; i < pts.length - 1; i++) {
          const a = anchor(pts[i], 1, 4.75);
          const b2 = anchor(pts[i + 1], 1, 4.75);
          const dx = b2.c[0] - a.c[0], dy = b2.c[1] - a.c[1], dz = b2.c[2] - a.c[2];
          const length = Math.hypot(dx, dy, dz) || 0.1;
          const mid = vadd([
            (a.c[0] + b2.c[0]) / 2, (a.c[1] + b2.c[1]) / 2, (a.c[2] + b2.c[2]) / 2,
          ], a.u, yBase + thick / 2);
          addBox(out, mid, [0.35, thick, length], col, basis(a));
        }
      }
      const SLOT_DARK = [0.14, 0.14, 0.15];
      bunkerSlotBand(2.2, 0.5, SLOT_DARK);
      bunkerSlotBand(3.8, 0.5, SLOT_DARK);
      bunkerSlotBand(5.2, 0.5, SLOT_DARK);

      // Compact urban street walls. Each block has complete bounds and remains
      // close enough to sit on the rendered 56 m terrain ribbon.
      // Ranges closed at 0.27-0.30 and 0.65-0.68 (was 0.27/0.30 and 0.65/0.68
      // seams where the city band dropped out and returned) so the urban
      // frontage holds continuously instead of flashing empty for two beats.
      const urbanRanges = [
        [0.11, 0.30, [0.76, 0.73, 0.68]],
        [0.30, 0.48, [0.70, 0.71, 0.72]],
        [0.55, 0.68, [0.72, 0.70, 0.66]],
      ];
      let blockId = 0;
      for (const [s0, s1, col] of urbanRanges) {
        for (let f = s0; f <= s1; f += 0.035) {
          for (const side of [-1, 1]) {
            const h = 12 + hash(blockId * 7 + side) * 16;
            const gap = f > 0.23 && f < 0.28 && side === 1 ? 28 : 18;
            urbanBlock(`madrid-urban-${blockId++}`, f, side, gap,
              14, h, 22, col);
          }
        }
      }

      for (let i = 0; i < 3; i++) {
        const frac = 0.175 + i * 0.025;
        avenueOffice(`madrid-avenue-left-${i}`, frac, -1, 24, 18 + i * 3);
        avenueOffice(`madrid-avenue-right-${i}`, frac + 0.006, 1, 26, 21 - i * 2);
      }

      for (let i = 0; i < 4; i++) {
        const frac = 0.30 + i * (0.10 / 3);
        const h = [54, 68, 62, 58][i];
        venueGroup(`madrid-cuatro-torres-${i}`, frac, -1, 38,
          [17, h + 8, 17], false, (stage, a) => {
            const b = basis(a);
            addFrustum(stage, a.c, 7.4, 5.0, h, i === 1 ? GLASS : DARK_GLASS, 6, b);
            addFrustum(stage, vadd(a.c, a.u, h), 5.0, 1.6, 7, GLASS, 6, b);
            addCyl(stage, vadd(a.c, a.u, h + 7), 0.18, 4, STEEL, 5, b);
          });
      }

      for (let i = 0; i < 9; i++) {
        const frac = 0.275 + i * 0.011;
        const side = i % 2 ? 1 : -1;
        const h = 30 + hash(900 + i * 13) * 18;
        urbanBlock(`madrid-skyline-midrise-${i}`, frac, side, 42 + (i % 2) * 5,
          13 + (i % 3), h, 17, i % 2 ? CONCRETE : OFFWHITE);
      }
      for (let i = 0; i < 8; i++) {
        const frac = 0.12 + i * 0.02;
        const side = i % 2 ? -1 : 1;
        const h = 16 + hash(950 + i * 17) * 12;
        urbanBlock(`madrid-backdrop-${i}`, frac, side, 58 + (i % 3) * 8,
          16 + (i % 4), h, 24, i % 2 ? OFFWHITE : [0.74, 0.71, 0.66]);
      }

      function ifemaStand(id, frac, side) {
        venueGroup(id, frac, side, 14, [18, 17, 30], false, (stage, a) => {
          const b = basis(a);
          for (let tier = 0; tier < 4; tier++) {
            const c = vadd(vadd(a.c, a.r, side * tier * 2.0), a.u, 1.8 + tier * 2.2);
            addBox(stage, c, [12 - tier, 3.6, 27], tier % 2 ? CONCRETE : CROWD, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, side * 7.6), a.u, 6.2),
            [0.8, 12.4, 27], STEEL, b);
          addPrism(stage, vadd(vadd(a.c, a.r, side * 3.2), a.u, 13.0),
            [16, 2.6, 29], WHITE, b);
        });
      }
      ifemaStand("madrid-ifema-stand-0", 0.893, 1);
      ifemaStand("madrid-ifema-stand-1", 0.902, 1);
      ifemaStand("madrid-ifema-stand-2", 0.911, 1);

      // Warm terrain-conforming plazas and pelouse replace broad flat land boxes.
      for (const [frac, side, gap, col] of [
        [0.20, -1, 10, STRAW], [0.50, 1, 12, STRAW_DARK],
        [0.88, 1, 11, STRAW], [0.93, -1, 12, STONE],
      ]) {
        groundPatch(at(frac), side, gap, [28, 0.24, 48], col, {
          id: `madrid-ground-${frac}-${side}`,
          samples: 5,
        });
      }

      for (const side of [-1, 1]) {
        wall(0.86, 0.54, side, 1.8, 1.25, CONCRETE, 0.48);
        guardrail(0.54, 0.86, side, 4.8, [0.80, 0.81, 0.83]);
        fence(0.02, 0.50, side, 3.2, 2.7, [0.58, 0.60, 0.63]);
      }
      tyreWall(0.075, 0.105, 1, 3.2, [0.88, 0.25, 0.18]);
      tyreWall(0.13, 0.16, -1, 3.2, [0.18, 0.38, 0.82]);
      tyreWall(0.49, 0.525, 1, 3.2, [0.92, 0.74, 0.13]);

      sponsorHoarding(0.00, 0.03, -1, 6, { h: 1.3 });
      sponsorHoarding(0.615, 0.645, 1, 6, { h: 1.3 });
      cameraTower(at(0.078), 1, 20, { h: 16 });
      cameraTower(at(0.75), -1, 56, { h: 18 });
      broadcastCompound(at(0.965), -1, 75, { vans: 3, dishes: 2, mastH: 9 });

      // Sparse, deliberate furniture keeps the dry Castilian venue readable.
      hedge(0.12, 0.24, -1, 8, 1.3, OLIVE);
      hedge(0.84, 0.94, 1, 9, 1.3, OLIVE);
      // Castilian scrub fields: sparse olive shrub scatter over the straw
      // plains (brief s≈0.20 L and s≈0.96 L) — clustered, never near the edge.
      for (let i = 0; i < 22; i++) {
        const f = 0.155 + hash(300 + i * 7) * 0.10;
        bush(at(f), -1, 13 + hash(310 + i * 3) * 26, OLIVE);
      }
      for (let i = 0; i < 16; i++) {
        const f = 0.905 + hash(400 + i * 7) * 0.07;
        bush(at(f), -1, 12 + hash(410 + i * 3) * 22, OLIVE);
      }
      for (const [frac, side] of [
        [0.05, 1], [0.18, -1], [0.34, 1], [0.47, -1],
        [0.59, 1], [0.67, -1], [0.86, 1], [0.94, -1],
      ]) {
        const k = at(frac);
        billboard(k, side, 7.5, 8, 4.2, side > 0 ? [0.88, 0.22, 0.16] : [0.14, 0.42, 0.82]);
        marshalPost(k, -side, 4.5);
        if (frac < 0.50) tree(k, side, 14, 6 + hash(k) * 2.5, OLIVE);
        else bush(k, side, 13, OLIVE);
      }

      const SIERRA = [0.55, 0.60, 0.66];
      const SIERRA_FAR = [0.61, 0.66, 0.72];
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n;
      cz /= n;
      let radius = 0;
      for (let i = 0; i < n; i++)
        radius = Math.max(radius, Math.hypot(px[i] - cx, pz[i] - cz));
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        const R = radius + 1150 + hash(i * 3) * 180;
        const along = angle + Math.PI / 2 + (hash(i * 7) - 0.5) * 0.45;
        ridge(
          cx + Math.cos(angle) * R,
          cz + Math.sin(angle) * R,
          pyMin - 1,
          along,
          540 + hash(i * 5) * 260,
          170,
          52 + hash(i * 11) * 58,
          i % 2 ? SIERRA : SIERRA_FAR,
        );
      }
    };
