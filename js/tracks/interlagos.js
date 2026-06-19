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
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      // Distant city towers (São Paulo skyline)
      const ksp = Math.round(n * 0.35) % n;
      const kspr = [track.rx[ksp], track.ry[ksp], track.rz[ksp]];
      for (let i = 0; i < 9; i++) {
        const h = 45 + hash(ksp * (i + 1)) * 50;
        const d = 240 + i * 40;
        const tx = px[ksp] + kspr[0] * d, tz = pz[ksp] + kspr[2] * d;
        if (onTrack(tx, tz, 16)) continue;
        addBox(out, [tx, groundYAt(ksp, d) + h / 2, tz], [22, h, 22], [0.52 + hash(i) * 0.12, 0.48 + hash(i) * 0.12, 0.46 + hash(i) * 0.1]);
      }
      // Dense tropical vegetation on hillsides
      every(12, (k) => {
        for (const side of [-1, 1]) {
          for (let j = 0; j < 2; j++) {
            if (hash(k * 43 + side + j) > 0.35) continue;
            const d = 160 + hash(k * 44 + j) * 80;
            const s = hash(k * 46 + j);
            const h = 7 + s * 8;
            place(k, side, d, [1.8, 1.4, 1.8], [0.26, 0.20, 0.10]);
            place(k, side, d, [4.4, h, 4.4], [0.18, 0.42, 0.16]);
          }
        }
      });
      // Lake features and water terrain
      every(180, (k) => {
        const lake_d = 90 + hash(k * 48) * 100;
        for (const side of [-1, 1]) {
          const lx = px[k] + track.rx[k] * side * lake_d, lz = pz[k] + track.rz[k] * side * lake_d;
          if (onTrack(lx, lz, 55)) continue;
          addBox(out, [lx, pyMin - 3, lz], [100, 1.2, 140], [0.08, 0.22, 0.38]);
        }
      });
      // Pit complex and infrastructure
      every(250, (k) => {
        const side = hash(k * 50) < 0.5 ? -1 : 1;
        place(k, side, hw[k] + 35, [14, 12, 10], [0.48, 0.46, 0.44]);
      });

      // Lake: body of water visible from inside track (pit area perspective)
      const klake = Math.round(n * 0.18) % n;
      const klaker = [track.rx[klake], track.ry[klake], track.rz[klake]];
      const wlx = px[klake] + klaker[0] * 110, wlz = pz[klake] + klaker[2] * 110;
      if (!onTrack(wlx, wlz, 145)) addBox(out, [wlx, pyMin - 3, wlz], [280, 1.2, 200], [0.08, 0.25, 0.45]);
      // São Paulo tower-block backdrop visible across the lake
      for (let i = 0; i < 9; i++) {
        const k = (Math.round(n * 0.22) + i * 8) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const s = hash(k * 11 + i), side = (i % 2 === 0) ? 1 : -1;
        const h = 48 + s * 46, dist = 68 + s * 28, o = hw[k] + dist;
        const tone = 0.50 + s * 0.22;
        const bx = px[k] + r[0] * o * side, bz = pz[k] + r[2] * o * side;
        if (onTrack(bx, bz, 12)) continue;
        addBox(out, [bx, groundYAt(k, dist) + h * 0.5, bz], [11, h, 11], [tone, tone * 0.93, tone * 0.86]);
      }
      // Pit complex: modernized brutalist control tower, oriented alongside the
      // start straight (prop() clears its depth so it never sits on the tarmac).
      const kpit = Math.round(n * 0.02) % n;
      prop(kpit, 1, 12, [14, 36, 44], [0.5, 0.48, 0.46]);   // control tower (14m deep)
      prop(kpit, 1, 12, [16, 6, 40], [0.42, 0.42, 0.44]);   // overhanging roof band
      // Colourful hillside houses (the São Paulo favela backdrop) — small boxes
      // set well back and onTrack-guarded so they never become a wall or ceiling.
      const favCol = [[0.82, 0.46, 0.34], [0.86, 0.74, 0.40], [0.46, 0.58, 0.66],
                      [0.78, 0.78, 0.72], [0.60, 0.70, 0.52]];
      every(14, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 61 + side) > 0.5) continue;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const stack = 1 + Math.floor(hash(k * 62 + side) * 3);
          for (let j = 0; j < stack; j++) {
            const d = 95 + j * 12 + hash(k * 63 + side + j) * 40;
            const o = side * (hw[k] + d);
            const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
            if (onTrack(cx, cz, 10)) continue;
            const h = 5 + hash(k * 64 + side + j) * 4;
            addBox(out, [cx, groundYAt(k, d) + 6 + j * 7 + h / 2, cz], [7, h, 7],
                   favCol[Math.floor(hash(k * 65 + side + j) * 5) % 5]);
          }
        }
      });
      // Grandstands at the Senna S and the start straight
      for (const frac of [0.06, 0.30, 0.55]) {
        const k = Math.round(frac * n) % n;
        const side = hash(k * 5) < 0.5 ? -1 : 1;
        prop(k, side, 9, [8, 9, 28], [0.42, 0.42, 0.48]);
        prop(k, side, 7, [8, 5, 26], [0.30, 0.46, 0.34]);   // green/yellow Brazilian crowd
      }
    },
  }
  );
})();
