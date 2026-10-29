/* Apex 26 — GfxQuality: the GRAPHICS quality PRESETS (LOW / MEDIUM / HIGH / ULTRA) — their tier floor on the PerfGov shedding ladder, the mobile boot tier they persist (apex26.gfxHigh), the apex26.gfxPreset store key and the #pm-gfx button. The RENDERER picker (WEBGL2 / THREE.JS / WEBGPU, RESET RENDERER, THREE PATH, SCREENSHOTS) is js/perf/renderer-picker.js. */
const GfxQuality = (function () {
  "use strict";

// userTier is a FLOOR on the COST shedding ladder in js/perf/governor.js:
//   0 nothing pinned off · 1 env probe · 2 +lamp shadow/dry SSR · 3 +car shadow; wet SSR uses a smaller budget
// Look-defining post (bloom / SSAO / god rays / contact / lamp volumetrics)
// reads PerfGov.lookPostShed() — true at measured/crash tier 4 OR on GRAPHICS:
// LOW (userTier 4). autoTier() stays free of the user floor so wet-road SSR
// can keep a reduced budget on LOW and the lighting-tuner "why off" note can
// still name a measured shed; pinning look post via autoTier alone left LOW
// slower than MEDIUM on iPhone WebGPU (BrowserStack 2026-10-21).
// ULTRA and HIGH share tier 0 deliberately: both mean "let the governor
// decide". They differ only in the MOBILE boot tier, which is fixed at renderer
// init and cannot be a live knob. A separate AUTO stop would be
// indistinguishable from ULTRA and is omitted rather than shipped as a lie.
//
// PHONE CAP (D·IP1, BrowserStack 2026-10-21): ULTRA on a real iPhone 15 averaged
// 24.5 fps / 14.1 1% low with no recovery at renderScale 1.0. Phones therefore
// never offer ULTRA — the row shows it disabled with a note, set()/init clamp
// it to HIGH (same tier floor, memory-safe boot), and a weak phone (no WebGPU /
// low deviceMemory; iPhone 13 idle ~25 fps on MEDIUM) defaults to LOW.
const PRESETS = [
  { id: "low",    label: "LOW",    tier: 4, mobileHigh: false },
  { id: "medium", label: "MEDIUM", tier: 2, mobileHigh: false },
  { id: "high",   label: "HIGH",   tier: 0, mobileHigh: false },
  { id: "ultra",  label: "ULTRA",  tier: 0, mobileHigh: true  },
];
const PHONE_MAX_ID = "high";
const PHONE_ULTRA_NOTE = " — NOT ON PHONES";
const PHONE_CAP_TITLE = "ULTRA is capped on phones (BrowserStack 2026-10-21: ~24 fps avg on iPhone 15). HIGH is the phone ceiling.";
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

// Phone-class devices (GLX.isMobile / touch UA) never boot the ULTRA memory
// tier. HIGH shares the tier-0 floor without flipping apex26.gfxHigh.
function maxId(mobile) { return mobile ? PHONE_MAX_ID : "ultra"; }

function capId(id, mobile) {
  const p = presetById(id);
  if (!p) return mobile ? "medium" : "high";
  if (!mobile) return p.id;
  const max = presetById(PHONE_MAX_ID);
  const maxIdx = PRESETS.indexOf(max);
  const idx = PRESETS.indexOf(p);
  return idx > maxIdx ? PHONE_MAX_ID : p.id;
}

// Older / weaker phones: iPhone 13 (iOS 18, WebGL) idled ~25 fps on MEDIUM in
// the 2026-10-21 BrowserStack suite. Capable phones (iPhone 15 + iOS 26 Safari
// with navigator.gpu) hold MEDIUM racing. deviceMemory < 4 catches low-RAM
// Androids. A Node harness with no Navigator.prototype.gpu stays "capable" so
// the existing MEDIUM default tests keep their meaning; pass hint.weak to force.
function isWeakPhone(nav) {
  // `null` is an explicit "no navigator" (tests); only fall back to the
  // global when the argument is omitted.
  if (arguments.length === 0) {
    nav = typeof navigator !== "undefined" ? navigator : null;
  }
  if (!nav) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory < 4) return true;
  // Own `gpu` key (test stubs, older Safari) wins. Otherwise only treat a
  // navigator with a userAgent as a real browser — a bare Node stub stays
  // "capable" so defaultId(true) keeps MEDIUM in harnesses.
  if (Object.prototype.hasOwnProperty.call(nav, "gpu")) return !nav.gpu;
  let ua = "";
  try { ua = String(nav.userAgent || ""); } catch (_) { return false; }
  if (!ua) return false;
  try { return !nav.gpu; } catch (_) { return true; }
}

// The shipped default matches each device's picture without this control:
// desktop runs the full stack (HIGH); a capable phone the memory-safe MEDIUM
// tier; a weak phone LOW. The legacy apex26.gfxHigh opt-in used to mean ULTRA;
// on phones that is capped to HIGH (see maxId / capId). A fresh capable phone
// stays MEDIUM: HIGH removes the tier-2 floor and enables the env probe plus
// lamp shadows/SSR before the governor has measured the device
function defaultId(mobile, hint) {
  if (!mobile) return "high";
  const s = gstore();
  const legacy = !!s && s.raw("apex26.gfxHigh") === "1";
  if (legacy) return PHONE_MAX_ID;
  const weak = hint && typeof hint.weak === "boolean" ? hint.weak : isWeakPhone();
  return weak ? "low" : "medium";
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
// tier change reloads; " — FULLY APPLIES AFTER A RELOAD" mid-race). On phones
// ULTRA stays in the list but disabled, with PHONE_ULTRA_NOTE so the cap is
// visible in the row (SettingRow's third tuple slot).
function gfxValues(note) {
  return PRESETS.map((p) => {
    let text = p.label;
    const phoneBlocked = isMobile && p.id === "ultra";
    if (phoneBlocked) text += PHONE_ULTRA_NOTE;
    if (note && p.id === curId) text += note;
    return phoneBlocked ? [p.id, text, true] : [p.id, text];
  });
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
  const raw = presetById(id);
  if (!raw) return false;
  const p = presetById(capId(raw.id, isMobile));
  if (!p) return false;
  const prev = presetById(curId);
  curId = p.id;
  Log.info("game", `GfxQuality.set ${curId}` + (raw.id !== curId ? ` (capped from ${raw.id})` : ""));
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
  // Skip phone-blocked ULTRA so the one-button fallback matches SettingRow.
  const live = PRESETS.filter((p) => !(isMobile && p.id === "ultra"));
  const i = live.findIndex((p) => p.id === curId);
  return set(live[(i + 1) % live.length].id);
}

function mountControl() {
  const btn = gfxButton();
  if (!btn) return;   // shell without the button: the tier floor still applied
  const host = btn.parentNode;
  if (typeof SettingRow !== "undefined" && host && typeof host.replaceChild === "function" && !row) {
    const built = SettingRow.build("pm-gfx", "GRAPHICS", gfxValues(""));
    built.row.title = isMobile ? PHONE_CAP_TITLE : (btn.title || "");
    host.replaceChild(built.row, btn);
    row = built.row;
    SettingRow.wire(row, { values: gfxValues(""), read: () => curId, write: (v) => { set(v); uiSelect(); } });
    paintGfx("");
    return;
  }
  btn.hidden = false;
  btn.textContent = label();
  if (isMobile) btn.title = PHONE_CAP_TITLE;
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
  const rawId = (st && st.get("gfxPreset", null)) || defaultId(isMobile);
  curId = capId(presetById(rawId) ? rawId : defaultId(isMobile), isMobile);
  // Persist the cap so a stored "ultra" on a phone does not keep reappearing
  // as the unresolved preference on the next boot
  if (st && rawId !== curId) st.set("gfxPreset", curId);
  // RECONCILE THE BOOT TIER WITH THE PRESET. `apex26.gfxHigh` is read at BOOT
  // by glx.js, post.js and the audio engine, and was written ONLY by set() —
  // so any path that lands a gfxPreset without set() (a settings-file import)
  // left the two disagreeing, and a phone whose UI said MEDIUM booted on the
  // DESKTOP tier with nothing ever re-syncing it. Stable, not circular:
  // defaultId no longer returns ULTRA on phones (capped to HIGH), and HIGH
  // has mobileHigh false, so a leftover gfxHigh=1 is cleared here.
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

// PRESETS / label stay module-local (UI + current() use them).
// cycle / PHONE_MAX_ID stay exported — unit seams (quality-preset-phone).
return {
  init, set, cycle, current: () => current().id, defaultId,
  maxId, capId, isWeakPhone, PHONE_MAX_ID, PHONE_ULTRA_NOTE,
};
})();
Object.freeze(GfxQuality);
