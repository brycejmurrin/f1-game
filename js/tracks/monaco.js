/* Apex 26 — MONACO circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monaco",
    name: "MONACO",
    gp: "Monaco GP",
    country: "Monaco",
    night: false,
    theme: "street_day",
    lengthKm: 3.3,
    baseHW: 5,
    street: true,
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    segs: [
      { t: 0, l: 230 }, { t: 70, l: 75 }, { t: -25, l: 260, h: 14 }, { t: -70, l: 110 }, { t: 80, l: 80, w: 4.8 }, { t: 0, l: 90, h: -6 },
      { t: 80, l: 80, w: 4.8 }, { t: 160, l: 120, w: 4.5, h: -4 }, { t: 55, l: 80 }, { t: 45, l: 80 }, { t: -15, l: 260, h: -4 }, { t: 60, l: 70, w: 4.8 },
      { t: 0, l: 40 }, { t: -65, l: 60 }, { t: 65, l: 60 }, { t: -40, l: 100 }, { t: 70, l: 65, w: 4.8 }, { t: 0, l: 35 },
      { t: -70, l: 65 }, { t: 80, l: 70 }, { t: -70, l: 65 }, { t: 75, l: 70, w: 4.8 }, { t: 40, l: 120 },
    ],
    // Climb to Casino Square, then the plunge down through Mirabeau and the
    // tunnel toward the harbour (~42 m top-to-bottom). Street circuit: barriers,
    // not a wide terrain ribbon, so elevation was always safe here.
    elevations: [{ s: 0.27, halfM: 340, rise: 18 }, { s: 0.55, halfM: 220, rise: -10 }],
    scenery: function (api) {
      const { out, track, def, theme, pal, n, ds, px, py, pz, hw, pyMin, place, prop, backdrop, groundPlane, groundYAt, addBox, every, onTrack, ferrisWheel, hash, upOf, cross, norm, lerp } = api;
      for (let i = 0; i < 8; i++) {
        const k = Math.round((i / 8) * n) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const hillx = px[k] + r[0] * (hw[k] + 100);
        const hillz = pz[k] + r[2] * (hw[k] + 100);
        if (onTrack(hillx, hillz, 20)) continue; // skip if box would land on a parallel section
        const bldg_h = 25 + hash(k * 29) * 35;
        addBox(out, [hillx, py[k] + bldg_h / 2, hillz], [28, bldg_h, 22],
               [0.72 + hash(k) * 0.2, 0.68 + hash(k) * 0.2, 0.6 + hash(k) * 0.15]);
      }

      // Casino Square building (ornate 1865 structure visible from Casino corner, ~Turn 9-10).
      // Offset must clear the box's own half-width (24m) plus the road so the
      // 48m-wide structure never sits on the tarmac. Anchored well back.
      const kcs = Math.round(n * 0.32) % n;
      const kcsr = [track.rx[kcs], track.ry[kcs], track.rz[kcs]];
      const csX = px[kcs] + kcsr[0] * (hw[kcs] + 50);
      const csZ = pz[kcs] + kcsr[2] * (hw[kcs] + 50);
      if (!onTrack(csX, csZ, 26)) {
        addBox(out, [csX, py[kcs] + 22, csZ], [48, 44, 36], [0.82, 0.78, 0.68]); // Casino main structure
        for (let i = 0; i < 4; i++) {
          addBox(out, [csX + kcsr[0] * (-20 + i * 15), py[kcs] + 32, csZ + kcsr[2] * (-20 + i * 15)],
                 [8, 20, 8], [0.92, 0.9, 0.85]); // ornate columns
        }
      }

      for (let i = 0; i < 13; i++) {
        const k = (i * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const o = hw[k] + 40;
        // Removed water boxes that were creating a horizontal blocking plane
        if (i % 2 === 0) {
          const yo = hw[k] + 18;
          addBox(out, [px[k] + r[0] * yo, py[k] + 1.2, pz[k] + r[2] * yo], [4, 3, 11], [0.95, 0.95, 0.97]); // yacht hull
          addBox(out, [px[k] + r[0] * yo, py[k] + 4, pz[k] + r[2] * yo], [2.2, 2, 5], [0.85, 0.86, 0.9]);   // cabin
        }
      }
      // A pair of moored super-yachts further out in the harbour
      for (const yi of [2, 7]) {
        const k = (yi * 3) % n;
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const yo = hw[k] + 34;
        const yx = px[k] + r[0] * yo, yz = pz[k] + r[2] * yo;
        if (onTrack(yx, yz, 14)) continue;
        addBox(out, [yx, py[k] + 2.5, yz], [8, 6, 26], [0.97, 0.97, 0.99]); // hull
        addBox(out, [yx, py[k] + 7, yz], [5, 4, 13], [0.80, 0.83, 0.90]);   // superstructure
        addBox(out, [yx, py[k] + 10.5, yz], [3, 2, 6], [0.60, 0.66, 0.78]); // top deck
      }
      // Promenade date-palms along the harbour railing (open side only)
      every(34, (k) => {
        if (k > n * 0.5) return;
        prop(k, 1, 4, [0.6, 5, 0.6], [0.34, 0.26, 0.14]);
        prop(k, 1, 4, [3.6, 1.4, 3.6], [0.18, 0.36, 0.14]);
      });
      // Tunnel: concrete ceiling from Portier (~52%) to post-tunnel chicane (~58%).
      // The section runs underground parallel to the harbour — a unique Monaco feature.
      {
        const tunS = Math.round(0.51 * n) % n;
        const tunE = Math.round(0.585 * n) % n;
        const tunLen = ((tunE - tunS) + n) % n;
        const tunStep = Math.max(2, Math.round(5.0 / ds));
        for (let i = 0; i < tunLen; i += tunStep) {
          const k = (tunS + i) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          const cw = hw[k] * 2 + 4.5;
          addBox(out, [px[k], py[k] + 6.3, pz[k]], [cw, 1.1, ds * tunStep * 1.05],
                 [0.30, 0.29, 0.34], [r, u, t]);
        }
        // Tunnel portals at entry and exit
        for (const frac of [0.51, 0.585]) {
          const k = Math.round(frac * n) % n;
          const r = [track.rx[k], track.ry[k], track.rz[k]];
          const t = [track.tx[k], track.ty[k], track.tz[k]];
          const u = upOf(track, k);
          addBox(out, [px[k], py[k] + 3.6, pz[k]], [hw[k] * 2 + 6, 7.2, 1.8],
                 [0.34, 0.33, 0.38], [r, u, t]);
        }
      }
    },
  }
  );
})();
