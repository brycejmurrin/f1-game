/* Apex 26 — MirrorPass: the HUD REAR-VIEW MIRROR. A second camera sits on the
   player's car looking back down its own heading and redraws the world and
   the rival cars into a small target of the backend's own (gfx.mirrorBegin /
   mirrorEnd — GLX, TLX and WGX each implement the pair), which present()
   composites, flipped left-right like glass, into the rect of the #hud-mirror
   frame. The frame is plain DOM laid out by css/hud.css, so the HUD scale,
   the safe-area insets and the profiles place the mirror exactly as they
   place every other widget; this module only measures it.
   The pass runs BEFORE the main begin(), in the env probe's slot: present()
   reads the post matrices from whichever begin() ran last, and TLX / WGX
   defer their draws to it — a mirror recorded after the main pass would
   corrupt the one the player is looking at.
   Setting HUD > MIRROR (apex26.hudMirror): AUTO shows it in the onboard views
   (where nothing behind is visible) on a device that can afford a second
   world pass, ON in every view, OFF never. The MIRROR key flips it on / off.
   One MirrorPass.create(G, deps) at boot; the render loop calls render().
   Reads G.gfx / G.state / G.player / G.cars / G.track / G.camMode / G.dbgCam /
   G.hideMeshes / G.store; the world draw and the car pose helpers come
   through deps. */
"use strict";

