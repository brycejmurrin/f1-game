var StartLights = (function () {
  "use strict";
  const LAMPS = 5;
  const SPACING = 0.9;
  const DROP = 0.62;
  const FACE = 0.30;
  const GAIN = 2.84;
  const NEAR = 0.03;
  const CATCHUP_S = 1;

  function countCredit(wallS, dtS, droppedS) {
    const wall = Math.min(CATCHUP_S, wallS > 0 ? wallS : 0);
    return Math.max(0, wall - (dtS > 0 ? dtS : 0)) + (droppedS > 0 ? droppedS : 0);
  }

  function create(G, deps) {
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const _lampsBy = new WeakMap();

    function anchorFor(track) {
      const list = track.props && track.props.list, n = track.n;
      if (list && track.px && n > 2) {
        let best = null, bestD = Infinity;
        for (const r of list) {
          if (r.kind !== "gantry" || r.side !== 0 || !(r.k >= 0)) continue;
          const d = Math.min(r.k, n - r.k);
          if (d < bestD || (d === bestD && r.startLights && !best.startLights)) { bestD = d; best = r; }
        }
        if (best && bestD <= n * NEAR) {
          const k = best.k, k0 = (k + n - 1) % n, k1 = (k + 1) % n;
          return { c: best.lamp || [best.x, best.y + best.h / 2 - DROP, best.z],
                   tx: track.px[k1] - track.px[k0], tz: track.pz[k1] - track.pz[k0],
                   face: best.face > 0 ? best.face : FACE };
        }
      }
      const g = track.startGate;
      if (g && g.c && g.t) return { c: g.c, tx: g.t[0], tz: g.t[2], face: g.face > 0 ? g.face : FACE };
      return null;
    }

    function lampsFor(track) {
      if (!track) return null;
      if (_lampsBy.has(track)) return _lampsBy.get(track);
      const a = anchorFor(track);
      if (!a) { if (track.props && track.props.list) _lampsBy.set(track, null); return null; }
      const tl = Math.hypot(a.tx, a.tz) || 1, tx = a.tx / tl, tz = a.tz / tl;
      const rx = -tz, rz = tx;
      const lamps = [];
      for (let i = 0; i < LAMPS; i++) {
        const lat = (i - (LAMPS - 1) / 2) * SPACING;
        lamps.push([a.c[0] + rx * lat - tx * a.face, a.c[1], a.c[2] + rz * lat - tz * a.face]);
      }
      _lampsBy.set(track, lamps);
      return lamps;
    }

    let _countCam = null;
    function countdownCamera() {
      const lit = G.lightsLit | 0;
      if (G.state === "count" && lit >= 1 && lit <= 3 && G.track &&
          typeof FlybySeq !== "undefined" && FlybySeq.solve) {
        const fb = FlybySeq.solve(G.track, FlybySeq.gridProgress(lit), FlybySeq.GRID_SHOTS);
        if (!_countCam) _countCam = { eye: [0, 0, 0], target: [0, 0, 0], fov: 50, far: FlybySeq.FAR, fog: FlybySeq.FOG, cine: true, startLights: true };
        for (let i = 0; i < 3; i++) { _countCam.eye[i] = fb.eye[i]; _countCam.target[i] = fb.tgt[i]; }
        _countCam.fov = fb.fov;
        G.dbgCam = _countCam;
      } else if (_countCam && G.dbgCam === _countCam) {
        G.dbgCam = null;
      }
    }

    function update() {
      if (typeof FlybySeq !== "undefined" && FlybySeq.setHeroCars) {
        const flying = G.state === "menu" && G.loadingScreen && G.loadingScreen.active && G.loadingScreen.active();
        FlybySeq.setHeroCars(flying ? G.cars : null);
      }
      countdownCamera();
      if (!P || !P.flare || G.state !== "count") return;
      const lit = G.lightsLit | 0;
      if (lit <= 0) return;
      const lamps = lampsFor(G.track);
      if (!lamps) return;
      for (let i = 0; i < lit && i < lamps.length; i++) {
        const l = lamps[i];
        P.flare(l[0], l[1], l[2], 0.55, 1.0 * GAIN, 0.10 * GAIN, 0.05 * GAIN, 0.95, true);
      }
    }

    return { update, lampsFor, countCredit };
  }

  return { create, countCredit };
})();
Object.freeze(StartLights);
