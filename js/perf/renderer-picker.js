/* Apex 26 — RendererPicker: the RENDERER control in SETTINGS > DISPLAY. Owns #pm-renderer (a <select> with ‹ › steps over WEBGL2 / THREE.JS / WEBGPU) and the RENDERER fold (#pm-display-adv) whose shell body holds RESOLUTION / the picker / GRAPHICS; RESET RENDERER, THREE PATH, SCREENSHOTS, SAVE SCREENSHOT, COPY DIAG and #pm-gfx-status inject into that body. The apex26.gfxBackend / gfxWgx* / tlxForceGL / wgxCapture keys those write; the in-race two-tap reload confirm (raceGuard / ARM_MS) is shared by every reloading control.

   Split out of js/perf/quality-preset.js (Phase 2a of docs/research/TREE-RESTRUCTURE-2026-09.md): that file is the GRAPHICS quality PRESET model and button; this one is which backend boots. Same load-order stance — every global read (GLX, PerfGov, GameAudio, __apex) is resolved at CALL time, never at eval, so the file has no HARD_EDGES pair and can sit anywhere in the shell. */
const RendererPicker = (function () {
  "use strict";

// RENDERER picker. Always three stops so the WEBGPU label is visible on a
// phone that has no navigator.gpu — picking it there flashes UNAVAILABLE
// rather than writing a pref boot will silently ignore. THREE needs no GPU.
// The control is a <select> plus ‹ › so a tap can jump WEBGL2 ↔ WEBGPU
// without opening THREE (the one-way cycle forced that path).
const BACKENDS = ["webgl2", "three", "webgpu"];
// A stop is UNAVAILABLE when the device cannot run it OR its files are not in
// the tree — both reach the same affordance the header describes, so the label
// stays visible and says so instead of writing a pref boot silently ignores.
// Derived, not hardcoded — and that derivation is why this file needed NO edit
// when the backends came back on 2026-09-04: the stops greyed out because
// DEFERRED was {} after the spike-out, and went live again the moment it was
// repopulated. A hardcoded list would have had to be found and changed twice.
const hasBackendFiles = (b) => b === "webgl2" ||
  !!(typeof ApexRoster !== "undefined" && ApexRoster.DEFERRED &&
     (ApexRoster.DEFERRED[b] || []).length);
const available = (b) => hasBackendFiles(b) && (b !== "webgpu" || hasWebGPU());
function readBackend() {
  const v = GameStore.store.raw("apex26.gfxBackend");
  return v === "webgpu" || v === "three" ? v : "webgl2";
}
function backendLabel(v) { return v === "three" ? "THREE.JS" : String(v).toUpperCase(); }
// What is actually DRAWING, as opposed to what is stored. readBackend() is the
// PICK and must stay that way — the select's value, and the value a re-attach
// restores — but the metrics overlay's `backend` line is a diagnostic, and it
// reported "three" on a build that cannot load three.
function liveBackend() { return available(readBackend()) ? readBackend() : "webgl2"; }
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
  //
  // …and it is GLX for a second reason now: a pick whose FILES are gone. That
  // case cannot reach boundIsGlx(), because the only writers of
  // apex26.gfxBound were wgx.js and tlx.js and they left with the backends —
  // nothing in the shipped tree has written that key since the spike-out. So a
  // returning player still holding apex26.gfxBackend="three" (anyone who tried
  // the stops before today) read a flat "RENDERER: THREE.JS" while GLX drew
  // every frame. `available()` is the signal gfxBound used to be.
  const fallback = (boundIsGlx() || !available(pref)) && (pref === "webgpu" || pref === "three");
  if (isSelect(rb)) {
    rb.value = pref;
    const opts = rb.options || [];
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      let t = backendLabel(opt.value);
      if (fallback && opt.value === pref) t += " (WEBGL2)";
      opt.textContent = t;
    }
    paintRendererSummary(pref, fallback);
    return;
  }
  rb.textContent = fallback
    ? ("RENDERER: " + backendLabel(pref) + " (WEBGL2)")
    : ("RENDERER: " + backendLabel(pref));
  paintRendererSummary(pref, fallback);
}
function paintRendererSummary(pref, fallback) {
  const sum = typeof document !== "undefined"
    ? document.getElementById("pm-renderer-details-sum")
    : null;
  if (!sum) return;
  sum.innerHTML = '<span data-fold="k">RENDERER</span><span data-fold="sep"> · </span><span data-fold="val">' +
    backendLabel(pref) + "</span>" + (fallback
      ? '<span data-fold="sep"> · </span><span data-fold="val">WEBGL2</span>' : "");
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
  Log.info("game", "RendererPicker.applyBackend " + next);
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
  if (!available(next)) {
    if (isSelect(rb) && rb.options) {
      const opts = rb.options;
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === next) opts[i].textContent = backendLabel(next) + " (UNAVAILABLE)";
      }
      rb.value = readBackend();
    } else if (rb) {
      rb.textContent = "RENDERER: " + backendLabel(next) + " (UNAVAILABLE)";
    }
    setTimeout(() => { paintRenderer(rb); }, 900);
    return false;
  }
  GameStore.store.rawSet("apex26.gfxBackend", next); GameStore.store.rawDel("apex26.gfxBackendProbe");
  try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) { /* next boot paints the new pick */ }
  // Landing on WEBGPU by hand is the retry signal (browser update, new
  // device state): reset the WGX loss ladder so the boot re-attempts from
  // the sniffed baseline instead of a rung a long-dead session earned.
  if (next === "webgpu") {
    for (const k of ["apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail"]) GameStore.store.rawDel(k);
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
// wgxHoldPresent is written by WGX itself (holdSoftPresent), so a tab that
// took the hold and never released it keeps skipping the soft-present
// copy+map on the next boot with no way back — RESET RENDERER is that way
// back, and it has to know the key exists. Every latch a backend WRITES
// belongs in one of these two lists.
const RENDERER_SS_KEYS = ["apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads", "apex26.wgxCapture", "apex26.tlxAutoGL", "apex26.wgxHoldPresent"];

function clearRendererStorage() {
  const removed = [];
  // Blocked storage reads as null and removes nothing: the in-memory boot still uses the empty pref.
  for (const k of RENDERER_LS_KEYS) {
    if (GameStore.store.raw(k) != null) { GameStore.store.rawDel(k); removed.push(k); }
  }
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) { /* private mode / blocked storage */ }
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
  const v = GameStore.store.raw("apex26.tlxForceGL");   // blocked storage: null, AUTO
  if (v === "1") return "webgl2";
  if (v === "0") return "webgpu";
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
  // A blocked write is recorded in store.broken; the preference still paints from the in-memory read.
  if (next === "webgl2") GameStore.store.rawSet("apex26.tlxForceGL", "1");
  else if (next === "webgpu") GameStore.store.rawSet("apex26.tlxForceGL", "0");
  else GameStore.store.rawDel("apex26.tlxForceGL");
  try { sessionStorage.removeItem("apex26.tlxAutoGL"); } catch (_) { /* AUTO stay-GL latch is session-only */ }
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
  const s = GameStore.store.raw("apex26.wgxCapture");   // blocked: null, AUTO
  if (s === "1") return "blit";
  if (s === "0") return "native";
  return "auto";
}
function shotModeLabel(v) {
  return v === "blit" ? "2D BLIT" : v === "native" ? "NATIVE" : "AUTO";
}
function writeShotMode(next) {
  const v = next === "blit" ? "1" : next === "native" ? "0" : null;
  if (v) GameStore.store.rawSet("apex26.wgxCapture", v);   // blocked: the session write below still covers this tab
  else GameStore.store.rawDel("apex26.wgxCapture");
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
function ensureAdvHost() {
  const existing = typeof document !== "undefined" ? document.getElementById("pm-display-adv-body") : null;
  if (existing) return existing;
  if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
  const panel = document.getElementById("pm-panel-display");
  const slot = rendererSlot(document.getElementById("pm-renderer"));
  const gfx = document.getElementById("pm-gfx");
  const host = panel || (slot && slot.parentNode) || (gfx && gfx.parentNode);
  if (!host) return null;

  const details = document.createElement("details");
  details.id = "pm-display-adv";
  const summary = document.createElement("summary");
  summary.id = "pm-renderer-details-sum";
  summary.className = "adv-more-btn";
  summary.textContent = "RENDERER · WEBGL2";
  summary.title = "Resolution, backend, quality, recovery, screenshots, and diagnostics";
  const body = document.createElement("div");
  body.id = "pm-display-adv-body";
  if (typeof body.setAttribute === "function") {
    body.setAttribute("role", "group");
    body.setAttribute("aria-label", "Advanced display");
  }
  if (typeof details.appendChild === "function") {
    details.appendChild(summary);
    details.appendChild(body);
  }
  // After GRAPHICS when it is a sibling (player quality stays on the sheet);
  // otherwise after the renderer row. JS-built so the shell-node ratchet
  // does not see a new tag — same reason RESET RENDERER is injected.
  const after = (gfx && gfx.parentNode === host) ? gfx
    : (slot && slot.parentNode === host) ? slot
    : null;
  if (typeof host.insertBefore === "function") host.insertBefore(details, after ? after.nextSibling : null);
  else if (typeof host.appendChild === "function") host.appendChild(details);
  return body;
}

function initPresentControls() {
  if (typeof document !== "undefined" && document.getElementById("pm-three-path")) return;
  const host = ensureAdvHost();
  if (!host || typeof document.createElement !== "function") return;

  function add(el) {
    if (typeof host.appendChild === "function") host.appendChild(el);
    return el;
  }
  function addBtn(id, title) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.title = title;
    return add(btn);
  }

  // THREE PATH and SCREENSHOTS steer WGX/TLX-only behaviour — the three.js GPU
  // path, and the soft-present blit those two backends need to show a frame on
  // a software GPU. With DEFERRED empty neither can do anything, so they are not
  // injected at all rather than shipped inert. Derived from the roster, like the
  // stops above, so they return with the backends and need no edit here.
  //
  // SAVE SCREENSHOT and COPY DIAG deliberately STAY: saveScreenshot() feature-
  // tests GLX.awaitSoftPresent / GLX.softPresent, which real GLX does not carry,
  // and falls through to a plain canvas capture — and the diag copy is the phone
  // bug-report path, which is backend-agnostic.
  const backendTools = hasBackendFiles("three") || hasBackendFiles("webgpu");
  const pathBtn = backendTools ? addBtn("pm-three-path",
    "three.js GPU path. AUTO can be WebGPU or three WebGL2. It tries WebGPU when navigator.gpu exists, except on Safari/iOS (three WebGL2). WEBGL2 / WEBGPU pin one path.") : null;
  const shotBtn = backendTools ? addBtn("pm-screenshots",
    "WebGPU / three-WebGPU screenshot path. AUTO = 2D blit on software GPUs. 2D BLIT = copy the frame onto #game (WGX soft-present / TLX readRenderTargetPixelsAsync). NATIVE = swapchain only — black on software GPUs.") : null;
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
  if (pathBtn) pathBtn.onclick = function () {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
    applyThreePath(cycleOf(THREE_PATHS, readThreePath()));
  };
  if (shotBtn) shotBtn.onclick = function () {
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
// http and on older WebKit — the same two-step js/perf/gfx-debug-overlay.js uses.
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
  if (typeof document !== "undefined" && document.getElementById("pm-renderer-reset")) return;
  const host = ensureAdvHost();
  if (!host || typeof document.createElement !== "function") return;
  // Injected, not written into index.html: same reason CockpitOpts generates
  // its SETTINGS rows — the shell's DOM-node ratchet counts tags in the file,
  // and this button mints no new CSS class.
  const btn = document.createElement("button");
  btn.id = "pm-renderer-reset";
  btn.textContent = "RESET RENDERER";
  btn.title = "Forget the saved renderer pick, THREE PATH, SCREENSHOTS, and the crash/fallback flags, then reload on WebGL2. Use this if THREE.JS or WEBGPU crashed or will not load, especially on iPhone.";
  if (typeof host.appendChild === "function") host.appendChild(btn);
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

function init() {
  Log.info("game", "RendererPicker.init");
  // Picker row first (player-facing), then the RENDERER fold that owns
  // RESOLUTION / GRAPHICS plus RESET + present controls + status. Each
  // inject is idempotent; the shell already has the fold.
  initRenderer();
  ensureAdvHost();
  initReset();
  initPresentControls();
}

if (typeof document !== "undefined") {
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}

return { BACKENDS, init,
  nextBackend, prevBackend, applyBackend, backendLabel, readBackend, liveBackend, clearRendererStorage,
  RENDERER_LS_KEYS, RENDERER_SS_KEYS,
  THREE_PATHS, SHOT_MODES, readThreePath, applyThreePath, threePathLabel, liveThreeApi,
  readShotMode, applyShotMode, shotModeLabel, presentStatus, saveScreenshot, ARM_MS };
})();
