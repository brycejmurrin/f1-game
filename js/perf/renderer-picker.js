const RendererPicker = (function () {
  "use strict";

const BACKENDS = ["webgl2", "three", "webgpu"];
const hasBackendFiles = (b) => b === "webgl2" ||
  !!(typeof ApexRoster !== "undefined" && ApexRoster.DEFERRED &&
     (ApexRoster.DEFERRED[b] || []).length);
const available = (b) => hasBackendFiles(b) && (b !== "webgpu" || hasWebGPU());
function defaultBackend() {
  return "three";
}
function readBackend() {
  const v = GameStore.store.raw("apex26.gfxBackend");
  if (v == null) return defaultBackend();
  if (v === "webgl2" || v === "webgpu" || v === "three") return v;
  GameStore.store.rawSet("apex26.gfxBackend", "webgl2");
  return "webgl2";
}
function backendLabel(v) { return v === "three" ? "THREE.JS" : String(v).toUpperCase(); }
function liveBackend() {
  if (boundIsGlx()) return "webgl2";
  if (liveThreeApi()) return "three";
  try {
    const s = typeof GLX !== "undefined" && GLX && typeof GLX.backendState === "function"
      ? GLX.backendState() : null;
    if (s && s.api === "webgpu") return "webgpu";
  } catch (_) {  }
  const pref = readBackend();
  return available(pref) ? pref : "webgl2";
}
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
  const live = liveBackend();
  const fallback = live !== pref;
  if (isSelect(rb)) {
    rb.value = pref;
    const opts = rb.options || [];
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      let t = backendLabel(opt.value);
      if (fallback && opt.value === pref) t += " (" + backendLabel(live) + ")";
      opt.textContent = t;
    }
    paintRendererSummary(pref, fallback ? live : null);
    return;
  }
  rb.textContent = fallback
    ? ("RENDERER: " + backendLabel(pref) + " (" + backendLabel(live) + ")")
    : ("RENDERER: " + backendLabel(pref));
  paintRendererSummary(pref, fallback ? live : null);
}
function readRetired() {
  const m = /^(three|webgpu):(\d+)$/.exec(GameStore.store.raw("apex26.gfxRetired") || "");
  if (!m || GameStore.store.raw("apex26.gfxBackend") !== "webgl2") return null;
  return { from: m[1], build: +m[2] };
}
function paintRetired() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const host = document.getElementById("pm-display-adv-body");
  let note = document.getElementById("pm-renderer-retired");
  let btn = document.getElementById("pm-renderer-retry");
  const r = readRetired();
  if (!r || !host) { if (note) note.hidden = true; if (btn) btn.hidden = true; return; }
  if (!note) {
    note = document.createElement("p"); note.id = "pm-renderer-retired"; note.className = "adv-help";
    note.setAttribute("role", "status");
    btn = document.createElement("button"); btn.id = "pm-renderer-retry"; btn.type = "button";
    const first = host.firstChild || null;
    if (typeof host.insertBefore === "function") { host.insertBefore(note, first); host.insertBefore(btn, first); }
    else { host.appendChild(note); host.appendChild(btn); }
  }
  note.hidden = btn.hidden = false;
  const name = backendLabel(r.from);
  note.textContent = "Switched to WEBGL2 automatically: " + name + " did not finish starting twice in a row" +
    (r.build ? " (build " + r.build + ")" : "") + ". The phone closing the app during a race load counts, so " + name + " itself may be fine.";
  btn.textContent = "TRY " + name + " AGAIN";
  btn.onclick = () => { uiSelect(); applyBackend(r.from, document.getElementById("pm-renderer")); };
}
function paintRendererSummary(pref, liveFallback) {
  paintRetired();
  const sum = typeof document !== "undefined"
    ? document.getElementById("pm-renderer-details-sum")
    : null;
  if (!sum) return;
  const fallbackChip = liveFallback === "webgl2"
    ? '<span data-fold="sep"> · </span><span data-fold="val">WEBGL2</span>'
    : (liveFallback
      ? '<span data-fold="sep"> · </span><span data-fold="val">' + backendLabel(liveFallback) + "</span>"
      : (readRetired() ? '<span data-fold="sep"> · </span><span data-fold="val">AUTO-SWITCHED</span>' : ""));
  sum.innerHTML = '<span data-fold="k">RENDERER</span><span data-fold="sep"> · </span><span data-fold="val">' +
    backendLabel(pref) + "</span>" + fallbackChip;
  paintPostHealth(sum);
}
function paintPostHealth(summary) {
  const details = summary && summary.parentElement;
  if (!details || !document.createElement) return;
  let row = document.getElementById("pm-post-health");
  const health = typeof GLX !== "undefined" && typeof GLX.postHealth === "function" ? GLX.postHealth() : null;
  if (!health || health.state === "healthy") { if (row) row.hidden = true; return; }
  if (!row) {
    row = document.createElement("div"); row.id = "pm-post-health";
    row.setAttribute("role", "status"); details.appendChild(row);
  }
  row.hidden = false;
  row.textContent = health.state === "recovering"
    ? "Post-processing recovering (" + health.attempts + "/" + health.maxAttempts + ")"
    : "Post-processing reduced: " + (health.reason || "Recovery unavailable");
  if (health.state === "degraded" && health.retryable !== false && typeof GLX.retryPost === "function") {
    const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "RETRY POST-PROCESSING";
    retry.addEventListener("click", () => { GLX.retryPost(); paintPostHealth(summary); });
    row.appendChild(retry);
  }
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
const ARM_MS = 6000;
function disarm(btn, repaint) {
  try {
    if (btn._apexArmT) { clearTimeout(btn._apexArmT); btn._apexArmT = 0; }
    if (btn.dataset) { delete btn.dataset.armed; delete btn.dataset.armedFor; }
    try { btn.classList.remove("armed"); } catch (_) {  }
  } catch (_) {  }
  if (typeof repaint === "function") { try { repaint(); } catch (_) {  } }
}
function raceGuard(btn, armedText, repaint, target) {
  try {
    if (typeof document === "undefined" || !document.body || !btn) return true;
    if (document.body.dataset.race !== "1") {
      if (btn.dataset && btn.dataset.armed) disarm(btn, repaint);
      return true;
    }
    const other = target !== undefined && btn.dataset.armedFor !== undefined && btn.dataset.armedFor !== String(target);
    const stale = !!btn.dataset.armed && ((Date.now() - (btn._apexArmedAt || 0)) > ARM_MS || other);
    if (!btn.dataset.armed || stale) {
      btn.dataset.armed = "1";
      if (target !== undefined) btn.dataset.armedFor = String(target);
      btn._apexArmedAt = Date.now();
      if (isSelect(btn) && btn.options) {
        const opts = btn.options;
        for (let i = 0; i < opts.length; i++) if (opts[i].value === btn.value) opts[i].textContent = armedText;
      } else {
        btn.textContent = armedText;
      }
      try { btn.classList.add("armed"); } catch (_) {  }
      if (btn._apexArmT) clearTimeout(btn._apexArmT);
      btn._apexArmT = setTimeout(() => disarm(btn, repaint), ARM_MS);
      return false;
    }
    if (btn._apexArmT) { clearTimeout(btn._apexArmT); btn._apexArmT = 0; }
    delete btn.dataset.armed; delete btn.dataset.armedFor;
    try { btn.classList.remove("armed"); } catch (_) {  }
  } catch (_) {  }
  return true;
}

function uiSelect() {
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {  }
}

function reloadSoon() {
  try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {  }
  setTimeout(() => { try { location.reload(); } catch (_) {  } }, 350);
}

const RENDERER_LS_KEYS = [
  "apex26.gfxBackend", "apex26.gfxBackendProbe",
  "apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail",
  "apex26.gfxTlxFail",
  "apex26.gfxProbeStrikes",
  "apex26.gfxRetired",
  "apex26.gfxBootBound",
  "apex26.packIndex",
  "apex26.envProbeOff", "apex26.perChunkOff",
  "apex26.tlxForceGL", "apex26.tlxEnvProbe", "apex26.tlxViz",
  "apex26.tlxWebKitGL",
  "apex26.tlxRoadSplit",
  "apex26.wgxCapture",
];
const RENDERER_SS_KEYS = ["apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads", "apex26.stallReloads", "apex26.ctxLostNotice", "apex26.wgxCapture", "apex26.tlxAutoGL", "apex26.wgxHoldPresent", "apex26.gfxFallbackWhy", "apex26.gfxAdapterWhy"];

function clearRendererStorage() {
  const removed = [];
  for (const k of RENDERER_LS_KEYS) {
    if (GameStore.store.raw(k) != null) { GameStore.store.rawDel(k); removed.push(k); }
  }
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) {  }
  clearCtxLostWindowName();
  return removed;
}

