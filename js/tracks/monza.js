/* Apex 26 — MONZA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.0125, // GPS-derived (OpenF1 2025, conf=0.316)
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 8,
    pal: {
      zenith:        [0.20, 0.40, 0.70],
      horizon:       [0.76, 0.68, 0.52],
      sun:           [1.0,  0.92, 0.66],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.46, 0.50, 0.56],
      ambientGround: [0.24, 0.23, 0.17],
      fogColor:      [0.68, 0.64, 0.54],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    segs: [
      { t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
      { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
      { t: 0, l: 360 }, { t: 150, l: 220 },
    ],
    // Royal-park circuit is nearly flat — a gentle rise through the Lesmos.
    elevations: [{ s: 0.55, halfM: 320, rise: 7 }],
    scenery: function (api) {
      const { out, n, ds, pyMin, place, prop, backdrop, groundPlane, groundYAt, every,
        onTrack, hash, pine, tree, bush, hedge, ridge, forestEdge, building, motorhome, tower,
        grandstand, billboard, gantry, marshalPost, wall, fence, guardrail, tyreWall,
        addBox, addCyl, addCone, addPrism, addFrustum, anchor, along, vadd,
        px, pz } = api;
      const K = (s) => Math.round(s * n) % n;

      // Royal-park greens — warm Italian afternoon palette.
      const PINE_D = [0.08, 0.26, 0.12], PINE = [0.10, 0.30, 0.14], PINE_L = [0.13, 0.34, 0.17];
      const LEAF = [0.18, 0.45, 0.20], LEAF_L = [0.24, 0.50, 0.24], LEAF_D = [0.15, 0.38, 0.18];
      const GRAVEL = [0.68, 0.60, 0.42];

      // =====================================================================
      // 1. ROYAL PARK FOREST — broadleaf + umbrella-pine corridor.
      //    every() node-step approach keeps geometry within SwiftShader budget.
      //    Ranks A-D provide depth; Lesmo section adds extra close-canopy trees.
      // =====================================================================
      // Rank A — front pines close to verge (umbrella pines).
      every(13, (k) => {
        const h = hash(k * 31);
        if (h < 0.08) return;
        const side = h < 0.5 ? -1 : 1;
        pine(k, side, 9 + h * 6, 18 + h * 13, h < 0.3 ? PINE_D : PINE);
        if (h > 0.25) pine(k, -side, 10 + h * 7, 16 + h * 12, PINE);
      });
      // Rank B — broadleaf trees interleaved with pines (oaks, maples, ashes).
      every(15, (k) => {
        const h = hash(k * 53 + 9);
        if (h < 0.15) return;
        const side = h < 0.5 ? -1 : 1;
        tree(k, side, 12 + h * 8, 11 + h * 8, h < 0.4 ? LEAF_D : LEAF);
        if (h > 0.48) tree(k, -side, 13 + h * 9, 10 + h * 7, LEAF_L);
      });
      // Rank C — set-back taller pines (deep-park wall).
      every(18, (k) => {
        const h = hash(k * 41 + 3);
        if (h < 0.20) return;
        const side = h < 0.5 ? -1 : 1;
        const hVar = 22 + h * 16 + (hash(k * 137) > 0.6 ? 4 : 0);
        pine(k, side, 24 + h * 18, hVar, PINE_D);
        if (h > 0.55) pine(k, -side, 30 + h * 16, 24 + h * 14, PINE_D);
      });
      // Rank D — outermost broadleaf rank blending to backdrop.
      every(24, (k) => {
        const h = hash(k * 67 + 17);
        if (h < 0.35) return;
        tree(k, h < 0.5 ? -1 : 1, 42 + h * 30, 13 + h * 10, LEAF_D);
        if (h > 0.7) tree(k, h > 0.85 ? -1 : 1, 55 + h * 22, 11 + h * 8, LEAF);
      });
      // Low underbrush / shrubs along the verge for ground texture.
      every(11, (k) => {
        const h = hash(k * 97 + 23);
        if (h < 0.50) return;
        bush(k, h < 0.77 ? -1 : 1, 6.5 + h * 4,
             h < 0.66 ? [0.16, 0.36, 0.16] : [0.20, 0.42, 0.18]);
        if (h > 0.82) bush(k, h > 0.91 ? -1 : 1, 5 + h * 3, [0.18, 0.40, 0.17]);
      });
      // Clipped park hedge banding through several sweeps for a manicured edge.
      hedge(0.06, 0.18, -1, 20, 6, [0.12, 0.33, 0.16]);
      hedge(0.06, 0.18,  1, 21, 6, [0.12, 0.33, 0.16]);
      hedge(0.32, 0.46, -1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.66, 0.78,  1, 22, 5, [0.13, 0.34, 0.17]);
      hedge(0.82, 0.94, -1, 24, 5, [0.12, 0.33, 0.16]);
      // Lesmo 1 & 2 (s≈0.43–0.54) — famous woodland curves: extra pines to
      // reinforce the canopy through these fast sweeps. every(5)≈20m spacing
      // keeps SwiftShader safe while creating a convincing tree tunnel effect.
      every(5, (k) => {
        const s = k / n;
        if (s < 0.43 || s > 0.54) return;
        const h = hash(k * 13 + 7);
        pine(k, -1, 12 + h * 2, 14 + h * 10, PINE_D);
        pine(k,  1, 11 + h * 2, 13 + h *  9, PINE);
        if (h > 0.55) tree(k, -1, 16 + h * 3, 13 + h * 9, LEAF_D);
        if (h > 0.70) tree(k,  1, 15 + h * 3, 12 + h * 8, LEAF);
      });

      // =====================================================================
      // 2. PIT STRAIGHT / START–FINISH — grandstands, tifosi, podium, pit boxes
      //    Tribuna Centrale (main historic stand), facing stand, new modernized
      //    pit building with permanent roof, modernized grandstand islands.
      // =====================================================================
      // Tribuna Centrale — long stepped main grandstand (pit-side, left).
      // Historic stand built to seat 3000, now modernized with island design.
      // Warmed greys for Italian sun.
      grandstand(0.005, -1, 10, 160, [0.57, 0.59, 0.61], [0.76, 0.28, 0.24]);
      // Secondary lower stand behind Centrale (historic structure).
      grandstand(0.955, -1, 10, 110, [0.56, 0.57, 0.60], [0.74, 0.28, 0.24]);
      // Facing grandstand across the straight (right side) — modernized.
      grandstand(0.02, 1, 12, 120, [0.54, 0.56, 0.59], [0.74, 0.30, 0.26]);
      // Red trim band fronting the main stand (Italian colors).
      prop(K(0.01), -1, 8, [2, 1.6, 130], [0.80, 0.16, 0.14]);
      // Accent green band (park integration) below red trim.
      prop(K(0.00), -1, 8.3, [1.8, 0.8, 128], [0.30, 0.54, 0.28]);

      // ── Lit window strips on the main grandstand back-shell (night-ready) ──
      // These bright amber bands read as interior lighting at dusk/night while
      // remaining plausible sun-lit glazing by day.
      {
        const winLit = [0.98, 0.88, 0.52];  // warm amber glow
        const gsA = anchor(K(0.005), -1, 17.5);
        // Upper window band
        addBox(out, vadd(gsA.c, gsA.u, 10.5), [0.22, 1.6, 158], winLit, [gsA.r, gsA.u, gsA.t]);
        // Lower window band
        addBox(out, vadd(gsA.c, gsA.u, 5.5),  [0.22, 1.2, 158], winLit, [gsA.r, gsA.u, gsA.t]);

        const gsB = anchor(K(0.955), -1, 17.5);
        addBox(out, vadd(gsB.c, gsB.u, 10.0), [0.22, 1.4, 108], winLit, [gsB.r, gsB.u, gsB.t]);

        const gsC = anchor(K(0.02), 1, 19.5);
        addBox(out, vadd(gsC.c, gsC.u, 9.5), [0.22, 1.4, 118], winLit, [gsC.r, gsC.u, gsC.t]);
      }

      // Pit building / garages along the pit wall (right side).
      // Modernized pit complex: refurbished garages with improved facilities.
      const pitWall = [0.86, 0.86, 0.84];
      for (let i = 0; i < 8; i++) {
        const s = 0.965 + i * 0.0085;
        building(K(s), 1, 14, 16, 9, 11,
          { wall: pitWall, window: [0.30, 0.34, 0.40], floor: 4.5, roof: true });
      }
      // New permanent tensile roofing structure over the pit building.
      // Raised to full-height permanent canopy. Anchored via `out` (not anchor().out).
      {
        const aPit = anchor(K(0.99), 1, 18);
        // Main roof panel — permanent hard structure, slightly warmed grey.
        addBox(out, vadd(aPit.c, aPit.u, 11), [5.2, 0.8, 72], [0.86, 0.84, 0.80], [aPit.r, aPit.u, aPit.t]);
        // ── Lit under-canopy strip (warm amber at night, subtly bright at day) ──
        addBox(out, vadd(aPit.c, aPit.u, 10.2), [4.8, 0.25, 70], [0.96, 0.88, 0.56], [aPit.r, aPit.u, aPit.t]);
        // Support pillars — raised clear of the roof panel so they don't interpenetrate it.
        // Pillar top is at y+9 (below the roof at y+11), leaving a visible gap.
        for (let j = 0; j < 4; j++) {
          const s2 = 0.965 + j * 0.025;
          const a2 = anchor(K(s2), 1, 16);
          // Pillar from ground to y+9; roof panel starts at y+10.6 so no intersection.
          addCyl(out, a2.c, 0.35, 9, [0.72, 0.70, 0.68], 8, null);
        }
      }
      // Podium / timing tower at the line — iconic white tower with red cap.
      // Historic 1922 structure, recently modernized. Tall mast for timing/announcements.
      tower(K(0.0), 1, 13, 6, 46, { col: [0.92, 0.92, 0.90], cap: true, capCol: [0.78, 0.14, 0.12], mast: 8 });
      // Podium base platform (marble-look step for award ceremony).
      {
        const aPod = anchor(K(0.0), 1, 11);
        addBox(out, vadd(aPod.c, aPod.u, 1), [14, 0.8, 12], [0.88, 0.88, 0.90], [aPod.r, aPod.u, aPod.t]);
      }
      // Start gantry spanning the straight.
      gantry(0.0, 9, [0.14, 0.14, 0.17]);
      gantry(0.98, 8.5, [0.14, 0.14, 0.17]);

      // Pit-straight furniture: armco both sides, debris fence behind left stand.
      guardrail(0.93, 0.07, 1, 3.5, [0.85, 0.85, 0.88]);
      fence(0.95, 0.06, -1, 8, 4, [0.74, 0.76, 0.80]);
      // Sponsor billboards lining the main straight.
      for (const s of [0.94, 0.97, 0.015, 0.04]) billboard(K(s), -1, 7, 11, 4.5, [0.92, 0.88, 0.30]);
      for (const s of [0.95, 0.03]) billboard(K(s), 1, 26, 12, 5, [0.88, 0.84, 0.80]);

      // ── Lamp posts along the pit straight — night-ready / day-plausible ──
      // Placed on both sides of the straight (s=0.93..0.07). Slender dark poles
      // with a bright warm lamp head that reads as a luminaire day or night.
      along(0.93, 0.07, 28, (k) => {
        for (const side of [-1, 1]) {
          const gap = side < 0 ? 6 : 5;   // left slightly further (stand side)
          const ap = anchor(k, side, gap);
          // Pole — slender dark steel column, 10 m tall
          addCyl(out, ap.c, 0.12, 10, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
          // Horizontal arm stub
          addBox(out, vadd(ap.c, ap.u, 9.8), [side < 0 ? 1.8 : 1.8, 0.18, 0.18],
                 [0.18, 0.18, 0.20], [ap.r, ap.u, ap.t]);
          // Lamp head — warm white, slightly yellow-tinted
          addBox(out, vadd(vadd(ap.c, ap.r, side * 0.9), ap.u, 9.65),
                 [1.0, 0.45, 0.55], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
        }
      });

      // =====================================================================
      // 3. CHICANES & PARABOLICA — gravel traps, kerb trim, tyre walls, stands
      // =====================================================================
      // Variante del Rettifilo (s~0.04) — heavy braking, big gravel, tyre wall.
      groundPlane(K(0.04), 1, 5, [24, 34], GRAVEL);
      tyreWall(0.03, 0.055, 1, 4, [0.88, 0.20, 0.18]);
      grandstand(0.05, -1, 12, 76, [0.56, 0.58, 0.60], [0.72, 0.30, 0.26]);
      marshalPost(K(0.045), 1, 10);

      // Variante della Roggia (s~0.30) — shaded chicane, gravel both sides, fog detail.
      groundPlane(K(0.30), -1, 6, [22, 28], GRAVEL);
      groundPlane(K(0.305), 1, 5, [20, 26], GRAVEL);
      tyreWall(0.29, 0.315, -1, 4, [0.20, 0.40, 0.85]);
      grandstand(0.30, 1, 13, 70, [0.55, 0.57, 0.59], [0.70, 0.30, 0.26]);
      // Thin drifting fog boxes under tree shade (Roggia's signature element).
      const fogCol = [0.76, 0.74, 0.68];   // warm tan-grey fog
      for (let i = 0; i < 3; i++) {
        const sf = 0.28 + i * 0.025;
        const kf = K(sf);
        const af = anchor(kf, hash(kf) < 0.5 ? -1 : 1, 25 + hash(kf * 3) * 15);
        addBox(out, vadd(af.c, af.u, 2.5), [14, 2.4, 22], fogCol, [af.r, af.u, af.t]);
      }
      marshalPost(K(0.31), -1, 9);

      // Lesmo 1 & 2 (s~0.45–0.52) — tight woodland curves, gravel + tyre.
      groundPlane(K(0.46), 1, 5, [18, 26], GRAVEL);
      groundPlane(K(0.51), 1, 5, [18, 24], GRAVEL);
      tyreWall(0.45, 0.47, 1, 4, [0.85, 0.78, 0.20]);
      marshalPost(K(0.48), 1, 9);

      // Variante Ascari (s~0.78) — triple chicane, gravel run-offs, grandstand.
      groundPlane(K(0.78), -1, 6, [28, 40], GRAVEL);
      groundPlane(K(0.795), 1, 6, [24, 32], GRAVEL);
      tyreWall(0.77, 0.80, -1, 4, [0.88, 0.20, 0.18]);
      grandstand(0.78, -1, 14, 80, [0.56, 0.58, 0.60], [0.72, 0.30, 0.26]);
      marshalPost(K(0.785), 1, 9);

      // Parabolica / Curva Alboreto (s~0.88–0.93) — wide outer gravel, big arc stand.
      groundPlane(K(0.90), -1, 8, [50, 110], GRAVEL);
      grandstand(0.905, 1, 14, 96, [0.55, 0.57, 0.59], [0.74, 0.32, 0.28]);
      tyreWall(0.885, 0.92, -1, 6, [0.88, 0.20, 0.18]);
      marshalPost(K(0.91), 1, 11);
      // Sponsor hoardings around the Parabolica outside.
      for (const s of [0.87, 0.89, 0.91]) billboard(K(s), -1, 12, 13, 5, [0.90, 0.86, 0.30]);

      // Catch fences behind the major spectator zones.
      fence(0.03, 0.06, 1, 7, 4, [0.74, 0.76, 0.80]);
      fence(0.295, 0.32, 1, 8, 4, [0.74, 0.76, 0.80]);
      fence(0.77, 0.80, -1, 9, 4, [0.74, 0.76, 0.80]);
      fence(0.89, 0.93, 1, 9, 4, [0.74, 0.76, 0.80]);

      // Marshal posts sprinkled around the rest of the lap.
      for (const s of [0.12, 0.20, 0.38, 0.58, 0.66, 0.84, 0.96]) {
        marshalPost(K(s), hash(K(s)) < 0.5 ? -1 : 1, 8.5);
      }

      // =====================================================================
      // 4. SOPRAELEVATA — old steep banked-oval ruin landmark (s~0.50–0.58 L)
      //    80% gradient concrete bank built from a fan of leaning prism/box
      //    segments, weathered grey with cracks and moss-green streaks. Built
      //    1954, unused for decades, tree roots cracking the surface. Placed
      //    well off-track in the infield/park so it reads as a historic relic.
      // =====================================================================
      (function buildBanking() {
        // Refined weathered concrete tones: main grey, darker in shadows, moss-green streaks
        const conc = [0.66, 0.64, 0.60], concDk = [0.54, 0.52, 0.49], moss = [0.36, 0.48, 0.32];
        const crackCol = [0.50, 0.48, 0.44]; // darker cracks/shadows
        // Anchor the structure in the park to the LEFT of the Lesmo area.
        const a = anchor(K(0.535), -1, 95);
        // Lay the banking as a gentle arc of N tilted panels.
        const N = 16, arcSpan = 1.9, radius = 120;
        // Base Y is the ground level at this anchor point.
        const baseY = a.c[1];

        // ── Pillar heights — computed first so we can size panels to clear them ──
        // Pillars: ground → pillarH. Panels: ground → ground + panelH.
        // To avoid interpenetration the panel base must sit AT OR ABOVE pillarH,
        // OR the panel must be positioned so its lowest extent is above pillar top.
        // Strategy: panels are centered at baseY + h*0.5 (half the slab height),
        // so their bottom edge is at baseY. Pillars are also baseY-based.
        // We offset panels upward slightly (baseY + 0.4) so the bottom clears ground
        // and pillars run from baseY (ground) to pillarH — they share the lower
        // region but panels are WIDER laterally, not overlapping pillar centres.
        // Pillars are placed at the arc midpoints between panels (every 2nd i)
        // at a slight inward offset, so their cylinder footprint doesn't hit panels.

        for (let i = 0; i < N; i++) {
          const f = i / (N - 1);
          const ang = -arcSpan / 2 + f * arcSpan;
          // centre of this panel out along the arc (in r/t plane)
          const ox = Math.sin(ang) * radius, oz = (1 - Math.cos(ang)) * radius;
          const cx = a.c[0] + a.r[0] * ox + a.t[0] * oz;
          const cz = a.c[2] + a.r[2] * ox + a.t[2] * oz;
          if (onTrack(cx, cz, 18)) continue;
          // tilt the panel so its top leans outward → banked look.
          const owx = a.r[0] * Math.sin(ang) + a.t[0] * Math.cos(ang);
          const owz = a.r[2] * Math.sin(ang) + a.t[2] * Math.cos(ang);
          const owl = Math.hypot(owx, owz) || 1;
          const od = [owx / owl, 0, owz / owl];
          const tilt = 0.65; // 80% gradient
          const upv = [od[0] * tilt, 1, od[2] * tilt];
          const ul = Math.hypot(upv[0], upv[1], upv[2]);
          const u = [upv[0] / ul, upv[1] / ul, upv[2] / ul];
          // forward along the arc (tangent)
          const tfx = a.r[0] * Math.cos(ang) - a.t[0] * Math.sin(ang);
          const tfz = a.r[2] * Math.cos(ang) - a.t[2] * Math.sin(ang);
          const tfl = Math.hypot(tfx, tfz) || 1;
          const fw = [tfx / tfl, 0, tfz / tfl];
          const rr = od; // right = outward
          const h = 11 + (i % 3) * 1.5;
          const col = (i % 4 === 0) ? concDk : conc;
          // Banked slab: center elevated to baseY + h*0.5 so bottom sits at baseY.
          // Shifted up by 0.4 m so the slab bottom clears the ground plane cleanly.
          addBox(out, [cx, baseY + h * 0.5 + 0.4, cz], [8.5, h, 14], col, [rr, u, fw]);
          // Moss streak band on the face (algae from decades of weathering).
          if (i % 2 === 0)
            addBox(out, [cx + od[0] * 0.7, baseY + h * 0.42 + 0.4, cz + od[2] * 0.7],
                   [0.8, h * 0.55, 13], moss, [rr, u, fw]);
          // Weathering cracks: vertical stress lines from tree roots and freeze-thaw.
          if (i % 3 === 1) {
            addBox(out, [cx + od[0] * 0.25, baseY + h * 0.5 + 0.4, cz + od[2] * 0.25],
                   [0.18, h * 0.75, 12.5], crackCol, [rr, u, fw]);
          }
        }

        // Crumbling support pillars along the base of the bank.
        // Pillars are placed at every-other arc position, offset INWARD from the
        // panel face by 1.5 m so they don't interpenetrate the slab bodies.
        for (let i = 0; i < N; i += 2) {
          const f = i / (N - 1);
          const ang = -arcSpan / 2 + f * arcSpan;
          const ox = Math.sin(ang) * radius, oz = (1 - Math.cos(ang)) * radius;
          // Inward offset: move the pillar 1.8 m toward the arc centre
          // so its radius (1.2 m) clears the inner face of the panel slab.
          const inOx = Math.sin(ang) * (radius - 1.8);
          const inOz = (1 - Math.cos(ang)) * (radius - 1.8);
          const cx = a.c[0] + a.r[0] * inOx + a.t[0] * inOz;
          const cz = a.c[2] + a.r[2] * inOx + a.t[2] * inOz;
          if (onTrack(cx, cz, 6)) continue;
          const pillarH = 7 + (i % 4) * 1.0;  // slightly shorter — tops well below slab centre
          // Start pillar at ground level (baseY) — no negative offset to avoid floating.
          addCyl(out, [cx, baseY, cz], 1.1, pillarH, concDk, 8, null);
          // Weathered/crumbling moss detail on pillar — clamped to pillar body.
          if (i % 4 === 0) {
            const mossH = pillarH * 0.38;
            const mossY = baseY + pillarH * 0.58;  // upper third of pillar
            addCyl(out, [cx + (hash(i) - 0.5) * 0.3, mossY, cz + (hash(i * 2) - 0.5) * 0.3],
                   0.35, mossH, moss, 6, null);
          }
        }
      })();

      // =====================================================================
      // 5. PARK STRUCTURES — Villa Reale, paddock buildings, ornamental lakes
      // =====================================================================
      // Villa Reale — cream neoclassical block in the park (s~0.62 R far).
      building(K(0.62), 1, 70, 64, 24, 30, { wall: [0.87, 0.81, 0.67], window: [0.70, 0.64, 0.50], floor: 6 });
      // ── Lit window bands on Villa Reale for night-ready depth ──
      {
        const aVR = anchor(K(0.62), 1, 70 + 32);  // face of building
        const winVR = [0.96, 0.86, 0.52];
        addBox(out, vadd(aVR.c, aVR.u, 9),  [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
        addBox(out, vadd(aVR.c, aVR.u, 17), [0.28, 1.4, 62], winVR, [aVR.r, aVR.u, aVR.t]);
      }
      // Two flanking wings.
      building(K(0.605), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });
      building(K(0.635), 1, 72, 30, 16, 22, { wall: [0.85, 0.79, 0.65], window: [0.68, 0.62, 0.48] });

      // Paddock / hospitality buildings behind the pits (left, s~0.97–0.02).
      // Modern containerized/modular hospitality modules, white/light grey with dark windows.
      for (let i = 0; i < 4; i++) {
        const s = 0.93 + i * 0.022;
        building(K(s), -1, 40, 24, 12, 18,
          { wall: [0.80, 0.80, 0.82], window: [0.32, 0.36, 0.44], floor: 4.5, roof: true });
      }
      // ── Lit window bands on paddock hospitality buildings ──
      {
        const winPad = [0.92, 0.82, 0.46];  // warm golden amber
        for (let i = 0; i < 4; i++) {
          const s = 0.93 + i * 0.022;
          const aP = anchor(K(s), -1, 40 + 12);
          addBox(out, vadd(aP.c, aP.u, 5.5), [0.2, 1.0, 22], winPad, [aP.r, aP.u, aP.t]);
          addBox(out, vadd(aP.c, aP.u, 9.5), [0.2, 1.0, 22], winPad, [aP.r, aP.u, aP.t]);
        }
      }
      // Motorhome row in the paddock (was a single flat coloured box per unit).
      every(40, (k) => {
        const h = hash(k * 71 + 31);
        if (h < 0.5) return;
        const s = k / n;
        if (s > 0.10 && s < 0.90) return;   // only behind pit/paddock
        motorhome(k, -1, 55 + h * 10, 10, 4, 6, { wall: [0.6 + h * 0.3, 0.6, 0.62] });
      });

      // Ornamental park lakes (reflective blue slabs).
      groundPlane(K(0.40), 1, 95, [180, 230], [0.30, 0.50, 0.70]);
      groundPlane(K(0.24), -1, 90, [140, 170], [0.28, 0.48, 0.68]);
      // A few lakeside broadleaf clusters.
      for (const [s, sd] of [[0.40, 1], [0.24, -1]]) {
        for (let i = 0; i < 4; i++) tree(K(s + (i - 2) * 0.01), sd, 70 + i * 8, 12 + i, LEAF_L);
      }

      // =====================================================================
      // 6. MILAN SKYLINE — distant faint towers on the horizon (s~0.96 R far)
      //    Hazed, cool-grey silhouette suggesting urban sprawl far from the park.
      // =====================================================================
      const kmilan = K(0.96);
      for (let i = 0; i < 7; i++) {
        building(kmilan, 1, 210 + i * 28, 16, 36 + i * 10, 16,
          { wall: [0.62 + i * 0.015, 0.66 + i * 0.015, 0.72 + i * 0.015], window: [0.52, 0.56, 0.62] });
      }
      // ── Milan skyline lit windows (warm night-ready haze) ──
      {
        const winMi = [0.88, 0.78, 0.46];
        for (let i = 0; i < 7; i++) {
          const h = 36 + i * 10;
          const aMi = anchor(kmilan, 1, 210 + i * 28 + 8);
          addBox(out, vadd(aMi.c, aMi.u, h * 0.55), [0.3, h * 0.08, 14], winMi, [aMi.r, aMi.u, aMi.t]);
          addBox(out, vadd(aMi.c, aMi.u, h * 0.28), [0.3, h * 0.06, 14], winMi, [aMi.r, aMi.u, aMi.t]);
        }
      }

      // =====================================================================
      // 7. CONTINUOUS FOREST BACKDROP — unbroken low canopy wall ringing the lap
      //    Multi-layer forest rings at 120m, 185m, 260m create immersive deep park.
      //    Represents the 688-hectare Parco di Monza's dense perimeter woodlands.
      // =====================================================================
      const cx = px.reduce((a, b) => a + b, 0) / n, cz = pz.reduce((a, b) => a + b, 0) / n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      // [extraRadius, count, ridgeLen, ridgeW, hMin, hVar, colour]
      for (const [extra, count, len, w, hMin, hVar, col] of [
        [120, 62, 90, 25, 10, 5.5, [0.16, 0.36, 0.20]],   // near treeline, dense
        [185, 52, 108, 28, 12, 6.5, [0.13, 0.33, 0.17]],  // mid forest band
        [260, 44, 128, 32, 14, 7.5, [0.11, 0.30, 0.15]],  // far hazed forest
      ]) {
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const r = rad + extra + h * 28;
          const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
          if (onTrack(tx, tz, 30)) continue;
          ridge(tx, tz, pyMin, a + 1.5708, len, w, hMin + h * hVar, col);
        }
      }

      // =====================================================================
      // 8. ENHANCED SCENERY — wooded hills backdrop, dense Lesmo canopy,
      //    improved Parabolica stands, Italian kerb colours, tifosi flags.
      // =====================================================================

      // 8a. Extra backdrop wooded hills — two near rings of ridge prisms
      //     at 80–110 m and 145–185 m beyond the track envelope, staggered
      //     so the park horizon looks organic and unbroken. Reuses cx/cz/rad
      //     computed in section 7.
      {
        // Near ring — warmer green (80–110 m out)
        for (let i = 0; i < 12; i++) {
          const ang = i / 12 * 6.2832, h = hash(i * 3 + 99);
          const r = rad + 80 + h * 24;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 28)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 30 + h * 16, 20 + h * 8,
                14 + h * 8, [0.14, 0.34, 0.16]);
        }
        // Mid ring — slightly darker/hazed (145–185 m out)
        for (let i = 0; i < 10; i++) {
          const ang = (i + 0.5) / 10 * 6.2832, h = hash(i * 7 + 199);
          const r = rad + 145 + h * 30;
          const tx = cx + Math.cos(ang) * r, tz = cz + Math.sin(ang) * r;
          if (onTrack(tx, tz, 32)) continue;
          ridge(tx, tz, pyMin, ang + 1.5708, 36 + h * 18, 24 + h * 10,
                16 + h * 10, [0.11, 0.29, 0.13]);
        }
      }

      // 8b. Expand Parabolica grandstand — two extra sections widening the arc.
      // Most iconic turn at Monza with largest crowd presence.
      grandstand(0.875, 1, 14, 80, [0.55, 0.57, 0.59], [0.74, 0.32, 0.28]);
      grandstand(0.935, 1, 14, 80, [0.55, 0.57, 0.59], [0.74, 0.32, 0.28]);
      // Support plinths underneath stands — placed at groundYAt so they don't float.
      for (const s of [0.875, 0.935]) {
        const kp = K(s);
        const ap = anchor(kp, 1, 20);
        // Plinth sits on the ground (ap.c is ground level), extends 1.2 m up.
        addBox(out, vadd(ap.c, ap.u, 0.6), [8, 1.2, 80], [0.58, 0.56, 0.54], [ap.r, ap.u, ap.t]);
      }
      // ── Lit window bands on Parabolica stands ──
      {
        const winPar = [0.98, 0.88, 0.52];
        for (const s of [0.875, 0.905, 0.935]) {
          const ap = anchor(K(s), 1, 21.5);
          addBox(out, vadd(ap.c, ap.u, 10.0), [0.22, 1.3, 94], winPar, [ap.r, ap.u, ap.t]);
        }
      }

      // 8c. Red/white Italian kerb stripes on start straight (pit-wall side, s=0.0–0.07).
      {
        const kerbR = [0.88, 0.16, 0.12], kerbW = [0.94, 0.94, 0.92];
        for (let i = 0; i < 18; i++) {
          const sFrac = i * (0.07 / 18);
          const k = K(sFrac);
          const a = anchor(k, -1, 4.5);
          const col = (i % 2 === 0) ? kerbR : kerbW;
          addBox(out, vadd(a.c, a.u, 0.25), [0.9, 0.5, 3.2], col, [a.r, a.u, a.t]);
        }
      }

      // 8d. Italian tifosi atmosphere — red banners near the start/finish.
      billboard(K(0.01), 1, 32, 16, 7, [0.92, 0.14, 0.12]);
      billboard(K(0.02), 1, 32, 16, 7, [0.92, 0.14, 0.12]);
      billboard(K(0.005), 1, 30, 15, 6, [0.94, 0.18, 0.16]);
      billboard(K(0.01), -1, 28, 12, 8, [0.90, 0.12, 0.10]);

      // 8e. Pine silhouette ring — adds natural texture to near canopy.
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * 6.2832, h = hash(i * 11 + 5);
        const r = rad + 100 + h * 55;
        const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
        if (onTrack(tx, tz, 30)) continue;
        ridge(tx, tz, pyMin, a, 20, 18, 14 + h * 10, PINE_D);
      }

      // 8f. Park furniture details — lake-edge vegetation clusters.
      for (const [s, sd, colL] of [[0.40, 1, LEAF_L], [0.24, -1, LEAF_L]]) {
        for (let i = 0; i < 5; i++) {
          const si = i - 2;
          tree(K(s + si * 0.01), sd, 72 + i * 8, 15 + i * 0.8, colL);
        }
      }

      // ── 8g. Track-perimeter lamp posts at key corner exits / chicane entries ──
      // A lighter presence than the pit-straight cluster — one post per marshal zone.
      for (const [s, side, gap] of [
        [0.04,  1, 9],   // Rettifilo exit right
        [0.30, -1, 8],   // Roggia left
        [0.48,  1, 9],   // Lesmo right
        [0.78,  1, 9],   // Ascari right
        [0.91,  1, 12],  // Parabolica right
      ]) {
        const k = K(s);
        const ap = anchor(k, side, gap);
        // Pole
        addCyl(out, ap.c, 0.14, 11, [0.18, 0.18, 0.20], 6, [ap.r, ap.u, ap.t]);
        // Lamp head — warm white
        addBox(out, vadd(ap.c, ap.u, 10.7), [1.1, 0.5, 0.6], [0.98, 0.94, 0.72], [ap.r, ap.u, ap.t]);
      }
    },
  }
  );
})();
