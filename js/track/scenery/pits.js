/* Apex 26 — SceneryPits: the pit complex's 3D furniture, built FROM TrackPit.
   The signalling platform and pit wall swept along the lane, the entry/exit
   boards and the exit lights, and the garages — the setup screen's own bay
   (GarageScene.buildStatic) placed once per team on the row the model laid
   out, under a roof and a hospitality storey that follow the arc bay by bay.
   Nothing here decides WHERE anything is: every position is track.pit's.
   Emits with the RAW emitters on purpose — the road guard now keeps every
   other prop out of the complex, and this is the complex. */
const SceneryPits = (function () {
  "use strict";

  const CONCRETE = [0.70, 0.70, 0.68], PLATFORM = [0.62, 0.62, 0.60];
  const WALL = [0.82, 0.82, 0.84], WALL_TOP = [0.46, 0.47, 0.50];
  const BARRIER = [0.86, 0.86, 0.88], GLASS = [0.24, 0.34, 0.44];
  const SHELL = [0.86, 0.87, 0.89], ROOF = [0.30, 0.32, 0.36], DARK = [0.16, 0.17, 0.19];
  const BOARD = [0.96, 0.96, 0.97], POST = [0.22, 0.24, 0.28];

  // One bay mesh per team, shared across circuits: the geometry is a function
  // of the livery only, and a session builds a handful of circuits.
  const BAY_CACHE = new Map();
  function bayMesh(rowEntry) {
    if (typeof GarageScene === "undefined" || typeof GarageScene.buildStatic !== "function") return null;
    const key = rowEntry.team + "|" + rowEntry.col.join(",") + "|" + rowEntry.col2.join(",");
    let m = BAY_CACHE.get(key);
    if (!m) {
      m = GarageScene.buildStatic({ c1: rowEntry.col, c2: rowEntry.col2, accent: rowEntry.col2 });
      BAY_CACHE.set(key, m);
    }
    return m;
  }

  function build(ctx) {
    const { track, out, rawBox, upOf, bankOffsetAt } = ctx;
    const p = track && track.pit;
    if (!p || !out) return { bays: 0, wall: false, lamps: 0 };
    const night = !!ctx.night;
    const lensCol = ctx.lensAlbedo ? ctx.lensAlbedo("led") : [0.96, 1.00, 1.05];
    const MAT = TrackGeom.MAT;
    const { n, total: L, px, py, pz, rx, ry, rz, tx, ty, tz, hw } = track;
    const ds = L / n, sd = p.side, o = p.off;
    const wrap = (v) => ((v % L) + L) % L;
    const kOf = (s) => ((Math.round(wrap(s) / ds) % n) + n) % n;
    // A world point at node k, lateral offset `lat` (signed, +right) and
    // height y above the (banked) road plane there.
    const at = (k, lat, y) => {
      const u = upOf(track, k);
      const by = bankOffsetAt(track, k, lat) + y;
      return [px[k] + rx[k] * lat + u[0] * by, py[k] + ry[k] * lat + u[1] * by, pz[k] + rz[k] * lat + u[2] * by];
    };
    const basisAt = (k) => [[sd * rx[k], sd * ry[k], sd * rz[k]], upOf(track, k), [tx[k], ty[k], tz[k]]];
    // The row is laid out at EXACT arc positions (the box the car stops in),
    // not at the nearest node: nodes are ~4 m apart, and a bay snapped to one
    // lands up to 2 m off its pitch — neighbouring roof slices overlapped by
    // metres and the doors did not stand behind their boxes.
    const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    const frameAtS = (s) => {
      TrackSpline.sample(track, wrap(s), _smp);
      const r = TrackGeom.norm(_smp.r), t = TrackGeom.norm(_smp.t);
      const u = TrackGeom.norm(TrackGeom.cross(r, t));
      return { p: [_smp.p[0], _smp.p[1], _smp.p[2]], r, t, u, hw: _smp.hw,
               basis: [[sd * r[0], sd * r[1], sd * r[2]], u, t] };
    };
    const atF = (f, lat, y, k) => {
      const by = bankOffsetAt(track, k, lat) + y;
      return [f.p[0] + f.r[0] * lat + f.u[0] * by, f.p[1] + f.r[1] * lat + f.u[1] * by, f.p[2] + f.r[2] * lat + f.u[2] * by];
    };
    const pushMat = (count, m) => { if (out.mat) for (let i = 0; i < count; i++) out.mat.push(m); };

    // ── 1. The platform, the wall and the lane-side barrier ────────────────
    // Swept along the nodes where the wall has grown (v ~ 1): one continuous
    // strip per profile, so consecutive segments share no end caps and the
    // coplanar audit sees a wall rather than a hundred boxes. Profile points
    // are (offset beyond hw, height) and wind CCW seen from ahead.
    let wallBuilt = false;
    if (p.hasWall) {
      const b = p.bands;
      const ks = [];
      for (let s = p.sIn; ; s = wrap(s + ds)) {
        const k = kOf(s);
        if (p.v[k] >= 0.98 && !(ks.length && ks[ks.length - 1] === k)) ks.push(k);
        if (wrap(s - p.sIn) >= p.lenM) break;
        if (ks.length > n) break;
      }
      const sweep = (profile, col, mat) => {
        if (ks.length < 2) return;
        const m = profile.length;
        for (let i = 0; i + 1 < ks.length; i++) {
          const k = ks[i], k2 = ks[i + 1];
          for (let e = 0; e < m; e++) {
            const a = profile[e], c = profile[(e + 1) % m];
            const A = at(k, sd * (hw[k] + a[0]), a[1]), B = at(k, sd * (hw[k] + c[0]), c[1]);
            const C = at(k2, sd * (hw[k2] + a[0]), a[1]), D = at(k2, sd * (hw[k2] + c[0]), c[1]);
            // Outward normal of this face of the extrusion: (along) x (around),
            // flipped by the side so the strip faces out on either side.
            const ax = C[0] - A[0], ay = C[1] - A[1], az = C[2] - A[2];
            const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2];
            let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
            if (sd < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const base = out.pos.length / 3;
            for (const P of [A, B, C, D]) { out.pos.push(P[0], P[1], P[2]); out.nrm.push(nx, ny, nz); out.col.push(col[0], col[1], col[2]); }
            pushMat(4, mat);
            if (sd > 0) out.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
            else out.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
          }
        }
        // End caps, so the strip is closed where it starts and stops.
        for (const [k, flip] of [[ks[0], sd < 0], [ks[ks.length - 1], sd > 0]]) {
          const base = out.pos.length / 3;
          const u = upOf(track, k), t = [tx[k], ty[k], tz[k]];
          const nrm = flip ? t : [-t[0], -t[1], -t[2]];
          for (const q of profile) { const P = at(k, sd * (hw[k] + q[0]), q[1]); out.pos.push(P[0], P[1], P[2]); out.nrm.push(nrm[0], nrm[1], nrm[2]); out.col.push(col[0], col[1], col[2]); }
          pushMat(m, mat);
          for (let e = 1; e + 1 < m; e++) {
            if (flip) out.idx.push(base, base + e + 1, base + e); else out.idx.push(base, base + e, base + e + 1);
          }
          void u;
        }
      };
      const v0 = b.verge, v1 = b.verge + b.platform;
      // Platform: 35 cm above the lane (FIM §9.2).
      sweep([[v0, 0], [v1, 0], [v1, 0.35], [v0, 0.35]], PLATFORM, MAT.CONCRETE);
      // The pit wall on the TRACK side of the platform: 25 cm thick, 1 m high.
      sweep([[v0, 0.35], [v0 + 0.25, 0.35], [v0 + 0.25, 1.35], [v0, 1.35]], WALL, MAT.CONCRETE);
      sweep([[v0 - 0.02, 1.35], [v0 + 0.27, 1.35], [v0 + 0.27, 1.42], [v0 - 0.02, 1.42]], WALL_TOP, MAT.METAL);
      // The 65 cm barrier between the platform and the lane.
      sweep([[v1 - 0.10, 0.35], [v1, 0.35], [v1, 1.0], [v1 - 0.10, 1.0]], BARRIER, MAT.METAL);
      wallBuilt = ks.length >= 2;

      // ── 2. Boards at the entry line, lights at the exit line ─────────────
      const kIn = kOf(p.sIn), kOut = kOf(p.sOut);
      const boardAt = (k, along) => {
        const c = at(k, sd * (hw[k] + v1 - 0.6), 1.0);
        const bs = basisAt(k);
        rawBox(out, [c[0] + bs[2][0] * along, c[1] + bs[2][1] * along, c[2] + bs[2][2] * along], [0.08, 0.6, 0.6], BOARD, bs);
        rawBox(out, [c[0] + bs[2][0] * along, c[1] - 0.55 + bs[2][1] * along, c[2] + bs[2][2] * along], [0.06, 0.5, 0.06], POST, bs);
      };
      if (p.v[kIn] >= 0.98) boardAt(kIn, 0);
      if (p.v[kOut] >= 0.98) {
        const c = at(kOut, sd * (hw[kOut] + v1 - 0.5), 0.35);
        const bs = basisAt(kOut);
        rawBox(out, [c[0], c[1] + 1.8, c[2]], [0.16, 3.6, 0.16], POST, bs);
        rawBox(out, [c[0], c[1] + 3.75, c[2]], [0.5, 0.9, 0.34], DARK, bs);
        // The exit signal. At night the lit aspect (green: the lane is open)
        // is over-white so the props draw blooms it, and the dead one is dark
        // glass, so it reads as a signal rather than two painted discs. No
        // light record: a halo would be 2 m wide on a 28 cm lamp.
        const go = night ? [0.30, 1.40, 0.45] : [0.2, 0.9, 0.3], stop = night ? [0.30, 0.06, 0.04] : [0.9, 0.15, 0.1];
        rawBox(out, [c[0] + bs[0][0] * 0.2, c[1] + 3.95, c[2] + bs[0][2] * 0.2], [0.12, 0.28, 0.28], go, bs);
        rawBox(out, [c[0] + bs[0][0] * 0.2, c[1] + 3.55, c[2] + bs[0][2] * 0.2], [0.12, 0.28, 0.28], stop, bs);
      }
    }

    // ── 3. The garages: the setup screen's bay, once per team, on the row ──
    let bays = 0, lamps = 0;
    const placed = [];
    // The team's SIGN on each lintel: a 5.2 x 0.7 m quad a centimetre proud
    // of the fascia, laid out here as pure numbers (track.pitSigns — the
    // headless builds see only these); js/garage/pit-signs.js paints the
    // atlas and uploads the texMesh where a canvas exists, and game.js
    // draws the twelve as ONE decal after the sky. Corners [BL, BR, TR, TL]
    // as seen from the lane, V flipped for the FLIP_Y upload, U not (a
    // world-space quad on the identity; a U flip would mirror the crests).
    const S = typeof TrackPit !== "undefined" ? TrackPit.SIGN : null;
    const signs = { pos: [], nrm: [], uv: [], idx: [], cells: [], centre: null };
    if (p.hasBays) {
      const B = p.bay, doorW = B.doorW || 5.4, doorH = B.doorH || 4.8;
      const garage = o.workOut;                 // the garage line, beyond the road edge
      const boxes = p.row.boxes, count = boxes.length;
      // Each bay's slice of roof / back wall, SHORT of the pitch: two slices
      // that overlapped shared a plane on top, which is the z-fighting the
      // coplanar sweep ratchets. The seam is 10 cm, not 2: TrackSpline.sample
      // walks the arc by node fraction, and the nodes are not quite evenly
      // spaced, so 11 m of arc lands anywhere from 10.92 to 11.08 m away in
      // the world (measured on Madrid's straight, ±8.5 cm). Invisible from
      // the lane, 27 m off.
      const seg = p.row.pitch - 0.10;
      // …measured at the CENTRELINE. A slice 27 m out on the inside of a
      // gently curving pit straight (Madrid, R ~ 500 m) is 0.7 m too long for
      // its pitch there and overlaps its neighbour's back wall on one plane,
      // so every slice is scaled by the arc's own factor at its lateral.
      const segAt = (kap, lat) => seg * Math.max(0.5, 1 + kap * lat);
      for (let i = 0; i < count; i++) {
        const box = boxes[i], k = box.k;
        const f = frameAtS(box.s), bs = f.basis, h = f.hw;
        const mesh = bayMesh(box);
        // Bay local +Z is the door end; it must point at the TRACK. addMesh
        // yaws about Y only, which a pit straight can afford.
        const rotY = Math.atan2(-sd * f.r[0], -sd * f.r[2]);
        const c = atF(f, sd * (h + garage + B.depth / 2), 0.02, k);
        if (mesh) {
          if (TrackGeom.addMesh(out, mesh, { x: c[0], y: c[1], z: c[2], rotY })) bays++;
        }
        placed.push(box.s);
        // The skin the inward-wound bay does not have: jambs and a team lintel
        // in front of the door plane, a back wall, a roof slab, the glazed
        // hospitality storey and its roof — one slice per bay so the building
        // follows a gently curving pit straight instead of chording it. Every
        // other slice sits 6 mm higher: two slices on ONE plane are what the
        // coplanar sweep ratchets, and 6 mm is invisible from the lane.
        // …and the VERTICAL faces get the same 6 mm sideways: on a gently
        // curving row two back walls stand end to end on one plane too.
        const lift = (i & 1) ? 0.006 : 0, bump = sd * lift;
        const kap = ctx.curvature ? ctx.curvature(box.s) : 0;   // +k = left turn; lateral +x right
        const front = sd * (h + garage - 0.13) - bump;
        const jamb = (B.w - doorW) / 2;
        for (const side of [-1, 1]) {
          const cj = atF(f, front, B.h / 2, k);
          rawBox(out, [cj[0] + bs[2][0] * side * (B.w / 2 - jamb / 2), cj[1] + bs[2][1] * side * (B.w / 2 - jamb / 2), cj[2] + bs[2][2] * side * (B.w / 2 - jamb / 2)],
                 [0.25, B.h, jamb], SHELL, bs);
        }
        const lintH = B.h - doorH + 0.6;
        const cl = atF(f, sd * (h + garage - 0.14) - bump, doorH + lintH / 2, k);   // a centimetre proud of the jambs
        rawBox(out, cl, [0.25, lintH, doorW], box.col, bs);
        if (S && i < S.cells) {
          const right = [-sd * f.t[0], -sd * f.t[1], -sd * f.t[2]];   // the viewer's right, facing the bay from the lane
          const lat = sd * (h + garage - S.proud) - bump, hw2 = S.quadW / 2;
          const lo = atF(f, lat, S.y0, k), hi = atF(f, lat, S.y0 + S.quadH, k);
          const cx = (i % S.cols) * S.cellW, cy = Math.floor(i / S.cols) * S.cellH;
          const uL = cx / S.w, uR = (cx + S.cellW) / S.w, vT = 1 - cy / S.h, vB = 1 - (cy + S.cellH) / S.h;
          const corners = [[lo, -1], [lo, 1], [hi, 1], [hi, -1]], uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
          const base = signs.pos.length / 3;
          for (let c2 = 0; c2 < 4; c2++) {
            const P = corners[c2][0], s2 = corners[c2][1] * hw2;
            signs.pos.push(P[0] + right[0] * s2, P[1] + right[1] * s2, P[2] + right[2] * s2);
            signs.nrm.push(-bs[0][0], -bs[0][1], -bs[0][2]);
            signs.uv.push(uvs[c2][0], uvs[c2][1]);
          }
          signs.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          signs.cells.push({ i, team: box.team });
          if (i === (count >> 1)) signs.centre = atF(f, sd * (h + garage), 3, k);
        }
        const cr = atF(f, sd * (h + garage + B.depth / 2), B.h + 0.05 + 0.175 + lift, k);
        rawBox(out, cr, [B.depth + 0.5, 0.35, segAt(kap, sd * (h + garage + B.depth / 2))], ROOF, bs);
        const cb = atF(f, sd * (h + garage + B.depth + 0.2) + bump, (B.h + 0.4) / 2 + lift, k);
        rawBox(out, cb, [0.3, B.h + 0.4, segAt(kap, sd * (h + garage + B.depth + 0.2))], SHELL, bs);
        const ch = atF(f, sd * (h + garage + B.depth / 2 + 0.6), B.h + 0.4 + 1.7 + lift, k);
        rawBox(out, ch, [B.depth - 1.0, 3.4, segAt(kap, sd * (h + garage + B.depth / 2 + 0.6))], GLASS, bs);
        const ct = atF(f, sd * (h + garage + B.depth / 2 + 0.6), B.h + 0.4 + 3.4 + 0.2 + lift, k);
        rawBox(out, ct, [B.depth - 0.4, 0.4, segAt(kap, sd * (h + garage + B.depth / 2 + 0.6))], ROOF, bs);
        if (i === 0 || i === count - 1) {
          const ce = atF(f, sd * (h + garage + B.depth / 2), (B.h + 0.38) / 2, k);   // 2 cm under the roof line
          const along = (i === 0 ? -1 : 1) * (seg / 2 + 0.15);
          rawBox(out, [ce[0] + bs[2][0] * along, ce[1] + bs[2][1] * along, ce[2] + bs[2][2] * along],
                 [B.depth + 0.5, B.h + 0.38, 0.3], SHELL, bs);
        }
      }
      // ── 4. The canopy over the working lane, and its luminaires ─────────
      // A slab 2.6 m proud of the doors continuing the roof line, one slice
      // per bay like the roof, and under its soffit at every second party
      // line an LED luminaire: one fixture per 22 m — the engine's own pool
      // stride — six per row. The lens is painted from the same table as the
      // masts' and the light is registered AT the lens, throwing at the
      // working lane's centre (`aimAt`), so the lane is lit by a fixture the
      // player can see hanging there. Six of the 48 light slots while the car
      // is on the straight; the cull drops them with distance elsewhere
      // (docs/research/PIT-LIGHTING-PLAN-2026-09.md). A pass of its own, after
      // the bays, so a bay stays the eight prims the clip audit reads as one
      // model (its ADJ window) and two neighbours on a bending row are judged
      // as they were before the canopy existed.
      for (let i = 0; i < count; i++) {
        const box = boxes[i], k = box.k;
        const f = frameAtS(box.s), bs = f.basis, h = f.hw;
        const lift = (i & 1) ? 0.006 : 0, bump = sd * lift;
        const kap = ctx.curvature ? ctx.curvature(box.s) : 0;
        const canLat = sd * (h + garage - 1.45) - bump;
        rawBox(out, atF(f, canLat, B.h + 0.45 + lift, k), [2.6, 0.25, segAt(kap, canLat)], ROOF, bs);
        if ((i & 1) === 0 && i + 1 < count && typeof ctx.registerLamp === "function") {
          const along = seg / 2;                                   // the party line with bay i + 1
          const cl0 = atF(f, sd * (h + garage - 1.7), B.h + 0.45 - 0.125 - 0.04, k);   // its top 2 cm inside the soffit
          const lens = [cl0[0] + bs[2][0] * along, cl0[1] + bs[2][1] * along, cl0[2] + bs[2][2] * along];
          rawBox(out, lens, [0.5, 0.12, 2.4], lensCol, bs);
          const wc = atF(f, sd * (h + (o.corrOut + o.workOut) / 2), 0, k);
          if (ctx.registerLamp({ pos: lens, k, side: sd, kind: "led", radius: 18,
                                 aimAt: [wc[0] + bs[2][0] * along, wc[1] + bs[2][1] * along, wc[2] + bs[2][2] * along] })) lamps++;
        }
      }
      // Race control, stepped up at the exit end of the row: 12 m square,
      // its near face 3 m past the last bay's end wall, inside the row's
      // keep-out tail (TrackPit ROW_TAIL). Offset along the LAST BAY's own
      // tangent, not re-sampled at its arc position: where the row runs into
      // a bend, 14.5 m of arc at the garage line is a shorter step in the
      // world, and the building stood 7 m inside the last bay.
      const last = boxes[count - 1], sR = wrap(last.s + p.row.pitch / 2 + 9), kr = kOf(sR);
      if (p.w[kr] > 0.98) {
        const f = frameAtS(last.s), bs = f.basis, h = f.hw, step = p.row.pitch / 2 + 9;
        const off = (lat, y) => {
          const c = atF(f, sd * (h + garage + lat), y, last.k);
          return [c[0] + f.t[0] * step, c[1] + f.t[1] * step, c[2] + f.t[2] * step];
        };
        rawBox(out, off(7, 7), [12, 14, 12], SHELL, bs);
        rawBox(out, off(7 - 6.2, 11.5), [0.3, 3.0, 11], GLASS, bs);
        rawBox(out, off(7, 14.3), [13, 0.6, 13], ROOF, bs);
      }
    }
    if (p.row) p.row.placed = placed;
    if (signs.cells.length) track.pitSigns = signs;
    return { bays, wall: wallBuilt, lamps, signs: signs.cells.length };
  }

  return { build };
})();
Object.freeze(SceneryPits);
