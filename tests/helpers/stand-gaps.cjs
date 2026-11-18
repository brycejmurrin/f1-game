// stand-gaps.cjs — measure the gaps between consecutive along() stations of the
// curved-stand emitters (terrace / bleacher / scaffoldStand / tieredBowl,
// js/track/scenery/stands.js) on the boxes they actually EMIT, not on a copy
// of their arithmetic. #2204 / W30: the previous test re-derived the emitter's
// sizes, so a clamp in the emitter that the copy did not have went unseen.
//
// Wraps SceneryStands.create in the VM sandbox (tools/lib/track-build-vm.cjs):
// the along() walker passed in records the current station (k, spacing), and
// the addBox the stands use records (centre, size, basis) per station. A box's
// ROLE is its cross-section (size[0]|size[1]) plus its ordinal among same-
// section boxes in that station, so a terrace's row r at station j is paired
// with row r at station j+1 only when both stations exist and are adjacent.
"use strict";

const STAND_HELPERS = ["bleacher", "scaffoldStand", "terrace", "tieredBowl"];

function corners(c, sz, b) {
  const out = [];
  for (const i of [-0.5, 0.5]) for (const j of [-0.5, 0.5]) for (const k of [-0.5, 0.5])
    out.push([0, 1, 2].map((a) => c[a] + b[0][a] * i * sz[0] + b[1][a] * j * sz[1] + b[2][a] * k * sz[2]));
  return out;
}

