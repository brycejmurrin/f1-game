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

      // Suzuka palette accents — spring/autumn green with muted sky influence
      const blue = [0.26, 0.38, 0.64];
      const navy = [0.18, 0.26, 0.46];
      const crowdMix = [0.78, 0.45, 0.40];   // warm packed-crowd colour
      const concrete = [0.62, 0.63, 0.67];
      const steel = [0.40, 0.42, 0.48];
      const fogMist = [0.82, 0.85, 0.87];   // soft morning mist in esses valley

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
      // ring of separated cubes. No snow (Suzuka is wooded, not alpine). Stagger
      // angles slightly per ring so the overlapping effect feels natural.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, wMin, wVar, hMin, hVar, count, seg, fc, rc] of [
        [160, 280, 85, 44, 46, 44, 8, [0.20, 0.38, 0.23], [0.30, 0.36, 0.28]],    // near base — tighter, denser green wall
        [310, 320, 110, 68, 60, 36, 8, [0.25, 0.42, 0.28], [0.36, 0.42, 0.32]],   // mid green ridge — more overlap
        [500, 380, 140, 110, 85, 28, 8, [0.40, 0.50, 0.44], [0.45, 0.50, 0.45]],  // far hazed range — haze towards grey
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const offset = (extra === 160 ? 0 : extra === 310 ? 0.5 : 1) / count;  // stagger rings for natural overlap
          const a = (i + offset + extra * 0.003) / count * 6.2832, h = hash(i * 11 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          mountain(x, z, pyMin, wMin + h * wVar, hMin + h * hVar, {
            seg, seed: i * 17 + extra, snowline: 1.1,   // Mie hills — wooded, not alpine
            forest: [fc[0] + h * 0.06, fc[1] + h * 0.05, fc[2] + h * 0.05], rock: rc,
          });
        }
      }

      // --- Motopia theme park + the giant Ferris wheel: the hero landmark that
      // instantly reads "Suzuka", on the outside of the main straight (Turn 1 side).
      // Positioned just past the Esses entry (s≈0.08) for max visibility.
      const wheelK = Math.round(n * 0.075) % n;
      ferrisWheel(wheelK, -1, 58, 35);     // 35m wheel — iconic tall silhouette visible from the Esses
      // Secondary accent support towers flanking the wheel area
      tower(Math.round(n * 0.065) % n, -1, 82, 8, 42, { col: [0.78, 0.80, 0.84], seg: 8, cap: true, capCol: [0.88, 0.32, 0.32], mast: 6 });
      tower(Math.round(n * 0.085) % n, -1, 86, 7, 38, { col: [0.80, 0.82, 0.86], seg: 7, cap: true, capCol: [0.86, 0.30, 0.30], mast: 5 });

      // Amusement-park structures clustered behind the wheel: ride towers, a domed
      // pavilion, a carousel canopy, hotel block, colourful pavilions. Bright accents
      // pop against the green hills — primary reds, blues, yellows, greens.
      const parkCol = [[0.88, 0.38, 0.36], [0.35, 0.64, 0.86], [0.92, 0.82, 0.32], [0.52, 0.80, 0.50], [0.80, 0.46, 0.84]];
      const parkA = Math.round(n * 0.055) % n;
      // big leisure-complex hotel block — Motopia Hotel (prominent 5-6 storey building)
      building(parkA, -1, 70, 32, 38, 24, { wall: [0.74, 0.74, 0.78], window: [0.26, 0.38, 0.50], floor: 5, setback: true, roof: true });
      // secondary hotel/pavilion building with service court
      building(Math.round(n * 0.035) % n, -1, 88, 26, 28, 18, { wall: [0.76, 0.76, 0.80], window: [0.30, 0.42, 0.54], floor: 4, roof: true });
      // drop-tower thrill ride (tall slim spire) — iconic park structure, fire-red top
      tower(Math.round(n * 0.10) % n, -1, 76, 7, 52, { col: [0.84, 0.28, 0.30], seg: 7, cap: true, capCol: [0.96, 0.92, 0.28], mast: 7 });
      // second ride tower for visual variety — alternate colour (cooler blue-red)
      tower(Math.round(n * 0.075) % n, -1, 80, 6, 44, { col: [0.80, 0.26, 0.32], seg: 6, cap: true, capCol: [0.94, 0.90, 0.26], mast: 5 });
      // domed pavilion / central gathering structure — signature white/cream dome with red roof accent
      {
        const p = anchor(parkA, -1, 116), b = [p.r, p.u, p.t];
        addCyl(out, vadd(p.c, p.u, 6), 12, 12, [0.92, 0.92, 0.95], 12, b);
        addCone(out, vadd(p.c, p.u, 12), 13, 11, [0.88, 0.36, 0.38], 14, b);   // red dome roof — warm accent
      }
      // carousel / pavilion canopies + colourful ride pods spread around the park base
      for (let i = 0; i < 10; i++) {
        const kk = (parkA + i * 3) % n;
        const dist = 42 + (i % 5) * 12;
        const sz = [11 + (i % 3) * 2.5, 7 + (i % 2) * 2.5, 13 + (i % 4) * 1.5];
        place(kk, -1, dist, sz, parkCol[i % parkCol.length]);
        // peaked tent roof / pavilion canopy on top — varied heights for visual interest
        const p = anchor(kk, -1, dist + 4), b = [p.r, p.u, p.t];
        addCone(out, vadd(p.c, p.u, 9 + (i % 3) * 1.5), 7.5, 5, parkCol[(i + 2) % parkCol.length], 8, b);
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
      // Elevated green pedestrian span that carries spectators over the main straight
      // and defines the figure-8 layout. Green tint echoes the surrounding forested hills.
      {
        const bk = Math.round(n * 0.81) % n;
        const ab = anchor(bk, -1, 18);
        const basis = [ab.r, ab.u, ab.t];
        const bridgePos = vadd(ab.c, ab.u, 15);
        // Main bridge deck spanning the crossing — leaf green with slight transparency hint
        addBox(out, bridgePos, [11, 1.2, 35], [0.25, 0.47, 0.29], basis);
        // Two robust vertical support columns on either side (tapered toward top)
        addBox(out, vadd(ab.c, ab.u, 7.5), [1.8, 15, 1.8], [0.46, 0.47, 0.52], basis);
        addBox(out, vadd(vadd(ab.c, ab.u, 7.5), ab.t, 17.5), [1.8, 15, 1.8], [0.46, 0.47, 0.52], basis);
        // Green overhead canopy / safety netting frame for spectator protection
        addBox(out, vadd(ab.c, ab.u, 17), [12, 0.5, 36], [0.27, 0.49, 0.31], basis);
        // Diagonal cross-bracing X-frames for structural realism (both directions)
        addCyl(out, vadd(ab.c, ab.u, 8.5), 0.22, 12, [0.44, 0.46, 0.50], 6, basis);
        addCyl(out, vadd(vadd(ab.c, ab.u, 8.5), ab.t, 12), 0.22, 12, [0.44, 0.46, 0.50], 6, basis);
        // Railing posts along the deck for safety (increased count for realistic spacing)
        for (let i = -4; i <= 4; i++) {
          const off = i * (35 / 9);
          const c = [ab.c[0] + ab.r[0] * off * 0.18, ab.c[1] + 15.5, ab.c[2] + ab.t[2] * off];
          addCyl(out, c, 0.10, 1.4, [0.38, 0.40, 0.46], 5, basis);
        }
      }
      // Underpass structure (where track dips under the main straight at s≈0.37)
      // Dark recessed tunnel where the back loop dips beneath the Esses exit — creates
      // the figure-8 second crossing and visual interest with the bridge at s≈0.81.
      {
        const uk = Math.round(n * 0.37) % n;
        const au = anchor(uk, 1, 14);
        const ubasis = [au.r, au.u, au.t];
        // Dark recessed underpass tunnel opening — shadow-tinted interior
        addBox(out, vadd(au.c, au.u, -1.5), [13, 4.5, 30], [0.18, 0.18, 0.20], ubasis);
        // Concrete support columns lifting the overhead straight (tapered)
        addBox(out, vadd(au.c, au.u, 1.2), [1.6, 3.2, 1.6], [0.40, 0.41, 0.46], ubasis);
        addBox(out, vadd(vadd(au.c, au.u, 1.2), au.t, 14.5), [1.6, 3.2, 1.6], [0.40, 0.41, 0.46], ubasis);
        // Top slab of the underpass (shadow underside of the main straight)
        addBox(out, vadd(au.c, au.u, 2.5), [13.5, 0.6, 30.5], [0.20, 0.20, 0.22], ubasis);
      }

      // --- Honda orange accent stripe on main grandstand (s≈0.00, L side).
      // The iconic F1 sponsor colour bands the main grandstand at the start/finish.
      {
        const hk = Math.round(n * 0.00) % n;
        const ah = anchor(hk, -1, 11);
        const bh = [ah.r, ah.u, ah.t];
        // Primary Honda orange stripe
        addBox(out, vadd(ah.c, ah.u, 16), [3.2, 2.4, 75], [0.98, 0.52, 0.08], bh);
        // Secondary white accent stripe above
        addBox(out, vadd(ah.c, ah.u, 18.8), [3, 1.2, 75], [0.92, 0.92, 0.94], bh);
      }

      // --- Small scenic viewing / support towers on the mid-lap hills (Spoon area).
      // Low-profile accent structures that reinforce the Motopia complex presence
      // without intruding on the track view.
      tower(Math.round(n * 0.50) % n, 1, 160, 6, 19, { col: [0.78, 0.80, 0.84], seg: 6, cap: true, capCol: [0.86, 0.28, 0.28], mast: 3 });
      tower(Math.round(n * 0.62) % n, -1, 170, 6, 20, { col: [0.80, 0.82, 0.86], seg: 6, cap: true, capCol: [0.88, 0.32, 0.32], mast: 4 });

      // --- Cherry blossom / sakura tree scatter near s=0.05–0.18 on both sides.
      // Small clusters of spring pink that pop against the green hills, especially
      // on the climb toward the Esses and through Degner.
      {
        const blossomFracs = [0.048, 0.062, 0.078, 0.098, 0.115, 0.145, 0.035, 0.120];
        const blossomSides = [-1, 1, -1, 1, -1, 1, 1, -1];
        const blossomDists = [20, 24, 16, 28, 22, 18, 19, 25];
        for (let i = 0; i < blossomFracs.length; i++) {
          const bk = Math.round(n * blossomFracs[i]) % n;
          const h = 6.5 + hash(bk * 37) * 5;
          tree(bk, blossomSides[i], blossomDists[i], h, [0.92, 0.68, 0.78]);   // deeper sakura pink
        }
      }

      // --- Grandstands at the signature corners (lap-fractions from the brief).
      // Dense clusters at high-profile viewing points. Navy-blue main stand is the icon.
      stand(0.00, -1, 9, 82, navy);  // Main grandstand (iconic) along start straight — dark-blue front terraces
      stand(0.15, 1, 9, 42);    // Esses grandstand — extends up the climb, captures first-gear action
      stand(0.28, -1, 9, 28);   // Degner entry section — supports the iconic corner
      stand(0.45, 1, 9, 38);    // Hairpin grandstand — compact dense bank at the tight apex
      stand(0.62, -1, 9, 38);   // Spoon grandstand — low-point structure, steady viewing platform
      stand(0.75, 1, 8, 26);    // 200R approach stand (precedes high-speed 130R)
      stand(0.84, 1, 8, 34);    // 130R grandstand — tall bank for the flat-out high-speed left
      stand(0.94, 1, 9, 35);    // Casio Triangle (final chicane) — right side, dense terraces
      stand(0.94, -1, 9, 35);   // Casio Triangle — left side, extends pre-straight section
      stand(0.50, 1, 8, 24);    // Mid-circuit flex-viewing (low-key secondary stand)
    },
  }
  );
})();
