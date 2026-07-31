/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    startFrac: 0.8000, // GPS-derived (OpenF1 2025, conf=0.212)
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
    // (s = SOURCE fraction; startFrac 0.8 shifts these into racing space.)
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
        bankedKerbStrip, sponsorHoarding } = api;
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
          addBox(stage,
            vadd(vadd(a.c, a.u, h * 0.62), a.r, -side * (depth * 0.34)),
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
      // Continuous cool-white Musco-style masts both sides; denser on S/F.
      if (typeof floodMastRing === "function") {
        floodMastRing(90, { h: 38, dist: 34, cool: true, pool: true });
        // Extra densification on the televised start/finish kilometre
        along(0.86, 0.14, 45, (k) => {
          if (typeof floodMast === "function") {
            floodMast(k, -1, 32, { h: 40, cool: true, pool: true });
            floodMast(k,  1, 36, { h: 40, cool: true, pool: true });
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
        { wall: [0.90, 0.90, 0.88], window: WIN_COOL, floor: 3.2 });
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
          place(k, -1, 3, [0.5, 4.5, 5.0], col);
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
          { wall: WHITE, window: WIN_COOL, floor: 3.0 });
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

      // Sponsor hoardings along S/F verge
      (function straightAds() {
        let i = 0;
        along(0.86, 0.12, 28, (k) => {
          billboard(k, 1, 5, 9, 3.2, AD[i % AD.length]);
          i++;
        });
      })();

      // ================= TURN 1 — North stand + Tilke VVIP canopy ============
      qatarStand("qatar-t1-stand-a", 0.053, 1, 20, 95,
        SHELL_SANDSTONE, [0.18, 0.18, 0.21], true);
      qatarStand("qatar-t1-stand-b", 0.070, 1, 20, 65,
        SHELL_SANDSTONE, [0.18, 0.18, 0.21]);
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.065), 1, 6, 12, 3.8, AD[0]);

      // Dress-pass addition 3: North-grandstand rear concourse and lightbox.
      // These low white hospitality volumes sit well behind the stand shell,
      // adding Lusail's modern event architecture rather than trackside clutter.
      building(K(0.060), 1, 54, 16, 7, 34,
        { wall: WHITE, window: WIN_WARM, floor: 3.0 });
      building(K(0.078), 1, 58, 13, 6, 24,
        { wall: [0.86, 0.87, 0.88], window: WIN_COOL, floor: 3.0 });
      {
        const a = anchor(K(0.068), 1, 63), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 8.2), [20, 0.30, 42], FLOOD, b);
      }

      // T1 VVIP — white villa + ~60 m branch-style sail canopy (replaces mosque)
      (function t1Vvip() {
        building(K(0.048), -1, 36, 18, 9, 32,
          { wall: WHITE, window: WIN_COOL, floor: 3.4 });
        building(K(0.058), -1, 40, 14, 7, 24,
          { wall: [0.91, 0.91, 0.89], window: WIN_WARM, floor: 3.2 });
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

      // ================= SPARSE PALMS (culled — vert budget for flood ring) ===
      for (let i = 0; i < 8; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.006)) % n;
        palm(k, -1, 48 + hash(k * 5) * 24, 7.5 + hash(k * 9) * 2.5, FROND);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS ============================
      for (const [i, s] of [0.162, 0.183, 0.204].entries()) {
        qatarStand(`qatar-t23-stand-${i}`, s, 1, 22, 52,
          SHELL_STEEL, [0.18, 0.18, 0.21]);
      }
      // Small hospitality villa terrace at T2/T3 (replaces fantasy marquees)
      for (let i = 0; i < 3; i++) {
        building(K(0.175 + i * 0.018), 1, 48, 11, 6, 16,
          { wall: WHITE, window: WIN_COOL, floor: 3.0 });
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

      // ================= DISTANT LUSAIL / DOHA SKYLINE (thinned) =============
      (function skyline() {
        const LA = [0.30, 0.33, 0.42], LB = [0.24, 0.27, 0.38];
        for (const sBase of [0.42, 0.50, 0.58]) {
          for (let i = 0; i < 7; i++) {
            const hf = hash(i * 7 + sBase * 30);
            const wf = hash(i * 3 + sBase * 20);
            const sFrac = (sBase + (i - 3) * 0.010 + 1) % 1;
            // Leave the Katara Towers + Lusail Stadium hero landmarks (below)
            // their own clear stretch of skyline instead of stacking an
            // anonymous box behind them.
            if (sFrac > 0.505 && sFrac < 0.535) continue;
            const dist  = 480 + hash(i * 5 + sBase * 70) * 160;
            const landmark = hash(i * 4.4 + sBase) > 0.88;
            const w = 5 + wf * 7;
            const h = (landmark ? 90 : 40) + hf * 80;
            const d = w * 1.4;
            const col = (hash(i * 11 + sBase) > 0.5) ? LA : LB;
            backdrop(K(sFrac), -1, dist, [w, h, d], col);
            if (landmark || hash(i * 9.1 + sBase) > 0.55) {
              const a = anchor(K(sFrac), -1, dist);
              addBox(out, vadd(a.c, a.u, h + 2), [1.5, 3.8, 1.5], BEACON, [a.r, a.u, a.t]);
            }
          }
        }
      })();

      // ================= KATARA TOWERS + LUSAIL STADIUM =======================
      // Real Lusail landmarks the brief flags as missing from an otherwise
      // anonymous random-box skyline. Both sit s 0.50-0.55, L, ~550 m out —
      // the skyline() loop above carves out this frac range for them.
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
          floodMast(K(s), -1, 38, { h: 41, cool: true, pool: true, arms: 2 });
          floodMast(K(s),  1, 42, { h: 41, cool: true, pool: true, arms: 2 });
        }
      }

      // ================= SPARSE PALM ROW (s 0.86) ===========================
      for (let i = 0; i < 8; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.008)) % n;
        palm(k, -1, 42 + i * 8, 7.2 + hash(k * 3) * 3, FROND);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 GRANDSTAND + PIT ENTRY =====================
      qatarStand("qatar-t16-stand-a", 0.930, 1, 17, 75,
        SHELL_CONCRETE, [0.18, 0.18, 0.21]);
      qatarStand("qatar-t16-stand-b", 0.952, 1, 17, 55,
        SHELL_CONCRETE, [0.18, 0.18, 0.21]);
      tyreWall(0.91, 0.945, 1, 5, [0.90, 0.86, 0.20]);
      marshalPost(K(0.94), -1, 6);
      billboard(K(0.92), 1, 6, 12, 3.6, AD[5]);
      // Rear hospitality deck completes the authentic T16 spectator campus.
      building(K(0.942), 1, 50, 15, 7, 38,
        { wall: WHITE, window: WIN_WARM, floor: 3.1 });
      {
        const a = anchor(K(0.942), 1, 58), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 8.2), [18, 0.45, 42], WHITE, b);
        addBox(out, vadd(vadd(a.c, a.u, 7.8), a.r, -8.9),
          [0.24, 0.7, 36], FLOOD, b);
      }

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