/** Build `id` and return every station pair { helper, k, role, gOut, gIn, along } of its stand calls. */
function measureStandGaps(env, id) {
  const def = env.Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`no such track: ${id}`);
  const Orig = env.sandbox.SceneryStands;
  const stations = [];   // { call, k, spacing, boxes: [{c, sz, b}] }
  let cur = null, call = 0, trackRef = null;
  env.sandbox.SceneryStands = {
    create(ctx, along) {
      trackRef = ctx;
      const wrappedAlong = (s0, s1, step, fn, tag) => along(s0, s1, step, (k, spacing) => {
        cur = { call, k, spacing, step, boxes: [] };
        stations.push(cur);
        try { return fn(k, spacing); } finally { cur = null; }
      }, tag);
      const addBox = (o, c, sz, col, b) => {
        const r = ctx.addBox(o, c, sz, col, b);
        // Crowd bands (crowdBand, MAT.FABRIC) are sparse by design; every
        // structural box (row, plank, riser, wall) is concrete/wood/metal.
        if (cur && r !== false && b && sz && o._mat !== ctx.MAT.FABRIC)
          cur.boxes.push({ c: Array.from(c), sz: Array.from(sz), b: b.map((v) => Array.from(v)) });
        return r;
      };
      const api = Orig.create(Object.assign({}, ctx, { addBox }), wrappedAlong);
      const out = {};
      for (const h of STAND_HELPERS) out[h] = function () { call++; const name = h; const r = api[h].apply(this, arguments); stations.filter((s) => s.call === call && !s.helper).forEach((s) => { s.helper = name; }); return r; };
      return out;
    },
  };
  let track;
  try { track = env.Tracks.build(def, {}); } finally { env.sandbox.SceneryStands = Orig; }
  const n = track.n, ds = track.total / n, px = Array.from(track.px), pz = Array.from(track.pz);
  env.release(track);
  if (!trackRef) return [];
  const roleOf = (st) => {
    const seen = new Map();
    return st.boxes.map((bx) => {
      const sec = bx.sz[0].toFixed(3);   // width: a back wall's height varies per station
      const i = seen.get(sec) || 0; seen.set(sec, i + 1);
      return `${sec}#${i}`;
    });
  };
  const pairs = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const A = stations[i], B = stations[i + 1];
    if (A.call !== B.call || !A.boxes.length || !B.boxes.length) continue;
    const nb = Math.max(1, Math.round(A.step / ds));
    if (((B.k - A.k + n) % n) !== nb) continue;            // adjacent stations only
    const ra = roleOf(A), rb = roleOf(B);
    ra.forEach((role, ia) => {
      const ib = rb.indexOf(role);
      if (ib < 0) return;
      const a = A.boxes[ia], b = B.boxes[ib];
      if (a.sz[2] < 1 || b.sz[2] < 1) return;
      let tA = a.b[2], tB = b.b[2];
      const dAB = [b.c[0] - a.c[0], 0, b.c[2] - a.c[2]];
      if (tA[0] * dAB[0] + tA[2] * dAB[2] < 0) tA = tA.map((v) => -v);
      if (tB[0] * tA[0] + tB[2] * tA[2] < 0) tB = tB.map((v) => -v);
      const dot = (p, v) => p[0] * v[0] + p[2] * v[2];
      const aEnd = corners(a.c, a.sz, a.b).sort((p, q) => dot(q, tA) - dot(p, tA)).slice(0, 4);
      const bEnd = corners(b.c, b.sz, b.b).sort((p, q) => dot(p, tB) - dot(q, tB)).slice(0, 4);
      const tm = [(tA[0] + tB[0]) / 2, (tA[2] + tB[2]) / 2], tl = Math.hypot(tm[0], tm[1]) || 1;
      const kk = A.k, dTrack = (p) => Math.hypot(p[0] - px[kk], p[2] - pz[kk]);
      const d = aEnd.map(dTrack), mid = (Math.min(...d) + Math.max(...d)) / 2;
      let gOut = -Infinity, gIn = -Infinity;
      aEnd.forEach((pa, j) => {
        let m = bEnd[0], md = Infinity;
        for (const pb of bEnd) { const dd = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]); if (dd < md) { md = dd; m = pb; } }
        const g = ((m[0] - pa[0]) * tm[0] + (m[2] - pa[2]) * tm[1]) / tl;
        if (d[j] > mid) gOut = Math.max(gOut, g); else gIn = Math.max(gIn, g);
      });
      const turn = Math.acos(Math.max(-1, Math.min(1, (a.b[2][0] * b.b[2][0] + a.b[2][2] * b.b[2][2]) /
        ((Math.hypot(a.b[2][0], a.b[2][2]) * Math.hypot(b.b[2][0], b.b[2][2])) || 1))));
      // Which side of the bend: tB - tA points at the chain's centre of
      // curvature. On the OUTSIDE of a bend that centre is on the TRACK side
      // (the contract's case); on the inside (or past a fold) it is not.
      const toTrack = [px[kk] - a.c[0], pz[kk] - a.c[2]];
      const nC = [tB[0] - tA[0], tB[2] - tA[2]];
      const turnDeg = turn * 180 / Math.PI;
      const bend = turnDeg < 1 ? "straight" : (nC[0] * toTrack[0] + nC[1] * toTrack[1] > 0 ? "outside" : "inside");
      pairs.push({ id, helper: A.helper, call: A.call, k: A.k, role, gOut, gIn, turnDeg, bend,
                   lenA: a.sz[2], lenB: b.sz[2], spacing: A.spacing,
                   // the tier's depth: the widest structural box sharing this one's span
                   // (a bowl's fascia lip rides its riser's curveTier)
                   wTier: Math.max(...A.boxes.filter((o) => Math.abs(o.sz[2] - a.sz[2]) < 1e-6).map((o) => o.sz[0])),
                   // scaffoldStand's bench is rs x 0.94 by design (a bay gap), not a row
                   bench: A.helper === "scaffoldStand" && Math.abs(a.sz[1] - 1.05) < 1e-9 });
    });
  }
  return pairs;
}

// The #2204 contract for one OUTSIDE-of-bend pair: 0.5 m, or — where the bend's
// wedge (tier depth x step turn) is deeper than curveTier's JOINT_OVERLAP lets
// a row run into its neighbour — the wedge less one end's 0.4 m overrun.
const outsideBound = (x) => Math.max(0.5, x.wTier * x.turnDeg * Math.PI / 180 - 0.4);

module.exports = { measureStandGaps, outsideBound, STAND_HELPERS };
