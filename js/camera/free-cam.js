"use strict";
/* Apex 26 — the FREE CAMERA pause-menu panel (#freecam): photo mode's fly-cam (js/camera/photo-cam.js) as a first-class tool, with a speed dial, roll, FOV, snaps to the car and to each corner, a RACE/FLYBY lens, and COPY as an __apex.view() line or as a flyby pose (FlybySeq.shotFromView). */
const FreeCam = (function () {

// ---- pure camera maths -----------------------------------------------------
//
// Everything in this block is data in, data out — no DOM, no G. It is the half
// tests/unit/free-cam.test.mjs holds without booting the game.

const SPD_MIN = 5, SPD_MAX = 200, SPD_DEF = 34;   // m/s; 34 is photo mode's walk
const BOOST = 95 / 34;                             // Shift, photo mode's ratio
const ROLL_MAX = 45;                               // degrees either way
const ROLL_RATE = 40;                              // deg/s while Q/E is held
const WHEEL_STEP = 1.15;                           // one wheel notch of speed
const SLIDER_MAX = 1000;
const FOV_MIN = 20, FOV_MAX = 110;                 // photo mode's #pc-fov range

const clamp = M4.clamp;   // js/core/mat4.js — the shared one
const fin = (v) => typeof v === "number" && isFinite(v);

/** The SPEED slider is logarithmic: 0 -> 5 m/s, 1000 -> 200 m/s. A linear
 *  5-200 slider spends its first centimetre on everything that frames a car. */
function speedFromSlider(v) {
  const t = clamp(fin(+v) ? +v : 0, 0, SLIDER_MAX) / SLIDER_MAX;
  return SPD_MIN * Math.pow(SPD_MAX / SPD_MIN, t);
}
function sliderFromSpeed(s) {
  const c = clampSpeed(s);
  return Math.round(SLIDER_MAX * Math.log(c / SPD_MIN) / Math.log(SPD_MAX / SPD_MIN));
}
function clampSpeed(s) { return clamp(fin(+s) ? +s : SPD_DEF, SPD_MIN, SPD_MAX); }
/** One wheel event: up (deltaY < 0) is faster. */
function wheelSpeed(s, deltaY) {
  if (!deltaY) return clampSpeed(s);
  return clampSpeed(clampSpeed(s) * (deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP));
}
/** Roll in DEGREES, clamped to ±ROLL_MAX; anything unparseable is level. */
function clampRoll(deg) { return clamp(fin(+deg) ? +deg : 0, -ROLL_MAX, ROLL_MAX); }
function clampFov(f) { return clamp(fin(+f) ? +f : 60, FOV_MIN, FOV_MAX); }

const r2 = (n) => Math.round(n * 100) / 100;
const v3 = (a) => "[" + r2(a[0]) + "," + r2(a[1]) + "," + r2(a[2]) + "]";
/** The line COPY VIEW puts on the clipboard: pasted into a console on the same
 *  circuit, it frames exactly this picture through the documented dev hook. */
function viewSnippet(eye, target, fov) {
  return "__apex.view({eye:" + v3(eye) + ",target:" + v3(target) + ",fov:" + r2(fov) + "})";
}

/** Photo mode's look convention (js/camera/photo-cam.js updatePhotoCam):
 *  fwd = [sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)]. */
function aim(eye, target) {
  let dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  return { yaw: Math.atan2(dx, -dz), pitch: clamp(Math.asin(clamp(dy, -1, 1)), -1.45, 1.45) };
}

const CAR_BACK = 9, CAR_UP = 3.2, CAR_AHEAD = 14, CAR_LOOK_UP = 1;
/** A chase-style framing of a car at world (px, pz), heading `head`
 *  (c.head = atan2(t.x, t.z), so forward is [sin head, cos head]), road at y. */
function carPose(car, y) {
  const fx = Math.sin(car.head || 0), fz = Math.cos(car.head || 0);
  return {
    eye: [car.px - fx * CAR_BACK, y + CAR_UP, car.pz - fz * CAR_BACK],
    target: [car.px + fx * CAR_AHEAD, y + CAR_LOOK_UP, car.pz + fz * CAR_AHEAD],
  };
}

const CN_OUT = 30, CN_BACK = 18, CN_UP = 9;
/** Corner n (1-based, wrapped into the circuit's own count) seen from its
 *  OUTSIDE, a little before the apex, looking at the apex. Reads the same
 *  corner list the flyby sequencer and the picker's map use. */
function cornerPose(track, n) {
  FlybySeq.cornerS(track, 1);                     // fills track._fbCorners
  const count = (track._fbCorners || []).length;
  if (!count) return null;
  const k = ((((n | 0) - 1) % count) + count) % count + 1;
  const s = FlybySeq.cornerS(track, k), side = FlybySeq.cornerSide(track, k) || 1;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  Tracks.sample(track, s, smp);
  const p = smp.p, r = smp.r, t = smp.t;
  return {
    n: k, count,
    eye: [p[0] + r[0] * side * CN_OUT - t[0] * CN_BACK, p[1] + CN_UP, p[2] + r[2] * side * CN_OUT - t[2] * CN_BACK],
    target: [p[0], p[1] + 1, p[2]],
  };
}

/** A pose from FlybySeq.poseFromWorld as a short human line. */
function anchorText(pose) {
  if (!pose) return "—";
  const sg = (v) => (v >= 0 ? "+" : "") + r2(v || 0);
  switch (pose.at) {
    case "corner": return "T" + pose.n + " " + sg(pose.off) + " m, " + sg(pose.x) + " m out";
    case "start": return "start " + sg(pose.off) + " m";
    case "landmark": return "landmark #" + (pose.rank + 1);
    case "centre": return "whole circuit";
    default: return String(pose.at);
  }
}

// ---- the panel -------------------------------------------------------------

let live = null;   // the one created instance, for __apex.freeCam (js/agent/apex.js)

/** photo = { enter, exit, publish, releaseKeys } from js/camera/photo-cam.js,
 *  which creates this from inside its own create() — the free camera IS photo
 *  mode with a different panel, not a second fly-cam. */
function create(G, photo) {
Log.info("game", "FreeCam.create");
const { $, photoCam } = G;
const st = { open: false, speed: SPD_DEF, roll: 0, lens: "race", corner: 0, anchor: "—", poseErr: null, statusT: 0 };
const rk = { q: false, e: false };

// ---- DOM (built here: index.html holds only the layer, its door and the
// pause-menu button — the shell's node budget is spent) ----
const root = $("freecam");
// E: every element built below, by id — held here rather than looked up again,
// so the panel adds no id read tools/check/shell-ids.mjs cannot resolve.
const E = {};
const mk = (tag, props, kids) => {
  const el = document.createElement(tag);
  if (props && props.id) E[props.id] = el;
  if (props) for (const k in props) {
    if (k === "attrs") { for (const a in props.attrs) el.setAttribute(a, props.attrs[a]); } else el[k] = props[k];
  }
  if (kids) for (const c of kids) el.appendChild(c);
  return el;
};
const slider = (id, label, min, max, step, valId) => mk("label", { className: "tune-row", id: id + "-row" }, [
  mk("span", { className: "tune-label" }, [mk("span", { textContent: label + " " }), mk("b", { id: valId })]),
  mk("input", { id, type: "range", min: String(min), max: String(max), step: String(step), attrs: { "aria-label": label } }),
]);
const btn = (id, text, title) => mk("button", { id, type: "button", textContent: text, title: title || "" });
let inner = null;
if (root) {
  inner = mk("div", { id: "freecam-inner", className: "sheet" }, [
    mk("div", { id: "fc-head" }, [mk("h2", { textContent: "FREE CAMERA" })]),
    mk("div", { id: "fc-status" }),
    mk("div", { id: "fc-rows", className: "pane" }, [
      slider("fc-speed", "SPEED", 0, SLIDER_MAX, 1, "fc-speed-val"),
      slider("fc-roll", "ROLL", -ROLL_MAX, ROLL_MAX, 1, "fc-roll-val"),
      slider("fc-fov", "FOV", FOV_MIN, FOV_MAX, 1, "fc-fov-val"),
      mk("div", { id: "fc-snaps", className: "balanced-row", attrs: { role: "group", "aria-label": "Snap the camera" } }, [
        btn("fc-snap-car", "SNAP TO CAR", "Put the camera behind your car"),
        btn("fc-corner-prev", "‹ CORNER", "Jump to the previous corner, seen from its outside"),
        btn("fc-corner-next", "CORNER ›", "Jump to the next corner, seen from its outside"),
      ]),
      mk("div", { id: "fc-lens", className: "balanced-row", attrs: { role: "group", "aria-label": "Lens" } }, [
        btn("fc-lens-race", "RACE LENS", "The race camera's far plane and fog"),
        btn("fc-lens-flyby", "FLYBY LENS", "The pre-race flyby's far plane, near plane and thinned fog"),
      ]),
      mk("div", { id: "fc-copies", className: "balanced-row", attrs: { role: "group", "aria-label": "Copy this view" } }, [
        btn("fc-copy-view", "COPY VIEW", "Copy an __apex.view({eye,target,fov}) line that frames this picture"),
        btn("fc-copy-pose", "COPY FLYBY POSE", "Copy this view as a held flyby shot, anchored to the nearest corner or landmark"),
      ]),
      mk("p", { id: "fc-help", className: "adv-help", textContent: "WASD move · R/F up and down · Q/E roll · mouse wheel speed · drag or arrow keys look (arrows while focus is outside this panel) · Shift boost" }),
      mk("p", { id: "fc-msg", attrs: { "aria-live": "polite" } }),
      mk("textarea", { id: "fc-out", readOnly: true, hidden: true, attrs: { "aria-label": "Copied camera text" } }),
    ]),
  ]);
  const close = $("fc-close");
  const foot = mk("div", { className: "sheet-foot balanced-row" }, close ? [close] : []);
  inner.appendChild(foot);
  root.appendChild(inner);
}

// ---- state -> DOM ----
function paint() {
  const set = (id, v, txt) => { const i = E[id]; if (i && document.activeElement !== i) i.value = String(v); const b = E[id + "-val"]; if (b) b.textContent = txt; };
  set("fc-speed", sliderFromSpeed(st.speed), Math.round(st.speed) + " m/s");
  set("fc-roll", Math.round(st.roll), Math.round(st.roll) + "°");
  set("fc-fov", Math.round(photoCam.fov), Math.round(photoCam.fov) + "°");
  for (const [id, on] of [["fc-lens-race", st.lens === "race"], ["fc-lens-flyby", st.lens === "flyby"]]) {
    const b = E[id]; if (!b) continue;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  }
}
function paintStatus() {
  const s = E["fc-status"]; if (!s) return;
  const e = photoCam.pos;
  s.textContent = "(" + Math.round(e[0]) + ", " + Math.round(e[1]) + ", " + Math.round(e[2]) + ") · " + st.anchor +
    (st.poseErr ? " · pose err " + st.poseErr : "");
}
function refreshAnchor() {
  if (!G.track || typeof FlybySeq === "undefined" || !FlybySeq.poseFromWorld) return;
  try { st.anchor = anchorText(FlybySeq.poseFromWorld(G.track, photoCam.pos).pose); } catch (_) { st.anchor = "—"; }
}
function say(msg) { const m = E["fc-msg"]; if (m) m.textContent = msg; }

// ---- placing the camera ----
function place(eye, target, fov) {
  photoCam.pos[0] = eye[0]; photoCam.pos[1] = eye[1]; photoCam.pos[2] = eye[2];
  const a = aim(eye, target); photoCam.yaw = a.yaw; photoCam.pitch = a.pitch;
  if (fov != null) setFov(fov);
  if (photo && photo.releaseKeys) photo.releaseKeys();
  publish();
}
function publish() {
  // photo.publish integrates zero time and writes G.dbgCam, which decorate()
  // then finishes — so an API placement shows even on a frame nobody flew.
  if (photo && photo.publish) photo.publish(); else decorate(G.dbgCam, 0);
  refreshAnchor(); paintStatus(); paint();
}
function setFov(f) {
  photoCam.fov = clampFov(f);
  const pc = $("pc-fov"); if (pc) pc.value = String(Math.round(photoCam.fov));
}
function setLens(l) { st.lens = l === "flyby" ? "flyby" : "race"; }
function snapCar() {
  const c = G.player;
  if (!c || c.px == null || !G.track) return false;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  Tracks.sample(G.track, c.s || 0, smp);
  const p = carPose(c, smp.p[1]);
  place(p.eye, p.target);
  say("Behind the car.");
  return true;
}
function snapCorner(n) {
  if (!G.track) return false;
  const p = cornerPose(G.track, n);
  if (!p) { say("This circuit has no measured corners."); return false; }
  st.corner = p.n;
  place(p.eye, p.target);
  say("Turn " + p.n + " of " + p.count + ".");
  return true;
}
const stepCorner = (d) => snapCorner((st.corner || (d > 0 ? 0 : 1)) + d);

// ---- the frame hook (photo-cam.js updatePhotoCam, after it builds dbgCam) ----
/** Speed for this frame, m/s. */
function speed(boost) { return st.speed * (boost ? BOOST : 1); }
function decorate(cam, dt) {
  if (!st.open || !cam) return;
  const d = (rk.e ? 1 : 0) - (rk.q ? 1 : 0);
  if (d && dt > 0) { st.roll = clampRoll(st.roll + d * ROLL_RATE * dt); paint(); }
  cam.roll = st.roll * Math.PI / 180;
  if (st.lens === "flyby" && typeof FlybySeq !== "undefined") {
    cam.cine = true; cam.far = FlybySeq.FAR; cam.fog = FlybySeq.FOG;
  }
  st.statusT -= dt;
  if (st.statusT <= 0) { st.statusT = 0.25; refreshAnchor(); paintStatus(); }
}
/** Photo mode's key handler asks first. 1 = mine (consume), -1 = not the
 *  camera's (leave it to the focused control), 0 = photo mode's to handle. */
function key(code, down, focused) {
  if (!st.open) return 0;
  if (code === "KeyQ") { rk.q = down; return 1; }
  if (code === "KeyE") { rk.e = down; return 1; }
  // ARROW-KEY LOOK ONLY WITH FOCUS OUTSIDE THE PANEL: inside it the arrows
  // belong to the control that has focus (a slider, the button row).
  if (/^Arrow/.test(code) && inner && focused && inner.contains(focused)) return -1;
  return 0;
}
function releaseKeys() { rk.q = rk.e = false; }
function onWheel(e) {
  if (!st.open || (inner && e.target && inner.contains(e.target))) return;
  st.speed = wheelSpeed(st.speed, e.deltaY); paint();
}

// ---- open / close ----
function isOpen() { return st.open; }
function open() {
  if (st.open) return true;
  if (!G.track || !root) return false;
  Log.info("game", "FreeCam.open");
  st.open = true; st.roll = 0; st.lens = "race"; st.poseErr = null; st.statusT = 0;
  releaseKeys();
  root.hidden = false;
  const out = E["fc-out"]; if (out) out.hidden = true;
  say("");
  document.body.classList.add("lt-open");   // same dock as the three tuners: race HUD and touch controls stand down
  const ps = $("pmsettings"); if (ps) ps.hidden = true;
  // Nested under DISPLAY -> ADVANCED VISUALS: hide that page too, or its own
  // .hidden survives underneath and reappears the moment pmsettings does.
  const dp = $("pm-panel-display"); if (dp) dp.hidden = true;
  if (photo && photo.enter) photo.enter();   // starts from the game camera (initPhotoCam)
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("blur", releaseKeys);
  }
  publish();
  return true;
}
/** Exit restores: the game camera (dbgCam cleared by photo mode's exit), a
 *  level horizon and the race lens for the next photo mode, and — when asked
 *  and still paused — the settings page the panel was opened from. */
function close(showPauseMenu) {
  if (!st.open) return;
  Log.info("game", "FreeCam.close");
  st.open = false; st.roll = 0; st.lens = "race";
  releaseKeys();
  if (root) root.hidden = true;
  if (inner) inner.hidden = false;           // HIDE PANEL tucks this; do not carry it over
  document.body.classList.remove("lt-open");
  if (typeof window !== "undefined" && window.removeEventListener) {
    window.removeEventListener("wheel", onWheel, { passive: true });
    window.removeEventListener("blur", releaseKeys);
  }
  if (G.photoMode && photo && photo.exit) photo.exit();
  if (showPauseMenu && G.paused) {
    const ps = $("pmsettings"); if (ps) ps.hidden = false;
    const dp = $("pm-panel-display"); if (dp) dp.hidden = false;
    const b = $("pm-freecam"); if (b && b.focus) b.focus();
  }
}
/** Photo mode left by some other door (resume, quit, the lighting tuner). */
function onPhotoExit() { if (st.open) close(false); }

// ---- copy ----
function copyOut(text, okMsg) {
  const ta = E["fc-out"];
  if (ta) { ta.value = text; ta.hidden = false; ta.focus(); if (ta.setSelectionRange) ta.setSelectionRange(0, text.length); }
  // The synchronous execCommand attempt goes FIRST (see js/camera/flyby-panel.js
  // COPY VALUES: WebKit does not forgive a copy a microtask after the gesture).
  let ok = false;
  try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { /* not available */ }
  // Copied: hand the keyboard back to the camera (WASD is ignored while a text
  // field has focus). Not copied: leave the text selected for a manual copy.
  if (ok && ta && ta.blur) ta.blur();
  const done = (good) => say(good ? okMsg : "Select the text below and copy it.");
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), () => done(ok));
  } else done(ok);
  return text;
}
function cam() { return G.dbgCam || { eye: photoCam.pos, target: photoCam.pos, fov: photoCam.fov }; }
function copyView() { const c = cam(); return copyOut(viewSnippet(c.eye, c.target, c.fov), "Copied the __apex.view() line."); }
function flybyPose() {
  if (!G.track || typeof FlybySeq === "undefined" || !FlybySeq.shotFromView) return null;
  const c = cam();
  return FlybySeq.shotFromView(G.track, c.eye, c.target, c.fov);
}
function copyPose() {
  const r = flybyPose();
  if (!r) { say("No circuit to anchor a pose to."); return null; }
  st.poseErr = "eye " + r.err.eye + " m, look " + r.err.look + " m";
  paintStatus();
  copyOut(JSON.stringify(r.shot, null, 2), "Copied the flyby pose (round trip: " + st.poseErr + ").");
  return r;
}

