const FrameLights = (function () {
  "use strict";
  const { LT } = LightKnobs;

const _clampNum = (v, a, b) => (v < a ? a : v > b ? b : v);

const _tlSmp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tlSel = [];
const _tlPool = [];
const _tlGlowBuf = [];
function tailLightsEmit() { return +LT.tailLightEmit > 0; }
function appendCarTailLights(frame, track, cars, player, mobileTier) {
  const L = frame.lights;
  frame.glowLights = L;
  const emit = tailLightsEmit();
  frame.tailStart = L ? (L.length / 15) | 0 : 0;
  frame.tailCount = 0;
  if (!L || L === track._lights || !player) return;
  _tlSel.length = 0;
  const tlRange = LT.tailRange != null ? LT.tailRange : 160;
  let _tlN = 0;
  for (const c of cars) {
    const ds = Math.abs(c.s - player.s);
    const d = Math.min(ds, track.total - ds);
    if (d < tlRange) {
      let e = _tlPool[_tlN];
      if (!e) e = _tlPool[_tlN] = { c: null, d: 0 };
      e.c = c; e.d = d;
      _tlSel[_tlN] = e;
      _tlN++;
    }
  }
  for (let i = _tlN; i < _tlPool.length; i++) _tlPool[i].c = null;
  _tlSel.length = _tlN;
  _tlSel.sort(_byDistAsc);
  const nT = Math.min(_tlSel.length, 5);
  if (nT <= 0) return;
  let T = L;
  if (!emit) {
    T = _tlGlowBuf;
    for (let i = 0; i < L.length; i++) T[i] = L[i];
    T.length = L.length;
    frame.glowLights = T;
  }
  const SLOTS = tierShed(Math.min(mobileTier ? LightBudget.MOBILE : LightBudget.MAX, LightBudget.slots()));
  const room = SLOTS - ((L.length / 15) | 0);
  if (emit && room < nT && L.length >= nT * 15) L.length -= (nT - room) * 15;
  const tlFade = LT.tailFade != null ? LT.tailFade : 0;
  for (let j = 0; j < nT; j++) {
    const sel = _tlSel[j], c = sel.c;
    Tracks.sample(track, c.s, _tlSmp);
    const tx = _tlSmp.t[0], tz = _tlSmp.t[2];
    let dx = -tx * 0.87, dy = -0.5, dz = -tz * 0.87;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const bAmt = _clampNum(c.brakeHeat || 0, 0, 1) * LT.brakeGlowMul;
    const fadeF = tlFade > 0 ? _clampNum((tlRange - sel.d) / tlFade, 0, 1) : 1;
    const tlm = LT.tailLightMul * (1 + bAmt * 1.6) * fadeF;
    T.push(
      _tlSmp.p[0] + _tlSmp.r[0] * c.x - tx * 2.4,
      _tlSmp.p[1] + 0.55,
      _tlSmp.p[2] + _tlSmp.r[2] * c.x - tz * 2.4,
      4.5 * tlm, 0.14 * tlm, 0.10 * tlm,
      8 * (1 + bAmt * 0.45), dx, dy, dz, 0.5, -0.2, 0.12, 0.25, 0.4);
  }
  if (!emit) return;
  frame.tailCount = nT;
  frame.tailStart = ((L.length / 15) | 0) - nT;
}

const _lightScaleBuf = [];
const _allLightsBuf = [];
let _allLightsGen = 0;
let _lampSetGen = 0, _lsSrc = null, _lsLen = -1, _lsR = NaN, _lsG = NaN, _lsB = NaN;
const _gHeap = [];
const _byDistAsc = (a, b) => a.d - b.d;
function capRadius2(buf, count, CAP) {
  const h = _gHeap; h.length = 0;
  for (let i = 0; i < count; i++) {
    const g = buf[i].g;
    if (h.length < CAP) {
      let ci = h.length; h.push(g);
      while (ci > 0) { const pi = (ci - 1) >> 1; if (h[pi] < h[ci]) { const t = h[pi]; h[pi] = h[ci]; h[ci] = t; ci = pi; } else break; }
    } else if (g < h[0]) {
      h[0] = g;
      let pi = 0;
      for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && h[l] > h[lg]) lg = l; if (rr < CAP && h[rr] > h[lg]) lg = rr; if (lg === pi) break; const t = h[pi]; h[pi] = h[lg]; h[lg] = t; pi = lg; }
    }
  }
  return h[0] || 1;
}
let _lampWarmT0 = -1e9;
let _lampLastT = -1e9;
let _lampHid = false;
let _lampLastRT = -1e9, _lampTrackRef = null;
if (typeof document !== "undefined" && document.addEventListener)
  document.addEventListener("visibilitychange", () => { if (document.hidden) _lampHid = true; });
