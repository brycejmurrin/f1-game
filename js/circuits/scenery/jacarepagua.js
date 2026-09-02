/* Apex 26 — JACAREPAGUA scenery (data only), split out of js/circuits/jacarepagua.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["jacarepagua"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, anchor, vadd, onTrack, px, pz,
        tree, bush, ridge, mountain, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        floodMast, cameraTower, sponsorHoarding, palm, terrace,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterSurface,
        addBox, addCyl, addCone, addPrism } = api;
      const K = (s) => Math.round(s * n) % n;

      const PALM = [0.18, 0.44, 0.20], PALM_D = [0.14, 0.36, 0.17];
      const RESTINGA = [0.34, 0.44, 0.24];   // low sandy coastal scrub
      const SAND = [0.76, 0.71, 0.56];

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const rg of [
        { extra: 220, wMin: 190, hMin: 150, hVar: 90, wVar: 70, count: 16, arc: [0.55, 1.35],
          opts: { seg: 8, rough: 0.20, forest: [0.12, 0.32, 0.16], rock: [0.44, 0.42, 0.40], snowline: 2 } },
        { extra: 340, wMin: 260, hMin: 210, hVar: 130, wVar: 110, count: 12, arc: [0.60, 1.30],
          opts: { seg: 8, rough: 0.22, forest: [0.16, 0.36, 0.20], rock: [0.50, 0.49, 0.48], snowline: 2 } },
      ]) {
        for (let i = 0; i < rg.count; i++) {
          const frac = rg.arc[0] + (i / (rg.count - 1)) * (rg.arc[1] - rg.arc[0]);
          const a = frac * 6.2832, h = hash(i * 7 + rg.extra);
          const r = rad + rg.extra + h * 40;
          mountain(cx + Math.cos(a) * r, cz + Math.sin(a) * r, pyMin,
            rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar,
            Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }
      // Low hazy treeline closing the rest of the horizon (the seaward side).
      for (let i = 0; i < 34; i++) {
        const a = i / 34 * 6.2832;
        if (a > 3.3 || a < 2.2) continue;   // leave the (wrapped) mountain arc alone
        const h = hash(i * 11 + 3);
        const r = rad + 130 + h * 40;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 32)) continue;
        ridge(tx, tz, pyMin, a + 1.5708, 160, 40, 12 + h * 6, [0.16, 0.36, 0.18]);
      }

      // THE MORRO HOUSING. Rio's granite hills carry dense self-built housing up
      // their lower slopes, and no other circuit in the game has anything like
      // it — a bare green mountain reads as alpine or Malaysian, and this one
      // must read as Rio. Small flat-roofed concrete boxes in saturated paint,
      // stacked tight and stepping UP the slope, each roof carrying the water
      // tank and antenna clutter that is most of what you actually see at
      // distance. Placed in world space against pyMin like the mountains
      // themselves, since this is far outside the terrain ribbon.
      {
        const SKIN = [
          [0.86, 0.72, 0.52], [0.80, 0.44, 0.34], [0.72, 0.74, 0.66],
          [0.58, 0.66, 0.62], [0.86, 0.82, 0.68], [0.66, 0.52, 0.44],
          [0.84, 0.62, 0.36], [0.60, 0.64, 0.72],
        ];
        const ROOF = [0.62, 0.60, 0.56], TANK = [0.30, 0.36, 0.46];
        for (let c = 0; c < 6; c++) {
          const frac = 0.62 + (c / 5) * 0.66;
          const ang = frac * 6.2832;
          const hc = hash(c * 29 + 5);
          const r = rad + 165 + hc * 55;
          const bx = cx + Math.cos(ang) * r, bz = cz + Math.sin(ang) * r;
          if (onTrack(bx, bz, 40)) continue;
          for (let row = 0; row < 6; row++) {
            const climb = row * 9.5;
            const back = row * 13;
            for (let i = 0; i < 9; i++) {
              const h = hash(c * 131 + row * 17 + i * 7);
              if (h < 0.18) continue;   // gaps — alleys and rock outcrops
              const along = (i - 4) * 15 + (h - 0.5) * 8;
              const wx = bx + Math.cos(ang) * back - Math.sin(ang) * along;
              const wz = bz + Math.sin(ang) * back + Math.cos(ang) * along;
              const hh = 5 + h * 5;                       // one to three storeys
              const y = pyMin + climb + hh / 2;
              const w = 7 + h * 4, d = 7 + (1 - h) * 4;
              addBox(out, [wx, y, wz], [w, hh, d], SKIN[(c * 5 + row * 3 + i) % SKIN.length]);
              addBox(out, [wx, y + hh / 2 + 0.3, wz], [w + 0.8, 0.5, d + 0.8], ROOF);
              if (h > 0.42)
                addCyl(out, [wx + 1.6, y + hh / 2 + 0.6, wz - 1.2], 1.1, 2.0, TANK, 6);
              if (h > 0.72)
                addCyl(out, [wx - 1.8, y + hh / 2 + 0.4, wz + 1.4], 0.12, 4.0,
                  [0.72, 0.72, 0.74], 4);
            }
          }
        }
      }

      // 2. THE LAGOON — Jacarepaguá sat on the edge of the Lagoa de Jacarepaguá,
      //    and the water was visible from the long back sweep.
      // A water body is centred on its anchor, so its SETBACK has to exceed its
      // own half-width or the footprint swallows the road. The lap also folds
      // back close on this side, so the engine only accepts a fairly compact
      // basin here — 120 m across at 120 m out, measured with the footprint
      // probe rather than guessed.
      waterSurface(K(0.470), -1, 120, [120, 0.18, 320], [0.26, 0.46, 0.60],
        { id: "jacarepagua-lagoa", required: true });
      // Sandy restinga shoreline between the track and the water.
      groundPatch(K(0.470), -1, 55, [60, 0.18, 300], SAND,
        { id: "jacarepagua-shoreline", samples: 10 });
      every(20, (k) => {
        const s = k / n;
        if (s < 0.36 || s > 0.60) return;
        const h = hash(k * 17);
        // Rows at 28-40 / 44-48 m, not 46-76 / 74-100: on this side the lap folds
        // back 60-90 m out (the 0.00-0.06 and 0.92-0.93 legs), so the old rows
        // stood on the back straight and 32 of them were dropped every build.
        palm(k, -1, 28 + h * 12, 13 + h * 5, h < 0.5 ? PALM : PALM_D);
        if (h > 0.5) palm(k, -1, 40 + h * 8, 12 + h * 5, PALM_D);
      });

      const openArea = (s) => (s >= 0.92 || s <= 0.10) || (s >= 0.36 && s <= 0.50);
      every(18, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 97 + 23);
        if (h < 0.32) return;
        bush(k, h < 0.68 ? -1 : 1, 8 + h * 8, h < 0.6 ? RESTINGA : [0.28, 0.38, 0.20]);
      });
      every(30, (k) => {
        const s = k / n;
        if (openArea(s)) return;
        const h = hash(k * 31);
        if (h < 0.52) return;
        tree(k, h < 0.5 ? -1 : 1, 24 + h * 18, 11 + h * 5, PALM);
      });

      {
        const a = anchor(K(0.975), 1, 13);
        const b = [a.r, a.u, a.t];
        modelGroup("jacarepagua-pit-grandstand", {
          center: vadd(a.c, a.u, 8), size: [22, 20, 150], basis: b,
        }, (stage) => {
          // Ground level: open pit boxes behind a continuous beam.
          addBox(stage, vadd(vadd(a.c, a.r, 5), a.u, 2.6), [9, 5.2, 146], [0.82, 0.80, 0.74], b);
          for (let i = 0; i < 18; i++) {
            const p = vadd(a.c, a.t, (i - 8.5) * 8);
            addBox(stage, vadd(p, a.u, 2.6), [10, 5.2, 0.4], [0.88, 0.86, 0.80], b);
          }
          // The deck slab dividing pits from seating.
          addBox(stage, vadd(a.c, a.u, 5.6), [20, 0.8, 148], [0.74, 0.72, 0.68], b);
          // Stepped seating above, canted back over the pits.
          for (let t = 0; t < 5; t++) {
            addBox(stage, vadd(vadd(a.c, a.r, 1 + t * 2.6), a.u, 6.6 + t * 1.7),
              [2.5, 1.6, 146], t % 2 ? [0.78, 0.76, 0.71] : [0.72, 0.70, 0.66], b);
            stage._mat = MAT.FABRIC;
            addBox(stage, vadd(vadd(a.c, a.r, 1 + t * 2.6), a.u, 7.7 + t * 1.7),
              [2.1, 0.9, 142],
              [[0.94, 0.86, 0.20], [0.10, 0.42, 0.24], [0.90, 0.90, 0.88]][t % 3], b);
            stage._mat = 0;
          }
          addBox(stage, vadd(vadd(a.c, a.r, 8), a.u, 17), [18, 0.5, 148], [0.86, 0.85, 0.80], b);
          for (let i = 0; i < 9; i++) {
            const p = vadd(vadd(a.c, a.r, 15), a.t, (i - 4) * 17);
            addCyl(stage, p, 0.30, 17, [0.80, 0.79, 0.75], 6, b);
          }
        }, { required: true });
      }
      // Squat square timing box on the roofline rather than a separate tower.
      {
        const a = anchor(K(0.998), 1, 20);
        const b = [a.r, a.u, a.t];
        modelGroup("jacarepagua-timing-box", {
          center: vadd(a.c, a.u, 20), size: [12, 8, 16], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 19), [9, 4.4, 13], [0.86, 0.85, 0.80], b);
          addBox(stage, vadd(a.c, a.u, 19.4), [9.4, 2.0, 13.4], [0.30, 0.42, 0.52], b);
          addBox(stage, vadd(a.c, a.u, 21.6), [10, 0.5, 14], [0.70, 0.69, 0.66], b);
        });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.955, 8.0, [0.15, 0.15, 0.18]);
      for (let i = 0; i < 3; i++) {
        const a = anchor(K(0.916 + i * 0.020), 1, 46);
        const b = [a.r, a.u, a.t];
        modelGroup(`jacarepagua-paddock-${i + 1}`, {
          center: vadd(a.c, a.u, 7), size: [20, 16, 40], basis: b,
        }, (stage) => {
          const WALL = [0.90, 0.88, 0.82], SHADE = [0.52, 0.50, 0.46];
          // Raised on pilotis — the ground floor is open shaded space.
          for (let p = 0; p < 7; p++)
            addCyl(stage, vadd(a.c, a.t, (p - 3) * 5.6), 0.26, 3.6, WALL, 6, b);
          addBox(stage, vadd(a.c, a.u, 3.9), [15, 0.6, 36], [0.80, 0.78, 0.74], b);
          // Two storeys set back behind the screen.
          addBox(stage, vadd(vadd(a.c, a.r, 1.6), a.u, 7.2), [11, 6.0, 34], SHADE, b);
          for (let cRow = 0; cRow < 5; cRow++) {
            const y = 5.0 + cRow * 1.5;
            for (let cCol = 0; cCol < 22; cCol++) {
              if ((cRow + cCol) % 3 === 0) continue;      // the perforations
              addBox(stage, vadd(vadd(vadd(a.c, a.r, -5.0), a.u, y),
                a.t, (cCol - 10.5) * 1.55), [0.45, 1.15, 1.15], WALL, b);
            }
          }
          // Deep flat eave with vertical brise-soleil fins on the sun side.
          addBox(stage, vadd(vadd(a.c, a.r, -1.5), a.u, 12.6), [19, 0.5, 38],
            [0.88, 0.86, 0.80], b);
          for (let f = 0; f < 12; f++)
            addBox(stage, vadd(vadd(vadd(a.c, a.r, -8.4), a.u, 10.6),
              a.t, (f - 5.5) * 3.1), [0.9, 4.2, 0.28], [0.84, 0.82, 0.76], b);
        });
      }
      every(48, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.55) return;
        motorhome(k, 1, 62 + h * 10, 10, 4, 6, { wall: [0.72 + h * 0.18, 0.72, 0.72] });
      });
      broadcastCompound(K(0.908), 1, 78, { vans: 2, dishes: 2, mastH: 9 });
      // Brazilian green-and-gold hoardings.
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), -1, 8, 12, 4.5, [0.10, 0.44, 0.24]);
      sponsorHoarding(0.955, 0.055, -1, 5.5, {
        h: 1.5, step: 11,
        palette: [[0.10, 0.44, 0.24], [0.94, 0.86, 0.20], [0.10, 0.22, 0.52], [0.92, 0.90, 0.88]],
      });

      groundPatch(K(0.075), 1, 6, [34, 0.18, 46], SAND,
        { id: "jacarepagua-t1-sand", samples: 8 });
      tyreWall(0.058, 0.094, 1, 5, [0.86, 0.20, 0.18]);
      terrace(0.066, 0.085, -1, 18, {
        rows: 7, rise: 1.4, depth: 2.5, step: 9, density: 0.42,
        conc: [0.80, 0.78, 0.72], concAlt: [0.71, 0.69, 0.64],
        crowd: [[0.94, 0.86, 0.20], [0.10, 0.44, 0.24], [0.92, 0.90, 0.86]],
      });
      marshalPost(K(0.070), -1, 10);

      groundPatch(K(0.205), 1, 5, [26, 0.18, 34], SAND,
        { id: "jacarepagua-t3-sand", samples: 6 });
      marshalPost(K(0.200), -1, 9);

      groundPatch(K(0.622), 1, 5, [26, 0.18, 34], SAND,
        { id: "jacarepagua-t9-sand", samples: 6 });
      tyreWall(0.608, 0.638, 1, 4, [0.20, 0.40, 0.85]);
      terrace(0.615, 0.630, -1, 20, {
        rows: 5, rise: 1.4, depth: 2.5, step: 9, density: 0.34,
        conc: [0.78, 0.76, 0.70], concAlt: [0.69, 0.67, 0.62],
        crowd: [[0.10, 0.44, 0.24], [0.94, 0.86, 0.20], [0.92, 0.90, 0.86]],
      });
      marshalPost(K(0.616), -1, 9);

      groundPatch(K(0.882), 1, 5, [28, 0.18, 36], SAND,
        { id: "jacarepagua-final-sand", samples: 6 });
      tyreWall(0.866, 0.900, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.876), -1, 9);

      spectatorHill(0.14, 0.24, -1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.36, step: 9 });
      spectatorHill(0.66, 0.76, -1, 15, { rows: 3, rise: 1.0, depth: 1.8, density: 0.36, step: 9 });

      for (const [s0, s1] of [[0.11, 0.34], [0.52, 0.60], [0.65, 0.85]]) {
        guardrail(s0, s1, -1, 8, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 8, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, 1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.16, 0.28, 0.44, 0.56, 0.72, 0.88]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 9);
      }

      for (const [s, side, gap] of [
        [0.030, -1, 26], [0.075, -1, 34], [0.470, 1, 40], [0.622, -1, 30], [0.882, -1, 26],
      ]) {
        floodMast(K(s), side, gap, { h: 30, cool: false, arms: 2, light: false });
      }
      cameraTower(K(0.205), -1, 24, { h: 15 });
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.962 + i * 0.005), -1, 7);
        const b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.11, 9.5, [0.90, 0.90, 0.92], 6, b);
        addBox(out, vadd(vadd(a.c, a.u, 8.0), a.t, 1.2), [0.14, 1.6, 2.6],
          i % 2 ? [0.10, 0.44, 0.24] : [0.94, 0.86, 0.20], b);
      }
    };
