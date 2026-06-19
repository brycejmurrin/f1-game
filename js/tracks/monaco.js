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
      const { out, track, n, ds, px, py, pz, hw, groundYAt, addBox, addPrism, onTrack, hash, upOf, vadd, anchor, place, prop, building, palm, guardrail, wall } = api;
      const K = (s) => Math.round(s * n) % n;

      // Mediterranean pastel wall palette + galvanized armco.
      const CREAM = [0.92, 0.86, 0.72], TERRA = [0.80, 0.45, 0.32], OCHRE = [0.85, 0.70, 0.45];
      const PASTELS = [CREAM, TERRA, OCHRE, [0.88, 0.82, 0.78], [0.78, 0.74, 0.62]];
      const WIN = [0.30, 0.36, 0.40], ARMCO = [0.70, 0.72, 0.74];

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

      // ---- Casino Square (s=0.22, both close): plaza planters + palms ----
      for (let i = 0; i < 9; i++) {
        const k = K(0.205 + i * 0.0035);
        place(k, -1, 3, [3, 1.2, 4], [0.55, 0.55, 0.58]);              // grey planter box
        prop(k, -1, 3, [2, 0.5, 2], [0.25, 0.45, 0.22]);               // greenery in planter
        palm(k, i % 2 ? 1 : -1, 4, 9, [0.25, 0.45, 0.22]);            // square palms
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

      // ---- Harbour & yachts (s=0.65, L mid): deep-blue water + white deck boxes ----
      {
        const SEA = [0.10, 0.34, 0.55];
        for (let i = 0; i < 11; i++) {
          const k = K(0.595 + i * 0.0075), a = anchor(k, -1, 22 + (i % 4) * 9);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          const b = [a.r, a.u, a.t];
          // water plane just below grade
          addBox(out, vadd(a.c, a.u, -0.6), [40, 0.6, 30], SEA, b);
          // moored super-yacht: hull + stacked white decks + thin mast box
          const sc = 0.7 + hash(k * 9 + i) * 0.7;   // size jitter for a packed marina
          const yc = vadd(a.c, a.r, -8 + (i % 3) * 3);
          addBox(out, vadd(yc, a.u, 2), [7 * sc, 4, 22 * sc], [0.97, 0.97, 0.99], b);   // hull
          addBox(out, vadd(yc, a.u, 5.5), [5 * sc, 3, 12 * sc], [0.86, 0.88, 0.92], b); // superstructure
          addBox(out, vadd(yc, a.u, 8.5), [3 * sc, 2, 6 * sc], [0.70, 0.74, 0.82], b);  // top deck
          addBox(out, vadd(yc, a.u, 13), [0.4, 6, 0.4], [0.85, 0.85, 0.88], b); // mast
        }
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
    },
  }
  );
})();