function unavailableDiagnostics() {
  let stored = null;
  try { stored = localStorage.getItem("apex26.gfxBackend"); } catch (_) { stored = "storage-blocked"; }
  const valid = stored === "webgl2" || stored === "three" || stored === "webgpu";
  return JSON.stringify({
    renderer: { stored, requested: valid ? stored : (stored == null ? defaultBackend() : "webgl2") },
    browser: {
      webgl2API: typeof WebGL2RenderingContext !== "undefined",
      webgpuAPI: typeof navigator !== "undefined" && !!navigator.gpu,
    },
  }, null, 2);
}
async function copyUnavailableDiagnostics(text) {
  return ApexClipboard.write(text);
}
function closeUnavailableDialog(dialog) {
  if (!dialog) return;
  dialog.hidden = true;
  if (dialog.open && typeof dialog.close === "function") {
    try { dialog.close(); } catch (_) {  }
  }
}
let unavailableDefaults = null;
function setUnavailableDefaults(defs) {
  unavailableDefaults = defs && typeof defs === "object" ? defs : null;
}
function mergeUnavailableOpts(opts) {
  if (!unavailableDefaults) return opts || {};
  return Object.assign({}, unavailableDefaults, opts || {});
}
function openUnavailableDialog(dialog, closeButton, returnFocus) {
  if (!dialog) return;
  dialog.hidden = false;
  if (!dialog.open && typeof dialog.showModal === "function") {
    try { dialog.showModal(); } catch (_) {  }
  }
  if (!dialog.__apexGraphicsRecoveryWired) {
    dialog.__apexGraphicsRecoveryWired = true;
    if (dialog.addEventListener) dialog.addEventListener("cancel", (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (closeButton && closeButton.click) closeButton.click();
      else closeUnavailableDialog(dialog);
    });
    if (closeButton && closeButton.addEventListener) closeButton.addEventListener("click", () => {
      queueMicrotask(() => {
        closeUnavailableDialog(dialog);
        if (returnFocus && returnFocus.focus) returnFocus.focus();
      });
    });
  }
  queueMicrotask(() => { if (closeButton && closeButton.focus) closeButton.focus(); });
}
function clearCtxLostWindowName() {
  try {
    GfxEscalation.resetReloadBudget();
  } catch (_) {  }
}
function clearGfxBootRecovery({ webgl2Pick = false } = {}) {
  try {
    for (const k of RENDERER_LS_KEYS) {
      if (k === "apex26.gfxBackend") continue;
      localStorage.removeItem(k);
    }
    if (webgl2Pick) localStorage.setItem("apex26.gfxBackend", "webgl2");
  } catch (_) {  }
  try {
    for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k);
  } catch (_) {  }
  clearCtxLostWindowName();
}
function showUnavailable(opts) {
  opts = mergeUnavailableOpts(opts);
  const panel = opts.panel;
  const survey = typeof SurveyHud !== "undefined" && SurveyHud.armed && SurveyHud.armed();
  if (survey) {
    if (panel) panel.hidden = true;
    if (opts && opts.hud) { opts.hud.hidden = false; if ("inert" in opts.hud) opts.hud.inert = false; }
    if (opts && opts.overlay) { opts.overlay.hidden = true; if ("inert" in opts.overlay) opts.overlay.inert = false; }
    try {
      SurveyHud.holdChrome({
        document: typeof document !== "undefined" ? document : null,
        els: { hud: opts && opts.hud, overlay: opts && opts.overlay, nogl: panel },
      });
    } catch (_) {  }
    return;
  }
  if (opts && opts.hud) { opts.hud.hidden = true; opts.hud.inert = true; }
  if (opts && opts.overlay) { opts.overlay.hidden = true; opts.overlay.inert = true; }
  const get = typeof document !== "undefined" && document.getElementById;
  if (typeof get === "function") {
    const loading = get.call(document, "loading"); if (loading) loading.hidden = true;
    const rs = get.call(document, "race-settings"); if (rs) rs.hidden = true;
  }
  if (!panel) return;
  panel.textContent = "";
  const body = document.createElement("div");
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const actions = document.createElement("div");
  const status = document.createElement("p");
  const buttons = ["RETRY", "USE WEBGL2", "COPY DIAGNOSTICS", "HELP", "DATA HUB"]
    .map((label) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; return b; });
  const [retry, webgl, diagnostics, help, data] = buttons;
  body.setAttribute("data-gfx-recovery", ""); actions.setAttribute("data-gfx-recovery-actions", "");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  title.textContent = "Graphics unavailable";
  detail.textContent = "Apex 26 could not start a compatible graphics renderer. You can retry, select the WebGL2 fallback, or use the game’s help and data tools.";
  retry.onclick = () => {
    clearGfxBootRecovery();
    try { location.reload(); } catch (_) {  }
  };
  webgl.onclick = () => {
    clearGfxBootRecovery({ webgl2Pick: true });
    try { location.reload(); } catch (_) {  }
  };
  diagnostics.onclick = async () => {
    status.textContent = await copyUnavailableDiagnostics(unavailableDiagnostics())
      ? "Renderer diagnostics copied." : "Could not copy diagnostics.";
  };
  help.onclick = () => {
    if (!opts.helpDialog) return;
    openUnavailableDialog(opts.helpDialog, opts.helpClose, help);
  };
  data.onclick = async () => {
    data.disabled = true;
    status.textContent = "Loading Data Hub…";
    try {
      const ensure = typeof opts.ensureDataHub === "function" ? opts.ensureDataHub : null;
      const open = typeof opts.openDataHub === "function" ? opts.openDataHub : null;
      if (!ensure || !open) {
        status.textContent = "Data Hub could not be loaded.";
        return;
      }
      let ok = false;
      try { ok = await ensure(); } catch (_) { ok = false; }
      if (!ok) {
        status.textContent = "Data Hub could not be loaded.";
        return;
      }
      open();
      openUnavailableDialog(opts.dataDialog, opts.dataClose, data);
      status.textContent = "";
    } finally {
      data.disabled = false;
    }
  };
  actions.append(...buttons); body.append(title, detail, actions, status); panel.appendChild(body);
  panel.hidden = false;
  retry.focus();
}

