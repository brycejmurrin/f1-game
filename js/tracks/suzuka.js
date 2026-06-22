/* Apex 26 — SUZUKA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 7,
    pal: { zenith: [0.35, 0.50, 0.70], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.90, 0.65], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    // Rolling esses climb then the drop toward the Degners (~40 m of relief over
    // the lap). Kept clear of the figure-8 crossover at s≈0.81 (that's a bridge).
    elevations: [{ s: 0.20, halfM: 300, rise: 7 }, { s: 0.45, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.811, halfM: 150, rise: 7 }],
    scenery: function (api) {
      const { out, track, n, px, py, pz, hw, pyMin, place, prop, every, ferrisWheel,
              hash, mountain, pine, tree, bush, grandstand, building, tower, billboard,
              gantry, marshalPost, fence, guardrail, tyreWall, hedge, anchor, vadd,
              addBox, addCyl, addCone, groundYAt, onTrack } = api;

      // ── Suzuka palette ──────────────────────────────────────────────────────
      const blue      = [0.26, 0.38, 0.64];
      const navy      = [0.18, 0.26, 0.46];
      const crowdMix  = [0.78, 0.45, 0.40];   // warm packed-crowd colour
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

      // ── Grandstand helper: raked crowd + back shell + Honda-blue front band ─
      const stand = (s, side, gap, len, shell) => {
        grandstand(s, side, gap, len, shell || steel, crowdMix);
        const k = Math.round(s * n) % n;
        prop(k, side, gap, [3, 4.5, len - 4], blue);   // blue front fan band
      };

      // ── Forested Mie-prefecture hills: three depth-haze rings of wooded summits
      //    encircling the circuit. Near rings overlap so the horizon reads as one
      //    continuous green wall with no gaps. No snow (Suzuka is wooded). ──────
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

      // ── Motopia theme park + giant Ferris wheel ──────────────────────────────
      // The wheel is Suzuka's signature landmark. It sits on the outside of the
      // main straight near Turn 1 (s≈0.075). We use the engine's built-in
      // ferrisWheel() which places the hub, legs, and cabin ring correctly.
      // Support accent towers flank the wheel at DIFFERENT distances so they
      // don't overlap the wheel footprint (wheel dist=58, radius=35 ⟹ edge ≈93 m;
      // flanking towers at dist=100 and dist=105 are safely clear).
      const wheelK = Math.round(n * 0.075) % n;
      ferrisWheel(wheelK, -1, 58, 35);     // 35 m radius — iconic tall silhouette

      // Flanking ride towers: at distinct k-positions AND safe lateral distance
      tower(Math.round(n * 0.062) % n, -1, 98, 8, 44, { col: [0.78, 0.80, 0.84], seg: 8, cap: true, capCol: neonRed, mast: 6 });
      tower(Math.round(n * 0.090) % n, -1, 102, 7, 40, { col: [0.80, 0.82, 0.86], seg: 7, cap: true, capCol: neonBlue, mast: 5 });

      // ── Lamp posts ringing the wheel area — warm sodium emissive heads ────────
      // Posts placed at distinct k-nodes around the park base; dist staggered so
      // they don't pile on the same world position.
      for (let i = 0; i < 8; i++) {
        const lk = (wheelK + i - 4 + n) % n;
        const ldist = 30 + (i % 4) * 7;   // 30–51 m — well clear of wheel at 58
        if (onTrack(px[lk] + track.rx[lk] * (-1) * (hw[lk] + ldist),
                    pz[lk] + track.rz[lk] * (-1) * (hw[lk] + ldist), 3)) continue;
        const lp = anchor(lk, -1, ldist), lb = [lp.r, lp.u, lp.t];
        addCyl(out, lp.c, 0.14, 9, steel, 5, lb);                          // pole
        addBox(out, vadd(lp.c, lp.u, 9.4), [1.6, 0.5, 1.0], lampWarm, lb); // lamp head
      }

      // ── Amusement-park complex behind the wheel ───────────────────────────────
      // Structures are grouped at distinct distances (60–140 m) so nothing
      // overlaps. The wheel occupies dist 23–93 (dist 58, radius 35), so the
      // nearest park structure begins at dist 96+ — given as dist 70 but at a
      // different k-node so world positions don't collide.
      const parkA = Math.round(n * 0.055) % n;

      // Motopia Hotel block — 5-storey, at a k well clear of the wheel k
      building(parkA, -1, 72, 32, 38, 24, { wall: [0.74, 0.74, 0.78], window: litWin, floor: 5, setback: true, roof: true });
      // Secondary hotel/pavilion
      building(Math.round(n * 0.038) % n, -1, 88, 26, 28, 18, { wall: [0.76, 0.76, 0.80], window: litWin, floor: 4, roof: true });

      // Drop-tower thrill ride (tall slim) — at yet another k, clear of hotel
      tower(Math.round(n * 0.105) % n, -1, 76, 7, 52, { col: [0.84, 0.28, 0.30], seg: 7, cap: true, capCol: neonYel, mast: 7 });

      // Domed pavilion / central gathering structure
      {
        const pk = Math.round(n * 0.048) % n;
        const p = anchor(pk, -1, 118), b = [p.r, p.u, p.t];
        // Only emit if not on track
        addCyl(out, p.c, 12, 12, [0.92, 0.92, 0.95], 12, b);
        addCone(out, vadd(p.c, p.u, 12), 13, 11, [0.88, 0.36, 0.38], 14, b);
        // Lit dome ring (emissive strip around base of dome)
        addCyl(out, vadd(p.c, p.u, 11), 12.8, 0.8, neonRed, 14, b);
      }

      // Carousel / pavilion canopies: spread at increasing dist so bodies don't
      // overlap. Step by 3 nodes AND increase dist per item.
      for (let i = 0; i < 8; i++) {
        const kk = (parkA + i * 4 + 2) % n;
        const dist = 50 + i * 9;           // 50 → 113 m, each item clearly separate
        const sz = [11 + (i % 3) * 2.5, 7 + (i % 2) * 2.5, 13 + (i % 4) * 1.5];
        place(kk, -1, dist, sz, parkCol[i % parkCol.length]);
        // Peaked tent roof on top — vadd by half-height of body + roof height
        const p = anchor(kk, -1, dist), b = [p.r, p.u, p.t];
        const roofY = sz[1] + 2;          // top of body box + small gap
        addCone(out, vadd(p.c, p.u, roofY), 7.5, 5, parkCol[(i + 2) % parkCol.length], 8, b);
        // Emissive neon trim ring at roofline
        addCyl(out, vadd(p.c, p.u, roofY - 0.5), sz[0] / 2 + 0.4, 0.6,
               [parkCol[(i + 1) % parkCol.length][0], parkCol[(i + 1) % parkCol.length][1], parkCol[(i + 1) % parkCol.length][2]], 8, b);
      }

      // Flag-poles / ride masts along park perimeter: stagger dist to avoid overlap
      for (let i = 0; i < 10; i++) {
        const kk = (parkA + i * 2 + 1) % n;
        const fdist = 34 + (i % 5) * 5;
        const p = anchor(kk, -1, fdist), b = [p.r, p.u, p.t];
        addCyl(out, p.c, 0.12, 10 + (i % 3) * 2.2, steel, 4, b);
        addBox(out, vadd(p.c, p.u, 9 + (i % 3)), [0.12, 1.6, 2.4], parkCol[i % parkCol.length], b);
      }

      // Small vendor kiosks
      for (let i = 0; i < 4; i++) {
        const kk = (parkA + i * 6 + 3) % n;
        const dist = 55 + i * 14;
        place(kk, -1, dist, [8, 4, 8], [0.88, 0.76, 0.54]);
      }

      // ── Lamp posts along the park perimeter ─────────────────────────────────
      for (let i = 0; i < 14; i++) {
        const lk2 = (parkA + i * 3) % n;
        const ldist2 = 28 + (i % 6) * 6;
        if (onTrack(px[lk2] + track.rx[lk2] * (-1) * (hw[lk2] + ldist2),
                    pz[lk2] + track.rz[lk2] * (-1) * (hw[lk2] + ldist2), 3)) continue;
        const lp2 = anchor(lk2, -1, ldist2), lb2 = [lp2.r, lp2.u, lp2.t];
        addCyl(out, lp2.c, 0.12, 8, steel, 5, lb2);
        addBox(out, vadd(lp2.c, lp2.u, 8.4), [1.4, 0.4, 0.9], lampWarm, lb2);
      }

      // ── Pit & paddock complex (right side of main straight) ───────────────────
      building(Math.round(n * 0.985) % n, 1, 9, 14, 9, 60, { wall: concrete, window: litWin, floor: 3, roof: false });
      building(Math.round(n * 0.990) % n, 1, 30, 22, 16, 28, { wall: [0.80, 0.80, 0.84], window: litWin, floor: 4, setback: true, roof: true });
      guardrail(0.965, 0.04, 1, 2.5, [0.88, 0.88, 0.90]);
      tower(Math.round(n * 0.995) % n, 1, 22, 9, 30, { col: [0.86, 0.87, 0.90], seg: 6, cap: true, capCol: navy, mast: 7 });
      gantry(0.0, 9, [0.14, 0.14, 0.18]);

      // Pit-straight lamp posts (right side) — warm illumination
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

      // ── Spectator footbridges ─────────────────────────────────────────────────
      // The green-clad pedestrian overpasses use anchor() for proper ground-
      // anchoring and vadd() for height offsets. Deck height is measured from the
      // GROUND at the anchor point, so we raise the deck well above track level
      // to avoid clipping. Columns span from ground to deckH.
      const footbridge = (s, deckH) => {
        const k = Math.round(s * n) % n;
        const aL = anchor(k, -1, 2), aR = anchor(k, 1, 2);
        const u = aL.u;
        const span = hw[k] * 2 + 14;
        // Support pylons: bottom at ground, height = deckH
        for (const a of [aL, aR]) {
          const b = [a.r, u, a.t];
          addBox(out, vadd(a.c, u, deckH / 2), [2.2, deckH, 2.6], concrete, b);
          addBox(out, vadd(a.c, u, deckH + 0.8), [3.4, 1.2, 3.4], steel, b);   // pylon cap
        }
        // Deck spanning the track — centre of deck at deckH above anchor ground
        const deckC = [px[k], py[k] + deckH, pz[k]];
        addBox(out, deckC, [span, 1.4, 4.5], [0.30, 0.50, 0.34], [aL.r, u, aL.t]);
        // Green roof canopy 2.6m above deck
        addBox(out, [px[k], py[k] + deckH + 2.6, pz[k]], [span, 0.6, 5.2], [0.24, 0.44, 0.30], [aL.r, u, aL.t]);
        // Emissive warm strip under the canopy (reads as lit walkway at night)
        addBox(out, [px[k], py[k] + deckH + 2.0, pz[k]], [span * 0.7, 0.18, 4.0], lampWarm, [aL.r, u, aL.t]);
        // Railing posts along the deck
        for (let i = -4; i <= 4; i++) {
          const off = i * (span / 9);
          const rc = [px[k] + aL.r[0] * off, py[k] + deckH + 1.5, pz[k] + aL.r[2] * off];
          addCyl(out, rc, 0.10, 1.6, steel, 4, [aL.r, u, aL.t]);
        }
      };
      footbridge(0.135, 9.0);    // spectator overpass near the Esses entry
      footbridge(0.500, 8.5);    // mid-circuit crossing

      // ── Overhead camera / scoring gantries ───────────────────────────────────
      gantry(0.30, 8, steel);    // Degner approach
      gantry(0.86, 8, steel);    // 130R / crossover area

      // ── Continuous treeline hedges behind outer grass edges ──────────────────
      hedge(0.16, 0.30,  1, 26, 5, [0.16, 0.34, 0.18]);
      hedge(0.55, 0.70, -1, 26, 5, [0.17, 0.35, 0.19]);
      hedge(0.40, 0.48,  1, 24, 4.5, [0.16, 0.33, 0.18]);

      // ── Dense conifer + cherry-blossom scatter on both grass verges ──────────
      every(16, (k) => {
        const s = hash(k * 41);
        if (s < 0.12) return;
        pine(k, -1, 6.8 + s * 10, 10 + s * 8, [0.13 + s * 0.07, 0.35, 0.16]);
        pine(k,  1, 6.8 + s * 10, 10 + s * 8, [0.12 + s * 0.08, 0.34, 0.15]);
        if (s > 0.38) {
          const b = hash(k * 71);
          pine(k, b < 0.5 ? -1 :  1, 18 + b * 18, 13 + b * 11, [0.11 + b * 0.06, 0.33, 0.15]);
          pine(k, b < 0.5 ?  1 : -1, 28 + b * 18, 15 + b * 11, [0.10 + b * 0.06, 0.32, 0.14]);
        }
        if (s > 0.65) {
          bush(k, s < 0.8 ? -1 : 1, 5 + s * 4.5, [0.21, 0.41, 0.21]);
          bush(k, s > 0.8 ? -1 : 1, 8 + s * 3,   [0.19, 0.39, 0.19]);
        }
      });
      every(28, (k) => {
        const s = hash(k * 53);
        if (s < 0.28) return;
        tree(k, s < 0.7 ? -1 : 1, 11 + s * 9, 7 + s * 5, [0.94, 0.65, 0.73]);  // sakura pink
        if (s > 0.55) tree(k, s < 0.7 ? 1 : -1, 15 + s * 7, 6 + s * 4, [0.96, 0.73, 0.82]);
      });
      every(42, (k) => {
        const s = hash(k * 79);
        if (s < 0.4) return;
        tree(k, -1, 9 + s * 6, 5.5 + s * 3, [0.95, 0.68, 0.76]);
      });

      // ── Track furniture: catch fences, guardrails, tyre walls, marshal posts ─
      fence(0.10, 0.24,  1, 6, 4, [0.70, 0.72, 0.76]);   // Esses outer
      fence(0.10, 0.24, -1, 6, 4, [0.70, 0.72, 0.76]);   // Esses inner
      fence(0.80, 0.90,  1, 6, 4, [0.70, 0.72, 0.76]);   // 130R outer
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
      // Trackside billboards
      for (const [s, sd] of [[0.20, 1], [0.46, 1], [0.63, -1], [0.88, 1]]) {
        billboard(Math.round(n * s) % n, sd, 7, 7, 3.5, parkCol[Math.round(s * 10) % parkCol.length]);
      }

      // ── Figure-8 bridge: the iconic crossover at s≈0.81 ──────────────────────
      // The elevated road crosses OVER the back section here (see bridges[] above
      // which raises the track itself +7 m). The scenery bridge is a green-clad
      // pedestrian/spectator structure alongside the road crossing, not the road
      // itself. We anchor to the terrain at the crossing point and build upward.
      {
        const bk = Math.round(n * 0.81) % n;
        // Anchor on the left (outer) side, 14 m clear of road edge
        const ab = anchor(bk, -1, 14);
        const basis = [ab.r, ab.u, ab.t];
        // Support columns: full height from ground to deck at +14 m.
        // vadd(ab.c, ab.u, h) gives a point h metres up from the anchor ground point.
        const colH = 14;
        addBox(out, vadd(ab.c, ab.u, colH / 2), [1.8, colH, 1.8], concrete, basis);
        // Second column offset along track tangent
        addBox(out, vadd(vadd(ab.c, ab.t, 16), ab.u, colH / 2), [1.8, colH, 1.8], concrete, basis);
        // Bridge deck at gy+colH (top of columns)
        addBox(out, vadd(ab.c, ab.u, colH + 0.7), [10, 1.2, 34], [0.25, 0.47, 0.29], basis);
        // Green overhead canopy 2.4 m above deck
        addBox(out, vadd(ab.c, ab.u, colH + 3.5), [11, 0.5, 35], [0.27, 0.49, 0.31], basis);
        // Emissive strip under canopy (lit walkway)
        addBox(out, vadd(ab.c, ab.u, colH + 2.8), [8, 0.15, 28], lampWarm, basis);
        // Railing posts along the deck
        for (let i = -4; i <= 4; i++) {
          const off = i * (34 / 9);
          const rc = [ab.c[0] + ab.t[0] * off, ab.c[1] + colH + 1.4, ab.c[2] + ab.t[2] * off];
          addCyl(out, rc, 0.10, 1.4, steel, 4, basis);
        }
      }

      // ── Underpass structure (back loop dips under Esses exit at s≈0.37) ───────
      // The track itself is at normal elevation here; the overpass road is ~7 m
      // above. We build visual cues for the tunnel mouth: a dark recessed box and
      // concrete columns supporting the overhead section. The box is placed LATERAL
      // (side=1) at a safe clearance so it doesn't clip the racing surface.
      {
        const uk = Math.round(n * 0.37) % n;
        const au = anchor(uk, 1, 12);
        const ubasis = [au.r, au.u, au.t];
        // Dark tunnel opening — box is 3.5 m tall from ground, 1 m gap at bottom
        addBox(out, vadd(au.c, au.u, 2.5), [12, 5, 28], [0.18, 0.18, 0.20], ubasis);
        // Concrete support columns (each spans from ground to 7 m to hold overpass)
        addBox(out, vadd(au.c, au.u, 3.5), [1.5, 7, 1.5], concrete, ubasis);
        addBox(out, vadd(vadd(au.c, au.u, 3.5), au.t, 13), [1.5, 7, 1.5], concrete, ubasis);
        // Top slab (underside of the elevated road)
        addBox(out, vadd(au.c, au.u, 7.2), [13, 0.7, 29], [0.20, 0.20, 0.22], ubasis);
        // Tunnel-mouth emissive glow strip (warm amber inside the portal)
        addBox(out, vadd(au.c, au.u, 1.5), [11, 0.2, 0.3], litWin, ubasis);
      }

      // ── Honda orange accent on main grandstand (start/finish left side) ───────
      {
        const hk = Math.round(n * 0.00) % n;
        const ah = anchor(hk, -1, 11);
        const bh = [ah.r, ah.u, ah.t];
        addBox(out, vadd(ah.c, ah.u, 16),   [3.2, 2.4, 75], [0.98, 0.52, 0.08], bh);  // Honda orange
        addBox(out, vadd(ah.c, ah.u, 18.8), [3.0, 1.2, 75], [0.92, 0.92, 0.94], bh);  // white accent
      }

      // ── Scenic towers on mid-lap hills (Spoon / back sector) ─────────────────
      // Placed at a large dist (160+) well off the racing surface on the hillside.
      tower(Math.round(n * 0.50) % n, 1, 160, 6, 19, { col: [0.78, 0.80, 0.84], seg: 6, cap: true, capCol: neonRed, mast: 3 });
      tower(Math.round(n * 0.62) % n, -1, 170, 6, 20, { col: [0.80, 0.82, 0.86], seg: 6, cap: true, capCol: neonBlue, mast: 4 });

      // ── Lamp posts along the main straight and key corners ───────────────────
      // Evenly spaced every 35 m around the full lap on alternating sides, giving
      // a warm glowing ring of street lights visible from any camera angle.
      every(35, (k) => {
        const side = hash(k * 13) < 0.5 ? -1 : 1;
        const ldist = 10 + hash(k * 37) * 4;
        if (onTrack(px[k] + track.rx[k] * side * (hw[k] + ldist),
                    pz[k] + track.rz[k] * side * (hw[k] + ldist), 2)) return;
        const lp4 = anchor(k, side, ldist), lb4 = [lp4.r, lp4.u, lp4.t];
        addCyl(out, lp4.c, 0.13, 9, steel, 5, lb4);
        addBox(out, vadd(lp4.c, lp4.u, 9.4), [1.6, 0.4, 1.0], lampWarm, lb4);
      });

      // ── Cherry-blossom / sakura tree scatter (Turns 1–8 and Degner) ──────────
      {
        const blossomFracs = [0.048, 0.062, 0.078, 0.098, 0.115, 0.145, 0.035, 0.120];
        const blossomSides = [-1, 1, -1, 1, -1, 1, 1, -1];
        const blossomDists = [20, 24, 16, 28, 22, 18, 19, 25];
        for (let i = 0; i < blossomFracs.length; i++) {
          const bk = Math.round(n * blossomFracs[i]) % n;
          const bh = 6.5 + hash(bk * 37) * 5;
          tree(bk, blossomSides[i], blossomDists[i], bh, [0.92, 0.68, 0.78]);
        }
      }

      // ── Grandstands at all signature corners ─────────────────────────────────
      stand(0.00, -1, 9, 82, navy);  // Main grandstand — dark-blue front terraces
      stand(0.15,  1, 9, 42);        // Esses
      stand(0.28, -1, 9, 28);        // Degner entry
      stand(0.45,  1, 9, 38);        // Hairpin
      stand(0.62, -1, 9, 38);        // Spoon
      stand(0.75,  1, 8, 26);        // 200R approach
      stand(0.84,  1, 8, 34);        // 130R
      stand(0.94,  1, 9, 35);        // Casio Triangle right
      stand(0.94, -1, 9, 35);        // Casio Triangle left
      stand(0.50,  1, 8, 24);        // Mid-circuit flex stand
    },
  }
  );
})();
