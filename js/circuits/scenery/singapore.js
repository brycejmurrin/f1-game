/* Apex 26 — SINGAPORE scenery (data only), split out of js/circuits/singapore.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["singapore"] =
  function (api) {
      const { out, MAT, def, n, place, backdrop,
              building, billboard, anchor, every, onTrack, addBox, addCyl, addCone,
              addPrism, addFrustum, addPyramid, grandstand, grandstandEx, sponsorHoarding,
              gantry, marshalPost, palm, bush, ds, recordBarrier,
              fence, tyreWall, vadd, hash, cityFront, tower, ferrisWheel, modelGroup,
              overheadSpan, waterSurface, waterBand, floodMastRing, circuitKit } = api;
      const K = (s) => Math.round(s * n) % n;
      // KOLD: converts a frac written in the SAME convention circuitKit's specs
      // use (its `frameAt` is wrapped with a SHIFT-ONLY remap, js/track/tracks.js
      // ~361 — no mirror) into the raw racing-node index K() needs. Only
      // required where a raw anchor()/K() call must land on the SAME spot as a
      // circuitKit-placed structure (the pit-race-control beacon below); every
      // other raw K() call in this file was independently tuned against the
      // engine's raw indexing and does not need it. Same formula tracks.js uses
      // for def._sceneryShift (the KOLD legend in monaco.js is the worked precedent).
      const _offNew = Math.round((((def.startFrac % 1) + 1) % 1) * n) % n;
      const _offOld = Math.round(((((def.sceneryStartFrac ?? def.startFrac) % 1) + 1) % 1) * n) % n;
      const _kShift = ((def.reverse ? _offNew - _offOld : _offOld - _offNew) % n + n) % n;
      const KOLD = (s) => (K(s) + _kShift) % n;

      // Shared-kit adoption: bounded race operations outside the bay hero zones.
      if (circuitKit) {
        circuitKit.raceControl({
          id: "kit:singapore:race-control", frac: 0.58, side: -1, gap: 72,
          size: [12, 24, 14], style: "drum", required: true,
        });
        circuitKit.pedestrianBridge({
          id: "kit:singapore:pedestrian-bridge", frac: 0.72,
          clearance: 7.2, thickness: 0.9, depth: 3, required: true,
        });
      }

      // Grade-aware portal beats. Short decks keep the declared underside
      // clearance true across Singapore's ramps instead of allowing a long flat
      // slab to approach the rising road at either end. Supports come from
      // overheadSpan itself (models.js) — do NOT hand-roll legs via anchor():
      // under sceneryLapMirror those land half a lap away from shift-only
      // decks, and even after the full remap they would double the built-in
      // piers.
      const makePortal = (id, s0, s1, opts) => {
        const h = opts.h;
        const gap = opts.gap;
        const col = opts.col || [0.08, 0.08, 0.10];
        const stations = [s0, (s0 + s1) * 0.5, s1];
        for (let i = 0; i < stations.length; i++) {
          const s = stations[i];
          overheadSpan({
            id: `${id}-deck-${i}`, frac: s, clearance: h, thickness: 0.9,
            depth: 6, supportGap: gap, color: col, required: true,
          });
        }
      };

      // Windows: cool fluorescent / cyan office dominant (warm floods stay on tarmac)
      const WIN_WARM = [1.00, 0.88, 0.68];   // warm incandescent (hotels only)
      const WIN_COOL = [0.68, 0.78, 0.98];   // cool fluorescent
      const WIN_CYAN = [0.55, 0.90, 1.00];   // bright cyan glass
      const WIN_GOLD = [1.00, 0.80, 0.40];   // golden hotel windows
      // Neon signage (vivid, high-saturation)
      const NEON = [
        [1.00, 0.20, 0.85],   // magenta
        [0.20, 0.92, 1.00],   // cyan
        [1.00, 0.75, 0.10],   // amber
        [0.60, 0.30, 1.00],   // violet
      ];
      // Building wall colours — dark but readable (not near-black)
      const WALL_CBD  = [0.18, 0.20, 0.30];  // dark blue-grey CBD glass
      const WALL_LITE = [0.22, 0.24, 0.34];  // slightly lighter near tower
      const WALL_WARM = [0.26, 0.22, 0.18];  // warm concrete hotel
      makePortal("sheares", 0.085, 0.115, { h: 7.4, gap: 2.2 });
      makePortal("finish-underpass", 0.925, 0.985, { h: 6.8, gap: 2.4 });

      // FAR SILHOUETTE BAND — fills sky behind near facades; anchored far
      // enough (340+ m) that it never clips near geometry. backdrop()
      // auto-adds window bands for night circuits so these aren't flat slabs.
      // Reduced to 48 instances (was 80) since window bands add geometry;
      // staggered distances give depth layering without redundancy.
      {
        const N = 48;
        for (let i = 0; i < N; i++) {
          const k  = K(i / N);
          const sd = (i % 2) ? 1 : -1;
          const w  = 34 + hash(i * 5) * 40;
          const h  = 70 + hash(i * 9) * 130;
          backdrop(k, sd,  340 + hash(i * 13) * 200, [w, h, 28], [0.08, 0.09, 0.18]);
          // Mid-distance spire on opposite side — depth layering, 260–360 m band
          if (i % 4 === 0) {
            backdrop(k, -sd, 260 + hash(i * 17) * 100, [w * 0.65, h * 1.15, 24], [0.07, 0.08, 0.17]);
          }
        }
      }

      cityFront(0.90, 0.16, 1, 20, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 70,
      });
      cityFront(0.16, 0.35, 1, 104, {
        minH: 55, maxH: 165, depth: 28, lit: true,
        palette: [WALL_CBD, WALL_LITE, WALL_CBD, [0.16, 0.18, 0.26]],
        windowCol: WIN_CYAN, floor: 18, step: 95,
      });
      cityFront(0.00, 0.20, -1, 18, {
        minH: 26, maxH: 90, depth: 22, lit: true,
        palette: [WALL_WARM, WALL_CBD, [0.20, 0.18, 0.24], WALL_LITE],
        windowCol: WIN_WARM, floor: 14, step: 70,
      });
      cityFront(0.48, 0.88, -1, 18, {
        minH: 26, maxH: 95, depth: 22, lit: true,
        palette: [WALL_WARM, [0.22, 0.20, 0.26], WALL_CBD, WALL_LITE],
        floor: 14, step: 75,
      });

      // s 0.18 R — MARINA BAY SANDS: 3 towers + skypark slab
      // Outer towers tip toward centre under the boat deck (postcard lean).
      // Towers spaced so faces never intersect; skypark bridges the tops.
      {
        const k    = K(0.18);
        const a    = anchor(k, 1, 150);
        const wall = [0.82, 0.84, 0.90];
        const winC = [0.62, 0.80, 1.00];    // strong blue-white façade glow
        const H      = 200;
        const gap    = 36;    // centre-to-centre distance between tower bases
        const TOWERW = 18;
        const LEAN   = 0.13;  // lateral tip per metre of height (~7.5°) toward centre
        const tops   = [];

        modelGroup("marina-bay-sands", {
          center: vadd(a.c, a.u, H * 0.5 + 4),
          size: [100, H + 16, 40],
          basis: [a.r, a.u, a.t],
        }, (stage) => {
        for (let t = -1; t <= 1; t++) {
          const base = vadd(a.c, a.r, t * gap);
          // Outer towers lean inward (toward mid); centre stays vertical.
          const tip = t === 0 ? 0 : -t * LEAN;   // t=-1 → +r, t=+1 → −r
          let uT = a.u, rT = a.r, tT = a.t;
          if (tip !== 0) {
            // Tilted up-axis: blend track-up with lateral tip toward centre
            const len = Math.hypot(a.u[0] + a.r[0] * tip, a.u[1], a.u[2] + a.r[2] * tip) || 1;
            uT = [(a.u[0] + a.r[0] * tip) / len, a.u[1] / len, (a.u[2] + a.r[2] * tip) / len];
            // Keep right roughly horizontal / orthogonal to lean plane
            rT = a.r;
            tT = a.t;
          }
          const b = [rT, uT, tT];
          const mid = vadd(base, uT, H * 0.5);
          stage._mat = MAT.CONCRETE;
          TrackGeom.addBox(stage, mid,                         [TOWERW, H, 28],               wall,               b);
          stage._mat = MAT.GLASS;
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.52),    [TOWERW + 0.6, H * 0.76, 28.6], winC,               b);
          stage._mat = MAT.METAL;
          const finCol = t === 0 ? [0.90, 0.75, 0.30] : [0.40, 0.65, 1.00];
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.50),    [2.0, H * 0.60, 29.2],         finCol,             b);
          TrackGeom.addBox(stage, vadd(base, uT, H * 0.92),    [TOWERW + 1, H * 0.10, 29],    [0.92, 0.95, 1.00], b);
          tops.push(vadd(base, uT, H));
        }

        // Skypark slab bridging all three tops (boat hull profile)
        const mid = tops[1];
        // Span follows leaned tops (outers closer together at the crown)
        const spanR = Math.hypot(tops[2][0] - tops[0][0], tops[2][2] - tops[0][2]);
        const skyW  = Math.max(spanR + TOWERW, gap * 2 + TOWERW * 0.7);
        stage._mat = MAT.WOOD;
        TrackGeom.addBox(stage, vadd(mid, a.u, 2.05), [skyW, 3.5, 32],      [0.86, 0.82, 0.74], [a.r, a.u, a.t]);
        stage._mat = MAT.METAL;
        TrackGeom.addBox(stage, vadd(mid, a.u, 4.55), [skyW + 1, 1.2, 32],  NEON[1],             [a.r, a.u, a.t]);
        stage._mat = MAT.GLASS;
        TrackGeom.addBox(stage, vadd(mid, a.u, 4.05), [skyW - TOWERW + 4, 0.8, 10], WIN_GOLD,   [a.r, a.u, a.t]);
        stage._mat = 0;
        }, { required: true });
      }

      {
        const k       = K(0.22);
        const a       = anchor(k, 1, 90);
        const PETAL_H = 24;
        const BASE_R  = 22;   // ring radius for petal centres — petal rad=6 m so no overlap
        for (let i = 0; i < 5; i++) {
          const ang   = (i / 5) * Math.PI * 2 + 0.3;
          const dx    = Math.cos(ang) * BASE_R * 0.65;
          const dz    = Math.sin(ang) * BASE_R * 0.65;
          const pc    = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1],
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
          addCone(out, pc, 6.5, PETAL_H,       [0.94, 0.95, 0.97], 9, [a.r, a.u, a.t]);
          // Inner warm-lit face (slightly smaller, glows like up-lit marble)
          addCone(out, pc, 4.8, PETAL_H * 0.6, [1.00, 0.92, 0.76], 8, [a.r, a.u, a.t]);
        }
        // Central podium stem
        addCyl(out, vadd(a.c, a.u, 3), 5, 9, [0.82, 0.82, 0.86], 7, [a.r, a.u, a.t]);
        // Rim accent glow at ground level
        addBox(out, vadd(a.c, a.u, 1.5), [BASE_R * 2 + 4, 0.6, BASE_R * 2 + 4], [0.70, 0.65, 0.50], [a.r, a.u, a.t]);
      }

      {
        const k = K(0.26);
        for (let i = 0; i < 11; i++) {
          const rowB  = i >= 6;
          const idx   = rowB ? i - 6 : i;
          const rowDist = rowB ? 90 : 70;
          // Lateral stagger: each tree is 17 m apart along the row
          const latOff = (idx - (rowB ? 2 : 2.5)) * 17;
          const depOff = rowB ? (idx % 2) * 10 : 0;
          // The stagger goes through the anchor's own `dist`, NOT along a.r
          // afterwards. `dist` is the lateral axis, so the physical spot is
          // unchanged — but a.r is a RAW BASIS VECTOR, which transformSceneryApi
          // does not remap, and a reversed lap negates it. Sliding along it by
          // hand therefore spread these eleven trees the wrong way round the
          // moment singapore gained `reverse: true`, putting them on ground
          // their shared anchor never sampled — up to 60 m in the air, and the
          // bulk of the circuit's float-audit count. Routing through `dist` also
          // gives each tree its own ground sample instead of all eleven
          // inheriting one anchor's Y across an 85 m spread.
          const a    = anchor(k, 1, rowDist + depOff + latOff);
          const c    = a.c;
          const h    = 28 + (idx % 4) * 9;
          const capR = 13 + (idx % 2) * 4;
          addCyl(out, c, 2.2, h, [0.15, 0.36, 0.20], 7, [a.r, a.u, a.t]);
          addCone(out, vadd(c, a.u, h - 2), capR, 8, NEON[(i % 2) ? 0 : 3], 9, [a.r, a.u, a.t]);
          // Upper secondary glow, overlapping the cap it sits in.
          addCone(out, vadd(c, a.u, h + 4), capR * 0.55, 5, NEON[(i + 1) % 4], 7, [a.r, a.u, a.t]);
        }
      }

      {
        const k = K(0.34);
        // 5 buildings: inner face starts at 42 m + (i*28) to give clear spacing
        for (let i = 0; i < 5; i++) {
          const gap = 42 + i * 28;
          building(k, -1, gap, 24, 44 + i * 10, 24, {
            kind:   ["spire", "cylinder", "notch", "fin", "twin"][i % 5],
            wall:   WALL_WARM,
            window: i % 2 ? WIN_WARM : WIN_COOL,
            floor:  14,
          });
        }
        // Neon billboards at the kerb
        billboard(k,         -1, 12, 20, 12, NEON[0]);
        billboard(K(0.355),  -1, 11, 18, 11, NEON[1]);
        billboard(K(0.37),   -1, 10, 16, 10, NEON[2]);
        billboard(K(0.38),   -1, 10, 17, 11, NEON[3]);
      }

      for (let i = 0; i < 6; i++) {
        const dist = 205 + i * 38;   // stepped 200–410 m — no overlap possible
        backdrop(K(0.45), 1, dist, [42, 60 + hash(i * 13) * 90, 30], [0.09, 0.10, 0.20]);
      }

      // Bay water reflection streaks — flat bright strips just above water level.
      // Placed at dist > 38 m so they sit beyond the barriers. dist was 44,
      // inside the s=0.20 local water patch's own inner edge (waterBand
      // gap 52) by 8 m — no water surface reaches that close to shore there,
      // so the audit's water-as-footing credit never applied and the strips
      // floated over bare (unrendered) bay. 60 clears every band's inner
      // edge this loop's s values touch (52/40/58) with margin. Single
      // anchor(a) also gets walked +/-44 m along the tangent per i (Trap B):
      // on a curve that chord drifts from the true arc, so the worst i
      // (i=0/9) needs more clearance than the s-centre alone implies — 74
      // instead of 60 to clear that drift too.
      for (const s of [0.20, 0.28, 0.38, 0.46, 0.80, 0.88]) {
        const a = anchor(K(s), 1, 74);
        for (let i = 0; i < 10; i++) {
          const c   = vadd(vadd(a.c, a.t, (i - 4) * 11), a.u, 0.5);
          const hue = (i + Math.round(s * 17)) % 4;
          // brighter reflection: 0.45-0.65 intensity range (was 0.35)
          const inten = 0.45 + Math.sin(i * 0.8) * 0.20;
          const col   = [NEON[hue][0] * inten, NEON[hue][1] * inten, NEON[hue][2] * inten];
          addBox(out, c, [8, 0.4, 3], col, [a.r, a.u, a.t]);
        }
      }

      {
        const k = K(0.55);
        building(k, -1, 18, 48, 26, 34, {
          wall:   [0.82, 0.74, 0.56],   // warm limestone/cream façade
          window: WIN_GOLD,              // hotel interior — warm gold windows
          floor:  5,                     // tall neoclassical storeys
          lit:    true,
          arch:   "flat",               // keep the iconic horizontal roofline
        });
        {
          const a = anchor(k, -1, 42);
          addBox(out, vadd(a.c, a.u, 2.5), [50, 4.5, 36], [1.00, 0.82, 0.50], [a.r, a.u, a.t]);
          // Upper cornice band — bright cream highlight
          addBox(out, vadd(a.c, a.u, 26.5), [49, 1.8, 35], [1.00, 0.92, 0.68], [a.r, a.u, a.t]);
        }
      }

      {
        const k = K(0.62);
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 4);
          for (let j = 0; j < 5; j++) {
            const c = vadd(a.c, a.t, (j - 2) * 10);  // 10 m spacing — ribs are 2 m wide
            addPrism(out, vadd(c, a.u, 7),  [2.2, 4.5, 9], [0.88, 0.88, 0.92], [a.r, a.u, a.t]);
            // addCyl is BASE-anchored (the addPrism base-anchoring note in js/track/geom.js) — this is the
            // pier holding the rib up: base at the deck (c), rising the full
            // height 7 so its top meets the rib's base flush. The old
            // `vadd(c, a.u, 3.5)` (h/2) floated the pier's own base 3.5 m off
            // the deck, so it never touched ground.
            addCyl(out,   c, 0.55, 7, [0.80, 0.80, 0.85], 5, [a.r, a.u, a.t]);
          }
          // Decorative bridge-lamp posts on the railing
          for (let j = 0; j < 3; j++) {
            const c = vadd(a.c, a.t, (j - 1) * 18);
            // Base-anchored: post rises from the deck, lamp housing sits on top.
            addCyl(out, c, 0.12, 4.5, [0.72, 0.72, 0.75], 5, [a.r, a.u, a.t]);
            addBox(out, vadd(c, a.u, 4.6), [0.6, 0.6, 0.6], WIN_WARM, [a.r, a.u, a.t]);
          }
        }
      }

      {
        const k = K(0.66);
        const DOME_SEP = 28;   // centre-to-centre; each dome rad ~14 m so no overlap
        for (let i = 0; i < 2; i++) {
          // The offset along track direction ensures clear spacing
          const a = anchor(k, -1, 44 + i * DOME_SEP);
          // Grey aluminium shell
          addCone(out, vadd(a.c, a.u, 10), 16, 15, [0.52, 0.48, 0.40], 7, [a.r, a.u, a.t]);
          // Glowing spiky crown (amber neon)
          addCone(out, vadd(a.c, a.u, 21), 8.5, 9,  NEON[2], 6, [a.r, a.u, a.t]);
        }
        // Esplanade ribs — 8 thin vertical fins around each dome
        for (let i = 0; i < 2; i++) {
          const a = anchor(k, -1, 44 + i * DOME_SEP);
          for (let r = 0; r < 8; r++) {
            const ang = (r / 8) * Math.PI * 2;
            const dx  = Math.cos(ang) * 14;
            const dz  = Math.sin(ang) * 14;
            const rc  = [a.c[0] + a.r[0] * dx + a.t[0] * dz,
                         a.c[1],
                         a.c[2] + a.r[2] * dx + a.t[2] * dz];
            addBox(out, vadd(rc, a.u, 7.5), [0.9, 15, 0.9], [0.56, 0.52, 0.44], [a.r, a.u, a.t]);
          }
        }
        // Waterfront promenade terrace in front of Esplanade
        const ta = anchor(k, -1, 26);
        addBox(out, vadd(ta.c, ta.u, 0.3), [40, 0.5, 55], [0.30, 0.28, 0.24], [ta.r, ta.u, ta.t]);
      }

      // s 0.70 L — The Padang: dark open field (lawn)
      place(K(0.70), -1, 46, [70, 1.5, 70], [0.06, 0.10, 0.06]);

      {
        const k = K(0.714);
        const a = anchor(k, -1, 100);
        const CREAM    = [0.82, 0.76, 0.58];
        const CREAM_HI = [0.90, 0.85, 0.70];
        const W = 46, H = 20, D = 64;   // W: depth away from road, D: frontage length
        // Main civic block
        addBox(out, vadd(a.c, a.u, H * 0.5), [W, H, D], CREAM, [a.r, a.u, a.t]);
        const COLN = 10;
        for (let i = 0; i < COLN; i++) {
          const off = (i - (COLN - 1) / 2) * (D * 0.82 / (COLN - 1));
          const c = vadd(vadd(a.c, a.r, W * 0.44), a.t, off);
          addCyl(out, vadd(c, a.u, H * 0.28), 1.0, H * 0.56, CREAM_HI, 8, [a.r, a.u, a.t]);
        }
        // Pediment over the central portico
        addPrism(out, vadd(vadd(a.c, a.r, W * 0.44), a.u, H * 0.60),
          [W * 0.30, H * 0.20, D * 0.42], CREAM_HI, [a.r, a.u, a.t]);
        // Low dome on one wing (the former Supreme Court rotunda)
        {
          const domeC = vadd(vadd(a.c, a.t, D * 0.30), a.u, H);
          addCyl(out, domeC, 8.5, 2.6, CREAM_HI, 12, [a.r, a.u, a.t]);
          addCone(out, vadd(domeC, a.u, 2.6), 7.6, 4.4, CREAM, 12, [a.r, a.u, a.t]);
          addCyl(out, vadd(domeC, a.u, 7.4), 0.5, 2.0, CREAM_HI, 6, [a.r, a.u, a.t]);
        }
        addBox(out, vadd(vadd(a.c, a.r, W * 0.44), a.u, 1.2), [1.4, 2.4, D * 0.9],
          [1.00, 0.90, 0.66], [a.r, a.u, a.t]);
      }

      {
        const a = anchor(K(0.722), -1, 168), b = [a.r, a.u, a.t];
        const STONE  = [0.80, 0.78, 0.73];
        const FIN    = [0.86, 0.84, 0.79];
        const GLASS  = [0.34, 0.40, 0.48];
        const LITWIN = [0.92, 0.86, 0.62];
        modelGroup("singapore-supreme-court", {
          center: vadd(a.c, a.u, 26), size: [52, 58, 86], basis: b,
        }, (stage) => {
          const W = 40, H = 34, D = 78;
          // The slab, glazed between its fins.
          addBox(stage, vadd(a.c, a.u, H * 0.5), [W, H, D], GLASS, b);
          const FINS = 26;
          for (let i = 0; i < FINS; i++) {
            const off = (i - (FINS - 1) / 2) * (D * 0.94 / (FINS - 1));
            addBox(stage, vadd(vadd(vadd(a.c, a.r, W * 0.5), a.t, off), a.u, H * 0.5),
                   [0.9, H, 1.5], FIN, b);
          }
          // Lit floor bands behind the fins — it is a night race.
          for (let f = 1; f < 6; f++) {
            addBox(stage, vadd(vadd(a.c, a.r, W * 0.46), a.u, f * (H / 6)),
                   [0.5, 1.5, D * 0.9], LITWIN, b);
          }
          // Roof deck the disc sits on.
          addBox(stage, vadd(a.c, a.u, H + 0.9), [W + 2, 1.8, D + 2], STONE, b);
          const dc = vadd(vadd(a.c, a.r, W * 0.30), a.u, H + 2.4);
          addCyl(stage, dc, 5.0, 4.5, STONE, 10, b);
          addFrustum(stage, vadd(dc, a.u, 4.0), 12.5, 17.5, 3.2, STONE, 20, b);
          addCyl(stage, vadd(dc, a.u, 7.0), 17.8, 1.5, LITWIN, 20, b);
          addFrustum(stage, vadd(dc, a.u, 8.4), 17.5, 13.0, 3.0, FIN, 20, b);
          addCyl(stage, vadd(dc, a.u, 11.3), 12.6, 0.8, STONE, 20, b);
        });
      }

      {
        const a = anchor(K(0.690), -1, 126), b = [a.r, a.u, a.t];
        const WHITE = [0.93, 0.92, 0.89];
        const SHADE = [0.84, 0.83, 0.80];
        const ROOF  = [0.42, 0.44, 0.46];
        modelGroup("singapore-st-andrews", {
          center: vadd(a.c, a.u, 18), size: [26, 46, 58], basis: b,
        }, (stage) => {
          // Nave under a shallow pitched roof, with buttresses down the flank.
          addBox(stage, vadd(a.c, a.u, 7.0), [18, 14, 46], WHITE, b);
          addPrism(stage, vadd(a.c, a.u, 15.6), [19, 3.6, 47], ROOF, b);
          for (let i = -3; i <= 3; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, 9.4), a.t, i * 6.4), a.u, 5.6),
                   [1.6, 11.2, 1.5], SHADE, b);
          }
          // Lancet window band — tall thin openings, the Gothic tell.
          for (let i = -3; i < 4; i++) {
            addBox(stage, vadd(vadd(vadd(a.c, a.r, 9.0), a.t, i * 6.4 + 3.2), a.u, 8.2),
                   [0.3, 6.0, 1.6], [0.88, 0.80, 0.55], b);
          }
          // Tower and spire at the west end — the thing you actually see.
          const tc = vadd(a.c, a.t, -25);
          addBox(stage, vadd(tc, a.u, 13), [11, 26, 11], WHITE, b);
          addBox(stage, vadd(tc, a.u, 26.6), [12.2, 1.2, 12.2], SHADE, b);
          // Corner pinnacles, then the spire itself.
          for (const [dx, dz] of [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]]) {
            addPyramid(stage, vadd(vadd(vadd(tc, a.r, dx), a.t, dz), a.u, 28.4),
                       [1.8, 4.4, 1.8], WHITE, b);
          }
          addPyramid(stage, vadd(tc, a.u, 27.2), [10.4, 15.5, 10.4], WHITE, b);
          stage._mat = MAT.METAL;
          addCyl(stage, vadd(tc, a.u, 42.6), 0.10, 2.4, [0.72, 0.70, 0.64], 4, b);
          stage._mat = 0;
        });
      }

      {
        const k = K(0.703);
        const a = anchor(k, 1, 34);
        const WHITE_COL = [0.88, 0.87, 0.84];
        // Low colonial box with a shaded veranda roof overhang
        addBox(out, vadd(a.c, a.u, 4.0), [16, 8, 24], WHITE_COL, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 8.4), [18, 0.6, 26], [0.30, 0.32, 0.34], [a.r, a.u, a.t]);
        // Veranda posts along the road-facing front
        for (const off of [-9, -3, 3, 9]) {
          const c = vadd(vadd(a.c, a.r, 7.6), a.t, off);
          addCyl(out, vadd(c, a.u, 3.4), 0.3, 6.8, WHITE_COL, 6, [a.r, a.u, a.t]);
        }
        // Small central cupola + spire
        const cupC = vadd(a.c, a.u, 8.9);
        addCyl(out, cupC, 1.8, 1.6, WHITE_COL, 8, [a.r, a.u, a.t]);
        addCone(out, vadd(cupC, a.u, 1.6), 1.6, 2.2, [0.30, 0.32, 0.34], 8, [a.r, a.u, a.t]);
        addCyl(out, vadd(cupC, a.u, 3.6), 0.1, 1.4, WHITE_COL, 4, [a.r, a.u, a.t]);
      }

      {
        const k = K(0.80);
        const a = anchor(k, 1, 32);
        for (let j = 0; j < 16; j++) {
          const t2  = j / 15;
          const ang = t2 * Math.PI;
          const up  = Math.sin(ang) * 13;
          const c   = vadd(vadd(a.c, a.t, (t2 - 0.5) * 66), a.u, up + 2);
          // Main structural tube
          addCyl(out, c, 2.4, 4.4, [0.88, 0.90, 0.95], 6, [a.r, a.u, a.t]);
          // Side lattice bar
          const barOff = Math.sin(t2 * 11) * 5.5;
          addBox(out, vadd(c, a.r, barOff), [0.9, 1.4, 1.6], [0.86, 0.88, 0.93], [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.r, barOff / 2), [Math.abs(barOff) + 0.6, 0.4, 0.4],
                 [0.86, 0.88, 0.93], [a.r, a.u, a.t]);
          // Helix crossbar
          if (j % 2 === 0)
            addBox(out, vadd(c, a.t, Math.cos(t2 * 7) * 3.5), [0.7, 1.1, 5.2], [0.83, 0.85, 0.90], [a.r, a.u, a.t]);
          // Vivid night accent lights on the helix nodes (cyan)
          if (j % 3 === 0) {
            addBox(out, vadd(vadd(c, a.r,  3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
            addBox(out, vadd(vadd(c, a.r, -3.2), a.u, 0.8), [0.5, 0.5, 0.5], NEON[1], [a.r, a.u, a.t]);
          }
        }
      }

      ferrisWheel(K(0.86), 1, 58, 44);

      {
        billboard(K(0.92),  1,  11, 18, 11, NEON[3]);
        billboard(K(0.92), -1,  11, 18, 11, NEON[2]);
        billboard(K(0.94),  1,  10, 16, 10, NEON[1]);
        billboard(K(0.94), -1,  10, 16, 10, NEON[0]);
        billboard(K(0.96),  1,  10, 16, 10, NEON[0]);
        billboard(K(0.96), -1,  10, 17, 11, NEON[3]);
        billboard(K(0.98),  1,  10, 15, 10, NEON[2]);
      }
      cityFront(0.955, 0.04, -1, 14, {
        minH: 12, maxH: 24, depth: 16, lit: true,
        palette: [WALL_WARM, [0.24, 0.22, 0.18], WALL_WARM, [0.20, 0.19, 0.16]],
        windowCol: WIN_WARM, floor: 4, step: 28,
      });

      for (const s of [0.20, 0.30, 0.42, 0.82, 0.88]) {
        const a = anchor(K(s), 1, 24);
        // s=0.30 sits on a locally steeper stretch of the promenade than the
        // other four anchors — this 28 m-long strip's single-point ground
        // sample there reads ~1.8 m shy of where the far end of the box
        // actually needs to sit. Only that one anchor needs the extra drop;
        // moving all five identically re-seated the other four flush enough
        // with the terrain to open new same-facing coplanar spots (measured
        // 9 -> 14 spots), so this stays per-anchor rather than a shared const.
        const drop = s === 0.30 ? 0.6 : 0;
        addBox(out, vadd(a.c, a.u, 3.0 - drop), [3.5, 1.8, 28], WIN_WARM, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 0.8), [3.8, 1.2, 28], NEON[1],  [a.r, a.u, a.t]);
      }

      const BAY = [0.06, 0.08, 0.14];

      floodMastRing(38, { h: 24, dist: 11, cool: false, pool: true, arms: 3 });

      if (circuitKit) {
        const PIT_SEGS = [
          { id: "kit:singapore:pit-building-1", frac: 0.958,  len: 90, garages: 8 },
          { id: "kit:singapore:pit-building-2", frac: 0.9755, len: 50, garages: 4 },
          { id: "kit:singapore:pit-building-3", frac: 0.988,  len: 15, garages: 2 },
          { id: "kit:singapore:pit-building-4", frac: 0.999,  len: 90, garages: 8 },
        ];
        for (const seg of PIT_SEGS) {
          circuitKit.pitBuilding({
            id: seg.id, frac: seg.frac, side: -1, gap: 11,
            size: [22, 16, seg.len], garages: seg.garages, style: "flat",
            required: true,
          });
          const a = anchor(K(seg.frac), -1, 11);
          for (const yy of [4.0, 8.6, 13.2]) {
            addBox(out, vadd(a.c, a.u, yy), [0.7, 2.6, seg.len - 4], WIN_CYAN, [a.r, a.u, a.t]);
          }
        }
        circuitKit.raceControl({
          id: "kit:singapore:pit-race-control", frac: 0.999, side: -1, gap: 46,
          size: [14, 34, 16], required: true,
        });
        {
          const a = anchor(KOLD(0.999), -1, 53);
          addCone(out, vadd(a.c, a.u, 33.4), 2.2, 6, NEON[1], 6, [a.r, a.u, a.t]);
        }
      }

      grandstandEx(0.99,  1, 12, 62, null, null,
        { livery: "scaffold", tiers: 3, roof: "truss", suites: true, endWalls: true, pylons: true });
      grandstandEx(0.02,  1, 12, 62, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", endWalls: true });
      grandstandEx(0.05,  1, 12, 50, null, null,
        { livery: "darkSteel", tiers: 1, roof: "flat" });
      grandstandEx(0.70, -1, 30, 48, null, null,
        { livery: "scaffold", tiers: 2, roof: "truss", endWalls: true });

      // Start/finish gantry + halfway scoring gantry
      gantry(0.0, 7.5, [0.12, 0.12, 0.16]);
      gantry(0.5, 7.0, [0.12, 0.12, 0.16]);
      // Lit start-light cluster is an explicit safe overhead model.
      overheadSpan({
        id: "start-light-cluster", frac: 0, clearance: 6.9,
        thickness: 1.4, depth: 0.9, span: 4.5,
        color: [0.95, 0.05, 0.05], required: true, supports: false,
      });

      for (const s of [0.07, 0.16, 0.28, 0.36, 0.47, 0.60, 0.68, 0.76, 0.84, 0.94]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 7);
      }

      for (const [s0, s1, side] of [
        [0.00, 0.18, -1], [0.20, 0.40, -1], [0.42, 0.62, -1], [0.64, 0.85, -1], [0.87, 0.99, -1],
        [0.00, 0.16,  1], [0.30, 0.44,  1], [0.55, 0.66,  1], [0.92, 0.99,  1],
      ]) {
        // Sit behind the 1.2 m concrete wall rather than sharing its edge.
        fence(s0, s1, side, 3.0, 3.4, [0.66, 0.70, 0.78]);
      }
      for (const [s0, s1, side] of [
        [0.17, 0.29,  1], [0.45, 0.54,  1], [0.67, 0.79,  1], [0.80, 0.91,  1],
        [0.185, 0.195, -1], [0.405, 0.415, -1], [0.625, 0.635, -1],
      ]) fence(s0, s1, side, 3.0, 3.4, [0.66, 0.70, 0.78]);

      for (const [s0, s1, side] of [
        [0.085, 0.10, 1], [0.235, 0.25, -1], [0.475, 0.49, -1],
        [0.66, 0.675,  1], [0.82, 0.835,  -1],
      ]) {
        tyreWall(s0, s1, side, 1.6, NEON[K(s0) % 4]);
      }

      every(26, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 5 + side) < 0.30) continue;
          palm(k, side, 8 + hash(k + side) * 5, 9 + hash(k * 2 + side) * 5, [0.18, 0.42, 0.20]);
        }
      });
      every(62, (k) => {
        if (hash(k * 9) < 0.60) return;
        bush(k, hash(k) < 0.5 ? -1 : 1, 8 + hash(k) * 5, [0.14, 0.36, 0.18]);
      });

      // TRACKSIDE NEON SIGNAGE — collapsed from three overlapping billboard
      // passes (a 32-slot barrier ring, a scattered punctuation pass and a
      // corner-neon pass) that stacked near-identical geometry, worst around
      // s 0.90-0.98 where all three used to fire within a few metres of each
      // other. One varied pass now carries the same neon presence: hand-set
      // corner/straight positions (folded in from the old scattered + corner
      // passes) plus a sparse jittered ring filling the gaps between them —
      // never a mechanical 1-in-32 grid — and it explicitly skips s
      // 0.895-0.995, which the pit-straight funnel below already owns.
      for (const [s, side, hue, w, h] of [
        [0.04,  1, 1, 16, 10], [0.08,  1, 2, 15, 9],  [0.14, -1, 0, 17, 10],
        [0.24, -1, 3, 14, 9],  [0.31,  1, 1, 18, 10], [0.36,  1, 0, 15, 9],
        [0.50, -1, 2, 16, 10], [0.53, -1, 1, 14, 9],  [0.58,  1, 3, 17, 10],
        [0.72,  1, 1, 15, 9],  [0.77,  1, 2, 18, 10],  [0.84, -1, 0, 16, 9],
      ]) {
        billboard(K(s), side, 11, w, h, NEON[hue]);
      }
      {
        const RING_N = 14;
        for (let i = 0; i < RING_N; i++) {
          const sf = (i + 0.5 + (hash(i * 3.3) - 0.5) * 0.6) / RING_N;
          if (sf > 0.895 && sf < 0.995) continue;   // pit-straight funnel's stretch
          const side = hash(i * 1.7) < 0.5 ? -1 : 1;
          billboard(K(sf), side, 9.5, 10 + hash(i * 4.1) * 6, 4.5 + hash(i * 2.1) * 2, NEON[i % 4]);
        }
      }
      sponsorHoarding(0.895, 0.995, 1, 5, { h: 1.2, step: 11 });

      const SGP_LIV = ["scaffold", "teal", "darkSteel"];
      let standIdx = 0;
      for (const [s, side, gap, len] of [
        [0.115, -1, 14, 52], [0.150,  1, 16, 46], [0.245, -1, 14, 48],
        [0.330, -1, 15, 44], [0.415,  1, 16, 50], [0.500, -1, 14, 46],
        [0.585,  1, 15, 48], [0.640, -1, 14, 44], [0.700,  1, 16, 46],
        [0.865, -1, 15, 50], [0.905,  1, 14, 48],
      ]) {
        const tiers = hash(K(s) * 3.1) < 0.35 ? 2 : 1;
        grandstandEx(s, side, gap, len, null, null, {
          livery: SGP_LIV[standIdx++ % SGP_LIV.length], tiers,
          roof: tiers > 1 ? "cantilever" : "truss",
          endWalls: hash(K(s) * 1.7) < 0.4,
        });
      }
      const SCAF_TUBE = [0.58, 0.60, 0.64];      // galvanised tube
      const SCAF_DECK = [0.66, 0.68, 0.71];      // aluminium plank
      const SCAF_MESH = [0.13, 0.15, 0.18];      // dark safety screen
      const SCAF_FANS = [
        [0.86, 0.86, 0.88], [0.72, 0.24, 0.22], [0.30, 0.40, 0.58],
        [0.84, 0.72, 0.36], [0.50, 0.52, 0.56], [0.78, 0.80, 0.84],
      ];
      function scaffoldBay(s, side, gap, len, rows, banner) {
        const k = K(s);
        const probe = anchor(k, side, gap);
        if (onTrack(probe.c[0], probe.c[2], len * 0.4)) return;
        const half = (len / 2) / (n * ds);
        recordBarrier(s - half, s + half, side, gap);
        const a = anchor(k, side, gap + 5.2);
        const b = [a.r, a.u, a.t];
        const IN = -side;                          // +a.r * IN faces the track
        const bays = Math.max(3, Math.round(len / 6.4));
        const pitch = len / bays;
        const topH = 2.2 + rows * 1.34;
        const run = 9.0, dl = Math.hypot(run, topH);
        const dv = [(a.r[0] * run * IN + a.u[0] * topH) / dl,
                    (a.r[1] * run * IN + a.u[1] * topH) / dl,
                    (a.r[2] * run * IN + a.u[2] * topH) / dl];
        const pv = [(-a.r[0] * topH * IN + a.u[0] * run) / dl,
                    (-a.r[1] * topH * IN + a.u[1] * run) / dl,
                    (-a.r[2] * topH * IN + a.u[2] * run) / dl];
        for (let i = 0; i <= bays; i++) {
          const p = vadd(a.c, a.t, (i - bays / 2) * pitch);
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(p, a.u, 0.2), [11.0, 0.4, 1.5], [0.42, 0.43, 0.46], b);  // ballast pad
          out._mat = MAT.METAL;
          addCyl(out, vadd(p, a.r, IN * 4.5), 0.13, 2.6, SCAF_TUBE, 5, b);          // front standard
          addCyl(out, vadd(p, a.r, -IN * 4.5), 0.13, topH + 1.9, SCAF_TUBE, 5, b);  // back standard
          addBox(out, vadd(p, a.u, topH * 0.5), [0.13, dl, 0.13], SCAF_TUBE, [pv, dv, a.t]);
          addBox(out, vadd(p, a.u, topH * 0.36), [9.2, 0.11, 0.11], SCAF_TUBE, b);  // ledgers
          addBox(out, vadd(p, a.u, topH * 0.74), [9.2, 0.11, 0.11], SCAF_TUBE, b);
          out._mat = 0;
        }
        // Aluminium plank decks with a sparse crowd. The crowd is a BANDED run
        // plus speckle — never one box per seat.
        for (let t = 0; t < rows; t++) {
          const lat = IN * (4.0 - t * 1.22), y = 1.4 + t * 1.34;
          out._mat = MAT.METAL;
          addBox(out, vadd(vadd(a.c, a.r, lat), a.u, y), [1.22, 0.14, len], SCAF_DECK, b);
          out._mat = MAT.FABRIC;
          addBox(out, vadd(vadd(a.c, a.r, lat), a.u, y + 0.5), [0.86, 0.86, len - 2],
                 SCAF_FANS[t % SCAF_FANS.length], b);
          const cnt = Math.min(10, Math.floor(len / 8));
          for (let c = 0; c < cnt; c++) {
            if (hash(k * 11 + t * 41 + c * 17) < 0.5) continue;
            const off = (c / Math.max(1, cnt - 1) - 0.5) * (len - 6);
            addBox(out, vadd(vadd(vadd(a.c, a.r, lat), a.t, off), a.u, y + 1.05),
                   [0.9, 0.95, 1.5], SCAF_FANS[(c + t * 3) % SCAF_FANS.length], b);
          }
          out._mat = 0;
        }
        out._mat = MAT.METAL;
        addBox(out, vadd(vadd(a.c, a.r, -IN * 4.6), a.u, topH * 0.55 + 0.9),
               [0.1, topH * 1.1, len], SCAF_MESH, b);
        out._mat = 0;
        // Printed sponsor fascia across the front of the deck.
        addBox(out, vadd(vadd(a.c, a.r, IN * 4.9), a.u, 1.5), [0.2, 1.9, len], banner, b);
        addBox(out, vadd(vadd(a.c, a.r, IN * 4.2), a.u, 0.55), [1.4, 0.3, len - 2],
               [1.10, 0.94, 0.62], b);
      }
      for (const [s, side, gap, len, rows, banner] of [
        [0.060, -1, 15, 44, 7, NEON[1]], [0.205,  1, 15, 42, 6, NEON[2]],
        [0.290,  1, 16, 44, 7, NEON[0]], [0.455, -1, 15, 42, 6, NEON[3]],
        [0.545,  1, 15, 44, 7, NEON[1]], [0.815, -1, 16, 46, 8, NEON[2]],
      ]) {
        scaffoldBay(s, side, gap, len, rows, banner);
      }
      // Apex kerb flashes at the 90-degree corners.
      for (const [s, side] of [[0.09, 1], [0.24, -1], [0.36, 1], [0.48, -1],
                               [0.56, 1], [0.67, 1], [0.72, -1], [0.83, -1]]) {
        place(K(s), side, 2.2, [0.5, 0.22, 8], [0.86, 0.16, 0.16]);
        place(K(s), side, 3.2, [1.6, 0.18, 8], [0.92, 0.92, 0.94]);
      }

      for (const [s, side, seedOff] of [
        [0.12, -1, 0], [0.50, -1, 3], [0.58, 1, 6], [0.74, -1, 9], [0.06, 1, 12],
      ]) {
        const dist = 210 + hash(K(s) * 3 + seedOff) * 70;
        const H    = 160 + hash(K(s) * 3 + seedOff + 1) * 100;
        const winCol = hash(K(s)) < 0.5 ? WIN_CYAN : WIN_COOL;
        tower(K(s), side, dist, 28, H, {
          col:    WALL_CBD,
          cap:    true,
          capCol: winCol,
          mast:   18,
          seg:    8,
        });
        // Glowing antenna tip neon accent (cyan — distinctive Singapore night skyline)
        {
          const a = anchor(K(s), side, dist);
          addCone(out, vadd(a.c, a.u, H + 20), 3.0, 10, NEON[1], 6, [a.r, a.u, a.t]);
        }
      }

      waterBand(0.26, 0.36, 1, 40, 104, 12, BAY, { id: "marina-water-30", required: true });
      waterBand(0.80, 0.90, 1, 40, 104, 12, BAY, { id: "marina-water-84", required: true });

      for (const [s, gap, w, h, d] of [
        [0.390, 34, 30, 48, 24],
        [0.410, 54, 34, 62, 26],
        [0.430, 76, 38, 76, 28],
      ]) {
        building(K(s), -1, gap, w, h, d, {
          wall: WALL_WARM, window: WIN_GOLD, floor: 6, lit: true, roof: true,
        });
        const a = anchor(K(s), -1, gap + w * 0.5);
        addBox(out, vadd(a.c, a.u, h + 0.9), [w + 1.2, 1.4, d + 1.2],
          [1.00, 0.88, 0.58], [a.r, a.u, a.t]);
      }

      for (const [s, dist, baseW, h, capCol] of [
        [0.460, 150, 30, 138, WIN_CYAN],
        [0.490, 188, 34, 176, WIN_COOL],
        [0.520, 226, 28, 154, WIN_GOLD],
      ]) {
        tower(K(s), 1, dist, baseW, h, {
          col: WALL_CBD, cap: true, capCol, mast: 14, seg: 8,
        });
      }

      for (const [s, gap, depth] of [[0.20, 52, 52], [0.44, 58, 58]]) {
        waterBand(s - 0.03, s + 0.03, 1, gap, gap + depth, 12, BAY, {
          id: `marina-water-depth-${Math.round(s * 100)}`,
        });
        const a = anchor(K(s), 1, 30);
        for (let i = -2; i <= 2; i++) {
          const c = vadd(vadd(a.c, a.t, i * 9), a.u, 1.2);
          addBox(out, c, [1.0, 2.0, 5.5], i % 2 ? WIN_GOLD : WIN_CYAN,
            [a.r, a.u, a.t]);
        }
      }

      grandstandEx(0.735, -1, 22, 54, null, null,
        { livery: "teal", tiers: 2, roof: "cantilever", suites: true, endWalls: true });
      grandstandEx(0.765,  1, 26, 48, null, null,
        { livery: "scaffold", tiers: 1, roof: "truss" });
      grandstandEx(0.785, -1, 24, 46, null, null,
        { livery: "darkSteel", tiers: 1, roof: "cantilever" });

      overheadSpan({
        id: "bayfront-pedestrian-link", frac: 0.445, clearance: 7.4,
        thickness: 0.8, depth: 2.6, supportGap: 4.2,
        color: [0.30, 0.48, 0.66],
      });

      for (const [s, side] of [
        [0.500, -1], [0.525, -1], [0.550, -1], [0.575, -1],
        [0.705,  1], [0.730,  1], [0.755,  1], [0.780,  1],
      ]) {
        const k = K(s);
        const h = 10 + hash(k * 11) * 3;
        palm(k, side, 14, h, [0.18, 0.46, 0.22]);
        palm(k, side, 22, h + 2, [0.14, 0.38, 0.18]);
        bush(k, side, 10, [0.16, 0.40, 0.18]);
      }

      {
        const a = anchor(K(0.58), 1, 34);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b   = [a.r, a.u, a.t];
          const jetB = [a.t, a.r, a.u];    // 'up' slot = a.r → jet fires outward over water
          const WHITE = [0.92, 0.93, 0.95];
          const SHADE = [0.80, 0.82, 0.86];
          // Round plinth in the splash pool
          out._mat = MAT.CONCRETE;
          addCyl(out, vadd(a.c, a.u, 0.6), 7, 1.2, [0.60, 0.62, 0.66], 12, b);
          // Fish-body base: three stacked scale rings tapering up (curved body)
          addFrustum(out, vadd(a.c, a.u, 1.2), 6.2, 5.0, 5, WHITE, 10, b);
          addFrustum(out, vadd(a.c, a.u, 6.0), 5.0, 4.2, 5, SHADE, 10, b);
          addFrustum(out, vadd(a.c, a.u, 10.8), 4.2, 3.4, 5, WHITE, 10, b);
          // Upright chest/torso
          addBox(out, vadd(a.c, a.u, 16.5), [5.6, 5, 4.6], WHITE, b);
          // Lion head block + snout jutting toward the bay
          const head = vadd(a.c, a.u, 20.5);
          addBox(out, head, [5.2, 4.4, 4.6], WHITE, b);
          addBox(out, vadd(head, a.r, 3.0), [2.6, 2.4, 2.6], SHADE, b);   // snout
          // Mane — a ring of short cones around the head
          for (let m = 0; m < 8; m++) {
            const ang = (m / 8) * Math.PI * 2;
            const dx = Math.cos(ang) * 3.2, dz = Math.sin(ang) * 3.2;
            const mc = [head[0] + a.r[0] * dx + a.t[0] * dz, head[1] + 0.5, head[2] + a.r[2] * dx + a.t[2] * dz];
            addCone(out, mc, 1.1, 2.4, [0.86, 0.88, 0.92], 5, [a.r, a.u, a.t]);
          }
          // Ears
          for (const o of [-1.6, 1.6]) addCone(out, vadd(vadd(head, a.t, o), a.u, 2.6), 0.7, 1.6, WHITE, 5, b);
          out._mat = 0;
          // Water jet — a long tapering cyan cone arcing out over the bay
          const mouth = vadd(vadd(head, a.r, 2.4), a.u, 0.6);
          addCone(out, mouth, 0.9, 18, WIN_CYAN, 7, jetB);
          addCone(out, vadd(mouth, a.r, 16), 1.4, 3, [0.85, 0.95, 1.00], 7, jetB);   // splash burst
          // Splash pool + reflective disc at the base
          addCyl(out, vadd(a.c, a.u, 0.2), 12, 0.3, [0.08, 0.16, 0.24], 14, b);
          addBox(out, vadd(a.c, a.u, 0.4), [22, 0.15, 22], [0.40, 0.55, 0.65], b);
        }
      }

      // ── LIT HARBOUR BUMBOATS — small glowing boats on the bay water ──────
      const bumboat = (a, sc, glow) => {
        const b = [a.r, a.u, a.t];
        out._mat = MAT.WOOD;
        addBox(out, vadd(a.c, a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 9 * sc], [0.30, 0.22, 0.16], b);
        addPrism(out, vadd(vadd(a.c, a.t, 4.4 * sc), a.u, 0.8 * sc), [3.4 * sc, 1.4 * sc, 1.6 * sc], [0.34, 0.24, 0.18], b);
        addBox(out, vadd(a.c, a.u, 2.4 * sc), [2.6 * sc, 1.8 * sc, 4 * sc], [0.42, 0.30, 0.20], b);  // cabin
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 2.6 * sc), [2.7 * sc, 0.7 * sc, 4.1 * sc], glow, b);              // lit windows
        for (let s = -2; s <= 2; s++) addBox(out, vadd(vadd(a.c, a.t, s * 0.9 * sc), a.u, 3.4 * sc), [0.3 * sc, 0.3 * sc, 0.3 * sc], s % 2 ? NEON[2] : NEON[1], b);
      };
      for (let i = 0; i < 6; i++) {
        const s = [0.24, 0.33, 0.42, 0.46, 0.83, 0.87][i];
        const a = anchor(K(s), 1, 30 + (i % 3) * 12 + hash(i * 7) * 8);
        if (onTrack(a.c[0], a.c[2], 8)) continue;
        bumboat(a, 1.0 + hash(i * 5) * 0.6, i % 2 ? WIN_WARM : WIN_GOLD);
      }
    };
