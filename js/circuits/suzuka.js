/* Apex 26 — SUZUKA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.3 m off centreline, 1 node before vertex 0.
    // Was 0.6125. That already measured straight (mean |k| 0.00330 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.9942,
    sceneryStartFrac: 0.6125,
    sceneryCoordinates: "racing",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    sunAzimBias: -0.14,   // Pacific-coast morning race slot — sun still east of the crossover
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.19, s1: 0.26 },
      { kinds: ["foliage", "lighting"], s0: 0.79, s1: 0.85 },
    ],
    pal: { zenith: [0.35, 0.50, 0.70], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.90, 0.65], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    // Elevations and bridges are authored in source-trace space. These source
    // fractions map through startFrac=0.9942 to racing s≈0.818, 0.068 and 0.436
    // (the crossover bridge).
    // Keeping that contract explicit prevents the crossover lift from landing on
    // the Esses while its scenery remains at the real figure-8 crossing.
    // The bridge peak sits exactly on the measured self-crossing (lower road
    // racing s≈0.226, upper s≈0.817). The lower road there is already lifted to
    // y≈5.4 by the Esses elevation, so rise must clear it: 13.5 − 5.4 ≈ 8.1 m of
    // road-to-road daylight — the crossover deck (6.5 m underside + 1.5 m deck)
    // tucks exactly beneath the upper ribbon instead of clipping through it.
    elevations: [{ s: 0.8125, halfM: 300, rise: 11 }, { s: 0.0625, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.4298, halfM: 160, rise: 13.5 }],
    hwZones: [
      { s0: 0.8710, s1: 0.9671, hw: 6.1, ease: 0.012 },  // arc 0.300-0.348 the Esses
    ],
    bankZones: [
      { frac: 0.0622, angleDeg: 4.0, widthM: 260 },   // T1/T2
      { frac: 0.3306, angleDeg: 3.5, widthM: 220 },   // Dunlop / Degner approach
      { frac: 0.5194, angleDeg: 3.5, widthM: 150 },
      { frac: 0.6549, angleDeg: 3.5, widthM: 170 },
      { frac: 0.8015, angleDeg: 4.0, widthM: 80 },    // Spoon
      { frac: 0.8562, angleDeg: 7.0, widthM: 100 },   // 130R
      { frac: 0.9281, angleDeg: 4.0, widthM: 240 },   // final corner
    ],
    scenery: function (api) {
      const { out, track, n, px, py, pz, hw, pyMin, place, every, ferrisWheel,
              hash, mountain, pine, tree, bush, grandstandEx, spectatorHill,
              bleacher, cypress, broadleafFall,
              building, tower, billboard,
              marshalPost, fence, guardrail, tyreWall, hedge, anchor, vadd,
              addBox, addCyl, addCone, addFrustum, addPrism, addPyramid, groundYAt, onTrack, forestEdge, backdrop,
              MAT, modelGroup, overheadSpan, circuitKit, cameraTower, broadcastCompound } = api;
      const K = (s) => Math.round(s * n) % n;

      // ── Suzuka palette ──────────────────────────────────────────────────────
      const navy      = [0.18, 0.26, 0.46];
      const concrete  = [0.62, 0.63, 0.67];
      const steel     = [0.40, 0.42, 0.48];
      // Motopia theme-park accent palette — primaries pop against forested hills
      const parkCol   = [[0.88, 0.38, 0.36], [0.35, 0.64, 0.86], [0.92, 0.82, 0.32], [0.52, 0.80, 0.50], [0.80, 0.46, 0.84]];
      // Emissive-warm tones for lamp heads and lit windows (reads as glowing at night)
      const lampWarm  = [1.00, 0.95, 0.72];   // warm sodium-lamp white
      const litWin    = [0.96, 0.92, 0.62];   // lit window amber
      const neonRed   = [1.00, 0.22, 0.18];
      const neonBlue  = [0.18, 0.72, 1.00];
      const neonYel   = [1.00, 0.95, 0.12];
      // Sakura / cherry-blossom pinks
      const sakuraPink  = [0.96, 0.72, 0.80];
      const sakuraLight = [0.98, 0.80, 0.88];

      const stand = (s, side, gap, len, opts) => {
        grandstandEx(s, side, gap, len, null, null, opts || {});
      };
      const M = 1 / 5800;
      const openBank = (s, side, gap, lenM, opts) =>
        bleacher(s - lenM * M / 2, s + lenM * M / 2, side, gap, opts);

      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
      cx /= n; cz /= n;
      let rad = 0;
      for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
      for (const [extra, wMin, wVar, hMin, hVar, count, seg, fc, rc] of [
        [160, 280, 85, 44, 46, 44, 8, [0.20, 0.38, 0.23], [0.30, 0.36, 0.28]],    // near base — tighter, denser green wall
        [310, 320, 110, 68, 60, 36, 8, [0.25, 0.42, 0.28], [0.36, 0.42, 0.32]],   // mid green ridge
        [500, 380, 140, 110, 85, 28, 8, [0.40, 0.50, 0.44], [0.45, 0.50, 0.45]],  // far hazed range
      ]) {
        const ring = rad + extra;
        for (let i = 0; i < count; i++) {
          const offset = (extra === 160 ? 0 : extra === 310 ? 0.5 : 1) / count;
          const a = (i + offset + extra * 0.003) / count * 6.2832, h = hash(i * 11 + extra);
          const mx = cx + Math.cos(a) * ring, mz = cz + Math.sin(a) * ring;
          mountain(mx, mz, pyMin, wMin + h * wVar, hMin + h * hVar, {
            seg, seed: i * 17 + extra, snowline: 1.1,
            forest: [fc[0] + h * 0.06, fc[1] + h * 0.05, fc[2] + h * 0.05], rock: rc,
          });
        }
      }

      for (let i = 0; i < 18; i++) {
        const frac = i / 18;
        const k = Math.round(frac * n) % n;
        const side = (i % 2 === 0) ? -1 : 1;
        const dist = 140 + hash(i * 13.7) * 80;   // 140–220 m — behind forestEdge
        backdrop(k, side, dist, [90 + hash(i * 5.3) * 40, 38 + hash(i * 7.1) * 22, 60 + hash(i * 9.9) * 30],
                 [0.22 + hash(i * 3.3) * 0.06, 0.40 + hash(i * 4.7) * 0.06, 0.20 + hash(i * 2.1) * 0.04]);
      }

      const wheelK = Math.round(n * 0.02) % n;
      ferrisWheel(wheelK, -1, 62, 38);     // 38 m radius — tall main-straight silhouette

      // Single flanking accent tower (aft of wheel) — keeps Motopia colour without crowding
      tower(Math.round(n * 0.038) % n, -1, 105, 7, 42, { col: [0.80, 0.82, 0.86], seg: 7, cap: true, capCol: neonBlue, mast: 5 });

      {
        const g = anchor(K(0.055), -1, 52), gb = [g.r, g.u, g.t];
        const gc = vadd(g.c, g.u, 5.2);
        modelGroup("suzuka-motopia-arrival-gate", {
          center: gc, size: [14, 10.5, 4], basis: gb,
        }, (stage) => {
          // addBox is centre-anchored; these two passed g.c directly as the
          // centre with no height/2 lift, so each pillar's centre sat AT
          // grade — half its 8.5 m height buried, the standing half topping
          // out at 4.25 (measured via float-audit as floating 7-9 m clear
          // of ground, and disconnected from the crossbeam at 8.2 anyway).
          // Lifted to stand base-on-grade: centre = g.c + half-height.
          addBox(stage, vadd(vadd(g.c, g.r, -5.5), g.u, 8.5 / 2), [1.2, 8.5, 1.4], [0.92, 0.92, 0.94], gb);
          addBox(stage, vadd(vadd(g.c, g.r,  5.5), g.u, 8.5 / 2), [1.2, 8.5, 1.4], [0.92, 0.92, 0.94], gb);
          addBox(stage, vadd(g.c, g.u, 8.2), [13.2, 1.5, 2.2], neonRed, gb);
          addBox(stage, vadd(g.c, g.u, 9.5), [9.0, 0.55, 2.5], [0.96, 0.96, 0.94], gb);
        }, { required: true });
      }

      // ── Lamp posts ringing the wheel area — warm sodium emissive heads ────────
      for (let i = 0; i < 6; i++) {
        const lk = (wheelK + i - 3 + n) % n;
        const ldist = 32 + (i % 3) * 8;   // 32–48 m — clear of wheel at 62
        if (onTrack(px[lk] + track.rx[lk] * (-1) * (hw[lk] + ldist),
                    pz[lk] + track.rz[lk] * (-1) * (hw[lk] + ldist), 3)) continue;
        const lp = anchor(lk, -1, ldist), lb = [lp.r, lp.u, lp.t];
        addCyl(out, lp.c, 0.14, 9, steel, 5, lb);                          // pole
        addBox(out, vadd(lp.c, lp.u, 9.4), [1.6, 0.5, 1.0], lampWarm, lb); // lamp head
      }

      // ── Amusement-park complex behind the wheel (sparse Motopia) ─────────────
      const parkA = Math.round(n * 0.995) % n;   // just before S/F, behind the wheel

      // Motopia Hotel block — 5-storey, clear of the wheel footprint
      building(Math.round(n * 0.005) % n, -1, 95, 30, 36, 22, { kind: "tiered", wall: [0.74, 0.74, 0.78], window: litWin, floor: 5, setback: true, roof: true });
      // Secondary pavilion
      building(Math.round(n * 0.985) % n, -1, 110, 24, 26, 16, { kind: "twin", wall: [0.76, 0.76, 0.80], window: litWin, floor: 4 });

      // Domed pavilion / central gathering structure (deep behind wheel)
      {
        const pk = Math.round(n * 0.01) % n;
        const p = anchor(pk, -1, 128), b = [p.r, p.u, p.t];
        addCyl(out, p.c, 11, 11, [0.92, 0.92, 0.95], 12, b);
        addCone(out, vadd(p.c, p.u, 11), 12, 10, [0.88, 0.36, 0.38], 14, b);
        addCyl(out, vadd(p.c, p.u, 10), 11.8, 0.8, neonRed, 14, b);
      }

      // Sparse pavilion canopies (was 8 — cut to 4 so the Ferris owns the skyline)
      for (let i = 0; i < 4; i++) {
        const kk = (parkA + i * 5 + 2) % n;
        const dist = 78 + i * 14;
        const sz = [11 + (i % 3) * 2.5, 7 + (i % 2) * 2.5, 13 + (i % 4) * 1.5];
        place(kk, -1, dist, sz, parkCol[i % parkCol.length]);
        const p = anchor(kk, -1, dist), b = [p.r, p.u, p.t];
        const roofY = sz[1] + 2;
        addCone(out, vadd(p.c, p.u, roofY), 7.5, 5, parkCol[(i + 2) % parkCol.length], 8, b);
        addCyl(out, vadd(p.c, p.u, roofY - 0.5), sz[0] / 2 + 0.4, 0.6,
               [parkCol[(i + 1) % parkCol.length][0], parkCol[(i + 1) % parkCol.length][1], parkCol[(i + 1) % parkCol.length][2]], 8, b);
      }

      // Flag-poles / ride masts — thinned
      for (let i = 0; i < 5; i++) {
        const kk = (parkA + i * 3 + 1) % n;
        const fdist = 42 + (i % 4) * 6;
        const p = anchor(kk, -1, fdist), b = [p.r, p.u, p.t];
        addCyl(out, p.c, 0.12, 10 + (i % 3) * 2.2, steel, 4, b);
        addBox(out, vadd(p.c, p.u, 9 + (i % 3)), [0.12, 1.6, 2.4], parkCol[i % parkCol.length], b);
      }

      // Small vendor kiosks
      for (let i = 0; i < 3; i++) {
        const kk = (parkA + i * 6 + 3) % n;
        const dist = 70 + i * 16;
        place(kk, -1, dist, [8, 4, 8], [0.88, 0.76, 0.54]);
      }

      const carousel = (k, side, dist, rad) => {
        const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
        if (onTrack(p.c[0], p.c[2], 4)) return;
        addCyl(out, p.c, rad + 0.6, 1.1, [0.86, 0.80, 0.62], 16, b);          // platform
        out._mat = MAT.METAL;
        addCyl(out, vadd(p.c, p.u, 1.1), 0.5, 7.5, [0.90, 0.86, 0.70], 8, b); // centre pole
        out._mat = MAT.FABRIC;
        addCone(out, vadd(p.c, p.u, 7.5), rad + 1.3, 3.6, neonRed, 16, b);    // canopy
        addCyl(out, vadd(p.c, p.u, 7.5), rad + 1.5, 0.6, neonYel, 16, b);     // valance rim
        out._mat = MAT.METAL;
        addCone(out, vadd(p.c, p.u, 11.1), 0.8, 1.6, neonBlue, 8, b);         // finial
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * 6.2832;
          const off = vadd(vadd(p.c, p.r, Math.cos(a) * rad), p.t, Math.sin(a) * rad);
          out._mat = MAT.METAL;
          addCyl(out, vadd(off, p.u, 1.1), 0.08, 6, [0.95, 0.92, 0.80], 4, b);
          out._mat = 0;
          addBox(out, vadd(off, p.u, 3.2), [0.55, 1.0, 1.4], parkCol[i % parkCol.length], b);
        }
        out._mat = 0;
      };

      const dropRide = (k, side, dist, h) => {
        const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
        if (onTrack(p.c[0], p.c[2], 4)) return;
        out._mat = MAT.METAL;
        addCyl(out, p.c, 1.3, h, [0.90, 0.90, 0.94], 6, b);              // mast core
        for (const [ro, to] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
          addCyl(out, vadd(vadd(p.c, p.r, ro), p.t, to), 0.12, h, steel, 4, b);
        }
        const gY = h * 0.42;
        addCyl(out, vadd(p.c, p.u, gY), 3.1, 1.7, neonBlue, 12, b);      // gondola ring
        addCyl(out, vadd(p.c, p.u, gY - 0.25), 3.3, 0.4, neonYel, 12, b);
        addCone(out, vadd(p.c, p.u, h), 1.7, 3.0, neonRed, 8, b);        // beacon cap
        out._mat = 0;
        addBox(out, vadd(p.c, p.u, h + 3.0), [0.4, 1.6, 0.4], lampWarm, b);
        out._mat = 0;
      };

      carousel(Math.round(n * 0.992) % n, -1, 88, 8);
      dropRide(Math.round(n * 0.032) % n, -1, 125, 58);   // single tall drop — behind Ferris

      // ── Lamp posts along the park perimeter ─────────────────────────────────
      for (let i = 0; i < 8; i++) {
        const lk2 = (parkA + i * 4) % n;
        const ldist2 = 36 + (i % 5) * 7;
        if (onTrack(px[lk2] + track.rx[lk2] * (-1) * (hw[lk2] + ldist2),
                    pz[lk2] + track.rz[lk2] * (-1) * (hw[lk2] + ldist2), 3)) continue;
        const lp2 = anchor(lk2, -1, ldist2), lb2 = [lp2.r, lp2.u, lp2.t];
        addCyl(out, lp2.c, 0.12, 8, steel, 5, lb2);
        addBox(out, vadd(lp2.c, lp2.u, 8.4), [1.4, 0.4, 0.9], lampWarm, lb2);
      }

      if (circuitKit) {
        circuitKit.pitBuilding({
          id: "kit:suzuka:pit-building", frac: 0.985, side: 1, gap: 9,
          size: [14, 9, 60], garages: 15, required: true,
        });
        circuitKit.raceControl({ style: "tapered",
          id: "kit:suzuka:race-control", frac: 0.995, side: 1, gap: 22,
          size: [9, 30, 9], required: true,
        });
      }
      {
        const rk = Math.round(n * 0.995) % n;
        const rc = anchor(rk, 1, 22), rb = [rc.r, rc.u, rc.t];
        const faceC = vadd(rc.c, rc.u, 24);
        modelGroup("kit:suzuka:race-control-clock", {
          center: faceC, size: [1.2, 6.6, 6.6], basis: rb,
        }, (stage) => {
          addBox(stage, vadd(faceC, rc.r, 0.05), [0.3, 6.2, 6.2], navy, rb);            // housing surround
          addCyl(stage, vadd(faceC, rc.r, 0.22), 2.9, 0.22, [0.96, 0.96, 0.94], 16, [rc.u, rc.r, rc.t]);  // white face
          addCyl(stage, vadd(faceC, rc.r, 0.45), 3.05, 0.14, navy, 16, [rc.u, rc.r, rc.t]);               // rim
          addBox(stage, vadd(faceC, rc.r, 0.32), [0.14, 0.32, 1.9], navy, rb);          // hour hand
          addBox(stage, vadd(faceC, rc.r, 0.32), [0.14, 2.3, 0.14], navy, rb);          // minute hand
        }, { required: true });
      }
      broadcastCompound(Math.round(n * 0.992) % n, 1, 32, { vans: 3, dishes: 2, mastH: 9 });
      if (circuitKit) {
        circuitKit.hospitality({
          id: "kit:suzuka:paddock-hospitality", frac: 0.975, side: 1, gap: 58,
          size: [18, 9, 34], modules: 5, required: true,
        });
        circuitKit.marshalShelter({
          id: "kit:suzuka:degner-marshal-shelter", frac: 0.315, side: 1, gap: 18,
          size: [6, 3.2, 5], required: true,
        });
      }
      guardrail(0.965, 0.04, 1, 2.5, [0.88, 0.88, 0.90]);
      overheadSpan({ id: "suzuka-start-gantry", frac: 0.0, clearance: 7.2,
        thickness: 0.9, depth: 1.8, supportGap: 2.5, supportWidth: 1.0,
        color: [0.14, 0.14, 0.18], required: true });

      // Pit-straight lamp posts (right side)
      for (let i = 0; i < 8; i++) {
        const lk3 = Math.round(n * (0.97 + i * 0.007)) % n;
        const lp3 = anchor(lk3, 1, 8), lb3 = [lp3.r, lp3.u, lp3.t];
        addCyl(out, lp3.c, 0.12, 9, steel, 5, lb3);
        addBox(out, vadd(lp3.c, lp3.u, 9.4), [1.4, 0.4, 0.9], lampWarm, lb3);
      }

      // Pit-straight sponsor billboards (left side)
      for (let i = 0; i < 5; i++) {
        billboard(Math.round(n * (0.0 + i * 0.012)) % n, 1, 6, 8, 4, parkCol[i % parkCol.length]);
      }

      const footbridge = (id, s, deckH) => {
        const k = Math.round(s * n) % n;
        overheadSpan({ id, frac: s, clearance: deckH, thickness: 1.2, depth: 4.5,
          supportGap: 2.8, supportWidth: 2.2, color: [0.30, 0.50, 0.34],
          required: true });
        for (const side of [-1, 1]) {
          const a = anchor(k, side, 3.9), b = [a.r, a.u, a.t];
          const towerC = vadd(a.c, a.u, deckH / 2);
          modelGroup(`${id}-${side < 0 ? "left" : "right"}-tower`, {
            center: towerC, size: [2.2, deckH, 2.8], basis: b,
          }, (stage) => {
            addBox(stage, towerC, [2.2, deckH, 2.8], concrete, b);
            addBox(stage, vadd(a.c, a.u, deckH + 0.6), [3.2, 1.2, 3.4], steel, b);
          }, { required: true });
        }
      };
      footbridge("suzuka-esses-footbridge", 0.135, 8.0);
      footbridge("suzuka-hairpin-footbridge", 0.500, 7.5);

      // ── Overhead camera / scoring gantries ───────────────────────────────────
      overheadSpan({ id: "suzuka-degner-gantry", frac: 0.30, clearance: 7.0,
        thickness: 0.8, depth: 1.6, supportGap: 2.4, color: steel, required: true });
      overheadSpan({ id: "suzuka-130r-gantry", frac: 0.86, clearance: 7.0,
        thickness: 0.8, depth: 1.6, supportGap: 2.4, color: steel, required: true });

      forestEdge(0.10, 0.24,  1, 14, { density: 0.72, hMin: 9, hMax: 16,
        col:  [0.13, 0.34, 0.15], col2: [0.16, 0.36, 0.14], pineFrac: 0.65 });
      forestEdge(0.10, 0.133, -1, 14, { density: 0.68, hMin: 8, hMax: 15,
        col:  [0.14, 0.35, 0.16], col2: [0.17, 0.37, 0.15], pineFrac: 0.60 });
      forestEdge(0.133, 0.175, -1, 8, { density: 0.60, hMin: 8, hMax: 14,
        col:  [0.14, 0.35, 0.16], col2: [0.17, 0.37, 0.15], pineFrac: 1 });
      forestEdge(0.175, 0.24, -1, 14, { density: 0.68, hMin: 8, hMax: 15,
        col:  [0.14, 0.35, 0.16], col2: [0.17, 0.37, 0.15], pineFrac: 0.60 });

      // Degner / back straight hillside — Japanese cedar + broadleaf mix
      forestEdge(0.24, 0.40,  1, 12, { density: 0.65, hMin: 8, hMax: 14,
        col:  [0.12, 0.33, 0.14], col2: [0.15, 0.35, 0.13], pineFrac: 0.58 });
      forestEdge(0.24, 0.40, -1, 12, { density: 0.62, hMin: 8, hMax: 14,
        col:  [0.13, 0.34, 0.15], col2: [0.16, 0.36, 0.14], pineFrac: 0.55 });

      // Hairpin / Spoon sector — denser hillside forest
      forestEdge(0.40, 0.55,  1, 12, { density: 0.70, hMin: 9, hMax: 15,
        col:  [0.12, 0.32, 0.14], col2: [0.15, 0.35, 0.13], pineFrac: 0.60 });
      forestEdge(0.55, 0.72, -1, 12, { density: 0.68, hMin: 8, hMax: 14,
        col:  [0.13, 0.33, 0.14], col2: [0.15, 0.35, 0.13], pineFrac: 0.58 });
      forestEdge(0.42, 0.54, -1, 34, { density: 0.34, hMin: 10, hMax: 17,
        col: [0.11, 0.30, 0.13], col2: [0.16, 0.36, 0.15], pineFrac: 0.66 });
      forestEdge(0.57, 0.70, 1, 34, { density: 0.32, hMin: 10, hMax: 16,
        col: [0.12, 0.31, 0.14], col2: [0.17, 0.37, 0.16], pineFrac: 0.62 });

      forestEdge(0.72, 0.805,  1, 12, { density: 0.65, hMin: 8, hMax: 13,
        col:  [0.13, 0.34, 0.15], col2: [0.16, 0.36, 0.14], pineFrac: 0.55 });
      forestEdge(0.83, 0.92,   1, 12, { density: 0.65, hMin: 8, hMax: 13,
        col:  [0.13, 0.34, 0.15], col2: [0.16, 0.36, 0.14], pineFrac: 0.55 });
      forestEdge(0.72, 0.805, -1, 12, { density: 0.62, hMin: 7, hMax: 13,
        col:  [0.12, 0.33, 0.14], col2: [0.15, 0.35, 0.13], pineFrac: 0.52 });
      forestEdge(0.83, 0.92,  -1, 12, { density: 0.62, hMin: 7, hMax: 13,
        col:  [0.12, 0.33, 0.14], col2: [0.15, 0.35, 0.13], pineFrac: 0.52 });

      forestEdge(0.92, 0.94,  -1, 20, { density: 0.55, hMin: 8, hMax: 14,
        col:  [0.14, 0.35, 0.16], col2: [0.17, 0.37, 0.15], pineFrac: 0.55 });
      forestEdge(0.99, 0.10,  -1, 20, { density: 0.55, hMin: 8, hMax: 14,
        col:  [0.14, 0.35, 0.16], col2: [0.17, 0.37, 0.15], pineFrac: 0.55 });

      {
        const essesSakura = [
          [0.175, 20, 7.5], [0.188, 24, 8.2], [0.200, 18, 7.0],
          [0.210, 26, 8.8], [0.220, 22, 7.8], [0.228, 28, 6.8],
        ];
        for (let i = 0; i < essesSakura.length; i++) {
          const [sf, dist, h] = essesSakura[i];
          const bk = Math.round(n * sf) % n;
          tree(bk, -1, dist, h, i % 2 ? sakuraLight : sakuraPink);
        }
        // One light echo at Degner / Spoon — not Motopia density
        tree(Math.round(n * 0.28) % n, 1, 24, 7, sakuraPink);
        tree(Math.round(n * 0.62) % n, -1, 22, 6.5, sakuraLight);
      }

      const SUGI  = [0.10, 0.27, 0.15], SUGI_D = [0.07, 0.21, 0.12];
      for (const [s0, side, gap, cnt, stepF] of [
        [0.262,  1, 20, 11, 0.0068],   // Degner descent
        [0.462, -1, 21,  9, 0.0072],   // Hairpin exit toward 200R
        [0.722,  1, 20, 10, 0.0070],   // back straight before the crossover break
        [0.596, -1, 22,  8, 0.0074],   // Spoon outfield
      ]) {
        for (let i = 0; i < cnt; i++) {
          const kk = Math.round(n * (s0 + i * stepF)) % n;
          cypress(kk, side, gap + (i % 2) * 2.5, 16 + hash(i * 4.3 + s0 * 90) * 5,
                  (i % 3) ? SUGI : SUGI_D, { slim: 0.72 });
        }
      }

      const MOMIJI_R = [0.62, 0.16, 0.14], MOMIJI_G = [0.24, 0.44, 0.20];
      for (const [s, side, gap, h, red] of [
        [0.163,  1, 15, 6.5, 1], [0.172,  1, 19, 7.5, 0], [0.181,  1, 16, 6.0, 1],
        [0.334, -1, 17, 7.0, 0], [0.345, -1, 21, 6.5, 1],
        [0.448,  1, 16, 6.0, 1], [0.457,  1, 20, 7.2, 0],
        [0.655, -1, 18, 6.8, 1], [0.666, -1, 22, 7.4, 0], [0.677, -1, 17, 6.2, 1],
        [0.905, -1, 20, 7.0, 0], [0.914, -1, 24, 6.4, 1],
      ]) {
        broadleafFall(Math.round(n * s) % n, side, gap, h,
                      red ? MOMIJI_R : MOMIJI_G,
                      { lobes: 4, spread: 1.25, barkCol: [0.32, 0.26, 0.22] });
      }

      const noboriCols = [neonRed, [0.98, 0.98, 0.96], navy, neonYel, [0.10, 0.52, 0.30]];
      const nobori = (kk, side, dist, i) => {
        const p = anchor(kk, side, dist), b = [p.r, p.u, p.t];
        if (onTrack(p.c[0], p.c[2], 1.2)) return;
        addCyl(out, vadd(p.c, p.u, -0.3), 0.07, 5.6, [0.24, 0.24, 0.27], 4, b);
        addBox(out, vadd(p.c, p.u, 5.1), [0.06, 0.08, 0.95], [0.24, 0.24, 0.27], b);  // top arm
        out._mat = MAT.FABRIC;
        addBox(out, vadd(vadd(p.c, p.u, 3.3), p.t, 0.42),
               [0.05, 3.4, 0.82], noboriCols[i % noboriCols.length], b);
        // White header band — a nobori is a coloured field under a plain cap.
        addBox(out, vadd(vadd(p.c, p.u, 4.85), p.t, 0.42),
               [0.07, 0.5, 0.82], [0.96, 0.96, 0.94], b);
        out._mat = 0;
      };
      for (let i = 0; i < 12; i++) nobori(Math.round(n * (0.955 + i * 0.0042)) % n, 1, 12, i);
      for (let i = 0; i < 8; i++)  nobori(Math.round(n * (0.045 + i * 0.0046)) % n, -1, 26, i + 2);
      for (let i = 0; i < 6; i++)  nobori(Math.round(n * (0.298 + i * 0.0055)) % n, -1, 11, i + 1);

      {
        const dunlopBlue = [0.05, 0.28, 0.62], dunlopYellow = [0.96, 0.80, 0.10];
        const dk = K(0.205);
        overheadSpan({ id: "suzuka-dunlop-arch", frac: 0.205, clearance: 7.4,
          thickness: 1.1, depth: 2.6, span: hw[dk] * 2 + 9,
          color: dunlopBlue, required: true });
        for (const side of [-1, 1]) {
          const da = anchor(dk, side, 3.2), db = [da.r, da.u, da.t];
          const postC = vadd(da.c, da.u, 4.1);
          modelGroup(`suzuka-dunlop-arch-post-${side < 0 ? "left" : "right"}`, {
            center: postC, size: [1.4, 8.2, 1.4], basis: db,
          }, (stage) => {
            addBox(stage, postC, [1.4, 8.2, 1.4], dunlopBlue, db);
            addBox(stage, vadd(da.c, da.u, 6.4), [1.6, 1.4, 1.6], dunlopYellow, db); // brand cap band
          }, { required: true });
        }
      }

      // ── Low shrub clusters at road margin (replaces over-close bush loops) ────
      every(40, (k) => {
        const s = hash(k * 61);
        if (s < 0.5) return;
        bush(k, s < 0.75 ? -1 : 1, 10 + s * 4, [0.21, 0.41, 0.21]);
        if (s > 0.72) bush(k, s > 0.75 ? -1 : 1, 12 + s * 3, [0.19, 0.39, 0.19]);
      });

      // ── Track furniture: catch fences, guardrails, tyre walls, marshal posts ─
      fence(0.10, 0.24,  1, 6, 4, [0.70, 0.72, 0.76]);   // Esses outer
      fence(0.10, 0.24, -1, 6, 4, [0.70, 0.72, 0.76]);   // Esses inner
      fence(0.80, 0.90,  1, 6, 4, [0.70, 0.72, 0.76]);   // 130R outer
      fence(0.845, 0.925, -1, 6, 4, [0.70, 0.72, 0.76]);
      fence(0.92, 0.98,  1, 5, 4, [0.70, 0.72, 0.76]);   // Casio chicane
      fence(0.92, 0.98, -1, 5, 4, [0.70, 0.72, 0.76]);
      guardrail(0.24, 0.36, -1, 3, [0.84, 0.84, 0.88]);  // Degner inner
      guardrail(0.55, 0.66,  1, 3, [0.84, 0.84, 0.88]);  // Spoon outer
      tyreWall(0.44, 0.47, -1, 2.5, [0.85, 0.20, 0.20]);   // Hairpin inner
      tyreWall(0.93, 0.96,  1, 2.5, [0.20, 0.35, 0.80]);   // Casio chicane outer
      tyreWall(0.83, 0.86,  1, 3.0, [0.85, 0.20, 0.20]);   // 130R outer
      for (const [s, sd] of [[0.12, 1], [0.28, -1], [0.43, 1], [0.58, -1], [0.72, 1], [0.85, 1], [0.95, -1]]) {
        marshalPost(Math.round(n * s) % n, sd, 5);
      }
      if (circuitKit) {
        circuitKit.trackSigns({
          id: "kit:suzuka:degner-signs", frac: 0.335, side: -1, gap: 6,
          size: [3, 3, 30], count: 8, required: true,
        });
        circuitKit.trackSigns({
          id: "kit:suzuka:hairpin-approach-signs", frac: 0.42, side: 1, gap: 6,
          size: [3, 3, 26], count: 7, required: true,
        });
      }
      cameraTower(K(0.37), -1, 20, { h: 18 });
      // Trackside billboards
      for (const [s, sd] of [[0.20, 1], [0.46, 1], [0.63, -1], [0.88, 1]]) {
        const gap = s === 0.88 ? 14 : 7;
        billboard(Math.round(n * s) % n, sd, gap, 7, 3.5, parkCol[Math.round(s * 10) % parkCol.length]);
      }

      // ── Figure-8 crossover ────────────────────────────────────────────────────
      // The road bridge is raised by `bridges` at racing s≈0.817. The LOWER road
      // passes beneath it at racing s≈0.226 (measured self-crossing — NOT 0.37;
      // the deck used to float there over open road). This intentional span
      // supplies the visible green deck and guarantees a safe 6.5 m underside
      // instead of relying on unguarded raw boxes. The shared bridge builder
      // supplies grounded piers beside the upper racing line.
      // Deck top must stay BELOW the upper ribbon (8.07 m above the lower road
      // at the crossing): clearance 5 + thickness 1.7 puts the top at 6.7 m —
      // ~1.4 m of tuck — so it reads as girder structure under the bridge, not
      // a grass platform level with the racing surface. Girder green, not turf.
      overheadSpan({ id: "suzuka-crossover-deck", frac: 0.226, clearance: 5.0,
        minimumClearance: 4.8, thickness: 1.7, depth: 20, span: hw[Math.round(0.226 * n) % n] * 2 + 8,
        supportGap: 2.8, supportWidth: 1.8, color: [0.13, 0.33, 0.21],
        required: true });
      for (const side of [-1, 1]) {
        const ca = anchor(K(0.226), side, 8.5), cb = [ca.r, ca.u, ca.t];
        const cc = vadd(ca.c, ca.u, 2.6);
        modelGroup(`suzuka-crossover-abutment-${side < 0 ? "left" : "right"}`, {
          center: cc, size: [7.6, 6.2, 12.8], basis: cb,
        }, (stage) => {
          addBox(stage, cc, [6.5, 5.2, 12], concrete, cb);
          addBox(stage, vadd(ca.c, ca.u, 5.35), [7.0, 0.45, 12.5], neonRed, cb);
          addBox(stage, vadd(vadd(ca.c, ca.r, side * 3.55), ca.u, 3.0),
                 [0.35, 3.0, 10.5], steel, cb);
        }, { required: true });
      }

      // ── Honda orange accent on main grandstand (start/finish left side) ───────
      {
        const hk = Math.round(n * 0.00) % n;
        const ah = anchor(hk, -1, 22);
        const bh = [ah.r, ah.u, ah.t];
        modelGroup("suzuka-main-stand-crown", {
          center: vadd(ah.c, ah.u, 17.5), size: [3.2, 5.0, 44], basis: bh,
        }, (stage) => {
          addBox(stage, vadd(ah.c, ah.u, 16), [3.2, 2.4, 44], [0.98, 0.52, 0.08], bh);
          addBox(stage, vadd(ah.c, ah.u, 18.8), [3.0, 1.2, 44], [0.92, 0.92, 0.94], bh);
        }, { required: true });
      }

      // ── Scenic towers on mid-lap hills (Spoon / back sector) ─────────────────
      tower(Math.round(n * 0.50) % n, 1, 160, 6, 19, { col: [0.78, 0.80, 0.84], seg: 6, cap: true, capCol: neonRed, mast: 3 });
      tower(Math.round(n * 0.62) % n, -1, 170, 6, 20, { col: [0.80, 0.82, 0.86], seg: 6, cap: true, capCol: neonBlue, mast: 4 });

      // ── Lamp posts along the main straight and key corners ───────────────────
      every(35, (k) => {
        const side = hash(k * 13) < 0.5 ? -1 : 1;
        const ldist = 10 + hash(k * 37) * 4;
        if (onTrack(px[k] + track.rx[k] * side * (hw[k] + ldist),
                    pz[k] + track.rz[k] * side * (hw[k] + ldist), 2)) return;
        const lp4 = anchor(k, side, ldist), lb4 = [lp4.r, lp4.u, lp4.t];
        addCyl(out, lp4.c, 0.13, 9, steel, 5, lb4);
        addBox(out, vadd(lp4.c, lp4.u, 9.4), [1.6, 0.4, 1.0], lampWarm, lb4);
      });

      stand(0.00, -1, 15, 52, { livery: "navy", tiers: 2, roof: "cantilever",
        suites: true, endWalls: true, pylons: true }); // Main grandstand — clear of the curved pit approach; navy base under the Honda crown accent
      stand(0.15,  1, 15, 28, { livery: "steel", roof: "truss" });         // Esses — compact bank on the rising outside
      stand(0.28, -1, 9, 28,  { livery: "orange", roof: "flat" });      // Degner entry
      stand(0.45,  1, 9, 38,  { livery: "navy", tiers: 2, endWalls: true }); // Hairpin
      stand(0.94,  1, 9, 35,  { livery: "steel", roof: "truss", endWalls: true });  // Casio Triangle right
      stand(0.94, -1, 9, 35,  { livery: "navy", roof: "truss", endWalls: true });   // Casio Triangle left
      stand(0.50,  1, 8, 24,  { livery: "orange" });                    // Mid-circuit flex stand
      stand(0.875, 1, 18, 24, { livery: "orange", endWalls: true }); // 130R exit crowd

      openBank(0.205, 1, 20, 22, { rows: 9, rise: 0.70, setback: 0.92,
        frameCol: [0.58, 0.60, 0.64], plankCol: [0.66, 0.67, 0.70], density: 0.72 });
      openBank(0.750, 1,  8, 26, { rows: 7, rise: 0.72, setback: 0.95,
        frameCol: [0.56, 0.58, 0.62], plankCol: [0.64, 0.65, 0.68], density: 0.66 });

      const hillHalf = (lenM) => (lenM / 2) / track.total;
      spectatorHill(0.62 - hillHalf(40), 0.62 + hillHalf(40), -1, 9,
        { rows: 4, density: 0.55 }); // Spoon
      spectatorHill(0.84 - hillHalf(36), 0.84 + hillHalf(36), 1, 8,
        { rows: 4, density: 0.5 });  // 130R

      {
        const CULM   = [0.62, 0.66, 0.36];
        const CULM_D = [0.52, 0.58, 0.30];
        const LEAF   = [0.30, 0.52, 0.24];
        const LEAF_L = [0.38, 0.60, 0.28];
        for (const [sf, side, gap] of [
          [0.118, -1, 44], [0.152, -1, 52], [0.196,  1, 46],
          [0.335,  1, 58], [0.408, -1, 50], [0.523,  1, 42],
          [0.596, -1, 56], [0.678,  1, 48], [0.742, -1, 44],
          [0.878,  1, 54],
        ]) {
          const kk = K(sf);
          // A grove is 14-22 culms in a tight clump, not a scatter.
          const count = 14 + Math.floor(hash(kk * 13 + gap) * 9);
          for (let i = 0; i < count; i++) {
            const hv = hash(kk * 7 + i * 31 + gap);
            const hv2 = hash(kk * 11 + i * 17);
            const gx = (i % 5) - 2, gz = Math.floor(i / 5) - 1.5;
            const a = anchor(kk + Math.round(gx * 2.2 + (hv - 0.5) * 1.4),
                             side, gap + gz * 4.6 + (hv2 - 0.5) * 2.0);
            if (onTrack(a.c[0], a.c[2], 12)) continue;
            const b = [a.r, a.u, a.t];
            const ht = 11 + hv * 7;
            out._mat = MAT.WOOD;
            // The culm itself: very thin, very tall, faintly leaning.
            addCyl(out, a.c, 0.10 + hv2 * 0.05, ht,
                   hv < 0.5 ? CULM : CULM_D, 4, b);
            out._mat = MAT.FOLIAGE;
            // Foliage only in the top third — that is the whole silhouette.
            addCone(out, vadd(a.c, a.u, ht * 0.66), 0.85 + hv2 * 0.7, ht * 0.34,
                    hv2 < 0.5 ? LEAF : LEAF_L, 5, b);
            addCone(out, vadd(a.c, a.u, ht * 0.84), 0.6 + hv * 0.45, ht * 0.2,
                    LEAF_L, 5, b);
            out._mat = 0;
          }
        }
      }

      {
        const a = anchor(K(0.648), -1, 96);
        if (!onTrack(a.c[0], a.c[2], 24)) {
          const b = [a.r, a.u, a.t];
          const VERM  = [0.74, 0.18, 0.12];
          const TIMB  = [0.40, 0.28, 0.19];
          const ROOF  = [0.28, 0.30, 0.28];
          const WALL  = [0.80, 0.78, 0.72];
          modelGroup("suzuka-shrine", {
            center: vadd(a.c, a.u, 4.5), size: [22, 12, 14], basis: b,
          }, (stage) => {
            stage._mat = MAT.WOOD;
            for (const t of [-2.9, 2.9]) {
              addCyl(stage, vadd(a.c, a.t, t), 0.30, 5.2, VERM, 6, b);
            }
            addBox(stage, vadd(a.c, a.u, 5.35), [0.42, 0.40, 8.0], VERM, b);
            addBox(stage, vadd(a.c, a.u, 5.72), [0.56, 0.26, 8.9], [0.60, 0.14, 0.10], b);
            addBox(stage, vadd(a.c, a.u, 4.15), [0.34, 0.32, 6.6], VERM, b);
            // Stone steps climbing away from the torii to the honden.
            stage._mat = MAT.STONE;
            for (let i = 0; i < 6; i++) {
              addBox(stage, vadd(vadd(a.c, a.r, 2.2 + i * 1.5), a.u, 0.22 + i * 0.42),
                     [1.5, 0.44, 4.2], [0.72, 0.71, 0.66], b);
            }
            // A pair of stone lanterns flanking the approach.
            for (const t of [-3.4, 3.4]) {
              const lc = vadd(vadd(a.c, a.t, t), a.r, 1.4);
              addCyl(stage, lc, 0.24, 1.1, [0.70, 0.69, 0.64], 6, b);
              addBox(stage, vadd(lc, a.u, 1.5), [0.62, 0.62, 0.62], [0.76, 0.75, 0.70], b);
              addPyramid(stage, vadd(lc, a.u, 2.1), [1.0, 0.5, 1.0], [0.66, 0.65, 0.60], b);
            }
            stage._mat = MAT.WOOD;
            const hc = vadd(vadd(a.c, a.r, 12.5), a.u, 2.6);
            addBox(stage, hc, [6.0, 3.4, 8.0], WALL, b);
            for (const t of [-3.2, 3.2]) {
              addCyl(stage, vadd(vadd(hc, a.t, t), a.u, -1.7), 0.22, 3.4, TIMB, 5, b);
            }
            stage._mat = 0;
            // addPrism is BASE-anchored (js/track/geom.js addPrism note);
            // the wall box (hc, height 3.4) tops out at hc+1.7, so the old
            // hc+2.7 base left the roof 1.0 m clear of the wall it should
            // cap (measured via float-audit). Based at hc+1.5 — a 0.2 m
            // overlap into the wall/fascia, matching the fascia board
            // immediately below.
            addPrism(stage, vadd(hc, a.u, 1.5), [8.6, 2.6, 10.4], ROOF, b);
            addBox(stage, vadd(hc, a.u, 1.5), [8.8, 0.34, 10.6], TIMB, b);
          });
        }
      }
    },
  }
  );
})();
