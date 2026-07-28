/* Apex 26 — SceneryNature: the nature/landscape band of the buildProps
   composite-model toolkit — the shared trackside anchor() plus vegetation
   (pine/tree/palm/conifer/bush/hedge/forestEdge), landforms (peak/mountain/
   ridge) and the spectator models (crowdBank/grandstand). Split out of
   js/track/tracks.js buildProps; created once per build via
   SceneryNature.create(ctx) with the shared scenery ctx (buffers, guarded
   emitters, grounding/guard core, math helpers). Helpers from OTHER scenery
   modules are reached only through ctx (hedge/forestEdge read ctx.along at
   call time — SceneryStructures is created after this module).
   Load order: before js/track/tracks.js (which calls create() at build). */
const SceneryNature = (function () {
  "use strict";

  function create(ctx) {
    const { out, track, n, hw, px, pz, NIGHT, MAT,
            clearTreeDist,
            addBox, addCyl, addCone, addFrustum, addPrism, addPyramid,
            addMountain, emit, RAW, rejBox, recordBarrier, groundYAt,
            terrainYAt, onTrack, hash, upOf, vadd } = ctx;
    const { CROWD_DAY } = TrackSceneryData;

    // Resolve a trackside anchor: ground position + the track basis [r,u,t] at
    // node k, `dist` beyond the road edge on `side`. Shared by the model helpers.
    const anchor = (kRaw, side, dist) => {
      // Normalise the node index. Callers derive k with arithmetic (k-1, k+1,
      // k+step) and an out-of-range index reads `undefined` from the typed
      // arrays, which turns the whole model into NaN. That is not a local
      // failure: validateGeometry() rejects the buffer, safe() substitutes an
      // empty one, and the circuit ships with NO PROPS AT ALL. Silverstone did
      // exactly that — 783 066 vertices discarded because one roadside tree
      // resolved to node -1.
      const k = ((kRaw % n) + n) % n;
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      const o = side * (hw[k] + dist);
      const cx = px[k] + r[0] * o, cz = pz[k] + r[2] * o;
      // Sit on the ACTUAL rendered terrain when available (exact — no float/sink
      // where the ribbon is carved or sags); fall back to the groundYAt estimate
      // for points the terrain mesh doesn't cover (far out / off the ribbon).
      // The returned point is sunk 0.3 m below the sample: it's a SINGLE-point
      // reading, so on any slope a flat-based model placed exactly at it floats
      // on the downhill side. Every anchored model (engine helpers AND raw
      // per-track props) inherits the embed; tops drop by the same 0.3, which
      // is visually negligible on multi-metre props.
      const ty = terrainYAt(cx, cz);
      return { c: [cx, (ty == null ? groundYAt(k, dist) : ty) - 0.3, cz], r, u, t };
    };
    // Conifer/pine: tapered trunk + stacked cones. col = needle green. Three
    // silhouette variants selected per-instance so a treeline doesn't read as
    // identical clones stretched to different sizes: FULL (dense 4-tier), LEAN
    // (windswept — each tier offset sideways, increasing with height), SPARSE
    // (thinner 3-tier, gappy — storm-thinned or younger tree).
    const pine = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) {
        console.warn(`[scenery] pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // per-instance size jitter so a treeline doesn't read as identical clones
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const c2 = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.82];   // shaded lower needles
      out._mat = MAT.WOOD;
      // Trunk starts 0.5 m BELOW the anchor: anchor() samples the terrain at one
      // point, so on a slope a flat-based trunk floats on the downhill side.
      addCyl(out, vadd(a.c, a.u, -0.5), 0.35 + h * 0.02, h * 0.4 + 0.5, [0.30, 0.22, 0.13], 6, b);
      const vr = hash(k * 6.1 + side * 4.4 + dist + 9.3);
      const sparse = vr > 0.82;                          // ~18% thinner 3-tier trees
      const lean = !sparse && vr > 0.55 ? (vr - 0.55) * 2.2 : 0;   // ~27% windswept lean
      const tiers = sparse ? 3 : 4;
      let y = h * 0.3;
      out._mat = MAT.FOLIAGE;
      for (let i = 0; i < tiers; i++) {
        const w = (sparse ? 2.3 : 2.7) * j * (1 - i * (sparse ? 0.24 : 0.21));
        let c = vadd(a.c, a.u, y);
        if (lean) c = vadd(c, a.r, lean * (y / h) * 1.6 * side);   // tilt away from the road
        addCone(out, c, w, h * 0.32, i === 0 ? c2 : col, 7, b);
        y += h * (sparse ? 0.24 : 0.18) * j;
      }
      out._mat = 0;
    };
    // Broadleaf tree: short trunk + a rounded canopy (squat wide cone + cap cone).
    // ~9% of instances are a bare DEAD/STORM tree (trunk + thin branch cylinders,
    // no canopy) — breaks up monoculture stands and reads as a real weathered
    // treeline rather than a cloned forest. Living trees get a per-instance
    // ASYMMETRIC lean on the upper canopy (~35%) so not every crown is a perfect
    // dome.
    const tree = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] tree SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const vr = hash(k * 8.3 + side * 5.1 + dist + 4.7);
      if (vr > 0.91) {   // dead/storm tree: bare trunk + a few angled branch stubs.
        // addCyl extends along basis[1] ("up"), so each branch needs its OWN
        // tilted up-vector (mostly vertical, blended with an outward lean) —
        // not the tree's vertical `a.u`, or the branches would draw straight up.
        const th = h * 0.7;
        out._mat = MAT.WOOD;
        addCyl(out, vadd(a.c, a.u, -0.5), 0.32, th + 0.5, [0.28, 0.22, 0.16], 6, b);   // sunk base — no slope float
        const top = vadd(a.c, a.u, th);
        for (let i = 0; i < 3; i++) {
          const bh = hash(k * 11 + i * 3.1 + dist);
          const ang = (i / 3 + bh * 0.4) * 6.2832;
          const out2 = vadd(vadd([0, 0, 0], a.r, Math.cos(ang)), a.t, Math.sin(ang));
          const bu = [a.u[0] * 0.7 + out2[0] * 0.7, a.u[1] * 0.7, a.u[2] * 0.7 + out2[2] * 0.7];
          addCyl(out, vadd(top, a.u, i * 0.25), 0.09, 1.6 + bh * 1.4, [0.30, 0.24, 0.17], 4, [a.r, bu, a.t]);
        }
        out._mat = 0;
        return;
      }
      // per-instance jitter so adjacent broadleaves vary in size/shape
      const j = 0.85 + hash(k * 2.9 + side * 1.7 + dist) * 0.3;
      const c2 = [col[0] * 0.88, col[1] * 0.9, col[2] * 0.84];   // sunlit upper foliage
      const lean = vr > 0.55 ? (vr - 0.55) * 1.4 : 0;   // asymmetric crown, ~35% of instances
      out._mat = MAT.WOOD;
      // Trunk reaches well into the crown (0.55h): the skirt cone is nearly flat,
      // so from road level its top surface backface-culls and the crown would
      // otherwise appear to start at the SECOND cone — a floating canopy with a
      // see-through band above a too-short trunk (Albert Park eucalyptus rows).
      addCyl(out, vadd(a.c, a.u, -0.5), 0.4, h * 0.55 + 0.5, [0.32, 0.23, 0.13], 6, b);   // sunk base — no slope float
      out._mat = MAT.FOLIAGE;
      // Close the crown's UNDERSIDE: a shallow inverted skirt from the widest
      // ring down to the trunk, faces oriented downward (ref sits above), so
      // low/flat viewpoints see a shaded canopy bottom instead of a culled hole.
      {
        const usR = (3.5 + h * 0.135) * j;
        const ringY = h * 0.34, apexY = h * 0.20;
        const usCol = [col[0] * 0.5, col[1] * 0.52, col[2] * 0.5];
        const uref = vadd(a.c, a.u, h * 0.7);
        const apex = vadd(a.c, a.u, apexY);
        for (let i = 0; i < 9; i++) {
          const a0 = i / 9 * 6.2832, a1 = (i + 1) / 9 * 6.2832;
          const ring = (ang) => vadd(vadd(vadd(a.c, a.u, ringY), a.r, Math.cos(ang) * usR), a.t, Math.sin(ang) * usR);
          emit(out, [ring(a0), ring(a1), apex], usCol, uref);
        }
      }
      // ROUNDED broadleaf canopy: bulges widest in the middle and is capped by a
      // squat dome — a full, billowing crown that reads clearly as a deciduous
      // tree rather than the narrow pointed cone-stack of conifer() (the two used
      // to look near-identical). Top two layers are inverted/short cones so the
      // crown rounds off instead of tapering to a spike, and lean into `a.r`
      // increasingly with height on asymmetric instances.
      addCone(out, vadd(a.c, a.u, h * 0.28), (3.3 + h * 0.13) * j, h * 0.30, col, 9, b);   // wide skirt
      addCone(out, vadd(a.c, a.u, h * 0.46), (3.7 + h * 0.14) * j, h * 0.26, col, 9, b);   // widest bulge
      addCone(out, vadd(vadd(a.c, a.u, h * 0.66), a.r, lean), (2.9 + h * 0.10) * j, h * 0.26, c2, 8, b);    // shoulder
      addCone(out, vadd(vadd(a.c, a.u, h * 0.82), a.r, lean * 1.6), (1.7 + h * 0.06) * j, h * 0.22, c2, 7, b);    // rounded cap
      out._mat = 0;
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const palm = (k, side, dist, h, frond) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        console.warn(`[scenery] palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // Gently curved trunk: three tapering segments each leaning a touch further
      // (palms arc toward the light) instead of one dead-straight pole.
      const lean = (hash(k * 3.3 + side * 2.1 + dist) - 0.5) * 0.5;
      const seg = h / 3;
      out._mat = MAT.WOOD;
      // buried root stub: keeps the slim trunk grounded on sloped/uneven terrain
      addCyl(out, vadd(a.c, a.u, -0.6), 0.38, 0.75, [0.42, 0.34, 0.21], 6, b);
      // Curved trunk as a CONNECTED chain: each segment runs joint-to-joint with
      // its own tilted up-vector (like the dead-tree branches). The old form
      // stacked vertical cylinders at per-segment lateral offsets — with any
      // lean the top segment detached sideways and floated as a bare stick.
      const joint = (t) => vadd(vadd(a.c, a.u, t * seg), a.r, lean * t * t * 0.4 * side);
      for (let t = 0; t < 3; t++) {
        const p0 = joint(t), p1 = joint(t + 1);
        const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || seg;
        addCyl(out, p0, 0.34 - t * 0.06, L, [0.45 - t * 0.03, 0.36, 0.22], 6,
               [a.r, [d[0] / L, d[1] / L, d[2] / L], a.t]);
      }
      const base = joint(3);
      out._mat = MAT.FOLIAGE;
      // Crown sits AT the trunk top (was seg/2 ≈ h/6 below it — a bare pole
      // stuck up through the fronds, reading as a floating stick from distance).
      // `base` (= joint(3)) already carries the full lean offset.
      const top = vadd(base, a.u, -0.35);
      const frCol = frond || [0.18, 0.40, 0.16];
      const frDark = [frCol[0] * 0.8, frCol[1] * 0.82, frCol[2] * 0.78];
      // Solid crown core: thin fronds alias away at range, so keep a visible
      // green mass at the hub — without it a distant palm is just a brown pole.
      addBox(out, top, [1.7, 1.2, 1.7], frDark, b);
      // 9 drooping fronds: each arcs outward then down (own tilted up-vector),
      // with per-frond length/droop jitter so the crown reads full, not a star.
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9 + hash(k + i * 1.7) * 0.06) * 6.2832, dir = [Math.cos(ang), 0, Math.sin(ang)];
        const fr = [dir[0] * a.r[0] + dir[2] * a.t[0], 0, dir[0] * a.r[2] + dir[2] * a.t[2]];
        const droop = 0.45 + hash(k * 2.1 + i) * 0.5;            // how far the frond bends down
        const fu = [fr[0] * droop + a.u[0] * (1 - droop), a.u[1] * (1 - droop * 0.7), fr[2] * droop + a.u[2] * (1 - droop)];
        const len = 5.0 + hash(k + i * 3.3) * 2.0;
        const fc = vadd(vadd(top, fr, 2.4), a.u, 0.15);
        addPrism(out, fc, [1.9, 0.5, len], i % 2 ? frCol : frDark, [fr, fu, [-fr[2], 0, fr[0]]]);
      }
      // Coconut cluster tucked under the crown.
      out._mat = MAT.WOOD;
      for (let i = 0; i < 3; i++) {
        const ang = i / 3 * 6.2832;
        addBox(out, vadd(vadd(top, a.r, Math.cos(ang) * 0.5), a.t, Math.sin(ang) * 0.5),
               [0.34, 0.34, 0.34], [0.32, 0.24, 0.14], b);
      }
      out._mat = 0;
    };
    // Conifer / fir: a tall narrow stack of cones — alpine & northern forest
    // circuits (Spa, Red Bull Ring, Zandvoort dunes, Montreal).
    const conifer = (k, side, dist, h, col) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) return;
      const c2 = [col[0] * 0.86, col[1] * 0.92, col[2] * 0.82];
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.5), 0.3, h * 0.20 + 0.5, [0.34, 0.24, 0.15], 5, b);   // trunk, sunk base
      out._mat = MAT.FOLIAGE;
      addCone(out, vadd(a.c, a.u, h * 0.14), 2.1 + h * 0.06, h * 0.44, col, 7, b);
      addCone(out, vadd(a.c, a.u, h * 0.42), 1.6 + h * 0.05, h * 0.38, col, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.70), 1.0 + h * 0.04, h * 0.34, c2, 6, b);
      out._mat = 0;
    };
    // Distant mountain peak (world coords), pyramid so it reads as a summit, with
    // a lower foot skirt so it doesn't look like a floating spike. Simple/clean —
    // use mountain() for organic, colour-zoned, snow-capped summits.
    const peak = (x, z, baseY, w, h, col) => {
      // Skip if the pyramid's footprint (outer base radius w*0.75) reaches tarmac.
      if (onTrack(x, z, w * 0.75)) {
        console.warn(`[scenery] peak SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      out._mat = MAT.ROCK;
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
      out._mat = 0;
    };
    // Organic mountain (world coords): irregular craggy summit with height colour
    // zones (forest → rock → snow). opts passes seed/snowline/colours — see
    // addMountain. A low foot skirt blends the base into the ground.
    const mountain = (x, z, baseY, w, h, opts) => {
      // Skip if the skirt footprint (radius w*0.62) would reach the tarmac.
      // This prevents backdrop mountains from clipping through the racing surface
      // when extra < w*0.62 (ring placed too close relative to mountain width).
      if (onTrack(x, z, w * 0.62)) {
        console.warn(`[scenery] mountain SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      opts = opts || {};
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);   // skirt
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    // Mountain ridge segment (world coords) — a prism whose ridge runs along
    // `ang` (radians, in the XZ plane). Chain these for a jagged range.
    const ridge = (x, z, baseY, ang, len, w, h, col) => {
      // Skip if footprint half-extent reaches tarmac.
      if (onTrack(x, z, Math.max(len, w) * 0.5)) {
        console.warn(`[scenery] ridge SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: len=${len} w=${w}`);
        return;
      }
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      addPrism(out, [x, baseY, z], [w, h, len], col, [r, [0, 1, 0], f]);
    };
    // Populate a raked seating bank with speckled spectators. Front row sits at
    // clearance `gap` beyond the road edge and the bank rises `rise` m over
    // `depth` m of recede, split into blocks by aisles. Empty seats + a dark
    // riser behind each row read as shadow, not sky, through the gaps. At night
    // most bodies go dark with a sparse scatter of phone-lights / camera flashes.
    // Emitted with RAW.addBox (spectators always sit safely behind the shell, so
    // the per-box on-road test is skipped for speed).
    const crowdBank = (k, side, gap, len, rise, depth, riserCol) => {
      const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
      const rows = Math.max(3, Math.round(rise / 1.4));
      const perRow = Math.max(6, Math.round(len / 1.15));
      const riser = riserCol || (NIGHT ? [0.10, 0.10, 0.13] : [0.28, 0.26, 0.27]);
      for (let r = 0; r < rows; r++) {
        const f = (r + 0.5) / rows, up = f * rise, back = f * depth;
        // dark step riser behind each seating row (blocks sky/ground show-through).
        // Guarded (unlike the tiny spectator boxes): the riser is a wide flat slab,
        // so a mis-placed bank whose front row creeps toward the tarmac would
        // otherwise overhang the road here — the exact bypass this RAW path used to
        // leave open. rejBox drops only a riser actually over the road; a bank
        // safely behind the shell never trips it, so intended crowds are unchanged.
        out._mat = MAT.CONCRETE;
        const riserC = vadd(vadd(a.c, a.u, up), a.r, side * back);
        // If the riser is rejected, this row has no seating — so skip its
        // spectators too. The bodies below go out through RAW (unguarded), so
        // without this they stayed behind as a row of people sitting on thin
        // air where the stand had been dropped.
        if (rejBox(riserC, [1.3, 1.5, len], b)) continue;
        RAW.addBox(out, riserC, [1.3, 1.5, len], riser, b);
        out._mat = MAT.FABRIC;
        for (let s2 = 0; s2 < perRow; s2++) {
          if (s2 % 10 === 9) continue;                       // aisle / vomitory gap
          const h1 = hash(k * 2.7 + r * 5.3 + s2 * 1.9 + side * 3.1);
          const h2 = hash(k * 1.3 + r * 8.1 + s2 * 4.7 + side * 2.2);
          if (h2 > 0.86) continue;                            // ~14% empty seats
          const along = ((s2 + 0.5) / perRow - 0.5) * len + (h1 - 0.5) * 0.45;
          const c = vadd(vadd(vadd(a.c, a.t, along), a.u, up + 0.55), a.r, side * back);
          let col;
          if (NIGHT) {
            col = h1 > 0.955 ? [2.6, 2.4, 2.0]                // phone light / flash (HDR → blooms)
                : h1 > 0.55  ? [0.09, 0.10, 0.13]            // dark bodies
                             : [0.16, 0.16, 0.21];
          } else {
            col = CROWD_DAY[Math.floor(h1 * CROWD_DAY.length) % CROWD_DAY.length];
          }
          RAW.addBox(out, c, [0.55, 0.72 + h2 * 0.2, 0.5], col, b);   // torso + head lump
        }
      }
      out._mat = 0;
    };
    const grandstand = (s, side, gap, len, shell, crowd) => {
      const k = Math.round(s * n) % n;
      const halfFrac = (len / 2) / track.total;
      recordBarrier(s - halfFrac, s + halfFrac, side, gap);
      // recordBarrier only registers the stand's FRONT FACE. The stand itself
      // is a ~12.5 m deep mass (crowd bank, back shell centred at gap+7.5 and
      // 10 wide, roof over the top), and nothing told the scenery engine that —
      // so treelines planted behind a stand grew straight up through it.
      ctx.indexSolid(s - halfFrac, s + halfFrac, side, gap, 12.5);
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const t = [track.tx[k], track.ty[k], track.tz[k]];
      const u = upOf(track, k);
      // Skip only if crowd inner face (= road edge + gap) literally sits on track.
      const oInner = side * (hw[k] + gap);
      const ifx = px[k] + r[0] * oInner, ifz = pz[k] + r[2] * oInner;
      if (onTrack(ifx, ifz, 0)) {
        console.warn(`[scenery] grandstand SUPPRESSED at s=${s} side=${side}: gap=${gap} (inner face on track)`);
        return;
      }
      // Back shell — center at gap+7.5 beyond road edge
      const oShell = side * (hw[k] + gap + 7.5);
      const cShell = [px[k] + r[0] * oShell, groundYAt(k, gap + 7.5) + 6 - 0.8, pz[k] + r[2] * oShell];
      addBox(out, cShell, [10, 12, len], shell || [0.40, 0.41, 0.46], [r, u, t]);
      // Raked crowd: speckled spectators rising from the front toward the shell.
      // (`crowd` colour, kept for call-site compatibility, tints the dark risers.)
      crowdBank(k, side, gap + 1.5, len - 2, 7, 4.2,
                crowd ? [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4] : null);
      // Roof slab cantilevered over the crowd, lifted on the up axis
      const a = anchor(k, side, gap + 5);
      const roofC = vadd(a.c, a.u, 13);
      addBox(out, roofC, [12, 0.8, len + 2], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      // Rear fascia — closes the gap between the back shell's top and the roof
      // underside. Without it the roof is a slab hanging in air on EVERY
      // grandstand on every circuit: the shell tops out at ground+11.2 while the
      // roof's underside sits at ground+12.3. The two are also sampled at
      // different lateral distances (gap+7.5 via groundYAt vs gap+5 via the
      // anchor's terrain raycast), so the shortfall varies with the verge slope
      // rather than being a fixed 1.1 m — hence solving it from the two pieces'
      // ACTUAL world-space tops instead of a constant. Placed at the roof's
      // outer edge (over the shell, behind the crowd) so it never occludes the
      // under-roof night strip, and is itself hidden by the roof from trackside.
      {
        const shellTop = cShell[1] + 6, roofUnder = roofC[1] - 0.4;
        if (roofUnder > shellTop - 0.1) {
          const oF = side * (hw[k] + gap + 9);
          addBox(out, [px[k] + r[0] * oF, (shellTop + roofUnder) / 2, pz[k] + r[2] * oF],
                 [4, roofUnder - shellTop + 0.2, len], shell || [0.40, 0.41, 0.46], [r, u, t]);
        }
      }
      // Under-roof lighting: a warm emissive strip beneath the roof slab so a
      // night grandstand reads as a lit, occupied stand instead of a dark hulk.
      if (NIGHT) addBox(out, vadd(a.c, a.u, 12.35), [8.5, 0.28, len - 1], [1.30, 1.12, 0.74], [a.r, a.u, a.t]);
    };
    // Low clipped hedge / continuous treeline.
    const HEDGE_W = 2.4;
    const hedge = (s0, s1, side, gap, h, col) => {
      // A hedge is a solid 2.4 m-wide body, but it is not a barrier — it must
      // not move the driving limit. Index the geometry only. This was the
      // single largest source of cross-model clipping on the fleet: without it
      // the roadside tree scatter plants straight through every hedge run
      // (monza's hedge x plantTree bucket was ~89% of that circuit's pairs).
      // The box straddles the anchor, so its inner face is half a width in.
      ctx.indexSolid(s0, s1, side, gap - HEDGE_W / 2, HEDGE_W);
      ctx.along(s0, s1, 4, (k, spacing) => {
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.2)) {
          console.warn(`[scenery] hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        addBox(out, vadd(p.c, p.u, (h - 0.4) / 2), [HEDGE_W, h + 0.4, spacing], col || [0.18, 0.36, 0.16], [p.r, p.u, p.t]);   // base sunk 0.4
      });
    };
    // forestEdge(): a DENSE treeline (mix of pine/tree) from s0→s1 on `side`,
    // GUARANTEED not to clip barriers. Foliage is placed so the canopy's INNER
    // edge stays at least `gap` beyond the road edge — i.e. the per-tree `dist`
    // accounts for the canopy radius (which grows with tree height), so a tree
    // called at small gap can never poke its canopy through a wall/hedge/fence.
    //   opts: { density, hMin, hMax, col, col2, pineFrac }
    // Canopy outer radius for a species at height h — the SINGLE source of truth
    // for "how far does this tree's foliage actually reach sideways". Both
    // forestEdge() and the FURN roadside scatter derive placement from it.
    // Keeping two hand-copied estimates is what let forestEdge's drift stale:
    // it still described tree()'s old (2.9 + h*0.12) skirt after the broadleaf
    // crown was widened to (3.7 + h*0.14), leaving the "GUARANTEED not to clip
    // barriers" contract ~0.9 m optimistic at h=16.
    const canopyR = (kind, h) => {
      const jMax = 1.15;                                  // per-instance jitter ceiling
      if (kind === "pine") return 2.7 * jMax + 0.4;       // pine(): widest lower tier
      if (kind === "fir")  return 2.1 + h * 0.06 + 0.4;   // conifer(): no jitter applied
      if (kind === "palm") return 5.2;                    // frond hub 2.4 + blade spread
      return (3.7 + h * 0.14) * jMax + 0.4;               // tree(): widest bulge cone
    };
    // Queued, then flushed after def.scenery() returns. A track file is written
    // in whatever order reads well — imola plants its treelines at the top and
    // builds its catch fences 280 lines later — so a forestEdge() that consults
    // the barrier index the moment it is called is usually consulting an empty
    // one. Deferring every treeline to the end of the scenery pass makes the
    // guard order-independent: authors keep writing scenery in any order they
    // like, and the foliage always sees the finished barrier set.
    const deferredFoliage = [];
    const forestEdge = (...a) => { deferredFoliage.push(a); };
    const forestEdgeNow = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const hMin = opts.hMin != null ? opts.hMin : 7;
      const hMax = opts.hMax != null ? opts.hMax : 13;
      const pineCol = opts.col || [0.16, 0.36, 0.16];
      const treeCol = opts.col2 || [0.20, 0.40, 0.16];
      const pineFrac = opts.pineFrac != null ? opts.pineFrac : 0.55;
      // density 0..1 → step 7m (sparse) … 3m (dense). Default ~medium-dense.
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.7;
      const step = 7 - dens * 4;
      ctx.along(s0, s1, step, (k) => {
        const s = hash(k * 4.3 + side * 1.1);
        const h = hMin + s * (hMax - hMin);
        const isPine = hash(k * 6.7 + side * 0.7) < pineFrac;
        const canopy = canopyR(isPine ? "pine" : "broad", h);
        // dist so the canopy's inner edge sits `gap` beyond the road edge
        const dist = gap + canopy;
        // stagger a back row slightly for depth on the densest treelines
        const back = (dens > 0.6 && hash(k * 8.9 + side) < 0.4) ? canopy * 1.4 : 0;
        // Same world-space guard the roadside scatter uses. The canopy sizing
        // above only guarantees clearance from the ROAD EDGE; a treeline run
        // alongside a stretch that also carries a catch fence still grows
        // straight through it, which is every surviving hit on imola.
        const d = clearTreeDist(k, side, dist + back, canopy);
        if (d == null) return;
        if (isPine) pine(k, side, d, h, pineCol);
        else        tree(k, side, d, h, treeCol);
      });
    };
    // Bush / shrub clump: 2-3 jittered cones offset around a centre so it reads
    // as an irregular clump of foliage rather than one uniform cone (every bush
    // on every track used to be geometrically identical).
    const bush = (k, side, dist, col) => {
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 2)) {
        console.warn(`[scenery] bush SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      const bc = col || [0.20, 0.38, 0.18];
      const c2 = [bc[0] * 0.90, bc[1] * 0.94, bc[2] * 0.88];
      const jh = hash(k * 4.3 + side * 2.1 + dist);
      const lobes = jh < 0.4 ? 2 : 3;   // most clumps 2-3 lobes, some just 1 big lump
      for (let i = 0; i < lobes; i++) {
        const lh = hash(k * 5.9 + side * 3.3 + dist + i * 1.7);
        const ang = (i / lobes + lh * 0.3) * 6.2832;
        const off = lobes > 1 ? 0.6 + lh * 0.5 : 0;
        const lx = Math.cos(ang) * off, lz = Math.sin(ang) * off;
        const lc = vadd(vadd(p.c, p.r, lx), p.t, lz);
        const rad = (1.1 + lh * 0.9) * (lobes > 1 ? 0.82 : 1.15);
        // lobe base sits BELOW grade (was +0.25..0.45 → visibly hovering); the
        // buried part is occluded, the crown height barely changes.
        addCone(out, vadd(lc, p.u, -0.3 + lh * 0.1), rad, 2.2 + lh * 1.0, i === 0 ? bc : c2, 6, b);
      }
    };

    return { anchor, pine, tree, palm, conifer, peak, mountain, ridge,
             crowdBank, grandstand, bush, hedge, forestEdge,
             canopyR, forestEdgeNow, deferredFoliage };
  }

  return { create };
})();
