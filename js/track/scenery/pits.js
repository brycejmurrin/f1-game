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
  const POST = [0.22, 0.24, 0.28];

  // One bay mesh per team, shared across circuits: the geometry is a function
  // of the livery only, and a session builds a handful of circuits.
  const BAY_CACHE = new Map();
  function bayMesh(rowEntry) {
    if (typeof GarageScene === "undefined" || typeof GarageScene.buildStatic !== "function") return null;
    const key = rowEntry.team + "|" + rowEntry.col.join(",") + "|" + rowEntry.col2.join(",");
    let m = BAY_CACHE.get(key);
    if (!m) {
      // `props: "lite"`: the furniture that reads from the lane — tyre stacks
      // in the door corners and out on the apron, tool chests, the jack.
      m = GarageScene.buildStatic({ c1: rowEntry.col, c2: rowEntry.col2, accent: rowEntry.col2 }, { props: "lite" });
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
    // The SIGNS (js/garage/pit-signs.js paints the atlas, game.js draws the
    // decal): twelve fascia cells on the lintels (§3) and the BOARDS —
    // cells 12 and 13 of the same atlas, on posts (TrackPit.SIGN.boards).
    // Corners [BL, BR, TR, TL] as seen by the reader, V flipped for the
    // FLIP_Y upload, U not (a world-space quad on the identity).
    const S = typeof TrackPit !== "undefined" ? TrackPit.SIGN : null;
    const signs = { pos: [], nrm: [], uv: [], idx: [], cells: [], boards: [], panels: [], crests: [], anchors: [], centre: null };
    // A lettered board on a post at node k, its face toward the oncoming
    // driver (normal -t; the reader's right is the road's +r), `cell` of the
    // atlas. The face is the decal; a dark body a few centimetres behind it
    // gives it a back and something for the decal's depth test.
    // Deferred until after the fascias (§3), so quad i is fascia i for the
    // twelve and the boards follow: the painter and the tests index them so.
    const boardsWanted = [];
    const boardAt = (k, lat, y, cell) => { if (S) boardsWanted.push([k, lat, y, cell]); };
    const emitBoard = (k, lat, y, cell) => {
      const c = at(k, lat, y), r = [rx[k], ry[k], rz[k]], u = upOf(track, k), t = [tx[k], ty[k], tz[k]];
      const hw2 = S.boardW / 2, hh = S.boardH / 2;
      const P = (sx, sy) => [c[0] + r[0] * sx * hw2 + u[0] * sy * hh, c[1] + r[1] * sx * hw2 + u[1] * sy * hh, c[2] + r[2] * sx * hw2 + u[2] * sy * hh];
      const corners = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
      const cx = (cell % S.cols) * S.cellW, cy = Math.floor(cell / S.cols) * S.cellH;
      const uL = cx / S.w, uR = (cx + S.cellW) / S.w, vT = 1 - cy / S.h, vB = 1 - (cy + S.cellH) / S.h;
      const uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
      const base = signs.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        signs.pos.push(corners[i][0], corners[i][1], corners[i][2]);
        signs.nrm.push(-t[0], -t[1], -t[2]);
        signs.uv.push(uvs[i][0], uvs[i][1]);
      }
      signs.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      signs.boards.push({ cell, k });
      signs.anchors.push(c);
      const bs = basisAt(k);
      rawBox(out, [c[0] + t[0] * 0.05, c[1] + t[1] * 0.05, c[2] + t[2] * 0.05], [S.boardW + 0.06, S.boardH + 0.06, 0.06], DARK, bs);
      const postH = y - hh;
      rawBox(out, at(k, lat, postH / 2), [0.07, postH, 0.07], POST, bs);
    };
    // A team's crest PANEL on the pit wall opposite its bay (asked: the
    // team's logo on the wall outside): the bay's own atlas cell again, at
    // the cell's aspect, standing on the wall's top on a dark plate, and
    // read from BOTH sides — the lane face (normal +sd·r, the reader's right
    // +sd·t) for the driver in the lane, the track face (normal -sd·r, right
    // -sd·t) for the chase and TV cameras, the side a real pit wall shows
    // its names to. After the boards, so quad i is fascia i, then the
    // boards, then two quads per bay (lane, track): the painter and the
    // tests index them so.
    const panelsWanted = [];
    const panelAt = (f, k, cell) => { if (S) panelsWanted.push([f, k, cell]); };
    const PANEL_SCALE = 0.46, WALL_TOP_Y = 1.42;
    const emitPanel = (f, k, cell) => {
      const pw = S.quadW * PANEL_SCALE, ph = S.quadH * PANEL_SCALE;
      const wallLat = sd * (f.hw + p.bands.verge + 0.125);
      const cx = (cell % S.cols) * S.cellW, cy = Math.floor(cell / S.cols) * S.cellH;
      const uL = cx / S.w, uR = (cx + S.cellW) / S.w, vT = 1 - cy / S.h, vB = 1 - (cy + S.cellH) / S.h;
      const uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
      for (const face of [1, -1]) {                       // +1 the lane face, -1 the track face
        const c = atF(f, wallLat - sd * (face > 0 ? 0 : 0.08), WALL_TOP_Y + 0.03 + ph / 2, k);
        const right = [face * sd * f.t[0], face * sd * f.t[1], face * sd * f.t[2]], up = f.u;
        const nrm = [face * sd * f.r[0], face * sd * f.r[1], face * sd * f.r[2]];
        const P = (sx, sy) => [c[0] + right[0] * sx * pw / 2 + up[0] * sy * ph / 2,
                               c[1] + right[1] * sx * pw / 2 + up[1] * sy * ph / 2,
                               c[2] + right[2] * sx * pw / 2 + up[2] * sy * ph / 2];
        const corners = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
        const base = signs.pos.length / 3;
        for (let i = 0; i < 4; i++) {
          signs.pos.push(corners[i][0], corners[i][1], corners[i][2]);
          signs.nrm.push(nrm[0], nrm[1], nrm[2]);
          signs.uv.push(uvs[i][0], uvs[i][1]);
        }
        signs.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        signs.panels.push({ cell, k, face: face > 0 ? "lane" : "track" });
      }
      // The plate: a centimetre behind the decal, and grounded THROUGH the
      // wall — its body runs from the ground to the panel's top inside the
      // wall's 25 cm (the wall is a swept strip the float sweep cannot see
      // as a support, so a plate that merely sat on its top read as 1.44 m
      // of floating scenery on every circuit); only the part above the top
      // shows.
      const top = WALL_TOP_Y + 0.06 + ph;
      rawBox(out, atF(f, wallLat - sd * 0.04, top / 2, k), [0.06, top, pw + 0.06], DARK, f.basis);
    };
    // The team's CREST on the outside wall (asked): its square crest cell
    // (TrackPit.SIGN.crests, the crest alone on the team's colour) as a
    // plaque a centimetre proud of the door's approach-side pier — the pier
    // itself is the backing — facing the lane like the fascia. After the
    // panels in the quad order.
    const crestsWanted = [];
    const crestAt = (f, k, i, along) => { if (S && S.crests && i < S.crests) crestsWanted.push([f, k, i, along]); };
    const emitCrest = (f, k, i, along) => {
      const cw = S.crestW, h = f.hw;
      const lat = sd * (h + p.off.workOut - 0.13 - 0.125 - 0.01);   // the pier's lane face, a centimetre proud
      const c0 = atF(f, lat, S.crestY0 + cw / 2, k);
      const c = [c0[0] + f.t[0] * along, c0[1] + f.t[1] * along, c0[2] + f.t[2] * along];
      const right = [-sd * f.t[0], -sd * f.t[1], -sd * f.t[2]], up = f.u, nrm = [-sd * f.r[0], -sd * f.r[1], -sd * f.r[2]];
      const P = (sx, sy) => [c[0] + right[0] * sx * cw / 2 + up[0] * sy * cw / 2,
                             c[1] + right[1] * sx * cw / 2 + up[1] * sy * cw / 2,
                             c[2] + right[2] * sx * cw / 2 + up[2] * sy * cw / 2];
      const corners = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
      const cx = (i % S.crestCols) * S.crestPx, cy = S.crestY + Math.floor(i / S.crestCols) * S.crestPx;
      const uL = cx / S.w, uR = (cx + S.crestPx) / S.w, vT = 1 - cy / S.h, vB = 1 - (cy + S.crestPx) / S.h;
      const uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
      const base = signs.pos.length / 3;
      for (let q = 0; q < 4; q++) {
        signs.pos.push(corners[q][0], corners[q][1], corners[q][2]);
        signs.nrm.push(nrm[0], nrm[1], nrm[2]);
        signs.uv.push(uvs[q][0], uvs[q][1]);
      }
      signs.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      signs.crests.push({ cell: i, k });
    };

    // The entrance lamps' GREEN aspect: a quad a centimetre proud of the RED
    // face, on the atlas's green signal cell, in its OWN buffer
    // (track.pitSignal) so the painter can draw it only while the lane is open
    // TO YOU — the props mesh is built once, your pit stop is not. Red is the
    // steady state, and the pair goes green on the lap you are called in.
    const signal = { pos: [], nrm: [], uv: [], idx: [], quads: [] };
    let entryLamps = 0;
    const signalAt = (k, face, bs) => {
      if (!S || !S.signals) return;
      const w = S.signalW / 2, right = bs[0], up = bs[1], t = bs[2];
      const c = [face[0] - t[0] * 0.07, face[1] - t[1] * 0.07, face[2] - t[2] * 0.07];   // the aspect is 0.12 deep: its −t face + 1 cm
      const P = (sx, sy) => [c[0] + right[0] * sx * w + up[0] * sy * w, c[1] + right[1] * sx * w + up[1] * sy * w, c[2] + right[2] * sx * w + up[2] * sy * w];
      const corners = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
      const cx = 0, cy = S.signalY;                                          // cell 0: GREEN (cell 1, RED, is the painted face)
      const uL = cx / S.w, uR = (cx + S.signalPx) / S.w, vT = 1 - cy / S.h, vB = 1 - (cy + S.signalPx) / S.h;
      const uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
      const base = signal.pos.length / 3;
      for (let q = 0; q < 4; q++) {
        signal.pos.push(corners[q][0], corners[q][1], corners[q][2]);
        signal.nrm.push(-t[0], -t[1], -t[2]);
        signal.uv.push(uvs[q][0], uvs[q][1]);
      }
      signal.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      signal.quads.push({ k, cell: 0 });
    };

    let wallBuilt = false;
    if (p.hasWall) {
      const b = p.bands;
      // Nodes from `s0` forward while `keep(k)` holds, over at most `maxM`.
      // `seekM` lets the run SEARCH for its start: without it the walk breaks
      // on the first node, so a start that lands one step short of the keep
      // yields an EMPTY list and sweep() builds nothing at all.
      // Without `seekM` the start is taken as given, so the runs that already
      // begin on a satisfied node are untouched.
      const nodesFrom = (s0, keep, maxM, seekM) => {
        let s0b = s0;
        for (let d = 0; d < (seekM || 0) && !keep(kOf(s0b)); d += ds) s0b = wrap(s0b + ds);
        const list = [];
        for (let s = s0b; ; s = wrap(s + ds)) {
          const k = kOf(s);
          if (!keep(k)) break;
          if (!(list.length && list[list.length - 1] === k)) list.push(k);
          if (wrap(s - s0b) >= maxM || list.length > n) break;
        }
        return list;
      };
      // The wall's fade FINISHES at `sIn`, so whether the node at `sIn` has
      // reached 0.98 is node-grid luck: Magny-Cours sat at 0.954, Mexico and
      // Monaco at 0.97, and all three lost the platform, the wall, its rail
      // and the lane-side barrier — every sweep below — to an empty run.
      // Seek forward to the wall's own first node, the way the lamp gate
      // already does a few dozen lines down (`kGate`).
      const ks = nodesFrom(p.sIn, (k) => p.v[k] >= 0.98, p.lenM, 24);
      // `shift(k)`, when given, slides the whole profile laterally per node.
      const sweep = (ks, profile, col, mat, shift) => {
        if (ks.length < 2) return;
        const m = profile.length;
        const latOf = (k, q) => sd * (hw[k] + q[0] + (shift ? shift(k) : 0));
        for (let i = 0; i + 1 < ks.length; i++) {
          const k = ks[i], k2 = ks[i + 1];
          for (let e = 0; e < m; e++) {
            const a = profile[e], c = profile[(e + 1) % m];
            const A = at(k, latOf(k, a), a[1]), B = at(k, latOf(k, c), c[1]);
            const C = at(k2, latOf(k2, a), a[1]), D = at(k2, latOf(k2, c), c[1]);
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
          for (const q of profile) { const P = at(k, latOf(k, q), q[1]); out.pos.push(P[0], P[1], P[2]); out.nrm.push(nrm[0], nrm[1], nrm[2]); out.col.push(col[0], col[1], col[2]); }
          pushMat(m, mat);
          for (let e = 1; e + 1 < m; e++) {
            if (flip) out.idx.push(base, base + e + 1, base + e); else out.idx.push(base, base + e, base + e + 1);
          }
          void u;
        }
      };
      const v0 = b.verge, v1 = b.verge + b.platform;
      // Platform: 35 cm above the lane (FIM §9.2).
      sweep(ks, [[v0, 0], [v1, 0], [v1, 0.35], [v0, 0.35]], PLATFORM, MAT.CONCRETE);
      // The pit wall on the TRACK side of the platform: 25 cm thick, 1 m high.
      sweep(ks, [[v0, 0.35], [v0 + 0.25, 0.35], [v0 + 0.25, 1.35], [v0, 1.35]], WALL, MAT.CONCRETE);
      sweep(ks, [[v0 - 0.02, 1.35], [v0 + 0.27, 1.35], [v0 + 0.27, 1.42], [v0 - 0.02, 1.42]], WALL_TOP, MAT.METAL);
      // The 65 cm barrier between the platform and the lane.
      sweep(ks, [[v1 - 0.10, 0.35], [v1, 0.35], [v1, 1.0], [v1 - 0.10, 1.0]], BARRIER, MAT.METAL);
      wallBuilt = ks.length >= 2;

      // ── 1b. THE EXIT WALL: the pit wall carried on down the exit road ────
      // From the platform's line at the exit line to the road edge as the
      // wall fades (verge · v, the same easing the lane's inner edge follows),
      // then along the edge while the road keeps EXIT_WALL_W of its width —
      // a serviced car rejoins where the wall ends, not through it, and a
      // car on the track cannot cut across the exit road (game.js clamps
      // both sides off the same numbers). There was no wall here at all.
      const EXW = typeof TrackPit !== "undefined" ? TrackPit.EXIT_WALL_W : 0.55;
      const kx = nodesFrom(p.sOut, (k) => p.w[k] >= EXW, p.exitRoadM);
      const slide = (k) => v0 * p.v[k];
      sweep(kx, [[-0.05, 0], [0.30, 0], [0.30, 1.0], [-0.05, 1.0]], WALL, MAT.CONCRETE, slide);
      sweep(kx, [[-0.07, 1.0], [0.32, 1.0], [0.32, 1.07], [-0.07, 1.07]], WALL_TOP, MAT.METAL, slide);

      // ── 1d. THE OUTER WALL: the lane's far side, wherever a bay is not ────
      // Along the ribbon's outer edge — the garage line, scaled by the
      // ribbon's own width on the roads — from where the entry road peels
      // off to where the exit road rejoins, leaving the row of bays and race
      // control to stand in it. With the platform wall, the exit wall and
      // this, the lane is walled on both sides from entrance to exit; the
      // driving boundary (TrackPit.openBoundary) stops a car's side at it.
      // …at the LANE's own outer edge (TrackPit.outerAt), which is the garage
      // line where the bays are and the fast lane's far side on the entry and
      // exit roads. The wall used to stand at the full width for the whole
      // window, so an entrance with no garage beside it for 100-238 m was as
      // wide as the service area. What it walls off now is the APRON, which is
      // paved (TrackMesh.buildPitLane) rather than the grass it was.
      const outerShift = (k) => (typeof TrackPit !== "undefined" && TrackPit.outerAt
        ? TrackPit.outerAt(p, k) : o.workOut * p.w[k]);
      const outerWall = (ks2) => {
        sweep(ks2, [[0.02, 0], [0.32, 0], [0.32, 1.0], [0.02, 1.0]], WALL, MAT.CONCRETE, outerShift);
        sweep(ks2, [[0.0, 1.0], [0.34, 1.0], [0.34, 1.07], [0.0, 1.07]], WALL_TOP, MAT.METAL, outerShift);
      };
      const hasRibbon = (k) => p.w[k] > 0.02;
      if (p.hasBays && p.row) {
        const gap0 = wrap(p.row.s0 - 0.5), gap1 = wrap(p.row.s1 + p.row.tail + 0.5);   // …to race control's far face
        outerWall(nodesFrom(wrap(p.sA + 6), hasRibbon, Math.max(0, wrap(gap0 - p.sA) - 6)));
        outerWall(nodesFrom(gap1, hasRibbon, wrap(p.sB - gap1)));
      } else {
        outerWall(nodesFrom(wrap(p.sA + 6), hasRibbon, wrap(p.sB - p.sA) - 6));
      }

      // ── 1c. CONES down the entry road's inner edge ───────────────────────
      // Where the wall has not grown the peel is a painted line, and a line
      // is not a separation a driver reads at 200 km/h: one cone every 8 m
      // from the road's start until the wall's fade begins.
      const CONE = [0.95, 0.42, 0.08], CBAND = [0.97, 0.97, 0.97];
      for (let d = 6; d < p.entryRoadM; d += 8) {
        const k = kOf(p.sA + d);
        if (p.v[k] > 0.5 || !(p.w[k] > 0.05)) continue;
        const bs = basisAt(k), lat = sd * (hw[k] + 0.45);
        rawBox(out, at(k, lat, 0.03), [0.36, 0.06, 0.36], DARK, bs);
        rawBox(out, at(k, lat, 0.33), [0.20, 0.60, 0.20], CONE, bs);
        rawBox(out, at(k, lat, 0.46), [0.22, 0.08, 0.22], CBAND, bs);
      }

      // ── 2. Boards on the approach and at the entry line, lights at the exit
      // "PIT ENTRY" with an arrow, twice on the approach before the entry
      // road (TrackPit.SIGN.boardM back from where it peels off), just off
      // the road's pit-side edge and short of whatever barrier stands
      // there; "PIT LANE <limit> km/h" on the platform at the entry line. A
      // blank white square used to be the whole of it.
      const kIn = kOf(p.sIn), kOut = kOf(p.sOut);
      if (S && S.boards) {
        // On the verge, its inner edge 0.3 m off the road, and only where the
        // barrier leaves the whole board room (a board through a fence post
        // is worse than no board; the arrows on the road remain).
        // …and only where no single-object prop of the circuit's own scenery
        // already stands on that verge — a trunk, a post, a hut. The circuit's
        // scenery is built before the complex (tracks.js), and every emitter
        // writes what it placed to track.props at placement, so the registry
        // is complete here. A board that would share the verge with one walks
        // a further 24 m back, 4 m at a time, and gives up rather than stand
        // through it (Nürburgring's far board at 110 m did exactly that, and
        // was moved to 95 m by hand before this walk existed). Multi-part
        // records (a grandstand, a building, a backdrop) are skipped: their
        // box is the assembly's bounding box — at Bahrain a stand 5 m out
        // reaches the road with it and no board could stand anywhere — and
        // the barrier test already keeps a board off what stands behind the
        // fence. The mass hash (tracks.js massBlocked) is coarser still: a
        // claim, not a footprint.
        const bar = sd > 0 ? track.barR : track.barL;
        const SKIP = { structure: 1, building: 1, backdrop: 1, place: 1, grandstand: 1,
                       mountain: 1, ridge: 1, peak: 1, plane: 1 };   // …and the landforms, whose boxes are the horizon
        const props = (track.props && track.props.list) || [];
        const clear = (k, off) => {
          if (bar && bar[k] < off + S.boardW / 2 + 0.1) return false;   // a decimetre to spare: the board rides above barrier height
          const c = at(k, sd * off, 0), reach = S.boardW / 2 + 0.4;
          for (const r of props) {
            if (SKIP[r.kind] || !Number.isFinite(r.x)) continue;
            const rr = Math.max(r.w || 0, r.d || 0) / 2 + reach;
            const dx = r.x - c[0], dz = r.z - c[2];
            if (dx * dx + dz * dz < rr * rr) return false;
          }
          return true;
        };
        for (const back of S.boardM) {
          for (let extra = 0; extra <= 24; extra += 4) {
            const k = kOf(p.sA - back - extra);
            const off = hw[k] + 0.3 + S.boardW / 2;
            if (!clear(k, off)) continue;
            boardAt(k, sd * off, S.boardY, S.cells);
            break;
          }
        }
        if (p.v[kIn] >= 0.98) boardAt(kIn, sd * (hw[kIn] + v1 - 0.6), S.boardY, S.cells + 1);
      }
      // ── The ENTRANCE LAMPS (asked: two coloured lamps flanking the pit
      // entrance, one on each WALL CORNER either side of it, with the middle
      // of the lane between them). That pair of corners exists at exactly one
      // arc, and it is the ENTRY LINE, not the mouth: measured down Abu
      // Dhabi's entry road (scratch/pit-mouth-walls.cjs), the peel is a wedge
      // off the road edge with tarmac on its track side and only the OUTER
      // wall beside it, so a gate cannot stand at the mouth. At `sIn` the
      // platform wall's NOSE stands at 10.0 m and the outer wall at 22.0, the
      // fast lane's middle between them at 13.8 — a doorway the car drives
      // through, where the lane legally begins and the limit starts (the
      // "PIT LANE <limit>" board is already here, on the same platform).
      //
      // Each corner carries the exit signal's head on a short post off the
      // wall top, with a RED aspect toward the oncoming driver and a smaller
      // one on its lane face; a light record AT the aspect throwing at the
      // lane between them (docs/research/PIT-ENTRY-LAMPS-PLAN-2026-09.md).
      // RED is the steady state: it MARKS the entrance rather than permitting
      // it. The GREEN aspect is a decal quad on the same atlas
      // (track.pitSignal) that the signs painter lays over the red only while
      // this car is called in — the props mesh is build-time, the stop is not.
      // The gate stands on the WALL'S OWN first node, not on `kOf(sIn)`: the
      // platform wall is swept from the first node at or past `sIn` whose
      // `v` has reached 0.98, and node rounding can leave `kOf(sIn)` one step
      // short of it (Monaco lost both lamps to exactly that).
      let kGate = -1;
      if (!p.painted && p.hasWall) {
        for (let d = 0; d <= 24 && kGate < 0; d += 4) {
          const kk = kOf(p.sIn + d);
          if (p.v[kk] >= 0.98) kGate = kk;
        }
      }
      if (kGate >= 0) {
        const laneCentreAt = (kk) => {
          const fIn = hw[kk] + o.fastIn * p.v[kk], fOut = hw[kk] + o.fastOut * p.w[kk];
          return sd * (fIn + Math.max(fIn, fOut)) / 2;
        };
        // The aim is the lane's own middle a car's length in — both pools land
        // BETWEEN the posts, on the lane, so neither reaches the racing line.
        const kAim = kOf(p.sIn + 10);
        const aim = at(kAim, laneCentreAt(kAim), 0);
        // Each post stands ON ITS OWN FLOOR beside its wall, never on the
        // wall's top: a box whose underside is 1.4 m up with only swept wall
        // beneath it is a FLOATING CLUSTER, and float-audit named all four
        // prims of the far one on five circuits when they were placed that way
        // (estoril, imola, interlagos, istanbul, portimao). The fix is to give
        // a prop ground, not to raise a baseline. The track-side post stands on
        // the PLATFORM, 0.35 m up — the floor the exit signal's own post uses —
        // just behind its wall; the far post on the lane floor just inside the
        // outer wall. Both clear their wall's 0.30 m thickness.
        const HEAD_Y = 2.55;                       // above the lane floor, the same on both
        const posts = [{ lat: v0 + 0.55, foot: 0.35, toLane: 1 },        // the platform wall's nose, track side
                       { lat: o.workOut - 0.45, foot: 0, toLane: -1 }];  // the outer wall opposite
        for (const q of posts) {
          const c = at(kGate, sd * (hw[kGate] + q.lat), q.foot), bs = basisAt(kGate);
          const rise = HEAD_Y - q.foot;
          rawBox(out, [c[0], c[1] + rise / 2, c[2]], [0.14, rise, 0.14], POST, bs);
          rawBox(out, [c[0], c[1] + rise, c[2]], [0.5, 0.9, 0.34], DARK, bs);
          const red = night ? [1.45, 0.22, 0.16] : [0.95, 0.14, 0.10];
          const face = [c[0] - bs[2][0] * 0.2, c[1] + rise - bs[2][1] * 0.2, c[2] - bs[2][2] * 0.2];
          rawBox(out, face, [S ? S.signalW : 0.34, S ? S.signalW : 0.34, 0.12], red, bs);
          const lf = [c[0] + bs[0][0] * q.toLane * 0.28, c[1] + rise, c[2] + bs[0][2] * q.toLane * 0.28];
          rawBox(out, lf, [0.12, 0.22, 0.22], red, bs);
          // The radius is the throw it needs and no more: the pool window is 0
          // past r, so the fixture-anchor rule wants r ≥ |lens→aim| (plus a
          // metre of slack against the node rounding), and every metre beyond
          // that is pool spilling where the lamp is not pointing.
          const radius = Math.ceil(Math.hypot(face[0] - aim[0], face[1] - aim[1], face[2] - aim[2])) + 1;
          if (typeof ctx.registerLamp === "function" &&
              ctx.registerLamp({ pos: face, k: kGate, side: sd, kind: "signal", radius, aimAt: aim, entry: true })) entryLamps++;
          signalAt(kGate, face, bs);
        }
      }
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
    // draws the twelve (and the boards above) as ONE decal after the sky.
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
        // The TEAM'S LED STRIP under the canopy's front edge: the bay's own
        // colour as a lit line the length of the bay — over-white at night so
        // the props pass blooms it (the luminaire lens works the same way),
        // a plain painted strip by day.
        const stripLat = sd * (h + garage - 2.70) - bump;
        const tc = box.col || [0.6, 0.6, 0.65];
        const led = night ? [tc[0] * 2.2 + 0.25, tc[1] * 2.2 + 0.25, tc[2] * 2.2 + 0.25] : [tc[0] * 1.15, tc[1] * 1.15, tc[2] * 1.15];
        rawBox(out, atF(f, stripLat, B.h + 0.45 - 0.125 - 0.05 + lift, k), [0.08, 0.06, segAt(kap, stripLat) - 0.5], led, bs);
        // NEON at the box (asked): the bay's colour as lit tubes a driver
        // reads from the lane — one up each jamb of the door, on the jambs'
        // lane face — and on the ground the STOP MARK: a bar across the
        // working lane just past the painted stop line, with a stub back
        // along each side of the box, so where to stop is a glowing gate at
        // night and a coloured one by day. Here, not in the bay's own pass,
        // so a bay stays the eight prims the clip audit reads as one model.
        // …and the strip's twin ON THE GROUND (asked: one on top, one on the
        // ground): the same lit line the length of the bay, on the apron
        // along the door line, just outside the painted box's outer band.
        rawBox(out, atF(f, sd * (h + garage - 0.16) - bump, 0.02 + lift, k), [0.08, 0.04, segAt(kap, stripLat) - 0.5], led, bs);
        const jamb2 = (B.w - doorW) / 2;
        const tubeLat = sd * (h + garage - 0.13 - 0.125 - 0.03) - bump;
        for (const side of [-1, 1]) {
          const ct = atF(f, tubeLat, 1.45, k), along = side * (doorW / 2 + 0.08);   // framing the door, on the piers' faces
          rawBox(out, [ct[0] + bs[2][0] * along, ct[1] + bs[2][1] * along, ct[2] + bs[2][2] * along], [0.04, 2.0, 0.05], led, bs);
        }
        // The crest plaque on the pier the driver reaches first (along -t).
        crestAt(f, k, i, -(B.w / 2 - jamb2 / 2));
        const lane0 = h + o.corrOut + 0.3, lane1 = h + o.workOut - 0.3;   // the painted box's own edges (TrackMesh.buildPitBoxes)
        const lon = p.row.boxLen / 2 + 0.9;
        const gc = atF(f, sd * (lane0 + lane1) / 2, 0.015, k);
        rawBox(out, [gc[0] + bs[2][0] * lon, gc[1] + bs[2][1] * lon, gc[2] + bs[2][2] * lon], [lane1 - lane0, 0.03, 0.08], led, bs);
        for (const e of [lane0 + 0.15, lane1 - 0.15]) {
          const sc = atF(f, sd * e, 0.015, k), l2 = lon - 0.64;
          rawBox(out, [sc[0] + bs[2][0] * l2, sc[1] + bs[2][1] * l2, sc[2] + bs[2][2] * l2], [0.08, 0.03, 1.2], led, bs);
        }
        if (p.hasWall && p.v[k] >= 0.98) panelAt(f, k, i);
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
    for (const b of boardsWanted) emitBoard(b[0], b[1], b[2], b[3]);
    for (const q of panelsWanted) emitPanel(q[0], q[1], q[2]);
    for (const q of crestsWanted) emitCrest(q[0], q[1], q[2], q[3]);
    if (signs.cells.length || signs.boards.length) track.pitSigns = signs;
    if (signal.quads.length) track.pitSignal = signal;
    return { bays, wall: wallBuilt, lamps, entryLamps, signs: signs.cells.length, boards: signs.boards.length,
             panels: signs.panels.length, crests: signs.crests.length };
  }

  return { build };
})();
Object.freeze(SceneryPits);
