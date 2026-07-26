/* Apex 26 — MONACO circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monaco",
    name: "MONACO",
    gp: "Monaco GP",
    country: "Monaco",
    night: false,
    theme: "street_day",
    lengthKm: 3.3,
    baseHW: 5,
    street: true,
    terrainOuter: 28,
    sceneryCoordinates: "source",
    dressingExclusions: [
      // Keep generic city furniture out of the tunnel and the Casino sightline.
      { kinds: ["city", "foliage", "lamps", "floodlights"], s0: 0.50, s1: 0.60 },
      { kind: "city", s0: 0.17, s1: 0.24 },
      // Exclusions are always racing-space, even though bespoke scenery is source-space.
      // The harbour occupies the right side of the racing lap from Portier to Rascasse.
      { kinds: ["city", "foliage", "lamps"], s0: 0.29, s1: 0.70, side: 1 },
    ],
    // The bundled GPS trace (js/circuits.js) runs counter-clockwise; real Monaco
    // is driven CLOCKWISE. `reverse` flips the lap direction in the engine
    // (centreline + minimap + scenery/barrier s-coordinates) so the car drives
    // the correct way without re-digitising the trace or re-authoring scenery.
    reverse: true,
    // Rotate the start/finish line onto the main pit/harbour straight so the lap
    // begins on the straight with the first corner at its end (fraction of the
    // original trace; tuned against the reversed layout).
    startFrac: 0.28,
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    // NOTE: Monaco's geometry comes from the real GPS trace in js/circuits.js
    // (CircuitPaths.monaco); these segs are only a fallback if that trace is
    // absent. Editing them has no effect while the trace is present.
    segs: [
      { t: 0, l: 230 }, { t: -70, l: 75 }, { t: 25, l: 260, h: 14 }, { t: 70, l: 110 }, { t: -80, l: 80, w: 4.8 }, { t: 0, l: 90, h: -6 },
      { t: -80, l: 80, w: 4.8 }, { t: -160, l: 120, w: 4.5, h: -4 }, { t: -55, l: 80 }, { t: -45, l: 80 }, { t: 15, l: 260, h: -4 }, { t: -60, l: 70, w: 4.8 },
      { t: 0, l: 40 }, { t: 65, l: 60 }, { t: -65, l: 60 }, { t: 40, l: 100 }, { t: -70, l: 65, w: 4.8 }, { t: 0, l: 35 },
      { t: 70, l: 65 }, { t: -80, l: 70 }, { t: 70, l: 65 }, { t: -75, l: 70, w: 4.8 }, { t: -40, l: 120 },
    ],
    // Climb to Casino Square, then the plunge down through Mirabeau and the
    // tunnel toward the harbour (~42 m top-to-bottom). Street circuit: barriers,
    // not a wide terrain ribbon, so elevation was always safe here.
    elevations: [{ s: 0.10, halfM: 340, rise: 30 }, { s: 0.55, halfM: 220, rise: -10 }],
    scenery: function (api) {
      const { out, MAT, def, track, n, ds, px, py, pz, hw, pyMin, groundYAt, addBox, addPrism, addCyl, addCone, addFrustum, addPyramid, modelGroup, overheadSpan, waterSurface, waterField, groundedSegments, onTrack, hash, upOf, vadd, anchor, along, place, prop, building, tower, palm, tree, bush, hedge, grandstand, billboard, gantry, marshalPost, fence, guardrail, wall, cityFront, backdrop } = api;
      const K = (s) => Math.round(s * n) % n;
      const KR = (s) => TrackSpace.sourceNodeToRacing(def, K(s), n);
      const racingSide = (side) => def.reverse ? -side : side;

      // ── Colour palette ────────────────────────────────────────────────────
      // Mediterranean pastels: cream, terracotta, ochre, dusty rose, stone
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
      wall(0.0, 1.0, -1, 1.2, 0.8, ARMCO, 0.22);
      wall(0.0, 1.0, 1, 1.2, 0.8, ARMCO, 0.22);
      guardrail(0.02, 0.07, -1, 0.5, ARMCO);

      // ── SECTOR 1 — START / SAINTE DEVOTE CLIMB (s=0.00→0.08) ───────────
      // Left: stone buildings. Right: pit lane terrace + grandstand.
      // cityFront disabled: Monaco's tight parallel streets (20-30m apart) cause
      // buildings on one section to wrap around and intrude on nearby track even
      // with minimal depth=5m. Tested depth 5-18m, all intrude.
      // cityFront(0.00, 0.07, -1, 11, {
      //   minH: 14, maxH: 24, depth: 5, step: 12,
      //   palette: [CREAM, DUSTY, STONE, OCHRE],
      //   lit: true, windowCol: WINLIT,
      // });
      // cityFront(0.00, 0.07,  1, 11, {
      //   minH: 12, maxH: 22, depth: 5, step: 14,
      //   palette: [STONE, CREAM, DUSTY],
      //   lit: true, windowCol: WINLIT,
      // });

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

      // ── SECTOR 2 — BEAU RIVAGE HILLSIDE CLIMB (s=0.08→0.26) ─────────────
      // The hillside soars steeply on the LEFT (inland rock face). RIGHT side is
      // close apartment facades. Dense cityFront stays DISABLED (intrusions).
      // Top-3 #1: sparse close pastel canyon — 8–12 cream/ochre boxes, gap 2–4 m,
      // depth ≤12. L skips the Casino mass at s≈0.20; Tabac inland is Top-3 #3.
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
            { wall: CANYON[i % CANYON.length], window: WIN, floor: 3.5 + hv,
              lit: true, windowCol: WINLIT });
        }
      }
      // Rocky/green hillside above the buildings — backdrop() with green renders
      // as organic rounded mounds, not boxy slabs.
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

      // ── CASINO DE MONTE-CARLO (s=0.20, L) ───────────────────────────────
      {
        const k = K(0.20), a = anchor(k, -1, 36);   // dist clears the 44-wide mass off the track (inner face ~14m back)
        if (!onTrack(a.c[0], a.c[2], 26)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 13), [44, 26, 30], CREAM, b);
          addBox(out, vadd(a.c, a.u, 28), [46, 4, 32], [0.30, 0.45, 0.38], b);
          for (const o of [-13, 13]) {
            addBox(out, vadd(vadd(a.c, a.t, o), a.u, 30), [9, 18, 9], [0.90, 0.85, 0.74], b);
            addPrism(out, vadd(vadd(a.c, a.t, o), a.u, 40.5), [9.2, 5, 9.2], [0.28, 0.42, 0.36], b);
          }
          // window bands + lit evening glow
          for (let f = 0; f < 4; f++) {
            addBox(out, vadd(a.c, a.u, 5 + f * 6), [44.4, 2.2, 30.4], WIN, b);
            addBox(out, vadd(a.c, a.u, 6.0 + f * 6), [44.6, 1.1, 30.6], WINLIT, b);
          }
          for (const o of [-8, 8]) {
            const lc = vadd(vadd(a.c, a.t, o), a.u, 0);
            addCyl(out, lc, 0.10, 5.5, [0.72, 0.74, 0.76], 5, b);
            addCyl(out, vadd(lc, a.u, 5.3), 0.55, 0.18, LAMP, 6, b);
          }
        }
      }

      // ── HÔTEL DE PARIS — Casino Square twin (s≈0.21, R, opposite Casino) ──
      // Top-3 #2: TV silhouette is Casino + this cream hotel mass, not Casino alone.
      {
        const k = K(0.21);
        const HOTEL = [0.92, 0.88, 0.82];
        building(k, 1, 3.5, 22, 40, 18,
          { wall: HOTEL, window: WIN, floor: 5, lit: true, windowCol: WINLIT, setback: true });
        // Ochre mansard / cornice strip + secondary wing toward the square
        const a = anchor(k, 1, 3.5 + 11);
        if (!onTrack(a.c[0], a.c[2], 12)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 41), [23, 3.2, 19], OCHRE, b);
          addBox(out, vadd(vadd(a.c, a.t, 14), a.u, 14), [14, 28, 12], HOTEL, b);
          for (let f = 0; f < 5; f++) {
            addBox(out, vadd(vadd(a.c, a.t, 14), a.u, 4 + f * 5), [14.3, 1.6, 12.3], WIN, b);
          }
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

      // ── SECTOR 3 — CASINO / MIRABEAU DESCENT (s=0.26→0.42) ─────────────
      // cityFront disabled: intrusions persist even at depth=5m.
      // cityFront(0.26, 0.42, -1, 12, {
      //   minH: 16, maxH: 32, depth: 5, step: 12,
      //   palette: [CREAM, DUSTY, OCHRE, TERRA, STONE],
      //   lit: true, windowCol: WINLIT,
      // });
      // cityFront(0.26, 0.42,  1, 12, {
      //   minH: 14, maxH: 28, depth: 5, step: 14,
      //   palette: [STONE, OCHRE, CREAM, DUSTY],
      //   lit: true, windowCol: WINLIT,
      // });
      // Rocky scrub above the Mirabeau buildings — green/grey hillside backdrop.
      for (let i = 0; i < 4; i++) {
        const k = K(0.29 + i * 0.035);
        const hv = hash(k * 4.1 + 3);
        backdrop(k, -1, 46 + hv * 18, [65 + hv * 30, 20 + hv * 14, 50],
                 [0.22 + hv * 0.04, 0.40 + hv * 0.05, 0.24]);
      }

      // ── PRINCE'S PALACE / ROCK OF MONACO ────────────────────────────────
      // Iconic cream fortress at s≈0.17, inland dist=110m. Inner face of each
      // wing sits beyond the previous box so no interpenetration.
      {
        const k = K(0.17), a = anchor(k, -1, 110);
        if (!onTrack(a.c[0], a.c[2], 20)) {
          const b = [a.r, a.u, a.t];
          addFrustum(out, vadd(a.c, a.u, 32), 28, 20, 56, CREAM, 10, b);
          // Flanking ramparts (set beside tower, not inside it)
          addBox(out, vadd(vadd(a.c, a.r, -20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          addBox(out, vadd(vadd(a.c, a.r, 20),  a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          // Corner bastions at ±24m (outside rampart outer face of ±20+5=±25m)
          for (const sd of [-1, 1]) {
            addCyl(out, vadd(vadd(a.c, a.r, sd * 28), a.u, 52), 3.2, 16, [0.72, 0.70, 0.66], 7, b);
          }
          addBox(out, vadd(a.c, a.u, 4), [44, 1.6, 48], [0.86, 0.85, 0.82], b);
          // lit palace windows
          addBox(out, vadd(a.c, a.u, 22), [44.4, 5.0, 30.4], WINLIT, b);
        }
      }

      // Palace rock terraced gardens — dist stepped by 14m, well clear of palace
      for (let i = 0; i < 3; i++) {
        const k = K(0.18 + i * 0.015);
        const distT = 52 + i * 14;
        const a = anchor(k, -1, distT);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 2.4), [18 + i * 4, 3.6 + i * 0.6, 10], [0.86, 0.82, 0.74], b);
          for (let j = 0; j < 3; j++) {
            const pc = vadd(vadd(a.c, a.r, (j - 1) * 5), a.u, 0);
            addCone(out, vadd(pc, a.u, 4 + i * 0.5), 0.55, 1.6, [0.50, 0.62, 0.38], 4, b);
          }
        }
      }

      // ── FAIRMONT HAIRPIN HOTEL (s=0.40, R) ──────────────────────────────
      {
        const k = K(0.40);
        building(k, 1, 4, 20, 48, 30,
          { wall: [0.90, 0.88, 0.82], window: WIN, floor: 6, lit: true, windowCol: WINLIT, setback: true });
        building(K(0.385), 1, 5, 22, 40, 18,
          { wall: CREAM, window: WIN, floor: 6, lit: true, windowCol: WINLIT });
        building(K(0.415), 1, 5, 22, 42, 18,
          { wall: [0.88, 0.84, 0.76], window: WIN, floor: 6, lit: true, windowCol: WINLIT });
      }

      // ── SECTOR 4 — TUNNEL (s=0.51→0.585) ───────────────────────────────
      {
        const tunS = K(0.51), tunE = K(0.585);
        const tunLen = ((tunE - tunS) + n) % n;
        const step = Math.max(2, Math.round(8.0 / ds));
        const DARK = [0.26, 0.25, 0.30];
        for (let i = 0; i < tunLen; i += step) {
          const k = (tunS + i) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const cw = hw[k] * 2 + 5;
          overheadSpan({
            id: `monaco-tunnel-roof-${k}`, frac: k / n, clearance: 5.8,
            thickness: 1.2, depth: ds * step * 1.05, span: cw,
            color: DARK, supports: false, required: true,
          });
          for (const sd of [-1, 1]) {
            const o = sd * (hw[k] + 1.5);
            addBox(out, vadd([px[k] + r[0] * o, py[k], pz[k] + r[2] * o], u, 3.2), [1.4, 6.4, ds * step * 1.05], [0.30, 0.29, 0.33], [r, u, t]);
          }
          if (i % (step * 2) === 0) {
            addBox(out, vadd([px[k], py[k], pz[k]], u, 6.0), [cw * 0.6, 0.2, ds * step * 0.6],
                   [0.94, 0.92, 0.80], [r, u, t]);
          }
        }
        for (const frac of [0.51, 0.585]) {
          const k = K(frac);
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          overheadSpan({
            id: `monaco-tunnel-portal-${k}`, frac: k / n, clearance: 6.2,
            thickness: 1.4, depth: 1.8, span: hw[k] * 2 + 7,
            color: [0.32, 0.31, 0.36], supports: false, required: true,
          });
        }
      }

      // ── SECTOR 5 — HARBOUR FRONT (s=0.585→0.98) ─────────────────────────
      // LEFT = harbour/sea. RIGHT = continuous inland apartment facades.
      // Coherent pastel cityFront on the RIGHT (inland side).
      // cityFront disabled: intrusions persist even at depth=5m.
      // cityFront(0.585, 0.98, 1, 12, {
      //   minH: 16, maxH: 32, depth: 5, step: 14,
      //   palette: [CREAM, DUSTY, OCHRE, TERRA, STONE, SAGE],
      //   lit: true, windowCol: WINLIT,
      // });
      // Distant landmark towers behind harbour apartments.
      for (let i = 0; i < 5; i++) {
        const k = K(0.61 + i * 0.076);
        const hv = hash(k * 2.9 + i);
        const h = 40 + hv * 30;
        backdrop(k, 1, 48 + hv * 20, [22 + hv * 12, h, 18], PASTELS[(i * 3) % PASTELS.length]);
      }

      // ── HARBOUR WATER & QUAY ─────────────────────────────────────────────
      const SEA = [0.10, 0.34, 0.55], SEA2 = [0.13, 0.40, 0.60];
      // Low stone quay wall between track and water
      wall(0.585, 0.99, -1, 1.0, 1.4, [0.74, 0.70, 0.62], 1.0);

      // ── YACHT BUILDER ─────────────────────────────────────────────────────
      const yacht = (yc, b, u, r, t, sc, hullCol) => {
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
        addBox(out, vadd(sup, u, 11.6 * sc), [W * 0.5, 0.5 * sc, 0.6 * sc], [0.80, 0.82, 0.86], b);
        addCyl(out, vadd(sup, u, 12 * sc), 0.18 * sc, 5 * sc, [0.85, 0.85, 0.88], 4, b);
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
      // Far mast cluster + breakwater
      for (let i = 0; i < 6; i++) {
        const k = K(0.62 + i * 0.05), a = anchor(k, -1, 90 + hash(k) * 22);
        addCyl(out, vadd(a.c, a.u, 5), 0.25, 12 + hash(k * 3) * 6, [0.86, 0.86, 0.9], 4, [a.r, a.u, a.t]);
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

      // ── TABAC / SWIMMING POOL SECTION (s=0.71→0.84) ─────────────────────
      // Top-3 #3 (+ #1 Tabac inland): pastel façade row facing the marina (R).
      // Dense cityFront stays DISABLED — cream/terracotta slabs via pastelStreetRow.
      {
        pastelStreetRow(0.72, 0.82, 1, 3, {
          palette: [CREAM, TERRA, OCHRE, DUSTY],
          minH: 12, maxH: 20, depth: 9, step: 55,
          window: WIN, windowCol: WINLIT, lit: true,
        });
      }
      // Swimming pool (L / harbour side — keep clear of inland façades)
      {
        const k = K(0.80), a = anchor(k, -1, 8);
        if (!onTrack(a.c[0], a.c[2], 10)) {
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
      groundedSegments({
        id: "monaco-tabac-terrace",
        points: Array.from({ length: 6 }, (_, i) => ({
          k: KR(0.71 + i * 0.02), side: racingSide(1), dist: 18,
        })),
        width: 0.8, height: 0.8, color: [0.88, 0.86, 0.80],
      });

      // ── RASCASSE / PADDOCK (s=0.87→0.95, R) ─────────────────────────────
      // Low paddock hospitality buildings — proper massing, not flat boxes.
      cityFront(0.87, 0.95, 1, 9, {
        minH: 10, maxH: 16, depth: 7, step: 18,
        palette: [CREAM, STONE, DUSTY, OCHRE],
        lit: true, windowCol: WINLIT,
      });
      guardrail(0.88, 0.95, 1, 1.0, ARMCO);

      // ── SECTOR 6 — RETURN / ANTONY NOGHES (s=0.95→1.00) ─────────────────
      // cityFront disabled: intrusions persist even at depth=5m.
      // cityFront(0.95, 1.00, -1, 9, {
      //   minH: 14, maxH: 26, depth: 5, step: 12,
      //   palette: [CREAM, DUSTY, STONE],
      //   lit: true, windowCol: WINLIT,
      // });
      // cityFront(0.95, 1.00, 1, 9, {
      //   minH: 12, maxH: 22, depth: 5, step: 14,
      //   palette: [STONE, CREAM, OCHRE],
      //   lit: true, windowCol: WINLIT,
      // });

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
      place(K(0.03), 1, 12, [7, 9, 35], [0.55, 0.56, 0.60]);
      for (let i = 0; i < 5; i++) {
        const k = (K(0.02) + i * 2) % n;
        place(k, 1, 4, [0.4, 1.1, 5], [0.80, 0.80, 0.82]);
      }

      // ── PALMS ─────────────────────────────────────────────────────────────
      // Promenade palms along harbour railing
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

      // ── CYPRESS ACCENT TREES ──────────────────────────────────────────────
      {
        const CYPRESS = [0.16, 0.32, 0.14];
        for (const [sf, cnt] of [[0.20, 2], [0.80, 3]]) {
          for (let j = 0; j < cnt; j++) {
            const k = K(sf + j * 0.012);
            const side = (j & 1) ? -1 : 1;
            const dist = 10 + (j & 1) * 3;
            const a = anchor(k, side, dist);
            if (!onTrack(a.c[0], a.c[2], 2.8)) {
              addCyl(out, vadd(a.c, a.u, 0), 1.1, 17, CYPRESS, 5, [a.r, a.u, a.t]);
            }
          }
        }
      }

      // ── HILLSIDE SKYLINE TOWERS (far back, dist ≥ 65m) ───────────────────
      // These read as the high-rise Monaco residential towers above the city.
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

      grandstand(0.64, -1, 9, 60, [0.55, 0.56, 0.60], [0.85, 0.30, 0.28]);
      grandstand(0.78, -1, 9, 48, [0.54, 0.55, 0.58], [0.30, 0.45, 0.80]);
      grandstand(0.25,  1, 7, 40, [0.56, 0.57, 0.60], [0.90, 0.80, 0.30]);
      grandstand(0.72,  1, 9, 36, [0.55, 0.55, 0.58], [0.85, 0.85, 0.88]);

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

      // ═══════════════════════════════════════════════════════════════════
      // BESPOKE HARBOUR & LANDMARK MODELS
      // ═══════════════════════════════════════════════════════════════════

      // ── Reflective Mediterranean harbour (groundPlane water:true) ─────────
      // A true reflective water buffer that mirrors the sky, laid across the
      // whole harbour basin behind the promenade. Sits below the quay lip.
      // Three longitudinal stations × eight outward ranks form a bounded tiled
      // basin. Individual 46×48 m panels cannot chord across Monaco's foldbacks.
      const harbourStations = [0.365, 0.545, 0.59]; // racing fractions
      // Rasterised as a fine grid rather than 46x48 m slabs. The slab version
      // needed 27 m of road clearance per panel, so the basin came out as
      // separated blue rectangles on bare ground — and the 138 m band between
      // ranks 114 and 252, where the lap folds back through the water, was
      // rejected outright at every station (verified: re-adding those ranks
      // fails the build three times over). At 12 m cells the same region closes
      // up to the kerb and only the road corridor itself stays open.
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

      // ── FLAGSHIP SUPERYACHT — bespoke multi-deck megayacht ───────────────
      // Hull prism bow + stacked white superstructure decks + wrap-around
      // railings + radar arch + mast + helipad disc + tender on the aft deck.
      const megaYacht = (a, sc, hullCol) => {
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
        // Radar arch (two legs + crossbar) above the bridge deck
        out._mat = MAT.METAL;
        for (const o of [-W * 0.28, W * 0.28]) {
          addCyl(out, vadd(vadd(sup, a.r, o), a.u, 13.4 * sc), 0.16 * sc, 2.4 * sc, [0.85, 0.86, 0.90], 5, b);
        }
        addBox(out, vadd(sup, a.u, 14.6 * sc), [W * 0.62, 0.4 * sc, 0.6 * sc], [0.85, 0.86, 0.90], b);
        // Mast + navigation lights
        addCyl(out, vadd(sup, a.u, 14.8 * sc), 0.14 * sc, 5.5 * sc, [0.86, 0.86, 0.90], 4, b);
        out._mat = 0;
        addBox(out, vadd(sup, a.u, 20.0 * sc), [0.5 * sc, 0.5 * sc, 0.5 * sc], [0.95, 0.30, 0.25], b);
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

      // ── MONACO TUNNEL PORTAL — ornate stone arch mouth ──────────────────
      // A decorative arched portal facade at the harbour-side tunnel exit,
      // built from a keystone arch of stepped stone voussoir boxes over the
      // road, faced with cream ashlar piers.
      {
        const k = K(0.585);
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const t = [track.tx[k], track.ty[k], track.tz[k]];
        const u = upOf(track, k);
        const base = [px[k], py[k], pz[k]];
        const b = [r, u, t];
        const span = hw[k] * 2 + 6;
        out._mat = MAT.STONE;
        // Twin ashlar piers flanking the mouth
        for (const sd of [-1, 1]) {
          const pc = vadd(base, r, sd * (hw[k] + 2.6));
          addBox(out, vadd(pc, u, 4.4), [2.4, 8.8, 3.0], CREAM, b);
          addBox(out, vadd(pc, u, 9.0), [3.0, 0.8, 3.4], STONE, b);   // cornice cap
        }
        // Typed overhead crown: explicit clearance keeps the portal intentional.
        overheadSpan({
          id: "monaco-ornate-portal-crown", frac: k / n, clearance: 8.0,
          thickness: 2.8, depth: 3.2, span: span * 0.92,
          color: DUSTY, supports: false, required: true,
        });
        overheadSpan({
          id: "monaco-ornate-portal-rock", frac: k / n, clearance: 11.0,
          thickness: 5.0, depth: 4.0, span: span * 1.1,
          color: [0.34, 0.40, 0.30], supports: false, required: true,
        });
        out._mat = 0;
      }

      // ── TIERED PASTEL HILLSIDE TERRACES (Beau Rivage climb, L) ───────────
      // Stepped apartment terraces that rise and set back up the rock face —
      // the signature Monte-Carlo tiered-hillside silhouette above the road.
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

      // ── DEEP-WATER MARINA PONTOONS + SAILBOATS (s=0.63→0.79, L) ─────────
      // Finger piers and a far rank of masts make the harbour read as a basin,
      // rather than a single row of yachts beside the circuit.
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

      // ── BELLE ÉPOQUE CASINO-HOTEL WINGS (s=0.18→0.24) ───────────────────
      // Secondary cream masses frame Casino Square and stop the hero buildings
      // from reading as isolated towers.
      for (const [sf, side, gap, w, h, d, col] of [
        [0.182,  1, 7, 18, 31, 16, [0.94, 0.90, 0.83]],
        [0.238,  1, 6, 20, 34, 17, [0.88, 0.82, 0.72]],
        [0.226, -1, 9, 16, 27, 14, [0.93, 0.88, 0.78]],
      ]) {
        building(K(sf), side, gap, w, h, d, {
          wall: col, window: WIN, floor: 4.6, lit: true,
          windowCol: WINLIT, setback: true,
        });
      }

      // ── PACKED MIRABEAU HILLSIDE APARTMENTS (s=0.28→0.38, L) ────────────
      // Narrow vertical slabs climb behind the descent, with repeated balcony
      // lips facing the circuit. Each complete block is footprint-preflighted.
      for (let i = 0; i < 4; i++) {
        const k = K(0.285 + i * 0.029);
        const a = anchor(k, -1, 35 + (i & 1) * 9);
        const b = [a.r, a.u, a.t];
        const h = 29 + hash(k * 6.3) * 12;
        const w = 14 + hash(k * 2.1) * 4;
        modelGroup(`monaco-mirabeau-balconies-${i}`, {
          center: vadd(a.c, a.u, h * 0.5), size: [w + 2, h + 2, 13], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, h * 0.5), [w, h, 11], PASTELS[(i + 2) % PASTELS.length], b);
          for (let floor = 1; floor * 4.3 < h - 1; floor++) {
            const fc = vadd(vadd(a.c, a.t, -5.8), a.u, floor * 4.3);
            addBox(stage, fc, [w + 1.2, 0.35, 1.5], [0.84, 0.82, 0.78], b);
            addBox(stage, vadd(fc, a.u, 1.0), [w + 0.8, 0.18, 0.25], [0.48, 0.52, 0.54], b);
          }
        });
      }

      // ── TUNNEL HILLSIDE CONTEXT + VENT PAVILIONS (s=0.51/0.585) ─────────
      // Hotel/rock masses sit beyond both portals while compact ventilation
      // pavilions crown the tunnel shoulders, preserving the road opening.
      for (const [sf, side] of [[0.515, -1], [0.575, 1]]) {
        const k = K(sf);
        building(k, side, 12, 22, 28, 24, {
          wall: [0.82, 0.80, 0.75], window: WIN, floor: 4.5,
          lit: true, windowCol: WINLIT, setback: true,
        });
        const a = anchor(k, side, 31);
        const b = [a.r, a.u, a.t];
        modelGroup(`monaco-tunnel-vent-${side < 0 ? "entry" : "exit"}`, {
          center: vadd(a.c, a.u, 6), size: [11, 12, 11], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 3.4), [10, 6.8, 10], STONE, b);
          addFrustum(stage, vadd(a.c, a.u, 8.2), 4.2, 3.2, 3.0, [0.46, 0.48, 0.46], 8, b);
          addBox(stage, vadd(a.c, a.u, 10.2), [4.8, 1.0, 4.8], [0.34, 0.36, 0.36], b);
        });
      }

      // ── HARBOUR-FACING BALCONY WALL (s=0.66→0.82, R) ────────────────────
      // A sparse set of broad apartment fronts gives the Tabac/pool cameras a
      // packed Monaco backdrop while retaining gaps at corner sightlines.
      for (let i = 0; i < 4; i++) {
        const k = K(0.66 + i * 0.052);
        const a = anchor(k, 1, 25 + (i & 1) * 7);
        const b = [a.r, a.u, a.t];
        const h = 22 + hash(k * 8.2) * 8;
        modelGroup(`monaco-harbour-balcony-wall-${i}`, {
          center: vadd(a.c, a.u, h * 0.5), size: [24, h + 2, 12], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, h * 0.5), [22, h, 10], PASTELS[(i * 2 + 1) % PASTELS.length], b);
          for (let floor = 1; floor * 4.2 < h - 1; floor++) {
            const fc = vadd(vadd(a.c, a.t, -5.3), a.u, floor * 4.2);
            addBox(stage, fc, [23, 0.32, 1.2], CREAM, b);
            for (const x of [-8, -4, 0, 4, 8]) {
              addCyl(stage, vadd(vadd(fc, a.r, x), a.u, 0.45), 0.05, 0.9, [0.50, 0.52, 0.54], 3, b);
            }
          }
        });
      }
    },
  }
  );
})();
