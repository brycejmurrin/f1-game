/* Apex 26 — GRAPHICS quality presets + the RENDERER picker. Owns the four
   presets, their persistence, #pm-gfx, #pm-renderer (WEBGL2 / THREE.JS /
   WEBGPU), ‹ › step buttons, #pm-three-path (tlxForceGL), #pm-screenshots
   (wgxCapture 2D blit), #pm-save-shot, #pm-gfx-status, and
   #pm-renderer-reset (forget the saved pick + crash flags). RENDERER lives
   here so SETTINGS can show and flip it at DOMContentLoaded — js/game.js is
   an async IIFE that awaits deferred backend scripts on an opt-in, and a
   hidden control wired after that await is invisible for the whole load and
   dead if the IIFE never reaches it.

   THE INTERACTION RULE, which is the whole design: a preset sets the FLOOR of
   degradation, never the ceiling. It is applied by handing PerfGov a user tier
   that tier() folds in with max(), so the player can always ask for LESS than
   the governor would run, and never for MORE than the device has measurably
   earned. ULTRA on a thermally-throttled laptop must not re-enable a pass the
   governor has just proved unaffordable, and the crash-sentinel floor stays
   undefeatable because it is a term in the same max().

   Self-initialising (no create(G)): it needs only PerfGov, GameStore and the
   DOM, so it does not take the G facade. Runs at DOMContentLoaded, i.e. after
   js/game.js has built the menu. Every global read is at CALL time, so this
   file has NO eval-time dependencies and needs no HARD_EDGES pair — its
   position in index.html is not load-bearing. */
