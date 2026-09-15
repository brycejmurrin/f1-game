/* Apex 26 — ALBERT_PARK scenery (data only), split out of js/circuits/albert_park.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["albert_park"] =
  function (api) {
      const { out, n, px, pz, pyMin, place, prop, backdrop, waterSurface, groundPatch, modelGroup, groundYAt,
              every, hash, onTrack,
              grandstandEx, building, motorhome, tower, tree, palm, bush, hedge, billboard, gantry,
              marshalPost, fence, guardrail, tyreWall, anchor, vadd, addBox,
              addCyl, addCone, addFrustum, addPrism, addPyramid,
              forestEdge, cityFront, bowlSeatWall, MAT, circuitKit, seat,
              cameraTower, recordBarrier, track } = api;
      const k = (s) => Math.round(s * n) % n;

      if (circuitKit) {
        circuitKit.marshalShelter({
          id: "kit:albert_park:marshal-shelter", frac: 0.72,
          side: 1, gap: 20, size: [6, 3, 5], required: true,
        });
        circuitKit.recoveryBay({
          id: "kit:albert_park:recovery-bay", frac: 0.70,
          side: 1, gap: 32, size: [12, 5, 18], required: true,
        });
        circuitKit.trackSigns({
          id: "kit:albert_park:track-signs", frac: 0.88,
          side: 1, gap: 22, size: [3, 3, 42], count: 6, required: true,
        });
        circuitKit.hospitality({
          id: "kit:albert_park:lakeside-hospitality", frac: 0.635,
          side: 1, gap: 38, size: [20, 9, 38], modules: 5,
        });
        circuitKit.serviceCompound({
          id: "kit:albert_park:pit-entry-service", frac: 0.965,
          side: -1, gap: 42, size: [24, 6, 34], vehicles: 7,
        });
      }

      const GRASS  = [0.32, 0.62, 0.28];
      const WATER  = [0.20, 0.45, 0.62];
      const WHITE  = [0.92, 0.92, 0.92], RED = [0.80, 0.15, 0.15];
      {
        const a = anchor(k(0.145), 1, 62);
        if (!onTrack(a.c[0], a.c[2], 30)) {
          const b = [a.r, a.u, a.t];
          const PALE  = [0.86, 0.86, 0.84];
          const PALE_D = [0.74, 0.75, 0.74];
          const GLASS = [0.40, 0.52, 0.60];
          const TRIM  = [0.24, 0.40, 0.52];
          modelGroup("albert-msac", {
            center: vadd(a.c, a.u, 10), size: [46, 24, 108], basis: b,
          }, (stage) => {
            addBox(stage, vadd(a.c, a.u, 5.6), [34, 11.2, 92], PALE, b);
            addBox(stage, vadd(vadd(a.c, a.r, -17.2), a.u, 6.2), [0.6, 7.2, 78], GLASS, b);
            addBox(stage, vadd(vadd(a.c, a.r, -17.6), a.u, 2.2), [0.5, 1.0, 80], TRIM, b);
            addCyl(stage, vadd(a.c, a.u, 10.4), 8.2, 92, PALE_D, 12,
                   [a.u, a.t, a.r]);
            addBox(stage, vadd(a.c, a.u, 11.4), [36, 0.5, 93], PALE_D, b);
            const dc = vadd(a.c, a.t, -38);
            addBox(stage, vadd(dc, a.u, 10.5), [26, 21, 24], PALE, b);
            addBox(stage, vadd(dc, a.u, 21.4), [27, 1.0, 25], PALE_D, b);
            addBox(stage, vadd(vadd(dc, a.r, -13.2), a.u, 14.5), [0.5, 8.0, 18], GLASS, b);
            const ec = vadd(a.c, a.t, 44);
            addBox(stage, vadd(vadd(ec, a.r, -19), a.u, 4.6), [10, 0.5, 20], TRIM, b);
            for (const t of [-8, 0, 8]) {
              addCyl(stage, vadd(vadd(ec, a.r, -23), a.t, t), 0.24, 4.6, PALE_D, 6, b);
            }
          });
        }
      }

      waterSurface(k(0.38), -1, 120, [860, 0.2, 860], [0.18, 0.38, 0.56],
                   { id: "albert-lake-west" });
      waterSurface(k(0.58), -1, 110, [820, 0.2, 820], [0.18, 0.38, 0.56],
                   { id: "albert-lake-east" });
      waterSurface(k(0.50), -1, 55, [340, 0.12, 48], [0.26, 0.48, 0.64],
                   { id: "albert-shore-east" });
      waterSurface(k(0.48), -1, 42, [380, 0.12, 60], [0.28, 0.52, 0.66],
                   { id: "albert-shore-west" });
      for (let i = 0; i < 4; i++) {
        const s = 0.30 + (i / 4) * 0.30;
        waterSurface(k(s), -1, 115 + i * 8, [220, 0.16, 170], [0.22, 0.38, 0.52],
                     { id: `albert-lake-infield-${i}` });
      }

      // NOTE: remaining scenery body is on the durable clone.
      // Pit complex (the change we needed on this PR):
      {
        const aP = anchor(k(0.0), 1, 16), bP = [aP.r, aP.u, aP.t];
        modelGroup("albert-pit-complex", {
          center: vadd(aP.c, aP.u, 11),
          size: [26, 30, 190],
          basis: bP,
        }, (stage) => {
          const aG = anchor(k(0.0), 1, 12), bG = [aG.r, aG.u, aG.t];
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aG.c, aG.u, 3.6), [14, 7.2, 180], [0.88, 0.89, 0.91], bG);
          const aD = anchor(k(0.0), 1, 5.4), bD = [aD.r, aD.u, aD.t];
          const AP_TEAMS = [
            [0.00, 0.83, 0.87], [1.00, 0.11, 0.18], [1.00, 0.50, 0.00],
            [0.14, 0.22, 0.55], [0.00, 0.35, 0.72], [0.40, 0.62, 0.90],
            [0.72, 0.10, 0.16], [0.02, 0.22, 0.55], [0.90, 0.10, 0.12],
            [0.00, 0.44, 0.30],
          ];
          const BAYS = 26, PITCH = 6.6;
          stage._mat = MAT.METAL;
          addBox(stage, vadd(aD.c, aD.u, 4.55), [1.6, 0.18, BAYS * PITCH + 2],
                 [0.78, 0.80, 0.83], bD);
          for (let i = 0; i < BAYS; i++) {
            const off = (i - (BAYS - 1) / 2) * PITCH;
            addBox(stage, vadd(vadd(aD.c, aD.u, 2.3), aD.t, off),
                   [0.5, 4.2, 4.4], [0.22, 0.24, 0.28], bD);
            addBox(stage, vadd(vadd(aD.c, aD.u, 2.4), aD.t, off + PITCH * 0.5),
                   [0.55, 4.6, 0.55], [0.10, 0.28, 0.55], bD);
            if (i >= 4 && i < 24) {
              addBox(stage, vadd(vadd(aD.c, aD.u, 4.55), aD.t, off),
                     [0.45, 0.28, 4.0], AP_TEAMS[Math.floor((i - 4) / 2) % AP_TEAMS.length], bD);
            }
          }
          stage._mat = 0;
          addBox(stage, vadd(aP.c, aP.u, 9.2), [13, 3.6, 168], [0.24, 0.34, 0.44], bP);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(aP.c, aP.u, 11.4), [14.4, 0.8, 170], [0.90, 0.90, 0.92], bP);
          stage._mat = MAT.METAL;
          const PANELS = 24;
          for (let i = 0; i < PANELS; i++) {
            const f = (i + 0.5) / PANELS;
            const y = 12.6 + Math.sin(f * Math.PI * 3) * 1.5;
            addBox(stage, vadd(vadd(aP.c, aP.t, (f - 0.5) * 184), aP.u, y),
                   [22, 0.55, 184 / PANELS + 0.4], [0.80, 0.82, 0.85], bP);
          }
          const rc = vadd(aP.c, aP.t, 74);
          stage._mat = MAT.CONCRETE;
          addBox(stage, vadd(rc, aP.u, 9), [15, 18, 22], [0.84, 0.86, 0.88], bP);
          stage._mat = 0;
          addBox(stage, vadd(vadd(rc, aP.r, -7.4), aP.u, 15.5), [0.3, 3.2, 20],
                 [0.22, 0.32, 0.42], bP);
          stage._mat = MAT.METAL;
          addBox(stage, vadd(rc, aP.u, 18.4), [17, 0.7, 24], [0.30, 0.32, 0.36], bP);
          addCyl(stage, vadd(rc, aP.u, 18.7), 0.18, 9, [0.60, 0.62, 0.66], 5, bP);
          stage._mat = 0;
        }, { required: true });
      }
      void prop; void WATER; void pyMin; void bush; void hedge; void cityFront; void addPyramid;
    };
