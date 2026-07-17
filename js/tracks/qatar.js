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
    lengthKm: 5.4,
    sunAzimBias: -0.30,   // Losail's late-afternoon sun hangs low to the NE-facing main straight
    baseHW: 8,
    // Warm pal.runoff = tan sand beyond the green verge (brief / COL.desertSand)
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, concrete: [0.17, 0.17, 0.19], runoff: [0.72, 0.58, 0.38], grass: [0.20, 0.42, 0.22] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
    // Losail: gentle desert undulation through the far hairpin section.
    elevations: [{ s: 0.55, halfM: 380, rise: 5 }],
    scenery: function (api) {
      const { out, MAT, n, px, pz, pyMin, hash, vadd, every,
        place, backdrop, anchor, addBox, addCyl, addFrustum,
        palm, grandstand, building, fence, wall, mountain, guardrail, tyreWall,
        billboard, marshalPost, gantry, tower, bush, along,
        floodMast, floodMastRing, runoffApron, sailCanopy, COL } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Palette (NIGHT desert) ----
      const DUNE   = [0.76, 0.64, 0.46], DUNE_N = [0.56, 0.48, 0.36];
      const SAND   = [0.64, 0.52, 0.36], SAND_D = [0.45, 0.36, 0.24];
      const STEEL  = [0.13, 0.13, 0.16];
      const FLOOD  = [0.98, 0.98, 0.95];
      const LAMP   = [0.92, 0.92, 0.88];
      const POOL   = [0.85, 0.85, 0.80];
      const WIN_WARM = [0.88, 0.72, 0.32];
      const WIN_COOL = [0.52, 0.68, 0.88];
      const BEACON = [0.72, 0.90, 0.98];
      const FROND  = [0.12, 0.28, 0.12];
      const GRASS  = [0.20, 0.42, 0.22];
      const SAND_COL = (COL && COL.desertSand) || [0.72, 0.58, 0.38];
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

      // ================= START / FINISH — record pit slab + crescent =========
      // Tilke 402 m pit building: long low white slab + horizontal banding.
      building(K(0.00), -1, 1.2, 16, 11, 210,
        { wall: WHITE, window: WIN_WARM, floor: 3.6 });
      building(K(0.01), -1, 17, 13, 8, 160,
        { wall: [0.90, 0.90, 0.88], window: WIN_COOL, floor: 3.2 });
      // Horizontal banding stripe along the pit face (Tilke language)
      along(0.0, 0.12, 10, (k) => {
        const a = anchor(k, -1, 1.2), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 5.5), [0.25, 0.45, 10], [0.78, 0.78, 0.76], b);
        addBox(out, vadd(a.c, a.u, 11.4), [0.35, 0.9, 8], WIN_WARM, b);
      });
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

      gantry(0.012, 7.5, [0.12, 0.12, 0.14]);
      tower(K(0.985), -1, 8, 6, 26, { col: [0.18, 0.18, 0.21], cap: true, capCol: FLOOD });

      // Main grandstand (R): long curved crescent stepped slab.
      (function crescentStand() {
        for (let i = 0; i < 10; i++) {
          const s = 0.950 + i * 0.011;
          grandstand(s % 1, 1, 16, 60, [0.86, 0.86, 0.84], [0.20, 0.20, 0.24]);
        }
        for (let i = 0; i < 10; i++) {
          const a = anchor(K((0.950 + i * 0.011) % 1), 1, 24), b = [a.r, a.u, a.t];
          addBox(out, vadd(a.c, a.u, 25), [16, 3.2, 74], WHITE, b);
          addBox(out, vadd(a.c, a.u, 12.5), [0.8, 25, 0.8], [0.88, 0.88, 0.86], b);
          addBox(out, vadd(vadd(a.c, a.u, 26.2), a.r, -9), [0.45, 1.6, 44], AD[i % AD.length], b);
          addBox(out, vadd(vadd(a.c, a.u, 24.2), a.r, -9), [0.22, 0.5, 44], FLOOD, b);
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
      grandstand(0.053, 1, 20, 95, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.070, 1, 20, 65, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (let i = 0; i < 7; i++) {
        const a = anchor(K((0.053 + i * 0.012) % 1), 1, 26), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 24), [17, 3.0, 66], [0.92, 0.92, 0.90], b);
        addBox(out, vadd(vadd(a.c, a.u, 23.2), a.r, -10), [0.2, 0.45, 65], FLOOD, b);
      }
      tyreWall(0.04, 0.085, 1, 5, [0.90, 0.86, 0.20]);
      marshalPost(K(0.05), -1, 6);
      billboard(K(0.065), 1, 6, 12, 3.8, AD[0]);

      // T1 VVIP — white villa + ~60 m branch-style sail canopy (replaces mosque)
      (function t1Vvip() {
        building(K(0.048), -1, 36, 18, 9, 32,
          { wall: WHITE, window: WIN_COOL, floor: 3.4 });
        building(K(0.058), -1, 40, 14, 7, 24,
          { wall: [0.91, 0.91, 0.89], window: WIN_WARM, floor: 3.2 });
        const a = anchor(K(0.052), -1, 48), b = [a.r, a.u, a.t];
        if (typeof sailCanopy === "function") {
          sailCanopy(a.c, b, { rad: 28, rx: 30, rz: 18, h: 16, col: WHITE, ribs: 10, thick: 0.6 });
        } else {
          // Fallback: tree-branch canopy as clustered white boxes + mast
          addCyl(out, a.c, 0.55, 16, STEEL, 6, b);
          addBox(out, vadd(a.c, a.u, 16.4), [52, 0.55, 28], WHITE, b);
          for (const dx of [-18, -9, 0, 9, 18]) {
            addBox(out, vadd(vadd(a.c, a.u, 12), a.r, dx * 0.15), [0.35, 8, 0.35], STEEL, b);
            addBox(out, vadd(vadd(a.c, a.u, 16.2), a.t, dx), [8, 0.4, 0.4], LAMP, b);
          }
        }
        // Lit under-canopy strip
        addBox(out, vadd(a.c, a.u, 15.6), [40, 0.25, 1.2], FLOOD, b);
      })();

      // ================= SPARSE PALMS (culled — vert budget for flood ring) ===
      for (let i = 0; i < 8; i++) {
        const k = (K(0.10) + i * Math.round(n * 0.006)) % n;
        palm(k, -1, 48 + hash(k * 5) * 24, 7.5 + hash(k * 9) * 2.5, FROND);
      }

      // ================= T2/T3 PAIRED GRANDSTANDS ============================
      grandstand(0.162, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.183, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.204, 1, 22, 52, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.162, 0.183, 0.204]) {
        const a = anchor(K(s), 1, 27), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 17), [15, 2.4, 56], [0.92, 0.92, 0.90], b);
        addBox(out, vadd(vadd(a.c, a.u, 16.4), a.r, -9), [0.2, 0.4, 55], FLOOD, b);
        addBox(out, vadd(vadd(a.c, a.u, 18.2), a.r, -9), [0.4, 1.2, 55], WIN_WARM, b);
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

      // ================= DISTANT LUSAIL / DOHA SKYLINE (thinned) =============
      (function skyline() {
        const LA = [0.30, 0.33, 0.42], LB = [0.24, 0.27, 0.38];
        for (const sBase of [0.42, 0.50, 0.58]) {
          for (let i = 0; i < 7; i++) {
            const hf = hash(i * 7 + sBase * 30);
            const wf = hash(i * 3 + sBase * 20);
            const sFrac = (sBase + (i - 3) * 0.010 + 1) % 1;
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

      // ================= SPARSE PALM ROW (s 0.86) ===========================
      for (let i = 0; i < 8; i++) {
        const k = (K(0.84) + i * Math.round(n * 0.008)) % n;
        palm(k, -1, 42 + i * 8, 7.2 + hash(k * 3) * 3, FROND);
      }
      marshalPost(K(0.88), 1, 6);

      // ================= TURN 16 GRANDSTAND + PIT ENTRY =====================
      grandstand(0.930, 1, 17, 75, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      grandstand(0.952, 1, 17, 55, [0.44, 0.45, 0.50], [0.18, 0.18, 0.21]);
      for (const s of [0.930, 0.952]) {
        const a = anchor(K(s), 1, 24), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 18), [15, 2.4, 58], [0.92, 0.92, 0.90], b);
        addBox(out, vadd(vadd(a.c, a.u, 17.4), a.r, -9), [0.2, 0.4, 57], FLOOD, b);
        addBox(out, vadd(vadd(a.c, a.u, 19.0), a.r, -9), [0.4, 1.2, 57], WIN_WARM, b);
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
      // Continuous artificial-grass band hugging both edges, then warm sand
      // runoff aprons beyond — the Lusail edge signature.
      every(20, (k) => {
        for (const side of [-1, 1]) {
          place(k, side, 1.5, [2.6, 0.22, 14], GRASS);
        }
      });
      every(32, (k) => {
        for (const side of [-1, 1]) {
          if (typeof runoffApron === "function") {
            runoffApron(k, side, 4.2, [16, 0.28, 26], SAND_COL);
          } else {
            place(k, side, 12, [16, 0.28, 26], SAND_COL);
          }
        }
      });
    },
  }
  );
})();
