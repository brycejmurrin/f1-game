/* Apex 26 — ABUDHABI scenery (data only), split out of js/circuits/abudhabi.js.
   LAZY_SCENERY (tools/manifest.cjs): no <script> tag. game.js fetches the ONE
   circuit a session builds; all 40 together were 1,083 KB of the boot wall for
   a player who races one of them. Body moved verbatim — see tools/manifest.cjs
   and tests/unit/load-order.test.mjs for the lockstep. */
"use strict";
(window.TrackScenery = window.TrackScenery || {})["abudhabi"] =
  function (api) {
      const { out, MAT, n, px, py, pz, pyMin, place, prop, groundPlane, addBox, seat,
        anchor, onTrack, hash, vadd, building, motorhome, tower, grandstand, grandstandEx, billboard,
        gantry, palm, bush, hedge, addCyl, addCone, addFrustum, addPrism,
        fence, guardrail, tyreWall, marshalPost, wall, along, recordBarrier,
        cityFront, forestEdge, backdrop, mountain, ferrisWheel, landmarkKit,
        modelGroup, overheadSpan, waterSurface, waterBand, groundPatch, circuitKit,
        bleacher, sailCanopy } = api;
      const K = (s) => Math.round(s * n) % n;

      const LED_TEAL  = [0.20, 0.85, 0.95];
      const LED_MAG   = [0.95, 0.18, 0.72];
      const LED_AMBER = [1.00, 0.62, 0.18];
      const LED_CYCLE = [LED_TEAL, LED_MAG, LED_AMBER];
      const WARM      = [1.00, 0.74, 0.40];    // dock / base uplight
      const WIN       = [0.72, 0.80, 0.97];    // cool lit windows (bluish glass)
      const WIN_WARM  = [1.00, 0.86, 0.58];    // warm lit windows
      const WIN_EMI   = [0.92, 0.96, 1.00];    // bright emissive window highlight
      const FLOOD     = [1.00, 0.97, 0.84];    // floodlight cap — warm white
      const POOL      = [0.98, 0.95, 0.78];    // light pool on ground under masts
      const POOL_SOFT = [0.82, 0.78, 0.55];    // softer secondary light spill
      const SAND      = [0.70, 0.55, 0.35];
      const SAND_DK   = [0.52, 0.40, 0.26];    // shaded dune
      const WATER     = [0.04, 0.06, 0.12];
      const FERRARI   = [0.85, 0.08, 0.10];
      const DARK      = [0.10, 0.10, 0.14];
      const DUSK      = [0.30, 0.16, 0.20];    // deep dusk masonry

      if (circuitKit) {
        // Control tower closes the pit complex at the final-corner end.
        circuitKit.raceControl({
          id: "kit:abudhabi:race-control", frac: 0.985, side: 1, gap: 78,
          size: [12, 26, 14], style: "tapered", required: true,
        });
        {
          const a = anchor(K(0.985), 1, 78 + 6);   // kit centres the tower at gap + size[0]/2
          out._mat = MAT.CONCRETE;
          seat.cyl(out, a.c, 3.2, 25.5, [0.20, 0.21, 0.26], 8, [a.r, a.u, a.t]);
          out._mat = 0;
        }
        // Marina-club suites deepen the hospitality edge beyond the yacht basin.
        circuitKit.hospitality({
          id: "kit:abudhabi:marina-hospitality", frac: 0.735, side: 1, gap: 58,
          size: [18, 10, 42], modules: 6, required: true,
        });
        // A compact TV/service compound sits behind T9, away from sightlines.
        circuitKit.serviceCompound({
          id: "kit:abudhabi:event-service", frac: 0.405, side: 1, gap: 74,
          size: [24, 6, 34], vehicles: 8, required: true,
        });
        // Broadcast cranes mark the two major spectator bowls.
        circuitKit.cameraCrane({
          id: "kit:abudhabi:north-hairpin-camera", frac: 0.285,
          side: -1, gap: 34, size: [6, 18, 6], required: true,
        });
        circuitKit.cameraCrane({
          id: "kit:abudhabi:marsa-camera", frac: 0.790,
          side: -1, gap: 34, size: [6, 18, 6], required: true,
        });
      }

      const spectatorCanopy = (id, s, side, col) => {
        const a = anchor(K(s), side, 27);
        const b = [a.r, a.u, a.t];
        const center = vadd(a.c, a.u, 12);
        modelGroup(id, { center, size: [18, 5, 28], basis: b }, (stage) => {
          stage._mat = MAT.METAL;
          addBox(stage, center, [18, 1.0, 28], [0.15, 0.16, 0.22], b);
          addBox(stage, vadd(vadd(center, a.u, -1.2), a.r, -side * 8.2),
            [0.8, 2.2, 27], col, b);
          stage._mat = 0;
        }, { required: true });
      };
      spectatorCanopy("yas-north-hairpin-led-left", 0.280, -1, LED_TEAL);
      spectatorCanopy("yas-north-hairpin-led-right", 0.280, 1, LED_AMBER);
      spectatorCanopy("yas-turn-9-led-canopy", 0.420, -1, LED_MAG);

      let ledSeq = 0;
      const ledFascia = (s, side, gap, len, tiers) => {
        const col = LED_CYCLE[ledSeq++ % LED_CYCLE.length];
        const a = anchor(K(s), side, gap + 5), b = [a.r, a.u, a.t];
        const roofY = 13 + 7.6 * (Math.max(1, tiers || 1) - 1);
        const lip = vadd(vadd(a.c, a.u, roofY + 0.62), a.r, -side * 5.7);
        addBox(out, lip, [0.34, 0.44, len + 1.6], col, b);
        addBox(out, vadd(lip, a.u, -1.35), [0.24, 0.55, len + 0.6],
          [col[0] * 0.34, col[1] * 0.34, col[2] * 0.34], b);
      };

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let trad = 0;
      for (let i = 0; i < n; i++) trad = Math.max(trad, Math.hypot(px[i] - cx, pz[i] - cz));
      {
        const ring = trad + 360;
        for (let i = 0; i < 36; i++) {
          const a = (i + 0.3) / 36 * 6.2832;
          const h = hash(i * 7 + 360), h2 = hash(i * 13 + 720);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 12 + h * 14 + (h2 - 0.5) * 6;
          mountain(mx, mz, pyMin, 300 + h * 200, varH,
                   { seg: 6, seed: i * 13 + 360, rough: 0.16, forest: SAND, rock: SAND, snowline: 2 });
        }
      }
      // Far dune backdrop — darker, hazier, fewer.
      {
        const ring = trad + 580;
        for (let i = 0; i < 28; i++) {
          const a = (i + 0.7) / 28 * 6.2832;
          const h = hash(i * 11 + 580);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          const varH = 18 + h * 16;
          mountain(mx, mz, pyMin, 380 + h * 220, varH,
                   { seg: 6, seed: i * 17 + 580, rough: 0.18, forest: SAND_DK, rock: SAND_DK, snowline: 2 });
        }
      }

      cityFront(0.12, 0.22, 1, 72, {
        minH: 10, maxH: 24, depth: 16, lit: true,
        palette: [[0.18, 0.20, 0.30], [0.22, 0.22, 0.32], [0.16, 0.18, 0.28]],
        windowCol: WIN_WARM, step: 55,
      });
      cityFront(0.36, 0.38, -1, 80, {
        minH: 10, maxH: 22, depth: 14, lit: true,
        palette: [[0.15, 0.17, 0.26], [0.18, 0.20, 0.28]],
        windowCol: WIN_EMI, step: 60,
      });

      {
        const slots = [0.04, 0.14, 0.24, 0.34, 0.44, 0.80, 0.92, 0.98];
        for (let i = 0; i < slots.length; i++) {
          const k = K(slots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 17 + 3);
          const bh = 16 + h * 14;   // 16–30m — shorter than before
          const bw = 40 + h * 40;
          const col = i % 3 === 0 ? [0.14, 0.15, 0.20]
                    : i % 3 === 1 ? [0.16, 0.17, 0.22]
                                  : [0.12, 0.14, 0.19];
          backdrop(k, side, 110 + h * 40, [bw, bh, 26], col);
        }
      }

      for (let i = 0; i < 6; i++) {
        place(K(0.0 + i * 0.012), 1, 12, [9, 6, 30], [0.30, 0.31, 0.36]);   // pit garages
        place(K(0.0 + i * 0.012), 1, 12, [9.4, 1.0, 30.4], FLOOD);          // lit fascia band
      }
      grandstandEx(0.0, -1, 18, 90, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", suites: true, endWalls: true, pylons: true });
      ledFascia(0.0, -1, 18, 90, 2);
      grandstandEx(0.02, -1, 9, 70, null, null,
        { livery: "darkSteel", tiers: 2, roof: "cantilever", endWalls: true });
      ledFascia(0.02, -1, 9, 70, 2);
      gantry(0.0, 9, DARK);

      // s 0.03-0.06 R — PIT-EXIT TUNNEL: Yas Marina's pit lane surfaces via a
      // tunnel UNDER the main straight — an F1 first, and this circuit's
      // single most distinctive "spot the reference" feature. Was entirely
      // absent. Modelled as a dark portal mouth set back behind the pit
      // garage row, plus a shallow sunken apron leading into it; guarded as
      // one atomic model (modelGroup) so its footprint never reaches the
      // racing line.
      {
        const tk = K(0.045);
        const a = anchor(tk, 1, 40);
        const b = [a.r, a.u, a.t];
        modelGroup("abudhabi:pit-exit-tunnel-portal", {
          center: vadd(a.c, a.u, 3.5), size: [14, 7, 8], basis: b,
        }, (stage) => {
          stage._mat = MAT.CONCRETE;
          // Portal headwall — the pit lane road disappears into this mass
          addBox(stage, vadd(a.c, a.u, 3.5), [14, 7, 8], [0.30, 0.30, 0.32], b);
          stage._mat = 0;
          addBox(stage, vadd(vadd(a.c, a.u, 2.6), a.t, 1.2), [10, 5.5, 5.6],
            [0.02, 0.02, 0.03], b);
        }, { required: true });
        groundPatch(tk, 1, 6, [20, 0.5, 16], [0.16, 0.16, 0.18],
          { id: "abudhabi:pit-exit-trench", samples: 6 });
      }

      grandstandEx(0.05, -1, 8, 70, null, null,
        { livery: "sandstone", tiers: 1, roof: "flat", endWalls: true });
      ledFascia(0.05, -1, 8, 70, 1);
      billboard(K(0.05), -1, 10, 18, 11, LED_TEAL);

      {
        const k = K(0.18);
        place(k, 1, 100, [180, 26, 150], FERRARI);               // vast red roof mass
        if (landmarkKit) {
          const ra = anchor(k, 1, 100);
          const rb = [ra.r, ra.u, ra.t];
          const fins = 6, finW = 180 / fins, finH = 4.5;
          modelGroup("abudhabi:ferrari-world-fins", {
            center: vadd(ra.c, ra.u, 25.5 + finH / 2), size: [180, finH, 150], basis: rb,
          }, (stage) => {
            for (let i = 0; i < fins; i++) {
              const off = (i + 0.5) / fins * 180 - 90;
              landmarkKit.roof(stage, {
                center: vadd(vadd(ra.c, ra.r, off), ra.u, 25.5 + finH / 2),
                size: [finW - 1.4, finH, 148], color: [0.62, 0.06, 0.08], basis: rb, kind: "sawtooth",
              });
            }
          }, { required: true });
        } else {
          place(k, 1, 103, [184, 5, 154], [0.55, 0.05, 0.06]);   // fallback: flat eave band
        }
        const a = anchor(k, 1, 70);
        seat.cyl(out, vadd(a.c, a.u, 25.5), 22, 3, [0.95, 0.93, 0.85], 14, [a.r, a.u, a.t]);   // logo disc
        seat.cyl(out, vadd(a.c, a.u, 28.5), 11, 2, [1.00, 0.85, 0.10], 12, [a.r, a.u, a.t]);   // yellow centre
      }

      for (const side of [-1, 1]) {
        grandstandEx(0.28, side, 7, 90, null, null,
          { livery: "teal", tiers: 2, roof: "cantilever", pylons: true });
        ledFascia(0.28, side, 7, 90, 2);
        grandstandEx(0.30, side, 7, 70, null, null,
          { livery: "teal", tiers: 2, roof: "cantilever", pylons: true });
        ledFascia(0.30, side, 7, 70, 2);
      }

      for (let i = 0; i < 13; i++) {
        const side = (i % 2) ? 1 : -1;
        const tk = K(0.34 + i * 0.006);
        tower(tk, side, 16, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        // Primary light pool — bright oval disc on the ground under the mast
        const pa = anchor(tk, side, 16);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 9, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        // Softer halo ring around the pool
        addCyl(out, vadd(pa.c, pa.u, 0.05), 16, 0.12, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      // Extra floodlights ringing pit straight for night look — with pools
      for (let i = 0; i < 6; i++) {
        const tk = K(0.0 + i * 0.012);
        tower(tk, -1, 20, 4, 36, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, -1, 20);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 10, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        addCyl(out, vadd(pa.c, pa.u, 0.05), 18, 0.12, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      // Hairpin floodlights — both sides with pools
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const tk = K(0.27 + i * 0.014);
          tower(tk, side, 18, 4, 34, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
          const pa = anchor(tk, side, 18);
          addCyl(out, vadd(pa.c, pa.u, 0.1), 9, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        }

      grandstandEx(0.42, -1, 9, 80, null, null,
        { livery: "darkSteel", tiers: 1, roof: "truss", endWalls: true });
      ledFascia(0.42, -1, 9, 80, 1);
      groundPatch(K(0.42), -1, 2, [42, 0.35, 34], [0.20, 0.21, 0.22],
        { id: "turn-9-runoff", samples: 7 });
      if (typeof sailCanopy === "function") {
        for (let i = 0; i < 4; i++) {
          const sa = anchor(K(0.404 + i * 0.011), -1, 26);
          sailCanopy(sa.c, [sa.r, sa.u, sa.t], {
            rx: 13, rz: 9, h: 15.5, ribs: 7, thick: 0.5,
            col: (i % 2) ? [0.95, 0.94, 0.90] : [0.90, 0.90, 0.88],
          });
          addBox(out, vadd(sa.c, sa.u, 15.0), [16, 0.30, 12], LED_AMBER,
            [sa.r, sa.u, sa.t]);
        }
      }

      waterBand(0.52, 0.76, 1, 18, 200, 12, WATER, { id: "marina-water" });

      // Yacht hierarchy — fewer, clearer sizes (slim → mid → mega at 0.66)
      for (let i = 0; i < 14; i++) {
        const k = K(0.53 + (i % 10) * 0.020);
        const a = anchor(k, 1, 24 + (i % 3) * 12);
        const off = ((i % 5) - 2) * 10.0;
        const hc = vadd(a.c, a.t, off);
        const big = (i % 7 === 0) ? 1.35 : (i % 3 === 1 ? 1.1 : 0.85);
        addBox(out, vadd(hc, a.u, 1.1 * big), [4.2 * big, 2.2 * big, 11 * big], [0.94, 0.95, 0.96], [a.r, a.u, a.t]);
        seat.cyl(out, vadd(hc, a.u, 2.2 * big), 0.18, 11 * big, [0.86, 0.88, 0.92], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(hc, a.u, 0.4), [4.6 * big, 0.35, 11.5 * big], [1.0, 0.85, 0.50], [a.r, a.u, a.t]);
        if (big > 1.2)
          addBox(out, vadd(hc, a.u, 2.3 * big), [2.2 * big, 1.3 * big, 4.2 * big], [0.82, 0.84, 0.90], [a.r, a.u, a.t]);
      }
      // Mooring posts
      for (let i = 0; i < 8; i++) {
        const k = K(0.54 + i * 0.028);
        const a = anchor(k, 1, 30 + (i % 2) * 8);
        addCyl(out, a.c, 0.35, 3.2, [0.72, 0.54, 0.28], 6, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 3.5), [1.6, 0.8, 1.6], [0.85, 0.22, 0.12], [a.r, a.u, a.t]);
      }

      building(K(0.62), 1, 28, 48, 52, 28, { kind: "cylinder", wall: [0.20, 0.22, 0.30], lit: true, windowCol: WIN_EMI, floor: 6 });
      building(K(0.60), 1, 34, 30, 32, 22, { kind: "spire", wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_WARM, floor: 5 });
      building(K(0.64), 1, 34, 30, 36, 22, { kind: "notch", wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_EMI, floor: 5 });
      {
        const aH = anchor(K(0.62), 1, 28 + 24);
        addBox(out, vadd(aH.c, aH.u, 54), [50, 7, 30], WIN_EMI, [aH.r, aH.u, aH.t]);
      }
      {
        const aW1 = anchor(K(0.60), 1, 34 + 15);
        addBox(out, vadd(aW1.c, aW1.u, 34), [32, 5, 24], WIN_WARM, [aW1.r, aW1.u, aW1.t]);
        const aW2 = anchor(K(0.64), 1, 34 + 15);
        addBox(out, vadd(aW2.c, aW2.u, 38), [32, 5, 24], WIN_EMI, [aW2.r, aW2.u, aW2.t]);
      }
      place(K(0.62), 1, 56, [52, 4.0, 8], [1.0, 0.82, 0.46]);
      place(K(0.60), 1, 50, [32, 3.2, 7], [0.98, 0.78, 0.44]);
      place(K(0.64), 1, 50, [32, 3.2, 7], [0.98, 0.78, 0.44]);

      if (typeof bleacher === "function") {
        bleacher(0.678, 0.735, 1, 13, {
          rows: 7, rise: 0.74, setback: 1.0, step: 16, density: 0.5,
          frameCol: [0.62, 0.65, 0.70], plankCol: [0.30, 0.46, 0.50],
        });
      } else {
        grandstandEx(0.69, 1, 14, 35, null, null, { livery: "sandstone", roof: "none" });
        grandstandEx(0.72, 1, 14, 35, null, null, { livery: "sandstone", roof: "none" });
      }
      for (let i = 0; i < 12; i++) {
        const lampK = K(0.68 + i * 0.004);
        const a = anchor(lampK, 1, 11);
        addCyl(out, a.c, 0.14, 5.5, [0.28, 0.24, 0.17], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 5.5), [1.4, 1.2, 1.4], WARM, [a.r, a.u, a.t]);
        addCyl(out, vadd(a.c, a.u, 0.08), 3.5, 0.15, [0.96, 0.82, 0.44], 8, [a.r, a.u, a.t]);
      }

      // Water reflection streaks + dock glow (hotel approach reads from basin)
      for (let i = 0; i < 8; i++) {
        const ak = anchor(K(0.53 + i * 0.028), 1, 22 + (i % 3) * 6);
        addBox(out, vadd(ak.c, ak.u, -0.2), [56, 0.35, 2.5], [1.0, 0.86, 0.44], [ak.r, ak.u, ak.t]);
        addBox(out, vadd(ak.c, ak.u, -0.5), [56, 0.30, 2.5], [0.45, 0.62, 0.84], [ak.r, ak.u, ak.t]);
      }

      grandstandEx(0.78, -1, 8, 100, null, null, { livery: "sandstone", roof: "truss", endWalls: true });
      ledFascia(0.78, -1, 8, 100, 1);
      grandstandEx(0.80, -1, 8, 70, null, null, { livery: "sandstone", roof: "truss" });
      ledFascia(0.80, -1, 8, 70, 1);

      {
        const k = K(0.88);
        const H = 100;
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 30);
          const b = [a.r, a.u, a.t];
          modelGroup(`yas-hotel-${side < 0 ? "left" : "right"}-tower`, {
            center: vadd(a.c, a.u, 54), size: [30, 108, 40], basis: b,
          }, (stage) => {
            stage._mat = MAT.GLASS;
            addFrustum(stage, a.c, 18, 14, H, [0.10, 0.11, 0.16], 8, b);
            addBox(stage, vadd(a.c, a.u, 5), [26, 10, 34], [0.08, 0.09, 0.13], b);
            stage._mat = 0;
            addBox(stage, vadd(a.c, a.u, 1.2), [28, 2.8, 36], [1.0, 0.80, 0.44], b);
            addCyl(stage, vadd(a.c, a.u, 0.12), 14, 0.22, POOL, 10, b);
            stage._mat = MAT.GLASS;
            for (let fl = 0; fl < 5; fl++) {
              const fy = 16 + fl * 15;
              addBox(stage, vadd(a.c, a.u, fy), [24, 3.5, 32], (fl % 2 === 0) ? WIN_EMI : WIN_WARM, b);
            }
            stage._mat = MAT.METAL;
            for (let gy = 0; gy < 6; gy++) {
              const cc = vadd(a.c, a.u, 18 + gy * 12);
              const col = LED_CYCLE[(gy + (side > 0 ? 1 : 0)) % 3];
              addBox(stage, vadd(cc, a.r, -side * 12), [0.7, 4.0, 8.0], col, b);
            }
            stage._mat = 0;
            addBox(stage, vadd(a.c, a.u, H + 2), [16, 3.5, 20], [1.0, 0.98, 0.88], b);
            addBox(stage, vadd(a.c, a.u, H + 5.5), [4, 5, 4], LED_MAG, b);
            addBox(stage, vadd(a.c, a.u, H - 1.5), [28, 1.5, 38], [1.0, 0.88, 0.38], b);
          }, { required: true });
        }

        const hotelSupport = (id, frac, side, gap, width, height, depth, col, mat) => {
          const sk = K(frac);
          const a = anchor(sk, side, gap + width / 2);
          const b = [a.r, a.u, a.t];
          const size = [width, height, depth];
          const center = vadd(a.c, a.u, height / 2);
          modelGroup(id, { center, size, basis: b }, (stage) => {
            stage._mat = mat;
            addBox(stage, center, size, col, b);
            stage._mat = 0;
          }, { required: true });
        };

        const shellClearances = [18, 22, 27, 31, 27, 22, 18];
        const shellThick = 0.65;

        const shellLegH = shellClearances[0] + shellThick / 2;
        for (const [label, frac] of [["front", 0.872], ["rear", 0.888]]) {
          for (const side of [-1, 1])
            hotelSupport(`yas-hotel-gridshell-${label}-${side < 0 ? "left" : "right"}-support`,
              frac, side, 14.5, 1.2, shellLegH, 2.2, [0.06, 0.07, 0.10], MAT.METAL);
        }

        for (let i = 0; i < shellClearances.length; i++) {
          const frac = 0.872 + i * (0.016 / (shellClearances.length - 1));
          overheadSpan({
            id: `yas-hotel-gridshell-arch-${i + 1}`,
            frac, clearance: shellClearances[i], minimumClearance: 4.8,
            thickness: shellThick, depth: 2.2, span: 56,
            supportGap: 14.5, supportWidth: 1.2, supports: false,
            color: LED_CYCLE[i % LED_CYCLE.length], required: true,
          });
        }

        const bridges = [
          { id: "yas-hotel-bridge-main", frac: 0.88, clearance: 9.5,
            thickness: 2.4, depth: 32, span: 27, gap: 2.2, pierW: 2.0,
            col: [0.08, 0.09, 0.12] },
          { id: "yas-hotel-bridge-forward", frac: 0.875, clearance: 9.2,
            thickness: 1.8, depth: 22, span: 26, gap: 2.2, pierW: 1.8,
            col: [0.10, 0.11, 0.14] },
        ];
        for (const bridge of bridges) {
          overheadSpan({
            id: bridge.id, frac: bridge.frac, clearance: bridge.clearance,
            minimumClearance: 4.8, thickness: bridge.thickness,
            depth: bridge.depth, span: bridge.span,
            supportGap: bridge.gap, supportWidth: bridge.pierW, supports: false,
            color: bridge.col, required: true,
          });
          for (const side of [-1, 1]) {
            hotelSupport(`${bridge.id}-${side < 0 ? "left" : "right"}-pier`,
              bridge.frac, side, bridge.gap, bridge.pierW,
              bridge.clearance + bridge.thickness * 0.5,
              bridge.depth * 0.55, bridge.col, MAT.CONCRETE);
            recordBarrier(bridge.frac - bridge.depth / 2 / 5300,
              bridge.frac + bridge.depth / 2 / 5300, side, bridge.gap);
          }
        }

        // Reflecting pool at hotel base (R, clear of racing line)
        waterSurface(K(0.87), 1, 18, [70, 0.35, 55], WATER,
          { id: "yas-hotel-reflecting-pool" });
        // Hotel dock lights
        for (let i = 0; i < 7; i++) {
          const dockK = K(0.86 + i * 0.003);
          const da = anchor(dockK, 1, 10);
          addBox(out, vadd(da.c, da.u, 0.4), [2.4, 0.6, 2.4], LED_AMBER, [da.r, da.u, da.t]);
          addCyl(out, vadd(da.c, da.u, 0.08), 2.8, 0.12, [0.98, 0.88, 0.50], 7, [da.r, da.u, da.t]);
        }
      }

      billboard(K(0.95), 1, 9, 16, 10, LED_MAG);
      billboard(K(0.95), -1, 9, 16, 10, LED_TEAL);
      // MAIN GRANDSTAND flank, closing the bowl back toward the line
      grandstandEx(0.96, -1, 8, 80, null, null, { livery: "darkSteel", roof: "cantilever", endWalls: true });
      ledFascia(0.96, -1, 8, 80, 1);

      grandstandEx(0.08, -1, 8, 70, null, null, { livery: "sandstone", roof: "flat" });          // WEST
      ledFascia(0.08, -1, 8, 70, 1);
      grandstandEx(0.10, -1, 8, 60, null, null, { livery: "sandstone", roof: "flat" });           // WEST
      ledFascia(0.10, -1, 8, 60, 1);
      grandstandEx(0.22, -1, 8, 80, null, null, { livery: "teal", roof: "cantilever" });          // NORTH
      ledFascia(0.22, -1, 8, 80, 1);
      grandstandEx(0.36, 1, 8, 60, null, null, { livery: "teal", roof: "cantilever" });           // NORTH
      ledFascia(0.36, 1, 8, 60, 1);
      grandstandEx(0.48, -1, 8, 60, null, null, { livery: "darkSteel", roof: "truss" });          // SOUTH
      ledFascia(0.48, -1, 8, 60, 1);
      if (typeof bleacher === "function") {
        bleacher(0.545, 0.578, 1, 8, {
          rows: 6, rise: 0.74, setback: 1.0, step: 16, density: 0.5,
          frameCol: [0.62, 0.65, 0.70], plankCol: [0.30, 0.46, 0.50],
        });
      } else {
        grandstandEx(0.56, 1, 8, 70, null, null, { livery: "sandstone", roof: "none" });
      }
      grandstandEx(0.83, -1, 8, 60, null, null, { livery: "sandstone", roof: "truss" });          // MARINA
      ledFascia(0.83, -1, 8, 60, 1);
      grandstandEx(0.92, -1, 8, 60, null, null, { livery: "darkSteel", roof: "cantilever" });     // MAIN
      ledFascia(0.92, -1, 8, 60, 1);

      building(K(0.44), 1, 36, 42, 48, 28, { kind: "cylinder", wall: [0.18, 0.20, 0.28], lit: true, windowCol: WIN_EMI, floor: 6 });
      building(K(0.45), 1, 37, 28, 34, 20, { kind: "fin", wall: [0.16, 0.18, 0.26], lit: true, windowCol: WIN_WARM, floor: 5 });
      building(K(0.43), 1, 42, 32, 28, 22, { kind: "twin", wall: [0.15, 0.17, 0.24], lit: true, windowCol: WIN_EMI, floor: 5 });
      place(K(0.44), 1, 30, [46, 3.2, 8], [1.0, 0.84, 0.48]);
      // Lit crown highlights on Radisson towers
      {
        const rA = anchor(K(0.44), 1, 36 + 21);
        addBox(out, vadd(rA.c, rA.u, 50), [44, 7, 30], WIN_WARM, [rA.r, rA.u, rA.t]);
      }

      // More light towers along S2 sector + marina — each with a light pool
      for (let i = 0; i < 8; i++) {
        const side = (i % 2) ? 1 : -1;
        const tk = K(0.42 + i * 0.007);
        tower(tk, side, 18, 4, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, side, 18);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 8, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
        addCyl(out, vadd(pa.c, pa.u, 0.04), 14, 0.10, POOL_SOFT, 10, [pa.r, pa.u, pa.t]);
      }
      for (let i = 0; i < 6; i++) {
        const tk = K(0.56 + i * 0.008);
        tower(tk, 1, 16, 4, 30, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
        const pa = anchor(tk, 1, 16);
        addCyl(out, vadd(pa.c, pa.u, 0.1), 8, 0.25, POOL, 10, [pa.r, pa.u, pa.t]);
      }

      for (let i = 0; i < 8; i++) {
        const k = K(0.58 + (i % 6) * 0.024);
        const a = anchor(k, 1, 42 + (i % 2) * 12);
        const off = ((i % 4) - 1.5) * 9;
        const hc = vadd(a.c, a.t, off);
        addBox(out, vadd(hc, a.u, 1.0), [3.2, 1.8, 8], [0.90, 0.91, 0.93], [a.r, a.u, a.t]);
        // Deck (centred hull at 1.0, height 1.8) is at 1.9 — not 6.5.
        seat.cyl(out, vadd(hc, a.u, 1.9), 0.14, 9, [0.84, 0.85, 0.88], 4, [a.r, a.u, a.t]);
        addBox(out, vadd(hc, a.u, 0.3), [3.6, 0.25, 8.5], LED_AMBER, [a.r, a.u, a.t]);
      }

      {
        const fingers = 8;
        for (let i = 0; i < fingers; i++) {
          const s = 0.53 + i * ((0.76 - 0.53) / (fingers - 1));
          const a = anchor(K(s), 1, 24);
          const b = [a.r, a.u, a.t];
          const len = 16 + hash(i * 5 + 900) * 8;
          addBox(out, vadd(vadd(a.c, a.r, len / 2), a.u, 0.35), [len, 0.5, 2.0],
            [0.30, 0.28, 0.24], b);
          for (const fs of [-1, 1]) {
            const alongF = 5 + hash(i * 11 + (fs > 0 ? 40 : 80)) * (len - 8);
            const hc = vadd(vadd(a.c, a.r, alongF), a.t, fs * 2.6);
            addBox(out, vadd(hc, a.u, 0.55), [1.4, 0.8, 3.8], [0.88, 0.90, 0.93], b);
          }
        }
        for (let i = 0; i < 9; i++) {
          const s = 0.60 + (i / 8) * 0.16;      // 0.60 .. 0.76
          const a = anchor(K(s), 1, 56 + (i % 3) * 14);
          const b = [a.r, a.u, a.t];
          const off = ((i % 5) - 2) * 7;
          const hc = vadd(a.c, a.t, off);
          addBox(out, vadd(hc, a.u, 0.8), [2.4, 1.3, 6], [0.92, 0.93, 0.95], b);
          seat.cyl(out, vadd(hc, a.u, 1.45), 0.10, 6, [0.86, 0.87, 0.90], 4, b);
        }
      }

      // PALMS — using forestEdge() for sections near barriers so canopies
      // never clip through fence/wall geometry.
      // Bare palm() calls only where dist is safely large (20m+).
      // Marina-facing palm avenue: forestEdge() handles barrier-safe placement.
      // gap=20 keeps canopy inner edge well clear of any barrier at ~4-5m.
      forestEdge(0.50, 0.74, 1, 20, {
        density: 0.45, hMin: 7, hMax: 11,
        col: [0.25, 0.55, 0.20], col2: [0.28, 0.57, 0.22],
        pineFrac: 0.0,  // all palms (broadleaf trees look like palms at distance)
      });
      // Marsa curve palms — forestEdge, left side
      forestEdge(0.78, 0.87, -1, 14, {
        density: 0.50, hMin: 9, hMax: 14,
        col: [0.27, 0.57, 0.22], col2: [0.24, 0.52, 0.18],
        pineFrac: 0.0,
      });
      // pit straight palms at safe distance (20m+) — no clipping risk
      for (let i = 0; i < 14; i++) {
        const side = (i % 2) ? 1 : -1;
        palm(K(0.0 + i * 0.010), side, 20 + hash(i * 9) * 6, 9 + hash(i * 7) * 2, [0.26, 0.56, 0.21]);
      }
      // pit-entry chicane palms at safe distance
      for (let i = 0; i < 12; i++) {
        const side = (i % 2) ? 1 : -1;
        palm(K(0.92 + i * 0.007), side, 20 + hash(i * 7) * 6, 8 + hash(i * 5) * 2, [0.26, 0.55, 0.20]);
      }
      // Palm avenue far side (well back from track)
      for (let i = 0; i < 18; i++) {
        const s = 0.0 + (i / 18) * 0.15;
        palm(K(s), (i % 2) ? 1 : -1, 22 + hash(i * 17) * 12, 11 + hash(i * 7) * 3, [0.25, 0.55, 0.20]);
      }
      for (let i = 0; i < 14; i++) {
        const s = 0.85 + (i / 14) * 0.12;
        palm(K(s), (i % 2) ? 1 : -1, 22 + hash(i * 23) * 12, 11 + hash(i * 11) * 3, [0.25, 0.55, 0.20]);
      }

      fence(0.03, 0.30, -1, 4.5, 4.5, [0.42, 0.45, 0.50]);
      fence(0.50, 0.86, 1, 4.5, 4.5, [0.42, 0.45, 0.50]);
      fence(0.30, 0.48, -1, 4.5, 4.0, [0.42, 0.45, 0.50]);
      recordBarrier(0.03, 0.30, -1, 4.5);
      recordBarrier(0.50, 0.86, 1, 4.5);
      recordBarrier(0.30, 0.48, -1, 4.5);
      // Pit-wall (solid concrete) along the start/finish straight, pit side
      wall(0.985, 0.07, 1, 3.0, 1.1, [0.80, 0.82, 0.86], 0.6);
      // Armco guardrails on the open runoff edges
      guardrail(0.05, 0.18, -1, 6, [0.75, 0.77, 0.80]);
      guardrail(0.32, 0.42, 1, 6, [0.75, 0.77, 0.80]);
      guardrail(0.90, 0.99, -1, 6, [0.75, 0.77, 0.80]);
      // Tyre-wall stacks at the tight corner exits (hairpin + final chicane)
      tyreWall(0.27, 0.31, 1, 5, LED_TEAL);
      tyreWall(0.27, 0.31, -1, 5, LED_AMBER);
      tyreWall(0.95, 0.985, 1, 5, LED_MAG);
      tyreWall(0.05, 0.085, -1, 5, LED_TEAL);
      // Marshal posts (orange roof + flag pole) spaced around the lap
      for (let i = 0; i < 14; i++) {
        const s = i / 14;
        marshalPost(K(s), (i % 2) ? 1 : -1, 7);
      }

      {
        const ad = [LED_TEAL, LED_MAG, LED_AMBER, WIN];
        for (let i = 0; i < 12; i++) {
          const s = i / 12;
          const side = (i % 2) ? -1 : 1;
          billboard(K(s + 0.015), side, 11, 15, 8, ad[i % ad.length]);
        }
      }

      {
        // Long terrain-conforming paddock apron.
        groundPatch(K(0.02), 1, 20, [74, 0.45, 68], [0.20, 0.21, 0.23],
          { id: "yas-paddock-apron", samples: 10 });
        // team motorhome row (modern two-storey lit hospitality units) — was 3
        // stacked raw boxes per unit; now the purpose-built motorhome() model
        // (slide-out awning, window ribbon, livery accent stripe).
        for (let i = 0; i < 10; i++) {
          const k = K(0.985 + i * 0.010);
          const wc = (i % 2) ? WIN : WIN_WARM;
          motorhome(k, 1, 36, 14, 8.5, 17, { window: wc, wall: [0.86, 0.87, 0.90],
            accent: (i % 2) ? [0.75, 0.10, 0.10] : [0.10, 0.30, 0.72] });
        }
        // pit-lane back wall + garage roof line (more prominent)
        for (let i = 0; i < 7; i++) {
          place(K(0.0 + i * 0.011), 1, 22, [11, 9, 30], [0.24, 0.25, 0.30]);
          place(K(0.0 + i * 0.011), 1, 22, [11.4, 1.4, 30.4], [1.0, 0.95, 0.80]); // roof fascia glow
        }
        // Paddock floodlight masts — taller, with large light pools below
        for (let i = 0; i < 7; i++) {
          const tk = K(0.99 + i * 0.010);
          tower(tk, 1, 50, 5, 32, { col: DARK, seg: 4, cap: true, capCol: FLOOD });
          const pa = anchor(tk, 1, 50);
          addCyl(out, vadd(pa.c, pa.u, 0.1), 12, 0.30, POOL, 12, [pa.r, pa.u, pa.t]);
          addCyl(out, vadd(pa.c, pa.u, 0.04), 22, 0.12, POOL_SOFT, 12, [pa.r, pa.u, pa.t]);
        }
      }

      {
        const rawBox = TrackGeom.addBox;
        const aL = anchor(K(0.0), -1, 7), aR = anchor(K(0.0), 1, 7);
        for (let j = 0; j < 5; j++) {
          const t = (j + 0.5) / 5;
          const bx = aL.c[0] + (aR.c[0] - aL.c[0]) * t;
          const bz = aL.c[2] + (aR.c[2] - aL.c[2]) * t;
          rawBox(out, [bx, aL.c[1] + 8.5, bz], [1.6, 1.6, 0.8], [0.85, 0.10, 0.08], [aL.r, aL.u, aL.t]);
        }
        // a second photo/scoring gantry just before T1
        gantry(0.96, 9, DARK);
      }

      {
        const k = K(0.28);
        const a = anchor(k, 1, 36);
        out._mat = MAT.CONCRETE;
        addFrustum(out, a.c, 14, 9, 40, [0.12, 0.13, 0.18], 10, [a.r, a.u, a.t]);
        out._mat = MAT.GLASS;
        // Glazed observation deck — bright emissive lit glass at night
        addBox(out, vadd(a.c, a.u, 22), [30, 8, 12], WIN_EMI, [a.r, a.u, a.t]);
        out._mat = 0;
        // Lit crown beacon
        addBox(out, vadd(a.c, a.u, 42), [10, 5, 10], FLOOD, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 47), [4, 4, 4], LED_TEAL, [a.r, a.u, a.t]);
        // Ground light pool at tower base
        addCyl(out, vadd(a.c, a.u, 0.10), 14, 0.20, POOL_SOFT, 10, [a.r, a.u, a.t]);
      }

      for (const [s, side] of [[0.0, -1], [0.28, -1], [0.28, 1], [0.70, 1], [0.78, -1]]) {
        const a = anchor(K(s), side, 18);
        // Screen frame — sits atop the grandstand at ~8m height
        addBox(out, vadd(a.c, a.u, 8), [20, 10, 1.5], WIN_EMI, [a.r, a.u, a.t]);
        // Bright screen face
        addBox(out, vadd(vadd(a.c, a.u, 8), a.r, side * 0.8), [17, 8, 0.8], LED_TEAL, [a.r, a.u, a.t]);
      }

      hedge(0.10, 0.18, -1, 12, 2.2, [0.16, 0.22, 0.14]);
      hedge(0.62, 0.74, 1, 13, 2.2, [0.16, 0.22, 0.14]);
      // low shrub clusters at safe distances
      for (let i = 0; i < 16; i++) {
        const s = i / 16;
        bush(K(s), (i % 2) ? 1 : -1, 12 + hash(i * 13) * 6, [0.15, 0.21, 0.13]);
      }
      // palm clusters at corner apex (strategic placement, safe distance)
      for (const s of [0.05, 0.18, 0.42, 0.55, 0.78, 0.95]) {
        for (let j = 0; j < 3; j++)
          palm(K(s + j * 0.005), (s < 0.5) ? -1 : 1, 18 + j * 2.5, 7 + hash(j * 3) * 4, [0.26, 0.56, 0.21]);
      }

      {
        // hero mega-yacht at marina mouth (s ~0.66)
        const k = K(0.66);
        const a = anchor(k, 1, 32);
        const hc = vadd(a.c, a.u, 2.8);
        // hull
        addBox(out, hc, [10, 5.5, 38], [0.96, 0.97, 0.98], [a.r, a.u, a.t]);
        // superstructure
        addBox(out, vadd(hc, a.u, 4.5), [8, 4.5, 25], [0.91, 0.92, 0.95], [a.r, a.u, a.t]);
        // bridge deck windows (lit)
        addBox(out, vadd(hc, a.u, 8), [6, 3.2, 14], [0.75, 0.82, 0.95], [a.r, a.u, a.t]);
        seat.cyl(out, vadd(hc, a.u, 9.6), 0.28, 16, [0.87, 0.88, 0.92], 4, [a.r, a.u, a.t]);
        // water reflection highlight
        addBox(out, vadd(hc, a.u, 0.6), [11, 0.5, 40], [1.0, 0.86, 0.50], [a.r, a.u, a.t]);
        // deck lighting accent
        addBox(out, vadd(hc, a.u, 5.5), [2.4, 0.6, 8], [0.85, 0.85, 0.88], [a.r, a.u, a.t]);
        // white luxury pavilion tents (A-frame)
        out._mat = MAT.FABRIC;
        for (let i = 0; i < 7; i++) {
          const ak = anchor(K(0.56 + i * 0.020), 1, 19);
          seat.prism(out, ak.c, [7, 4.8, 9], [0.96, 0.96, 0.98], [ak.r, ak.u, ak.t]);
          // tent lighting
          addBox(out, vadd(ak.c, ak.u, 2), [7.2, 0.8, 9.2], [1.0, 0.88, 0.60], [ak.r, ak.u, ak.t]);
        }
        out._mat = MAT.WOOD;
        // jetty fingers reaching into water
        for (let i = 0; i < 5; i++) {
          const jk = anchor(K(0.55 + i * 0.022), 1, 13);
          // jetty deck
          addBox(out, vadd(jk.c, jk.t, 0), [2.4, 0.6, 28], [0.32, 0.30, 0.28], [jk.r, jk.u, jk.t]);
          // jetty accent lighting
          addBox(out, vadd(jk.c, jk.t, 0), [1.2, 0.4, 28.2], [0.95, 0.82, 0.55], [jk.r, jk.u, jk.t]);
        }
        out._mat = 0;
      }

      {
        // Mid-field low ridges — skip marina corridor (0.52–0.74) so water + hotel glow read
        const midSlots = [0.04, 0.12, 0.20, 0.28, 0.36, 0.44,
                          0.78, 0.86, 0.94];
        for (let i = 0; i < midSlots.length; i++) {
          const k = K(midSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 11 + 250);
          const ridgeH = 10 + h * 10;
          const ridgeW = 220 + h * 120;
          backdrop(k, side, 200 + h * 80, [ridgeW, ridgeH, 100], [0.64, 0.52, 0.36]);
        }
        // Far hazy dune horizon
        const farSlots = [0.06, 0.18, 0.30, 0.42, 0.80, 0.92];
        for (let i = 0; i < farSlots.length; i++) {
          const k = K(farSlots[i]);
          const side = (i % 2) ? 1 : -1;
          const h = hash(i * 13 + 430);
          const ridgeH = 14 + h * 12;
          const ridgeW = 280 + h * 160;
          backdrop(k, side, 340 + h * 100, [ridgeW, ridgeH, 120], [0.50, 0.40, 0.26]);
        }
      }

      const coasterLoop = (k, side, gap) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        const R = 24, base = vadd(a.c, a.u, 2);
        let prev = null, prevTh = 0;
        for (let i = 0; i <= 26; i++) {
          const th = i / 26 * Math.PI * 2;
          const p = vadd(vadd(base, a.r, Math.sin(th) * R), a.u, R - Math.cos(th) * R);
          if (prev) {
            const mid = [(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2, (prev[2] + p[2]) / 2];
            // Rail segment ROTATED onto the chord it spans. An axis-aligned
            // 1.3x1.5 box covered only a fraction of the 5.8 m step between ring
            // points, so the loop was 26 disconnected beads with 4 m of air
            // between them — each one unsupported, and the ring never read as
            // continuous rail. Chord components live in the (right, up) plane.
            const dr = R * (Math.sin(th) - Math.sin(prevTh));
            const du = R * (Math.cos(prevTh) - Math.cos(th));
            const len = Math.hypot(dr, du) || 1;
            const dir = [(a.r[0] * dr + a.u[0] * du) / len, (a.r[1] * dr + a.u[1] * du) / len,
                         (a.r[2] * dr + a.u[2] * du) / len];
            const nrm = [(a.u[0] * dr - a.r[0] * du) / len, (a.u[1] * dr - a.r[1] * du) / len,
                         (a.u[2] * dr - a.r[2] * du) / len];
            addBox(out, mid, [len + 0.3, 1.3, 1.6], FERRARI, [dir, nrm, a.t]);
          }
          prev = p; prevTh = th;
        }
        // rising launch ramp feeding the loop
        for (let i = 0; i < 12; i++) {
          const t = i / 11;
          const c = vadd(vadd(base, a.t, -34 + t * 28), a.u, t * t * 22);
          addBox(out, c, [1.5, 1.3, 3.2], FERRARI, b);
          if (i % 3 === 0) seat.cyl(out, [c[0], a.c[1], c[2]], 0.45, c[1] - a.c[1], [0.70, 0.70, 0.72], 5, b);
        }
        for (const dr of [-R, R])
          seat.cyl(out, vadd(vadd(a.c, a.r, dr), a.t, 1.2), 0.6, R + 2, [0.70, 0.70, 0.72], 6, b);
        out._mat = 0;
      };
      coasterLoop(K(0.185), 1, 58);

      // ── Etihad Arena — low domed entertainment arena ────────────────────
      const arena = (k, side, gap) => {
        const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
        out._mat = MAT.METAL;
        addFrustum(out, a.c, 34, 30, 14, [0.20, 0.22, 0.30], 16, b);                     // drum
        out._mat = MAT.GLASS;
        addBox(out, vadd(a.c, a.u, 6), [70, 3, 62], WIN_WARM, b);                        // lit facade band
        out._mat = MAT.METAL;
        addFrustum(out, vadd(a.c, a.u, 14), 30, 11, 10, [0.24, 0.26, 0.34], 16, b);      // dome shoulder
        addCone(out, vadd(a.c, a.u, 24), 12, 6, [0.26, 0.28, 0.36], 16, b);              // dome cap
        out._mat = 0;
        addBox(out, vadd(a.c, a.u, 30), [3, 3, 3], LED_TEAL, b);                         // beacon
      };
      arena(K(0.52), 1, 110);

      ferrisWheel(K(0.20), 1, 150, 34);
    };
