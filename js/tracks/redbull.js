/* Apex 26 — RED BULL RING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.1875, // GPS-derived (OpenF1 2025, conf=0.310)
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    pal: { zenith: [0.18, 0.35, 0.65], horizon: [0.58, 0.68, 0.82], grass: [0.20, 0.48, 0.15], runoff: [0.44, 0.40, 0.32], fogDensity: 0.0012, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.96, 0.84], sunColor: [1, 0.94, 0.82] },
    segs: [
      { t: 0, l: 280 }, { t: -90, l: 100, h: 12 }, { t: 90, l: 90 }, { t: -100, l: 110, h: 8 }, { t: 80, l: 90 }, { t: 0, l: 220, h: -10 },
      { t: -70, l: 80 }, { t: 80, l: 90 }, { t: 0, l: 480, h: -10 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 80, l: 90 },
    ],
    // Steep alpine circuit (~65 m top-to-bottom): climb out of Turn 1, long
    // descent through the back of the lap.
    elevations: [{ s: 0.10, halfM: 240, rise: 10 }, { s: 0.40, halfM: 320, rise: -8 }],
    scenery: function (api) {
      const { out, n, px, pz, py, pyMin, hw, ds, hash, every, prop, place, addBox, vadd, mountain, peak, ridge, pine, tree, bush, hedge, grandstand, building, motorhome, tower, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, anchor, along, addCyl, addCone, addPrism, addPyramid, addFrustum, onTrack, groundYAt, backdrop, forestEdge } = api;
      const K = (s) => Math.round(s * n) % n;

      // --- Styrian Alps: two concentric rings of organic peaks.
      // Inner ring (210m out): dense dark-green foothills with rocky detail, moderate snow.
      // Outer ring (480m out): sparser, taller, whiter peaks for the dramatic far Alpine wall.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      const ranges = [
        { extra: 210, wMin: 160, hMin: 48, hVar: 56, count: 14, seg: 5, opts: { forest: [0.15, 0.28, 0.16], rock: [0.36, 0.34, 0.32], snow: [0.90, 0.92, 0.96], snowline: 0.75, rough: 0.40 } },
        { extra: 480, wMin: 280, hMin: 140, hVar: 100, count: 10, seg: 4, opts: { forest: [0.28, 0.38, 0.30], rock: [0.48, 0.50, 0.54], snow: [0.94, 0.95, 0.99], snowline: 0.50, rough: 0.32 } },
      ];
      for (const rg of ranges) {
        const ring = rad + rg.extra;
        const span = 2 * Math.PI * ring / rg.count;
        for (let i = 0; i < rg.count; i++) {
          const h = hash(i * 7 + rg.extra), j = hash(i * 19 + rg.extra + 3);
          const a = (i + (j - 0.5) * 0.35) / rg.count * 6.2832;
          const w = Math.max(rg.wMin + h * 110, span * 1.55);
          mountain(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
                   w, rg.hMin + h * rg.hVar, Object.assign({ seg: rg.seg, seed: i * 13 + rg.extra }, rg.opts));
        }
      }

      // --- Mid-ground Styrian rolling hills: backdrop() GREEN auto-renders as
      // organic rounded mounds — replaces the flat ridge() prisms for a softer look.
      // Two rings: closer foothills (lighter green) + farther wooded hillsides (darker).
      every(9, (k) => {
        const hv = hash(k * 31 + 7);
        if (hv < 0.25) return;
        // Closer green foothills 80–130 m out, wide and low (Styrian meadow rolls).
        backdrop(k, hv < 0.55 ? -1 : 1, 80 + hv * 50,
                 [90 + hv * 70, 28 + hv * 18, 55 + hv * 35],
                 [0.18 + hv * 0.06, 0.40 + hv * 0.06, 0.18]);
      });
      every(14, (k) => {
        const hv = hash(k * 53 + 19);
        if (hv < 0.30) return;
        // Farther wooded hills 160–240 m out, taller for layered Alpine depth.
        backdrop(k, hv < 0.58 ? -1 : 1, 160 + hv * 80,
                 [110 + hv * 80, 42 + hv * 28, 70 + hv * 40],
                 [0.14 + hv * 0.08, 0.32 + hv * 0.08, 0.15]);
      });

      // --- Alpine forest edges: forestEdge() replaces raw pine() loops —
      // canopy-clearance aware so trees never clip through guardrails/fences.
      // Sector 1 (start straight + T1 climb): left side forest backing the climb.
      forestEdge(0.0, 0.18, -1, 10, { density: 0.55, hMin: 9, hMax: 16,
        col: [0.10, 0.26, 0.13], col2: [0.18, 0.38, 0.18], pineFrac: 0.70 });
      // Right side approach and crest: mixed alpine, sparser to let hills show.
      forestEdge(0.0, 0.18, 1, 11, { density: 0.42, hMin: 8, hMax: 14,
        col: [0.12, 0.28, 0.14], col2: [0.20, 0.40, 0.18], pineFrac: 0.65 });

      // Sector 2 (T3 Remus descent + back straight): dense Alpine pine on both sides.
      forestEdge(0.20, 0.48, -1, 9, { density: 0.65, hMin: 10, hMax: 18,
        col: [0.09, 0.23, 0.11], col2: [0.16, 0.34, 0.16], pineFrac: 0.75 });
      forestEdge(0.20, 0.48, 1, 10, { density: 0.50, hMin: 9, hMax: 15,
        col: [0.11, 0.25, 0.12], col2: [0.18, 0.36, 0.17], pineFrac: 0.68 });

      // Sector 3 (long back straight + stadium): lighter mixed forest, let grandstands show.
      forestEdge(0.50, 0.70, -1, 10, { density: 0.45, hMin: 8, hMax: 14,
        col: [0.12, 0.28, 0.14], col2: [0.22, 0.42, 0.20], pineFrac: 0.60 });
      forestEdge(0.50, 0.70, 1, 10, { density: 0.38, hMin: 8, hMax: 13,
        col: [0.14, 0.30, 0.15], col2: [0.22, 0.42, 0.20], pineFrac: 0.58 });

      // Final sector / stadium bowl: sparse scattered trees at the margins.
      forestEdge(0.70, 0.97, -1, 12, { density: 0.30, hMin: 8, hMax: 13,
        col: [0.13, 0.28, 0.14], col2: [0.22, 0.40, 0.20], pineFrac: 0.60 });
      forestEdge(0.70, 0.97, 1, 12, { density: 0.25, hMin: 7, hMax: 12,
        col: [0.14, 0.30, 0.15], col2: [0.24, 0.42, 0.20], pineFrac: 0.55 });

      // ---------------- Track furniture (continuous, both sides) ----------------
      // Armco guardrail backed by catch fencing around the whole lap edge.
      guardrail(0.0, 1.0, -1, 3.2, [0.86, 0.86, 0.90]);
      guardrail(0.0, 1.0, 1, 3.2, [0.86, 0.86, 0.90]);
      fence(0.0, 1.0, -1, 4.2, 4.5, [0.74, 0.76, 0.80]);
      fence(0.0, 1.0, 1, 4.2, 4.5, [0.74, 0.76, 0.80]);

      // Big braking-zone tyre walls on the outside of the heavy stops (T1, T3, T4).
      const rbRed = [0.82, 0.10, 0.16], rbNavy = [0.10, 0.14, 0.40], rbYel = [0.95, 0.80, 0.10];
      tyreWall(0.08, 0.13, 1, 6.5, rbRed);    // outside Turn 1 (Niki Lauda)
      tyreWall(0.20, 0.25, 1, 6.5, rbYel);    // outside Turn 3 (Remus) crest
      tyreWall(0.32, 0.37, -1, 6.5, rbRed);   // outside Turn 4 (Schlossgold)
      tyreWall(0.72, 0.77, -1, 6.0, rbNavy);

      // Marshal posts spaced around the lap (orange-roofed huts + flag poles).
      for (const [s, side] of [[0.05, -1], [0.15, 1], [0.27, -1], [0.40, 1], [0.52, -1], [0.66, 1], [0.80, -1], [0.92, 1]]) {
        marshalPost(Math.round(n * s) % n, side, 5.5);
      }

      // Trackside advertising hoardings around the lap.
      for (const [s, side, col] of [
        [0.04, 1, rbRed], [0.12, 1, rbNavy], [0.18, -1, rbYel], [0.30, 1, rbRed],
        [0.44, -1, rbNavy], [0.58, 1, rbRed], [0.68, -1, rbYel], [0.82, 1, rbNavy], [0.88, -1, rbRed],
      ]) billboard(Math.round(n * s) % n, side, 7, 11, 3.4, col);

      // ---------------- The Wing — pit & paddock complex ----------------
      // Long low white pit building with thin cantilevered roof blade.
      prop(0, -1, 6, [11, 8, 70], [0.92, 0.93, 0.95]);
      {
        const a = anchor(0, -1, 10);
        addBox(out, vadd(a.c, a.u, 11), [14, 0.7, 66], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);  // roof blade
        // slim pillars under the blade — spaced along the building length
        for (let i = -2; i <= 2; i++) addCyl(out, vadd(a.c, a.t, i * 14), 0.3, 11, [0.70, 0.72, 0.76], 5, [a.r, a.u, a.t]);
        // night-ready: emissive light strip under the canopy edge (bright warm strip)
        addBox(out, vadd(vadd(a.c, a.r, -6.5), a.u, 10.4), [0.25, 0.18, 64], [1.0, 0.96, 0.80], [a.r, a.u, a.t]);
      }
      // Paddock hospitality blocks behind the pits — motorhome() gives the
      // real two-tier team-unit body + awning canopy instead of a flat
      // building() office-block mass. Also fixes k=0.04/0.96 being passed as
      // raw node indices instead of the fraction they clearly meant (anchor()
      // indexes track.rx[k] etc. directly, so a non-integer k silently missed).
      motorhome(K(0), -1, 26, 18, 9, 22, { wall: [0.88, 0.90, 0.93], window: [0.20, 0.30, 0.42] });
      motorhome(K(0.04), -1, 26, 16, 7, 18, { wall: [0.80, 0.82, 0.86], window: [0.22, 0.32, 0.42] });
      motorhome(K(0.96), -1, 26, 16, 8, 20, { wall: [0.86, 0.88, 0.92], window: [0.20, 0.30, 0.42] });
      // Race-control / media tower over the start.
      tower(0.01, -1, 18, 9, 26, { col: [0.80, 0.82, 0.86], cap: true, capCol: rbNavy, mast: 7 });

      // Start/finish gantry + a second scoring gantry down the straight.
      gantry(0.005, 7.5, [0.12, 0.13, 0.16]);
      gantry(0.045, 7.0, [0.12, 0.13, 0.16]);

      // ---------------- Lamp posts (day visibility / night readiness) ----------------
      // Double-head aluminium lamp posts every ~60 m around the pit straight & stadium.
      // Warm white lamp heads give a daytime aluminium look and double as night sources.
      along(0.96, 0.08, 60, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 3.8);
          if (onTrack(a.c[0], a.c[2], 2)) return;
          // pole
          addCyl(out, a.c, 0.12, 9.5, [0.74, 0.74, 0.78], 5, [a.r, a.u, a.t]);
          // cross-arm
          addBox(out, vadd(a.c, a.u, 9.5), [3.0, 0.18, 0.18], [0.70, 0.70, 0.74], [a.r, a.u, a.t]);
          // two lamp heads (warm white for Styrian sun effect at dusk)
          for (const ox of [-1.2, 1.2]) {
            addBox(out, vadd(vadd(a.c, a.r, ox), a.u, 9.2), [0.55, 0.28, 0.55], [0.98, 0.96, 0.82], [a.r, a.u, a.t]);
          }
        }
      });
      // Grandstand lamp posts flanking the stadium bowl (s≈0.70–0.95).
      along(0.70, 0.96, 80, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 18);
          if (onTrack(a.c[0], a.c[2], 3)) return;
          addCyl(out, a.c, 0.18, 20, [0.70, 0.70, 0.74], 5, [a.r, a.u, a.t]);
          // floodlight head cluster
          addBox(out, vadd(a.c, a.u, 20), [4.5, 0.5, 1.2], [0.95, 0.92, 0.78], [a.r, a.u, a.t]);
          addBox(out, vadd(vadd(a.c, a.t, 0.8), a.u, 19.6), [4.5, 0.5, 1.2], [0.95, 0.92, 0.78], [a.r, a.u, a.t]);
        }
      });

      // ---------------- Signature landmarks ----------------
      // Giant charging-bull statue on the green hillside above the lower sector,
      // framed by a tall white archway (the Bull Plaza icon).
      // All parts are anchored from ground level (a.c) upward — no floating.
      {
        const kb = Math.round(n * 0.10) % n, a = anchor(kb, -1, 70);
        const white = [0.90, 0.90, 0.93], dark = [0.10, 0.10, 0.12];
        // Arch posts: center at h/2 = 12 above ground, height 24 → base sits at ground.
        addBox(out, vadd(vadd(a.c, a.r, -11), a.u, 12), [3, 24, 3], white, [a.r, a.u, a.t]);   // arch post L
        addBox(out, vadd(vadd(a.c, a.r, 11), a.u, 12), [3, 24, 3], white, [a.r, a.u, a.t]);    // arch post R
        addBox(out, vadd(a.c, a.u, 24), [26, 3, 4.5], white, [a.r, a.u, a.t]);                  // lintel
        // Pedestal: half-height = 1.5, center at 1.5 → base at ground level (flush).
        addBox(out, vadd(a.c, a.u, 1.5), [12, 3, 7], [0.55, 0.56, 0.58], [a.r, a.u, a.t]);
        // Bull body: top of pedestal = y=3, body half-height=3.25, center at y=6.25.
        addBox(out, vadd(a.c, a.u, 6.25), [13, 6.5, 5], dark, [a.r, a.u, a.t]);                 // body
        // Head: sits atop the body front; body top = y=9.75, head center ~y=9.
        addBox(out, vadd(vadd(a.c, a.t, 7), a.u, 9.0), [4.5, 5, 3.5], dark, [a.r, a.u, a.t]);  // head
        // Horns: above head, head top ≈ y=11.5.
        addPrism(out, vadd(vadd(vadd(a.c, a.t, 9.5), a.u, 11.5), a.r, -1.4), [1, 2.6, 0.6], white, [a.t, a.u, a.r]); // horn L
        addPrism(out, vadd(vadd(vadd(a.c, a.t, 9.5), a.u, 11.5), a.r, 1.4), [1, 2.6, 0.6], white, [a.t, a.u, a.r]);  // horn R
        // Legs: four pillars from ground (y=0) upward; center at y=2.5, height=5.
        for (const o of [-4, 4]) for (const f of [-3.5, 4.5]) {
          addBox(out, vadd(vadd(vadd(a.c, a.r, o), a.t, f), a.u, 2.5), [1.4, 5, 1.4], dark, [a.r, a.u, a.t]);
        }
        // Small night-accent: a golden spotlight on the pedestal face.
        addBox(out, vadd(vadd(a.c, a.t, -4.5), a.u, 3.2), [0.4, 0.3, 0.3], [1.0, 0.88, 0.40], [a.r, a.u, a.t]);
      }

      // Sponsor / energy-drink towers — tall slim branded pylons by the start area
      // and at the stadium. Red-cap tops, multiple for visual richness.
      tower(0.01, 1, 30, 6.5, 40, { col: rbNavy, seg: 6, cap: true, capCol: rbRed, mast: 6 });
      tower(0.03, -1, 32, 5.5, 36, { col: [0.95, 0.60, 0.15], seg: 6, cap: true, capCol: rbRed, mast: 5 });
      tower(0.50, -1, 34, 5.5, 32, { col: rbRed, seg: 6, cap: true, capCol: [0.95, 0.95, 0.97], mast: 5 });
      tower(0.90, 1, 30, 6, 36, { col: [0.92, 0.93, 0.95], seg: 6, cap: true, capCol: rbRed, mast: 5 });
      tower(0.96, -1, 28, 5, 32, { col: rbNavy, seg: 6, cap: true, capCol: [0.95, 0.65, 0.10], mast: 5 });

      // Big freestanding sponsor billboards (oversized hoardings on the hills).
      billboard(Math.round(n * 0.18) % n, -1, 20, 20, 8, [0.95, 0.60, 0.15]);
      billboard(Math.round(n * 0.22) % n, 1, 22, 22, 7, rbRed);
      billboard(Math.round(n * 0.62) % n, -1, 24, 20, 6, rbNavy);
      billboard(Math.round(n * 0.74) % n, 1, 18, 18, 7, [0.70, 0.70, 0.72]);

      // ---------------- Grandstands with crowds + emissive lighting accents ----------------
      // Concentrated at the start straight, T3 (Remus) crest, mid-sector
      // sweepers and the final stadium bowl. Red Bull red/navy seat blocks.
      const shell = [0.40, 0.41, 0.46];
      // Main straight (Stehtribüne / start) — a long banked run of stands.
      grandstand(0.985, 1, 8, 40, shell, rbRed);
      grandstand(0.005, 1, 8, 40, shell, rbNavy);
      grandstand(0.04, 1, 9, 30, shell, rbRed);
      grandstand(0.07, 1, 10, 26, shell, rbNavy);
      // Turn 1 / Niki Lauda climb.
      grandstand(0.11, 1, 9, 26, shell, rbRed);
      // Turn 3 (Remus) crest — the high point.
      grandstand(0.21, 1, 8, 30, shell, rbNavy);
      grandstand(0.25, 1, 9, 24, shell, rbRed);
      // Mid-sector descent sweepers.
      grandstand(0.34, -1, 8, 24, shell, rbRed);
      grandstand(0.50, -1, 8, 26, shell, rbNavy);
      grandstand(0.62, 1, 8, 22, shell, rbRed);
      // Final sector dropping into the stadium bowl.
      grandstand(0.70, 1, 8, 26, shell, rbNavy);
      grandstand(0.72, -1, 8, 28, shell, rbRed);
      grandstand(0.76, -1, 9, 24, shell, rbNavy);
      grandstand(0.80, 1, 8, 22, shell, rbRed);
      grandstand(0.86, -1, 8, 26, shell, rbRed);
      grandstand(0.88, 1, 8, 34, shell, rbNavy);
      grandstand(0.92, 1, 9, 28, shell, rbRed);
      grandstand(0.95, 1, 10, 22, shell, rbNavy);

      // Emissive grandstand fascia strips — bright warm accent on roof slab
      // underside so stands read lit from the trackside camera at dusk/night.
      for (const [s, side] of [
        [0.985, 1], [0.005, 1], [0.04, 1], [0.07, 1],
        [0.11, 1], [0.21, 1], [0.25, 1],
        [0.70, 1], [0.72, -1], [0.76, -1], [0.88, 1], [0.92, 1], [0.95, 1],
      ]) {
        const k = Math.round(n * s) % n;
        const a = anchor(k, side, 13);
        // Slim bright strip just below the roof edge — warm amber/white.
        addBox(out, vadd(a.c, a.u, 12.6), [0.22, 0.16, 28], [1.0, 0.92, 0.70], [a.r, a.u, a.t]);
      }

      // --- Meadow foreground: pastoral hedges frame the lap in key zones ---
      every(36, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 113 + side) > 0.68) continue;
          const d = 22 + hash(k * 127 + side) * 18;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 10)) return;
          hedge(k / n, k / n + 0.004, side, d, 0.9 + hash(k * 131 + side) * 0.3, [0.20, 0.44, 0.18]);
        }
      });

      // --- Remus corner crest landmark tower (s≈0.30) — golden pylon marking descent ---
      // Base disc anchored at ground; main cylinder starts at ground, rises 50m.
      {
        const kR = Math.round(n * 0.30) % n;
        const rA = anchor(kR, 1, 22);
        // Base plinth: thin cylinder just proud of terrain (not sunk below ground).
        addCyl(out, rA.c, 4.0, 1.2, [0.62, 0.60, 0.56], 8, [rA.r, rA.u, rA.t]);
        // Main golden column rising from the plinth top.
        addCyl(out, vadd(rA.c, rA.u, 1.2), 2.6, 48.8, [0.96, 0.84, 0.18], 8, [rA.r, rA.u, rA.t]);
        // Observation ring / balcony band near top.
        addBox(out, vadd(rA.c, rA.u, 46), [7, 1.0, 7], [0.70, 0.68, 0.64], [rA.r, rA.u, rA.t]);
        // Red spire cap on top of the column.
        const rTop = vadd(rA.c, rA.u, 50);
        addCone(out, rTop, 3.8, 8, [0.90, 0.08, 0.14], 8, [rA.r, rA.u, rA.t]);
        // Night-ready accent: warm light ring just below the observation deck.
        addBox(out, vadd(rA.c, rA.u, 44.5), [6.5, 0.25, 6.5], [1.0, 0.88, 0.50], [rA.r, rA.u, rA.t]);
      }

      // --- Back-sector descent framing hills (s≈0.28–0.32): the circuit's dramatic
      // high point before the long descent — Styrian rolling hills rendered as organic
      // backdrop() mounds instead of sharp ridge prisms.
      {
        for (const [sfrac, side, distOff, szW, szH] of [
          [0.28, -1,  0, 100, 26], [0.28,  1,  0, 90, 22],
          [0.30, -1, 12, 115, 30], [0.30,  1, 10, 95, 24],
          [0.32, -1,  0, 100, 28], [0.32,  1,  0, 85, 22],
        ]) {
          const kb = Math.round(n * sfrac) % n;
          backdrop(kb, side, 55 + distOff, [szW, szH, 60], [0.20 + hash(kb * 47 + side) * 0.05, 0.38, 0.20]);
        }
      }

      // --- Styrian natural spectator hill (s≈0.52 mid-sector right-hander).
      // The Red Bull Ring's famous grassy spectator hillsides — replaced the flat
      // boxy bank with backdrop() rounded green mounds for an organic silhouette.
      // Three staggered mounds: near/mid/far to give the slope real depth.
      {
        const kBank = Math.round(n * 0.52) % n;
        backdrop(kBank, 1, 32, [80, 18, 55], [0.28, 0.52, 0.22]);   // near bank face
        backdrop(kBank, 1, 55, [95, 24, 65], [0.22, 0.44, 0.18]);   // mid slope
        backdrop(kBank, 1, 80, [110, 30, 75], [0.18, 0.38, 0.15]);  // upper hillside
        // Sparse pines crowning the hilltop behind the bank.
        forestEdge(0.49, 0.56, 1, 78, { density: 0.35, hMin: 10, hMax: 16,
          col: [0.10, 0.24, 0.12], col2: [0.16, 0.32, 0.14], pineFrac: 0.78 });
      }

      // --- Orange Army billboard near stadium bowl (s≈0.87, Dutch orange) ---
      billboard(Math.round(n * 0.87) % n, -1, 12, 8, 4, [1.0, 0.65, 0.0]);

      // --- Styrian Alpine farmhouse silhouette (s≈0.55) ---
      // Reduced depth to avoid over-wide building warning (w=12, d=15 → 12<15*2.5).
      building(Math.round(n * 0.55) % n, -1, 18, 12, 6, 15,
        { wall: [0.48, 0.50, 0.52], window: [0.30, 0.35, 0.40], floor: 2 });
      // Alpine farmhouse roof (A-frame prism above the building).
      {
        const kFarm = Math.round(n * 0.55) % n;
        const aFarm = anchor(kFarm, -1, 24);
        addPrism(out, vadd(aFarm.c, aFarm.u, 6), [14, 4, 16], [0.36, 0.20, 0.14], [aFarm.r, aFarm.u, aFarm.t]);
      }

      // --- Pit-lane exit lamp posts (tight cluster at s≈0.02) ---
      // A pair of overhead light booms framing the pit exit.
      {
        const kPit = Math.round(n * 0.02) % n;
        for (const side of [-1, 1]) {
          const aPit = anchor(kPit, side, 5.5);
          if (!onTrack(aPit.c[0], aPit.c[2], 2)) {
            addCyl(out, aPit.c, 0.14, 8, [0.72, 0.72, 0.76], 5, [aPit.r, aPit.u, aPit.t]);
            addBox(out, vadd(aPit.c, aPit.u, 8), [2.4, 0.2, 0.2], [0.68, 0.68, 0.72], [aPit.r, aPit.u, aPit.t]);
            addBox(out, vadd(aPit.c, aPit.u, 7.8), [1.6, 0.32, 0.6], [1.0, 0.94, 0.76], [aPit.r, aPit.u, aPit.t]);
          }
        }
      }
    },
  }
  );
})();
