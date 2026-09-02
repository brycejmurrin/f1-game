/* Apex 26 — photo mode for js/game.js: the free-fly camera (WASD/mouse/touch sticks), enter/exit plumbing (render-scale bump, HUD hide, LT copy helpers) and its D… */
const Photomode = (function () {
  "use strict";

function create(G) {
Log.info("game", "Photomode.create");
// Stable bindings from the game.js closure.
const { $, gfx, photoCam, photoKeys, photoMouse, photoMove, photoLook,
        applyResMode, ltKey, persistLightTune, applyLightTune,
        refreshLightTunePanel } = G;

function initPhotoCam() {
  photoCam.pos[0] = G.camEye[0]; photoCam.pos[1] = G.camEye[1]; photoCam.pos[2] = G.camEye[2];
  let dx = G.camTgt[0] - G.camEye[0], dy = G.camTgt[1] - G.camEye[1], dz = G.camTgt[2] - G.camEye[2];
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  photoCam.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  photoCam.yaw = Math.atan2(dx, -dz);
  photoCam.fov = G.camFov;
  const fv = $("pc-fov"); if (fv) fv.value = Math.round(G.camFov);
  photoMove.x = photoMove.y = photoLook.x = photoLook.y = 0;
  photoMouse.dx = photoMouse.dy = 0; photoMouse.drag = false; photoMouse.pid = null;
  G.photoAlt = 0; G.photoVertT = 0;
  for (const k in photoKeys) photoKeys[k] = false;
}
// Integrate held input into the fly-cam each paused frame and publish dbgCam.
function updatePhotoCam(dt) {
  const spd = photoKeys.boost ? 95 : 34;          // m/s (Shift = boost)
  const lookRate = 1.7;                           // rad/s for key/stick look
  // Look: arrow keys + touch look stick + mouse drag delta.
  const yawIn   = (photoKeys.yr ? 1 : 0) - (photoKeys.yl ? 1 : 0) + photoLook.x;
  const pitchIn = (photoKeys.pu ? 1 : 0) - (photoKeys.pd ? 1 : 0) - photoLook.y;
  photoCam.yaw   += yawIn * lookRate * dt + photoMouse.dx * 0.0032;
  photoCam.pitch += pitchIn * lookRate * dt - photoMouse.dy * 0.0032;
  photoMouse.dx = 0; photoMouse.dy = 0;
  photoCam.pitch = Math.max(-1.45, Math.min(1.45, photoCam.pitch));
  const cp = Math.cos(photoCam.pitch), sp = Math.sin(photoCam.pitch);
  const fwd = [Math.sin(photoCam.yaw) * cp, sp, -Math.cos(photoCam.yaw) * cp];
  const rgt = [Math.cos(photoCam.yaw), 0, Math.sin(photoCam.yaw)];
  const mf = (photoKeys.w ? 1 : 0) - (photoKeys.s ? 1 : 0) - photoMove.y;   // stick UP (dy<0) = forward
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
}
function enterPhotoMode() {
  if (G.photoMode) return;
  Log.info("game", "Photomode.enter");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  G.photoMode = true;
  PerfGov.setAutoRes(false);
  G._photoPrevScale = gfx.getRenderScale ? gfx.getRenderScale() : 1;
  initPhotoCam();
  document.body.classList.add("photo-mode");
  $("photo-controls").hidden = false;
  const t = $("pc-toggle"); if (t) { t.classList.add("on"); t.innerHTML = "● FREE CAMERA"; }
  window.addEventListener("keydown", photoKeyHandler, true);
  window.addEventListener("keyup", photoKeyHandler, true);
}
function exitPhotoMode() {
  if (!G.photoMode) return;
  Log.info("game", "Photomode.exit");
  G.photoMode = false;
  G.dbgCam = null;                          // hand the game camera back
  document.body.classList.remove("photo-mode", "pc-nopanel", "pc-uihidden");
  $("photo-controls").hidden = true;
  $("lighting-inner").hidden = false;     // un-hide the tuner if it was tucked away
  const pb = $("pc-panel"); if (pb) pb.textContent = "HIDE PANEL";
  const t = $("pc-toggle"); if (t) { t.classList.remove("on"); t.innerHTML = "📷 FREE CAMERA"; }
  window.removeEventListener("keydown", photoKeyHandler, true);
  window.removeEventListener("keyup", photoKeyHandler, true);
  if (gfx.setRenderScale) gfx.setRenderScale(G._photoPrevScale || 1);
  applyResMode();
}
function togglePhotoPanel() {
  const p = $("lighting-inner"); if (!p) return;
  const hide = !p.hidden;
  p.hidden = hide;
  document.body.classList.toggle("pc-nopanel", hide);
  const pb = $("pc-panel"); if (pb) pb.textContent = hide ? "SHOW PANEL" : "HIDE PANEL";
  if (G.soundOn) GameAudio.uiTick();
}
function setPhotoUiHidden(hide) {
  document.body.classList.toggle("pc-uihidden", hide);
  if (G.soundOn) GameAudio.uiTick();
}
// Dedicated key handler (not Input.onKey) so photo controls never touch driving.
function photoKeyHandler(e) {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (e.code !== "Escape" && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;  // typing in a slider
  const down = e.type === "keydown";
  let hit = true;
  switch (e.code) {
    case "KeyW": photoKeys.w = down; break;
    case "KeyS": photoKeys.s = down; break;
    case "KeyA": photoKeys.a = down; break;
    case "KeyD": photoKeys.d = down; break;
    case "KeyR": case "Space": photoKeys.up = down; break;
    case "KeyF": photoKeys.dn = down; break;
    case "ArrowUp": photoKeys.pu = down; break;
    case "ArrowDown": photoKeys.pd = down; break;
    case "ArrowLeft": photoKeys.yl = down; break;
    case "ArrowRight": photoKeys.yr = down; break;
    case "ShiftLeft": case "ShiftRight": photoKeys.boost = down; break;
    default: hit = false;
  }
  if (hit) { e.preventDefault(); e.stopPropagation(); }
}
// Virtual thumbstick: pointer offset from centre → normalised (−1..1) vector.
function wirePhotoStick(id, vec) {
  const el = $(id); if (!el) return;
  const nub = el.querySelector(".pc-nub");
  let pid = null;
  // The box and zoom are measured ONCE per drag (pointerdown) — the stick
  // only moves on resize/zoom-cap changes, never mid-hold, and gBCR +
  // currentCSSZoom per pointermove is a style-system query at up to 240 Hz.
  let _r = null, _zoom = 1;
  const set = (cx, cy) => {
    const r = _r || el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (cx - (r.left + rad)) / rad, dy = (cy - (r.top + rad)) / rad;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    vec.x = dx; vec.y = dy;
    /* Two coordinate spaces meet here. The VECTOR is a ratio of visual px
       over visual px, so zoom cancels and the drive is correct. The nub's
       translate() resolves in the element's LOCAL space, while `rad` is
       VISUAL px (the stick sits inside .pc-stickwrap's zoom) — so the nub
       travelled 40% of its throw at UI SIZE 40% and flew outside the ring
       at 200%. Divide the throw back into local px. */
    const localRad = rad / _zoom;
    if (nub) nub.style.transform = "translate(" + (dx * localRad * 0.6) + "px," + (dy * localRad * 0.6) + "px)";
  };
  const end = () => { vec.x = 0; vec.y = 0; pid = null; if (nub) nub.style.transform = "translate(0,0)"; };
  const endIf = (e) => { if (pid === null || e.pointerId === pid) end(); };
  el.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    /* THE THROW IS SPEC'D, NOT A BROWSER QUIRK. Pointer Events requires
       setPointerCapture to throw NotFoundError when the pointerId "does not
       match any of the active pointers", and the pointer can already be gone by
       the time this line runs — a touch cancelled between pointerdown and the
       handler (a rapid tap, a gesture the system claimed) is the documented
       trigger, and it is not platform-specific. An unguarded throw aborts the
       handler before set() AND before preventDefault(), so the stick reads zero
       and the page keeps the gesture. Every other capture in this repo is
       wrapped (js/game/input.js, js/game.js); this was the one that was not. */
    try { el.setPointerCapture(pid); } catch (_) {}
    _r = el.getBoundingClientRect();
    _zoom = el.currentCSSZoom || 1;
    set(e.clientX, e.clientY);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === pid) { set(e.clientX, e.clientY); e.preventDefault(); } });
  el.addEventListener("pointerup", endIf);
  el.addEventListener("pointercancel", endIf);
  /* THE STICK CAN BE TAKEN AWAY MID-HOLD, AND THEN NO pointerup EVER ARRIVES.
     css/hud.css display:none's the whole fly-cam overlay whenever a .screen.dim
     opens, and HIDE HUD does the same to everything but the restore eye — both
     can fire with a thumb down. A touch pointer holds IMPLICIT capture, so
     removing the element loses the capture instead of delivering an up, the
     vector stays at its last value, and updatePhotoCam flies the camera away
     for good. js/game/input.js added this same listener to the pedals for
     the same reason. */
  el.addEventListener("lostpointercapture", endIf);
}
function wirePhotoHold(id, on, off) {
  const el = $(id); if (!el) return;
  let pid = null;
  const release = (e) => { if (pid === null || !e || e.pointerId === pid) { pid = null; off(); } };
  el.addEventListener("pointerdown", (e) => {
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) {}
    on();
    e.preventDefault();
  });
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  /* No pointerleave: with the pointer captured it is a BOUNDARY event, fired
     the moment setPointerCapture retargets (the trap holdSetupCtl in js/game.js
     documents), so the button let go on the same press that took it. And a
     lostpointercapture is a teardown only when the button was taken away —
     WebKit keeps one capture slot, so a second finger on the other hold
     button steals it with this thumb still down (js/game/input.js
     holdTargetGone / lostCaptureShouldRelease). */
  el.addEventListener("lostpointercapture", (e) => { if (Input.holdTargetGone(el)) release(e); });   // see wirePhotoStick
}
wirePhotoStick("pc-move", photoMove);
wirePhotoStick("pc-look", photoLook);
wirePhotoHold("pc-up", () => G.photoAlt = 1, () => G.photoAlt = 0);
wirePhotoHold("pc-down", () => G.photoAlt = -1, () => G.photoAlt = 0);
/* Drag anywhere on the scene (outside the sticks) to look — mouse or a spare
   finger. THE DRAG BELONGS TO ONE POINTER, which it did not used to:
   `pointermove` on `window` accepted every pointer, so with a drag live the
   finger working a thumbstick ALSO fed photoMouse and the view whipped between
   two screen positions on every event — the sticks looked broken because the
   camera was being flung by the same touch that was steering it. And with no
   `pointercancel` handler the flag latched `true` forever the first time iOS
   claimed a touch for a system gesture, which it does routinely (edge swipe,
   notification, gesture arbitration). js/game.js's garage orbit already guards
   both ways; this is the same guard. */
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
$("pc-exit").onclick = () => { if (G.soundOn) GameAudio.uiTick(); exitPhotoMode(); };
$("pc-panel").onclick = togglePhotoPanel;
$("pc-hud").onclick = () => setPhotoUiHidden(true);
$("pc-restore").onclick = () => setPhotoUiHidden(false);
$("pc-fov").oninput = (e) => { photoCam.fov = +e.target.value; };
$("lt-help-on").onchange = (e) => {
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", e.target.checked);
};
$("lt-reset").onclick = () => {
  // Drop this condition's LOCAL edits so it falls back to the shipped file /
  // defaults. The shipped file is never touched; other CONDITIONS are only
  // reached through the legacy global layer cleared below.
  const key = ltKey();
  if (key && G._ltStore[key]) delete G._ltStore[key];
  if (G._ltStore["*"]) delete G._ltStore["*"];
  persistLightTune();
  applyLightTune();
  refreshLightTunePanel();
  $("lt-json").hidden = true;
};
/* COPY VALUES HANDS OVER THE EDITS, NOT THE WHOLE FILE. This used to export the
   file+local MERGE — every shipped preset plus the local overrides — which
   measured 805 conditions, 7071 knobs and 182,569 characters against the
   shipped light-presets.js. That is the right input for bake.mjs (a full
   REPLACE needs a full snapshot) and the wrong thing entirely for the person
   holding the phone: it cannot be pasted into a message, and #lt-json is a
   10px box capped at 120px, so hand-selecting ~4,500 lines through it is not
   hard, it is impossible. The shipped half already lives in the repo, so
   sending it back is pure noise — only the overrides carry information.

   window.LightEdits, NEVER window.LightPresets. The name is a safety
   interlock, not a preference: bake.mjs replaces the entire LightPresets
   literal, so a delta wearing that name would silently wipe every condition it
   did not mention. The distinct name lets the tools tell a delta from a
   snapshot instead of trusting whoever pastes it — merge-proposals.mjs takes
   this one and merges, bake.mjs refuses it by name.

   A JS assignment with // comments rather than bare JSON: the dividers below
   are for a human reading the paste, and the blob still loads in a single
   vm.runInContext the way merge-proposals.mjs already reads light-presets.js. */
