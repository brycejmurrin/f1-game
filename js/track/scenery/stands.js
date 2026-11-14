/* Apex 26 — SceneryStands: bleacher, scaffold, terrace and tiered-bowl spans plus their shared crowd band.
   SceneryStructures.create passes its along() walker; bandSeq stays local to one build. */
const SceneryStands = (function () {
  "use strict";

  function create(ctx, along) {
    const { out, track, def, n, ds, hw, px, py, pz, NIGHT, MAT,
            indexBarrier,
            addBox, addCyl, addFrustum, addPrism, RAW, blockAt, post, recordBarrier,
            groundYAt, terrainYAt, onTrack, overheadSpan, hash, cross, norm, vadd,
            anchor, rejBox } = ctx;
    const { CROWD_DAY } = TrackSceneryData;
    // crowdBand(): the ONE crowd primitive these stands share. A crowd is a
    // continuous banded run plus SPARSE SPECKLE standing proud of it — never one
    // box per spectator. At the ~1 m seat pitch the hand-rolled versions used,
    // a single bleacher emitted ~30 bodies per row per bay; that is how Vegas
    // reached 1.8 M prop verts. At night the individual bodies are invisible
    // anyway — what the eye picks up is the scatter of phone screens on top of
    // an unbroken dark mass, which is exactly what the speckle is for.
    // `len` is the ALONG-TRACK segment this band covers (see along()'s contract).
    // `side` is the stand's side, so the speckle can always be nudged TOWARD the
    // track (which is -side along r) rather than into the seating behind it.
    const CROWD_FALLBACK = [[0.86, 0.30, 0.24], [0.92, 0.90, 0.86],
                            [0.24, 0.36, 0.62], [0.72, 0.63, 0.30]];
    // Per-call MIN_SEP slot (as nature.js's hillSeq): a band crossing another
    // stand — fuji's terrace bays run through grandstandEx shells and rakes —
    // landed 7-13 mm off their faces, a fight from ~190 m. Each band moves
    // OUTWARD and ALONG by TrackGeom.SEP_SLOTS on two permutations, so
    // consecutive bands differ by >= MIN_SEP on both axes and neither side
    // faces nor end caps sit near the authored grid. <= 16.5 cm stays on its
    // own tread (the next row's riser is further back than that).
    // #2204 — tier rows on a bend. Size each row to the Euclidean chord to its
    // neighbours at that lateral (shorten inside, lengthen outside) WITHOUT
    // clamping to `spacing` (that left saw-tooth gaps outside). Cap the
    // lengthening at spacing·(1+|κ|·|x|) so a hairpin fold's back-row chord
    // cannot stretch a box across the apex. Aim along the neighbour chord on
    // moderate bends so the ends meet; past the centre of curvature drop the row.
    const curveTier = (a, kn, latFromAnchor, halfW, factor, spacing, side, gap, k) => {
      const xAnchor = side * (hw[k] + gap);
      const lat = xAnchor + latFromAnchor;
      const at = (anc, L) => vadd(anc.c, anc.r, L);
      const p = at(a, latFromAnchor);
      let cMin = Infinity, swing = 0;
      const nbr = [];
      for (const q of kn) {
        const pq = at(q, latFromAnchor);
        const d = Math.hypot(pq[0] - p[0], pq[1] - p[1], pq[2] - p[2]);
        if (d > 1e-6) { cMin = Math.min(cMin, d); nbr.push(pq); }
        for (const s of [-1, 1]) {
          const p2 = at(a, latFromAnchor + s * halfW);
          const q2 = at(q, latFromAnchor + s * halfW);
          const d2 = Math.hypot(q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]);
          if (d2 > 1e-6) cMin = Math.min(cMin, d2);
        }
        const dx = q.c[0] - a.c[0], dy = q.c[1] - a.c[1], dz = q.c[2] - a.c[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        const cos = Math.abs((dx * a.t[0] + dy * a.t[1] + dz * a.t[2]) / dl);
        swing = Math.max(swing, Math.sqrt(Math.max(0, 1 - cos * cos)) / Math.max(0.2, cos));
      }
      if (!(cMin < Infinity)) return { seg: 0, off: null, b: [a.r, a.u, a.t] };
      let κ = 0;
      if (kn.length >= 2) {
        const prev = kn[1], next = kn[0];
        const e1x = a.c[0] - prev.c[0], e1z = a.c[2] - prev.c[2];
        const e2x = next.c[0] - a.c[0], e2z = next.c[2] - a.c[2];
        const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
        κ = Math.atan2(e1x * e2z - e1z * e2x, e1x * e2x + e1z * e2z) / ((l1 + l2) / 2);
      }
      // Hairpin / fold ceiling: never longer than the curvature-scaled arc.
      // This κ is the x-z cross product, NEGATIVE on a left turn (the opposite of
      // the track's +k = LEFT), and lat is +right, so the outside of a bend is
      // κ·lat < 0 (#4967, measured: every row whose neighbour chord exceeds
      // `spacing` has κ·lat < 0). `1 + κ·lat` shortened outside rows instead,
      // more for every tier further back. κ is measured on the ANCHOR curve
      // (offset xAnchor), whose arc is already longer; back it out to the
      // centreline's before scaling `spacing` (a centreline step) to `lat`.
      const κ0 = κ / Math.max(0.05, 1 + κ * xAnchor);
      const arc = 1 - κ0 * lat;
      // The 1.85 ceiling is the FOLD guard: a row aimed along its own tangent
      // (the sharp-bend branch below) or on the INSIDE must not stretch across
      // an apex. A row on the OUTSIDE of a moderate bend is aimed along the
      // neighbour chord, and that chord is already the exact length that meets
      // its neighbours: no cap there. Capping it (at 1.85x, then at the local
      // arc ratio) opened 4-12 m gaps behind Jerez's 10-row terraces, where the
      // anchors 26-54 m back are irregular (consecutive chords 13.5, 22.7, 25.8,
      // 13.9 m) and the local κ under-reads them (W30 / #2204, 2026-11-10).
      // FOLDED: past the centre of curvature the row's neighbour chord runs
      // BACKWARDS against the station's tangent (or nearly across it) — that,
      // not the local κ, is the fold the cap exists for. An unfolded chord-aimed
      // row on the INSIDE was capped to spacing x arc too: 1.5 m boxes on 8 m
      // stations at Jerez's 0.89 terrace, where the anchor kinks over-read κ.
      let folded = true;
      if (nbr.length >= 2) {
        const fx = nbr[0][0] - nbr[1][0], fy = nbr[0][1] - nbr[1][1], fz = nbr[0][2] - nbr[1][2];
        // The chord's SIGN against a.t is not a fold by itself (the aim below
        // flips a reversed chord: a stand authored s1 < s0, a tier anchor), so
        // on the OUTSIDE (arc > 1, which cannot be past the centre) only a
        // chord across the tangent counts; inside, a reversed one does too.
        const dt = (fx * a.t[0] + fy * a.t[1] + fz * a.t[2]), fl = Math.hypot(fx, fy, fz) || 1;
        folded = (arc > 1 ? Math.abs(dt) : dt) < 0.5 * fl;
      }
      const chordAimed = nbr.length >= 2 && Math.abs(κ * spacing) < 0.55;
      const curveCap = chordAimed && !folded && arc >= 0.9 ? Infinity : spacing * Math.max(0.15, Math.min(1.85, arc));
      // MIDPOINT TO MIDPOINT (chord-aimed rows). A row's box should run from
      // the midpoint of its chord to the previous station to the midpoint of
      // its chord to the next one: those midpoints are where its neighbours'
      // boxes end too, so the joints close. The box axis is already their
      // difference (next - prev, the chord aim below); its length is
      // |p_next - p_prev| / 2 and its centre (2p + p_prev + p_next) / 4 — off
      // the station by `off` (a sub-10 cm sideways part is dropped, below). A box
      // CENTRED on the station and sized to its SHORTER chord (the old rule)
      // left half the difference open on the long side wherever the chords
      // differ: 239 of 1508 Jerez row pairs over the 0.5 m contract, max
      // 12.3 m, where consecutive back-row chords run 13.5, 22.7, 25.8, 13.9 m
      // (W30 / #2204, 2026-11-10). Spanning (cN + cP) / 2 along t instead
      // overshoots both midpoints on a kink (buenos_aires: rows 1.6 m into the
      // next station's, clip-audit severe).
      // The ends are measured at the row's centre and both edges: on a bend the
      // edge with the longer span would open by the wedge (row depth x turn).
      // Sized to it, the short edge overlaps instead, inside the mass; that
      // overlap is held to JOINT_OVERLAP so a ~30 deg step cannot drive a row
      // >= 1 m into its neighbour (clip-audit severe). No swing shortening: that
      // is for a row aimed along its own tangent, whose corners swing into the
      // neighbour. A tangent-aimed row (sharp bend, or a lone neighbour at the
      // first / last station) keeps the old symmetric rule.
      const JOINT_OVERLAP = 0.8;
      let c, off = null, swingCut = halfW * swing;
      if (chordAimed && !folded && arc >= 0.9) {
        const prev = kn[1], next = kn[0];
        let lMin = Infinity, lMax = 0;
        for (const e of [0, -halfW, halfW]) {
          const pp = at(prev, latFromAnchor + e), pn = at(next, latFromAnchor + e);
          const le = Math.hypot(pn[0] - pp[0], pn[1] - pp[1], pn[2] - pp[2]) / 2;
          lMin = Math.min(lMin, le); lMax = Math.max(lMax, le);
        }
        c = Math.min(lMax, lMin + JOINT_OVERLAP, curveCap);
        const pp = at(prev, latFromAnchor), pn = at(next, latFromAnchor);
        const raw = [(pp[0] + pn[0] - 2 * p[0]) / 4, (pp[1] + pn[1] - 2 * p[1]) / 4, (pp[2] + pn[2] - 2 * p[2]) / 4];
        // A SMALL sideways (sagitta) part is dropped: under SAGITTA_SNAP it
        // closes next to nothing, but it is exactly the move that lands a row
        // face inside the 2 cm coplanar band of dressing a circuit laid flush
        // against the authored row line (mexico's seal-terrace riser lips stand
        // 24 mm proud of the row fronts; an 8-20 mm sagitta made 5 coplanar
        // spots, coplanar-faces 0 -> 5; the row's own rotation moves its face
        // too, so 6 cm still left one spot and 10 cm is the measured clear).
        // A larger one is kept: the deep bowl tiers and sharp terrace steps
        // need it to meet.
        const SAGITTA_SNAP = 0.10;
        const cx = pn[0] - pp[0], cy = pn[1] - pp[1], cz = pn[2] - pp[2], cl = Math.hypot(cx, cy, cz) || 1;
        const along = (raw[0] * cx + raw[1] * cy + raw[2] * cz) / cl;
        const slide = [cx / cl * along, cy / cl * along, cz / cl * along];
        const side3 = [raw[0] - slide[0], raw[1] - slide[1], raw[2] - slide[2]];
        off = Math.hypot(side3[0], side3[1], side3[2]) < SAGITTA_SNAP ? slide : raw;
        swingCut = 0;
      } else {
        c = Math.min(cMin, curveCap);
      }
      if (!(c > 1.0)) return { seg: 0, off: null, b: [a.r, a.u, a.t] };
      // The (1 − factor) pad is capped at 4 cm: a full 2 % of a ~4 m chord left
      // 7 cm between bays, and a legless bay's rows then hang free (ground-audit).
      const l = (c - swingCut) - (1 - factor) * Math.min(c, 2);
      let t = a.t;
      if (nbr.length >= 2 && Math.abs(κ * spacing) < 0.55) {
        let tx = nbr[0][0] - nbr[1][0], ty = nbr[0][1] - nbr[1][1], tz = nbr[0][2] - nbr[1][2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        t = [tx / tl, ty / tl, tz / tl];
        if (t[0] * a.t[0] + t[1] * a.t[1] + t[2] * a.t[2] < 0) t = [-t[0], -t[1], -t[2]];
      }
      let rx = a.r[0], ry = a.r[1], rz = a.r[2];
      const rt = rx * t[0] + ry * t[1] + rz * t[2];
      rx -= t[0] * rt; ry -= t[1] * rt; rz -= t[2] * rt;
      let rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-6) { rx = a.r[0]; ry = a.r[1]; rz = a.r[2]; rl = 1; }
      const r = [rx / rl, ry / rl, rz / rl];
      const uu = cross(t, r);
      const ul = Math.hypot(uu[0], uu[1], uu[2]) || 1;
      let u = [uu[0] / ul, uu[1] / ul, uu[2] / ul];
      if (u[0] * a.u[0] + u[1] * a.u[1] + u[2] * a.u[2] < 0) {
        u = [-u[0], -u[1], -u[2]];
        return { seg: l < 1.0 ? 0 : l, off, b: [[-r[0], -r[1], -r[2]], u, t] };
      }
      return { seg: l < 1.0 ? 0 : l, off, b: [r, u, t] };
    };
    // A curveTier box's centre: the station point moved by its midpoint offset.
    const tierAt = (pt, ct) => (ct && ct.off ? vadd(pt, ct.off, 1) : pt);
    let bandSeq = 0;
    const crowdBand = (c, b, side, thick, h, len, pal, dens, seed) => {
      if (len <= 0.5) return;
      const slot = bandSeq++ % 4, SL = TrackGeom.SEP_SLOTS;
      c = vadd(vadd(c, b[0], side * SL[slot]), b[2], SL[(slot * 3 + 1) % 4]);
      const cols = (pal && pal.length) ? pal : (CROWD_DAY && CROWD_DAY.length ? CROWD_DAY : CROWD_FALLBACK);
      const pick = (t) => NIGHT
        ? (t > 0.945 ? [2.5, 2.3, 1.9] : t > 0.55 ? [0.10, 0.11, 0.14] : [0.15, 0.16, 0.20])
        : cols[Math.floor(t * cols.length) % cols.length];
      const prevMat = out._mat;
      out._mat = MAT.FABRIC;
      const bt = hash(seed * 1.7);
      // Night mass is always the dark fabric slab; phone-screen speckle is separate below (#2204).
      const bandCol = NIGHT ? (bt > 0.55 ? [0.10, 0.11, 0.14] : [0.15, 0.16, 0.20])
        : pick(bt);
      addBox(out, c, [thick, h, len], bandCol, b);
      // One speckle head per ~6 m, capped — the same budget monza's tieredBowl
      // arrived at by hand. Each stands proud of the band (taller, nudged
      // trackward) so it is never coplanar with it: buried inside it would cost
      // vertices and show nothing.
      const cnt = Math.min(16, Math.floor(len / 6));
      for (let i = 0; i < cnt; i++) {
        const hp = hash(seed + i * 13.7);
        if (hp > dens) continue;
        const headH = NIGHT ? 0.16 : 0.30;
        const skin = [[0.83, 0.62, 0.44], [0.57, 0.35, 0.22], [0.94, 0.77, 0.60]][i % 3];
        const off = cnt > 1 ? (i / (cnt - 1) - 0.5) * (len - 2) : 0;
        addBox(out, vadd(vadd(vadd(c, b[2], off), b[1], h / 2 + headH / 2),
                         b[0], -side * thick * 0.25),
               [Math.min(thick * 0.5, 0.28), headH, NIGHT ? 0.18 : 0.28], NIGHT ? pick(hash(seed * 3.1 + i)) : skin, b);
      }
      out._mat = prevMat;
    };
    // Was the one DIVERGENT copy in the tree — `Math.max(lo, Math.min(hi, v))`
    // against everyone else's comparison ladder. VERDICT: not a bug. The two
    // forms differ only ABOVE an inverted range (lo > hi: the Math form pins to
    // lo, the ladder to hi), on -0, and on a non-number argument (Math coerces,
    // `<`/`>` do not). All eight call sites below pass literal lo < hi and a
    // finite number — every `rows`/`tiers`/`density` in js/circuits/ is a
    // numeric literal — so the swap is output-identical, verified by
    // tools/track/verify-track.cjs. Migrated rather than left so the divergence
    // cannot be mistaken for intent later.
    const clamp = M4.clamp;

    const bleacher = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 7), 2, 16);
      const rise = opts.rise != null ? opts.rise : 0.72;      // per-row height gain
      const setback = opts.setback != null ? opts.setback : 0.95;   // per-row recede
      const timber = opts.frame === "timber";
      const frameCol = opts.frameCol || (timber ? [0.42, 0.33, 0.24] : [0.62, 0.63, 0.66]);
      const plankCol = opts.plankCol || (timber ? [0.55, 0.50, 0.43] : [0.60, 0.61, 0.64]);
      const riserCol = opts.riserCol || [plankCol[0] * 0.78, plankCol[1] * 0.78, plankCol[2] * 0.76];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.62;
      const step = opts.step || 6;
      const lift = opts.lift || 0;
      const depth = rows * setback + 1.0;
      const topH = lift + 0.6 + rows * rise;
      ctx.noteSpan("bleacher", s0, s1, side, gap, { h: topH, rows });
      // A stand is a solid mass — index it so treelines and the roadside scatter
      // cannot grow through it (the hand-rolled versions never did this).
      ctx.indexSolid(s0, s1, side, gap, depth);
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap);
        const nb = Math.max(1, Math.round(step / ds));
        const kn = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap));
        const mid = curveTier(a, kn, side * depth / 2, setback / 2, 0.98, spacing, side, gap, k);
        const seg = mid.seg, b = mid.b;
        if (seg <= 0) return;
        if (rejBox(tierAt(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2), mid),
                   [depth, topH, seg], b)) return;
        const backLat = side * (rows - 0.5) * setback;
        out._mat = timber ? MAT.WOOD : MAT.METAL;
        addCyl(out, vadd(a.c, a.u, -0.4), 0.14, 1.4, frameCol, 5, b);                    // front stub leg
        // Back leg: it carries the crest rail (centre topH + 0.55, 0.16 thick),
        // so it runs up to the rail's mid-line. Stopping at topH + 0.2 left the
        // rail's underside floating 0.27 m over it — unsupported once the rows
        // rise past ~0.8 m and the top crowd band no longer bridges the gap.
        const legH = opts.rail !== false ? topH + 0.95 : topH + 0.6;
        addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, -0.4), 0.17, legH, frameCol, 5, b);   // back leg
        // Horizontal ledgers every ~2.2 m — what makes a frame read as a frame.
        for (let y = 1.6; y < topH; y += 2.2)
          addBox(out, vadd(vadd(a.c, a.r, backLat / 2), a.u, y),
                 [Math.abs(backLat) + 0.4, 0.12, 0.12], frameCol, b);
        // Diagonal cross-braces on the side face — bolted bleachers always
        // triangulate; without these the frame reads as a ladder of boxes.
        if (topH > 2.5 && Math.abs(backLat) > 1.2) {
          const braceCol = [frameCol[0] * 0.9, frameCol[1] * 0.9, frameCol[2] * 0.92];
          for (const sgn of [-1, 1]) {
            const midP = tierAt(vadd(vadd(a.c, a.r, backLat / 2), a.u, topH * 0.45), mid);
            addBox(out, vadd(midP, b[2], sgn * seg * 0.42),
                   [Math.abs(backLat) * 0.95, 0.10, 0.10], braceCol, b);
          }
        }
        for (let r = 0; r < rows; r++) {
          const lat = side * r * setback, y = lift + 0.6 + r * rise;
          const row = curveTier(a, kn, lat, setback / 2, 0.98, spacing, side, gap, k);
          const rc = tierAt(vadd(vadd(a.c, a.r, lat), a.u, y), row.seg ? row : mid);
          const rs = row.seg || seg, rb = row.b;
          out._mat = timber ? MAT.WOOD : MAT.METAL;
          addBox(out, rc, [setback * 1.05, 0.16, rs], plankCol, rb);                     // tread plank
          // Foot board: its nose MIN_SEP behind the plank's, its top at the
          // plank's mid-plane — at 12-22 mm off the plank's both faces fight
          // from ~240 m, and are flush outright at rise 1.0.
          addBox(out, vadd(vadd(rc, a.r, -side * (setback * 0.525 - 0.08 - TrackGeom.MIN_SEP)), a.u, -rise * 0.5),
                 [0.16, rise, rs], riserCol, rb);                                        // foot board
          // 0.60: the band's foot 13 cm over the plank (< ground-audit's 15 cm
          // GAP), so a curve-shortened bay's crowd still reads as seated (#2204).
          crowdBand(vadd(rc, a.u, 0.60), rb, side, 0.58, 0.78, rs - 0.6,
                    opts.crowd, dens, k * 13.1 + r * 97.3 + side * 5.7);
        }
        if (opts.rail !== false) {
          out._mat = timber ? MAT.WOOD : MAT.METAL;
          // Its own tier at the back lateral: sized from the mid-depth tier it
          // fell short on the outside of a bend (the rows behind it reach further).
          const rail = curveTier(a, kn, backLat, 0.09, 0.98, spacing, side, gap, k);
          addBox(out, tierAt(vadd(vadd(a.c, a.r, backLat), a.u, topH + 0.55), rail.seg ? rail : mid),
                 [0.18, 0.16, rail.seg || seg], frameCol, rail.seg ? rail.b : b);
        }
        out._mat = 0;
      }, `bleacher|${side}|${gap}|${rows}|${rise}|${setback}|${lift}|${step}`);
    };

    const scaffoldStand = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 5), 2, 12);
      const rise = opts.rise != null ? opts.rise : 1.15;
      const setback = opts.setback != null ? opts.setback : 1.9;
      const tube = opts.tubeCol || [0.62, 0.63, 0.66];
      const deck = opts.deckCol || [0.70, 0.66, 0.60];
      const bench = (opts.bench && opts.bench.length) ? opts.bench
        : [[0.80, 0.78, 0.74], [0.30, 0.36, 0.52], [0.72, 0.28, 0.24]];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.58;
      const step = opts.step || 6;
      const legEvery = Math.max(1, Math.round(opts.legEvery || 2));
      const depth = rows * setback + 1.2;
      const topH = 1.2 + rows * rise;
      ctx.noteSpan("scaffoldStand", s0, s1, side, gap, { h: topH, rows });
      ctx.indexSolid(s0, s1, side, gap, depth);
      let bay = 0;
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap);
        const nb = Math.max(1, Math.round(step / ds));
        const kn = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap));
        const mid = curveTier(a, kn, side * depth / 2, setback / 2, 0.98, spacing, side, gap, k);
        const seg = mid.seg, b = mid.b;
        if (seg <= 0) { bay++; return; }
        if (rejBox(tierAt(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2), mid),
                   [depth, topH, seg], b)) { bay++; return; }
        for (let r = 0; r < rows; r++) {
          const lat = side * r * setback, y = 1.2 + r * rise;
          const row = curveTier(a, kn, lat, setback / 2, 0.98, spacing, side, gap, k);
          const rc = tierAt(vadd(vadd(a.c, a.r, lat), a.u, y), row.seg ? row : mid);
          const rs = row.seg || seg, rb = row.b;
          out._mat = MAT.WOOD;
          addBox(out, rc, [setback * 1.02, 0.18, rs], deck, rb);                         // deck plank
          addBox(out, vadd(rc, a.u, 0.62), [setback * 0.5, 1.05, rs * 0.94],
                 bench[(bay + r) % bench.length], rb);                                    // bench
          crowdBand(vadd(rc, a.u, 1.55), rb, side, 0.55, 0.95, rs - 1.0,
                    opts.crowd, dens, k * 17.3 + r * 89.1 + side * 3.3);
          if (bay % legEvery === 0) {
            out._mat = MAT.METAL;
            addCyl(out, vadd(vadd(a.c, a.r, lat), a.u, -0.4), 0.09, y + 0.4, tube, 4, rb);
          }
        }
        out._mat = MAT.METAL;
        const backLat = side * (rows - 0.5) * setback;
        addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, -0.4), 0.13, topH + 1.6, tube, 5, b);  // back standard
        const rail = curveTier(a, kn, backLat, 0.06, 0.98, spacing, side, gap, k);       // own tier at the back lateral
        addBox(out, tierAt(vadd(vadd(a.c, a.r, backLat), a.u, topH + 0.9), rail.seg ? rail : mid),
               [0.11, 0.11, rail.seg || seg], tube, rail.seg ? rail.b : b);             // handrail
        // One leaning ledger per bay reads as the full X-brace at speed.
        addBox(out, vadd(vadd(a.c, a.r, backLat / 2), a.u, topH * 0.45),
               [Math.abs(backLat) + 0.6, 0.13, 0.13], tube, b);
        if (opts.awning) {
          const aw = (opts.awningCols && opts.awningCols.length) ? opts.awningCols
            : [[0.88, 0.86, 0.82], [0.80, 0.26, 0.22]];
          addCyl(out, vadd(vadd(a.c, a.r, backLat), a.u, topH + 1.4), 0.10, 2.6, tube, 5, b);
          out._mat = MAT.FABRIC;
          addBox(out, tierAt(vadd(vadd(a.c, a.r, backLat * 0.45), a.u, topH + 3.6), mid),
                 [Math.abs(backLat) + 1.6, 0.22, seg], aw[bay % aw.length], b);
        }
        out._mat = 0;
        bay++;
      }, `scaffold|${side}|${gap}|${rows}|${rise}|${setback}|${step}`);
    };

    const terrace = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const rows = clamp(Math.round(opts.rows || 6), 2, 16);
      const rise = opts.rise != null ? opts.rise : 1.5;
      const dep = opts.depth != null ? opts.depth : 2.6;
      const conc = opts.conc || [0.72, 0.71, 0.67];
      const concAlt = opts.concAlt || [0.64, 0.63, 0.59];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.55;
      const step = opts.step || 7;
      const depth = rows * dep + 2.4;
      const topH = 1.4 + rows * rise;
      ctx.noteSpan("terrace", s0, s1, side, gap, { h: topH, rows });
      ctx.indexSolid(s0, s1, side, gap, depth);
      along(s0, s1, step, (k, spacing) => {
        const a = anchor(k, side, gap);
        // #2204: size + aim each row at the neighbour chord (lengthen outside, shorten inside).
        const nb = Math.max(1, Math.round(step / ds));
        const kn = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap));
        const rowAt = (back) => {
          const ct = curveTier(a, kn, back, dep / 2, 0.98, spacing, side, gap, k);
          return ct.seg < 1.2 ? { seg: 0, off: null, b: ct.b } : ct;
        };
        const mid = rowAt(side * depth / 2);
        if (mid.seg <= 0) return;
        if (rejBox(tierAt(vadd(vadd(a.c, a.u, topH / 2), a.r, side * depth / 2), mid),
                   [depth, topH, mid.seg], mid.b)) return;
        out._mat = MAT.CONCRETE;
        if (opts.retainer !== false) {
          const ret = rowAt(0);
          addBox(out, tierAt(vadd(a.c, a.u, 1.0), ret.seg ? ret : mid), [0.9, 2.2, ret.seg || mid.seg], concAlt, ret.b);
        }
        for (let r = 0; r < rows; r++) {
          const back = side * (1.0 + r * dep), up = 1.4 + r * rise;
          const row = rowAt(back);
          if (row.seg <= 0) continue;
          const tc = tierAt(vadd(vadd(a.c, a.r, back), a.u, up), row);
          out._mat = MAT.CONCRETE;
          addBox(out, tc, [dep, rise + 0.3, row.seg], r & 1 ? conc : concAlt, row.b);
          crowdBand(vadd(tc, a.u, rise * 0.5 + 0.6), row.b, side, dep * 0.6, 1.1, row.seg - 1.6,
                    opts.crowd, dens, k * 31.7 + r * 11.3 + side * 7.1);
        }
        const topBack = side * (1.0 + rows * dep);
        const backRow = rowAt(topBack);
        const tbSeg = backRow.seg || mid.seg;
        const bb = backRow.b, bShift = backRow.seg ? backRow : mid;
        if (opts.backWall !== false) {
          out._mat = MAT.CONCRETE;
          // The wall stands rows*dep beyond the anchor, where the verge can fall away. At full
          // length neighbouring walls overlapped and carried each other; cut to the chord they
          // stand alone, so take the foot down to the lowest terrain under the wall (jerez's
          // Angel Nieto bowl wrap floated 1.2-1.3 m, ground-audit --why).
          const wc = tierAt(vadd(a.c, a.r, topBack), bShift);
          let drop = 0;
          if (typeof terrainYAt === "function") {
            for (const o of [-0.5, 0, 0.5]) {
              const p = vadd(wc, bb[2], o * tbSeg), ty = terrainYAt(p[0], p[2]);
              if (ty != null) drop = Math.max(drop, (p[1] - ty) / Math.max(0.5, a.u[1]));
            }
          }
          const wallH = topH + drop;
          addBox(out, vadd(wc, a.u, topH - wallH * 0.5),
                 [0.7, wallH, tbSeg], concAlt, bb);                                       // plain back wall
        }
        if (opts.cut) {
          out._mat = 0;
          addPrism(out, tierAt(vadd(vadd(a.c, a.r, topBack), a.u, topH), bShift),
                   [6, 3.4, tbSeg], opts.cutCol || [0.52, 0.32, 0.22], bb);
        }
        out._mat = 0;
      }, `terrace|${side}|${gap}|${rows}|${rise}|${dep}|${step}`);
    };

    const tieredBowl = (s0, s1, side, gap, opts) => {
      opts = opts || {};
      const tiers = clamp(Math.round(opts.tiers || 4), 1, 8);
      const tierDepth = opts.tierDepth != null ? opts.tierDepth : 5.6;
      const base = opts.base != null ? opts.base : 3.0;    // first tier's riser height
      const rise = opts.rise != null ? opts.rise : 3.3;    // added per tier
      const shell = (opts.shell && opts.shell.length === 2) ? opts.shell
        : [[0.57, 0.58, 0.60], [0.51, 0.52, 0.55]];
      const fascia = opts.fascia || [0.93, 0.90, 0.80];
      const dens = opts.density != null ? clamp(opts.density, 0.05, 1) : 0.55;
      const step = opts.step || 8;
      const topH = base + (tiers - 1) * rise + 2.0;
      ctx.noteSpan("tieredBowl", s0, s1, side, gap, { h: topH, tiers });
      ctx.indexSolid(s0, s1, side, gap, tiers * tierDepth + 2);
      along(s0, s1, step, (k, spacing) => {
        const nb = Math.max(1, Math.round(step / ds));
        let seg = 0;
        for (let t = 0; t < tiers; t++) {
          const a = anchor(k, side, gap + t * tierDepth);
          const kn = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap + t * tierDepth));
          // #4967: the curve cap is measured at THIS tier's lateral, not the base gap.
          const row = curveTier(a, kn, 0, tierDepth * 0.465, 0.98, spacing, side, gap + t * tierDepth, k);
          if (row.seg <= 0) continue;
          const b = row.b, ac = tierAt(a.c, row);
          seg = row.seg;
          const h = base + t * rise;
          if (rejBox(vadd(ac, a.u, h / 2), [tierDepth * 0.93, h, seg], b)) continue;
          out._mat = MAT.CONCRETE;
          addBox(out, vadd(ac, a.u, h * 0.5), [tierDepth * 0.93, h, seg],
                 t % 2 ? shell[0] : shell[1], b);                                        // riser
          crowdBand(vadd(ac, a.u, h + 0.85), b, side, tierDepth * 0.8, 1.6, seg - 1.0,
                    opts.crowd, dens, k * 3.1 + t * 31.7 + side * 2.3);
          out._mat = 0;
          // seg, not seg + 0.5: with neighbouring tiers now meeting (#2204),
          // the 0.5 m overhang laid two lips' tops in one plane (mexico's
          // bowl, ground-audit flatCoplanar 0 -> 8).
          addBox(out, vadd(ac, a.u, h + 1.85), [tierDepth * 0.86, 0.32, seg],
                 fascia, b);                                                             // fascia lip
        }
        if (opts.roof && seg > 0) {
          const aR = anchor(k, side, gap + (tiers - 0.5) * tierDepth);
          const knR = [(k + nb) % n, (k - nb + n) % n].map((kk) => anchor(kk, side, gap + (tiers - 0.5) * tierDepth));
          const roof = curveTier(aR, knR, 0, tierDepth * 0.65, 0.98, spacing, side, gap + (tiers - 0.5) * tierDepth, k);
          const bR = roof.b, rSeg = roof.seg || seg, rc0 = tierAt(aR.c, roof.seg ? roof : null);
          const ry = base + (tiers - 1) * rise + 2.6;
          if (!rejBox(vadd(rc0, aR.u, ry), [tierDepth * 1.3, 0.5, rSeg + 1], bR)) {
            out._mat = MAT.METAL;
            addBox(out, vadd(rc0, aR.u, ry), [tierDepth * 1.3, 0.5, rSeg + 1],
                   opts.roofCol || [0.19, 0.19, 0.23], bR);
          }
        }
        out._mat = 0;
      }, `bowl|${side}|${gap}|${tiers}|${rise}|${tierDepth}|${step}`);
    };
    return { bleacher, scaffoldStand, terrace, tieredBowl };
  }

  return { create };
})();
Object.freeze(SceneryStands);
