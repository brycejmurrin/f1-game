/* Apex 26 — SPA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.9875, // GPS-derived (OpenF1 2025, conf=0.329)
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    baseHW: 8,
    pal: { zenith: [0.27, 0.39, 0.53], horizon: [0.53, 0.61, 0.70], grass: [0.12, 0.34, 0.14], runoff: [0.4, 0.4, 0.4], fog: [0.62, 0.67, 0.72], fogDensity: 0.0026, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.98, 0.84, 0.64], sunColor: [0.9, 0.8, 0.62] },
    segs: [
      { t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 }, { t: -30, l: 80, h: 16 },
      { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 }, { t: -90, l: 160, h: -10 }, { t: 40, l: 90 },
      { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 }, { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 },
      { t: 30, l: 120 },
    ],
    // Eau Rouge dip, the Raidillon/Kemmel climb (the calendar's biggest, ~100 m
    // top-to-bottom), then the long descent back through the second sector.
    elevations: [{ s: 0.10, halfM: 280, rise: -6 }, { s: 0.17, halfM: 440, rise: 16 }, { s: 0.46, halfM: 520, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, every, prop, place, backdrop,
              addBox, addCyl, addCone, addPrism, addFrustum, vadd, anchor, onTrack,
              mountain, pine, tree, forestEdge, grandstand, building, motorhome,
              marshalPost, gantry, billboard, fence, guardrail, tyreWall } = api;
      const K = (s) => Math.round(s * n) % n;

      // Start gantry over the line (every circuit has one; the start-gantry
      // downlights in buildTrackLights need this structure to hang from).
      gantry(0.0, 7.5, [0.26, 0.28, 0.32]);

      // --- Encircling Ardennes mountains: a near forested range with light snow
      // only on the highest tops, and a far hazed range. Centre-based ring so the
      // forested peaks sit on the horizon, not scattered across the infield.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // Three concentric rings of organic peaks. Each ring is densely packed and
      // angularly offset from its neighbours so the summits OVERLAP into one
      // continuous forested wall with no gaps anywhere around the lap. Low `seg`
      // keeps each peak cheap so we can afford many. Snow only on the far tops.
      const ranges = [
        // near forested wall — wMin/wVar sized so max(w)*0.62 < extra-8 (guard won't fire)
        { extra: 280, wMin: 160, hMin: 56, hVar: 54, wVar: 80, count: 32, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.10, 0.32, 0.14], rock: [0.28, 0.32, 0.28], snow: [0.90, 0.93, 0.96], snowline: 1.2 } },
        // mid forested wall — offset to fill the seams of the near ring
        { extra: 290, wMin: 340, hMin: 92, hVar: 70, wVar: 150, count: 26, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.13, 0.36, 0.17], rock: [0.34, 0.38, 0.36], snow: [0.90, 0.93, 0.96], snowline: 0.92 } },
        // far hazed range — paler damp grey-green, light snow on the very tops
        { extra: 450, wMin: 380, hMin: 132, hVar: 110, wVar: 150, count: 22, phase: 0.0,
          opts: { seg: 7, rough: 0.34, forest: [0.18, 0.42, 0.20], rock: [0.46, 0.50, 0.50], snow: [0.92, 0.94, 0.97], snowline: 0.78 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        for (let i = 0; i < rg.count; i++) {
          const a = (i + rg.phase + rg.extra * 0.004) / rg.count * 6.2832, h = hash(i * 7 + rg.extra);
          // jitter the radius inward/outward so the wall has depth but never opens a gap
          const rr = ring - rg.wMin * 0.18 + hash(i * 5 + rg.extra) * rg.wMin * 0.30;
          mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                   rg.wMin + h * rg.wVar, rg.hMin + h * rg.hVar, Object.assign({ seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Forested ridgelines settling behind the trackside treeline.
      // 22 m height ≈ tall Ardennes pine — reads as a tree-top horizon, not a
      // looming wall. 200 m+ keeps the near face >140 m from the road edge.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 100, [110, 22, 90], [0.13, 0.30, 0.16]);
        }
      });

      // --- Dense Ardennes pine forest walling both sides of the track. Tighter
      // spacing and a low skip threshold so the woodland is continuous; a second
      // deeper rank thickens the wall behind the front line.
      every(44, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side);
          if (s < 0.26) continue;
          const dist = 8 + s * 20, h = 9 + s * 9;
          pine(k, side, dist, h, [0.09 + s * 0.05, 0.30, 0.14]);
          if (s > 0.70) pine(k, side, dist + 12 + s * 16, h + 3, [0.11 + s * 0.05, 0.28, 0.13]);
        }
      });
      // Fill the sparse stretches: a staggered front-line rank offset from the above.
      every(64, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5 + 3);
          if (s < 0.58) continue;
          const dist = 6 + s * 10, h = 8 + s * 7;
          pine(k, side, dist, h, [0.10 + s * 0.04, 0.31, 0.15]);
        }
      });
      // Hero density at Eau Rouge / Raidillon (s≈0.05–0.10): crowd the climb with pines.
      every(12, (k) => {
        const s = k / n;
        if (s < 0.045 || s > 0.12) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 53 + side);
          pine(k, side, 7 + r * 10, 10 + r * 10, [0.08 + r * 0.05, 0.31, 0.15]);
          if (r > 0.5) pine(k, side, 20 + r * 18, 13 + r * 9, [0.10 + r * 0.04, 0.28, 0.13]);
        }
      });

      // --- Modern pit/paddock building: long low white-grey mass on the pit straight.
      building(0, -1, 9, 14, 11, 64, { wall: [0.90, 0.91, 0.93], window: [0.40, 0.46, 0.50], floor: 5 });
      {
        // Thin cantilever roof blade over the pit lane.
        const a = anchor(0, -1, 20);
        addBox(out, vadd(a.c, a.u, 12.5), [16, 0.8, 60], [0.82, 0.84, 0.88], [a.r, a.u, a.t]);
      }
      // Paddock hospitality row set back behind the pit building — Spa's
      // paddock was missing a team-motorhome row entirely (just the pit slab
      // + one old building); motorhome() adds the two-tier body + awning.
      motorhome(Math.round(n * 0.001) % n, -1, 24, 16, 8, 20, { wall: [0.88, 0.89, 0.91], window: [0.30, 0.38, 0.46] });
      motorhome(Math.round(n * 0.006) % n, -1, 24, 15, 7, 18, { wall: [0.82, 0.84, 0.88], window: [0.32, 0.40, 0.48] });
      motorhome(Math.round(n * 0.994) % n, -1, 24, 15, 7, 18, { wall: [0.86, 0.87, 0.90], window: [0.30, 0.38, 0.46] });
      // Lone weathered old pit building on the original Kemmel straight (s≈0.10, far left).
      building(Math.round(n * 0.10) % n, -1, 40, 12, 9, 40, { wall: [0.74, 0.72, 0.66], window: [0.34, 0.34, 0.32], floor: 4 });

      // --- Grandstands: La Source, Eau Rouge, Les Combes, Bus Stop, pit straight.
      const shell = [0.42, 0.43, 0.47];
      grandstand(0.00, 1, 8, 40, shell, [0.50, 0.52, 0.56]);   // main grandstand, pit straight
      grandstand(0.02, 1, 8, 26, shell, [0.62, 0.16, 0.16]);   // La Source hairpin
      grandstand(0.07, 1, 8, 28, shell, [0.20, 0.36, 0.62]);   // Eau Rouge / Raidillon
      // Giant screen on the Raidillon climb (a jumbotron beside the stand — a
      // signature of the Eau Rouge/Raidillon amphitheatre).
      billboard(Math.round(n * 0.085) % n, 1, 12, 13, 7.5, [0.05, 0.06, 0.09]);
      grandstand(0.16, 1, 8, 30, shell, [0.50, 0.52, 0.56]);   // Les Combes
      grandstand(0.92, 1, 8, 28, shell, [0.46, 0.48, 0.52]);   // Bus Stop chicane

      // --- Yellow-capped marshal posts dotted around the lap.
      every(120, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        marshalPost(k, side, 4);
      });
      // Extra marshal posts flanking pit entry (s≈0.97).
      marshalPost(Math.round(n * 0.97) % n, -1, 4);
      marshalPost(Math.round(n * 0.97) % n, 1, 4);

      // --- Eau Rouge: low concrete runoff wall boxes at the valley base (s≈0.06, left).
      {
        const kw = Math.round(n * 0.06) % n;
        place(kw, -1, 4, [1.0, 1.4, 22], [0.55, 0.55, 0.52]);
      }

      // ======================================================================
      // BESPOKE ARDENNES LANDMARKS — local models built from raw primitives
      // ======================================================================

      // --- Ardennes stone chalet: rendered body + steep slate A-frame roof +
      //     stone chimney + a warm-lit gable window. The regional forest farmhouse.
      function chalet(k, side, dist, w, h, d, wallCol, roofCol) {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], Math.max(w, d) * 0.6 + 3)) return;
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, h / 2), [w, h, d], wallCol, b);                  // body
        addPrism(out, vadd(a.c, a.u, h), [w * 1.05, h * 0.7, d], roofCol, b);       // steep roof
        addBox(out, vadd(vadd(vadd(a.c, a.u, h + h * 0.5), a.t, d * 0.28), a.r, w * 0.26),
               [w * 0.16, h * 0.85, w * 0.16], [0.42, 0.40, 0.38], b);              // stone chimney
        addBox(out, vadd(vadd(a.c, a.u, h * 0.5), a.r, -side * (w * 0.5 + 0.06)),
               [0.12, h * 0.34, d * 0.42], [0.98, 0.85, 0.50], b);                  // warm-lit window
      }

      // --- Forest campsite / RV village: the campervans + ridge tents that pack
      //     the Ardennes hillsides above Eau Rouge on race weekend — rows of
      //     little caravans and tents, a shared awning and a glowing campfire.
      function rvCamp(k, side, dist, count) {
        const a = anchor(k, side, dist);
        if (onTrack(a.c[0], a.c[2], 24)) return;
        const b = [a.r, a.u, a.t];
        const vanCols = [[0.86, 0.87, 0.88], [0.80, 0.44, 0.26], [0.72, 0.74, 0.78], [0.60, 0.66, 0.58]];
        const tentCols = [[0.78, 0.30, 0.24], [0.24, 0.44, 0.62], [0.86, 0.74, 0.30], [0.40, 0.56, 0.34]];
        for (let i = 0; i < count; i++) {
          const row = i % 2, col = (i / 2) | 0;
          const off = (col - count / 4) * 9;
          const base = vadd(vadd(a.c, a.t, off), a.r, -side * (row * 9));
          if (hash(k * 3 + i) < 0.55) {
            const vc = vanCols[(hash(k * 7 + i) * 4) | 0];
            addBox(out, vadd(base, a.u, 1.9), [3.0, 2.6, 6.2], vc, b);              // caravan body
            addBox(out, vadd(base, a.u, 3.3), [3.1, 0.5, 6.2],
                   [vc[0] * 0.8, vc[1] * 0.8, vc[2] * 0.8], b);                     // roof cap
          } else {
            const tc = tentCols[(hash(k * 11 + i) * 4) | 0];
            addPrism(out, vadd(base, a.u, 0.2), [3.4, 1.9, 4.2], tc, b);            // ridge tent
          }
        }
        addBox(out, vadd(a.c, a.u, 2.6), [7, 0.15, 5], [0.90, 0.90, 0.86], b);      // shared awning
        addCone(out, a.c, 0.6, 1.0, [0.95, 0.55, 0.15], 5, b);                      // campfire glow
      }

      // --- Historic Spa timing / control tower: a stepped stack (office box →
      //     tapered shaft → glazed timing box) with a clock face and flag mast.
      function timingTower(k, side, dist) {
        const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 6), [8, 12, 8], [0.80, 0.78, 0.72], b);          // base office
        addFrustum(out, vadd(a.c, a.u, 12), 3.4, 2.6, 10, [0.84, 0.82, 0.76], 6, b);// shaft
        addBox(out, vadd(a.c, a.u, 23), [5.5, 3.2, 5.5], [0.18, 0.22, 0.28], b);    // glazed timing box
        addBox(out, vadd(a.c, a.u, 23), [5.6, 1.6, 5.6], [0.90, 0.92, 0.86], b);    // lit interior band
        addBox(out, vadd(a.c, a.u, 26.6), [6, 0.6, 6], [0.30, 0.30, 0.34], b);      // roof slab
        addCyl(out, vadd(a.c, a.u, 27), 0.12, 6, [0.42, 0.42, 0.46], 4, b);         // flag mast
        addBox(out, vadd(vadd(a.c, a.u, 18), a.r, -side * 4.05), [0.2, 2.4, 2.4],
               [0.94, 0.93, 0.88], b);                                             // trackside clock face
      }

      // --- Spectator footbridge spanning the track: two stair towers + a decked
      //     walkway with railings — one of Spa's forest crossings.
      function footbridge(s, deckCol) {
        const kb = K(s);
        const L = anchor(kb, -1, 3), R = anchor(kb, 1, 3);
        const span = Math.hypot(R.c[0] - L.c[0], R.c[2] - L.c[2]);
        const bL = [L.r, L.u, L.t], bR = [R.r, R.u, R.t], h = 6.5;
        addBox(out, vadd(L.c, L.u, h / 2), [3, h, 3], [0.55, 0.56, 0.58], bL);      // stair tower L
        addBox(out, vadd(R.c, R.u, h / 2), [3, h, 3], [0.55, 0.56, 0.58], bR);      // stair tower R
        const mid = vadd(vadd(L.c, L.u, h), L.r, span / 2);
        addBox(out, mid, [span, 0.5, 3.4], deckCol, bL);                           // deck
        for (const t of [1.6, -1.6])                                               // railings
          addBox(out, vadd(vadd(mid, L.u, 0.9), L.t, t), [span, 0.12, 0.12], [0.30, 0.30, 0.32], bL);
      }

      // Ardennes chalets tucked on the wooded hillsides around the lap.
      chalet(K(0.13), -1, 55, 8, 5, 12, [0.80, 0.78, 0.72], [0.34, 0.20, 0.16]);
      chalet(K(0.30),  1, 62, 7, 5, 11, [0.78, 0.76, 0.70], [0.32, 0.22, 0.18]);
      chalet(K(0.55), -1, 58, 8, 5, 12, [0.82, 0.80, 0.74], [0.30, 0.20, 0.16]);
      chalet(K(0.72),  1, 66, 7, 5, 10, [0.80, 0.77, 0.71], [0.34, 0.22, 0.16]);

      // Forest campsites on the Eau Rouge/Raidillon banking and Kemmel hillside.
      rvCamp(K(0.075), 1, 40, 8);
      rvCamp(K(0.10), -1, 46, 7);
      rvCamp(K(0.135), 1, 52, 8);
      rvCamp(K(0.48), -1, 48, 6);
      rvCamp(K(0.82),  1, 44, 6);

      // Historic timing tower behind the pit straight; spectator footbridges.
      timingTower(K(0.985), -1, 30);
      footbridge(0.125, [0.62, 0.34, 0.20]);   // Kemmel crossing
      footbridge(0.50,  [0.40, 0.42, 0.46]);   // mid-forest crossing

      // Deeper forest ranks for an even denser Ardennes wall in the mid sectors.
      forestEdge(0.18, 0.45, -1, 14, { density: 0.6, hMin: 12, hMax: 22, col: [0.09, 0.28, 0.13], col2: [0.14, 0.36, 0.17], pineFrac: 0.85 });
      forestEdge(0.55, 0.88,  1, 14, { density: 0.6, hMin: 12, hMax: 22, col: [0.09, 0.28, 0.13], col2: [0.14, 0.36, 0.17], pineFrac: 0.85 });
      // A few broadleaf oaks softening the pit-straight and Les Combes verges.
      for (const [s, side] of [[0.01, 1], [0.16, 1], [0.30, -1], [0.62, 1], [0.78, -1]]) {
        for (let j = 0; j < 3; j++) tree(K(s) + j, side, 18 + hash(K(s) * 5 + j) * 14, 10 + hash(K(s) * 9 + j) * 5, [0.13, 0.34, 0.16]);
      }

      // --- Barriers: catch fence at the packed stands, armco on the fast forest
      //     sweepers, tyre stacks at the heavy braking zones.
      fence(0.0, 0.03, 1, 6, 4.2, [0.74, 0.76, 0.80]);        // main straight stand
      fence(0.06, 0.10, 1, 7, 4.4, [0.74, 0.76, 0.80]);       // Raidillon stand
      fence(0.15, 0.18, 1, 7, 4.2, [0.74, 0.76, 0.80]);       // Les Combes
      fence(0.90, 0.94, 1, 6, 4.2, [0.74, 0.76, 0.80]);       // Bus Stop
      guardrail(0.42, 0.58, -1, 3.4, [0.84, 0.85, 0.88]);     // Pouhon sweep
      guardrail(0.80, 0.90,  1, 3.4, [0.84, 0.85, 0.88]);     // Blanchimont
      tyreWall(0.015, 0.03,  1, 4.4, [0.78, 0.12, 0.12]);     // La Source
      tyreWall(0.155, 0.175, 1, 4.6, [0.20, 0.36, 0.62]);     // Les Combes
      tyreWall(0.46, 0.49,  -1, 4.6, [0.55, 0.55, 0.52]);     // Pouhon
      tyreWall(0.905, 0.925, 1, 4.4, [0.78, 0.12, 0.12]);     // Bus Stop
    },
  }
  );
})();