$("lt-copy").onclick = () => {
  const btn = $("lt-copy");
  const S = G._ltStore || {};
  const here = ltKey();
  const keys = Object.keys(S).filter((k) => Object.keys(S[k] || {}).length);
  if (!keys.length) {
    btn.textContent = "NOTHING TUNED";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
    return;
  }
  const entry = (k) => '  "' + k + '": ' +
    JSON.stringify(S[k], null, 2).replace(/\n/g, "\n  ");
  const lines = ["window.LightEdits = {"];
  // THE CURRENT CONDITION FIRST, always: it is the one just tuned and the one a
  // reader checks. Key order is insertion order, so first here is first out.
  if (here && keys.includes(here)) {
    const [id, tod, wx] = here.split("|");
    const name = (G.track && G.track.def && G.track.def.name) || id;
    lines.push("  // THIS CONDITION — " + [name, tod, wx].join(" · ").toUpperCase() +
      "  (" + Object.keys(S[here]).length + " tuned)");
    lines.push(entry(here) + (keys.length > 1 ? "," : ""));
  } else {
    lines.push("  // THIS CONDITION — nothing tuned here yet");
  }
  const rest = keys.filter((k) => k !== here);
  if (rest.length) {
    lines.push("  // EVERYTHING ELSE YOU HAVE TUNED — " + rest.length +
      (rest.length === 1 ? " condition" : " conditions"));
    rest.forEach((k, i) => lines.push(entry(k) + (i < rest.length - 1 ? "," : "")));
  }
  lines.push("};");
  const json = lines.join("\n");

  const ta = $("lt-json");
  ta.value = json; ta.hidden = false;
  // readOnly stays ON: it is what keeps iOS from raising the keyboard, and
  // setSelectionRange is the select idiom that works on a readonly field where
  // select() alone does not.
  ta.focus(); ta.setSelectionRange(0, json.length);

  // THE SYNCHRONOUS ATTEMPT COMES FIRST. execCommand("copy") needs user
  // activation, and the old handler only reached it from inside the clipboard
  // promise's REJECTION handler — a microtask later. MEASURED, and the obvious
  // story turned out wrong on the browser nearest to hand: Chromium keeps
  // transient activation ~5 s, so the late call still copied there (verified by
  // reading the clipboard back, both with the API working and with it stubbed
  // to reject). WebKit is documented as the strict one — the copy must happen
  // while the gesture is being processed, not merely soon after — but that half
  // is UNVERIFIED here: this container's proxy blocks the WebKit download, so
  // nobody has run it. Ordering the synchronous attempt first costs nothing and
  // takes the engine out of the question either way. Do NOT read it as a claim
  // that the old order was broken everywhere: on Chromium it demonstrably was
  // not, and the payload size below is what a player was actually hitting.
  let ok = false;
  try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { /* not available */ }
  const flash = (good) => {
    btn.textContent = good ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    // Still preferred where it works — the only path that survives a browser
    // with execCommand removed. Either success is a success.
    navigator.clipboard.writeText(json).then(() => flash(true), () => flash(ok));
    return;
  }
  flash(ok);
};

return { initPhotoCam, updatePhotoCam, enterPhotoMode, exitPhotoMode };
}

return { create };
})();