let _hshC = new Float32Array(0);
function _hshOf(o) {
  if (o >= _hshC.length) { const nc = new Float32Array(Math.max(o + 1, _hshC.length * 2, 1024)).fill(-1); nc.set(_hshC); _hshC = nc; }
  let h = _hshC[o];
  if (h < 0) { const x = Math.sin((o + 13) * 91.17) * 43758.5453; h = _hshC[o] = x - Math.floor(x); }
  return h;
}
const _flScr = [1, 1, 1, 1, 1, 1];
const _flSteady = [1, 1, 1, 1, 1, 1];
let _flFlick = 0, _flWarmK = 1, _flTNow = 0;
let _flW = 1, _flT0 = 1, _flT1 = 1, _flT2 = 1;
function _flSteadyFn() { return _flSteady; }
function _flSettled(o) {
  const flick = _flFlick, tNow = _flTNow;
  const hsh = _hshOf(o);
  const amp = flick * (hsh > 0.90 ? 1 : 0.2);
  const f = 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40)
            + flick * 0.15 * Math.sin(tNow * (0.35 + hsh * 0.5) + hsh * 20);
  _flScr[0] = f; _flScr[1] = f; _flScr[2] = f;
  _flScr[3] = 1; _flScr[4] = 1; _flScr[5] = 1;
  return _flScr;
}
function _flSettledWarm(o) {
  const f = _flSettled(o)[0] * _flW;
  _flScr[0] = f * _flT0; _flScr[1] = f * _flT1; _flScr[2] = f * _flT2;
  _flScr[3] = _flW * _flT0; _flScr[4] = _flW * _flT1; _flScr[5] = _flW * _flT2;
  return _flScr;
}
function _flLive(o) {
  const flick = _flFlick, tNow = _flTNow, warmK = _flWarmK;
  const hsh = _hshOf(o);
  const amp = hsh > 0.90 ? flick : flick * 0.2;
  let f = 1 + amp * Math.sin(tNow * (6 + hsh * 9) + hsh * 40)
            + flick * 0.15 * Math.sin(tNow * (0.35 + hsh * 0.5) + hsh * 20);
  const warmDur = (4 + hsh * 4) * warmK;
  const wu = warmDur > 0 ? Math.min(1, Math.max(0, (tNow - _lampWarmT0) / warmDur)) : 1;
  const dip = LT.lampWarmupDim != null ? LT.lampWarmupDim : 0.30;
  const w = (1 - dip) + dip * wu;
  f *= w;
  const cold = (1 - wu) * (LT.lampWarmupWarm != null ? LT.lampWarmupWarm : 1);
  const t0 = 1 + cold * 0.22, t1 = 1 - cold * 0.10, t2 = 1 - cold * 0.38;
  _flScr[0] = f * t0; _flScr[1] = f * t1; _flScr[2] = f * t2;
  _flScr[3] = w * t0; _flScr[4] = w * t1; _flScr[5] = w * t2;
  return _flScr;
}
const _RANK_EYE_EPS2 = 25;
const _RANK_FWD_EPS2 = 2 * (1 - Math.cos(1.5 * Math.PI / 180));
const _RANK_MAX_MS = 100;
const _RANK_STILL2 = 1e-4;
let _rankRebuilds = 0, _rankReuses = 0, _viewRebuilds = 0, _viewReuses = 0;
function rankStats() {
  return { mainRebuilds: _rankRebuilds, mainReuses: _rankReuses,
    viewRebuilds: _viewRebuilds, viewReuses: _viewReuses };
}
function resetRankStats() { _rankRebuilds = _rankReuses = _viewRebuilds = _viewReuses = 0; }
function lampCap(carCount, mobileTier) {
  let cap = Math.min(
    carCount > 1 ? Math.round(LT.lampCull != null ? LT.lampCull : 40) : LightBudget.MAX,
    mobileTier ? LightBudget.MOBILE : LightBudget.MAX,
    LightBudget.slots());
  return tierShed(cap);
}
const SHED_HOLD_MS = 1500, SHED_DOWN = 16, SHED_UP = 32, GLOW_FADE_S = 0.4;
let _shTier = 0, _shTierT = -1e9, _shHeld = 0, _shLim = NaN, _shT = NaN, _glowF = 1;
function _shedLimit(tier) { return tier >= 2 ? LightBudget.MOBILE : tier >= 1 ? 32 : LightBudget.MAX; }
function _shedTick() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now === _shT) return;
  const tier = PerfGov.tier();
  if (tier !== _shTier) { _shTier = tier; _shTierT = now; }
  if (now - _shTierT >= SHED_HOLD_MS || _shLim !== _shLim) _shHeld = tier;
  const target = _shedLimit(_shHeld);
  const dt = _shT === _shT ? Math.min(0.25, Math.max(0, (now - _shT) * 0.001)) : 1e9;
  if (_shLim !== _shLim) _shLim = target;
  else if (_shLim > target) _shLim = Math.max(target, _shLim - SHED_DOWN * dt);
  else if (_shLim < target) _shLim = Math.min(target, _shLim + SHED_UP * dt);
  const gT = _shHeld >= 3 ? 0 : 1, gStep = dt / GLOW_FADE_S;
  _glowF = _glowF < gT ? Math.min(gT, _glowF + gStep) : Math.max(gT, _glowF - gStep);
  _shT = now;
}
function tierShed(cap) {
  if (typeof PerfGov === "undefined") return cap;
  _shedTick();
  return Math.min(cap, Math.ceil(_shLim));
}
function glowFade() {
  if (typeof PerfGov === "undefined") return 1;
  _shedTick();
  return _glowF;
}
let _alSrc = null, _alLen = -1;
const _AL_MIN_DT = 0.05;
let _alR = NaN, _alG = NaN, _alB = NaN, _alFl = null, _alT = -1e9;
function _fillAllLights(frame, src, sr, sg, sb, fl, tNow) {
  const out = _allLightsBuf;
  const n = src.length;
  const fresh = _alSrc !== src || _alLen !== n;
  if (!fresh && fl === _alFl && sr === _alR && sg === _alG && sb === _alB && out.length === n
      && (fl === _flSteadyFn || (tNow != null && tNow - _alT >= 0 && tNow - _alT < _AL_MIN_DT))) {
    frame.allLights = out;
    frame.allLightsGen = _allLightsGen;
    return;
  }
  _alR = sr; _alG = sg; _alB = sb; _alFl = fl; _alT = tNow != null ? tNow : -1e9;
  let changed = out.length !== n;
  if (fresh) {
    if (out.length !== n) out.length = n;
    for (let i = 0; i < n; i += 15) {
      out[i] = src[i]; out[i+1] = src[i+1]; out[i+2] = src[i+2]; out[i+6] = src[i+6];
      out[i+7] = src[i+7]; out[i+8] = src[i+8]; out[i+9] = src[i+9]; out[i+10] = src[i+10];
      out[i+11] = src[i+11]; out[i+12] = src[i+12]; out[i+13] = src[i+13]; out[i+14] = src[i+14];
    }
    _alSrc = src; _alLen = n;
    changed = true;
  }
  for (let i = 0; i < n; i += 15) {
    const f = fl(i);
    const r = src[i+3] * sr * f[0], g = src[i+4] * sg * f[1], b = src[i+5] * sb * f[2];
    if (!changed && (out[i+3] !== r || out[i+4] !== g || out[i+5] !== b)) changed = true;
    out[i+3] = r; out[i+4] = g; out[i+5] = b;
  }
  if (changed) _allLightsGen++;
  frame.allLights = out;
  frame.allLightsGen = _allLightsGen;
}