const GfxQuality = (function () {
  "use strict";

// Resolved at CALL time, never at eval. Reading GameStore in the IIFE body
// would make this file's position in index.html load-bearing and cost a
// HARD_EDGES pair in tools/manifest.cjs; every read here happens from init()
// or a click, long after the whole shell has evaluated. Same for PerfGov and
// GLX below — this module deliberately has NO eval-time global reads, so it
// can sit anywhere in the load order.
function gstore() {
  return (typeof GameStore !== "undefined" && GameStore.store) || null;
}

// userTier is a FLOOR on the COST shedding ladder in js/game/perf.js:
//   0 nothing pinned off · 1 env probe · 2 +lamp shadow/SSR · 3 +car shadow
// Look-defining post (bloom / SSAO / god rays / contact / lamp volumetrics)
// reads PerfGov.autoTier() instead — GRAPHICS: LOW must not mute the lighting
// tuner. The governor and crash-sentinel floor can still shed that stack
// when the device proves it cannot afford it.
// so a bigger number means "shed at least this much cost, permanently".
//
// ULTRA and HIGH share tier 0 deliberately: both mean "do not pin anything
// off, let the governor decide". They differ only in the MOBILE boot tier
// below, because that bit is fixed at renderer init and cannot be a live knob.
// A separate AUTO stop would be indistinguishable from ULTRA and is omitted
// rather than shipped as a lie.
const PRESETS = [
  { id: "low",    label: "LOW",    tier: 4, mobileHigh: false },
  { id: "medium", label: "MEDIUM", tier: 2, mobileHigh: false },
  { id: "high",   label: "HIGH",   tier: 0, mobileHigh: false },
  { id: "ultra",  label: "ULTRA",  tier: 0, mobileHigh: true  },
];

// The shipped default differs by device class, and must match what each device
// ALREADY did before this control existed, so adding a settings button changes
// nobody's picture until they touch it: desktop ran the full stack (HIGH), and
// a phone ran the memory-safe STANDARD tier unless it had opted into
// apex26.gfxHigh (the old mobile-only toggle this control replaces).
function defaultId(isMobile) {
  if (!isMobile) return "high";
  let legacy = false;
  try { legacy = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  return legacy ? "ultra" : "medium";
}

function byId(id) { return PRESETS.find((p) => p.id === id) || null; }

let _cur = "high";
let _isMobile = false;

function current() { return byId(_cur) || PRESETS[2]; }

/* Push the preset's live half at the governor. The tier floor is the only
   part that can change without a reload — context AA, target formats and
   atlas sizes are all decided at renderer init (see the mobile boot tier
   below), so everything else waits for one. */
function applyLive() {
  const p = current();
  if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(p.tier);
}

/* The boot-time half: the mobile memory tier. Returns true if a reload is
   genuinely required, i.e. the bit actually CHANGED — a preset switch that
   leaves it alone (LOW <-> MEDIUM, HIGH on desktop) must not cost the player
   a page load. */
function syncBootTier() {
  if (!_isMobile) return false;
  const want = current().mobileHigh;
  let have = false;
  try { have = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  if (want === have) return false;
  try { localStorage.setItem("apex26.gfxHigh", want ? "1" : "0"); } catch (_) {}
  return true;
}

function label() { return "GRAPHICS: " + current().label; }

// RENDERER picker. Always three stops so the WEBGPU label is visible on a
// phone that has no navigator.gpu — picking it there flashes UNAVAILABLE
// rather than writing a pref boot will silently ignore. THREE needs no GPU.
// The control is a <select> plus ‹ › so a tap can jump WEBGL2 ↔ WEBGPU
// without opening THREE (the one-way cycle forced that path).
const BACKENDS = ["webgl2", "three", "webgpu"];
function readBackend() {
  try {
    const v = localStorage.getItem("apex26.gfxBackend");
    return v === "webgpu" || v === "three" ? v : "webgl2";
  } catch (_) { return "webgl2"; }
}
function backendLabel(v) { return v === "three" ? "THREE.JS" : String(v).toUpperCase(); }
function stepBackend(cur, dir) {
  const n = BACKENDS.length;
  const i = BACKENDS.indexOf(cur);
  return BACKENDS[(((i < 0 ? 0 : i) + dir) % n + n) % n];
}
function nextBackend(cur) { return stepBackend(cur, 1); }
function prevBackend(cur) { return stepBackend(cur, -1); }
function hasWebGPU() { return typeof navigator !== "undefined" && !!navigator.gpu; }
function boundIsGlx() {
  try { return sessionStorage.getItem("apex26.gfxBound") === "webgl2"; } catch (_) { return false; }
}
function isSelect(el) { return !!(el && el.tagName === "SELECT"); }
function paintRenderer(rb) {
  if (!rb) return;
  const pref = readBackend();
  // Preference is what the picker shows. Live may be GLX after a
  // device.lost / create refuse — saying WEBGPU then was the lie.
  const fallback = boundIsGlx() && (pref === "webgpu" || pref === "three");
  if (isSelect(rb)) {
    rb.value = pref;
    const opts = rb.options || [];
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      let t = backendLabel(opt.value);
      if (fallback && opt.value === pref) t += " (WEBGL2)";
      opt.textContent = t;
    }
    return;
  }
  rb.textContent = fallback
    ? ("RENDERER: " + backendLabel(pref) + " (WEBGL2)")
    : ("RENDERER: " + backendLabel(pref));
}
function markReloading(rb, next) {
  const msg = backendLabel(next) + " — RELOADING…";
  if (isSelect(rb) && rb.options) {
    const opts = rb.options;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].value === next) { opts[i].textContent = msg; break; }
    }
    rb.value = next;
    return;
  }
  if (rb) rb.textContent = "RENDERER: " + msg;
}
function applyBackend(next, rb) {
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
  if (next === "webgpu" && !hasWebGPU()) {
    if (isSelect(rb) && rb.options) {
      const opts = rb.options;
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === "webgpu") opts[i].textContent = "WEBGPU (UNAVAILABLE)";
      }
      rb.value = readBackend();
    } else if (rb) {
      rb.textContent = "RENDERER: WEBGPU (UNAVAILABLE)";
    }
    setTimeout(() => { paintRenderer(rb); }, 900);
    return false;
  }
  // A tap is a live tab. Disarm any in-flight boot probe so this choice
  // cannot be reverted by a title-screen refresh before the flyby presents.
  try { localStorage.setItem("apex26.gfxBackend", next); localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) {}
  try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) { /* next boot paints the new pick */ }
  // Landing on WEBGPU by hand is the retry signal (browser update, new
  // device state): reset the WGX loss ladder so the boot re-attempts from
  // the sniffed baseline instead of a rung a long-dead session earned.
  if (next === "webgpu") {
    try { localStorage.removeItem("apex26.gfxWgxLevel"); localStorage.removeItem("apex26.gfxWgxLite");
      localStorage.removeItem("apex26.gfxWgxOk"); localStorage.removeItem("apex26.gfxWgxFail"); } catch (_) {}
    try { sessionStorage.removeItem("apex26.gfxClaimFail"); } catch (_) { /* boot consumes it anyway */ }
  }
  markReloading(rb, next);
  try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {}
  setTimeout(() => { try { location.reload(); } catch (_) {} }, 350);
  return true;
}

