/* Apex 26 — COTA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    // Push the terrain ribbon far out so the open Blackland Prairie reaches the
    // horizon — COTA has long flat sightlines, so a short ribbon left a bare grey
    // void between the trackside and the sky. 420 m fills the orbit-camera frame.
    terrainOuter: 420,
    pal: { zenith: [0.28, 0.54, 0.82], horizon: [0.74, 0.68, 0.52], grass: [0.48, 0.50, 0.30], runoff: [0.40, 0.33, 0.26], ambientSky: [0.50, 0.58, 0.66], ambientGround: [0.30, 0.30, 0.26], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1.0, 0.88, 0.62], sunColor: [1.0, 0.85, 0.55] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    // Turn 1: the calendar's most famous climb — ~30 m up in a few hundred metres.
    elevations: [{ s: 0.06, halfM: 320, rise: 12 }],
    scenery: function (api) {
      const { out, n, px, pz, hw, pyMin, place, prop, addBox, addPrism, addCyl, addCone, addFrustum, every, along, onTrack, anchor, vadd, hash, grandstand, building, billboard, gantry, marshalPost, fence, guardrail, tyreWall, wall, tree, bush, pine, mountain, forestEdge, cityFront, backdrop, groundPlane } = api;
      const K = (s) => Math.round(s * n) % n;

      // -- Palette (Texas Hill Country, DAY) --
      const dryGrass  = [0.55, 0.62, 0.30];
      const scrub     = [0.28, 0.38, 0.22];   // muted — avoids vivid green
      const oak       = [0.24, 0.36, 0.18];
      const cedar     = [0.20, 0.30, 0.18];
      const redSoil   = [0.34, 0.27, 0.21];   // dark-brown Blackland clay (NOT red dirt)
      const redSteel  = [0.86, 0.20, 0.16];
      const white     = [0.92, 0.92, 0.94];
      const darkSteel = [0.32, 0.34, 0.40];
      const glass     = [0.40, 0.56, 0.66];
      const cotaBlue  = [0.16, 0.30, 0.52];
      // emissive warm window tint
      const litWin    = [0.68, 0.72, 0.50];
      // lamp-post colours
      const lampPost  = [0.36, 0.36, 0.40];
      const lampHead  = [0.98, 0.94, 0.78];   // warm white sodium

      // ---- Main grandstand on the start/finish straight (s≈0.00, R) ----
      grandstand(0.00,  1,  8, 150, [0.34, 0.35, 0.40], [0.5, 0.5, 0.54]);
      // Opposite paddock-side stand on the main straight (s≈0.00, L)
      grandstand(0.985, -1, 16, 90, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Final-corner stepped stand leading onto the main straight (s≈0.95, R)
      grandstand(0.95,  1,  9, 80, [0.36, 0.37, 0.42], [0.52, 0.5, 0.5]);
      // Turn-1 hill stand catching the climb (s≈0.07, L) — set back enough to clear road
      grandstand(0.07, -1, 14, 80, [0.42, 0.43, 0.48], [0.50, 0.50, 0.54]);
      // T1 hill stand mid-rise (s≈0.11, L)
      grandstand(0.11, -1, 18, 60, [0.38, 0.39, 0.44], [0.52, 0.5, 0.5]);
      // T1 amphitheatre upper tier (s≈0.13, L)
      grandstand(0.13, -1, 26, 64, [0.36, 0.37, 0.42], [0.5, 0.5, 0.54]);
      // Esses outside stand (s≈0.20, L)
      grandstand(0.20, -1, 16, 56, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Esses-exit stand (s≈0.24, R)
      grandstand(0.24,  1, 18, 54, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Back-straight grandstand (s≈0.46, L)
      grandstand(0.46, -1, 12, 70, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Turn-12 hairpin braking-zone stand (s≈0.625, R)
      grandstand(0.625, 1, 14, 70, [0.38, 0.39, 0.44], [0.5, 0.5, 0.54]);
      // Triple-apex sweeper stand (s≈0.83, R)
      grandstand(0.83,  1, 16, 64, [0.40, 0.41, 0.46], [0.5, 0.5, 0.54]);
      // Extra deep main-straight upper tier behind the front stand (s≈0.02, R far)
      grandstand(0.02,  1, 30, 130, [0.30, 0.31, 0.36], [0.48, 0.48, 0.52]);

      // ---- Pit/paddock building cluster (s≈0.97–0.05, L) ----
      // long low pit garage block flanking the main straight
      building(K(0.97), -1, 12, 24, 8, 120, { wall: [0.84, 0.84, 0.86], window: glass, floor: 2, roof: [0.55, 0.56, 0.60] });
      // paddock hospitality / team motorhomes behind the pits
      building(K(0.99), -1, 40, 30, 11, 60, { wall: [0.88, 0.88, 0.90], window: glass, floor: 3, roof: [0.5, 0.52, 0.56] });
      building(K(0.04), -1, 38, 26,  9, 44, { wall: [0.80, 0.80, 0.83], window: glass, floor: 2 });
      // race-control / media tower at pit exit (s≈0.05, L) — set back 16m so inner face clear
      building(K(0.05), -1, 16, 16, 18, 22, { wall: cotaBlue, window: glass, floor: 5, roof: darkSteel });

      // ---- COTA Observation Tower — the iconic 77m red structure at Turn 1 (s≈0.085, L far) ----
      // Placed at 78 m from road edge so it never overlaps any parallel segment.
      const kt = K(0.085);
      const at = anchor(kt, -1, 78), tb = [at.r, at.u, at.t];
      const tBase = at.c;
      // tapered concrete/steel shaft in 3 stages (total 74 m to deck level)
      addFrustum(out, tBase,                         5.8, 4.6, 32, [0.80, 0.81, 0.85], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 32),         4.6, 3.8, 32, [0.78, 0.79, 0.83], 8, tb);
      addFrustum(out, vadd(tBase, at.u, 64),         3.8, 2.8, 10, [0.76, 0.77, 0.81], 8, tb);
      // broad observation deck assembly (the iconic RED feature, r=8.5 m)
      const deckH = 74;
      const deckCen = vadd(tBase, at.u, deckH);
      addCyl(out, deckCen, 8.5, 2.4, redSteel, 10, tb);             // RED deck ring
      // deck floor: contained inside the ring (14 m < 17 m diameter) — no protrusion
      addBox(out, vadd(tBase, at.u, deckH + 1.2), [14, 1.6, 14], [0.92, 0.92, 0.94], tb);
      // upper viewing platform — raised 3 m above deck floor, slightly narrower
      addCyl(out, vadd(tBase, at.u, deckH + 2.8), 7.0, 1.8, [0.74, 0.76, 0.82], 8, tb);
      // crown cap (sits on top of upper platform — gap-free)
      addCone(out, vadd(tBase, at.u, deckH + 4.6), 4.2, 3.8, [0.65, 0.66, 0.70], 8, tb);
      // slender antenna mast above the cone apex
      addCyl(out, vadd(tBase, at.u, deckH + 8.4),  0.32, 9.0, redSteel, 5, tb);
      // aviation-warning beacon at mast tip (warm amber)
      addBox(out, vadd(tBase, at.u, deckH + 17.4), [0.7, 0.7, 0.7], [1.0, 0.82, 0.25], tb);
      // RED railing posts radiating around the deck edge
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * 6.2832;
        const rPost = vadd(
          vadd(deckCen, at.r, Math.cos(ang) * 9.2),
          at.t, Math.sin(ang) * 9.2
        );
        addBox(out, [rPost[0], rPost[1] + 0.8, rPost[2]], [0.5, 1.4, 0.5], redSteel, tb);
      }
      // base facilities: control/mechanical room at tower base
      prop(kt, -1, 62, [16, 7, 18], [0.84, 0.84, 0.86]);
      // emissive window strip on the deck band — lit interior (day+night)
      addBox(out, vadd(tBase, at.u, deckH + 0.6), [15.5, 0.8, 15.5], litWin, tb);

      // ---- Uphill Turn 1: dramatic red-soil embankment — the amphitheatre climb ----
      const k1 = K(0.10);
      const a1 = anchor(k1, 1, 16);
      addPrism(out, vadd(a1.c, a1.u, 4), [20, 12, 60], redSoil, [a1.t, a1.u, a1.r]);
      // large outer mound on the left side of the hill
      const a1L = anchor(k1, -1, 26);
      addPrism(out, vadd(a1L.c, a1L.u, 3), [28, 8, 72], [0.37, 0.29, 0.23], [a1L.t, a1L.u, a1L.r]);

      // ---- Esses spectator viewing mounds (s≈0.18, both sides) ----
      const ke = K(0.18);
      const me = anchor(ke, -1, 32);
      addPrism(out, vadd(me.c, me.u, 2), [34, 6, 64], scrub, [me.t, me.u, me.r]);
      const me2 = anchor(ke, 1, 32);
      addPrism(out, vadd(me2.c, me2.u, 2), [34, 6, 64], scrub, [me2.t, me2.u, me2.r]);

      // ---- Austin360 Amphitheater: curved fan canopy behind Turn 12 (s≈0.64, R) ----
      const ka = K(0.64);
      const aa = anchor(ka, 1, 62), ab = [aa.r, aa.u, aa.t];
      if (!onTrack(aa.c[0], aa.c[2], 36)) {
        addBox(out, vadd(aa.c, aa.u, 12), [52, 22, 28], [0.78, 0.76, 0.72], ab);
        for (let i = -2; i <= 2; i++) {
          addPrism(out, vadd(vadd(aa.c, aa.t, i * 11), aa.u, 23 + (2 - Math.abs(i)) * 2),
                   [14, 3, 24], [0.70, 0.72, 0.76], [aa.r, aa.u, aa.t]);
        }
      }

      // ---- Red-and-white grandstand framework / tower (s≈0.65, R far) ----
      const redFramework = (k, side, dist) => {
        const af = anchor(k, side, dist), fb = [af.r, af.u, af.t];
        if (onTrack(af.c[0], af.c[2], 24)) return;
        addBox(out, vadd(af.c, af.u, 16),              [4, 32, 30], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,  14), af.u,  9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t, -14), af.u,  9), [4, 18, 22], redSteel, fb);
        addBox(out, vadd(vadd(af.c, af.t,   7), af.u, 12), [6,  1, 18], white,    fb);
        addBox(out, vadd(vadd(af.c, af.t,  -7), af.u, 12), [6,  1, 18], white,    fb);
      };
      redFramework(K(0.65), 1, 46);
      redFramework(K(0.65), 1, 78);    // second red stand behind the first
      redFramework(K(0.84), 1, 52);    // red framework at the triple-apex sweeper
      // (removed the lone red framework over the open s≈0.30 field — with no
      //  grandstand/structure context it read as a random floating red slab.)

      // ---- Grand Plaza reflecting pool — the real water feature on the plaza axis,
      // at the opposite end from the Observation Tower + amphitheatre (s≈0.085, L).
      // (The "Velocity Tower" was removed — no such sculpture exists at COTA; the
      //  single iconic vertical colour landmark is the red Observation Tower above.)
      const kpool = K(0.10), apool = anchor(kpool, -1, 120), poolB = [apool.r, apool.u, apool.t];
      if (!onTrack(apool.c[0], apool.c[2], 30)) {
        // shallow rectangular reflecting pool (low roughness water tone)
        addBox(out, vadd(apool.c, apool.u, 0.15), [22, 0.3, 9], [0.30, 0.46, 0.54], poolB);
        // pale stone coping surround
        addBox(out, vadd(apool.c, apool.u, 0.05), [24, 0.2, 11], [0.78, 0.77, 0.73], poolB);
      }

      // ---- Texas water tower — classic regional silhouette landmark (s≈0.68, L far) ----
      const kw = K(0.68), aw = anchor(kw, -1, 112), wb = [aw.r, aw.u, aw.t];
      if (!onTrack(aw.c[0], aw.c[2], 36)) {
        for (const leg of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
          addCyl(out, vadd(vadd(aw.c, aw.r, leg[0]), aw.t, leg[1]),
                 0.48, 21, [0.68, 0.70, 0.76], 4, wb);
        }
        addFrustum(out, vadd(aw.c, aw.u, 21), 7.2, 7.0, 7, [0.82, 0.84, 0.88], 12, wb);
        addCone(out,   vadd(aw.c, aw.u, 28), 7.0, 4.8, [0.72, 0.74, 0.80], 12, wb);
      }

      // ---- Texas Hill Country ridgelines — LOW organic hills on the horizon ----
      // Use backdrop() for cheap rounded hill mounds instead of full mountain() meshes.
      // backdrop() auto-detects green-dominant colors and renders as frustum+cone mound,
      // costing ~2 primitives vs ~80 triangles per mountain() — critical for SwiftShader.
      // Place ~6 anchor points around the circuit for 3 depth layers.
      // COTA sits on gently rolling-to-flat Blackland Prairie — NOT dramatic
      // mountains.  Heights are kept low (broad shallow swells) so the horizon
      // reads as open Texas prairie, with the far ring just a faint rise.
      // Prairie-swell greens: kept GREEN-dominant so backdrop() renders them as
      // rounded organic mounds seated on the terrain (frustum+dome) rather than
      // pale boxy slabs that read as floating buildings. Heights are low (broad
      // shallow swells) and the colours sit close to the verge grass so the
      // swells melt into the prairie ribbon instead of standing off it.
      const swellNear = [0.40, 0.46, 0.27];
      const swellMid  = [0.43, 0.48, 0.29];
      const swellFar  = [0.46, 0.50, 0.32];
      const hillAnchors = [
        // [s-frac, side, dist, width, height, depth, col]
        // Near ring — gentle swells just past the trackside dressing (180–230 m)
        [0.10, -1, 190, 320, 14, 80, swellNear],
        [0.25,  1, 200, 300, 13, 76, swellNear],
        [0.40, -1, 195, 340, 15, 84, swellNear],
        [0.55,  1, 205, 310, 13, 78, swellNear],
        [0.70, -1, 210, 330, 15, 82, swellNear],
        [0.85,  1, 185, 300, 13, 76, swellNear],
        [0.16,  1, 215, 320, 14, 80, swellNear],
        [0.62,  1, 220, 320, 14, 80, swellNear],
        // Mid ring — broad rolling rise (300–360 m out)
        [0.05, -1, 320, 420, 20, 96, swellMid],
        [0.20,  1, 340, 440, 22, 100, swellMid],
        [0.35, -1, 330, 420, 21, 96, swellMid],
        [0.50,  1, 350, 460, 23, 104, swellMid],
        [0.65, -1, 315, 410, 20, 94, swellMid],
        [0.80,  1, 335, 430, 22, 100, swellMid],
        [0.92, -1, 325, 420, 21, 96, swellMid],
        // Far ring — faint hazy horizon rise (440–520 m out), still green so it
        // reads as far prairie, not a building line. Low + broad = a soft rise.
        [0.12, -1, 470, 560, 30, 120, swellFar],
        [0.30,  1, 500, 580, 32, 124, swellFar],
        [0.48, -1, 460, 560, 30, 120, swellFar],
        [0.68,  1, 490, 580, 31, 122, swellFar],
        [0.88, -1, 480, 560, 30, 120, swellFar],
      ];
      for (const [sf, side, dist, w, h, d, col] of hillAnchors) {
        backdrop(K(sf), side, dist, [w, h, d], col);
      }

      // ---- Far horizon swell ring: a dense ring of MODEST-footprint green
      // swells stepped finely around the lap on BOTH sides. Footprints are kept
      // small (≤140 m) so the onTrack guard doesn't cull them across COTA's tight
      // parallel straights (big slabs were suppressed wholesale); the fine step
      // and overlap still read as a continuous low prairie rise on the outer
      // horizon, hiding the flat floor-slab band beyond the terrain ribbon. The
      // survivors land on the genuinely-outer perimeter from every bearing.
      const horizonGreen = [0.45, 0.49, 0.31];
      const horizonNear  = [0.47, 0.51, 0.30];
      for (let i = 0; i < 80; i++) {
        const sf = i / 80;
        const side = (i % 2) ? 1 : -1;
        // near-mid band — bridges the gap between trackside treelines and the far
        // rise so the immediate mid-ground isn't a flat pale strip (120–200 m).
        backdrop(K(sf), side, 120 + hash(i * 6.1) * 80,
                 [90, 12 + hash(i * 7.3) * 8, 90], horizonNear);
        backdrop(K(sf), side, 240 + hash(i * 2.3) * 200,
                 [120, 20 + hash(i * 5.1) * 12, 120], horizonGreen);
        // second, farther, lower band to give the rise depth
        backdrop(K((sf + 0.5) % 1), -side, 430 + hash(i * 3.7) * 160,
                 [120, 24 + hash(i * 4.3) * 10, 120], horizonGreen);
      }

      // ---- Mid-ground prairie fill: broad low ground swells filling the open
      // flat between the trackside and the swell rings, so there is no bare void
      // anywhere in the orbit frame. groundPlane seats its top just below local
      // grade, giving a continuous straw-green prairie carpet that hugs terrain.
      const prairieFlat = [0.50, 0.55, 0.31];
      const prairieDry  = [0.54, 0.58, 0.34];
      // Smaller footprints (≤120 m) so they survive the onTrack guard between
      // COTA's tight parallel straights, stepped finely on both sides to lay a
      // continuous straw-green carpet over the near/mid flat next to the track.
      for (let i = 0; i < 40; i++) {
        const sf = i / 40;
        const side = (i % 2) ? 1 : -1;
        const col = (i % 2) ? prairieDry : prairieFlat;
        groundPlane(K(sf), side, 50 + hash(i * 2.9) * 40, [110, 2.2, 110], col);
      }

      // ---- T1 hill climb ridge cues: earth mounds framing the famous uphill entry ----
      {
        const hillGrass = [0.40, 0.48, 0.26];
        // Staggered mounds on both sides of the climb — kept close so they read as earthworks
        for (const [sf, side, gapOff] of [
          [0.01, 1, 0], [0.02, -1, 4], [0.035, 1, 0], [0.045, -1, 6],
        ]) {
          const ah = anchor(K(sf), side, 34 + gapOff + hash(K(sf) * 3) * 14);
          addPrism(out, ah.c, [26, 9 + hash(K(sf) * 7) * 5, 44], hillGrass,
                   [ah.t, ah.u, ah.r]);
        }
      }

      // ================= AUSTIN DOWNTOWN SKYLINE — ONE distant cluster =================
      // Downtown Austin is ~24 km SE — in reality a single tight low cluster on ONE
      // horizon bearing, NOT buildings ringing the lap. So instead of stepping a
      // cityFront() along an arc (which wrapped the skyline around the whole
      // horizon), we plant a tight row of backdrop() towers at ONE fixed anchor
      // node, all at the same far distance + bearing, packed close together with
      // a coherent run of heights. backdrop() seats them on the lap baseline so
      // they sit ON the ground, reading as a faraway downtown.
      {
        const kSky = K(0.42);                 // single bearing for the cluster
        const a0 = anchor(kSky, -1, 760);     // ~760 m back → low on the horizon
        const skyBase = a0.c, skyB = [a0.r, a0.u, a0.t];
        // heights tuned so the tallest 2–3 (the Independent/"Jenga", Austonian)
        // read as a centre spike with a falling shoulder either side.
        const heights = [44, 58, 72, 96, 116, 132, 104, 84, 66, 50, 40];
        const skyPal = [
          [0.55, 0.57, 0.64], [0.58, 0.60, 0.66], [0.52, 0.54, 0.62],
          [0.60, 0.61, 0.67], [0.54, 0.56, 0.63],
        ];
        let off = -((heights.length - 1) * 26) / 2;
        for (let i = 0; i < heights.length; i++) {
          const h = heights[i];
          const w = 22 + hash(i * 3.1) * 16;
          const col = skyPal[i % skyPal.length];
          // lateral spread along the track tangent at the fixed anchor → all on
          // the SAME bearing/distance, so the cluster stays tight and grounded.
          const c = vadd(skyBase, a0.t, off + i * 26 + (hash(i * 7.7) - 0.5) * 8);
          const cy = c[1] + h / 2 - 2;
          addBox(out, [c[0], cy, c[2]], [w, h, 24], col, [a0.t, a0.u, a0.r]);
          // glass window bands so the towers don't read as flat grey planes
          const win = [Math.min(1, col[0] * 1.5 + 0.05), Math.min(1, col[1] * 1.5 + 0.05), Math.min(1, col[2] * 1.5 + 0.07)];
          const floors = Math.max(3, Math.round(h / 22));
          for (let f = 1; f < floors; f++) {
            addBox(out, [c[0], cy - h / 2 + (f + 0.5) * (h / floors), c[2]],
                   [w * 0.97, (h / floors) * 0.5, 25], win, [a0.t, a0.u, a0.r]);
          }
          // parapet cap
          addBox(out, [c[0], cy + h / 2 + 0.6, c[2]], [w * 1.02, 1.2, 25], col, [a0.t, a0.u, a0.r]);
        }
      }

      // ================== COHERENT TREELINES via forestEdge() ==================
      // Replace scattered individual trees with continuous treeline edges.
      // gap values are generous (16–24 m) to clear barriers and grandstands.
      // Colors deliberately muted (dark oak/cedar) — no vivid green.
      // density kept moderate (0.4–0.55) so step stays ≥4 m and count is bounded.

      // Main straight / pit entry approach (right side, back from buildings)
      forestEdge(0.88, 0.98,  1, 22, { density: 0.50, hMin: 7, hMax: 13, col: cedar, col2: oak,   pineFrac: 0.4 });

      // Turn 1 approach — left side treeline behind grandstands
      forestEdge(0.06, 0.16, -1, 32, { density: 0.45, hMin: 8, hMax: 14, col: oak,   col2: cedar, pineFrac: 0.55 });

      // Esses sector — both sides, set back behind the guardrails
      forestEdge(0.16, 0.28, -1, 20, { density: 0.50, hMin: 7, hMax: 12, col: cedar, col2: oak,   pineFrac: 0.45 });
      forestEdge(0.16, 0.28,  1, 20, { density: 0.45, hMin: 6, hMax: 11, col: oak,   col2: cedar, pineFrac: 0.35 });

      // Mid-circuit sector (s≈0.28–0.40, right side — dry Texas scrub)
      forestEdge(0.28, 0.42,  1, 18, { density: 0.35, hMin: 6, hMax: 10, col: [0.22, 0.34, 0.18], col2: [0.26, 0.36, 0.20], pineFrac: 0.30 });

      // Back straight (s≈0.40–0.62, both sides — sparse Texas live oaks)
      forestEdge(0.40, 0.55, -1, 24, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.50 });
      forestEdge(0.40, 0.62,  1, 18, { density: 0.40, hMin: 6, hMax: 11, col: cedar, col2: oak,   pineFrac: 0.40 });

      // T12 hairpin and amphitheatre approach (s≈0.62–0.72)
      forestEdge(0.62, 0.74, -1, 18, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.72, 0.84, -1, 16, { density: 0.40, hMin: 6, hMax: 11, col: cedar, col2: oak,   pineFrac: 0.40 });

      // Final sweeper sector (s≈0.84–0.96, both sides)
      forestEdge(0.84, 0.96, -1, 18, { density: 0.45, hMin: 7, hMax: 12, col: oak,   col2: cedar, pineFrac: 0.45 });
      forestEdge(0.84, 0.92,  1, 20, { density: 0.35, hMin: 6, hMax: 10, col: cedar, col2: oak,   pineFrac: 0.35 });

      // ---- Scattered mid-ground live-oak / mesquite clumps ----
      // The real COTA infield + outfield is open prairie dotted with isolated
      // oak/mesquite mottes — NOT a continuous treeline. These clumps push trees
      // out into the empty mid-distance (40–150 m) so the flat between the
      // trackside treelines and the swell rings reads as populated savannah, not
      // bare grass. Hash-jittered count/size/position; bounded (~70 clumps).
      const clumpCols = [oak, cedar, [0.22, 0.34, 0.18], [0.30, 0.40, 0.22], [0.26, 0.37, 0.20]];
      for (let i = 0; i < 34; i++) {
        const sf = (i / 34 + hash(i * 1.7) * 0.02) % 1;
        const k = K(sf);
        const side = hash(i * 3.3) < 0.5 ? -1 : 1;
        const dist = 42 + hash(i * 5.9) * 110;       // 42–152 m out
        const trees = 2 + Math.floor(hash(i * 7.1) * 3);  // 2–4 trees per motte
        for (let j = 0; j < trees; j++) {
          const d = dist + (hash(i * 11 + j * 2.3) - 0.5) * 16;
          const sj = sf + (hash(i * 13 + j * 3.7) - 0.5) * 0.008;
          const kk = K(sj);
          const col = clumpCols[Math.floor(hash(i * 17 + j) * clumpCols.length) % clumpCols.length];
          const h = 6 + hash(i * 19 + j * 5) * 6;
          tree(kk, side, d, h, col);
        }
      }

      // ---- Start/finish gantry over the main straight (s≈0.00) ----
      gantry(0.00, 7.5, darkSteel);
      // scoring / DRS-detection gantry on the back straight (s≈0.50)
      gantry(0.50, 7.0, darkSteel);

      // ---- Catch fences behind the kerbs ----
      fence(0.00, 0.06,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // main straight, R
      fence(0.94, 1.00,  1, 5, 3.4, [0.62, 0.64, 0.68]);   // final corner, R
      fence(0.46, 0.62, -1, 6, 3.4, [0.62, 0.64, 0.68]);   // back straight, L
      fence(0.08, 0.14, -1, 8, 3.4, [0.62, 0.64, 0.68]);   // T1 hill, L

      // ---- Armco guardrails ----
      guardrail(0.15, 0.28,  1, 4, [0.80, 0.80, 0.82]);    // Esses, R
      guardrail(0.15, 0.28, -1, 4, [0.80, 0.80, 0.82]);    // Esses, L
      guardrail(0.78, 0.90,  1, 4, [0.80, 0.80, 0.82]);    // triple-apex sweeper, R
      guardrail(0.62, 0.70,  1, 5, [0.80, 0.80, 0.82]);    // T12 hairpin exit, R

      // ---- Tyre walls at the two big braking zones ----
      tyreWall(0.095, 0.135,  1, 6, redSteel);             // T1 apex outside
      tyreWall(0.61,  0.66,   1, 6, [0.95, 0.85, 0.1]);   // T12 hairpin
      tyreWall(0.30,  0.34,  -1, 6, [0.1, 0.5, 0.9]);     // mid-lap chicane

      // ---- Billboards / advertising hoardings ----
      billboard(K(0.07), -1, 14, 16, 6, redSteel);
      billboard(K(0.22),  1, 16, 18, 6, cotaBlue);
      billboard(K(0.40), -1, 18, 16, 6, [0.92, 0.5, 0.1]);
      billboard(K(0.50),  1, 18, 18, 6, [0.1, 0.6, 0.35]);
      billboard(K(0.70), -1, 16, 16, 6, redSteel);
      billboard(K(0.88),  1, 18, 16, 6, cotaBlue);

      // ---- Marshal posts at corner stations ----
      [0.04, 0.12, 0.20, 0.28, 0.43, 0.58, 0.64, 0.80, 0.90].forEach((s, i) => {
        marshalPost(K(s), (i % 2 ? 1 : -1), 7);
      });

      // ---- Distance-marker boards on the two big braking zones ----
      [50, 100, 150].forEach((m, i) => {
        const km = K(0.085 - m * 0.00018);
        place(km,  1, 9 + i, [1.0, 2.4, 0.4], white);
        const kh = K(0.60  - m * 0.00018);
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

      // ---- Paddock car park rows (s≈0.55, L far) ----
      const kp = K(0.55), ap = anchor(kp, -1, 72), pb = [ap.r, ap.u, ap.t];
      if (!onTrack(ap.c[0], ap.c[2], 44)) {
        for (let row = -1; row <= 1; row++) {
          for (let col = -2; col <= 2; col++) {
            const c = vadd(vadd(ap.c, ap.t, col * 7), ap.r, row * 5);
            const tint = hash(row * 7 + col * 11);
            const carCol = [0.32 + tint * 0.46, 0.28 + hash(col * 13) * 0.36, 0.30 + hash(row * 17) * 0.40];
            addBox(out, vadd(c, ap.u, 0.7), [2.0, 1.3, 4.0], carCol, pb);
          }
        }
      }

      // ================== LAMP POSTS — main straight only (reduced for performance) ==================
      // COTA is a day-race circuit. Lamp posts are kept to the main straight only —
      // every 80 m (was 50 m) to reduce addCyl/addBox count under SwiftShader.
      along(0.94, 0.06, 80, (k) => {
        for (const side of [-1, 1]) {
          const pa = anchor(k, side, 5);
          if (onTrack(pa.c[0], pa.c[2], 1)) return;
          addCyl(out, pa.c, 0.18, 10, lampPost, 5, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(pa.c, pa.u, 9.5), [0.14, 0.14, 2.8], lampPost, [pa.r, pa.u, pa.t]);
          addBox(out, vadd(vadd(pa.c, pa.t, -side * 1.2), pa.u, 9.0),
                 [0.6, 0.28, 1.2], lampHead, [pa.r, pa.u, pa.t]);
        }
      });
    },
  }
  );
})();
