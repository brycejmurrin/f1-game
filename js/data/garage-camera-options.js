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

  function settings(value) {
    const v = value && typeof value === "object" ? value : {};
    const shot = (id, fallback) => (SHOT_IDS.includes(id) ? id : fallback);
    return {
      entryShot: shot(v.entryShot, DEFAULT.entryShot),
      exitShot: shot(v.exitShot, DEFAULT.exitShot),
      stayInside: v.stayInside !== false,
      style: STYLE_IDS.includes(v.style) ? v.style : null,
    };
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
  function resolveShot(opts, dir) {
    const shot = shotForDir(opts, dir);
    if (shot !== DEFAULT.entryShot && shot !== DEFAULT.exitShot) return shot;
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

  /** Soften a hard cut (Broadcast exit ~11 s) by blending a large eye jump. */
  function softenCut(pose) {
    if (!pose || !pose.eye) return pose;
    const e = pose.eye;
    if (_prevEye) {
      const jump = Math.hypot(e[0] - _prevEye[0], e[1] - _prevEye[1], e[2] - _prevEye[2]);
      if (jump > CUT_SOFT_M) {
        const a = 0.45;
        e[0] = _prevEye[0] + (e[0] - _prevEye[0]) * a;
        e[1] = _prevEye[1] + (e[1] - _prevEye[1]) * a;
        e[2] = _prevEye[2] + (e[2] - _prevEye[2]) * a;
      }
    }
    _prevEye = [e[0], e[1], e[2]];
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
    const cfg = settings(opts);
    const dir = meta && meta.dir === "out" ? "out" : (pose.direction === "out" || pose.sequence === "out" ? "out" : "in");
    const shot = resolveShot(cfg, dir);
    const doorwayOk = shot === "doorway" || shot === "pitWall" || shot === "facade"
      || pose.camera === "door" || pose.camera === "dolly";
    // Facade: allow the authored outside look only when the player asked for it
    // and stayInside is off. Default stayInside refuses it.
    if (shot === "facade" && !cfg.stayInside) {
      // Outside facade is intentional — do not soften against an earlier inside eye.
      _prevEye = [pose.eye[0], pose.eye[1], pose.eye[2]];
      return pose;
    }
    const u = meta && Number.isFinite(meta.u) ? meta.u
      : (Number.isFinite(pose.seconds) && Number.isFinite(pose.end) && pose.end > 0 ? pose.seconds / pose.end : 0);
    if (u < 0.1) _prevEye = null;   // new preview / early beat — do not soften across shows

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
  let _bound = false;
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

    // GARRIVAL: ENTRY / EXIT shot pickers + stay-inside, after STYLE or at top.
    if (rows && !$("ga-cam-options")) {
      const box = document.createElement("div");
      box.id = "ga-cam-options";
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Entry and exit cameras");
      const help = document.createElement("p");
      help.className = "adv-help";
      help.textContent = "ENTRY / EXIT CAMERA: where the lens sits during PREVIEW PIT STOP and PREVIEW RACE START. INSIDE BAY is the default — the lens never backs through a wall. DOORWAY keeps a clean line through the shutter. OUTSIDE FACADE is the intentional pit-lane look (turns Stay inside off).";
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
      const entry = mkSelect("ga-entry-shot", "ENTRY CAMERA", SHOT_IDS);
      const exit = mkSelect("ga-exit-shot", "EXIT CAMERA", SHOT_IDS);
      box.appendChild(entry.row);
      box.appendChild(exit.row);

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

      entry.sel.onchange = () => {
        const v = entry.sel.value;
        save({ entryShot: v, stayInside: v !== "facade" });
      };
      exit.sel.onchange = () => save({ exitShot: exit.sel.value });
      stay.onchange = () => save({ stayInside: stay.checked });
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
      const v = read(store);
      const e = $("ga-entry-shot"), x = $("ga-exit-shot"), s = $("ga-stay-inside");
      if (e) e.value = v.entryShot;
      if (x) x.value = v.exitShot;
      if (s) s.checked = v.stayInside;
    }
    paint();
    return true;
  }

  return Object.freeze({
    STORE_KEY, BAY, VIEW_PRESETS, SHOT_IDS, SHOT_LABEL, STYLE_IDS, STYLE_SHOT, ANGLE_FRAME, DEFAULT,
    NEAR_PLANE,
    settings, read, write, clampEye, clearJamb, outsideBay, inJamb, maxDistInside,
    samplePath, applyArrival, viewPreset, bindUi, pathTable, enforceNearPlane,
  });
})();
Object.freeze(GarageCameraOptions);
