/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    reverse: true,  // GPS trace is backwards vs real racing direction (auto-audit)
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 8,
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, concrete: [0.17, 0.17, 0.19], runoff: [0.24, 0.22, 0.2], grass: [0.20, 0.42, 0.22] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
    // Losail: gentle desert undulation through the far hairpin section.
    elevations: [{ s: 0.55, halfM: 380, rise: 5 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, hash, vadd, every, onTrack, groundYAt,
        place, prop, backdrop, anchor, addBox, addCyl, addFrustum, addPrism, addPyramid,
        palm, grandstand, building, cityFront, fence, wall, mountain, guardrail, tyreWall,
        billboard, marshalPost, gantry, tower, bush, along } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (NIGHT desert) ----
      const DUNE   = [0.76, 0.64, 0.46], DUNE_N = [0.56, 0.48, 0.36];
      const SAND   = [0.64, 0.52, 0.36], SAND_D = [0.45, 0.36, 0.24];
      const STEEL  = [0.13, 0.13, 0.16];
      // Floodlight colours: pure bright white lamp boxes, warm off-white truss
      const FLOOD  = [0.98, 0.98, 0.95];   // lamp-box faces — near-white
      const LAMP   = [0.92, 0.92, 0.88];   // truss / bracket — slightly warm
      const POOL   = [0.85, 0.85, 0.80];   // ground light pool — lit asphalt tint
      // Emissive window tones — warm amber for pit building, cool blue for hospitality
      const WIN_WARM = [0.88, 0.72, 0.32]; // amber lit window strips (pit-lane level)
      const WIN_COOL = [0.52, 0.68, 0.88]; // cool blue glazing (upper hospitality)
      // Night-skyline palette: muted dark desert concrete silhouettes
      const SKY_A  = [0.22, 0.24, 0.30];  // dark blue-grey tower silhouette
      const SKY_B  = [0.18, 0.20, 0.28];  // deeper tone — varied texture
      const BEACON = [0.72, 0.90, 0.98];  // nav-beacon tip glow
      const FROND  = [0.12, 0.28, 0.12];  // dark fronds for night
      const AD = [   // billboard / sponsor hoarding face tones
        [0.85, 0.18, 0.16], [0.16, 0.36, 0.72], [0.92, 0.74, 0.14],
        [0.10, 0.62, 0.42], [0.90, 0.90, 0.88], [0.62, 0.18, 0.55],
      ];

      // ---- Floodlight tower: tall dark tapered pole + bright lamp banks.
      // Qatar signature: dense white-light arrays cut the desert blackness.
      // h = total pole height (m), gap = metres beyond road edge.
      const floodTower = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        const base = a.c;
        // Main pole — slender 6-sided dark cylinder
        addCyl(out, base, 0.42, h - 4, STEEL, 6, b);
        // Tapered top section for finished look
        addCyl(out, vadd(base, a.u, h - 5), 0.60, 5, STEEL, 6, b);
        // Horizontal cross-arm carrying lamp banks — bright warm truss colour
        addBox(out, vadd(base, a.u, h - 1.0), [9.0, 0.40, 0.50], LAMP, b);
        // Secondary arm behind (parallel truss chord)
        addBox(out, vadd(base, a.u, h - 2.2), [7.4, 0.32, 0.40], LAMP, b);
        // Diagonal struts connecting both arms (left and right)
        for (const dx of [-3.8, 3.8]) {
          const sc = vadd(vadd(base, a.u, h - 1.6), a.r, dx);
          addBox(out, sc, [0.28, 1.4, 0.28], LAMP, b);
        }
        // Four bright floodlight boxes across the main arm — intense white faces
        for (const dx of [-3.4, -1.1, 1.1, 3.4]) {
          const lc = vadd(vadd(base, a.u, h - 0.4), a.r, dx);
          addBox(out, lc, [1.8, 2.0, 1.6], FLOOD, b);
        }
        // Top cap — bright white cap ledge above the lamps (reads as glowing crown)
        addBox(out, vadd(base, a.u, h + 0.6), [9.2, 0.28, 1.6], FLOOD, b);
      };

      // ---- Light pool on the ground beneath a mast.
      // Placed flush at terrain height so it never floats or clips downward.
      const lightPool = (k, side, gap, r) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        // Anchor c is already at ground; offset +0.05 m so the disc sits on top
        addCyl(out, vadd(a.c, a.u, 0.05), r, 0.07, POOL, 10, b);
      };

      // ---- Lamp post: short roadside pole + top bowl (medium-height street lights). ----
      const lampPost = (k, side, gap, h) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        addCyl(out, a.c, 0.14, h - 0.6, STEEL, 5, b);
        // Curved arm reaching toward the road
        addBox(out, vadd(vadd(a.c, a.u, h - 0.6), a.r, side * (-1.2)), [0.12, 0.12, 2.4], LAMP, b);
        // Lamp bowl
        addFrustum(out, vadd(vadd(a.c, a.u, h - 1.0), a.r, side * (-2.4)), 0.50, 0.22, 0.5, FLOOD, 7, b);
      };

      // ---- CONTINUOUS SAND-DUNE RING ----
      // Three concentric rings of organic mountain() dune shapes wrap the entire lap.
      // Using mountain() gives irregular, craggy silhouettes — far less boxy than frustums.
      (function duneRing() {
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
        cx /= n; cz /= n;
        let rad = 0;
        for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
        // [extra dist from track edge, base width, base height, count, forest/rock cols]
        for (const [extra, wMin, hMin, count, sand, dark] of [
          [160, 130, 7,  32, SAND,   SAND_D],
          [290, 175, 12, 28, DUNE,   DUNE_N],
          [420, 245, 20, 20, SAND_D, [0.38, 0.30, 0.18]],
        ]) {
          const ring = rad + extra;
          for (let i = 0; i < count; i++) {
            const a  = i / count * 6.2832 + hash(i * 3 + extra) * 0.18;
            const hf = hash(i * 7 + extra);
            const rr = ring + (hash(i * 5 + extra) - 0.5) * extra * 0.5;
            mountain(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, pyMin,
                     wMin + hf * wMin * 0.9, hMin + hf * hMin * 0.7,
                     { seg: 7, seed: i * 4 + extra, rough: 0.42, snowline: 1.4,
                       forest: sand, rock: dark, snow: dark });
          }
        }
      })();

      // ================= START / FINISH STRAIGHT =================
      // Pit building (L, close): modern white slab with WARM LIT windows.
      // floor=3.6 gives 3 bands of amber window light reading as night-active pits.
      building(K(0.00), -1, 1.2, 16, 11, 165,
        { wall: [0.94, 0.94, 0.92], window: WIN_WARM, floor: 3.6 });
      // Upper hospitality deck: cool blue glazing for contrast (lounge above pits)
      building(K(0.01), -1, 17, 13, 8, 135,
        { wall: [0.90, 0.90, 0.88], window: WIN_COOL, floor: 3.2 });
      // Pit garage roll-up door band (dark panels — darker at night)
      (function pitGarages() {
        let i = 0;
        along(0.0, 0.10, 6, (k) => {
          const col = (i % 2) ? [0.18, 0.18, 0.20] : [0.28, 0.28, 0.30];
          place(k, -1, 3, [0.5, 4.5, 5.0], col);
          i++;
        });
      })();
      wall(0.96, 0.06, -1, 3, 1.0, [0.85, 0.85, 0.85]);  // pit wall

      // Emissive bright awning strip along the top of pit building (lit fascia)
      (function pitFascia() {
        along(0.0, 0.10, 8, (k) => {
          const a = anchor(k, -1, 1.2), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 11.4), [0.35, 0.9, 8], WIN_WARM, b);
        });
      })();

      // Paddock / media centre behind pit building: cityFront gives varied massing
      // (warm-lit windows, desert-concrete tones) instead of uniform flat slabs.
      cityFront(0.97, 0.07, -1, 32, {
        minH: 8, maxH: 22, depth: 18, step: 20,
        palette: [[0.28, 0.26, 0.24], [0.32, 0.30, 0.26], [0.24, 0.22, 0.20]],
        lit: true, windowCol: WIN_WARM,
      });

      // Start gantry + timing tower
      gantry(0.012, 7.5, [0.12, 0.12, 0.14]);
      // tower(k, side, dist, baseW, h, opts) — fixed: was missing baseW
      tower(K(0.985), -1, 8, 6, 26, { col: [0.18, 0.18, 0.21], cap: true, capCol: FLOOD });

      // Main grandstand (R, close): long curved crescent stepped slab.
      // Hero structure — pale curved shell lit from below by floodlights.
      (function crescentStand() {
        for (let i = 0; i < 10; i++) {
          const s = 0.950 + i * 0.011;
          grandstand(s % 1, 1, 16, 60, [0.86, 0.86, 0.84], [0.20, 0.20, 0.24]);
        }
        // Bright white roof fascia with slim pylons — cantilever over crowd
        for (let i = 0; i < 10; i++) {
          const a = anchor(K((0.950 + i * 0.011) % 1), 1, 24), b = [a.r, a.u, a.t];
          // Roof slab — slightly warm white reading as lit concrete
          addBox(out, vadd(a.c, a.u, 25), [16, 3.2, 74], [0.94, 0.94, 0.92], b);
          // Support pylon
          addBox(out, vadd(a.c, a.u, 12.5), [0.8, 25, 0.8], [0.88, 0.88, 0.86], b);
          // Lit sponsor band on roof fascia front face — warm amber strip
          addBox(out, vadd(vadd(a.c, a.u, 26.2), a.r, -9), [0.45, 1.6, 44], AD[i % AD.length], b);
          // Under-canopy LED strip (bright strip below the roof slab edge)
          addBox(out, vadd(vadd(a.c, a.u, 24.2), a.r, -9), [0.22, 0.5, 44], FLOOD, b);
        }
      })();

      // Start/finish floodlight towers: DENSE cluster on both sides — Qatar signature.
      // Towers spaced more tightly here (the primary televised section).
      for (const s of [0.0, 0.01, 0.02, 0.03, 0.04, 0.05]) {
        for (const side of [-1, 1]) {
          const gap = 36 + hash(K(s) * 7) * 5;
          floodTower(K(s), side, gap, 34 + hash(K(s) * 11) * 4);
          // Light pool directly at mast base (gap-radius tangent to the mast foot)
          lightPool(K(s), side, gap - 2, 7 + hash(K(s) * 5));
        }
      }
      // Pit-straight lamp posts lining the pit wall (low, angled over track)
      along(0.86, 0.12, 18, (k) => {
        lampPost(k, -1, 5.5, 9);
      });
      // Sponsor hoardings along both verges
      (function straightAds() {
        let i = 0;
        along(0.86, 0.12, 22, (k) => {
          billboard(k, 1, 5, 9, 3.2, AD[i % AD.length]);
          i++;
        });
      })();

      // ================= TURN 1 — NORTH GRANDSTAND (s 0.06, R) =================
      // Prime braking zone: large stepped grandstand + tyre wall + towers.
      grandstand(0.053, 1, 20, 95, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.070, 1, 20, 65, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (let i = 0; i < 7; i++) {
        const a = anchor(K((0.053 + i * 0.012) % 1), 1, 26), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 24), [17, 3.0, 66], [0.92, 0.92, 0.90], b);
        // Under-canopy LED strip on grandstand roofs
        addBox(out, vadd(vadd(a.c, a.u, 23.2), a.r, -10), [0.2, 0.45, 65], FLOOD, b);
      }
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);
      // Three towers: two on the outer/right, one on the left for balance
      floodTower(K(0.055), 1, 36, 32);
      floodTower(K(0.075), 1, 36, 32);
      floodTower(K(0.048), -1, 36, 32);
      lightPool(K(0.055), 1, 14, 8);
      lightPool(K(0.075), 1, 14, 8);
      lightPool(K(0.048), -1, 14, 8);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.065), 1, 6, 12, 3.8, AD[0]);

      // ================= PALM CLUSTER (s 0.10, L far) =================
      // Three rows at varying depths — foreground, mid, far — for depth layering.
      for (let i = 0; i < 18; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.003)) % n;
        const depth = 38 + hash(k * 5) * 22;
        palm(k, -1, depth, 7.5 + hash(k * 9) * 2.5, FROND);
        if (hash(k * 13) > 0.40) bush(k, -1, depth - 12 + hash(k * 17) * 10, [0.32, 0.34, 0.18]);
      }
      // Second row of palms further back — gives receding depth behind T1
      for (let i = 0; i < 10; i++) {
        const k = (K(0.09) + i * Math.round(n * 0.005)) % n;
        palm(k, -1, 68 + hash(k * 7) * 30, 9 + hash(k * 11) * 3, FROND);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS (s 0.18, R) =================
      grandstand(0.162, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.183, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.204, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.162, 0.183, 0.204]) {
        const a = anchor(K(s), 1, 27), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 17), [15, 2.4, 56], [0.92, 0.92, 0.90], b);
        // Under-canopy LED strip
        addBox(out, vadd(vadd(a.c, a.u, 16.4), a.r, -9), [0.2, 0.4, 55], FLOOD, b);
        // Lit sponsor strip on roof edge
        addBox(out, vadd(vadd(a.c, a.u, 18.2), a.r, -9), [0.4, 1.2, 55], WIN_WARM, b);
      }
      floodTower(K(0.170), -1, 34, 30);
      floodTower(K(0.198), 1, 34, 30);
      lightPool(K(0.170), -1, 13, 7);
      lightPool(K(0.198), 1, 13, 7);
      guardrail(0.14, 0.24, 1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.19), 1, 6);
      billboard(K(0.21), 1, 6, 11, 3.4, AD[2]);

      // ================= ORGANIC SAND DUNES (s 0.28, L far) =================
      // mountain() gives irregular craggy silhouettes — more organic than frustum wedges.
      // Gaps stagger so dunes don't overlap each other or the track.
      for (let i = 0; i < 11; i++) {
        const k = (K(0.28) + i * Math.round(n * 0.007)) % n;
        const gap = 52 + i * 14 + hash(k * 3) * 18;
        const w   = 38 + hash(k * 5) * 22;
        const h   =  3 + hash(k * 7) * 4;
        const a = anchor(k, -1, gap + w * 0.62);
        mountain(a.c[0], a.c[2], pyMin, w, h,
          { seg: 7, seed: k * 4 + 28, rough: 0.50, snowline: 1.6,
            forest: DUNE, rock: DUNE_N, snow: DUNE_N });
      }
      marshalPost(K(0.30), -1, 6);

      // ================= TURNS 4-6 SWEEP — open desert flats (s 0.40) ===
      // Organic dune masses on both sides — wider gaps for the corner zone
      for (let i = 0; i < 8; i++) {
        const k = (K(0.36) + i * Math.round(n * 0.010)) % n;
        for (const side of [-1, 1]) {
          const gap = 82 + i * 18 + hash(k * 7 + side) * 20;
          const w   = 44 + hash(k * 9 + side) * 20;
          const h   =  3 + hash(k * 11 + side) * 3.5;
          const a = anchor(k, side, gap + w * 0.62);
          mountain(a.c[0], a.c[2], pyMin, w, h,
            { seg: 7, seed: k * 5 + side * 3 + 40, rough: 0.48, snowline: 1.6,
              forest: SAND, rock: SAND_D, snow: SAND_D });
        }
      }
      floodTower(K(0.39), -1, 40, 33);
      floodTower(K(0.41), 1, 40, 33);
      floodTower(K(0.435), -1, 40, 33);
      lightPool(K(0.39), -1, 14, 9);
      lightPool(K(0.41), 1, 14, 9);
      lightPool(K(0.435), -1, 14, 9);
      guardrail(0.36, 0.50, -1, 4, [0.78, 0.78, 0.80]);
      marshalPost(K(0.43), 1, 6);
      // Lamp posts along the sweep (roadside night atmosphere)
      along(0.37, 0.48, 32, (k) => {
        for (const side of [-1, 1]) lampPost(k, side, 4.5, 8);
      });
      // Artificial-grass verge accents
      for (let i = 0; i < 6; i++) {
        const k = (K(0.38) + i * Math.round(n * 0.011)) % n;
        for (const side of [-1, 1]) place(k, side, 2.0, [3.0, 0.25, 9], [0.20, 0.42, 0.22]);
      }

      // ================= DISTANT LUSAIL / DOHA SKYLINE (s 0.45–0.60, L far) ====
      // Use backdrop() so towers auto-get window bands (dark-night tower → lit panes).
      // Three clusters stagger laterally via separate fractions.
      // Towers pushed 600–760 m out so they never clip dune ring or track.
      (function skyline() {
        // Lifted silhouette tones + a wider arc + occasional landmark spires so
        // Lusail actually reads on the horizon (it was too dark/narrow before).
        const LA = [0.30, 0.33, 0.42], LB = [0.24, 0.27, 0.38];
        for (const sBase of [0.38, 0.43, 0.48, 0.53, 0.58, 0.63]) {
          for (let i = 0; i < 11; i++) {
            const hf = hash(i * 7 + sBase * 30);
            const wf = hash(i * 3 + sBase * 20);
            const sFrac = (sBase + (i - 5) * 0.008 + 1) % 1;
            const dist  = 400 + hash(i * 5 + sBase * 70) * 180;
            const landmark = hash(i * 4.4 + sBase) > 0.85;
            const w = 6 + wf * 9;
            const h = (landmark ? 150 : 56) + hf * 150;
            const d = w * 1.4;
            const col = (hash(i * 11 + sBase) > 0.5) ? LA : LB;
            // backdrop() auto-adds lit window bands for night circuits
            backdrop(K(sFrac), -1, dist, [w, h, d], col);
            // Navigation beacon at top — bright spot in the night sky
            if (landmark || hash(i * 9.1 + sBase) > 0.45) {
              const a = anchor(K(sFrac), -1, dist);
              addBox(out, vadd(a.c, a.u, h + 2), [1.5, 3.8, 1.5], BEACON, [a.r, a.u, a.t]);
            }
          }
        }
      })();

      // ================= MARSHAL / TIMING HUTS (s 0.62, R mid) =================
      for (let i = 0; i < 5; i++) {
        const k = (K(0.62) + i * 2) % n;
        place(k, 1, 26 + i * 5, [4, 4, 5], [0.90, 0.90, 0.88]);
        // Red roof cap
        place(k, 1, 26 + i * 5, [4.4, 0.65, 5.4], [0.55, 0.18, 0.16]);
        // Lit window on each hut (amber square)
        const a = anchor(k, 1, 26 + i * 5), bv = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 2.8), [0.18, 1.4, 1.4], WIN_WARM, bv);
      }
      marshalPost(K(0.61), 1, 6);
      marshalPost(K(0.66), -1, 6);
      floodTower(K(0.595), 1, 36, 31);
      floodTower(K(0.635), -1, 36, 31);
      lightPool(K(0.595), 1, 14, 8);
      lightPool(K(0.635), -1, 14, 8);
      guardrail(0.58, 0.68, 1, 4, [0.78, 0.78, 0.80]);
      billboard(K(0.63), -1, 6, 10, 3.2, AD[3]);

      // ================= REPEATING MASTS + CATCH FENCE (s 0.68–0.82) =====
      fence(0.66, 0.84, 1, 6, 3.4, [0.66, 0.68, 0.72]);
      fence(0.66, 0.84, -1, 6, 3.4, [0.66, 0.68, 0.72]);
      guardrail(0.66, 0.84, 1, 3.2, [0.78, 0.78, 0.80]);
      guardrail(0.66, 0.84, -1, 3.2, [0.78, 0.78, 0.80]);
      // Three pairs of towers across this section — offset so they don't share nodes
      for (const [s, sOff] of [[0.70, 0.01], [0.74, 0.01], [0.78, 0.01]]) {
        floodTower(K(s),       1,  36, 31);
        floodTower(K(s + sOff), -1, 36, 31);
        lightPool(K(s),       1,  13, 8);
        lightPool(K(s + sOff), -1, 13, 8);
      }
      tyreWall(0.70, 0.74, -1, 5, [0.85, 0.16, 0.16]);
      marshalPost(K(0.76), 1, 6);
      billboard(K(0.72), 1, 6, 10, 3.2, AD[1]);
      billboard(K(0.80), -1, 6, 10, 3.2, AD[4]);
      // Lamp posts in the long mid-circuit run
      along(0.67, 0.83, 28, (k) => {
        lampPost(k, 1, 4.5, 8);
      });

      // ================= SPARSE PALM ROW + SAND FLATS (s 0.86, L far) =========
      for (let i = 0; i < 15; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.005)) % n;
        palm(k, -1, 38 + i * 6, 7.2 + hash(k * 3) * 3, FROND);
        if (hash(k * 21) > 0.50) bush(k, -1, 28 + hash(k * 23) * 14, [0.30, 0.32, 0.16]);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 GRANDSTAND + PIT ENTRY (s 0.93-0.95, R) ======
      // Final corner — returning onto start/finish straight.
      grandstand(0.930, 1, 17, 75, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.952, 1, 17, 55, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.930, 0.952]) {
        const a = anchor(K(s), 1, 24), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 18), [15, 2.4, 58], [0.92, 0.92, 0.90], b);
        // Under-canopy LED strip
        addBox(out, vadd(vadd(a.c, a.u, 17.4), a.r, -9), [0.2, 0.4, 57], FLOOD, b);
        // Lit sponsor band on roof edge
        addBox(out, vadd(vadd(a.c, a.u, 19.0), a.r, -9), [0.4, 1.2, 57], WIN_WARM, b);
      }
      tyreWall(0.91, 0.945, 1, 5, [0.90, 0.86, 0.20]);
      floodTower(K(0.948), 1, 34, 30);
      floodTower(K(0.968), -1, 34, 30);
      lightPool(K(0.948), 1, 13, 8);
      lightPool(K(0.968), -1, 13, 8);
      marshalPost(K(0.94), -1, 6);
      billboard(K(0.92), 1, 6, 12, 3.6, AD[5]);

      // ---- Scattered palms behind runoff (desert planting), sparse. ----
      every(140, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 17 + side * 3) <= 0.45) {
            palm(k, side, 24 + hash(k * 19 + side) * 26, 6.5 + hash(k * 23 + side) * 3.5, FROND);
          }
        }
      });

      // ---- Desert scrub: sparse low tan/olive bushes across the sand verge. ----
      every(80, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 29 + side * 7) <= 0.48) {
            const a = anchor(k, side, 32 + hash(k * 31 + side) * 60), b = [a.r, a.u, a.t];
            const s = 1.8 + hash(k * 37 + side) * 1.6;
            const scrubCol = hash(k * 41 + side) < 0.55 ? [0.50, 0.46, 0.32] : [0.30, 0.36, 0.20];
            addFrustum(out, a.c, s, s * 0.40, s * 0.90, scrubCol, 6, b);
          }
        }
      });

      // ---- Global floodlight towers: ring the rest of the lap every ~300m. ----
      // Slightly larger spacing (300m) so they don't cluster on top of the
      // explicit towers placed above. Offset gap varies to avoid stacking.
      every(300, (k) => {
        const side = hash(k * 9) < 0.5 ? -1 : 1;
        const gap = 40 + hash(k * 11) * 10;
        floodTower(k, side, gap, 32 + hash(k * 13) * 4);
        lightPool(k, side, gap - 2, 9 + hash(k * 17) * 1.5);
      });

      // ---- Continuous artificial-grass verge band hugging both edges. ----
      every(50, (k) => {
        for (const side of [-1, 1]) {
          place(k, side, 1.8, [3.4, 0.28, 10], [0.22, 0.44, 0.24]);
        }
      });

      // ---- Sand-creep wedges: flat tan aprons simulating desert sand drift. ----
      // Larger gap (14m) so they clear the asphalt edge and don't clip the road.
      for (const [s, side, w, d] of [
        [0.06, 1, 9, 14], [0.08, -1, 8, 12], [0.40, -1, 7, 11], [0.42, 1, 8, 13],
        [0.44, 1, 7, 10], [0.92, 1, 9, 15], [0.94, -1, 8, 12], [0.96, -1, 7, 11],
      ]) {
        const a = anchor(K(s), side, 14), b = [a.r, a.u, a.t];
        // Lay the slab at terrain height (a.c is already ground-anchored)
        addBox(out, vadd(a.c, a.u, 0.14), [w, 0.22, d], [0.70, 0.62, 0.46], b);
      }
    },
  }
  );
})();