// Keys the RESET RENDERER button drops. The GRAPHICS preset (apex26.gfxHigh
// + GameStore gfxPreset) is a quality floor, not a backend pick — leave it.
// Context-loss latches (envProbeOff / perChunkOff / ctxLostReloads) ARE
// renderer crash state: GLX/TLX write them on a GPU reset, and leaving them
// made RESET boot a "clean" WebGL2 with probe and per-chunk lamps still off.
// Session flags are the iPhone recovery half: gfxClaimFail skips the opt-in
// for the rest of the tab, and gfxBound is what the label reads after a
// fallback, so a wipe that left them would reload into the same stuck state.
const RENDERER_LS_KEYS = [
  "apex26.gfxBackend", "apex26.gfxBackendProbe",
  "apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail",
  "apex26.gfxTlxFail",
  "apex26.envProbeOff", "apex26.perChunkOff",
  "apex26.tlxForceGL", "apex26.tlxViz",
  "apex26.wgxCapture",
];
const RENDERER_SS_KEYS = ["apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads", "apex26.wgxCapture"];

function clearRendererStorage() {
  const removed = [];
  try {
    for (const k of RENDERER_LS_KEYS) {
      if (localStorage.getItem(k) != null) { localStorage.removeItem(k); removed.push(k); }
    }
  } catch (_) { /* private mode / blocked storage: in-memory boot still uses the empty pref */ }
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) { /* same */ }
  return removed;
}

function rendererSlot(el) {
  if (!el) return null;
  const p = el.parentNode;
  return (p && p.id === "pm-renderer-row") ? p : el;
}

