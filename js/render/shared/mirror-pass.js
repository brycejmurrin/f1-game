"use strict";

const MirrorPass = (function () {
  const MODES = ["auto", "on", "off"];
  const ONBOARD = { cockpit: 1, hood: 1, visor: 1, tcam: 1, helmet: 1 };
  const H_FOV = 56 * Math.PI / 180;
  const NEAR = 0.5, FAR = 700;
  let _instEvery = 2;
  try {
    const ie = localStorage.getItem("apex26.mirrorInstEvery");
    if (ie === "1") _instEvery = 1;
    else if (ie && +ie > 0) _instEvery = Math.min(4, Math.max(1, ie | 0));
  } catch (_) {  }
  let _lampCap = (typeof LightBudget !== "undefined" && LightBudget.MIRROR > 0) ? LightBudget.MIRROR : 8;
  try {
    const lc = localStorage.getItem("apex26.tlxMirLampCap");
    if (lc != null && lc !== "" && +lc >= 0) _lampCap = Math.min(48, +lc | 0);
  } catch (_) {  }
  const RERANK_M = 5, RERANK_EVERY = 8, RERANK_AIM_COS = 0.9994;
  const LITE_CULL = 120;
  const QUALITY = [
    { name: "full", lite: false, res: 1.0, ss: 2, cull: 280, reach: 260, every: 1, instEvery: _instEvery },
    { name: "lite", lite: true,  res: 0.6, ss: 2, cull: LITE_CULL, reach: Math.min(140, LITE_CULL), every: 1, instEvery: 1 },
    { name: "low",  lite: true,  res: 0.5, ss: 1, cull: Math.min(150, LITE_CULL), reach: Math.min(120, LITE_CULL), every: 2, instEvery: 1 },
    { name: "min",  lite: true,  res: 0.4, ss: 1, cull: Math.min(120, LITE_CULL), reach: Math.min(100, LITE_CULL), every: 3, instEvery: 1 },
  ];
  const EYE_UP = 1.05;
  const LOOK_M = 20, LOOK_DROP = 0.75;
  const MEASURE_MS = 500;
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const SS = 2, MAX_W = 1024, MAX_H = 512;
  const Q_DWELL = 90;

  function create(G, deps) {
    Log.info("game", "MirrorPass.create");
    const { drawWorldMeshes, drawCar, renderPosOf, playerAnchor, yawVisInterp, basisMat, carPaint, onModeChange } = deps;
    let mode = G.store.get("hudMirror", "auto");
    if (MODES.indexOf(mode) < 0) mode = "auto";

    const _view = new Float32Array(16), _proj = new Float32Array(16), _vp = new Float32Array(16);
    const _invVP = new Float32Array(16), _invProj = new Float32Array(16), _mat = new Float32Array(16);
    const _eye = [0, 0, 0], _tgt = [0, 0, 0], _up = [0, 1, 0];
    const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    const _bank = { dy: 0, roll: 0 };
    const _P = [0, 0, 0], _F = [0, 0, 1], _R = [1, 0, 0], _U = [0, 1, 0];
    let _rect = null, _measureAt = -Infinity, _shown = false, _frame = 0, _cars = 0, _drawn = 0;
    let _run = 0;
    let _el = null, _canvas = null, _dead = false, _lastW = 0, _lastH = 0;
    let _collapsed = false, _chip = null, _chipShown = false, _wired = false;
    let _bx = 0, _bz = -1;
    let _coneTan = 1;
    const _cMats = [], _cCars = [], _cD2 = [], _cKeep = [], _cPosed = [];
    let _q = QUALITY[0], _qi = -1, _qWant = -1, _qHeld = 0;
    let _cssW = 0, _cssH = 0;
    let _preparation = null, _prepared = null;
    let _sub = null, _subMode = "tcam", _pipEl = null, _pipShown = false, _pipRect = null, _pipMeasureAt = -Infinity;
    let _pipCssW = 0, _pipCssH = 0;
    let pipMode = G.store.get("bcPip", "auto");
    if (MODES.indexOf(pipMode) < 0) pipMode = "auto";
    const _pipExtra = { bankDy: 0 };
    const _sv = { viewProj: null, view: null, proj: null, invProj: null, invViewProj: null, eye: null, cullDist: 0, lite: undefined, freezeInst: undefined, sky: null, tune: undefined, lights: null, tailStart: 0, tailCount: 0, lampCap: undefined };
    let _instFreezeSkips = 0, _instRefresh = 0;
    const _aim = [0, 0, 0];
    const _vlBuf = [], _vlEye = [0, 0, 0], _vlAim = [0, 0, 0];
    const _capBuf = [];
    const _vlOut = { lights: null, tailStart: 0, tailCount: 0 };
    let _vlLamps = 0, _vlAge = Infinity, _vlTrack = null, _vlSrc = null, _vlRanks = 0, _vlHeld = 0;
    function mirrorLights(frame) {
      if (typeof FrameLights === "undefined" || !FrameLights.viewLights) return null;
      const L = frame.lights;
      if (_lampCap > 0 && L && _vlAge < RERANK_EVERY && _vlTrack === G.track && _vlSrc === L) {
        const dx = _eye[0] - _vlEye[0], dy = _eye[1] - _vlEye[1], dz = _eye[2] - _vlEye[2];
        const al = Math.hypot(_aim[0], _aim[2]) * Math.hypot(_vlAim[0], _vlAim[2]) || 1;
        if (dx * dx + dy * dy + dz * dz < RERANK_M * RERANK_M
            && (_aim[0] * _vlAim[0] + _aim[2] * _vlAim[2]) / al > RERANK_AIM_COS) {
          _vlAge++; _vlHeld++;
          const tc = frame.tailCount | 0, ts = tc > 0 ? frame.tailStart | 0 : (L.length / 15) | 0;
          let j = _vlLamps * 15;
          for (let i = ts * 15, n = (ts + tc) * 15; i < n; i++) _vlBuf[j++] = L[i];
          _vlBuf.length = j;
          _vlOut.lights = _vlBuf; _vlOut.tailStart = _vlLamps; _vlOut.tailCount = tc;
          return _vlOut;
        }
      }
      const vl = FrameLights.viewLights(frame, _eye, _aim);
      _vlAge = Infinity;
      if (!vl || !(_lampCap > 0)) return vl;
      const n = vl.lights.length;
      for (let i = 0; i < n; i++) _vlBuf[i] = vl.lights[i];
      _vlBuf.length = n;
      _vlLamps = vl.tailStart; _vlAge = 0; _vlRanks++;
      _vlTrack = G.track; _vlSrc = L;
      for (let i = 0; i < 3; i++) { _vlEye[i] = _eye[i]; _vlAim[i] = _aim[i]; }
      return vl;
    }
    function capMirrorLights(src, tailStart, tailCount) {
      if (!(_lampCap > 0) || !src) return null;
      const tc = tailCount | 0;
      const nRec = (src.length / 15) | 0;
      const ts = tc > 0 ? (tailStart | 0) : nRec;
      if (ts <= _lampCap) return null;
      const keepLamps = Math.min(_lampCap, ts);
      let j = 0;
      const endLamps = keepLamps * 15;
      for (let i = 0; i < endLamps; i++) _capBuf[j++] = src[i];
      const tailFrom = ts * 15;
      const tailTo = Math.min(src.length, (ts + tc) * 15);
      for (let i = tailFrom; i < tailTo; i++) _capBuf[j++] = src[i];
      _capBuf.length = j;
      _capOut.tailStart = keepLamps; _capOut.tailCount = tc;
      return _capOut;
    }
    const _capOut = { lights: _capBuf, tailStart: 0, tailCount: 0 };
    const MIRROR_TUNE = { carSunGlint: 0, carSparkle: 0, windowSunFlash: 0, shadowStr: 0 };
    let _mirTune = null, _mirTuneSrc;

    function targetSize(cssW, cssH, res) {
      const cap = G.gfx && G.gfx.mobileTier ? 1.5 : 2;
      const dpr = Math.min(cap, typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
      res = scaledRes(res);
      const ss = _q.ss || SS;
      let w = cssW * dpr * res * ss, h = cssH * dpr * res * ss;
      const k = Math.min(1, MAX_W / (w || 1), MAX_H / (h || 1));
      w = Math.round(w * k); h = Math.round(h * k);
      _sz[0] = w; _sz[1] = h;
      return _sz;
    }
    const _sz = [0, 0];
    const LITE_RES = QUALITY[1].res;
    function scaledRes(res) {
      const g = G.gfx;
      const s = g && typeof g.getRenderScale === "function" ? +g.getRenderScale() : 1;
      return s > 0 && s < 1 ? Math.max(res * s, Math.min(res, LITE_RES)) : res;
    }
    function el() { return _el || (_el = document.getElementById("hud-mirror")); }
    function pipEl() { return _pipEl || (_pipEl = document.getElementById("bc-pip")); }
    function bcOn() { return document.body.classList.contains("bc-on"); }
    function chip() { return _chip || (_chip = document.getElementById("hud-mirror-chip")); }
    function wire() {
      if (_wired) return;
      const e = el(), c = chip();
      if (!e || !c || !e.addEventListener) return;
      _wired = true;
      e.addEventListener("click", () => { _collapsed = true; _measureAt = -Infinity; });
      c.addEventListener("click", () => { _collapsed = false; _measureAt = -Infinity; });
      const remeasure = () => { _measureAt = -Infinity; _pipMeasureAt = -Infinity; };
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("resize", remeasure);
        window.addEventListener("orientationchange", remeasure);
      }
    }
    function canvasEl() { return _canvas || (_canvas = document.getElementById("game")); }

    function softGpu() {
      const g = G.gfx;
      return !!(g && typeof g.softPresent === "function" && g.softPresent());
    }
    function camId() {
      const list = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : null;
      const m = list && list[G.camMode];
      return m ? m.id : "chase";
    }
    const xrOn = () => typeof XrBoot !== "undefined" && !!XrBoot.comfort && XrBoot.comfort();
    function wanted(preparing) {
      if (mode === "off" || xrOn()) return false;
      if (bcOn()) return false;
      const g = G.gfx;
      if (!g || typeof g.mirrorBegin !== "function") return false;
      if (G.state !== "race" && !(preparing && G.state === "count")) return false;
      if (!G.player || !G.track || G.dbgCam) return false;
      if (document.body.classList.contains("hud-hidden")) return false;
      if (typeof CamFeel !== "undefined" ? CamFeel.shouldLookBack(camId(),
            !!(typeof Input !== "undefined" && Input.lookingBack && Input.lookingBack()))
          : (typeof Input !== "undefined" && Input.lookingBack && Input.lookingBack())) return false;
      if (_dead) return false;
      if (mode === "on") return true;
      return !!ONBOARD[camId()] && !softGpu();
    }

    function pipWanted() {
      if (pipMode === "off" || !_sub || _sub.retired || !bcOn() || xrOn()) return false;
      const g = G.gfx;
      if (!g || typeof g.mirrorBegin !== "function" || _dead) return false;
      if (G.state !== "race" || !G.track || G.dbgCam) return false;
      if (document.body.classList.contains("hud-hidden")) return false;
      return pipMode === "on" || !softGpu();
    }

    function rectOf(e) {
      const c = canvasEl();
      if (!e || !c) return null;
      const er = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (!(er.width > 4 && er.height > 4 && cr.width > 0 && cr.height > 0)) return null;
      return [(er.left - cr.left) / cr.width, (er.top - cr.top) / cr.height, er.width / cr.width, er.height / cr.height];
    }
    function checkDead() {
      const st = G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null;
      _dead = !!(st && st.dead);
    }
    function measure() {
      checkDead();
      _rect = rectOf(el());
      if (_rect) { const er = el().getBoundingClientRect(); _cssW = er.width; _cssH = er.height; side(er); }
    }
    const SIDE_MIN = 190, SIDE_GAP = 8, SIDE_ROWS = 96;
    let _sideFits = null, _sideX = "", _sideW = "";
    function side(er) {
      const b = document.body;
      let right = typeof GameHud !== "undefined" && GameHud.vp ? GameHud.vp()[0] - 10 : typeof innerWidth === "number" ? innerWidth - 10 : 0;
      const pause = document.getElementById("pausebtn"), cam = document.getElementById("btn-cam");
      const sec = document.getElementById("hud-sectors");
      const box = (n) => (n && !n.hidden && n.getBoundingClientRect ? n.getBoundingClientRect() : null);
      const p = box(pause), c = box(cam), s = box(sec);
      const past = (r) => r && r.width > 0 && r.left > er.right;
      if (past(p)) right = Math.min(right, p.left - 12);
      if (past(s)) right = Math.min(right, s.left);
      if (past(c) && c.bottom > er.top) right = Math.min(right, c.left);
      const x = er.right + SIDE_GAP;
      const ann = box(document.getElementById("announce"));
      const rowsB = er.top + Math.max(er.height, SIDE_ROWS, ann ? ann.height : 0);
      for (const d of [document.getElementById("dock-left"), document.getElementById("dock-right")]) {
        for (const g of (d && d.children) || []) {
          const r = g.getBoundingClientRect ? g.getBoundingClientRect() : null;
          if (r && r.width > 0 && r.height > 0 && r.top < rowsB && r.bottom > er.top && r.right > x) right = Math.min(right, r.left);
        }
      }
      const w = right - SIDE_GAP - x;
      const fits = w >= SIDE_MIN;
      if (fits !== _sideFits) { _sideFits = fits; b.classList.toggle("hud-mirror-side", fits); }
      if (fits && b.style) {
        const sx = x.toFixed(1) + "px", sw = w.toFixed(1) + "px";
        if (sx !== _sideX) { _sideX = sx; b.style.setProperty("--mir-side-x", sx); }
        if (sw !== _sideW) { _sideW = sw; b.style.setProperty("--mir-side-w", sw); }
      }
    }

    function pose(c) {
      const track = G.track;
      const pa = playerAnchor(c);
      const cS = pa.cS, cX = pa.cX;
      Tracks.sample(track, cS, _smp);
      const t = _smp.t, r = _smp.r;
      let l = Math.hypot(t[0], t[1], t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
      l = Math.hypot(r[0], r[1], r[2]) || 1; r[0] /= l; r[1] /= l; r[2] /= l;
      const rp = renderPosOf(c);
      const bank = Tracks.banking(track, cS, cX, _bank);
      _P[0] = rp.world ? rp.x : _smp.p[0] + r[0] * cX;
      _P[2] = rp.world ? rp.z : _smp.p[2] + r[2] * cX;
      _P[1] = _smp.p[1] + (bank ? bank.dy : 0);
      const yv = yawVisInterp(c), cy = Math.cos(yv), sy = Math.sin(yv);
      for (let i = 0; i < 3; i++) {
        _F[i] = t[i] * cy + r[i] * sy;
        _R[i] = r[i] * cy - t[i] * sy;
      }
      _U[0] = _R[1] * _F[2] - _R[2] * _F[1];
      _U[1] = _R[2] * _F[0] - _R[0] * _F[2];
      _U[2] = _R[0] * _F[1] - _R[1] * _F[0];
      if (bank && bank.roll) {
        const cr = Math.cos(bank.roll), sr = Math.sin(bank.roll);
        for (let i = 0; i < 3; i++) {
          const rr = _R[i], u = _U[i];
          _R[i] = rr * cr + u * sr;
          _U[i] = u * cr - rr * sr;
        }
      }
    }

    function drawCars(wet, night, reach, centre, skip) {
      const track = G.track, hide = G.hideMeshes;
      _cars = 0;
      if (hide && hide.cars) return;
      const ex = _eye[0], ez = _eye[2];
      const paint = carPaint(wet, night);
      if (typeof FieldLod !== "undefined" && FieldLod.on) return drawCarsLod(paint, night, reach, centre, skip);
      for (const c of G.cars) {
        if (skip && (c === skip || c.isPlayer)) continue;
        const ds = Math.abs(c.s - centre.s);
        if (Math.min(ds, track.total - ds) > reach) continue;
        pose(c);
        const dx = _P[0] - ex, dz = _P[2] - ez;
        if (dx * _bx + dz * _bz < -3) continue;
        basisMat(_R, _U, _F, _P, _mat);
        drawCar(c, _mat, paint, night);
        _cars++;
      }
    }

    function drawCarsLod(paint, night, reach, centre, skip) {
      const track = G.track, ex = _eye[0], ez = _eye[2];
      let n = 0, force = -1;
      for (const c of G.cars) {
        if (skip && (c === skip || c.isPlayer)) continue;
        const ds = Math.abs(c.s - centre.s);
        if (Math.min(ds, track.total - ds) > reach) continue;
        const rp = renderPosOf(c), world = rp.world;
        let px, pz;
        if (world) { px = rp.x; pz = rp.z; } else { pose(c); px = _P[0]; pz = _P[2]; }
        const dx = px - ex, dz = pz - ez;
        const fwd = dx * _bx + dz * _bz;
        if (fwd < -3) continue;
        if (skip && Math.abs(dx * _bz - dz * _bx) > fwd * _coneTan + 5) continue;
        const m = _cMats[n] || (_cMats[n] = new Float32Array(16));
        if (!world) basisMat(_R, _U, _F, _P, m);
        if (c === centre && !skip) force = n;
        _cCars[n] = c; _cPosed[n] = !world; _cD2[n] = dx * dx + dz * dz; n++;
      }
      FieldLod.nearest(_cD2, n, FieldLod.mirrorCap(), _cKeep, force);
      for (let i = 0; i < n; i++) {
        if (_cKeep[i]) {
          if (!_cPosed[i]) { pose(_cCars[i]); basisMat(_R, _U, _F, _P, _cMats[i]); }
          drawCar(_cCars[i], _cMats[i], paint, night); _cars++;
        }
        _cCars[i] = null;
      }
    }

    function warmWaitMark(job, edge) {
      if (job.warmWait === edge) return;
      job.warmWait = edge;
      try { if (typeof RaceEntryProfile !== "undefined") RaceEntryProfile.mark("programWarm:" + edge); } catch (_) {  }
    }
    let _lastPrep = null;
    const _now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    function prepDiag() {
      return { t0: _now(), warmEndMs: null, frames: 0, framesAfterWarm: 0, maxGapMs: 0, lastFrameAt: 0,
        refused: { noEl: 0, box: 0, size: 0, begin: 0 }, passes: 0, passMs: 0, lastPassMs: 0, end: null, endMs: null };
    }
    function finishPreparation(job, ready, why) {
      if (_preparation !== job) return;
      if (job.diag) { job.diag.end = why || (ready ? "ready" : "unpainted"); job.diag.endMs = Math.round(_now() - job.diag.t0); _lastPrep = job.diag; }
      if (job.warmWait === "start") warmWaitMark(job, "end");
      clearTimeout(job.timer);
      _preparation = null; _prepared = ready;
      _lastW = 0;
      job.resolve(ready);
    }
    function cancelPreparation() { if (_preparation) finishPreparation(_preparation, false, "cancelled"); }
    function currentPreparation(job) {
      return G.state === "count" && G.player === job.player && G.track === job.track && G.gfx === job.gfx
        && G.gfx.mirrorBegin === job.begin && G.gfx.mirrorEnd === job.end && !_collapsed && wanted(true);
    }
    function prepareRace() {
      try {
        if (_preparation && currentPreparation(_preparation)) return _preparation.promise;
        standDown();
        _prepared = false;
        checkDead();
        if (G.state !== "count" || _collapsed || !wanted(true)) return Promise.resolve(false);
      } catch (_) { cancelPreparation(); _prepared = false; return Promise.resolve(false); }
      const job = { player: G.player, track: G.track, gfx: G.gfx,
        begin: G.gfx.mirrorBegin, end: G.gfx.mirrorEnd, primed: false, timer: null, resolve: null, promise: null, warmWait: null, diag: prepDiag() };
      job.promise = new Promise(resolve => { job.resolve = resolve; });
      _preparation = job; _prepared = null;
      warmWaitMark(job, "start");
      job.timer = setTimeout(() => finishPreparation(job, false, "timeout"), 30000);
      return job.promise;
    }
    function prepareFrame(frame, frameSky, night, wet, floodEmit) {
      const job = _preparation, d = job.diag, tf = _now();
      d.frames++;
      try {
        checkDead();
        if (!currentPreparation(job)) { finishPreparation(job, false, "notCurrent"); return; }
        const g = job.gfx;
        if (g.mirrorRect) g.mirrorRect(null);
        if (!job.primed) { job.primed = true; return; }
        if (g.warming && g.warming()) return;
        warmWaitMark(job, "end");
        if (d.warmEndMs === null) d.warmEndMs = Math.round(tf - d.t0);
        else d.maxGapMs = Math.max(d.maxGapMs, Math.round(tf - d.lastFrameAt));
        d.framesAfterWarm++;
        const e = el();
        if (!e || !e.style) { d.refused.noEl++; finishPreparation(job, false, "noEl"); return; }
        const hidden = e.hidden, visibility = e.style.getPropertyValue("visibility"), priority = e.style.getPropertyPriority("visibility");
        let box;
        try {
          e.style.setProperty("visibility", "hidden", "important"); e.hidden = false;
          box = e.getBoundingClientRect();
        } finally {
          e.hidden = hidden;
          if (visibility) e.style.setProperty("visibility", visibility, priority);
          else e.style.removeProperty("visibility");
        }
        if (!(box.width > 4 && box.height > 4)) { d.refused.box++; finishPreparation(job, false, "box"); return; }
        quality(g);
        const sz = targetSize(box.width, box.height, _q.res), w = sz[0], h = sz[1];
        if (w < 16 || h < 8) { d.refused.size++; finishPreparation(job, false, "size"); return; }
        const before = g.mirrorState ? g.mirrorState() : null;
        const tp = _now(), drew = rearPass(frame, frameSky, night, wet, floodEmit, w, h);
        d.passes++; d.lastPassMs = Math.round(_now() - tp); d.passMs += d.lastPassMs; d.lastFrameAt = _now();
        if (!drew) d.refused.begin++;
        if (drew) {
          const after = g.mirrorState ? g.mirrorState() : null;
          const painted = !after || (!after.dead && after.ready !== false
            && (!before || typeof before.renders !== "number" || after.renders > before.renders));
          finishPreparation(job, currentPreparation(job) && painted);
        }
      } catch (_) { finishPreparation(job, false, "throw"); }
    }
    function qualityTier(g) {
      if (!(g && (g.mobileTier || g.isMobile))) return PerfGov.tier();
      const measured = PerfGov.autoTier ? PerfGov.autoTier() : PerfGov.tier();
      const user = PerfGov.userTier ? PerfGov.userTier() : 0;
      return Math.max(1, measured, user >= 4 ? 4 : 0);
    }
    function quality(g) {
      const tier = qualityTier(g);
      const qi = tier >= 4 ? 3 : tier >= 2 ? 2 : tier >= 1 ? 1 : 0;
      if (qi !== _qWant) { _qWant = qi; _qHeld = 0; }
      if (qi !== _qi && (_qi < 0 || ++_qHeld >= Q_DWELL)) _qi = qi;
      _q = QUALITY[_qi];
    }
    function render(frame, frameSky, night, wet, floodEmit) {
      if (G.state === "race" && typeof Input !== "undefined" && Input.consumeMirror && Input.consumeMirror()) toggle();
      const g = G.gfx;
      wire();
      if (_preparation) { prepareFrame(frame, frameSky, night, wet, floodEmit); return; }
      const eligible = wanted();
      const want = eligible && !_collapsed;
      const chipOn = eligible && _collapsed;
      if (chipOn !== _chipShown) {
        _chipShown = chipOn;
        const c = chip();
        if (c) c.hidden = !chipOn;
      }
      if (want !== _shown) {
        _shown = want;
        const e = el();
        if (e) e.hidden = !want;
        document.body.classList.toggle("hud-mirror-on", want);
        if (!want) { document.body.classList.toggle("hud-mirror-side", false); _sideFits = false; }
        else _lastW = 0;
        _measureAt = -Infinity;
      }
      const pip = pipWanted();
      if (pip !== _pipShown) {
        _pipShown = pip;
        const e = pipEl();
        if (e) e.hidden = !pip;
        _pipMeasureAt = -Infinity;
      }
      if (!want) {
        _run = 0;
        if (pip) { renderPip(frame, frameSky, night, wet, floodEmit); return; }
        if (g && g.mirrorRect) g.mirrorRect(null);
        return;
      }
      const nowT = nowMs();
      if (nowT >= _measureAt) { measure(); _measureAt = nowT + MEASURE_MS; }
      if (!_rect) { g.mirrorRect(null); return; }
      g.mirrorRect(_rect);
      _frame++;
      quality(g);
      const sz = targetSize(_cssW, _cssH, _q.res), w = sz[0], h = sz[1];
      if (w < 16 || h < 8) return;
      const same = w === _lastW && h === _lastH;
      _lastW = w; _lastH = h;
      if (_frame % _q.every !== 0 && !G.frozen && same && _drawn > 0) return;
      rearPass(frame, frameSky, night, wet, floodEmit, w, h);
    }
    function rearPass(frame, frameSky, night, wet, floodEmit, w, h) {
      pose(G.player);
      const fl = Math.hypot(_F[0], _F[2]) || 1;
      _bx = -_F[0] / fl; _bz = -_F[2] / fl;
      _eye[0] = _P[0] + _U[0] * EYE_UP; _eye[1] = _P[1] + _U[1] * EYE_UP; _eye[2] = _P[2] + _U[2] * EYE_UP;
      _tgt[0] = _eye[0] + _bx * LOOK_M; _tgt[1] = _eye[1] - LOOK_DROP; _tgt[2] = _eye[2] + _bz * LOOK_M;
      return pass(frame, frameSky, night, wet, floodEmit, w, h, 2 * Math.atan(Math.tan(H_FOV / 2) / (w / h)), G.player, G.player);
    }

    function renderPip(frame, frameSky, night, wet, floodEmit) {
      const g = G.gfx;
      const nowT = nowMs();
      if (nowT >= _pipMeasureAt) {
        checkDead();
        const e = pipEl();
        _pipRect = rectOf(e);
        if (_pipRect) { const er = e.getBoundingClientRect(); _pipCssW = er.width; _pipCssH = er.height; }
        _pipMeasureAt = nowT + MEASURE_MS;
      }
      if (!_pipRect) { g.mirrorRect(null); return; }
      g.mirrorRect(_pipRect, false);
      _frame++;
      _q = QUALITY[3];
      const sz = targetSize(_pipCssW, _pipCssH, _q.res), w = sz[0], h = sz[1];
      if (w < 16 || h < 8) return;
      const same = w === _lastW && h === _lastH;
      _lastW = w; _lastH = h;
      if (_frame % _q.every !== 0 && !G.frozen && same && _drawn > 0) return;
      const pa = playerAnchor(_sub);
      const bank = Tracks.banking(G.track, pa.cS, pa.cX, _bank);
      _pipExtra.bankDy = bank ? bank.dy : 0;
      const v = GameCams.vantage(G.track, _subMode, pa.cS, pa.cX, Math.abs(_sub.speed || 0), performance.now(), _pipExtra);
      for (let i = 0; i < 3; i++) { _eye[i] = v.eye[i]; _tgt[i] = v.tgt[i]; }
      const fovY = (v.fov > 0 ? v.fov : 50) * Math.PI / 180;
      const dx = _tgt[0] - _eye[0], dz = _tgt[2] - _eye[2], dl = Math.hypot(dx, dz) || 1;
      _bx = dx / dl; _bz = dz / dl;
      pass(frame, frameSky, night, wet, floodEmit, w, h, fovY, _sub, null);
    }

    function pass(frame, frameSky, night, wet, floodEmit, w, h, fovY, centre, skip) {
      const g = G.gfx;
      const aspect = w / h;
      M4.perspectiveTo(_proj, fovY, aspect, NEAR, FAR);
      M4.lookAtTo(_view, _eye, _tgt, _up);
      M4.mulTo(_vp, _proj, _view);
      _coneTan = Math.tan(fovY / 2) * aspect;
      M4.invertTo(_invVP, _vp);
      M4.invertTo(_invProj, _proj);

      const sv = _sv;
      sv.viewProj = frame.viewProj; sv.view = frame.view; sv.proj = frame.proj; sv.invProj = frame.invProj;
      sv.invViewProj = frame.invViewProj; sv.eye = frame.eye; sv.cullDist = frame.cullDist;
      sv.lite = frame.mirrorLite; sv.freezeInst = frame.mirrorFreezeInstanced;
      sv.sky = frameSky.invViewProj; sv.tune = frame.tune;
      const cull = _q.cull;
      frame.viewProj = _vp; frame.view = _view; frame.proj = _proj; frame.invProj = _invProj;
      frame.invViewProj = _invVP; frame.eye = _eye;
      frame.cullDist = sv.cullDist > 0 ? Math.min(sv.cullDist, cull) : cull;
      frame.mirrorLite = _q.lite;
      const ie = _q.instEvery || 1;
      const run = _run; _run = 0;
      const freezeInst = !_q.lite && ie > 1 && run > 0 && (run % ie) !== 0;
      frame.mirrorFreezeInstanced = freezeInst;
      if (freezeInst) _instFreezeSkips++; else if (!_q.lite) _instRefresh++;
      if (_mirTune === null || _mirTuneSrc !== sv.tune) {
        _mirTuneSrc = sv.tune;
        _mirTune = Object.assign(Object.create(sv.tune || null), MIRROR_TUNE);
      }
      frame.tune = _mirTune;
      frameSky.invViewProj = _invVP;
      sv.lights = frame.lights; sv.tailStart = frame.tailStart; sv.tailCount = frame.tailCount;
      _aim[0] = _tgt[0] - _eye[0]; _aim[1] = 0; _aim[2] = _tgt[2] - _eye[2];
      const vl = mirrorLights(frame);
      if (vl) {
        const capped = capMirrorLights(vl.lights, vl.tailStart, vl.tailCount);
        const use = capped || vl;
        frame.lights = use.lights; frame.tailStart = use.tailStart; frame.tailCount = use.tailCount;
      }
      sv.lampCap = frame.mirrorLampCap;
      frame.mirrorLampCap = _lampCap;
      let began = false;
      try {
        began = g.mirrorBegin(frame, w, h);
        if (began) {
          drawWorldMeshes(frame, night, wet, floodEmit, false);
          drawCars(wet, night, _q.reach, centre, skip);
          g.drawSky(frameSky);
          _drawn++;
          _run = _q.lite ? 0 : run + 1;
        }
      } finally {
        try { if (began) g.mirrorEnd(); }
        finally {
          frame.viewProj = sv.viewProj; frame.view = sv.view; frame.proj = sv.proj; frame.invProj = sv.invProj;
          frame.invViewProj = sv.invViewProj; frame.eye = sv.eye; frame.cullDist = sv.cullDist;
          frame.mirrorLite = sv.lite;
          frame.mirrorFreezeInstanced = sv.freezeInst;
          frame.tune = sv.tune;
          frame.lights = sv.lights; frame.tailStart = sv.tailStart; frame.tailCount = sv.tailCount;
          frame.mirrorLampCap = sv.lampCap;
          frameSky.invViewProj = sv.sky;
          sv.viewProj = sv.view = sv.proj = sv.invProj = sv.invViewProj = sv.eye = sv.sky = null;
          sv.tune = undefined; sv.freezeInst = undefined; sv.lights = null; sv.lampCap = undefined;
        }
      }
      return began;
    }

    function setMode(v) {
      if (MODES.indexOf(v) < 0) v = "auto";
      mode = v;
      G.store.set("hudMirror", mode);
      _measureAt = -Infinity;
      if (onModeChange) onModeChange(mode);
    }
    function toggle() { const on = _shown; _collapsed = false; setMode(on ? "off" : "on"); }
    function setSubject(c, camMode) {
      _sub = c || null;
      if (camMode) _subMode = camMode;
      _lastW = 0;
    }
    function standDown() {
      cancelPreparation();
      _run = 0;
      if (_shown) { _shown = false; const e = el(); if (e) e.hidden = true; document.body.classList.toggle("hud-mirror-on", false); document.body.classList.toggle("hud-mirror-side", false); _sideFits = false; }
      if (_chipShown) { _chipShown = false; const c = chip(); if (c) c.hidden = true; }
      if (_pipShown) { _pipShown = false; const e = pipEl(); if (e) e.hidden = true; }
      _measureAt = -Infinity;
      const g = G.gfx;
      if (g && g.mirrorRect) g.mirrorRect(null);
    }
    function setPipMode(v) { if (MODES.indexOf(v) < 0) v = "auto"; pipMode = v; G.store.set("bcPip", pipMode); }

    return (_instance = {
      MODES,
      render,
      prepareRace,
      preparing: () => !!_preparation,
      cancelPreparation,
      releaseTrack(quit) {
        _vlTrack = null; _vlSrc = null; _vlAge = Infinity;
        const g = G.gfx;
        if (quit && g && typeof g.releaseMirror === "function") g.releaseMirror();
      },
      standDown,
      toggle,
      setMode,
      setSubject,
      setPipMode,
      mode: () => mode,
      drawing: () => _shown && !!_rect && !_dead,
      state: () => ({ mode, shown: _shown, collapsed: _collapsed, rect: _rect, cars: _cars, drawn: _drawn, cam: camId(), lite: _q.lite, quality: _q.name,
        instEvery: _q.instEvery || 1, instFreezeSkips: _instFreezeSkips, instRefresh: _instRefresh,
        lampCap: _lampCap, lampRanks: _vlRanks, lampHeld: _vlHeld,
        preparing: !!_preparation, prepared: _prepared, prep: _preparation ? _preparation.diag : _lastPrep,
        pip: { mode: pipMode, shown: _pipShown, code: _sub ? _sub.code : null, cam: _subMode, rect: _pipRect },
        backend: G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null,
        glass: typeof CarDraw !== "undefined" && CarDraw.instance && CarDraw.instance() ? CarDraw.instance().glassState() : null }),
    });
  }

  let _instance = null;
  return { create, MODES, instance: () => _instance };
})();

if (typeof window !== "undefined") window.MirrorPass = MirrorPass;
