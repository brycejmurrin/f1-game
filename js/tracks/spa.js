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
      const { out, n, px, pz, pyMin, hash, every, place, backdrop,
              addBox, addCyl, addCone, addFrustum, vadd, anchor, along, mountain, pine, tree, hedge,
              forestEdge, grandstand, building, tower, billboard, gantry, marshalPost,
              fence, guardrail, tyreWall } = api;

      // Ardennes forest palette — dark damp Belgian conifers
      const PINE_D  = [0.07, 0.24, 0.10];   // deep Ardennes conifer (spruce/fir)
      const PINE_M  = [0.09, 0.28, 0.12];   // mid conifer
      const LEAF    = [0.13, 0.34, 0.15];   // broadleaf accent (beech/oak)

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

      // --- Forested ridgeline backdrop: rolling green Ardennes hills on the horizon.
      // backdrop() with a green-dominant colour renders as a rounded organic mound,
      // not a flat slab. Placed every 64 nodes (wide spacing = few boxes total).
      every(64, (k) => {
        for (const side of [-1, 1]) {
          backdrop(k, side, 200 + hash(k * 13 + side) * 100, [110, 22, 90], [0.13, 0.30, 0.16]);
        }
      });

      // --- Ardennes pine forest: forestEdge() guarantees canopy clearance from
      // barriers and uses per-tree guards to suppress anything on the road.
      // Spa is 7 km — the LONGEST circuit. Keep total density LOW so SwiftShader
      // (CPU rasteriser, ~200× slower than GPU) can render all 25 scan frames
      // within the 180 s blank-scan timeout.
      //
      // Full-lap sparse fringe (density 0.12): just enough conifers to read as
      // an Ardennes forest at distance. Gap 18 m keeps all canopies well clear
      // of any barrier or grandstand — forestEdge adds the canopy radius on top.
      forestEdge(0.0, 1.0, -1, 18, { density: 0.12, hMin: 8, hMax: 15, col: PINE_D, col2: LEAF, pineFrac: 0.75 });
      forestEdge(0.0, 1.0,  1, 18, { density: 0.12, hMin: 8, hMax: 15, col: PINE_D, col2: LEAF, pineFrac: 0.75 });

      // --- Named Ardennes forest sections — denser where the track is hemmed by
      // close woodland. Each covers a specific stretch so density can be higher
      // without blowing the total primitive budget for this 7 km circuit.
      //
      // Eau Rouge / Raidillon valley + climb (s≈0.04–0.13):
      // The iconic forested gorge — tall dark spruce crowding the dip and the climb.
      forestEdge(0.04, 0.13, -1, 10, { density: 0.42, hMin: 10, hMax: 18, col: PINE_D, col2: PINE_M, pineFrac: 0.85 });
      forestEdge(0.04, 0.13,  1, 10, { density: 0.42, hMin: 10, hMax: 18, col: PINE_D, col2: PINE_M, pineFrac: 0.85 });
      // Kemmel Straight + hillside (s≈0.13–0.22):
      // Tall dark pines on the Kemmel ridge, reads as a forested hillside.
      forestEdge(0.13, 0.22, -1, 22, { density: 0.32, hMin: 12, hMax: 20, col: PINE_D, col2: LEAF,   pineFrac: 0.70 });
      forestEdge(0.13, 0.22,  1, 22, { density: 0.32, hMin: 12, hMax: 20, col: PINE_D, col2: LEAF,   pineFrac: 0.70 });
      // Pouhon / mid-section forest sweepers (s≈0.35–0.55):
      // Dense pine walls hemming the fast double-apex left-hander.
      forestEdge(0.35, 0.55, -1, 16, { density: 0.38, hMin: 10, hMax: 16, col: PINE_M, col2: LEAF,   pineFrac: 0.65 });
      forestEdge(0.35, 0.55,  1, 16, { density: 0.38, hMin: 10, hMax: 16, col: PINE_M, col2: LEAF,   pineFrac: 0.65 });
      // Blanchimont high-speed section (s≈0.78–0.98):
      // Towering conifers narrowing the visual channel through the fastest part of the lap.
      forestEdge(0.78, 0.98, -1, 20, { density: 0.35, hMin: 12, hMax: 20, col: PINE_D, col2: PINE_M, pineFrac: 0.80 });
      forestEdge(0.78, 0.98,  1, 20, { density: 0.35, hMin: 12, hMax: 20, col: PINE_D, col2: PINE_M, pineFrac: 0.80 });

      // --- Modern pit/paddock complex: long low white-grey mass on the pit straight,
      // with a stacked hospitality tier and a control tower at the start.
      // Clean, modern greys and dark windows for a contemporary facility.
      building(0, -1, 9, 14, 11, 64, { wall: [0.88, 0.89, 0.91], window: [0.32, 0.38, 0.44], floor: 5 });
      building(0, -1, 11, 12, 6, 50, { wall: [0.82, 0.84, 0.87], window: [0.28, 0.36, 0.42], floor: 3, setback: 2 });
      tower(Math.round(n * 0.985) % n, -1, 16, 9, { col: [0.86, 0.87, 0.90], cap: 4, capCol: [0.28, 0.34, 0.40], mast: 8 });
      {
        // Thin cantilever roof blade over the pit lane — raised to 13 m clearance
        // so the box top clears the gantry leg radius and avoids z-fighting with
        // the building top (building h=11, roof blade centre at 13 = 2 m gap).
        const a = anchor(0, -1, 20);
        addBox(out, vadd(a.c, a.u, 13.5), [16, 0.8, 60], [0.82, 0.84, 0.88], [a.r, a.u, a.t]);
      }

      // --- Lit window accents on the pit building (emissive-style warm panes).
      // These warm-lit boxes sit flush against the building face so they read as
      // interior illumination — useful in dawn/dusk light and night-preview screenshots.
      {
        const aW = anchor(0, -1, 9);   // same dist as main building inner face
        // Ground-floor window row: warm amber glow along the pit-lane face
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 9.5;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 2.4),
                 [0.18, 1.6, 3.6], [0.92, 0.78, 0.42], [aW.r, aW.u, aW.t]);
        }
        // Upper-floor window row: cooler blue-white office light
        for (let wi = 0; wi < 6; wi++) {
          const tOff = (wi - 2.5) * 9.5;
          addBox(out, vadd(vadd(aW.c, aW.t, tOff), aW.u, 6.8),
                 [0.18, 1.6, 3.6], [0.82, 0.86, 0.96], [aW.r, aW.u, aW.t]);
        }
      }

      // --- Lamp posts along the pit straight and key grandstand zones.
      // Steel mast + luminaire arm angled over the track — thin enough to be
      // cheap yet read clearly as trackside lighting infrastructure. Placed on
      // the pit-building side (left, side=-1) at the standard 14 m dist so they
      // clear the building face.  Spaced ~55 m so ~8–10 posts line the straight.
      along(0.97, 0.06, 55, (k) => {
        const a = anchor(k, -1, 14);
        // Mast: slim dark-grey pole
        addCyl(out, a.c, 0.22, 10, [0.26, 0.27, 0.30], 5, [a.r, a.u, a.t]);
        // Arm: short horizontal box projecting inward over the pit lane
        addBox(out, vadd(vadd(a.c, a.u, 10), a.r, 1.8),
               [4.0, 0.22, 0.22], [0.26, 0.27, 0.30], [a.r, a.u, a.t]);
        // Luminaire: warm white flat box at the arm tip — reads as a lamp head
        addBox(out, vadd(vadd(a.c, a.u, 9.7), a.r, 3.6),
               [1.6, 0.36, 0.9], [0.97, 0.94, 0.82], [a.r, a.u, a.t]);
      });

      // Additional lamp posts at La Source and Bus Stop grandstand zones
      // where visibility matters most. Side=1 (right/outside) mounted higher
      // on the forest bank.
      [0.02, 0.92].forEach((s) => {
        along(s - 0.015, s + 0.015, 40, (k) => {
          const a = anchor(k, 1, 12);
          addCyl(out, a.c, 0.20, 9, [0.28, 0.28, 0.31], 5, [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(a.c, a.u, 9), a.r, -1.6),
                 [3.4, 0.20, 0.20], [0.28, 0.28, 0.31], [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(a.c, a.u, 8.8), a.r, -2.9),
                 [1.4, 0.32, 0.8], [0.96, 0.93, 0.80], [a.r, a.u, a.t]);
        });
      });

      // --- Lone weathered old pit building on the original Kemmel straight
      // (s≈0.10, far left). Pushed to dist=42 so its inner face clears 42-6=36m
      // from the road edge — safely past any parallel track overlap.
      // Historic structure; aged cream-grey stone with small dark windows.
      building(Math.round(n * 0.10) % n, -1, 42, 12, 9, 40, { wall: [0.72, 0.70, 0.64], window: [0.26, 0.26, 0.24], floor: 4 });

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

      // --- Lit window accents on grandstand backs — long amber strips reading
      // as concourse lighting visible from the opposite side of the track.
      {
        const gsLit = [
          { s: 0.00, side: 1, gap: 8 + 7.5, len: 44 },   // pit straight stand back
          { s: 0.07, side: 1, gap: 8 + 7.5, len: 32 },   // Eau Rouge stand back
          { s: 0.92, side: 1, gap: 8 + 7.5, len: 30 },   // Bus Stop stand back
        ];
        for (const g of gsLit) {
          const k = Math.round(g.s * n) % n;
          const a = anchor(k, g.side, g.gap);
          // Concourse strip: warm amber low band
          addBox(out, vadd(a.c, a.u, 1.2),
                 [0.22, 0.9, g.len - 4], [0.90, 0.72, 0.34], [a.r, a.u, a.t]);
          // Upper strip: cooler white-blue press/broadcast level
          addBox(out, vadd(a.c, a.u, 8.4),
                 [0.22, 0.7, g.len - 6], [0.78, 0.84, 0.96], [a.r, a.u, a.t]);
        }
      }

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

      // --- Eau Rouge: low concrete runoff wall box at the valley base (s≈0.06, left).
      // Uses place() so it terrain-anchors correctly on the descent and never floats.
      // dist=6 puts the inner face 6 m beyond the road edge (safe clearance).
      place(Math.round(n * 0.06) % n, -1, 6, [1.0, 1.4, 22], [0.58, 0.58, 0.56]);

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
      // Components are vertically separated so they don't clip into each other:
      //   • base footings  : y = ground + 0.6  (half-height of 1.2 m slab)
      //   • column frustum : base = ground, top = ground + 15
      //   • cross-beam     : centre at y = ground + 8 (mid of column), offset laterally
      //   • screen panel   : centre at y = ground + 17 (2 m above column top)
      {
        const k = Math.round(n * 0.08) % n;
        const a = anchor(k, 1, 18);
        // Base footings — concrete pad at grade level
        addBox(out, vadd(a.c, a.u, 0.6), [6.0, 1.2, 6.0], [0.56, 0.56, 0.54], [a.r, a.u, a.t]);
        // Screen frame tower column (tapered, no overlap with footings — base starts at 0)
        addFrustum(out, vadd(a.c, a.u, 0), 3.4, 2.8, 15, [0.48, 0.48, 0.50], 8, [a.r, a.u, a.t]);
        // Cross-beam: lateral arm jutting out from the column mid-point — offset
        // on the r axis so it doesn't clip through the column body
        addBox(out, vadd(vadd(a.c, a.r, 4.2), a.u, 8.0),
               [5.0, 0.36, 0.36], [0.42, 0.42, 0.45], [a.r, a.u, a.t]);
        // Screen panel — 2 m clear above column top to avoid intersection
        addBox(out, vadd(a.c, a.u, 17.2), [8.4, 5.8, 0.7], [0.10, 0.10, 0.12], [a.r, a.u, a.t]);
        // Screen face: bright panel surface (slightly inset so it sits proud of the frame)
        addBox(out, vadd(a.c, a.u, 17.6), [7.6, 5.0, 0.22], [0.14, 0.46, 0.78], [a.r, a.u, a.t]);
      }

      // --- La Source hotel: iconic red-roofed structure at the La Source hairpin.
      // Warm terracotta walls with deep windows, distinctive landmark on the right.
      building(Math.round(n * 0.01) % n, 1, 35, 10, 12, 30, { wall: [0.76, 0.42, 0.24], window: [0.30, 0.28, 0.24], floor: 2 });

      // --- Kemmel Straight billboard: on the uphill Kemmel drag.
      billboard(Math.round(n * 0.12) % n, -1, 8, 10, 3.4, [0.16, 0.42, 0.74]);

      // --- Blanchimont billboards: compress the visual width through the high-speed section.
      billboard(Math.round(n * 0.82) % n, 1, 8, 10, 3.4, [0.85, 0.12, 0.15]);
      billboard(Math.round(n * 0.85) % n, 1, 8, 10, 3.4, [0.15, 0.30, 0.82]);
      billboard(Math.round(n * 0.87) % n, 1, 8, 10, 3.4, [0.85, 0.12, 0.15]);

      // --- Pouhon interior guardrail: mirrored inside line to tighten the corner envelope.
      guardrail(0.50, 0.58, -1, 3.0, [0.66, 0.67, 0.70]);

      // --- Stavelot run-off + barrier boxes (brief: s≈0.78, near distance).
      // Both use place() so they terrain-anchor on the embanked outer kerb rather
      // than sitting at a fixed global y. Boxes staggered laterally so they don't
      // intersect each other: inner pad at dist=12, outer barrier at dist=22.
      {
        const k78 = Math.round(n * 0.78) % n;
        const k80 = Math.round(n * 0.80) % n;
        // Concrete run-off pad — wide but thin, inner face at 12 m
        place(k78, 1, 12, [18, 0.6, 26], [0.58, 0.58, 0.56]);
        // Outer barrier boxes — clearly separated from pad (inner face at 22 m vs pad outer at 21 m)
        place(k78, 1, 22, [8, 1.2, 20], [0.54, 0.54, 0.52]);
        place(k80, 1, 22, [8, 1.2, 16], [0.56, 0.56, 0.54]);
      }
    },
  }
  );
})();