// ---- __apex.freeCam(opts) ----
function state() {
  const c = G.dbgCam;
  return {
    open: st.open, speed: r2(st.speed), roll: r2(st.roll), lens: st.lens, corner: st.corner,
    eye: c ? c.eye.map(r2) : null, target: c ? c.target.map(r2) : null, fov: c ? r2(c.fov) : null,
    anchor: st.anchor, poseErr: st.poseErr,
  };
}
function cmd(opts) {
  if (opts === undefined) return state();
  if (opts === false) { close(!!G.paused); return state(); }
  if (!open()) return false;
  if (opts === true || typeof opts !== "object" || !opts) return state();
  if (opts.speed != null) st.speed = clampSpeed(opts.speed);
  if (opts.roll != null) st.roll = clampRoll(opts.roll);
  if (opts.lens != null) setLens(opts.lens);
  if (opts.snap === "car" && !snapCar()) return false;
  if (opts.snap === "corner" && !(opts.n != null ? snapCorner(opts.n) : stepCorner(1))) return false;
  if (opts.eye && opts.target) place(opts.eye, opts.target, opts.fov);
  else if (opts.fov != null) setFov(opts.fov);
  publish();
  return state();
}

// ---- wiring ----
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined") GameAudio.uiTick(); };
on($("pm-freecam"), "click", () => { if (G.soundOn && typeof GameAudio !== "undefined") GameAudio.uiSelect(); open(); });
on($("fc-close"), "click", () => { tick(); close(true); });
on(E["fc-speed"], "input", (e) => { st.speed = speedFromSlider(e.target.value); paint(); });
on(E["fc-roll"], "input", (e) => { st.roll = clampRoll(e.target.value); paint(); publish(); });
on(E["fc-fov"], "input", (e) => { setFov(e.target.value); paint(); publish(); });
on($("pc-fov"), "input", () => paint());      // photo mode's own FOV slider, mirrored
on(E["fc-snap-car"], "click", () => { tick(); if (!snapCar()) say("No car on track to snap to."); });
on(E["fc-corner-prev"], "click", () => { tick(); stepCorner(-1); });
on(E["fc-corner-next"], "click", () => { tick(); stepCorner(1); });
on(E["fc-lens-race"], "click", () => { tick(); setLens("race"); publish(); });
on(E["fc-lens-flyby"], "click", () => { tick(); setLens("flyby"); publish(); });
on(E["fc-copy-view"], "click", copyView);
on(E["fc-copy-pose"], "click", copyPose);
paint();

const api = { open, close, isOpen, onPhotoExit, speed, decorate, key, releaseKeys, cmd, state,
  place, snapCar, snapCorner, copyView, copyPose, flybyPose, panel: () => inner };
live = api;
return api;
}

return Object.freeze({
  create,
  /** __apex.freeCam(opts) — see docs/DEBUG-HOOKS.md. */
  cmd: (opts) => (live ? live.cmd(opts) : false),
  speedFromSlider, sliderFromSpeed, clampSpeed, wheelSpeed, clampRoll, clampFov,
  viewSnippet, aim, carPose, cornerPose, anchorText,
  SPD_MIN, SPD_MAX, SPD_DEF, ROLL_MAX, BOOST,
});
})();