function applyBackend(next, rb) {
  if (!raceGuard(rb, "RENDERER: END THIS RACE & RELOAD?", () => paintRenderer(rb), next)) return false;
  Log.info("game", "RendererPicker.applyBackend " + next);
  uiSelect();
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
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) {  }
  clearCtxLostWindowName();
  if (next === "webgpu") {
    for (const k of ["apex26.gfxWgxLevel", "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.gfxWgxFail"]) GameStore.store.rawDel(k);
  }
  GameStore.store.rawDel("apex26.gfxProbeStrikes");
  GameStore.store.rawDel("apex26.gfxRetired");
  markReloading(rb, next);
  reloadSoon();
  return true;
}

function rendererSlot(el) {
  if (!el) return null;
  for (let p = el.parentNode, n = 0; p && n < 3; p = p.parentNode, n++) {
    if (p.id === "pm-renderer-row") return p;
  }
  return el;
}

const THREE_PATHS = ["auto", "webgl2", "webgpu"];
const SHOT_MODES = ["auto", "blit", "native"];
function cycleOf(list, cur) {
  const i = list.indexOf(cur);
  return list[(((i < 0 ? 0 : i) + 1) % list.length)];
}
function readThreePath() {
  const v = GameStore.store.raw("apex26.tlxForceGL");
  if (v === "1") return "webgl2";
  if (v === "0") return "webgpu";
  return "auto";
}
function liveThreeApi() {
  try {
    const tlx = typeof GLX !== "undefined" && GLX && GLX.__tlx;
    if (tlx && typeof tlx.backendState === "function") {
      const s = tlx.backendState();
      if (s && (s.api === "webgpu" || s.api === "webgl2")) return s.api;
    }
  } catch (_) {  }
  try {
    const g = typeof document !== "undefined" ? document.getElementById("game") : null;
    const eng = g && typeof g.getAttribute === "function" ? g.getAttribute("data-engine") : "";
    if (!/three\.js/i.test(eng || "")) return null;
    if (/webgl2/i.test(eng || "")) return "webgl2";
    if (/webgpu/i.test(eng || "")) return "webgpu";
  } catch (_) {  }
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
      !raceGuard(typeof document !== "undefined" ? document.getElementById("pm-three-path") : null, "THREE PATH: END THIS RACE & RELOAD?", paintPresent, next)) return false;
  if (next === "webgl2") GameStore.store.rawSet("apex26.tlxForceGL", "1");
  else if (next === "webgpu") GameStore.store.rawSet("apex26.tlxForceGL", "0");
  else GameStore.store.rawDel("apex26.tlxForceGL");
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) {  }
  clearCtxLostWindowName();
  paintPresent();
  if (readBackend() === "three" && !(opts && opts.noReload)) {
    const btn = typeof document !== "undefined" ? document.getElementById("pm-three-path") : null;
    if (btn) btn.textContent = "THREE PATH: " + threePathLabel(next) + " — RELOADING…";
    reloadSoon();
    return true;
  }
  return false;
}
const ENV_PROBES = ["off", "on"];
function readEnvProbe() {
  return GameStore.store.raw("apex26.tlxEnvProbe") === "1" ? "on" : "off";
}
function envProbeLabel(v) { return v === "on" ? "ON" : "OFF"; }
function applyEnvProbe(next, opts) {
  if (readBackend() === "three" && !(opts && opts.noReload) &&
      !raceGuard(typeof document !== "undefined" ? document.getElementById("pm-car-reflect") : null, "CAR REFLECTIONS: END THIS RACE & RELOAD?", paintPresent, next)) return false;
  if (next === "on") GameStore.store.rawSet("apex26.tlxEnvProbe", "1");
  else GameStore.store.rawDel("apex26.tlxEnvProbe");
  paintPresent();
  if (readBackend() === "three" && !(opts && opts.noReload)) {
    const btn = typeof document !== "undefined" ? document.getElementById("pm-car-reflect") : null;
    if (btn) btn.textContent = "CAR REFLECTIONS: " + envProbeLabel(next) + " — RELOADING…";
    reloadSoon();
    return true;
  }
  return false;
}
function readShotMode() {
  try {
    const s = sessionStorage.getItem("apex26.wgxCapture");
    if (s === "1") return "blit";
    if (s === "0") return "native";
  } catch (_) {  }
  const s = GameStore.store.raw("apex26.wgxCapture");
  if (s === "1") return "blit";
  if (s === "0") return "native";
  return "auto";
}
function shotModeLabel(v) {
  return v === "blit" ? "2D BLIT" : v === "native" ? "NATIVE" : "AUTO";
}
function writeShotMode(next) {
  const v = next === "blit" ? "1" : next === "native" ? "0" : null;
  if (v) GameStore.store.rawSet("apex26.wgxCapture", v);
  else GameStore.store.rawDel("apex26.wgxCapture");
  try {
    if (v) sessionStorage.setItem("apex26.wgxCapture", v);
    else sessionStorage.removeItem("apex26.wgxCapture");
  } catch (_) {  }
}
function shotReloadLive() {
  const be = readBackend();
  if (be === "webgpu") return true;
  return be === "three" && (readThreePath() === "webgpu" || liveThreeApi() === "webgpu");
}
function applyShotMode(next, opts) {
  if (shotReloadLive() && !(opts && opts.noReload) &&
      !raceGuard(typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null, "SCREENSHOTS: END THIS RACE & RELOAD?", paintPresent, next)) return false;
  try { for (const k of RENDERER_SS_KEYS) sessionStorage.removeItem(k); } catch (_) {  }
  clearCtxLostWindowName();
  writeShotMode(next);
  paintPresent();
  if (shotReloadLive() && !(opts && opts.noReload)) {
    const btn = typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null;
    if (btn) btn.textContent = "SCREENSHOTS: " + shotModeLabel(next) + " — RELOADING…";
    reloadSoon();
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
      live = " Live: 2D blit is painting #game-soft.";
    }
  } catch (_) {  }
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
  try {
    if (typeof GLX !== "undefined" && typeof GLX.softPresent === "function" && GLX.softPresent()) {
      return "WEBGL2 paints via #game-soft under HeadlessChrome — screenshots read the 2D blit, not the WebGL swapchain. Headed players see #game." + live;
    }
  } catch (_) {  }
  return "WEBGL2 paints the GPU canvas. HeadlessChrome presents via #game-soft; headed players see #game. Screenshots just work.";
}
function paintPresent() {
  const pathBtn = typeof document !== "undefined" ? document.getElementById("pm-three-path") : null;
  if (pathBtn) pathBtn.textContent = "THREE PATH: " + threePathLabel(readThreePath());
  const shotBtn = typeof document !== "undefined" ? document.getElementById("pm-screenshots") : null;
  if (shotBtn) shotBtn.textContent = "SCREENSHOTS: " + shotModeLabel(readShotMode());
  const envBtn = typeof document !== "undefined" ? document.getElementById("pm-car-reflect") : null;
  if (envBtn) envBtn.textContent = "CAR REFLECTIONS: " + envProbeLabel(readEnvProbe());
  const st = typeof document !== "undefined" ? document.getElementById("pm-gfx-status") : null;
  if (st) st.textContent = presentStatus();
  paintRetired();
}
function hrefFromPixels(cap) {
  if (!cap || typeof document === "undefined" || typeof document.createElement !== "function") return null;
  const c = document.createElement("canvas");
  c.width = cap.width; c.height = cap.height;
  const ctx2 = c.getContext && c.getContext("2d");
  if (!ctx2 || typeof ctx2.putImageData !== "function") return null;
  ctx2.putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
  return c.toDataURL("image/png");
}
function saveScreenshot() {
  const btn = typeof document !== "undefined" ? document.getElementById("pm-save-shot") : null;
  const done = (ok, msg) => {
    if (btn) btn.textContent = ok ? "SAVE SCREENSHOT — SAVED" : ("SAVE SCREENSHOT — " + (msg || "FAILED"));
    setTimeout(() => { if (btn) btn.textContent = "SAVE SCREENSHOT"; }, 1600);
  };
  const run = async () => {
    try {
      const g = typeof document !== "undefined" ? document.getElementById("game") : null;
      const softEl = typeof document !== "undefined" ? document.getElementById("game-soft") : null;
      if (typeof GLX !== "undefined" && typeof GLX.awaitSoftPresent === "function") {
        const live = !softEl && !(typeof GLX.softPresent === "function" && GLX.softPresent());
        let r = null;
        try { r = await GLX.awaitSoftPresent(live ? 1500 : 8000, live ? "frame" : undefined); } catch (_) {  }
        if (live && r === "stale") { done(false, "NO LIVE FRAME"); return; }
      }
      let href = null;
      if (softEl && softEl.width > 0 && typeof softEl.toDataURL === "function") {
        try { href = softEl.toDataURL("image/png"); } catch (_) { href = null; }
      }
      const soft = typeof GLX !== "undefined" && typeof GLX.softPresent === "function" && GLX.softPresent();
      let capFailed = false;
      if (!href && soft && typeof GLX.capturePixels === "function") {
        try {
          const cap = await GLX.capturePixels();
          href = hrefFromPixels(cap);
        } catch (_) { href = null; capFailed = true;  }
      }
      if (!href && softEl && typeof softEl.toDataURL === "function") {
        try { href = softEl.toDataURL("image/png"); } catch (_) { href = null; }
      }
      if (!href && g && typeof g.toDataURL === "function") {
        try { href = g.toDataURL("image/png"); } catch (_) { href = null; }
      }
      if (!href && !capFailed && typeof GLX !== "undefined" && typeof GLX.capturePixels === "function") {
        const cap = await GLX.capturePixels();
        href = hrefFromPixels(cap);
        if (!href) { done(false, "NO 2D"); return; }
      }
      if (!href) { done(false, "BLANK"); return; }
      const name = "apex26-" + readBackend() + ".png";
      if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
        const res = await fetch(href);
        if (!res.ok) throw new Error("screenshot fetch HTTP " + res.status);
        await NativeDownload.saveBlob(await res.blob(), name);
        done(true); return;
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
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
  summary.textContent = "RENDERER · THREE.JS";
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

  const backendTools = hasBackendFiles("three") || hasBackendFiles("webgpu");
  const pathBtn = backendTools ? addBtn("pm-three-path",
    "three.js GPU path. AUTO can be WebGPU or three WebGL2. It tries WebGPU when navigator.gpu exists, except on Safari/iOS (three WebGL2). WEBGL2 / WEBGPU pin one path.") : null;
  const envBtn = hasBackendFiles("three") ? addBtn("pm-car-reflect",
    "Mirror the real surroundings in the car paint on the three.js backend. OFF by default: the probe re-renders the world six times per cycle and measured a drop to 10-13 fps with a resolution shed on real hardware, and on the three-WebGPU path it currently darkens the scene. OFF falls back to the analytic mirror.") : null;
  const shotBtn = backendTools ? addBtn("pm-screenshots",
    "WebGPU / three-WebGPU screenshot path. AUTO = 2D blit on software GPUs. 2D BLIT = copy the frame onto #game (WGX soft-present / TLX readRenderTargetPixelsAsync). NATIVE = swapchain only — black on software GPUs.") : null;
  const saveBtn = addBtn("pm-save-shot",
    "Download the visible frame as a PNG. Waits for the 2D blit first, then reads #game-soft when that overlay exists (GLX HeadlessChrome / WGX / TLX).");
  saveBtn.textContent = "SAVE SCREENSHOT";
  const diagBtn = addBtn("pm-copy-diag",
    "Copy __apex.diag() (renderer/backend state, GPU errors, device, build) to the clipboard as JSON, to paste into a bug report.");
  diagBtn.textContent = "COPY DIAG";
  const status = document.createElement("p");
  status.id = "pm-gfx-status";
  add(status);

  paintPresent();
  try { window.addEventListener("apex-gfx-live", paintPresent); } catch (_) {  }
  if (pathBtn) pathBtn.onclick = function () {
    uiSelect();
    applyThreePath(cycleOf(THREE_PATHS, readThreePath()));
  };
  if (envBtn) envBtn.onclick = function () {
    uiSelect();
    applyEnvProbe(cycleOf(ENV_PROBES, readEnvProbe()));
  };
  if (shotBtn) shotBtn.onclick = function () {
    uiSelect();
    applyShotMode(cycleOf(SHOT_MODES, readShotMode()));
  };
  saveBtn.onclick = function () {
    uiSelect();
    saveScreenshot();
  };
  diagBtn.onclick = function () {
    uiSelect();
    copyDiag(diagBtn);
  };
}

function playerDiag() {
  const safe = (fn) => { try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; } };
  return {
    when: new Date().toISOString(),
    ua: safe(() => navigator.userAgent),
    backend: safe(() => liveBackend()),
    backendState: safe(() => (typeof GLX !== "undefined" && GLX && typeof GLX.backendState === "function") ? GLX.backendState() : null),
    renderer: safe(() => JSON.parse(unavailableDiagnostics())),
    log:safe(() => (typeof Log !== "undefined" && Log.records) ? Log.records({ level: "warn", limit: 40 }) : []),
  };
}

function copyDiag(btn) {
  const label = (t) => { if (btn) btn.textContent = t; };
  const reset = () => setTimeout(() => label("COPY DIAG"), 1600);
  let text = "";
  try {
    const d = (typeof __apex !== "undefined" && __apex && typeof __apex.diag === "function") ? __apex.diag({ download: false }) : playerDiag();
    text = d ? JSON.stringify(d, null, 1) : "";
  } catch (e) { text = ""; }
  if (!text) { label("COPY DIAG — NO DIAG"); reset(); return; }
  ApexClipboard.write(text).then((ok) => {
    if (ok) { label("COPY DIAG — COPIED"); reset(); }
    else { label("COPY DIAG — FAILED"); reset(); }
  });
}

function initReset() {
  if (typeof document !== "undefined" && document.getElementById("pm-renderer-reset")) return;
  const host = ensureAdvHost();
  if (!host || typeof document.createElement !== "function") return;
  const btn = document.createElement("button");
  btn.id = "pm-renderer-reset";
  btn.textContent = "RESET RENDERER";
  btn.title = "Forget the saved renderer pick, THREE PATH, SCREENSHOTS, and crash/fallback flags, then reload on the default Three.js renderer. Pick WEBGL2 directly if THREE.JS or WEBGPU will not load.";
  if (typeof host.appendChild === "function") host.appendChild(btn);
  btn.onclick = () => {
    uiSelect();
    if (!raceGuard(btn, "RESET RENDERER: END THIS RACE & RELOAD?", () => { btn.textContent = "RESET RENDERER"; })) return;
    clearRendererStorage();
    btn.textContent = "RESET RENDERER — RELOADING…";
    reloadSoon();
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
  const label = document.createElement("span");
  const ctl = document.createElement("div");
  const prev = document.createElement("button");
  const sel = document.createElement("select");
  const next = document.createElement("button");
  if (typeof row.appendChild !== "function" || typeof sel.appendChild !== "function") return old;
  row.id = "pm-renderer-row";
  row.className = "set-row";
  if (typeof row.setAttribute === "function") { row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", "pm-renderer-label"); }
  label.id = "pm-renderer-label";
  label.className = "tune-label";
  label.textContent = "RENDERER";
  prev.id = "pm-renderer-prev";
  prev.tabIndex = -1;
  if (typeof prev.setAttribute === "function") prev.setAttribute("aria-hidden", "true");
  prev.type = "button";
  prev.textContent = "‹";
  if (typeof prev.setAttribute === "function") { prev.setAttribute("data-step", "-1"); prev.setAttribute("aria-label", "Previous renderer"); }
  sel.id = "pm-renderer";
  sel.title = "WEBGL2 paints the GPU canvas (HeadlessChrome via #game-soft). THREE.JS is the three.js backend — use THREE PATH for WebGL2 vs WebGPU. WEBGPU is hand-written WebGPU — use SCREENSHOTS for 2D blit vs native swapchain.";
  if (typeof sel.setAttribute === "function") sel.setAttribute("aria-labelledby", "pm-renderer-label");
  for (let i = 0; i < BACKENDS.length; i++) {
    const opt = document.createElement("option");
    opt.value = BACKENDS[i];
    opt.textContent = backendLabel(BACKENDS[i]);
    sel.appendChild(opt);
  }
  next.id = "pm-renderer-next";
  next.tabIndex = -1;
  if (typeof next.setAttribute === "function") next.setAttribute("aria-hidden", "true");
  next.type = "button";
  next.textContent = "›";
  if (typeof next.setAttribute === "function") { next.setAttribute("data-step", "1"); next.setAttribute("aria-label", "Next renderer"); }
  ctl.appendChild(prev);
  ctl.appendChild(sel);
  ctl.appendChild(next);
  row.appendChild(label);
  row.appendChild(ctl);
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
  try { window.addEventListener("apex-gfx-live", function () { paintRenderer(document.getElementById("pm-renderer")); paintPresent(); }); } catch (_) {  }
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
  initRenderer();
  ensureAdvHost();
  initReset();
  initPresentControls();
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}

return { init,
  nextBackend, prevBackend, applyBackend, backendLabel, readBackend, liveBackend, clearRendererStorage,
  showUnavailable, setUnavailableDefaults, clearGfxBootRecovery,
  RENDERER_LS_KEYS, RENDERER_SS_KEYS,
  THREE_PATHS, SHOT_MODES, readThreePath, applyThreePath, threePathLabel, liveThreeApi,
  ENV_PROBES, readEnvProbe, applyEnvProbe, envProbeLabel,
  readShotMode, applyShotMode, shotModeLabel, presentStatus, saveScreenshot, ARM_MS };
})();