const _ENTRY_S = 0.35;
function _rankSet(S, src, count, CAP, eye, fwd, sr, sg, sb, fl, tNow, out) {
  const fx = fwd ? fwd[0] : 0, fz = fwd ? fwd[2] : 0;
  const flen2 = fx * fx + fz * fz || 1;
  const reach = LT.lampReach != null ? LT.lampReach : 1;
  const bias = LT.lampBehindBias != null ? LT.lampBehindBias : 5.25;
  const fade = LT.lampCullFade != null ? LT.lampCullFade : 0.35;
  const heap = S.heap;
  const edx = eye[0] - S.rankEyeX, edy = eye[1] - S.rankEyeY, edz = eye[2] - S.rankEyeZ;
  const finv = 1 / Math.sqrt(flen2), ux = fx * finv, uz = fz * finv;
  const fdx = ux - S.rankFwdX, fdz = uz - S.rankFwdZ;
  const dist2 = edx * edx + edy * edy + edz * edz;
  const ageMs = (tNow - S.rankT) * 1000;
  const withinDist = dist2 < _RANK_EYE_EPS2;
  const withinAge = dist2 < _RANK_STILL2 || ageMs < _RANK_MAX_MS;
  const reuseRank = S.rankSrc === src && S.rankCap === CAP && S.rankCount === count
    && S.rankReach === reach && S.rankBias === bias
    && heap.length > 0
    && withinDist && withinAge
    && (fdx * fdx + fdz * fdz) < _RANK_FWD_EPS2;
  let gRef, dEdge, truncated;
  if (reuseRank) {
    gRef = S.rankGRef; dEdge = S.rankDEdge; truncated = S.rankTrunc;
    if (S === _S_MAIN) _rankReuses++; else if (S === _S_VIEW) _viewReuses++;
  } else {
    if (S === _S_MAIN) _rankRebuilds++; else if (S === _S_VIEW) _viewRebuilds++;
    const buf = S.buf;
    for (let i = 0; i < count; i++) {
      const o = i * 15, dx = src[o] - eye[0], dy = src[o + 1] - eye[1], dz = src[o + 2] - eye[2];
      let d = dx * dx + dy * dy + dz * dz;
      const b = dx * fx + dz * fz;
      if (b < 0) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2 * 0.0625);
        d *= 1 + bias * Math.min(1, ratio2);
      } else if (reach > 1) {
        const dl2 = dx * dx + dz * dz || 1;
        const ratio2 = (b * b) / (flen2 * dl2);
        const k = 1 + (reach - 1) * ratio2;
        d /= k * k;
      }
      const e = buf[i];
      const g = dx * dx + dy * dy + dz * dz;
      if (e) { e.d = d; e.g = g; e.o = o; } else buf[i] = { d: d, g: g, o: o };
    }
    buf.length = count;
    heap.length = 0;
    for (let i = 0; i < count; i++) {
      const e = buf[i];
      if (heap.length < CAP) {
        let ci = heap.length; heap.push(e);
        while (ci > 0) { const pi = (ci - 1) >> 1; if (heap[pi].d < heap[ci].d) { const t = heap[pi]; heap[pi] = heap[ci]; heap[ci] = t; ci = pi; } else break; }
      } else if (e.d < heap[0].d) {
        heap[0] = e;
        let pi = 0;
        for (;;) { const l = pi * 2 + 1, rr = l + 1; let lg = pi; if (l < CAP && heap[l].d > heap[lg].d) lg = l; if (rr < CAP && heap[rr].d > heap[lg].d) lg = rr; if (lg === pi) break; const t = heap[pi]; heap[pi] = heap[lg]; heap[lg] = t; pi = lg; }
      }
    }
    heap.sort(_byDistAsc);
    dEdge = heap[heap.length - 1].d || 1;
    truncated = count > CAP;
    gRef = truncated
      ? capRadius2(buf, count, CAP) * (1 + bias) * (reach * reach)
      : 1;
    S.rankSrc = src; S.rankCap = CAP; S.rankCount = count;
    S.rankEyeX = eye[0]; S.rankEyeY = eye[1]; S.rankEyeZ = eye[2];
    S.rankFwdX = ux; S.rankFwdZ = uz;
    S.rankGRef = gRef; S.rankDEdge = dEdge; S.rankTrunc = truncated;
    S.rankReach = reach; S.rankBias = bias;
    S.rankT = tNow;
  }
  const _cullBand = gRef * fade;
  const _guardBand = dEdge * 0.08;
  const _nSrc = (src.length / 15) | 0;
  if (S.entrySrc !== src || S.entryLvl.length < _nSrc) {
    S.entrySrc = src; S.entryLvl = new Float32Array(_nSrc); S.entryStamp = new Uint32Array(_nSrc); S.entryFrame = 1;
  }
  const _eStep = Math.min(1, Math.max(0, tNow - S.entryT) / _ENTRY_S);
  S.entryT = tNow;
  const _eFrame = ++S.entryFrame;
  const lum = S.lum;
  let j = 0;
  for (let i = 0; i < heap.length; i++) {
    const e = heap[i], o = e.o;
    let cullF = truncated
      ? Math.min(Math.max(0, Math.min(1, (gRef - e.g) / _cullBand)),
                 Math.max(0, Math.min(1, (dEdge - e.d) / _guardBand)))
      : 1;
    const li = (o / 15) | 0;
    const prev = S.entryStamp[li] === _eFrame - 1 ? S.entryLvl[li] : 0;
    if (truncated && cullF > prev + _eStep) cullF = prev + _eStep;
    S.entryLvl[li] = cullF; S.entryStamp[li] = _eFrame;
    const f = fl(o);
    lum[i] = Math.max(src[o+3] * sr * f[3] * cullF, src[o+4] * sg * f[4] * cullF, src[o+5] * sb * f[5] * cullF);
    out[j++] = src[o]; out[j++] = src[o+1]; out[j++] = src[o+2];
    out[j++] = src[o+3] * sr * f[0] * cullF; out[j++] = src[o+4] * sg * f[1] * cullF; out[j++] = src[o+5] * sb * f[2] * cullF;
    for (let k = 6; k < 14; k++) out[j++] = src[o+k];
    out[j++] = src[o+14] * cullF;
  }
  out.length = j;
  lum.length = heap.length;
}
function _rankState() {
  return { heap: [], buf: [], lum: [], rankSrc: null, rankCap: -1, rankCount: -1,
    rankEyeX: NaN, rankEyeY: NaN, rankEyeZ: NaN, rankFwdX: NaN, rankFwdZ: NaN,
    rankGRef: 1, rankDEdge: 1, rankTrunc: false, rankReach: NaN, rankBias: NaN,
    rankT: -1e9,
    entrySrc: null, entryLvl: new Float32Array(0), entryStamp: new Uint32Array(0), entryFrame: 1, entryT: 0 };
}
const _S_MAIN = _rankState(), _S_VIEW = _rankState();
const _last = { src: null, cap: 0, sr: 1, sg: 1, sb: 1, fl: null, tNow: 0, ranked: false };
const _viewBuf = [];
const _viewOut = { lights: null, tailStart: 0, tailCount: 0 };
function release() {
  _last.src = null; _last.fl = null; _last.ranked = false;
  _lsSrc = null; _lsLen = -1;
  _alSrc = null; _alLen = -1; _alFl = null;
  for (const S of [_S_MAIN, _S_VIEW]) {
    S.rankSrc = null; S.entrySrc = null; S.heap.length = 0; S.buf.length = 0;
    S.entryLvl = new Float32Array(0); S.entryStamp = new Uint32Array(0);
  }
  for (let i = 0; i < _tlPool.length; i++) _tlPool[i].c = null;
  _tlSel.length = 0;
}
function viewLights(frame, eye, fwd) {
  const L = frame.lights;
  if (!_last.ranked || !_last.src || !L || !eye || !fwd) return null;
  const src = _last.src, count = (src.length / 15) | 0;
  const tc = frame.tailCount | 0, ts = tc > 0 ? frame.tailStart | 0 : (L.length / 15) | 0;
  const cap = Math.max(1, Math.min(_last.cap, ts));
  _rankSet(_S_VIEW, src, count, cap, eye, fwd, _last.sr, _last.sg, _last.sb, _last.fl, _last.tNow, _viewBuf);
  for (let i = ts * 15, n = (ts + tc) * 15; i < n; i++) _viewBuf.push(L[i]);
  _viewOut.lights = _viewBuf;
  _viewOut.tailCount = tc;
  _viewOut.tailStart = ((_viewBuf.length / 15) | 0) - tc;
  return _viewOut;
}
function setFrameLights(frame, track, cars, eye, scale, fwd, mobileTier, srcSet) {
  const src = srcSet || track._lights;
  if (!src || !src.length) { frame.lights = frame.lampLum = null; release(); return; }
  const prevTrack = _lampTrackRef && _lampTrackRef.deref();
  if (track !== prevTrack) release();
  frame.lampLum = _S_MAIN.lum;
  const CAP = lampCap(cars.length, mobileTier);
  let sr = Array.isArray(scale) ? scale[0] : (scale == null ? 1 : scale);
  let sg = Array.isArray(scale) ? scale[1] : sr;
  let sb = Array.isArray(scale) ? scale[2] : sr;
  if (srcSet) {
    const floor = LT.alwaysLampFloor > 0 ? LT.alwaysLampFloor : 0;
    if (floor > sr) sr = floor;
    if (floor > sg) sg = floor;
    if (floor > sb) sb = floor;
  }
  if (src !== _lsSrc || src.length !== _lsLen || sr !== _lsR || sg !== _lsG || sb !== _lsB) {
    _lampSetGen++; _lsSrc = src; _lsLen = src.length; _lsR = sr; _lsG = sg; _lsB = sb;
  }
  frame.lampSetGen = _lampSetGen;
  const count = src.length / 15;
  const out = _lightScaleBuf;
  const tNow = performance.now() * 0.001;
  const rt = Number.isFinite(frame.time) ? frame.time : null;
  if (tNow - _lampLastT > 1.0) {
    const lit = rt === null || track !== prevTrack || !(rt - _lampLastRT <= 1.0);
    if (!_lampHid && lit) _lampWarmT0 = tNow;
    _S_MAIN.rankSrc = null;
  }
  _lampHid = false;
  _lampLastT = tNow; _lampLastRT = rt === null ? -1e9 : rt;
  if (track !== prevTrack) _lampTrackRef = track ? new WeakRef(track) : null;
  const flick = LT.lampFlicker || 0;
  const warmK = LT.lampWarmup != null ? LT.lampWarmup : 1;
  const warmDone = !(warmK > 0) || (tNow - _lampWarmT0) >= 8 * warmK;
  const skipFl = !(flick > 0) && warmDone;
  _flFlick = flick; _flWarmK = warmK; _flTNow = tNow;
  if (warmDone && !skipFl) {
    const dip = LT.lampWarmupDim != null ? LT.lampWarmupDim : 0.30;
    _flW = (1 - dip) + dip;
    const cold = 0 * (LT.lampWarmupWarm != null ? LT.lampWarmupWarm : 1);
    _flT0 = 1 + cold * 0.22; _flT1 = 1 - cold * 0.10; _flT2 = 1 - cold * 0.38;
  }
  const settledFl = _flW === 1 && _flT0 === 1 && _flT1 === 1 && _flT2 === 1 ? _flSettled : _flSettledWarm;
  const fl = skipFl ? _flSteadyFn : warmDone ? settledFl : _flLive;
  if (count + LightBudget.TAIL_RESERVE <= CAP) {
    _S_MAIN.rankSrc = null;
    _last.ranked = false;
    let j = 0;
    const lum = _S_MAIN.lum;
    for (let i = 0; i < src.length; i += 15) {
      const f = fl(i);
      lum[i / 15] = Math.max(src[i+3] * sr * f[3], src[i+4] * sg * f[4], src[i+5] * sb * f[5]);
      out[j++] = src[i]; out[j++] = src[i+1]; out[j++] = src[i+2];
      out[j++] = src[i+3] * sr * f[0]; out[j++] = src[i+4] * sg * f[1]; out[j++] = src[i+5] * sb * f[2]; out[j++] = src[i+6];
      for (let k = 7; k < 15; k++) out[j++] = src[i+k];
    }
    out.length = j;
    lum.length = j / 15;
    frame.lights = out;
    if (frame.perChunkLights > 0) _fillAllLights(frame, src, sr, sg, sb, fl, tNow);
    return;
  }
  _rankSet(_S_MAIN, src, count, CAP, eye, fwd, sr, sg, sb, fl, tNow, out);
  _last.src = src; _last.cap = CAP; _last.sr = sr; _last.sg = sg; _last.sb = sb; _last.fl = fl; _last.tNow = tNow; _last.ranked = true;
  frame.lights = out;
  if (frame.perChunkLights > 0) _fillAllLights(frame, src, sr, sg, sb, fl, tNow);
}

  return { setFrameLights, appendCarTailLights, glowFade, viewLights, rankStats, resetRankStats, release };
})();
Object.freeze(FrameLights);
