/* Apex 26 — SUZUKA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 7,
    pal: { zenith: [0.35, 0.50, 0.70], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.90, 0.65], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    // Rolling esses climb then the drop toward the Degners (~40 m of relief over
    // the lap). Kept clear of the figure-8 crossover at s≈0.81 (that's a bridge).
    elevations: [{ s: 0.20, halfM: 300, rise: 7 }, { s: 0.45, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.811, halfM: 150, rise: 7 }],
    scenery: function (api) {
      const { out, track, n, px, py, pz, hw, pyMin, place, prop, every, ferrisWheel,
              hash, mountain, pine, tree, bush, grandstand, building, tower, billboard,
              gantry, marshalPost, fence, guardrail, tyreWall, hedge, anchor, vadd,
              addBox, addCyl, addCone, addFrustum, addPrism } = api;

      // Suzuka palette accents
      const blue = [0.26, 0.38, 0.64];
      const navy = [0.18, 0.26, 0.46];
      const crowdMix = [0.78, 0.45, 0.40];   // warm packed-crowd colour
      const concrete = [0.62, 0.63, 0.67];
      const steel = [0.40, 0.42, 0.48];

      // Rich packed grandstand: raked crowd + back shell + cantilever roof + the
      // signature SUZUKA-blue front tier. Uses the engine grandstand for the bulk,
      // then adds a low blue fan band in front.
      const stand = (s, side, gap, len, shell) => {
        grandstand(s, side, gap, len, shell || steel, crowdMix);
        const k = Math.round(s * n) % n;
        prop(k, side, gap, [3, 4.5, len - 4], blue);   // blue front fan band
      };

      // --- Forested Mie-prefecture hills: three haze-depth rings of wooded
      // summits encircling the circuit (computed from the track centre). The
      // near rings are dense and OVERLAPPING — neighbouring peaks touch so the
      // horizon reads as one CONTINUOUS green forested wall with no gaps, not a
      // ring of separated cubes. No snow (Suzuka is wooded, not alpine).
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, wMin, wVar, hMin, hVar, count, seg, fc, rc] of [
        [170, 250, 70, 40, 40, 40, 7, [0.22, 0.40, 0.25], [0.32, 0.38, 0.29]],   // near base — overlapping continuous forest backdrop
        [300, 280, 90, 62, 52, 32, 7, [0.28, 0.46, 0.30], [0.38, 0.44, 0.34]],   // mid green ridge
        [470, 320, 110, 96, 70, 26, 8, [0.42, 0.53, 0.46], [0.46, 0.52, 0.46]],   // far hazed range
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + extra * 0.004) / count * 6.2832, h = hash(i * 7 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * wVar, hMin + h * hVar, {
            seg, seed: i * 13 + extra, snowline: 1.1,   // Mie hills — wooded, not alpine
            forest: [fc[0] + h * 0.05, fc[1] + h * 0.04, fc[2] + h * 0.04], rock: rc,
          });
        }
      }

      // --- Motopia theme park + the giant Ferris wheel: the hero landmark that
      // instantly reads "Suzuka", on the outside of the main straight (Turn 1 side).
      const wheelK = Math.round(n * 0.07) % n;
      ferrisWheel(wheelK, -1, 52, 32);     // Slightly larger wheel (32m) for more prominence
      // Tall support columns beside the wheel for structural realism
      tower(wheelK, -1, 88, 8, 40, { col: [0.80, 0.82, 0.86], seg: 8, cap: true, capCol: [0.88, 0.30, 0.30], mast: 5 });
      tower(Math.round(n * 0.06) % n, -1, 92, 7, 38, { col: [0.78, 0.80, 0.84], seg: 7, cap: true, capCol: [0.86, 0.28, 0.28], mast: 4 });

      // Amusement-park structures clustered behind the wheel: ride towers, a domed
      // pavilion, a carousel canopy, hotel block, colourful pavilions.
      const parkCol = [[0.86, 0.42, 0.40], [0.40, 0.62, 0.82], [0.90, 0.80, 0.36], [0.55, 0.78, 0.55], [0.78, 0.50, 0.82]];
      const parkA = Math.round(n * 0.05) % n;
      // big leisure-complex hotel block — Motopia Hotel
      building(parkA, -1, 66, 28, 32, 20, { wall: [0.75, 0.75, 0.79], window: [0.28, 0.40, 0.52], floor: 4, setback: true, roof: true });
      // secondary hotel/pavilion building nearby
      building(Math.round(n * 0.04) % n, -1, 82, 22, 24, 16, { wall: [0.76, 0.76, 0.80], window: [0.32, 0.44, 0.56], floor: 3, roof: true });
      // drop-tower thrill ride (tall slim spire) — iconic park structure
      tower(Math.round(n * 0.09) % n, -1, 72, 6, 48, { col: [0.85, 0.30, 0.32], seg: 7, cap: true, capCol: [0.95, 0.9, 0.3], mast: 6 });
      // second ride tower for visual variety
      tower(Math.round(n * 0.08) % n, -1, 78, 5, 42, { col: [0.82, 0.28, 0.28], seg: 6, cap: true, capCol: [0.92, 0.88, 0.28], mast: 5 });
      // domed pavilion / central gathering structure
      {
        const p = anchor(parkA, -1, 112), b = [p.r, p.u, p.t];
        addCyl(out, vadd(p.c, p.u, 5), 11, 11, [0.93, 0.93, 0.96], 10, b);
        addCone(out, vadd(p.c, p.u, 11), 12, 10, [0.86, 0.40, 0.41], 12, b);   // red dome roof
      }
      // carousel / pavilion canopies + colourful ride pods near the wheel base
      for (let i = 0; i < 8; i++) {
        const kk = (parkA + i * 2) % n;
        const dist = 38 + (i % 4) * 14;
        place(kk, -1, dist, [10 + (i % 3) * 2, 6 + (i % 2) * 2, 12], parkCol[i % parkCol.length]);
        // peaked tent roof on top
        const p = anchor(kk, -1, dist + 5), b = [p.r, p.u, p.t];
        addCone(out, vadd(p.c, p.u, 8 + (i % 3) * 1.2), 7, 4.5, parkCol[(i + 2) % parkCol.length], 8, b);
      }
      // flag-poles / ride masts dotting the park edge — increase number for busier park feel
      for (let i = 0; i < 12; i++) {
        const kk = (parkA + i) % n;
        const p = anchor(kk, -1, 32 + (i % 5) * 4), b = [p.r, p.u, p.t];
        addCyl(out, p.c, 0.12, 10 + (i % 3) * 2.2, steel, 4, b);
        addBox(out, vadd(p.c, p.u, 9 + (i % 3)), [0.12, 1.6, 2.4], parkCol[i % parkCol.length], b);  // pennant
      }
      // Small vendor pavilions / kiosks scattered through park
      for (let i = 0; i < 4; i++) {
        const kk = (parkA + i * 5) % n;
        const dist = 50 + (i % 2) * 20;
        place(kk, -1, dist, [8, 4, 8], [0.88, 0.76, 0.54]);  // light beige kiosks
      }

      // --- Pit & paddock complex along the main straight (right side, start area).
      const pitStart = 0.965, pitEnd = 0.04;
      // Long low pit garage block (right of the straight)
      building(Math.round(n * 0.985) % n, 1, 9, 14, 9, 60, { wall: concrete, window: [0.16, 0.18, 0.22], floor: 3, roof: false });
      // Paddock / hospitality building behind it
      building(Math.round(n * 0.99) % n, 1, 30, 22, 16, 28, { wall: [0.80, 0.80, 0.84], window: [0.28, 0.40, 0.52], floor: 4, setback: true, roof: true });
      // Pit wall (low concrete) hugging the straight
      // (use guardrail-style low wall via tyreless prop) — keep clearance off tarmac
      guardrail(pitStart, pitEnd, 1, 2.5, [0.88, 0.88, 0.90]);
      // Control tower at start/finish
      tower(Math.round(n * 0.995) % n, 1, 22, 9, 30, { col: [0.86, 0.87, 0.90], seg: 6, cap: true, capCol: navy, mast: 7 });
      // Start/finish gantry over the line
      gantry(0.0, 9, [0.14, 0.14, 0.18]);
      // Pit-straight billboards (sponsor hoardings) on the left
      for (let i = 0; i < 5; i++) {
        billboard(Math.round(n * (0.0 + i * 0.012)) % n, 1, 6, 8, 4, parkCol[i % parkCol.length]);
      }

      // --- The iconic footbridge / spectator overpass across the main straight.
      // A green-clad pedestrian span on twin towers — Suzuka's famous walkway.
      const footbridge = (s, deckH) => {
        const k = Math.round(s * n) % n;
        const aL = anchor(k, -1, 3), aR = anchor(k, 1, 3), u = aL.u;
        const span = hw[k] * 2 + 14;
        // twin support pylons on each side
        for (const a of [aL, aR]) {
          addBox(out, vadd(a.c, u, deckH / 2), [2.2, deckH, 2.6], concrete, [a.r, u, a.t]);
          addBox(out, vadd(a.c, u, deckH + 2), [3.4, 1.2, 3.4], steel, [a.r, u, a.t]);   // pylon cap
        }
        // green deck spanning the track
        const deckC = [px[k] + u[0] * deckH, py[k] + u[1] * deckH + deckH, pz[k] + u[2] * deckH];
        addBox(out, [px[k], py[k] + deckH, pz[k]], [span, 1.4, 4.5], [0.30, 0.50, 0.34], [aL.r, u, aL.t]);
        // green roof canopy over the walkway
        addBox(out, [px[k], py[k] + deckH + 2.6, pz[k]], [span, 0.6, 5.2], [0.24, 0.44, 0.30], [aL.r, u, aL.t]);
        // railing posts along the deck
        for (let i = -4; i <= 4; i++) {
          const off = i * (span / 9);
          const c = [px[k] + aL.t[0] * 0 + aL.r[0] * off, py[k] + deckH + 1.5, pz[k] + aL.r[2] * off];
          addCyl(out, c, 0.1, 1.6, steel, 4, [aL.r, u, aL.t]);
        }
      };
      footbridge(0.135, 8.5);    // spectator overpass near the Esses entry
      footbridge(0.50, 8.0);     // mid-circuit crossing

      // --- Overhead camera / scoring gantries at key points.
      gantry(0.30, 8, steel);    // Degner approach
      gantry(0.86, 8, steel);    // 130R / crossover area

      // --- Forested Mie hills now live in the earlier loop above. Add a dense
      // continuous treeline (hedge) behind the far grass on the outer edges so the
      // ground-to-hills transition is solid green, not bare grass.
      hedge(0.16, 0.30, 1, 26, 5, [0.16, 0.34, 0.18]);
      hedge(0.55, 0.70, -1, 26, 5, [0.17, 0.35, 0.19]);
      hedge(0.40, 0.48, 1, 24, 4.5, [0.16, 0.33, 0.18]);

      // --- Dense conifer stands lining BOTH green zones (proper cone trees) in
      // staggered double rows, with Sakura (cherry-blossom) broadleaves scattered
      // for seasonal pop against the green. Denser than before for full forest effect.
      every(16, (k) => {
        const s = hash(k * 41);
        if (s < 0.12) return;
        pine(k, -1, 6.8 + s * 10, 10 + s * 8, [0.13 + s * 0.07, 0.35, 0.16]);
        pine(k, 1, 6.8 + s * 10, 10 + s * 8, [0.12 + s * 0.08, 0.34, 0.15]);
        if (s > 0.38) {
          const b = hash(k * 71);
          pine(k, b < 0.5 ? -1 : 1, 18 + b * 18, 13 + b * 11, [0.11 + b * 0.06, 0.33, 0.15]);
          pine(k, b < 0.5 ? 1 : -1, 28 + b * 18, 15 + b * 11, [0.10 + b * 0.06, 0.32, 0.14]);
        }
        if (s > 0.65) {
          bush(k, s < 0.8 ? -1 : 1, 5 + s * 4.5, [0.21, 0.41, 0.21]);
          bush(k, s > 0.8 ? -1 : 1, 8 + s * 3, [0.19, 0.39, 0.19]);
        }
      });
      every(28, (k) => {
        const s = hash(k * 53);
        if (s < 0.28) return;
        tree(k, s < 0.7 ? -1 : 1, 11 + s * 9, 7 + s * 5, [0.94, 0.65, 0.73]);  // sakura pink
        if (s > 0.55) tree(k, s < 0.7 ? 1 : -1, 15 + s * 7, 6 + s * 4, [0.96, 0.73, 0.82]);
      });
      // Extra cherry-blossom accent trees for spring atmosphere
      every(42, (k) => {
        const s = hash(k * 79);
        if (s < 0.4) return;
        tree(k, -1, 9 + s * 6, 5.5 + s * 3, [0.95, 0.68, 0.76]);
      });

      // --- Track furniture: catch fences, guardrails, tyre walls, marshal posts.
      // Catch fences behind the run-off at the fast/dangerous sections.
      fence(0.10, 0.24, 1, 6, 4, [0.70, 0.72, 0.76]);   // Esses outer
      fence(0.10, 0.24, -1, 6, 4, [0.70, 0.72, 0.76]);  // Esses inner
      fence(0.80, 0.90, 1, 6, 4, [0.70, 0.72, 0.76]);   // 130R outer
      fence(0.92, 0.98, 1, 5, 4, [0.70, 0.72, 0.76]);   // Casio chicane
      fence(0.92, 0.98, -1, 5, 4, [0.70, 0.72, 0.76]);
      // Armco guardrails along the esses and degner edges.
      guardrail(0.24, 0.36, -1, 3, [0.84, 0.84, 0.88]);  // Degner inner
      guardrail(0.55, 0.66, 1, 3, [0.84, 0.84, 0.88]);   // Spoon outer
      // Tyre walls (red/blue cap) at high-risk apexes.
      tyreWall(0.44, 0.47, -1, 2.5, [0.85, 0.20, 0.20]);   // Hairpin inner
      tyreWall(0.93, 0.96, 1, 2.5, [0.20, 0.35, 0.80]);    // Casio chicane outer
      tyreWall(0.83, 0.86, 1, 3.0, [0.85, 0.20, 0.20]);    // 130R outer
      // Marshal posts spread around the lap.
      for (const [s, sd] of [[0.12, 1], [0.28, -1], [0.43, 1], [0.58, -1], [0.72, 1], [0.85, 1], [0.95, -1]]) {
        marshalPost(Math.round(n * s) % n, sd, 5);
      }
      // Trackside billboards around the lap (sponsor hoardings).
      for (const [s, sd] of [[0.20, 1], [0.46, 1], [0.63, -1], [0.88, 1]]) {
        billboard(Math.round(n * s) % n, sd, 7, 7, 3.5, parkCol[Math.round(s * 10) % parkCol.length]);
      }

      // --- Figure-8 bridge structure: Suzuka's iconic crossover at s≈0.81.
      // The iconic green pedestrian bridge carrying traffic over the main straight.
      {
        const bk = Math.round(n * 0.81) % n;
        const ab = anchor(bk, -1, 16);
        const basis = [ab.r, ab.u, ab.t];
        const bridgePos = vadd(ab.c, ab.u, 14);
        // Main bridge deck spanning the crossing — bright green for visibility
        addBox(out, bridgePos, [10, 1.0, 32], [0.26, 0.48, 0.30], basis);
        // Two robust vertical support columns on either side of the beam
        addBox(out, vadd(ab.c, ab.u, 7), [1.6, 14, 1.6], [0.48, 0.49, 0.54], basis);
        addBox(out, vadd(vadd(ab.c, ab.u, 7), ab.t, 16), [1.6, 14, 1.6], [0.48, 0.49, 0.54], basis);
        // Green overhead canopy / safety netting frame
        addBox(out, vadd(ab.c, ab.u, 16.5), [11, 0.4, 33], [0.28, 0.50, 0.32], basis);
        // Diagonal cross-bracing for structural realism
        addCyl(out, vadd(ab.c, ab.u, 8), 0.20, 11, [0.46, 0.48, 0.52], 5, basis);
        addCyl(out, vadd(vadd(ab.c, ab.u, 8), ab.t, 11), 0.20, 11, [0.46, 0.48, 0.52], 5, basis);
        // Railing posts along the deck for safety
        for (let i = -3; i <= 3; i++) {
          const off = i * (32 / 7);
          const c = [ab.c[0] + ab.r[0] * off * 0.2, ab.c[1] + 14.5, ab.c[2] + ab.t[2] * off];
          addCyl(out, c, 0.08, 1.2, [0.40, 0.42, 0.48], 4, basis);
        }
      }
      // Underpass structure (where track dips under the main straight at s≈0.37)
      {
        const uk = Math.round(n * 0.37) % n;
        const au = anchor(uk, 1, 12);
        const ubasis = [au.r, au.u, au.t];
        // Dark recessed underpass frame
        addBox(out, vadd(au.c, au.u, -2), [12, 4, 28], [0.22, 0.22, 0.24], ubasis);
        // Support columns for the bridge above
        addBox(out, vadd(au.c, au.u, 1), [1.4, 3, 1.4], [0.42, 0.43, 0.48], ubasis);
        addBox(out, vadd(vadd(au.c, au.u, 1), au.t, 13), [1.4, 3, 1.4], [0.42, 0.43, 0.48], ubasis);
      }

      // --- Honda orange accent stripe on main grandstand (s≈0.00, R side).
      {
        const hk = Math.round(n * 0.00) % n;
        const ah = anchor(hk, -1, 11);
        const bh = [ah.r, ah.u, ah.t];
        addBox(out, vadd(ah.c, ah.u, 16), [3, 2, 70], [0.98, 0.50, 0.10], bh);
      }

      // --- Park observation towers on Motopia ridges.
      tower(Math.round(n * 0.50) % n, 1, 180, 7, 22, { col: [0.80, 0.82, 0.86], seg: 6, cap: true, capCol: [0.88, 0.30, 0.30], mast: 4 });
      tower(Math.round(n * 0.60) % n, 1, 180, 7, 22, { col: [0.80, 0.82, 0.86], seg: 6, cap: true, capCol: [0.88, 0.30, 0.30], mast: 4 });

      // --- Additional cherry blossom / sakura tree scatter near s=0.05–0.15.
      {
        const blossomFracs = [0.050, 0.065, 0.080, 0.095, 0.110, 0.130];
        const blossomSides = [-1, 1, -1, 1, -1, 1];
        const blossomDists = [18, 22, 14, 26, 20, 16];
        for (let i = 0; i < blossomFracs.length; i++) {
          const bk = Math.round(n * blossomFracs[i]) % n;
          tree(bk, blossomSides[i], blossomDists[i], 7 + hash(bk * 31) * 4, [0.70, 0.85, 0.60]);
        }
      }

      // --- Grandstands at the signature corners (lap-fractions from the brief).
      stand(0.00, -1, 9, 76, navy);  // Main grandstand (huge) along start straight — iconic blue
      stand(0.15, 1, 9, 38);    // Esses grandstand — taller section on the climb
      stand(0.45, 1, 9, 34);    // Hairpin grandstand — compact dense terraces
      stand(0.62, -1, 9, 36);   // Spoon grandstand — curving low-point structure
      stand(0.84, 1, 8, 30);    // 130R grandstand — tall bank for flat-out high-speed section
      stand(0.94, 1, 9, 32);    // Casio Triangle (final chicane) — both sides, extended
      stand(0.94, -1, 9, 32);
      // Additional support grandstands
      stand(0.28, -1, 9, 26);   // Degner approach section
      stand(0.50, 1, 8, 28);    // Mid-circuit viewing
    },
  }
  );
})();