// THREE PATH (apex26.tlxForceGL) and SCREENSHOTS (apex26.wgxCapture) are the
// two knobs that decide whether a software GPU paints a visible #game.
// Injected next to RESET RENDERER — same body-node reason as that button.
const THREE_PATHS = ["auto", "webgl2", "webgpu"];
const SHOT_MODES = ["auto", "blit", "native"];
function cycleOf(list, cur) {
  const i = list.indexOf(cur);
  return list[(((i < 0 ? 0 : i) + 1) % list.length)];
}
function readThreePath() {
  try {
    const v = localStorage.getItem("apex26.tlxForceGL");
    if (v === "1") return "webgl2";
    if (v === "0") return "webgpu";
  } catch (_) { /* blocked storage: AUTO */ }
  return "auto";
}
function threePathLabel(v) {
  return v === "webgl2" ? "WEBGL2" : v === "webgpu" ? "WEBGPU" : "AUTO";
}
function applyThreePath(next, opts) {
  try {
    if (next === "webgl2") localStorage.setItem("apex26.tlxForceGL", "1");
    else if (next === "webgpu") localStorage.setItem("apex26.tlxForceGL", "0");
    else localStorage.removeItem("apex26.tlxForceGL");
  } catch (_) { /* preference still paints from the in-memory read on next boot if storage is blocked */ }
  paintPresent();
  if (readBackend() === "three" && !(opts && opts.noReload)) {
    const btn = typeof document !== "undefined" ? document.getElementById("pm-three-path") : null;
    if (btn) btn.textContent = "THREE PATH: " + threePathLabel(next) + " — RELOADING…";
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) { /* no governor in unit harness */ }
    setTimeout(() => { try { location.reload(); } catch (_) { /* file:// / test host */ } }, 350);
    return true;
  }
  return false;
}
function readShotMode() {
  try {
    const s = sessionStorage.getItem("apex26.wgxCapture");
    if (s === "1") return "blit";
    if (s === "0") return "native";
  } catch (_) { /* fall through to localStorage */ }
  try {
    const s = localStorage.getItem("apex26.wgxCapture");
    if (s === "1") return "blit";
    if (s === "0") return "native";
  } catch (_) { /* AUTO */ }
  return "auto";
}
function shotModeLabel(v) {
  return v === "blit" ? "2D BLIT" : v === "native" ? "NATIVE" : "AUTO";
}
function writeShotMode(next) {
  const v = next === "blit" ? "1" : next === "native" ? "0" : null;
  try {
    if (v) localStorage.setItem("apex26.wgxCapture", v);
    else localStorage.removeItem("apex26.wgxCapture");
  } catch (_) { /* session write below still covers this tab */ }
  try {
    if (v) sessionStorage.setItem("apex26.wgxCapture", v);
    else sessionStorage.removeItem("apex26.wgxCapture");
  } catch (_) { /* localStorage above still persists across tabs */ }
}
function applyShotMode(next, opts) {
  writeShotMode(next);
  paintPresent();
  if (readBackend() === "webgpu" && !(opts && opts.noReload)) {
    const btn = typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null;
    if (btn) btn.textContent = "SCREENSHOTS: " + shotModeLabel(next) + " — RELOADING…";
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) { /* no governor in unit harness */ }
    setTimeout(() => { try { location.reload(); } catch (_) { /* file:// / test host */ } }, 350);
    return true;
  }
  return false;
}
function presentStatus() {
  const be = readBackend();
  const path = readThreePath();
  const shot = readShotMode();
  let live = "";
  try {
    if (typeof GLX !== "undefined" && typeof GLX.softPresent === "function" && GLX.softPresent()) {
      live = " Live: 2D blit is painting #game.";
    }
  } catch (_) { /* no live backend yet */ }
  if (be === "webgpu") {
    if (shot === "native") {
      return "WEBGPU native swapchain. On a software GPU the canvas stays black — screenshots need SCREENSHOTS: 2D BLIT." + live;
    }
    if (shot === "blit") {
      return "WEBGPU 2D BLIT: each frame is copied onto the canvas so screenshots work. Native swapchain is unused." + live;
    }
    return "WEBGPU AUTO: software GPUs 2D-blit onto the canvas (screenshots work). A real GPU uses the native swapchain." + live;
  }
  if (be === "three") {
    if (path === "webgl2") return "THREE.JS is pinned to WebGL2 — the canvas is visible and screenshots just work.";
    if (path === "webgpu") {
      return "THREE.JS is pinned to WebGPU. Software GPUs paint black (no 2D blit). Switch THREE PATH to WEBGL2 for screenshots.";
    }
    return "THREE.JS AUTO: phones, Safari, and software GPUs use WebGL2 (screenshots work). Desktop Chrome on a real GPU may pick WebGPU.";
  }
  return "WEBGL2 paints the canvas directly. Screenshots just work.";
}
function paintPresent() {
  const pathBtn = typeof document !== "undefined" ? document.getElementById("pm-three-path") : null;
  if (pathBtn) pathBtn.textContent = "THREE PATH: " + threePathLabel(readThreePath());
  const shotBtn = typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null;
  if (shotBtn) shotBtn.textContent = "SCREENSHOTS: " + shotModeLabel(readShotMode());
  const st = typeof document !== "undefined" ? document.getElementById("pm-gfx-status") : null;
  if (st) st.textContent = presentStatus();
}
function saveScreenshot() {
  const btn = typeof document !== "undefined" ? document.getElementById("pm-save-shot") : null;
  const done = (ok, msg) => {
    if (btn) btn.textContent = ok ? "SAVE SCREENSHOT — SAVED" : ("SAVE SCREENSHOT — " + (msg || "FAILED"));
    setTimeout(() => { if (btn) btn.textContent = "SAVE SCREENSHOT"; }, 1600);
  };
  const run = async () => {
    try {
      if (typeof GLX !== "undefined" && typeof GLX.awaitSoftPresent === "function") {
        try { await GLX.awaitSoftPresent(8000); } catch (_) { /* still try the canvas */ }
      }
      const g = typeof document !== "undefined" ? document.getElementById("game") : null;
      let href = null;
      if (g && typeof g.toDataURL === "function") {
        try { href = g.toDataURL("image/png"); } catch (_) { href = null; }
      }
      if (!href && typeof GLX !== "undefined" && typeof GLX.capturePixels === "function") {
        const cap = await GLX.capturePixels();
        if (typeof document === "undefined" || typeof document.createElement !== "function") {
          done(false, "NO DOM"); return;
        }
        const c = document.createElement("canvas");
        c.width = cap.width; c.height = cap.height;
        const ctx2 = c.getContext && c.getContext("2d");
        if (!ctx2 || typeof ctx2.putImageData !== "function") { done(false, "NO 2D"); return; }
        ctx2.putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
        href = c.toDataURL("image/png");
      }
      if (!href) { done(false, "BLANK"); return; }
      const a = document.createElement("a");
      a.href = href;
      a.download = "apex26-" + readBackend() + ".png";
      if (typeof a.click === "function") a.click();
      done(true);
    } catch (_) {
      done(false, "FAILED");
    }
  };
  run();
  return true;
}
function initPresentControls() {
  const reset = typeof document !== "undefined" ? document.getElementById("pm-renderer-reset") : null;
  const slot = rendererSlot(typeof document !== "undefined" ? document.getElementById("pm-renderer") : null);
  const host = (reset && reset.parentNode) || (slot && slot.parentNode);
  if (!host || document.getElementById("pm-three-path")) return;
  if (typeof document.createElement !== "function") return;

  let after = reset || slot;
  function add(el) {
    if (typeof host.insertBefore === "function") host.insertBefore(el, after ? after.nextSibling : null);
    else if (typeof host.appendChild === "function") host.appendChild(el);
    after = el;
    return el;
  }
  function addBtn(id, title) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.title = title;
    return add(btn);
  }

  const pathBtn = addBtn("pm-three-path",
    "three.js GPU path. AUTO = phones/Safari/software WebGL2. WEBGL2 = screenshots work (the CI pin). WEBGPU = three's own WebGPU; software GPUs stay black.");
  const shotBtn = addBtn("pm-screenshots",
    "WebGPU screenshot path. AUTO = 2D blit on software GPUs. 2D BLIT = always copy frames onto the canvas (screenshots work; native swapchain unused). NATIVE = swapchain only — black on software GPUs.");
  const saveBtn = addBtn("pm-save-shot",
    "Download the visible #game canvas as a PNG. Waits for the WebGPU 2D blit first. On three.js WebGPU (black canvas) switch THREE PATH to WEBGL2.");
  const status = document.createElement("p");
  status.id = "pm-gfx-status";
  add(status);

  paintPresent();
  try { window.addEventListener("apex-gfx-live", paintPresent); } catch (_) { /* no window */ }
  pathBtn.onclick = function () {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    applyThreePath(cycleOf(THREE_PATHS, readThreePath()));
  };
  shotBtn.onclick = function () {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    applyShotMode(cycleOf(SHOT_MODES, readShotMode()));
  };
  saveBtn.onclick = function () {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    saveScreenshot();
  };
}

