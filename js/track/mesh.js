/* Apex 26 — TrackMesh: the kerb/banking band + the road/terrain/floor mesh builders for the tracks engine. upOf() is the shared per-node up-basis, hash() the dete… */
const TrackMesh = (function () {
  "use strict";

  const __M = Math;

  const { cross, MAT } = TrackGeom;
  const { curvature, cr: catmull } = TrackSpline;
  const lerp = M4.lerp;

  function accumFaceN(nrm, pos, ia, ib, ic) {
    const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
    const ex1 = pos[ib * 3] - ax, ey1 = pos[ib * 3 + 1] - ay, ez1 = pos[ib * 3 + 2] - az;
    const ex2 = pos[ic * 3] - ax, ey2 = pos[ic * 3 + 1] - ay, ez2 = pos[ic * 3 + 2] - az;
    const nx = ey1 * ez2 - ez1 * ey2;
    const ny = ez1 * ex2 - ex1 * ez2;
    const nz = ex1 * ey2 - ey1 * ex2;
    nrm[ia * 3] += nx; nrm[ia * 3 + 1] += ny; nrm[ia * 3 + 2] += nz;
    nrm[ib * 3] += nx; nrm[ib * 3 + 1] += ny; nrm[ib * 3 + 2] += nz;
    nrm[ic * 3] += nx; nrm[ic * 3 + 1] += ny; nrm[ic * 3 + 2] += nz;
  }

  function upOf(track, k) {
    const t = [track.tx[k], track.ty[k], track.tz[k]];
    const r = [track.rx[k], track.ry[k], track.rz[k]];
    return cross(r, t);
  }
  const hash = (i) => { let x = __M.sin(i * 12.9898) * 43758.5453; return x - __M.floor(x); };

  // Corner apexes: local maxima of |curvature| above thresh. Returns
  // [{k, sign, lo, hi}] — sign is the raw curvature sign: sign>0 = LEFT turn
  // (measured; see the bank-zone note below), so its inside is the -x side and
  // its outside +x. lo/hi = node span where curvature stays above ~half the apex.
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

  // Below this the road is straight enough that its curvature SIGN carries no
  // information — the baked LUT ripples through zero on gentle sections, so a
  // sign read off it there is noise, not a direction. rad/m.
  const BANK_STRAIGHT_K = 0.004;
  const BANK_RESEAT_M = 60;
  const BANK_MAX_EDGE_GRADE = 0.05;

  // Author-driven banked corners. A track def can bank its corners three ways:
  //   • `bankZones: [{ turn, angleDeg, widthM }]` — anchor to a curated FIA
  //     turn apex (1-based index into def.turns). Already racing-space, so it
  //     takes NO rotation compensation and survives any future start-line
  //     remap. PREFER THIS: a lap fraction only means anything against the
  //     exact centreline it was measured on.
  //   • `bankZones: [{ frac, angleDeg, widthM }]` — an explicit fraction window
  //     in the pre-rotation authoring space (Madrid's La Monumental), OR
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

    // Smoothed curvature (~±12 m). Every direction decision below reads THIS,
    // never the raw LUT: raw curvature crosses zero repeatedly on gentle
    // sections, so a per-node sign taken off it would flap node to node.
    const SM = Math.max(1, Math.round(12 / ds));
    const ksm = new Float64Array(n);
    {
      const raw = new Float64Array(n);
      for (let k = 0; k < n; k++) raw[k] = curvature(track, k * ds);
      for (let k = 0; k < n; k++) {
        let sum = 0;
        for (let j = -SM; j <= SM; j++) sum += raw[(k + j + n) % n];
        ksm[k] = sum / (2 * SM + 1);
      }
    }

    function paint(kc, lo, hi, tanA, peak) {
      lo = Math.max(1, lo); hi = Math.max(1, hi);
      const span = lo + hi + 1;
      let dom = 0;
      for (let i = -lo; i <= hi; i++) dom += ksm[(kc + i + n) % n];
      const domSign = dom >= 0 ? 1 : -1;
      const signed = new Float64Array(span);
      for (let i = -lo; i <= hi; i++) {
        const k = (kc + i + n) % n, idx = i + lo;
        // cosine window: 1 at apex, 0 at the span edges
        const t = i <= 0 ? (i + lo) / lo : (hi - i) / hi;
        const w = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
        const mag = (peak != null ? peak : 2 * track.hw[k] * tanA) * w;
        // Outer edge is opposite the turn centre. +curv is a LEFT-hand turn
        // (measured: a zero-steer run through a +k corner drifts to POSITIVE
        // lateral, i.e. wide to the right), so its centre is left and its OUTER
        // edge is the right one.
        //
        // Read PER NODE. Taking it once at kc and smearing that one sign over
        // the whole window cambered the wrong way across every zone that spans
        // an inflection (65 of 190 shipped zones did), and on a zone centred on
        // a straight the single sample was pure LUT noise (37 more) — together
        // ~650 m of road that rolled the car toward the OUTSIDE of its turn.
        // Where the road is straight the sign means nothing, so the window's
        // dominant direction fills in: camber is only ever adverse to a turn.
        const kk = ksm[k];
        const dir = Math.abs(kk) >= BANK_STRAIGHT_K ? (kk > 0 ? 1 : -1) : domSign;
        signed[idx] = mag * dir;
      }
      for (let i = -lo; i <= hi; i++) {
        const k = (kc + i + n) % n, v = signed[i + lo], a = Math.abs(v);
        if (a > lift[k]) { lift[k] = a; bsign[k] = v >= 0 ? 1 : -1; }
      }
    }

    // Camber that reverses — inside a zone that spans an inflection, or between
    // two ADJACENT zones cambering opposite ways, where strongest-wins flips
    // the winner from one node to the next — must cross THROUGH flat rather
    // than snap between ±full lift, or the road edge gains a step no car can
    // track (measured 0.15 m/m at Mugello and 0.12 at Shanghai before this;
    // the code's cap is BANK_MAX_EDGE_GRADE = 0.05 — the 0.08 elsewhere is
    // the elevation-tracks spec's looser TOLERANCE, a different number).
    // Runs once on the assembled profile, so it catches
    // every transition regardless of which zone produced it. Each crossing
    // gets just enough run to hold BANK_MAX_EDGE_GRADE, and the blend may only
    // ever REDUCE a node's lift — it never invents banking anywhere.
    function relaxSignSteps() {
      const signed = new Float64Array(n);
      for (let k = 0; k < n; k++) signed[k] = lift[k] * bsign[k];
      const cuts = [];
      for (let k = 0; k < n; k++) {
        const a = signed[k], b = signed[(k + 1) % n];
        if (a === 0 || b === 0) continue;
        if ((a > 0) !== (b > 0)) cuts.push(k);
      }
      if (!cuts.length) return;
      const out = Float64Array.from(signed);
      for (const c of cuts) {
        const jump = Math.max(Math.abs(signed[c]), Math.abs(signed[(c + 1) % n]));
        const R = Math.max(2, Math.ceil(jump / (2 * BANK_MAX_EDGE_GRADE * ds)));
        for (let i = -R; i <= R; i++) {
          const k = (c + i + n) % n;
          let sum = 0;
          for (let j = -R; j <= R; j++) sum += signed[(k + j + n) % n];
          const v = sum / (2 * R + 1);
          if (Math.abs(v) < Math.abs(out[k])) out[k] = v;
        }
      }
      for (let k = 0; k < n; k++) {
        lift[k] = Math.abs(out[k]);
        if (out[k] !== 0) bsign[k] = out[k] > 0 ? 1 : -1;
      }
    }

    // Explicit authored zones take precedence over the curvature auto-pick.
    if (zones && zones.length) {
      // bankZones fracs were authored in the pre-rotation racing/arc space. The
      // 7a173519 start-line remap rotated racing space and compensated every
      // other frac-keyed dressing table via `def._sceneryShift` (see
      // buildCenterline's bridges/elevations) — but missed this one, so the
      // authored banks landed on whatever the rotation left at the raw frac
      // (Zandvoort's 19° Luyendyk bowl sat on a straight). Apply the same
      // shift, with the `sceneryLapMirror` negation racing-space anchors get in
      // TrackSpace.sceneryFrac: singapore's zones were authored against the
      // forward traversal like the rest of its dressing, and mirrored+shifted
      // 5 of its 6 land within 0.001 of the curated turn apexes (shift alone
      // moves two of them AWAY from their corners).
      const dress = def._sceneryShift || 0;
      const mirror = def.reverse && def.sceneryLapMirror ? -1 : 1;
      const turns = (def.turns && def.turns.length) ? def.turns : null;
      const wrap01 = TrackSpace.wrap01;
      const centre = new Array(zones.length).fill(null);
      const taken = new Set();

      // `turn:` anchors resolve straight off the curated apex table.
      zones.forEach((z, i) => {
        if (!turns || !Number.isFinite(z.turn)) return;
        const ti = ((Math.round(z.turn) - 1) % turns.length + turns.length) % turns.length;
        centre[i] = wrap01(turns[ti]);
        taken.add(ti);
      });

      // Frac anchors get the rotation compensation, then a sanity re-seat.
      // A zone whose compensated centre lands on a STRAIGHT more than
      // BANK_RESEAT_M from any apex has missed its corner outright — the
      // authored fraction no longer matches the centreline it was measured
      // against, and the bank ends up as a bump in the middle of nowhere
      // (Sochi, Watkins Glen, Estoril, Indianapolis and six more shipped that
      // way). Those move to the nearest unclaimed apex, closest pair first so
      // two zones never collapse onto one corner. A zone already ON a corner is
      // left exactly where it was authored: it may deliberately sit at entry
      // rather than apex, and re-seating it can only make it worse.
      const loose = [];
      zones.forEach((z, i) => {
        if (centre[i] !== null) return;
        const f = wrap01((z.frac || 0) * mirror + dress);
        centre[i] = f;
        if (!turns) return;
        if (Math.abs(ksm[Math.round(f * n) % n]) >= BANK_STRAIGHT_K) return;
        loose.push({ i, f });
      });
      if (loose.length) {
        const cand = [];
        for (const p of loose) {
          turns.forEach((tf, ti) => {
            let d = Math.abs(wrap01(tf) - p.f);
            if (d > 0.5) d = 1 - d;
            cand.push({ i: p.i, ti, d });
          });
        }
        cand.sort((a, b) => a.d - b.d);
        const seated = new Set();
        for (const c of cand) {
          if (seated.has(c.i) || taken.has(c.ti)) continue;
          seated.add(c.i); taken.add(c.ti);
          if (c.d * track.total > BANK_RESEAT_M) centre[c.i] = wrap01(turns[c.ti]);
        }
      }

      zones.forEach((z, i) => {
        const half = Math.max(1, Math.round((z.widthM || 40) / ds / 2));
        paint(Math.round(centre[i] * n) % n, half, half,
              Math.tan((z.angleDeg || 18) * Math.PI / 180), null);
      });
      relaxSignSteps();
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
      paint(c.k, c.lo + RUN, c.hi + RUN, TAN18, 2 * track.hw[c.k] * TAN18);
    }
    relaxSignSteps();
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
    // Real kerb stripes are ~1.6 m. The old `Math.round(1.6/ds)` node count
    // COLLAPSED to 1 at the ~4 m node grid, so an intended 1.6 m stripe rendered
    // at one node ≈ 4 m (an 8 m red/white period). Colour is per-vertex, so the
    // only way below node resolution is finer geometry — SUB sub-rings per node
    // span, coloured by TRUE ARC LENGTH so the stripe is ~STRIPE_M whatever the
    // node spacing. The node endpoints are unchanged (each span is subdivided by
    // lerping its own two rings), so where the ribbon meets terrain is identical
    // — the coplanar/float audits do not move.
    const STRIPE_M = 1.6;
    const SUB = Math.max(1, Math.round(ds / STRIPE_M));   // sub-rings per node span (≈2-3 at 4 m nodes)
    // one ribbon strip over node range, on `side` (-1 left edge, +1 right).
    function ribbon(k0, k1, side) {
      const count = k1 - k0;
      const base = [];         // ring vertex indices, one per emitted ring
      const arcs = [];         // arc length of each emitted ring, for striping
      let prev = null;         // [ax,ay,az,bx,by,bz] of the previous NODE ring
      let prevArc = 0;
      for (let i = 0; i <= count; i++) {
        const k = (k0 + i + n) % n;
        const u = upOf(track, k);
        const r = [track.rx[k], track.ry[k], track.rz[k]];
        const w = hw[k];
        // two rails; push the smaller offset first so winding matches the road
        const oA = side > 0 ? w + 0.05 : -(w + 0.05 + KW);
        const oB = side > 0 ? w + 0.05 + KW : -(w + 0.05);
        const hA = KH + bankOffsetAt(track, k, oA), hB = KH + bankOffsetAt(track, k, oB);
        // this node's two rail vertices, in world space
        const cur = [px[k] + r[0]*oA + u[0]*hA, py[k] + r[1]*oA + u[1]*hA + 0.03, pz[k] + r[2]*oA + u[2]*hA,
                     px[k] + r[0]*oB + u[0]*hB, py[k] + r[1]*oB + u[1]*hB + 0.03, pz[k] + r[2]*oB + u[2]*hB];
        const arc = k0 * ds + i * ds;   // monotone along the strip (ds-spaced nodes)
        const first = i === 0 ? 0 : 1;                 // skip t=0 duplicate after the first node
        for (let sIdx = first; sIdx <= SUB; sIdx++) {
          const t = i === 0 ? 1 : sIdx / SUB;          // node 0 emits only its own ring
          const rA = prev ? [prev[0] + (cur[0]-prev[0])*t, prev[1] + (cur[1]-prev[1])*t, prev[2] + (cur[2]-prev[2])*t] : [cur[0],cur[1],cur[2]];
          const rB = prev ? [prev[3] + (cur[3]-prev[3])*t, prev[4] + (cur[4]-prev[4])*t, prev[5] + (cur[5]-prev[5])*t] : [cur[3],cur[4],cur[5]];
          const ai = out.pos.length / 3;
          out.pos.push(rA[0], rA[1], rA[2]); out.nrm.push(u[0], u[1], u[2]);
          out.pos.push(rB[0], rB[1], rB[2]); out.nrm.push(u[0], u[1], u[2]);
          const a = prevArc + (arc - prevArc) * t;
          const c = (Math.floor(a / STRIPE_M) % 2) === 0 ? ka : kb;
          out.col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
          if (out.mat) out.mat.push(MAT.FLAT, MAT.FLAT);
          if (out.trk) out.trk.push(a, oA, 0, a, oB, 0);   // hw=0 → roadMarkings() skips the ribbon
          base.push(ai); arcs.push(a);
        }
        prev = cur; prevArc = arc;
      }
      for (let i = 0; i < base.length - 1; i++) {
        const a = base[i], b = base[i + 1];
        // match buildRoad winding (top face up under BACK-face culling)
        out.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    for (const c of findCorners(track, 0.006)) {
      const inside = c.sign > 0 ? -1 : 1;
      ribbon(c.k - c.lo, c.k + c.hi, inside);
      markKerb(c.k - c.lo, c.k + c.hi, inside);
      const exLen = Math.max(2, Math.round(c.hi * 0.7));
      ribbon(c.k + 1, c.k + 1 + exLen, -inside);
      markKerb(c.k + 1, c.k + 1 + exLen, -inside);
    }
  }

  function onKerb(track, s, x) {
    if (!track.kerbR) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    const hw = track.hw[k], ax = Math.abs(x);
    if (ax < hw - 0.6 || ax > hw + 1.1) return 0;
    if (x > 0 && track.kerbR[k]) return 1;
    if (x < 0 && track.kerbL[k]) return 1;
    return 0;
  }

  function bankAngle(track, s) {
    if (!track.bank) return 0;
    const n = track.n, L = track.total;
    const k = Math.floor((((s % L) + L) % L) / L * n) % n;
    return track.bank[k] || 0;
  }

  // `out` (optional): a reusable { dy, roll } scratch. When supplied it's written
  // in place and returned, so per-frame callers (once per car) avoid allocating a
  // fresh object each call. Still returns null on non-banked sections.
  // `smooth` (optional): interpolate the lift with Catmull-Rom instead of a
  // straight lerp. The lerp keeps the value continuous, which is all a CAR needs
  // — it rides the road mesh, and that mesh IS piecewise-linear through these
  // same nodes, so matching it exactly is correct. A CAMERA is different: it has
  // no obligation to the facets, and a C0 lift means its vertical velocity jumps
  // at every node. MEASURED in chase through Madrid's 24 % banked bowl, at stock
  // framing: worst vertical acceleration 27x its own rms, i.e. plainly
  // discontinuous, and 60x the size of the residue left on Monaco's climb after
  // the elevation was smoothed. Camera call sites opt in; nothing else changes.
  function banking(track, s, x, out, smooth) {
    const bp = track.bankP;
    if (!bp) return null;
    const n = track.n, L = track.total;
    const pos = (((s % L) + L) % L) / L * n;
    const k = Math.floor(pos) % n, j = (k + 1) % n, f = pos - Math.floor(pos);
    // Interpolate the signed cross-track lift so cars and cameras do not jump
    // between the road mesh's ~4 m longitudinal nodes.
    const sl = (i) => bp.lift[i] * bp.bsign[i];
    const signedLift = smooth
      ? catmull(sl((k - 1 + n) % n), sl(k), sl(j), sl((k + 2) % n), f)
      : lerp(sl(k), sl(j), f);
    if (!signedLift) return null;
    const w = smooth
      ? catmull(track.hw[(k - 1 + n) % n], track.hw[k], track.hw[j], track.hw[(k + 2) % n], f)
      : lerp(track.hw[k], track.hw[j], f);
    const cx = x < -w ? -w : x > w ? w : x;
    const o = out || {};
    o.dy = signedLift * cx / (2 * w);
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
  //
  // CELL=10 IS NOT WORTH SPLITTING. buildTerrain's over-track clip is the one
  // wide query (R = maxHw + 27 ~ 33 m) and at this cell it sweeps ~64 buckets to
  // find ~8 candidates, which looks like an obvious win for a second, coarser
  // grid. It was tried: a CELL=24 grid used for that query alone, verified
  // bit-identical on monza/spa/suzuka/zandvoort/vegas/silverstone (all five
  // buffers, element by element). Measured with both grids pre-warmed so the
  // timer covered query cost only, isolated buildTerrain moved 6 / 6 / 2 / 7 /
  // 0 percent — and buildTerrain is 5-15% of a build, so under 1% of load, for
  // a second grid and a per-cell cache. Reverted. A first pass that left grid
  // CONSTRUCTION inside the timer for the coarse arm only reported 4 / -1 / -2
  // / 5 / 3, i.e. the bias was worth more than the effect. If you revisit this,
  // pre-warm both arms or you will measure the wrong thing.
  function nodeGrid(track) {
    if (track._nodeGrid) return track._nodeGrid;
    const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
    const CELL = 10, OFFSET = 2048, STRIDE = 4096;   // numeric packed key, cf. glx.createChunkedMesh
    const map = new Map();
    let maxHw = 0;
    for (let k = 0; k < n; k++) {
      if (hw[k] > maxHw) maxHw = hw[k];
      const key = (__M.floor(px[k] / CELL) + OFFSET) * STRIDE + (__M.floor(pz[k] / CELL) + OFFSET);
      let arr = map.get(key); if (!arr) { arr = []; map.set(key, arr); } arr.push(k);
    }
    const grid = { maxHw };
    grid.query = (x, z, R, out, doSort) => {
      let cnt = 0;
      const x0 = __M.floor((x - R) / CELL), x1 = __M.floor((x + R) / CELL);
      const z0 = __M.floor((z - R) / CELL), z1 = __M.floor((z + R) / CELL);
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
    Log.info("track", "buildRoad start " + (track.def && track.def.id));
    const { n, px, py, pz, hw } = track;
    const pos = [], nrm = [], col = [], mat = [], trk = [];
    const idxArr = [];
    const grid = nodeGrid(track);              // shared node grid (also used by buildTerrain/buildProps)
    const _cand = new Array(n);                // reusable candidate scratch for the shoulder clip
    const pal = track.def.palette;
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
    const wearF = (v) => (v >= 5 && v <= 8) ? 0.86 : (v === 4 || v === 9 ? 1.07 : 1.0);
    const ds = track.total / n;
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
      const rise = [-0.05, -0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.02, -0.05];
      for (let v = 0; v < V; v++) {
        const o = offs[v];
        // Shared with buildKerbs so the two can never disagree about where the
        // banked surface is — see bankOffsetAt().
        const by = bankOffsetAt(track, k, o);
        const wx = px[k] + r[0] * o + u[0] * (rise[v] + by);
        let   wy = py[k] + r[1] * o + u[1] * (rise[v] + by) + 0.02;
        const wz = pz[k] + r[2] * o + u[2] * (rise[v] + by);
        if (v === 0 || v === 1 || v === 12 || v === 13) {
          const _cn = grid.query(wx, wz, grid.maxHw + 0.5, _cand, false);
          for (let _ci = 0; _ci < _cn; _ci++) {
            const j = _cand[_ci];
            let dd = __M.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;
            const ex = wx - px[j], ez = wz - pz[j];
            const lim = hw[j] - 0.3;
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
        // the two cannot disagree.
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
        idxArr.push(a + v, a + v + 1, b + v, a + v + 1, b + v + 1, b + v);
      }
    }
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
            if (py[k] - surf.ground[k] > 0.5) bottom = Math.max(bottom, py[k] - 1.2);
            if (bottom > ey - 0.3) bottom = ey - 0.3;
            const nx = track.rx[k] * sgn, nz = track.rz[k] * sgn;
            pos.push(ex, ey, ez, ex, bottom, ez);
            nrm.push(nx, 0, nz, nx, 0, nz);
            col.push(topC[0], topC[1], topC[2], botC[0], botC[1], botC[2]);
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
    Log.info("track", "buildTerrain start " + (track.def && track.def.id));
    const { n, px, py, pz, hw, total } = track;
    const pos = [], nrm = [], col = [], mat = [];
    const idxArr = [];
    const pal = track.def.palette, grass = pal.grass, runoff = pal.runoff;
    const bp = track.bankP;
    const ds = total / n;
    const grid = nodeGrid(track);              // shared node grid (built in buildRoad)
    const _cand = new Array(n);                // reusable candidate scratch for the over-track clip
    // (A per-node run-off-apron field was computed here for years — curvature
    // term, brake-zone look-ahead, four blur passes — and read by nothing:
    // the verge colour below grades on lateral fraction alone. It described a
    // feature that never shipped; deleted, geometry bit-identical.)
    // The terrain baseline (the level distant verts settle toward) is owned by
    // TrackSurface.profile — ribbon() reads surface.heightAt, which derives from
    // the profile's own pyMin/floorY (surface.js).
    // For bridge sections the terrain ribbon stays at ground level so the
    // elevated deck floats above flat ground (supported visually by the bridge
    // pillars in buildProps) instead of pulling the whole ground plane up with it.
    // That carve lives in surface.js `ground[]` — and it MUST, because the bridge
    // fracs are pre-rotation and need `def._sceneryShift` compensation. Do not
    // re-derive it here from a raw `b.s * total`: that lands the window two thirds
    // of a lap away — `TrackSurface.profile` in js/track/surface.js carries the fix.
    // Adaptive lateral verts per side: a gravel/runoff verge at the road edge graded
    // out to grass. The old bright concrete apron has been removed — it read as a
    // glaring light slab flanking the track — so the verge is gravel, not tarmac.
    // Street circuits push the ribbon further from the road edge so barriers
    // fully hide it and it cannot visually bleed onto the road surface.
    const surface = track.surface || TrackSurface.profile(track.def, track);
    const NTV = surface.rails.length;
    const isStreet = !!track.def.street;
    const flat = !!track.def.flatTerrain;
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
          const yBase = surface.heightAt(k, __M.abs(lats[v]));
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
            let dd = __M.abs(j - k); dd = dd < n - dd ? dd : n - dd;
            if (dd * ds < 6) continue;                  // always skip the vert's immediate own road
            const ex = wx - px[j], ez = wz - pz[j];
            const d2 = ex * ex + ez * ez;
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
                const dist = __M.sqrt(d2);
                const tt = __M.max(0, __M.min(1, (dist - nr) / (fr - nr)));
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
                const ownDist = __M.abs(o) - w;
                if (ownDist < 8) {
                  const hold = 1 - ownDist / 8;
                  const floorY = py[k] + bankOffsetAt(track, k, o) - 0.35;
                  if (tgt < floorY) tgt += (floorY - tgt) * hold;
                }
                if (wy > tgt) wy = tgt;
              }
            }
            const align = track.tx[k] * track.tx[j] + track.tz[k] * track.tz[j];
            if (align > 0.55 && dd * ds < 60 && !(isStreet && d2 > (hw[j] + 6) * (hw[j] + 6))) continue;
            const far = hw[j] + 12;
            if (d2 > far * far) continue;               // not over/near this node's tarmac
            const near = hw[j] + 1.0;
            const dist = __M.sqrt(d2);
            const tt = __M.max(0, __M.min(1, (dist - near) / (far - near)));
            const target = (roadYj - 1.6) + tt * tt * 1.6;   // dip under the road (banked), easing back to grade
            if (wy > target) wy = target;
          }
          pos.push(wx, wy, wz);
          nrm.push(0, 0, 0);
          const nz = (hash(k * 3 + v) - 0.5) * 0.04;
          // gravel/runoff verge at the road edge, grading out to grass (no apron)
          const gt = v / (NTV - 1);                          // 0 inner edge → 1 far
          const tc = [lerp(runoff[0], grass[0], gt), lerp(runoff[1], grass[1], gt), lerp(runoff[2], grass[2], gt)];
          col.push(tc[0] + nz, tc[1] + nz, tc[2] + nz);
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

      // REAL NORMALS for the ribbon just emitted. Every terrain vertex used to
      // be pushed with a hardcoded (0,1,0) — but this ribbon is not flat: it
      // tracks the road's elevation along the lap, grades down to the lap's low
      // point at its outer edge, and is carved DOWN under the road wherever
      // another part of the circuit passes nearby. With one up-normal
      // everywhere, all of that geometry shaded as though it were a level
      // plane, so a bank, an embankment and a flat verge took exactly the same
      // amount of sun. Measured on the built mesh: monaco's ribbon averages
      // 24.9° of real tilt, silverstone's 5.2°, none of which reached the
      // shading. tests/unit/terrain-normals.test.mjs guards the collapse back.
      //
      // SCOPE, measured — this is a correctness fix, NOT a cure for the scene
      // reading flat, which is what it was first justified as. A controlled A/B
      // on spa (identical camera eye to 3 dp, day, dry) moved the frame's mean
      // neighbour delta by -1.8% / +0.8% / +4.8% across chase, heli and an Eau
      // Rouge heli — small and mixed, not the visible change that claim
      // predicted. Most ground a player actually sees on an open circuit is
      // either the flat floor slab or terrain past the shading-detail range,
      // and the ribbon's steep parts are largely the carve channels beside the
      // road, which the road itself hides. Worth having because a constant
      // up-normal on non-flat geometry is simply wrong; not worth citing as a
      // flatness fix.
      //
      // Accumulate area-weighted face normals over the strip (area weighting
      // falls out of using the un-normalised cross product) and normalise once.
      // Done on the FULL grid rather than per-triangle so shared vertices blend
      // and the ribbon stays smooth instead of faceting. Cost is one pass over
      // the strip at build time; nothing per frame.
      for (let k = 0; k < n; k++) {
        const a = base + k * NTV, b = base + ((k + 1) % n) * NTV;
        for (let v = 0; v < NTV - 1; v++) {
          accumFaceN(nrm, pos, a + v, b + v, a + v + 1);
          accumFaceN(nrm, pos, a + v + 1, b + v, b + v + 1);
        }
      }
      for (let k = 0; k < n; k++) {
        for (let v = 0; v < NTV; v++) {
          const i3 = (base + k * NTV + v) * 3;
          const sgn = nrm[i3 + 1] < 0 ? -1 : 1;
          const nx = nrm[i3] * sgn, ny = nrm[i3 + 1] * sgn, nz2 = nrm[i3 + 2] * sgn;
          const l = __M.hypot(nx, ny, nz2);
          if (l > 1e-6) { nrm[i3] = nx / l; nrm[i3 + 1] = ny / l; nrm[i3 + 2] = nz2 / l; }
          else { nrm[i3] = 0; nrm[i3 + 1] = 1; nrm[i3 + 2] = 0; }
        }
      }
    }
    ribbon(latsL, false); ribbon(latsR, true);
    return { pos, nrm, col, mat, idx: idxArr };
  }

  function buildFloor(track) {
    Log.info("track", "buildFloor start " + (track.def && track.def.id));
    const { n, px, py, pz } = track;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, pyMin = Infinity;
    for (let k = 0; k < n; k++) {
      if (px[k] < minx) minx = px[k]; if (px[k] > maxx) maxx = px[k];
      if (pz[k] < minz) minz = pz[k]; if (pz[k] > maxz) maxz = pz[k];
      if (py[k] < pyMin) pyMin = py[k];
    }
    const margin = Math.max(1400, (maxx - minx), (maxz - minz));
    const x0 = minx - margin, x1 = maxx + margin;
    const z0 = minz - margin, z1 = maxz + margin;
    const y = track.surface ? track.surface.floorY : pyMin - 1.0;
    const pal = track.def.palette;
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
