const SceneryGuards = (function () {
  "use strict";

  function create(ctx) {
    const { track, n, px, py, pz, hw, ds, grid } = ctx;
    const _hitCand = new Array(n), _trkCand = new Array(n);
    const pitKeep = track.pit ? track.pit.keep : null, pitSide = track.pit ? track.pit.side : 0;
    const pitV = track.pit ? track.pit.v : null, pitVerge = track.pit ? track.pit.bands.verge : 0;
    const pitMax = (() => { let m = 0; if (pitKeep) for (let k = 0; k < n; k++) if (pitKeep[k] > m) m = pitKeep[k]; return m; })();
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
    const pitFastIn = track.pit ? track.pit.off.fastIn : 0;
    const inPitFootprint = (k, lat, halfLat, outerMargin) => {
      if (!pitKeep || !(pitKeep[k] > 0)) return false;
      const a0 = hw[k] + Math.max(pitVerge, pitFastIn * pitV[k]) + 0.3, a1 = hw[k] + pitKeep[k];
      const c = lat * pitSide;
      return c + halfLat > a0 && c - halfLat - (outerMargin || 0) < a1;
    };
    let _pitReject = false;
    const onRoadHit = (cx, cz, topY, rad, arx, arz, afx, afz, hx, hz, botY) => {
      const mhFull = grid.maxHw + pitMax;
      const rFull = (rad > 0 ? rad + mhFull : Math.hypot(hx + mhFull, hz + mhFull)) + 2;
      const mh = nearPit(cx, cz, rFull) ? mhFull : grid.maxHw;
      const R = (rad > 0 ? rad + mh : Math.hypot(hx + mh, hz + mh)) + 2;
      let _cn;
      if (rad > 0) _cn = grid.query(cx, cz, R, _hitCand, false);
      else {
        const det = Math.abs(arx * afz - arz * afx), A = hx + grid.maxHw, B = hz + grid.maxHw;
        let ex = det > 1e-6 ? (Math.abs(afz) * A + Math.abs(arz) * B) / det + 1 : R;
        let ez = det > 1e-6 ? (Math.abs(afx) * A + Math.abs(arx) * B) / det + 1 : R;
        if (!(ex < R)) ex = R; if (!(ez < R)) ez = R;
        _rectA[0] = cx - ex; _rectA[1] = cx + ex; _rectA[2] = cz - ez; _rectA[3] = cz + ez;
        _cn = grid.queryRects(cx, cz, R, _rectA, _pitRect, _hitCand);
      }
      for (let _ci = 0; _ci < _cn; _ci++) {
        const k = _hitCand[_ci];
        if (topY < py[k] - 0.3) continue;
        const w = hw[k];
        if (pitKeep && pitKeep[k] > 0 && !(botY > py[k] + 2.5)) {
          const lat = (cx - px[k]) * track.rx[k] + (cz - pz[k]) * track.rz[k];
          const along = (cx - px[k]) * track.tx[k] + (cz - pz[k]) * track.tz[k];
          const halfLat = rad > 0 ? rad : Math.abs(arx * track.rx[k] + arz * track.rz[k]) * hx + Math.abs(afx * track.rx[k] + afz * track.rz[k]) * hz;
          const halfAlong = rad > 0 ? rad : Math.abs(arx * track.tx[k] + arz * track.tz[k]) * hx + Math.abs(afx * track.tx[k] + afz * track.tz[k]) * hz;
          if (Math.abs(along) <= halfAlong + ds && inPitFootprint(k, lat, halfLat)) { _pitReject = true; return true; }
        }
        const dxc = px[k] - cx, dzc = pz[k] - cz;
        const reach = (rad > 0 ? rad + w : Math.hypot(hx + w, hz + w)) + 2;
        if (dxc * dxc + dzc * dzc > reach * reach) continue;
        const ex = px[k] - cx, ez = pz[k] - cz;
        if (rad > 0) {
          const rr = rad + w;
          if (ex * ex + ez * ez <= rr * rr) return true;
        } else {
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
      const topY = c[1] + Math.max(0, h * u[1]) + rad;
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
          const al = (x - px[i]) * track.tx[i] + (z - pz[i]) * track.tz[i];
          if (al >= -ds && al <= ds) {
            const sl = (x - px[i]) * track.rx[i] + (z - pz[i]) * track.rz[i];
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
