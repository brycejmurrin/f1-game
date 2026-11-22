/* Apex 26 — SettingsExport: SETTINGS › SAVES & DATA,
   which carries a player's state OUT of the browser and back IN. THREE files,
   deliberately separate:

     SETTINGS  preferences, tuners and control bindings — how you like the game
               to behave. CHANGED lists only what differs from the shipped
               default, each with the default it replaced and the source file
               that owns it, so "make my settings the defaults" is a list of
               edits rather than a hunt; ALL lists every key's effective value.
     GARAGE    parts, liveries, setup sheets and an invented team — what you
               BUILT. A new phone wants the first file; a friend wants the
               second.
     CAREER    the six save slots (driver.0..2, myteam.0..2) and the live
               slot pointer — what a long championship is. Mounted from the
               CAREER MODES screen the way GARAGE injects its row, so shell
               node count does not grow.

   Loading any one overwrites what is stored and reloads the page, so the
   button asks twice. SETTINGS may carry time-trial leaderboards in an optional
   `ttlb` section and player progress in an optional `progress` section
   (js/ui/progress-backup.js, #5992; both merged on import, never overwriting
   blindly). GARAGE and SETTINGS still never carry career or season saves,
   replays, or anything account-shaped, in either direction.

   SPEC below is the allowlist — every player-facing preference, tuner and
   control binding under the `apex26.` prefix, grouped the way SETTINGS is.
   Nothing else is ever read: the garage (parts, liveries, setup sheets, MY
   TEAM), saves (career, season, replays, daily bests), accounts
   and network (Spotify tokens, TURN credentials, relays) and the renderer's
   self-healing latches stay out by construction, and the unit test asserts
   that a poisoned store leaks none of them. Two lanes, like the store: `json`
   values went through store.set (JSON), `raw` values are the bare strings the
   settings panels keep with store.rawSet ("1"/"0", ids).
   THE SPLIT (#4748). This file is the FULL half: FORMAT, SPEC (SaveSchemaRegistry ingests it at
   eval and js/core/store.js validates every write against it), the garage key and value gates
   (garageValue / isGarageKey, read synchronously by js/career/team-identity.js and
   js/career/career-backup.js) and a façade with the module's whole public API. Collect, apply,
   ttlb, the career file and the UI (create's mount, garageRow, careerRow) are the BODY,
   SettingsExportBody in js/ui/settings-export-body.js, LAZY_SAVES_DATA: LazyBundles.ensureSavesData
   loads it at idle, at the garage door, with the agent surface and with the career screen. Before
   it lands a body call returns a Promise of the same answer, and garageRow / careerRow return null
   (their callers already guard that). SettingsExport.create(G) is wired from js/game.js and
   records G; the first call after the body lands creates it with that G.
   Storage contract (screenPlacement, profiles): docs/notes/SCREEN-LOOKS-STORAGE.md. */