function initReset() {
  const anchor = typeof document !== "undefined" ? document.getElementById("pm-renderer") : null;
  const slot = rendererSlot(anchor);
  const host = slot && slot.parentNode;
  if (!host || document.getElementById("pm-renderer-reset")) return;
  // Injected, not written into index.html: same reason PerfTry / CockpitOpts
  // generate their SETTINGS rows — the shell's DOM-node ratchet counts tags
  // in the file, and this button mints no new CSS class.
  const btn = document.createElement("button");
  btn.id = "pm-renderer-reset";
  btn.textContent = "RESET RENDERER";
  btn.title = "Forget the saved renderer pick, THREE PATH, SCREENSHOTS, and the crash/fallback flags, then reload on WebGL2. Use this if THREE.JS or WEBGPU crashed or will not load, especially on iPhone.";
  host.insertBefore(btn, slot.nextSibling);
  btn.onclick = () => {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
    clearRendererStorage();
    btn.textContent = "RESET RENDERER — RELOADING…";
    // A settings-driven reload with the crash sentinel armed looks like a
    // jetsam kill (js/game/perf.js) and would cost a quality strike.
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {}
    setTimeout(() => { try { location.reload(); } catch (_) {} }, 350);
  };
}

function replaceNode(old, next) {
  if (typeof old.replaceWith === "function") { old.replaceWith(next); return true; }
  const host = old.parentNode;
  if (host && typeof host.replaceChild === "function") { host.replaceChild(next, old); return true; }
  return false;
}

function mountRendererPicker(old) {
  if (!old || isSelect(old)) return old;
  if (typeof document === "undefined" || typeof document.createElement !== "function") return old;
  const row = document.createElement("div");
  const prev = document.createElement("button");
  const sel = document.createElement("select");
  const next = document.createElement("button");
  // Stub hosts (unit harnesses) only implement the bits they assert.
  // Keep the original button and the one-way click fallback there.
  if (typeof row.appendChild !== "function" || typeof sel.appendChild !== "function") return old;
  row.id = "pm-renderer-row";
  prev.id = "pm-renderer-prev";
  prev.type = "button";
  prev.textContent = "‹";
  if (typeof prev.setAttribute === "function") prev.setAttribute("aria-label", "Previous renderer");
  sel.id = "pm-renderer";
  sel.title = "WEBGL2 paints the canvas (screenshots work). THREE.JS is the three.js backend — use THREE PATH for WebGL2 vs WebGPU. WEBGPU is hand-written WebGPU — use SCREENSHOTS for 2D blit vs native swapchain.";
  if (typeof sel.setAttribute === "function") sel.setAttribute("aria-label", "Renderer");
  for (let i = 0; i < BACKENDS.length; i++) {
    const opt = document.createElement("option");
    opt.value = BACKENDS[i];
    opt.textContent = backendLabel(BACKENDS[i]);
    sel.appendChild(opt);
  }
  next.id = "pm-renderer-next";
  next.type = "button";
  next.textContent = "›";
  if (typeof next.setAttribute === "function") next.setAttribute("aria-label", "Next renderer");
  row.appendChild(prev);
  row.appendChild(sel);
  row.appendChild(next);
  if (!replaceNode(old, row)) return old;
  return sel;
}

