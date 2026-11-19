const Photomode = (function () {
  "use strict";

function create(G) {
Log.info("game", "Photomode.create");
const { $, gfx, photoCam, photoKeys, photoMouse, photoMove, photoLook,
        applyResMode } = G;
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
const altitudeHeld = { up: false, down: false };
const aliasHeld = { KeyR: false, Space: false, ShiftLeft: false, ShiftRight: false };
function releasePhotoInput() {
  altitudeHeld.up = altitudeHeld.down = false;
  for (const code in aliasHeld) aliasHeld[code] = false;
  photoMove.x = photoMove.y = photoLook.x = photoLook.y = 0;
  photoMouse.dx = photoMouse.dy = 0; photoMouse.drag = false; photoMouse.pid = null;
  G.photoAlt = 0; G.photoVertT = 0;
  for (const k in photoKeys) photoKeys[k] = false;
}
function updatePhotoCam(dt) {
  const spd = freeCam && freeCam.isOpen() ? freeCam.speed(photoKeys.boost)
    : (photoKeys.boost ? 95 : 34);
  const lookRate = 1.7;
  const yawIn   = (photoKeys.yr ? 1 : 0) - (photoKeys.yl ? 1 : 0) + photoLook.x;
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
  G.dbgCam = { eye: [e[0], e[1], e[2]], target: [e[0] + fwd[0] * 100, e[1] + fwd[1] * 100, e[2] + fwd[2] * 100],
             fov: photoCam.fov, far: gfx.isMobile ? 1100 : 2500, fog: 1.0 };
  if (freeCam) freeCam.decorate(G.dbgCam, dt);
}
function enterPhotoMode() {
  if (G.photoMode) return;
  Log.info("game", "Photomode.enter");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  G.photoMode = true;
  PerfGov.setAutoRes(false);
  G._photoPrevScale = gfx.getRenderScale ? gfx.getRenderScale() : 1;
  if (gfx.setRenderScale && G._photoPrevScale < 1) gfx.setRenderScale(1);
  initPhotoCam();
  document.body.classList.add("photo-mode");
  $("photo-controls").hidden = false;
  paintPhotoLine();
  const t = $("pc-toggle"); if (t) { t.classList.add("on"); t.innerHTML = "● FREE CAMERA"; }
  window.addEventListener("keydown", photoKeyHandler, true);
  window.addEventListener("keyup", photoKeyHandler, true);
  window.addEventListener("blur", releasePhotoInput);
}
function exitPhotoMode() {
  if (!G.photoMode) return;
  Log.info("game", "Photomode.exit");
  G.photoMode = false;
  if (freeCam) freeCam.onPhotoExit();
  G.dbgCam = null;
  G.snapGameCam();
  document.body.classList.remove("photo-mode", "pc-nopanel", "pc-uihidden");
  DrivingLine.setPhoto(null);
  paintPhotoLine();
  $("photo-controls").hidden = true;
  $("lighting-inner").hidden = false;
  const pb = $("pc-panel"); if (pb) pb.textContent = "HIDE PANEL";
  const t = $("pc-toggle"); if (t) { t.classList.remove("on"); t.innerHTML = "📷 FREE CAMERA"; }
  window.removeEventListener("keydown", photoKeyHandler, true);
  window.removeEventListener("keyup", photoKeyHandler, true);
  window.removeEventListener("blur", releasePhotoInput);
  if (gfx.setRenderScale) gfx.setRenderScale(G._photoPrevScale || 1);
  applyResMode();
}
function togglePhotoPanel() {
  const p = freeCam && freeCam.isOpen() ? freeCam.panel() : $("lighting-inner"); if (!p) return;
  const hide = !p.hidden;
  p.hidden = hide;
  document.body.classList.toggle("pc-nopanel", hide);
  const pb = $("pc-panel"); if (pb) pb.textContent = hide ? "SHOW PANEL" : "HIDE PANEL";
  if (G.soundOn) GameAudio.uiTick();
}
let lineBtn = null;
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
  document.body.classList.toggle("pc-uihidden", hide);
  if (G.soundOn) GameAudio.uiTick();
}
function photoKeyHandler(e) {
  const focused = document.activeElement, tag = (focused && focused.tagName) || "";
  const down = e.type === "keydown";
  const studioControl = focused && focused.closest && focused.closest("#ps-panel, #pc-restore");
  const studioKey = e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter" || /^Arrow/.test(e.code);
  if (down && e.code !== "Escape" && ((studioControl && studioKey) || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;
  const fc = freeCam ? freeCam.key(e.code, down, document.activeElement) : 0;
  if (fc < 0 && down) return;
  if (fc > 0) { e.preventDefault(); if (down) e.stopPropagation(); return; }
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
  if (hit && !(studioControl && studioKey)) { e.preventDefault(); if (down) e.stopPropagation(); }
}
function wirePhotoStick(id, vec) {
  const el = $(id); if (!el) return;
  const nub = el.querySelector(".pc-nub");
  let pid = null;
  let _r = null, _zoom = 1;
  const set = (cx, cy) => {
    const r = _r || el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (cx - (r.left + rad)) / rad, dy = (cy - (r.top + rad)) / rad;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    vec.x = dx; vec.y = dy;
    const localRad = rad / _zoom;
    if (nub) nub.style.transform = "translate(" + (dx * localRad * 0.6) + "px," + (dy * localRad * 0.6) + "px)";
  };
  const end = () => { vec.x = 0; vec.y = 0; pid = null; if (nub) nub.style.transform = "translate(0,0)"; };
  const endIf = (e) => { if (pid === null || e.pointerId === pid) end(); };
  el.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) {  }
    _r = el.getBoundingClientRect();
    _zoom = el.currentCSSZoom || 1;
    set(e.clientX, e.clientY);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === pid) { set(e.clientX, e.clientY); e.preventDefault(); } });
  el.addEventListener("pointerup", endIf);
  el.addEventListener("pointercancel", endIf);
  el.addEventListener("lostpointercapture", endIf);
}
function wirePhotoHold(id, on, off) {
  const el = $(id); if (!el) return;
  let pid = null;
  const release = (e) => { if (pid === null || !e || e.pointerId === pid) { pid = null; off(); } };
  el.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) {  }
    on();
    e.preventDefault();
  });
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", (e) => { if (Input.holdTargetGone(el)) release(e); });
}
wirePhotoStick("pc-move", photoMove);
wirePhotoStick("pc-look", photoLook);
const altitude = (id, held) => { altitudeHeld[id] = held; G.photoAlt = Number(altitudeHeld.up) - Number(altitudeHeld.down); };
wirePhotoHold("pc-up", () => altitude("up", true), () => altitude("up", false));
wirePhotoHold("pc-down", () => altitude("down", true), () => altitude("down", false));
{
  const canvas = $("game");
  if (canvas) {
    const stop = (e) => {
      if (photoMouse.pid !== null && e && e.pointerId !== photoMouse.pid) return;
      photoMouse.drag = false; photoMouse.pid = null;
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!G.photoMode || photoMouse.drag) return;
      photoMouse.drag = true; photoMouse.pid = e.pointerId;
      photoMouse.px = e.clientX; photoMouse.py = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!G.photoMode || !photoMouse.drag || e.pointerId !== photoMouse.pid) return;
      photoMouse.dx += e.clientX - photoMouse.px; photoMouse.dy += e.clientY - photoMouse.py;
      photoMouse.px = e.clientX; photoMouse.py = e.clientY;
    });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }
}
$("pc-toggle").onclick = () => { if (G.soundOn) GameAudio.uiSelect(); G.photoMode ? exitPhotoMode() : enterPhotoMode(); };
$("pc-exit").onclick = () => {
  if (G.soundOn) GameAudio.uiTick();
  if (freeCam && freeCam.isOpen()) freeCam.close(true); else exitPhotoMode();
};
$("pc-panel").onclick = togglePhotoPanel;
$("pc-hud").onclick = () => setPhotoUiHidden(true);
{
  const lb = lineBtn = document.createElement("button");
  lb.id = "pc-line"; lb.type = "button"; lb.setAttribute("aria-pressed", "true"); lb.textContent = "HIDE LINE";
  lb.onclick = togglePhotoLine;
  $("pc-bar").insertBefore(lb, $("pc-hud"));
}
$("pc-restore").onclick = () => setPhotoUiHidden(false);
$("pc-fov").oninput = (e) => {
  const v = +e.target.value;
  photoCam.fov = (typeof v === "number" && isFinite(v)) ? Math.max(20, Math.min(110, v)) : 60;
};

return { updatePhotoCam, enterPhotoMode, exitPhotoMode, freeCam };
}

return { create };
})();
