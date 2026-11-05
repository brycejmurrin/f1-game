/* Apex 26 — garage entry/exit CAMERA OPTIONS and the UI for choosing them.
 * Override layer for arrival eyes: keeps the default camera inside the bay (or
 * cleanly in the doorway), never looking through a culled wall. Does not edit
 * entrance-motion.js / arrival.js — clamps and replaces poses in setup-camera.
 * Lazy under js/data/ (sw.js stamps ^js/data/) with garage-entry-camera.js via
 * LazyBundles.ensureGarageData / ensureCameraOptions. */
const GarageCameraOptions = (function () {
  "use strict";

  const STORE_KEY = "garageCamera";

  // Bay shell (arrival.js / scene.js): side walls ±5.4 m, back −6.4, door +6.4.
  // Eyes stay short of the door plane so a side wall is never culled mid-shot.
  const BAY = Object.freeze({
    xMin: -5.2, xMax: 5.2,
    yMin: 0.3, yMax: 3.6,
    zMin: -6.2, zMaxInside: 6.05, zMaxDoor: 6.35,
    // Door jamb posts (~±1.0 at the shutter). Eyes inside the post paint black.
    jambX: 1.15, jambZ: 4.6, jambClear: 0.55,
  });

  // Minimum eye→subject distance so crew / bodywork never sit on the near plane.
  const NEAR_PLANE = 1.85;
  // Soften a hard cut when the authored eye jumps more than this in one frame.
  const CUT_SOFT_M = 2.2;
  // Look-yaw flip past this (radians) is a 180°-axis cut — refuse a hard jump.
  const CUT_AXIS_RAD = 100 * Math.PI / 180;
  // Car yaw change past this between frames = mid-turn: hold the current eye.
  const MID_TURN_RAD = 0.08;

  // Turntable / inspection presets (az / el / dist) — also chips in #cs-cam-panel.
  const VIEW_PRESETS = Object.freeze({
    insideBay: Object.freeze({ label: "INSIDE", az: Math.PI * 0.72, el: 0.28, dist: 7.2, maxDist: 7.4 }),
    doorway: Object.freeze({ label: "DOOR", az: Math.PI * 0.08, el: 0.22, dist: 6.0, maxDist: 6.2, orbit: [0, 0.7, 2.5], tgt: [0, 0.55, 0.2] }),
    lowFront: Object.freeze({ label: "LOW", az: 0.12, el: 0.06, dist: 5.2, maxDist: 5.4, orbit: [0, 0.35, 1.8], tgt: [0, 0.3, 1.2] }),
    cockpit: Object.freeze({ label: "COCKPIT", az: 0.05, el: 0.18, dist: 2.4, maxDist: 2.6, minDist: 1.2, orbit: [0, 0.95, 0.1], tgt: [0, 0.85, 1.2] }),
    overhead: Object.freeze({ label: "TOP BAY", az: Math.PI * 0.5, el: 1.15, dist: 8.5, maxDist: 8.8 }),
    orbit: Object.freeze({ label: "ORBIT", az: Math.PI * 0.55, el: 0.32, dist: 7.6, maxDist: 7.8 }),
    pitWall: Object.freeze({ label: "PIT WALL", az: Math.PI * 0.22, el: 0.2, dist: 6.8, maxDist: 7.0, orbit: [2.2, 0.7, 3.5], tgt: [0, 0.55, 0.2] }),
  });

  // Arrival sequence shot ids (paths in GarageEntryCameraData when loaded).
  const SHOT_IDS = Object.freeze(["insideBay", "doorway", "lowFront", "cockpit", "overhead", "orbit", "pitWall", "facade"]);
  const SHOT_LABEL = Object.freeze({
    insideBay: "INSIDE BAY",
    doorway: "DOORWAY",
    lowFront: "LOW FRONT",
    cockpit: "COCKPIT",
    overhead: "OVERHEAD",
    orbit: "ORBIT",
    pitWall: "PIT WALL",
    facade: "OUTSIDE FACADE",
  });

  // STYLE ids already owned by GarageArrival.STYLES — map each to a safe default
  // shot so Showcase / Cinema / crane-orbit-dolly never open inside a jamb.
  const STYLE_IDS = Object.freeze(["broadcast", "cinema", "documentary", "showcase", "nightshift"]);
  const STYLE_SHOT = Object.freeze({
    broadcast: "insideBay",
    cinema: "insideBay",
    documentary: "doorway",
    showcase: "doorway",
    nightshift: "insideBay",
  });

  // GARAGE ANGLE eyes (arrival.js CAMS / cut / custom / rear) — distinct and
  // car-framed early. Custom without edits must not equal cut.
  // [ex,ey,ez, ax,ay,az, fov]
  const ANGLE_FRAME = Object.freeze({
    cut: Object.freeze([-3.4, 2.15, -3.6, 0.2, 0.65, 2.5, 54]),
    left: Object.freeze([-4.2, 2.05, -2.0, 0.4, 0.6, 1.5, 52]),
    right: Object.freeze([4.0, 2.15, -2.2, -0.3, 0.6, 1.5, 52]),
    high: Object.freeze([-2.8, 3.35, -4.0, 0.0, 0.45, 1.0, 50]),
    low: Object.freeze([2.2, 0.55, -2.5, 0.0, 0.4, 1.2, 56]),
    door: Object.freeze([-0.55, 2.15, 5.85, 0.0, 0.9, 1.5, 54]),
    rear: Object.freeze([0.2, 1.9, -5.4, 0.0, 0.7, 2.0, 52]),
    custom: Object.freeze([-1.6, 1.7, 4.2, 0.3, 0.55, 0.5, 56]),
    director: Object.freeze([-3.0, 2.3, -1.0, 0.2, 0.65, 3.0, 54]),
    crane: Object.freeze([-2.2, 3.2, -3.0, 0.0, 0.5, 1.5, 48]),
    orbit: Object.freeze([-3.6, 2.1, 0.5, 0.0, 0.55, 0.5, 50]),
    dolly: Object.freeze([0.0, 1.6, 5.4, 0.0, 0.7, 0.0, 52]),
    steadicam: Object.freeze([-2.0, 1.55, 2.0, 0.3, 0.6, 2.5, 54]),
  });

  const DEFAULT = Object.freeze({
    entryShot: "insideBay",
    exitShot: "doorway",
    stayInside: true,
    style: null,
  });

  const clamp = M4.clamp;   // eval-time read: js/core/mat4.js loads before every data file

  /** Keep an eye inside the bay, or (doorwayOk) in the door aperture — never past z 6.35 into the pit lane. */
  function clampEye(eye, doorwayOk) {
    if (!eye || eye.length < 3) return eye;
    const zMax = doorwayOk ? BAY.zMaxDoor : BAY.zMaxInside;
    eye[0] = clamp(eye[0], BAY.xMin, BAY.xMax);
    eye[1] = clamp(eye[1], BAY.yMin, BAY.yMax);
    eye[2] = clamp(eye[2], BAY.zMin, zMax);
    return eye;
  }

  /** Push the eye out of the door jamb posts (black 3–9 s clips). */
  function clearJamb(eye) {
    if (!eye || eye.length < 3) return eye;
    if (eye[2] < BAY.jambZ) return eye;
    const ax = Math.abs(eye[0]);
    if (ax < BAY.jambX + BAY.jambClear && ax > BAY.jambX - BAY.jambClear) {
      // Slide toward bay centre or outward past the post — prefer centre (inside look).
      const sign = eye[0] >= 0 ? 1 : -1;
      eye[0] = sign * Math.max(0, BAY.jambX - BAY.jambClear - 0.05);
    }
    // Prefer a clean doorway line: if still in the aperture plane, nudge z back.
    if (Math.abs(eye[0]) < BAY.jambX && eye[2] > 6.15) eye[2] = 6.05;
    return eye;
  }

  /** True when the eye has left the room (through a side wall or past the door into the lane). */
  function outsideBay(eye) {
    if (!eye || eye.length < 3 || !eye.every(Number.isFinite)) return true;
    return eye[0] < BAY.xMin - 0.05 || eye[0] > BAY.xMax + 0.05
      || eye[1] < BAY.yMin - 0.05 || eye[1] > BAY.yMax + 0.05
      || eye[2] < BAY.zMin - 0.05 || eye[2] > BAY.zMaxDoor + 0.05;
  }

  /** True when the eye sits inside a jamb post volume. */
  function inJamb(eye) {
    if (!eye || eye.length < 3) return false;
    if (eye[2] < BAY.jambZ) return false;
    const ax = Math.abs(eye[0]);
    return ax > BAY.jambX - BAY.jambClear && ax < BAY.jambX + BAY.jambClear;
  }

  // PER MOMENT (#4745): own BAY CAMERA + STAY INSIDE, else ENTRY (pitIn, home) / EXIT (start, pitOut).
  const MOMENT_IDS = Object.freeze(["start", "pitIn", "pitOut", "home"]);
  const MOMENT_EXIT = Object.freeze({ start: true, pitOut: true });
  function settings(value) {
    const v = value && typeof value === "object" ? value : {};
    const shot = (id, fallback) => (SHOT_IDS.includes(id) ? id : fallback);
    const out = {
      entryShot: shot(v.entryShot, DEFAULT.entryShot),
      exitShot: shot(v.exitShot, DEFAULT.exitShot),
      stayInside: v.stayInside !== false,
      style: STYLE_IDS.includes(v.style) ? v.style : null,
    };
    const ms = {};
    if (v.moments && typeof v.moments === "object") {
      for (const m of MOMENT_IDS) {
        const e = v.moments[m];
        if (e && typeof e === "object" && SHOT_IDS.includes(e.shot)) ms[m] = { shot: e.shot, stayInside: e.stayInside !== false };
      }
    }
    if (Object.keys(ms).length) out.moments = ms;
    return out;
  }
  /** A moment's { shot, stayInside, own }: its own pick, else the shared ENTRY / EXIT one. */
  function forMoment(opts, moment, dir) {
    const cfg = settings(opts), own = moment && cfg.moments && cfg.moments[moment];
    if (own) return { shot: own.shot, stayInside: own.stayInside, own: true };
    const exit = moment ? !!MOMENT_EXIT[moment] : dir === "out";
    return { shot: exit ? cfg.exitShot : cfg.entryShot, stayInside: cfg.stayInside, own: false };
  }

  function read(store) {
    return settings(store && store.get ? store.get(STORE_KEY, null) : null);
  }

  function write(store, value) {
    if (!store || !store.set) return settings(value);
    const next = settings(value);
    store.set(STORE_KEY, next);
    return next;
  }

  function pathTable() {
    return typeof GarageEntryCameraData !== "undefined" && GarageEntryCameraData && GarageEntryCameraData.paths
      ? GarageEntryCameraData.paths : null;
  }

  function samplePath(shotId, dir, u) {
    const paths = pathTable();
    const path = paths && paths[shotId];
    if (!path) return null;
    const rows = path[dir === "out" ? "out" : "in"] || path.in;
    if (!rows || rows.length < 2) return null;
    const n = rows.length;
    const f = clamp(Number.isFinite(u) ? u : 0, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f)), k = f - i;
    const a = rows[i], b = rows[i + 1], out = [0, 0, 0, 0, 0, 0, 0];
    for (let c = 0; c < 7; c++) out[c] = a[c] + (b[c] - a[c]) * k;
    const eye = [out[0], out[1], out[2]];
    clearJamb(eye);
    clampEye(eye, shotId === "doorway" || shotId === "pitWall");
    return {
      eye,
      aim: [out[3], out[4], out[5]],
      fov: out[6] / 10,
    };
  }

  function shotForDir(opts, dir) {
    if (dir === "out") return opts.exitShot;
    return opts.entryShot;
  }

  /** Prefer the player's shot; otherwise the style's safe default (Showcase → doorway). */
  function resolveShot(opts, dir, moment) {
    const mo = moment ? forMoment(opts, moment, dir) : null;
    const shot = mo ? mo.shot : shotForDir(opts, dir);
    if ((mo && mo.own) || (shot !== DEFAULT.entryShot && shot !== DEFAULT.exitShot)) return shot;
    if (opts.style && STYLE_SHOT[opts.style]) return STYLE_SHOT[opts.style];
    return shot;
  }

  /** Keep the lens ≥ NEAR_PLANE from the car (or aim) so crew never fill the near plane. */
  function enforceNearPlane(pose) {
    if (!pose || !pose.eye) return pose;
    const eye = pose.eye;
    const ax = Number.isFinite(pose.x) ? pose.x : (pose.aim ? pose.aim[0] : 0);
    const ay = pose.aim ? pose.aim[1] : 0.6;
    const az = Number.isFinite(pose.z) ? pose.z : (pose.aim ? pose.aim[2] : 0);
    const dx = eye[0] - ax, dy = eye[1] - ay, dz = eye[2] - az;
    const d = Math.hypot(dx, dy, dz);
    if (d > 1e-4 && d < NEAR_PLANE) {
      const s = NEAR_PLANE / d;
      eye[0] = ax + dx * s;
      eye[1] = ay + dy * s;
      eye[2] = az + dz * s;
    }
    return pose;
  }

  /** Amplify barely-visible height / move / final-shot zoom from garageArrival cfg. */
  function amplifyLook(pose, arrival, u) {
    if (!pose || !pose.eye || !arrival) return pose;
    const k = clamp(Number.isFinite(u) ? u : 0, 0, 1);
    const ease = k * k * (3 - 2 * k);
    // Height: arrival applies 1:1 metres; boost so ±0.5 reads on phone landscape.
    const h = Number(arrival.height) || 0;
    if (h) pose.eye[1] = clamp(pose.eye[1] + h * 0.65, BAY.yMin, BAY.yMax);
    // Push / pull / drift: arrival MOVE_M is 1.2 m — add another half metre along aim.
    const move = arrival.move;
    if (move && move !== "still" && pose.aim) {
      const dx = pose.aim[0] - pose.eye[0], dy = pose.aim[1] - pose.eye[1], dz = pose.aim[2] - pose.eye[2];
      const n = Math.hypot(dx, dy, dz) || 1;
      const extra = 0.9 * ease;
      if (move === "drift") {
        const hxz = Math.hypot(dx, dz) || 1;
        pose.eye[0] += -dz / hxz * extra * (ease - 0.5) * 2;
        pose.eye[2] += dx / hxz * extra * (ease - 0.5) * 2;
      } else {
        const s = move === "push" ? extra : -extra;
        pose.eye[0] += dx / n * s; pose.eye[1] += dy / n * s; pose.eye[2] += dz / n * s;
      }
    }
    // FINAL SHOT ZOOM: arrival only eases on look.last; force a readable close for zoom≥12.
    const zoom = Number(arrival.zoom) || 0;
    if (zoom > 0 && k > 0.55 && Number.isFinite(pose.fov)) {
      const pull = zoom * ease * (zoom >= 12 ? 1.15 : 0.85);
      pose.fov = Math.max(22, pose.fov - pull);
    }
    return pose;
  }

  let _prevEye = null;
  let _prevAim = null;
  let _prevYaw = null;
  let _cutBlend = 0;   // >0 while a soft cut is still settling

  function lookYaw(eye, aim) {
    if (!eye || !aim) return 0;
    return Math.atan2(aim[0] - eye[0], aim[2] - eye[2]);
  }

  function yawDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function blendVec(dst, from, to, a) {
    dst[0] = from[0] + (to[0] - from[0]) * a;
    dst[1] = from[1] + (to[1] - from[1]) * a;
    dst[2] = from[2] + (to[2] - from[2]) * a;
  }

  /**
   * Soften a hard cut (Broadcast exit ~11 s). Also refuses a cut while the car
   * is mid-turn, and softens / holds a jump that flips look yaw across the
   * ~180° axis (left↔right line-of-action).
   */
  function softenCut(pose) {
    if (!pose || !pose.eye) return pose;
    const e = pose.eye;
    const aim = pose.aim;
    const yawNow = Number.isFinite(pose.yaw) ? pose.yaw : null;
    if (_prevEye) {
      const jump = Math.hypot(e[0] - _prevEye[0], e[1] - _prevEye[1], e[2] - _prevEye[2]);
      const dyawLook = (aim && _prevAim)
        ? Math.abs(yawDelta(lookYaw(_prevEye, _prevAim), lookYaw(e, aim)))
        : 0;
      const crossesAxis = dyawLook > CUT_AXIS_RAD;
      const midTurn = _prevYaw != null && yawNow != null
        && Math.abs(yawDelta(_prevYaw, yawNow)) > MID_TURN_RAD;
      const midBlend = _cutBlend > 0.08;

      // Mid-turn or still settling a prior soft cut: do not accept a new hard jump.
      if ((midTurn || midBlend) && (jump > CUT_SOFT_M * 0.5 || crossesAxis)) {
        e[0] = _prevEye[0]; e[1] = _prevEye[1]; e[2] = _prevEye[2];
        if (aim && _prevAim) {
          aim[0] = _prevAim[0]; aim[1] = _prevAim[1]; aim[2] = _prevAim[2];
        }
        _cutBlend = Math.max(0, _cutBlend - 0.12);
        if (yawNow != null) _prevYaw = yawNow;
        return pose;
      }

      if (jump > CUT_SOFT_M || crossesAxis) {
        // Axis-crossing cuts ease in more slowly so the picture never flips sides
        // in one frame; ordinary large jumps keep the prior 0.45 soften.
        const a = crossesAxis ? 0.22 : 0.45;
        const toEye = [e[0], e[1], e[2]];
        blendVec(e, _prevEye, toEye, a);
        if (aim && _prevAim) {
          const toAim = [aim[0], aim[1], aim[2]];
          blendVec(aim, _prevAim, toAim, a);
        }
        _cutBlend = 1 - a;
      } else {
        _cutBlend = Math.max(0, _cutBlend - 0.18);
      }
    }
    _prevEye = [e[0], e[1], e[2]];
    if (aim) _prevAim = [aim[0], aim[1], aim[2]];
    if (yawNow != null) _prevYaw = yawNow;
    return pose;
  }

  /**
   * Override / clamp an arrival pose in place. Called from setup-camera after
   * GarageArrival.pose* — never mutates arrival.js itself.
   * @param {*} pose arrival pose with eye/aim/fov
   * @param {*} opts settings()
   * @param {{dir?: string, u?: number, arrival?: object}} meta sequence + garageArrival cfg
   */
  function applyArrival(pose, opts, meta) {
    if (!pose || !pose.eye) return pose;
    const dir = meta && meta.dir === "out" ? "out" : (pose.direction === "out" || pose.sequence === "out" ? "out" : "in");
    const moment = meta && MOMENT_IDS.includes(meta.moment) ? meta.moment : null;
    const cfg = Object.assign(settings(opts), { stayInside: moment ? forMoment(opts, moment, dir).stayInside : settings(opts).stayInside });
    const shot = resolveShot(cfg, dir, moment);
    const doorwayOk = shot === "doorway" || shot === "pitWall" || shot === "facade"
      || pose.camera === "door" || pose.camera === "dolly";
    // Facade: allow the authored outside look only when the player asked for it
    // and stayInside is off. Default stayInside refuses it.
    if (shot === "facade" && !cfg.stayInside) {
      // Outside facade is intentional — do not soften against an earlier inside eye.
      _prevEye = [pose.eye[0], pose.eye[1], pose.eye[2]];
      _prevAim = pose.aim ? [pose.aim[0], pose.aim[1], pose.aim[2]] : null;
      _prevYaw = Number.isFinite(pose.yaw) ? pose.yaw : null;
      _cutBlend = 0;
      return pose;
    }
    const u = meta && Number.isFinite(meta.u) ? meta.u
      : (Number.isFinite(pose.seconds) && Number.isFinite(pose.end) && pose.end > 0 ? pose.seconds / pose.end : 0);
    if (u < 0.1) {   // new preview / early beat — do not soften across shows
      _prevEye = null; _prevAim = null; _prevYaw = null; _cutBlend = 0;
    }

    // Early sequence: if the authored / rig eye is in a jamb or outside, replace
    // with our path (or the angle's distinct frame) so Showcase/Cinema open clean.
    const jambOrOut = cfg.stayInside && (outsideBay(pose.eye) || inJamb(pose.eye));
    const usePath = shot !== "facade" && (jambOrOut || u < 0.92);
    if (usePath) {
      const sample = samplePath(shot, dir, u);
      if (sample) {
        pose.eye[0] = sample.eye[0]; pose.eye[1] = sample.eye[1]; pose.eye[2] = sample.eye[2];
        if (pose.aim) { pose.aim[0] = sample.aim[0]; pose.aim[1] = sample.aim[1]; pose.aim[2] = sample.aim[2]; }
        if (Number.isFinite(sample.fov)) pose.fov = sample.fov;
        pose.cameraOption = shot;
      }
    }

    // Distinct ANGLE framing for cut/left/right/high/custom/rear/rig ids — car
    // visible sooner; custom ≠ cut when shots were never edited.
    const cam = pose.camera || (meta && meta.arrival && meta.arrival.angle);
    if (cam && ANGLE_FRAME[cam] && u < 0.55 && (jambOrOut || cam === "custom" || cam === "cut"
        || cam === "left" || cam === "right" || cam === "high" || cam === "rear"
        || cam === "crane" || cam === "orbit" || cam === "dolly" || cam === "steadicam")) {
      // Blend toward the angle frame so the car fills earlier without a snap.
      const f = ANGLE_FRAME[cam];
      const w = 1 - clamp(u / 0.55, 0, 1);
      const blend = 0.35 + 0.55 * w;
      pose.eye[0] += (f[0] - pose.eye[0]) * blend;
      pose.eye[1] += (f[1] - pose.eye[1]) * blend;
      pose.eye[2] += (f[2] - pose.eye[2]) * blend;
      if (pose.aim) {
        pose.aim[0] += (f[3] - pose.aim[0]) * blend;
        pose.aim[1] += (f[4] - pose.aim[1]) * blend;
        pose.aim[2] += (f[5] - pose.aim[2]) * blend;
      }
      if (Number.isFinite(f[6]) && Number.isFinite(pose.fov)) pose.fov += (f[6] - pose.fov) * blend * 0.5;
      pose.cameraOption = pose.cameraOption || cam;
    }

    amplifyLook(pose, meta && meta.arrival, u);
    if (cfg.stayInside || shot !== "facade") {
      clearJamb(pose.eye);
      clampEye(pose.eye, doorwayOk);
    }
    enforceNearPlane(pose);
    if (cfg.stayInside || shot !== "facade") {
      clearJamb(pose.eye);
      clampEye(pose.eye, doorwayOk);
    }
    return softenCut(pose);
  }

  /** Cap an orbit distance so the eye at (az,el) around center stays inside the bay. */
  function maxDistInside(az, el, center, doorwayOk) {
    const c = center || [0, 0.45, 0.245];
    const ce = Math.cos(el), se = Math.sin(el);
    const zMax = doorwayOk ? BAY.zMaxDoor : BAY.zMaxInside;
    let maxD = 20;
    const sx = Math.sin(az) * ce, sz = Math.cos(az) * ce;
    if (Math.abs(sx) > 1e-4) {
      const lim = sx > 0 ? (BAY.xMax - c[0]) / sx : (BAY.xMin - c[0]) / sx;
      if (lim > 0) maxD = Math.min(maxD, lim);
    }
    if (Math.abs(se) > 1e-4) {
      const lim = se > 0 ? (BAY.yMax - c[1]) / se : (BAY.yMin - c[1]) / se;
      if (lim > 0) maxD = Math.min(maxD, lim);
    }
    if (Math.abs(sz) > 1e-4) {
      const lim = sz > 0 ? (zMax - c[2]) / sz : (BAY.zMin - c[2]) / sz;
      if (lim > 0) maxD = Math.min(maxD, lim);
    }
    return Math.max(2.5, maxD - 0.15);
  }

  function viewPreset(name) {
    return Object.prototype.hasOwnProperty.call(VIEW_PRESETS, name) ? VIEW_PRESETS[name] : null;
  }

  // ---- UI (injected: index.html is shrink-only) ----
  let _bound = false, _paint = null;
  function copyMoment(store, from) { // COPY TO ALL
    const cur = read(store), v = forMoment(cur, from), moments = {};
    for (const m of MOMENT_IDS) moments[m] = { shot: v.shot, stayInside: v.stayInside };
    return write(store, Object.assign(cur, { moments }));
  }
  function resetMoment(store, m) { // RESET
    const cur = read(store);
    if (cur.moments) delete cur.moments[m];
    return write(store, cur);
  }
  function bindUi($, store, hooks) {
    if (_bound || typeof document === "undefined" || !$) return false;
    const onChange = hooks && typeof hooks.onChange === "function" ? hooks.onChange : null;
    const onView = hooks && typeof hooks.onView === "function" ? hooks.onView : null;
    const rows = $("ga-rows");
    const camPanel = $("cs-cam-panel");
    if (!rows && !camPanel) return false;
    _bound = true;

    function save(partial) {
      const cur = read(store);
      const next = write(store, Object.assign({}, cur, partial || {}));
      paint();
      if (onChange) onChange(next);
      return next;
    }
    // The moment the GARAGE ENTER & LEAVE tabs picked (GarageArrival writes #garrival[data-moment]).
    const momentNow = () => {
      const root = $("garrival"), m = root && root.getAttribute ? root.getAttribute("data-moment") : null;
      return MOMENT_IDS.includes(m) ? m : "start";
    };
    function saveMoment(partial) {
      const cur = read(store), m = momentNow(), ms = Object.assign({}, cur.moments || {});
      ms[m] = Object.assign({}, forMoment(cur, m), partial);
      return save({ moments: ms });
    }

    // GARRIVAL: ENTRY / EXIT shot pickers + stay-inside, after STYLE or at top.
    if (rows && !$("ga-cam-options")) {
      const box = document.createElement("div");
      box.id = "ga-cam-options";
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Entry and exit cameras");
      const help = document.createElement("p");
      help.className = "adv-help";
      help.textContent = "BAY CAMERA: where the lens sits for the moment picked at the top (each of the four keeps its own). INSIDE BAY is the default — the lens never backs through a wall. DOORWAY keeps a clean line through the shutter. OUTSIDE FACADE is the intentional pit-lane look (turns Stay inside off).";
      box.appendChild(help);

      const mkSelect = (id, label, ids) => {
        const row = document.createElement("div");
        row.className = "set-row";
        const lab = document.createElement("label");
        lab.className = "tune-label";
        lab.htmlFor = id;
        lab.textContent = label;
        const cell = document.createElement("div");
        const sel = document.createElement("select");
        sel.id = id;
        for (const sid of ids) {
          const o = document.createElement("option");
          o.value = sid;
          o.textContent = SHOT_LABEL[sid] || sid;
          sel.appendChild(o);
        }
        cell.appendChild(sel);
        row.appendChild(lab);
        row.appendChild(cell);
        return { row, sel };
      };
      const bay = mkSelect("ga-bay-shot", "BAY CAMERA", SHOT_IDS);
      box.appendChild(bay.row);

      const stayRow = document.createElement("div");
      stayRow.className = "set-row";
      const stayLab = document.createElement("label");
      stayLab.className = "tune-label";
      stayLab.htmlFor = "ga-stay-inside";
      stayLab.textContent = "STAY INSIDE BAY";
      const stayCell = document.createElement("div");
      const stay = document.createElement("input");
      stay.type = "checkbox";
      stay.id = "ga-stay-inside";
      stay.checked = true;
      stayCell.appendChild(stay);
      stayRow.appendChild(stayLab);
      stayRow.appendChild(stayCell);
      box.appendChild(stayRow);

      // Prefer after STYLE bar; else before PLAY ANIMATIONS.
      const styleBar = $("ga-styles");
      const enabled = $("ga-enabled");
      const anchor = styleBar || (enabled && enabled.closest ? enabled.closest(".set-row") : null);
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, styleBar ? styleBar.nextSibling : anchor);
      else rows.insertBefore(box, rows.firstChild);

      bay.sel.onchange = () => { const v = bay.sel.value; saveMoment({ shot: v, stayInside: v !== "facade" }); };
      stay.onchange = () => saveMoment({ stayInside: stay.checked });
    }

    // Shorten DIRECTOR's label for the 12rem select.
    const angleSel = $("ga-angle");
    if (angleSel) {
      for (const o of angleSel.options || []) {
        if (o.value === "director" && /THREE CAMERAS/i.test(o.textContent || "")) {
          o.textContent = "DIRECTOR · 3 CAMS";
        }
      }
    }

    // CAMERA PANEL: BAY row of inspection presets.
    if (camPanel && !$("cs-bay-views")) {
      const lbl = document.createElement("span");
      lbl.className = "cs-pan-lbl";
      lbl.setAttribute("aria-hidden", "true");
      lbl.textContent = "BAY";
      const group = document.createElement("div");
      group.id = "cs-bay-views";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Bay camera presets");
      for (const id of Object.keys(VIEW_PRESETS)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cs-view-btn";
        b.dataset.csBayView = id;
        b.title = SHOT_LABEL[id] || VIEW_PRESETS[id].label;
        b.textContent = VIEW_PRESETS[id].label;
        b.onclick = () => {
          if (onView) onView(id, VIEW_PRESETS[id]);
          if (typeof GameAudio !== "undefined" && GameAudio.uiTick) {
            try { GameAudio.uiTick(); } catch (_) { /* ignore */ }
          }
        };
        group.appendChild(b);
      }
      const wrap = document.createElement("div");
      wrap.appendChild(lbl);
      wrap.appendChild(group);
      const first = camPanel.firstElementChild;
      if (first && first.nextSibling) camPanel.insertBefore(wrap, first.nextSibling);
      else camPanel.appendChild(wrap);
    }

    function paint() {
      const v = forMoment(read(store), momentNow());
      const b = $("ga-bay-shot"), s = $("ga-stay-inside");
      if (b) b.value = v.shot;
      if (s) s.checked = v.stayInside;
    }
    _paint = paint;
    paint();
    return true;
  }

  return Object.freeze({
    STORE_KEY, BAY, VIEW_PRESETS, SHOT_IDS, SHOT_LABEL, STYLE_IDS, STYLE_SHOT, ANGLE_FRAME, DEFAULT,
    NEAR_PLANE,
    MOMENT_IDS, forMoment, copyMoment, resetMoment, refreshUi: () => { if (_paint) _paint(); },
    settings, read, write, clampEye, clearJamb, outsideBay, inJamb, maxDistInside,
    samplePath, applyArrival, viewPreset, bindUi, pathTable, enforceNearPlane,
  });
})();
Object.freeze(GarageCameraOptions);
