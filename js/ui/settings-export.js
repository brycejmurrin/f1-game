/* Apex 26 — SettingsExport: SETTINGS › BACKUP & RESTORE,
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
   button asks twice. SETTINGS and GARAGE still never carry career or season
   saves, lap records, ghosts, or anything account-shaped, in either direction.

   SPEC below is the allowlist — every player-facing preference, tuner and
   control binding under the `apex26.` prefix, grouped the way SETTINGS is.
   Nothing else is ever read: the garage (parts, liveries, setup sheets, MY
   TEAM), saves (career, season, leaderboards, ghosts, daily bests), accounts
   and network (Spotify tokens, TURN credentials, relays) and the renderer's
   self-healing latches stay out by construction, and the unit test asserts
   that a poisoned store leaks none of them. Two lanes, like the store: `json`
   values went through store.set (JSON), `raw` values are the bare strings the
   settings panels keep with store.rawSet ("1"/"0", ids).
   SettingsExport.create(G) is wired from js/game.js; `collect(mode)` is the
   pure half (__apex.settingsFile). Consumes GameStore, GameAudio,
   GfxQuality, Input when present. */
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
const SPEC = [
  // MUSIC & SOUND (js/audio/panel.js)
  { k: "sound", lane: "json", group: "audio", def: true, src: "js/game.js",
    subsystem: "ships the game MUTED for every new player — an export from a silenced phone looks exactly like this" },
  { k: "sfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "menuSfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "music", lane: "json", group: "audio", def: true, src: "js/game.js" },
  { k: "volMusic", lane: "json", group: "audio", def: 0.6, src: "js/audio/panel.js" },
  { k: "volSfx", lane: "json", group: "audio", def: 0.2, src: "js/audio/panel.js" },
  { k: "radioVoice", lane: "json", group: "audio", def: false, src: "js/audio/panel.js" },
  { k: "announcer", lane: "json", group: "audio", def: true, src: "js/audio/announcer.js" },
  { k: "volRadio", lane: "json", group: "audio", def: 0.8, src: "js/audio/panel.js" },
  { k: "radioFx", lane: "json", group: "audio", def: 1, src: "js/audio/panel.js" },
  { k: "radioPreset", lane: "json", group: "audio", def: "modern", oneOf: ["modern", "clean", "vintage"], src: "js/audio/panel.js" },
  { k: "voiceTune", lane: "json", group: "audio", def: {}, src: "js/audio/radio-voice.js" },
  { k: "radioChat", lane: "json", group: "audio", def: "normal", src: "js/race/race-radio.js", oneOf: ["off", "key", "normal", "chatty"] },
  { k: "radioPack", lane: "json", group: "audio", def: true, src: "js/audio/radio-voice.js" },
  { k: "spotter", lane: "json", group: "audio", def: false, src: "js/race/spotter.js" },
  { k: "commentary", lane: "json", group: "audio", def: "tv", src: "js/race/race-radio.js", oneOf: ["off", "tv", "on"] },
  { k: "musicSource", lane: "json", group: "audio", def: "all", src: "js/audio/panel.js" },
  { k: "sndProfile", lane: "json", group: "audio", def: "team", src: "js/audio/panel.js" },
  { k: "sndTune", lane: "json", group: "audio", def: () => (typeof GameAudio !== "undefined" && GameAudio.tuneDefaults) ? GameAudio.tuneDefaults() : {}, src: "js/audio/engine.js TUNE_DEF" },
  { k: "sndLayers", lane: "json", group: "audio", def: () => (typeof GameAudio !== "undefined" && GameAudio.layerDefaults) ? GameAudio.layerDefaults() : {}, src: "js/audio/engine.js LAYER_DEF" },
  // DISPLAY (js/ui/scale.js, js/perf/quality-preset.js, js/perf/renderer-picker.js)
  // UNSET is the default here, and it is not the same number on every device:
  // the `(pointer: coarse)` block of css/tokens.css owns the touch numbers so a
  // phone is right on its FIRST paint, and js/ui/scale.js mirrors them. null is
  // the honest default to report — a stored number is the change.
  { k: "uiScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%, or 109% on touch)" },
  { k: "hudScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%; touch defaults 100 hud / 109 ui, scale.js scaleDefault)" },
  { k: "hudBtnScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = follows hudScale)" },
  { k: "hudBtnOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = 100%)" },
  { k: "hudPanelOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js PANEL OPACITY (null = 100%; HIGH CONTRAST keeps plates solid)" },
  { k: "motion", lane: "json", group: "appearance", def: null, src: "js/ui/title-fx.js (null = follows the OS prefers-reduced-motion)", oneOf: ["on", "reduce"] },
  { k: "titleIntro", lane: "json", group: "appearance", def: "full", src: "js/ui/title-fx.js TITLE INTRO (full | quick | off)", oneOf: ["full", "quick", "off"] },
  { k: "menuWash", lane: "json", group: "appearance", def: "full", src: "js/ui/title-fx.js MENU WASH (full | soft | off)", oneOf: ["full", "soft", "off"] },
  { k: "titleArt", lane: "json", group: "appearance", def: "on", src: "js/ui/title-fx.js TITLE ART (on | soft | off)", oneOf: ["on", "soft", "off"] },
  { k: "pauseLayout", lane: "json", group: "appearance", def: "grid", src: "js/ui/pause-opts.js PAUSE MENU › LAYOUT (grid | list | compact | wide | sidebar)", oneOf: ["grid", "list", "compact", "wide", "sidebar"] },
  { k: "pauseSide", lane: "json", group: "appearance", def: "centre", src: "js/ui/pause-opts.js PAUSE MENU › SIDE (centre | left | right)", oneOf: ["centre", "left", "right"] },
  { k: "pauseDim", lane: "json", group: "appearance", def: "full", src: "js/ui/pause-opts.js PAUSE MENU › BACKGROUND (full | soft | off)", oneOf: ["full", "soft", "off"] },
  { k: "pauseConfirm", lane: "json", group: "appearance", def: "on", src: "js/ui/pause-opts.js PAUSE MENU › CONFIRM QUIT (on | off; two presses on QUIT / RESTART)", oneOf: ["on", "off"] },
  { k: "titleLayout", lane: "json", group: "appearance", def: null, src: "js/ui/title-layout.js TITLE LAYOUT (null = shipped; else {v:2, wide, tall}, one {btns,title,art,layout,side} per shape — a missing shape is shipped; a v1 object is both)" },
  { k: "lookPause", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js PAUSE MENU buttons & card (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookDatahub", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js DATA HUB (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookSelect", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js TRACK SELECTOR (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookRace", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js RACE SETTINGS (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookCareer", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js CAREER (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookGarage", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js GARAGE (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "lookPopups", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js POPUPS (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "resMode", lane: "json", group: "display", def: (G) => (G && G.gfx && G.gfx.isMobile) ? "low" : "auto", src: "js/ui/scale.js (LOW on a touch device)", perDevice: true },
  { k: "spatialUpscale", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js + GLX/WGX/TLX SGSR (UPSCALING-2026-09 §6–7; OFF by default)" },
  { k: "occlusionCull", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js OCCLUSION row + GLX hardware depth queries (js/render/glx/chunked.js; GLX only, OFF by default)" },
  { k: "buildWorker", lane: "raw", group: "display", def: "1", src: "js/track/build-client.js BUILD IN BACKGROUND (unset = ON when multi-core; \"0\"/\"1\" force)", oneOf: ["0", "1"] },
  { k: "debris", lane: "raw", group: "display", def: "0", src: "js/ui/debris-opts.js + js/physics/debris-world.js create() (only \"1\" is on)" },
  { k: "gfxPreset", lane: "json", group: "display", def: (G) => (typeof GfxQuality !== "undefined" && GfxQuality.defaultId) ? GfxQuality.defaultId(!!(G && G.gfx && G.gfx.isMobile)) : "high", src: "js/perf/quality-preset.js defaultId", perDevice: true },
  { k: "gfxHigh", lane: "raw", group: "display", def: null, src: "js/perf/quality-preset.js (legacy mobile tier)" },
  { k: "gfxBackend", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js + js/render/renderer-boot.js (unset = TLX when a GPU adapter resolves, else GLX — skips three.webgpu)" },
  { k: "tlxForceGL", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js (null = AUTO)" },
  { k: "tlxEnvProbe", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js CAR REFLECTIONS (null = OFF)" },
  { k: "xr", lane: "raw", group: "display", def: "0", src: "js/xr/xr-opts.js", oneOf: ["0", "1"] },
  { k: "xrBackend", lane: "raw", group: "display", def: "webgl2", src: "js/xr/xr-opts.js", oneOf: ["webgl2", "webgpu"] },
  // HUD (js/game.js)
  { k: "hudProfile", lane: "json", group: "hud", def: "standard", oneOf: ["minimal", "standard", "broadcast"], src: "js/game.js" },
  { k: "hudMetricsLayout", lane: "json", group: "hud", def: "full", src: "js/game.js" },
  { k: "hudMapVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudGapsVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudElements", lane: "json", group: "hud", def: {}, src: "js/ui/hud-elements.js per-element on/off (missing key = on)" },
  { k: "hudLayout", lane: "json", group: "hud", def: null, src: "js/ui/hud-layout.js MOVE & SIZE (null = shipped; else {v:3, standard?, minimal?, broadcast?}, each {cockpit, other} of {id: {x, y, s}} — a missing style or element is its SHIPPED layout; a v1/v2 {cockpit, other} reads as STANDARD's)" },
  { k: "hudMirror", lane: "json", group: "hud", def: "auto", src: "js/render/shared/mirror-pass.js", oneOf: ["auto", "on", "off"] },
  { k: "garageArrival", lane: "json", group: "camera", def: null, src: "js/garage/arrival.js (null = shipped arrival settings)" },
  { k: "flybyShots", lane: "json", group: "camera", def: null, src: "js/camera/flyby-panel.js FLYBY SHOT EDITOR (null = shipped shots)" },
  { k: "ldCard", lane: "json", group: "camera", def: null, src: "js/ui/loading-screen.js loading card {scale, x, y} (null = shipped)" },
  // CAMERA (js/camera/mode-switch.js, offsets.js, cockpit-opts.js)
  { k: "camMode", lane: "json", group: "camera", def: 19, src: "js/camera/mode-switch.js (index into CAM_MODES)" },
  { k: "pitCamAuto", lane: "json", group: "camera", def: false, src: "js/camera/extra-rigs.js (opt-in auto-cut to PIT WALL in pits)" },
  { k: "camTune", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js CAM_TUNE_DEFS (geometric knobs def 0; cornerLead def 0.54; the file holds {mode:{knob:value}} edits)" },
  { k: "camTuneGlobal", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js global baseline layered under every mode (same knob ids as camTune)" },
  { k: "camComfort", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js COMFORT_DEFS (fovBias/speedFov/bob/rollLean — independent of MOTION: REDUCED)" },
  { k: "cockpitHalo", lane: "raw", group: "camera", def: "fairing", src: "js/camera/cockpit-opts.js HALO_VALUES (\"1\" = standard, \"0\" = off)", oneOf: ["0", "slim", "1", "thick", "fairing"] },
  { k: "cockpitWheel", lane: "raw", group: "camera", def: "f1", src: "js/camera/cockpit-opts.js CHOICES.wheel", oneOf: ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"] },
  { k: "cockpitBody", lane: "raw", group: "camera", def: "sculpted", src: "js/camera/cockpit-opts.js CHOICES.body", oneOf: ["standard", "sculpted", "wide", "tapered", "stepped"] },
  { k: "cockpitSeat", lane: "raw", group: "camera", def: "std", src: "js/camera/cockpit-opts.js CHOICES.seat", oneOf: ["std", "low", "high", "fwd"] },
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
  { k: "dockLayout", lane: "json", group: "driving", def: null, src: "js/ui/dock-layout.js (per-scheme touch-dock offsets; null = defaults)" },
  // PER-DEVICE STEERING (js/input/steer-tuning.js). Each defaults to the notch
  // that reproduces exactly what shipped, so an absent key is a no-op.
  { k: "tiltCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "touchCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "padCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
  { k: "touchRange", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js touchRangeFromSlider (0.12 of the long edge at 5)" },
  { k: "dragSmooth", lane: "json", group: "driving", def: 1, src: "js/input/steer-tuning.js dragCutoffFromSlider (1 = filter off)" },
  { k: "digitalRate", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js steerRateFromSlider (KEY_RAMP_IN)" },
  { k: "analogSpeedSteer", lane: "json", group: "driving", def: 1, src: "js/input/steer-tuning.js analogSpeedFromSlider (1 = off)" },
  { k: "haptics", lane: "json", group: "driving", def: 6, src: "js/input/steer-tuning.js (scales Input.vibrate and Input.rumble)" },
  { k: "triggerHaptics", lane: "json", group: "driving", def: true, src: "js/input/steer-tuning.js (L2/R2 trigger-rumble; falls back to dual-rumble when off or unsupported)" },
  { k: "padDeadzone", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js (percent of stick travel)" },
  { k: "padSaturation", lane: "json", group: "driving", def: 0, src: "js/input/steer-tuning.js (percent short of the rim that is full lock)" },
  { k: "padLabels", lane: "json", group: "driving", def: "auto", src: "js/ui/key-binds.js (Xbox/PlayStation/Nintendo button names)" },
  { k: "padAxes", lane: "json", group: "driving", def: null, src: "js/ui/key-binds.js wheel wizard (axis indices + signs)" },
  { k: "padRest", lane: "json", group: "driving", def: 0, src: "js/ui/key-binds.js CALIBRATE STICK (steer-axis rest offset, |v| <= 0.5; 0 = uncalibrated)" },
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
  { k: "uiTheme", lane: "json", group: "appearance", def: "dark", src: "js/ui/appearance-opts.js" },
  { k: "menuAccent", lane: "json", group: "appearance", def: "ember", src: "js/ui/appearance-opts.js" },
  { k: "hudAccent", lane: "json", group: "appearance", def: "team", src: "js/ui/appearance-opts.js" },
  { k: "menuAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "hudAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "textSize", lane: "json", group: "appearance", def: "large", src: "js/ui/appearance-opts.js TEXT SIZE", oneOf: ["normal", "large", "larger"] },
  { k: "uiContrast", lane: "json", group: "appearance", def: "high", src: "js/ui/appearance-opts.js HIGH CONTRAST", oneOf: ["off", "high"] },
  { k: "cvdMode", lane: "json", group: "appearance", def: "off", src: "js/ui/appearance-opts.js COLOUR VISION", oneOf: ["off", "deutan", "protan", "tritan"] },
  { k: "speedUnits", lane: "json", group: "appearance", def: "kmh", src: "js/ui/appearance-opts.js SPEED UNITS", oneOf: ["kmh", "mph"] },
  { k: "menuHelp", lane: "json", group: "appearance", def: "on", src: "js/ui/appearance-opts.js HELP TEXT (on = SHOW | off = HIDE)", oneOf: ["on", "off"] },
  { k: "homeScene", lane: "json", group: "appearance", def: "photo", src: "js/ui/appearance-studio.js", oneOf: ["auto", "garage", "night", "studio", "track", "pitlane", "static", "photo"] },
  { k: "backgroundMotion", lane: "json", group: "appearance", def: "ambient", src: "js/ui/appearance-studio.js", oneOf: ["still", "ambient"] },
  { k: "homeCamera", lane: "json", group: "appearance", def: "side", src: "js/ui/appearance-studio.js", oneOf: ["auto", "hero", "front", "side", "rear"] },
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
  { k: "tyreWear", lane: "json", group: "driving", def: "real", src: "js/game.js" },
  { k: "dirtyAir", lane: "json", group: "driving", def: "classic", oneOf: ["off", "classic", "cfd"], src: "js/game.js PhysicsConsts.DirtyAir" },
  { k: "raceGrid", lane: "json", group: "driving", def: "random", src: "js/game.js" },
  { k: "champGrid", lane: "json", group: "driving", def: "champ", src: "js/game.js", oneOf: ["champ", "tier", "revchamp", "random"] },
  { k: "reliability", lane: "json", group: "driving", def: "off", src: "js/game.js" },
  { k: "caution", lane: "json", group: "driving", def: false, src: "js/race/race-control.js" },
  { k: "unlimitedBudget", lane: "json", group: "driving", def: false, src: "js/game.js",
    subsystem: "removes the career economy constraint for everyone — a design change, not a preference" },
  { k: "bodyAttitude", lane: "raw", group: "driving", def: null, src: "js/physics/body-attitude.js (null = on)" },
  // PRE-RACE MEMORY. Both unset until used: the race sheet saves a draft only
  // when a solo one-off GP STARTs, and the list exists only once a circuit is
  // starred. Their readers validate every field, so a file cannot poison them.
  { k: "raceDraft", lane: "json", group: "driving", def: null, src: "js/race/race-settings.js REMEMBER LAST RACE SETUP (null = 3 laps / dry / default; else {laps: \"3\"|\"5\"|\"10\"|\"25\"|\"FULL\", weather, tod, mixed})" },
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
  { k: "adaptiveButtons", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js",
    subsystem: "the driving model: moves tests/data/physics-baseline.json" },
  { k: "brakeCue", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js" },
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
  { k: "metrics", lane: "raw", group: "metrics", def: null, src: "js/perf/metrics-overlay.js (null = off)" },
  { k: "metricsPage", lane: "raw", group: "metrics", def: "gov", src: "js/perf/metrics-overlay.js" },
  { k: "metricsPos", lane: "raw", group: "metrics", def: "left", src: "js/perf/metrics-overlay.js" },
  { k: "metricsSize", lane: "raw", group: "metrics", def: "s", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogNs", lane: "raw", group: "metrics", def: "*", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogLvl", lane: "raw", group: "metrics", def: "warn", src: "js/perf/metrics-overlay.js" },
];

const EXCLUDED = "photo library and personal background images, garage (parts, liveries, setup sheets, MY TEAM), saves (career, season, leaderboards, ghosts, daily challenge), accounts and network (Spotify, TURN, relays), renderer self-heal latches, developer flags";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function same(a, b) {
  if (a === b) return true;
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return false;
}
// The stored object minus what the default already says — a tuner that saves
// its whole table (sndTune, sndLayers) reports only the fields the player
// moved. A key missing from the default (a knob added after the save) is kept.
function objDiff(v, def) {
  const out = {};
  for (const k of Object.keys(v)) if (!(k in def) || !same(v[k], def[k])) out[k] = v[k];
  return out;
}
function readStored(row) {
  const s = GameStore.store;
  if (row.lane === "raw") return s.raw(row.k);   // null when unset
  const v = s.get(row.k, undefined);
  return v === undefined ? null : v;
}
// The SHIPPED default, which is what makes CHANGED honest. js/data/settings-defaults.js
// outranks the row's own `def` for any key it names — otherwise moving a default
// into that file would leave this reporting a stale value, and every exported
// file would list a key as "changed" that the player never touched.
function defaultOf(row, G) {
  if (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(row.k)) return SettingsDefaults.get(row.k);
  return typeof row.def === "function" ? row.def(G) : row.def;
}

// collect(mode, G) → the file's object. mode "changes" (default) lists only
// what differs from the shipped default; "all" lists every key's effective
// value (stored, else the default). Both carry `changed`, the dotted names of
// the keys that differ, and for those the default replaced and its source.
function collect(mode, G) {
  const all = mode === "all";
  const settings = {};
  const defaults = {};
  const where = {};
  const changed = [];
  for (const row of SPEC) {
    const raw = readStored(row);
    const stored = row.normalize && raw !== null ? row.normalize(raw) ?? null : raw;
    const def = defaultOf(row, G);
    const has = stored !== null;
    let diff = has && !row.info && (row.changed ? row.changed(stored) : !same(stored, def));
    // perDevice: an UNSET key whose default depends on this device (a phone's
    // LOW resolution, its touch steering weight) exports as null, so loading
    // the file elsewhere keeps THAT device's default instead of pinning ours.
    let value = has ? stored : (all && row.perDevice ? null : def);
    if (diff && isObj(stored) && isObj(def) && Object.keys(def).length) {
      value = objDiff(stored, def);
      if (!Object.keys(value).length) diff = false;
    }
    if (!diff && !all) continue;
    (settings[row.group] ||= {})[row.k] = value;
    if (diff) {
      const name = `${row.group}.${row.k}`;
      changed.push(name);
      (defaults[row.group] ||= {})[row.k] = def;
      where[name] = row.src;
    }
  }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  let desktop = null;
  try { desktop = document.body.classList.contains("desktop"); } catch (_) { /* no DOM */ }
  return {
    format: FORMAT, mode: all ? "all" : "changes", exportedAt: new Date().toISOString(), build,
    device: { desktop, userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || null },
    keys: { json: "went through store.set (JSON)", raw: "bare strings from store.rawSet; null = unset" },
    excluded: EXCLUDED,
    changed, settings, defaults, where,
  };
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
const GARAGE_PREFIXES = ["parts.", "livery.", "setup."];   // + ".custom." under livery
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
// The one place anything ENUMERATES the namespace. Guarded by isGarageKey on
// every hit, so a key that is not garage-shaped cannot reach the file.
function collectGarage() {
  const out = {};
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || full.indexOf("apex26.") !== 0) continue;
      const k = full.slice(7);
      if (!isGarageKey(k)) continue;
      const raw = localStorage.getItem(full);
      if (raw == null) continue;
      try { out[k] = JSON.parse(raw); n++; } catch (_) { /* not ours to repair */ }
    }
  } catch (_) { /* storage blocked: an empty garage file, not a crash */ }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  return { format: GARAGE_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: GARAGE_EXCLUDED, count: n, garage: out };
}

// Reading a file back in. Both loaders answer {ok, applied, skipped, reason}. They are deliberately
// strict and SILENT about anything they do not recognise: a file is player
// input, and the failure that matters is not a malformed number but a key the
// allowlist never named being written into the namespace. Nothing outside SPEC
// (settings) or isGarageKey (garage) is written, whatever the file says.
function typeOk(v, def) {
  if (def === null || def === undefined) return true;   // "unset" default: any shape
  if (typeof def === "object") return v !== null && typeof v === "object";
  return typeof v === typeof def;
}
function applySettings(file, G) {
  if (!file || file.format !== FORMAT) return { ok: false, reason: `not an ${FORMAT} file`, applied: 0, skipped: 0 };
  const groups = file.settings || {};
  let applied = 0, skipped = 0, failed = 0;
  for (const row of SPEC) {
    // A migration VERSION is context in the file and must never be written
    // back: an older number would re-run migrations that have already run.
    if (row.info) continue;
    const g = groups[row.group];
    if (!g || !Object.prototype.hasOwnProperty.call(g, row.k)) continue;
    const v = row.normalize ? row.normalize(g[row.k]) : g[row.k];
    if (v === undefined) { skipped++; continue; }
    if (v === null && row.perDevice) continue;   // unset on the device that saved it (collect)
    const def = defaultOf(row, G);
    // null restores OS-following motion; it is not an unknown enum member.
    if (!typeOk(v, def) || (row.oneOf && !(v === null && def === null) && !row.oneOf.includes(v))) { skipped++; continue; }
    try {
      // A write storage refused (full quota, private mode) is not APPLIED:
      // counting it reloaded the page into the values it had lost.
      let stored = true;
      if (row.lane === "raw") {
        if (v === null) stored = GameStore.store.rawDel(`apex26.${row.k}`) !== false;
        else stored = GameStore.store.rawSet(`apex26.${row.k}`, String(v)) !== false;
      } else {
        stored = GameStore.store.set(row.k, v) !== false;
      }
      if (stored) applied++; else failed++;
    } catch (_) { failed++; }
  }
  return { ok: true, applied, skipped, failed, reason: null };
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
const GARAGE_LIVERIES_MAX = 32;         // per team (the garage UI has no cap of its own)
const GARAGE_KEYS_MAX = 64;             // fields per livery / entries per parts sheet
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
  for (const k of Object.keys(l)) {
    if (k === "id" || k === "c1" || k === "c2" || k === "name" || k === "__proto__") continue;
    if (n >= GARAGE_KEYS_MAX) break;
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
function garageValue(k, v) {
  if (v === undefined || v === null) return undefined;
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
  if (k.indexOf("setup.") === 0) {
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
function applyGarage(file) {
  if (!file || file.format !== GARAGE_FORMAT) return { ok: false, reason: `not an ${GARAGE_FORMAT} file`, applied: 0, skipped: 0 };
  const g = file.garage || {};
  let applied = 0, skipped = 0, failed = 0;
  for (const k of Object.keys(g)) {
    if (!isGarageKey(k)) { skipped++; continue; }
    const v = garageValue(k, g[k]);
    if (v === undefined) { skipped++; continue; }
    try { if (GameStore.store.set(k, v) !== false) applied++; else failed++; } catch (_) { failed++; }
  }
  return { ok: true, applied, skipped, failed, reason: null };
}
// RESET TO THE SHIPPED GARAGE. Fresh installs never need this — GameStore.get
// already answers from GarageDefaults on a miss — but a player who diverged
// and wants the factory look back does. Clear every garage-shaped key first
// so extras the shipped file does not name (an invented team, a one-off
// setup.*) cannot linger, then apply GarageDefaults.file() through the same
// loader a hand-picked export uses. Career / season / settings stay out.
function resetGarage() {
  if (typeof GarageDefaults === "undefined" || !GarageDefaults.file) {
    return { ok: false, reason: "no shipped garage defaults", applied: 0, skipped: 0 };
  }
  const doomed = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || full.indexOf("apex26.") !== 0) continue;
      const k = full.slice(7);
      if (isGarageKey(k)) doomed.push(k);
    }
  } catch (_) { /* storage blocked: apply what we can */ }
  for (const k of doomed) {
    try { GameStore.store.set(k, undefined); } catch (_) { /* keep clearing */ }
  }
  return applyGarage(GarageDefaults.file());
}

// THE CAREER FILE: the six championship slots and the live pointer. Same
// allowlist discipline as the garage — only career.<flavour>.<i> and
// careerSlot leave or enter the namespace. Every slot value runs through
// migrateCareer on the way out and on the way in so a hand-edited or
// older-build file cannot crash Career.load().
const CAREER_FORMAT = "apex26-career-v1";
const CAREER_FLAVOURS = ["driver", "myteam"];
const CAREER_SLOT_N = 3;
const CAREER_EXCLUDED = "settings, garage (parts, liveries, setups), standalone season, lap records, ghosts, daily challenge, accounts";
const CAREER_SLOT_RE = /^career\.(driver|myteam)\.([0-2])$/;
function isCareerKey(k) {
  return k === "careerSlot" || CAREER_SLOT_RE.test(k);
}
function migrateSlot(raw) {
  if (raw == null) return null;
  // Clone before migrateCareer: it mutates in place, and export must not
  // rewrite the live Career.data() object sitting in the store cache.
  let copy = raw;
  try { copy = JSON.parse(JSON.stringify(raw)); } catch (_) { return null; }
  if (typeof GameStore !== "undefined" && GameStore.migrateCareer) return GameStore.migrateCareer(copy);
  return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : null;
}
function collectCareer() {
  const out = {};
  let n = 0;
  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  for (const f of CAREER_FLAVOURS) {
    for (let i = 0; i < CAREER_SLOT_N; i++) {
      const k = "career." + f + "." + i;
      let raw = null;
      if (store && store.get) raw = store.get(k, null);
      else {
        try {
          const s = localStorage.getItem("apex26." + k);
          if (s != null) raw = JSON.parse(s);
        } catch (_) { raw = null; }
      }
      const c = migrateSlot(raw);
      if (!c) continue;
      out[k] = c;
      n++;
    }
  }
  let live = null;
  if (store && store.get) live = store.get("careerSlot", null);
  else {
    try {
      const s = localStorage.getItem("apex26.careerSlot");
      if (s != null) live = JSON.parse(s);
    } catch (_) { live = null; }
  }
  if (typeof live === "string" && /^((driver|myteam):[0-2])$/.test(live)) {
    out.careerSlot = live;
    n++;
  }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  return { format: CAREER_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: CAREER_EXCLUDED, count: n, careers: out };
}
// Freeze all possible destinations before opening the asynchronous picker.
function careerRevisions() {
  const expectedRevisions = {};
  if (typeof CareerBackup !== "undefined") for (const f of CAREER_FLAVOURS) {
    for (let i = 0; i < CAREER_SLOT_N; i++) expectedRevisions[f + ":" + i] = CareerBackup.revisionOf(f, i);
  }
  const s = typeof GameStore !== "undefined" ? GameStore.store : null;
  return { expectedRevisions, expectedSelectionRevision: s && s.keyRevision ? s.keyRevision("careerSlot") : null };
}
function applyCareer(file, revisions) {
  const refused = (reason) => ({ ok: false, reason, applied: 0, skipped: 0, failed: 0 });
  if (!file || file.format !== CAREER_FORMAT) return refused(`not an ${CAREER_FORMAT} file`);
  const bag = file.careers;
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return refused("invalid careers");
  if (typeof CareerBackup === "undefined") return refused("career backup unavailable");
  const slots = [];
  let skipped = 0, liveSlot;
  for (const k of Object.keys(bag)) {
    if (!isCareerKey(k)) { skipped++; continue; }
    if (k === "careerSlot") {
      if (typeof bag[k] === "string" && /^(driver|myteam):[0-2]$/.test(bag[k])) liveSlot = bag[k];
      else skipped++;
      continue;
    }
    const c = migrateSlot(bag[k]);
    if (!c) { skipped++; continue; }
    const match = CAREER_SLOT_RE.exec(k);
    slots.push({ flavour: match[1], i: Number(match[2]), data: c });
  }
  if (!slots.length && liveSlot == null) return { ok: true, applied: 0, skipped, failed: 0, reason: null };
  // Both file formats share the same live-conflict gate and preflight of ALL
  // destination revisions. No slot is written if any destination changed.
  const r = CareerBackup.apply({ format: CareerBackup.FORMAT, slots },
    Object.assign({}, revisions || careerRevisions(), { liveSlot, includeExtras: false }));
  if (!r.ok) return refused(r.reason);
  const failed = r.failed || 0;
  return { ok: true, applied: r.written.length + (r.selectionWritten ? 1 : 0), skipped, failed, reason: null };
}

async function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
    await NativeDownload.saveBlob(blob, name);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Settings backups have their own page; renderer diagnostics stay in DISPLAY.
//
// FIVE buttons, two files. Saving is one tap. LOADING IS TWO: it overwrites
// what is already stored and then reloads the page, which is not something a
// mis-tap should do, so the first tap arms and says so and the second commits.
// The arm clears itself after ARM_MS, and arming either loader disarms the
// other.
const ARM_MS = 4000;
// The live UI half, set by create(). js/garage/setup-sheet.js reaches the
// garage row through the module rather than through the G façade: the row is
// UI this module owns, and G's contract is for state game.js hands out.
let _ui = null;
function create(G) {
  const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  let picker = null;
  let armed = null;
  let armT = 0;
  let pickVersion = 0;
  let reloading = false;

  // ONE hidden <input type="file">, retargeted per use: iOS re-uses the sheet
  // and a second input would open a second one. `value = ""` before every click so
  // choosing the SAME file twice still fires change.
  function pick(onJson, maxBytes) {
    ++pickVersion;   // a new chooser supersedes pending reads
    if (!picker) {
      picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "application/json,.json";
      picker.hidden = true;
      document.body.appendChild(picker);
    }
    picker.onchange = () => {
      if (reloading) return;
      const version = ++pickVersion;
      const f = picker.files && picker.files[0];
      if (!f) return;
      const done = (text) => {
        if (version !== pickVersion) return;
        let obj = null;
        try { obj = JSON.parse(text); } catch (_) { obj = null; }
        onJson(obj);
      };
      const fail = () => { if (version === pickVersion) onJson(null); };
      if (maxBytes && f.size > maxBytes) { fail(); return; }   // refused before it is read, let alone parsed
      if (typeof f.text === "function") f.text().then(done, fail);
      else { const r = new FileReader(); r.onload = () => done(String(r.result || "")); r.onerror = fail; r.readAsText(f); }
    };
    picker.value = "";
    picker.click();
  }

  // One label timer per button: a FAILED / NOT A JSON FILE restore landing after
  // the button was armed wiped "OVERWRITE …?" while the next tap still loaded.
  const flashT = new Map();
  const unflash = (b) => { clearTimeout(flashT.get(b)); flashT.delete(b); };
  const flash = (b, label, msg, ms) => { unflash(b); b.textContent = `${label} — ${msg}`; flashT.set(b, setTimeout(() => { flashT.delete(b); b.textContent = label; }, ms || 1800)); };
  const disarm = () => { if (armed) { armed.el.textContent = armed.label; armed = null; } clearTimeout(armT); };

  const saveBtn = (id, label, title, make, name) => {
    const b = document.createElement("button");
    b.id = id; b.type = "button"; b.textContent = label; b.title = title;
    b.onclick = async () => {
      if (b.disabled) return;
      disarm(); unflash(b);
      b.disabled = true;
      b.textContent = `${label} — SAVING…`;
      try {
        tick();
        const file = make();
        await download(file, name(file));
        const n = file.changed ? `${file.changed.length} changed` : `${file.count} keys`;
        flash(b, label, `SAVED (${n})`);
        Log.info("ui", "file saved", { id, n });
      } catch (e) {
        flash(b, label, "FAILED");
        Log.warn("ui", "file save failed", e && e.message);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  const loadBtn = (id, label, title, apply, what, snapshot, maxBytes) => {
    const b = document.createElement("button");
    b.id = id; b.type = "button"; b.textContent = label; b.title = title;
    b.onclick = () => {
      if (reloading) return;
      if (!armed || armed.el !== b) {
        disarm(); unflash(b);
        armed = { el: b, label, snapshot: snapshot ? snapshot() : null };
        b.textContent = `${label} — OVERWRITE ${what}?`;
        armT = setTimeout(disarm, ARM_MS);
        tick();
        return;
      }
      const revisions = armed.snapshot;
      disarm();
      pick((obj) => {
        if (!obj) { flash(b, label, "NOT A JSON FILE", 2200); return; }
        const r = apply(obj, revisions);
        if (!r.ok) { flash(b, label, String(r.reason || "REFUSED").toUpperCase(), 2600); return; }
        Log.info("ui", "file loaded", { id, applied: r.applied, skipped: r.skipped, failed: r.failed });
        // Storage refused some writes: a reload would drop them, so say so and stay.
        if (r.failed) { flash(b, label, `STORAGE FULL — ${r.failed} NOT SAVED`, 3200); return; }
        if (!r.applied) { flash(b, label, "NOTHING TO LOAD", 2200); return; }
        // A reload is the honest way to apply this: half these values are read
        // once at boot (the backend pick, the grid, every tuner's first
        // paint), so re-reading them without one would leave the page showing
        // a mix of old and new.
        b.textContent = `${label} — ${r.applied} APPLIED, RELOADING…`;
        reloading = true; b.disabled = true;
        setTimeout(() => { try { location.reload(); } catch (_) { /* file:// */ } }, 600);
      }, maxBytes);
      tick();
    };
    return b;
  };

  function mount() {
    const host = document.getElementById("pm-panel-files");
    if (!host || document.getElementById("pm-settings-file")) return;
    const h = document.createElement("h3");
    h.className = "pm-group-h";
    h.id = "pm-settings-file";
    h.textContent = "SETTINGS FILE";
    const note = document.createElement("p");
    note.className = "adv-help";
    note.setAttribute("data-help", "keep");   // HELP TEXT: HIDE keeps it — it is the only word on what LOAD does
    note.textContent = "Back up preferences, appearance profiles, tuners and control bindings with SAVE ALL. SAVE CHANGED exports only differences from the defaults. LOAD asks twice, then reloads. Photos, personal background images, career progress and accounts are not included. For cars, setups and liveries, use the file buttons in GARAGE › TEAM.";

    host.append(h,
      saveBtn("pm-settings-changed", "SAVE CHANGED SETTINGS",
        "Only the settings that differ from the defaults, each with the default it replaced and where that default lives.",
        () => collect("changes", G), () => `apex26-settings-changes-${stamp()}.json`),
      saveBtn("pm-settings-all", "SAVE ALL SETTINGS",
        "Every setting with its current value.",
        () => collect("all", G), () => `apex26-settings-all-${stamp()}.json`),
      loadBtn("pm-settings-load", "LOAD SETTINGS FILE",
        "Read an apex26-settings file back in. Only allowlisted keys are written; the garage, career and accounts are never touched.",
        (obj) => applySettings(obj, G), "SETTINGS"),
      note);
  }

  // THE GARAGE PAIR LIVES IN THE GARAGE, not here: a player looking to back up
  // a livery looks where liveries are. js/garage/setup-sheet.js calls this at
  // the end of its TEAM tab and appends what comes back. It rebuilds that tab
  // on every change, so this returns FRESH nodes each call and holds no
  // singleton — the id-guard mount() uses would leave an empty section behind
  // the first time the tab was rebuilt.
  function garageRow() {
    if (typeof document === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.id = "cs-garage-file";
    wrap.className = "sel-edit-row";
    // Same two-tap arm as LOAD, but no file picker — the second tap clears
    // garage-shaped keys and re-applies js/data/garage-defaults.js.
    const resetLabel = "RESET GARAGE TO DEFAULTS";
    const resetBtn = document.createElement("button");
    resetBtn.id = "cs-garage-reset";
    resetBtn.type = "button";
    resetBtn.textContent = resetLabel;
    resetBtn.title = "Clear parts, liveries, setups and team/driver back to the shipped garage. Career and settings are never touched.";
    resetBtn.onclick = () => {
      if (reloading) return;
      if (!armed || armed.el !== resetBtn) {
        disarm(); unflash(resetBtn);
        armed = { el: resetBtn, label: resetLabel, snapshot: null };
        resetBtn.textContent = `${resetLabel} — OVERWRITE THE GARAGE WITH DEFAULTS?`;
        armT = setTimeout(disarm, ARM_MS);
        tick();
        return;
      }
      disarm();
      const r = resetGarage();
      if (!r.ok) { flash(resetBtn, resetLabel, String(r.reason || "REFUSED").toUpperCase(), 2600); return; }
      Log.info("ui", "garage reset to shipped defaults", { applied: r.applied, skipped: r.skipped, failed: r.failed });
      if (r.failed) { flash(resetBtn, resetLabel, `STORAGE FULL — ${r.failed} NOT SAVED`, 3200); return; }
      if (!r.applied) { flash(resetBtn, resetLabel, "NOTHING TO RESET", 2200); return; }
      resetBtn.textContent = `${resetLabel} — ${r.applied} APPLIED, RELOADING…`;
      reloading = true; resetBtn.disabled = true;
      setTimeout(() => { try { location.reload(); } catch (_) { /* file:// */ } }, 600);
      tick();
    };
    wrap.append(
      saveBtn("cs-garage-save", "SAVE GARAGE FILE",
        "Parts, liveries, setup sheets and your own team, for every team. Career money, results and lap records are never in it.",
        collectGarage, () => `apex26-garage-${stamp()}.json`),
      loadBtn("cs-garage-load", "LOAD GARAGE FILE",
        "Read an apex26-garage file back in. Career money, results and lap records are never touched.",
        applyGarage, "THE GARAGE", null, GARAGE_MAX_BYTES),
      resetBtn);
    return wrap;
  }
  // CAREER MODES mounts this the same way GARAGE mounts garageRow: fresh
  // nodes each call, no static shell tags, id-guard against a double append.
  function careerRow() {
    if (typeof document === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.id = "cr-career-file";
    wrap.className = "sel-edit-row";
    wrap.append(
      saveBtn("cr-career-save", "SAVE CAREER FILE",
        "All six career slots and which one is live. Settings, garage builds and accounts stay out.",
        collectCareer, () => `apex26-career-${stamp()}.json`),
      loadBtn("cr-career-load", "LOAD CAREER FILE",
        "Read an apex26-career file back in. Only career slots are written; settings and the garage are never touched.",
        applyCareer, "CAREER SAVES", careerRevisions));
    const protection = document.createElement("button");
    protection.type = "button";
    protection.textContent = "PROTECT LOCAL SAVES";
    const status = document.createElement("p");
    status.className = "adv-help";
    status.style.flexBasis = "100%";
    status.setAttribute("role", "status");
    status.setAttribute("data-help", "keep");
    const storage = typeof navigator !== "undefined" && navigator.storage;
    let revision = 0;
    async function checkProtection(request) {
      const current = ++revision;
      protection.disabled = true;
      try {
        const protectedSaves = await (request ? storage.persist() : storage.persisted());
        if (current !== revision) return;
        protection.disabled = protectedSaves || typeof storage.persist !== "function";
        protection.textContent = protectedSaves ? "LOCAL SAVES PROTECTED" : "PROTECT LOCAL SAVES";
        status.textContent = protectedSaves
          ? "Browser storage protection is enabled. Clearing site data still removes saves. Save a career file for a separate backup."
          : "Browser storage protection is not enabled. Save a career file regularly to keep a separate backup.";
      } catch (_) {
        if (current !== revision) return;
        protection.disabled = !storage || typeof storage.persist !== "function";
        status.textContent = "Storage protection could not be confirmed. Save a career file to keep a separate backup.";
      }
    }
    protection.onclick = () => { if (!protection.disabled) { tick(); checkProtection(true); } };
    status.textContent = "Storage protection is unavailable in this browser. Save a career file to keep a separate backup.";
    protection.disabled = !storage || typeof storage.persist !== "function";
    if (storage && typeof storage.persisted === "function") {
      status.textContent = "Checking browser storage protection…";
      checkProtection(false);
    }
    wrap.append(protection, status);
    return wrap;
  }
  if (typeof document === "undefined") return { collect: (mode) => collect(mode, G) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  Log.info("ui", "SettingsExport.create");
  _ui = { collect: (mode) => collect(mode, G), collectGarage, collectCareer,
          applySettings: (o) => applySettings(o, G), applyGarage, applyCareer, resetGarage,
          garageRow, careerRow, mount };
  return _ui;
}

/** Remount the BACKUP & RESTORE controls if create already ran (idempotent).
 *  SettingsNav calls this when the files page opens so a missed boot mount
 *  cannot leave an empty panel (title + Back only). */
function ensureMounted() { if (_ui && typeof _ui.mount === "function") _ui.mount(); }

return { FORMAT, GARAGE_FORMAT, CAREER_FORMAT, SPEC, collect, collectGarage, collectCareer,
         applySettings, applyGarage, applyCareer, resetGarage, isGarageKey, isCareerKey, garageValue, create,
         ensureMounted, mount: ensureMounted,
         garageRow: () => (_ui && _ui.garageRow ? _ui.garageRow() : null),
         careerRow: () => (_ui && _ui.careerRow ? _ui.careerRow() : null) };
})();
Object.freeze(SettingsExport);
