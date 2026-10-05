/* Apex 26 — INTERLAGOS scenery (data only), split out of js/circuits/interlagos.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. tools/manifest.cjs and
   tests/unit/load-order.test.mjs hold the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["interlagos"] =
  function (api) {
      const { K, out, MAT, seat, n, px, pz, pyMin, place, prop, backdrop, groundPlane, groundYAt,
              addBox, every, onTrack, hash, vadd, anchor, along, building, motorhome, tower,
              grandstand, grandstandEx, billboard, gantry, marshalPost, fence, guardrail, wall,
              tyreWall, pine, tree, palm, bush, hedge, peak, ridge, mountain,
              addCyl, addCone, addPrism, addPyramid, forestEdge, cityFront,
              modelGroup, waterSurface, groundPatch, broadcastCompound, cameraTower,
              sponsorHoarding, broadleafFall, lapBounds, py } = api;
      // Subtropical broadleaf canopy greens + flowering jacaranda.
      const BROAD = [[0.20, 0.42, 0.18], [0.24, 0.47, 0.20], [0.18, 0.38, 0.17]];
      const JACARANDA = [0.56, 0.44, 0.74];

      // Vivid favela palette (terracotta, sunflower, teal, coral, sage, ochre…)
      const FAV = [
        [0.88, 0.42, 0.30], [0.94, 0.80, 0.28], [0.30, 0.55, 0.80], [0.86, 0.46, 0.34],
        [0.70, 0.74, 0.54], [0.90, 0.62, 0.30], [0.82, 0.46, 0.56], [0.74, 0.68, 0.54],
        [0.84, 0.34, 0.30], [0.96, 0.84, 0.34], [0.42, 0.62, 0.58], [0.90, 0.90, 0.85],
      ];
      const RAW = [
        [0.52, 0.31, 0.24], [0.58, 0.35, 0.26], [0.47, 0.28, 0.22],
        [0.55, 0.38, 0.30], [0.50, 0.33, 0.27], [0.61, 0.40, 0.29],
      ];
      const SCREED = [[0.62, 0.60, 0.56], [0.56, 0.55, 0.52]];

      const favelaPatch = (s, side, baseDist, rows, colsW) => {
        const k = K(s);
        const rowAnchor = [];
        for (let r = 0; r < rows; r++) rowAnchor.push(anchor(k, side, baseDist + r * 7.5));
        const a = rowAnchor[0], bv = [a.r, a.u, a.t];
        const depth = rows * 7.5 + 8, width = colsW * 7 + 9;
        let minY = a.c[1], maxY = a.c[1];
        for (const ra of rowAnchor) { if (ra.c[1] < minY) minY = ra.c[1]; if (ra.c[1] > maxY) maxY = ra.c[1]; }
        const center = vadd(vadd(a.c, a.r, depth / 2 - 4), a.u, (maxY - minY) / 2 + 18);
        modelGroup(`interlagos-favela-${Math.round(s * 100)}`, {
          center, size: [depth, (maxY - minY) + 40, width], basis: bv,
        }, (stage) => {
          for (let r = 0; r < rows; r++) {
            const ra = rowAnchor[r];
            for (let c = 0; c < colsW; c++) {
              if (hash(k * 3 + r * 17 + c * 29) > 0.85) continue;   // alleys / gaps
              const off = (c - colsW / 2) * 7 + (hash(k + r * 5 + c) - 0.5) * 2.4;
              const h = 5.5 + hash(k * 7 + r * 11 + c) * 7.5;
              const w = 5 + hash(k * 9 + c) * 2.6, d = 5 + hash(k * 13 + r) * 2.4;
              const base = vadd(ra.c, a.t, off);
              stage._mat = MAT.CONCRETE;
              // Finish state per house: ~46% raw block, ~14% bare screed, the
              // rest painted. Keyed off the house's own hash so it is stable
              // across builds and so an upper storey can differ from the floor
              // below it — which is exactly what happens when a family adds a
              // room years later and never gets round to painting it.
              const fin = hash(k * 41 + r * 23 + c * 19);
              const wallCol = fin < 0.46 ? RAW[(r * 3 + c) % RAW.length]
                            : fin < 0.60 ? SCREED[(r + c) % SCREED.length]
                            : FAV[(r * 4 + c * 3 + (k & 3)) % FAV.length];
              // Odd columns foot 5 cm deeper (same top): neighbours overlap and
              // their undersides were one plane (ground-audit flatCoplanar).
              const foot = (c & 1) * 0.05;
              addBox(stage, vadd(base, a.u, (h - foot) / 2), [w, h + foot, d], wallCol, bv);
              if (hash(k * 17 + r + c) > 0.50) {
                const h2 = 2.8 + hash(k + c * 7) * 2.6;
                const fin2 = hash(k * 43 + r * 7 + c * 31);
                addBox(stage, vadd(base, a.u, h + h2 / 2), [w * 0.72, h2, d * 0.72],
                       fin2 < 0.62 ? RAW[(r + c * 2) % RAW.length]
                                   : FAV[(r + c + 1) % FAV.length], bv);
              }
              if (hash(k * 53 + r * 13 + c * 7) > 0.62) {
                // On the slab (2 cm in), not 0.5 m above it: on a one-storey
                // house the lid hovered over the roof (ground-audit).
                addCyl(stage, vadd(vadd(base, a.u, h - 0.02), a.t, d * 0.30),
                       0.42, 0.14, [0.88, 0.87, 0.84], 7, bv);
              }
              // Exposed rebar stubs on an unfinished top slab — the laje left
              // ready for a storey that may never come. Raw houses only.
              if (fin < 0.46 && hash(k * 59 + r * 3 + c * 11) > 0.68) {
                stage._mat = MAT.RUST;
                for (const [dx, dz] of [[-w * 0.3, -d * 0.3], [w * 0.3, d * 0.3]]) {
                  addCyl(stage, vadd(vadd(vadd(base, a.r, dx), a.t, dz), a.u, h),
                         0.05, 0.85, [0.45, 0.30, 0.20], 4, bv);
                }
                stage._mat = MAT.CONCRETE;
              }
              if (hash(k * 23 + r * 3 + c) > 0.48) {
                stage._mat = MAT.RUST;
                addCyl(stage, vadd(base, a.u, h + 0.1), 0.72, 1.3,
                       hash(k + c) > 0.5 ? [0.22, 0.32, 0.58] : [0.12, 0.12, 0.14], 6, bv);
                stage._mat = MAT.CONCRETE;
              }
            }
          }
          stage._mat = 0;
        }, { required: s === 0.13 });
      };

      const crowdCols = [
        [0.94, 0.86, 0.20], [0.16, 0.62, 0.34], [0.96, 0.90, 0.28], [0.18, 0.58, 0.32],
        [0.94, 0.86, 0.20], [0.16, 0.62, 0.34], [0.90, 0.90, 0.92],
      ];
      const crowdBank = (s, side, gap, len, rows) => {
        const k = K(s), a = anchor(k, side, gap);
        const bv = [a.r, a.u, a.t], step = 2.4, rise = 1.8, seats = Math.floor(len / 2.0);
        // OUTWARD IS `side * a.r`, not bare `+a.r`. Every call site passes
        // side=-1, so the bank stepped TOWARD the track as it rose: highest row
        // nearest the tarmac, the rake inverted. The sibling arquibancada in
        // this same file states the idiom (`const IN = -side` — +a.r faces the
        // track), so rows walk away along `side`. The declared bounds move with
        // the seats, or the group no longer covers what it carries.
        modelGroup(`interlagos-crowd-${k}`, {
          center: vadd(vadd(a.c, a.r, side * rows * step / 2), a.u, rows * rise / 2),
          size: [len + 3, rows * rise + 3, rows * step + 3],
          basis: [a.t, a.u, a.r],
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Terrace mass under the seating. Was an addPrism lifted by half the
          // bank height — but addPrism anchors at its BASE, so the ramp started
          // in mid-air, and its footprint axes were swapped relative to the
          // seats (which spread by `len` along a.t and step by rows*step along
          // a.r), leaving whole rows over nothing. A box on the ground covering
          // the real seating footprint carries every row.
          // FLOAT FIX (class b, overhanging past its supporting body — here the
          // support instead falls SHORT of what it carries): this box was
          // centred AT the anchor with no a.r offset, so it only covered dist
          // [gap-rows*step/2, gap+rows*step/2] — half its depth wasted toward
          // the road, and every seat past r>=~3 (seats run to gap+(rows-1)*step)
          // sat beyond the mass's far edge with nothing under it. The declared
          // modelGroup bounds above already offset their centre forward by
          // rows*step/2 to span the real seating footprint; the mass box itself
          // never got the same offset. Match it.
          addBox(stage, vadd(vadd(a.c, a.r, side * rows * step * 0.5), a.u, rows * rise * 0.5),
                 [len, rows * rise, rows * step], [0.42, 0.43, 0.47], [a.t, a.u, a.r]);
          stage._mat = 0;
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < seats; c++) {
              const off = (c - seats / 2) * 2.0 + (hash(k * 7 + r * 13 + c) - 0.5) * 0.7;
              const p = vadd(vadd(vadd(a.c, a.r, side * r * step), a.u, r * rise + 1.1), a.t, off);
              addBox(stage, p, [0.9, 1.1, 0.8], crowdCols[(r * 5 + c * 3) % crowdCols.length], bv);
            }
        });
      };

      const CONC_WORN = [[0.68, 0.66, 0.60], [0.62, 0.60, 0.55], [0.71, 0.68, 0.61]];
      const RUSTED = [0.56, 0.32, 0.20], RUST_DK = [0.44, 0.25, 0.16];
      const RAIL_Y = [0.94, 0.84, 0.16], RAIL_G = [0.10, 0.56, 0.28];
      const arquibancada = (id, s, side, dist, bays, opts) => {
        opts = opts || {};
        const rows = opts.rows || 8, pitch = 6.5, len = bays * pitch;
        const k = K(s), a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        const IN = -side;                       // +1 along a.r faces the track
        const backH = 1.1 + rows * 1.12;
        modelGroup(id, {
          center: vadd(a.c, a.u, (backH + 6.4) / 2),
          size: [16, backH + 6.4, len + 3], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          for (let t = 0; t < rows; t++) {
            const lat = IN * (5.6 - t * 1.28), y = t * 1.12;
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y), [1.28, 1.12, len],
              CONC_WORN[t % CONC_WORN.length], b);
            // Fibre-cement bench capping — the only "seat" a terrace here has.
            seat.box(stage, vadd(vadd(a.c, a.r, lat), a.u, y + 1.12), [1.05, 0.22, len - 1.2],
              (t % 2) ? [0.78, 0.75, 0.68] : [0.74, 0.71, 0.64], b);
            stage._mat = MAT.FABRIC;
            for (let j = 0; j * 0.82 < len - 2; j++) {
              const h2 = hash(k * 23 + t * 61 + j * 19);
              if (h2 < 0.30) continue;          // a famously full house
              seat.box(stage,
                vadd(vadd(vadd(a.c, a.r, lat), a.t, -len / 2 + 1.2 + j * 0.82), a.u, y + 1.34),
                [0.5, 0.92, 0.42], crowdCols[Math.floor(h2 * 61) % crowdCols.length], b);
            }
            stage._mat = MAT.CONCRETE;
          }
          stage._mat = MAT.METAL;
          for (let i = 0; i * 2.6 < len; i++)
            seat.cyl(stage, vadd(vadd(a.c, a.t, -len / 2 + i * 2.6 + 1.3), a.r, IN * 6.2),
              0.07, 1.2, RAIL_G, 4, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 6.2), a.u, 1.2), [0.11, 0.11, len], RAIL_Y, b);
          addBox(stage, vadd(vadd(a.c, a.r, IN * 6.2), a.u, 0.72), [0.09, 0.09, len], RAIL_G, b);
          // Rusted canopy on open lattice trusses, over the BACK rows only.
          if (opts.roof !== false) {
            stage._mat = MAT.RUST;
            for (let i = 0; i <= bays; i++) {
              const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
              // Footed 0.5 m below the anchor (same tops): on a falling bay the
              // anchor's 0.3 m embed left end posts 0.2-0.3 m in the air, and
              // the whole canopy hung off them (ground-audit unsupported).
              seat.cyl(stage, vadd(vadd(p, a.r, -IN * 6.0), a.u, -0.5), 0.17, backH + 4.9, RUST_DK, 5, b);
              seat.cyl(stage, vadd(vadd(p, a.r, IN * 0.4), a.u, -0.5), 0.14, backH + 3.7, RUST_DK, 5, b);
              addBox(stage, vadd(vadd(p, a.r, -IN * 2.8), a.u, backH + 3.6),
                [7.2, 0.14, 0.14], RUST_DK, b);
            }
            // Two purlins between truss tops and sheet undersides: the sheets
            // between posts rested on nothing, 0.42 m clear of the trusses.
            for (const lat of [-1.0, -4.6])
              addBox(stage, vadd(vadd(a.c, a.r, IN * lat), a.u, backH + 3.88),
                [0.16, 0.42, len], RUST_DK, b);
            for (let i = 0; i * 1.5 < len; i++) {
              const p = vadd(a.c, a.t, -len / 2 + i * 1.5 + 0.75);
              addBox(stage, vadd(vadd(p, a.r, -IN * 2.8), a.u, backH + 4.2),
                [7.6, 0.22, 0.78], (i % 2) ? RUSTED : [0.60, 0.38, 0.24], b);
            }
          }
          // Wave-4: yellow/green Brazilian fascia on the front rail (Sector M /
          // Curva 1 identity — research: packed yellow-green crowd terraces).
          if (opts.brFlag) {
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, IN * 5.4), a.u, backH * 0.55),
              [0.28, 1.1, len * 0.92], RAIL_Y, b);
            addBox(stage, vadd(vadd(a.c, a.r, IN * 5.4), a.u, backH * 0.55 + 1.3),
              [0.28, 1.1, len * 0.92], RAIL_G, b);
          }
          stage._mat = 0;
        }, { required: !!opts.required });
      };

      const pitGarageRow = (id, s, side, gap, bays) => {
        const pitch = 7.4, len = bays * pitch;
        const k = K(s), a = anchor(k, side, gap + 7), b = [a.r, a.u, a.t];
        const IN = -side;
        const DECK = [0.70, 0.69, 0.66], SHUT = [0.26, 0.28, 0.32];
        const HEADER = [[0.94, 0.84, 0.20], [0.12, 0.56, 0.30], [0.90, 0.90, 0.88]];
        modelGroup(id, {
          center: vadd(a.c, a.u, 6), size: [15, 12, len + 2], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 3.4), [13, 6.8, len], DECK, b);
          for (let i = 0; i < bays; i++) {
            const p = vadd(a.c, a.t, (i - (bays - 1) / 2) * pitch);
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(p, a.r, IN * 6.4), a.u, 2.2),
              [0.45, 4.0, pitch - 1.6], SHUT, b);                       // roller shutter
            stage._mat = 0;
            addBox(stage, vadd(vadd(p, a.r, IN * 6.5), a.u, 5.0),
              [0.3, 1.0, pitch - 2.4], HEADER[i % HEADER.length], b);   // team header
          }
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 7.0), [13.6, 0.5, len + 0.6], [0.62, 0.61, 0.58], b);
          stage._mat = MAT.METAL;
          for (let i = 0; i < bays * 2; i++) {                          // terrace rail
            const p = vadd(a.c, a.t, (i - (bays * 2 - 1) / 2) * (pitch / 2));
            seat.cyl(stage, vadd(vadd(p, a.r, IN * 6.1), a.u, 7.2), 0.06, 1.1, [0.80, 0.80, 0.82], 4, b);
          }
          addBox(stage, vadd(vadd(a.c, a.r, IN * 6.1), a.u, 8.2),
            [0.1, 0.1, len], [0.84, 0.84, 0.86], b);
          stage._mat = 0;
        });
      };

      const pitTower = (s, side, gap) => {
        const k = K(s), a = anchor(k, side, gap + 7);
        const bv = [a.r, a.u, a.t];
        const W = 14, D = 11, H = 44;
        const CONC = [0.56, 0.56, 0.58], WIN = [0.20, 0.28, 0.38], CAP = [0.42, 0.44, 0.48];
        modelGroup("interlagos-pit-tower", {
          center: vadd(a.c, a.u, 27), size: [16, 58, 14], basis: bv,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, H / 2), [W, H, D], CONC, bv);
          for (let i = 0; i < 9; i++) {
            const y = 3.5 + i * 4.4;
            addBox(stage, vadd(a.c, a.u, y), [W * 1.04, 1.7, D * 1.04], WIN, bv);
          }
          addBox(stage, vadd(a.c, a.u, H + 1.8), [W * 0.88, 3.6, D * 0.88], CAP, bv);
          addBox(stage, vadd(a.c, a.u, H + 1.8), [W * 0.94, 2.0, D * 0.94], [0.28, 0.36, 0.46], bv);
          stage._mat = 0;
          addCyl(stage, vadd(a.c, a.u, H + 3.6), 0.18, 14, [0.30, 0.30, 0.32], 4, bv);
        }, { required: true });
      };

      // Tropical palette constants
      const GREEN  = [0.20, 0.44, 0.20];
      // Hill green for backdrop mounds
      const HILL   = [0.22, 0.46, 0.20];
      const HILL2  = [0.26, 0.52, 0.22];
      // Lit-window yellow (simulates emissive glow; bright warm amber)
      const LIT_WIN = [0.98, 0.90, 0.38];
      // Dim lamp-head colour (warm white)
      const LAMP    = [0.96, 0.96, 0.82];

      const kpit = K(0.0);
      // 32 m out (its 16 m bounds reach back to 31): the engine's pit complex
      // owns the first 30 m on the pit side here — lane, garages, service road
      // — and at 14 the tower stood inside the garages and was superseded.
      pitTower(0.0, 1, 32);
      building(kpit, 1, 8, 14, 16, 32, { kind: "notch", wall: [0.62, 0.62, 0.64],
               window: [0.24, 0.32, 0.40], floor: 3.6 });

      for (const s of [0.97, 0.99, 0.01, 0.03]) {
        pitGarageRow(`interlagos-pit-garages-${Math.round(s * 1000)}`, s, 1, 6, 3);
      }

      for (const s of [0.95, 0.98, 0.02, 0.05]) {
        const k = K(s);
        motorhome(k, 1, 36 + hash(k) * 16, 11, 7, 18, { wall: [0.82, 0.84, 0.86] });
      }
      for (const [s, col] of [
        [0.965, [0.72, 0.74, 0.76]], [0.015, [0.80, 0.80, 0.78]], [0.045, [0.68, 0.72, 0.76]],
      ]) {
        building(K(s), 1, 58, 14, 6.5, 20, { kind: "hall",
          wall: col, window: [0.22, 0.28, 0.34], floor: 3.1, roof: [0.48, 0.50, 0.52],
        });
      }

      // Pit wall: solid low concrete barrier on the R of the pit straight
      wall(0.96, 0.06, 1, 2.4, 1.1, [0.82, 0.82, 0.84], 0.45);

      grandstandEx(0.94, 1, 9, 80, null, [0.94, 0.84, 0.22],
                   { livery: "concrete", tiers: 2, roof: "cantilever", suites: true, endWalls: true });

      broadcastCompound(K(0.015), 1, 92, { vans: 4, dishes: 2, mastH: 10 });

      gantry(0.005, 8.2, [0.20, 0.22, 0.26]);

      {
        const ahp = anchor(K(0.025), 1, 40);
        addBox(out, vadd(ahp.c, ahp.u, 0.1), [20, 0.2, 20], [0.52, 0.54, 0.54], [ahp.r, ahp.u, ahp.t]);
        addBox(out, vadd(ahp.c, ahp.u, 0.2), [18, 0.2, 2.0], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
        // 4 cm above its cross-bar, whose top and underside it shared.
        addBox(out, vadd(ahp.c, ahp.u, 0.24), [2.0, 0.2, 18], [0.92, 0.88, 0.10], [ahp.r, ahp.u, ahp.t]);
      }

      for (const s of [0.94, 0.96, 0.98, 0.00, 0.02, 0.04]) {
        const k = K(s);
        for (const side of [-1, 1]) {
          const anc = anchor(k, side, 14);
          if (onTrack(anc.c[0], anc.c[2], 3)) continue;
          // post
          addCyl(out, anc.c, 0.14, 10, [0.32, 0.32, 0.34], 5, [anc.r, anc.u, anc.t]);
          // lamp head (bright warm disc on top)
          addBox(out, vadd(anc.c, anc.u, 10.3), [2.2, 0.35, 0.7], LAMP, [anc.r, anc.u, anc.t]);
        }
      }

      grandstandEx(0.01, -1, 10, 120, null, [0.94, 0.84, 0.22],
                   { livery: "steel", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      // Wave-4 hero: Tribunas / Sector M facade — yellow+green Brazilian trim
      // over the generic grandstandEx (Monza Tribuna Centrale pattern).
      {
        // Rear Sector M facade, behind BOTH the generic stand (outer shell
        // 22.5 m) and the packed upper terrace at .02 (gap 30..49.2 m).
        // Its nearer upper face is 8.5 m toward the track: gap 62 keeps that
        // face behind the terrace, including the neighbouring frame's turn.
        const a = anchor(K(0.01), -1, 62);
        if (!onTrack(a.c[0], a.c[2], 8)) {   // margin is past the road EDGE and inside the facade's 62 m gap
          const b = [a.r, a.u, a.t];
          modelGroup("interlagos-main-tribuna", {
            center: vadd(a.c, a.u, 9), size: [18, 18, 110], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            const GREY_A = [0.62, 0.62, 0.64], GREY_B = [0.56, 0.56, 0.58];
            addBox(stage, vadd(a.c, a.u, 4.0), [14, 8.0, 100], GREY_A, b);
            addBox(stage, vadd(vadd(a.c, a.r, 2.5), a.u, 10.5), [12, 6.5, 90], GREY_B, b);
            // Attached track-facing trim: side -1 faces the track along +r.
            // Each 0.10 m panel embeds 1 cm in its own wall and stands 9 cm
            // proud, so Brazilian colours remain visible without a free rail.
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, 7.04), a.u, 6.8),
              [0.10, 1.2, 96], RAIL_Y, b);
            addBox(stage, vadd(vadd(a.c, a.r, 8.54), a.u, 12.2),
              [0.10, 1.2, 86], RAIL_G, b);
            // The lip rests on the upper block's 13.75 m top and projects
            // 0.5 m beyond its track-facing wall.
            addBox(stage, vadd(vadd(a.c, a.r, 2.5), a.u, 14.05), [13, 0.6, 92], [0.72, 0.74, 0.78], b);
          }, { required: true });
        }
      }
      // Open steel truss roof for a different silhouette along the same tier
      grandstandEx(0.05, -1, 11,  85, null, [0.18, 0.58, 0.32],
                   { livery: "darkSteel", roof: "truss", pylons: true });
      grandstandEx(0.09, -1, 12,  90, null, [0.92, 0.82, 0.20],
                   { livery: "sandstone", roof: "flat" });
      // Steep PACKED upper terraces rising behind the Curva 1 bowl stands
      crowdBank(0.02, -1, 30, 130, 8);
      // Wave-4 hero: Curva do Sol / Sector H open terrace — yellow+green fascia.
      arquibancada("interlagos-arq-sol", 0.117, -1, 16, 7, { rows: 8, required: true, brFlag: true });
      for (const s of [0.00, 0.04, 0.08]) billboard(K(s), -1, 26, 16, 7, [0.94, 0.92, 0.88]);

      // ── Senna S corridor — wave-4 hero (research: downhill L-R into Curva do Sol)
      // Compact yellow/green packed stand on the outside + thick kerb teeth both
      // apexes. Kept as one required modelGroup so clip-audit treats the assembly
      // as a single model (interlagos baseline is 0 severe).
      {
        const a = anchor(K(0.055), -1, 18);
        if (!onTrack(a.c[0], a.c[2], 14)) {
          const b = [a.r, a.u, a.t];
          modelGroup("interlagos-senna-s", {
            center: vadd(a.c, a.u, 6), size: [22, 14, 48], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            // Stepped open terrace mass — rows walk OUTWARD along side*a.r.
            for (let t = 0; t < 5; t++) {
              const outLat = (-1) * (2.0 + t * 1.8);
              addBox(stage, vadd(vadd(a.c, a.r, outLat), a.u, t * 1.15 + 0.6),
                [3.2, 1.15, 42 - t * 2], CONC_WORN[t % CONC_WORN.length], b);
            }
            // Yellow / green rail fascia — Brazilian race-day read.
            stage._mat = MAT.METAL;
            addBox(stage, vadd(vadd(a.c, a.r, -1 * 3.5), a.u, 6.2),
              [0.35, 1.0, 38], RAIL_Y, b);
            addBox(stage, vadd(vadd(a.c, a.r, -1 * 3.5), a.u, 7.4),
              [0.35, 1.0, 38], RAIL_G, b);
            // Dense yellow/green crowd speckles on the top two rows.
            stage._mat = MAT.FABRIC;
            for (let r = 3; r < 5; r++)
              for (let c = 0; c < 18; c++) {
                if (hash(r * 31 + c * 17) < 0.28) continue;
                const outLat = (-1) * (2.0 + r * 1.8);
                addBox(stage,
                  vadd(vadd(vadd(a.c, a.r, outLat), a.t, (c - 8.5) * 2.1), a.u, r * 1.15 + 1.3),
                  [0.55, 0.95, 0.45], crowdCols[(r * 5 + c) % crowdCols.length], b);
              }
            stage._mat = 0;
          }, { required: true });
        }
      }
      for (const [s, side] of [
        [0.04, -1], [0.05, 1], [0.055, -1], [0.065, 1], [0.075, -1], [0.085, 1], [0.095, -1],
      ]) {
        const k = K(s);
        // (Three 0.24 m red/white "kerb teeth" place()s stood here at 1.7-3.3 m:
        // place() sinks a box 0.8 m, so all 21 were whole-top buried and never
        // rendered — ground-audit. The engine draws the real kerbs.)
        place(k, side, 4.8, [3.6, 0.22, 10], [0.88, 0.88, 0.88]);
      }
      // Tyre barriers at the Senna S chicane — blue/white for Turn 1, yellow for T2
      tyreWall(0.04, 0.07,  1, 5, [0.92, 0.92, 0.92]);
      tyreWall(0.06, 0.09, -1, 5, [0.30, 0.55, 0.85]);
      marshalPost(K(0.05),   1, 8);
      marshalPost(K(0.085), -1, 8);

      forestEdge(0.04, 0.10,  1, 14, { density: 0.78, hMin: 10, hMax: 16,
                                        col: [0.18, 0.42, 0.18], col2: [0.24, 0.48, 0.24], pineFrac: 0 });
      forestEdge(0.04, 0.10, -1, 18, { density: 0.58, hMin: 11, hMax: 17,
                                        col: [0.20, 0.44, 0.20], col2: [0.26, 0.50, 0.24], pineFrac: 0 });
      // Steep green bank boxes selling the plunge into the S
      for (const s of [0.045, 0.06, 0.08]) {
        backdrop(K(s), 1, 28, [22, 8, 18], HILL);
        backdrop(K(s), -1, 34, [20, 7, 16], HILL2);
      }
      // Scattered palms for tropical character
      for (const [s, side] of [[0.04, 1], [0.06, -1], [0.08, 1], [0.10, -1]]) {
        const k = K(s);
        palm(k, side, 26 + hash(k * 9) * 10, 11 + hash(k * 13) * 5, [0.26, 0.48, 0.22]);
        bush(k, side, 18 + hash(k * 11) * 8, [0.26, 0.50, 0.24]);
      }

      every(120, (k) => {
        // Only L side (side=-1) for the favela hillside
        const inFavela = (() => {
          // nodes that lie between s=0.08 and s=0.32
          const k0 = K(0.08), k1 = K(0.32);
          const span = ((k1 - k0) + n) % n;
          const off  = ((k  - k0) + n) % n;
          return off <= span;
        })();
        if (!inFavela) return;
        const hv = hash(k * 17 + 3);
        // Narrow width (≤60 m) so onTrack(center, sz[0]/2+6=36) catches inner-loop clashes
        backdrop(k, -1, 110 + hv * 30, [60, 24 + hv * 16, 48], HILL);
        if (hash(k * 23 + 5) > 0.4) {
          backdrop(k, -1, 160 + hash(k * 29) * 30, [70, 20 + hash(k * 31) * 12, 55], HILL2);
        }
      });

      forestEdge(0.10, 0.32, -1, 34, { density: 0.42, hMin: 6, hMax: 11,
                                        col: [0.18, 0.40, 0.18], col2: [0.22, 0.44, 0.20], pineFrac: 0 });

      // Three dense climbing communities: baseDist 68-90 m, rows 8-9. Each
      // patch grounds per-row against the real terrain (see favelaPatch), so
      // no `slope` arg fakes the climb.
      favelaPatch(0.13, -1, 72, 8, 7);
      favelaPatch(0.17, -1, 68, 9, 7);
      favelaPatch(0.22, -1, 72, 8, 6);
      favelaPatch(0.265, -1, 82, 6, 6);
      favelaPatch(0.29, -1, 90, 4, 5);
      // A couple of taller finished landmark blocks poking above the shanties
      for (let i = 0; i < 3; i++) {
        const s = 0.14 + (i / 3) * 0.10;
        building(K(s), -1, 95 + i * 12, 12, 20 + hash(K(s) * 11 + i) * 14, 12,
          { kind: "jenga", wall: FAV[(i * 3) % FAV.length], window: LIT_WIN, floor: 3.0, lit: false });
      }

      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 10, 13, 5, [0.92, 0.92, 0.90]);
      hedge(0.20, 0.32, 1, 15, 2.4, GREEN);
      // Uncovered bleacher variant — a bare stand at the straight, no roof mass
      grandstandEx(0.27, -1, 12, 72, null, [0.32, 0.52, 0.36], { livery: "steel", roof: "none" });
      crowdBank(0.275, -1, 31, 78, 6);
      marshalPost(K(0.24), 1, 8);

      waterSurface(K(0.42), -1, 520, [380, 0.5, 460], [0.20, 0.40, 0.49],
                   { id: "interlagos-guarapiranga", required: true });

      // Dense shoreline forestEdge — guaranteed no barrier clipping
      forestEdge(0.28, 0.48, -1, 28, { density: 0.80, hMin: 10, hMax: 18,
                                        col: [0.18, 0.42, 0.18], col2: [0.22, 0.46, 0.18], pineFrac: 0 });
      // Palms near water's edge for tropical look
      for (const s of [0.30, 0.34, 0.38, 0.42, 0.46]) {
        const k = K(s);
        palm(k, -1, 52 + hash(k * 7) * 22, 12 + hash(k * 11) * 5, [0.24, 0.46, 0.20]);
        palm(k, -1, 70 + hash(k * 13) * 18, 10 + hash(k * 17) * 4, [0.26, 0.48, 0.22]);
      }

      // DESCIDA DO LAGO / FERRADURA (bankZones frac 0.4547, both mid): the
      // downhill run into the horseshoe, dressed at the GPS-referenced apex
      // fraction bankZones carries (as are Bico de Pato/Mergulho/Junção/
      // Arquibancadas below).
      groundPatch(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40],
                  { id: "interlagos-descida-gravel", samples: 6 });
      hedge(0.42, 0.50, -1, 14, 2.0, GREEN);
      tyreWall(0.44, 0.48, 1, 5, [0.85, 0.30, 0.30]);
      tyreWall(0.435, 0.475, -1, 4, [0.92, 0.80, 0.22]);
      marshalPost(K(0.46), -1, 8);
      grandstandEx(0.4547, 1, 12, 64, null, [0.32, 0.52, 0.36],
                   { livery: "terracotta", roof: "truss", pylons: true, endWalls: true });

      const SP_PALETTE = [
        [0.50, 0.52, 0.58], [0.54, 0.56, 0.62], [0.46, 0.48, 0.54],
        [0.60, 0.58, 0.54], [0.52, 0.54, 0.60], [0.48, 0.50, 0.56],
      ];
      cityFront(0.52, 0.69, 1, 180, {
        minH: 40, maxH: 78,
        depth: 28,
        palette: SP_PALETTE,
        lit: true,
        windowCol: LIT_WIN,
        step: 110,
        floor: 8,
      });
      cityFront(0.49, 0.74, 1, 285, {
        minH: 58, maxH: 104,
        depth: 34,
        palette: [[0.42, 0.46, 0.54], [0.50, 0.52, 0.58], [0.56, 0.55, 0.52]],
        lit: true,
        windowCol: [0.90, 0.82, 0.42],
        step: 165,
        floor: 9,
      });

      // ── São Paulo skyline — wave-4 hero (research: haze-grey high-rises on
      // the far horizon behind the favela hills, NOT trackside). One atomic
      // cluster so clip-audit sees a single model; dist 240 m keeps feet on
      // the far-scenery floor without floating over the lake void.
      {
        const a = anchor(K(0.60), 1, 240);
        if (!onTrack(a.c[0], a.c[2], 40)) {
          const b = [a.r, a.u, a.t];
          const HAZE = [
            [0.50, 0.52, 0.58], [0.46, 0.48, 0.54], [0.54, 0.56, 0.62],
            [0.48, 0.50, 0.56], [0.52, 0.54, 0.60], [0.44, 0.46, 0.52],
          ];
          modelGroup("interlagos-sp-skyline", {
            center: vadd(a.c, a.u, 45), size: [60, 110, 140], basis: b,
          }, (stage) => {
            stage._mat = MAT.CONCRETE;
            const towers = [
              [-48, 52, 14], [-28, 78, 16], [-8, 64, 12],
              [12, 92, 18], [34, 70, 14], [52, 58, 11],
            ];
            for (let i = 0; i < towers.length; i++) {
              const [tOff, h, w] = towers[i];
              const base = vadd(a.c, a.t, tOff);
              addBox(stage, vadd(base, a.u, h / 2), [w, h, w * 0.72], HAZE[i], b);
              // Lit window band mid-height so the silhouette reads as city, not rock.
              stage._mat = MAT.GLASS;
              addBox(stage, vadd(base, a.u, h * 0.55),
                [w * 1.05, h * 0.12, w * 0.78], LIT_WIN, b);
              stage._mat = MAT.CONCRETE;
            }
            stage._mat = 0;
          }, { required: true });
        }
      }

      every(180, (k) => {
        // Only around the R side skyline section (s≈0.40–0.85)
        const inSky = (() => {
          const k0 = K(0.40), k1 = K(0.78);
          const span = ((k1 - k0) + n) % n;
          const off  = ((k  - k0) + n) % n;
          return off <= span;
        })();
        if (!inSky) return;
        const hv  = hash(k * 7 + 280);
        const d   = 300 + hv * 120;
        const ht  = 32 + hv * 50;
        const w   = 22 + hash(k * 11 + 280) * 18;
        const base = 0.46 + hash(k * 13 + 280) * 0.08;
        // backdrop() with sz[1]>sz[2] triggers isBld → window bands + parapet
        backdrop(k, 1, d, [w, ht, w * 0.60], [base, base, base * 1.06]);
      });

      sponsorHoarding(0.55, 0.615, 1, 10, {
        palette: [[0.96, 0.82, 0.16], [0.12, 0.58, 0.30], [0.16, 0.38, 0.72], [0.90, 0.90, 0.90]],
      });
      for (const [s, side] of [[0.6265, -1], [0.6629, 1]]) {
        const k = K(s);
        place(k, side, 1.8, [0.5, 0.18, 8], [0.80, 0.18, 0.18]);
        place(k, side, 3.0, [3.0, 0.18, 8], [0.92, 0.92, 0.92]);
      }
      tyreWall(0.615, 0.67, -1, 4, [0.92, 0.80, 0.22]);
      marshalPost(K(0.625), 1, 8);
      marshalPost(K(0.665), -1, 8);
      // Treeline framing Bico de Pato through Junção — one continuous run
      // over the corner cluster.
      // gap 7, not 18: this run is on the INSIDE of the Bico de Pato/Mergulho
      // loop and the lap folds back on itself, so a canopy pushed 18 m into the
      // infield reaches the frac~0.85 leg on the far side. forestEdge clears
      // barriers and tree() clears its own trunk point, but neither sees a
      // canopy overhanging a DIFFERENT part of the circuit — props-over-road
      // measured 2.88 m of intrusion at f=84.5 from trees authored at f~70.
      forestEdge(0.61, 0.76, -1, 7, { density: 0.55, hMin: 9, hMax: 14,
                                        col: [0.18, 0.40, 0.18], col2: [0.20, 0.44, 0.18], pineFrac: 0 });
      // Accent trees go on the OUTSIDE (-1) only. Side +1 through here is the
      // inside of the Bico de Pato / Mergulho loop, and the lap folds back on
      // itself tightly enough that a canopy 22-38 m into the infield hangs over
      // the frac~0.62 leg — tree() guards a single anchor point, not the 5 m
      // canopy, so nothing catches it. props-over-road measured 4.43 m of
      // intrusion from exactly this cluster.
      for (const s of [0.63, 0.66, 0.70, 0.735]) {
        const k = K(s);
        tree(k, -1, 24 + hash(k * 5) * 14, 10 + hash(k * 7) * 6, [0.20, 0.44, 0.20]);
      }

      const kj = K(0.7414);
      place(kj, -1, 2,   [0.5, 0.18, 9], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 9], [0.92, 0.92, 0.92]);
      marshalPost(K(0.7414), 1, 9);
      arquibancada("interlagos-arq-juncao", 0.72, -1, 16, 5, { rows: 6, roof: false });

      grandstandEx(0.826,  -1, 11, 46, null, [0.96, 0.82, 0.16],
                   { livery: "concrete", roof: "truss", endWalls: true });
      grandstandEx(0.8375, -1, 12, 52, null, [0.12, 0.58, 0.30],
                   { livery: "orange", tiers: 2, roof: "cantilever", suites: true });
      grandstandEx(0.849,  -1, 11, 46, null, [0.96, 0.82, 0.16],
                   { livery: "sandstone", roof: "flat", endWalls: true, h: 9 });
      arquibancada("interlagos-arq-subida", 0.86, -1, 16, 6, { rows: 7, roof: false });
      crowdBank(0.830, -1, 30, 56, 6);
      crowdBank(0.845, -1, 30, 56, 6);
      cameraTower(K(0.8375), 1, 10, { h: 16 });
      for (const [s, col] of [[0.822, [0.96, 0.82, 0.16]], [0.853, [0.12, 0.58, 0.30]]]) {
        billboard(K(s), 1, 20, 12, 4.5, col);
      }

      billboard(K(0.92), -1, 18, 13, 5, [0.92, 0.90, 0.86]);
      wall(0.88, 0.96, 1, 3, 4.5, [0.58, 0.57, 0.54], 0.6);

      fence(0.90, 0.10, -1, 4.0, 3.4, [0.66, 0.68, 0.70]);
      fence(0.24, 0.30,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      fence(0.68, 0.74,  1, 4.0, 3.0, [0.64, 0.66, 0.68]);
      guardrail(0.10, 0.22,  1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.30, 0.42, -1, 3.0, [0.74, 0.74, 0.78]);
      guardrail(0.50, 0.66,  1, 3.0, [0.74, 0.74, 0.78]);

      // Marshal posts spaced around the lap (orange roofs)
      for (const s of [0.12, 0.20, 0.34, 0.56, 0.62, 0.76]) {
        marshalPost(K(s), (hash(K(s)) > 0.5 ? 1 : -1), 7);
      }

      every(90, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.48) continue;
          const d = 30 + hash(k * 92 + side) * 60;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          const r = hash(k * 93 + side);
          // Subtropical Atlantic-forest mix, no conifers (survey 2026-10-05:
          // the pine() cones here read as alpine). Lobed broadleaf for the
          // dense bushy canopy; ~1 in 5 of those is a jacaranda in its
          // Sep-Nov bloom, which is when the GP runs.
          if      (r > 0.62) tree(k, side, d, 10 + hash(k * 94 + side) * 6, [0.22, 0.46, 0.22]);
          else if (r > 0.31) broadleafFall(k, side, d, 11 + hash(k * 95 + side) * 6,
                               hash(k * 96 + side) > 0.80 ? JACARANDA : BROAD[(k + side + 2) % BROAD.length],
                               { lobes: 4, spread: 1.15, barkCol: [0.34, 0.28, 0.22] });
          else               bush(k, side, d, [0.24, 0.48, 0.24]);
        }
      });

      for (let i = 0; i < 20; i++) {
        const s = 0.30 + (i / 20) * 0.20;
        const kk = K(s);
        if (hash(kk * 97 + i) > 0.50) continue;
        const d = 40 + hash(kk * 98 + i) * 28;
        palm(kk, -1, d, 12 + hash(kk * 99 + i) * 6, [0.20, 0.46, 0.18]);
      }

      // ── São Paulo bowl ring (survey 2026-10-05) ──────────────────────────
      // The real autódromo sits in a natural bowl walled by dense high-rise
      // apartment blocks and hillside low-rise/favela housing (Cidade Dutra,
      // Jardim Satélite), with Guarapiranga/Billings to the south-west. The
      // build had green mounds, five favela patches and a handful of towers
      // in a void. This walks rays out of the lap centroid and, past the last
      // point any part of the lap comes within RING_IN m, raises a terraced
      // hillside (grounded on the world floor, stepping up past track height)
      // with self-built houses on every terrace and apartment towers behind.
      // One small modelGroup per ray: a site the preflight rejects drops
      // alone, and clip-audit sees each as one model.
      {
        const { cx, cz } = lapBounds();
        const FLOOR = pyMin - 1;
        const RING_IN = 235;              // clear of favela patches, hill mounds, cityFront rows
        const near = (x, z) => {
          let best = 1e18, bk = 0;
          for (let i = 0; i < n; i += 2) {
            const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
            if (d < best) { best = d; bk = i; }
          }
          return [Math.sqrt(best), bk];
        };
        const lake = anchor(K(0.42), -1, 520).c;
        const sky = anchor(K(0.60), 1, 240).c;
        const TOWER = [
          [0.80, 0.78, 0.72], [0.72, 0.72, 0.70], [0.86, 0.82, 0.74], [0.66, 0.68, 0.70],
          [0.78, 0.70, 0.62], [0.90, 0.88, 0.82], [0.60, 0.62, 0.64],
        ];
        const GLAZE = [0.30, 0.36, 0.42];
        const EARTH = [[0.30, 0.44, 0.22], [0.36, 0.46, 0.24], [0.52, 0.36, 0.26]];
        const SITES = 60, NT = 5, STEP = 11, L = 58;
        for (let i = 0; i < SITES; i++) {
          const ang = (i + 0.5) / SITES * 6.2832;
          const dx = Math.cos(ang), dz = Math.sin(ang);
          let rEdge = 0;
          for (let r = 0; r < 1700; r += 12)
            if (near(cx + dx * r, cz + dz * r)[0] < RING_IN) rEdge = r;
          const r0 = rEdge + 14 + hash(i * 3.7) * 10;
          const ox = cx + dx * r0, oz = cz + dz * r0;
          const [d0, kn] = near(ox, oz);
          if (d0 < RING_IN - 5) continue;
          if (Math.hypot(ox - lake[0], oz - lake[2]) < 360) continue;   // Guarapiranga water
          if (Math.hypot(ox - sky[0], oz - sky[2]) < 150) continue;     // the hero skyline
          const R = [dx, 0, dz], U = [0, 1, 0], T = [-dz, 0, dx], b = [R, U, T];
          // Both tangent corners of the outermost terrace must stay clear too.
          const far = r0 + NT * STEP + 40;
          let clear = true;
          for (const rr of [r0, far]) for (const tt of [-L / 2, L / 2]) {
            const x = cx + dx * rr + T[0] * tt, z = cz + dz * rr + T[2] * tt;
            if (near(x, z)[0] < RING_IN - 25 || Math.hypot(x - lake[0], z - lake[2]) < 330) clear = false;
          }
          if (!clear) continue;
          const yRef = Math.max(py[kn], FLOOR + 6);
          const at = (rad, tan, y) => [cx + dx * rad + T[0] * tan, y, cz + dz * rad + T[2] * tan];
          const tops = [];
          for (let j = 0; j < NT; j++) tops.push(Math.max(yRef - 8, FLOOR + 3) + j * 6.5 + hash(i * 5 + j) * 2.0);
          const towers = [];
          const nTw = 1 + Math.floor(hash(i * 7.1) * 3);
          for (let t = 0; t < nTw; t++) {
            const h = (yRef - FLOOR) + 34 + hash(i * 13 + t * 3) * 56;
            const w = 15 + hash(i * 17 + t) * 6, dp = 13 + hash(i * 19 + t) * 4;
            const tan = (t - (nTw - 1) / 2) * 20 + (hash(i * 23 + t) - 0.5) * 4;
            towers.push({ h, w, dp, tan, rad: r0 + NT * STEP + 10 + dp / 2 + (t & 1) * 6 });
          }
          let topY = tops[NT - 1] + 14;
          for (const tw of towers) topY = Math.max(topY, FLOOR + tw.h + 2);
          const botY = FLOOR - 1.5;
          const rMid = (r0 - 2 + far + 6) / 2;
          modelGroup(`interlagos-bowl-${i}`, {
            center: at(rMid, 0, (topY + botY) / 2),
            size: [far + 8 - r0, topY - botY + 2, L + 30], basis: b,
          }, (stage) => {
            for (let j = 0; j < NT; j++) {
              // Terrace: from the world floor to its top. Each overlaps the
              // next by 1.3 m and is 1.6 m narrower, so no two share a face.
              // Feet staggered 7 cm per terrace (3 cm per odd site): the
              // overlapping undersides were one plane (ground-audit flatCoplanar).
              const foot = FLOOR - 1 - j * 0.07 - (i & 1) * 0.03;
              const top = tops[j], lj = L - j * 1.6, h = top - foot;
              stage._mat = 0;
              addBox(stage, at(r0 + j * STEP + (STEP + 1.3) / 2, 0, foot + h / 2),
                     [STEP + 1.3, h, lj], EARTH[(i + j) % EARTH.length], b);
              stage._mat = MAT.CONCRETE;
              const cols = Math.floor((lj - 4) / 7.4);
              for (let c = 0; c < cols; c++) {
                const hh = hash(i * 31 + j * 7 + c * 3);
                if (hh > 0.86) continue;                              // alleys / stairs
                const w = 5.0 + hash(i * 37 + c + j) * 1.8, dd = 5.0 + hash(i * 41 + j + c) * 2.4;
                const hgt = 3.2 + hash(i * 43 + j * 3 + c) * 6.0;
                const sink = 0.3 + ((c + j) & 1) * 0.05;               // no shared undersides
                const fin = hash(i * 47 + j * 11 + c * 5);
                const col = fin < 0.46 ? RAW[(j * 3 + c) % RAW.length]
                          : fin < 0.58 ? SCREED[(j + c) % SCREED.length]
                          : FAV[(i + j * 4 + c * 3) % FAV.length];
                const tan = (c - (cols - 1) / 2) * 7.4 + (hh - 0.5) * 1.2;
                addBox(stage, at(r0 + j * STEP + 1.0 + dd / 2, tan, top - sink + (hgt + sink) / 2),
                       [dd, hgt + sink, w], col, b);
              }
            }
            for (const [ti, tw] of towers.entries()) {
              const tf = FLOOR - 1.5 - ti * 0.06;
              // Apartment slab on the floor, with three glazed bands and a roof plant
              stage._mat = MAT.CONCRETE;
              const col = TOWER[Math.floor(hash(tw.rad + tw.tan + i) * TOWER.length) % TOWER.length];
              addBox(stage, at(tw.rad, tw.tan, (tf + FLOOR + tw.h) / 2), [tw.dp, FLOOR + tw.h - tf, tw.w], col, b);
              stage._mat = MAT.GLASS;
              for (const f of [0.52, 0.70, 0.86])
                addBox(stage, at(tw.rad, tw.tan, FLOOR + tw.h * f), [tw.dp + 0.3, 2.2, tw.w + 0.3], GLAZE, b);
              stage._mat = MAT.CONCRETE;
              addBox(stage, at(tw.rad, tw.tan, FLOOR + tw.h + 1.1), [tw.dp * 0.5, 2.6, tw.w * 0.4],
                     [0.58, 0.58, 0.60], b);
            }
            stage._mat = 0;
          });
        }
      }
    };
