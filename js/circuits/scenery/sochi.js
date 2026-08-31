/* Apex 26 — SOCHI scenery (data only), split out of js/circuits/sochi.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["sochi"] =
  function (api) {
      const { out, MAT, n, pyMin, hash, every, along, anchor, vadd, onTrack, px, pz,
        tree, bush, hedge, ridge, building, grandstandEx, spectatorHill,
        broadcastCompound, billboard, gantry, marshalPost, motorhome,
        fence, guardrail, tyreWall, groundPatch, modelGroup, waterSurface,
        cameraTower, sponsorHoarding, signBoard, cypress,
        addBox, addCyl, addCone, addFrustum } = api;
      const K = (s) => Math.round(s * n) % n;

      const LEAF = [0.20, 0.44, 0.20], LEAF_D = [0.15, 0.36, 0.18];
      const GRAVEL = [0.68, 0.62, 0.48];
      const PLAZA = [0.78, 0.76, 0.74], PLAZA_D = [0.70, 0.69, 0.68];
      const WHITE = [0.93, 0.94, 0.96];
      const GLASS = [0.34, 0.46, 0.58];

      groundPatch(K(0.09), 1, 6, [120, 0.18, 260], PLAZA,
        { id: "sochi-medals-plaza", samples: 12 });

      // The venues ringing Turn 2, each a distinct silhouette.
      {
        // Fisht Stadium — the big translucent shell, and the largest object on
        // this circuit by a wide margin. It used to stand at s=0.085/150 m,
        // which is INSIDE the Turn 2 loop's return leg: a 130x150 m footprint
        // there covers the far side of the hairpin and the whole model was
        // being silently dropped, so the headline landmark never existed. This
        // placement is probed clear at every neighbouring station.
        const a = anchor(K(0.18), 1, 175);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-fisht-stadium", {
          center: vadd(a.c, a.u, 22), size: [126, 52, 146], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addFrustum(stage, a.c, 60, 54, 20, [0.80, 0.82, 0.86], 16, b);
          stage._mat = MAT.GLASS;
          // The shell: two shallow translucent domes leaning together, open in
          // the middle. That gap — the "eye" over the arena — is the shape
          // everyone recognises, so the roof is built as two halves, not a lid.
          //
          // Each half used to be five flat 2.2 m-thick slabs stepped up from
          // the drum (20 m) to the crown (36 m). The step between slabs grows
          // toward the crown — up to 7 m between the outermost two — so most
          // of the slabs never touched their neighbour: only the slab resting
          // directly on the drum was actually grounded, and float-audit found
          // the other four hanging with nothing under them (gap up to ~15 m).
          // Stretching every slab straight down to the drum closed the float
          // but stacked all five on top of each other for their whole run,
          // roughly tripling this stadium's coplanar same-facing pairs — so
          // instead each slab reaches only to the NEXT slab out (telescoping,
          // like the original stepped silhouette, just with the gaps closed):
          // its top stays at its own crown height, its bottom is the next
          // slab's crown, so consecutive slabs touch exactly and the whole
          // run chains down to the drum-grounded outermost slab.
          const peakAt = (i) => 20 + (1 - (i / 4) ** 2) * 16;   // i=0..4 -> 36..20
          for (const sgn of [-1, 1]) {
            for (let i = 0; i < 5; i++) {
              const f = i / 4;
              const top = peakAt(i);
              const bottom = i < 4 ? peakAt(i + 1) : top - 2.2;   // last slab: unchanged, already on the drum
              addBox(stage, vadd(vadd(a.c, a.t, sgn * (26 + f * 30)), a.u, (top + bottom) / 2),
                [100 - f * 30, top - bottom, 22], [0.90, 0.93, 0.97], b);
            }
          }
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(a.c, a.u, 20), 56, 2.2, [0.86, 0.88, 0.92], 16, b);
          stage._mat = 0;
        }, { required: true });
      }
      {
        // Bolshoy Ice Dome — a low silver dome.
        const a = anchor(K(0.150), 1, 130);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-bolshoy-dome", {
          center: vadd(a.c, a.u, 14), size: [96, 30, 96], basis: b,
        }, (stage) => {
          addCyl(stage, a.c, 42, 16, [0.78, 0.80, 0.84], 14, b);
          addCyl(stage, vadd(a.c, a.u, 16), 34, 9, [0.86, 0.88, 0.92], 14, b);
        });
      }
      {
        // Adler Arena — a long low glass box.
        const a = anchor(K(0.225), 1, 120);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-adler-arena", {
          center: vadd(a.c, a.u, 10), size: [56, 22, 110], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 8), [48, 16, 104], [0.80, 0.83, 0.88], b);
          addBox(stage, vadd(a.c, a.u, 16.5), [52, 1.6, 108], [0.62, 0.66, 0.72], b);
          for (const hgt of [4.5, 11]) {
            addBox(stage, vadd(vadd(a.c, a.r, -24), a.u, hgt), [0.3, 3.0, 98], [0.46, 0.60, 0.74], b);
          }
        });
      }
      // The Olympic flame tower and its reflecting pool, inside the Turn 2 loop.
      {
        const a = anchor(K(0.115), 1, 96);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-flame-tower", {
          center: vadd(a.c, a.u, 20), size: [16, 44, 16], basis: b,
        }, (stage) => {
          addCone(stage, a.c, 7, 34, [0.84, 0.82, 0.80], 10, b);
          addCyl(stage, vadd(a.c, a.u, 34), 1.2, 8, [0.90, 0.88, 0.84], 8, b);
          addCone(stage, vadd(a.c, a.u, 41), 2.2, 5, [0.98, 0.72, 0.28], 8, b);
        });
      }
      waterSurface(K(0.115), 1, 74, [70, 0.18, 90], [0.30, 0.48, 0.66],
        { id: "sochi-reflecting-pool" });
      // Jets standing in the pool: the Medals Plaza fountain is the centrepiece
      // the flame tower is aimed at, and a flat sheet of water alone does not
      // read as one.
      //
      // addCyl's position is its BASE, not its centre, so `vadd(p, a.u, 3.5)`
      // puts the pipe's foot exactly 3.5 m above local ground. Measured a
      // consistent ~3.19-3.24 m float on 8 of the 9 jets — constant across
      // jets regardless of the hash-driven pipe height, which is exactly what
      // a fixed BASE offset error looks like (the top moving doesn't touch the
      // bottom). Re-anchoring per jet by its true along-track node (instead of
      // one anchor + a raw a.t offset) changed nothing, so it isn't an
      // along-track sampling error either: at this distance (58-90 m off the
      // road) the closed-form ground estimate circuit code can query is
      // consistently ~3.2 m above the real terrain there. Sink the base by a
      // safe margin and grow the pipe by the same amount so the visible
      // waterline top is unchanged.
      const JET_EMBED = 4; // > the measured 3.24 m worst case
      for (let i = 0; i < 9; i++) {
        const ang = i / 9 * 6.2832;
        const a = anchor(K(0.115), 1, 74 + Math.cos(ang) * 16);
        const p = vadd(a.c, a.t, Math.sin(ang) * 22);
        const h = 7 + hash(i * 7) * 5;
        addCyl(out, vadd(p, a.u, 3.5 - JET_EMBED), 0.22, h + JET_EMBED,
          [0.82, 0.90, 0.96], 5, [a.r, a.u, a.t]);
      }

      {
        const a = anchor(K(0.290), 1, 122);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-iceberg-palace", {
          center: vadd(a.c, a.u, 13), size: [72, 32, 116], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 7), [56, 14, 100], [0.84, 0.86, 0.90], b);
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(vadd(a.c, a.r, -28.2), a.u, 8), [0.5, 8, 96], GLASS, b);
          stage._mat = MAT.METAL;
          // Arc roof: nine chords rising to a crown and oversailing the walls.
          for (let i = 0; i < 9; i++) {
            const f = (i - 4) / 4;
            const drop = (1 - f * f) * 6.5;
            addBox(stage, vadd(vadd(a.c, a.r, f * 30), a.u, 14 + drop),
              [8.2, 1.1, 108], i & 1 ? [0.88, 0.90, 0.94] : [0.80, 0.84, 0.90], b);
          }
          stage._mat = 0;
        });
      }

      {
        const a = anchor(K(0.062), 1, 58);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-olympic-rings", {
          center: vadd(a.c, a.u, 8), size: [6, 16, 34], basis: b,
        }, (stage) => {
          const cols = [
            [0.10, 0.36, 0.72], [0.14, 0.14, 0.16], [0.82, 0.16, 0.14],
            [0.94, 0.78, 0.10], [0.10, 0.56, 0.28],
          ];
          stage._mat = MAT.METAL;
          for (let r = 0; r < 5; r++) {
            const top = r < 3;
            const cAlong = (top ? (r - 1) : (r - 3.5)) * 6.4;
            const cUp = 9.2 + (top ? 2.6 : 0);
            const hub = vadd(vadd(a.c, a.t, cAlong), a.u, cUp);
            for (let j = 0; j < 14; j++) {
              const ang = j / 14 * 6.2832, cA = Math.cos(ang), sA = Math.sin(ang);
              const dir = [], perp = [];
              for (let axis = 0; axis < 3; axis++) {
                dir[axis] = a.u[axis] * cA + a.t[axis] * sA;
                perp[axis] = a.t[axis] * cA - a.u[axis] * sA;
              }
              addBox(stage, vadd(hub, dir, 3.1), [0.55, 1.5, 0.55], cols[r],
                [a.r, dir, perp]);
            }
          }
          // Plinth.
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 2), [5, 4, 30], [0.80, 0.80, 0.82], b);
          stage._mat = 0;
        });
      }

      groundPatch(K(0.230), 1, 6, [90, 0.18, 220], PLAZA,
        { id: "sochi-north-plaza", samples: 10 });
      groundPatch(K(0.030), -1, 6, [60, 0.18, 160], PLAZA,
        { id: "sochi-start-plaza", samples: 8 });
      for (const [s0, s1, side] of [[0.94, 0.30, 1], [0.96, 0.10, -1]]) {
        let i = 0;
        along(s0, s1, 16, (k, spacing) => {
          if (i++ % 2) return;
          const a = anchor(k, side, 30);
          addBox(out, vadd(a.c, a.u, 0.24), [46, 0.10, 2.2], PLAZA_D, [a.r, a.u, a.t]);
        });
      }

      every(26, (k) => {
        const s = k / n;
        if (s <= 0.30 || s >= 0.90) return;
        const h = hash(k * 31);
        if (h < 0.35) return;
        tree(k, h < 0.5 ? -1 : 1, 12 + h * 12, 10 + h * 7, h < 0.5 ? LEAF_D : LEAF);
        if (h > 0.72) tree(k, h > 0.86 ? -1 : 1, 30 + h * 18, 11 + h * 6, LEAF_D);
      });
      every(24, (k) => {
        const s = k / n;
        if (s <= 0.30 || s >= 0.90) return;
        const h = hash(k * 97 + 23);
        if (h < 0.52) return;
        bush(k, h < 0.75 ? -1 : 1, 7 + h * 5, [0.18, 0.38, 0.18]);
      });
      // Clipped hedging along the plaza edges — the park is landscaped, not wild.
      hedge(0.02, 0.28, 1, 22, 3.0, [0.17, 0.36, 0.18]);
      hedge(0.02, 0.28, -1, 20, 3.0, [0.17, 0.36, 0.18]);

      for (const [i, s] of [0.938, 0.958, 0.978, 0.998].entries()) {
        const a = anchor(K(s), -1, 16);
        const b = [a.r, a.u, a.t];
        modelGroup(`sochi-pit-bay-${i + 1}`, {
          center: vadd(a.c, a.u, 9), size: [24, 22, 46], basis: b,
        }, (stage) => {
          stage._mat = MAT.GLASS;
          addBox(stage, vadd(a.c, a.u, 8), [16, 16, 44], [0.20, 0.28, 0.38], b);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 0.9), [17, 1.8, 44], [0.82, 0.83, 0.86], b);
          stage._mat = MAT.METAL;
          // Brise-soleil: five louvre bands standing proud of the glass line.
          for (let f = 0; f < 5; f++) {
            addBox(stage, vadd(vadd(a.c, a.r, 8.6), a.u, 3.2 + f * 3.1),
              [1.9, 0.7, 45], WHITE, b);
          }
          // Roof plane oversailing the glass on both faces.
          addBox(stage, vadd(a.c, a.u, 16.6), [23, 0.7, 46], WHITE, b);
          addBox(stage, vadd(vadd(a.c, a.r, -11.2), a.u, 16.0), [0.6, 0.8, 46],
            [0.20, 0.36, 0.62], b);
          for (let c = 0; c < 5; c++) {
            addCyl(stage, vadd(vadd(vadd(a.c, a.t, (c - 2) * 8.8), a.r, -10.4), a.u, 8),
              0.17, 16.4, WHITE, 6, b);
          }
          stage._mat = 0;
        }, { required: true });
      }
      {
        const a = anchor(K(0.986), -1, 30);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-race-control", {
          center: vadd(a.c, a.u, 17), size: [18, 40, 18], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(a.c, a.u, 12), [6.5, 24, 6.5], WHITE, b);
          stage._mat = MAT.GLASS;
          addFrustum(stage, vadd(a.c, a.u, 24), 5.0, 7.0, 6.5, [0.18, 0.26, 0.36], 6, b);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(a.c, a.u, 31), [17, 0.8, 17], WHITE, b);
          addBox(stage, vadd(a.c, a.u, 30.2), [16, 0.6, 16], [0.20, 0.36, 0.62], b);
          // addCyl's position is its BASE, not its centre — starting the mast
          // at 35 left it 3.6 m above the roof plate's top (31.4) with nothing
          // between, floating (measured ~34.7 m against raw ground once the
          // chain never bridged that gap). Base it inside the roof plate's own
          // Y-range instead and stretch it by the same amount so the tip stays
          // at the same height (35 + 10 = 45 either way).
          addCyl(stage, vadd(a.c, a.u, 31), 0.13, 14, WHITE, 5, b);
          stage._mat = 0;
        }, { required: true });
      }
      gantry(0.0, 8.5, [0.15, 0.15, 0.18]);
      gantry(0.968, 8.0, [0.15, 0.15, 0.18]);
      grandstandEx(0.005, 1, 12, 150, null, null,
        { livery: "teal", tiers: 2, roof: "flat", suites: true, endWalls: true, pylons: true });
      // Olympic-park civic architecture: crossed perpendicular slabs on a broad
      // footprint, monumental rather than commercial. The circuit threads through
      // a set of buildings that were never designed for it.
      for (let i = 0; i < 4; i++) {
        building(K(0.925 + i * 0.013), -1, 40, 24, 13, 24,
          { kind: "cross", wall: [0.88, 0.88, 0.90], window: [0.34, 0.40, 0.48], floor: 4.5 });
      }
      every(46, (k) => {
        const s = k / n, h = hash(k * 71 + 31);
        if (!(s > 0.90 || s < 0.05) || h < 0.52) return;
        motorhome(k, -1, 56 + h * 10, 10, 4, 6, { wall: [0.68 + h * 0.22, 0.68, 0.70] });
      });
      broadcastCompound(K(0.916), -1, 74, { vans: 3, dishes: 2, mastH: 9 });
      for (const s of [0.975, 0.01, 0.03]) billboard(K(s), 1, 8, 12, 4.5, [0.20, 0.34, 0.70]);

      const arcStand = (s0, s1, side, gap, opts) => {
        opts = opts || {};
        const rows = opts.rows || 8, rise = opts.rise || 0.82, depth = opts.depth || 1.25;
        const R = opts.span != null ? opts.span : 9.5, lift = opts.lift || 1.35;
        along(s0, s1, opts.step || 10, (k, spacing) => {
          const a = anchor(k, side, gap);
          const b = [a.r, a.u, a.t], seg = spacing * 0.95;
          out._mat = MAT.CONCRETE;
          for (let r = 0; r < rows; r++) {
            const back = r * depth, up = 0.6 + r * rise;
            addBox(out, vadd(vadd(a.c, a.r, side * back), a.u, up),
              [depth, rise + 0.2, seg], r & 1 ? [0.72, 0.73, 0.76] : [0.66, 0.67, 0.70], b);
            const h = hash(k * 19 + r * 5);
            if (h > 0.5) continue;
            out._mat = MAT.FABRIC;
            addBox(out, vadd(vadd(vadd(a.c, a.r, side * back),
              a.t, (h - 0.25) * seg * 0.8), a.u, up + rise * 0.5 + 0.55),
              [0.55, 1.0, 0.6],
              h < 0.16 ? [0.86, 0.24, 0.20] : h < 0.32 ? [0.92, 0.92, 0.90] : [0.20, 0.40, 0.70], b);
            out._mat = MAT.CONCRETE;
          }
          // The canopy rib: chords around a half-circle springing from a foot
          // in front of the deck and landing behind the top row.
          //
          // The raw arc (across = R - cos(mid)*R) reaches a full 2R past a.c at
          // mid=pi — for the default R=9.5 that is ~17.6 m beyond the last row
          // (rows*depth = 11.25 m), assuming flat ground the whole way out. At
          // Turn 5/Adler Arena that overshoot lands 34-35 m from the centreline,
          // 10-16 m above the real terrain there (measured via float-audit —
          // the deck itself never floats, only the far ribs past its edge).
          // Limit the reach to the deck's own footprint so the far foot always
          // lands on/over the top row's box instead of open ground.
          //
          // SCALE the arc, do not clamp it. A Math.min() against the limit
          // flattens every segment past the crossover onto the SAME across,
          // stacking coincident rib boxes: floats went to zero but the coplanar
          // audit went 42 -> 43 spots and 136 -> 380 same-facing pairs, which
          // ratchets just as hard. Scaling keeps all 8 stations distinct and
          // the arc's shape, only narrower.
          out._mat = MAT.METAL;
          const segs = 8;
          const reach = (rows - 0.5) * depth;   // top row's outer (far) edge
          const squash = Math.min(1, (reach + R * 0.15) / (2 * R));
          for (let j = 0; j < segs; j++) {
            const t0 = j / segs * Math.PI, t1 = (j + 1) / segs * Math.PI;
            const mid = (t0 + t1) / 2;
            const across = (R - Math.cos(mid) * R) * squash;
            const up = 3.0 + Math.sin(mid) * R * lift;
            const chord = (Math.PI / segs) * R * lift * 1.15;
            const cM = Math.cos(mid), sM = Math.sin(mid);
            const dir = [], perp = [];
            for (let axis = 0; axis < 3; axis++) {
              dir[axis] = a.u[axis] * cM + a.r[axis] * side * sM;
              perp[axis] = a.r[axis] * side * cM - a.u[axis] * sM;
            }
            const c = vadd(vadd(a.c, a.r, side * (across - R * 0.15)), a.u, up);
            addBox(out, c, [0.34, chord, 0.34], WHITE, [perp, dir, a.t]);
            // Translucent panel spanning to the next rib along the stand.
            if (j % 2 === 0)
              addBox(out, vadd(c, a.u, 0.35), [1.9, 0.12, seg], [0.86, 0.90, 0.94], b);
          }
          out._mat = 0;
        });
      };
      arcStand(0.225, 0.285, 1, 18, { rows: 9 });          // Turn 5 / Adler Arena side
      arcStand(0.520, 0.575, -1, 18, { rows: 8 });         // Turn 13
      arcStand(0.795, 0.845, 1, 16, { rows: 7, span: 8.5 });  // Turn 17

      groundPatch(K(0.045), -1, 5, [26, 0.18, 34], GRAVEL,
        { id: "sochi-t1-gravel", samples: 6 });
      tyreWall(0.032, 0.062, -1, 4, [0.86, 0.20, 0.18]);
      marshalPost(K(0.048), 1, 10);

      groundPatch(K(0.255), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t6-gravel", samples: 6 });
      tyreWall(0.240, 0.270, -1, 4, [0.20, 0.40, 0.85]);
      marshalPost(K(0.250), 1, 9);

      groundPatch(K(0.545), 1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t13-gravel", samples: 6 });
      marshalPost(K(0.540), -1, 9);

      groundPatch(K(0.815), -1, 5, [24, 0.18, 32], GRAVEL,
        { id: "sochi-t17-gravel", samples: 6 });
      tyreWall(0.800, 0.830, -1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.810), 1, 9);

      for (const [s0, s1] of [[0.06, 0.23], [0.28, 0.52], [0.58, 0.79], [0.84, 0.92]]) {
        guardrail(s0, s1, -1, 6, [0.80, 0.81, 0.83]);
        guardrail(s0, s1,  1, 6, [0.80, 0.81, 0.83]);
      }
      guardrail(0.94, 0.06, -1, 4.0, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, 1, 9, 4, [0.74, 0.76, 0.80]);
      for (const s of [0.12, 0.18, 0.36, 0.46, 0.64, 0.74, 0.88]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [150, 34, 160, 50, 20, 12, [0.20, 0.36, 0.20]],
        [280, 28, 230, 74, 60, 34, [0.26, 0.32, 0.30]],
        [430, 22, 300, 96, 110, 60, [0.42, 0.45, 0.50]],   // high hazed Caucasus
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 36;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 34)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      {
        let i = 0;
        along(0.92, 0.32, 34, (k) => {
          for (const side of [-1, 1]) {
            const a = anchor(k, side, side > 0 ? 12 : 10);
            const b = [a.r, a.u, a.t];
            out._mat = MAT.METAL;
            addCyl(out, a.c, 0.20, 20, WHITE, 8, b);
            addBox(out, vadd(a.c, a.u, 20.2), [0.34, 0.34, 4.6], [0.88, 0.89, 0.92], b);
            for (const o of [-1.8, 1.8])
              addBox(out, vadd(vadd(a.c, a.t, o), a.u, 19.9), [1.3, 0.5, 1.1],
                [0.96, 0.95, 0.88], b);
            out._mat = 0;
          }
          i++;
        });
      }
      // Turn numbers on the park section — a stadium circuit signs everything.
      signBoard(K(0.045), 1, 7, "corner", 1);
      signBoard(K(0.085), -1, 9, "corner", 2);
      signBoard(K(0.255), 1, 7, "corner", 6);
      signBoard(K(0.545), -1, 7, "corner", 13);
      signBoard(K(0.815), 1, 7, "corner", 17);
      sponsorHoarding(0.930, 0.075, 1, 3.4, { h: 1.2, step: 9 });
      // Camera towers at the show corners.
      cameraTower(K(0.085), 1, 60, { h: 20 });
      cameraTower(K(0.545), -1, 30, { h: 17 });
      cameraTower(K(0.815), 1, 26, { h: 17 });

      {
        const a = anchor(K(0.245), 1, 152);
        const b = [a.r, a.u, a.t];
        modelGroup("sochi-shayba-arena", {
          center: vadd(a.c, a.u, 12), size: [64, 26, 64], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Base drum.
          addCyl(stage, a.c, 29, 9, [0.82, 0.84, 0.88], 16, b);
          stage._mat = MAT.METAL;
          const band = [[0.90, 0.92, 0.95], [0.40, 0.54, 0.70], [0.86, 0.88, 0.92]];
          for (let i = 0; i < 4; i++) {
            const r0 = 30 - i * 1.3, r1 = 29.4 - i * 1.3;
            addFrustum(stage, vadd(a.c, a.u, 1.4 + i * 2.1), r0, r1, 2.0,
              band[i % band.length], 16, b);
          }
          stage._mat = MAT.GLASS;
          // Glazed entrance band at ground level facing the park.
          addFrustum(stage, vadd(a.c, a.u, 0.4), 29.6, 29.2, 3.4, [0.24, 0.34, 0.46], 16, b);
          stage._mat = MAT.METAL;
          // Shallow domed cap oversailing the drum.
          addCyl(stage, vadd(a.c, a.u, 9), 25, 6, [0.88, 0.90, 0.94], 16, b);
          addCyl(stage, vadd(a.c, a.u, 15), 12, 3.4, [0.84, 0.86, 0.90], 12, b);
          stage._mat = 0;
        });
      }

      const CYP = [0.16, 0.34, 0.20], CYP_D = [0.13, 0.29, 0.18];
      for (const [s0, s1, side, dist, h] of [
        [0.320, 0.395, -1, 15, 11],
        [0.330, 0.405,  1, 16, 11],
        [0.620, 0.700, -1, 15, 12],
        [0.635, 0.715,  1, 17, 11],
      ]) along(s0, s1, 12, (k) => cypress(k, side, dist, h + hash(k * 5) * 1.6,
        hash(k * 9) < 0.5 ? CYP : CYP_D, { slim: 0.85 }));
      for (const [id, s, side, gap] of [
        ["approach", 0.300, 1, 8], ["north", 0.235, 1, 32],
      ]) {
        groundPatch(K(s), side, gap, [10, 0.14, 44], [0.24, 0.42, 0.22],
          { id: `sochi-parterre-${id}`, samples: 5 });
        hedge(s - 0.018, s + 0.018, side, gap - 1.2, 0.9, [0.15, 0.34, 0.18]);
        hedge(s - 0.018, s + 0.018, side, gap + 9.5, 0.9, [0.15, 0.34, 0.18]);
      }
    };
