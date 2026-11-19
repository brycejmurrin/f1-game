const ApexCam = (function () {
  "use strict";

  function hooks(G, deps) {
    const { smp, smp2, camVantage, setCamMode, snapGameCam } = deps;
    const { CAM_MODES } = CamModes;

function clearShot(n, place) {
  if (typeof FlybySeq === "undefined" || typeof FlybySight === "undefined") return place(0) ? { T: null, tries: 1 } : null;
  let best = 0, bestT = -1;
  for (let i = 0; i < n; i++) {
    const r = place(i);
    if (!r) return null;
    const T = FlybySeq.insideProp(G.track, r.eye, 1) ? 0 : FlybySight.transmit(G.track, r.eye, r.target).T;
    if (T >= 0.5) return { T: +T.toFixed(2), tries: i + 1 };
    if (T > bestT) { bestT = T; best = i; }
  }
  place(best);
  return { T: +bestT.toFixed(2), tries: n, blocked: true };
}
const CLEAR_AZ = [0, 20, -20, 40, -40, 60, -60, 90, -90];
const CLEAR_SIDE = [[1, 1], [1, 0.7], [1, 0.45], [-1, 1], [-1, 0.7], [-1, 0.45]];

    return {
cameraState() { return G.cameraDampingState(); },
camera(m) {
    if (m == null) return { mode: CAM_MODES[G.camMode].id, index: G.camMode, modes: CAM_MODES.map((c) => c.id) };
    const i = typeof m === "number" ? m : CAM_MODES.findIndex((c) => c.id === String(m).toLowerCase());
    if (!(Number.isInteger(i) && i >= 0 && i < CAM_MODES.length)) return false;
    G.dbgCam = null;
    setCamMode(i);
    if ((G.state === "race" || G.state === "count") && G.refreshHud) G.refreshHud(true);
    return { mode: CAM_MODES[G.camMode].id, index: G.camMode };
  },
snapCam(paint) {
    if (!G.player || !G.track) return;
    G.dbgCam = null;
    snapGameCam(paint);
  },
previewCam(mode, frac = 0, speed = 60, lat = 0) {
    if (!G.track) return false;
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    const s = (((frac % 1) + 1) % 1) * G.track.total;
    Tracks.sample(G.track, s, smp);
    const px = smp.p[0] + smp.r[0] * lat, pz = smp.p[2] + smp.r[2] * lat;
    const head = Math.atan2(smp.t[0], smp.t[2]);
    const v = camVantage(m, s, lat, speed, 0, { carPos: [px, pz], carHead: head });
    G.dbgCam = { eye: v.eye.slice(), target: v.tgt.slice(), fov: v.fov, far: 6000 };
    return { eye: v.eye, target: v.tgt, fov: +v.fov.toFixed(1), mode: m };
  },
flybyCam(u, shots) {
    if (!G.track || typeof FlybySeq === "undefined") return false;
    const list = (shots && shots.length) ? shots : (G.flybyShots || FlybySeq.DEFAULT);
    const v = FlybySeq.solve(G.track, +u || 0, list);
    const sh = list[v.index], onRoad = !!(sh && sh.eye && FlybySeq.onRoadPose(sh.eye[0]) && FlybySeq.onRoadPose(sh.eye[1]));
    const pr = onRoad ? Tracks.project(G.track, v.eye[0], v.eye[2], null, v.eye[1]) : null;
    G.dbgCam = {
      eye: v.eye.slice(), target: v.tgt.slice(), fov: v.fov,
      far: FlybySeq.FAR, fog: FlybySeq.FOG, cine: true,
    };
    const hit = FlybySeq.insideProp(G.track, v.eye, 0);
    return {
      u: +(+u || 0).toFixed(4), shot: v.id, index: v.index, cut: v.cut,
      eye: v.eye.map((n) => +n.toFixed(2)), target: v.tgt.map((n) => +n.toFixed(2)),
      fov: +v.fov.toFixed(1), lift: +(v.lift || 0).toFixed(2),
      onRoad, lat: pr ? +pr.lat.toFixed(2) : null,
      inside: hit ? { kind: hit.kind, size: [hit.w, hit.h, hit.d] } : null,
    };
  },
flybyShots() {
    if (typeof FlybySeq === "undefined") return null;
    return JSON.parse(JSON.stringify(G.flybyShots || FlybySeq.DEFAULT));
  },
camTune(mode, obj) {
    if (mode == null) {
      const out = { defs: CamTune.defs().map((d) => ({ id: d.id, min: d.min, max: d.max, def: d.def, unit: d.unit })), tuned: {} };
      for (const m of CamTune.tunedModes()) out.tuned[m] = CamTune.values(m);
      return out;
    }
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    if (obj === undefined) return CamTune.values(m);
    if (obj === null) CamTune.reset(m);
    else if (typeof obj === "object") for (const k of Object.keys(obj)) CamTune.set(m, k, +obj[k]);
    else return false;
    CamTune.persist();
    if (G.player && G.track) snapGameCam();
    CamTunerPanel.refresh();
    return CamTune.values(m);
  },
pitCamAuto(on) {
    if (typeof ExtraRigs === "undefined") return false;
    return ExtraRigs.pitCamAuto(G.store, on);
  },
camState: () => Object.assign(G.dbgCam
    ? { eye: Array.from(G.dbgCam.eye), tgt: Array.from(G.dbgCam.target), fov: G.dbgCam.fov, roll: 0, debug: true }
    : { eye: Array.from(G.camEye), tgt: Array.from(G.camTgt), fov: G.camFov, roll: G.camRoll, debug: false },
  { lens: G.lens ? Object.assign({}, G.lens) : null }),
freeCam(opts) { return typeof FreeCam !== "undefined" ? FreeCam.cmd(opts) : false; },
view(opts) {
    if (!G.track) return false;
    if (opts === "chase" || (opts && opts.mode === "chase")) { G.dbgCam = null; return { mode: "chase" }; }
    opts = opts || {};
    if (opts.eye && (opts.yaw != null || opts.pitch != null)) {
      const yaw = (opts.yaw || 0) * Math.PI / 180, pit = Math.min(80, Math.max(-80, opts.pitch || 0)) * Math.PI / 180;
      const d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
      const e = opts.eye;
      G.dbgCam = { eye: e.slice(), target: [e[0] + d[0] * 100, e[1] + d[1] * 100, e[2] + d[2] * 100], fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return { eye: e.slice(), yaw: opts.yaw || 0, pitch: opts.pitch || 0 };
    }
    if (opts.eye && opts.target) {
      G.dbgCam = { eye: opts.eye.slice(), target: opts.target.slice(), fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return G.dbgCam;
    }
    if (opts.s != null && opts.side != null) {
      if (opts.clear) {
        let res;
        const c = clearShot(CLEAR_SIDE.length, (i) => (res = this.view(Object.assign({}, opts, { clear: false,
          side: (opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1)) * CLEAR_SIDE[i][0],
          dist: (opts.dist != null ? opts.dist : 14) * CLEAR_SIDE[i][1] }))));
        return res && Object.assign(res, { clear: c });
      }
      Tracks.sample(G.track, opts.s * G.track.total, smp);
      const side = opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1);
      const dist = opts.dist != null ? opts.dist : 14, height = opts.height != null ? opts.height : 9;
      const p = smp.p, r = smp.r;
      const eye = [p[0] + r[0] * side * dist, p[1] + height, p[2] + r[2] * side * dist];
      const target = opts.look === "in"
        ? [p[0], p[1] + 1, p[2]]
        : [p[0] + r[0] * side * (dist + 80), p[1] + height * 0.4, p[2] + r[2] * side * (dist + 80)];
      G.dbgCam = { eye, target, fov: Math.min(170, Math.max(1, opts.fov || 62)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target };
    }
    let cx, cy, cz, span;
    if (opts.s != null) {
      Tracks.sample(G.track, opts.s * G.track.total, smp);
      cx = smp.p[0]; cy = smp.p[1]; cz = smp.p[2];
      span = Math.max(10, opts.radius || 180);
    } else {
      let nx = Infinity, xx = -Infinity, nz = Infinity, xz = -Infinity, ny = Infinity, xy = -Infinity;
      for (let i = 0; i < G.track.n; i++) {
        const x = G.track.px[i], z = G.track.pz[i], y = G.track.py[i];
        if (x < nx) nx = x; if (x > xx) xx = x; if (z < nz) nz = z; if (z > xz) xz = z;
        if (y < ny) ny = y; if (y > xy) xy = y;
      }
      cx = (nx + xx) / 2; cy = (ny + xy) / 2; cz = (nz + xz) / 2;
      span = Math.max(xx - nx, xz - nz);
    }
    const az = (opts.azimuth != null ? opts.azimuth : 35) * Math.PI / 180;
    const el = Math.min(85, Math.max(5, opts.elevation != null ? opts.elevation : 55)) * Math.PI / 180;
    const dist = span * (opts.zoom != null ? opts.zoom : 1.0) * 0.95 + 60;
    const eye = [
      cx + Math.cos(el) * Math.sin(az) * dist,
      cy + Math.sin(el) * dist,
      cz + Math.cos(el) * Math.cos(az) * dist,
    ];
    G.dbgCam = { eye, target: [cx, cy, cz], fov: Math.min(170, Math.max(1, opts.fov || 55)), far: Math.max(6000, dist * 4), fog: opts.fog };
    return { eye, target: [cx, cy, cz], span: Math.round(span) };
  },
eyeAt(f, lat = 0, h = 2.5, lookF, lookLat = 0, lookH = 1) {
    if (!G.track) return false;
    const sPos = ((f % 1) + 1) % 1 * G.track.total;
    Tracks.sample(G.track, sPos, smp);
    const bk = Tracks.banking(G.track, sPos, lat);
    const eye = [smp.p[0] + smp.r[0] * lat, smp.p[1] + h + (bk ? bk.dy : 0), smp.p[2] + smp.r[2] * lat];
    const lf = lookF == null ? f + 0.01 : lookF;
    const lPos = ((lf % 1) + 1) % 1 * G.track.total;
    Tracks.sample(G.track, lPos, smp2);
    const lbk = Tracks.banking(G.track, lPos, lookLat);
    const tgt = [smp2.p[0] + smp2.r[0] * lookLat, smp2.p[1] + lookH + (lbk ? lbk.dy : 0), smp2.p[2] + smp2.r[2] * lookLat];
    G.dbgCam = { eye, target: tgt, fov: 60, far: 6000 };
    return { eye, target: tgt };
  },
orbit(f, az = 35, el = 18, dist = 30, h = 1.5, opts = {}) {
    if (!G.track) return false;
    if (opts.clear) {
      let res;
      const c = clearShot(CLEAR_AZ.length, (i) => (res = this.orbit(f, az + CLEAR_AZ[i], el, dist, h, Object.assign({}, opts, { clear: false }))));
      return res && Object.assign(res, { clear: c });
    }
    Tracks.sample(G.track, ((f % 1) + 1) % 1 * G.track.total, smp);
    const cx = smp.p[0], cy = smp.p[1] + h, cz = smp.p[2];
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    const fwd = [smp.t[0], 0, smp.t[2]], rt = [smp.r[0], 0, smp.r[2]];
    const dir = [Math.cos(a) * fwd[0] + Math.sin(a) * rt[0], 0, Math.cos(a) * fwd[2] + Math.sin(a) * rt[2]];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cy + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    G.dbgCam = { eye, target: [cx, cy, cz], fov, far: opts.far || 6000, fog: opts.fog };
    return { eye, target: [cx, cy, cz], fov };
  },
studio(arg = true) {
    if (arg === false || arg === 0) {
      if (G._studioRig && G._studioRig._ambStash) {
        G.frame.ambientSky = G._studioRig._ambStash[0];
        G.frame.ambientGround = G._studioRig._ambStash[1];
      }
      G._studioRig = null;
      return false;
    }
    const o = typeof arg === "object" && arg ? arg : {};
    if (G._studioRig && G._studioRig._ambStash) {
      G.frame.ambientSky = G._studioRig._ambStash[0];
      G.frame.ambientGround = G._studioRig._ambStash[1];
    }
    G._studioRig = {
      n: o.n || 6, dist: o.dist || 7, h: o.h != null ? o.h : 4.5,
      intensity: o.intensity != null ? o.intensity : 1.6,
      color: o.color || [1, 1, 1], radius: o.radius || 18, spin: o.spin || 0,
      fill: o.fill != null ? o.fill : 0.5,
    };
    const f = G._studioRig.fill;
    if (f > 0) {
      G._studioRig._ambStash = [G.frame.ambientSky, G.frame.ambientGround];
      const mixv = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      G.frame.ambientSky = mixv(G.frame.ambientSky || [0, 0, 0], [0.30, 0.31, 0.35]);
      G.frame.ambientGround = mixv(G.frame.ambientGround || [0, 0, 0], [0.20, 0.19, 0.18]);
    }
    return G._studioRig;
  },
carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
    if (!G.track || !G.cars || !G.cars.length) return false;
    const useFallback = (idx <= 0 || !G.cars[idx]);
    const c = useFallback ? (G.player || G.cars[0]) : G.cars[idx];
    if (!c) return false;
    const carIdx = G.cars.indexOf(c);
    const s = ((c.s % G.track.total) + G.track.total) % G.track.total;
    Tracks.sample(G.track, s, smp);
    const cx = (c.px != null) ? c.px : smp.p[0] + smp.r[0] * (c.x || 0);
    const cz = (c.pz != null) ? c.pz : smp.p[2] + smp.r[2] * (c.x || 0);
    const cyf = smp.p[1] + h;
    const hd = (c.human && c.head != null) ? c.head : Math.atan2(smp.t[0], smp.t[2]);
    const fwdX = Math.sin(hd), fwdZ = Math.cos(hd);
    const rtX  = Math.cos(hd), rtZ  = -Math.sin(hd);
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    const dir = [-Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, -Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cyf + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    G.dbgCam = { eye, target: [cx, cyf, cz], fov, far: opts.far || 4000, fog: opts.fog };
    const out = { eye, target: [cx, cyf, cz], fov, carIdx, speed: +(c.speed || 0).toFixed(1) };
    if (useFallback && idx !== 0 && idx !== carIdx) out.fallback = true;
    return out;
  },
dolly(f, fwd = 0, right = 0, up = 5, opts = {}) {
    if (!G.track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(G.track, fr * G.track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [
      p[0] + t[0] * fwd + r[0] * right,
      p[1] + up,
      p[2] + t[2] * fwd + r[2] * right,
    ];
    const lf = ((((opts.lookF != null ? opts.lookF : f + 0.015) % 1) + 1) % 1);
    Tracks.sample(G.track, lf * G.track.total, smp2);
    const lr = opts.lookLat || 0, lh = opts.lookH != null ? opts.lookH : 1.5;
    const tgt = [smp2.p[0] + smp2.r[0] * lr, smp2.p[1] + lh, smp2.p[2] + smp2.r[2] * lr];
    G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt };
  },
roadside(f, side = 1, dist = 10, h = 2.5, opts = {}) {
    if (!G.track) return false;
    if (opts.clear) {
      let res;
      const c = clearShot(CLEAR_SIDE.length, (i) => (res = this.roadside(f, side * CLEAR_SIDE[i][0], dist * CLEAR_SIDE[i][1], h, Object.assign({}, opts, { clear: false }))));
      return res && Object.assign(res, { clear: c });
    }
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(G.track, fr * G.track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [p[0] + r[0] * side * dist, p[1] + h, p[2] + r[2] * side * dist];
    const la = opts.lookAhead != null ? opts.lookAhead : 30;
    const look = opts.look || "fwd";
    let tgt;
    if (look === "in") {
      tgt = [p[0] - r[0] * side * dist * 0.5, p[1] + 1, p[2] - r[2] * side * dist * 0.5];
    } else if (look === "out") {
      tgt = [p[0] + r[0] * side * (dist + 60), p[1] + h * 0.6, p[2] + r[2] * side * (dist + 60)];
    } else {
      const sign = look === "back" ? -1 : 1;
      const lf = ((fr + sign * la / G.track.total % 1) + 1) % 1;
      Tracks.sample(G.track, lf * G.track.total, smp2);
      tgt = [smp2.p[0], smp2.p[1] + 1, smp2.p[2]];
    }
    G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt, look };
  },
    };
  }

  return { hooks };
})();
Object.freeze(ApexCam);
