/* Apex 26 — INTERLAGOS circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "interlagos",
    name: "INTERLAGOS",
    gp: "São Paulo GP",
    country: "Brazil",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    pal: { zenith: [0.26, 0.4, 0.6], horizon: [0.55, 0.58, 0.6], grass: [0.18, 0.46, 0.18], fog: [0.55, 0.58, 0.6], fogDensity: 0.0019, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.95, 0.82], sunColor: [1, 0.93, 0.8] },
    segs: [
      { t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 }, { t: -60, l: 110 }, { t: -50, l: 100, h: 6 },
      { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: -70, l: 100 },
      { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 },
    ],
    // Climb from the Senna S up to the start/finish (the lap's ~40 m of relief).
    elevations: [{ s: 0.86, halfM: 480, rise: 10 }],
    scenery: function (api) {
      const { out, n, px, pz, pyMin, place, backdrop, groundPlane,
              addBox, every, onTrack, hash, vadd, anchor, building, tower,
              grandstand, billboard, tyreWall, pine, tree, hedge } = api;
      const K = (s) => Math.round(s * n) % n;

      // --- Pit / control tower + pit building on the start straight (s=0.00, R close) ---
      const kpit = K(0.0);
      tower(kpit, 1, 14, 15, 40, { col: [0.52, 0.50, 0.48], seg: 4, cap: true,
                                   capCol: [0.22, 0.24, 0.28], mast: 12 });   // tall slab control tower
      building(kpit, 1, 7, 12, 14, 30, { wall: [0.60, 0.60, 0.62],
               window: [0.20, 0.28, 0.34], floor: 4 });                       // pit building w/ window bands
      grandstand(0.94, 1, 9, 70, [0.46, 0.47, 0.52], [0.30, 0.52, 0.34]);     // pit-straight stand (Brazil green crowd)

      // --- Main grandstand (s=0.02, L mid) ---
      grandstand(0.02, -1, 10, 90, [0.42, 0.43, 0.48], [0.28, 0.50, 0.32]);

      // --- Senna S (s=0.05, both close): red/white kerb boxes inside each apex ---
      for (const [s, side] of [[0.045, -1], [0.065, 1], [0.085, -1]]) {
        const k = K(s);
        place(k, side, 2, [0.5, 0.18, 7], [0.80, 0.18, 0.18]);   // red kerb
        place(k, side, 4.2, [3.0, 0.18, 7], [0.92, 0.92, 0.92]);   // white kerb
      }
      // hero downhill plunge: tropical greenery hugging the Senna S esses
      for (const [s, side] of [[0.05, 1], [0.07, -1], [0.09, 1]]) {
        const k = K(s);
        pine(k, side, 16 + hash(k) * 10, 12 + hash(k * 3) * 6, [0.18, 0.40, 0.18]);
        tree(k, side, 26 + hash(k * 5) * 14, 9 + hash(k * 7) * 5, [0.22, 0.46, 0.22]);
      }

      // --- Colourful favela hillside (s=0.15, L far): saturated cubes climbing a green slope ---
      // CONTINUOUS dense favela band: stacked saturated houses wrap most of the L side,
      // climbing the green slope; densest at the s=0.15 hillside, never gapping out.
      const favCol = [[0.85, 0.35, 0.30], [0.95, 0.78, 0.25], [0.30, 0.55, 0.80],
                      [0.90, 0.90, 0.85], [0.60, 0.72, 0.52], [0.86, 0.46, 0.34],
                      [0.92, 0.62, 0.30], [0.40, 0.62, 0.62], [0.80, 0.30, 0.40]];
      every(18, (k) => {
        const side = -1;
        // bias the densest stacks toward the s=0.15 hillside; thinner band elsewhere
        const near = Math.min((k - K(0.15) + n) % n, (K(0.15) - k + n) % n) < n * 0.14;
        if (!near && hash(k * 61) > 0.55) return;     // continuous coverage, rarely skip
        const stack = (near ? 4 : 2) + Math.floor(hash(k * 62) * 2);
        for (let j = 0; j < stack; j++) {
          const d = 120 + j * 12 + hash(k * 63 + j) * 80;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 9)) continue;
          const h = 5 + hash(k * 64 + j) * 5;
          const w = 8 + hash(k * 66 + j) * 4;
          // stack each house a little higher up the slope (grounded base + slope lift)
          addBox(out, vadd(p.c, p.u, j * 7 + h / 2), [w, h, w],
                 favCol[Math.floor(hash(k * 65 + j) * 9) % 9], [p.r, p.u, p.t]);
        }
        if (hash(k * 8) > 0.55) tree(k, side, 110 + hash(k * 9) * 40, 8 + hash(k * 11) * 5, [0.20, 0.44, 0.20]);
      });

      // --- Reta Oposta straight (s=0.25, R mid): open green banks + advert boards ---
      for (const s of [0.22, 0.25, 0.28]) billboard(K(s), 1, 8, 11, 4, [0.90, 0.90, 0.88]);
      hedge(0.20, 0.30, 1, 14, 2.2, [0.20, 0.44, 0.20]);

      // --- Lago / Guarapiranga water (s=0.35, L far): muddy blue-green plane beyond trees ---
      groundPlane(K(0.35), -1, 70, [320, 2, 240], [0.22, 0.42, 0.50]);
      groundPlane(K(0.40), -1, 60, [220, 2, 180], [0.20, 0.40, 0.48]);
      for (const s of [0.33, 0.36, 0.39]) {
        const k = K(s);
        tree(k, -1, 40 + hash(k) * 16, 9 + hash(k * 3) * 5, [0.22, 0.46, 0.22]);  // treeline screening the lake
      }

      // --- Descida do Lago (s=0.45, both mid): grass run-off + tan gravel trap ---
      groundPlane(K(0.45), 1, 6, [40, 1.2, 30], [0.62, 0.56, 0.40]);   // gravel trap (tan)
      hedge(0.42, 0.50, -1, 12, 2.0, [0.20, 0.44, 0.20]);

      // --- São Paulo high-rise skyline (s=0.60, R far): row of haze-grey slabs on horizon ---
      // CONTINUOUS window-banded tower band on the R side — densest at s=0.60, but
      // packed all around so the city reads as a sprawl wrapping the park, no gaps.
      every(34, (k) => {
        const near = Math.min((k - K(0.60) + n) % n, (K(0.60) - k + n) % n) < n * 0.18;
        if (!near && hash(k * 71) > 0.45) return;     // continuous coverage
        const side = 1;
        const cluster = near ? 2 : 1;
        for (let c = 0; c < cluster; c++) {
          const d = 150 + c * 28 + hash(k * 72 + c) * 90;
          const h = 50 + hash(k * 73 + c) * 80;
          const w = 14 + hash(k * 74 + c) * 12;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 10)) continue;
          const tone = 0.50 + hash(k * 75 + c) * 0.14;
          building(k, side, d - w / 2, w, h, w, { wall: [tone, tone * 0.98, tone * 1.02],
                   window: [tone * 0.55, tone * 0.60, tone * 0.66], floor: 8 });
        }
      });
      // CONTINUOUS far-haze skyline ring computed from the lap centre, so a dense
      // unbroken band of high-rise slabs encircles the whole park on the horizon.
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, count, hMin, hVar, wMin] of [
        [120, 96, 34, 70, 26],    // inner dense high-rise band
        [260, 72, 24, 44, 40],    // far hazed backdrop band
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.2832, h = hash(i * 7 + extra);
          const x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
          if (onTrack(x, z, 10)) continue;
          const u = [0, 1, 0], r = [Math.cos(a + 1.5708), 0, Math.sin(a + 1.5708)];
          const f = [Math.cos(a), 0, Math.sin(a)];
          const ht = hMin + h * hVar, w = wMin + hash(i * 11 + extra) * 22;
          const tone = 0.53 + hash(i * 13 + extra) * 0.10;
          addBox(out, [x, pyMin + ht / 2, z], [w, ht, w * 0.8],
                 [tone, tone * 1.01, tone * 1.04], [r, u, f]);
        }
      }

      // --- Ferradura / infield esses (s=0.70, L mid): green banks + tyre walls ---
      tyreWall(0.67, 0.73, -1, 4, [0.90, 0.78, 0.25]);   // yellow-capped tyre wall
      for (const s of [0.66, 0.70, 0.74]) {
        const k = K(s);
        pine(k, -1, 18 + hash(k) * 12, 11 + hash(k * 3) * 5, [0.18, 0.40, 0.18]);
      }

      // --- Junção (s=0.82, L close): tight uphill left, kerbs, start of the climb ---
      const kj = K(0.82);
      place(kj, -1, 2, [0.5, 0.18, 8], [0.80, 0.18, 0.18]);
      place(kj, -1, 4.2, [3.0, 0.18, 8], [0.92, 0.92, 0.92]);

      // --- Climb to s/f, Subida dos Boxes (s=0.92, both mid): banked ramp + pit-wall slabs (R) ---
      for (const s of [0.88, 0.92, 0.96]) {
        const k = K(s);
        place(k, 1, 2.5, [1.0, 1.1, 9], [0.78, 0.78, 0.80]);   // pit-wall slab on the right
      }
      grandstand(0.90, -1, 9, 60, [0.44, 0.45, 0.50], [0.28, 0.50, 0.32]);
      grandstand(0.84, 1, 10, 50, [0.43, 0.44, 0.49], [0.30, 0.52, 0.34]);    // Junção stand
      grandstand(0.27, -1, 11, 64, [0.45, 0.46, 0.51], [0.28, 0.50, 0.32]);   // Reta Oposta stand
      grandstand(0.71, 1, 11, 56, [0.42, 0.43, 0.48], [0.30, 0.52, 0.34]);    // Ferradura stand

      // --- Pervasive vivid tropical-green vegetation around the lap (denser belt) ---
      every(19, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side) > 0.46) continue;
          const d = 28 + hash(k * 92 + side) * 70;
          const p = anchor(k, side, d);
          if (onTrack(p.c[0], p.c[2], 8)) continue;
          if (hash(k * 93 + side) > 0.5) tree(k, side, d, 8 + hash(k * 94 + side) * 6, [0.22, 0.46, 0.22]);
          else pine(k, side, d, 10 + hash(k * 95 + side) * 6, [0.18, 0.40, 0.18]);
        }
      });
    },
  }
  );
})();
