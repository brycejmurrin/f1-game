/* Apex 26 — GRAPHICS quality presets + the RENDERER picker. Owns the four presets, their persistence, #pm-gfx, #pm-renderer (WEBGL2 / THREE.JS / WEBGPU), ‹ › step… */
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
// A reload from the in-race SETTINGS sheet ends the race, its lap times, an
// unsettled career round and (VS FRIEND) the peer session — with one tap and
// no warning (2026-09-01 survey). game.js marks body[data-race] while a race
// is up; the first tap then ARMS the control (same dataset.armed idiom as
// game.js armConfirm) and only the second tap proceeds. Called BEFORE any
// preference is written, so an unconfirmed tap changes nothing.
//
// An arm EXPIRES (ARM_MS) and `repaint` puts the real label back: a tap that
// was never confirmed used to leave "END THIS RACE & RELOAD?" on the row for
// the rest of the session, and the flag it set outlived the race — the first
// tap of the NEXT race then reloaded with no question asked (2026-09-02
// audit). On a <select> the question goes on the option in view: setting
// textContent on a select replaces its options with a text node and the
// picker painted empty for as long as it stayed armed.
const ARM_MS = 6000;
function disarm(btn, repaint) {
  try {
    if (btn._apexArmT) { clearTimeout(btn._apexArmT); btn._apexArmT = 0; }
    if (btn.dataset) delete btn.dataset.armed;
    try { btn.classList.remove("armed"); } catch (_) { /* option element */ }
  } catch (_) { /* dataset unavailable */ }
  if (typeof repaint === "function") { try { repaint(); } catch (_) { /* label stays until the next paint */ } }
}
function raceGuard(btn, armedText, repaint) {
  try {
    if (typeof document === "undefined" || !document.body || !btn) return true;
    if (document.body.dataset.race !== "1") {
      // No race to protect: a flag left over from one is stale, not consent.
      if (btn.dataset && btn.dataset.armed) disarm(btn, repaint);
      return true;
    }
    // Age as well as the timer: a throttled background tab can hold the
    // expiry back for minutes, and a tap that old is a fresh question.
    const stale = !!btn.dataset.armed && (Date.now() - (btn._apexArmedAt || 0)) > ARM_MS;
    if (!btn.dataset.armed || stale) {
      btn.dataset.armed = "1";
      btn._apexArmedAt = Date.now();
      if (isSelect(btn) && btn.options) {
        const opts = btn.options;
        for (let i = 0; i < opts.length; i++) if (opts[i].value === btn.value) opts[i].textContent = armedText;
      } else {
        btn.textContent = armedText;
      }
      try { btn.classList.add("armed"); } catch (_) { /* option element */ }
      if (btn._apexArmT) clearTimeout(btn._apexArmT);
      btn._apexArmT = setTimeout(() => disarm(btn, repaint), ARM_MS);
      return false;
    }
    if (btn._apexArmT) { clearTimeout(btn._apexArmT); btn._apexArmT = 0; }
    delete btn.dataset.armed;
    try { btn.classList.remove("armed"); } catch (_) { /* option element */ }
  } catch (_) { /* dataset unavailable: proceed as before */ }
  return true;
}
function applyBackend(next, rb) {
  if (!raceGuard(rb, "RENDERER: END THIS RACE & RELOAD?", () => paintRenderer(rb))) return false;
  Log.info("game", "GfxQuality.applyBackend " + next);
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

const RENDERER_LS_KEYS = [
  "apex26.gfxBackend", "apex26.gfxBackendProbe",
  "apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail",
  "apex26.gfxTlxFail",
  "apex26.envProbeOff", "apex26.perChunkOff",
  "apex26.tlxForceGL", "apex26.tlxViz",
  "apex26.wgxCapture",
];
const RENDERER_SS_KEYS = ["apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads", "apex26.wgxCapture", "apex26.tlxAutoGL"];

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
function liveThreeApi() {
  if (readBackend() !== "three") return null;
  try {
    const tlx = typeof GLX !== "undefined" && GLX && GLX.__tlx;
    if (tlx && typeof tlx.backendState === "function") {
      const s = tlx.backendState();
      if (s && (s.api === "webgpu" || s.api === "webgl2")) return s.api;
    }
  } catch (_) { /* paint before TLX is live */ }
  try {
    const g = typeof document !== "undefined" ? document.getElementById("game") : null;
    const eng = g && typeof g.getAttribute === "function" ? g.getAttribute("data-engine") : "";
    if (/webgl2/i.test(eng || "")) return "webgl2";
    if (/webgpu/i.test(eng || "")) return "webgpu";
  } catch (_) { /* no canvas yet */ }
  return null;
}
function threePathLabel(v) {
  if (v === "webgl2") return "WEBGL2";
  if (v === "webgpu") return "WEBGPU";
  const live = (v === "auto") ? liveThreeApi() : null;
  if (live === "webgpu") return "AUTO (WEBGPU)";
  if (live === "webgl2") return "AUTO (WEBGL2)";
  return "AUTO";
}
function applyThreePath(next, opts) {
  if (readBackend() === "three" && !(opts && opts.noReload) &&
      !raceGuard(typeof document !== "undefined" ? document.getElementById("pm-three-path") : null, "THREE PATH: END THIS RACE & RELOAD?", paintPresent)) return false;
  try {
    if (next === "webgl2") localStorage.setItem("apex26.tlxForceGL", "1");
    else if (next === "webgpu") localStorage.setItem("apex26.tlxForceGL", "0");
    else localStorage.removeItem("apex26.tlxForceGL");
    try { sessionStorage.removeItem("apex26.tlxAutoGL"); } catch (_) { /* AUTO stay-GL latch is session-only */ }
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
function shotReloadLive() {
  const be = readBackend();
  if (be === "webgpu") return true;
  // THREE PATH: WEBGPU uses the same SCREENSHOTS key for the LDR 2D blit.
  return be === "three" && readThreePath() === "webgpu";
}
function applyShotMode(next, opts) {
  if (shotReloadLive() && !(opts && opts.noReload) &&
      !raceGuard(typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null, "SCREENSHOTS: END THIS RACE & RELOAD?", paintPresent)) return false;
  writeShotMode(next);
  paintPresent();
  if (shotReloadLive() && !(opts && opts.noReload)) {
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
      return "WEBGPU 2D BLIT: each frame is copied onto the canvas so screenshots work (a per-frame CPU copy — on a real GPU it applies to this tab only; a new tab is back to AUTO)." + live;
    }
    return "WEBGPU AUTO: software GPUs 2D-blit onto the canvas (screenshots work). A real GPU uses the native swapchain." + live;
  }
  if (be === "three") {
    if (path === "webgl2") return "THREE.JS is pinned to WebGL2 — the canvas is visible and screenshots just work.";
    if (path === "webgpu") {
      if (shot === "native") {
        return "THREE.JS is pinned to WebGPU, native swapchain. Software GPUs stay black — SCREENSHOTS: 2D BLIT copies the LDR target onto #game." + live;
      }
      if (shot === "blit") {
        return "THREE.JS is pinned to WebGPU, 2D BLIT: the LDR target is copied onto #game (copyTextureToBuffer, never getCurrentTexture)." + live;
      }
      return "THREE.JS is pinned to WebGPU. AUTO 2D-blits the LDR target on software GPUs so screenshots work. SCREENSHOTS: NATIVE leaves the swapchain black." + live;
    }
    const api = liveThreeApi();
    if (api === "webgpu") {
      return "THREE.JS AUTO is WebGPU (phones/Safari use a lite stack)." + (live ? live : " Software GPUs 2D-blit the LDR target so screenshots work.");
    }
    if (api === "webgl2") {
      return "THREE.JS AUTO is three WebGL2 — still TLX, not game WEBGL2. THREE PATH: WEBGPU pins three WebGPU.";
    }
    return "THREE.JS AUTO can be WebGPU or three WebGL2. It tries WebGPU when navigator.gpu exists, and stays on three WebGL2 if GPU is missing, this tab already lost WebGPU, or the browser is Safari/iOS (WebKit WebGPU drew nothing on a phone — THREE PATH: WEBGPU opts back in).";
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
      const soft = typeof GLX !== "undefined" && typeof GLX.softPresent === "function" && GLX.softPresent();
      // Soft-present #game is the native WebGPU swapchain (often black). Prefer
      // capturePixels (LDR copyTextureToBuffer) when the 2D blit is armed.
      let capFailed = false;
      if (soft && typeof GLX.capturePixels === "function") {
        try {
          const cap = await GLX.capturePixels();
          const c = document.createElement("canvas");
          c.width = cap.width; c.height = cap.height;
          const ctx2 = c.getContext && c.getContext("2d");
          if (ctx2 && typeof ctx2.putImageData === "function") {
            ctx2.putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
            href = c.toDataURL("image/png");
          }
        } catch (_) { href = null; capFailed = true; /* fall through to #game */ }
      }
      if (!href && g && typeof g.toDataURL === "function") {
        try { href = g.toDataURL("image/png"); } catch (_) { href = null; }
      }
      // Never re-await a capturePixels() that just rejected — on software
      // adapters the post-soft-present readback flake repeats, and the user
      // would sit through two full GPU round-trips to reach the same FAILED.
      if (!href && !capFailed && typeof GLX !== "undefined" && typeof GLX.capturePixels === "function") {
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
    "three.js GPU path. AUTO can be WebGPU or three WebGL2. It tries WebGPU when navigator.gpu exists, except on Safari/iOS (three WebGL2). WEBGL2 / WEBGPU pin one path.");
  const shotBtn = addBtn("pm-screenshots",
    "WebGPU / three-WebGPU screenshot path. AUTO = 2D blit on software GPUs. 2D BLIT = copy the frame onto #game (WGX soft-present / TLX readRenderTargetPixelsAsync). NATIVE = swapchain only — black on software GPUs.");
  const saveBtn = addBtn("pm-save-shot",
    "Download the visible #game canvas as a PNG. Waits for the 2D blit first (WGX or TLX-WebGPU).");
  // The label was only ever written by saveScreenshot()'s done() — the button
  // painted as an EMPTY plate until its first click (screenshot, 2026-09-02).
  saveBtn.textContent = "SAVE SCREENSHOT";
  // COPY DIAG: __apex.diag() as JSON on the clipboard. A phone report used to
  // be a screenshot of the GOV panel, whose right edge clips the one number
  // that matters; env.backendState carries api, gpuErrors, the first GPU/WGSL
  // error, the soft-present counters, the pack state and the debug switches.
  const diagBtn = addBtn("pm-copy-diag",
    "Copy __apex.diag() (renderer/backend state, GPU errors, device, build) to the clipboard as JSON, to paste into a bug report.");
  diagBtn.textContent = "COPY DIAG";
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
  diagBtn.onclick = function () {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    copyDiag(diagBtn);
  };
}

// __apex.diag({download:false}) → clipboard. clipboard.writeText needs a
// secure context and can reject (iOS wants a user gesture, which this is);
// the hidden-textarea execCommand fallback is what makes it work over plain
// http and on older WebKit — the same two-step js/game/gfx-debug.js uses.
function copyDiag(btn) {
  const label = (t) => { if (btn) btn.textContent = t; };
  const reset = () => setTimeout(() => label("COPY DIAG"), 1600);
  let text = "";
  try {
    const d = (typeof __apex !== "undefined" && __apex.diag) ? __apex.diag({ download: false }) : null;
    text = d ? JSON.stringify(d, null, 1) : "";
  } catch (e) { text = ""; }
  if (!text) { label("COPY DIAG — NO DIAG"); reset(); return; }
  const done = () => { label("COPY DIAG — COPIED"); reset(); };
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) done(); else { label("COPY DIAG — FAILED"); reset(); }
    } catch (_) { label("COPY DIAG — FAILED"); reset(); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
      return;
    }
  } catch (_) { /* fall through */ }
  fallback();
}

