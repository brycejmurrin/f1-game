/* Apex 26 — SPA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    baseHW: 8,
    pal: { zenith: [0.30, 0.40, 0.52], horizon: [0.58, 0.62, 0.64], grass: [0.14, 0.38, 0.14], runoff: [0.52, 0.52, 0.50], fog: [0.62, 0.66, 0.66], fogDensity: 0.0032, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.96, 0.82, 0.60], sunColor: [0.88, 0.78, 0.58] },
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
      const { out, n, px, pz, pyMin, hash, every, prop, place, backdrop, onTrack,
              addBox, addCyl, addFrustum, vadd, anchor, along, mountain, pine, tree, bush, hedge,
              grandstand, building, tower, billboard, gantry, marshalPost,
              fence, guardrail, tyreWall } = api;

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
        // Dark Ardennes pine forest, tightly massed for a visual wall
        { extra: 280, wMin: 160, hMin: 56, hVar: 54, wVar: 80, count: 32, phase: 0.0,
          opts: { seg: 7, rough: 0.30, forest: [0.09, 0.30, 0.12], rock: [0.32, 0.34, 0.32], snow: [0.90, 0.93, 0.96], snowline: 1.2 } },
        // mid forested wall — offset to fill the seams of the near ring
        { extra: 290, wMin: 340, hMin: 92, hVar: 70, wVar: 150, count: 26, phase: 0.5,
          opts: { seg: 7, rough: 0.32, forest: [0.11, 0.33, 0.15], rock: [0.36, 0.40, 0.38], snow: [0.90, 0.93, 0.96], snowline: 0.92 } },
        // far hazed range — paler damp grey-green Ardennes, light snow on the very tops
        { extra: 450, wMin: 380, hMin: 132, hVar: 110, wVar: 150, count: 22, phase: 0.0,
          opts: { seg: 7, rough: 0.34, forest: [0.16, 0.40, 0.18], rock: [0.48, 0.52, 0.50], snow: [0.92, 0.94, 0.97], snowline: 0.78 } },
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

      // --- Continuous dark treeline wall hugging both sides of the track. This
      // is the read-at-a-glance "wall of forest" the brief calls for: a dense
      // hedge mass that closes off every grass gap behind the front-rank pines.
      // Darker, more austere forest green for Ardennes character.
      hedge(0.0, 1.0, -1, 5, 8.0, [0.08, 0.28, 0.12]);
      hedge(0.0, 1.0, 1, 5, 8.0, [0.09, 0.29, 0.13]);

      // --- Dense Ardennes pine forest walling both sides of the track. Three
      // staggered ranks give a continuous, multi-deep woodland. The hedge above
      // already closes the gaps at the very front, so the pines read as the
      // textured woodland behind it; spacing is tuned to stay within budget.
      // Front rank (close to the edge), textured woodland just behind the hedge.
      // Darker, denser Ardennes conifers.
      every(52, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 41 + side * 7);
          if (s < 0.38) continue;
          const dist = 7 + s * 11, h = 9 + s * 10;
          pine(k, side, dist, h, [0.07 + s * 0.04, 0.28, 0.12]);
        }
      });
      // Second rank (mid/deep depth), the looming taller back wall.
      every(72, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 67 + side * 5 + 3);
          if (s < 0.40) continue;
          const dist = 20 + s * 26, h = 12 + s * 13;
          pine(k, side, dist, h, [0.08 + s * 0.05, 0.26, 0.12]);
        }
      });
      // Scattered broadleaf trees breaking up the conifer monotony, mid depth.
      every(105, (k) => {
        for (const side of [-1, 1]) {
          const s = hash(k * 113 + side * 3 + 9);
          if (s < 0.55) continue;
          tree(k, side, 14 + s * 24, 7 + s * 7, [0.12 + s * 0.07, 0.34, 0.16]);
        }
      });
      // Hero density at Eau Rouge / Raidillon (s≈0.05–0.10): crowd the climb with pines.
      // Maximize forest drama through the iconic dip and climb.
      every(16, (k) => {
        const s = k / n;
        if (s < 0.045 || s > 0.12) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 53 + side);
          pine(k, side, 6 + r * 9, 11 + r * 10, [0.07 + r * 0.05, 0.29, 0.13]);
          if (r > 0.48) pine(k, side, 21 + r * 19, 12 + r * 10, [0.08 + r * 0.04, 0.26, 0.12]);
          if (r > 0.70) pine(k, side, 36 + r * 14, 10 + r * 8, [0.09 + r * 0.03, 0.27, 0.13]);
        }
      });

      // --- Modern pit/paddock complex: long low white-grey mass on the pit straight,
      // with a stacked hospitality tier and a control tower at the start.
      // Clean, modern greys and dark windows for a contemporary facility.
      building(0, -1, 9, 14, 11, 64, { wall: [0.88, 0.89, 0.91], window: [0.32, 0.38, 0.44], floor: 5 });
      building(0, -1, 11, 12, 6, 50, { wall: [0.82, 0.84, 0.87], window: [0.28, 0.36, 0.42], floor: 3, setback: 2 });
      tower(Math.round(n * 0.985) % n, -1, 16, 9, { col: [0.86, 0.87, 0.90], cap: 4, capCol: [0.28, 0.34, 0.40], mast: 8 });
      {
        // Thin cantilever roof blade over the pit lane.
        const a = anchor(0, -1, 20);
        addBox(out, vadd(a.c, a.u, 12.5), [16, 0.8, 60], [0.82, 0.84, 0.88], [a.r, a.u, a.t]);
      }
      // Lone weathered old pit building on the original Kemmel straight (s≈0.10, far left).
      // Historic structure; aged cream-grey stone with small dark windows.
      building(Math.round(n * 0.10) % n, -1, 40, 12, 9, 40, { wall: [0.72, 0.70, 0.64], window: [0.26, 0.26, 0.24], floor: 4 });

      // --- Grandstands with crowds: La Source, Eau Rouge, Les Combes, Stavelot, Bus Stop, pit straight.
      const shell = [0.40, 0.41, 0.45];
      grandstand(0.00, 1, 8, 46, shell, [0.50, 0.52, 0.56]);   // main grandstand, pit straight
      grandstand(0.995, 1, 8, 34, shell, [0.48, 0.50, 0.54]);  // pit straight extension (return leg)
      grandstand(0.02, 1, 8, 30, shell, [0.64, 0.18, 0.18]);   // La Source hairpin (red crowd)
      grandstand(0.02, -1, 9, 24, shell, [0.18, 0.38, 0.64]);  // La Source inner (blue crowd)
      grandstand(0.07, 1, 8, 34, shell, [0.18, 0.34, 0.60]);   // Eau Rouge / Raidillon
      grandstand(0.09, -1, 9, 26, shell, [0.68, 0.50, 0.18]);  // Raidillon crest, opposite bank
      // Raidillon crest grandstand + giant screen (s≈0.08, brief requirement)
      grandstand(0.08, 1, 10, 28, shell, [0.46, 0.48, 0.52]);  // Raidillon crest right (open seating)
      grandstand(0.16, 1, 8, 34, shell, [0.48, 0.50, 0.54]);   // Les Combes
      grandstand(0.55, -1, 9, 24, shell, [0.38, 0.44, 0.50]);  // Pouhon
      grandstand(0.78, 1, 8, 26, shell, [0.44, 0.46, 0.50]);   // Stavelot
      grandstand(0.92, 1, 8, 32, shell, [0.44, 0.46, 0.50]);   // Bus Stop chicane

      // --- Overhead gantries: start/finish line and the Kemmel timing point.
      // Dark grey steel structures spanning the track.
      gantry(0.00, 7.0, [0.22, 0.24, 0.28]);
      gantry(0.13, 6.5, [0.26, 0.28, 0.32]);
      gantry(0.92, 6.5, [0.26, 0.28, 0.32]);

      // --- Advertising hoardings lining the fast straights and braking zones.
      // Vibrant sponsor colors against the dark forest backdrop.
      [0.005, 0.04, 0.11, 0.14, 0.32, 0.50, 0.62, 0.78, 0.90, 0.94].forEach((s, i) => {
        const col = [[0.82, 0.18, 0.18], [0.14, 0.40, 0.76], [0.94, 0.74, 0.10],
                     [0.16, 0.58, 0.28], [0.88, 0.88, 0.90]][i % 5];
        billboard(Math.round(n * s) % n, 1, 8, 10, 3.4, col);
        if (hash(i * 23 + 7) > 0.38) billboard(Math.round(n * (s + 0.01)) % n, -1, 8, 9, 3.0, col);
      });

      // --- Guardrails: armco on the outside of the fast forest sweepers and the
      // approaches to the chicane, where cars actually run wide. Kept to targeted
      // runs (not the full lap) to stay within the vert budget.
      guardrail(0.18, 0.30, 1, 3.0, [0.66, 0.67, 0.70]);   // Malmedy / Rivage outside
      guardrail(0.40, 0.50, -1, 3.0, [0.66, 0.67, 0.70]);  // Pouhon entry inside
      guardrail(0.62, 0.72, 1, 3.0, [0.66, 0.67, 0.70]);   // Stavelot outside
      guardrail(0.86, 0.97, 1, 3.0, [0.66, 0.67, 0.70]);   // Blanchimont → Bus Stop outside

      // --- Catch / debris fences behind the grandstand zones and fast sections.
      fence(0.00, 0.10, 1, 4.0, 5.0, [0.55, 0.57, 0.60]);     // pit straight + La Source
      fence(0.05, 0.18, -1, 5.0, 5.0, [0.55, 0.57, 0.60]);    // Eau Rouge / Kemmel outside
      fence(0.85, 1.00, 1, 4.0, 5.0, [0.55, 0.57, 0.60]);     // Blanchimont / Bus Stop

      // --- Tyre walls stacked at the high-risk corner exits.
      tyreWall(0.015, 0.035, 1, 2.0, [0.85, 0.20, 0.18]);     // La Source exit
      tyreWall(0.055, 0.075, -1, 2.5, [0.92, 0.78, 0.16]);    // Eau Rouge apex
      tyreWall(0.155, 0.175, 1, 2.0, [0.18, 0.50, 0.86]);     // Les Combes
      tyreWall(0.535, 0.560, -1, 2.0, [0.85, 0.20, 0.18]);    // Pouhon
      tyreWall(0.905, 0.925, 1, 2.0, [0.92, 0.78, 0.16]);     // Bus Stop

      // --- Yellow-capped marshal posts dotted around the lap.
      every(110, (k) => {
        const side = hash(k * 33) < 0.5 ? -1 : 1;
        marshalPost(k, side, 4);
      });
      // Extra marshal posts flanking pit entry (s≈0.97) and Pouhon (s≈0.55).
      marshalPost(Math.round(n * 0.97) % n, -1, 4);
      marshalPost(Math.round(n * 0.97) % n, 1, 4);
      marshalPost(Math.round(n * 0.55) % n, -1, 4);

      // --- Eau Rouge: low concrete runoff wall boxes at the valley base (s≈0.06, left).
      // Grey-concrete barrier at the low point of the dip.
      {
        const kw = Math.round(n * 0.06) % n;
        place(kw, -1, 4, [1.0, 1.4, 22], [0.58, 0.58, 0.56]);
      }

      // --- TV camera towers (slim white masts) on outside of marquee corners.
      // Distinctive light-grey poles with camera boxes at the roof.
      [0.02, 0.07, 0.16, 0.55, 0.92].forEach((s) => {
        const k = Math.round(n * s) % n;
        const a = anchor(k, 1, 12);
        addCyl(out, a.c, 0.36, 12, [0.84, 0.85, 0.88], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 12.5), [1.8, 0.95, 1.4], [0.18, 0.18, 0.20], [a.r, a.u, a.t]);
      });

      // --- Raidillon giant-screen structure (brief: s≈0.08, mid distance).
      // Signature structure on the Raidillon crest; tall enough to loom over the grandstand.
      {
        const k = Math.round(n * 0.08) % n;
        const a = anchor(k, 1, 18);
        // Screen frame tower base (tapered column, sturdy grey steel)
        addFrustum(out, a.c, 3.4, 2.8, 15, [0.48, 0.48, 0.50], 8, [a.r, a.u, a.t]);
        // Screen panel (large dark rectangle mounted on top, slightly angled)
        addBox(out, vadd(a.c, a.u, 16.5), [8.4, 5.8, 0.7], [0.10, 0.10, 0.12], [a.r, a.u, a.t]);
        // Cross-beam supports (darker steel bracers)
        addCyl(out, vadd(a.c, a.u, 12.5), 0.28, 9, [0.42, 0.42, 0.45], 5, [a.r, a.u, a.t]);
        // Base footings
        addBox(out, vadd(a.c, a.u, 0.5), [6.0, 1.2, 6.0], [0.56, 0.56, 0.54], [a.r, a.u, a.t]);
      }

      // --- La Source hotel: iconic red-roofed structure at the La Source hairpin.
      // Warm terracotta walls with deep windows, distinctive landmark on the right.
      building(Math.round(n * 0.01) % n, 1, 35, 10, 12, 30, { wall: [0.76, 0.42, 0.24], window: [0.30, 0.28, 0.24], floor: 2 });

      // --- Denser Eau Rouge forest: extra close pines narrowing the sightline through the dip.
      // The signature feature — very tall dark pines crowding the apex/dip line.
      every(6, (k) => {
        const s = k / n;
        if (s < 0.04 || s > 0.14) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 79 + side * 11 + 17);
          // Taller, darker pines for drama
          pine(k, side, 4 + r * 8, 11 + r * 9, [0.07, 0.20, 0.10]);
          if (r > 0.45) pine(k, side, 14 + r * 20, 12 + r * 10, [0.08, 0.24, 0.11]);
        }
      });

      // --- Dense forest banks at mid-track (s≈0.40): continuous dark-green box masses.
      // Brief calls for "continuous dark-green box masses hemming the track" at fast forest sweepers.
      every(40, (k) => {
        const s = k / n;
        if (s < 0.35 || s > 0.50) return;  // Pouhon area and approach
        for (const side of [-1, 1]) {
          const r = hash(k * 97 + side * 19 + 23);
          if (r < 0.38) continue;
          const dist = 17 + r * 34, h = 14 + r * 12;
          pine(k, side, dist, h, [0.08 + r * 0.05, 0.26, 0.11]);
        }
      });

      // --- Extra Blanchimont forest depth (s≈0.80–0.95): tall pines on fast section.
      every(38, (k) => {
        const s = k / n;
        if (s < 0.78 || s > 0.98) return;
        for (const side of [-1, 1]) {
          const r = hash(k * 83 + side * 17 + 31);
          if (r < 0.42) continue;
          const dist = 16 + r * 28, h = 13 + r * 11;
          pine(k, side, dist, h, [0.09 + r * 0.05, 0.28, 0.13]);
        }
      });

      // --- Kemmel Straight billboard: on the uphill Kemmel drag.
      billboard(Math.round(n * 0.12) % n, -1, 8, 10, 3.4, [0.16, 0.42, 0.74]);

      // --- Blanchimont billboards: compress the visual width through the high-speed section.
      billboard(Math.round(n * 0.82) % n, 1, 8, 10, 3.4, [0.85, 0.12, 0.15]);
      billboard(Math.round(n * 0.85) % n, 1, 8, 10, 3.4, [0.15, 0.30, 0.82]);
      billboard(Math.round(n * 0.87) % n, 1, 8, 10, 3.4, [0.85, 0.12, 0.15]);

      // --- Pouhon interior guardrail: mirrored inside line to tighten the corner envelope.
      guardrail(0.50, 0.58, -1, 3.0, [0.66, 0.67, 0.70]);

      // --- Stavelot run-off + barrier boxes (brief: s≈0.78, near distance).
      // Brief specifies "Stavelot run-off + barrier boxes against treeline".
      {
        const k = Math.round(n * 0.78) % n;
        // Concrete run-off pad
        place(k, 1, 12, [18, 0.6, 26], [0.58, 0.58, 0.56]);
        // Barrier boxes at edge of run-off
        place(k, 1, 24, [8, 1.2, 20], [0.54, 0.54, 0.52]);
        place(Math.round(n * 0.80) % n, 1, 20, [8, 1.2, 16], [0.56, 0.56, 0.54]);
      }

      // --- Kemmel straight backdrop (s≈0.09–0.18): tall distant pines on the climb.
      every(32, (k) => {
        const s = k / n;
        if (s < 0.09 || s > 0.20) return;  // Kemmel ascent
        for (const side of [-1, 1]) {
          const r = hash(k * 91 + side * 13 + 37);
          if (r < 0.48) continue;
          const dist = 28 + r * 44, h = 14 + r * 10;
          tree(k, side, dist, h, [0.10 + r * 0.05, 0.31, 0.14]);
        }
      });

      // --- Increase forest barriers around fast sweepers for "hemming" effect.
      // Tall dark treelines at the edges of Stavelot/Blanchimont (brief: s≈0.40 and beyond).
      every(48, (k) => {
        const s = k / n;
        if ((s < 0.36 || s > 0.52) && (s < 0.75 || s > 0.99)) return;  // Pouhon and Blanchimont sections
        for (const side of [-1, 1]) {
          const r = hash(k * 101 + side * 29 + 41);
          if (r < 0.48) continue;
          const dist = 30 + r * 42, h = 15 + r * 13;
          tree(k, side, dist, h, [0.11 + r * 0.06, 0.33, 0.15]);
        }
      });
    },
  }
  );
})();
