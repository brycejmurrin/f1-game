/* Apex 26 — TrackMesh: the kerb/banking band + the road/terrain/floor mesh
   builders for the tracks engine. upOf() is the shared per-node up-basis,
   hash() the deterministic per-index jitter; findCorners/bankingProfile/
   buildKerbs/onKerb/bankAngle/banking form the kerb + banking band;
   nodeGrid/buildRoad/buildTerrain/buildFloor emit the drivable geometry.
   Everything is a pure function of the built track object (plus the global
   TrackSurface profile at call time) — no track state lives in this module.
   Load order: AFTER js/track/geom.js and js/track/spline.js (both destructured
   below at eval) and BEFORE js/track/tracks.js, which destructures TrackMesh
   at eval (hard edges, see tools/manifest.cjs). */
const TrackMesh = (function () {
  "use strict";

  // cross from js/track/geom.js; curvature (baked LUT reader) from
  // js/track/spline.js — eval-time destructures (hard edges).
  const { cross, MAT } = TrackGeom;
  const { curvature } = TrackSpline;
  const lerp = (a, b, t) => a + (b - a) * t;

  function upOf(track, k) {
    const t = [track.tx[k], track.ty[k], track.tz[k]];
    const r = [track.rx[k], track.ry[k], track.rz[k]];
    return cross(r, t);
  }
  const hash = (i) => { let x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

  // Corner apexes: local maxima of |curvature| above thresh. Returns
  // [{k, sign, lo, hi}] — sign>0 = right turn (center of curvature on the
  // right), lo/hi = node span where curvature stays above ~half the apex.
  function findCorners(track, thresh) {
    const n = track.n, ds = track.total / n;
    const kv = new Float32Array(n), sg = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const c = curvature(track, k * ds);
      kv[k] = Math.abs(c); sg[k] = Math.sign(c) || 1;
    }
    const sm = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      sm[k] = 0.25 * kv[a] + 0.5 * kv[k] + 0.25 * kv[b];
    }
    const corners = [];
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      if (sm[k] >= thresh && sm[k] >= sm[a] && sm[k] > sm[b]) {
        const half = sm[k] * 0.45;
        let lo = 0, hi = 0;
        while (lo < n / 4 && sm[(k - lo - 1 + n) % n] > half) lo++;
        while (hi < n / 4 && sm[(k + hi + 1) % n] > half) hi++;
        corners.push({ k, sign: sg[k], lo, hi });
      }
    }
    return corners;
  }

  // Author-driven banked corners. A track def can bank its corners two ways:
  //   • `bankZones: [{ frac, angleDeg, widthM }]` — bank explicit fraction
  //     windows at authored angles (used by Zandvoort's Hugenholtz/Luyendyk and
  //     Madrid's La Monumental), OR
  //   • `banked: true` — auto-pick the two highest-curvature corners and bank
  //     them at ~18° (legacy fallback for any track without bankZones).
  // Returns null when neither is present; otherwise per-node arrays describing how
  // much the OUTER road edge rises (metres) and which side that outer edge is on.
  // The lift is cosine-ramped to zero over the corner span, exactly like the
  // localized BRIDGES bump on py — so the rest of the lap stays dead flat (no
  // global tilt). buildRoad and buildTerrain both read this so the banked road
  // edge and the terrain that meets it rise together; game.js makes the car,
  // shadow and camera ride the banked surface (height + roll) so nothing floats.
  function bankingProfile(track) {
    const def = track.def;
    const zones = def.bankZones;
    if (!def.banked && !(zones && zones.length)) return null;
    const n = track.n;
    const ds = track.total / n;
    const lift = new Float32Array(n);
    const bsign = new Float32Array(n);   // outer side: +1 = right edge, -1 = left

    // Explicit authored zones take precedence over the curvature auto-pick.
    if (zones && zones.length) {
      for (const z of zones) {
        const frac = (((z.frac || 0) % 1) + 1) % 1;
        const kc = Math.round(frac * n) % n;
        const tanA = Math.tan((z.angleDeg || 18) * Math.PI / 180);
        const half = Math.max(1, Math.round((z.widthM || 40) / ds / 2));
        // Outer edge is opposite the turn centre. +curv is a LEFT-hand turn
        // (measured: a zero-steer run through a +k corner drifts to POSITIVE
        // lateral, i.e. wide to the right), so its centre is left and its OUTER
        // edge is the right one. This read "+ = right" and picked the inner edge,
        // so every authored bank zone banked AGAINST its corner; the agent-facing
        // corner label was inverted the same way, so the two cancelled and the
        // camber check passed while the road actually threw the car out.
        const outer = curvature(track, kc * ds) >= 0 ? 1 : -1;
        for (let i = -half; i <= half; i++) {
          const k = (kc + i + n) % n;
          // cosine window: 1 at apex, 0 at the span edges
          const t = 1 - Math.abs(i) / half;
          const w = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
          const add = 2 * track.hw[k] * tanA * w;
          if (add > lift[k]) { lift[k] = add; bsign[k] = outer; }
        }
      }
      return { lift, bsign };
    }

    // Legacy auto-pick: the two highest-curvature corners, banked at 18°.
    const corners = findCorners(track, 0.006);
    if (!corners.length) return null;
    const scored = corners.map((c) => ({ c, k: Math.abs(curvature(track, c.k * ds)) }));
    scored.sort((a, b) => b.k - a.k);
    const picks = scored.slice(0, 2).map((s) => s.c);
    const TAN18 = Math.tan(18 * Math.PI / 180);
    const RUN = 6;                       // extra run-in/out nodes each side
    for (const c of picks) {
      const outer = c.sign;              // outer edge is opposite the turn centre;
                                         // +curv = LEFT turn, so outer = right (see above)
      const peak = 2 * track.hw[c.k] * TAN18;
      const lo = c.lo + RUN, hi = c.hi + RUN;
      for (let i = -lo; i <= hi; i++) {
        const k = (c.k + i + n) % n;
        // cosine window: 1 at apex, 0 at the span edges
        const t = i <= 0 ? (i + lo) / lo : (hi - i) / hi;   // 0..1..0 ramp
        const w = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
        const add = peak * w;
        if (add > lift[k]) { lift[k] = add; bsign[k] = outer; }
      }
    }
    return { lift, bsign };
  }

  // Cross-track banking offset (metres along the node's up axis) at lateral
  // offset `o` from the centreline. THE single source of truth for the pivot:
  // the section rotates about its own centreline, so the inner edge drops
  // lift/2 and the outer edge rises lift/2, and anything past the tarmac clamps
  // to the corresponding edge height.
  //
  // Everything laid alongside the road must use this. buildRoad applied the
  // pivot inline while buildKerbs did not, so on Zandvoort's banked corners the
  // road edge moved +/-2.4 m while the kerb ribbon stayed at the unbanked
  // height — the tarmac fell away from its own kerb into a cliff on the low
  // side and swallowed it on the high side.
  function bankOffsetAt(track, k, o) {
    const bp = track.bankP;
    if (!bp) return 0;
    const lift = bp.lift[k];
    if (!(lift > 0)) return 0;
    const w = track.hw[k];
    let frac = (bp.bsign[k] * o + w) / (2 * w);
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    return lift * (frac - 0.5);
  }

  // Lay raised red/white kerb ribbons at corner apexes (inside edge, full
  // corner) and exits (outside edge, shorter), appended to the road mesh.
  function buildKerbs(track, out) {
    const { n, px, py, pz, hw } = track;
    const pal = track.def.palette, ka = pal.kerbA, kb = pal.kerbB;
    const ds = track.total / n;
    // per-node kerb map (which side has a kerb) so the car can detect riding one
    track.kerbL = new Uint8Array(n);
    track.kerbR = new Uint8Array(n);
    const markKerb = (k0, k1, side) => {
      for (let i = 0; i <= k1 - k0; i++) { const k = (k0 + i + n) % n; if (side > 0) track.kerbR[k] = 1; else track.kerbL[k] = 1; }
    };
    const KW = 0.9, KH = 0.06;
    const stripeNodes = Math.max(1, Math.round(1.6 / ds));
    // one ribbon strip over node range, on `side` (-1 left edge, +1 right).
    function ribbon(k0, k1, side) {
      const count = k1 - k0;
      const base = [];
      for (let i = 0; i <= count; i++) {
        const k = (k0 + i + n) % n;
        const u = upOf(track, k);
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const w = hw[k];
        // two rails; push the smaller offset first so winding matches the road
        const oA = side > 0 ? w + 0.05 : -(w + 0.05 + KW);
        const oB = side > 0 ? w + 0.05 + KW : -(w + 0.05);
        const ai = out.pos.length / 3;
        for (const o of [oA, oB]) {
          // Ride the banked road surface, not the unbanked centreline plane.
          const h = KH + bankOffsetAt(track, k, o);
          out.pos.push(px[k] + r[0] * o + u[0] * h, py[k] + r[1] * o + u[1] * h + 0.03, pz[k] + r[2] * o + u[2] * h);
          out.nrm.push(u[0], u[1], u[2]);
        }
        const c = (Math.floor(i / stripeNodes) % 2) === 0 ? ka : kb;
        out.col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
        // Painted kerb — smooth, like the road markings, so FLAT. Must stay in
        // lockstep with pos: buildRoad now ships a mat array and this writes
        // into the same accumulator.
        if (out.mat) out.mat.push(MAT.FLAT, MAT.FLAT);
        // hw = 0 so roadMarkings() skips the kerb ribbon — it is not road
        // surface and must not have edge lines painted across it. Lockstep with
        // pos (see the trk push in buildRoad).
        if (out.trk) out.trk.push(k * ds, oA, 0, k * ds, oB, 0);
        base.push(ai);
      }
      for (let i = 0; i < count; i++) {
        const a = base[i], b = base[i + 1];
        // match buildRoad winding (top face up under BACK-face culling)
        out.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    for (const c of findCorners(track, 0.006)) {
      const inside = c.sign > 0 ? 1 : -1;
      ribbon(c.k - c.lo, c.k + c.hi, inside);
      markKerb(c.k - c.lo, c.k + c.hi, inside);
      const exLen = Math.max(2, Math.round(c.hi * 0.7));
      ribbon(c.k + 1, c.k + 1 + exLen, -inside);
      markKerb(c.k + 1, c.k + 1 + exLen, -inside);
    }
  }

  // Is the car at arc-distance s, lateral offset x, riding a kerb? Kerbs sit just
  // outside the road edge at corners; a car counts as "on" one when it's near/over
  // the edge on a side that has a kerb here. Returns 0 (no) or 1 (yes).
  function onKerb(track, s, x) {
    if (!track.kerbR) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    const hw = track.hw[k], ax = Math.abs(x);
    // the kerb sits just OUTSIDE the road edge; a car is riding it when straddling
    // the edge on a side that has a kerb here (a band from a bit inside the edge
    // to ~1.1m past it).
    if (ax < hw - 0.6 || ax > hw + 1.1) return 0;
    if (x > 0 && track.kerbR[k]) return 1;
    if (x < 0 && track.kerbL[k]) return 1;
    return 0;
  }

  // Banking under a car at arc-distance s, lateral offset x: the surface offset
  // from the centreline (dy, metres) and its roll about the tangent
  // (rad, + tips the car toward the corner's inside). Lets game.js sit the car,
  // its shadow and the camera ON the banked road instead of the flat centreline.
  // Returns null on un-banked circuits/sections.
  // Authored per-segment bank angle (radians) at arc-position s. This is the bank
  // baked into the road basis from each segment's `b` field — the road and car
  // already tilt with it visually, but it's separate from the auto bankingProfile
  // (bankP) used by banking()/grip, so physics needs this to grant grip on
  // authored-banked corners (e.g. Zandvoort's banking).
  function bankAngle(track, s) {
    if (!track.bank) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    return track.bank[k] || 0;
  }

  // `out` (optional): a reusable { dy, roll } scratch. When supplied it's written
  // in place and returned, so per-frame callers (once per car) avoid allocating a
  // fresh object each call. Still returns null on non-banked sections.
  function banking(track, s, x, out) {
    const bp = track.bankP;
    if (!bp) return null;
    const n = track.n, L = track.total;
    const pos = (((s % L) + L) % L) / L * n;
    const k = Math.floor(pos) % n, j = (k + 1) % n, f = pos - Math.floor(pos);
    // Interpolate the signed cross-track lift so cars and cameras do not jump
    // between the road mesh's ~4 m longitudinal nodes.
    const signedLift = lerp(bp.lift[k] * bp.bsign[k], bp.lift[j] * bp.bsign[j], f);
    if (!signedLift) return null;
    const w = lerp(track.hw[k], track.hw[j], f);
    const cx = x < -w ? -w : x > w ? w : x;
    const o = out || {};
    // Pivot around the centreline: inner and outer edges move equally in
    // opposite directions instead of turning the bank into a longitudinal hump.
    o.dy = signedLift * cx / (2 * w);
    // Match the actual road-plane slope. game.js rotates the car basis with this
    // angle, making its up-axis perpendicular to the banked asphalt.
    o.roll = Math.atan2(signedLift, 2 * w);
    return o;
  }

  // Coarse XZ bucket of road-centreline node indices, built once per track and
  // shared by buildRoad's shoulder clip, buildTerrain's over-track clip and
  // buildProps' onRoadHit/onTrack guards. Each of those used to scan ALL n nodes
  // per emitted vertex/primitive (O(prims·n) — tens of millions of checks on the
  // city meshes); with the grid a query visits only the handful of nodes whose
  // footprint can reach the query point. The accept/reject maths in each caller
  // is unchanged — the grid only narrows the candidate SET to a superset of every
  // node that could pass, so the resulting geometry is identical.
  function nodeGrid(track) {
    if (track._nodeGrid) return track._nodeGrid;
    const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
    const CELL = 10, OFFSET = 2048, STRIDE = 4096;   // numeric packed key, cf. glx.createChunkedMesh
    const map = new Map();
    let maxHw = 0;
    for (let k = 0; k < n; k++) {
      if (hw[k] > maxHw) maxHw = hw[k];
      const key = (Math.floor(px[k] / CELL) + OFFSET) * STRIDE + (Math.floor(pz[k] / CELL) + OFFSET);
      let arr = map.get(key); if (!arr) { arr = []; map.set(key, arr); } arr.push(k);
    }
    const grid = { maxHw };
    // Write every node index whose cell lies within radius R of (x,z) into `out`,
    // returning the count. A node within R of (x,z) is within R on both axes, so
    // its (single) cell falls in the scanned cell rectangle — the candidate set is
    // always a superset of the nodes any caller's inner test could accept. When
    // `doSort` is set the indices are returned ascending, so a clip loop that
    // reads `wy` mid-iteration reproduces the original 0..n-1 sequencing exactly.
    grid.query = (x, z, R, out, doSort) => {
      let cnt = 0;
      const x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL);
      const z0 = Math.floor((z - R) / CELL), z1 = Math.floor((z + R) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const arr = map.get((cx + OFFSET) * STRIDE + (cz + OFFSET));
          if (!arr) continue;
          for (let a = 0; a < arr.length; a++) out[cnt++] = arr[a];
        }
      if (doSort) for (let a = 1; a < cnt; a++) { const v = out[a]; let b = a - 1; while (b >= 0 && out[b] > v) { out[b + 1] = out[b]; b--; } out[b + 1] = v; }
      return cnt;
    };
    track._nodeGrid = grid;
    return grid;
  }

  function buildRoad(track) {
    const { n, px, py, pz, hw } = track;
    const pos = [], nrm = [], col = [], mat = [], trk = [];
    const idxArr = [];
    const bp = track.bankP;
    const grid = nodeGrid(track);              // shared node grid (also used by buildTerrain/buildProps)
    const _cand = new Array(n);                // reusable candidate scratch for the shoulder clip
    const pal = track.def.palette;
    const ka = pal.kerbA, kb = pal.kerbB;
    const line = pal.line || [0.95, 0.95, 0.98];
    // Per-circuit tarmac & verge shade: nudge the base asphalt/grass by a stable
    // per-track hash so no two circuits share the exact same road tone — some
    // run a cooler/darker fresh-laid black, others a sun-bleached warmer grey;
    // verges range from lush to dry. Subtle (centred near 1.0) so deliberately
    // tuned palettes stay close to their authored colour.
    const _did = track.def.id || "";
    let _idn = 0; for (let _i = 0; _i < _did.length; _i++) _idn += _did.charCodeAt(_i) * (_i + 3);
    const _aBri = 0.85 + hash(_idn * 1.3) * 0.32;            // 0.85 … 1.17 brightness
    const _aWarm = (hash(_idn * 2.7) - 0.5) * 0.05;          // warm(+R/−B) ↔ cool skew
    const _bA = pal.asphalt || [0.17, 0.18, 0.21];
    const asphalt = [Math.max(0, _bA[0] * _aBri + _aWarm), _bA[1] * _aBri, Math.max(0, _bA[2] * _aBri - _aWarm)];
    const _gBri = 0.86 + hash(_idn * 3.9) * 0.30;            // verge lush ↔ dry
    const _gWarm = (hash(_idn * 4.4) - 0.5) * 0.07;
    const _bG = pal.grass || [0.30, 0.42, 0.22];
    const grass = [_bG[0] * _gBri + _gWarm, _bG[1] * _gBri, Math.max(0, _bG[2] * _gBri - _gWarm)];
    // Within-road wear: the racing line (centre verts) is rubbered darker; the
    // edges sit dustier/lighter — so the surface reads as used, not flat paint.
    const wearF = (v) => (v >= 5 && v <= 8) ? 0.86 : (v === 4 || v === 9 ? 1.07 : 1.0);
    const ds = track.total / n;
    // Cross-section, left to right (lateral offset, yRaise). Crisp painted
    // markings come from placing the two verts of each white band at the same
    // colour, then stepping sharply (5 cm) into the dark asphalt so the edge
    // stays a hard line instead of fading the whole width to grey. 14 verts:
    //   0 grass | 1 kerb | 2-3 bold edge line | 4 asphalt | 5 asphalt
    //   6-7 dashed centre line | 8 asphalt | 9 asphalt | 10-11 bold edge line
    //   12 kerb | 13 grass
    const V = 14;
    for (let k = 0; k < n; k++) {
      const u = upOf(track, k);
      const r = [track.rx[k], track.ry[k], track.rz[k]];
      const w = hw[k];
      const offs = [-w - 2.2, -w - 0.4,
                    -w, -w + 0.2, -w + 0.25,        // left edge line + step
                    -0.35, -0.30,                    // centre line (left half)
                    0.30, 0.35,                      // centre line (right half)
                    w - 0.25, w - 0.2, w,            // right step + edge line
                    w + 0.4, w + 2.2];
      // Grass-border verts (0,1,12,13) sit a hair below the asphalt plane to
      // avoid z-fighting at the verge seam. The real over-tarmac protection for
      // the inside of corners (the green-wedge fix) is the shoulder clip below;
      // keeping the shoulder only slightly recessed means props (fences, walls)
      // anchored to the terrain height still meet it with no gap underneath.
      const rise = [-0.05, -0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.02, -0.05];
      // (the per-node `dash` boolean lived here; the dash is now a continuous
      // function of s in roadMarkings(), so it no longer beats against the grid)
      // Banking pivots each cross-section around its centreline (inner edge
      // -> -lift/2, outer edge -> +lift/2). Verts past the road clamp to those
      // edge heights so kerbs/shoulders ride with it rather than tearing away.
      for (let v = 0; v < V; v++) {
        const o = offs[v];
        // Shared with buildKerbs so the two can never disagree about where the
        // banked surface is — see bankOffsetAt().
        const by = bankOffsetAt(track, k, o);
        const wx = px[k] + r[0] * o + u[0] * (rise[v] + by);
        let   wy = py[k] + r[1] * o + u[1] * (rise[v] + by) + 0.02;
        const wz = pz[k] + r[2] * o + u[2] * (rise[v] + by);
        // The grass shoulder verts (0,1,12,13) extend ~2 m past the tarmac edge.
        // On a tight corner the inside shoulder chords across the apex and would
        // render green OVER the racing line (Miami T6, s≈0.11). Bury any shoulder
        // vert that lands over ANOTHER node's tarmac just under that road, so the
        // asphalt always occludes it — mirrors buildTerrain's over-track clip.
        if (v === 0 || v === 1 || v === 12 || v === 13) {
          // Only nodes within hw[j]-0.3 (< maxHw) of the vert can clip it — query
          // the shared grid instead of scanning all n. Pure min op, no ordering.
          const _cn = grid.query(wx, wz, grid.maxHw + 0.5, _cand, false);
          for (let _ci = 0; _ci < _cn; _ci++) {
            const j = _cand[_ci];
            let dd = Math.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;
            const ex = wx - px[j], ez = wz - pz[j];
            const lim = hw[j] - 0.3;
            // Bury only near-grade chords. A shoulder well ABOVE the other road
            // is a bridge deck passing over it (Suzuka figure-8): burying it
            // tears a full-height green curtain from deck edge to lower grade.
            if (ex * ex + ez * ez < lim * lim && wy > py[j] - 0.05 && wy < py[j] + 3)
              wy = py[j] - 0.05;
          }
        }
        pos.push(wx, wy, wz);
        nrm.push(u[0], u[1], u[2]);
        // The start/finish line is a separate chequered decal mesh (buildStartLine)
        // laid just above the asphalt here at s=0 — far cleaner than painting a
        // whole road segment solid white, which read as a sprayed-on blob.
        // Per-vertex procedural material id. Until this existed the road was
        // emitted with NO mat array at all, so the whole surface was MAT.FLAT
        // and the material system never touched the one thing on screen for the
        // entire race. Painted markings stay FLAT deliberately — road paint is
        // smooth, and giving it aggregate relief makes the lines look gritty.
        // The painted markings are NO LONGER vertex colour — roadMarkings() in
        // the lit fragment shader draws the edge lines and the dashed centre
        // line analytically from the (s, x, hw) in `trk`. Columns 2/3/10/11 and
        // 6/7 still exist geometrically (they are removed in a follow-up) but
        // now carry plain asphalt, so the shader owns the paint outright and
        // the two cannot disagree. `line` stays referenced by nothing here.
        let c, m;
        if (v === 0 || v === 13) {
          c = grass; m = MAT.GRASS;
        } else if (v === 1 || v === 12) {
          c = grass; m = MAT.GRASS;   // kerb ribbons added separately by buildKerbs
        } else {
          // asphalt running surface: racing-line wear + subtle aggregate grain
          const f = wearF(v), grain = (hash(k * 13 + v) - 0.5) * 0.016;
          c = [asphalt[0] * f + grain, asphalt[1] * f + grain, asphalt[2] * f + grain];
          m = MAT.ASPHALT;
        }
        col.push(c[0], c[1], c[2]);
        mat.push(m);
        // Track-space coords for the fragment-side marking SDF (roadMarkings()
        // in js/render/shaders/lit.js). hw > 0 is what marks a vertex as road
        // SURFACE — the kerb ribbon and the edge skirt push hw 0 so they are
        // skipped. Must stay in lockstep with pos: three writers append here.
        trk.push(k * ds, o, w);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = k * V, b = ((k + 1) % n) * V;
      for (let v = 0; v < V - 1; v++) {
        // Wind CCW as seen from above (lateral verts run left->right, so the
        // top face is the front face) — otherwise BACK-face culling drops the
        // whole road. The quad is (k,v)-(k,v+1)-(k+1,v+1)-(k+1,v).
        idxArr.push(a + v, a + v + 1, b + v, a + v + 1, b + v + 1, b + v);
      }
    }
    // ── Edge skirts: close the slot under the road plane on elevation ────────
    // The road is a one-sided ribbon and the terrain's inner rail deliberately
    // sits below it (heightAt's -0.3 seam drop, and the clip passes above trench
    // it to py-1.6 near elevation mounds). Approaching a climbing corner the
    // camera looks at that slot edge-on and sees daylight/floor UNDER the road —
    // kerbs appear to float over a gap at every crest. Hang a vertical earth
    // skirt from each grass-shoulder edge vert (v=0 / v=13, their final clipped
    // positions) down past the deepest the adjacent terrain can sit, so the road
    // always reads as continuous ground. Double-sided (both windings) so it
    // shows from any angle; the below-terrain part is simply occluded.
    {
      const surf = track.surface ||
        (typeof TrackSurface !== "undefined" ? TrackSurface.profile(track.def, track) : null);
      if (surf) {
        const innerLat = surf.rails[0];
        const topC = [grass[0] * 0.72, grass[1] * 0.72, grass[2] * 0.72];
        const botC = [grass[0] * 0.42, grass[1] * 0.42, grass[2] * 0.42];
        const skirt = (v) => {
          const base = pos.length / 3;
          const sgn = v === 0 ? -1 : 1;
          for (let k = 0; k < n; k++) {
            const i3 = (k * V + v) * 3;
            const ex = pos[i3], ey = pos[i3 + 1], ez = pos[i3 + 2];
            // Deep enough for both the seam drop and the clip trench…
            let bottom = Math.min(surf.heightAt(k, innerLat), py[k] - 1.6) - 0.6;
            // …but on bridge spans stay a shallow deck fascia: the ground below
            // is meant to show under the deck (pillars carry it visually).
            if (py[k] - surf.ground[k] > 0.5) bottom = Math.max(bottom, py[k] - 1.2);
            if (bottom > ey - 0.3) bottom = ey - 0.3;
            const nx = track.rx[k] * sgn, nz = track.rz[k] * sgn;
            pos.push(ex, ey, ez, ex, bottom, ez);
            nrm.push(nx, 0, nz, nx, 0, nz);
            col.push(topC[0], topC[1], topC[2], botC[0], botC[1], botC[2]);
            // Vertical seam-filler that is normally occluded by the road above.
            // Left FLAT: the ground materials key off world XZ, which barely
            // varies across a vertical face and would streak.
            mat.push(MAT.FLAT, MAT.FLAT);
            // hw = 0: vertical seam filler, not road surface (see buildRoad).
            trk.push(k * ds, 0, 0, k * ds, 0, 0);
          }
          for (let k = 0; k < n; k++) {
            const a = base + k * 2, b = base + ((k + 1) % n) * 2;
            idxArr.push(a, a + 1, b, a + 1, b + 1, b);
            idxArr.push(a, b, a + 1, a + 1, b, b + 1);
          }
        };
        skirt(0); skirt(13);
      }
    }
    buildKerbs(track, { pos, nrm, col, mat, trk, idx: idxArr });
    return { pos, nrm, col, mat, trk, idx: idxArr };
  }

  function buildTerrain(track) {
    const { n, px, py, pz, hw, total } = track;
    const pos = [], nrm = [], col = [], mat = [];
    const idxArr = [];
    const pal = track.def.palette, grass = pal.grass, runoff = pal.runoff;
    const bp = track.bankP;
    const ds = total / n;
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _cand = new Array(n);                // reusable candidate scratch for the over-track clip
    // Run-off aprons on permanent (non-street) circuits: a wide tan gravel/tarmac
    // band where cars actually run wide — fast corners (high |curvature|) and the
    // braking zone at the end of a straight (curvature rising ahead). Street
    // circuits keep runoffAmt ~0 (their walls are right at the edge).
    const runoffAmt = new Float32Array(n);
    if (!track.def.street) {
      const cur = new Float32Array(n);
      for (let k = 0; k < n; k++) cur[k] = Math.abs(curvature(track, k * ds));
      const aheadNodes = Math.max(1, Math.round(60 / ds));  // ~60 m look-ahead
      for (let k = 0; k < n; k++) {
        // fast-corner term: corners with moderate (not hairpin) curvature shed
        // cars onto the run-off; peaks around 0.012 rad/m then tapers for slow turns
        const corner = Math.max(0, Math.min(1, cur[k] / 0.012)) * Math.max(0, 1 - cur[k] / 0.06);
        // braking-zone term: low curvature now but a corner soon ahead
        const ahead = cur[(k + aheadNodes) % n];
        const brake = Math.max(0, Math.min(1, ahead / 0.012)) * Math.max(0, 1 - cur[k] / 0.004);
        runoffAmt[k] = Math.max(corner, brake);
      }
      // smooth (closed-loop box blur, a few passes) so aprons grow/shrink gently
      for (let it = 0; it < 4; it++) {
        const src = new Float32Array(runoffAmt);
        for (let k = 0; k < n; k++) {
          const a = (k - 1 + n) % n, b = (k + 1) % n;
          runoffAmt[k] = 0.25 * src[a] + 0.5 * src[k] + 0.25 * src[b];
        }
      }
    }
    // Lowest point on the whole lap. The OUTER edge of every terrain ribbon
    // settles to this baseline so that, on circuits with real elevation, the far
    // grass of a raised section (e.g. COTA's Turn 1) never floats up across a
    // lower part of the lap as a plane bisecting the car. The inner seam still
    // tracks the road exactly; only the distant verts drop away.
    let pyMin = Infinity;
    for (let k = 0; k < n; k++) if (py[k] < pyMin) pyMin = py[k];
    // For bridge sections the terrain ribbon stays at ground level so the
    // elevated deck floats above flat ground (supported visually by the bridge
    // pillars in buildProps) instead of pulling the whole ground plane up with it.
    const gY = new Float32Array(py);
    const brs = track.def.bridges;
    if (brs) {
      const ds = total / n;
      for (const b of brs) {
        const cs = b.s * total;
        for (let k = 0; k < n; k++) {
          let d = Math.abs(k * ds - cs);
          d = Math.min(d, total - d);
          if (d < b.halfM) gY[k] -= b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
        }
      }
    }
    // Adaptive lateral verts per side: a gravel/runoff verge at the road edge graded
    // out to grass. The old bright concrete apron has been removed — it read as a
    // glaring light slab flanking the track — so the verge is gravel, not tarmac.
    // Street circuits push the ribbon further from the road edge so barriers
    // fully hide it and it cannot visually bleed onto the road surface.
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const NTV = surface.rails.length;
    const isStreet = !!track.def.street;
    // flatTerrain: a WIDE, dead-flat grass ribbon (a man-made island like Île
    // Notre-Dame sits ~level with the water, not sloping into it). Spreads the 5
    // verts evenly out to outerW and skips the lateral sag/ease so trees and props
    // sit on real ground all the way out instead of floating over a sunk fallback.
    const flat = !!track.def.flatTerrain;
    // Street ribbon is NARROW (out to ~street width, def.terrainOuter or 28 m) —
    // a city street's ground only reaches the buildings, and the flat buildFloor
    // slab fills everything beyond. A wide street ribbon at road grade chords over
    // PARALLEL straights running close in world space (Monaco out-and-back, Jeddah)
    // — the over-track clip skips same-direction neighbours, so it can't carve
    // those, and green pokes over the far straight. Keeping it narrow avoids ever
    // reaching a parallel road. Open/flat circuits keep the wide 120 m ribbon.
    const outerW = surface.outerW;
    const latsL = surface.rails.map((d) => -d);
    const latsR = surface.rails.slice();
    // flip: the right ribbon needs opposite winding to stay front-facing under BACK culling.
    function ribbon(lats, flip) {
      const base = pos.length / 3;
      for (let k = 0; k < n; k++) {
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const u = upOf(track, k);
        const w = hw[k];
        const bankLift = bp ? bp.lift[k] : 0;
        const bankSide = bp ? bp.bsign[k] : 0;
        for (let v = 0; v < NTV; v++) {
          const o = (lats[v] < 0 ? -w : w) + lats[v];
          const t = NTV <= 1 ? 1 : v / (NTV - 1);
          const yBase = surface.heightAt(k, Math.abs(lats[v]));
          // Match the centre-pivoted road bank at the verge, then taper its
          // signed height offset to zero so the far ground stays flat.
          let by = 0;
          if (bankLift > 0) {
            let frac = (bankSide * o + w) / (2 * w);
            frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
            by = bankLift * (frac - 0.5) * (1 - t);
          }
          const wx = px[k] + r[0] * o + u[0] * by;
          const wz = pz[k] + r[2] * o + u[2] * by;
          let wy = yBase + u[1] * by;
          // Clip terrain that rises OVER the track. The near verge verts sit at
          // ~road height, so on the INSIDE of a corner (and at crossings / fold-
          // backs / elevation changes) they can hang over the tarmac of a nearby
          // node and cover the racing surface with grass. Lower any such vert to
          // just under that road, easing the dip with distance so it slopes under
          // rather than stepping.
          //
          // Arc distance alone can't tell "my own road continuing straight" (must
          // leave alone — don't trench the verge) from "the track that curved away
          // right here" (must clip). The discriminator is HEADING: same tangent =
          // same road run → skip; diverging tangent = the track bends/folds over
          // this vert → clip, at ANY arc distance (so tight corners are caught).
          // Only nodes within hw[j]+26 (the widest clip radius, the channel carve)
          // of this vert can lower it — query the shared grid instead of all n.
          // Sorted ascending so the `wy`-dependent gates evaluate in the original
          // 0..n-1 order (this clip reads/updates `wy` as it iterates).
          const _cn = grid.query(wx, wz, grid.maxHw + 27, _cand, true);
          for (let _ci = 0; _ci < _cn; _ci++) {
            const j = _cand[_ci];
            let dd = Math.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;                  // always skip the vert's immediate own road
            const ex = wx - px[j], ez = wz - pz[j];
            const d2 = ex * ex + ez * ez;
            // The height to clip AGAINST is node j's ROAD SURFACE at the lateral
            // position this vert sits at — including j's banking. Clipping
            // against the bare centreline py[j] is wrong on any banked corner:
            // it carves the verge below a low edge that has itself dropped
            // 2.3 m, and leaves terrain sitting above a high edge that has
            // risen 2.3 m. Both happen at Zandvoort, where the hairpins double
            // back inside the clip radius of their own banked verges.
            const oj = ex * track.rx[j] + ez * track.rz[j];
            const roadYj = py[j] + bankOffsetAt(track, j, oj);
            // A vert (or the face it anchors) that lands ON another node's tarmac
            // is buried well under that road UNCONDITIONALLY — heading-independent.
            // This kills the green wedge where the inside verge of a corner chords
            // across the racing line (Miami T6, s≈0.11). The same-direction skip
            // below only protects the apron BAND outside the tarmac; a straight's
            // own verge sits ~2 m beyond its edge so it never enters this radius.
            const onEdge = hw[j] - 0.3;
            if (d2 < onEdge * onEdge) {
              if (wy > roadYj - 0.5) wy = roadYj - 0.5;
              continue;
            }
            // Elevated terrain hanging over a LOWER road: an elevation mound
            // (e.g. Miami's s≈0.42 Hard Rock rise, 280 m radius) bulges over a
            // flat part of the track that passes near it, covering the racing
            // line with green from up to ~20 m out — beyond the apron reach
            // below. Carve the road's channel through it: pull terrain that sits
            // clearly ABOVE this road down under it near the edge, easing back up
            // to the mound's natural height further out. Heading-independent, and
            // gated on wy>py[j]+0.3 so flat verges (always at/below grade) are
            // untouched.
            // Measured against j's banked surface, so a banked verge that
            // legitimately rises with its own tarmac is not mistaken for a mound
            // — while terrain genuinely hanging over the racing line still gets
            // carved, banked or not.
            if (wy > roadYj + 0.3) {
              const fr = hw[j] + 26, nr = hw[j] + 0.5;
              if (d2 < fr * fr) {
                const dist = Math.sqrt(d2);
                const tt = Math.max(0, Math.min(1, (dist - nr) / (fr - nr)));
                let tgt = (roadYj - 0.4) * (1 - tt * tt) + wy * (tt * tt);
                // A verge must still MEET the tarmac it borders. The channel
                // reaches 26 m to catch a broad mound (Miami's Hard Rock rise
                // bulges over the track from ~20 m out), but on a banked corner
                // whose lap doubles back — Zandvoort's hairpins run ~28 m apart —
                // that reach lands on the far road's own banked verge and drags
                // it a metre below the tarmac it belongs to, leaving a ledge
                // along the outside of the banking.
                //
                // Hold the vert at its OWN section's road-edge height for the
                // first few metres past the tarmac, releasing over 8 m so the
                // channel still wins where the mound actually is. Verts that sit
                // ON another road never get here: the unconditional bury above
                // fires first and continues.
                const ownDist = Math.abs(o) - w;
                if (ownDist < 8) {
                  const hold = 1 - ownDist / 8;
                  const floorY = py[k] + bankOffsetAt(track, k, o) - 0.35;
                  if (tgt < floorY) tgt += (floorY - tgt) * hold;
                }
                if (wy > tgt) wy = tgt;
              }
            }
            const align = track.tx[k] * track.tx[j] + track.tz[k] * track.tz[j];
            // Same-direction nearby road: normally leave the verge (it's this
            // straight's own apron). But on STREET circuits a narrow flat shelf at
            // road grade beside one straight chords over a PARALLEL same-direction
            // straight running close by (Monaco/Jeddah) — so still carve there when
            // the neighbour is a genuinely separate road (well beyond this verge).
            if (align > 0.55 && dd * ds < 60 && !(isStreet && d2 > (hw[j] + 6) * (hw[j] + 6))) continue;
            const far = hw[j] + 12;
            if (d2 > far * far) continue;               // not over/near this node's tarmac
            const near = hw[j] + 1.0;
            const dist = Math.sqrt(d2);
            const tt = Math.max(0, Math.min(1, (dist - near) / (far - near)));
            const target = (roadYj - 1.6) + tt * tt * 1.6;   // dip under the road (banked), easing back to grade
            if (wy > target) wy = target;
          }
          pos.push(wx, wy, wz);
          nrm.push(0, 1, 0);
          const nz = (hash(k * 3 + v) - 0.5) * 0.04;
          // gravel/runoff verge at the road edge, grading out to grass (no apron)
          const gt = v / (NTV - 1);                          // 0 inner edge → 1 far
          const tc = [lerp(runoff[0], grass[0], gt), lerp(runoff[1], grass[1], gt), lerp(runoff[2], grass[2], gt)];
          col.push(tc[0] + nz, tc[1] + nz, tc[2] + nz);
          // Match the material to the colour ramp the vert already sits on: the
          // inner band IS the gravel runoff, everything beyond it is grass. ROCK
          // rather than SAND for gravel — SAND's relief is a directional dune
          // ripple, which reads as dunes on a flat trap; ROCK is granular.
          mat.push(gt < 0.22 ? MAT.ROCK : MAT.GRASS);
        }
      }
      const faceSafe = (ia, ib, ic) => {
        const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
        const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
        const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
        const x = (ax + bx + cx) / 3, y = (ay + by + cy) / 3, z = (az + bz + cz) / 3;
        const cn = grid.query(x, z, grid.maxHw + 1, _cand, false);
        for (let qi = 0; qi < cn; qi++) {
          const j = _cand[qi], ex = x - px[j], ez = z - pz[j], lim = hw[j] - 0.15;
          if (ex * ex + ez * ez < lim * lim && y > py[j] + 0.12) return false;
        }
        return true;
      };
      const tri = (a, b, c) => { if (faceSafe(a, b, c)) idxArr.push(a, b, c); };
      for (let k = 0; k < n; k++) {
        const a = base + k * NTV, b = base + ((k + 1) % n) * NTV;
        for (let v = 0; v < NTV - 1; v++) {
          if (flip) {
            tri(a + v, a + v + 1, b + v);
            tri(a + v + 1, b + v + 1, b + v);
          } else {
            tri(a + v, b + v, a + v + 1);
            tri(a + v + 1, b + v, b + v + 1);
          }
        }
      }
    }
    // Street circuits have barriers and buildings right at the road edge —
    // no open terrain apron should be visible beside the car.
    // Street circuits now get the ribbon too (street lats above start at ±5 m so
    // the barrier still hides the seam). Previously they were skipped and relied
    // on the flat buildFloor slab at the lap's low point — which left a grey void
    // and floating props anywhere the road rose above that baseline (Baku castle
    // climb, Monaco's hills). The ribbon tracks the road height per node, so props
    // anchored via anchor()/groundYAt sit on real ground along the whole lap.
    ribbon(latsL, false); ribbon(latsR, true);
    return { pos, nrm, col, mat, idx: idxArr };
  }

  // A single large flat ground plane under the WHOLE circuit. Street circuits
  // skip the terrain ribbon (their barriers sit at the road edge), which used to
  // leave the city band floating over grey void; open circuits have the ribbon
  // but only out to ~120 m, so a big infield or the far horizon also showed
  // through. This floor fills both: it sits just below the lap's low point and
  // every other mesh (road, terrain, props) renders on top of it. It extends far
  // enough to meet the exp2 fog, so the ground reads continuously to the horizon.
  function buildFloor(track) {
    const { n, px, py, pz } = track;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, pyMin = Infinity;
    for (let k = 0; k < n; k++) {
      if (px[k] < minx) minx = px[k]; if (px[k] > maxx) maxx = px[k];
      if (pz[k] < minz) minz = pz[k]; if (pz[k] > maxz) maxz = pz[k];
      if (py[k] < pyMin) pyMin = py[k];
    }
    // Reach well past the track so the plane always disappears into fog/horizon
    // rather than ending in a visible edge, regardless of camera position.
    const margin = Math.max(1400, (maxx - minx), (maxz - minz));
    const x0 = minx - margin, x1 = maxx + margin;
    const z0 = minz - margin, z1 = maxz + margin;
    const y = track.surface ? track.surface.floorY : pyMin - 1.0;
    const pal = track.def.palette;
    // Match the terrain ribbon's outer colour (grass) so the seam is invisible on
    // open circuits; on street circuits grass is the neutral urban grey, which
    // reads fine as paved ground. Darkened slightly so the lit road still pops.
    const g = pal.grass || [0.30, 0.34, 0.22];
    const c = [g[0] * 0.88, g[1] * 0.88, g[2] * 0.88];
    const pos = [x0, y, z0,  x1, y, z0,  x1, y, z1,  x0, y, z1];
    const nrm = [0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0];
    const col = [c[0], c[1], c[2],  c[0], c[1], c[2],  c[0], c[1], c[2],  c[0], c[1], c[2]];
    // Double-sided (both windings) so the up-facing ground is never back-face
    // culled regardless of the renderer's winding convention.
    const idx = [0, 1, 2,  0, 2, 3,   0, 2, 1,  0, 3, 2];
    return { pos, nrm, col, idx };
  }

  // buildKerbs stays private — it is only ever appended to buildRoad's buffers.
  return { upOf, hash, findCorners, bankingProfile, bankOffsetAt, onKerb, bankAngle, banking,
           nodeGrid, buildRoad, buildTerrain, buildFloor };
})();
