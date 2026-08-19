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
    const { out, track, n, ds, hw, px, py, pz, NIGHT, MAT, def, theme,
            clearTreeDist,
            addBox, addCyl, addCone, addFrustum, addPrism, addPyramid,
            addMountain, emit, rejBox, recordBarrier, groundYAt,
            terrainYAt, onTrack, hash, upOf, norm, vadd, bankOffsetAt } = ctx;
    Log.info("scenery", "scenery-nature dress " + (def && def.id));
    const { CROWD_DAY } = TrackSceneryData;

    // Ground height under an ARBITRARY world x/z, for geometry whose footing
    // is not at a known (node, lateral) — anything run out along a tangent,
    // which on a curve leaves the lateral distance it was authored with.
    // Prefers the rendered terrain; off the ribbon terrainYAt returns null, so
    // fall back to nearest-node + lateral distance, which is the SAME closed
    // form tools/float-audit.cjs falls back to. Matching its model is the point:
    // a footing resolved by any other route disagrees with the grounding audit
    // exactly where the ribbon ends, which is where long stands actually sit.
    // Scratch for nodeGrid.query — same nearest-node + lateral fallback as
    // tools/float-audit.cjs (PERF-FINDINGS: was O(n) over every centreline node).
    const _guCand = new Array(n);
    const groundUnder = (x, z) => {
      const ty = terrainYAt(x, z);
      if (ty !== null) return ty;
      let best = 0, bestD = Infinity;
      const grid = track._nodeGrid || (typeof TrackMesh !== "undefined" && TrackMesh.nodeGrid(track));
      if (grid && grid.query) {
        // Expand R until a candidate lies inside the searched disc. query(R) is
        // a cell-AABB SUPERSET of nodes within Euclidean R, so bestD ≤ R² means
        // the true nearest cannot be outside the scan.
        let R = 40;
        for (;;) {
          const cnt = grid.query(x, z, R, _guCand, false);
          best = 0; bestD = Infinity;
          for (let a = 0; a < cnt; a++) {
            const i = _guCand[a];
            const d = (x - px[i]) * (x - px[i]) + (z - pz[i]) * (z - pz[i]);
            if (d < bestD) { bestD = d; best = i; }
          }
          if (cnt > 0 && bestD <= R * R) break;
          if (R > 8000) break;
          R *= 2;
        }
      } else {
        for (let i = 0; i < n; i++) {
          const d = (x - px[i]) * (x - px[i]) + (z - pz[i]) * (z - pz[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      return groundYAt(best, Math.max(0, Math.sqrt(bestD) - hw[best]));
    };

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
      // ROUND, don't just wrap. A caller passing a lap FRACTION where a node
      // index belongs (billboard(0.01, …) instead of billboard(K(0.01), …))
      // survived the modulo as 0.01, indexed the typed arrays fractionally,
      // read undefined and turned the whole model into NaN — the primitive
      // guard then dropped it silently. That is how Baku lost a billboard.
      const k = Math.round(((kRaw % n) + n) % n) % n;
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
      // On a BANKED corner the road pivots about its centreline, and the
      // terrain ribbon rides with it — but the ribbon only starts ~2.2 m beyond
      // the tarmac, and groundYAt()/TrackSurface.heightAt() is a flat
      // cross-section with no banking term at all. Anything anchored inside
      // that gap (Zandvoort's kerb strip sits at 1.35 m) therefore fell back to
      // the UNBANKED height while the road edge moved +/-2.26 m: a 2 m cliff
      // between the tarmac and its own kerb on the low side, and the road
      // climbing straight over the kerb on the high side. Apply the same pivot
      // to the fallback so both sides of the seam agree. Not applied to the
      // terrainYAt branch — the ribbon already carries it, and adding it twice
      // would double the bank.
      // Inside the road-to-ribbon GAP the ground is not terrain at all — the
      // rendered ribbon starts ~2.2 m out, and TrackSurface.heightAt() is a flat
      // cross-section that knows nothing about the road it borders. Anything
      // anchored in that band (kerb strips sit at 1.35 m) must follow the ROAD
      // SURFACE, which on a banked corner is the edge height, not a notional
      // shelf 1.3 m below it.
      // Inside the band the ROAD's own shoulder covers, the road defines the
      // ground — do not consult terrainYAt at all. At a hairpin that doubles
      // back on itself (Zandvoort) the XZ lookup happily resolves the OTHER
      // leg's ribbon, which sits a metre higher and buried the kerb strip.
      const base = dist < 2.2
        ? py[k] + bankOffsetAt(track, k, o)
        : (() => { const ty = terrainYAt(cx, cz);
                   return ty != null ? ty : groundYAt(k, dist) + bankOffsetAt(track, k, o); })();
      return { c: [cx, base - 0.3, cz], r, u, t };
    };
    // Conifer/pine: tapered trunk + stacked cones. col = needle green. Three
    // silhouette variants selected per-instance so a treeline doesn't read as
    // identical clones stretched to different sizes: FULL (dense 4-tier), LEAN
    // (windswept — each tier offset sideways, increasing with height), SPARSE
    // (thinner 3-tier, gappy — storm-thinned or younger tree).
    //   opts: { tiers, lean, sparse, snow, deadTop }
    const pine = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 3)) {
        ctx.noteSuppressed("pine", `pine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("pine", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.45, h, h * 0.45], { k, side });
      // per-instance size jitter so a treeline doesn't read as identical clones
      const j = 0.85 + hash(k * 3.7 + side * 1.3 + dist) * 0.3;
      const vr = hash(k * 6.1 + side * 4.4 + dist + 9.3);
      const sparse = opts.sparse != null ? !!opts.sparse : vr > 0.82;   // ~18% thinner 3-tier trees
      const lean = opts.lean != null ? opts.lean
        : (!sparse && vr > 0.55 ? (vr - 0.55) * 2.2 : 0);              // ~27% windswept lean
      const tiers = opts.tiers != null ? Math.max(2, Math.min(6, Math.round(opts.tiers)))
        : (sparse ? 3 : 4);
      // S4 remesh (SCENE-GRAPH-PLAN): geometry is linear in a reference height
      // so one model + uniform scale instances. World-space 0.5 m sink stays on
      // the placement (not in the mesh) so scale cannot float/bury the trunk.
      // lean/j quantize so the key is discrete; side flips +r; tint is NODE_COLOR.
      const PINE_REF_H = 12;
      const jQ = 0.85 + Math.round((j - 0.85) / 0.15) * 0.15;
      const leanQ = lean <= 0 ? 0 : Math.round(lean / 0.4) * 0.4;
      const s = h / PINE_REF_H;
      const o = [a.c[0] - a.u[0] * 0.5, a.c[1] - a.u[1] * 0.5, a.c[2] - a.u[2] * 0.5];
      const r = side < 0 ? [-a.r[0], -a.r[1], -a.r[2]] : a.r;
      ctx.instance(
        `pine|${sparse ? 1 : 0}|${tiers}|${leanQ}|${jQ}`,
        { o, r, u: a.u, t: a.t, s: [s, s, s], col },
        (rec) => {
          const H = PINE_REF_H;
          rec.mat(MAT.WOOD);
          rec.cyl([0, 0, 0], 0.35 + H * 0.02, H * 0.4 + 0.5, [0.30, 0.22, 0.13], 6);
          rec.mat(MAT.FOLIAGE);
          let y = H * 0.3 + 0.5;
          for (let i = 0; i < tiers; i++) {
            const w = (sparse ? 2.3 : 2.7) * jQ * (1 - i * (sparse ? 0.24 : 0.21));
            rec.cone([leanQ ? leanQ * (y / H) * 1.6 : 0, y, 0],
                     w, H * 0.32, TrackGraph.NODE_COLOR, 7);
            y += H * (sparse ? 0.24 : 0.18) * jQ;
          }
        },
        { kind: "pine", k, side, h });
      out._mat = 0;
    };
    // Broadleaf tree: short trunk + a rounded canopy (squat wide cone + cap cone).
    // ~9% of instances are a bare DEAD/STORM tree (trunk + thin branch cylinders,
    // no canopy) — breaks up monoculture stands and reads as a real weathered
    // treeline rather than a cloned forest. Living trees get a per-instance
    // ASYMMETRIC lean on the upper canopy (~35%) so not every crown is a perfect
    // dome.
    //   opts: { crown: "round"(default) | "vase" | "weeping" | "columnar",
    //           spread, deadChance }
    // "round" reproduces the pre-existing crown exactly, so the 57 direct calls
    // and the generic roadside scatter are unchanged until a circuit asks.
    const tree = (k, side, dist, h, col, opts) => {
      const crown = (opts && opts.crown) || "round";
      const sp = (opts && opts.spread) || 1;
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        ctx.noteSuppressed("tree", `tree SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // Past the on-track guard — this tree ships. Canopy radius scales with
      // height, so w/d are an estimate rather than a measured bound.
      ctx.note("tree", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.5, h, h * 0.5], { k, side });
      const vr = hash(k * 8.3 + side * 5.1 + dist + 4.7);
      const deadAt = 1 - ((opts && opts.deadChance != null) ? opts.deadChance : 0.09);
      if (vr > deadAt) {   // dead/storm tree: bare trunk + a few angled branch stubs.
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
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const bu = [
            a.u[0] * 0.7 + (a.r[0] * ca + a.t[0] * sa) * 0.7,
            a.u[1] * 0.7 + (a.r[1] * ca + a.t[1] * sa) * 0.7,
            a.u[2] * 0.7 + (a.r[2] * ca + a.t[2] * sa) * 0.7
          ];
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
      if (crown === "vase") {
        // Eucalyptus / elm: narrow at the fork, spreading upward and outward.
        addCone(out, vadd(a.c, a.u, h * 0.34), (2.1 + h * 0.07) * j * sp, h * 0.28, col, 8, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (3.4 + h * 0.15) * j * sp, h * 0.28, col, 9, b);
        addCone(out, vadd(vadd(a.c, a.u, h * 0.78), a.r, lean), (4.0 + h * 0.17) * j * sp, h * 0.24, c2, 9, b);
      } else if (crown === "weeping") {
        // Willow: a high dome with the mass hanging BELOW it.
        addCone(out, vadd(a.c, a.u, h * 0.62), (3.6 + h * 0.15) * j * sp, h * 0.30, col, 9, b);
        addFrustum(out, vadd(a.c, a.u, h * 0.24), (1.4 + h * 0.05) * j * sp,
          (3.9 + h * 0.16) * j * sp, h * 0.40, c2, 9, b);
      } else if (crown === "columnar") {
        // Poplar / lombardy: a tall narrow spire, almost no spread.
        addCone(out, vadd(a.c, a.u, h * 0.30), (1.5 + h * 0.05) * j * sp, h * 0.36, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.56), (1.2 + h * 0.04) * j * sp, h * 0.34, col, 7, b);
        addCone(out, vadd(a.c, a.u, h * 0.80), (0.8 + h * 0.03) * j * sp, h * 0.26, c2, 6, b);
      } else {
        addCone(out, vadd(a.c, a.u, h * 0.28), (3.3 + h * 0.13) * j * sp, h * 0.30, col, 9, b);   // wide skirt
        addCone(out, vadd(a.c, a.u, h * 0.46), (3.7 + h * 0.14) * j * sp, h * 0.26, col, 9, b);   // widest bulge
        addCone(out, vadd(vadd(a.c, a.u, h * 0.66), a.r, lean), (2.9 + h * 0.10) * j * sp, h * 0.26, c2, 8, b);    // shoulder
        addCone(out, vadd(vadd(a.c, a.u, h * 0.82), a.r, lean * 1.6), (1.7 + h * 0.06) * j * sp, h * 0.22, c2, 7, b);    // rounded cap
      }
      out._mat = 0;
    };
    // Palm: tall thin trunk + a crown of drooping frond prisms.
    const palm = (k, side, dist, h, frond) => {
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      if (onTrack(a.c[0], a.c[2], 4)) {
        ctx.noteSuppressed("palm", `palm SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("palm", [a.c[0], a.c[1] + h / 2, a.c[2]], [h * 0.6, h, h * 0.6], { k, side });
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
      // Per-instance variety, so a treeline is a forest and not one fir stamped N
      // times: a deterministic ±15% size jitter, a windswept lean on ~40% of
      // trees, and a 4th spire tier. All from hash(k,side,dist) — no unique
      // geometry, so the roadside scatter stays cheap. `lean` shifts each tier
      // laterally in proportion to its height.
      const vr = hash(k * 6.7 + side * 2.3 + dist), j = 0.85 + hash(k * 3.1 + side * 1.7 + dist) * 0.3;
      const lean = vr > 0.6 ? (vr - 0.6) * 1.3 * side : 0;
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.5), 0.3, h * 0.20 + 0.5, [0.34, 0.24, 0.15], 5, b);   // trunk, sunk base
      out._mat = MAT.FOLIAGE;
      addCone(out, vadd(vadd(a.c, a.u, h * 0.14), a.r, lean * 0.14), (2.1 + h * 0.06) * j, h * 0.44, col, 7, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.42), a.r, lean * 0.42), (1.6 + h * 0.05) * j, h * 0.38, col, 6, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.70), a.r, lean * 0.70), (1.0 + h * 0.04) * j, h * 0.34, c2, 6, b);
      addCone(out, vadd(vadd(a.c, a.u, h * 0.88), a.r, lean * 0.88), (0.6 + h * 0.03) * j, h * 0.28, c2, 5, b);
      out._mat = 0;
    };
    // ---------- species: the silhouettes pine/tree/palm/conifer cannot make ----------
    // Six species served forty circuits, so a Portuguese hillside, an Argentine
    // avenue and a Highveld plain all planted the same rounded cone. The five
    // below are the forms circuit authors kept rewriting locally; each is the
    // best of those implementations plus an options bag, because a shared model
    // that renders identically everywhere only moves the sameness up a level.
    // All follow tree()'s contract: (k, side, dist, h, col, opts), anchored,
    // on-track guarded, noted, MAT.WOOD trunk + MAT.FOLIAGE crown, base sunk so
    // a single-point terrain sample cannot float them on a slope.

    // cypress: the columnar dark-green spire of an Italian avenue — a stack of
    // narrowing cones on a slim trunk, nothing like pine()'s wide tiers.
    //   opts: { slim (crown-radius scale, default 1), trunkCol }
    const cypress = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const slim = opts.slim != null ? Math.max(0.4, Math.min(2.2, opts.slim)) : 1;
      if (onTrack(a.c[0], a.c[2], 1.6 * slim + 0.6)) {
        ctx.noteSuppressed("cypress", `cypress SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("cypress", [a.c[0], a.c[1] + h / 2, a.c[2]], [3 * slim, h, 3 * slim], { k, side });
      // Per-instance tone shift: an avenue of one flat green reads as a fence.
      const dark = hash(k * 7.3 + side * 2.1 + dist) < 0.5;
      const c = dark ? [col[0] * 0.78, col[1] * 0.82, col[2] * 0.80] : col;
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.4), 0.22, h * 0.18 + 0.4, opts.trunkCol || [0.30, 0.22, 0.14], 5, b);
      out._mat = MAT.FOLIAGE;
      addCone(out, vadd(a.c, a.u, h * 0.10), 1.45 * slim, h * 0.58, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.44), 1.10 * slim, h * 0.42, c, 6, b);
      addCone(out, vadd(a.c, a.u, h * 0.70), 0.70 * slim, h * 0.32, c, 6, b);   // pointed crown
      out._mat = 0;
    };

    // stonePine: the Mediterranean parasol pine — a bare trunk carrying a flared
    // underside and a shallow dome, i.e. a mushroom, not a spire.
    //   opts: { lean (0 = upright, 1 = full windswept), spread (crown scale),
    //           trunkCol }
    const stonePine = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      if (onTrack(a.c[0], a.c[2], h * 0.44 * spread + 0.6)) {
        ctx.noteSuppressed("stonePine", `stonePine SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("stonePine", [a.c[0], a.c[1] + h * 0.7, a.c[2]],
               [h * 0.9 * spread, h, h * 0.9 * spread], { k, side });
      // The Atlantic wind: the trunk's foot and its crown disagree, which is the
      // whole read of a coastal pine. `lean` scales that disagreement.
      const amt = opts.lean != null ? Math.max(0, Math.min(1.5, opts.lean)) : 1;
      const lean = (hash(k * 13.1 + side * 3.7 + dist) - 0.5) * 0.9 * amt;
      const foot = vadd(a.c, a.r, lean * 0.6);
      out._mat = MAT.WOOD;
      addCyl(out, vadd(foot, a.u, -0.5), 0.20 + h * 0.014, h * 0.66 + 0.5,
             opts.trunkCol || [0.40, 0.31, 0.23], 5, b);
      out._mat = MAT.FOLIAGE;
      const crown = vadd(vadd(foot, a.u, h * 0.60), a.r, lean);
      addFrustum(out, crown, h * 0.12 * spread, h * 0.44 * spread, h * 0.16, col, 7, b);   // flared underside
      addCone(out, vadd(crown, a.u, h * 0.16), h * 0.44 * spread, h * 0.22, col, 7, b);    // shallow dome
      out._mat = 0;
    };

    // broadleafFall: a turning autumn broadleaf — three overlapping off-axis
    // lobes rather than one solid cone of colour, so the crown has a shape when
    // the foliage is a bright non-green. Pass an autumn `col` (or a summer green;
    // the form is what differs from tree(), not the palette).
    //   opts: { lobes, spread (crown scale), barkCol }
    const broadleafFall = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      if (onTrack(a.c[0], a.c[2], h * 0.34 * spread + 0.8)) {
        ctx.noteSuppressed("broadleafFall", `broadleafFall SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("broadleafFall", [a.c[0], a.c[1] + h * 0.6, a.c[2]],
               [h * 0.68 * spread, h, h * 0.68 * spread], { k, side });
      const lobes = Math.max(2, Math.min(5, Math.round(opts.lobes || 3)));
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.5), 0.22 + h * 0.012, h * 0.42 + 0.5,
             opts.barkCol || [0.36, 0.30, 0.24], 5, b);
      out._mat = MAT.FOLIAGE;
      // Shade the lower lobes: a single flat autumn colour flattens into a blob.
      const c2 = [col[0] * 0.82, col[1] * 0.80, col[2] * 0.76];
      for (let i = 0; i < lobes; i++) {
        const ang = i * (6.2832 / lobes) + hash(k + i * 1.9 + side) * 1.2, rr = h * 0.16 * spread;
        const p = vadd(vadd(vadd(a.c, a.u, h * (0.40 + i * 0.09)),
                            a.r, Math.cos(ang) * rr), a.t, Math.sin(ang) * rr);
        addFrustum(out, p, h * (0.30 - i * 0.05) * spread, h * (0.34 - i * 0.08) * spread,
                   h * 0.26, i ? c2 : col, 6, b);
      }
      addCone(out, vadd(a.c, a.u, h * 0.76), h * 0.24 * spread, h * 0.30, col, 6, b);
      out._mat = 0;
    };

    // acacia: the flat-topped thorn of the African veld — a bare trunk forking
    // low into one wide, shallow, near-horizontal crown. The umbrella IS the
    // silhouette; a rounded tree() canopy here reads as European parkland.
    //   opts: { spread (crown width in metres, default 2.4x h*0.35), layers, barkCol }
    const acacia = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(2, opts.spread) : h * 1.15;
      if (onTrack(a.c[0], a.c[2], spread * 0.5 + 0.8)) {
        ctx.noteSuppressed("acacia", `acacia SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("acacia", [a.c[0], a.c[1] + h * 0.8, a.c[2]], [spread, h, spread], { k, side });
      const bark = opts.barkCol || [0.34, 0.26, 0.18];
      const layers = Math.max(1, Math.min(3, Math.round(opts.layers || 2)));
      const c2 = [col[0] * 0.82, col[1] * 0.86, col[2] * 0.80];
      out._mat = MAT.WOOD;
      addCyl(out, vadd(a.c, a.u, -0.5), 0.28, h * 0.62 + 0.5, bark, 5, b);
      // Crown layer i is centred here. Its rise off the trunk is capped in
      // METRES, not held at a fraction of h: at h*0.14 per layer a 12 m tree
      // (the top of the 6 + hash*6 range) opened a 0.88 m step between slabs,
      // past the 0.6 m the grounding audit will bridge, so the canopy of every
      // TALL acacia read as floating clear of the tree carrying it — 22 of
      // cota's clusters and 6 of kyalami's, all crown slabs, never the trunk.
      const layerY = (i) => h * 0.80 + i * Math.min(h * 0.14, 1.0);
      for (const dr of [-1, 1])                                    // the low fork
        addBox(out, vadd(vadd(a.c, a.u, h * 0.68), a.r, dr * spread * 0.22),
               [spread * 0.44, 0.7, 0.22], bark, b);
      out._mat = MAT.FOLIAGE;
      // Flat slabs, not cones: the crown's top and bottom are both near-planar.
      for (let i = 0; i < layers; i++) {
        const f = 1 - i * 0.4;
        // The lowest slab thickens on tall trees so its underside still reaches
        // the fork top (h*0.68 + 0.35). That gap grows as h*0.12 - 0.80 and
        // passes the 0.6 m the audit bridges at h > ~11.7 — the other half of
        // the same defect. Thickening the slab rather than raising the fork is
        // deliberate: the fork halves are 0.22 deep and share both large face
        // planes with each other, so growing them pushed a pre-existing
        // same-facing coincidence over the coplanar audit's area threshold
        // (cota 12 -> 14 spots) for no visual gain.
        const t = i === 0 ? Math.max(0.9, 2 * (h * 0.12 - 0.90)) : 0.9 - i * 0.2;
        addBox(out, vadd(a.c, a.u, layerY(i)),
               [spread * f, t, spread * f], i % 2 ? c2 : col, b);
      }
      out._mat = 0;
    };

    // plane: the pollarded avenue tree (plátano / London plane) — a pale mottled
    // trunk under a BROAD FLATTENED crown of stacked cylinders. Pollarding is
    // why it is cylindrical: the crown is cut back to a disc every winter, which
    // no cone-stack species in this library can express.
    //   opts: { stages (1-3 crown discs), spread, trunkCol }
    const plane = (k, side, dist, h, col, opts) => {
      opts = opts || {};
      const a = anchor(k, side, dist), b = [a.r, a.u, a.t];
      const spread = opts.spread != null ? Math.max(0.5, Math.min(1.8, opts.spread)) : 1;
      const rad = (4.2 + h * 0.12) * spread;
      if (onTrack(a.c[0], a.c[2], rad + 0.6)) {
        ctx.noteSuppressed("plane", `plane SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      ctx.note("plane", [a.c[0], a.c[1] + h * 0.6, a.c[2]], [rad * 2, h, rad * 2], { k, side });
      const stages = Math.max(1, Math.min(3, Math.round(opts.stages || 2)));
      const c2 = [col[0] * 0.80, col[1] * 0.84, col[2] * 0.80];
      out._mat = MAT.WOOD;
      // Pale mottled bark is the plane tree's identity — built explicitly rather
      // than through tree(), whose dark trunk colour is not overridable.
      addCyl(out, vadd(a.c, a.u, -0.5), 0.42, h * 0.48 + 0.5,
             opts.trunkCol || [0.72, 0.70, 0.62], 6, b);
      out._mat = MAT.FOLIAGE;
      for (let i = 0; i < stages; i++)
        addCyl(out, vadd(a.c, a.u, h * (0.46 + i * 0.28)), rad * (1 - i * 0.28),
               h * (0.34 - i * 0.10), i ? c2 : col, 7, b);
      out._mat = 0;
    };

    // Distant mountain peak (world coords), pyramid so it reads as a summit, with
    // a lower foot skirt so it doesn't look like a floating spike. Simple/clean —
    // use mountain() for organic, colour-zoned, snow-capped summits.
    // onTrack() measures against the TARMAC half-width. The road mesh is wider
    // than that: a gravel runoff apron runs 2.2 m beyond the edge and the kerb
    // ribbons are props at ~1.35 m out. A landform only has to clear the tarmac
    // to pass the guard, so it can still bury the kerb and the runoff — which on
    // screen reads as the hillside covering the track. Landforms must clear the
    // road's whole built width, not just the racing surface.
    const ROAD_SKIRT = 2.6;
    const peak = (x, z, baseY, w, h, col) => {
      // The foot pyramid's base is a SQUARE of side w*1.5, so its CORNERS reach
      // w*0.75*sqrt(2) ~= w*1.061. The old w*0.75 guard measured to an edge
      // midpoint and let the four corners overhang it by 41 %.
      if (onTrack(x, z, w * 1.061 + ROAD_SKIRT)) {
        ctx.noteSuppressed("peak", `peak SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      ctx.note("peak", [x, baseY + h / 2, z], [w, h, w]);
      out._mat = MAT.ROCK;
      addPyramid(out, [x, baseY, z], [w, h, w], col, null);
      addPyramid(out, [x, baseY - 2, z], [w * 1.5, h * 0.45, w * 1.5], [col[0] * 0.9, col[1] * 0.92, col[2] * 0.9], null);
      // A smaller off-axis sub-peak breaks the perfect-pyramid read. Offset in
      // XZ, its own base Y and a NON-square base (w*0.6 × w*0.72) so its faces
      // align with neither the summit nor the foot — no same-facing coplanar
      // pair. Kept inside the w*1.061 guard footprint. Deterministic per (x,z).
      const pj = hash(x * 0.17 + z * 0.19), pa = pj * 6.2832, so = w * (0.25 + pj * 0.13);
      addPyramid(out, [x + Math.cos(pa) * so, baseY - 0.6, z + Math.sin(pa) * so],
        [w * 0.6, h * (0.5 + pj * 0.25), w * 0.72], [col[0] * 0.94, col[1] * 0.95, col[2] * 0.96], null);
      out._mat = 0;
    };
    // Organic mountain (world coords): irregular craggy summit with height colour
    // zones (forest → rock → snow). opts passes seed/snowline/colours — see
    // addMountain. A low foot skirt blends the base into the ground.
    const mountain = (x, z, baseY, w, h, opts) => {
      opts = opts || {};
      // The skirt is w*0.62, but addMountain displaces its base ring OUTWARD by
      // `rough`: a base point reaches w*0.5*(1+0.7*rough)*(1+0.35*rough), which
      // is ~w*0.70 at the default roughness. Guarding on the skirt alone let a
      // big rough dune throw a ridge clean over the racing surface — Zandvoort's
      // 58-100 m dunes reached 7.4 m INSIDE the tarmac edge, which reads on
      // screen as the hillside eating the track.
      const rough = opts.rough != null ? opts.rough : 0.34;
      const reach = (ww) =>
        ROAD_SKIRT +
        Math.max(ww * 0.62, ww * 0.5 * (1 + 0.7 * rough) * (1 + 0.35 * rough));
      // Shrink to fit before giving up. Suppressing punches a hole in the ridge
      // line; a narrower dune in the same place keeps the horizon continuous,
      // and the road always wins the overlap.
      let fit = w;
      for (let i = 0; i < 6 && onTrack(x, z, reach(fit)); i++) fit *= 0.88;
      if (onTrack(x, z, reach(fit))) {
        ctx.noteSuppressed("mountain", `mountain SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: w=${w}`);
        return;
      }
      if (fit < w) h *= Math.sqrt(fit / w);   // narrower dune, plausible slope
      w = fit;
      ctx.note("mountain", [x, baseY + h / 2, z], [w, h, w]);
      addFrustum(out, [x, baseY - 2, z], w * 0.62, w * 0.42, h * 0.18,
                 opts.forest || [0.20, 0.34, 0.20], 9, null);   // skirt
      addMountain(out, [x, baseY, z], w * 0.5, h, opts);
    };
    // Mountain ridge segment (world coords) — a prism whose ridge runs along
    // `ang` (radians, in the XZ plane). Chain these for a jagged range.
    const ridge = (x, z, baseY, ang, len, w, h, col) => {
      // Skip if footprint half-extent reaches tarmac.
      if (onTrack(x, z, Math.max(len, w) * 0.5 + ROAD_SKIRT)) {
        ctx.noteSuppressed("ridge", `ridge SUPPRESSED at x=${x.toFixed(0)} z=${z.toFixed(0)}: len=${len} w=${w}`);
        return;
      }
      ctx.note("ridge", [x, baseY + h / 2, z], [w, h, len]);
      const f = [Math.cos(ang), 0, Math.sin(ang)], r = [-f[2], 0, f[0]];
      // BURY the base. addPrism anchors at the BASE (Trap A in
      // docs/SCENERY-GROUNDING.md), so a prism placed at baseY has its underside
      // exactly there — and every one of the 28 ridge() calls across 24 circuits
      // passes `pyMin`, the lap's LOWEST NODE. The ground these backdrop ridges
      // actually stand on out there is the floor slab, and that sits at
      // `floorY = pyMin - 1` (js/track/surface.js) — so the ridge line perched
      // above its own ground by construction, fleet-wide. 206 of monza's 214
      // flagged clusters were this one helper.
      //
      // Sink the origin and add the SAME amount back to the height, so the
      // silhouette above ground is unchanged — dropping the origin alone would
      // shave SINK metres off every hill on 24 circuits. mountain() already does
      // the equivalent for its skirt (`baseY - 2`); ridge() was the sibling that
      // never got it.
      const SINK = 2;
      addPrism(out, [x, baseY - SINK, z], [w, h + SINK, len], col, [r, [0, 1, 0], f]);
      // One subordinate crest breaks the single clean wedge into a small range.
      // It gets its OWN heading (rotated ang) and a DEEPER buried base, so it
      // shares no plane with the main prism — no same-facing coplanar pair
      // (coplanar-faces.test.mjs counts those, and this helper fires 28× across
      // 24 circuits). Kept small and inside the footprint the onTrack guard
      // already cleared. Deterministic per (x,z) so a given ridge is stable.
      const jr = hash(x * 0.13 + z * 0.11 + ang);
      const a2 = ang + (jr - 0.5) * 0.6;
      const f2 = [Math.cos(a2), 0, Math.sin(a2)], r2 = [-f2[2], 0, f2[0]];
      const off = (0.06 + jr * 0.06) * len, dY = 1.0;
      addPrism(out,
        [x + f[0] * off, baseY - SINK - dY, z + f[2] * off],
        [w * 0.7, h * (0.42 + jr * 0.22) + SINK + dY, len * 0.4],
        col, [r2, [0, 1, 0], f2]);
    };
    // Populate a raked seating bank with speckled spectators. Front row sits at
    // clearance `gap` beyond the road edge and the bank rises `rise` m over
    // `depth` m of recede, split into blocks by aisles. Empty seats + a dark
    // riser behind each row read as shadow, not sky, through the gaps. At night
    // most bodies go dark with a sparse scatter of phone-lights / camera flashes.
    // Emitted with ctx.instance(..., {unguarded:true}) — spectators always sit
    // safely behind the shell, so the per-box on-road test is skipped for speed.
    // `lift` (optional) raises the whole bank on the up axis — used by
    // grandstandEx to stack an upper deck above the lower rake.
    const crowdBank = (k, side, gap, len, rise, depth, riserCol, lift) => {
      const a = anchor(k, side, gap), b = [a.r, a.u, a.t];
      const rows = Math.max(3, Math.round(rise / 1.4));
      const perRow = Math.max(6, Math.round(len / 1.15));
      const riser = riserCol || (NIGHT ? [0.10, 0.10, 0.13] : [0.28, 0.26, 0.27]);
      const y0 = lift || 0;
      for (let r = 0; r < rows; r++) {
        const f = (r + 0.5) / rows, up = y0 + f * rise, back = f * depth;
        // dark step riser behind each seating row (blocks sky/ground show-through).
        // Guarded (unlike the tiny spectator boxes): the riser is a wide flat slab,
        // so a mis-placed bank whose front row creeps toward the tarmac would
        // otherwise overhang the road here — the exact bypass the old unguarded
        // raw-addBox path used to leave open. rejBox drops only a riser actually
        // over the road; a bank
        // safely behind the shell never trips it, so intended crowds are unchanged.
        out._mat = MAT.CONCRETE;
        const riserC = vadd(vadd(a.c, a.u, up), a.r, side * back);
        // If the riser is rejected, this row has no seating — so skip its
        // spectators too. The bodies below go out unguarded, so without this
        // they stayed behind as a row of people sitting on thin air where the
        // stand had been dropped.
        if (rejBox(riserC, [1.3, 1.5, len], b)) continue;
        // The rejBox above stays explicit — it also decides whether this row's
        // spectators are emitted at all — so the replay below is UNGUARDED, which
        // is what this emitter already did before the graph migration.
        ctx.instance(`crowd-riser|${riser.join(",")}`,
          { o: riserC, r: a.r, u: a.u, t: a.t, s: [1, 1, len] },
          (rec) => { rec.mat(MAT.CONCRETE); rec.box([0, 0, 0], [1.3, 1.5, 1], riser); },
          { kind: "crowdRiser", k, side }, { unguarded: true });
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
          // torso + head lump. One model for every spectator in the game: the
          // per-person height jitter rides the node scale and the shirt colour
          // the node colour, so a full grandstand costs one 24-vertex box plus a
          // transform each. Crowds are the densest geometry the game emits —
          // spectatorHill alone runs ~70 verts/metre.
          ctx.instance("crowd-body",
            { o: c, r: a.r, u: a.u, t: a.t, s: [1, 0.72 + h2 * 0.2, 1], col },
            (rec) => { rec.mat(MAT.FABRIC); rec.box([0, 0, 0], [0.55, 1, 0.5], TrackGraph.NODE_COLOR); },
            { kind: "crowd", k, side }, { unguarded: true });
        }
      }
      out._mat = 0;
    };
    // grandstandEx(): the full raked-stand model. grandstand() below is the
    // legacy 6-arg entry point and delegates here with `opts` empty.
    //
    // opts (all optional):
    //   livery     name into TrackSceneryData.STAND_LIVERIES; supplies
    //              shell/roof/fascia/crowd colours in one go. Explicit
    //              shell/crowd args still win over the livery.
    //   tiers      1..3 raked decks stacked with a concourse band between them
    //   h          back-shell height (default 12)
    //   roof       "cantilever" (default) | "flat" | "truss" | "none"
    //   suites     glazed hospitality band (default ON when len≥48 + roof)
    //   endWalls   closing end walls (default ON when len≥40 + roof)
    //   pylons     roof support columns (default ON when len≥36)
    //   roofCol / fasciaCol / suiteCol   explicit colour overrides
    // Additive always-on for roofed stands: underside ribs + nose trim
    // (cantilever/flat), trackside sponsor fascia, back-shell panel seams.
    const grandstandEx = (s, side, gap, len, shell, crowd, opts) => {
      opts = opts || {};
      const lib = TrackSceneryData.STAND_LIVERIES || {};
      // STAND_SETS is the per-circuit stand FAMILY. It documented itself as the
      // rotation grandstandEx uses, but nothing read it — the table was dead
      // config and circuits hand-copied its values into local arrays instead.
      // It is now the FALLBACK, and only the fallback: an explicit opts.livery
      // or a positional `shell` colour still wins, so the call sites that
      // specify one (nearly all of them) are untouched. In practice this governs the handful of
      // calls that ask for a stand without saying what colour it is, which is
      // exactly what a house style is for.
      // Picked by HASH off the node index, not by a sequential cursor: a cursor
      // would mean inserting one stand recolours every stand after it on that
      // circuit, so an author adding a bleacher at Turn 2 silently repaints the
      // main grandstand. Hashing off k keeps every other stand where it was.
      let liveryName = opts.livery;
      if (!liveryName && !shell) {
        const set = (TrackSceneryData.STAND_SETS || {})[def && def.id]
          || TrackSceneryData.STAND_SET_DEF;
        if (set && set.length) {
          const kk = Math.round(s * n) % n;
          liveryName = set[Math.floor(hash(kk * 2.7 + side * 1.9) * set.length) % set.length];
        }
      }
      const liv = (liveryName && lib[liveryName]) || null;
      shell = shell || (liv && liv.shell) || null;
      crowd = crowd || (liv && liv.crowd) || null;
      const roofKind = opts.roof || "cantilever";
      const roofCol = opts.roofCol || (liv && liv.roof) || [0.86, 0.88, 0.92];
      const fasciaCol = opts.fasciaCol || (liv && liv.fascia) || shell || [0.40, 0.41, 0.46];
      const tiers = Math.max(1, Math.min(3, Math.round(opts.tiers || 1)));
      const shellH = opts.h != null ? Math.max(6, opts.h) : 12;

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
      // Guard strategy: the stand uses addBox directly to avoid place()'s
      // per-box onTrack guard, which fires false-positives at hairpins
      // (La Source at Spa, etc.). One single guard instead, on the crowd inner
      // face — skip only if the seating (= road edge + gap) literally sits on track.
      const oInner = side * (hw[k] + gap);
      const ifx = px[k] + r[0] * oInner, ifz = pz[k] + r[2] * oInner;
      if (onTrack(ifx, ifz, 0)) {
        ctx.noteSuppressed("grandstand", `grandstand SUPPRESSED at s=${s} side=${side}: gap=${gap} (inner face on track)`);
        return;
      }
      // Past the inner-face guard — this stand ships. Size is the back shell
      // (10 wide, 12 tall) run out to the stand's full length.
      ctx.note("grandstand", [px[k] + r[0] * oInner, groundYAt(k, gap) + 6, pz[k] + r[2] * oInner],
               [10, 12, len], { k, side });
      // Back shell — center at gap+7.5 beyond road edge
      const oShell = side * (hw[k] + gap + 7.5);
      const cShell = [px[k] + r[0] * oShell, groundYAt(k, gap + 7.5) + shellH / 2 - 0.8, pz[k] + r[2] * oShell];
      addBox(out, cShell, [10, shellH, len], shell || [0.40, 0.41, 0.46], [r, u, t]);
      // Raked crowd: speckled spectators rising from the front toward the shell.
      // (`crowd` colour, kept for call-site compatibility, tints the dark risers.)
      const riserTint = crowd ? [crowd[0] * 0.4, crowd[1] * 0.4, crowd[2] * 0.4] : null;
      crowdBank(k, side, gap + 1.5, len - 2, 7, 4.2, riserTint);
      // Upper decks: each extra tier is a shorter bank set back and lifted above
      // the one below, with a dark concourse band closing the step between them.
      // Two- and three-tier stands are how every large modern stand actually
      // reads on camera; one flat rake cannot produce that silhouette.
      const tierLift = [];
      for (let ti = 1; ti < tiers; ti++) {
        const lift = 7.6 * ti, back = 4.6 * ti, tl = len - 2 - ti * 4;
        if (tl < 8) break;
        const ca = anchor(k, side, gap + 1.5 + back);
        const cb = [ca.r, ca.u, ca.t];
        // concourse band under the deck — hides the gap between the rakes
        const bandC = vadd(ca.c, ca.u, lift - 0.9);
        if (!rejBox(bandC, [5.2, 1.8, tl], cb)) {
          addBox(out, bandC, [5.2, 1.8, tl], fasciaCol, cb);
          crowdBank(k, side, gap + 1.5 + back, tl, 7, 4.2, riserTint, lift);
        }
        tierLift.push(lift);
      }
      const topLift = tierLift.length ? tierLift[tierLift.length - 1] : 0;
      // Roof slab cantilevered over the crowd, lifted on the up axis
      const a = anchor(k, side, gap + 5);
      const roofY = 13 + topLift;
      const roofC = vadd(a.c, a.u, roofY);
      // The roof's own width, so the rear fascia below can be sized from it
      // rather than from a literal that has to be kept in step by hand.
      const roofW = roofKind === "truss" ? 12 : (roofKind === "flat" ? 10 : 12);
      if (roofKind !== "none") {
        if (roofKind === "truss") {
          // Open lattice: a thin deck on repeated cross-braces — reads as an
          // exposed steel roof rather than a solid slab.
          addBox(out, roofC, [12, 0.35, len + 2], roofCol, [a.r, a.u, a.t]);
          const bays = Math.max(2, Math.min(14, Math.round(len / 9)));
          for (let i = 0; i < bays; i++) {
            const off = ((i + 0.5) / bays - 0.5) * len;
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, roofY - 0.9), [11.4, 1.1, 0.5], roofCol, [a.r, a.u, a.t]);
          }
        } else {
          // "flat" sits tight over the shell; "cantilever" (default) overhangs.
          const rw = roofKind === "flat" ? 10 : 12;
          addBox(out, roofC, [rw, 0.8, len + 2], roofCol, [a.r, a.u, a.t]);
          // Underside ribs + trackside nose trim — a blank cantilever slab reads
          // as one thick lid; ribs break the underside and the nose casts a
          // hard shadow-line from trackside. Cheap (one box per bay) and shared
          // by every stand that does not already use the open "truss" roof.
          const ribCol = [roofCol[0] * 0.78, roofCol[1] * 0.78, roofCol[2] * 0.80];
          const ribs = Math.max(3, Math.min(18, Math.round(len / 7)));
          for (let i = 0; i < ribs; i++) {
            const off = ((i + 0.5) / ribs - 0.5) * len;
            addBox(out, vadd(vadd(a.c, a.t, off), a.u, roofY - 0.55),
                   [rw * 0.92, 0.22, 0.35], ribCol, [a.r, a.u, a.t]);
          }
          // Leading-edge gutter / nose along the trackside face of the roof.
          addBox(out, vadd(vadd(a.c, a.r, -side * (rw / 2 - 0.15)), a.u, roofY - 0.15),
                 [0.35, 0.55, len + 2.2], ribCol, [a.r, a.u, a.t]);
        }
        // Support columns under the roof's outer (trackside) edge.
<<<<<<< HEAD
        //
        // ⚠ addCyl is BASE-anchored (geom.js §addPrism: "addCyl/addCone/
        // addFrustum are base-anchored the same way"). This passed the MIDPOINT
        // — vadd(pc, u, H/2) — so every pylon on every circuit hung exactly
        // half its own height in the air: 9.6 m of daylight under Abu Dhabi's
        // 20 m posts, and floaters on 8 more circuits off this one line. It is
        // the eighth instance of the base-vs-centroid defect the geom.js note
        // enumerates. Measured over the 9 affected circuits: 95 -> 56 floating
        // clusters from seating the base alone.
        //
        // The foot is then extended DOWNWARD to the ground under its own world
        // x/z. A per-node lateral sample will not do: `off` runs along the
        // tangent at node k while the track curves away, so on a long curved
        // stand the post's true lateral distance is nowhere near gap+0.4 and
        // the verge has eased metres further down by then (monaco 31 -> 28).
        // Only ever lowering a foot already in place keeps this monotone —
        // re-siting it onto the per-node frame instead moved the row onto
        // different terrain and made Red Bull Ring WORSE (13 -> 15 floating
        // primitives), because a foot that lands somewhere new can land worse.
        if (opts.pylons) {
=======
        // Default ON for longer stands (len ≥ 36) — a floating roof is the
        // single most common "blank slab" read. Explicit opts.pylons:false
        // still opts out; short bleacher-length stands stay clean.
        const wantPylons = opts.pylons != null ? !!opts.pylons : len >= 36;
        if (wantPylons) {
>>>>>>> origin/cursor/synthetic-models-4d65
          const posts = Math.max(2, Math.min(12, Math.round(len / 14)));
          const H = roofY - 0.5;
          for (let i = 0; i < posts; i++) {
            const off = ((i + 0.5) / posts - 0.5) * len;
            const pc = vadd(vadd(a.c, a.t, off), a.r, -side * 4.6);
            // Ground under THIS post, queried by its actual WORLD x/z. A
            // per-node lateral sample is not enough: `off` runs along the
            // tangent at node k while the track curves away from it, so on a
            // long curved stand the post's true lateral distance is nowhere
            // near gap+0.4 and the terrain has eased metres further down by
            // then. groundUnder resolves the surface at the foot's own world
            // x/z, including off the terrain ribbon where these stands sit.
            // 0.3 m of embed absorbs the residual sampling disagreement.
            const drop = Math.max(0, pc[1] - groundUnder(pc[0], pc[2])) + 0.3;
            addCyl(out, vadd(pc, a.u, -drop), 0.28, H + drop,
                   fasciaCol, 6, [a.r, a.u, a.t]);
          }
        }
      }
      // Trackside sponsor fascia — a dark band hung under the roof's leading
      // edge so the stand reads as a framed structure rather than a bare box
      // with a lid. Always on when there is a roof; colour follows fasciaCol.
      if (roofKind !== "none") {
        const bandC = vadd(vadd(a.c, a.r, -side * 4.8), a.u, roofY - 1.7);
        if (!rejBox(bandC, [0.45, 1.4, len - 1], [a.r, a.u, a.t]))
          addBox(out, bandC, [0.45, 1.4, len - 1], fasciaCol, [a.r, a.u, a.t]);
      }
      // Back-shell panel seams: thin vertical strips on the track-facing shell
      // face so a 60 m wall does not read as one concrete slab.
      {
        const shellFace = side * (hw[k] + gap + 7.5 - 5.05);
        const seamCol = fasciaCol
          ? [fasciaCol[0] * 0.85, fasciaCol[1] * 0.85, fasciaCol[2] * 0.88]
          : [0.32, 0.33, 0.36];
        const seams = Math.max(2, Math.min(16, Math.round(len / 10)));
        for (let i = 1; i < seams; i++) {
          const off = (i / seams - 0.5) * len;
          addBox(out,
            [px[k] + r[0] * shellFace + t[0] * off,
             cShell[1],
             pz[k] + r[2] * shellFace + t[2] * off],
            [0.22, shellH * 0.92, 0.35], seamCol, [r, u, t]);
        }
        // Horizontal mid-band on the shell — breaks the tall blank face.
        addBox(out,
          [px[k] + r[0] * shellFace, cShell[1] + shellH * 0.12, pz[k] + r[2] * shellFace],
          [0.28, 0.55, len * 0.96], seamCol, [r, u, t]);
      }
      // Glazed hospitality band tucked under the roof at the back of the top rake.
      // Default ON for big stands (len ≥ 48) — modern F1 stands almost always
      // carry a glass hospitality strip; short stands stay plain.
      const wantSuites = opts.suites != null ? !!opts.suites : (roofKind !== "none" && len >= 48);
      if (wantSuites) {
        const sc = anchor(k, side, gap + 7.0);
        const suiteC = vadd(sc.c, sc.u, roofY - 2.6);
        const suiteCol = opts.suiteCol || (NIGHT ? [1.10, 1.02, 0.80] : [0.34, 0.46, 0.58]);
        if (!rejBox(suiteC, [3.2, 3.0, len - 3], [sc.r, sc.u, sc.t]))
          addBox(out, suiteC, [3.2, 3.0, len - 3], suiteCol, [sc.r, sc.u, sc.t]);
      }
      // Closing walls at both ends — stops a stand reading as a slab cut off
<<<<<<< HEAD
      // mid-air when seen from along the straight.
      // Same single-sample trap the pylons above were fixed for, and missed
      // here at the time: the wall is pushed +/-len/2 along the tangent from
      // a.c — 75 m on a 150 m stand — and then based at a.c's height, so on a
      // curved or sloping run it leaves the ground behind exactly as the posts
      // did. Reach down to the surface under the wall's own x/z instead.
      if (opts.endWalls) {
=======
      // mid-air when seen from along the straight. Default ON for longer roofed
      // stands (a roof:"none" shell stays open-ended like a bleacher backdrop).
      const wantEnds = opts.endWalls != null ? !!opts.endWalls
        : (roofKind !== "none" && len >= 40);
      if (wantEnds) {
>>>>>>> origin/cursor/synthetic-models-4d65
        for (const sgn of [-1, 1]) {
          const base = vadd(a.c, a.t, sgn * (len / 2));
          const drop = Math.max(0, base[1] - groundUnder(base[0], base[2])) + 0.3;
          const h = roofY - 1 + drop;
          const ec = vadd(base, a.u, (roofY - 1) / 2 - drop / 2);
          if (!rejBox(ec, [11, h, 0.5], [a.r, a.u, a.t]))
            addBox(out, ec, [11, h, 0.5], fasciaCol, [a.r, a.u, a.t]);
        }
      }
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
      if (roofKind !== "none") {
        const shellTop = cShell[1] + shellH / 2, roofUnder = roofC[1] - 0.4;
        if (roofUnder > shellTop - 0.1) {
          // Tuck the fascia's outer face just INSIDE the roof's rather than
          // dead flush with it. At the old literal gap+9 the 4 m-wide fascia
          // ended at gap+11 and so did the 12 m roof centred on gap+5 — two
          // large same-facing faces at zero gap, which fight at any distance
          // and were the widest-reach instance of it in the fleet. The fascia
          // is hidden by the roof from trackside, so 8 cm inboard costs
          // nothing; deriving it from roofW also keeps the "flat" roof (10 m,
          // where the fascia used to protrude a metre) tidy.
          const oF = side * (hw[k] + gap + 5 + roofW / 2 - 0.08 - 2);
          addBox(out, [px[k] + r[0] * oF, (shellTop + roofUnder) / 2, pz[k] + r[2] * oF],
                 [4, roofUnder - shellTop + 0.2, len], fasciaCol, [r, u, t]);
        }
      }
      // Under-roof lighting: a warm emissive strip beneath the roof slab so a
      // night grandstand reads as a lit, occupied stand instead of a dark hulk.
      if (NIGHT && roofKind !== "none")
        addBox(out, vadd(a.c, a.u, roofY - 0.65), [8.5, 0.28, len - 1], [1.30, 1.12, 0.74], [a.r, a.u, a.t]);
    };
    // Legacy 6-arg entry point — 33 call sites remain across js/circuits/*.js
    // vs 230 migrated to grandstandEx (counted 2026-08). With no opts,
    // grandstandEx reproduces the original geometry exactly.
    const grandstand = (s, side, gap, len, shell, crowd) =>
      grandstandEx(s, side, gap, len, shell, crowd, null);

    // spectatorHill(): informal grass-bank terracing — stepped earth risers
    // climbing away from the track with a sparse standing crowd on top. This is
    // what general-admission viewing actually looks like at Monza's Lesmo, Spa's
    // Pouhon banks, Suzuka's Spoon, COTA's Turn 1 and the Red Bull Ring's Green
    // Hill; a roofed grandstand() is the wrong silhouette for all of them and
    // costs far more geometry. Terrain-anchored per node, so it follows a slope.
    //   opts: { rows, rise, depth, grass, riser, density, step, crowd }
    const spectatorHill = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = Math.max(2, Math.min(8, Math.round(opts.rows || 4)));
      const rise = opts.rise != null ? opts.rise : 1.15;      // per-row height gain
      const depth = opts.depth != null ? opts.depth : 2.0;    // per-row setback
      const grass = opts.grass || [0.26, 0.42, 0.20];
      const riser = opts.riser || [0.30, 0.30, 0.28];
      const dens = opts.density != null ? Math.max(0.05, Math.min(1, opts.density)) : 0.65;
      const step = opts.step || 5;
      // The bank is a solid mass — index it so treelines cannot grow through it.
      ctx.indexSolid(s0, s1, side, gap, rows * depth + 1);
      ctx.along(s0, s1, step, (k, spacing) => {
        // ONE terrain sample per along-step, like crowdBank just above — every
        // row is offset from this SAME frame instead of re-anchoring per row.
        // Re-anchoring (the original implementation) samples a different
        // terrain point and a different terrain-tilted basis for every row, so
        // on any slope — not just a curve — independently-tilted boxes rotate
        // into each other: redbull's Green Hill measured 1.8 m of
        // interpenetration between rows this way. A single shared frame,
        // offset by translation, cannot self-intersect by construction.
        const a = anchor(k, side, gap);
        const b = [a.r, a.u, a.t];
        for (let r = 0; r < rows; r++) {
          const back = r * depth, up = r * rise;
          // Terrace tread: a wide flat step. Guarded — a bank creeping toward
          // the tarmac must be dropped, not left overhanging the road.
          const tc = vadd(vadd(a.c, a.u, up + rise * 0.5), a.r, side * back);
          if (rejBox(tc, [depth, rise + 0.5, spacing], b)) continue;
          out._mat = MAT.CONCRETE;
          addBox(out, tc, [depth, rise + 0.5, spacing], r % 2 ? riser : grass, b);
          out._mat = MAT.FABRIC;
          // Standing spectators on the tread — sparser and more scattered than a
          // seated crowdBank, which is what a grass bank reads like. Spaced at
          // 1.8 m rather than crowdBank's 1.15 m seat pitch: people stand further
          // apart on a bank, and the bodies are the bulk of this model's cost
          // (a long hill is repeated furniture, budget 10k verts per sector).
          const perRow = Math.max(2, Math.round(spacing / 1.8));
          for (let i = 0; i < perRow; i++) {
            const h1 = hash(k * 3.3 + r * 7.1 + i * 2.3 + side * 1.9);
            if (h1 > dens) continue;
            const h2 = hash(k * 5.9 + r * 2.7 + i * 6.1 + side * 4.3);
            const off = ((i + 0.5) / perRow - 0.5) * spacing + (h2 - 0.5) * 0.5;
            const c = vadd(vadd(vadd(a.c, a.t, off), a.u, up + rise + 0.55),
                           a.r, side * (back + (h2 - 0.5) * depth * 0.5));
            const col = NIGHT
              ? (h2 > 0.95 ? [2.4, 2.2, 1.9] : [0.12, 0.13, 0.17])
              : (opts.crowd || CROWD_DAY)[Math.floor(h2 * (opts.crowd || CROWD_DAY).length) % (opts.crowd || CROWD_DAY).length];
            // Standing bodies share one model the same way the seated ones do —
            // height on the node scale, shirt on the node colour. Unguarded, as
            // this emitter already was.
            ctx.instance("crowd-standing",
              { o: c, r: a.r, u: a.u, t: a.t, s: [1, 0.86 + h1 * 0.2, 1], col },
              (rec) => { rec.mat(MAT.FABRIC); rec.box([0, 0, 0], [0.5, 1, 0.46], TrackGraph.NODE_COLOR); },
              { kind: "crowd", k, side }, { unguarded: true });
          }
          out._mat = 0;
        }
      });
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
      // A hedge run is laid out purely by arc length and never asks whether
      // something solid is already standing on the line, so at Zandvoort it grew
      // straight through a tyre wall (frac 0.959, 1.25 m of shared volume). A
      // safety barrier outranks planting, so the hedge yields segment by segment
      // — the run keeps its ends and simply stops at the obstruction.
      // Clearance is decided BEFORE indexSolid registers the hedge's own mass,
      // or every segment would read as blocked by itself.
      const blocked = new Set();
      ctx.along(s0, s1, 4, (k) => {
        const p = anchor(k, side, gap);
        if (!ctx.barrierClear(p.c[0], p.c[2], HEDGE_W / 2)) blocked.add(k);
      });
      ctx.indexSolid(s0, s1, side, gap - HEDGE_W / 2, HEDGE_W);
      ctx.along(s0, s1, 4, (k, spacing) => {
        if (blocked.has(k)) return;
        const p = anchor(k, side, gap);
        if (onTrack(p.c[0], p.c[2], 1.2)) {
          ctx.noteSuppressed("hedge", `hedge SUPPRESSED at k=${k} side=${side}: gap=${gap}`);
          return;
        }
        // Scalloped clipped top instead of a dead-flat wall: a ±10% per-node
        // crest wobble on the base body, plus a narrower jittered lump riding the
        // crest. All jitter stays INSIDE HEDGE_W, so the indexSolid footprint
        // registered above is unchanged (no new clipping).
        const base = col || [0.18, 0.36, 0.16], hb = [p.r, p.u, p.t];
        const hj = h * (0.9 + hash(k * 5.1 + side) * 0.2);
        addBox(out, vadd(p.c, p.u, (hj - 0.4) / 2), [HEDGE_W, hj + 0.4, spacing], base, hb);   // base sunk 0.4
        const lump = 0.25 + hash(k * 7.7 + side) * 0.5, lx = (hash(k * 3.3 + side) - 0.5) * HEDGE_W * 0.4;
        addBox(out, vadd(vadd(vadd(p.c, p.u, hj + lump * 0.5 - 0.2), p.r, lx), p.t, (hash(k * 9.1) - 0.5) * spacing * 0.3),
               [HEDGE_W * (0.5 + hash(k * 2.2) * 0.3), lump, spacing * 0.55],
               [base[0] * 0.9, base[1] * 0.92, base[2] * 0.88], hb);
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
      if (kind === "fir")  return (2.1 + h * 0.06) * 1.15 + 0.4;   // conifer(): +15% jitter on the base tier
      if (kind === "palm") return 5.2;                    // frond hub 2.4 + blade spread
      // The five species emitters added for the identity pass. Each figure is
      // the emitter's OWN on-track guard radius at the default spread, so the
      // roadside scatter clears a fence by exactly what the species clears.
      if (kind === "cypress")       return 1.45 * jMax + 0.4;   // narrow column
      if (kind === "stonePine")     return h * 0.44 + 0.6;      // wide flat parasol
      if (kind === "broadleafFall") return h * 0.34 + 0.8;      // lobed crown
      if (kind === "acacia")        return h * 0.575 + 0.8;     // flat-topped thorn, spread = h*1.15
      if (kind === "plane")         return 4.2 + h * 0.12 + 0.6;  // pollarded avenue crown
      // tree() crown forms: vase spreads WIDER than round, columnar much
      // narrower. The roadside scatter's fence guard uses this, so it has to
      // track the actual widest cone in each form.
      if (kind === "vase")          return (4.0 + h * 0.17) * jMax + 0.4;
      if (kind === "weeping")       return (3.9 + h * 0.16) * jMax + 0.4;
      if (kind === "columnar")      return (1.5 + h * 0.05) * jMax + 0.4;
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
      //
      // WHAT THIS KNOB ACTUALLY DOES. along() quantises to whole nodes
      // (`step = max(1, round(stepM / ds))`) and every circuit resamples to
      // ds = 4.00 m, so this maps to exactly TWO reachable spacings:
      //   density > 0.25  → stepM < 6 m  → 1 node  → trees every 4 m
      //   density <= 0.25 → stepM >= 6 m → 2 nodes → trees every 8 m
      // Anything from 0.26 to 1.0 is the same treeline. Measured, not guessed:
      // 0.86 and 0.42 emit identical geometry.
      //
      // 4 m spacing is TIGHTER THAN THE CANOPY. A 30 m pine's canopyR is ~3.5 m,
      // so adjacent crowns overlap by ~3 m — and because this emitter alternates
      // pine/tree, the clip audit sees two DIFFERENT models interpenetrating and
      // counts every one. A dense belt is therefore worth tens of severe clip
      // spots by construction. That is accepted: real mixed woodland has
      // interlocking canopies, and thinning to 8 m to satisfy the metric costs
      // half the trees for a small fraction of the spots (measured on
      // hockenheim: 180 k props for 20 spots). Baseline it, don't thin it.
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
    //   opts: { form: "clump"(default) | "grass" | "agave", lobes }
    const bush = (k, side, dist, col, opts) => {
      const bform = (opts && opts.form) || "clump";
      const p = anchor(k, side, dist), b = [p.r, p.u, p.t];
      if (onTrack(p.c[0], p.c[2], 2)) {
        ctx.noteSuppressed("bush", `bush SUPPRESSED at k=${k} side=${side}: dist=${dist}`);
        return;
      }
      // Nominal envelope: lobes are radius ~1.1-2.0 spread over a ~0.6-1.1 m
      // offset, standing 2.2-3.2 m tall. A bush takes no size argument, so this
      // is the clump's typical extent rather than a measured bound.
      ctx.note("bush", [p.c[0], p.c[1] + 1.4, p.c[2]], [3, 2.8, 3], { k, side });
      const bc = col || [0.20, 0.38, 0.18];
      const c2 = [bc[0] * 0.90, bc[1] * 0.94, bc[2] * 0.88];
      const jh = hash(k * 4.3 + side * 2.1 + dist);
      let lobes = (opts && opts.lobes) || (jh < 0.4 ? 2 : 3);   // most clumps 2-3 lobes
      if (bform === "agave") {
        // Spiky rosette — desert circuits need something that is not a blob.
        out._mat = MAT.FOLIAGE;
        for (let i = 0; i < 6; i++) {
          const ang = i / 6 * 6.2832;
          const tip = vadd(vadd(vadd(p.c, p.u, 1.5), p.r, Math.cos(ang) * 1.3), p.t, Math.sin(ang) * 1.3);
          addCone(out, vadd(p.c, p.u, 0.2), 0.34, 1.9, bc, 4,
            [p.r, norm([tip[0] - p.c[0], 1.3, tip[2] - p.c[2]]), p.t]);
        }
        out._mat = 0;
        return;
      }
      if (bform === "grass") { lobes = 1; }   // a single low tussock
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

    return { anchor, groundUnder, pine, tree, palm, conifer,
             cypress, stonePine, broadleafFall, acacia, plane,
             peak, mountain, ridge,
             crowdBank, grandstand, grandstandEx, spectatorHill, bush, hedge, forestEdge,
             canopyR, forestEdgeNow, deferredFoliage };
  }

  return { create };
})();
