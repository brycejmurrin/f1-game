/* Apex 26 — ZANDVOORT circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge (the engine banks the highest-curvature corners).
    banked: true,
    pal: { zenith: [0.28, 0.41, 0.60], horizon: [0.82, 0.78, 0.70], grass: [0.42, 0.50, 0.25], runoff: [0.60, 0.52, 0.34], fog: [0.74, 0.73, 0.70], fogDensity: 0.0024, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.94, 0.80], sunColor: [1, 0.9, 0.74] },
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],
    scenery: function (api) {
      const { out, n, px, py, pz, pyMin, hw, prop, backdrop, groundPlane,
              addBox, addCyl, addPrism, addCone, anchor, vadd, onTrack, hash, every,
              mountain, peak, bush, hedge, grandstand, tower,
              fence, guardrail, tyreWall, billboard, gantry, marshalPost } = api;
      const K = (s) => Math.round(s * n) % n;

      // --- North Sea horizon: coastal water and sandy beach band immediately
      // adjacent to the circuit (9 km North Sea beach just beyond dunes).
      // Emphasize the maritime haze (74-81% humidity) with slightly elevated fog.
      let cx0 = 0, cz0 = 0;
      for (let i = 0; i < n; i++) { cx0 += px[i]; cz0 += pz[i]; }
      cx0 /= n; cz0 /= n;
      let lapRad = 0;
      for (let i = 0; i < n; i++) lapRad = Math.max(lapRad, Math.hypot(px[i] - cx0, pz[i] - cz0));
      // Seaward = the −X arc. Lay expanding bands of sea (far), beach sand (mid),
      // and dune fringe (near) so the North Sea reads as a continuous coastal strip.
      const seaCol = [0.18, 0.40, 0.56], beachCol = [0.89, 0.83, 0.66], duneCol = [0.82, 0.76, 0.58];
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 0.55 + (i / 15) * Math.PI * 0.9;  // seaward sweep
        // Far sea (northernmost)
        const bx = cx0 + Math.cos(a) * (lapRad + 680);
        const bz = cz0 + Math.sin(a) * (lapRad + 680);
        if (!onTrack(bx, bz, 35)) {
          addBox(out, [bx, pyMin - 2.0, bz], [140, 5, 140], seaCol);
        }
        // Mid beach sand band
        const px2 = cx0 + Math.cos(a) * (lapRad + 520);
        const pz2 = cz0 + Math.sin(a) * (lapRad + 520);
        if (!onTrack(px2, pz2, 30)) {
          addBox(out, [px2, pyMin - 1.2, pz2], [130, 4, 90], beachCol);
        }
        // Near dune sand fringe
        const px3 = cx0 + Math.cos(a) * (lapRad + 380);
        const pz3 = cz0 + Math.sin(a) * (lapRad + 380);
        if (!onTrack(px3, pz3, 25)) {
          addBox(out, [px3, pyMin - 0.8, pz3], [120, 3, 80], duneCol);
        }
      }

      // --- Prominent rolling sand dunes hemming the track (the Zandvoort dune belt).
      // The circuit weaves THROUGH the dunes—they're the defining visual feature.
      // Larger mountains now (8-16m) to convey coastal dune landscape scale.
      // Tan body, marram-green caps via opts.forest skirt + bush/hedge below.
      // A CONTINUOUS, overlapping belt wraps the WHOLE lap on BOTH sides — no
      // gap-skipping — so the sand reads as an unbroken dune ridge. Seg 8 for detail. ---
      const sand = [0.81, 0.75, 0.58], sandDk = [0.71, 0.65, 0.48];
      const sandLt = [0.87, 0.81, 0.64];
      const marramG = [0.33, 0.49, 0.24], marramT = [0.67, 0.63, 0.41];
      // Inner dune wall: overlapping organic mounds hugging the verge on BOTH
      // sides the WHOLE lap (no gap-skip) — slightly higher for dune prominence.
      every(32, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 45 + hash(k * 72 + side) * 26);
          const h = 8 + hash(k * 73 + side) * 12;        // TALLER dune mounds (8–20m)
          // forest=tan marram so the verge-side dune base reads SANDY, not a flat
          // green wall when the camera is close on this tight winding circuit.
          mountain(a.c[0], a.c[2], a.c[1], 32 + hash(k * 74 + side) * 20, h, {
            seg: 8, seed: k * 13 + side, rough: 0.5, snowline: 2,  // >1 = no snow
            forest: marramT, rock: sandDk, snow: sand,
          });
        }
      });
      // Coastal Dutch pines on the dune slopes — dark conifers
      every(30, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 91 + side * 17) > 0.40) continue;   // ~40% density
          const dist = 55 + hash(k * 92 + side) * 35;       // 55–90 m
          const a = anchor(k, side, dist);
          if (onTrack(a.c[0], a.c[2], 8)) continue;
          const th = 5 + hash(k * 93 + side) * 5;           // height 5–10 m
          addCyl(out, vadd(a.c, a.u, th * 0.5), 0.35, th, [0.25, 0.32, 0.20], 5, [a.r, a.u, a.t]);  // trunk
          addCone(out, vadd(a.c, a.u, th * 0.5 + th * 0.55), th * 0.55 + hash(k * 94 + side) * 2, th * 0.6, [0.18, 0.38, 0.14], 6, [a.r, a.u, a.t]);  // pine canopy
        }
      });
      // Mid dune ridge: a second overlapping band of sandy peaks set back,
      // filling between the inner mounds so the belt never breaks from the
      // cockpit. Taller peaks now (12–22m) to emphasize dune terrain.
      every(22, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 52 + hash(k * 81 + side) * 32);
          if (onTrack(a.c[0], a.c[2], 14)) continue;
          peak(a.c[0], a.c[2], a.c[1], 36 + hash(k * 83 + side) * 26,
               12 + hash(k * 82 + side) * 14,
               hash(k * 84 + side) < 0.5 ? sand : sandLt);
        }
      });
      // Far dune ridges as a continuous sandy backdrop on the horizon.
      // More numerous and taller for a continuous dune barrier effect.
      every(48, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 160 + hash(k * 42 + side) * 100);
          if (onTrack(a.c[0], a.c[2], 16)) continue;
          peak(a.c[0], a.c[2], pyMin, 70 + hash(k * 43 + side) * 60,
               18 + hash(k * 44 + side) * 16, sand);
        }
      });
      // Marram grass tufts hugging the verge (low organic green/tan greenery).
      // Denser coverage now to emphasize the coastal dune grass ecosystem.
      every(11, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.55) continue;  // Increased density (was 0.62)
          bush(k, side, 9 + hash(k * 52 + side) * 14,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });
      // Extended continuous marram hedge bands around the lap.
      hedge(0.15, 0.42, 1, 28, 1.5, marramT);   // dune-ridge marram band (extended)
      hedge(0.30, 0.58, -1, 11, 1.5, marramG);  // longer L-side stretch
      hedge(0.56, 0.80, 1, 10, 1.5, marramG);   // extended R-side
      hedge(0.60, 0.90, -1, 12, 1.5, marramT);  // extended L-side

      // --- Orange-clad Dutch grandstands at the banked corners and pit straight.
      // crowd colour = "Orange Army" Verstappen fans (300,000+ at Dutch GP).
      // Expanded to convey the scale of spectator enthusiasm.
      const shell = [0.36, 0.38, 0.42], shellLt = [0.40, 0.41, 0.46];
      const orange = [0.95, 0.44, 0.04];  // Slightly deeper Verstappen orange
      grandstand(0.01, 1, 12, 32, shellLt, orange); // main stand R (pit straight) - larger
      grandstand(0.04, 1, 10, 32, shell, orange);   // Tarzan hairpin R
      grandstand(0.07, -1, 11, 30, shell, orange);  // Tarzan exit L
      grandstand(0.10, -1, 10, 28, shell, orange);  // Hugenholtz approach L early
      grandstand(0.12, -1, 9, 32, shell, orange);   // Hugenholtz approach L
      grandstand(0.14, -1, 10, 36, shell, orange);  // Hugenholtz T3 banked L - larger
      grandstand(0.17, 1, 11, 30, shellLt, orange); // Hugenholtz exit R
      grandstand(0.48, -1, 24, 32, shell, orange);  // Scheivlak approach L (set back) - larger
      grandstand(0.52, 1, 14, 26, shell, orange);   // Scheivlak R spectator area (new)
      grandstand(0.86, 1, 24, 32, shell, orange);   // Luyendyk approach R - larger
      grandstand(0.90, 1, 11, 30, shell, orange);   // Arie Luyendyk banked approach R (new)
      grandstand(0.92, 1, 10, 72, shell, orange);   // Arie Luyendyk final banked R - massive
      grandstand(0.95, 1, 11, 32, shellLt, orange); // Luyendyk exit R - larger
      grandstand(0.96, -1, 12, 32, shellLt, orange); // pit-straight L - larger
      grandstand(0.98, -1, 11, 30, shell, orange);  // pit-straight L exit

      // --- Pit building: long low white-grey box with repeated garage bays. ---
      (() => {
        const a = anchor(K(0.00), -1, 12), b = [a.r, a.u, a.t];
        addBox(out, vadd(a.c, a.u, 3), [7, 6, 64], [0.86, 0.87, 0.90], b);
        for (let i = -3; i <= 3; i++)
          addBox(out, vadd(vadd(a.c, a.u, 3), a.t, i * 8), [7.4, 4, 1.2], [0.30, 0.32, 0.36], b);
      })();

      // --- Wind turbines on the seaward dune horizon (tower + 3-blade cap).
      // Guarded with onTrack so a perpendicular projection never lands on this
      // compact winding circuit's parallel stretch. ---
      for (const s of [0.20, 0.34, 0.50, 0.62, 0.78]) {
        const k = K(s), a = anchor(k, 1, 300), b = [a.r, a.u, a.t];
        if (onTrack(a.c[0], a.c[2], 60)) continue;
        tower(k, 1, 300, 7, 80, { col: [0.92, 0.92, 0.94], seg: 8 }); // white pole
        const hub = vadd(a.c, a.u, 80);
        addCyl(out, hub, 1.2, 2.4, [0.9, 0.9, 0.92], 6, b);          // nacelle
        for (let j = 0; j < 3; j++) {                                 // three blades
          const ang = j * 2.0944, dir = vadd(vadd([0,0,0], a.u, Math.cos(ang) * 30), a.r, Math.sin(ang) * 30);
          addBox(out, vadd(hub, dir, 0.5), [2, 30, 1.5], [0.94, 0.94, 0.96], b);
        }
      }

      // --- Beach huts: tiny low pastel box row at the dune base near the shore
      // (s≈0.50 R, seaward). ---
      every(60, (k) => {
        const side = hash(k * 8) < 0.5 ? -1 : 1;
        const a = anchor(k, side, hw[k] + 110 + hash(k * 7) * 30);
        if (onTrack(a.c[0], a.c[2], 12)) return;
        const cols = [[0.85, 0.25, 0.20], [0.20, 0.45, 0.70], [0.90, 0.85, 0.30], [0.20, 0.60, 0.40]];
        const b = [a.r, a.u, a.t];
        // a short row of huts along the dune base
        for (let i = -1; i <= 1; i++) {
          const hutCol = cols[Math.floor(hash(k * 9 + i * 3) * 4) % 4];
          addBox(out, vadd(vadd(a.c, a.u, 2), a.t, i * 7), [5, 4, 5], hutCol, b);
        }
      });

      // ===================================================================
      // TRACKSIDE FURNITURE — fences, guardrails, tyre walls, billboards,
      // marshal posts, start gantry. These all auto-guard with onTrack.
      // ===================================================================

      // --- Catch / debris fencing: in front of the grandstands and along the
      // fast dune runs so spectator areas are screened. Posts + pale mesh. ---
      const fenceCol = [0.74, 0.76, 0.80];
      fence(0.00, 0.10, 1, 6.0, 4.2, fenceCol);   // pit-straight + Tarzan R stands
      fence(0.04, 0.09, -1, 6.0, 4.2, fenceCol);  // Tarzan exit L
      fence(0.11, 0.19, -1, 5.5, 4.2, fenceCol);  // Hugenholtz L
      fence(0.15, 0.19, 1, 5.5, 4.0, fenceCol);   // Hugenholtz exit R
      fence(0.48, 0.54, -1, 6.5, 4.0, fenceCol);  // Scheivlak inner
      fence(0.86, 0.99, 1, 6.0, 4.4, fenceCol);   // Luyendyk + pit straight R
      fence(0.94, 1.00, -1, 6.0, 4.2, fenceCol);  // pit-straight L

      // --- Steel armco guardrail backing the verges on the fast undulating
      // dune stretches (no stands there — just rail then sand). ---
      const railRW = [0.86, 0.20, 0.18];
      guardrail(0.21, 0.33, 1, 4.0, railRW);
      guardrail(0.22, 0.31, -1, 4.0, [0.85, 0.86, 0.88]);
      guardrail(0.36, 0.47, 1, 4.0, [0.85, 0.86, 0.88]);
      guardrail(0.57, 0.66, -1, 4.0, railRW);
      guardrail(0.68, 0.80, 1, 4.0, [0.85, 0.86, 0.88]);
      guardrail(0.80, 0.86, -1, 4.0, railRW);

      // --- Stacked tyre walls on the OUTSIDE of the heavy corners (gravel-trap
      // backstops): Tarzan, Hugenholtz, Scheivlak, Arie Luyendyk. capCol bright. ---
      tyreWall(0.025, 0.06, 1, 4.6, [0.95, 0.55, 0.08]);  // Tarzan hairpin outside
      tyreWall(0.13, 0.17, -1, 4.6, [0.90, 0.90, 0.92]);  // Hugenholtz outside
      tyreWall(0.49, 0.53, -1, 5.0, [0.20, 0.45, 0.70]);  // Scheivlak outside
      tyreWall(0.90, 0.95, 1, 4.8, [0.95, 0.55, 0.08]);   // Arie Luyendyk outside

      // --- Billboards / advertising hoardings around the lap (need wide clearance
      // so the panel face never reaches the tarmac). Alternating bright panels. ---
      const adCols = [[0.90, 0.20, 0.10], [0.10, 0.45, 0.75], [0.95, 0.55, 0.08],
                      [0.92, 0.86, 0.20], [0.20, 0.55, 0.35]];
      let adI = 0;
      every(110, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 16);
          if (onTrack(a.c[0], a.c[2], 9)) continue;
          billboard(k, side, 14, 12, 4, adCols[(adI++) % adCols.length]);
        }
      });

      // --- Marshal posts at corner stations around the lap. ---
      for (const s of [0.05, 0.16, 0.29, 0.42, 0.55, 0.66, 0.79, 0.93]) {
        const side = hash(K(s) * 31) < 0.5 ? -1 : 1;
        marshalPost(K(s), side, 6.5);
      }

      // --- Start/finish gantry over the pit straight + a scoring gantry. ---
      gantry(0.005, 7.5, [0.12, 0.13, 0.16]);
      gantry(0.99, 6.5, [0.14, 0.14, 0.18]);

      // Sea glimpses — blue sliver cresting the dune ridge at multiple points
      // to emphasize proximity to the 9 km North Sea beach.
      {
        const seaGlimpse = [0.40, 0.57, 0.69];
        for (const s of [0.35, 0.42, 0.68, 0.78]) {
          const a = anchor(K(s), 1, 190);
          if (!onTrack(a.c[0], a.c[2], 22)) {
            addBox(out, vadd(a.c, a.u, 1.2), [60, 3, 60], seaGlimpse, [a.r, a.u, a.t]);
          }
        }
      }

      // --- Marram dune-grass scrub: dense low tufts of tan/green clumps right at
      // the verge to break up bare sand. Small cones, cheap, both sides. ---
      every(9, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 61 + side * 5) > 0.55) continue;
          const a = anchor(k, side, 7 + hash(k * 62 + side) * 7);
          if (onTrack(a.c[0], a.c[2], 2)) continue;
          const tuft = hash(k * 63 + side) < 0.5 ? marramG : marramT;
          const b = [a.r, a.u, a.t];
          // a small clump of 2-3 leaning grass prisms
          const cnt = 2 + (hash(k * 64 + side) < 0.4 ? 1 : 0);
          for (let i = 0; i < cnt; i++) {
            const off = (i - 1) * 1.4;
            addPrism(out, vadd(vadd(a.c, a.t, off), a.u, 0.7),
                     [0.8, 1.4 + hash(k * 65 + i + side) * 0.8, 0.8], tuft, b);
          }
        }
      });

      // --- Verstappen-orange flag bunting accents on the main grandstand fronts:
      // small bright caps to amplify the orange crowd feel from trackside. ---
      for (const [s, side] of [[0.02, 1], [0.92, 1], [0.96, -1], [0.14, -1]]) {
        const a = anchor(K(s), side, 9);
        if (onTrack(a.c[0], a.c[2], 5)) continue;
        const b = [a.r, a.u, a.t];
        for (let i = -4; i <= 4; i++)
          addBox(out, vadd(vadd(a.c, a.u, 6.5), a.t, i * 4.5),
                 [0.6, 1.2, 2.4], [0.95, 0.45, 0.05], b);
        for (let i = -4; i <= 4; i++)
          addBox(out, vadd(vadd(a.c, a.u, 8.7), a.t, i * 4.5),
                 [0.6, 1.2, 2.4], [0.95, 0.45, 0.05], b);
      }
    },
  }
  );
})();