const MirrorPass = (function () {
  const MODES = ["auto", "on", "off"];
  // AUTO's views: the ones with no view of the road behind at all.
  const ONBOARD = { cockpit: 1, hood: 1, visor: 1, tcam: 1 };
  const H_FOV = 56 * Math.PI / 180;   // horizontal; the vertical follows the rect's aspect
  const NEAR = 0.5, FAR = 700;
  const CULL_M = 400;                 // radial scenery cull, like the env probe's 300
  const CAR_REACH_M = 260;            // track arc behind (and beside) the player a rival is drawn at
  // LITE: a phone (gfx.mobileTier) or a device the governor has started
  // shedding on. Halving the mirror's cadence there — the first version —
  // read as a LAGGING mirror, so the pass is made cheap enough to run every
  // frame instead: no instanced prop batches (a second frustum re-culls and
  // re-uploads every pack each frame), no glass or water (frame.mirrorLite,
  // read by drawWorldMeshes), a 180 m scenery radius, rivals within 140 m,
  // and a target at 60% of the frame's pixels (the composite filters it up).
  // Only tier 2+ halves the cadence, and ON stops at tier 3 (wanted()).
  const LITE_CULL_M = 180, LITE_CAR_REACH_M = 140, LITE_RES = 0.6;
  const EYE_UP = 1.05;                // helmet height above the road surface
  const LOOK_M = 20, LOOK_DROP = 0.75; // aim 20 m back, dipped ~2° toward the road
  const MEASURE_EVERY = 30;           // frames between #hud-mirror layout reads

  function create(G, deps) {
    Log.info("game", "MirrorPass.create");
    const { drawWorldMeshes, teamMesh, renderPosOf, playerAnchor, yawVisInterp, basisMat, carPaint, onModeChange } = deps;
    let mode = G.store.get("hudMirror", "auto");
    if (MODES.indexOf(mode) < 0) mode = "auto";

    const _view = new Float32Array(16), _proj = new Float32Array(16), _vp = new Float32Array(16);
    const _invVP = new Float32Array(16), _invProj = new Float32Array(16), _mat = new Float32Array(16);
    const _eye = [0, 0, 0], _tgt = [0, 0, 0], _up = [0, 1, 0];
    const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    const _bank = { dy: 0, roll: 0 };
    const _P = [0, 0, 0], _F = [0, 0, 1], _R = [1, 0, 0], _U = [0, 1, 0];
    // Canvas fractions [x, y, w, h], top-left origin, of the #hud-mirror frame.
    let _rect = null, _measureIn = 0, _shown = false, _frame = 0, _cars = 0, _drawn = 0;
    let _el = null, _canvas = null, _dead = false, _lastW = 0, _lastH = 0;
    let _bx = 0, _bz = -1;   // the mirror's look direction (the player's back), horizontal unit
    let _lite = false;
    // The frame fields the pass swaps, saved in one reused scratch (no per-frame object).
    const _sv = { viewProj: null, view: null, proj: null, invProj: null, invViewProj: null, eye: null, cullDist: 0, lite: undefined, sky: null };

    function el() { return _el || (_el = document.getElementById("hud-mirror")); }
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
    // Is the mirror wanted this frame? The race only — the countdown's start
    // lights hang in the same centre column — never under a debug / photo
    // camera, with the HUD hidden, or while LOOK BACK already shows the road
    // behind full-screen.
    function wanted() {
      if (mode === "off") return false;
      const g = G.gfx;
      if (!g || typeof g.mirrorBegin !== "function") return false;
      if (G.state !== "race") return false;
      if (!G.player || !G.track || G.dbgCam) return false;
      if (document.body.classList.contains("hud-hidden")) return false;
      if (typeof Input !== "undefined" && Input.lookingBack && Input.lookingBack()) return false;
      if (_dead) return false;
      if (mode === "on") return PerfGov.tier() < 3;
      return !!ONBOARD[camId()] && !g.mobileTier && !softGpu() && PerfGov.tier() < 2;
    }

    // The frame's rect as canvas fractions. Both rects are getBoundingClientRect,
    // so the HUD's CSS zoom is in both or neither (js/ui/css-zoom.js).
    function measure() {
      const st = G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null;
      _dead = !!(st && st.dead);   // a backend that failed its target latches off
      const e = el(), c = canvasEl();
      if (!e || !c) { _rect = null; return; }
      const er = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (!(er.width > 4 && er.height > 4 && cr.width > 0 && cr.height > 0)) { _rect = null; return; }
      _rect = [(er.left - cr.left) / cr.width, (er.top - cr.top) / cr.height,
        er.width / cr.width, er.height / cr.height];
    }

    // The player's (or a rival's) grounded basis: interpolated world position,
    // road height and bank, road tangent yawed by the drawn yawVis — the body
    // loop's own maths less the cosmetic suspension (bodyAttitude integrates
    // springs; a second update per frame would run them at twice the rate).
    // U = R × F is the in-race handedness (det −1, see basisMat in game.js).
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

    // Rivals within CAR_REACH_M of track arc and not ahead of the mirror eye:
    // the factory whole-car mesh, one draw each (no decals, rings or lamps —
    // the mirror is ~120 px tall).
    function drawCars(wet, night, reach) {
      const player = G.player, track = G.track, hide = G.hideMeshes;
      _cars = 0;
      if (hide && hide.cars) return;
      const ex = _eye[0], ez = _eye[2];
      const paint = carPaint(wet, night);
      for (const c of G.cars) {
        if (c === player || c.isPlayer) continue;
        const ds = Math.abs(c.s - player.s);
        if (Math.min(ds, track.total - ds) > reach) continue;
        pose(c);
        const dx = _P[0] - ex, dz = _P[2] - ez;
        if (dx * _bx + dz * _bz < -3) continue;   // ahead of the eye: out of a rear view
        basisMat(_R, _U, _F, _P, _mat);
        G.gfx.draw(teamMesh(c.team, c), _mat, paint);
        _cars++;
      }
    }

    function render(frame, frameSky, night, wet, floodEmit) {
      if (G.state === "race" && typeof Input !== "undefined" && Input.consumeMirror && Input.consumeMirror()) toggle();
      const g = G.gfx;
      const want = wanted();
      if (want !== _shown) {
        _shown = want;
        const e = el();
        if (e) e.hidden = !want;
        document.body.classList.toggle("hud-mirror-on", want);   // the radio card and flag step down (css/hud.css)
        _measureIn = 0;
      }
      if (!want) { if (g && g.mirrorRect) g.mirrorRect(null); return; }
      if (--_measureIn <= 0) { measure(); _measureIn = MEASURE_EVERY; }
      if (!_rect) { g.mirrorRect(null); return; }
      g.mirrorRect(_rect);
      // Every frame — a mirror that updates at half rate reads as lag — except
      // at governor tier 2+, where the frame rate itself is the problem.
      _frame++;
      const tier = PerfGov.tier();
      _lite = !!g.mobileTier || tier >= 1;
      const res = _lite ? LITE_RES : 1;
      const w = Math.round(_rect[2] * g.width * res), h = Math.round(_rect[3] * g.height * res);
      if (w < 16 || h < 8) return;
      const same = w === _lastW && h === _lastH;
      _lastW = w; _lastH = h;
      if (tier >= 2 && (_frame & 1) && !G.frozen && same && _drawn > 0) return;

      pose(G.player);
      const fl = Math.hypot(_F[0], _F[2]) || 1;
      _bx = -_F[0] / fl; _bz = -_F[2] / fl;
      // U is up in world terms (R × F with the track's +x-right convention).
      _eye[0] = _P[0] + _U[0] * EYE_UP; _eye[1] = _P[1] + _U[1] * EYE_UP; _eye[2] = _P[2] + _U[2] * EYE_UP;
      _tgt[0] = _eye[0] + _bx * LOOK_M; _tgt[1] = _eye[1] - LOOK_DROP; _tgt[2] = _eye[2] + _bz * LOOK_M;
      const aspect = w / h;
      M4.perspectiveTo(_proj, 2 * Math.atan(Math.tan(H_FOV / 2) / aspect), aspect, NEAR, FAR);
      M4.lookAtTo(_view, _eye, _tgt, _up);
      M4.mulTo(_vp, _proj, _view);
      M4.invertTo(_invVP, _vp);
      M4.invertTo(_invProj, _proj);

      // The mirror camera goes ON `frame` (drawWorldMeshes culls the prop
      // batches through frame.viewProj, and every backend's begin reads it)
      // and comes off again whatever happens in between.
      const sv = _sv;
      sv.viewProj = frame.viewProj; sv.view = frame.view; sv.proj = frame.proj; sv.invProj = frame.invProj;
      sv.invViewProj = frame.invViewProj; sv.eye = frame.eye; sv.cullDist = frame.cullDist;
      sv.lite = frame.mirrorLite; sv.sky = frameSky.invViewProj;
      const cull = _lite ? LITE_CULL_M : CULL_M;
      frame.viewProj = _vp; frame.view = _view; frame.proj = _proj; frame.invProj = _invProj;
      frame.invViewProj = _invVP; frame.eye = _eye;
      frame.cullDist = sv.cullDist > 0 ? Math.min(sv.cullDist, cull) : cull;
      frame.mirrorLite = _lite;
      frameSky.invViewProj = _invVP;
      let began = false;
      try {
        began = g.mirrorBegin(frame, w, h);
        if (began) {
          drawWorldMeshes(frame, night, wet, floodEmit, false);
          drawCars(wet, night, _lite ? LITE_CAR_REACH_M : CAR_REACH_M);
          g.drawSky(frameSky);   // opaque first, then sky (gfx.js)
          _drawn++;
        }
      } finally {
        if (began) g.mirrorEnd();
        frame.viewProj = sv.viewProj; frame.view = sv.view; frame.proj = sv.proj; frame.invProj = sv.invProj;
        frame.invViewProj = sv.invViewProj; frame.eye = sv.eye; frame.cullDist = sv.cullDist;
        frame.mirrorLite = sv.lite;
        frameSky.invViewProj = sv.sky;
        sv.viewProj = sv.view = sv.proj = sv.invProj = sv.invViewProj = sv.eye = sv.sky = null;
      }
    }

    function setMode(v) {
      if (MODES.indexOf(v) < 0) v = "auto";
      mode = v;
      G.store.set("hudMirror", mode);
      _measureIn = 0;
      if (onModeChange) onModeChange(mode);
    }
    // The MIRROR key: whatever is showing now goes off, anything else goes ON.
    function toggle() { setMode(_shown ? "off" : "on"); }

    return (_instance = {
      MODES,
      render,
      toggle,
      setMode,
      mode: () => mode,
      // __apex.mirror(): the setting, what this frame resolved, and the backend's own count.
      state: () => ({ mode, shown: _shown, rect: _rect, cars: _cars, drawn: _drawn, cam: camId(), lite: _lite,
        backend: G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null }),
    });
  }

  // The live instance, for __apex.mirror() (js/agent/apex.js) — game.js creates exactly one.
  let _instance = null;
  return { create, MODES, instance: () => _instance };
})();

if (typeof window !== "undefined") window.MirrorPass = MirrorPass;
