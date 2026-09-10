/* Apex 26 — GfxQuality: the GRAPHICS quality PRESETS (LOW / MEDIUM / HIGH / ULTRA) — their tier floor on the PerfGov shedding ladder, the mobile boot tier they persist (apex26.gfxHigh), the apex26.gfxPreset store key and the #pm-gfx button. The RENDERER picker (WEBGL2 / THREE.JS / WEBGPU, RESET RENDERER, THREE PATH, SCREENSHOTS) is js/perf/renderer-picker.js. */
const GfxQuality = (function () {
  "use strict";

// userTier is a FLOOR on the COST shedding ladder in js/perf/governor.js:
//   0 nothing pinned off · 1 env probe · 2 +lamp shadow/SSR · 3 +car shadow
// Look-defining post (bloom / SSAO / god rays / contact / lamp volumetrics)
// reads PerfGov.autoTier() instead — GRAPHICS: LOW must not mute the lighting
// tuner; the governor and crash-sentinel floor can still shed that stack when
// the device proves it cannot afford it.
// ULTRA and HIGH share tier 0 deliberately: both mean "let the governor
// decide". They differ only in the MOBILE boot tier, which is fixed at renderer
// init and cannot be a live knob. A separate AUTO stop would be
// indistinguishable from ULTRA and is omitted rather than shipped as a lie.
const PRESETS = [
  { id: "low",    label: "LOW",    tier: 4, mobileHigh: false },
  { id: "medium", label: "MEDIUM", tier: 2, mobileHigh: false },
  { id: "high",   label: "HIGH",   tier: 0, mobileHigh: false },
  { id: "ultra",  label: "ULTRA",  tier: 0, mobileHigh: true  },
];
const RELOAD_DELAY_MS = 260;

let curId = "high";
let isMobile = false;
// The mounted GRAPHICS setting row (js/ui/setting-row.js); a harness without
// SettingRow keeps the one-button cycle, so the canary's stubs still drive it
let row = null;

// Every global here (GameStore, PerfGov, GLX, SettingRow, LightStore) is
// resolved at CALL time, never at eval: an eval-time read would make this
// file's shell position load-bearing and cost a HARD_EDGES pair, and every
// read happens from init() or a click, long after the shell has evaluated
function gstore() {
  return (typeof GameStore !== "undefined" && GameStore.store) || null;
}

function gfxButton() {
  return typeof document !== "undefined" ? document.getElementById("pm-gfx") : null;
}

function presetById(id) { return PRESETS.find((p) => p.id === id) || null; }

function current() { return presetById(curId) || PRESETS[2]; }

// The shipped default must match what each device ALREADY did before this
// control existed, so adding the button changed nobody's picture: desktop ran
// the full stack (HIGH); a phone ran the memory-safe STANDARD tier unless it
// had opted into apex26.gfxHigh (the old mobile-only toggle, still
// authoritative as ULTRA). A fresh phone stays MEDIUM: HIGH removes the tier-2
// floor and enables the env probe plus lamp shadows/SSR before the governor
// has measured the device
function defaultId(isMobile) {
  if (!isMobile) return "high";
  const s = gstore();
  const legacy = !!s && s.raw("apex26.gfxHigh") === "1";
  return legacy ? "ultra" : "medium";
}

// The preset's live half: the tier floor is the only part that can change
// without a reload — context AA, target formats and atlas sizes are decided at
// renderer init (see syncBootTier)
function applyLive() {
  const p = current();
  if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(p.tier);
}

// The boot-time half: the mobile memory tier. Returns true only when the bit
// actually CHANGED — a switch that leaves it alone (LOW <-> MEDIUM, HIGH on
// desktop) must not cost the player a page load
function syncBootTier() {
  if (!isMobile) return false;
  const s = gstore();
  if (!s) return false;
  const want = current().mobileHigh;
  const have = s.raw("apex26.gfxHigh") === "1";
  if (want === have) return false;
  s.rawSet("apex26.gfxHigh", want ? "1" : "0");
  return true;
}

function label() { return `GRAPHICS: ${current().label}`; }

// `note` is appended to the CURRENT preset's label (" — RELOADING…" while a
// tier change reloads; " — FULLY APPLIES AFTER A RELOAD" mid-race)
function gfxValues(note) {
  return PRESETS.map((p) => [p.id, p.label + (note && p.id === curId ? note : "")]);
}

function paintGfx(note) {
  if (row) { SettingRow.paint(row, curId, gfxValues(note || "")); return; }
  const btn = gfxButton();
  if (btn) btn.textContent = label() + (note || "");
}

function uiSelect() {
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio not up yet */ }
}

function inRace() {
  try {
    return typeof document !== "undefined" && !!document.body && document.body.dataset.race === "1";
  } catch (_) { return false; }
}

function reloadSoon() {
  try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) { /* no governor in a harness */ }
  setTimeout(() => { try { location.reload(); } catch (_) { /* file:// / test host */ } }, RELOAD_DELAY_MS);
}

