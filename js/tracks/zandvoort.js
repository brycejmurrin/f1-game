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
    pal: { zenith: [0.3, 0.44, 0.62], horizon: [0.80, 0.76, 0.66], grass: [0.45, 0.52, 0.28], runoff: [0.62, 0.54, 0.36], fog: [0.72, 0.72, 0.68], fogDensity: 0.0018, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.94, 0.80], sunColor: [1, 0.9, 0.74] },
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

      // --- North Sea horizon: a single far, low blue water plane behind the
      // dunes (s≈0.45 L). Settled below grade and pushed way out so it reads as
      // a hazed sliver, never a wall rising into the cockpit. ---
      // Computed from the track centre so the sea/beach band sits on ONE far
      // seaward arc instead of a giant plane that the compact infield rejects.
      let cx0 = 0, cz0 = 0;
      for (let i = 0; i < n; i++) { cx0 += px[i]; cz0 += pz[i]; }
      cx0 /= n; cz0 /= n;
      let lapRad = 0;
      for (let i = 0; i < n; i++) lapRad = Math.max(lapRad, Math.hypot(px[i] - cx0, pz[i] - cz0));
      // Seaward = the −X arc (where the s≈0.45 L edge faces). Lay a curved band of
      // flat blue water boxes + a pale beach strip just inside it on the horizon.
      const seaCol = [0.20, 0.42, 0.58], beachCol = [0.88, 0.82, 0.64];
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.55 + (i / 13) * Math.PI * 0.9;  // seaward sweep
        const bx = cx0 + Math.cos(a) * (lapRad + 560);
        const bz = cz0 + Math.sin(a) * (lapRad + 560);
        if (onTrack(bx, bz, 30)) continue;
        addBox(out, [bx, pyMin - 1.5, bz], [120, 4, 120], seaCol);          // sea
        const px2 = cx0 + Math.cos(a) * (lapRad + 430);
        const pz2 = cz0 + Math.sin(a) * (lapRad + 430);
        if (onTrack(px2, pz2, 30)) continue;
        addBox(out, [px2, pyMin - 1.0, pz2], [110, 3, 70], beachCol);        // beach
      }

      // --- Low rolling sand dunes hemming the track (the Zandvoort dune belt).
      // Organic mountain()/peak() kept LOW and sandy, snowline > 1 so NO snow.
      // Tan body, marram-green caps via opts.forest skirt + bush/hedge below.
      // A CONTINUOUS, overlapping belt wraps the WHOLE lap on BOTH sides — no
      // gap-skipping — so the sand reads as an unbroken dune ridge. Low seg (7)
      // keeps the dense belt affordable. ---
      const sand = [0.80, 0.74, 0.56], sandDk = [0.70, 0.64, 0.46];
      const sandLt = [0.86, 0.80, 0.62];
      const marramG = [0.34, 0.50, 0.26], marramT = [0.66, 0.62, 0.40];
      // Inner dune wall: overlapping organic mounds hugging the verge on BOTH
      // sides the WHOLE lap (no gap-skip) — low seg (7) to afford the belt.
      every(32, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 42 + hash(k * 72 + side) * 24);
          const h = 6 + hash(k * 73 + side) * 9;        // LOW dune mounds
          // forest=tan marram so the verge-side dune base reads SANDY, not a flat
          // green wall when the camera is close on this tight winding circuit.
          mountain(a.c[0], a.c[2], a.c[1], 30 + hash(k * 74 + side) * 18, h, {
            seg: 7, seed: k * 13 + side, rough: 0.5, snowline: 2,  // >1 = no snow
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
      // Mid dune ridge: a second overlapping band of cheap sandy peaks set back,
      // filling between the inner mounds so the belt never breaks from the
      // cockpit. peak() (clean pyramid) is far lighter than mountain().
      every(22, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 50 + hash(k * 81 + side) * 30);
          if (onTrack(a.c[0], a.c[2], 12)) continue;
          peak(a.c[0], a.c[2], a.c[1], 34 + hash(k * 83 + side) * 24,
               10 + hash(k * 82 + side) * 12,
               hash(k * 84 + side) < 0.5 ? sand : sandLt);
        }
      });
      // Far dune ridges as a continuous sandy backdrop on the horizon.
      every(48, (k) => {
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 150 + hash(k * 42 + side) * 90);
          if (onTrack(a.c[0], a.c[2], 14)) continue;
          peak(a.c[0], a.c[2], pyMin, 60 + hash(k * 43 + side) * 50,
               14 + hash(k * 44 + side) * 12, sand);
        }
      });
      // Marram grass tufts hugging the verge (low organic green/tan greenery).
      every(13, (k) => {
        for (const side of [-1, 1]) {
          if (hash(k * 51 + side) > 0.62) continue;
          bush(k, side, 10 + hash(k * 52 + side) * 16,
               hash(k * 53 + side) < 0.5 ? marramG : marramT);
        }
      });
      hedge(0.18, 0.40, 1, 30, 1.4, marramT);   // dune-ridge marram band (Hunserug)
      hedge(0.32, 0.56, -1, 12, 1.4, marramG);
      hedge(0.58, 0.78, 1, 11, 1.4, marramG);
      hedge(0.62, 0.88, -1, 13, 1.4, marramT);

      // --- Orange-clad Dutch grandstands at the banked corners and pit straight.
      // crowd colour = fanatic Verstappen orange. ---
      const shell = [0.36, 0.38, 0.42], shellLt = [0.40, 0.41, 0.46];
      const orange = [0.95, 0.45, 0.05];
      grandstand(0.02, 1, 11, 30, shellLt, orange); // main stand R (pit straight)
      grandstand(0.04, 1, 9, 30, shell, orange);    // Tarzan hairpin R
      grandstand(0.07, -1, 10, 28, shell, orange);  // Tarzan exit L
      grandstand(0.12, -1, 9, 30, shell, orange);   // Hugenholtz approach L
      grandstand(0.14, -1, 9, 34, shell, orange);   // Hugenholtz T3 banked L
      grandstand(0.17, 1, 10, 28, shellLt, orange); // Hugenholtz exit R
      grandstand(0.50, -1, 22, 30, shell, orange);  // Scheivlak inner L (set back)
      grandstand(0.88, 1, 10, 30, shell, orange);   // Luyendyk approach R
      grandstand(0.92, 1, 9, 68, shell, orange);    // Arie Luyendyk final banked R
      grandstand(0.95, 1, 10, 30, shellLt, orange); // Luyendyk exit R
      grandstand(0.96, -1, 11, 30, shellLt, orange); // pit-straight L
      grandstand(0.98, -1, 10, 28, shell, orange);  // pit-straight L exit

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

      // Sea glimpses — blue sliver cresting the dune ridge
      {
        const seaGlimpse = [0.42, 0.58, 0.70];
        for (const s of [0.42, 0.78]) {
          const a = anchor(K(s), 1, 180);
          if (!onTrack(a.c[0], a.c[2], 20)) {
            addBox(out, vadd(a.c, a.u, 1), [50, 2, 50], seaGlimpse, [a.r, a.u, a.t]);
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
