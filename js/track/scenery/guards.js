/* Apex 26 — SceneryGuards: the road / pit-complex guards of TrackBuildProps (onRoadHit, rejBox, rejRad, onTrack).
   Pure move out of build-props.js (#1658): the bodies are byte-identical apart from `__M.` -> `Math.`.
   create(ctx) closes over the track's node arrays and the shared node grid; `pitRejected()` reads the flag the last
   guard call set (a rejected model is "superseded" when the hit was the pit complex, not the road). */
const SceneryGuards = (function () {
  "use strict";

  function create(ctx) {
    const { track, n, px, py, pz, hw, ds, grid } = ctx;
    const _hitCand = new Array(n), _trkCand = new Array(n);   // reusable query scratch
    // THE PIT COMPLEX IS ROAD to the guards: on the pit side, across the
    // window, a node's half-width grows by the complex's footprint, so no prop
    // — a tree, a hull, a kit building — can be placed on the lane, the wall,
    // the apron or the garages. The complex's own furniture (SceneryPits) uses
    // the RAW emitters and never asks.
    const pitKeep = track.pit ? track.pit.keep : null, pitSide = track.pit ? track.pit.side : 0;
    const pitV = track.pit ? track.pit.v : null, pitVerge = track.pit ? track.pit.bands.verge : 0;
    const pitMax = (() => { let m = 0; if (pitKeep) for (let k = 0; k < n; k++) if (pitKeep[k] > m) m = pitKeep[k]; return m; })();
    // The pit complex is ONE window of the lap, but its keep-out (pitMax,
    // ~30 m) widened every guard query everywhere: onRoadHit + onTrack were the
    // top self-time of a build. Pay the wide radius only where the query can
    // reach a pit node at all — its circle, plus a grid cell's diagonal
    // (node grid CELL = 10 m, so a returned node may sit ~14.2 m outside R),
    // against the pit nodes' bounding box. Elsewhere no pit node can be a
    // candidate, so the pit branch cannot fire and the road branch rejects
    // beyond rad + hw anyway: the result is identical, measured byte-for-byte
    // on all 52 circuits (bug hunt 2026-09-22; props phase ~20 % faster).
    const pitBox = (() => {
      if (!pitKeep || !(pitMax > 0)) return null;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < n; k++) if (pitKeep[k] > 0) {
        if (px[k] < x0) x0 = px[k]; if (px[k] > x1) x1 = px[k];
        if (pz[k] < z0) z0 = pz[k]; if (pz[k] > z1) z1 = pz[k];
      }
      return x0 <= x1 ? { x0, x1, z0, z1 } : null;
    })();
    const _pitRect = pitBox ? [pitBox.x0, pitBox.x1, pitBox.z0, pitBox.z1] : null, _rectA = [0, 0, 0, 0];
    const PIT_GATE_PAD = 15;
    const nearPit = (x, z, r) => !!pitBox && x + r + PIT_GATE_PAD >= pitBox.x0 && x - r - PIT_GATE_PAD <= pitBox.x1 &&
      z + r + PIT_GATE_PAD >= pitBox.z0 && z - r - PIT_GATE_PAD <= pitBox.z1;
    // The complex's footprint at node k as a lateral RANGE on the pit side,
    // [beyond the verge, its far edge]: the verge itself stays placeable, so a
    // gantry leg or a marshal post can still stand between the track and the
    // wall exactly as it does on a real pit straight.
    const pitFastIn = track.pit ? track.pit.off.fastIn : 0;
    const inPitFootprint = (k, lat, halfLat, outerMargin) => {
      if (!pitKeep || !(pitKeep[k] > 0)) return false;
      // The verge AND the platform stay placeable (a gantry leg, a post, a
      // marshal stand on a real pit straight); the lane tarmac onward is the
      // complex's alone. `outerMargin` is a clearance a caller asks for from
      // the OUTER edge only — clearTreeDist asks with the crown radius, so a
      // tree pushes out until its crown clears the garages instead of
      // standing at the line with its crown through the roofs. Nobody else
      // asks: a lake's or a backdrop's road clearance is not a pit clearance
      // (Shanghai's required lake was superseded the moment it was).
      const a0 = hw[k] + Math.max(pitVerge, pitFastIn * pitV[k]) + 0.3, a1 = hw[k] + pitKeep[k];
      const c = lat * pitSide;
      return c + halfLat > a0 && c - halfLat - (outerMargin || 0) < a1;
    };
    // Set by onRoadHit when the hit was the PIT COMPLEX rather than the road,
    // so a rejected model can be recorded as superseded rather than as a
    // failure: a circuit's hand-placed pit block, tower or bay now stands
    // where the engine builds the complex, and dropping it is the intent.
    let _pitReject = false;
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz, botY) => {
      const mhFull = grid.maxHw + pitMax;
      const rFull = (rad > 0 ? rad + mhFull : Math.hypot(hx + mhFull, hz + mhFull)) + 2;
      const mh = nearPit(cx, cz, rFull) ? mhFull : grid.maxHw;
      // The complex keeps FOOTINGS out, not a crown: a RADIAL primitive (a
      // tree's canopy tier) whose underside is well above the road may reach
      // over the complex's edge, the way a crown reaches over a verge. Testing
      // every tier of a tree at the edge dropped its middle and kept its top,
      // which the float sweep reported on thirty circuits. Boxes never get
      // the exemption: a building's upper storey over the complex with its
      // ground floor superseded is the same float from the other side.
      const R = (rad > 0 ? rad + mh : Math.hypot(hx + mh, hz + mh)) + 2;
      let _cn;
      if (rad > 0) _cn = grid.query(cx, cz, R, _hitCand, false);
      else {
        // A BOX hits the road only at a node e with |e·r| <= hx + w and
        // |e·f| <= hz + w (r, f: its axes projected onto xz). Inverting that
        // 2x2 bounds |ex|, |ez| — for a long thin box a strip, not the circle
        // of its half-diagonal. The pit branch fires only on a pit node, and
        // every pit node lies in pitBox, so the query keeps the strip's cells
        // UNION pitBox's: query()'s list minus nodes that can hit nothing, in
        // query()'s order, so the first hit (and _pitReject) is unchanged.
        const det = Math.abs(arx * afz - arz * afx), A = hx + grid.maxHw, B = hz + grid.maxHw;
        let ex = det > 1e-6 ? (Math.abs(afz) * A + Math.abs(arz) * B) / det + 1 : R;
        let ez = det > 1e-6 ? (Math.abs(afx) * A + Math.abs(arx) * B) / det + 1 : R;
        if (!(ex < R)) ex = R; if (!(ez < R)) ez = R;
        _rectA[0] = cx - ex; _rectA[1] = cx + ex; _rectA[2] = cz - ez; _rectA[3] = cz + ez;
        _cn = grid.queryRects(cx, cz, R, _rectA, _pitRect, _hitCand);
      }
      for (let _ci = 0; _ci < _cn; _ci++) {
        const k = _hitCand[_ci];
        if (topY < py[k] - 0.3) continue;                 // sits below road here
        const w = hw[k];
        if (pitKeep && pitKeep[k] > 0 && !(botY > py[k] + 2.5)) {
          // The pit complex: the footprint's lateral reach at this node against
          // the complex's range, provided the node lies along the footprint.
          const lat = (cx - px[k]) * track.rx[k] + (cz - pz[k]) * track.rz[k];
          const along = (cx - px[k]) * track.tx[k] + (cz - pz[k]) * track.tz[k];
          const halfLat = rad > 0 ? rad : Math.abs(arx * track.rx[k] + arz * track.rz[k]) * hx + Math.abs(afx * track.rx[k] + afz * track.rz[k]) * hz;
          const halfAlong = rad > 0 ? rad : Math.abs(arx * track.tx[k] + arz * track.tz[k]) * hx + Math.abs(afx * track.tx[k] + afz * track.tz[k]) * hz;
          if (Math.abs(along) <= halfAlong + ds && inPitFootprint(k, lat, halfLat)) { _pitReject = true; return true; }
        }
        const dxc = px[k] - cx, dzc = pz[k] - cz;
        // Reach to the farthest footprint point: an oriented box can extend to its
        // half-DIAGONAL, not just max(hx,hz), so the prefilter must use the diagonal
        // or it will skip road nodes a large rotated box actually covers.
        // Far reject: the Minkowski test below expands the footprint by w on each
        // axis, so the prefilter reach must use the EXPANDED half-extents (a thin
        // box's hit corner can sit at hypot(hx+w, hz+w) from centre).
        const reach = (rad > 0 ? rad + w : Math.hypot(hx + w, hz + w)) + 2;
        if (dxc * dxc + dzc * dzc > reach * reach) continue;   // cheap far reject
        const ex = px[k] - cx, ez = pz[k] - cz;
        if (rad > 0) {
          // circle footprint vs road capsule of radius w
          const rr = rad + w;
          if (ex * ex + ez * ez <= rr * rr) return true;
        } else {
          // oriented rectangle expanded by w on each axis
          const a = Math.abs(ex * arx + ez * arz), b = Math.abs(ex * afx + ez * afz);
          if (a <= hx + w && b <= hz + w) return true;
        }
      }
      return false;
    };
    const rejBox = (c, sz, basis) => {
      _pitReject = false;
      const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
      const topY = c[1] + Math.abs(sz[0] / 2 * r[1]) + Math.abs(sz[1] / 2 * u[1]) + Math.abs(sz[2] / 2 * f[1]);
      return onRoadHit(c[0], c[2], topY, 0, r[0], r[2], f[0], f[2], sz[0] / 2, sz[2] / 2);
    };
    const rejRad = (c, rad, h, basis, crown) => {
      _pitReject = false;
      const u = basis ? basis[1] : [0, 1, 0];
      const topY = c[1] + Math.max(0, h * u[1]) + rad;     // generous top estimate
      // A CROWN (cone, frustum) hands its underside over so it may reach over
      // the complex's edge — the base centre, not `c - rad`: a 16 m tier 10 m
      // up read as a footing with the radius taken off, and Monza's poplars
      // lost their lowest tier. A cylinder is a post or a mast: a footing,
      // whose head must not outlive it.
      return onRoadHit(c[0], c[2], topY, rad, 0, 0, 0, 0, 0, 0, crown ? c[1] + Math.min(0, h * u[1]) : undefined);
    };
    const onTrack = (x, z, margin, pitMargin) => {
      _pitReject = false;
      const rFull = grid.maxHw + pitMax + margin + ds + 1;
      const R = nearPit(x, z, rFull) ? rFull : grid.maxHw + margin + ds + 1;
      const _cn = grid.query(x, z, R, _trkCand, false);
      for (let _ci = 0; _ci < _cn; _ci++) {
        const i = _trkCand[_ci];
        const j = (i + 1) % n;
        const dx = px[j] - px[i], dz = pz[j] - pz[i];
        const len2 = dx * dx + dz * dz;
        if (len2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((x - px[i]) * dx + (z - pz[i]) * dz) / len2));
        const cx = px[i] + t * dx, cz = pz[i] + t * dz;
        const lat = Math.hypot(x - cx, z - cz);
        const hwt = hw[i] + (hw[j] - hw[i]) * t;
        if (lat < hwt + margin) return true;
        if (pitKeep && pitKeep[i] > 0) {
          // The POINT against the complex — not the point plus the road
          // margin, which is a clearance from the racing surface and would
          // push a gantry leg or a post off the verge it belongs on — and only
          // where the point lies ALONGSIDE this node: the query radius reaches
          // the whole complex width, so without the along-track bound a post
          // 40 m past the exit road read as inside the last easing node.
          const al = (x - px[i]) * track.tx[i] + (z - pz[i]) * track.tz[i];   // along, from node i
          if (al >= -ds && al <= ds) {
            const sl = (x - px[i]) * track.rx[i] + (z - pz[i]) * track.rz[i];   // signed lateral
            // The caller's road margin counts on the OUTER edge too, capped
            // at 3 m: a hedge asks with its half-width and then emits a box of
            // that width, and a base that passed as a point 15 cm outside
            // the edge shipped the lump on top of a box the guard dropped.
            // The cap keeps a lake's or a backdrop's half-width (their
            // "margin") from superseding a required model whole.
            const outer = Math.max(pitMargin || 0, Math.min(margin || 0, 3));
            if (inPitFootprint(i, sl, 0, outer)) { _pitReject = true; return true; }
          }
        }
      }
      return false;
    };

    return { pitKeep, pitSide, inPitFootprint, onRoadHit, rejBox, rejRad, onTrack, pitRejected: () => _pitReject };
  }

  return { create };
})();
Object.freeze(SceneryGuards);
