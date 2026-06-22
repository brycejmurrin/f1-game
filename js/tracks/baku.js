/* Apex 26 — BAKU circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    segs: [
      { t: 0, l: 200 }, { t: 90, l: 80 }, { t: -80, l: 70 }, { t: 0, l: 800 }, { t: 90, l: 80 }, { t: 0, l: 400 },
      { t: -70, l: 70 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 600 }, { t: -80, l: 80 },
    ],
    // Baku's castle section: the old-city hairpin climbs steeply through the
    // medieval walls (~14 m), then the circuit descends back to the corniche level.
    elevations: [{ s: 0.35, halfM: 560, rise: 14 }, { s: 0.58, halfM: 320, rise: -10 }],
    scenery: function (api) {
      const {
        out, n, place, prop, backdrop, groundPlane, building, tower, wall,
        fence, guardrail, tyreWall, grandstand, gantry, marshalPost, billboard,
        palm, anchor, along, every, onTrack, addBox, addCyl, addCone, addPrism,
        addFrustum, vadd, hash,
      } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Dusk street palette ----
      const SAND = [0.62, 0.50, 0.34];        // Old-City sandstone
      const SAND_LIT = [0.85, 0.62, 0.30];    // uplit sandstone
      const GLASS = [0.20, 0.28, 0.40];       // cool modern glass
      const WIN_WARM = [0.95, 0.88, 0.55];    // warm lit windows
      const WIN_COOL = [0.6, 0.7, 0.95];      // cool lit windows
      const FLAME = [0.95, 0.35, 0.10];       // Flame Towers glow
      const DARK = [0.08, 0.09, 0.13];        // silhouette
      const DARK2 = [0.11, 0.12, 0.18];       // nearer hazed silhouette
      const CONCRETE = [0.30, 0.30, 0.34];
      const ARMCO = [0.74, 0.76, 0.82];       // steel guardrail
      const FENCE = [0.55, 0.58, 0.66];       // catch-fence mesh
      const SEA = [0.04, 0.06, 0.12];         // dark Caspian water
      const TARMAC_AD = [0.85, 0.20, 0.18];   // red ad accent
      const AZ_BLUE = [0.10, 0.45, 0.78];     // Azerbaijan flag blue

      // ===================================================================
      // Continuous low concrete walls + dark rail lining the whole lap
      // (street circuit, zero runoff). Both sides, kept tight to the edge.
      // ===================================================================
      // Walls line nearly the whole lap; left side skips the Caspian straight
      // (0.62→0.97) where the brief wants an open dark sea void, and the right
      // opens briefly (0.65→0.78) behind the Caspian-front tower cluster.
      wall(0.0, 0.65, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.82, 1.0, 1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.0, 0.62, -1, 2.0, 1.3, CONCRETE, 0.4);
      wall(0.97, 1.0, -1, 2.0, 1.3, CONCRETE, 0.4);

      // Debris catch-fence behind the concrete walls — the see-through wire mesh
      // that lines real street circuits. Set just beyond the wall clearance so it
      // never reaches the tarmac. Covers the city opening sector, both sides.
      fence(0.0, 0.35, 1, 2.6, 3.4, FENCE);
      fence(0.86, 1.0, 1, 2.6, 3.4, FENCE);
      fence(0.0, 0.32, -1, 2.6, 3.4, FENCE);
      // Armco guardrail on the Caspian straight (right side, behind the wall break).
      guardrail(0.63, 0.96, 1, 3.0, ARMCO);
      // Catch-fence along the Caspian straight, right side (behind the guardrail).
      fence(0.63, 0.95, 1, 4.0, 3.0, FENCE);

      // Floodlight poles / light towers for the night mood, denser around the lap.
      for (let i = 0; i < 22; i++) {
        const k = K(i / 22), side = (i % 2) ? 1 : -1, a = anchor(k, side, 5);
        addCyl(out, a.c, 0.25, 13, [0.22, 0.22, 0.25], 5, [a.r, a.u, a.t]);
        // angled lamp head + warm emissive bulb
        addBox(out, vadd(a.c, a.u, 13), [2.0, 0.5, 0.7], [0.30, 0.30, 0.34], [a.r, a.u, a.t]);
        addBox(out, vadd(vadd(a.c, a.u, 12.7), a.r, side * 0.8), [0.7, 0.4, 0.7], [1.0, 0.95, 0.7], [a.r, a.u, a.t]);
      }

      // Marshal posts spaced around the lap — orange-roofed flag points.
      for (let i = 0; i < 9; i++) marshalPost(K(0.05 + i * 0.105), (i % 2) ? 1 : -1, 3.0);

      // Distant dusk-haze silhouette band so the horizon never reads empty — TWO
      // ranks (near hazed + far dark) forming a near-continuous wrap of city
      // silhouette around the whole lap. onTrack guards against the infield.
      for (let i = 0; i < 24; i++) {
        const k = K(i / 24), side = (i % 2) ? 1 : -1;
        backdrop(k, side, 150 + hash(i * 5) * 90, [26 + hash(i * 7) * 22, 28 + hash(i * 11) * 50, 20], DARK2);
        backdrop(k, side, 280 + hash(i * 13) * 170, [32 + hash(i * 17) * 30, 44 + hash(i * 19) * 90, 24], DARK);
      }

      // ===================================================================
      // s 0.00 R near — GOVERNMENT HOUSE: wide ornate twin-tower sandstone
      // box, pit/start backdrop.
      // ===================================================================
      {
        const k = K(0.0);
        place(k, 1, 42, [64, 30, 30], SAND);
        place(k, 1, 43, [66, 6, 32], SAND_LIT);                 // warm uplit base band
        for (const o of [-22, 22]) {                            // twin corner towers
          const a = anchor(k, 1, 24);
          const c = vadd(a.c, a.t, o);
          addBox(out, vadd(c, a.u, 28), [12, 26, 12], SAND, [a.r, a.u, a.t]);
          addBox(out, vadd(c, a.u, 41), [9, 8, 9], SAND_LIT, [a.r, a.u, a.t]);
        }
        building(k, 1, 4, 40, 18, 24, { wall: SAND, window: WIN_WARM, floor: 4.5 });
      }

      // ===================================================================
      // START/FINISH straight — pit complex (R, low), main grandstands +
      // crowd (L), and the start gantry spanning the track.
      // ===================================================================
      // Long low pit garage block on the right, ahead of Government House.
      for (let i = 0; i < 5; i++)
        building(K(0.95 + i * 0.012), 1, 5, 16, 9, 14, { wall: [0.20, 0.21, 0.26], window: WIN_COOL, floor: 3 });
      // Pit wall (low) + pit-lane separator on the right edge of the straight.
      wall(0.94, 0.02, 1, 1.0, 1.0, [0.85, 0.85, 0.88], 0.4);
      // Twin grandstands with crowd on the left of the main straight.
      grandstand(0.985, -1, 4, 70, [0.42, 0.36, 0.40], [0.50, 0.30, 0.34]);
      grandstand(0.05, -1, 4, 60, [0.42, 0.36, 0.40], [0.46, 0.30, 0.36]);
      // Start gantry across the line + a scoring gantry a little later.
      gantry(0.0, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.96, 7.0, [0.14, 0.14, 0.18]);
      // Start-line banner billboards.
      billboard(0.01, 1, 9, 14, 5, FLAME);

      // s 0.04 L mid — plaza framed by low civic blocks + a small fountain plaza
      for (let i = 0; i < 3; i++)
        building(K(0.04), -1, 15 + i * 22, 26, 16 + i * 4, 22, { wall: [0.34, 0.33, 0.32], window: WIN_WARM });
      // plaza monument: slim lit obelisk
      {
        const a = anchor(K(0.045), -1, 12);
        addFrustum(out, vadd(a.c, a.u, 0), 1.4, 0.3, 16, SAND_LIT, 4, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.12 both near — first 90 squeeze: tall flat grey wall boxes
      // ===================================================================
      for (const side of [-1, 1]) {
        place(K(0.12), side, 6, [6, 22, 40], [0.26, 0.26, 0.30]);
        place(K(0.12), side, 6, [6.2, 5, 40], SAND_LIT);
      }

      // ===================================================================
      // s 0.22 R far — FLAME TOWERS: three tall tapered towers on a raised
      // tier far back, warm-lit window bands + animated flame glow (the icon).
      // ===================================================================
      {
        const k = K(0.22);
        const a = anchor(k, 1, 170);
        const heights = [210, 235, 210];   // ~40% taller than original 150/168/150
        for (let t = 0; t < 3; t++) {
          const c = vadd(a.c, a.r, (t - 1) * 42);
          const H = heights[t];
          // tapered tower body
          addFrustum(out, c, 17, 4, H, GLASS, 6, [a.r, a.u, a.t]);
          // warm-lit window bands climbing the flame
          for (let b = 0; b < 6; b++) {
            const fr = b / 6;
            const r = 17 * (1 - fr) + 4 * fr;
            addFrustum(out, vadd(c, a.u, fr * H), r * 1.02, r * 0.78, H * 0.06, b % 2 ? FLAME : WIN_WARM, 6, [a.r, a.u, a.t]);
          }
          // bright flame cap
          addFrustum(out, vadd(c, a.u, H), 4, 0.6, 14, FLAME, 6, [a.r, a.u, a.t]);
          // flame-shaped glow panel at the top — wider than the tower body
          addBox(out, vadd(c, a.u, H + 2), [28, 12, 8], [1.0, 0.55, 0.10], [a.r, a.u, a.t]);
        }
      }

      // ===================================================================
      // s 0.30 L mid — mixed modern mid-rise: stacked glass boxes, lit grids
      // ===================================================================
      for (let i = 0; i < 4; i++)
        building(K(0.30), -1, 29 + i * 26, 22, 44 + (i % 2) * 22, 22, { wall: GLASS, window: WIN_COOL, floor: 4 });

      // ===================================================================
      // s 0.36 R near — OLD CITY wall: one CONTINUOUS crenellated sandstone
      // rampart wrapping the whole castle/Maiden-Tower stretch (no gaps),
      // uplit, with a dense packed old-town sprawl rising behind it.
      // ===================================================================
      wall(0.36, 0.56, 1, 10, 9, SAND, 1.2);                                  // unbroken Old City rampart
      for (let p = 0; p < 8; p++) {                                           // enhanced crenellated cap + uplit footing
        const k = K(0.36 + p * 0.025);
        const a = anchor(k, 1, 10);
        // uplit footing band at base
        addBox(out, vadd(a.c, a.u, 1.2), [3.5, 2.2, 38], SAND_LIT, [a.r, a.u, a.t]);
        // dense crenellations (merlon/embrasure pattern) — alternating raised/gap
        for (let j = 0; j < 14; j++) {
          if (j % 2 === 0) {  // merlons (raised sections)
            addBox(out, vadd(vadd(a.c, a.t, (j - 6.5) * 4.2), a.u, 9.8), [2.8, 1.6, 2.4], SAND, [a.r, a.u, a.t]);
          } else {            // embrasures (gaps) — no geometry, space between
            // leave gap for castle-like appearance
          }
        }
      }
      // Dense sandstone old-town behind the rampart: packed flat-roof houses
      // climbing the hill so the Old City reads as a solid mass, not a fence.
      // Enhanced density and layering for stronger medieval character.
      for (let i = 0; i < 18; i++) {
        const k = K(0.36 + (i % 7) * 0.027);
        const tier = 12 + (i % 4) * 13 + Math.floor(i / 7) * 18;
        const h = 7 + hash(i * 7) * 14;
        const w = 10 + hash(i * 5) * 8;
        const d = 10 + hash(i * 11) * 6;
        building(k, 1, tier - w / 2, w, h, d, { wall: i % 3 ? SAND : SAND_LIT, window: WIN_WARM, floor: 3.5 });
      }
      // Additional foreground tower accents in old town
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.42 + i * 0.032), 1, 28 + hash(i * 13) * 14);
        addCyl(out, vadd(a.c, a.u, 8), 1.8, 14, SAND, 8, [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 22), [4, 2.2, 4], SAND_LIT, [a.r, a.u, a.t]);
      }
      // small domes / minaret silhouettes rising over the old town for texture.
      for (let i = 0; i < 4; i++) {
        const a = anchor(K(0.4 + i * 0.035), 1, 40 + hash(i * 9) * 20);
        addCyl(out, a.c, 1.0, 14 + hash(i) * 8, SAND, 6, [a.r, a.u, a.t]);          // minaret shaft
        addFrustum(out, vadd(a.c, a.u, 14 + hash(i) * 8), 1.6, 0.4, 3, SAND_LIT, 6, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.42 L+R very near — CASTLE SECTION squeeze (~7.6m): tall close
      // walls both sides, claustrophobic climb with crenellated towers.
      // ===================================================================
      wall(0.42, 0.50, -1, 1.5, 11, SAND, 1.4);
      wall(0.42, 0.50, 1, 1.5, 11, SAND, 1.4);
      for (const side of [-1, 1]) {
        // uplit base band for castle walls
        const a = anchor(K(0.44), side, 1.5);
        addBox(out, vadd(a.c, a.u, 1.0), [2.2, 1.6, 20], SAND_LIT, [a.r, a.u, a.t]);
        // crenellated crown detail (merlon notches)
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.6), a.u, 11.2), [1.8, 1.2, 2.2], SAND, [a.r, a.u, a.t]);
          }
        }
      }
      // Gateway towers flanking the narrowest point
      {
        const a_l = anchor(K(0.46), -1, 1.5);
        const a_r = anchor(K(0.46), 1, 1.5);
        // corner towers
        addCyl(out, vadd(a_l.c, a_l.u, 10), 1.2, 12, SAND, 8, [a_l.r, a_l.u, a_l.t]);
        addCyl(out, vadd(a_r.c, a_r.u, 10), 1.2, 12, SAND, 8, [a_r.r, a_r.u, a_r.t]);
      }

      // ===================================================================
      // s 0.46 R near — crest past castle gate: chunky stone bastion box
      // ===================================================================
      {
        const k = K(0.46);
        place(k, 1, 20, [18, 16, 18], SAND);
        place(k, 1, 21, [19, 4, 19], SAND_LIT);
        const a = anchor(k, 1, 6);
        for (let j = 0; j < 4; j++)
          addBox(out, vadd(vadd(a.c, a.t, (j - 1.5) * 4.5), a.u, 16.6), [3, 1.6, 3], SAND, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.52 L near — MAIDEN TOWER: stout round stepped sandstone tower
      // Enhanced with conical top and stronger visual presence
      // ===================================================================
      {
        const k = K(0.52);
        const a = anchor(k, -1, 8);
        // Wider stepped base (octagonal presence)
        addCyl(out, vadd(a.c, a.u, 3), 10, 7, SAND, 10, [a.r, a.u, a.t]);
        // Main cylindrical drum (the tower body)
        addCyl(out, vadd(a.c, a.u, 13), 8.5, 30, SAND, 12, [a.r, a.u, a.t]);
        // Intermediate band (uplit mid-section)
        addFrustum(out, vadd(a.c, a.u, 22), 8.5, 8, 4, SAND_LIT, 12, [a.r, a.u, a.t]);
        // Tapered crown (conical top, iconic silhouette)
        addCone(out, vadd(a.c, a.u, 38), 7, 12, SAND_LIT, 12, [a.r, a.u, a.t]);
        // Decorative cap at spire tip
        addBox(out, vadd(a.c, a.u, 50), [2, 2.5, 2], [0.92, 0.82, 0.62], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.58 L far — seafront opens: boulevard promenade + palm row, low
      // landscaped green boxes (the Caspian seaside park).
      // Enhanced waterfront character with ornate balustrade and terraced gardens.
      // ===================================================================
      // Terraced seafront parks in multiple tiers
      for (let i = 0; i < 5; i++)
        place(K(0.58 + i * 0.015), -1, 20 + i * 12, [14, 3.5, 14], [0.12, 0.28, 0.16]);
      // palm-lined promenade down the seafront straight, left side.
      for (let i = 0; i < 18; i++)
        palm(K(0.6 + i * 0.022), -1, 8 + (i % 2) * 3, 10 + hash(i * 3) * 3, [0.16, 0.42, 0.22]);
      // ornate promenade balustrade wall between the road and the sea
      wall(0.6, 0.95, -1, 5, 1.2, [0.74, 0.70, 0.62], 0.5);
      // decorative balusters on the promenade wall
      for (let i = 0; i < 28; i++) {
        const s = 0.60 + i * 0.0125;
        const a = anchor(K(s), -1, 5.5);
        addCyl(out, vadd(a.c, a.u, 0.6), 0.18, 1.0, [0.78, 0.72, 0.60], 6, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.65–0.95 — CASPIAN-FRONT straight (~2.2 km): open dark sea left,
      // lit modern skyline right.
      // Enhanced water presence and waterfront character.
      // ===================================================================
      // Caspian Sea: broad water groundPlanes settled just below grade, left.
      groundPlane(K(0.65), -1, 16, [280, 2, 320], SEA);
      groundPlane(K(0.77), -1, 18, [300, 2, 340], SEA);
      groundPlane(K(0.88), -1, 16, [260, 2, 300], SEA);
      // A couple of distant boats / breakwater silhouettes far out on the water.
      for (let i = 0; i < 5; i++) {
        const a = anchor(K(0.66 + i * 0.065), -1, 100 + hash(i * 5) * 70);
        addBox(out, vadd(a.c, a.u, 2.5), [12 + hash(i) * 6, 4, 4], [0.08, 0.10, 0.16], [a.r, a.u, a.t]);
      }
      // Harbor/waterfront architecture: small waterfront pavilions/structures
      for (let i = 0; i < 3; i++) {
        const s = 0.68 + i * 0.08;
        building(K(s), -1, 22, 16, 8, 12, { wall: [0.28, 0.32, 0.40], window: WIN_COOL, floor: 2.5 });
      }
      // CONTINUOUS modern Caspian-front skyline: a packed unbroken band of lit
      // glass towers right, two rows (front mid-rise + taller back rank) so the
      // sea-side horizon reads as a solid wall of city from 0.63→0.97.
      for (let i = 0; i < 14; i++) {
        const s = 0.63 + i * 0.026;
        building(K(s), 1, 36 + hash(i * 3) * 18 - (18 + hash(i * 5) * 10) / 2, 18 + hash(i * 5) * 10, 50 + hash(i * 9) * 60, 18, { wall: GLASS, window: WIN_COOL, floor: 4 });
        if (i % 2 === 0)                                                       // taller back rank, every other slot
          building(K(s), 1, 80 + hash(i * 13) * 24 - (20 + hash(i * 17) * 12) / 2, 20 + hash(i * 17) * 12, 80 + hash(i * 19) * 70, 20, { wall: GLASS, window: WIN_WARM, floor: 5 });
      }

      // ===================================================================
      // s 0.78–0.86 R mid — cluster of glass Caspian-front towers, cool-blue lit
      // ===================================================================
      for (let i = 0; i < 7; i++) {
        const k = K(0.78 + i * 0.013);
        tower(k, 1, 56 + (i % 3) * 28, 16, 80 + (i % 2) * 50, { col: GLASS, seg: 6, cap: true, capCol: i % 2 ? WIN_COOL : WIN_WARM });
      }

      // billboards punctuating the long Caspian straight, right side.
      for (let i = 0; i < 4; i++)
        billboard(K(0.66 + i * 0.07), 1, 8, 12, 5, i % 2 ? FLAME : AZ_BLUE);

      // ===================================================================
      // s 0.97 both near — braking zone into T1: stacked tyre-wall barriers
      // with conveyor caps + striped barrier boxes.
      // ===================================================================
      tyreWall(0.955, 0.99, 1, 3.0, TARMAC_AD);
      tyreWall(0.955, 0.99, -1, 3.0, [0.9, 0.9, 0.92]);
      for (const side of [-1, 1]) {
        const a = anchor(K(0.97), side, 4);
        addBox(out, vadd(a.c, a.u, 1.0), [2, 0.3, 12], side > 0 ? TARMAC_AD : [0.9, 0.9, 0.92], [a.r, a.u, a.t]);
      }
      billboard(K(0.93), 1, 11, 18, 11, FLAME);
      billboard(K(0.99), -1, 8, 14, 8, WIN_COOL);

      // ================= OLD CITY WALL — denser medieval stone presence =================
      // Extra building() calls with medieval stone palette to thicken the Old City.
      {
        const STONE = [0.58, 0.52, 0.42];
        const oldCityData = [
          [0.41, 1, 28, 10, 10, 14],
          [0.44, 1, 32, 12, 14, 12],
          [0.48, 1, 24, 14,  8, 16],
          [0.51, 1, 36,  9, 18, 10],
        ];
        for (const [s, side, dist, w, h, d] of oldCityData) {
          building(K(s), side, dist, w, h, d, { wall: STONE, window: WIN_WARM, floor: 3 });
        }
      }

      // ================= PALACE OF THE SHIRVANSHAHS cluster (s≈0.50) =================
      // Low distinctive stone complex with crenellated parapet strips on top.
      // Enhanced with ornate towers and stronger architectural presence.
      {
        const PALACE = [0.72, 0.66, 0.54];
        const PALACE_DARK = [0.62, 0.56, 0.44];
        const k = K(0.50);
        // Main palace structure
        building(k, 1, 44, 22, 10, 28, { wall: PALACE, window: WIN_WARM, floor: 2 });
        // Enhanced crenellated parapet — denser merlon pattern
        const a = anchor(k, 1, 44), b = [a.r, a.u, a.t];
        for (let j = 0; j < 8; j++) {
          if (j % 2 === 0) {
            addBox(out, vadd(vadd(a.c, a.t, (j - 3.5) * 3.8), a.u, 10.8), [2.5, 1.8, 2.5], PALACE, b);
          }
        }
        // ornamental turrets at corners
        addCyl(out, vadd(vadd(a.c, a.t, -13), a.u, 9), 2.2, 8, PALACE_DARK, 8, b);
        addCyl(out, vadd(vadd(a.c, a.t, 13), a.u, 9), 2.2, 8, PALACE_DARK, 8, b);
        // flanking smaller wing building (east)
        building(K(0.505), 1, 36, 12, 7, 16, { wall: PALACE, window: WIN_WARM, floor: 2 });
        // ornamental archway detail on main façade
        addBox(out, vadd(a.c, a.u, 4), [20, 3, 1.5], [0.82, 0.76, 0.64], b);
      }

      // ================= CASPIAN SEA — additional groundPlane at harbour section =================
      // Supplement the existing sea planes with a more prominent water panel.
      groundPlane(K(0.68), -1, 18, [300, 2, 260], [0.12, 0.18, 0.28]);

      // ================= URBAN CANYON density — modern city sections =================
      // Taller buildings at s=0.0–0.20 and s=0.80–1.0 to tighten the street canyon.
      {
        const CITY_GLASS = [0.30, 0.40, 0.55];
        const cityHeights = [40, 55, 70, 60, 80, 45, 65];
        for (let i = 0; i < 7; i++) {
          const s = 0.02 + i * 0.025;
          building(K(s), -1, 28 + (i % 3) * 14, 14 + (i % 2) * 4, cityHeights[i], 16,
            { wall: GLASS, window: CITY_GLASS, floor: 4 });
        }
        for (let i = 0; i < 6; i++) {
          const s = 0.81 + i * 0.028;
          building(K(s), 1, 30 + (i % 3) * 12, 16 + (i % 2) * 6, 40 + (i % 3) * 20, 18,
            { wall: GLASS, window: CITY_GLASS, floor: 5 });
        }
      }

      // ================= SEAFRONT BILLBOARD (s≈0.15, Azeri colours) =================
      billboard(K(0.15), -1, 20, 14, 5, [0.85, 0.35, 0.10]);
    },
  }
  );
})();
