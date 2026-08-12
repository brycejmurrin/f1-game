/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/track/tracks.js engine
   (palette resolved there from `night`, geometry from js/track/geo-paths.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline; = trace vertex 0.
    // Was 0.8000, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    // This circuit's RACING-space scenery, dressingExclusions and corner
    // boards were authored against the OLD line. Naming it here moves the
    // line without dragging the dressed world round the lap with it.
    sceneryStartFrac: 0.8000,
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    sceneryTheme: "night-event",
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      // Qatar owns its sparse palms/scrub; generic foliage muddies the open desert.
      { kind: "foliage", s0: 0, s1: 1 },
      // …and it owns its LIGHTING outright. The shared furniture pass hangs an
      // 8 m street-lamp column every ~28 m on BOTH sides of every circuit that
      // does not opt out — 386 of them here, 35 148 vertices, 10% of Qatar's
      // whole prop budget. Lusail is 20 km out on open hamada: there is no
      // street to light, and the scenery() callback below already stands ~200
      // purpose-built 46-50 m Musco masts (floodMastRing + the S/F run + the
      // three TV-corner pairs). The generic columns are a second, shorter,
      // duplicate lighting line under the one thing that makes this venue
      // recognisable. Geometry only: streetLamp() registers no point light —
      // track.lampPosts is filled by the separate generic MAST pass, which is
      // the "floodlights" kind and is deliberately NOT excluded here, so the
      // night lighting is byte-identical without them. The Musco helpers pass
      // light:false so they stay visual identity and do not double the pools.
      { kind: "lamps", s0: 0, s1: 1 },
    ],
    lengthKm: 5.4,
    sunAzimBias: -0.30,   // Losail's late-afternoon sun hangs low to the NE-facing main straight
    baseHW: 8,
    // Warm pal.runoff = tan sand beyond the green verge (brief / COL.desertSand)
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, concrete: [0.17, 0.17, 0.19], runoff: [0.72, 0.58, 0.38], grass: [0.48, 0.36, 0.22] },
    // Lusail is a fast, flowing MotoGP-bred layout: the long sweepers carry real
    // camber (3-4°) so they can be taken flat, the slower links less so.
    bankZones: [
      { frac: 0.0415, angleDeg: 3.0, widthM: 90 },
      { frac: 0.1914, angleDeg: 3.5, widthM: 110 },
      { frac: 0.4199, angleDeg: 4.0, widthM: 170 },
      { frac: 0.4636, angleDeg: 4.0, widthM: 140 },
      { frac: 0.6217, angleDeg: 3.0, widthM: 110 },
      { frac: 0.7404, angleDeg: 4.0, widthM: 180 },
      { frac: 0.8487, angleDeg: 3.5, widthM: 150 },
    ],
    // Desert plain — genuinely gentle, but not the dead 0.0 m the trace shipped
    // with. ~6.5 m of long-wavelength undulation, nothing over ~1.5 %.
    // (s = SOURCE fraction. With the line corrected to 0.0 that shift is the
    // identity, so these are racing fractions too.)
    elevations: [
      { s: 0.05, halfM: 550, rise: 3.5 },
      { s: 0.42, halfM: 700, rise: 5.5 },
      { s: 0.68, halfM: 350, rise: -1.0 },
    ],
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
    scenery: function (api) {
      const { out, MAT, n, px, pz, pyMin, night, hash, vadd, every,
        place, backdrop, anchor, addBox, addCyl, addFrustum,
        palm, building, fence, wall, mountain, guardrail, tyreWall,
        billboard, marshalPost, gantry, tower, bush, along,
        modelGroup, groundPatch, floodMast, floodMastRing, circuitKit,
        bankedKerbStrip, sponsorHoarding, bleacher, acacia } = api;
      const K = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:qatar:hospitality", frac: 0.86, side: -1, gap: 85,
          size: [18, 9, 34], modules: 4, required: true,
        });
        // Dress-pass addition 1: a compact modern paddock operations campus
        // beyond pit entry. The two bounded facilities read as service/support
        // infrastructure without filling the open desert sectors.
        circuitKit.serviceCompound({
          id: "kit:qatar:paddock-service", frac: 0.895, side: -1, gap: 72,
          size: [24, 7, 42], vehicles: 8, required: true,
        });
        circuitKit.recoveryBay({
          id: "kit:qatar:recovery-bay", frac: 0.845, side: -1, gap: 58,
          size: [16, 6, 20], required: true,
        });
        circuitKit.marshalShelter({
          id: "kit:qatar:marshal-shelter", frac: 0.76, side: 1, gap: 30,
          size: [6, 3, 5], required: true,
        });
      }

      // ---- Palette (NIGHT desert) ----
      const DUNE   = [0.76, 0.64, 0.46], DUNE_N = [0.56, 0.48, 0.36];
      const SAND   = [0.64, 0.52, 0.36], SAND_D = [0.45, 0.36, 0.24];
      const STEEL  = [0.13, 0.13, 0.16];
      const FLOOD  = night ? [1.22, 1.28, 1.40] : [0.96, 1.00, 1.06];
      const LAMP   = night ? [1.08, 1.12, 1.20] : [0.88, 0.90, 0.94];
      const POOL   = night ? [0.82, 0.86, 0.96] : [0.66, 0.68, 0.72];
      const WIN_WARM = [0.88, 0.72, 0.32];
      const WIN_COOL = [0.52, 0.68, 0.88];
      const BEACON = [0.72, 0.90, 0.98];
      const FROND  = [0.12, 0.28, 0.12];
      const GRASS  = [0.20, 0.42, 0.22];
      const WHITE  = [0.94, 0.94, 0.92];
      const AD = [
        [0.85, 0.18, 0.16], [0.16, 0.36, 0.72], [0.92, 0.74, 0.14],
        [0.10, 0.62, 0.42], [0.90, 0.90, 0.88], [0.62, 0.18, 0.55],
      ];

      // Legacy tall flood tower — kept only for S/F hero densification when
      // floodMast is unavailable; shared floodMastRing is the primary identity.
      const floodTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const base = a.c;
        addCyl(out, base, 0.42, h - 4, STEEL, 6, b);
        addCyl(out, vadd(base, a.u, h - 5), 0.60, 5, STEEL, 6, b);
        addBox(out, vadd(base, a.u, h - 1.0), [9.0, 0.40, 0.50], LAMP, b);
        addBox(out, vadd(base, a.u, h - 2.2), [7.4, 0.32, 0.40], LAMP, b);
        for (const dx of [-3.8, 3.8]) {
          const sc = vadd(vadd(base, a.u, h - 1.6), a.r, dx);
          addBox(out, sc, [0.28, 1.4, 0.28], LAMP, b);
        }
        for (const dx of [-3.4, -1.1, 1.1, 3.4]) {
          const lc = vadd(vadd(base, a.u, h - 0.4), a.r, dx);
          addBox(out, lc, [1.8, 2.0, 1.6], FLOOD, b);
        }
        addBox(out, vadd(base, a.u, h + 0.6), [9.2, 0.28, 1.6], FLOOD, b);
      };
      const lightPool = (k, side, gap, r) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, vadd(a.c, a.u, 0.05), r, 0.07, POOL, 10, b);
      };
      // Arabic-script signage. Every venue in this game signs itself in Latin
      // block capitals via billboard()/sponsorHoarding(), which is a large part
      // of why the four floodlit desert/street circuits read as one place.
      // Arabic is a CONNECTED script: one unbroken baseline stroke with
      // ascenders rising off it and diacritic dots above and below. That
      // horizontal-run-plus-verticals shape is legible as Arabic at any
      // distance and at any resolution, without a glyph atlas — which is the
      // whole point, since the eye only ever reads the rhythm from a car.
      // Right-to-left, so the tallest ascender group sits at the RIGHT end.
      const arabicSign = (k, side, gap, w, h, ink, panel) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        if (typeof api.onTrack === "function" && api.onTrack(a.c[0], a.c[2], 3)) return;
        const lift = h * 0.5 + 2.2;
        const c = vadd(a.c, a.u, lift);
        // Board + posts
        addBox(out, c, [0.22, h, w], panel, b);
        for (const dz of [-w * 0.4, w * 0.4])
          addCyl(out, vadd(a.c, a.t, dz), 0.16, lift - h * 0.4, STEEL, 4, b);
        // Baseline stroke — the connecting rasm, proud of the panel face.
        const face = vadd(c, a.r, -side * 0.16);
        addBox(out, vadd(face, a.u, -h * 0.10), [0.06, h * 0.11, w * 0.86], ink, b);
        // Ascenders (alif / lam / kaf) — a few tall strokes, uneven spacing.
        const asc = [0.40, 0.26, 0.05, -0.22, -0.36];
        for (let i = 0; i < asc.length; i++) {
          const tall = 0.30 + hash(k * 3.1 + i * 7.7) * 0.34;
          addBox(out, vadd(vadd(face, a.t, asc[i] * w), a.u, h * (tall * 0.5 - 0.04)),
                 [0.06, h * tall, w * 0.035], ink, b);
        }
        // Diacritic dots — above and below the baseline; this is what stops the
        // run reading as a plain underline.
        for (const [dz, dy] of [[0.33, 0.24], [0.12, 0.26], [-0.05, -0.28], [-0.30, 0.22]])
          addBox(out, vadd(vadd(face, a.t, dz * w), a.u, h * dy),
                 [0.06, h * 0.09, w * 0.030], ink, b);
      };
      // Lusail's stands are long, low Tilke slabs. The generic grandstand model
      // carries dense individual spectators, which made Qatar's overlapping
      // crescent segments dominate the whole track's prop budget. Keep the
      // silhouette with one atomic, terrain-anchored shell per segment.
      const qatarStand = (id, s, side, gap, len, shell, crowd, required) => {
        const depth = 15, h = 18;
        const a = anchor(K(s), side, gap + depth / 2), b = [a.r, a.u, a.t];
        return modelGroup(id, {
          center: vadd(a.c, a.u, (h + 1) / 2),
          size: [depth + 4, h + 1, len + 2],
          basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, h * 0.28), [depth, h * 0.56, len], shell, b);
          // The crowd band is buried inside the shell and reads ONLY through its
          // trackward face, so that face has to clear the shell's. It used to sit
          // at depth*0.34 with half-width depth*0.16 — summing to exactly
          // depth*0.50, i.e. dead flush with the shell, for ANY depth. Two large
          // same-facing faces at zero gap fight at every distance, and at up to
          // 2000 m2 each these were the biggest z-fight in the game: the stand
          // wall that fills the right of frame on the pit straight. 6 cm of
          // standoff holds to ~550 m, past where fog takes over.
          addBox(stage,
            vadd(vadd(a.c, a.u, h * 0.62), a.r, -side * (depth * 0.34 + 0.06)),
            [depth * 0.32, h * 0.48, len * 0.94], crowd, b);
          addBox(stage, vadd(a.c, a.u, h), [depth + 3, 0.7, len + 1.5], WHITE, b);
          addBox(stage,
            vadd(vadd(a.c, a.u, h * 0.96), a.r, -side * (depth * 0.52)),
            [0.25, 0.45, len * 0.90], FLOOD, b);
          for (const dz of [-len * 0.42, len * 0.42]) {
            addBox(stage,
              vadd(vadd(vadd(a.c, a.u, h * 0.5), a.r, side * depth * 0.45), a.t, dz),
              [0.55, h, 0.55], STEEL, b);
          }
        }, { required: !!required });
      };
      // Per-family shell tints for the 7 non-main stands (T1, T2/T3, T16),
      // mirroring STAND_SETS.qatar in js/track/scenery-data.js — the same
      // ["sandstone", "steel", "concrete"] rotation grandstandEx() draws
      // from, blended halfway back to the baseline Tilke grey. Lusail's real
      // slabs are uniform, so this is deliberately a subtle warm/cool/pale
      // rotation between stand groups, not a livery rainbow.
      const SHELL_SANDSTONE = [0.58, 0.55, 0.50];
      const SHELL_STEEL     = [0.44, 0.45, 0.50];
      const SHELL_CONCRETE  = [0.51, 0.52, 0.53];

      // ---- LOW SAND-DUNE RING (culled from 3 tall rocky rings → 2 low rings) ----
      (function duneRing() {
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
        cx /= n; cz /= n;
        let rad = 0;
        for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
        for (const [extra, wMin, hMin, count, sand, dark] of [
          [200, 140, 4,  22, SAND,   SAND_D],
          [360, 200, 7,  16, DUNE,   DUNE_N],
        ]) {
          const ring = rad + extra;
          for (let i = 0; i < count; i++) {
            const a  = i / count * 6.2832 + hash(i * 3 + extra) * 0.18;
            const hf = hash(i * 7 + extra);
            const rr = ring + (hash(i * 5 + extra) - 0.5) * extra * 0.5;
            mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                     wMin + hf * wMin * 0.9, hMin + hf * hMin * 0.5,
                     { seg: 6, seed: i * 4 + extra, rough: 0.32, snowline: 1.4,
                       forest: sand, rock: dark, snow: dark });
          }
        }
      })();

      // ================= 1. FLOODLIGHT RING — primary Qatar identity =========
      // Lusail's 3,600-lamp Musco installation is the single thing that makes
      // this venue recognisable from any corner: a continuous ring of masts
      // TALLER than anything else on the calendar (the real ones stand ~44 m,
      // against ~30-36 m for the floodlit street circuits). The height is the
      // read, not the count — a 38 m mast at 34 m out sits inside the same
      // visual band as Jeddah's and Baku's poles, which is exactly the sameness
      // this pass exists to break. 46 m puts the lamp bar clearly above every
      // grandstand roof and every dune on the horizon.
      const MAST_H = 46, MAST_H_SF = 50;
      if (typeof floodMastRing === "function") {
        // light:false — generic floodlights dressing still owns night pools;
        // these Musco towers are visual identity only.
        floodMastRing(90, { h: MAST_H, dist: 34, cool: true, pool: true, light: false });
        // Extra densification on the televised start/finish kilometre.
        // 88 m, not 45. THREE mast lines overlap on this stretch: the 90 m ring
        // above, the engine's own light-bearing mast pass (~44 m stride, the
        // one that actually fills track.lampPosts), and this run. At 45 m that
        // put a mast every ~22 m of straight — denser than the real Musco
        // installation and 6 510 vertices for a row nobody can resolve at
        // 300 km/h. At 88 m the S/F kilometre still carries visibly more steel
        // than the rest of the lap, which is the point of the densification.
        along(0.86, 0.14, 88, (k) => {
          if (typeof floodMast === "function") {
            floodMast(k, -1, 32, { h: MAST_H_SF, cool: true, pool: true, light: false });
            floodMast(k,  1, 36, { h: MAST_H_SF, cool: true, pool: true, light: false });
          }
        });
      } else {
        every(90, (k) => {
          for (const side of [-1, 1]) {
            const gap = 34 + hash(k * 11 + side) * 4;
            floodTower(k, side, gap, 36 + hash(k * 13) * 4);
            lightPool(k, side, gap - 2, 8);
          }
        });
        for (const s of [0.0, 0.015, 0.03, 0.045, 0.88, 0.91, 0.94, 0.97]) {
          for (const side of [-1, 1]) {
            floodTower(K(s), side, 34, 38);
            lightPool(K(s), side, 32, 8);
          }
        }
      }

      // ================= APEX KERBS — bold red/white sawtooth ================
      // The brief calls for "bold red-white sawtooth kerbs at every apex" and
      // `bankZones` above already lists the 7 real cambered apexes — it was
      // imported (see destructure) but never called. ±25 m window each side,
      // both track edges, kerb-only (no SAFER rail: the fence/guardrail/
      // tyreWall calls elsewhere already dress the runoff at these fracs).
      if (typeof bankedKerbStrip === "function") {
        const APEX = [0.0415, 0.1914, 0.4199, 0.4636, 0.6217, 0.7404, 0.8487]; // = bankZones[].frac
        const KERB_HALF = 25 / 5400; // ±25 m in lap-fraction terms (lengthKm 5.4)
        const KERB_R = [0.85, 0.15, 0.15], KERB_W = [0.92, 0.92, 0.90];
        for (const f of APEX) {
          for (const side of [-1, 1]) {
            bankedKerbStrip(f - KERB_HALF, f + KERB_HALF, side,
              { safer: false, kerbRed: KERB_R, kerbWht: KERB_W });
          }
        }
      }

      // ================= START / FINISH — record pit slab + crescent =========
      // Tilke 402 m pit building: long low white slab + horizontal banding.
      // Real Lusail pit building is 402 m with 50 garages — the world's
      // longest — vs. the 212 m slab this shipped with. Extended to ~380 m
      // (kept a hair under 402 so it doesn't crowd the T1 VVIP villas that
      // sit further along the same side).
      (function pitSlab() {
        const a = anchor(K(0.00), -1, 9.2), b = [a.r, a.u, a.t];
        const c = vadd(a.c, a.u, 6.0);
        modelGroup("qatar-pit-slab", {
          center: c, size: [18, 13, 380], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 5.5), [16, 11, 378], WHITE, b);
          addBox(stage, vadd(vadd(a.c, a.u, 5.7), a.r, 8.05), [0.25, 0.5, 376], [0.78, 0.78, 0.76], b);
          addBox(stage, vadd(vadd(a.c, a.u, 9.0), a.r, 8.08), [0.22, 1.2, 374], WIN_WARM, b);
          addBox(stage, vadd(a.c, a.u, 11.35), [17.2, 0.7, 379], WHITE, b);
        }, { required: true });
      })();
      building(K(0.01), -1, 17, 13, 8, 160,
        { kind: "slab", wall: [0.90, 0.90, 0.88], window: WIN_COOL, floor: 3.2 });
      // Horizontal banding stripe along the pit face (Tilke language).
      // These band the PIT BUILDING emitted just above — but were anchored via
      // along() at 1.2 m off the TRACK edge, 16 m inboard of that facade and up
      // to 11 m in the air, so 70 stripes hung over the pit lane attached to
      // nothing. They must follow the BUILDING, not the centreline: building()
      // emits one straight 160 m slab oriented at K(0.01), so stepping along the
      // curving track diverges from it. Step along the slab's own tangent from
      // the same anchor, and keep both bands inside its 8 m height.
      {
        const pb = anchor(K(0.01), -1, 16.6), bb = [pb.r, pb.u, pb.t];
        for (let i = -7; i <= 7; i++) {
          const c = vadd(pb.c, pb.t, i * 10.6);
          addBox(out, vadd(c, pb.u, 3.4), [0.25, 0.45, 10], [0.78, 0.78, 0.76], bb);
          addBox(out, vadd(c, pb.u, 6.6), [0.35, 0.9, 8], WIN_WARM, bb);
        }
      }
      (function pitGarages() {
        let i = 0;
        along(0.0, 0.12, 6, (k) => {
          const col = (i % 2) ? [0.18, 0.18, 0.20] : [0.28, 0.28, 0.30];
          // Garages stand BEHIND the pit wall below, not in it. Both helpers
          // centre a 0.5 m-thick box on their lateral distance — place() on
          // `dist` (tracks.js), wall() on `gap` with thick defaulting to 0.5 —
          // so at the same value of 3 they spanned an identical hw+2.75..3.25
          // and their outward faces were EXACTLY coplanar, same normal, zero
          // gap. The wall runs 0.96->0.08 and these run 0.00->0.12, so the two
          // overlapped for 432 m starting precisely at the start line: the
          // z-fighting flash reported at Qatar's start. 3.9 leaves 0.40 m of
          // real clearance rather than betting on depth precision.
          // blockAt() still records the garage at dist - sz[0]/2 = 3.65 while
          // the wall records 3.0, and the tighter wins — the driving limit is
          // unchanged.
          place(k, -1, 3.9, [0.5, 4.5, 5.0], col);
          i++;
        });
      })();
      wall(0.96, 0.08, -1, 3, 1.0, [0.85, 0.85, 0.85]);

      // Hospitality villas behind the pit slab (curved white villa blocks —
      // replaces mosque / marquees / Aspire fantasy landmarks).
      for (let i = 0; i < 6; i++) {
        const s = (0.98 + i * 0.018) % 1;
        const hf = hash(i * 11 + 7);
        building(K(s), -1, 42 + (i % 2) * 8, 12 + hf * 4, 6 + hf * 3, 18 + hf * 8,
          { kind: "hall", wall: WHITE, window: WIN_COOL, floor: 3.0 });
        // Soft white roof canopy ledge
        const a = anchor(K(s), -1, 46 + (i % 2) * 8), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 8 + hf * 3), [14, 0.55, 16], WHITE, b);
      }

      // Dress-pass addition 2: illuminated paddock media/operations centre.
      // Kept behind the pit complex so its long, low horizontal silhouette
      // layers the S/F background without narrowing the driver's sightline.
      (function paddockMediaCentre() {
        const a = anchor(K(0.925), -1, 72), b = [a.r, a.u, a.t];
        modelGroup("qatar-paddock-media-centre", {
          center: vadd(a.c, a.u, 5.5), size: [30, 12, 76], basis: b,
        }, (stage) => {
          addBox(stage, vadd(a.c, a.u, 4.5), [28, 9, 74], [0.82, 0.83, 0.84], b);
          addBox(stage, vadd(vadd(a.c, a.u, 6.8), a.r, 14.05),
            [0.24, 2.0, 68], WIN_COOL, b);
          addBox(stage, vadd(a.c, a.u, 9.3), [30, 0.65, 76], WHITE, b);
          for (const dz of [-26, -13, 0, 13, 26]) {
            addBox(stage, vadd(vadd(a.c, a.u, 9.8), a.t, dz),
              [24, 0.20, 0.38], LAMP, b);
          }
        }, { required: true });
      })();

      gantry(0.012, 7.5, [0.12, 0.12, 0.14]);
      tower(K(0.985), -1, 8, 6, 26, { col: [0.18, 0.18, 0.21], cap: true, capCol: FLOOD });

      // Main grandstand (R): long curved crescent stepped slab.
      (function crescentStand() {
        for (let i = 0; i < 5; i++) {
          const s = 0.950 + i * 0.022;
          qatarStand(`qatar-main-stand-${i}`, s % 1, 1, 16, 72,
            [0.86, 0.86, 0.84], [0.20, 0.20, 0.24], i === 0);
        }
      })();

      // Sponsor hoardings along S/F verge, with an Arabic-script board every
      // fourth bay. Latin-only signage was a big part of why this straight read
      // as generic floodlit tarmac.
      (function straightAds() {
        let i = 0;
        along(0.86, 0.12, 28, (k) => {
          if (i % 4 === 3) arabicSign(k, 1, 5, 9, 3.2, [0.98, 0.94, 0.66], [0.10, 0.30, 0.20]);
          else billboard(k, 1, 5, 9, 3.2, AD[i % AD.length]);
          i++;
        });
      })();
      // Maroon-and-white Arabic welcome boards at the two spectator gates —
      // Qatar's national colours, and the largest signs on the circuit.
      arabicSign(K(0.205), 1, 30, 22, 4.6, [0.97, 0.95, 0.90], [0.44, 0.06, 0.18]);
      arabicSign(K(0.735), -1, 34, 20, 4.2, [0.97, 0.95, 0.90], [0.44, 0.06, 0.18]);
      arabicSign(K(0.935), 1, 26, 18, 4.0, [0.98, 0.90, 0.40], [0.12, 0.13, 0.17]);

      // ================= TURN 1 — North stand + Tilke VVIP canopy ============
      qatarStand("qatar-t1-stand-a", 0.053, 1, 20, 95,
        SHELL_SANDSTONE, [0.18, 0.18, 0.21], true);
      qatarStand("qatar-t1-stand-b", 0.070, 1, 20, 65,
        SHELL_SANDSTONE, [0.18, 0.18, 0.21]);
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.065), 1, 6, 12, 3.8, AD[0]);

      // North-grandstand rear concourse. Two lit volumes and a light bar only —
      // the third and fourth blocks that used to stand here started to read as
      // a small town behind T1, which is the one thing Lusail has none of.
      building(K(0.060), 1, 54, 16, 7, 34,
        { kind: "hall", wall: WHITE, window: WIN_WARM, floor: 3.0 });
      {
        const a = anchor(K(0.068), 1, 63), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 8.2), [20, 0.30, 42], FLOOD, b);
      }
      // Arabic entrance signage over the North concourse gate.
      arabicSign(K(0.064), 1, 44, 16, 3.4, [0.98, 0.92, 0.60], [0.13, 0.14, 0.18]);

      // T1 VVIP — white villa + ~60 m branch-style sail canopy (replaces mosque)
      (function t1Vvip() {
        building(K(0.048), -1, 36, 18, 9, 32,
          { kind: "dome", wall: WHITE, window: WIN_COOL, floor: 3.4 });
        building(K(0.058), -1, 40, 14, 7, 24,
          { kind: "arch", wall: [0.91, 0.91, 0.89], window: WIN_WARM, floor: 3.2 });
        const a = anchor(K(0.052), -1, 48), b = [a.r, a.u, a.t];
        modelGroup("qatar-t1-vvip-canopy", {
          center: vadd(a.c, a.u, 8.3), size: [62, 17, 38], basis: b,
        }, (stage) => {
          addCyl(stage, a.c, 0.55, 16, STEEL, 8, b);
          addBox(stage, vadd(a.c, a.u, 16.0), [58, 0.65, 32], WHITE, b);
          for (const dx of [-18, -9, 0, 9, 18]) {
            addBox(stage, vadd(vadd(a.c, a.u, 12), a.r, dx * 0.15), [0.35, 8, 0.35], STEEL, b);
            addBox(stage, vadd(vadd(a.c, a.u, 16.2), a.t, dx * 0.75), [54, 0.28, 0.35], LAMP, b);
          }
          addBox(stage, vadd(a.c, a.u, 15.6), [48, 0.25, 1.2], FLOOD, b);
        }, { required: true });
      })();

      // ================= DESERT THORN + SPARSE PALMS =========================
      // The other three floodlit circuits in this group are all planted with
      // date palms — the one silhouette they genuinely share. Lusail sits on
      // open hamada well outside any irrigated corniche, and what grows there
      // is samr/acacia: a bare trunk forking low into a wide FLAT crown. The
      // umbrella against the mast light is a completely different shape from a
      // palm's radial frond burst, so a single tree in frame says "Qatar, not
      // Jeddah". Palms stay only where the venue itself planted them (the
      // paddock approach), which is where they actually are.
      if (typeof acacia === "function") {
        for (let i = 0; i < 14; i++) {
          const k = (K(0.09) + i * Math.round(n * 0.014)) % n;
          const side = hash(k * 19 + i) < 0.5 ? -1 : 1;
          const hgt = 4.5 + hash(k * 7 + i) * 2.6;
          acacia(k, side, 44 + hash(k * 5 + i) * 46, hgt, [0.30, 0.36, 0.20],
                 { spread: hgt * (1.15 + hash(k * 11 + i) * 0.5), layers: 2 });
        }
      }
      for (let i = 0; i < 5; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.006)) % n;
        palm(k, -1, 48 + hash(k * 5) * 24, 7.5 + hash(k * 9) * 2.5, FROND);
      }

      // ================= T2/T3 OUTFIELD BLEACHERS ===========================
      // Lusail's permanent architecture is the main crescent and T1 only; the
      // outfield seating for a race weekend is bolted aluminium bleachers put
      // up on the sand and taken down after. Three roofed shell slabs here made
      // the venue read as a fully built stadium bowl like Abu Dhabi's — the
      // shared bleacher() is open, raked, roofless and back-lit by the mast
      // ring behind it, which is what a Qatar outfield actually looks like.
      // Warm aluminium against the sand, not the pale Tilke grey.
      if (typeof bleacher === "function") {
        bleacher(0.152, 0.216, 1, 20, {
          rows: 6, rise: 0.78, setback: 1.05, step: 17, density: 0.42,
          frameCol: [0.56, 0.55, 0.54], plankCol: [0.66, 0.63, 0.58],
        });
      } else {
        for (const [i, s] of [0.162, 0.183, 0.204].entries()) {
          qatarStand(`qatar-t23-stand-${i}`, s, 1, 22, 52,
            SHELL_STEEL, [0.18, 0.18, 0.21]);
        }
      }
      guardrail(0.14, 0.24, 1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.19), 1, 6);
      billboard(K(0.21), 1, 6, 11, 3.4, AD[2]);

      // ================= LOW SAND DUNES (s 0.28, L far) =====================
      for (let i = 0; i < 7; i++) {
        const k = (K(0.28) + i * Math.round(n * 0.009)) % n;
        const gap = 60 + i * 16 + hash(k * 3) * 18;
        const w   = 36 + hash(k * 5) * 18;
        const h   =  2.5 + hash(k * 7) * 2.5;
        const a = anchor(k, -1, gap + w * 0.62);
        mountain(a.c[0], a.c[2], pyMin, w, h,
          { seg: 6, seed: k * 4 + 28, rough: 0.40, snowline: 1.6,
            forest: DUNE, rock: DUNE_N, snow: DUNE_N });
      }
      marshalPost(K(0.30), -1, 6);

      // ================= DEAD-ZONE FILL (s 0.30-0.36) =========================
      // The dune ring above tapers off before the Turns 4-6 sweep dressing
      // picks up at K(0.36), leaving ~150 m with nothing but the one marshal
      // post. Scrub + a sponsor hoarding run close the gap cheaply.
      for (let i = 0; i < 9; i++) {
        const k = (K(0.305) + i * Math.round(n * 0.007)) % n;
        for (const side of [-1, 1]) {
          if (hash(k * 53 + side * 17) <= 0.55) {
            const dd = 26 + hash(k * 59 + side) * 36;
            const scrubCol = hash(k * 61 + side) < 0.5 ? [0.50, 0.46, 0.32] : [0.30, 0.36, 0.20];
            bush(k, side, dd, scrubCol);
          }
        }
      }
      if (typeof sponsorHoarding === "function") {
        sponsorHoarding(0.303, 0.357, 1, 6, { palette: AD });
      }

      // ================= TURNS 4-6 SWEEP — open desert flats =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.36) + i * Math.round(n * 0.014)) % n;
        for (const side of [-1, 1]) {
          const gap = 90 + i * 20 + hash(k * 7 + side) * 20;
          const w   = 40 + hash(k * 9 + side) * 18;
          const h   =  2.5 + hash(k * 11 + side) * 2.5;
          const a = anchor(k, side, gap + w * 0.62);
          mountain(a.c[0], a.c[2], pyMin, w, h,
            { seg: 6, seed: k * 5 + side * 3 + 40, rough: 0.38, snowline: 1.6,
              forest: SAND, rock: SAND_D, snow: SAND_D });
        }
      }
      guardrail(0.36, 0.50, -1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.43), 1, 6);

      // Dress-pass addition 4: low western desert horizon. Sparse, broad berms
      // remain below the flood masts and preserve the open T4–T10 sightlines.
      for (let i = 0; i < 6; i++) {
        const s = 0.46 + i * 0.042;
        const w = 58 + hash(i * 17 + 4) * 28;
        const h = 3.0 + hash(i * 23 + 9) * 2.2;
        const gap = 155 + hash(i * 31 + 2) * 55;
        const a = anchor(K(s), 1, gap);
        mountain(a.c[0], a.c[2], pyMin, w, h,
          { seg: 6, seed: 620 + i * 13, rough: 0.30, snowline: 1.6,
            forest: DUNE, rock: DUNE_N, snow: DUNE_N });
      }

      // ================= DISTANT HORIZON — DELIBERATELY EMPTY ================
      // This used to be a 21-box "Lusail / Doha skyline" of anonymous lit
      // slabs with beacons on top: the exact generic night-city backdrop that
      // Jeddah, Baku and Abu Dhabi all also carry, and the reason a Qatar
      // screenshot was indistinguishable from theirs. Lusail is 20 km out in
      // open desert — from the circuit there is NO city on the horizon at all,
      // only the two hero silhouettes below and a lot of sand. Emptiness is
      // this venue's identity, so the horizon is left empty on purpose. Nothing
      // is emitted here at all — an unbroken sand line under the mast ring is
      // the point, and even a pair of distant aviation beacons floats with
      // nothing under it (the float audit says so) and reads as a city edge.
      void BEACON;

      // ================= KATARA TOWERS + LUSAIL STADIUM =======================
      // Real Lusail landmarks the brief flags as missing from an otherwise
      // anonymous random-box skyline. Both sit s 0.50-0.55, L, ~550 m out —
      // alone on a horizon the section above deliberately leaves empty.
      (function katharaAndStadium() {
        const BRONZE = [0.20, 0.15, 0.10];
        const GOLD = [0.58, 0.46, 0.20], GOLD_ROOF = [0.66, 0.54, 0.26];

        // Katara Towers: twin leaning "scimitar" prisms, ~110 m, dark
        // bronze-glass, bowing toward one another along the straight.
        (function kataraTowers() {
          const s = 0.515, dist = 540;
          const a = anchor(K(s), -1, dist), b = [a.r, a.u, a.t];
          modelGroup("qatar-katara-towers", {
            center: vadd(a.c, a.u, 55), size: [40, 112, 40], basis: b,
          }, (stage) => {
            addBox(stage, vadd(a.c, a.u, 1.0), [34, 2.0, 34], BRONZE, b); // shared podium
            for (const dz of [-14, 14]) {
              const lean = dz > 0 ? -0.14 : 0.14; // opposing lean = bowed pair
              const tiltU = [b[1][0] + b[2][0] * lean, b[1][1], b[1][2] + b[2][2] * lean];
              const base = vadd(a.c, a.t, dz);
              addFrustum(stage, base, 8.5, 4.0, 110, BRONZE, 4, [b[0], tiltU, b[2]]);
            }
          }, { required: true });
        })();

        // Lusail Stadium: wide low golden bowl/drum, ~45 m tall x 90 m wide.
        (function lusailStadium() {
          const s = 0.542, dist = 560;
          const a = anchor(K(s), -1, dist), b = [a.r, a.u, a.t];
          modelGroup("qatar-lusail-stadium", {
            center: vadd(a.c, a.u, 22.5), size: [92, 46, 92], basis: b,
          }, (stage) => {
            addCyl(stage, a.c, 45, 32, GOLD, 16, b);
            addFrustum(stage, vadd(a.c, a.u, 32), 45, 30, 13, GOLD_ROOF, 16, b);
          }, { required: true });
        })();
      })();

      // ================= MARSHAL / TIMING HUTS ==============================
      for (let i = 0; i < 4; i++) {
        const k = (K(0.62) + i * 2) % n;
        place(k, 1, 26 + i * 5, [4, 4, 5], [0.90, 0.90, 0.88]);
        place(k, 1, 26 + i * 5, [4.4, 0.65, 5.4], [0.55, 0.18, 0.16]);
        const a = anchor(k, 1, 26 + i * 5), bv = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 2.8), [0.18, 1.4, 1.4], WIN_WARM, bv);
      }
      marshalPost(K(0.61), 1, 6);
      marshalPost(K(0.66), -1, 6);
      guardrail(0.58, 0.68, 1, 4, [0.78, 0.78, 0.80]);
      billboard(K(0.63), -1, 6, 10, 3.2, AD[3]);

      // ================= CATCH FENCE (masts come from floodMastRing) =========
      fence(0.66, 0.84, 1, 6, 3.4, [0.66, 0.68, 0.72]);
      fence(0.66, 0.84, -1, 6, 3.4, [0.66, 0.68, 0.72]);
      guardrail(0.66, 0.84, 1, 3.2, [0.78, 0.78, 0.80]);
      guardrail(0.66, 0.84, -1, 3.2, [0.78, 0.78, 0.80]);
      tyreWall(0.70, 0.74, -1, 5, [0.85, 0.16, 0.16]);
      marshalPost(K(0.76), 1, 6);
      billboard(K(0.72), 1, 6, 10, 3.2, AD[1]);
      billboard(K(0.80), -1, 6, 10, 3.2, AD[4]);

      // Dress-pass addition 5: fixed television-corner lighting crowns.
      // The full-lap ring establishes continuity; these three paired stations
      // make the T10 and fast final-sector complexes visibly floodlit heroes.
      if (typeof floodMast === "function") {
        for (const s of [0.63, 0.72, 0.80]) {
          floodMast(K(s), -1, 38, { h: MAST_H + 2, cool: true, pool: true, arms: 3, light: false });
          floodMast(K(s),  1, 42, { h: MAST_H + 2, cool: true, pool: true, arms: 3, light: false });
        }
      }

      // ================= SPARSE PALM ROW (s 0.86) ===========================
      for (let i = 0; i < 8; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.008)) % n;
        palm(k, -1, 42 + i * 8, 7.2 + hash(k * 3) * 3, FROND);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 OUTFIELD BLEACHERS + PIT ENTRY =============
      // Same reasoning as T2/T3: temporary open seating, not a built stand.
      if (typeof bleacher === "function") {
        bleacher(0.927, 0.961, 1, 15, {
          rows: 6, rise: 0.78, setback: 1.05, step: 17, density: 0.42,
          frameCol: [0.54, 0.53, 0.53], plankCol: [0.64, 0.61, 0.57],
        });
      } else {
        qatarStand("qatar-t16-stand-a", 0.930, 1, 17, 75,
          SHELL_CONCRETE, [0.18, 0.18, 0.21]);
        qatarStand("qatar-t16-stand-b", 0.952, 1, 17, 55,
          SHELL_CONCRETE, [0.18, 0.18, 0.21]);
      }
      tyreWall(0.91, 0.945, 1, 5, [0.90, 0.86, 0.20]);
      marshalPost(K(0.94), -1, 6);
      billboard(K(0.92), 1, 6, 12, 3.6, AD[5]);

      // Sparse desert scrub only (palms/oasis water culled)
      every(120, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 29 + side * 7) <= 0.40) {
            const dd = 40 + hash(k * 31 + side) * 50;
            const scrubCol = hash(k * 41 + side) < 0.55 ? [0.50, 0.46, 0.32] : [0.30, 0.36, 0.20];
            bush(k, side, dd, scrubCol);
          }
        }
      });

      // ================= 2. GREEN VERGE → WARM SAND SANDWICH ================
      // Continuous artificial-grass band hugging both edges, with the warm
      // sand-coloured terrain immediately beyond — the Lusail edge signature.
      // This is a visual ground patch, not a solid `place()` box, so it conforms
      // to the shared terrain profile without creating phantom boundaries.
      // 14 m segments, not 28. A ground patch is a straight box, so on Lusail's
      // long sweeps a 28 m one chords across the arc and its ends land on the
      // tarmac — the footprint guard then rejected 109 of 450 (24%), leaving the
      // verge visibly patchy through exactly the corners it should dress. Half
      // the length follows the curve well enough to drop that to 14%, and at
      // double the placement rate it lays MORE verge than before (10.8 km vs
      // 9.5 km) rather than less.
      every(12, (k) => {
        for (const side of [-1, 1]) {
          groundPatch(k, side, 0.3, [3.6, 0.16, 14], GRASS,
            { id: `qatar-green-verge-${k}-${side}`, samples: 2 });
        }
      });
    },
  }
  );
})();