function set(id, opts = {}) {
  const p = presetById(id);
  if (!p) return false;
  const prev = presetById(curId);
  curId = p.id;
  Log.info("game", `GfxQuality.set ${curId}`);
  const st = gstore();
  if (st) st.set("gfxPreset", curId);
  applyLive();
  // The lighting store's conditional shipped layer (the ULTRA-night per-chunk
  // rung) resolves through the CURRENT preset, so a flip must re-run the
  // lighting apply to engage live
  try { if (typeof LightStore !== "undefined" && LightStore.reapply) LightStore.reapply(); } catch (_) { /* pre-boot: the first apply() resolves it */ }
  // MSAA is decided once when the render targets are made (GLX setup, WGX
  // script eval): ULTRA 4×, anything else 2×/1×. Crossing that boundary on a
  // DESKTOP therefore needs the same reload the mobile boot tier takes
  const needsReload = syncBootTier() || (!isMobile && !!prev && prev.mobileHigh !== p.mobileHigh);
  paintGfx(needsReload ? " — RELOADING…" : "");
  if (needsReload && !opts.noReload) {
    // In a race the preset is already live; the boot-tier half waits for the
    // next natural reload instead of ending the race here
    if (inRace()) { paintGfx(" — FULLY APPLIES AFTER A RELOAD"); return true; }
    reloadSoon();
  }
  return true;
}

function cycle() {
  const i = PRESETS.findIndex((p) => p.id === curId);
  return set(PRESETS[(i + 1) % PRESETS.length].id);
}

function mountControl() {
  const btn = gfxButton();
  if (!btn) return;   // shell without the button: the tier floor still applied
  const host = btn.parentNode;
  if (typeof SettingRow !== "undefined" && host && typeof host.replaceChild === "function" && !row) {
    const built = SettingRow.build("pm-gfx", "GRAPHICS", gfxValues(""));
    built.row.title = btn.title || "";
    host.replaceChild(built.row, btn);
    row = built.row;
    SettingRow.wire(row, { values: gfxValues(""), read: () => curId, write: (v) => { set(v); uiSelect(); } });
    paintGfx("");
    return;
  }
  btn.hidden = false;
  btn.textContent = label();
  btn.onclick = () => { cycle(); uiSelect(); };
}

function init() {
  Log.info("game", "GfxQuality.init");
  // GLX.isMobile is the device class, NOT GLX.mobileTier — the tier is already
  // downstream of apex26.gfxHigh (glx.js: MOBILE_TIER = IS_MOBILE && !_gfxHigh),
  // so reading it would make the control's default depend on its own last
  // setting. The typeof guard is the standalone-harness fallback
  isMobile = typeof GLX !== "undefined" && !!GLX.isMobile;
  const st = gstore();
  curId = (st && st.get("gfxPreset", null)) || defaultId(isMobile);
  if (!presetById(curId)) curId = defaultId(isMobile);
  // RECONCILE THE BOOT TIER WITH THE PRESET. `apex26.gfxHigh` is read at BOOT
  // by glx.js, post.js and the audio engine, and was written ONLY by set() —
  // so any path that lands a gfxPreset without set() (a settings-file import)
  // left the two disagreeing, and a phone whose UI said MEDIUM booted on the
  // DESKTOP tier with nothing ever re-syncing it. Stable, not circular:
  // defaultId reads gfxHigh only for the legacy ULTRA opt-in, and ULTRA is the
  // one preset with mobileHigh true, so it writes back the value it read.
  // Takes effect on the next load, when those boot reads happen
  syncBootTier();
  applyLive();
  mountControl();
}

if (typeof document !== "undefined") {
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}

return { PRESETS, init, set, cycle, current: () => current().id, label, defaultId };
})();
Object.freeze(GfxQuality);
