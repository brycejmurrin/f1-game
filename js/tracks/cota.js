/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    pal: { zenith: [0.24, 0.5, 0.84], horizon: [0.76, 0.7, 0.54], grass: [0.34, 0.4, 0.14], runoff: [0.6, 0.35, 0.2], ambientSky: [0.52, 0.58, 0.68], ambientGround: [0.28, 0.28, 0.24], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1, 0.9, 0.7], sunColor: [1, 0.88, 0.68] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Turn 1: the calendar's most famous climb — ~30 m up in a few hundred metres.
    elevations: [{ s: 0.06, halfM: 320, rise: 12 }],
    scenery: function (api) {
      const { out, n, px, pz, hw, pyMin, place, prop, backdrop, groundYAt, addBox, addPrism, addCyl, addCone, addFrustum, addPyramid, every, along, onTrack, anchor, vadd, hash, tower, grandstand, building, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, tree, bush, pine, mountain } = api;
      const K = (s) => Math.round(s * n) % n;

      // -- Palette (Texas Hill Country, DAY) --
      const dryGrass = [0.55, 0.62, 0.30];
      const scrub = [0.38, 0.50, 0.28];
      const oak = [0.30, 0.42, 0.20];
      const cedar = [0.26, 0.36, 0.22];
      const redSoil = [0.62, 0.34, 0.24];
      const redSteel = [0.86, 0.20, 0.16];
      const white = [0.92, 0.92, 0.94];
      const concrete = [0.80, 0.80, 0.82];
      const darkSteel = [0.32, 0.34, 0.40];
      const glass = [0.40, 0.56, 0.66];
      const cotaBlue = [0.16, 0.30, 0.52];
      const tyreBlack = [0.12, 0.12, 0.14];

      // ---- Main grandstand on the start/finish straight (s≈0.00, R) ----
      grandstand(0.00, 1, 8, 150, [0.34, 0.35, 0.40], [0.5, 0.5, 0.54]);
      // Opposite paddock-side stand on the main straight (s≈0.00, L)
      grandstand(0.985, -1, 16, 90, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Final-corner stepped stand leading onto the main straight (s≈0.95, R)
      grandstand(0.95, 1, 9, 80, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-1 hill stand catching the climb (s≈0.11, L)
      grandstand(0.11, -1, 18, 60, [0.38, 0.39, 0.44], [0.52, 0.5, 0.5]);
      // Esses outside stand (s≈0.20, L)
      grandstand(0.20, -1, 16, 56, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Back-straight grandstand (s≈0.46, L)
      grandstand(0.46, -1, 12, 70, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Second back-straight stand further along (s≈0.54, L)
      grandstand(0.54, -1, 14, 60, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-12 hairpin braking-zone stand (s≈0.63, R)
      grandstand(0.625, 1, 14, 70, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Triple-apex sweeper stand (s≈0.83, R)
      grandstand(0.83, 1, 16, 64, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Extra deep main-straight upper tier behind the front stand (s≈0.00, R far)
      grandstand(0.02, 1, 30, 130, [0.30, 0.31, 0.36], [0.48, 0.48, 0.52]);
      // T1 amphitheatre — two extra raked banks climbing the famous hairpin hill (L)
      grandstand(0.09, -1, 30, 70, [0.40, 0.41, 0.46], [0.52, 0.5, 0.5]);
      grandstand(0.13, -1, 26, 64, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Esses-exit second-row stand (s≈0.24, R)
      grandstand(0.24, 1, 18, 54, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);

      // ---- Pit/paddock building cluster (s≈0.00–0.05, L) ----
      // long low pit garage block flanking the main straight
      building(K(0.97), -1, 12, 24, 8, 120, { wall: [0.84, 0.84, 0.86], window: glass, floor: 2, roof: [0.55, 0.56, 0.60] });
      // paddock hospitality / team motorhomes behind the pits
      building(K(0.99), -1, 40, 30, 11, 60, { wall: [0.88, 0.88, 0.90], window: glass, floor: 3, roof: [0.5, 0.52, 0.56] });
      building(K(0.04), -1, 38, 26, 9, 44, { wall: [0.80, 0.80, 0.83], window: glass, floor: 2 });
      // race-control / media tower at pit exit (s≈0.05, L)
      building(K(0.05), -1, 16, 16, 18, 22, { wall: cotaBlue, window: glass, floor: 5, roof: darkSteel });
      // pit-lane low boundary wall along the straight (inside, R)
      wall(0.92, 0.10, 1, 3, 1.0, [0.90, 0.90, 0.92], 0.5);

      // ---- 76 m Observation Tower — the hero at Turn 1 (s≈0.085, L far) ----
      // Real COTA tower: tapered concrete shaft + cantilevered ring deck + red mast.
      const kt = K(0.085);
      const at = anchor(kt, -1, 78), tb = [at.r, at.u, at.t];
      const tBase = at.c;
      // tapered concrete shaft, built in stacked frustum bands for the silhouette
      addFrustum(out, vadd(tBase, at.u, 0), 6.5, 5.2, 30, [0.86, 0.86, 0.89], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 30), 5.2, 4.2, 30, [0.84, 0.84, 0.88], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 60), 4.2, 3.4, 24, [0.82, 0.82, 0.86], 8, tb);
      // cantilevered viewing-deck ring near the top
      addCyl(out, vadd(tBase, at.u, 80), 9, 5, [0.62, 0.64, 0.70], 10, tb);
      addCyl(out, vadd(tBase, at.u, 81.5), 9.6, 1.6, glass, 10, tb);   // glass band
      // lit cap + crown
      addCone(out, vadd(tBase, at.u, 85), 6, 6, [0.55, 0.57, 0.62], 10, tb);
      addCyl(out, vadd(tBase, at.u, 91), 0.5, 10, redSteel, 6, tb);    // red mast
      addBox(out, vadd(tBase, at.u, 100), [1.4, 1.4, 1.4], [1.0, 0.85, 0.4], tb); // lit beacon
      // small white support facility at the tower base
      prop(kt, -1, 70, [12, 7, 14], [0.86, 0.86, 0.88]);
      prop(kt, -1, 88, [10, 5, 10], [0.80, 0.80, 0.83]);

      // ---- Uphill Turn 1: red-soil bank rising at the apex (s≈0.10, R mid) ----
      const k1 = K(0.10);
      const a1 = anchor(k1, 1, 14), b1 = [a1.r, a1.u, a1.t];
      addPrism(out, vadd(a1.c, a1.u, 5), [22, 10, 60], redSoil, [a1.t, a1.u, a1.r]);

      // ---- Esses spectator mounds flanking the track (s≈0.18, both, far) ----
      const ke = K(0.18);
      const me = anchor(ke, -1, 30), mr = [me.r, me.u, me.t];
      addPrism(out, vadd(me.c, me.u, 3), [40, 6, 70], scrub, [me.t, me.u, me.r]);
      const me2 = anchor(ke, 1, 30), mr2 = [me2.r, me2.u, me2.t];
      addPrism(out, vadd(me2.c, me2.u, 3), [40, 6, 70], scrub, [me2.t, me2.u, me2.r]);

      // ---- Austin360 Amphitheater: curved fan canopy behind Turn 12 (s≈0.64, R mid) ----
      const ka = K(0.64);
      const aa = anchor(ka, 1, 60), ab = [aa.r, aa.u, aa.t];
      if (!onTrack(aa.c[0], aa.c[2], 36)) {
        addBox(out, vadd(aa.c, aa.u, 12), [56, 24, 30], [0.78, 0.76, 0.72], ab);   // green-slope shell
        // curved canopy approximated by stepped panels fanning up
        for (let i = -2; i <= 2; i++) {
          addPrism(out, vadd(vadd(aa.c, aa.t, i * 12), aa.u, 24 + (2 - Math.abs(i)) * 2),
                   [16, 3, 26], [0.70, 0.72, 0.76], [aa.r, aa.u, aa.t]);
        }
      }

      // ---- Red-and-white grandstand framework / tower (s≈0.65, R far) ----
      const redFramework = (k, side, dist) => {
        const af = anchor(k, side, dist), fb = [af.r, af.u, af.t];
        if (onTrack(af.c[0], af.c[2], 24)) return;
        addBox(out, vadd(af.c, af.u, 16), [4, 32, 30], redSteel, fb);          // red lattice tower
        addBox(out, vadd(vadd(af.c, af.t, 14), af.u, 9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, -14), af.u, 9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, 7), af.u, 12), [6, 1, 18], white, fb); // white panels
        addBox(out, vadd(vadd(af.c, af.t, -7), af.u, 12), [6, 1, 18], white, fb);
      };
      redFramework(K(0.65), 1, 44);
      redFramework(K(0.65), 1, 76);     // a second red stand stacked behind the first
      redFramework(K(0.84), 1, 50);     // red framework at the triple-apex sweeper
      redFramework(K(0.30), 1, 60);     // red framework over the dry-grass field

      // ---- Scattered oak/cedar groves over dry grass (denser, mid-distance) ----
      every(40, (k) => {
        for (const side of [-1, 1]) {
          const r = hash(k * 13 + side);
          if (r > 0.72) continue;
          // a small cluster of 2-3 trees per hit, fanned out at varying distance
          const cnt = 2 + (hash(k * 31 + side) > 0.5 ? 1 : 0);
          for (let j = 0; j < cnt; j++) {
            const d = 26 + hash(k * 7 + side + j * 11) * 55;
            const h = 6 + hash(k * 17 + side + j * 9) * 7;
            const pick = hash(k * 5 + j);
            if (pick > 0.66) pine(k, side, d, h + 2, cedar);          // occasional conifer
            else tree(k, side, d, h, pick > 0.33 ? oak : cedar);
          }
          if (hash(k * 23 + side) > 0.45) bush(k, side, 22 + hash(k * 3 + side) * 50, scrub);
          if (hash(k * 29 + side) > 0.6) bush(k, side, 30 + hash(k * 19 + side) * 40, oak);
          if (hash(k * 41 + side) > 0.55) bush(k, side, 14 + hash(k * 11 + side) * 16, dryGrass); // low scrub near edge
        }
      });

      // ---- Start/finish gantry over the main straight (s≈0.00) ----
      gantry(0.00, 7.5, darkSteel);
      // scoring / DRS-detection gantry on the back straight (s≈0.50)
      gantry(0.50, 7.0, darkSteel);

      // ---- Catch fences behind the kerbs on the fast/spectator sections ----
      // (gap kept well clear of tarmac so the mesh never touches the racing line)
      fence(0.00, 0.06, 1, 5, 3.4, [0.62, 0.64, 0.68]);   // main straight, R
      fence(0.94, 1.00, 1, 5, 3.4, [0.62, 0.64, 0.68]);   // final corner, R
      fence(0.46, 0.62, -1, 6, 3.4, [0.62, 0.64, 0.68]);  // back straight, L
      fence(0.08, 0.14, -1, 8, 3.4, [0.62, 0.64, 0.68]);  // T1 hill, L

      // ---- Armco guardrails lining the flowing Esses and sweepers ----
      guardrail(0.15, 0.28, 1, 4, [0.80, 0.80, 0.82]);    // Esses, R
      guardrail(0.15, 0.28, -1, 4, [0.80, 0.80, 0.82]);   // Esses, L
      guardrail(0.78, 0.90, 1, 4, [0.80, 0.80, 0.82]);    // triple-apex sweeper, R
      guardrail(0.62, 0.70, 1, 5, [0.80, 0.80, 0.82]);    // T12 hairpin exit, R

      // ---- Tyre walls at the two big braking zones (T1 + T12 hairpin) ----
      tyreWall(0.095, 0.135, 1, 6, redSteel);             // T1 apex outside
      tyreWall(0.61, 0.66, 1, 6, [0.95, 0.85, 0.1]);      // T12 hairpin
      tyreWall(0.30, 0.34, -1, 6, [0.1, 0.5, 0.9]);       // mid-lap chicane

      // ---- Billboards / advertising hoardings around the lap ----
      billboard(K(0.07), -1, 14, 16, 6, redSteel);
      billboard(K(0.22), 1, 16, 18, 6, cotaBlue);
      billboard(K(0.40), -1, 18, 16, 6, [0.92, 0.5, 0.1]);
      billboard(K(0.50), 1, 18, 18, 6, [0.1, 0.6, 0.35]);
      billboard(K(0.70), -1, 16, 16, 6, redSteel);
      billboard(K(0.88), 1, 18, 16, 6, cotaBlue);

      // ---- Marshal posts at corner stations ----
      [0.04, 0.12, 0.20, 0.28, 0.43, 0.58, 0.64, 0.80, 0.90].forEach((s, i) => {
        marshalPost(K(s), (i % 2 ? 1 : -1), 7);
      });

      // ---- Distance-marker boards on the two big braking zones ----
      [50, 100, 150].forEach((m, i) => {
        const km = K(0.085 - m * 0.00018);
        place(km, 1, 9 + i, [1.0, 2.4, 0.4], white);
        const kh = K(0.60 - m * 0.00018);
        place(kh, -1, 9 + i, [1.0, 2.4, 0.4], white);
      });

      // ---- TV camera towers at scenic vantage points ----
      [[0.10, -1, 22], [0.50, 1, 24], [0.84, -1, 24]].forEach(([s, side, d]) => {
        const kc = K(s), ac = anchor(kc, side, d), cb = [ac.r, ac.u, ac.t];
        if (!onTrack(ac.c[0], ac.c[2], 18)) {
          addCyl(out, ac.c, 0.6, 11, darkSteel, 4, cb);
          addBox(out, vadd(ac.c, ac.u, 11), [2.4, 1.6, 1.6], [0.1, 0.1, 0.12], cb);
        }
      });

      // ---- Big paddock car park rows in the infield far side (s≈0.55, L far) ----
      const kp = K(0.55), ap = anchor(kp, -1, 70), pb = [ap.r, ap.u, ap.t];
      if (!onTrack(ap.c[0], ap.c[2], 40)) {
        for (let row = -2; row <= 2; row++) {
          for (let col = -3; col <= 3; col++) {
            const c = vadd(vadd(ap.c, ap.t, col * 6), ap.r, row * 4);
            const tint = hash(row * 9 + col * 3 + 1);
            addBox(out, vadd(c, ap.u, 0.7), [2.0, 1.4, 4.0],
                   [0.3 + tint * 0.5, 0.3 + hash(col * 7) * 0.4, 0.35 + hash(row * 5) * 0.4], pb);
          }
        }
      }

      // ---- Texas water tower — a regional silhouette landmark (s≈0.36, R far) ----
      const kw = K(0.36), aw = anchor(kw, 1, 95), wb = [aw.r, aw.u, aw.t];
      if (!onTrack(aw.c[0], aw.c[2], 30)) {
        for (const leg of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
          addCyl(out, vadd(vadd(aw.c, aw.r, leg[0]), aw.t, leg[1]), 0.5, 18, [0.7, 0.72, 0.74], 4, wb);
        }
        addFrustum(out, vadd(aw.c, aw.u, 18), 7, 5, 6, [0.82, 0.84, 0.86], 10, wb);
        addCone(out, vadd(aw.c, aw.u, 24), 5, 4, [0.6, 0.62, 0.66], 10, wb);
      }

      // ---- Texas Hill Country ridgelines — LOW organic hills on the horizon ----
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // CONTINUOUS Texas Hill Country backdrop: three overlapping rings of LOW
      // organic hills, spaced so wide bases overlap into an unbroken green/tan
      // band that wraps the WHOLE lap — no gaps, no snow, never tall.
      for (const [extra, wMin, hMin, count, col] of [
        [160, 220, 26, 44, dryGrass],                 // near continuous dry-green band
        [340, 280, 38, 38, [0.50, 0.54, 0.42]],       // mid tan-green band
        [540, 340, 50, 32, [0.46, 0.52, 0.46]],       // far hazed band
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          // half-step alternation pulls each hill toward its neighbour's gap
          const a = (i + (i % 2) * 0.5) / count * 6.2832, h = hash(i * 7 + extra);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   wMin + h * 100, hMin + h * 20,
                   { seed: i * 3 + extra, snowline: 2, forest: col, rock: [col[0] * 0.92, col[1] * 0.9, col[2] * 0.82] });
        }
      }
    },
  }
  );
})();
