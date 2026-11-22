/* AppearanceStudio — FULL boot stub (#4978 row 5). Title home reads scene/homeCamera/
   onSceneChange/attach at eval; the DOM studio (AppearanceStudioBody) is LAZY_UI_PRESETS
   and lands with Settings › APPEARANCE (or the first initUI). Until then every answer
   comes from GameStore the same way the body does. */
const AppearanceStudio = (function () {
  "use strict";

  const PROFILE_KEY = "appearanceProfiles";
  const ENUMS = {
    uiTheme: ["dark", "light", "system", "endurance", "drafting"], menuAccent: ["brand", "team", "ember", "amber", "cyan", "violet", "lime", "custom"],
    hudAccent: ["brand", "team", "ember", "amber", "cyan", "violet", "lime", "custom"], textSize: ["normal", "large", "larger"],
    uiContrast: ["off", "high"], cvdMode: ["off", "deutan", "protan", "tritan"], speedUnits: ["kmh", "mph"], menuHelp: ["on", "off"], motion: ["auto", "reduce", "off"],
    titleIntro: ["full", "quick", "off"], menuWash: ["full", "medium", "soft", "off"], titleArt: ["on", "medium", "soft", "off"], titleButtonStyle: ["auto", "racing", "flat"],
    pauseLayout: ["grid", "list", "compact", "wide", "sidebar"], pauseSide: ["centre", "left", "right"], pauseDim: ["full", "soft", "off"],
    hudBtnShape: ["round", "squircle", "square", "arch", "shield", "paddle-left", "paddle-right", "leaf"], hudProfile: ["minimal", "standard", "broadcast"], hudMetricsLayout: ["auto", "full", "timing", "driver", "compact"],
    hudMapVis: ["auto", "on", "off"], hudGapsVis: ["auto", "on", "off"], hudMirror: ["auto", "on", "off"],
    homeScene: ["auto", "garage", "night", "studio", "track", "pitlane", "static", "photo"], backgroundMotion: ["still", "ambient"],
    homeCamera: ["auto", "hero", "front", "side", "rear"],
  };
  const shipped = (k, d) => (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(k))
    ? SettingsDefaults.get(k) : d;
  const DEFAULTS = Object.freeze({ uiTheme: "dark", menuAccent: shipped("menuAccent", "ember"), hudAccent: "team", menuAccentHex: "#e10600", hudAccentHex: "#e10600",
    textSize: shipped("textSize", "normal"), uiContrast: shipped("uiContrast", "off"), cvdMode: "off", speedUnits: "kmh", menuHelp: "on", motion: null, uiScale: null,
    hudScale: null, hudBtnScale: null, hudBtnShape: null, hudBtnOpacity: null, hudPanelOpacity: null,
    titleIntro: "full", menuWash: "full", titleArt: "on", titleButtonStyle: "auto", titleLayout: null, hudLayout: null, dockLayout: null, screenPlacement: null,
    pauseLayout: "grid", pauseSide: "centre", pauseDim: "full",
    hudProfile: "standard", hudMetricsLayout: "full", hudMapVis: "on", hudGapsVis: "on", hudMirror: shipped("hudMirror", "auto"),
    lookPause: null, lookDatahub: null, lookSelect: null, lookRace: null, lookCareer: null, lookGarage: null, lookPopups: null, lookDesigner: null,
    homeScene: shipped("homeScene", "static"), backgroundMotion: shipped("backgroundMotion", "ambient"), homeCamera: shipped("homeCamera", "side") });
  const VISUAL_KEYS = Object.freeze(Object.keys(DEFAULTS));
  const PRESET_PRESERVE = Object.freeze(["motion", "textSize", "uiScale", "uiContrast", "cvdMode", "speedUnits", "hudScale", "hudBtnScale", "hudBtnShape", "hudBtnOpacity", "hudPanelOpacity", "titleButtonStyle", "titleLayout", "hudLayout", "dockLayout", "screenPlacement", "pauseLayout", "pauseSide", "pauseDim"]);
  const LOOKS = { lookPause: "pause", lookDatahub: "datahub", lookSelect: "select", lookRace: "race", lookCareer: "career", lookGarage: "garage", lookPopups: "popups", lookDesigner: "designer" };
  const SCREEN_KEYS = Object.freeze({ home: ["titleIntro", "menuWash", "titleArt", "titleButtonStyle", "titleLayout", "homeScene", "backgroundMotion", "homeCamera"],
    pause: ["lookPause", "pauseLayout", "pauseSide", "pauseDim"], datahub: ["lookDatahub"], select: ["lookSelect"],
    career: ["lookCareer"], race: ["lookRace"], garage: ["lookGarage"],
    hud: ["hudLayout", "dockLayout", "hudProfile", "hudMetricsLayout", "hudMapVis", "hudGapsVis", "hudMirror", "hudScale", "hudBtnScale", "hudBtnShape", "hudBtnOpacity", "hudPanelOpacity", "hudAccent", "hudAccentHex"],
    popups: ["lookPopups"] });
  const PRESETS = Object.freeze([
    { id: "classic", name: "CLASSIC", note: "Original motorsport style", values: { homeScene: "static" } },
    { id: "paddock", name: "TEAM PADDOCK", note: "Your team, your garage", values: { menuAccent: "team", hudAccent: "team", homeScene: "garage", backgroundMotion: "ambient", lookCareer: { density: "roomy" } } },
    { id: "broadcast", name: "BROADCAST", note: "Timing and race context", values: { menuAccent: "cyan", hudAccent: "cyan", hudProfile: "broadcast", homeScene: "night", backgroundMotion: "still", lookDatahub: { tabs: "underline", stripes: "on" } } },
    { id: "focus", name: "FOCUS", note: "Quiet menus, clear track", values: { homeScene: "static", hudProfile: "minimal", hudMetricsLayout: "compact", hudMapVis: "auto", hudGapsVis: "auto", titleIntro: "off", menuWash: "soft", titleArt: "soft" } },
    { id: "sunlight", name: "SUNLIGHT", note: "Bright, solid and readable", values: { homeScene: "static", uiTheme: "light", lookPopups: { dim: "solid" }, lookRace: { dim: "solid" }, lookCareer: { dim: "solid" } } },
  ]);
  const store = () => GameStore.store;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function normalizeSnapshot(input) {
    const src = isObject(input) ? input : {}, out = {};
    for (const k of VISUAL_KEYS) {
      const v = src[k];
      if (ENUMS[k]) out[k] = ENUMS[k].includes(v) ? v : DEFAULTS[k];
      else if (k.endsWith("Hex")) out[k] = /^#[0-9a-f]{6}$/i.test(v || "") ? v.toLowerCase() : DEFAULTS[k];
      else if (k.endsWith("Scale") || k.endsWith("Opacity")) {
        const lo = k.endsWith("Opacity") ? 20 : k === "hudScale" ? 70 : 40, hi = k.endsWith("Opacity") ? 100 : k === "hudBtnScale" ? 300 : 200;
        out[k] = typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) * 4) / 4 : null;
      } else if (LOOKS[k]) out[k] = isObject(v) && typeof ScreenLooks !== "undefined" ? ScreenLooks.normalize(LOOKS[k], v) : null;
      else if (k === "hudLayout") out[k] = isObject(v) && v.v === 4 && typeof HudLayout !== "undefined" ? { v: 4, ...HudLayout.migrate(v) } : null;
      else if (k === "dockLayout") out[k] = isObject(v) && typeof DockLayout !== "undefined" ? DockLayout.normalize(v) : null;
      else if (k === "screenPlacement") out[k] = isObject(v) && typeof SettingsExport !== "undefined"
        ? SettingsExport.normalizePlacement(v, typeof ScreenRegions === "undefined" ? null : ScreenRegions) || null : null;
      else if (k === "titleLayout") {
        out[k] = null;
        if (isObject(v) && typeof TitleLayout !== "undefined") {
          // v1 shared one shape. In v2 an absent orientation must keep following the device.
          for (const shape of ["wide", "tall"]) {
            const layout = v.v === 2 ? v[shape] : v;
            if (isObject(layout)) (out[k] ||= { v: 2 })[shape] = TitleLayout.normalize(layout);
          }
        }
      }
    }
    return out;
  }
  function snapshot() { const out = {}; for (const k of VISUAL_KEYS) out[k] = store().get(k, DEFAULTS[k]); return normalizeSnapshot(out); }
  function scene() {
    const mode = store().get("homeScene", DEFAULTS.homeScene), motion = store().get("backgroundMotion", "ambient");
    return { mode: ENUMS.homeScene.includes(mode) ? mode : DEFAULTS.homeScene, motion: motion === "ambient" ? "ambient" : "still" };
  }
  function homeCamera() { const value = store().get("homeCamera", "side"); return ENUMS.homeCamera.includes(value) ? value : "side"; }
  function effectiveSceneMotion() {
    const s = scene();
    const os = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return s.motion === "ambient" && !os && (typeof TitleFx === "undefined" || TitleFx.mode() !== "reduce") ? "ambient" : "still";
  }
  function normalizeProfiles(raw) {
    if (!Array.isArray(raw)) return [];
    const ids = new Set();
    return raw.slice(0, 12).filter((p) => isObject(p) && typeof p.id === "string" && /^[a-z0-9-]{1,64}$/i.test(p.id) && typeof p.name === "string" && p.name.trim() && !ids.has(p.id) && ids.add(p.id))
      .map((p) => {
        const values = normalizeSnapshot(p.values);
        // Profiles saved before layout capture leave these devices and screens as configured.
        for (const k of ["hudLayout", "dockLayout", "hudBtnShape", "screenPlacement"]) if (!Object.hasOwn(p.values || {}, k)) delete values[k];
        return { id: p.id, name: p.name.trim().slice(0, 40), values };
      });
  }
  function profiles() { return normalizeProfiles(store().get(PROFILE_KEY, [])); }
  const shapeNow = () => { const s = typeof document !== "undefined" && document.body ? document.body.getAttribute("data-shape") : null; return s === "tall" || s === "wide" ? s : null; };

  let body = null;
  let pendingHooks = null;
  const pendingListeners = [];
  let _load = null;

  function takeBody() {
    if (body || typeof AppearanceStudioBody === "undefined") return body;
    body = AppearanceStudioBody;
    if (pendingHooks) { body.attach(pendingHooks); pendingHooks = null; }
    while (pendingListeners.length) body.onSceneChange(pendingListeners.shift());
    return body;
  }

  function ensureBody() {
    if (takeBody()) return Promise.resolve(true);
    if (_load) return _load;
    const files = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_UI_PRESETS) || [];
    const edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_UI_PRESETS_EDGES) || [];
    if (!files.length || typeof ScriptLoader === "undefined") {
      Log.warn("ui", "appearance studio body is not in this build");
      return Promise.resolve(false);
    }
    // LayoutPresets already rides this group; SettingsNav.presets() may be in flight.
    const presets = typeof SettingsNav !== "undefined" && SettingsNav.presets ? SettingsNav.presets() : null;
    _load = Promise.all([ScriptLoader.create().load(files, edges, { strict: true }), presets]).then(() => {
      if (!takeBody()) { _load = null; Log.warn("ui", "appearance studio body did not load"); return false; }
      return true;
    }).catch((e) => {
      _load = null;
      Log.warn("ui", "appearance studio body did not load: " + (e && e.message || e));
      return false;
    });
    return _load;
  }

  function via(name, fallback) {
    return (...args) => {
      const b = takeBody();
      if (b && typeof b[name] === "function") return b[name](...args);
      return typeof fallback === "function" ? fallback(...args) : fallback;
    };
  }

  function attach(value) {
    const b = takeBody();
    if (b) return b.attach(value);
    pendingHooks = value || {};
    try { if (typeof pendingHooks.applyVisuals === "function") pendingHooks.applyVisuals(snapshot()); } catch (e) { Log.warn("ui", "Appearance attach: " + e.message); }
  }
  function onSceneChange(fn) {
    if (typeof fn !== "function") return () => {};
    const b = takeBody();
    if (b) return b.onSceneChange(fn);
    pendingListeners.push(fn);
    return () => { const i = pendingListeners.indexOf(fn); if (i >= 0) pendingListeners.splice(i, 1); };
  }
  function setScene(mode, motion) {
    const b = takeBody();
    if (b) return b.setScene(mode, motion);
    const next = snapshot();
    if (mode !== undefined) next.homeScene = mode;
    if (motion !== undefined) next.backgroundMotion = motion;
    return applySnapshot(next);
  }
  function setHomeCamera(value) {
    const b = takeBody();
    if (b) return b.setHomeCamera(value);
    const next = snapshot(); next.homeCamera = value; return applySnapshot(next);
  }
  function applySnapshot(value, options = {}) {
    const b = takeBody();
    if (b) return b.applySnapshot(value, options);
    const next = normalizeSnapshot(value), before = snapshot(), keys = options.scope === "screen" ? (SCREEN_KEYS.home || VISUAL_KEYS) : VISUAL_KEYS;
    let durable = true;
    try {
      for (const k of keys) {
        if (JSON.stringify(before[k]) === JSON.stringify(next[k])) continue;
        if (store().set(k, k === "motion" && next[k] === null ? undefined : clone(next[k])) === false) durable = false;
      }
    } catch (e) { Log.warn("ui", "Appearance apply: " + e.message); }
    return { ok: true, durable };
  }
  function notify(message) {
    const b = takeBody();
    if (b) return b.notify(message);
  }
  function initUI() {
    const run = () => { const b = takeBody(); if (b) b.initUI(); };
    if (takeBody()) { run(); return; }
    // Do not re-enter SettingsNav.lazy: this initUI is often already the gated
    // callback (#4798), and a second lazy() after flush would never run.
    ensureBody().then((ok) => { if (ok) run(); });
  }
  function setPreviewFrame(url) {
    const b = takeBody();
    return b ? b.setPreviewFrame(url) : false;
  }

  // #4529 PORTRAIT & LANDSCAPE — eager: SEPARATE must swap without opening APPEARANCE.
  const SHAPE_SETTLE_MS = 2000;
  let shapeTimer = 0;
  function shapeSettle() {
    clearTimeout(shapeTimer);
    const st = store().get("appearanceShapes", null), at = shapeNow();
    if (!isObject(st) || st.v !== 2 || st.mode !== "separate" || !at || st.live === at) return;
    shapeTimer = setTimeout(() => {
      if (shapeNow() !== at || document.hidden) return;
      const run = () => {
        if (typeof LayoutPresets === "undefined" || !LayoutPresets.syncShape(at)) return;
        const b = takeBody();
        if (b && typeof b.afterShapeSwap === "function") b.afterShapeSwap();
      };
      if (typeof LayoutPresets !== "undefined") run();
      else if (typeof SettingsNav !== "undefined" && SettingsNav.presets) SettingsNav.presets().then(run);
    }, SHAPE_SETTLE_MS);
  }
  try {
    if (typeof document !== "undefined" && document.body && typeof MutationObserver !== "undefined") {
      new MutationObserver(shapeSettle).observe(document.body, { attributes: true, attributeFilter: ["data-shape"] });
      document.addEventListener("visibilitychange", shapeSettle);
      shapeSettle();
    }
  } catch (e) { Log.warn("ui", "orientation watch: " + e.message); }

  // Prefetch with the rest of LAZY_UI_PRESETS so APPEARANCE / Photo open cold rarely.
  ensureBody();
  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(initUI) : initUI()), { once: true });
    else initUI();
  }

  return Object.freeze({
    PROFILE_KEY, DEFAULTS, VISUAL_KEYS, SCREEN_KEYS, PRESETS, PRESET_PRESERVE,
    normalizeSnapshot, snapshot, scene, homeCamera, setHomeCamera, effectiveSceneMotion, setScene, onSceneChange,
    applySnapshot, applyPreset: via("applyPreset", false), undo: via("undo", false), reset: via("reset"),
    profiles, normalizeProfiles, saveProfile: via("saveProfile", { ok: false, reason: "loading" }),
    loadProfile: via("loadProfile", false), deleteProfile: via("deleteProfile", false),
    shapeNow, attach, setPreviewFrame, notify, initUI, ensureLoaded: ensureBody, loaded: () => !!takeBody(),
  });
})();
Object.freeze(AppearanceStudio);
