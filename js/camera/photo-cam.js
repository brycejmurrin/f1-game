/* Apex 26 — photo mode for js/game.js: the free-fly camera (WASD/mouse/touch sticks, drag-to-look), enter/exit plumbing (render-scale bump, HUD hide, panel tuck) and its DOM buttons. Photo mode ONLY — the lighting tuner's lt-* buttons (help toggle, RESET, COPY VALUES) live in js/lighting/tuner-panel.js. #4648. */
const Photomode = (function () {
  "use strict";

let lastPanelFocus = null, lastPanelLayer = null;
const PHOTO_PANEL = "#ps-panel, #freecam-inner, #lighting-inner, #pc-bar, #pc-restore";
function sceneOwnsFocus() { return document.activeElement?.id === "pc-scene"; }
function focusScene(fromControl) {
  const scene = document.getElementById("pc-scene");
  if (!scene) return false;
  const previous = fromControl || document.activeElement;
  if (previous && previous !== scene && previous !== document.body) {
    lastPanelFocus = previous;
    lastPanelLayer = window.UiLayers?.top?.();
  }
  scene.focus({ preventScroll: true });
  return sceneOwnsFocus();
}

function create(G) {
Log.info("game", "Photomode.create");
// Stable bindings from the game.js closure.
const { $, gfx, photoCam, photoKeys, photoMouse, photoMove, photoLook,
        applyResMode } = G;
// THE FREE CAMERA panel (js/camera/free-cam.js) is this fly-cam with its own
// dock, created here so js/game.js gains nothing. Absent in the VM tests that
// boot this file alone, so every use below is guarded.
const freeCam = typeof FreeCam !== "undefined"
  ? FreeCam.create(G, { enter: enterPhotoMode, exit: exitPhotoMode, publish: () => updatePhotoCam(0), releaseKeys: releasePhotoInput })
  : null;

function initPhotoCam() {
  photoCam.pos[0] = G.camEye[0]; photoCam.pos[1] = G.camEye[1]; photoCam.pos[2] = G.camEye[2];
  let dx = G.camTgt[0] - G.camEye[0], dy = G.camTgt[1] - G.camEye[1], dz = G.camTgt[2] - G.camEye[2];
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  photoCam.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  photoCam.yaw = Math.atan2(dx, -dz);
  photoCam.fov = G.camFov;
  const fv = $("pc-fov"); if (fv) fv.value = Math.round(G.camFov);
  releasePhotoInput();
}
// EVERY HELD CONTROL, RELEASED — and nothing about where the camera IS.
// js/input/input.js wires `window "blur"` to reset() for exactly this reason
// ("any pointer that lifts or is captured elsewhere"), and the two virtual
// sticks and two hold buttons below already handle pointerup/pointercancel/
// lostpointercapture citing the same class of bug. What none of them covered
// is focus simply going away — an alt-tab, an OS notification, a permission
// prompt — which fires no pointer or key event at all, so a held W or a
// finger down on the move stick left that axis pinned and the free camera
// flew off in that direction until the player pressed the same control again.
// Split out of initPhotoCam so blur can release the input WITHOUT also
// re-deriving the pose from the game camera, which would teleport the shot.
const pointerReleases = [];
function releasePhotoPointers() {
  for (const release of pointerReleases) release();
}
const altitudeHeld = { up: false, down: false };
let lightingOpener = null;
// Physical aliases own their holds independently: releasing Space cannot
// cancel a still-held R, nor can one Shift release cancel the other.
const aliasHeld = { KeyR: false, Space: false, ShiftLeft: false, ShiftRight: false };
function releasePhotoKeys() {
  for (const code in aliasHeld) aliasHeld[code] = false;
  for (const k in photoKeys) photoKeys[k] = false;
  freeCam?.releaseKeys();
}
function releasePhotoInput() {
  releasePhotoPointers();
  altitudeHeld.up = altitudeHeld.down = false;
  releasePhotoKeys();
  photoMove.x = photoMove.y = photoLook.x = photoLook.y = 0;
  photoMouse.dx = photoMouse.dy = 0; photoMouse.drag = false; photoMouse.pid = null;
  G.photoAlt = 0; G.photoVertT = 0;
}
function photoVisibilityChanged() { if (document.hidden) releasePhotoInput(); }
// Integrate held input into the fly-cam each paused frame and publish dbgCam.
function updatePhotoCam(dt) {
  const spd = freeCam && freeCam.isOpen() ? freeCam.speed(photoKeys.boost)   // the panel's SPEED dial
    : (photoKeys.boost ? 95 : 34);                // m/s (Shift = boost)
  const lookRate = 1.7;                           // rad/s for key/stick look
  // Look: arrow keys + touch look stick + mouse drag delta.
  const yawIn = (photoKeys.yr ? 1 : 0) - (photoKeys.yl ? 1 : 0) + photoLook.x;
  const pitchIn = (photoKeys.pu ? 1 : 0) - (photoKeys.pd ? 1 : 0) - photoLook.y;
  photoCam.yaw   += yawIn * lookRate * dt + photoMouse.dx * 0.0032;
  photoCam.pitch += pitchIn * lookRate * dt - photoMouse.dy * 0.0032;
  photoMouse.dx = 0; photoMouse.dy = 0;
  photoCam.pitch = Math.max(-1.45, Math.min(1.45, photoCam.pitch));
  const cp = Math.cos(photoCam.pitch), sp = Math.sin(photoCam.pitch);
  const fwd = [Math.sin(photoCam.yaw) * cp, sp, -Math.cos(photoCam.yaw) * cp];
  const rgt = [Math.cos(photoCam.yaw), 0, Math.sin(photoCam.yaw)];
  const mf = (photoKeys.w ? 1 : 0) - (photoKeys.s ? 1 : 0) - photoMove.y;
  const ms = (photoKeys.d ? 1 : 0) - (photoKeys.a ? 1 : 0) + photoMove.x;
  const mvIn = (photoKeys.up ? 1 : 0) - (photoKeys.dn ? 1 : 0) + G.photoAlt;
  G.photoVertT = mvIn ? G.photoVertT + dt : 0;
  const vRamp = Math.min(1, 0.12 + 0.88 * Math.pow(Math.min(G.photoVertT / 2.2, 1), 1.6));
  const mv = mvIn * vRamp;
  const k = spd * dt;
  photoCam.pos[0] += (fwd[0] * mf + rgt[0] * ms) * k;
  photoCam.pos[1] += (fwd[1] * mf + mv) * k;
  photoCam.pos[2] += (fwd[2] * mf + rgt[2] * ms) * k;
  const e = photoCam.pos;
  // far: the far plane is the game's ONLY distance cull (chunk AABBs test against
  // the frustum incl. far; fog never culls). 2500 m from altitude framed EVERY
  // chunk of a street circuit — ~1.1 M tris / ~970 draw calls per frame on Vegas,
  // which overflows a mobile TBDR tiler and gets the web app jetsam-killed. Keep
  // 1100 m on mobile (fog hides the edge); desktop can afford the full vista.
  // fog: 1.0 — the 0.15× default at the dbgCam branch was meant for the dev
  // view() hook; the tuner preview should show the REAL race fog anyway.
  G.dbgCam = { eye: [e[0], e[1], e[2]], target: [e[0] + fwd[0] * 100, e[1] + fwd[1] * 100, e[2] + fwd[2] * 100],
             fov: photoCam.fov, far: gfx.isMobile ? 1100 : 2500, fog: 1.0 };   // not 8000 — a huge far plane wrecks depth precision → z-fighting/flicker
  if (freeCam) freeCam.decorate(G.dbgCam, dt);   // roll, lens, status line — inert unless its panel is open
}
function enterPhotoMode(opener = null) {
  if (G.photoMode) return;
  Log.info("game", "Photomode.enter");
  lightingOpener = opener;
  lastPanelFocus = lastPanelLayer = null;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  G.photoMode = true;
  PerfGov.setAutoRes(false);
  G._photoPrevScale = gfx.getRenderScale ? gfx.getRenderScale() : 1;
  // Full scale while framing (PerfGov may sit at 0.7); exit restores it (#4648).
  if (gfx.setRenderScale && G._photoPrevScale < 1) gfx.setRenderScale(1);
  initPhotoCam();
  document.body.classList.add("photo-mode");
  $("photo-controls").hidden = false;
  paintPhotoLine();
  const t = $("pc-toggle"); if (t) { t.classList.add("on"); t.innerHTML = "● FREE CAMERA"; }
  window.addEventListener("keydown", photoKeyHandler, true);
  window.addEventListener("keyup", photoKeyHandler, true);
  window.addEventListener("blur", releasePhotoInput);
  window.addEventListener("focusin", photoEditorFocus);
  document.addEventListener?.("visibilitychange", photoVisibilityChanged);
  window.addEventListener("resize", releasePhotoPointers);
  window.visualViewport?.addEventListener("resize", releasePhotoPointers);
  if (opener) focusScene(opener);
}
function exitPhotoMode() {
  if (!G.photoMode) return;
  Log.info("game", "Photomode.exit");
  G.photoMode = false;
  releasePhotoInput();
  if (freeCam) freeCam.onPhotoExit();       // resume / quit / the tuner closing take the free-cam panel with them
  G.dbgCam = null;                          // hand the game camera back
  G.snapGameCam();                          // …AT the car: the damped rig otherwise swoops back from wherever the free camera was parked
  document.body.classList.remove("photo-mode", "pc-nopanel", "pc-uihidden");
  DrivingLine.setPhoto(null);               // the LINE button is a per-shot preview, never a saved setting
  paintPhotoLine();
  $("photo-controls").hidden = true;
  $("lighting-inner").hidden = false;     // un-hide the tuner if it was tucked away
  const pb = $("pc-panel"); if (pb) pb.textContent = "HIDE PANEL";
  const t = $("pc-toggle"); if (t) { t.classList.remove("on"); t.innerHTML = "📷 FREE CAMERA"; }
  window.removeEventListener("keydown", photoKeyHandler, true);
  window.removeEventListener("keyup", photoKeyHandler, true);
  window.removeEventListener("blur", releasePhotoInput);
  window.removeEventListener("focusin", photoEditorFocus);
  document.removeEventListener?.("visibilitychange", photoVisibilityChanged);
  window.removeEventListener("resize", releasePhotoPointers);
  window.visualViewport?.removeEventListener("resize", releasePhotoPointers);
  if (gfx.setRenderScale) gfx.setRenderScale(G._photoPrevScale || 1);
  applyResMode();
  lightingOpener?.focus({ preventScroll: true });
  lightingOpener = lastPanelFocus = lastPanelLayer = null;
}
function togglePhotoPanel() {
  const p = freeCam && freeCam.isOpen() ? freeCam.panel() : $("lighting-inner"); if (!p) return;
  releasePhotoPointers();
  const hide = !p.hidden;
  p.hidden = hide;
  document.body.classList.toggle("pc-nopanel", hide);
  const pb = $("pc-panel"); if (pb) pb.textContent = hide ? "SHOW PANEL" : "HIDE PANEL";
  if (G.soundOn) GameAudio.uiTick();
}
let lineBtn = null;   // built below; a held reference, not an id lookup (the shell has no #pc-line)
function paintPhotoLine() {
  const b = lineBtn; if (!b) return;
  const on = DrivingLine.shown();
  b.textContent = on ? "HIDE LINE" : "SHOW LINE"; b.setAttribute("aria-pressed", on ? "true" : "false");
}
function togglePhotoLine() {
  DrivingLine.setPhoto(!DrivingLine.shown());
  paintPhotoLine();
  if (G.soundOn) GameAudio.uiTick();
}
function setPhotoUiHidden(hide) {
  if (hide) releasePhotoInput();
  document.body.classList.toggle("pc-uihidden", hide);
  if (G.soundOn) GameAudio.uiTick();
}
// Dedicated key handler (not Input.onKey) so photo controls never touch driving.
function photoEditorFocus(e) {
  if (e.target?.closest?.("#screen-arranger")) { releasePhotoInput(); return; }
  if (e.target?.closest?.(PHOTO_PANEL)) releasePhotoKeys();
}
function photoKeyHandler(e) {
  const focused = document.activeElement, tag = (focused && focused.tagName) || "";
  if (focused?.closest?.("#screen-arranger")) return;
  const down = e.type === "keydown";
  if (down && /^(Meta|Alt|Control)(Left|Right)$/.test(e.code)) releasePhotoKeys();
  const shortcut = e.metaKey || e.altKey || e.ctrlKey || e.isComposing;
  if (down && (shortcut || e.defaultPrevented)) return;
  if (down && e.code === "Tab" && sceneOwnsFocus()) {
    const layer = window.UiLayers?.top?.();
    if (lastPanelFocus?.isConnected && lastPanelLayer === layer) lastPanelFocus.focus({ preventScroll: true });
    if (sceneOwnsFocus()) {
      const nav = window.MenuNav;
      const fallback = layer && nav?.currentItem(layer, nav.items(layer));
      (fallback || $("pc-toggle"))?.focus({ preventScroll: true });
    }
    if (!sceneOwnsFocus()) { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  // Panel controls own activation and navigation. Key-up still releases
  // camera input held before focus moved, including out of a text field.
  const editing = focused?.closest?.(PHOTO_PANEL) || focused?.isContentEditable ||
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (down && editing) return;
  const fc = freeCam ? freeCam.key(e.code, down, document.activeElement) : 0;
  if (fc < 0 && down) return;                // an arrow key over the free-cam panel belongs to its focused control
  if (fc > 0) { if (!shortcut && !editing) e.preventDefault(); if (down) e.stopPropagation(); return; }
  let hit = true;
  switch (e.code) {
    case "KeyW": photoKeys.w = down; break;
    case "KeyS": photoKeys.s = down; break;
    case "KeyA": photoKeys.a = down; break;
    case "KeyD": photoKeys.d = down; break;
    case "KeyR": case "Space":
      aliasHeld[e.code] = down; photoKeys.up = aliasHeld.KeyR || aliasHeld.Space; break;
    case "KeyF": photoKeys.dn = down; break;
    case "ArrowUp": photoKeys.pu = down; break;
    case "ArrowDown": photoKeys.pd = down; break;
    case "ArrowLeft": photoKeys.yl = down; break;
    case "ArrowRight": photoKeys.yr = down; break;
    case "ShiftLeft": case "ShiftRight":
      aliasHeld[e.code] = down; photoKeys.boost = aliasHeld.ShiftLeft || aliasHeld.ShiftRight; break;
    default: hit = false;
  }
  // A key-UP still reaches Input: W held from driving, released in here, stayed held after RESUME.
  // A focused control's own key-up keeps its default: buttons activate on Space
  // keyup, so preventDefault there swallowed the press (#3562).
  if (hit && !shortcut && !editing) { e.preventDefault(); if (down) e.stopPropagation(); }
}
// WebKit can retarget a held pointer when another control takes capture.
// Listen on window so the original contact can still move and release.
function wirePhotoPointer(el, press, finish, update) {
  let pid = null;
  function release() {
    if (pid === null) return;
    const previous = pid;
    pid = null;
    window.removeEventListener("pointerup", endIf, true);
    window.removeEventListener("pointercancel", endIf, true);
    if (update) window.removeEventListener("pointermove", moveOutside, true);
    if (el.hasPointerCapture?.(previous)) el.releasePointerCapture(previous);
    finish();
  }
  const endIf = (e) => { if (e.pointerId === pid) release(); };
  const move = (e) => {
    if (e.pointerId !== pid) return;
    update(e);
    e.preventDefault();
  };
  const moveOutside = (e) => { if (e.pointerId === pid && !el.contains(e.target)) move(e); };
  pointerReleases.push(release);
  el.addEventListener("pointerdown", e => {
    if (pid !== null || !G.photoMode || e.button > 0 || press(e) === false) return;
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) { /* a retargeted lift is still seen on window */ }
    window.addEventListener("pointerup", endIf, true);
    window.addEventListener("pointercancel", endIf, true);
    if (update) window.addEventListener("pointermove", moveOutside, true);
    e.preventDefault();
  });
  if (update) el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", endIf);
  el.addEventListener("pointercancel", endIf);
  el.addEventListener("lostpointercapture", e => { if (Input.holdTargetGone(el)) endIf(e); });
}
// Virtual thumbstick: pointer offset from centre → normalised (−1..1) vector.
function wirePhotoStick(id, vec) {
  const el = $(id); if (!el) return;
  const nub = el.querySelector(".pc-nub");
  let box, travelX = 0, travelY = 0;
  function set(e) {
    let dx = (e.clientX - box.left) / box.width * 2 - 1;
    let dy = (e.clientY - box.top) / box.height * 2 - 1;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    vec.x = dx; vec.y = dy;
    if (nub) nub.style.transform = "translate(" + dx * travelX + "px," + dy * travelY + "px)";
  }
  wirePhotoPointer(el, e => {
    // Pointer coordinates and the ring must be in the same viewport space,
    // including CSS scale and old Safari's zoom. Nub travel is local CSS px.
    box = window.CssZoom ? window.CssZoom.viewportRect(el) : el.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    if (nub) {
      travelX = Math.max(0, el.clientWidth - nub.offsetWidth) / 2;
      travelY = Math.max(0, el.clientHeight - nub.offsetHeight) / 2;
    }
    set(e);
  }, () => {
    vec.x = vec.y = 0;
    if (nub) nub.style.transform = "translate(0,0)";
  }, set);
}
function wirePhotoHold(id, on, off) {
  const el = $(id); if (!el) return;
  el.tabIndex = -1;
  wirePhotoPointer(el, on, off);
}
wirePhotoStick("pc-move", photoMove);
wirePhotoStick("pc-look", photoLook);
const altitude = (id, held) => { altitudeHeld[id] = held; G.photoAlt = Number(altitudeHeld.up) - Number(altitudeHeld.down); };
wirePhotoHold("pc-up", () => altitude("up", true), () => altitude("up", false));
wirePhotoHold("pc-down", () => altitude("down", true), () => altitude("down", false));
/* Drag anywhere on the scene (outside the sticks) to look — mouse or a spare
   finger. THE DRAG BELONGS TO ONE POINTER, which it did not used to:
   `pointermove` on `window` accepted every pointer, so with a drag live the
   finger working a thumbstick ALSO fed photoMouse and the view whipped between
   two screen positions on every event — the sticks looked broken because the
   camera was being flung by the same touch that was steering it. And with no
   `pointercancel` handler the flag latched `true` forever the first time iOS
   claimed a touch for a system gesture, which it does routinely (edge swipe,
   notification, gesture arbitration). js/garage/setup-camera.js's garage orbit already
   guards both ways; this is the same guard. */
{
  const canvas = $("game");
  if (canvas) {
    const stop = (e) => {
      if (photoMouse.pid !== null && e && e.pointerId !== photoMouse.pid) return;
      photoMouse.drag = false; photoMouse.pid = null;
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!G.photoMode || photoMouse.drag || e.button > 0) return;
      photoMouse.drag = true; photoMouse.pid = e.pointerId;
      photoMouse.px = e.clientX; photoMouse.py = e.clientY;
      if (focusScene()) e.preventDefault();
    });
    window.addEventListener("pointermove", (e) => {
      if (!G.photoMode || !photoMouse.drag || e.pointerId !== photoMouse.pid) return;
      photoMouse.dx += e.clientX - photoMouse.px; photoMouse.dy += e.clientY - photoMouse.py;
      photoMouse.px = e.clientX; photoMouse.py = e.clientY;
    });
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
  }
}
$("pc-toggle").onclick = (event) => {
  if (G.soundOn) GameAudio.uiSelect();
  if (G.photoMode) exitPhotoMode();
  else enterPhotoMode(event?.currentTarget || $("pc-toggle"));
};
$("pc-exit").onclick = () => {
  if (G.soundOn) GameAudio.uiTick();
  if (freeCam && freeCam.isOpen()) freeCam.close(true); else exitPhotoMode();   // EXIT from the free-cam panel goes back to the menu
};
$("pc-panel").onclick = togglePhotoPanel;
$("pc-hud").onclick = () => setPhotoUiHidden(true);
{   // built here, not in index.html: the shell-node ratchet is shrink-only
  const lb = lineBtn = document.createElement("button");
  lb.id = "pc-line"; lb.type = "button"; lb.setAttribute("aria-pressed", "true"); lb.textContent = "HIDE LINE";
  lb.onclick = togglePhotoLine;
  $("pc-bar").insertBefore(lb, $("pc-hud"));
  const scene = document.createElement("div");
  scene.id = "pc-scene"; scene.tabIndex = -1;
  scene.setAttribute("role", "region"); scene.setAttribute("aria-label", "Camera controls");
  scene.textContent = "WASD move · arrows look · R/F height · Tab returns to the panel";
  $("photo-controls").appendChild(scene);
  const focusButton = document.createElement("button");
  focusButton.id = "pc-focus-camera"; focusButton.type = "button";
  focusButton.textContent = "CAMERA CONTROLS";
  focusButton.onclick = (event) => focusScene(event.currentTarget);
  $("pc-bar").insertBefore(focusButton, lb);
}
$("pc-restore").onclick = () => setPhotoUiHidden(false);
$("pc-fov").oninput = (e) => {
  // As FreeCam.clampFov: never 0/NaN.
  const v = +e.target.value;
  photoCam.fov = (typeof v === "number" && isFinite(v)) ? Math.max(20, Math.min(110, v)) : 60;
};

return { updatePhotoCam, enterPhotoMode, exitPhotoMode, freeCam };
}

return { create, focusScene, sceneOwnsFocus };
})();