function initRenderer() {
  let rb = typeof document !== "undefined" ? document.getElementById("pm-renderer") : null;
  if (!rb) return;
  rb = mountRendererPicker(rb);
  rb.hidden = false;
  paintRenderer(rb);
  if (rb._apexRendererWired) return;
  rb._apexRendererWired = true;
  try { window.addEventListener("apex-gfx-live", function () { paintRenderer(document.getElementById("pm-renderer")); paintPresent(); }); } catch (_) { /* no window */ }
  if (isSelect(rb) && typeof rb.addEventListener === "function") {
    rb.addEventListener("change", function () { applyBackend(rb.value, rb); });
    const prev = document.getElementById("pm-renderer-prev");
    const next = document.getElementById("pm-renderer-next");
    if (prev) prev.onclick = function () { applyBackend(prevBackend(readBackend()), rb); };
    if (next) next.onclick = function () { applyBackend(nextBackend(readBackend()), rb); };
    return;
  }
  rb.onclick = function () { applyBackend(nextBackend(readBackend()), rb); };
}

function set(id, opts) {
  const p = byId(id);
  if (!p) return false;
  _cur = p.id;
  const st = gstore(); if (st) st.set("gfxPreset", _cur);
  applyLive();
  const needsReload = syncBootTier();
  const btn = typeof document !== "undefined" ? document.getElementById("pm-gfx") : null;
  if (btn) btn.textContent = needsReload ? label() + " — RELOADING…" : label();
  if (needsReload && !(opts && opts.noReload)) {
    // Disarm the crash sentinel FIRST. It detects a jetsam/OOM kill by finding
    // the in-race flag still set at the next boot (js/game/perf.js), so a
    // settings-driven reload with the flag armed is indistinguishable from the
    // phone dying — it would cost the player a crash strike and pre-degrade
    // the very quality they just asked to raise.
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {}
    setTimeout(() => { try { location.reload(); } catch (_) {} }, 260);
  }
  return true;
}

function cycle() {
  const i = PRESETS.findIndex((p) => p.id === _cur);
  return set(PRESETS[(i + 1) % PRESETS.length].id);
}

function init() {
  // GLX.isMobile is the device class, NOT GLX.mobileTier — the tier is already
  // downstream of apex26.gfxHigh (glx.js: MOBILE_TIER = IS_MOBILE && !_gfxHigh),
  // so reading it here would make the control's default depend on its own last
  // setting. The typeof guard is the standalone-harness fallback, the same one
  // js/car/liverytex.js uses.
  _isMobile = typeof GLX !== "undefined" && !!GLX.isMobile;
  const st = gstore();
  _cur = (st && st.get("gfxPreset", null)) || defaultId(_isMobile);
  if (!byId(_cur)) _cur = defaultId(_isMobile);
  applyLive();
  initRenderer();
  initReset();
  initPresentControls();

  const btn = typeof document !== "undefined" ? document.getElementById("pm-gfx") : null;
  if (!btn) return;      // shell without the button: the tier floor still applied above
  // Shown to EVERYONE now. It used to be mobile-only on the reasoning that
  // "desktop is always full quality", but a desktop that cannot hold its
  // budget is exactly the case the shedding ladder exists for, and before this
  // the only desktop-visible control was RESOLUTION — which pins the scale and
  // says nothing about which passes run.
  btn.hidden = false;
  btn.textContent = label();
  btn.onclick = () => {
    cycle();
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
  };
}

if (typeof document !== "undefined") {
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}

return { PRESETS, init, set, cycle, current: () => current().id, label, defaultId,
  nextBackend, prevBackend, applyBackend, backendLabel, readBackend, clearRendererStorage,
  RENDERER_LS_KEYS, RENDERER_SS_KEYS,
  THREE_PATHS, SHOT_MODES, readThreePath, applyThreePath, threePathLabel,
  readShotMode, applyShotMode, shotModeLabel, presentStatus, saveScreenshot };
})();