const SettingsExport = (function () {
  "use strict";

const FORMAT = "apex26-settings-v1";

// One row per preference: k = key after the prefix, lane, group, def = the
// shipped default (a function when it depends on the device or another
// module), src = where that default lives, changed = an override for keys
// whose stored form is not comparable to the default by value (the binding
// tables save a full map even when it is the default one), info = carried in
// ALL for context but never counted as a change.
//
// subsystem = THIS KEY IS NOT A PREFERENCE. A player may set it, and it still
// must not become a SHIPPED default from someone's export, because what it
// switches is a whole system rather than a taste: the driving model, the career
// economy, race control. The string is the reason, and it is read by
// tools/gen/settings-defaults.mjs, which refuses such a key unless it is named
// with --include, and by tests/unit/settings-defaults.test.mjs, which fails if
// one reaches js/data/settings-defaults.js anyway.
//
// It lives HERE, on the row, and not in a list inside the tool, because the
// tool's list was mine and the next person has to remember it exists. Three
// keys were learned the hard way in one sitting — steering (the physics
// baseline went red), unlimitedBudget (caught before it shipped), caution (CI
// went red and the release train never fired) — and each time the question was
// asked at the wrong moment. Asked at the ROW, it is asked when the key is
// added.
//
// perDevice = the value belongs to the device: an UNSET key exports as null (collect), and a file
// saved on the other kind of device (file.device.desktop) never writes it (applySettings, #5005).
// deviceBound = the renderer pins (backend, forced GL, XR backend): only that second half of perDevice.
// noImport = exported for context, never written back by LOAD SETTINGS (#5032).
const SPEC = [
  // MUSIC & SOUND (js/audio/panel.js)
  { k: "sound", lane: "json", group: "audio", def: false, src: "js/game.js",
    subsystem: "ships the game MUTED for every new player — an export from a silenced phone looks exactly like this" },
  { k: "sfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "menuSfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "music", lane: "json", group: "audio", def: false, src: "js/game.js" },
  { k: "volMusic", lane: "json", group: "audio", def: 0.7, src: "js/audio/panel.js" },
  { k: "volSfx", lane: "json", group: "audio", def: 0.4, src: "js/audio/panel.js" },
  { k: "battleEarcon", lane: "json", group: "audio", def: false, src: "js/race/race-radio.js" },
  { k: "radioVoice", lane: "json", group: "audio", def: false, src: "js/audio/panel.js" },
  { k: "announcer", lane: "json", group: "audio", def: true, src: "js/audio/announcer.js" },
  { k: "volRadio", lane: "json", group: "audio", def: 0.8, src: "js/audio/panel.js" },
  { k: "radioFocusDb", lane: "json", group: "audio", def: 0, src: "js/audio/panel.js", oneOf: [0, 4, 8, 12] },
  { k: "radioFx", lane: "json", group: "audio", def: 1, src: "js/audio/panel.js" },
  { k: "radioPreset", lane: "json", group: "audio", def: "modern", oneOf: ["modern", "clean", "vintage"], src: "js/audio/panel.js" },
  { k: "spokenLang", lane: "json", group: "audio", def: "auto", src: "js/audio/radio-voice.js", oneOf: ["auto", "en"] },
  { k: "voiceTune", lane: "json", group: "audio", def: {}, src: "js/audio/radio-voice.js" },
  { k: "radioChat", lane: "json", group: "audio", def: "normal", src: "js/race/race-radio.js", oneOf: ["off", "key", "normal", "chatty"] },
  { k: "radioPack", lane: "json", group: "audio", def: true, src: "js/audio/radio-voice.js" },
  { k: "spotter", lane: "json", group: "audio", def: false, src: "js/race/spotter.js" },
  { k: "commentary", lane: "json", group: "audio", def: "tv", src: "js/race/race-radio.js", oneOf: ["off", "tv", "on"] },
  { k: "musicSource", lane: "json", group: "audio", def: "all", src: "js/audio/panel.js" },
  { k: "sndProfile", lane: "json", group: "audio", def: "team", src: "js/audio/panel.js" },
  // The engine's tables arrive with the lazy audio bundle: the stub answers {}, and a {} default made every
  // stored table CHANGED (#5743 S1). undefined = "not known yet": collect lists no diff for it.
  { k: "sndTune", lane: "json", group: "audio", def: () => engineTable("tuneDefaults"), table: true, src: "js/audio/engine.js TUNE_DEF" },
  { k: "sndLayers", lane: "json", group: "audio", def: () => engineTable("layerDefaults"), table: true, src: "js/audio/engine.js LAYER_DEF" },
  // DISPLAY (js/ui/scale.js, js/perf/quality-preset.js, js/perf/renderer-picker.js)
  // UNSET is the default here, and it is not the same number on every device:
  // the `(pointer: coarse)` block of css/tokens.css owns the touch numbers so a
  // phone is right on its FIRST paint, and js/ui/scale.js mirrors them. null is
  // the honest default to report — a stored number is the change.
  { k: "uiScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null follows viewport: 115% on fine-pointer windows at least 1600×900 CSS px, 70% on phones, 109% on other touch screens, 100% otherwise)" },
  { k: "hudScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%)" },
  { k: "hudBtnScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = factory size: phone 143.25, tablet 125, fine pointer 100; displayed as 100%)" },
  { k: "hudBotKeep", lane: "json", group: "display", def: null, src: "js/ui/scale.js gear row kept on BUTTON SIZE moves (null = none)" },
  { k: "hudBtnOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = 100%)" },
  { k: "hudBtnShape", lane: "json", group: "display", def: null, src: "js/ui/dock-layout.js BUTTON SHAPE (null = AUTO)", oneOf: ["round", "squircle", "square", "arch", "shield", "paddle-left", "paddle-right", "leaf"] },
  { k: "hudPanelOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js PANEL OPACITY (null = 100%; HIGH CONTRAST keeps plates solid)" },
  { k: "motion", lane: "json", group: "a11y", def: null, src: "js/ui/title-fx.js REDUCE MOTION (null/auto = follow OS; reduce=ON; off; legacy on → auto)", oneOf: ["auto", "reduce", "off", "on"] },
  { k: "focusRing", lane: "json", group: "a11y", def: "high", src: "js/ui/a11y-opts.js KEYBOARD FOCUS", oneOf: ["standard", "high"] },
  { k: "cbCues", lane: "json", group: "a11y", def: "off", src: "js/ui/a11y-opts.js COLOURBLIND CUES", oneOf: ["off", "on"] },
  { k: "holdMode", lane: "json", group: "a11y", def: { throttle: "hold", lookBack: "hold" }, src: "js/ui/a11y-opts.js GAS / LOOK BACK hold mode" },
  { k: "titleIntro", lane: "json", group: "appearance", def: "full", src: "js/ui/title-fx.js TITLE INTRO (full | quick | off)", oneOf: ["full", "quick", "off"] },
  { k: "menuWash", lane: "json", group: "appearance", def: "full", src: "js/ui/title-fx.js MENU WASH (full | medium | soft | off)", oneOf: ["full", "medium", "soft", "off"] },
  { k: "titleButtonStyle", lane: "json", group: "appearance", def: "auto", src: "js/ui/title-fx.js BUTTON STYLE", oneOf: ["auto", "racing", "flat"] },
  { k: "titleArt", lane: "json", group: "appearance", def: "on", src: "js/ui/title-fx.js TITLE ART (on | medium | soft | off)", oneOf: ["on", "medium", "soft", "off"] },
  { k: "pauseLayout", lane: "json", group: "appearance", def: "grid", src: "js/ui/pause-opts.js PAUSE MENU › LAYOUT (grid | list | compact | wide | sidebar)", oneOf: ["grid", "list", "compact", "wide", "sidebar"] },
  { k: "pauseSide", lane: "json", group: "appearance", def: "centre", src: "js/ui/pause-opts.js PAUSE MENU › SIDE (centre | left | right)", oneOf: ["centre", "left", "right"] },
  { k: "pauseDim", lane: "json", group: "appearance", def: "full", src: "js/ui/pause-opts.js PAUSE MENU › BACKGROUND (full | soft | off)", oneOf: ["full", "soft", "off"] },
  { k: "pauseConfirm", lane: "json", group: "appearance", def: "on", src: "js/ui/pause-opts.js PAUSE MENU › CONFIRM QUIT (on | off; two presses on QUIT / RESTART)", oneOf: ["on", "off"] },
  { k: "screenPlacement", lane: "json", group: "appearance", def: null, src: "js/ui/screen-placement.js (explicit viewport-relative regions by orientation)",
    normalize: v => normalizePlacement(v, typeof ScreenRegions === "undefined" ? null : ScreenRegions) },
  { k: "titleLayout", lane: "json", group: "appearance", def: null, src: "js/ui/title-layout.js TITLE LAYOUT (null = shipped; else {v:2, wide, tall}, one {btns,title,art,layout,side} per shape — a missing shape is shipped; a v1 object is both)" },
  { k: "lookPause", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js PAUSE MENU buttons & card (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookDatahub", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js DATA HUB (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookSelect", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js TRACK SELECTOR (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookRace", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js RACE SETTINGS (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookCareer", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js CAREER (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookGarage", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js GARAGE (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookPopups", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js POPUPS (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookDesigner", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js TRACK DESIGNER (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "layoutPreset", lane: "json", group: "appearance", def: null, src: "js/ui/layout-presets.js LAYOUT PRESET (null = none recorded; the last preset applied — it reads CUSTOM once the knobs above no longer match it)", oneOf: ["shipped", "thumb", "compact", "big"] },
  { k: "resMode", lane: "json", group: "display", def: (G) => (typeof UiScale !== "undefined" && UiScale.defaultResMode ? UiScale.defaultResMode() : "auto"), src: "js/ui/scale.js (HIGH on iPhone, AUTO otherwise)", perDevice: true },
  { k: "resSchema", lane: "json", group: "display", def: 1, info: true, src: "js/ui/scale.js RES_SCHEMA (migration version — boot writes the current one, so never a change)" },
  { k: "spatialUpscale", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js + GLX/WGX/TLX SGSR (UPSCALING-2026-09 §6–7; OFF by default)" },
  { k: "occlusionCull", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js OCCLUSION row + GLX hardware depth queries (js/render/glx/chunked.js; GLX only, OFF by default)" },
  { k: "buildWorker", lane: "raw", group: "display", def: "1", src: "js/track/build-client.js BUILD IN BACKGROUND (unset = ON when multi-core; \"0\"/\"1\" force)", oneOf: ["0", "1"], perDevice: true },
  { k: "portraitOk", lane: "raw", group: "display", def: "0", src: "js/game.js RACE IN PORTRAIT (\"1\" = race upright, else the rotate blocker)", oneOf: ["0", "1"] },
  { k: "debris", lane: "raw", group: "display", def: "0", src: "js/ui/post-fx-opts.js (PostFxOpts.debris) + js/physics/debris-world.js create() (only \"1\" is on)" },
  { k: "gfxSsao", lane: "raw", group: "display", def: () => typeof PostFxOpts !== "undefined" && !PostFxOpts.defaultSsao() ? "0" : "1", perDevice: true, src: "js/ui/post-fx-opts.js AMBIENT OCCLUSION (only \"0\" is off; game.js zeroes po.ssao + po.contact)", oneOf: ["0", "1"] },
  { k: "gfxGodrays", lane: "raw", group: "display", def: "1", src: "js/ui/post-fx-opts.js GOD-RAYS (only \"0\" is off; game.js zeroes po.godray + po.lampVol)", oneOf: ["0", "1"] },
  { k: "gfxPhoneFeatureOverrides", lane: "json", group: "display", def: {}, whole: true, perDevice: true, src: "js/ui/desktop-graphics.js phone detail choices" },
  { k: "gfxFeatureOverrides", lane: "json", group: "display", def: {}, whole: true, perDevice: true, src: "js/ui/desktop-graphics.js per-effect choices" },
  { k: "gfxPreset", lane: "json", group: "display", def: (G) => (typeof GfxQuality !== "undefined" && GfxQuality.defaultId) ? GfxQuality.defaultId(!!(G && G.gfx && G.gfx.isMobile)) : "high", src: "js/perf/quality-preset.js defaultId", perDevice: true },
  { k: "gfxHigh", lane: "raw", group: "display", def: null, src: "js/perf/quality-preset.js (legacy mobile tier)" },
  { k: "gfxBackend", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js + js/render/renderer-boot.js (unset = TLX when a GPU adapter resolves, else GLX — skips three.webgpu)", deviceBound: true },
  { k: "tlxForceGL", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js (null = AUTO)", deviceBound: true },
  { k: "tlxMaterialDetail", lane: "raw", group: "display", def: "4", src: "js/render/three/tlx.js (manual reload)", oneOf: ["4", "8"] },
  { k: "tlxSharpenLimit", lane: "raw", group: "display", def: "0", src: "js/render/three/tlx-post.js (prototype)", oneOf: ["0", "1"] },
  { k: "tlxEnvProbe", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js CAR REFLECTIONS (null = OFF)" },
  { k: "xr", lane: "raw", group: "display", def: "0", src: "js/xr/xr-opts.js", oneOf: ["0", "1"] },
  { k: "xrBackend", lane: "raw", group: "display", def: "webgl2", src: "js/xr/xr-opts.js", oneOf: ["webgl2", "webgpu"], deviceBound: true },
  { k: "xrInput", lane: "raw", group: "display", def: "controllers", src: "js/xr/xr-opts.js", oneOf: ["controllers", "existing"] },
  // HUD (js/game.js)
  { k: "hudProfile", lane: "json", group: "hud", def: "standard", oneOf: ["minimal", "standard", "broadcast"], src: "js/game.js" },
  { k: "hudMetricsLayout", lane: "json", group: "hud", def: "full", src: "js/game.js" },
  { k: "hudMapVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudGapsVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudElements", lane: "json", group: "hud", def: () => typeof HudElements !== "undefined" ? HudElements.defaults() : {}, src: "js/ui/hud-elements.js phone and desktop visibility defaults", perDevice: true, whole: true },
  { k: "hudLayout", lane: "json", group: "hud", def: null, deviceBound: true, src: "js/ui/hud-layout.js MOVE & SIZE (null = shipped; else {v:4, standard?, minimal?, broadcast?}, each {cockpit, helmet, other} of {id: {x, y, s}} with optional width/minHeight in viewport shares and textSize in percent on text panels; offsets are finite and size positive finite, without visual bounds. Missing elements in saved layouts use automatic placement)" },
  { k: "hudColors", lane: "json", group: "hud", def: null, src: "js/ui/hud-layout.js per-element colors" },
  { k: "hudMirror", lane: "json", group: "hud", def: "auto", src: "js/render/shared/mirror-pass.js", oneOf: ["auto", "on", "off"] },
  { k: "garageArrival", lane: "json", group: "camera", def: null, src: "js/garage/arrival.js (null = shipped arrival settings)" },
  { k: "flybyShots", lane: "json", group: "camera", def: null, src: "js/camera/flyby-panel.js FLYBY SHOT EDITOR (null = shipped shots)" },
  { k: "ldCard", lane: "json", group: "camera", def: null, src: "js/ui/loading-screen.js loading card {scale, x, y} (null = shipped)" },
  // CAMERA (js/camera/mode-switch.js, offsets.js, cockpit-opts.js)
  { k: "helmetEye", lane: "raw", group: "camera", def: "standard", src: "js/camera/cockpit-opts.js CHOICES.helmetEye", oneOf: ["standard", "tucked", "upright", "forward", "back", "high", "low"] },
  { k: "helmetMount", lane: "raw", group: "camera", def: "center", src: "js/camera/cockpit-opts.js CHOICES.helmetMount", oneOf: ["center", "left", "right"] },
  { k: "helmetShake", lane: "raw", group: "camera", def: "normal", src: "js/camera/cockpit-opts.js helmet shake (percent or legacy preset)", oneOf: ["normal", "medium", "soft", "off", ...Array.from({ length: 151 }, (_, i) => String(i))] },
  ...["helmetImpact", "helmetKerb", "helmetBuzz", "helmetHeadMotion"].map(k => ({ k, lane: "raw", group: "camera", def: "100", src: "js/camera/cockpit-opts.js motionAmount (percent)" })),
  { k: "helmetVisorShape", lane: "raw", group: "camera", def: "standard", src: "js/camera/cockpit-opts.js CHOICES.visorShape", oneOf: ["standard", "panoramic", "slit", "rounded", "square"] },
  { k: "helmetVisor", lane: "raw", group: "camera", def: "off", src: "js/camera/cockpit-opts.js CHOICES.visor", oneOf: ["off", "clear", "smoke"] },
  { k: "helmetVisorColor", lane: "raw", group: "camera", def: "amber", src: "js/camera/cockpit-opts.js CHOICES.visorColor", oneOf: ["neutral", "amber", "ice", "rose", "green", "violet", "copper"] },
  { k: "helmetVisorIntensity", lane: "raw", group: "camera", def: "medium", src: "js/camera/cockpit-opts.js CHOICES.visorIntensity", oneOf: ["trace", "light", "medium", "strong", "deep"] },
  { k: "helmetVisorRefraction", lane: "raw", group: "camera", def: "off", src: "js/camera/cockpit-opts.js CHOICES.visorRefraction", oneOf: ["off", "light", "medium", "strong"] },
  { k: "helmetVisorReflections", lane: "raw", group: "camera", def: "light", src: "js/camera/cockpit-opts.js CHOICES.visorReflections", oneOf: ["light", "off", "medium", "strong"] },
  { k: "helmetVisorBeams", lane: "raw", group: "camera", def: "100", src: "js/camera/cockpit-opts.js BEAMS_DEFAULT (percent, 0–200)" },
  { k: "helmetVisorRain", lane: "raw", group: "camera", def: "normal", src: "js/camera/cockpit-opts.js CHOICES.visorRain", oneOf: ["normal", "off", "light", "heavy"] },
  { k: "helmetVisorDropSize", lane: "raw", group: "camera", def: "100", src: "js/camera/cockpit-opts.js visorDropSize (percent,50–200)" },
  { k: "helmetVisorRunoff", lane: "raw", group: "camera", def: "normal", src: "js/camera/cockpit-opts.js CHOICES.visorRunoff", oneOf: ["normal", "slow", "fast"] },
  { k: "camMode", lane: "json", group: "camera", def: 19, src: "js/camera/mode-switch.js (index into CAM_MODES)" },
  { k: "pitCamAuto", lane: "json", group: "camera", def: false, src: "js/camera/extra-rigs.js (opt-in auto-cut to PIT WALL in pits)" },
  { k: "pitEntryShot", lane: "json", group: "camera", def: true, src: "js/camera/extra-rigs.js PIT ENTRY SHOT (feel.js row; #4745)" },
  { k: "camTune", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js CAM_TUNE_DEFS (geometric knobs def 0; cornerLead def 0.54; the file holds {mode:{knob:value}} edits)" },
  { k: "camTuneGlobal", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js global baseline layered under every mode (same knob ids as camTune)" },
  { k: "camComfort", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js COMFORT_DEFS (fovBias/speedFov/bob/rollLean — independent of MOTION: REDUCED)" },
  { k: "camTuneTrack", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js per-track framing/comfort overrides (track > car > mode/global)" },
  { k: "camTuneCar", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js per-car framing/comfort overrides (track > car > mode/global)" },
  { k: "blurNotch", lane: "json", group: "camera", def: 1, src: "js/camera/cam-comfort.js MOTION BLUR (1 = off)", oneOf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { k: "motionBlur", lane: "json", group: "camera", def: 5, src: "js/camera/cam-comfort.js legacy MOTION BLUR notch before #5990 (never drew; inert since blurNotch, kept so old files round-trip)", oneOf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { k: "speedLines", lane: "json", group: "camera", def: 5, src: "js/camera/cam-comfort.js SPEED LINES (1 = off)", oneOf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { k: "cockpitHalo", lane: "raw", group: "camera", def: "fairing", src: "js/camera/cockpit-opts.js HALO_VALUES (\"1\" = standard, \"0\" = off)", oneOf: ["0", "slim", "1", "thick", "fairing"] },
  { k: "cockpitWheelFinish", lane: "raw", group: "camera", def: "carbon", src: "js/camera/cockpit-finishes.js", oneOf: ["carbon", "livery", "anodised", "suede", "stock"] },
  { k: "cockpitBodyFinish", lane: "raw", group: "camera", def: "livery", src: "js/camera/cockpit-finishes.js", oneOf: ["livery", "gloss", "matte", "satin", "carbon", "brushed", "chrome"] },
  { k: "cockpitHaloFinish", lane: "raw", group: "camera", def: "livery", src: "js/camera/cockpit-finishes.js", oneOf: ["livery", "gloss", "matte", "satin", "carbon", "brushed", "chrome"] },
  { k: "cockpitWheel", lane: "raw", group: "camera", def: "f1", src: "js/camera/cockpit-opts.js CHOICES.wheel", oneOf: ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"] },
  { k: "cockpitBody", lane: "raw", group: "camera", def: "sculpted", src: "js/camera/cockpit-opts.js CHOICES.body", oneOf: ["standard", "sculpted", "wide", "tapered", "stepped"] },
  { k: "cockpitSeat", lane: "raw", group: "camera", def: "fwd", src: "js/camera/cockpit-opts.js CHOICES.seat", oneOf: ["std", "low", "high", "fwd"] },
  { k: "cockpitInterior", lane: "raw", group: "camera", def: "team", src: "js/camera/cockpit-opts.js CHOICES.interior", oneOf: ["carbon", "team", "suede", "ribbed", "classic"] },
  { k: "cockpitTurnChaseLead", lane: "raw", group: "camera", def: "0.4", src: "js/camera/cockpit-opts.js LEAD_DEFAULT" },
  { k: "lookBackLatch", lane: "json", group: "camera", def: false, src: "js/camera/feel.js LOOK BACK LATCH (hold vs press-to-latch)" },
  { k: "speedVignette", lane: "json", group: "camera", def: false, src: "js/camera/feel.js SPEED VIGNETTE (off by default)" },
  // LIGHTING TUNER (js/lighting)
  { k: "lightTune", lane: "json", group: "lighting", def: {}, src: "js/lighting/knobs.js TUNE_DEFS (the file holds {\"track|tod|weather\":{knob:value}} edits)" },
  // DRIVING / RACE RULES (js/game.js, js/race/race-control.js)
  { k: "steerMode", lane: "json", group: "driving", def: "buttons", oneOf: ["tilt", "buttons", "touch"], src: "js/game.js" },
  { k: "manual", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "autoThrottle", lane: "json", group: "driving", def: false, src: "js/game.js (XAG 107: a held accelerator is an input barrier)" },
  { k: "mirrorControls", lane: "json", group: "driving", def: false, src: "js/game.js (left-handed dock)" },
  { k: "dockLayout", lane: "json", group: "driving", def: null, src: "js/ui/dock-layout.js (touch control placement, spacing, layout, sizes and shapes by steering scheme)", whole: true,
    normalize: v => {
      if (v === null) return null;
      if (typeof DockLayout === "undefined" || !isObj(v) || Object.hasOwn(v, "v") || !DockLayout.SCHEMES.some(k => isObj(v[k]))) return undefined;
      const clean = DockLayout.normalize(v);
      return DockLayout.SCHEMES.every(k => DockLayout.isIdentity(clean[k])) ? null : clean;
    } },
  // PER-DEVICE STEERING (js/input/steer-tuning.js). Each defaults to the notch
  // that reproduces exactly what shipped, so an absent key is a no-op.
  { k: "tiltCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "touchSteeringGuide", lane: "json", group: "driving", def: "ring", oneOf: ["ring", "wheel"], src: "js/input/touch-button-actions.js (touch steering guide)" },
  { k: "touchCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "padCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "touchRange", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js touchRangeFromSlider (0.12 of the long edge at 5)" },
  { k: "touchDragSpeed", lane: "json", group: "driving", def: 1, src: "js/input/steer-tuning.js touchSpeedFromSlider (1 = off, the default; 10 = full ADAPTIVE BUTTONS shed on drag range)" },
  { k: "dragSmooth", lane: "json", group: "driving", def: 1, src: "js/input/steer-tuning.js dragCutoffFromSlider (1 = filter off)" },
  { k: "digitalRate", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js steerRateFromSlider (KEY_RAMP_IN)" },
  { k: "analogSpeedSteer", lane: "json", group: "driving", def: 1, src: "js/input/steer-tuning.js analogSpeedFromSlider (1 = off)" },
  { k: "haptics", lane: "json", group: "driving", def: 6, src: "js/input/steer-tuning.js (scales Input.vibrate and Input.rumble)" },
  { k: "triggerHaptics", lane: "json", group: "driving", def: true, src: "js/input/steer-tuning.js (L2/R2 trigger-rumble; falls back to dual-rumble when off or unsupported)" },
  { k: "padDeadzone", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js (percent of stick travel)" },
  { k: "padSaturation", lane: "json", group: "driving", def: 0, src: "js/input/steer-tuning.js (percent short of the rim that is full lock)" },
  { k: "padLabels", lane: "json", group: "driving", def: "auto", src: "js/ui/key-binds.js (Xbox/PlayStation/Nintendo button names)" },
  { k: "padAxes", lane: "json", group: "driving", def: null, src: "js/ui/key-binds.js wheel wizard (axis indices + signs)" },
  { k: "padProfiles", lane: "json", group: "driving", def: { v: 1, devices: [], legacyClaimed: false }, src: "js/input/controller-profiles.js",
    normalize: (v) => {
      if (typeof ControllerProfiles === "undefined" || !isObj(v) || ("v" in v && v.v !== 1)
          || (!("devices" in v) && !("legacyClaimed" in v))
          || ("devices" in v && (!Array.isArray(v.devices) || v.devices.length > ControllerProfiles.MAX))
          || ("v" in v && !Array.isArray(v.devices))
          || ("legacyClaimed" in v && typeof v.legacyClaimed !== "boolean")) return undefined;
      // CHANGED files carry only object fields off their defaults. Merge those
      // defaults; full legacy v1 maps still let clean infer legacyClaimed.
      const raw = Object.assign({ v: 1, devices: [], legacyClaimed: false }, v);
      if (v.v === 1 && !("legacyClaimed" in v)) delete raw.legacyClaimed;
      const clean = ControllerProfiles.clean(raw);
      return clean.devices.length === raw.devices.length ? clean : undefined;
    } },
  { k: "conditionCues", lane: "json", group: "driving", def: true, src: "js/ui/condition-cue-controls.js" },
  { k: "padRest", lane: "json", group: "driving", def: 0, src: "js/ui/key-binds.js CALIBRATE STICK (steer-axis rest offset per pad: {[padId]: v}, |v| <= 0.5; a legacy scalar is adopted by the first pad that drives; 0 = uncalibrated)",
    // A legacy scalar OR the per-pad map (Input.setPadRest's rule); typeOk(map, 0) skipped every calibrated
    // pad on LOAD SETTINGS, so the stick drifted on the new device (B·H11 hunt). `freeShape`: normalize owns it.
    freeShape: true,
    normalize: (v) => {
      const ok = (x) => typeof x === "number" && isFinite(x) && Math.abs(x) <= 0.5;
      if (ok(v)) return v;
      if (!isObj(v)) return undefined;
      const out = {};
      for (const id of Object.keys(v).slice(0, 16)) if (ok(v[id])) out[id.slice(0, 120)] = v[id];
      return Object.keys(out).length ? out : undefined;
    } },
  { k: "aeroMode", lane: "json", group: "driving", def: "manual", src: "js/game.js" },
  { k: "drivingLine", lane: "json", group: "driving", def: "full", oneOf: ["off", "corner", "full"], src: "js/game.js" },
  // DRIVING LINE prefs (js/ui/driving-line-opts.js) — separate from the mode
  // above. NOT `brakeCue` — that row is the steering panel's 1-10 slider below.
  // The two shared one key until 6ee62f21; a settings file written before the
  // rename carries the slider's number, which driving-line-opts ignores.
  { k: "drivingLinePalette", lane: "json", group: "driving", def: "f1", src: "js/ui/driving-line-opts.js" },
  { k: "drivingLineOpacity", lane: "json", group: "driving", def: "normal", src: "js/ui/driving-line-opts.js" },
  { k: "lineBrakeCue", lane: "json", group: "driving", def: "off", src: "js/ui/driving-line-opts.js" },
  // APPEARANCE (js/ui/appearance-opts.js) — theme + dual accents
  { k: "uiTheme", lane: "json", group: "appearance", def: "dark", src: "js/ui/appearance-opts.js", oneOf: ["dark", "light", "system", "endurance", "drafting"] },
  { k: "menuAccent", lane: "json", group: "appearance", def: "ember", src: "js/ui/appearance-opts.js" },
  { k: "hudAccent", lane: "json", group: "appearance", def: "team", src: "js/ui/appearance-opts.js" },
  { k: "menuAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "hudAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "textSize", lane: "json", group: "appearance", def: "normal", src: "js/ui/appearance-opts.js TEXT SIZE", oneOf: ["normal", "large", "larger"] },
  { k: "uiContrast", lane: "json", group: "appearance", def: "off", src: "js/ui/appearance-opts.js HIGH CONTRAST", oneOf: ["off", "high"] },
  { k: "appIcon", lane: "json", group: "appearance", def: "default", src: "js/ui/appearance-opts.js APP ICON", oneOf: ["default", "A", "B", "C", "D", "E", "F"] },
  { k: "cvdMode", lane: "json", group: "appearance", def: "off", src: "js/ui/appearance-opts.js COLOUR VISION", oneOf: ["off", "deutan", "protan", "tritan"] },
  { k: "captions", lane: "json", group: "appearance", def: "on", src: "js/ui/captions.js CAPTIONS", oneOf: ["on", "off", "spoken"] },
  { k: "captionSize", lane: "json", group: "appearance", def: "medium", src: "js/ui/captions.js CAPTION SIZE", oneOf: ["small", "medium", "large"] },
  { k: "captionPos", lane: "json", group: "appearance", def: "auto", src: "js/ui/captions.js CAPTION POSITION", oneOf: ["auto", "top", "bottom", "mirror"] },
  { k: "captionBg", lane: "json", group: "appearance", def: 82, src: "js/ui/captions.js CAPTION BACKGROUND (40–100)" },
  { k: "captionSpeakerInk", lane: "json", group: "appearance", def: "on", src: "js/ui/captions.js SPEAKER COLOUR", oneOf: ["on", "off"] },
  { k: "speedUnits", lane: "json", group: "appearance", def: "kmh", src: "js/ui/appearance-opts.js SPEED UNITS", oneOf: ["kmh", "mph"] },
  { k: "menuHelp", lane: "json", group: "appearance", def: "on", src: "js/ui/appearance-opts.js HELP TEXT (on = SHOW | off = HIDE)", oneOf: ["on", "off"] },
  { k: "homeScene", lane: "json", group: "appearance", def: "static", src: "js/ui/appearance-studio.js", oneOf: ["auto", "garage", "night", "studio", "track", "pitlane", "static", "photo"] },
  { k: "backgroundMotion", lane: "json", group: "appearance", def: "ambient", src: "js/ui/appearance-studio.js", oneOf: ["still", "ambient"] },
  { k: "homeCamera", lane: "json", group: "appearance", def: "side", src: "js/ui/appearance-studio.js", oneOf: ["auto", "hero", "front", "side", "rear"] },
  // GARAGE › GARAGE / CREW / LIGHTING looks (#5023). The readers validate on load too; oneOf mirrors
  // GaragePrims LOOKS, GarageCrew.LOOKS and GarageScene.MOODS (garage bundle is lazy, so the lists are pinned by test).
  { k: "garageLook", lane: "raw", group: "appearance", def: "flood", src: "js/garage/scene-prims.js setLook (GARAGE row)", oneOf: ["stock", "studio", "carbon", "flood", "workshop", "porcelain", "heritage", "endurance", "rainready", "qualify"] },
  { k: "crewLook", lane: "raw", group: "appearance", def: "pitstop", src: "js/garage/scene-crew.js setLook (CREW row)", oneOf: ["classic", "sculpted", "pitstop", "workshop", "welcome"] },
  { k: "garageMood", lane: "raw", group: "appearance", def: "shipped", src: "js/garage/scene.js setMood (LIGHTING row)", oneOf: ["shipped", "broadcast", "night", "showroom", "daylight", "inspection", "goldenhour", "endurance", "podium", "rain", "neon"] },
  // #4529 PORTRAIT & LANDSCAPE: null = SHARED (shipped); SEPARATE = {v:2, mode, live, park}. A v:1 (#4897, reverted) or junk is skipped.
  { k: "appearanceShapes", lane: "json", group: "appearance", def: null, src: "js/ui/layout-presets.js PORTRAIT & LANDSCAPE",
    normalize: (v) => v === null ? null : v && typeof v === "object" && v.v === 2 && v.mode === "separate"
      ? { v: 2, mode: "separate", live: v.live === "wide" || v.live === "tall" ? v.live : null, park: v.park && typeof v.park === "object" && !Array.isArray(v.park) ? v.park : null } : undefined },
  { k: "appearanceProfiles", lane: "json", group: "appearance", def: [], src: "js/ui/appearance-studio.js", normalize: (v) => Array.isArray(v) ? (!v.length ? [] : typeof AppearanceStudio !== "undefined" ? AppearanceStudio.normalizeProfiles(v) : undefined) : undefined },
  // `oneOf`: the file is player input and game.js reads DIFF[difficulty] — a
  // string the ladder does not name is skipped here rather than stored.
  { k: "difficulty", lane: "json", group: "driving", def: "hard", src: "js/game.js", oneOf: ["easy", "normal", "hard"] },
  // AI PACE: scripted = fixed car/driver pace (ships); catchup = legacy rubber band.
  { k: "aiPace", lane: "json", group: "driving", def: "scripted", src: "js/game.js / js/physics/ai-band.js", oneOf: ["scripted", "catchup"] },
  // Keys real UI writes (checked against every store.set call site): player
  // preferences by the file's own definition, beside difficulty/raceGrid/caution.
  { k: "drivingCoach", lane: "json", group: "driving", def: false, src: "js/race/driving-coach.js" },
  { k: "throttleLatch", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "pedalSlide", lane: "json", group: "driving", def: "instant", oneOf: ["instant", "ease"], src: "js/input/steer-tuning.js PEDAL SLIDE row → Input.setPedalSlide (#5996)" },
  { k: "touchButtonProfiles", lane: "json", group: "driving", def: null, perDevice: true, whole: true, src: "js/input/pedal-travel.js",
    normalize: v => v === null ? null : typeof PedalTravel !== "undefined" ? PedalTravel.normalizeProfiles(v) : undefined },
  { k: "tyreWear", lane: "json", group: "driving", def: "real", src: "js/game.js" },
  { k: "dirtyAir", lane: "json", group: "driving", def: "classic", oneOf: ["off", "classic", "cfd"], src: "js/game.js PhysicsConsts.DirtyAir" },
  { k: "wind", lane: "json", group: "driving", def: "real", oneOf: ["off", "real"], src: "js/race/race-settings.js WIND row → Wind.setLevel" },
  { k: "ersPlan", lane: "json", group: "driving", def: ["manual", "manual", "manual"], src: "js/race/race-settings.js ERS SECTOR rows → EnergyPlan (#1580)",
    // Self-contained (EnergyPlan.POLICIES' three names): settings-export loads without the race modules.
    normalize: (v) => (Array.isArray(v) && v.length === 3 && v.every((p) => p === "manual" || p === "deploy" || p === "save") ? v.slice() : undefined) },
  { k: "damageHandling", lane: "json", group: "driving", def: false, src: "js/race/race-settings.js DAMAGE row → DamageHandling.setEnabled (#1578)" },
  { k: "wheelState", lane: "raw", group: "driving", def: "0", oneOf: ["0", "1"], src: "js/physics/wheel-state.js" },
  { k: "wheelAssist", lane: "raw", group: "driving", def: "off", oneOf: ["off", "medium", "full"], src: "js/physics/wheel-state.js" },
  { k: "raceGrid", lane: "json", group: "driving", def: "random", src: "js/game.js" },
  { k: "champGrid", lane: "json", group: "driving", def: "champ", src: "js/game.js", oneOf: ["champ", "tier", "revchamp", "random"] },
  { k: "reliability", lane: "json", group: "driving", def: "off", src: "js/game.js" },
  { k: "caution", lane: "json", group: "driving", def: false, src: "js/race/race-control.js" },
  // Ships ON since 2026-10-09: the 2026-10-05 garage export fitted works builds
  // above Parts.BUDGET, and the garage gate refuses any swap that ends over the
  // cap, so a fresh install could not change a part on 8 of 11 teams. Free play
  // only — a career slot still uses Career.budget() (setup-sheet.js `owned`).
  { k: "unlimitedBudget", lane: "json", group: "driving", def: true, src: "js/game.js" },
  { k: "bodyAttitude", lane: "raw", group: "driving", def: null, src: "js/physics/body-attitude.js (null = on)" },
  // PRE-RACE MEMORY. Both unset until used: the race sheet saves a draft only
  // when a solo one-off GP STARTs, and the list exists only once a circuit is
  // starred. Their readers validate every field, so a file cannot poison them.
  { k: "raceDraft", lane: "json", group: "driving", def: () => typeof RaceSettings !== "undefined" ? RaceSettings.DEFAULT_DRAFT : { weather: "storm", tod: "dusk", mixed: true, laps: "3" }, src: "js/race/race-settings.js solo Grand Prix draft", whole: true, nullable: true },
  { k: "favTracks", lane: "json", group: "driving", def: null, src: "js/ui/select-screen.js FAVOURITE CIRCUITS (null = none; else an array of track ids)" },
  // STEERING (js/input/steer-tuning.js applySteerTuning)
  { k: "preset", lane: "json", group: "steering", def: "standard", src: "js/input/steer-tuning.js",
    subsystem: "selects a whole steering sheet, i.e. the driving model — see pace below" },
  { k: "steerRate", lane: "json", group: "steering", def: 2, src: "js/input/steer-tuning.js",
    subsystem: "the driving model: moves tests/data/physics-baseline.json" },
  { k: "steerExpo", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "steerSmooth", lane: "json", group: "steering", def: 3, src: "js/input/steer-tuning.js" },
  { k: "tiltDeg", lane: "json", group: "steering", def: 8, src: "js/input/steer-tuning.js",
    subsystem: "the driving model: moves tests/data/physics-baseline.json" },
  { k: "steerLock", lane: "json", group: "steering", def: 7, src: "js/input/steer-tuning.js" },
  { k: "steerSpeed", lane: "json", group: "steering", def: 7, src: "js/input/steer-tuning.js" },
  { k: "carWeight", lane: "json", group: "steering", def: (G) => (G && G.gfx && G.gfx.isMobile) ? 10 : 5, src: "js/input/steer-tuning.js (10 on a touch device, 5 on a pointer — see the comment there)", perDevice: true },
  { k: "adaptiveButtons", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js",
    subsystem: "the driving model: moves tests/data/physics-baseline.json" },
  { k: "brakeCue", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js",
    normalize: v => v === "on" || v === "off" ? undefined : v },
  { k: "gripSteer", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js (1 = OFF; own-state cap via js/physics/grip-steer.js)" },
  { k: "audioCues", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js (js/audio/driving-cues.js; 1 = OFF)" },
  { k: "drivingHelp", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js (1 = OFF)" },
  { k: "pace", lane: "json", group: "steering", def: 11, src: "js/input/steer-tuning.js PACE_DEF",
    subsystem: "GROUND-SPEED SCALE for every car: 1.06^(v-14), so notch 11 is 84% of reference and notch 7 is 67% — a 21% slower game" },
  { k: "raceLine", lane: "json", group: "steering", def: 0, src: "js/input/steer-tuning.js" },
  { k: "steerSchema", lane: "json", group: "steering", def: 1, info: true, src: "js/input/steer-tuning.js STEER_SCHEMA (migration version — boot writes the current one, so never a change)" },
  // CONTROLS (js/input/input.js tables, js/ui/key-binds.js)
  { k: "keys", lane: "json", group: "controls", def: null, src: "js/input/input.js KEY_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.keysAreDefault && Input.keysAreDefault()) },
  { k: "pad", lane: "json", group: "controls", def: null, src: "js/input/input.js PAD_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.padsAreDefault && Input.padsAreDefault()) },
  // METRICS PANEL (js/perf/metrics-overlay.js)
  // noImport: a per-device diagnostic. ON loads the whole agent surface at every boot (#5032), so a
  // friend's file must not switch it on; it is exported for context and never written back.
  { k: "metrics", lane: "raw", group: "metrics", def: null, src: "js/perf/metrics-overlay.js (null = off)", noImport: true },
  { k: "metricsPage", lane: "raw", group: "metrics", def: "gov", src: "js/perf/metrics-overlay.js" },
  { k: "metricsPos", lane: "raw", group: "metrics", def: "left", src: "js/perf/metrics-overlay.js" },
  { k: "metricsSize", lane: "raw", group: "metrics", def: "s", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogNs", lane: "raw", group: "metrics", def: "*", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogLvl", lane: "raw", group: "metrics", def: "warn", src: "js/perf/metrics-overlay.js" },
];

if (typeof SaveSchemaRegistry !== "undefined" && SaveSchemaRegistry.ingestSettingsSpec) {
  SaveSchemaRegistry.ingestSettingsSpec(SPEC);
}


// The settings file and named profiles can be used before the optional editor is loaded.
// With its registry available, discard retired regions and their inapplicable controls.
function normalizePlacement(raw, registry) {
  if (raw === null) return null;
  if (!raw || raw.v !== 1 || !isObj(raw.screens)) return undefined;
  const screens = {}, validId = id => /^[a-z][a-z0-9-]{0,63}$/i.test(id) && !(id in Object.prototype);
  const bounds = { x: [-50, 50], y: [-50, 50], width: [5, 100], height: [5, 100], diameter: [5, 100], scale: [.5, 2], textSize: [.8, 1.8], buttonWidth: [10, 100], buttonHeight: [44, 104], formWidth: [10, 100], cornerRadius: [0, 40], rowGap: [0, 48], columnGap: [0, 48] };
  for (const id of Object.keys(raw.screens).slice(0, 128)) {
    if (!validId(id) || !isObj(raw.screens[id]) || (registry && !Object.hasOwn(registry, id))) continue;
    for (const orientation of ["portrait", "landscape"]) {
      const map = raw.screens[id][orientation];
      if (!isObj(map)) continue;
      for (const region of Object.keys(map).slice(0, 64)) {
        if (!validId(region) || !isObj(map[region])) continue;
        const definitions = registry && registry[id].regions;
        if (definitions && !Object.hasOwn(definitions, region)) continue;
        const fields = {};
        for (const [key, [lo, hi]] of Object.entries(bounds)) {
          const value = map[region][key];
          if (!Number.isFinite(value) || definitions?.[region][key] === false) continue;
          if (key === "diameter" && !(definitions ? definitions[region].diameter :
            id === "menupad" && region === "pad" || id === "photo-controls" && (region === "move" || region === "look"))) continue;
          if ((key === "x" || key === "y") && value === 0 || (key === "scale" || key === "textSize") && value === 1) continue;
          const cap = key === "width" ? definitions?.[region].maxWidth : key === "height" ? definitions?.[region].maxHeight : hi;
          fields[key] = Math.round(Math.min(cap || hi, Math.max(lo, value)) * 1000) / 1000;
        }
        if (fields.diameter) { delete fields.width; delete fields.height; }
        const align = map[region].textAlign;
        if (definitions?.[region].textAlign !== false && ["start", "center", "end"].includes(align)) fields.textAlign = align;
        if (Object.keys(fields).length) ((screens[id] ||= {})[orientation] ||= {})[region] = fields;
      }
    }
  }
  return Object.keys(screens).length ? { v: 1, screens } : null;
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** GameAudio's default table, or undefined while only the stub's empty answer is there. */
function engineTable(fn) {
  const t = typeof GameAudio !== "undefined" && typeof GameAudio[fn] === "function" ? GameAudio[fn]() : null;
  return isObj(t) && Object.keys(t).length ? t : undefined;
}

// THE GARAGE FILE: a SECOND file, deliberately not part of the settings one: the garage is what
// a player BUILT (parts bought, liveries painted, setups dialled in, a team
// invented) rather than how they like the game to behave, and the two are worth
// carrying separately — a new phone wants the settings, a friend wants the
// livery. Everything here is per-team and enumerated by PREFIX, because the key
// carries the team id. The prefix list is the allowlist: `localStorage` also
// holds career saves, lap records and OAuth tokens under the same namespace,
// and nothing outside these five shapes is ever read.
const GARAGE_FORMAT = "apex26-garage-v1";
// careerSetup.<flavour>.<slot>.<team> is a career's own setup sheet (#5036, SetupTune.keyFor):
// it travels with the garage, and only applies where the slot holds the career whose seed it carries.
const GARAGE_PREFIXES = ["parts.", "livery.", "setup.", "setupPresets.", "careerSetup."];   // + ".custom." under livery
const GARAGE_SINGLES = ["customTeam", "customLogo", "team", "driver"];
const GARAGE_EXCLUDED = "career and season saves, lap records, ghosts, settings, tuners, control bindings, accounts";
// A key is a garage key if it is one of the four singles or begins with a
// prefix AND the rest is a plausible id ("parts.mercedes", "livery.custom.x").
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
function isGarageKey(k) {
  if (GARAGE_SINGLES.indexOf(k) >= 0) return true;
  for (const p of GARAGE_PREFIXES) {
    if (k.indexOf(p) === 0) return ID_RE.test(k.slice(p.length));
  }
  return false;
}
// A FILE IS PLAYER INPUT AND THE GARAGE DOES NOT DEFEND ITSELF. isGarageKey
// checks the KEY; nothing checked the VALUE, so any JSON at a garage-shaped key
// went straight into the store. One malformed entry in livery.custom.<team> is
// enough to take the screen down: buildLiveryOptions paints each row's swatch
// with cssCol(liv.c1), cssCol reads c[0] on whatever it is given, and an entry
// with no c1 throws there — the LIVERY tab renders nothing. A hand-edited file,
// a truncated download or a half-merged one all reach it, and this loader is
// the only way in, so the check belongs here.
//
// Shape only, per key family — this is not schema validation and must not
// start rejecting liveries the game itself would happily paint.
const rgb3 = (a) => Array.isArray(a) && a.length >= 3 &&
  a.slice(0, 3).every((n) => typeof n === "number" && isFinite(n));
// A COLOUR IS 0..1: [1e9, -5, 3] used to be stored as sent.
const clamp01 = (a) => a.slice(0, 3).map((n) => Math.min(1, Math.max(0, n)));
// BOUNDS. A shared garage file is the advertised way to hand a friend a livery, and nothing
// else limited it: thousands of rows or megabyte strings fill the 5 MB localStorage quota
// (later career saves then fail) and the LIVERY tab paints one canvas swatch per row.
const GARAGE_MAX_BYTES = 1024 * 1024;   // the file, before JSON.parse; a real garage is a few KB (customLogo caps at 400 kB)
const GARAGE_STR_MAX = 64;              // ids, names, enum pills
// PER TEAM. The garage UI has no cap of its own, so neither does the import: the file-size gate above is the bound
// (a livery row is never under ~48 bytes, so 1 MB cannot hold more than this). Rows that fail the shape check are
// counted and reported by applyGarage (droppedLiveries), never lost quietly.
const GARAGE_LIVERIES_MAX = Math.floor(GARAGE_MAX_BYTES / 48);
const SETTINGS_MAX_BYTES = 1024 * 1024; // LOAD SETTINGS: a real file is tens of KB; refused before f.text()
const CAREER_BAG_KEYS_MAX = 16;         // 6 slots + the live pointer are all a real file holds
const GARAGE_KEYS_MAX = 64;             // entries per parts sheet
// FIELDS PER LIVERY follow the schema: Liveries.FIELDS had 62 rows against a literal 64, so the next slices' fields
// would have been dropped silently on import. The margin keeps a hostile file bounded without a cap to maintain.
const liveryKeysMax = () => (typeof Liveries !== "undefined" && Liveries.FIELDS ? Liveries.FIELDS.length : GARAGE_KEYS_MAX) + 32;
// ENUM-TYPED FIELDS INDEX PLAIN OBJECTS (Car3D finOf / FINISH_SURFACE, LiveryTex NUM_FONTS), so a
// kept "constructor" resolves to an inherited function and throws in every build of that team.
// The three the garage offers as pills are checked against the tables that drive those pills
// (an unknown id is dropped, and the livery falls back to its default); any other string is only
// refused when it names an Object.prototype member. Teams.liveryEnumOk is the same rule for MY TEAM.
function liveryEnumOk(k, v) {
  if (typeof Teams !== "undefined" && Teams.liveryEnumOk) return Teams.liveryEnumOk(k, v);
  return typeof v === "string" && !(v in Object.prototype);
}
// A livery must carry the two things every consumer reads unconditionally: an
// id to key caches on and the two base colours. Those are what the crash was
// about, so they are required; every other field is optional and additive, so
// a value of neither shape is dropped rather than failing the whole row.
//
// THE BOUNDARY, stated because it is a judgement and not an oversight: a field
// is kept when it is an rgb triple (a colour) or a string (a pill), which is
// decided by the value's shape and not by a list of names. Putting a STRING in
// a colour slot therefore survives — `_ckAcc` passes non-arrays straight
// through, so it paints a wrong colour rather than throwing. Catching that
// would need a fourth copy of the colour/pill field table, which is exactly
// what the last two commits removed from this codebase; a wrong colour from a
// hand-corrupted file is the cheaper failure.
function cleanLivery(l) {
  if (!l || typeof l !== "object" || Array.isArray(l)) return null;
  if (typeof l.id !== "string" || l.id.length > GARAGE_STR_MAX || !rgb3(l.c1) || !rgb3(l.c2)) return null;
  const out = { id: l.id, c1: clamp01(l.c1), c2: clamp01(l.c2) };
  if (typeof l.name === "string") out.name = l.name.slice(0, GARAGE_STR_MAX);
  let n = 0;
  const max = liveryKeysMax();
  for (const k of Object.keys(l)) {
    if (k === "id" || k === "c1" || k === "c2" || k === "name" || k === "__proto__") continue;
    if (n >= max) break;
    if (rgb3(l[k])) out[k] = clamp01(l[k]);
    else if (typeof l[k] === "string" && l[k].length <= GARAGE_STR_MAX && liveryEnumOk(k, l[k])) out[k] = l[k];
    else continue;
    n++;
  }
  return out;
}
// Returns the value to WRITE, or undefined to skip the key. A partly-corrupt
// custom-livery array keeps the paint jobs that are sound instead of losing
// the lot: the player's other work is not the file's fault.
function validSetupContext(v) {
  if (v == null) return true;
  if (!isObj(v) || v.v !== 1 || Object.keys(v).some((k) => !["v", "physics", "parts", "track", "note"].includes(k))
      || !isObj(v.parts) || Object.keys(v.parts).length > 32 || typeof v.note !== "string" || v.note.length > 160) return false;
  if (!["physics", "track"].every((k) => v[k] === null || (typeof v[k] === "string" && v[k].length <= (k === "track" ? 128 : 96)))) return false;
  return Object.entries(v.parts).every(([k, value]) => /^[a-z0-9_-]{1,48}$/i.test(k) && typeof value === "string" && value.length <= 96);
}
function garageValue(k, v) {
  if (v === undefined || v === null) return undefined;
  if (k.indexOf("setupPresets.") === 0) {
    if (typeof SetupPresets === "undefined" || typeof SetupTune === "undefined" || !isObj(v) || v.v !== 1
        || !Array.isArray(v.items) || v.items.length > SetupPresets.MAX
        || Object.keys(v).some((key) => key !== "v" && key !== "items")) return undefined;
    if (v.items.some((row) => !isObj(row) || typeof row.name !== "string" || row.name.trim().length > 32
        || !(row.trackId === null || typeof row.trackId === "string" && row.trackId.length <= 128) || !Number.isFinite(row.at)
        || Object.keys(row).some((key) => !["id", "name", "tune", "trackId", "at", "context"].includes(key)) || !validSetupContext(row.context)
        || !isObj(row.tune) || Object.keys(row.tune).length !== SetupTune.FIELDS.length
        || Object.keys(row.tune).some((field) => !SetupTune.FIELDS.includes(field)))) return undefined;
    const clean = SetupPresets.normalize(v);
    return clean.items.length === v.items.length ? clean : undefined;
  }
  if (k.indexOf("livery.custom.") === 0) {
    if (!Array.isArray(v)) return undefined;
    return v.slice(0, GARAGE_LIVERIES_MAX).map(cleanLivery).filter(Boolean);
  }
  if (k.indexOf("livery.") === 0) return typeof v === "string" && v.length <= GARAGE_STR_MAX ? v : undefined;
  if (k.indexOf("parts.") === 0) {
    // {category: optionId}: scalar values only (ids are strings), bounded. NOT clamped to Parts.BUDGET here (lobby.js does
    // that for a PEER): the shipped garage itself is over budget (10 of its 11 team sheets cost
    // 675-2000 against 780) and RESET GARAGE re-applies it through this door.
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const out = {};
    let n = 0;
    for (const c of Object.keys(v)) {
      if (n >= GARAGE_KEYS_MAX) break;
      const x = v[c];
      if (c === "__proto__" || c.length > GARAGE_STR_MAX) continue;
      if (!((typeof x === "string" && x.length <= GARAGE_STR_MAX) || typeof x === "boolean" || (typeof x === "number" && isFinite(x)))) continue;
      out[c] = x; n++;
    }
    return out;
  }
  if (k.indexOf("setup.") === 0 || k.indexOf("careerSetup.") === 0) {
    // SetupTune clamps each field on read; here only the size is bounded.
    return v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= 4096 ? v : undefined;
  }
  // THE FOUR SINGLES USED TO KEEP WHATEVER SHAPE THEY ARRIVED IN. The liveries
  // above are shape-checked because "A FILE IS PLAYER INPUT AND THE GARAGE DOES
  // NOT DEFEND ITSELF" — and these four are read by code that defends itself no
  // better: `team`/`driver` index Teams.LIST, and `customTeam` is pushed into it
  // whole (js/career/custom-team.js). `{}` there was a boot-time TypeError.
  // Rejecting one key still applies the rest of the file, which is the same
  // bargain the custom-livery array already makes.
  // A shape-sound team is also rebuilt field by field (Teams.sanitizeCustom:
  // length caps, control characters, num 0-99, a bounded roster), so what is
  // WRITTEN is already what the dialog could have saved. custom-team.js runs
  // the same repair again at load — this is the door, that is the reader.
  if (k === "customTeam") {
    const ok = v && typeof v === "object" && !Array.isArray(v)
      && Array.isArray(v.drivers) && v.drivers.length > 0;
    if (!ok) return undefined;
    return typeof Teams !== "undefined" && Teams.sanitizeCustom ? Teams.sanitizeCustom(v) : v;
  }
  if (k === "customLogo") {
    if (typeof v !== "string") return undefined;
    // Match custom-team.js upload: canvas longest side CUSTOM_LOGO_MAX (384) →
    // PNG data URL. Cap bytes generously above a worst-case 384² PNG (~200 KiB
    // raw → ~270 KiB base64); reject non-image schemes (docs/BUGS.md B8).
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(v)) return undefined;
    if (v.length > 400000) return undefined;
    return v;
  }
  if (k === "team" || k === "driver") return Number.isInteger(v) && v >= 0 ? v : undefined;
  return undefined;   // isGarageKey() admits nothing else — default deny
}

// THE CAREER FILE: the six championship slots and the live pointer. Same
// allowlist discipline as the garage — only career.<flavour>.<i> and
// careerSlot leave or enter the namespace. Supported slots run through
// migrateCareer on export/import; opaque future saves export verbatim and
// refuse import so an older build cannot silently discard them.
const CAREER_FORMAT = "apex26-career-v1";
const CAREER_FLAVOURS = ["driver", "myteam"];
const CAREER_SLOT_N = 3;
const CAREER_EXCLUDED = "settings, garage (parts, liveries, setups), lap records, ghosts, accounts";
const CAREER_SLOT_RE = /^career\.(driver|myteam)\.([0-2])$/;
function isCareerKey(k) {
  return k === "careerSlot" || CAREER_SLOT_RE.test(k);
}

// ── THE FAÇADE (#4748) ─────────────────────────────────────────────────────
// Everything below forwards to SettingsExportBody (LAZY_SAVES_DATA). Loaded,
// a call is the body's own synchronous call; not yet, it asks for the bundle
// and answers with a Promise of the same result (page.evaluate awaits it).
// The body hands itself over as it evaluates (_bind), so this half never depends on reading a
// later script's top-level const from here.
let _body = null, _G = null, _made = false, _asking = null;
const bodyApi = () => _body;
/** Called once, by js/ui/settings-export-body.js at the end of its eval. */
function _bind(body) { if (!_body && body && typeof body.create === "function") _body = body; }
/** The body, its UI created ONCE with the G create() recorded. */
function made() {
  const b = bodyApi();
  if (b && _G && !_made) { _made = true; b.create(_G); }
  return b;
}
/** Resolves true once the body is resident (LazyBundles.ensureSavesData), false when it cannot load. */
function ready() {
  if (bodyApi()) { made(); return Promise.resolve(true); }
  if (_asking) return _asking;
  const lb = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
  if (!lb || !lb.ensureSavesData) return Promise.resolve(false);
  _asking = Promise.resolve(lb.ensureSavesData()).then(() => { _asking = null; return !!made(); },
    (e) => { _asking = null; Log.warn("ui", "the saves-and-data body did not load: " + (e && e.message || e)); return false; });
  return _asking;
}
const fwd = (name) => (...args) => {
  const b = made();
  if (b) return b[name](...args);
  return ready().then((ok) => {
    if (!ok) throw new Error("SettingsExport." + name + ": the saves-and-data bundle did not load");
    return bodyApi()[name](...args);
  });
};
const api = {};
for (const n of ["collect", "collectGarage", "collectCareer", "collectTtlb", "ttlbParseBoard", "applySettings",
                 "applyGarage", "applyCareer", "applyTtlb", "resetGarage"]) api[n] = fwd(n);
function create(G) {
  _G = G;
  // The bound body under its own module name, so tools/check/check-gctx.mjs sees SettingsExportBody handed G.
  const SettingsExportBody = bodyApi();
  if (SettingsExportBody) { _made = true; return SettingsExportBody.create(G); }
  return { collect: (mode) => api.collect(mode, G), mount: ensureMounted };
}
/** SETTINGS > FILES opens (js/ui/settings-tabs.js): mount the SAVES & DATA controls, loading the body first. */
function ensureMounted() {
  const b = made();
  if (b) { b.ensureMounted(); return; }
  ready().then((ok) => { if (ok) bodyApi().ensureMounted(); });
}
/** A row for a screen that builds synchronously: null until the body lands (the doors preload it). */
const row = (name) => () => { const b = made(); if (b) return b[name](); ready(); return null; };

/** What the body reads from this half at eval: one home for the shared gates. */
const _core = Object.freeze({
  FORMAT, SPEC, isObj, GARAGE_FORMAT, GARAGE_EXCLUDED, isGarageKey, GARAGE_MAX_BYTES, SETTINGS_MAX_BYTES,
  CAREER_BAG_KEYS_MAX, garageValue, CAREER_FORMAT, CAREER_FLAVOURS, CAREER_SLOT_N, CAREER_EXCLUDED,
  CAREER_SLOT_RE, isCareerKey,
});

return { FORMAT, GARAGE_FORMAT, CAREER_FORMAT, SPEC, ...api, isGarageKey, isCareerKey, garageValue, create,
         normalizePlacement, ensureMounted, mount: ensureMounted, ready, loaded: () => !!bodyApi(),
         garageRow: row("garageRow"), careerRow: row("careerRow"), _core, _bind };
})();
Object.freeze(SettingsExport);
