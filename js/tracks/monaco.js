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
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    segs: [
      { t: 0, l: 230 }, { t: 70, l: 75 }, { t: -25, l: 260, h: 14 }, { t: -70, l: 110 }, { t: 80, l: 80, w: 4.8 }, { t: 0, l: 90, h: -6 },
      { t: 80, l: 80, w: 4.8 }, { t: 160, l: 120, w: 4.5, h: -4 }, { t: 55, l: 80 }, { t: 45, l: 80 }, { t: -15, l: 260, h: -4 }, { t: 60, l: 70, w: 4.8 },
      { t: 0, l: 40 }, { t: -65, l: 60 }, { t: 65, l: 60 }, { t: -40, l: 100 }, { t: 70, l: 65, w: 4.8 }, { t: 0, l: 35 },
      { t: -70, l: 65 }, { t: 80, l: 70 }, { t: -70, l: 65 }, { t: 75, l: 70, w: 4.8 }, { t: 40, l: 120 },
    ],
    // Climb to Casino Square, then the plunge down through Mirabeau and the
    // tunnel toward the harbour (~42 m top-to-bottom). Street circuit: barriers,
    // not a wide terrain ribbon, so elevation was always safe here.
    elevations: [{ s: 0.27, halfM: 340, rise: 18 }, { s: 0.55, halfM: 220, rise: -10 }],
    scenery: function (api) {
      const { out, track, n, ds, px, py, pz, hw, pyMin, groundYAt, addBox, addPrism, addCyl, addCone, addFrustum, onTrack, hash, upOf, vadd, anchor, along, place, prop, building, tower, palm, tree, bush, hedge, grandstand, billboard, gantry, marshalPost, fence, guardrail, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // Mediterranean pastel wall palette + galvanized armco.
      const CREAM = [0.95, 0.90, 0.78], TERRA = [0.80, 0.45, 0.32], OCHRE = [0.85, 0.70, 0.45];
      const PASTELS = [CREAM, TERRA, OCHRE, [0.88, 0.82, 0.78], [0.78, 0.74, 0.62]];
      const WIN = [0.20, 0.30, 0.36], ARMCO = [0.70, 0.72, 0.74];
      // Lit window colour (emissive warm yellow — reads as glowing interior at dusk/night)
      const WINLIT = [0.95, 0.88, 0.55];
      // Street lamp cap colour (warm sodium glow)
      const LAMP = [1.0, 0.90, 0.60];

      // ---- Continuous Armco lining both sides — the "no margin" street feel ----
      wall(0.0, 1.0, -1, 0.4, 0.8, ARMCO, 0.22);   // left rail, full lap
      // right rail lines the inland climb (Casino/Fairmont) where there's no
      // harbour edge; the marina side reads off the quay walls + railing below.
      wall(0.0, 0.48, 1, 0.4, 0.8, ARMCO, 0.22);
      guardrail(0.02, 0.07, -1, 0.5, ARMCO);   // Sainte Devote accent

      // ---- CONTINUOUS HILLSIDE CITY (lap-long inland backdrop) ----------------
      // Monte Carlo is a packed urban mass climbing the rock behind the track.
      // Three tiers of pastel apartment blocks, stacked to sit in CLEAN TIERS
      // without interpenetrating. Key fix: each tier's inner face begins beyond
      // the previous tier's outer face — no tier can be inside another.
      //
      // For each i, the near building occupies: inner face at gap=dNear−w/2, outer
      // face at dNear+w/2. Mid tier must have its INNER face beyond near's OUTER
      // face, and far tier beyond mid's outer face. We enforce this by expressing
      // each tier's `gap` argument to building() as the outer edge of the previous
      // tier plus a clearance margin (≥2m to account for rounding + width jitter).
      //
      // Pick the inland side per node: the harbour sits on the LEFT through the
      // flat back half (s≈0.55→1.0), so the city climbs the RIGHT there; the
      // hillside climb (Casino/Beau Rivage, s≈0.0→0.45) is built up on BOTH
      // banks but leans LEFT (the rock face above Casino).
      const inland = (s) => (s > 0.55 && s < 0.98) ? 1 : -1;
      // Continuous low stone retaining base behind the inland rail — fills the
      // ground line so the city never floats above bare terrain. Cheap (one wall).
      wall(0.0, 0.55, -1, 5, 4, [0.62, 0.58, 0.50], 1.2);   // hillside base, climb
      wall(0.55, 0.98, 1, 5, 4, [0.62, 0.58, 0.50], 1.2);   // harbour-back base
      wall(0.0, 0.98, 1, 60, 5, [0.70, 0.66, 0.60], 1.4);   // far city plinth, R
      wall(0.55, 1.0, -1, 60, 5, [0.70, 0.66, 0.60], 1.4);  // far city plinth, L (back)

      // Three tiers of pastel blocks, packed shoulder-to-shoulder around the lap.
      // Each building gap= argument = outer face of the tier, so building() places
      // the box centre at gap+w/2 and inner face at gap. Tiers never overlap.
      for (let i = 0; i < 56; i++) {
        const s = (i / 56);
        const k = K(s);
        const side = inland(s);
        // skip the close-up signature zones so hand-placed landmarks stay clean
        const nearLandmark = (Math.abs(s - 0.20) < 0.02) || (Math.abs(s - 0.40) < 0.02) ||
                             (s > 0.52 && s < 0.60);   // Casino / Fairmont / tunnel
        const col = PASTELS[(i * 3 + (i & 1)) % PASTELS.length];
        const r = hash(k * 17 + i), r2 = hash(k * 31 + i * 5);

        // --- NEAR tier ---
        // Inner face starts at gNear (≥10m from edge for nearLandmark zones, ≥8m otherwise).
        const wNear = 14 + r2 * 10;      // 14–24m wide
        const hNear = 14 + r * 26;       // 14–40m tall
        const gNear = nearLandmark ? 28 : 8 + r * 5;   // gap to inner face
        // outer face of near tier (beyond road edge) — tiers above must start here
        const outerNear = gNear + wNear;
        building(k, side, gNear, wNear, hNear, 13, { wall: col, window: WIN, floor: 8 });

        // lit windows on near tier — warm band slightly above mid-height
        if (!nearLandmark) {
          const aN = anchor(k, side, gNear + wNear * 0.5);
          if (!onTrack(aN.c[0], aN.c[2], 4)) {
            addBox(out, vadd(aN.c, aN.u, hNear * 0.55), [wNear * 1.02, hNear * 0.12, 13.1],
                   WINLIT, [aN.r, aN.u, aN.t]);
          }
        }

        // --- MID tier: inner face at outerNear + 3m clearance ---
        if (i % 2 === 0) {
          const wMid = 16 + r * 10;
          const hMid = hNear + 10 + r2 * 14;
          const gMid = outerNear + 3;
          const outerMid = gMid + wMid;
          building(K(s + 0.006), side, gMid, wMid, hMid, 14,
                   { wall: PASTELS[(i + 2) % PASTELS.length], window: WIN, floor: 9 });

          // lit mid-tier windows
          if (!nearLandmark) {
            const aM = anchor(K(s + 0.006), side, gMid + wMid * 0.5);
            if (!onTrack(aM.c[0], aM.c[2], 4)) {
              addBox(out, vadd(aM.c, aM.u, hMid * 0.6), [wMid * 1.02, hMid * 0.10, 14.1],
                     WINLIT, [aM.r, aM.u, aM.t]);
            }
          }

          // --- FAR tier: inner face at outerMid + 4m clearance ---
          if (i % 4 === 0) {
            const wFar = 20 + r2 * 12;
            const hFar = hMid + 22 + r * 18;
            const gFar = outerMid + 4;
            building(K(s + 0.011), side, gFar, wFar, hFar, 15,
                     { wall: PASTELS[(i + 4) % PASTELS.length], window: WIN, floor: 10 });

            // lit far-tier windows — visible at night as glowing skyline
            const aF = anchor(K(s + 0.011), side, gFar + wFar * 0.5);
            if (!onTrack(aF.c[0], aF.c[2], 4)) {
              addBox(out, vadd(aF.c, aF.u, hFar * 0.55), [wFar * 1.02, hFar * 0.14, 15.1],
                     WINLIT, [aF.r, aF.u, aF.t]);
            }
          }
        }
      }

      // ---- Street lamp posts along the track (both sides, every ~40m) ----
      // Thin galvanised poles with a warm sodium-yellow cap disc — Monaco's
      // famous boulevard lighting. Placed just inside the armco so they are
      // always visible but never block the racing line.
      for (let i = 0; i < 36; i++) {
        const s = i / 36;
        const k = K(s);
        const side = (i % 2 === 0) ? 1 : -1;
        // skip tunnel interior (s=0.51→0.585) — lamp would be inside
        if (s > 0.50 && s < 0.60) continue;
        const aL = anchor(k, side, 1.8);
        if (onTrack(aL.c[0], aL.c[2], 1.2)) continue;
        const b = [aL.r, aL.u, aL.t];
        addCyl(out, aL.c, 0.09, 6.5, [0.68, 0.70, 0.72], 5, b);           // pole
        addCyl(out, vadd(aL.c, aL.u, 6.3), 0.65, 0.22, LAMP, 7, b);       // lamp cap disc
        // small light-pool patch on the ground below
        addBox(out, vadd(aL.c, aL.u, 0.1), [1.6, 0.06, 1.6],
               [0.92, 0.88, 0.72], b);
      }

      // ---- Pit wall & start grandstand (s=0.03, R close) ----
      wall(0.0, 0.06, 1, 1.5, 1.0, [0.66, 0.67, 0.69], 0.6);     // long low pit wall
      place(K(0.03), 1, 10, [7, 9, 40], [0.55, 0.56, 0.60]);     // start grandstand shell
      for (let i = 0; i < 5; i++) {                              // thin railing boxes
        const k = (K(0.02) + i * 2) % n;
        place(k, 1, 4, [0.4, 1.1, 5], [0.80, 0.80, 0.82]);
      }

      // ---- Sainte Devote chapel (s=0.05, R mid): cream box + dark pitched roof ----
      {
        const k = K(0.05), a = anchor(k, 1, 18);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          addBox(out, vadd(a.c, a.u, 4), [9, 8, 11], CREAM, [a.r, a.u, a.t]);
          addPrism(out, vadd(a.c, a.u, 9.2), [9.4, 3.2, 11.2], [0.32, 0.22, 0.20], [a.r, a.u, a.t]);
        }
      }

      // ---- Beau Rivage climb buildings (s≈0.08→0.16, both): tiered pastel blocks ----
      // Stacked blocks rising in tiers up the hillside. Each step-back tier has
      // its gap placed beyond the outer face of the tier below, so no interpenetration.
      for (let i = 0; i < 5; i++) {
        const s = 0.08 + i * 0.018;
        const k = K(s);
        const side = i % 2 === 0 ? -1 : 1;
        const col = PASTELS[(i + 1) % PASTELS.length];
        const hA = 20 + hash(k * 13 + i) * 20;
        const wA = 18 + hash(k * 7) * 8;
        const gA = 22 + (i % 3) * 8;           // inner face gap, stepped back from kerb
        building(k, side, gA, wA, hA, 16, { wall: col, window: WIN, floor: 7 });

        // lit windows on Beau Rivage blocks
        const aB = anchor(k, side, gA + wA * 0.5);
        if (!onTrack(aB.c[0], aB.c[2], 4)) {
          addBox(out, vadd(aB.c, aB.u, hA * 0.55), [wA * 1.02, hA * 0.11, 16.1],
                 WINLIT, [aB.r, aB.u, aB.t]);
        }

        // upper tier — inner face starts at outer face of lower tier + 4m
        if (i % 2 === 0) {
          const k2 = K(s + 0.008);
          const wU = 15;
          const hU = hA + 10;
          const gU = gA + wA + 4;              // beyond outer face of lower tier
          building(k2, side, gU, wU, hU, 14, { wall: PASTELS[i % PASTELS.length], window: WIN, floor: 7 });
        }
      }

      // ---- Casino de Monte-Carlo (s=0.20, L close): ornate cream + green roof ----
      {
        const k = K(0.20), a = anchor(k, -1, 22);
        if (!onTrack(a.c[0], a.c[2], 26)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 13), [44, 26, 30], CREAM, b);            // main mass
          addBox(out, vadd(a.c, a.u, 28), [46, 4, 32], [0.30, 0.45, 0.38], b); // green-tinted roof
          // ornate twin cupola towers
          for (const o of [-13, 13]) {
            addBox(out, vadd(vadd(a.c, a.t, o), a.u, 30), [9, 18, 9], [0.90, 0.85, 0.74], b);
            addPrism(out, vadd(vadd(a.c, a.t, o), a.u, 40.5), [9.2, 5, 9.2], [0.28, 0.42, 0.36], b);
          }
          // window bands across the facade
          for (let f = 0; f < 4; f++) addBox(out, vadd(a.c, a.u, 5 + f * 6), [44.4, 2.2, 30.4], WIN, b);
          // Casino lit windows (warm evening glow across all four floors)
          for (let f = 0; f < 4; f++) {
            addBox(out, vadd(a.c, a.u, 6.0 + f * 6), [44.6, 1.1, 30.6], WINLIT, b);
          }
          // Lamp posts flanking the Casino entrance — two ornate poles
          for (const o of [-8, 8]) {
            const lc = vadd(vadd(a.c, a.t, o), a.u, 0);
            addCyl(out, lc, 0.10, 5.5, [0.72, 0.74, 0.76], 5, b);
            addCyl(out, vadd(lc, a.u, 5.3), 0.55, 0.18, LAMP, 6, b);
          }
        }
      }

      // ---- Casino Square (s=0.22, both close): plaza planters + palms + gardens --
      for (let i = 0; i < 10; i++) {
        const k = K(0.20 + i * 0.0035);
        place(k, -1, 3, [3, 1.2, 4], [0.55, 0.55, 0.58]);              // grey planter box
        prop(k, -1, 3, [2, 0.5, 2], [0.25, 0.45, 0.22]);               // greenery in planter
        palm(k, i % 2 ? 1 : -1, 4, 9, [0.25, 0.45, 0.22]);            // square palms
      }
      // Casino gardens — formal hedges + a central fountain on the L set back
      hedge(0.195, 0.235, -1, 7, 1.6, [0.22, 0.42, 0.20]);
      {
        const k = K(0.215), a = anchor(k, -1, 14);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          addCyl(out, vadd(a.c, a.u, 0.5), 3.0, 1.0, [0.70, 0.72, 0.76], 10, b);   // fountain basin
          addCyl(out, vadd(a.c, a.u, 1.6), 0.5, 2.2, [0.78, 0.80, 0.84], 8, b);    // fountain plume column
          addCyl(out, vadd(a.c, a.u, 3.4), 1.2, 0.4, [0.85, 0.90, 0.96], 8, b);    // upper dish
        }
        // ring of clipped topiary balls around the garden
        for (let j = 0; j < 6; j++) bush(K(0.198 + j * 0.007), -1, 9 + (j % 2) * 3, [0.24, 0.44, 0.22]);
      }

      // ---- Fairmont hairpin hotel (s=0.40, R close): tall pale block wrapping bend ----
      {
        const k = K(0.40);
        building(k, 1, 4, 20, 48, 30, { wall: [0.90, 0.88, 0.82], window: WIN, floor: 6, setback: true });
        building(K(0.385), 1, 5, 22, 40, 18, { wall: CREAM, window: WIN, floor: 6 });
        building(K(0.415), 1, 5, 22, 42, 18, { wall: [0.88, 0.84, 0.76], window: WIN, floor: 6 });
        // Lit hotel windows
        const aH = anchor(K(0.40), 1, 14);
        if (!onTrack(aH.c[0], aH.c[2], 6)) {
          addBox(out, vadd(aH.c, aH.u, 28), [20.2, 5.0, 30.2], WINLIT, [aH.r, aH.u, aH.t]);
          addBox(out, vadd(aH.c, aH.u, 14), [20.2, 4.0, 30.2], WINLIT, [aH.r, aH.u, aH.t]);
        }
      }

      // ---- Tunnel (s=0.55, both): dark enclosing roof + side walls ----
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
          addBox(out, vadd([px[k], py[k], pz[k]], u, 6.4), [cw, 1.2, ds * step * 1.05], DARK, [r, u, t]); // roof
          for (const sd of [-1, 1]) {                                            // side walls
            const o = sd * (hw[k] + 1.5);
            addBox(out, vadd([px[k] + r[0] * o, py[k], pz[k] + r[2] * o], u, 3.2), [1.4, 6.4, ds * step * 1.05], [0.30, 0.29, 0.33], [r, u, t]);
          }
          // strip lighting inside the tunnel — a pale warm strip along the roof
          if (i % (step * 2) === 0) {
            addBox(out, vadd([px[k], py[k], pz[k]], u, 6.0), [cw * 0.6, 0.2, ds * step * 0.6],
                   [0.94, 0.92, 0.80], [r, u, t]);
          }
        }
        for (const frac of [0.51, 0.585]) {                                      // portals
          const k = K(frac);
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          addBox(out, vadd([px[k], py[k], pz[k]], u, 3.8), [hw[k] * 2 + 7, 7.6, 1.8], [0.32, 0.31, 0.36], [r, u, t]);
        }
      }

      // ---- Harbour & yachts (s≈0.58→0.98, L): big sea plane + a packed marina ----
      const SEA = [0.10, 0.34, 0.55], SEA2 = [0.13, 0.40, 0.60];

      // moored super-yacht builder at world point yc (basis b), facing along t
      const yacht = (yc, b, u, r, t, sc, hullCol) => {
        const HULL = hullCol || [0.97, 0.97, 0.99];
        const L = 22 * sc, W = 7 * sc;
        addBox(out, vadd(yc, u, 1.6 * sc), [W, 3.0 * sc, L], HULL, b);                 // hull
        addBox(out, vadd(yc, u, 0.4 * sc), [W * 0.82, 1.2 * sc, L * 0.96], [0.20, 0.30, 0.40], b); // waterline shadow
        // bow taper (small prism nose) + stern step
        addBox(out, vadd(vadd(yc, t, L * 0.46), u, 1.8 * sc), [W * 0.6, 2.0 * sc, L * 0.16], HULL, b);
        // superstructure decks, set slightly aft
        const sup = vadd(yc, t, -L * 0.06);
        addBox(out, vadd(sup, u, 4.2 * sc), [W * 0.78, 2.6 * sc, L * 0.55], [0.90, 0.91, 0.94], b); // main deck cabin
        addBox(out, vadd(sup, u, 5.8 * sc), [W * 0.74, 1.0 * sc, L * 0.58], [0.40, 0.55, 0.70], b); // tinted window band
        addBox(out, vadd(sup, u, 6.8 * sc), [W * 0.6, 2.2 * sc, L * 0.40], [0.94, 0.95, 0.97], b);  // upper deck
        addBox(out, vadd(sup, u, 9.0 * sc), [W * 0.42, 1.8 * sc, L * 0.26], [0.84, 0.86, 0.90], b); // sun deck / bridge
        // radar arch + mast
        addBox(out, vadd(sup, u, 11.6 * sc), [W * 0.5, 0.5 * sc, 0.6 * sc], [0.80, 0.82, 0.86], b);
        addCyl(out, vadd(sup, u, 12 * sc), 0.18 * sc, 5 * sc, [0.85, 0.85, 0.88], 4, b); // mast
        // a couple of stanchions / handrails on the foredeck
        addBox(out, vadd(vadd(yc, t, L * 0.30), u, 3.4 * sc), [W * 0.7, 0.7 * sc, 0.3 * sc], [0.85, 0.86, 0.9], b);
        // lit cabin windows at night (warm glow through porthole band)
        addBox(out, vadd(sup, u, 5.9 * sc), [W * 0.75, 0.5 * sc, L * 0.59], WINLIT, b);
      };

      // big water plane (single slab spanning the back-half harbour)
      for (let i = 0; i < 6; i++) {
        const k = K(0.60 + i * 0.062), a = anchor(k, -1, 70);
        const b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, -1.2), [150, 0.8, 120], i % 2 ? SEA2 : SEA, b);
      }
      // continuous low stone quay wall between street and water
      wall(0.585, 0.99, -1, 1.0, 1.4, [0.74, 0.70, 0.62], 1.0);

      // packed marina rows — two ranks of yachts at increasing distance
      for (let i = 0; i < 16; i++) {
        const s = 0.59 + i * 0.0245;
        const k = K(s);
        const rank = i % 3;                         // 0 near, 1 mid, 2 far
        const dist = 16 + rank * 16 + hash(k * 7) * 4;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 12)) continue;
        const b = [a.r, a.u, a.t];
        const sc = 0.7 + hash(k * 9 + i) * 0.9;     // size jitter
        const hull = (i % 5 === 0) ? [0.18, 0.20, 0.26] : (i % 7 === 0) ? [0.85, 0.86, 0.9] : [0.97, 0.97, 0.99];
        yacht(vadd(a.c, a.r, -2 + (i % 3) * 4), b, a.u, a.r, a.t, sc, hull);
        // a small tender / motorboat tucked beside the big yachts
        if (i % 3 === 0) {
          const tc = vadd(vadd(a.c, a.r, -14), a.t, 8);
          addBox(out, vadd(tc, a.u, 0.9), [3.2, 1.2, 8], [0.92, 0.5, 0.3], b);
          addBox(out, vadd(tc, a.u, 1.8), [2.0, 0.8, 3.2], [0.95, 0.95, 0.97], b);
        }
      }
      // a distant cluster of yacht masts far out for harbour depth
      for (let i = 0; i < 10; i++) {
        const k = K(0.62 + i * 0.03), a = anchor(k, -1, 95 + hash(k) * 25);
        addCyl(out, vadd(a.c, a.u, 5), 0.25, 12 + hash(k * 3) * 6, [0.86, 0.86, 0.9], 4, [a.r, a.u, a.t]);
      }
      // breakwater / harbour wall arm in the far distance
      for (let i = 0; i < 5; i++) {
        const k = K(0.66 + i * 0.02), a = anchor(k, -1, 120);
        addBox(out, vadd(a.c, a.u, 0.5), [30, 2.4, 8], [0.66, 0.62, 0.56], [a.r, a.u, a.t]);
      }

      // Harbour-side lamp posts along the quay (every ~30m)
      for (let i = 0; i < 14; i++) {
        const s = 0.585 + i * 0.029;
        const k = K(s);
        const aQ = anchor(k, -1, 2.4);
        if (onTrack(aQ.c[0], aQ.c[2], 1.2)) continue;
        const bQ = [aQ.r, aQ.u, aQ.t];
        addCyl(out, aQ.c, 0.09, 5.8, [0.70, 0.72, 0.74], 5, bQ);
        addCyl(out, vadd(aQ.c, aQ.u, 5.6), 0.55, 0.20, LAMP, 7, bQ);
        addBox(out, vadd(aQ.c, aQ.u, 0.1), [1.4, 0.06, 1.4], [0.90, 0.86, 0.68], bQ);
      }

      // ---- Tabac waterfront buildings (s=0.75, R mid): pastel block row ----
      for (let i = 0; i < 3; i++) {
        const k = K(0.71 + i * 0.033);
        building(k, 1, 9, 18, 24 + hash(k * 5) * 12, 14, { wall: PASTELS[i % PASTELS.length], window: WIN, floor: 6 });
        // lit windows on Tabac block
        const hT = 24 + hash(k * 5) * 12;
        const aT = anchor(k, 1, 9 + 9);    // gap + w/2
        if (!onTrack(aT.c[0], aT.c[2], 4)) {
          addBox(out, vadd(aT.c, aT.u, hT * 0.55), [18.2, hT * 0.10, 14.1],
                 WINLIT, [aT.r, aT.u, aT.t]);
        }
      }

      // ---- Swimming Pool section (s=0.80, L close): turquoise rect + white edge ----
      {
        const k = K(0.80), a = anchor(k, -1, 8);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          const b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 0.3), [14, 0.5, 22], [0.20, 0.60, 0.65], b);  // pool water
          // white pool-edge boxes
          for (const o of [-7.4, 7.4]) addBox(out, vadd(vadd(a.c, a.r, o), a.u, 0.6), [1.4, 0.7, 23], [0.94, 0.94, 0.96], b);
          for (const o of [-11.4, 11.4]) addBox(out, vadd(vadd(a.c, a.t, o), a.u, 0.6), [16, 0.7, 1.4], [0.94, 0.94, 0.96], b);
          // poolside parasols (pole + canopy) and a diving platform
          for (let j = 0; j < 4; j++) {
            const pc = vadd(vadd(a.c, a.r, -5 + (j % 2) * 10), a.t, -8 + j * 5);
            addCyl(out, vadd(pc, a.u, 1.3), 0.08, 2.6, [0.8, 0.8, 0.82], 4, b);
            addCone(out, vadd(pc, a.u, 3.0), 1.8, 0.8, j % 2 ? [0.9, 0.4, 0.35] : [0.95, 0.95, 0.97], 7, b);
          }
          addBox(out, vadd(vadd(a.c, a.r, 7.4), a.u, 2.2), [1.4, 0.4, 4], [0.85, 0.86, 0.88], b);
        }
      }

      // ---- Rascasse / paddock buildings (s=0.90, R close): low cream sheds + rail ----
      for (let i = 0; i < 4; i++) {
        const k = K(0.87 + i * 0.02);
        place(k, 1, 14, [12, 7, 16], CREAM);          // low cream shed
        place(k, 1, 14, [12.3, 1.5, 16.3], TERRA);    // terracotta cap band
      }
      guardrail(0.88, 0.95, 1, 1.0, ARMCO);          // marina railing

      // ---- Promenade date-palms along the harbour railing (back half) ----
      for (let i = 0; i < 12; i++) {
        const k = K(0.59 + i * 0.029);
        palm(k, -1, 5, 8 + hash(k * 3) * 3, [0.25, 0.45, 0.22]);
      }
      // ---- Inland street palms climbing the front half (Beau Rivage/Mirabeau) -
      for (let i = 0; i < 10; i++) {
        const k = K(0.06 + i * 0.045);
        palm(k, -1, 6, 7 + hash(k * 5) * 4, [0.24, 0.44, 0.21]);
      }
      // ---- Waterfront balcony/terrace bands on the Tabac block row ----------
      for (let i = 0; i < 5; i++) {
        const k = K(0.71 + i * 0.02);
        place(k, 1, 18, [20, 0.8, 1.2], [0.88, 0.86, 0.80]);   // terrace lip
      }

      // ====================================================================
      // TRACK FURNITURE — grandstands, billboards, gantry, fences, marshals
      // ====================================================================

      // Start/finish overhead gantry + a scoring gantry exiting Casino
      gantry(0.0, 7.0, [0.20, 0.22, 0.26]);
      gantry(0.235, 6.4, [0.22, 0.24, 0.28]);

      // Harbour-front grandstands (back half, on the water side, well clear of tarmac)
      grandstand(0.64, -1, 8, 60, [0.55, 0.56, 0.60], [0.85, 0.30, 0.28]);
      grandstand(0.78, -1, 8, 48, [0.54, 0.55, 0.58], [0.30, 0.45, 0.80]);
      // Casino-square grandstand on the inland side
      grandstand(0.25, 1, 7, 40, [0.56, 0.57, 0.60], [0.90, 0.80, 0.30]);
      // tribune at Tabac
      grandstand(0.72, 1, 9, 36, [0.55, 0.55, 0.58], [0.85, 0.85, 0.88]);

      // Billboards / advertising hoardings at key braking zones
      for (const [s, sd] of [[0.07, 1], [0.18, -1], [0.33, 1], [0.62, -1], [0.74, 1], [0.84, -1], [0.93, 1]]) {
        const col = [[0.85, 0.20, 0.20], [0.10, 0.30, 0.70], [0.95, 0.80, 0.10], [0.10, 0.55, 0.45]][K(s) % 4];
        billboard(K(s), sd, 2.5, 7, 3.2, col);
      }

      // Catch / debris fences along the fast harbour straights (water side)
      fence(0.66, 0.71, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);
      fence(0.82, 0.87, -1, 2.0, 3.2, [0.78, 0.80, 0.82]);

      // Marshal posts around the lap (orange-roofed huts + flag poles)
      for (const [s, sd] of [[0.04, 1], [0.13, -1], [0.30, 1], [0.42, -1], [0.50, 1], [0.62, -1], [0.79, 1], [0.91, -1]]) {
        marshalPost(K(s), sd, 1.8);
      }

      // Extra guardrail accents at the famous tight corners
      guardrail(0.29, 0.34, 1, 0.5, ARMCO);    // Mirabeau
      guardrail(0.38, 0.43, 1, 0.5, ARMCO);    // Fairmont hairpin
      guardrail(0.78, 0.84, -1, 0.5, ARMCO);   // Swimming pool

      // Roadside street palms along the harbour promenade (extra density)
      for (let i = 0; i < 8; i++) {
        const k = K(0.60 + i * 0.038);
        palm(k, -1, 6.5, 7 + hash(k * 11) * 3, [0.24, 0.45, 0.21]);
      }

      // ---- Distinctive hillside high-rises behind the city (skyline crest) ----
      // Taller tapered towers set far back on the inland side — Monte-Carlo tower
      // district. Placed at dist≥90m so they sit clearly behind the city tiers.
      for (const [s, side, h] of [[0.12, -1, 70], [0.20, -1, 60], [0.34, -1, 64], [0.74, 1, 66], [0.88, 1, 58]]) {
        const k = K(s), a = anchor(k, side, 70 + hash(k) * 20);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          tower(k, side, 70 + hash(k) * 20, 16 + hash(k * 3) * 6, h, { col: PASTELS[K(s) % PASTELS.length], cap: true, capCol: [0.55, 0.58, 0.56], mast: 6 });
          // lit tower windows — wide emissive band across upper floors
          const bW = 16 + hash(k * 3) * 6;
          const aT2 = anchor(k, side, 70 + hash(k) * 20);
          addBox(out, vadd(aT2.c, aT2.u, h * 0.60), [bW * 1.2, h * 0.15, bW * 1.2],
                 WINLIT, [aT2.r, aT2.u, aT2.t]);
        }
      }

      // ====================================================================
      // REFINED MONACO-SPECIFIC ACCENTS & ENHANCEMENTS
      // ====================================================================

      // PRINCE'S PALACE / ROCK OF MONACO — iconic cream fortress rising 60m+
      // Positioned well inland (110m) above Casino Square. The INNER face of
      // each palace wing sits beyond the previous box, so no interpenetration.
      {
        const k = K(0.17), a = anchor(k, -1, 110);
        if (!onTrack(a.c[0], a.c[2], 20)) {
          const b = [a.r, a.u, a.t];
          // Central tower — tall cream frustum
          addFrustum(out, vadd(a.c, a.u, 32), 28, 20, 56, CREAM, 10, b);
          // Flanking rampart walls — sit beside the tower, not inside it
          addBox(out, vadd(vadd(a.c, a.r, -20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          addBox(out, vadd(vadd(a.c, a.r, 20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          // Corner bastions — set at ±24m lateral (outside rampart outer faces)
          for (const sd of [-1, 1]) {
            addCyl(out, vadd(vadd(a.c, a.r, sd * 24), a.u, 52), 3.2, 16, [0.72, 0.70, 0.66], 7, b);
          }
          // Palace courtyard plaza — light stone base
          addBox(out, vadd(a.c, a.u, 4), [44, 1.6, 48], [0.86, 0.85, 0.82], b);
          // Palace lit windows across the main mass
          addBox(out, vadd(a.c, a.u, 22), [44.4, 5.0, 30.4], WINLIT, b);
        }
      }

      // PALACE ROCK GARDEN — terraced gardens below the palace structure.
      // Each terrace level is at a different dist so the wall boxes do not overlap
      // the palace or each other. Dist stepped by 12m intervals.
      for (let i = 0; i < 3; i++) {
        const k = K(0.18 + i * 0.015);
        // The terrace sits at dist = 52+i*12, far clear of the palace at dist=110.
        const distT = 52 + i * 12;
        const a = anchor(k, -1, distT);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          // Terraced garden retaining wall
          addBox(out, vadd(a.c, a.u, 2.4), [18 + i * 4, 3.6 + i * 0.6, 10], [0.86, 0.82, 0.74], b);
          // Succulent/cactus plantings — anchored at ground (vadd ...a.u, 0) so no float
          for (let j = 0; j < 3; j++) {
            const pc = vadd(vadd(a.c, a.r, (j - 1) * 5), a.u, 0);
            addCone(out, vadd(pc, a.u, 4 + i * 0.5), 0.55, 1.6, [0.50, 0.62, 0.38], 4, b);
          }
        }
      }

      // HARBOUR ENHANCEMENT — curated yacht detail with multi-rank mooring layout
      for (let i = 0; i < 12; i++) {
        const s = 0.62 + i * 0.0205;
        const k = K(s);
        const rank = i % 3;
        const dist = 18 + rank * 20 + hash(k * 7) * 6;
        const a = anchor(k, -1, dist);
        if (onTrack(a.c[0], a.c[2], 14)) continue;

        const b = [a.r, a.u, a.t];
        const sc = 0.72 + hash(k * 11 + i) * 0.8;

        if (rank === 0) {
          // Near yachts — full detail visibility
          const hull = (i % 4 === 0) ? [0.20, 0.22, 0.28] : [0.97, 0.97, 0.99];
          yacht(vadd(a.c, a.r, -4 + (i % 3) * 5), b, a.u, a.r, a.t, sc, hull);
          if (i % 2 === 0) {
            const tc = vadd(vadd(a.c, a.r, -16), a.t, 5);
            addBox(out, vadd(tc, a.u, 0.8), [3.6, 1.2, 7], [0.94, 0.52, 0.26], b);
            addBox(out, vadd(tc, a.u, 1.6), [2.1, 0.8, 2.8], [0.96, 0.96, 0.98], b);
          }
        } else if (rank === 1) {
          // Mid-rank superstructure silhouettes
          addBox(out, vadd(a.c, a.u, 4), [6 * sc, 5 * sc, 18 * sc], [0.92, 0.93, 0.96], b);
          addCyl(out, vadd(a.c, a.u, 10.5 * sc), 0.25 * sc, 6 * sc, [0.88, 0.88, 0.92], 4, b);
        } else {
          // Far masts
          addCyl(out, vadd(a.c, a.u, 5), 0.2, 12 + hash(k * 5) * 5, [0.89, 0.89, 0.93], 3, b);
        }
      }

      // HARBOUR BREAKWATER — stone arm in distance for port infrastructure
      for (let i = 0; i < 6; i++) {
        const k = K(0.66 + i * 0.032), a = anchor(k, -1, 125);
        addBox(out, vadd(a.c, a.u, 0.5), [30, 2.6, 7], [0.70, 0.66, 0.58], [a.r, a.u, a.t]);
      }

      // DOCK MOORING BOLLARDS — corrected height: 1.2m (not 20m!)
      // These are quayside bollards, each capped with a mooring ring.
      {
        const BOLLARD = [0.74, 0.72, 0.70];
        const RING = [0.68, 0.65, 0.60];
        for (let i = 0; i < 8; i++) {
          const k = K(0.61 + i * 0.012);
          const a = anchor(k, -1, 6 + (i % 2) * 1.5);
          if (!onTrack(a.c[0], a.c[2], 2.8)) {
            addCyl(out, vadd(a.c, a.u, 0), 0.28, 1.2, BOLLARD, 6, [a.r, a.u, a.t]);
            if (i % 2 === 0) {
              addCyl(out, vadd(a.c, a.u, 0.9), 0.35, 0.24, RING, 7, [a.r, a.u, a.t]);
            }
          }
        }
      }

      // CYPRESS ACCENT TREES — tall columnar dark-green silhouettes.
      // Placed at safe distances: dist≥10m, no secondary cypress that overlaps
      // the near building tier. The second (offset) cypress is removed to avoid
      // it floating into building geometry.
      {
        const CYPRESS = [0.16, 0.32, 0.14];
        for (const [sf, cnt] of [[0.20, 2], [0.80, 3]]) {
          for (let j = 0; j < cnt; j++) {
            const k = K(sf + j * 0.012);
            const side = (j & 1) ? -1 : 1;
            // dist=10 places the cypress just outside the road edge furniture but
            // well inside the near building tier (which starts at ~8–13m gap, so
            // buildings don't appear until dist=16+ for a 14m wide building).
            // The cylinder radius (1.1m) is narrow enough not to interpenetrate.
            const dist = 10 + (j & 1) * 3;
            const a = anchor(k, side, dist);
            if (!onTrack(a.c[0], a.c[2], 2.8)) {
              // anchor base to ground height — no floating
              addCyl(out, vadd(a.c, a.u, 0), 1.1, 17, CYPRESS, 5, [a.r, a.u, a.t]);
            }
          }
        }
      }

      // EXTRA GUARDRAIL ACCENTS — emphasize tight corners (armco detail)
      guardrail(0.15, 0.19, -1, 0.4, ARMCO);   // Beau Rivage approach
      guardrail(0.62, 0.68, -1, 0.4, ARMCO);   // Tunnel exit to harbour
    },
  }
  );
})();