function initReset() {
  const anchor = typeof document !== "undefined" ? document.getElementById("pm-renderer") : null;
  const slot = rendererSlot(anchor);
  const host = slot && slot.parentNode;
  if (!host || document.getElementById("pm-renderer-reset")) return;
  // Injected, not written into index.html: same reason CockpitOpts generates
  // its SETTINGS rows — the shell's DOM-node ratchet counts tags in the file,
  // and this button mints no new CSS class.
  const btn = document.createElement("button");
  btn.id = "pm-renderer-reset";
  btn.textContent = "RESET RENDERER";
  btn.title = "Forget the saved renderer pick, THREE PATH, SCREENSHOTS, and the crash/fallback flags, then reload on WebGL2. Use this if THREE.JS or WEBGPU crashed or will not load, especially on iPhone.";
  host.insertBefore(btn, slot.nextSibling);
  btn.onclick = () => {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
    if (!raceGuard(btn, "RESET RENDERER: END THIS RACE & RELOAD?", () => { btn.textContent = "RESET RENDERER"; })) return;
    clearRendererStorage();
    btn.textContent = "RESET RENDERER — RELOADING…";
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
  Log.info("game", "GfxQuality.set " + _cur);
  const st = gstore(); if (st) st.set("gfxPreset", _cur);
  applyLive();
  // The lighting store's conditional shipped layer (the ULTRA-night per-chunk
  // rung) resolves through the CURRENT preset, so a flip must re-run the
  // lighting apply to engage live. Lazy, like the PerfGov poke above.
  try { if (typeof LightStore !== "undefined" && LightStore.reapply) LightStore.reapply(); } catch (_) { /* pre-boot: the first apply() resolves it */ }
  const needsReload = syncBootTier();
  const btn = typeof document !== "undefined" ? document.getElementById("pm-gfx") : null;
  if (btn) btn.textContent = needsReload ? label() + " — RELOADING…" : label();
  if (needsReload && !(opts && opts.noReload)) {
    // In a race the preset is already live; the boot-tier half waits for the
    // next natural reload instead of ending the race here (2026-09-01 survey).
    let inRace = false;
    try { inRace = typeof document !== "undefined" && !!document.body && document.body.dataset.race === "1"; } catch (_) { /* no body */ }
    if (inRace) { if (btn) btn.textContent = label() + " — FULLY APPLIES AFTER A RELOAD"; return true; }
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
  Log.info("game", "GfxQuality.init");
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
  THREE_PATHS, SHOT_MODES, readThreePath, applyThreePath, threePathLabel, liveThreeApi,
  readShotMode, applyShotMode, shotModeLabel, presentStatus, saveScreenshot, ARM_MS };
})();
