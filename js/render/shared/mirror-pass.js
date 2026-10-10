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
   (where nothing behind is visible), ON in every view, OFF never. The MIRROR
   key flips it on / off. A TAP on the mirror collapses it to a small MIRROR
   chip for the rest of the session (phones have no M key), and a tap on the
   chip brings it back; the stored setting is untouched. Performance never HIDES it — a slower device gets a
   cheaper mirror instead (QUALITY below).
   BROADCAST PICTURE-IN-PICTURE: in a REAL RACE WATCH (body.bc-on, js/race/
   broadcast.js) the mirror stands down and its one target is re-aimed — a
   SECOND car on a TV shot (setSubject), unflipped, into the #bc-pip frame.
   Setting apex26.bcPip: AUTO (off on a software renderer, like the mirror),
   ON, OFF. The two are never up together, so one target serves both.
   One MirrorPass.create(G, deps) at boot; the render loop calls render().
   Reads G.gfx / G.state / G.player / G.cars / G.track / G.camMode / G.dbgCam /
   G.hideMeshes / G.store; the world draw, the car draw (CarDraw.drawMirrorCar:
   the main pass's own body + wheel meshes) and the pose helpers come through deps. */
"use strict";

const MirrorPass = (function () {
  const MODES = ["auto", "on", "off"];
  // AUTO's views: the ones with no view of the road behind at all.
  const ONBOARD = { cockpit: 1, hood: 1, visor: 1, tcam: 1, helmet: 1 };
  const H_FOV = 56 * Math.PI / 180;   // horizontal; the vertical follows the rect's aspect
  const NEAR = 0.5, FAR = 700;
  // QUALITY LADDER. The mirror is never hidden for performance — a player
  // with MIRROR on and GRAPHICS: LOW (PerfGov tier 4) saw no mirror at all
  // under the first rule — it steps down instead:
  //   full  a healthy desktop: the whole world, every frame. Audit #8:
  //         instEvery:2 freezes instanced prop cull/upload on odd frames
  //         (cars + chunked world still every frame) via frame.mirrorFreezeInstanced;
  //         apex26.mirrorInstEvery=1 restores a full re-cull every frame.
  //   lite  a phone (gfx.mobileTier) or governor tier 1: every frame, but no
  //         instanced prop batches (a second frustum re-culls and re-uploads
  //         every pack each frame), no glass or water (frame.mirrorLite, read
  //         by drawWorldMeshes), a 180 m radius, rivals within 140 m, a target
  //         at 60% of the frame's pixels (the composite filters it up).
  //   low   tier 2-3: lite at half rate and half resolution.
  //   min   tier 4+ (GRAPHICS: LOW pins 4): a third of the frame rate, 40%.
  // Every frame is the default because a half-rate mirror reads as LAG.
  let _instEvery = 2;
  try {
    const ie = localStorage.getItem("apex26.mirrorInstEvery");
    if (ie === "1") _instEvery = 1;
    else if (ie && +ie > 0) _instEvery = Math.min(4, Math.max(1, ie | 0));
  } catch (_) { /* default 2 */ }
  const QUALITY = [
    { name: "full", lite: false, res: 1.0, cull: 400, reach: 260, every: 1, instEvery: _instEvery },
    { name: "lite", lite: true,  res: 0.6, cull: 180, reach: 140, every: 1, instEvery: 1 },
    { name: "low",  lite: true,  res: 0.5, cull: 150, reach: 120, every: 2, instEvery: 1 },
    { name: "min",  lite: true,  res: 0.4, cull: 120, reach: 100, every: 3, instEvery: 1 },
  ];
  const EYE_UP = 1.05;                // helmet height above the road surface
  const LOOK_M = 20, LOOK_DROP = 0.75; // aim 20 m back, dipped ~2° toward the road
  // ms between #hud-mirror layout reads — on the CLOCK, not a frame count
  // (docs/notes/PERF-FINDINGS.md §2n: 30 frames was ~0.5 s at 60 fps and
  // 0.25 s at 120, and never at all on a software frame that runs at 1 Hz).
  const MEASURE_MS = 500;
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  // SUPERSAMPLED, then mip-filtered down by the composite (every backend builds
  // the target's mip chain after the pass). A small image with no anti-aliasing
  // of its own shimmers as the car moves — kerb stripes, fences, grandstand
  // rows and the sun disc when it is behind the car fall between pixels from
  // frame to frame: the "flashy" mirror reported from a phone. The fragments
  // are cheap at this size (a phone's frame is ~8k pixels; the mirror's cost is
  // its draw calls), so the rungs keep their draw-distance / cadence savings and
  // resolution buys the steadiness. MAX_W/MAX_H are every backend's own clamp,
  // applied here with the aspect kept (a per-axis clamp would stretch it).
  const SS = 2, MAX_W = 1024, MAX_H = 512;
  // A RUNG HOLDS ~1.5 s before the governor may move it. On a phone the tier
  // moves on its own measurements, and every move swapped resolution, draw
  // distance and cadence at once — scenery popping in and out of the mirror,
  // reported as flashing. The first rung is taken at once (nothing to hold).
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
    // Canvas fractions [x, y, w, h], top-left origin, of the #hud-mirror frame.
    let _rect = null, _measureAt = -Infinity, _shown = false, _frame = 0, _cars = 0, _drawn = 0;
    let _run = 0;   // consecutive FULL passes drawn since the last interruption: the freeze cadence (b._mirMats is only current inside a run)
    let _el = null, _canvas = null, _dead = false, _lastW = 0, _lastH = 0;
    // COLLAPSED: tapped away this session. Not persisted — the next page load
    // shows the mirror the setting asks for — and cleared by the MIRROR key.
    let _collapsed = false, _chip = null, _chipShown = false, _wired = false;
    let _bx = 0, _bz = -1;   // the mirror's look direction (the player's back), horizontal unit
    let _coneTan = 1;        // tan(horizontal half-FOV) of the pass in flight (pass())
    // FIELD LOD candidate pool (drawCarsLod): a pooled matrix, car and eye
    // distance squared per rival that survives the arc / behind-eye / cone tests.
    const _cMats = [], _cCars = [], _cD2 = [], _cKeep = [];
    let _q = QUALITY[0], _qi = -1, _qWant = -1, _qHeld = 0;
    // The frame's CSS box (measure()): the target is sized from THAT, not from
    // the render buffer, which the governor's dynamic resolution rescales every
    // few seconds on a phone — each rescale reallocated the mirror target.
    let _cssW = 0, _cssH = 0;
    let _preparation = null, _prepared = null;
    // THE PiP: the subject car and its TV shot (broadcast.js via G.setPip), the frame, its rect and CSS box.
    let _sub = null, _subMode = "tcam", _pipEl = null, _pipShown = false, _pipRect = null, _pipMeasureAt = -Infinity;
    let _pipCssW = 0, _pipCssH = 0;
    let pipMode = G.store.get("bcPip", "auto");
    if (MODES.indexOf(pipMode) < 0) pipMode = "auto";
    const _pipExtra = { bankDy: 0 };
    // The frame fields the pass swaps, saved in one reused scratch (no per-frame object).
    const _sv = { viewProj: null, view: null, proj: null, invProj: null, invViewProj: null, eye: null, cullDist: 0, lite: undefined, freezeInst: undefined, sky: null, tune: undefined, lights: null, tailStart: 0, tailCount: 0 };
    let _instFreezeSkips = 0, _instRefresh = 0;
    const _aim = [0, 0, 0];   // the pass camera's ground-plane aim, for FrameLights.viewLights
    // THE SUN'S VIEW-DEPENDENT TERMS STAY OUT OF THE MIRROR (a phone report:
    // "still a little flashy … sun and shadows"). The mirror is a small target
    // with no anti-aliasing of its own (FXAA runs before its composite), so
    // the paint glint (12x), the metallic sparkle and the window flash alias
    // into sub-pixel on/off specks; and the cast-shadow map is fitted around
    // the FORWARD view, so looking back its edge sweeps the mirror as the car
    // moves. These four knobs are read off frame.tune by every backend's lit
    // upload (glx.js begin, wgx.js _writeFrame, tsl-lit updateFrame), so one
    // override on the mirror camera's frame reaches all three, and the main
    // pass re-uploads its own. One object, refreshed from the live tune each
    // pass (the LIGHTING tuner edits it in place) — no per-frame allocation.
    const MIRROR_TUNE = { carSunGlint: 0, carSparkle: 0, windowSunFlash: 0, shadowStr: 0 };
    const _mirTune = {};

    // The target for a frame of cssW x cssH CSS px: device pixels (DPR capped at
    // 2) x the rung's res x SS — independent of the governor's render scale, so
    // it reallocates only when the frame resizes or the rung changes.
    function targetSize(cssW, cssH, res) {
      const dpr = Math.min(2, typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
      let w = cssW * dpr * res * SS, h = cssH * dpr * res * SS;
      const k = Math.min(1, MAX_W / (w || 1), MAX_H / (h || 1));
      w = Math.round(w * k); h = Math.round(h * k);
      _sz[0] = w; _sz[1] = h;
      return _sz;
    }
    const _sz = [0, 0];
    function el() { return _el || (_el = document.getElementById("hud-mirror")); }
    function pipEl() { return _pipEl || (_pipEl = document.getElementById("bc-pip")); }
    function bcOn() { return document.body.classList.contains("bc-on"); }
    function chip() { return _chip || (_chip = document.getElementById("hud-mirror-chip")); }
    // Tap the mirror: collapse it; tap the chip: bring it back. Wired once, on
    // the first frame the elements exist (index.html owns both).
    function wire() {
      if (_wired) return;
      const e = el(), c = chip();
      if (!e || !c || !e.addEventListener) return;
      _wired = true;
      e.addEventListener("click", () => { _collapsed = true; _measureAt = -Infinity; });
      c.addEventListener("click", () => { _collapsed = false; _measureAt = -Infinity; });
      // A rotation or resize moves the frame NOW; the MEASURE_MS clock alone
      // painted the old rect for up to half a second after a phone turned.
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
    // Is the mirror wanted this frame? The race only — the countdown's start
    // lights hang in the same centre column — never under a debug / photo
    // camera, with the HUD hidden, or while LOOK BACK already shows the road
    // behind full-screen. Never for performance (QUALITY scales it instead);
    // AUTO alone skips a SOFTWARE renderer, where a second world pass is
    // seconds a frame (and every CI run would pay it in the cockpit default).
    // An immersive XR session: presentXR drops the post chain that composites the
    // mirror, and #hud-mirror is not in the headset — the pass would be a whole
    // world render (+25 % of the stereo pair's prop triangles) nobody sees.
    const xrOn = () => typeof XrBoot !== "undefined" && !!XrBoot.comfort && XrBoot.comfort();
    function wanted(preparing) {
      if (mode === "off" || xrOn()) return false;
      if (bcOn()) return false;   // a WATCH: the TV picture has no mirror (T-CAM is one of the director's shots); the PiP owns the target
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

    // The PiP is wanted: a WATCH with a subject still running, the race, no debug
    // camera, the HUD up; AUTO skips a software renderer (a second world pass).
    function pipWanted() {
      if (pipMode === "off" || !_sub || _sub.retired || !bcOn() || xrOn()) return false;
      const g = G.gfx;
      if (!g || typeof g.mirrorBegin !== "function" || _dead) return false;
      if (G.state !== "race" || !G.track || G.dbgCam) return false;
      if (document.body.classList.contains("hud-hidden")) return false;
      return pipMode === "on" || !softGpu();
    }

    // A frame's rect as canvas fractions. Both rects are getBoundingClientRect,
    // so the HUD's CSS zoom is in both or neither (js/ui/css-zoom.js).
    function rectOf(e) {
      const c = canvasEl();
      if (!e || !c) return null;
      const er = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (!(er.width > 4 && er.height > 4 && cr.width > 0 && cr.height > 0)) return null;
      return [(er.left - cr.left) / cr.width, (er.top - cr.top) / cr.height, er.width / cr.width, er.height / cr.height];
    }
    function checkDead() {
      const st = G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null;
      _dead = !!(st && st.dead);   // a backend that failed its target latches off
    }
    function measure() {
      checkDead();
      _rect = rectOf(el());
      if (_rect) { const er = el().getBoundingClientRect(); _cssW = er.width; _cssH = er.height; side(er); }
    }
    // THE RADIO CARD BESIDE THE MIRROR, not under it. Right of the frame is the
    // widest free strip at that height on a landscape screen (the map and gap
    // readouts own the left, 844x390: ~280px right vs ~230px left). The strip
    // ends at the right column: the pause button's column always (the sector
    // box that hangs under it comes and goes, and is ~10px wider), the cam
    // button only where it shares the card's rows (BROADCAST, mirror at the
    // very top). Published in SCREEN px — css/hud.css divides by the card's
    // own zoom — and only when a card fits; otherwise the card stacks under
    // the mirror (--mir-bot).
    const SIDE_MIN = 190, SIDE_GAP = 8, SIDE_ROWS = 96;
    let _sideFits = null, _sideX = "", _sideW = "";   // what side() last wrote (null: unknown)
    function side(er) {
      const b = document.body;
      let right = typeof innerWidth === "number" ? innerWidth - 10 : 0;
      const pause = document.getElementById("pausebtn"), cam = document.getElementById("btn-cam");
      const sec = document.getElementById("hud-sectors");
      const box = (n) => (n && !n.hidden && n.getBoundingClientRect ? n.getBoundingClientRect() : null);
      const p = box(pause), c = box(cam), s = box(sec);
      // Only what is RIGHT of the frame: the sector box can cross to the left column.
      const past = (r) => r && r.width > 0 && r.left > er.right;
      if (past(p)) right = Math.min(right, p.left - 12);
      if (past(s)) right = Math.min(right, s.left);
      if (past(c) && c.bottom > er.top) right = Math.min(right, c.left);
      const x = er.right + SIDE_GAP;
      // THE TOUCH DOCKS END THE STRIP TOO. The cockpit's right dock reaches the
      // mirror's rows on a landscape phone (BOOST at y 72 on 844x390), and the
      // card was published straight across it (survey: #announce [500,66 223x65]
      // over #btn-boost [603,72]) — the same defect js/ui/hud.js radioTopSlot
      // fixed for the top row. The card's rows are the mirror's top down by the
      // card's own height (at least SIDE_ROWS while it is hidden); a group in
      // them that reaches past the slot's start ends the strip at its left edge,
      // one that already covers the start leaves no slot (the card stacks).
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
      // Compare before writing: a <body> class or custom-property write
      // invalidates style page-wide even when the value is the same.
      if (fits !== _sideFits) { _sideFits = fits; b.classList.toggle("hud-mirror-side", fits); }
      if (fits && b.style) {
        const sx = x.toFixed(1) + "px", sw = w.toFixed(1) + "px";
        if (sx !== _sideX) { _sideX = sx; b.style.setProperty("--mir-side-x", sx); }
        if (sw !== _sideW) { _sideW = sw; b.style.setProperty("--mir-side-w", sw); }
      }
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

    // Rivals within `reach` (QUALITY) of track arc and not ahead of the mirror eye:
    // drawCar (CarDraw.drawMirrorCar) draws each from the MAIN pass's caches — the
    // body-only mesh and the 4 rotating field wheels, on the grounded pose below.
    // Never a whole-car teamMesh: nothing else builds one, so each rival new to
    // the mirror cost a 140-250 ms Car3D.build mid-race. No decals, rings or lamps —
    // the mirror is ~120 px tall.
    // `centre`: whose arc `reach` is measured from; `skip`: the car not drawn (the
    // mirror's own; the PiP draws its subject and skips nobody).
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
        if (dx * _bx + dz * _bz < -3) continue;   // ahead of the eye: out of a rear view
        basisMat(_R, _U, _F, _P, _mat);
        drawCar(c, _mat, paint, night);
        _cars++;
      }
    }

    // FIELD LOD (js/car/field-lod.js; apex26.fieldLod=0 keeps the loop above):
    // the same tests, then the MIRROR also drops a car outside its horizontal
    // view cone (+5 m for the car's half-length), and only the nearest
    // FieldLod.mirrorCap() (6) to the eye are drawn. The PiP keeps no cone (a
    // TV shot can look steeply down) and always draws its subject.
    function drawCarsLod(paint, night, reach, centre, skip) {
      const track = G.track, ex = _eye[0], ez = _eye[2];
      let n = 0, force = -1;
      for (const c of G.cars) {
        if (skip && (c === skip || c.isPlayer)) continue;
        const ds = Math.abs(c.s - centre.s);
        if (Math.min(ds, track.total - ds) > reach) continue;
        pose(c);
        const dx = _P[0] - ex, dz = _P[2] - ez;
        const fwd = dx * _bx + dz * _bz;
        if (fwd < -3) continue;   // ahead of the eye: out of a rear view
        if (skip && Math.abs(dx * _bz - dz * _bx) > fwd * _coneTan + 5) continue;   // outside the mirror's cone
        const m = _cMats[n] || (_cMats[n] = new Float32Array(16));
        basisMat(_R, _U, _F, _P, m);
        if (c === centre && !skip) force = n;
        _cCars[n] = c; _cD2[n] = dx * dx + dz * dz; n++;
      }
      FieldLod.nearest(_cD2, n, FieldLod.mirrorCap(), _cKeep, force);
      for (let i = 0; i < n; i++) {
        if (_cKeep[i]) { drawCar(_cCars[i], _cMats[i], paint, night); _cars++; }
        _cCars[i] = null;
      }
    }

    function finishPreparation(job, ready) {
      if (_preparation !== job) return;
      clearTimeout(job.timer);
      _preparation = null; _prepared = ready;
      _lastW = 0;   // preparation never spends the first visible frame's draw
      job.resolve(ready);
    }
    function cancelPreparation() { if (_preparation) finishPreparation(_preparation, false); }
    function currentPreparation(job) {
      return G.state === "count" && G.player === job.player && G.track === job.track && G.gfx === job.gfx
        && G.gfx.mirrorBegin === job.begin && G.gfx.mirrorEnd === job.end && !_collapsed && wanted(true);
    }
    // The caller holds the entry cover and countdown until this optional pass
    // settles. It is driven by render(), not a timer that draws out of frame.
    function prepareRace() {
      try {
        if (_preparation && currentPreparation(_preparation)) return _preparation.promise;
        standDown();   // a restart may still have the previous race's mirror up
        _prepared = false;
        checkDead();
        if (G.state !== "count" || _collapsed || !wanted(true)) return Promise.resolve(false);
      } catch (_) { cancelPreparation(); _prepared = false; return Promise.resolve(false); }
      const job = { player: G.player, track: G.track, gfx: G.gfx,
        begin: G.gfx.mirrorBegin, end: G.gfx.mirrorEnd, primed: false, timer: null, resolve: null, promise: null };
      job.promise = new Promise(resolve => { job.resolve = resolve; });
      _preparation = job; _prepared = null;
      job.timer = setTimeout(() => finishPreparation(job, false), 30000);
      return job.promise;
    }
    function prepareFrame(frame, frameSky, night, wet, floodEmit) {
      const job = _preparation;
      try {
        checkDead();
        if (!currentPreparation(job)) { finishPreparation(job, false); return; }
        const g = job.gfx;
        if (g.mirrorRect) g.mirrorRect(null);
        // The main present services any queued gfx.warm() first. Its mirror
        // shader warm uses a tiny target; our actual-size pass must follow it.
        if (!job.primed) { job.primed = true; return; }
        if (g.warming && g.warming()) return;
        const e = el();
        if (!e || !e.style) { finishPreparation(job, false); return; }
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
        if (!(box.width > 4 && box.height > 4)) { finishPreparation(job, false); return; }
        quality(g);
        const sz = targetSize(box.width, box.height, _q.res), w = sz[0], h = sz[1];
        if (w < 16 || h < 8) { finishPreparation(job, false); return; }
        const before = g.mirrorState ? g.mirrorState() : null;
        if (rearPass(frame, frameSky, night, wet, floodEmit, w, h)) {
          const after = g.mirrorState ? g.mirrorState() : null;
          // Backends can catch their own render failure. A successful begin
          // alone must not report a prepared target that was never written.
          const painted = !after || (!after.dead && after.ready !== false
            && (!before || typeof before.renders !== "number" || after.renders > before.renders));
          finishPreparation(job, currentPreparation(job) && painted);
        }
      } catch (_) { finishPreparation(job, false); }   // an optimisation cannot strand race entry
    }
    function quality(g) {
      const tier = PerfGov.tier();
      const qi = tier >= 4 ? 3 : tier >= 2 ? 2 : (g.mobileTier || tier >= 1) ? 1 : 0;
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
        document.body.classList.toggle("hud-mirror-on", want);   // the radio card and flag clear it (css/hud.css)
        if (!want) { document.body.classList.toggle("hud-mirror-side", false); _sideFits = false; }
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
        _run = 0;   // hidden/toggled: the recorded instance pack ages, so the next full pass must refresh it
        if (pip) { renderPip(frame, frameSky, night, wet, floodEmit); return; }
        if (g && g.mirrorRect) g.mirrorRect(null);
        return;
      }
      const nowT = nowMs();
      if (nowT >= _measureAt) { measure(); _measureAt = nowT + MEASURE_MS; }
      if (!_rect) { g.mirrorRect(null); return; }
      g.mirrorRect(_rect);
      // Every frame — a mirror that updates at half rate reads as lag — except
      // at governor tier 2+, where the frame rate itself is the problem.
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
      // U is up in world terms (R × F with the track's +x-right convention).
      _eye[0] = _P[0] + _U[0] * EYE_UP; _eye[1] = _P[1] + _U[1] * EYE_UP; _eye[2] = _P[2] + _U[2] * EYE_UP;
      _tgt[0] = _eye[0] + _bx * LOOK_M; _tgt[1] = _eye[1] - LOOK_DROP; _tgt[2] = _eye[2] + _bz * LOOK_M;
      return pass(frame, frameSky, night, wet, floodEmit, w, h, 2 * Math.atan(Math.tan(H_FOV / 2) / (w / h)), G.player, G.player);
    }

    // THE PiP FRAME: the subject on its TV shot — GameCams.vantage, the very rig
    // the main camera uses, its POOLED answer copied at once (the main camera
    // holds the same arrays) — at the cheapest tier, into #bc-pip, unflipped.
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
      _q = QUALITY[3];   // its own pass only: the mirror's rung dwell (_qi) is left alone
      // Sized like the mirror (targetSize), not from the render buffer the governor rescales.
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
      _bx = dx / dl; _bz = dz / dl;   // the look direction: drawCars drops what is behind the eye
      pass(frame, frameSky, night, wet, floodEmit, w, h, fovY, _sub, null);
    }

    // One second-camera pass: the view from _eye to _tgt, the world, the cars
    // around `centre`, the sky — into the backend's mirror target.
    function pass(frame, frameSky, night, wet, floodEmit, w, h, fovY, centre, skip) {
      const g = G.gfx;
      const aspect = w / h;
      M4.perspectiveTo(_proj, fovY, aspect, NEAR, FAR);
      M4.lookAtTo(_view, _eye, _tgt, _up);
      M4.mulTo(_vp, _proj, _view);
      _coneTan = Math.tan(fovY / 2) * aspect;
      M4.invertTo(_invVP, _vp);
      M4.invertTo(_invProj, _proj);

      // The mirror camera goes ON `frame` (drawWorldMeshes culls the prop
      // batches through frame.viewProj, and every backend's begin reads it)
      // and comes off again whatever happens in between.
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
      // Audit #8: on full, reuse last mirror instance pack every other drawn
      // frame (cars still redraw). First drawn frame always refreshes.
      // The cadence counts the current RUN of full passes, not every pass ever drawn: a lite/hidden/failed interval
      // leaves b._mirMats from before it, and a global parity could freeze the first full pass onto that old pack.
      // _run is zeroed here and only advanced after a pass that drew, so a throw or a refused begin also resets it.
      const ie = _q.instEvery || 1;
      const run = _run; _run = 0;
      const freezeInst = !_q.lite && ie > 1 && run > 0 && (run % ie) !== 0;
      frame.mirrorFreezeInstanced = freezeInst;
      if (freezeInst) _instFreezeSkips++; else if (!_q.lite) _instRefresh++;
      frame.tune = Object.assign(_mirTune, sv.tune || null, MIRROR_TUNE);
      frameSky.invViewProj = _invVP;
      // THE MIRROR'S OWN LAMPS (FrameLights.viewLights): frame.lights is culled
      // for the forward camera, which ranks lamps behind it last — the very
      // lamps this camera sees — so they flashed in and out as the car moved.
      sv.lights = frame.lights; sv.tailStart = frame.tailStart; sv.tailCount = frame.tailCount;
      _aim[0] = _tgt[0] - _eye[0]; _aim[1] = 0; _aim[2] = _tgt[2] - _eye[2];
      const vl = typeof FrameLights !== "undefined" && FrameLights.viewLights ? FrameLights.viewLights(frame, _eye, _aim) : null;
      if (vl) { frame.lights = vl.lights; frame.tailStart = vl.tailStart; frame.tailCount = vl.tailCount; }
      let began = false;
      try {
        began = g.mirrorBegin(frame, w, h);
        if (began) {
          drawWorldMeshes(frame, night, wet, floodEmit, false);
          drawCars(wet, night, _q.reach, centre, skip);
          g.drawSky(frameSky);   // opaque first, then sky (gfx.js)
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
          frameSky.invViewProj = sv.sky;
          sv.viewProj = sv.view = sv.proj = sv.invProj = sv.invViewProj = sv.eye = sv.sky = null;
          sv.tune = undefined; sv.freezeInst = undefined; sv.lights = null;
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
    // The MIRROR key: whatever is showing now goes off, anything else goes ON.
    function toggle() { const on = _shown; _collapsed = false; setMode(on ? "off" : "on"); }
    /** The PiP subject (broadcast.js via G.setPip): a car and a CamModes id, or null. */
    function setSubject(c, camMode) {
      _sub = c || null;
      if (camMode) _subMode = camMode;
      _lastW = 0;   // a new subject draws on its first frame, whatever the cadence
    }
    // STAND DOWN for a frame that never reaches render(): the GARAGE preview
    // (game.js returns before the mirror's slot) left the race's frame and the
    // backend's rect up, and present() composited the stale mirror image over
    // the car. Hides the frame, the chip and the PiP and clears the rect.
    function standDown() {
      cancelPreparation();
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
      standDown,
      toggle,
      setMode,
      setSubject,
      setPipMode,
      mode: () => mode,
      // Is the rear-view actually drawing this frame? (car-draw.js puts its
      // image on the cockpit housings' glass while it is — gfx.drawMirrorGlass —
      // and a sky-tint fallback when it is not.)
      drawing: () => _shown && !!_rect && !_dead,
      // __apex.mirror(): the setting, what this frame resolved, the backend's own
      // count, and the cockpit glass (car-draw.js glassState: live vs fallback).
      state: () => ({ mode, shown: _shown, collapsed: _collapsed, rect: _rect, cars: _cars, drawn: _drawn, cam: camId(), lite: _q.lite, quality: _q.name,
        instEvery: _q.instEvery || 1, instFreezeSkips: _instFreezeSkips, instRefresh: _instRefresh,
        preparing: !!_preparation, prepared: _prepared,
        pip: { mode: pipMode, shown: _pipShown, code: _sub ? _sub.code : null, cam: _subMode, rect: _pipRect },
        backend: G.gfx && G.gfx.mirrorState ? G.gfx.mirrorState() : null,
        glass: typeof CarDraw !== "undefined" && CarDraw.instance && CarDraw.instance() ? CarDraw.instance().glassState() : null }),
    });
  }

  // The live instance, for __apex.mirror() (js/agent/apex.js) — game.js creates exactly one.
  let _instance = null;
  return { create, MODES, instance: () => _instance };
})();

if (typeof window !== "undefined") window.MirrorPass = MirrorPass;
