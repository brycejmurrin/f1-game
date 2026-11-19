const GfxQuality = (function () {
  "use strict";

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
let row = null;

function gstore() {
  return (typeof GameStore !== "undefined" && GameStore.store) || null;
}

function gfxButton() {
  return typeof document !== "undefined" ? document.getElementById("pm-gfx") : null;
}

function presetById(id) { return PRESETS.find((p) => p.id === id) || null; }

function current() { return presetById(curId) || PRESETS[2]; }

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

function isWeakPhone(nav) {
  if (arguments.length === 0) {
    nav = typeof navigator !== "undefined" ? navigator : null;
  }
  if (!nav) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory < 4) return true;
  if (Object.prototype.hasOwnProperty.call(nav, "gpu")) return !nav.gpu;
  let ua = "";
  try { ua = String(nav.userAgent || ""); } catch (_) { return false; }
  if (!ua) return false;
  try { return !nav.gpu; } catch (_) { return true; }
}

function defaultId(mobile, hint) {
  if (!mobile) return "high";
  const s = gstore();
  const legacy = !!s && s.raw("apex26.gfxHigh") === "1";
  if (legacy) return PHONE_MAX_ID;
  const weak = hint && typeof hint.weak === "boolean" ? hint.weak : isWeakPhone();
  return weak ? "low" : "medium";
}

function applyLive() {
  const p = current();
  if (typeof PerfGov !== "undefined" && PerfGov.setUserTier) PerfGov.setUserTier(p.tier);
}

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
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) {  }
}

function inRace() {
  try {
    return typeof document !== "undefined" && !!document.body && document.body.dataset.race === "1";
  } catch (_) { return false; }
}

function reloadSoon() {
  try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {  }
  setTimeout(() => { try { location.reload(); } catch (_) {  } }, RELOAD_DELAY_MS);
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
  try { if (typeof LightStore !== "undefined" && LightStore.reapply) LightStore.reapply(); } catch (_) {  }
  const needsReload = syncBootTier() || (!isMobile && !!prev && prev.mobileHigh !== p.mobileHigh);
  paintGfx(needsReload ? " — RELOADING…" : "");
  if (needsReload && !opts.noReload) {
    if (inRace()) { paintGfx(" — FULLY APPLIES AFTER A RELOAD"); return true; }
    reloadSoon();
  }
  return true;
}

function cycle() {
  const live = PRESETS.filter((p) => !(isMobile && p.id === "ultra"));
  const i = live.findIndex((p) => p.id === curId);
  return set(live[(i + 1) % live.length].id);
}

function mountControl() {
  const btn = gfxButton();
  if (!btn) return;
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
  isMobile = typeof GLX !== "undefined" && !!GLX.isMobile;
  const st = gstore();
  const rawId = (st && st.get("gfxPreset", null)) || defaultId(isMobile);
  curId = capId(presetById(rawId) ? rawId : defaultId(isMobile), isMobile);
  if (st && rawId !== curId) st.set("gfxPreset", curId);
  syncBootTier();
  applyLive();
  mountControl();
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}

return {
  init, set, cycle, current: () => current().id, defaultId,
  maxId, capId, isWeakPhone, PHONE_MAX_ID, PHONE_ULTRA_NOTE,
};
})();
Object.freeze(GfxQuality);
