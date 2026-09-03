/* Apex 26 — GfxQuality: the GRAPHICS quality PRESETS (LOW / MEDIUM / HIGH / ULTRA) — their tier floor on the PerfGov shedding ladder, the mobile boot tier they persist (apex26.gfxHigh), the apex26.gfxPreset store key and the #pm-gfx button. The RENDERER picker (WEBGL2 / THREE.JS / WEBGPU, RESET RENDERER, THREE PATH, SCREENSHOTS) is js/game/renderer-picker.js. */
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
  const legacy = GameStore.store.raw("apex26.gfxHigh") === "1";
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
  const have = GameStore.store.raw("apex26.gfxHigh") === "1";
  if (want === have) return false;
  GameStore.store.rawSet("apex26.gfxHigh", want ? "1" : "0");
  return true;
}

function label() { return "GRAPHICS: " + current().label; }

function set(id, opts) {
  const p = byId(id);
  if (!p) return false;
  const prev = byId(_cur);
  _cur = p.id;
  Log.info("game", "GfxQuality.set " + _cur);
  const st = gstore(); if (st) st.set("gfxPreset", _cur);
  applyLive();
  // The lighting store's conditional shipped layer (the ULTRA-night per-chunk
  // rung) resolves through the CURRENT preset, so a flip must re-run the
  // lighting apply to engage live. Lazy, like the PerfGov poke above.
  try { if (typeof LightStore !== "undefined" && LightStore.reapply) LightStore.reapply(); } catch (_) { /* pre-boot: the first apply() resolves it */ }
  // MSAA is decided once when the render targets are made (GLX setup, WGX
  // script eval) from this preset: ULTRA 4×, anything else 2×/1×. Crossing
  // that boundary on a DESKTOP therefore needs the same reload the mobile
  // boot tier takes, or the new sample count applies only on the next visit.
  const needsReload = syncBootTier() || (!_isMobile && !!prev && prev.mobileHigh !== p.mobileHigh);
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

return { PRESETS, init, set, cycle, current: () => current().id, label, defaultId };
})();
