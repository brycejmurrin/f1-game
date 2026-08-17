/* Apex 26 — GRAPHICS quality presets + the RENDERER cycle. Owns the four
   presets, their persistence, #pm-gfx, #pm-renderer (WEBGL2 / THREE /
   WEBGPU), and #pm-renderer-reset (forget the saved pick + crash flags).
   RENDERER lives here so SETTINGS can show and flip it at
   DOMContentLoaded — js/game.js is an async IIFE that awaits deferred
   backend scripts on an opt-in, and a hidden button wired after that await
   is invisible for the whole load and dead if the IIFE never reaches it.

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

// RENDERER cycle. Always three stops so the WEBGPU label is visible on a
// phone that has no navigator.gpu — tapping it there flashes UNAVAILABLE
// rather than writing a pref boot will silently ignore. THREE needs no GPU.
const BACKENDS = ["webgl2", "three", "webgpu"];
function readBackend() {
  try {
    const v = localStorage.getItem("apex26.gfxBackend");
    return v === "webgpu" || v === "three" ? v : "webgl2";
  } catch (_) { return "webgl2"; }
}
function backendLabel(v) { return v === "three" ? "THREE" : String(v).toUpperCase(); }
function nextBackend(cur) {
  const i = BACKENDS.indexOf(cur);
  return BACKENDS[(i < 0 ? 0 : i + 1) % BACKENDS.length];
}
function hasWebGPU() { return typeof navigator !== "undefined" && !!navigator.gpu; }
function boundIsGlx() {
  try { return sessionStorage.getItem("apex26.gfxBound") === "webgl2"; } catch (_) { return false; }
}
function paintRenderer(rb) {
  if (!rb) return;
  const pref = readBackend();
  // Preference is what the next tap cycles. Live may be GLX after a
  // device.lost / create refuse — saying WEBGPU then was the lie.
  rb.textContent = (boundIsGlx() && (pref === "webgpu" || pref === "three"))
    ? ("RENDERER: " + backendLabel(pref) + " (WEBGL2)")
    : ("RENDERER: " + backendLabel(pref));
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
];
const RENDERER_SS_KEYS = ["apex26.gfxClaimFail", "apex26.gfxBound", "apex26.ctxLostReloads"];

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

function initReset() {
  const anchor = typeof document !== "undefined" ? document.getElementById("pm-renderer") : null;
  const host = anchor && anchor.parentNode;
  if (!host || document.getElementById("pm-renderer-reset")) return;
  // Injected, not written into index.html: same reason PerfTry / CockpitOpts
  // generate their SETTINGS rows — the shell's DOM-node ratchet counts tags
  // in the file, and this button mints no new CSS class.
  const btn = document.createElement("button");
  btn.id = "pm-renderer-reset";
  btn.textContent = "RESET RENDERER";
  btn.title = "Forget the saved renderer pick and the crash/fallback flags, then reload on WebGL2. Use this if THREE or WEBGPU crashed or will not load, especially on iPhone.";
  host.insertBefore(btn, anchor.nextSibling);
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

function initRenderer() {
  const rb = typeof document !== "undefined" ? document.getElementById("pm-renderer") : null;
  if (!rb) return;
  rb.hidden = false;
  paintRenderer(rb);
  try { window.addEventListener("apex-gfx-live", function () { paintRenderer(rb); }); } catch (_) { /* no window */ }
  rb.onclick = () => {
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {}
    const cur = readBackend();
    const next = nextBackend(cur);
    if (next === "webgpu" && !hasWebGPU()) {
      rb.textContent = "RENDERER: WEBGPU (UNAVAILABLE)";
      setTimeout(() => { paintRenderer(rb); }, 900);
      return;
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
    rb.textContent = "RENDERER: " + backendLabel(next) + " — RELOADING…";
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {}
    setTimeout(() => { try { location.reload(); } catch (_) {} }, 350);
  };
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
  nextBackend, backendLabel, readBackend, clearRendererStorage,
  RENDERER_LS_KEYS, RENDERER_SS_KEYS };
})();
