/* Apex 26 — ABU DHABI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    pal: { horizon: [0.28, 0.14, 0.06], zenith: [0.04, 0.04, 0.14], sunColor: [0.85, 0.65, 0.35], ambientSky: [0.28, 0.22, 0.18], ambientGround: [0.30, 0.18, 0.10], fogColor: [0.20, 0.10, 0.05], fogDensity: 0.0022, sunDir: [0.6, 0.12, 0.3], concrete: [0.26, 0.25, 0.24], runoff: [0.22, 0.21, 0.2], grass: [0.18, 0.16, 0.12] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 70, l: 80 }, { t: 0, l: 400 }, { t: 90, l: 100 }, { t: 0, l: 200 },
      { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 90, l: 100 }, { t: -60, l: 80 },
    ],
    // Yas Marina underpass: the circuit dips below the Yas Hotel near the end of the lap.
    elevations: [{ s: 0.88, halfM: 160, rise: -4 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, groundPlane, addBox,
        anchor, onTrack, hash, vadd, building, tower, grandstand, billboard,
        gantry, palm, addCyl } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- dusk-to-night marina palette ----
      const LED_TEAL = [0.20, 0.80, 0.90];
      const LED_MAG = [0.90, 0.20, 0.70];
      const LED_AMBER = [1.00, 0.60, 0.20];
      const LED_CYCLE = [LED_TEAL, LED_MAG, LED_AMBER];
      const WARM = [1.00, 0.72, 0.38];     // dock / base uplight
      const WIN = [0.70, 0.78, 0.95];      // cool lit windows
      const WIN_WARM = [1.00, 0.84, 0.58];  // warm lit windows (sunset side)
      const FLOOD = [0.88, 0.92, 1.00];    // floodlit white
      const SAND = [0.70, 0.55, 0.35];
      const SAND_DK = [0.52, 0.40, 0.26];  // shaded dune
      const WATER = [0.04, 0.06, 0.12];
      const FERRARI = [0.85, 0.08, 0.10];
      const DARK = [0.10, 0.10, 0.14];
      const DUSK = [0.30, 0.16, 0.20];     // deep sunset masonry

      // ===================================================================
      // Flat far horizon: low desert-sand dune band ringing the lap (no hills)
      // ===================================================================
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      // three staggered dune bands = continuous seaward backdrop, no gaps
      for (const [extra, count, wMin, hMin, hVar, col] of [
        [370, 64, 220, 8,  8,  SAND],
        [490, 56, 260, 12, 10, SAND_DK],
        [620, 48, 310, 16, 12, [0.60, 0.46, 0.28]],
      ]) {
        const ring = trad + extra;
        for (let i = 0; i < count; i++) {
          const a = (i + 0.5 * (extra > 500 ? 1 : 0)) / count * 6.2832, h = hash(i * 7 + extra);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          addBox(out, [mx, pyMin + (hMin + h * hVar) / 2, mz], [wMin + h * 160, hMin + h * hVar, 160], col);
        }
      }

      // ===================================================================
      // CONTINUOUS Yas Island marina skyline: two dense unbroken rings of lit
      // buildings wrapping the lap. Reduced onTrack margin so fewer get culled.
      // ===================================================================
      for (const [extra, N, jit] of [[200, 80, 60], [290, 66, 90]]) {
        const ring = trad + extra;
        for (let i = 0; i < N; i++) {
          const a = i / N * 6.2832, h = hash(i * 13 + extra), h2 = hash(i * 29 + extra + 11);
          const bx = cx + Math.cos(a) * (ring + (h - 0.5) * jit);
          const bz = cz + Math.sin(a) * (ring + (h - 0.5) * jit);
          const w = 20 + h * 28, d = 20 + h2 * 28, hh = 14 + h * 54;
          addBox(out, [bx, pyMin + hh / 2, bz], [w, hh, d], (i % 3 === 0) ? DUSK : DARK);
          const win = (i % 2) ? WIN : WIN_WARM;
          addBox(out, [bx, pyMin + hh - 5, bz], [w + 0.6, 9, d + 0.6], win);
          const bc = LED_CYCLE[i % 3];
          addBox(out, [bx, pyMin + hh + 2, bz], [3, 4, 3], bc);
        }
      }

      // ===================================================================
      // Mid-depth leisure structures: domes + low resort halls + warm lanterns
      // ===================================================================
      {
        const ring = trad + 350;
        const N = 38;
        for (let i = 0; i < N; i++) {
          const a = (i + 0.4) / N * 6.2832, h = hash(i * 17 + 3);
          const lx = cx + Math.cos(a) * ring, lz = cz + Math.sin(a) * ring;
          const w = 44 + h * 56;
          addBox(out, [lx, pyMin + 9, lz], [w, 18, w * 0.7], DARK);
          addBox(out, [lx, pyMin + 18, lz], [w * 0.5, 6, w * 0.4], WARM);
        }
      }

      // ===================================================================
      // s 0.00 both — pit straight: long low pit-garage box R, Main Grandstand
      // box-rows L, scoring gantry over the line
      // ===================================================================
      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), 1, 12, [9, 6, 30], [0.30, 0.31, 0.36]);   // pit garages
        place(K(0.0 + i * 0.012), 1, 12, [9.4, 1.0, 30.4], FLOOD);          // lit fascia band
      }
      grandstand(0.0, -1, 6, 120, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.02, -1, 6, 90, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      gantry(0.0, 9, DARK);

      // ===================================================================
      // s 0.05 L — Turn 1 + esses: marshal-light spectator banks
      // ===================================================================
      grandstand(0.05, -1, 8, 70, [0.20, 0.21, 0.27], [0.28, 0.32, 0.44]);
      billboard(K(0.05), -1, 10, 18, 11, LED_TEAL);

      // ===================================================================
      // s 0.18 R far — FERRARI WORLD: huge low red roof box + white/yellow logo
      // disc, desert behind
      // ===================================================================
      {
        const k = K(0.18);
        place(k, 1, 100, [180, 26, 150], FERRARI);               // vast red roof mass
        place(k, 1, 103, [184, 5, 154], [0.55, 0.05, 0.06]);     // shaded eave band
        const a = anchor(k, 1, 70);
        addCyl(out, vadd(a.c, a.u, 30), 22, 3, [0.95, 0.93, 0.85], 14, [a.r, a.u, a.t]);   // logo disc
        addCyl(out, vadd(a.c, a.u, 31.5), 11, 2, [1.00, 0.85, 0.10], 12, [a.r, a.u, a.t]); // yellow centre
      }

      // ===================================================================
      // s 0.28 both — NORTH HAIRPIN: curved sun-tower grandstand bowl
      // ===================================================================
      for (const side of [-1, 1]) {
        grandstand(0.28, side, 7, 90, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
        grandstand(0.30, side, 7, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      }

      // ===================================================================
      // s 0.34 both — back straight: thin LED light-tower boxes at intervals
      // (dark pole + bright cap), alternating sides
      // ===================================================================
      for (let i = 0; i < 13; i++) {
        const side = (i % 2) ? 1 : -1;
        tower(K(0.34 + i * 0.006), side, 16, 4, 34,
          { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      }
      // extra floodlights ringing pit straight + hairpin for the night look
      for (let i = 0; i < 6; i++)
        tower(K(0.0 + i * 0.012), -1, 20, 4, 36, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++)
          tower(K(0.27 + i * 0.014), side, 18, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });

      // ===================================================================
      // s 0.42 L — banked Turn 9: runoff + grandstand boxes
      // ===================================================================
      grandstand(0.42, -1, 9, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      place(K(0.42), -1, 32, [60, 0.4, 30], [0.20, 0.21, 0.22]);   // pale runoff apron

      // ===================================================================
      // s 0.55 R mid — MARINA opens: CONTINUOUS dark water plane running the
      // whole marina half, dense rows of white yacht-hull boxes + masts +
      // warm reflection specks
      // ===================================================================
      for (let i = 0; i < 11; i++) groundPlane(K(0.52 + i * 0.026), 1, 14, [130, 1.2, 130], WATER);
      for (let i = 0; i < 28; i++) {
        const k = K(0.53 + (i % 14) * 0.018);
        const a = anchor(k, 1, 22 + (i % 4) * 11);
        const off = ((i % 7) - 3) * 9;
        const hc = vadd(a.c, a.t, off);
        const big = (i % 5 === 0) ? 1.5 : 1.0;
        addBox(out, vadd(hc, a.u, 1.2 * big), [4.5 * big, 2.4 * big, 11 * big], [0.92, 0.93, 0.95], [a.r, a.u, a.t]);  // hull
        addCyl(out, vadd(hc, a.u, 9 * big), 0.18, 12 * big, [0.85, 0.86, 0.9], 4, [a.r, a.u, a.t]);                    // mast
        addBox(out, vadd(hc, a.u, 0.5), [5.0 * big, 0.4, 11.5 * big], WARM, [a.r, a.u, a.t]);                          // warm reflection speck
      }

      // ===================================================================
      // s 0.62 R mid — MARINA HOTEL: mid-rise lit-window slab + warm base
      // uplight, flanked by two shorter lit wings (denser hotel cluster)
      // ===================================================================
      building(K(0.62), 1, 25, 50, 56, 30, { wall: [0.16, 0.18, 0.26], window: WIN, floor: 6 });
      building(K(0.60), 1, 29, 34, 34, 24, { wall: [0.15, 0.17, 0.24], window: WIN_WARM, floor: 5 });
      building(K(0.64), 1, 29, 34, 38, 24, { wall: [0.15, 0.17, 0.24], window: WIN, floor: 5 });
      place(K(0.62), 1, 52, [54, 4, 8], WARM);   // warm uplit base band
      place(K(0.60), 1, 46, [36, 3, 7], WARM);
      place(K(0.64), 1, 46, [36, 3, 7], WARM);

      // ===================================================================
      // s 0.70 R near — marina-side grandstand + amber dock-lamp dot row
      // ===================================================================
      grandstand(0.70, 1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      for (let i = 0; i < 8; i++) {
        const a = anchor(K(0.70), 1, 6 + i * 1.0);
        addCyl(out, vadd(a.c, a.t, (i - 4) * 7), 0.14, 5, [0.30, 0.25, 0.18], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.t, (i - 4) * 7), a.u, 5), [1.2, 1.0, 1.2], WARM, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.78 L — MARSA swept curve: long gentle grandstand chain, cool kerbs
      // ===================================================================
      grandstand(0.78, -1, 8, 100, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.80, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);

      // ===================================================================
      // s 0.88 OVER — W YAS HOTEL (hero): two curved towers flanking the track
      // joined by a gridshell arch box straddling the road, colour-cycle LED faces
      // ===================================================================
      {
        const k = K(0.88);
        // flanking towers — built clear of the racing line, with LED-grid shells
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 14);
          const H = 44;
          addBox(out, vadd(a.c, a.u, H / 2), [26, H, 30], [0.10, 0.11, 0.16], [a.r, a.u, a.t]); // tower mass
          // emissive LED grid facing the track
          for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 4; gx++) {
            const cc = vadd(vadd(a.c, a.u, 6 + gy * 5.4), a.t, (gx - 1.5) * 7);
            const col = LED_CYCLE[(gx + gy) % 3];
            addBox(out, vadd(cc, a.r, -side * 13.2), [0.6, 4.2, 5.4], col, [a.r, a.u, a.t]);
          }
        }
        // gridshell arch straddling the track: lattice ribs from L crown to R crown
        const aL = anchor(k, -1, 14), aR = anchor(k, 1, 14);
        for (let j = 0; j <= 12; j++) {
          const t = j / 12;
          const bx = aL.c[0] + (aR.c[0] - aL.c[0]) * t;
          const bz = aL.c[2] + (aR.c[2] - aL.c[2]) * t;
          const lift = Math.sin(t * Math.PI) * 18 + 26;   // arch over road, well above cars
          const c = [bx, aL.c[1] + lift, bz];
          const col = LED_CYCLE[j % 3];
          addBox(out, c, [6, 2.0, 6], col, [aL.r, aL.u, aL.t]);
        }
      }

      // ===================================================================
      // s 0.95 both — final left-right: barriers funnel back, lit billboards
      // ===================================================================
      billboard(K(0.95), 1, 9, 16, 10, LED_MAG);
      billboard(K(0.95), -1, 9, 16, 10, LED_TEAL);
      grandstand(0.96, -1, 6, 80, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // extra grandstands ringing T1/T5/T9/T11 (makes the seating bowl complete)
      grandstand(0.08, -1, 8, 70, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.10, -1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.22, -1, 8, 80, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.36, 1, 8, 60, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.48, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.56, 1, 8, 70, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);
      grandstand(0.83, -1, 8, 60, [0.20, 0.21, 0.28], [0.30, 0.34, 0.46]);
      grandstand(0.92, -1, 8, 80, [0.22, 0.23, 0.30], [0.30, 0.34, 0.46]);

      // second Yas Marina hotel group across the infield at s 0.44 R (the Radisson)
      building(K(0.44), 1, 36, 38, 44, 26, { wall: [0.14, 0.16, 0.22], window: WIN, floor: 6 });
      building(K(0.45), 1, 37, 26, 30, 18, { wall: [0.12, 0.14, 0.20], window: WIN_WARM, floor: 5 });
      place(K(0.44), 1, 30, [42, 3, 7], WARM);

      // more light towers along S1 back straight + marina sector
      for (let i = 0; i < 8; i++)
        tower(K(0.42 + i * 0.007), (i%2)?1:-1, 18, 4, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
      for (let i = 0; i < 6; i++)
        tower(K(0.56 + i * 0.008), 1, 16, 4, 30, { col: DARK, seg: 4, cap: true, capCol: FLOOD });

      // denser yacht marina: 16 extra boats behind the existing 28
      for (let i = 0; i < 16; i++) {
        const k = K(0.58 + (i % 8) * 0.018);
        const a = anchor(k, 1, 32 + (i % 3) * 12);
        const off = ((i % 5) - 2) * 8;
        const hc = vadd(a.c, a.t, off);
        addBox(out, vadd(hc, a.u, 1.0), [3.5, 2.0, 9], [0.90, 0.91, 0.93], [a.r, a.u, a.t]);
        addCyl(out, vadd(hc, a.u, 7), 0.15, 10, [0.84, 0.85, 0.88], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(hc, a.u, 0.3), [4.0, 0.3, 9.5], LED_AMBER, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // Palms scattered along the marina half + pit straight approaches
      // ===================================================================
      for (let i = 0; i < 48; i++) {
        const s = 0.48 + (i / 48) * 0.44;
        palm(K(s), (i % 2) ? 1 : -1, 7 + hash(i * 5) * 7, 8 + hash(i * 3) * 5);
      }
      for (let i = 0; i < 14; i++) palm(K(0.0 + i * 0.008), 1, 6 + hash(i * 9) * 4, 8);
      // palm avenue lining the Marsa curve + final sector
      for (let i = 0; i < 18; i++) palm(K(0.78 + i * 0.008), -1, 8 + hash(i * 11) * 4, 9);
      // inner-infield palms at pit-entry chicane
      for (let i = 0; i < 10; i++) palm(K(0.92 + i * 0.007), 1, 9 + hash(i * 7) * 5, 7);
    },
  }
  );
})();
