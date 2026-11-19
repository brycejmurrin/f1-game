const GameCams = (function () {
  "use strict";

let VMAX = 72;
function init(opts) {
  Log.info("game", "GameCams.init");
  if (opts && opts.vmax) VMAX = opts.vmax;
}

const clamp = M4.clamp, lerp = M4.lerp;

const cvA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const cvB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _bankScr = { dy: 0, roll: 0 };
const _vantP = [0, 0, 0];
const _vantEyeW = [0, 0, 0], _vantTgtW = [0, 0, 0];
const _aheadOut = [0, 0, 0];
const _straightScr = [0, 0, 0];
const _dirScr = [0, 0, 0];
let _vTrack = null, _vS = 0, _vOnboard = false;
function _vWrapS(v) { const L = _vTrack.total; v %= L; return v < 0 ? v + L : v; }
function _vElevY(at) { return _vOnboard ? null : centreY(_vTrack, at); }
function _vAheadPt(d, h, lat) {
  Tracks.sample(_vTrack, _vWrapS(_vS + d), cvB);
  const lx = lat || 0;
  const ey = _vElevY(_vS + d);
  const o = _aheadOut;
  o[0] = cvB.p[0] + cvB.r[0] * lx;
  o[1] = (ey === null ? cvB.p[1] : ey) + (h || 0);
  o[2] = cvB.p[2] + cvB.r[2] * lx;
  return o;
}

const COCKPIT_EYE_FWD = -0.20, COCKPIT_EYE_UP = 0.82;
const CAR_BOX_HALF_L = 2.9, CAR_BOX_HALF_W = 1.0, CAR_BOX_H = 1.2;
function eyeInsideCar(along, lat, up, pad) {
  const p = pad > 0 ? pad : 0;
  return Math.abs(along) < CAR_BOX_HALF_L + p && Math.abs(lat) < CAR_BOX_HALF_W + p && up > -p && up < CAR_BOX_H + p;
}
const VISOR_EYE_FWD = COCKPIT_EYE_FWD, VISOR_EYE_UP = COCKPIT_EYE_UP;

function seatFwd(mode) {
  if (mode === "visor") return VISOR_EYE_FWD;
  return typeof CockpitOpts !== "undefined" ? CockpitOpts.layout().eyeF : COCKPIT_EYE_FWD;
}
function seatUp(mode) {
  if (mode === "visor") return VISOR_EYE_UP;
  return typeof CockpitOpts !== "undefined" ? CockpitOpts.layout().eyeU : COCKPIT_EYE_UP;
}

const HELMET_EYE_FWD = 0.05;
const HEAD_ROLL_MAX = 0.055, HEAD_DIVE_MAX = 0.024;
const HEAD_LAT = 0.45;
const HEAD_NOD_FWD = 0.6;
const HEAD_NOD_DOWN = 0.35;
const HEAD_NOD_AIM = 8;
const HEAD_MAX = Object.freeze({ lat: HEAD_ROLL_MAX * HEAD_LAT, fwd: HEAD_DIVE_MAX * HEAD_NOD_FWD, down: HEAD_DIVE_MAX * HEAD_NOD_DOWN });
const _head = [0, 0, 0, 0], _headScr = [0, 0, 0, 0];
function headOffset(mode, extra, out) {
  out[0] = out[1] = out[2] = out[3] = 0;
  if (mode !== "cockpit" && mode !== "visor" && mode !== "helmet") return out;
  if (mode === "helmet") out[2] = HELMET_EYE_FWD;
  const a = extra.att;
  if (!a || extra.reduceMotion) return out;
  const k = typeof CamTune !== "undefined" && CamTune.bob ? CamTune.bob() : 1;
  const roll = clamp(a.baRoll || 0, -HEAD_ROLL_MAX, HEAD_ROLL_MAX), dive = clamp(a.baPitch || 0, 0, HEAD_DIVE_MAX);
  out[0] = -roll * HEAD_LAT * k;
  out[1] = -dive * HEAD_NOD_DOWN * k;
  out[2] += dive * HEAD_NOD_FWD * k;
  out[3] = dive * HEAD_NOD_AIM * k;
  return out;
}
function headState() { return { lat: _head[0], up: _head[1], fwd: _head[2], nod: _head[3] }; }

function cockpitViewmodelAxes(sR, sF, yv, eye, outR, outU, outF, outP, fwd, up) {
  const eF = (fwd == null ? COCKPIT_EYE_FWD : fwd) + _head[2], eU = (up == null ? COCKPIT_EYE_UP : up) + _head[1];
  const cy = Math.cos(yv), sy = Math.sin(yv);
  for (let i = 0; i < 3; i++) {
    outF[i] = sF[i] * cy + sR[i] * sy;
    outR[i] = sR[i] * cy - sF[i] * sy;
  }
  outU[0] = outR[1] * outF[2] - outR[2] * outF[1];
  outU[1] = outR[2] * outF[0] - outR[0] * outF[2];
  outU[2] = outR[0] * outF[1] - outR[1] * outF[0];
  for (let i = 0; i < 3; i++)
    outP[i] = eye[i] - outR[i] * _head[0] - outU[i] * eU - outF[i] * eF;
}

const CHASE_SIDE_FRAC = 0.3;
const CHASE_EYE_IN = 0.725;
const CHASE_CORNER_LEAD_DEFAULT = 0.54;
const CHASE_G_DOLLY = 14;
const CHASE_G_AIM   = 5;

const _hangOut = Object.create(null);
const _hangFast = Object.create(null);
const _bendSgn = Object.create(null), _bendDwell = Object.create(null);
function resetSmoothing() {
  for (const k in _hangOut) delete _hangOut[k];
  for (const k in _hangFast) delete _hangFast[k];
  for (const k in _bendSgn) delete _bendSgn[k];
  for (const k in _bendDwell) delete _bendDwell[k];
}
const BEND_DWELL = 0.7;
function bendSide(key, kA, lo, hi, dt, snap, neutral) {
  const raw = kA > lo ? 1 : kA < -lo ? -1 : 0;
  if (neutral && raw === 0 && dt > 0 && !snap) { const hk1 = hangKey(key); _bendSgn[hk1] = 0; _bendDwell[hk1] = 0; return 0; }
  if (!(dt > 0) || snap) { if (snap) { const hk0 = hangKey(key); _bendSgn[hk0] = raw; _bendDwell[hk0] = 0; } return raw; }
  const hk = hangKey(key), cur = _bendSgn[hk] || 0;
  const dwell = Math.max(0, (_bendDwell[hk] || 0) - dt);
  _bendDwell[hk] = dwell;
  if (raw === cur) return cur;
  if (cur === 0 || (raw !== 0 && dwell <= 0 && Math.abs(kA) > hi)) { _bendSgn[hk] = raw || cur; _bendDwell[hk] = BEND_DWELL; return raw || cur; }
  return cur;
}
function hangKey(key) {
  return typeof CamFeel !== "undefined" && CamFeel.scopeKey ? CamFeel.scopeKey(key) : key;
}
function hangReset(key, lambda) {
  const hk = hangKey(key);
  _hangOut[hk] = 0; _hangFast[hk] = 0;
  if (typeof CamFeel !== "undefined") CamFeel.follow(key, 0, lambda, 0);
}
function bendHang(key, kA, dt, reduce, gain, lambda, snap) {
  if (!(dt > 0) || reduce || !gain) { if (snap || reduce) hangReset(key, lambda); return 0; }
  if (!kA) { hangReset(key, lambda); return 0; }
  const raw = clamp(kA * 18, -1, 1), hk = hangKey(key);
  const prev = _hangOut[hk] || 0;
  let fast = _hangFast[hk] || 0;
  if (prev * raw < -0.02) fast = 0.45;
  else fast = Math.max(0, fast - dt);
  _hangFast[hk] = fast;
  const lam = fast > 0 ? lambda * 3.2 : lambda;
  const eased = typeof CamFeel !== "undefined" ? CamFeel.follow(key, raw, lam, dt) : raw;
  _hangOut[hk] = eased;
  return eased * gain;
}
function speedOpen(key, spN, dt, reduce, snap, metres, lambda) {
  if (reduce || !(metres > 0)) return 0;
  const target = clamp(spN, 0, 1) * metres;
  if (!(dt > 0) && !snap) return 0;
  if (typeof CamFeel === "undefined") return target;
  if (!(dt > 0)) { CamFeel.follow(key, target, lambda, 0); return target; }
  return CamFeel.follow(key, target, lambda, dt);
}
function pullBack(eye, tgt, metres) {
  if (!(metres > 0)) return;
  let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-4) return;
  eye[0] -= (fx / fl) * metres;
  eye[2] -= (fz / fl) * metres;
}
function hangScale(mode) {
  if (typeof CamTune === "undefined" || typeof CamTune.cornerHang !== "function") return 1;
  const v = CamTune.cornerHang(mode);
  return v == null ? 1 : v;
}

function crY(p0, p1, p2, p3, t) { return VantageRide.crY(p0, p1, p2, p3, t); }
function softFloor(v, floor, k) { return VantageRide.softFloor(v, floor, k); }
function centreY(track, s) { return VantageRide.centreY(track, s); }
function rideY(track, s) { return VantageRide.rideY(track, s); }
function rideGrade(track, s) { return VantageRide.rideGrade(track, s); }

const KERB_RIB_M = 3.4;
const KERB_AMP = 0.011;
function onboardAttitude(mode, eye, tgt, extra, s, spN) {
  const a = extra.att;
  if (!a) return;
  const heave = a.baHeave || 0, pitch = a.baPitch || 0;
  const kerb = a.onKerb && !extra.reduceMotion ? Math.sin(s * (2 * Math.PI / KERB_RIB_M)) * KERB_AMP * spN : 0;
  eye[1] += heave + kerb;
  tgt[1] += heave - pitch * 24;
}

const _vantEye = [0, 0, 0], _vantTgt = [0, 0, 0];
const _vantOut = { eye: _vantEye, tgt: _vantTgt, fov: 60, fovBoost: 0 };
const _goodEye = [0, 1, 0], _goodTgt = [0, 1, 1];
let _goodFov = 60, _nanWarned = false;

function _vCorr(sAt, hw) {
  const tk = _vTrack;
  if (!tk.def || !tk.def.street) return Infinity;
  let c = Math.max(hw - 1.0, 4);
  if (typeof Tracks.wallAt === "function") {
    const w = Math.min(Tracks.wallAt(tk, sAt, 1), Tracks.wallAt(tk, sAt, -1)) - 0.6;
    if (w < c) c = Math.max(w, 1.5);
  }
  return c;
}
function _vWallClamp(eye, sAt) {
  const tk = _vTrack;
  if (!tk.def || !tk.def.street || typeof Tracks.wallAt !== "function") return;
  const w = _vWrapS(sAt);
  Tracks.sample(tk, w, cvB);
  const lat = (eye[0] - cvB.p[0]) * cvB.r[0] + (eye[2] - cvB.p[2]) * cvB.r[2];
  const side = lat >= 0 ? 1 : -1, a = lat * side;
  const cap = Math.max(Tracks.wallAt(tk, w, side) - 0.6, 1.5);
  if (!(a > cap - 0.5)) return;
  const d = (cap - softFloor(cap - a, 0, 0.5) - a) * side;
  eye[0] += cvB.r[0] * d; eye[2] += cvB.r[2] * d;
}

function vantage(track, mode, s, x, spd, now, extra) {
  extra = extra || {};
  if (!isFinite(spd)) spd = 0;
  if (!isFinite(x)) x = 0;
  const localLook = !!extra.att && !extra.noLook;
  if (extra.att) headOffset(mode, extra, _head);
  _vTrack = track; _vS = s;
  const wrapS = _vWrapS;
  const bankDy = extra.bankDy || 0;
  const dep = extra.deploy ? 1 : 0;
  const spN = clamp(spd / VMAX, 0, 1);
  const spFov = spN * (typeof CamTune !== "undefined" && CamTune.speedFov ? CamTune.speedFov() : 1);
  Tracks.sample(track, wrapS(s), cvA);
  const onboard = _vOnboard = mode === "cockpit" || mode === "hood" || mode === "visor" || mode === "helmet";
  const p = _vantP;
  p[0] = cvA.p[0] + cvA.r[0] * x;
  p[1] = (onboard ? cvA.p[1] : centreY(track, s)) + bankDy;
  p[2] = cvA.p[2] + cvA.r[2] * x;
  const t = cvA.t, r = cvA.r;
  const aheadPt = _vAheadPt;
  let kA = 0;
  if (mode === "heli" || mode === "side" || mode === "cinematic"
      || mode === "chase" || mode === "far" || mode === "drift"
      || mode === "overhead" || mode === "reverse") {
    const kHere = Tracks.curvature(track, wrapS(s));
    const kNear = Tracks.curvature(track, wrapS(s + lerp(15, 45, spN)));
    const kFar = Tracks.curvature(track, wrapS(s + lerp(35, 65, spN)));
    const kAhead = Math.abs(kFar) > Math.abs(kNear) + 0.0003 ? kFar : kNear;
    kA = Math.abs(kHere) > 0.012 ? kHere : kAhead;
  }
  let eyeS = s;
  let eye = _vantEyeW, tgt = _vantTgtW, fov, vantCut = false;
  if (mode === "rival" || mode === "pitwall" || mode === "drone") {
    if (typeof ExtraRigs !== "undefined") {
      fov = ExtraRigs.solve(mode, track, s, x, spd, now, extra, eye, tgt);
    } else {
      eye[0] = p[0] - t[0] * 8; eye[1] = p[1] + 3.5; eye[2] = p[2] - t[2] * 8;
      tgt[0] = p[0]; tgt[1] = p[1] + 0.8; tgt[2] = p[2];
      fov = 50;
    }
  } else if (onboard) {
    const driver = mode !== "hood";
    const eyeFwd = driver ? seatFwd(mode) : 0.55;
    const eyeUp  = driver ? seatUp(mode) : 0.95;
    if (extra.carPos) {
      const hx = Math.sin(extra.carHead || 0), hz = Math.cos(extra.carHead || 0);
      eye[0] = extra.carPos[0] + hx * eyeFwd; eye[1] = p[1] + eyeUp; eye[2] = extra.carPos[1] + hz * eyeFwd;
      const aimUp = driver ? eyeUp - 0.15 : eyeUp + 1.2;
      const tcL = driver && typeof CockpitOpts !== "undefined"
        ? CockpitOpts.turnChaseLead() : 0;
      let aimX = extra.carPos[0] + hx * 30, aimZ = extra.carPos[1] + hz * 30;
      if (tcL > 0) {
        const lp = aheadPt(30, aimUp, x * 0.4);
        aimX = aimX * (1 - tcL) + lp[0] * tcL;
        aimZ = aimZ * (1 - tcL) + lp[2] * tcL;
      }
      tgt[0] = aimX; tgt[1] = p[1] + aimUp + t[1] * 30; tgt[2] = aimZ;
      fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(64, 78, spFov) + dep * 3;
    } else {
      eye[0] = p[0] + t[0] * eyeFwd; eye[1] = p[1] + eyeUp; eye[2] = p[2] + t[2] * eyeFwd;
      if (driver) {
        const straight = _straightScr;
        straight[0] = p[0] + t[0] * 30; straight[1] = p[1] + eyeUp - 0.15 + t[1] * 30; straight[2] = p[2] + t[2] * 30;
        const w = typeof CockpitOpts !== "undefined" ? CockpitOpts.turnChaseLead() : 0;
        const lead = w > 0 ? aheadPt(30, eyeUp - 0.15, x * 0.4) : straight;
        tgt[0] = straight[0] * (1 - w) + lead[0] * w;
        tgt[1] = straight[1] * (1 - w) + lead[1] * w;
        tgt[2] = straight[2] * (1 - w) + lead[2] * w;
      } else {
        const av = aheadPt(30, eyeUp + 1.2, x * 0.6);
        tgt[0] = av[0]; tgt[1] = av[1]; tgt[2] = av[2];
      }
      fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(64, 78, spFov) + dep * 3;
    }
    const h = extra.att ? _head : headOffset(mode, extra, _headScr);
    if (driver && (h[0] || h[1] || h[2] || h[3])) {
      const fx = extra.carPos ? Math.sin(extra.carHead || 0) : t[0], fz = extra.carPos ? Math.cos(extra.carHead || 0) : t[2];
      const dx = -fz * h[0] + fx * h[2], dz = fx * h[0] + fz * h[2];
      eye[0] += dx; eye[1] += h[1]; eye[2] += dz;
      tgt[0] += dx; tgt[1] += h[1] - h[3]; tgt[2] += dz;
    }
  } else if (mode === "overhead") {
    const ohLead = extra.dt > 0 ? 8 + 16 * spN : 12;
    const ohOut = bendHang("ohBend", kA, extra.dt, extra.reduceMotion, 7 * hangScale("overhead"), 2.2, extra.snap);
    eye[0] = p[0] - t[0] * 9 + r[0] * ohOut; eye[1] = p[1] + 34; eye[2] = p[2] - t[2] * 9 + r[2] * ohOut;
    tgt[0] = p[0] + t[0] * ohLead; tgt[1] = p[1]; tgt[2] = p[2] + t[2] * ohLead;
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : 46;
  } else if (mode === "heli") {
    eyeS = s - 16;
    Tracks.sample(track, wrapS(eyeS), cvB);
    const sgnRaw = bendSide("bendHeli", kA, 0.001, 0.0015, extra.dt, extra.snap) || 1;
    const sgn = typeof CamFeel !== "undefined" ? CamFeel.follow("bendHeli", sgnRaw, 2.4, extra.dt || 0) : sgnRaw;
    const corr = _vCorr(wrapS(eyeS), cvB.hw);
    const hl = Math.min(12, corr);
    const hlLat = Math.min(hl * hangScale("heli"), corr);
    eye[0] = cvB.p[0] + cvB.r[0] * hlLat * sgn;
    eye[1] = centreY(track, s - 16) + 8.5 + (12 - hl) * 0.45 + bankDy;
    eye[2] = cvB.p[2] + cvB.r[2] * hlLat * sgn;
    eye[1] += speedOpen("heliClimb", spN, extra.dt, extra.reduceMotion, extra.snap, 2.2, 1.4);
    const heliAim = aheadPt(6, 0.7, x * 0.2);
    tgt[0] = heliAim[0]; tgt[1] = heliAim[1]; tgt[2] = heliAim[2];
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : 36 + dep * 2;
  } else if (mode === "reverse") {
    eyeS = s + 5.5;
    eye[0] = p[0] + t[0] * 5.5; eye[1] = p[1] + 1.35; eye[2] = p[2] + t[2] * 5.5;
    const revOut = bendHang("revBend", kA, extra.dt, extra.reduceMotion, 3.6 * hangScale("reverse"), 5, extra.snap);
    eye[0] += r[0] * revOut; eye[2] += r[2] * revOut;
    tgt[0] = p[0] - t[0] * 26; tgt[1] = p[1] + 0.9; tgt[2] = p[2] - t[2] * 26;
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(60, 72, spFov);
  } else if (mode === "side") {
    const sgnRaw = bendSide("bendSide", kA, 0.002, 0.003, extra.dt, extra.snap) || 1;
    const sgn = typeof CamFeel !== "undefined" ? CamFeel.follow("bendSide", sgnRaw, 2.6, extra.dt || 0) : sgnRaw;
    eyeS = s - 6;
    Tracks.sample(track, wrapS(eyeS), cvB);
    const corr = _vCorr(wrapS(eyeS), cvB.hw);
    const sl = Math.min(14, corr);
    const slLat = Math.min(sl * hangScale("side"), corr);
    eye[0] = cvB.p[0] + cvB.r[0] * sgn * slLat; eye[1] = centreY(track, s - 6) + 3.2 + (14 - sl) * 0.25 + bankDy; eye[2] = cvB.p[2] + cvB.r[2] * sgn * slLat;
    const sideAim = aheadPt(14, 0.7, x * 0.3);
    tgt[0] = sideAim[0]; tgt[1] = sideAim[1]; tgt[2] = sideAim[2];
    const sideBase = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : 44;
    fov = sideBase + (14 - sl) * 0.35;
  } else if (mode === "cinematic") {
    const cineSide = bendSide("bendCine", kA, 0.0003, 0.0015, extra.dt, extra.snap, true);
    const baseRaw = cineSide === 0 ? 0.6 : cineSide * 1.15;
    const base = typeof CamFeel !== "undefined" ? CamFeel.follow("bendCine", baseRaw, 2.2, extra.dt || 0) : baseRaw;
    const a = base + Math.sin(now * 0.00022) * 0.25;
    const corr = _vCorr(wrapS(s), cvA.hw);
    const od = Math.min(22, corr);
    const odLat = Math.min(od * hangScale("cinematic"), corr);
    const dir = _dirScr;
    dir[0] = Math.cos(a) * t[0] + Math.sin(a) * r[0]; dir[1] = 0; dir[2] = Math.cos(a) * t[2] + Math.sin(a) * r[2];
    eye[0] = p[0] + dir[0] * odLat; eye[1] = p[1] + 6.5 + (22 - od) * 0.45; eye[2] = p[2] + dir[2] * odLat;
    const cinAim = aheadPt(lerp(12, 22, spN), 0.85, x * 0.15);
    tgt[0] = cinAim[0]; tgt[1] = cinAim[1]; tgt[2] = cinAim[2];
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(50, 60, spFov);
  } else if (mode === "low") {
    eyeS = s - 8;
    Tracks.sample(track, wrapS(eyeS), cvB);
    const cx = x * 0.3;
    eye[0] = cvB.p[0] + cvB.r[0] * cx; eye[1] = centreY(track, s - 8) + 0.55 + bankDy; eye[2] = cvB.p[2] + cvB.r[2] * cx;
    const lowAim = aheadPt(18, 0.45, x * 0.35);
    tgt[0] = lowAim[0]; tgt[1] = lowAim[1]; tgt[2] = lowAim[2];
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(55, 68, spFov);
  } else if (mode === "trackside") {
    const ts = typeof TracksideCams !== "undefined" ? TracksideCams.pose(track, s, x, extra) : null;
    if (ts) {
      eye[0] = ts.eye[0]; eye[1] = ts.eye[1]; eye[2] = ts.eye[2];
      tgt[0] = ts.tgt[0]; tgt[1] = ts.tgt[1]; tgt[2] = ts.tgt[2];
      fov = ts.fov;
      vantCut = !!ts.cut;
    } else {
      const sgn = 1;
      const sl = Math.min(25, _vCorr(wrapS(s), cvA.hw));
      eye[0] = p[0] + r[0] * sgn * sl; eye[1] = p[1] + 6.0; eye[2] = p[2] + r[2] * sgn * sl;
      tgt[0] = p[0]; tgt[1] = p[1] + 0.8; tgt[2] = p[2];
      fov = 44;
    }
  } else if (mode === "tcam") {
    eye[0] = p[0] - t[0] * 0.52; eye[1] = p[1] + 1.46; eye[2] = p[2] - t[2] * 0.52;
    const avT = aheadPt(20, 0.35, x * 0.5);
    tgt[0] = avT[0]; tgt[1] = avT[1]; tgt[2] = avT[2];
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : 46 + dep * 2;
  } else if (mode === "rear") {
    eye[0] = p[0] - t[0] * 0.95; eye[1] = p[1] + 1.38; eye[2] = p[2] - t[2] * 0.95;
    tgt[0] = p[0] - t[0] * 26; tgt[1] = p[1] + 0.7; tgt[2] = p[2] - t[2] * 26;
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(58, 70, spFov) + dep * 2;
  } else if (mode === "drift") {
    const slipRaw = clamp((extra.slipLat || 0) / 8, -1, 1);
    const slipN = typeof CamFeel !== "undefined" ? CamFeel.follow("driftSlip", slipRaw, 7, extra.dt || 0) : slipRaw;
    Tracks.sample(track, wrapS(s - 6.2), cvB);
    const bend = bendHang("driftBend", kA, extra.dt, extra.reduceMotion, 1, 6.5, extra.snap);
    const cx = x * 0.5 - slipN * 6.5 + bend * 5.5 * hangScale("drift");
    eye[0] = cvB.p[0] + cvB.r[0] * cx; eye[1] = centreY(track, s - 6.2) + 2.4 + bankDy; eye[2] = cvB.p[2] + cvB.r[2] * cx;
    tgt[0] = p[0]; tgt[1] = p[1] + 0.75; tgt[2] = p[2];
    fov = typeof CamFeel !== "undefined" ? CamFeel.modeFov(mode, spFov, dep) : lerp(55, 70, spFov) + dep * 3;
  } else {
    const far = mode === "far";
    const back  = far ? 10.5 : 5.8;
    const eyeUp = far ? 3.6 : 1.35;
    Tracks.sample(track, wrapS(s - back), cvB);
    const cx = x * 0.5;
    const lead = far ? 9 : 6;
    const tgtUp = far ? 1.0 : 0.7;
    const rideC = rideY(track, s), grade = rideGrade(track, s);
    const rideEye = rideC - back * grade;
    const rideTgtAhead = rideC + lead * grade;
    if (extra.carPos) {
      const hx = Math.sin(extra.carHead || 0), hz = Math.cos(extra.carHead || 0);
      const rx = hz, rz = -hx;
      const side = back * CHASE_SIDE_FRAC;
      eye[0] = extra.carPos[0] - hx * back + rx * side; eye[1] = rideEye + eyeUp + bankDy; eye[2] = extra.carPos[1] - hz * back + rz * side;
      tgt[0] = extra.carPos[0] + hx * lead; tgt[1] = rideC + bankDy + tgtUp; tgt[2] = extra.carPos[1] + hz * lead;
      const leadStored = (typeof CamTune !== "undefined" && typeof CamTune.cornerLead === "function")
        ? CamTune.cornerLead(mode) : null;
      const lead2 = clamp(leadStored != null ? leadStored : CHASE_CORNER_LEAD_DEFAULT, 0, 1);
      if (lead2 > 0) {
        const eyeR0 = cvB.p[0] + cvB.r[0] * cx, eyeR1 = rideEye + eyeUp + bankDy, eyeR2 = cvB.p[2] + cvB.r[2] * cx;
        const tgtR = aheadPt(lead, 0, x * 0.4);
        tgtR[1] = rideTgtAhead + tgtUp;
        eye[0] = lerp(eye[0], eyeR0, lead2); eye[1] = lerp(eye[1], eyeR1, lead2); eye[2] = lerp(eye[2], eyeR2, lead2);
        tgt[0] = lerp(tgt[0], tgtR[0], lead2); tgt[1] = lerp(tgt[1], tgtR[1], lead2); tgt[2] = lerp(tgt[2], tgtR[2], lead2);
      }
      if (!far && CHASE_EYE_IN) {
        let fx2 = tgt[0] - eye[0], fz2 = tgt[2] - eye[2];
        const fl2 = Math.hypot(fx2, fz2);
        if (fl2 > 1e-4) { eye[0] += (fx2 / fl2) * CHASE_EYE_IN; eye[2] += (fz2 / fl2) * CHASE_EYE_IN; }
      }
      const gP = (extra.att && extra.att.baPitch) || 0;
      eye[0] += hx * gP * CHASE_G_DOLLY; eye[2] += hz * gP * CHASE_G_DOLLY;
      tgt[1] -= gP * CHASE_G_AIM;
    } else {
      eye[0] = cvB.p[0] + cvB.r[0] * cx; eye[1] = rideEye + eyeUp + bankDy; eye[2] = cvB.p[2] + cvB.r[2] * cx;
      const avC = aheadPt(lead, 0, x * 0.4);
      tgt[0] = avC[0]; tgt[1] = rideTgtAhead + tgtUp; tgt[2] = avC[2];
    }
    if (!far) {
      const chaseOut = bendHang("chaseBend", kA, extra.dt, extra.reduceMotion, 4.6 * hangScale("chase"), 6, extra.snap);
      eye[0] += r[0] * chaseOut; eye[2] += r[2] * chaseOut;
      const aimIn = chaseOut * 0.7;
      tgt[0] -= r[0] * aimIn; tgt[2] -= r[2] * aimIn;
    }
    const openM = far ? 3.2 : 1.6;
    const openL = far ? 1.15 : 2.6;
    pullBack(eye, tgt, speedOpen(far ? "farOpen" : "chaseOpen", spN, extra.dt, extra.reduceMotion, extra.snap, openM, openL));
    fov = typeof CamFeel !== "undefined"
      ? CamFeel.modeFov(far ? "far" : "chase", spFov, dep)
      : lerp(57, 63, spFov) + (far ? 4 : 0) + dep * 3;
  }
  if (extra.frameSubject && (mode === "chase" || mode === "side" || mode === "heli" || mode === "cinematic")) {
    tgt[0] = extra.carPos ? extra.carPos[0] : p[0];
    tgt[1] = p[1] + 0.8;
    tgt[2] = extra.carPos ? extra.carPos[1] : p[2];
  }
  if (mode === "chase" || mode === "far" || mode === "drift" || mode === "reverse")
    _vWallClamp(eye, mode === "far" ? s - 10.5 : mode === "chase" ? s - 5.8 : mode === "drift" ? s - 6.2 : s + 5.5);
  if (typeof CamTune !== "undefined") fov = CamTune.apply(mode, eye, tgt, fov);
  let fovBoost = typeof CamFov !== "undefined" ? CamFov.modeBoost(mode, spFov, dep) : 0;
  if (localLook && typeof CamFeel !== "undefined") CamFeel.applyFreeLook(eye, tgt);
  const _xrComfort = typeof XrBoot !== "undefined" && XrBoot.comfort();
  const _lbHeld = !_xrComfort && localLook && typeof Input !== "undefined" && Input.lookingBack && Input.lookingBack();
  const _lb = !_xrComfort && localLook && (typeof CamFeel !== "undefined" ? CamFeel.shouldLookBack(mode, _lbHeld) : _lbHeld);
  if (_lb) {
    const dx = tgt[0] - eye[0], dz = tgt[2] - eye[2];
    tgt[0] = eye[0] - dx; tgt[2] = eye[2] - dz;
  }
  if (typeof CamFeel !== "undefined" && CamFeel.drive) {
    const f0 = fov;
    fov = CamFeel.drive(mode, eye, tgt, fov, extra, spN);
    fov = clamp(fov, Math.min(f0, 20), Math.max(f0, 110));
    fovBoost += fov - f0;
  }
  if (typeof CamAvoid !== "undefined" && CamAvoid.applies(mode)) {
    CamAvoid.freeEye(track, eye, cvA);
  }
  if (!onboard && track.surface) {
    const n = track.n;
    const eyeAt = mode === "reverse" || mode === "low" || mode === "heli" || mode === "side" ? eyeS : s;
    const fr = eyeAt === s ? cvA : (Tracks.sample(track, wrapS(eyeAt), cvB), cvB);
    const pos = (((eyeAt % track.total) + track.total) % track.total) / track.total * n;
    const k0 = Math.floor(pos) % n, kf = pos - Math.floor(pos);
    const kPrev = (k0 - 1 + n) % n, k1 = (k0 + 1) % n, kB = (k0 + 2) % n;
    const ex = eye[0] - fr.p[0], ez = eye[2] - fr.p[2];
    const lat = ex * fr.r[0] + ez * fr.r[2];
    const beyond = Math.max(0, Math.abs(lat) - fr.hw);
    const bank = Tracks.banking ? Tracks.banking(track, eyeAt, lat, _bankScr, true) : null;
    const ground = crY(track.surface.heightAt(kPrev, beyond), track.surface.heightAt(k0, beyond),
                       track.surface.heightAt(k1, beyond), track.surface.heightAt(kB, beyond), kf)
                 + (bank ? bank.dy : 0);
    const MIN_CLEAR = 0.8, CLAMP_BLEND = 0.35, FLOOR_LEAD = 0.25;
    let floorY = ground + MIN_CLEAR;
    if (beyond === 0) {
      const smoothG = rideY(track, eyeAt) + (bank ? bank.dy : 0);
      floorY = Math.max(smoothG, ground - FLOOR_LEAD) + MIN_CLEAR;
    }
    eye[1] = softFloor(eye[1], floorY, CLAMP_BLEND);
  }
  if (onboard || mode === "tcam") onboardAttitude(mode, eye, tgt, extra, s, spN);
  if (isFinite(eye[0] + eye[1] + eye[2] + tgt[0] + tgt[1] + tgt[2] + fov)) {
    _goodEye[0] = eye[0]; _goodEye[1] = eye[1]; _goodEye[2] = eye[2];
    _goodTgt[0] = tgt[0]; _goodTgt[1] = tgt[1]; _goodTgt[2] = tgt[2]; _goodFov = fov;
  } else {
    eye = _goodEye; tgt = _goodTgt; fov = _goodFov; fovBoost = 0;
    if (!_nanWarned) { _nanWarned = true; Log.warn("game", "GameCams.vantage: non-finite pose in mode " + mode + ", holding the last good one"); }
  }
  _vantEye[0] = eye[0]; _vantEye[1] = eye[1]; _vantEye[2] = eye[2];
  _vantTgt[0] = tgt[0]; _vantTgt[1] = tgt[1]; _vantTgt[2] = tgt[2];
  _vantOut.eye = _vantEye; _vantOut.tgt = _vantTgt; _vantOut.fov = fov; _vantOut.fovBoost = fovBoost; _vantOut.cut = vantCut;
  publishListenerBasis(mode, eye, tgt);
  _vTrack = null;
  return _vantOut;
}

const _listener = { external: false, x: 0, z: 0, fwdX: 0, fwdZ: 1, rightX: 1, rightZ: 0, valid: false };
function playerFrameRivalPan(modeId) {
  if (typeof CamGroups !== "undefined" && CamGroups.isOnboard(modeId)) return true;
  return modeId === "chase";
}
function publishListenerBasis(modeId, eye, tgt) {
  _listener.external = !playerFrameRivalPan(modeId);
  _listener.valid = !!(eye && tgt);
  if (!_listener.valid) return;
  _listener.x = eye[0];
  _listener.z = eye[2];
  let fx = tgt[0] - eye[0], fz = tgt[2] - eye[2];
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-4) { _listener.fwdX = 0; _listener.fwdZ = 1; _listener.rightX = 1; _listener.rightZ = 0; return; }
  fx /= fl; fz /= fl;
  _listener.fwdX = fx; _listener.fwdZ = fz;
  _listener.rightX = -fz; _listener.rightZ = fx;
}
function applyFreeCam(cam, eyeOut, tgtOut) {
  for (let i = 0; i < 3; i++) { eyeOut[i] = cam.eye[i]; tgtOut[i] = cam.target[i]; }
  publishListenerBasis("free", cam.eye, cam.target);
}
function getListenerBasis() { return _listener.valid ? _listener : null; }

return { init, vantage, resetSmoothing, cockpitViewmodelAxes, eyeInsideCar, seatFwd, seatUp, headState, COCKPIT_EYE_FWD, COCKPIT_EYE_UP, VISOR_EYE_FWD, VISOR_EYE_UP,
  HELMET_EYE_FWD, HEAD_MAX, CHASE_CORNER_LEAD_DEFAULT, publishListenerBasis, applyFreeCam, getListenerBasis, playerFrameRivalPan };
})();
