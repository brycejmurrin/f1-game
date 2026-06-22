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

      // ---- Continuous Armco lining both sides — the "no margin" street feel ----
      // Engine already supplies street barriers; add a galvanized rail accent.
      // A low continuous wall reads as the lap-long armco line at a fraction of
      // the per-post vertex cost; short guardrail accents punch up key corners.
      wall(0.0, 1.0, -1, 0.4, 0.8, ARMCO, 0.22);   // left rail, full lap
      // right rail lines the inland climb (Casino/Fairmont) where there's no
      // harbour edge; the marina side reads off the quay walls + railing below.
      wall(0.0, 0.48, 1, 0.4, 0.8, ARMCO, 0.22);
      guardrail(0.02, 0.07, -1, 0.5, ARMCO);   // Sainte Devote accent

      // ---- CONTINUOUS HILLSIDE CITY (lap-long inland backdrop) ----------------
      // Monte Carlo is a packed urban mass climbing the rock behind the track.
      // To read as a CONTINUOUS city (not scattered towers) we wrap the whole lap
      // with three stacked bands of building masses on the inland side, plus a
      // continuous low "city base" wall so no empty ground shows between blocks.
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
      // Spaced every ~1.6% of the lap so facades read as a solid urban wall.
      for (let i = 0; i < 56; i++) {
        const s = (i / 56);
        const k = K(s);
        const side = inland(s);
        // skip the close-up signature zones so hand-placed landmarks stay clean
        const nearLandmark = (Math.abs(s - 0.20) < 0.02) || (Math.abs(s - 0.40) < 0.02) ||
                             (s > 0.52 && s < 0.60);   // Casino / Fairmont / tunnel
        const col = PASTELS[(i * 3 + (i & 1)) % PASTELS.length];
        const r = hash(k * 17 + i), r2 = hash(k * 31 + i * 5);
        // near tier — right up behind the barrier line, varied heights
        const dNear = nearLandmark ? 30 : 11 + r * 6;
        const wNear = 16 + r2 * 12;
        const hNear = 16 + r * 30;
        if (!onTrack(anchor(k, side, dNear).c[0], anchor(k, side, dNear).c[2], 6))
          building(k, side, dNear - wNear / 2, wNear, hNear, 14, { wall: col, window: WIN, floor: 8 });
        // mid tier — set back, taller, climbing the hill
        if (i % 2 === 0) {
          const dm = dNear + 20 + r2 * 10;
          building(K(s + 0.006), side, dm - (18 + r * 10) / 2, 18 + r * 10, hNear + 12 + r2 * 16, 15,
                   { wall: PASTELS[(i + 2) % PASTELS.length], window: WIN, floor: 9 });
        }
        // far tier — distant tall slabs forming the skyline crest
        if (i % 4 === 0) {
          const df = dNear + 44 + r * 16;
          building(K(s + 0.011), side, df - (22 + r2 * 12) / 2, 22 + r2 * 12, hNear + 26 + r * 20, 16,
                   { wall: PASTELS[(i + 4) % PASTELS.length], window: WIN, floor: 10 });
        }
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
      // Stacked blocks rising in tiers up the hillside, pushed well back.
      // Spaced wider + taller floor bands to keep the tiered hillside read at low cost.
      for (let i = 0; i < 5; i++) {
        const s = 0.08 + i * 0.018;
        const k = K(s);
        const side = i % 2 === 0 ? -1 : 1;
        const col = PASTELS[(i + 1) % PASTELS.length];
        const h = 22 + hash(k * 13 + i) * 22;
        const dist = 26 + (i % 3) * 9;          // tiered back from the kerb
        building(k, side, dist - (20 + hash(k * 7) * 8) / 2, 20 + hash(k * 7) * 8, h, 16, { wall: col, window: WIN, floor: 7 });
        // an upper tier set further back to read as terraces climbing the rock
        if (i % 2 === 0) {
          const k2 = K(s + 0.008);
          building(k2, side, dist + 14, 16, h + 10, 14, { wall: PASTELS[i % PASTELS.length], window: WIN, floor: 7 });
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
      // The signature Monaco visual: a wide deep-blue Mediterranean plane on the
      // harbour (LEFT) side of the back half, crowded with super-yachts of varied
      // sizes (hull + stacked decks + radar arch + masts), plus a couple of small
      // tenders. A continuous quay edge separates the street from the water.
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
      };

      // big water plane (single slab spanning the back-half harbour) — settled
      // just below grade so the street/quay reads above it.
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

      // ---- Tabac waterfront buildings (s=0.75, R mid): pastel block row ----
      for (let i = 0; i < 3; i++) {
        const k = K(0.71 + i * 0.033);
        building(k, 1, 9, 18, 24 + hash(k * 5) * 12, 14, { wall: PASTELS[i % PASTELS.length], window: WIN, floor: 6 });
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
      // A few taller tapered towers set far back on the inland side to break the
      // even building line and read as the Monte-Carlo tower district.
      for (const [s, side, h] of [[0.12, -1, 70], [0.20, -1, 60], [0.34, -1, 64], [0.74, 1, 66], [0.88, 1, 58]]) {
        const k = K(s), a = anchor(k, side, 70 + hash(k) * 20);
        if (!onTrack(a.c[0], a.c[2], 10)) {
          tower(k, side, 70 + hash(k) * 20, 16 + hash(k * 3) * 6, h, { col: PASTELS[K(s) % PASTELS.length], cap: true, capCol: [0.55, 0.58, 0.56], mast: 6 });
        }
      }

      // ====================================================================
      // REFINED MONACO-SPECIFIC ACCENTS & ENHANCEMENTS
      // ====================================================================

      // PRINCE'S PALACE / ROCK OF MONACO — the iconic cream fortress rising 60m+
      // Positioned well inland (110m) above Casino Square, reads as the principality's
      // white landmark. Main tapered tower + flanking rampart walls + corner bastions.
      {
        const k = K(0.17), a = anchor(k, -1, 110);
        if (!onTrack(a.c[0], a.c[2], 20)) {
          const b = [a.r, a.u, a.t];
          // Central tower — tall cream frustum (palace rises to ~60m)
          addFrustum(out, vadd(a.c, a.u, 32), 28, 20, 56, CREAM, 10, b);
          // Flanking rampart walls — fortress wing structures
          addBox(out, vadd(vadd(a.c, a.r, -20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          addBox(out, vadd(vadd(a.c, a.r, 20), a.u, 24), [10, 44, 42], [0.92, 0.88, 0.82], b);
          // Corner bastions — dark stone defensive towers
          for (const sd of [-1, 1]) {
            addCyl(out, vadd(vadd(a.c, a.r, sd * 24), a.u, 52), 3.2, 16, [0.72, 0.70, 0.66], 7, b);
          }
          // Palace courtyard plaza — light stone base
          addBox(out, vadd(a.c, a.u, 4), [44, 1.6, 48], [0.86, 0.85, 0.82], b);
        }
      }

      // PALACE ROCK GARDEN — terraced gardens below the palace structure
      // Creates the sense of tiered Mediterranean architecture cascading down.
      for (let i = 0; i < 3; i++) {
        const k = K(0.18 + i * 0.015);
        const a = anchor(k, -1, 50 + i * 12);
        if (!onTrack(a.c[0], a.c[2], 8)) {
          const b = [a.r, a.u, a.t];
          // Terraced garden retaining wall
          addBox(out, vadd(a.c, a.u, 2 + i * 1.5), [20 + i * 6, 4 + i * 0.8, 10], [0.86, 0.82, 0.74], b);
          // Succulent/cactus plantings
          for (let j = 0; j < 4; j++) {
            addCone(out, vadd(vadd(a.c, a.r, (j - 1.5) * 5), a.u, 4 + i), 0.6, 1.8, [0.50, 0.62, 0.38], 4, b);
          }
        }
      }

      // HARBOUR ENHANCEMENT — curated yacht detail with multi-rank mooring layout
      // Refines the existing yacht loop (s≈0.59–0.88) with visually distinct ranks
      for (let i = 0; i < 12; i++) {
        const s = 0.62 + i * 0.0205;
        const k = K(s);
        const rank = i % 3;  // 0=near visible boats, 1=mid superstructure, 2=far masts
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

      // DOCK MOORING BOLLARDS — functional waterfront detail
      // Sparse placement (8 posts) for realism without clutter
      {
        const BOLLARD = [0.74, 0.72, 0.70];
        const RING = [0.68, 0.65, 0.60];
        for (let i = 0; i < 8; i++) {
          const k = K(0.61 + i * 0.012);
          const a = anchor(k, -1, 6 + (i % 2) * 1.5);
          if (!onTrack(a.c[0], a.c[2], 2.8)) {
            addCyl(out, vadd(a.c, a.u, 0), 0.58, 20, BOLLARD, 6, [a.r, a.u, a.t]);
            if (i % 2 === 0) {
              addCyl(out, vadd(a.c, a.u, 15), 0.65, 0.35, RING, 7, [a.r, a.u, a.t]);
            }
          }
        }
      }

      // CYPRESS ACCENT TREES — tall columnar dark-green silhouettes for Mediterranean flair
      // Strategic placement at vista points: Casino approach & pool section
      {
        const CYPRESS = [0.16, 0.32, 0.14];
        for (const [sf, cnt] of [[0.20, 2], [0.80, 3]]) {
          for (let j = 0; j < cnt; j++) {
            const k = K(sf + j * 0.012);
            const side = (j & 1) ? -1 : 1;
            const dist = 9 + (j & 1) * 4;
            const a = anchor(k, side, dist);
            if (!onTrack(a.c[0], a.c[2], 2.8)) {
              addCyl(out, vadd(a.c, a.u, 0), 1.1, 17, CYPRESS, 5, [a.r, a.u, a.t]);
              if (j % 2 === 0) {
                const a2 = anchor(k, side, dist + 5);
                if (!onTrack(a2.c[0], a2.c[2], 2.4)) {
                  addCyl(out, vadd(a2.c, a2.u, 0), 0.9, 13, [0.20, 0.38, 0.18], 4, [a2.r, a2.u, a2.t]);
                }
              }
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
