const SettingsExport = (function () {
  "use strict";

const FORMAT = "apex26-settings-v1";

const SPEC = [
  { k: "sound", lane: "json", group: "audio", def: true, src: "js/game.js",
    subsystem: "ships the game MUTED for every new player — an export from a silenced phone looks exactly like this" },
  { k: "sfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "menuSfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "music", lane: "json", group: "audio", def: true, src: "js/game.js" },
  { k: "volMusic", lane: "json", group: "audio", def: 0.6, src: "js/audio/panel.js" },
  { k: "volSfx", lane: "json", group: "audio", def: 0.2, src: "js/audio/panel.js" },
  { k: "battleEarcon", lane: "json", group: "audio", def: false, src: "js/race/race-radio.js" },
  { k: "radioVoice", lane: "json", group: "audio", def: false, src: "js/audio/panel.js" },
  { k: "announcer", lane: "json", group: "audio", def: true, src: "js/audio/announcer.js" },
  { k: "volRadio", lane: "json", group: "audio", def: 0.8, src: "js/audio/panel.js" },
  { k: "radioFocusDb", lane: "json", group: "audio", def: 0, src: "js/audio/panel.js", oneOf: [0, 4, 8, 12] },
  { k: "radioFx", lane: "json", group: "audio", def: 1, src: "js/audio/panel.js" },
  { k: "radioPreset", lane: "json", group: "audio", def: "modern", oneOf: ["modern", "clean", "vintage"], src: "js/audio/panel.js" },
  { k: "spokenLang", lane: "json", group: "audio", def: "auto", src: "js/audio/radio-voice.js", oneOf: ["auto", "en", "es", "pt", "it", "de", "fr", "ja", "nl"] },
  { k: "voiceTune", lane: "json", group: "audio", def: {}, src: "js/audio/radio-voice.js" },
  { k: "radioChat", lane: "json", group: "audio", def: "normal", src: "js/race/race-radio.js", oneOf: ["off", "key", "normal", "chatty"] },
  { k: "radioPack", lane: "json", group: "audio", def: true, src: "js/audio/radio-voice.js" },
  { k: "spotter", lane: "json", group: "audio", def: false, src: "js/race/spotter.js" },
  { k: "commentary", lane: "json", group: "audio", def: "tv", src: "js/race/race-radio.js", oneOf: ["off", "tv", "on"] },
  { k: "musicSource", lane: "json", group: "audio", def: "all", src: "js/audio/panel.js" },
  { k: "sndProfile", lane: "json", group: "audio", def: "team", src: "js/audio/panel.js" },
  { k: "sndTune", lane: "json", group: "audio", def: () => engineTable("tuneDefaults"), table: true, src: "js/audio/engine.js TUNE_DEF" },
  { k: "sndLayers", lane: "json", group: "audio", def: () => engineTable("layerDefaults"), table: true, src: "js/audio/engine.js LAYER_DEF" },
  { k: "uiScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%; 109% on touch, 70% on a phone)" },
  { k: "hudScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%; touch defaults 100 hud / 109 ui, 70 ui on a phone, scale.js scaleDefault)" },
  { k: "hudBtnScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = follows hudScale)" },
  { k: "hudBtnOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = 100%)" },
  { k: "hudBtnShape", lane: "json", group: "display", def: null, src: "js/ui/dock-layout.js BUTTON SHAPE (null = AUTO)", oneOf: ["round", "squircle", "square"] },
  { k: "hudPanelOpacity", lane: "json", group: "display", def: null, src: "js/ui/scale.js PANEL OPACITY (null = 100%; HIGH CONTRAST keeps plates solid)" },
  { k: "motion", lane: "json", group: "a11y", def: null, src: "js/ui/title-fx.js REDUCE MOTION (null/auto = follow OS; reduce=ON; off; legacy on → auto)", oneOf: ["auto", "reduce", "off", "on"] },
  { k: "focusRing", lane: "json", group: "a11y", def: "high", src: "js/ui/a11y-opts.js KEYBOARD FOCUS", oneOf: ["standard", "high"] },
  { k: "cbCues", lane: "json", group: "a11y", def: "off", src: "js/ui/a11y-opts.js COLOURBLIND CUES", oneOf: ["off", "on"] },
  { k: "holdMode", lane: "json", group: "a11y", def: { throttle: "hold", lookBack: "hold" }, src: "js/ui/a11y-opts.js GAS / LOOK BACK hold mode" },
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
  { k: "lookDesigner", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks.js TRACK DESIGNER (null = shipped; else {knob: value} for the knobs off their defaults — ScreenLooks.normalize validates)" },
  { k: "layoutPreset", lane: "json", group: "appearance", def: null, src: "js/ui/layout-presets.js LAYOUT PRESET (null = none recorded; the last preset applied — it reads CUSTOM once the knobs above no longer match it)", oneOf: ["shipped", "thumb", "compact", "big"] },
  { k: "resMode", lane: "json", group: "display", def: (G) => (typeof UiScale !== "undefined" && UiScale.defaultResMode ? UiScale.defaultResMode() : "auto"), src: "js/ui/scale.js (MED on a touch device)", perDevice: true },
  { k: "resSchema", lane: "json", group: "display", def: 1, info: true, src: "js/ui/scale.js RES_SCHEMA (migration version — boot writes the current one, so never a change)" },
  { k: "spatialUpscale", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js + GLX/WGX/TLX SGSR (UPSCALING-2026-09 §6–7; OFF by default)" },
  { k: "occlusionCull", lane: "raw", group: "display", def: "0", src: "js/ui/scale.js OCCLUSION row + GLX hardware depth queries (js/render/glx/chunked.js; GLX only, OFF by default)" },
  { k: "buildWorker", lane: "raw", group: "display", def: "1", src: "js/track/build-client.js BUILD IN BACKGROUND (unset = ON when multi-core; \"0\"/\"1\" force)", oneOf: ["0", "1"], perDevice: true },
  { k: "portraitOk", lane: "raw", group: "display", def: "0", src: "js/game.js RACE IN PORTRAIT (\"1\" = race upright, else the rotate blocker)", oneOf: ["0", "1"] },
  { k: "debris", lane: "raw", group: "display", def: "0", src: "js/ui/post-fx-opts.js (PostFxOpts.debris) + js/physics/debris-world.js create() (only \"1\" is on)" },
  { k: "gfxSsao", lane: "raw", group: "display", def: "1", src: "js/ui/post-fx-opts.js AMBIENT OCCLUSION (only \"0\" is off; game.js zeroes po.ssao + po.contact)", oneOf: ["0", "1"] },
  { k: "gfxGodrays", lane: "raw", group: "display", def: "1", src: "js/ui/post-fx-opts.js GOD-RAYS (only \"0\" is off; game.js zeroes po.godray + po.lampVol)", oneOf: ["0", "1"] },
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
  { k: "hudProfile", lane: "json", group: "hud", def: "standard", oneOf: ["minimal", "standard", "broadcast"], src: "js/game.js" },
  { k: "hudMetricsLayout", lane: "json", group: "hud", def: "full", src: "js/game.js" },
  { k: "hudMapVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudGapsVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudElements", lane: "json", group: "hud", def: {}, src: "js/ui/hud-elements.js per-element on/off (missing key = on)" },
  { k: "hudLayout", lane: "json", group: "hud", def: null, src: "js/ui/hud-layout.js MOVE & SIZE (null = shipped; else {v:4, standard?, minimal?, broadcast?}, each {cockpit, helmet, other} of {id: {x, y, s}}; offsets are finite and size positive finite, without visual bounds. Missing elements and older formats use SHIPPED layouts)" },
  { k: "hudMirror", lane: "json", group: "hud", def: "auto", src: "js/render/shared/mirror-pass.js", oneOf: ["auto", "on", "off"] },
  { k: "garageArrival", lane: "json", group: "camera", def: null, src: "js/garage/arrival.js (null = shipped arrival settings)" },
  { k: "flybyShots", lane: "json", group: "camera", def: null, src: "js/camera/flyby-panel.js FLYBY SHOT EDITOR (null = shipped shots)" },
  { k: "ldCard", lane: "json", group: "camera", def: null, src: "js/ui/loading-screen.js loading card {scale, x, y} (null = shipped)" },
  { k: "helmetVisor", lane: "raw", group: "camera", def: "off", src: "js/camera/cockpit-opts.js CHOICES.visor", oneOf: ["off", "clear", "smoke"] },
  { k: "helmetVisorColor", lane: "raw", group: "camera", def: "neutral", src: "js/camera/cockpit-opts.js CHOICES.visorColor", oneOf: ["neutral", "amber", "ice", "rose"] },
  { k: "helmetVisorIntensity", lane: "raw", group: "camera", def: "light", src: "js/camera/cockpit-opts.js CHOICES.visorIntensity", oneOf: ["light", "medium", "strong"] },
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
  { k: "motionBlur", lane: "json", group: "camera", def: 5, src: "js/camera/cam-comfort.js MOTION BLUR (1 = off)", oneOf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { k: "speedLines", lane: "json", group: "camera", def: 5, src: "js/camera/cam-comfort.js SPEED LINES (1 = off)", oneOf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { k: "cockpitHalo", lane: "raw", group: "camera", def: "fairing", src: "js/camera/cockpit-opts.js HALO_VALUES (\"1\" = standard, \"0\" = off)", oneOf: ["0", "slim", "1", "thick", "fairing"] },
  { k: "cockpitWheelFinish", lane: "raw", group: "camera", def: "carbon", src: "js/camera/cockpit-finishes.js", oneOf: ["carbon", "livery", "anodised", "suede", "stock"] },
  { k: "cockpitBodyFinish", lane: "raw", group: "camera", def: "livery", src: "js/camera/cockpit-finishes.js", oneOf: ["livery", "gloss", "matte", "satin", "carbon", "brushed", "chrome"] },
  { k: "cockpitHaloFinish", lane: "raw", group: "camera", def: "livery", src: "js/camera/cockpit-finishes.js", oneOf: ["livery", "gloss", "matte", "satin", "carbon", "brushed", "chrome"] },
  { k: "cockpitWheel", lane: "raw", group: "camera", def: "f1", src: "js/camera/cockpit-opts.js CHOICES.wheel", oneOf: ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"] },
  { k: "cockpitBody", lane: "raw", group: "camera", def: "sculpted", src: "js/camera/cockpit-opts.js CHOICES.body", oneOf: ["standard", "sculpted", "wide", "tapered", "stepped"] },
  { k: "cockpitSeat", lane: "raw", group: "camera", def: "std", src: "js/camera/cockpit-opts.js CHOICES.seat", oneOf: ["std", "low", "high", "fwd"] },
  { k: "cockpitInterior", lane: "raw", group: "camera", def: "team", src: "js/camera/cockpit-opts.js CHOICES.interior", oneOf: ["carbon", "team", "suede", "ribbed", "classic"] },
  { k: "cockpitTurnChaseLead", lane: "raw", group: "camera", def: "0.4", src: "js/camera/cockpit-opts.js LEAD_DEFAULT" },
  { k: "lookBackLatch", lane: "json", group: "camera", def: false, src: "js/camera/feel.js LOOK BACK LATCH (hold vs press-to-latch)" },
  { k: "speedVignette", lane: "json", group: "camera", def: false, src: "js/camera/feel.js SPEED VIGNETTE (off by default)" },
  { k: "lightTune", lane: "json", group: "lighting", def: {}, src: "js/lighting/knobs.js TUNE_DEFS (the file holds {\"track|tod|weather\":{knob:value}} edits)" },
  { k: "steerMode", lane: "json", group: "driving", def: "buttons", oneOf: ["tilt", "buttons", "touch"], src: "js/game.js" },
  { k: "manual", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "autoThrottle", lane: "json", group: "driving", def: false, src: "js/game.js (XAG 107: a held accelerator is an input barrier)" },
  { k: "mirrorControls", lane: "json", group: "driving", def: false, src: "js/game.js (left-handed dock)" },
  { k: "dockLayout", lane: "json", group: "driving", def: null, src: "js/ui/dock-layout.js (per-scheme touch-dock offsets; null = defaults)" },
  { k: "tiltCurve", lane: "json", group: "driving", def: 5, src: "js/input/steer-tuning.js curveTrimFromSlider" },
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
      const raw = Object.assign({ v: 1, devices: [], legacyClaimed: false }, v);
      if (v.v === 1 && !("legacyClaimed" in v)) delete raw.legacyClaimed;
      const clean = ControllerProfiles.clean(raw);
      return clean.devices.length === raw.devices.length ? clean : undefined;
    } },
  { k: "conditionCues", lane: "json", group: "driving", def: true, src: "js/ui/condition-cue-controls.js" },
  { k: "padRest", lane: "json", group: "driving", def: 0, src: "js/ui/key-binds.js CALIBRATE STICK (steer-axis rest offset per pad: {[padId]: v}, |v| <= 0.5; a legacy scalar is adopted by the first pad that drives; 0 = uncalibrated)",
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
  { k: "drivingLinePalette", lane: "json", group: "driving", def: "f1", src: "js/ui/driving-line-opts.js" },
  { k: "drivingLineOpacity", lane: "json", group: "driving", def: "normal", src: "js/ui/driving-line-opts.js" },
  { k: "lineBrakeCue", lane: "json", group: "driving", def: "off", src: "js/ui/driving-line-opts.js" },
  { k: "uiTheme", lane: "json", group: "appearance", def: "dark", src: "js/ui/appearance-opts.js" },
  { k: "menuAccent", lane: "json", group: "appearance", def: "ember", src: "js/ui/appearance-opts.js" },
  { k: "hudAccent", lane: "json", group: "appearance", def: "team", src: "js/ui/appearance-opts.js" },
  { k: "menuAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "hudAccentHex", lane: "json", group: "appearance", def: "#e10600", src: "js/ui/appearance-opts.js" },
  { k: "textSize", lane: "json", group: "appearance", def: "large", src: "js/ui/appearance-opts.js TEXT SIZE", oneOf: ["normal", "large", "larger"] },
  { k: "uiContrast", lane: "json", group: "appearance", def: "high", src: "js/ui/appearance-opts.js HIGH CONTRAST", oneOf: ["off", "high"] },
  { k: "appIcon", lane: "json", group: "appearance", def: "default", src: "js/ui/appearance-opts.js APP ICON", oneOf: ["default", "A", "B", "C", "D", "E", "F"] },
  { k: "cvdMode", lane: "json", group: "appearance", def: "off", src: "js/ui/appearance-opts.js COLOUR VISION", oneOf: ["off", "deutan", "protan", "tritan"] },
  { k: "captions", lane: "json", group: "appearance", def: "on", src: "js/ui/captions.js CAPTIONS", oneOf: ["on", "off", "spoken"] },
  { k: "captionSize", lane: "json", group: "appearance", def: "medium", src: "js/ui/captions.js CAPTION SIZE", oneOf: ["small", "medium", "large"] },
  { k: "captionPos", lane: "json", group: "appearance", def: "auto", src: "js/ui/captions.js CAPTION POSITION", oneOf: ["auto", "top", "bottom", "mirror"] },
  { k: "captionBg", lane: "json", group: "appearance", def: 82, src: "js/ui/captions.js CAPTION BACKGROUND (40–100)" },
  { k: "captionSpeakerInk", lane: "json", group: "appearance", def: "on", src: "js/ui/captions.js SPEAKER COLOUR", oneOf: ["on", "off"] },
  { k: "speedUnits", lane: "json", group: "appearance", def: "kmh", src: "js/ui/appearance-opts.js SPEED UNITS", oneOf: ["kmh", "mph"] },
  { k: "menuHelp", lane: "json", group: "appearance", def: "on", src: "js/ui/appearance-opts.js HELP TEXT (on = SHOW | off = HIDE)", oneOf: ["on", "off"] },
  { k: "homeScene", lane: "json", group: "appearance", def: "photo", src: "js/ui/appearance-studio.js", oneOf: ["auto", "garage", "night", "studio", "track", "pitlane", "static", "photo"] },
  { k: "backgroundMotion", lane: "json", group: "appearance", def: "ambient", src: "js/ui/appearance-studio.js", oneOf: ["still", "ambient"] },
  { k: "homeCamera", lane: "json", group: "appearance", def: "side", src: "js/ui/appearance-studio.js", oneOf: ["auto", "hero", "front", "side", "rear"] },
  { k: "garageLook", lane: "raw", group: "appearance", def: "stock", src: "js/garage/scene-prims.js setLook (GARAGE row)", oneOf: ["stock", "studio", "carbon", "flood", "workshop", "porcelain", "heritage", "endurance", "rainready", "qualify"] },
  { k: "crewLook", lane: "raw", group: "appearance", def: "classic", src: "js/garage/scene-crew.js setLook (CREW row)", oneOf: ["classic", "sculpted", "pitstop", "workshop", "welcome"] },
  { k: "garageMood", lane: "raw", group: "appearance", def: "shipped", src: "js/garage/scene.js setMood (LIGHTING row)", oneOf: ["shipped", "broadcast", "night", "showroom", "daylight", "inspection", "goldenhour", "endurance", "podium", "rain", "neon"] },
  { k: "appearanceShapes", lane: "json", group: "appearance", def: null, src: "js/ui/layout-presets.js PORTRAIT & LANDSCAPE",
    normalize: (v) => v === null ? null : v && typeof v === "object" && v.v === 2 && v.mode === "separate"
      ? { v: 2, mode: "separate", live: v.live === "wide" || v.live === "tall" ? v.live : null, park: v.park && typeof v.park === "object" && !Array.isArray(v.park) ? v.park : null } : undefined },
  { k: "appearanceProfiles", lane: "json", group: "appearance", def: [], src: "js/ui/appearance-studio.js", normalize: (v) => Array.isArray(v) ? (!v.length ? [] : typeof AppearanceStudio !== "undefined" ? AppearanceStudio.normalizeProfiles(v) : undefined) : undefined },
  { k: "difficulty", lane: "json", group: "driving", def: "hard", src: "js/game.js", oneOf: ["easy", "normal", "hard"] },
  { k: "aiPace", lane: "json", group: "driving", def: "scripted", src: "js/game.js / js/physics/ai-band.js", oneOf: ["scripted", "catchup"] },
  { k: "drivingCoach", lane: "json", group: "driving", def: false, src: "js/race/driving-coach.js" },
  { k: "throttleLatch", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "tyreWear", lane: "json", group: "driving", def: "real", src: "js/game.js" },
  { k: "dirtyAir", lane: "json", group: "driving", def: "classic", oneOf: ["off", "classic", "cfd"], src: "js/game.js PhysicsConsts.DirtyAir" },
  { k: "wind", lane: "json", group: "driving", def: "real", oneOf: ["off", "real"], src: "js/race/race-settings.js WIND row → Wind.setLevel" },
  { k: "ersPlan", lane: "json", group: "driving", def: ["manual", "manual", "manual"], src: "js/race/race-settings.js ERS SECTOR rows → EnergyPlan (#1580)",
    normalize: (v) => (Array.isArray(v) && v.length === 3 && v.every((p) => p === "manual" || p === "deploy" || p === "save") ? v.slice() : undefined) },
  { k: "damageHandling", lane: "json", group: "driving", def: false, src: "js/race/race-settings.js DAMAGE row → DamageHandling.setEnabled (#1578)" },
  { k: "wheelState", lane: "raw", group: "driving", def: "0", oneOf: ["0", "1"], src: "js/physics/wheel-state.js" },
  { k: "wheelAssist", lane: "raw", group: "driving", def: "off", oneOf: ["off", "medium", "full"], src: "js/physics/wheel-state.js" },
  { k: "raceGrid", lane: "json", group: "driving", def: "random", src: "js/game.js" },
  { k: "champGrid", lane: "json", group: "driving", def: "champ", src: "js/game.js", oneOf: ["champ", "tier", "revchamp", "random"] },
  { k: "reliability", lane: "json", group: "driving", def: "off", src: "js/game.js" },
  { k: "caution", lane: "json", group: "driving", def: false, src: "js/race/race-control.js" },
  { k: "unlimitedBudget", lane: "json", group: "driving", def: true, src: "js/game.js" },
  { k: "bodyAttitude", lane: "raw", group: "driving", def: null, src: "js/physics/body-attitude.js (null = on)" },
  { k: "raceDraft", lane: "json", group: "driving", def: null, src: "js/race/race-settings.js REMEMBER LAST RACE SETUP (null = 3 laps / dry / default; else {laps: \"3\"|\"5\"|\"10\"|\"25\"|\"FULL\", weather, tod, mixed})" },
  { k: "favTracks", lane: "json", group: "driving", def: null, src: "js/ui/select-screen.js FAVOURITE CIRCUITS (null = none; else an array of track ids)" },
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
  { k: "keys", lane: "json", group: "controls", def: null, src: "js/input/input.js KEY_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.keysAreDefault && Input.keysAreDefault()) },
  { k: "pad", lane: "json", group: "controls", def: null, src: "js/input/input.js PAD_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.padsAreDefault && Input.padsAreDefault()) },
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

const EXCLUDED = "photo library and personal background images, garage (parts, liveries, setup sheets, MY TEAM), saves (career, season, ghosts, replays, daily challenge), accounts and network (Spotify, TURN, relays), renderer self-heal latches, developer flags. Time-trial leaderboards are optional in the ttlb section (merged on import)";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function engineTable(fn) {
  const t = typeof GameAudio !== "undefined" && typeof GameAudio[fn] === "function" ? GameAudio[fn]() : null;
  return isObj(t) && Object.keys(t).length ? t : undefined;
}
function same(a, b) {
  if (a === b) return true;
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return false;
}
function objDiff(v, def) {
  const out = {};
  for (const k of Object.keys(v)) if (!(k in def) || !same(v[k], def[k])) out[k] = v[k];
  return out;
}
function readStored(row) {
  const s = GameStore.store;
  if (row.lane === "raw") return s.raw(row.k);
  const v = s.get(row.k, undefined);
  return v === undefined ? null : v;
}
function defaultOf(row, G) {
  if (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(row.k)) return SettingsDefaults.get(row.k);
  return typeof row.def === "function" ? row.def(G) : row.def;
}

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
    let diff = has && !row.info && def !== undefined && (row.changed ? row.changed(stored) : !same(stored, def));
    let value = has ? stored : (all && row.perDevice ? null : def);
    if (diff && isObj(stored) && isObj(def) && Object.keys(def).length) {
      const d = objDiff(stored, def);
      if (!Object.keys(d).length) diff = false;
      if (!all) value = d;
    }
    if ((!diff && !all) || value === undefined) continue;
    (settings[row.group] ||= {})[row.k] = value;
    if (diff) {
      const name = `${row.group}.${row.k}`;
      changed.push(name);
      (defaults[row.group] ||= {})[row.k] = def;
      where[name] = row.src;
    }
  }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) {  }
  const desktop = thisDesktop(G);
  const out = {
    format: FORMAT, mode: all ? "all" : "changes", exportedAt: new Date().toISOString(), build,
    device: { desktop, userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || null },
    keys: { json: "went through store.set (JSON)", raw: "bare strings from store.rawSet; null = unset" },
    excluded: EXCLUDED,
    changed, settings, defaults, where,
  };
  const ttlb = collectTtlb();
  if (ttlb && Object.keys(ttlb).length) out.ttlb = ttlb;
  return out;
}

const TTLB_TRACK_RE = /^[A-Za-z0-9_.-]{1,64}$/;
function ttlbTracksMax() {
  const native = typeof Tracks !== "undefined" && Array.isArray(Tracks.LIST) ? Tracks.LIST.filter((t) => t && !t.custom).length : 0;
  const custom = typeof CustomTracks !== "undefined" && CustomTracks.LIMITS ? CustomTracks.LIMITS.items : 0;
  return Math.max(64, native + custom);
}
function collectJson(accept) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || !full.startsWith("apex26.")) continue;
      const k = full.slice(7);
      if (!accept(k)) continue;
      const raw = localStorage.getItem(full);
      if (raw !== null) { try { out[k] = JSON.parse(raw); } catch (_) {  } }
    }
  } catch (_) {  }
  const s = typeof GameStore !== "undefined" && GameStore.store;
  if (s && s.failedKeys && s.getStored) for (const f of s.failedKeys()) {
    if (f.lane !== "json" || !accept(f.key)) continue;
    if (!s._cache || typeof s._cache.has !== "function" || !s._cache.has("apex26." + f.key)) continue;
    try {
      const value = s.getStored(f.key);
      if (value === undefined) delete out[f.key];
      else out[f.key] = JSON.parse(JSON.stringify(value));
    } catch (_) {  }
  }
  return out;
}
function ttlbEntryKey(e) {
  return JSON.stringify({ t: e.t, teamId: e.teamId, code: e.code, name: e.name, ts: e.ts, context: e.context || null });
}
function ttlbParseBoard(b) {
  if (typeof GameStore !== "undefined" && GameStore.ttParseBoard) return GameStore.ttParseBoard(b);
  let laps = [];
  if (Array.isArray(b)) laps = b;
  else if (b && b.v === 2 && Array.isArray(b.laps)) {
    const cls = Array.isArray(b.classes) ? b.classes : [];
    laps = b.laps.map((e) => {
      if (!e || typeof e !== "object") return null;
      const o = {};
      for (const k of Object.keys(e)) if (k !== "c") o[k] = e[k];
      if (Number.isInteger(e.c) && cls[e.c]) o.context = cls[e.c];
      return o;
    });
  }
  return laps.filter((e) => e && Number.isFinite(e.t) && e.t > 0);
}
function collectTtlb() {
  const out = {};
  const boards = collectJson((k) => k.startsWith("ttlb.") && TTLB_TRACK_RE.test(k.slice(5)));
  for (const [k, raw] of Object.entries(boards)) {
    const laps = ttlbParseBoard(raw);
    if (laps.length) out[k.slice(5)] = laps;
  }
  return out;
}
function applyTtlb(bag) {
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return { applied: 0, skipped: 0, rejected: 0 };
  if (!GameStore || !GameStore.ttBoardAddResult || !GameStore.ttBoard) {
    return { applied: 0, skipped: 0, rejected: 0 };
  }
  const tracks = Object.keys(bag);
  const maxTracks = ttlbTracksMax(), maxLaps = maxTracks * 6 * 10;
  if (tracks.length > maxTracks) return { applied: 0, skipped: tracks.length, rejected: tracks.length };
  let applied = 0, skipped = 0, rejected = 0, failed = 0, lapsSeen = 0;
  for (const trackId of tracks) {
    if (!TTLB_TRACK_RE.test(trackId)) { skipped++; rejected++; continue; }
    const raw = bag[trackId];
    const laps = ttlbParseBoard(raw);
    const rawLen = Array.isArray(raw) ? raw.length : (raw && raw.laps && Array.isArray(raw.laps) ? raw.laps.length : 0);
    rejected += Math.max(0, rawLen - laps.length);
    const seen = new Set(GameStore.ttBoard(trackId).map(ttlbEntryKey));
    for (const lap of laps) {
      if (lapsSeen >= maxLaps) { skipped++; continue; }
      lapsSeen++;
      const k = ttlbEntryKey(lap);
      if (seen.has(k)) {
        if (GameStore.store.failedKeys().some((f) => f.key === "ttlb." + trackId)) {
          try { if (GameStore.ttBoardSaveResult(trackId).durable) applied++; else failed++; } catch (_) { failed++; }
        } else skipped++;
        continue;
      }
      try {
        const result = GameStore.ttBoardAddResult(trackId, lap);
        if (result.ok) seen.add(k);
        if (result.durable) applied++; else failed++;
      } catch (_) { failed++; }
    }
  }
  return { applied, skipped, rejected, failed };
}

const GARAGE_FORMAT = "apex26-garage-v1";
const GARAGE_PREFIXES = ["parts.", "livery.", "setup.", "setupPresets.", "careerSetup."];
const GARAGE_SINGLES = ["customTeam", "customLogo", "team", "driver"];
const GARAGE_EXCLUDED = "career and season saves, lap records, ghosts, settings, tuners, control bindings, accounts";
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
function isGarageKey(k) {
  if (GARAGE_SINGLES.indexOf(k) >= 0) return true;
  for (const p of GARAGE_PREFIXES) {
    if (k.indexOf(p) === 0) return ID_RE.test(k.slice(p.length));
  }
  return false;
}
function collectGarage() {
  const out = collectJson(isGarageKey);
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) {  }
  return { format: GARAGE_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: GARAGE_EXCLUDED, count: Object.keys(out).length, garage: out };
}

function typeOk(v, def, row) {
  if (row && row.table) return isObj(v);
  if (row && row.lane === "raw" && v !== null && typeof v === "object") return false;
  if (def === null || def === undefined) return true;
  if (typeof def === "object") return v !== null && typeof v === "object" && Array.isArray(v) === Array.isArray(def);
  return typeof v === typeof def;
}
function thisDesktop(G) {
  try { if (document.body.classList) return document.body.classList.contains("desktop"); } catch (_) {  }
  return G && G.gfx && typeof G.gfx.isMobile === "boolean" ? !G.gfx.isMobile : null;
}
function applySettings(file, G) {
  if (!file || file.format !== FORMAT) return { ok: false, reason: `not an ${FORMAT} file`, applied: 0, skipped: 0 };
  const isPlain = (o) => o !== null && typeof o === "object" && !Array.isArray(o);
  const groups = isPlain(file.settings) ? Object.assign({}, file.settings) : {};
  if (isPlain(groups.appearance) && Object.prototype.hasOwnProperty.call(groups.appearance, "motion")
      && (groups.a11y == null || isPlain(groups.a11y))
      && !(groups.a11y && Object.prototype.hasOwnProperty.call(groups.a11y, "motion"))) {
    groups.a11y = Object.assign({}, groups.a11y, { motion: groups.appearance.motion });
  }
  if (isPlain(groups.steering) && typeof SteerTuning !== "undefined" && SteerTuning.migrateValues) {
    groups.steering = SteerTuning.migrateValues(groups.steering.steerSchema, groups.steering);
  }
  const here = thisDesktop(G), there = isPlain(file.device) ? file.device.desktop : null;
  const crossDevice = typeof here === "boolean" && (typeof there !== "boolean" || here !== there);
  const writes = [];
  let skipped = 0;
  for (const row of SPEC) {
    if (row.info) continue;
    const g = groups[row.group];
    if (!isPlain(g) || !Object.prototype.hasOwnProperty.call(g, row.k)) continue;
    if (row.noImport || (crossDevice && (row.perDevice || row.deviceBound))) { if (g[row.k] !== null) skipped++; continue; }
    const v = row.normalize ? row.normalize(g[row.k]) : g[row.k];
    if (v === undefined) { skipped++; continue; }
    if (v === null && row.perDevice) continue;
    const def = defaultOf(row, G);
    if ((!row.freeShape && !typeOk(v, def, row)) || (row.oneOf && !(v === null && def === null) && !row.oneOf.includes(v))) { skipped++; continue; }
    writes.push([row, v]);
  }
  const stored = (k) => (GameStore.store.getStored ? GameStore.store.getStored(k) : GameStore.store.get(k, undefined));
  const before = writes.map(([row]) => [row, row.lane === "raw" ? GameStore.store.raw(`apex26.${row.k}`) : stored(row.k)]);
  let applied = 0, failed = 0;
  for (const [row, v] of writes) {
    try {
      let stored = true;
      if (row.lane === "raw") {
        if (v === null) stored = GameStore.store.rawDel(`apex26.${row.k}`) !== false;
        else stored = GameStore.store.rawSet(`apex26.${row.k}`, String(v)) !== false;
      } else {
        stored = GameStore.store.set(row.k, v === null ? undefined : v) !== false;
      }
      if (stored) applied++; else failed++;
    } catch (_) { failed++; }
  }
  if (failed) {
    for (const [row, prev] of before) {
      try {
        if (row.lane !== "raw") GameStore.store.set(row.k, prev);
        else if (prev === null || prev === undefined) GameStore.store.rawDel(`apex26.${row.k}`);
        else GameStore.store.rawSet(`apex26.${row.k}`, prev);
      } catch (_) {  }
    }
    return { ok: true, applied: 0, skipped, failed, rejectedTtlb: 0, reason: null };
  }
  const ttlb = applyTtlb(file.ttlb);
  applied += ttlb.applied;
  skipped += ttlb.skipped;
  failed += ttlb.failed || 0;
  return { ok: true, applied, skipped, failed, rejectedTtlb: ttlb.rejected || 0, reason: null };
}
const rgb3 = (a) => Array.isArray(a) && a.length >= 3 &&
  a.slice(0, 3).every((n) => typeof n === "number" && isFinite(n));
const clamp01 = (a) => a.slice(0, 3).map((n) => Math.min(1, Math.max(0, n)));
const GARAGE_MAX_BYTES = 1024 * 1024;
const GARAGE_STR_MAX = 64;
const GARAGE_LIVERIES_MAX = Math.floor(GARAGE_MAX_BYTES / 48);
const SETTINGS_MAX_BYTES = 1024 * 1024;
const CAREER_BAG_KEYS_MAX = 16;
const GARAGE_KEYS_MAX = 64;
const liveryKeysMax = () => (typeof Liveries !== "undefined" && Liveries.FIELDS ? Liveries.FIELDS.length : GARAGE_KEYS_MAX) + 32;
function liveryEnumOk(k, v) {
  if (typeof Teams !== "undefined" && Teams.liveryEnumOk) return Teams.liveryEnumOk(k, v);
  return typeof v === "string" && !(v in Object.prototype);
}
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
    return v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length <= 4096 ? v : undefined;
  }
  if (k === "customTeam") {
    const ok = v && typeof v === "object" && !Array.isArray(v)
      && Array.isArray(v.drivers) && v.drivers.length > 0;
    if (!ok) return undefined;
    return typeof Teams !== "undefined" && Teams.sanitizeCustom ? Teams.sanitizeCustom(v) : v;
  }
  if (k === "customLogo") {
    if (typeof v !== "string") return undefined;
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(v)) return undefined;
    if (v.length > 400000) return undefined;
    return v;
  }
  if (k === "team" || k === "driver") return Number.isInteger(v) && v >= 0 ? v : undefined;
  return undefined;
}
function applyGarage(file) {
  if (!file || file.format !== GARAGE_FORMAT) return { ok: false, reason: `not an ${GARAGE_FORMAT} file`, applied: 0, skipped: 0 };
  const g = file.garage || {};
  const prepared = {};
  let applied = 0, skipped = 0, failed = 0, droppedLiveries = 0, remappedLiveries = 0;
  for (const k of Object.keys(g)) {
    if (!isGarageKey(k)) { skipped++; continue; }
    const v = garageValue(k, g[k]);
    if (v === undefined) { skipped++; continue; }
    if (k.indexOf("livery.custom.") === 0 && Array.isArray(g[k])) droppedLiveries += g[k].length - v.length;
    prepared[k] = v;
  }
  for (const k of Object.keys(prepared)) {
    if (k.indexOf("livery.custom.") !== 0) continue;
    const teamId = k.slice("livery.custom.".length), selectedKey = "livery." + teamId;
    const hasImportedSelection = Object.prototype.hasOwnProperty.call(prepared, selectedKey);
    const normalized = CustomLiveries.normalizeImported(
      teamId, prepared[k], hasImportedSelection ? prepared[selectedKey] : undefined);
    prepared[k] = normalized.liveries;
    if (hasImportedSelection) prepared[selectedKey] = normalized.selectedId;
    else if (normalized.catalogAvailable) {
      prepared[selectedKey] = CustomLiveries.coherentImportedSelection(
        teamId, normalized.liveries, GameStore.store.get(selectedKey, "default"));
    }
    remappedLiveries += normalized.repaired;
  }
  for (const k of Object.keys(prepared)) {
    if (k.indexOf("livery.") !== 0 || k.indexOf("livery.custom.") === 0) continue;
    const teamId = k.slice("livery.".length), customKey = "livery.custom." + teamId;
    const customs = Object.prototype.hasOwnProperty.call(prepared, customKey)
      ? prepared[customKey] : GameStore.store.get(customKey, []);
    prepared[k] = CustomLiveries.coherentImportedSelection(teamId, customs, prepared[k]);
  }
  for (const k of Object.keys(prepared)) {
    try { if (GameStore.store.set(k, prepared[k]) !== false) applied++; else failed++; } catch (_) { failed++; }
  }
  const res = { ok: true, applied, skipped, failed, reason: null };
  if (droppedLiveries) { res.droppedLiveries = droppedLiveries; Log.warn("ui", "garage file: livery rows failed the shape check", { droppedLiveries }); }
  if (remappedLiveries) res.remappedLiveries = remappedLiveries;
  return res;
}
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
  } catch (_) {  }
  let failed = 0;
  for (const k of doomed) {
    try { if (GameStore.store.set(k, undefined) === false) failed++; } catch (_) { failed++; }
  }
  const result = applyGarage(GarageDefaults.file());
  result.failed = (result.failed || 0) + failed;
  return result;
}

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
  let copy = raw;
  try { copy = JSON.parse(JSON.stringify(raw)); } catch (_) { return null; }
  if (typeof GameStore !== "undefined" && GameStore.migrateCareer) return GameStore.migrateCareer(copy);
  return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : null;
}
function futureCareerSlot(raw, flavour) {
  if (typeof CareerBackup === "undefined") return false;
  return CareerBackup.validate({ format: CareerBackup.FORMAT,
    slots: [{ flavour, i: 0, data: { v: raw && raw.v } }] }).reason === "newer-version";
}
function poisonedCareerMoney(raw, flavour) {
  if (typeof CareerBackup === "undefined" || !raw || typeof raw !== "object"
      || !Object.prototype.hasOwnProperty.call(raw, "money")) return false;
  return CareerBackup.validate({ format: CareerBackup.FORMAT,
    slots: [{ flavour, i: 0, data: { money: raw.money } }] }).reason === "nan-money";
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
      const c = futureCareerSlot(raw, f) ? JSON.parse(JSON.stringify(raw)) : migrateSlot(raw);
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
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) {  }
  return { format: CAREER_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: CAREER_EXCLUDED, count: n, careers: out };
}
function careerReady() {
  if (typeof CareerBackup !== "undefined") return Promise.resolve(true);
  return typeof CareerUI !== "undefined" && CareerUI.ensureBackup ? CareerUI.ensureBackup() : Promise.resolve(false);
}
const loadCareer = (file, revisions) => careerReady().then(() => applyCareer(file,
  revisions && Object.keys(revisions.expectedRevisions).length ? revisions : undefined));
function careerRevisions() {
  const expectedRevisions = {};
  if (typeof CareerBackup !== "undefined") for (const f of CAREER_FLAVOURS) {
    for (let i = 0; i < CAREER_SLOT_N; i++) expectedRevisions[f + ":" + i] = CareerBackup.revisionOf(f, i);
  }
  const s = typeof GameStore !== "undefined" ? GameStore.store : null;
  return { expectedRevisions, expectedSelectionRevision: s && s.keyRevision ? s.keyRevision("careerSlot") : null };
}
async function applyCareer(file, revisions) {
  const refused = (reason) => ({ ok: false, reason, applied: 0, skipped: 0, failed: 0 });
  if (!file || file.format !== CAREER_FORMAT) return refused(`not an ${CAREER_FORMAT} file`);
  const bag = file.careers;
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return refused("invalid careers");
  if (Object.keys(bag).length > CAREER_BAG_KEYS_MAX) return refused("too many careers");
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
    const match = CAREER_SLOT_RE.exec(k);
    if (futureCareerSlot(bag[k], match[1])) return refused("newer-version");
    if (poisonedCareerMoney(bag[k], match[1])) { skipped++; continue; }
    const c = migrateSlot(bag[k]);
    if (!c) { skipped++; continue; }
    slots.push({ flavour: match[1], i: Number(match[2]), data: c });
  }
  if (!slots.length && liveSlot == null) return { ok: true, applied: 0, skipped, failed: 0, reason: null };
  const r = await CareerBackup.applyWithUndo({ format: CareerBackup.FORMAT, slots },
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

const ARM_MS = 4000;
let _ui = null;
function create(G) {
  const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  let picker = null;
  let armed = null;
  let armT = 0;
  let leaveSubscribed = false;
  let pickVersion = 0;
  let reloading = false;

  function pick(onJson, maxBytes) {
    const chooserVersion = ++pickVersion;
    if (!picker) {
      picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "application/json,.json";
      picker.hidden = true;
      document.body.appendChild(picker);
    }
    picker.onchange = () => {
      if (reloading || chooserVersion !== pickVersion) return;
      const version = ++pickVersion;
      const f = picker.files && picker.files[0];
      if (!f) return;
      const done = (text) => {
        if (version !== pickVersion) return;
        let obj = null;
        try { obj = JSON.parse(text); } catch (_) { obj = null; }
        onJson(obj);
      };
      const fail = (why) => { if (version === pickVersion) onJson(null, why === "big" ? "big" : "read"); };
      if (maxBytes && f.size > maxBytes) { fail("big"); return; }
      if (typeof f.text === "function") f.text().then(done, fail);
      else { const r = new FileReader(); r.onload = () => done(String(r.result || "")); r.onerror = fail; r.readAsText(f); }
    };
    picker.value = "";
    picker.click();
  }

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
        let file = make();
        if (file && typeof file.then === "function") file = await file;
        await download(file, name(file));
        const n = file.changed ? `${file.changed.length} changed` : `${file.count} keys`;
        flash(b, label, `SAVED (${n})`);
        Log.info("ui", "file saved", { id, n });
      } catch (e) {
        flash(b, label, typeof NativeDownload !== "undefined" && NativeDownload.isCancelled(e) ? "CANCELLED" : "FAILED");
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
      const loaded = (r) => {
        if (!r || !r.ok) { flash(b, label, String((r && r.reason) || "REFUSED").toUpperCase(), 2600); return; }
        Log.info("ui", "file loaded", { id, applied: r.applied, skipped: r.skipped, failed: r.failed });
        if (r.failed) { flash(b, label, `STORAGE FULL — ${r.failed} NOT SAVED${r.applied ? "" : ", NOTHING CHANGED"}`, 3200); return; }
        if (!r.applied) { flash(b, label, "NOTHING TO LOAD", 2200); return; }
        b.textContent = `${label} — ${r.applied} APPLIED${r.skipped ? `, ${r.skipped} SKIPPED` : ""}${r.droppedLiveries ? `, ${r.droppedLiveries} LIVERIES SKIPPED` : ""}, RELOADING…`;
        reloading = true; b.disabled = true;
        setTimeout(() => { try { location.reload(); } catch (_) {  } }, 600);
      };
      pick((obj, why) => {
        if (!obj) { flash(b, label, why === "big" ? "FILE TOO LARGE" : "NOT A JSON FILE", 2200); return; }
        let r;
        const threw = (e) => { Log.warn("ui", "file load threw", e && e.message); return null; };
        try { r = apply(obj, revisions); } catch (e) { r = threw(e); }
        if (r && typeof r.then === "function") r.then(loaded, (e) => loaded(threw(e)));
        else loaded(r);
      }, maxBytes);
      tick();
    };
    return b;
  };

  function mount() {
    const host = document.getElementById("pm-panel-files");
    if (!host || document.getElementById("pm-settings-file")) return;
    careerReady();
    if (!leaveSubscribed && typeof SettingsNav !== "undefined" && SettingsNav.onLeave) {
      SettingsNav.onLeave((page) => { if (page === "files") { disarm(); ++pickVersion; } });
      leaveSubscribed = true;
    }
    const h = document.createElement("h3");
    h.className = "pm-group-h";
    h.id = "pm-settings-file";
    h.textContent = "SAVES & DATA";
    const note = document.createElement("p");
    note.className = "adv-help";
    note.setAttribute("data-help", "keep");
    note.id = "pm-settings-file-scope";
    note.textContent = "SAVE ALL SETTINGS includes preferences, appearance profiles, tuners and control bindings. SAVE CHANGED SETTINGS includes only preference differences from defaults. Both files also include saved time-trial leaderboards when present; loading merges those boards with yours and keeps the best laps. LOAD SETTINGS FILE asks twice, then reloads. Neither file is a complete game backup: garage builds, career and season progress, photos, personal background images, ghosts, replays, daily progress, accounts and network credentials are not included.";
    const otherFiles = document.createElement("p");
    otherFiles.id = "pm-other-save-files";
    otherFiles.className = "adv-help";
    otherFiles.setAttribute("data-help", "keep");
    otherFiles.textContent = "Separate backups: GARAGE → TEAM → SAVE GARAGE FILE saves parts, setups, liveries and your team. CAREER → CAREER MODES → SAVE CAREER FILE saves all six career slots. The same separate file controls are on the Save and Restore pages here. LOAD asks twice and replaces only the corresponding data, then reloads. Settings, garage and career remain separate files. Photos, personal backgrounds, ghosts, replays and accounts are not included in these backups. STORAGE HEALTH & RESTORE POINTS below reports browser storage and local career history; local history is not an exported backup.";

    const shareNote = document.createElement("p");
    shareNote.id = "pm-share-code-help";
    shareNote.className = "adv-help";
    shareNote.setAttribute("data-help", "keep");
    shareNote.textContent = "Paste a shared setup, livery or daily challenge code or link. Your previous setup or livery is kept after an import: paste UNDO here to restore it. Ghost recording codes and links are imported separately.";
    const shareIn = document.createElement("textarea");
    shareIn.id = "pm-share-code-in";
    shareIn.className = "sel-chip";
    shareIn.rows = 2;
    shareIn.spellcheck = false;
    shareIn.autocomplete = "off";
    shareIn.placeholder = "Paste a shared setup, livery or challenge";
    shareIn.setAttribute("aria-label", "Share code");
    shareIn.setAttribute("aria-describedby", "pm-share-code-help pm-share-code-status");
    const shareStatus = document.createElement("p");
    shareStatus.id = "pm-share-code-status";
    shareStatus.className = "adv-help";
    shareStatus.setAttribute("data-help", "keep");
    shareStatus.setAttribute("role", "status");
    shareStatus.setAttribute("aria-live", "polite");
    shareStatus.setAttribute("aria-atomic", "true");
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.id = "pm-share-code-import";
    shareBtn.className = "sel-chip";
    shareBtn.textContent = "IMPORT SHARE CODE";
    shareBtn.onclick = () => {
      if (typeof ShareCode === "undefined") { shareStatus.textContent = "Share codes are unavailable. Reload the page and try again."; return; }
      const started = { n: 0 };
      const decoded = ShareCode.decode(shareIn.value);
      if (!decoded.ok) {
        shareStatus.textContent = ShareCode.messageFor(decoded);
        return;
      }
      const applied = ShareCode.apply(decoded, {
        store: G.store,
        startRace: () => { started.n++; },
        selectTeam: (teamId) => {
          const ti = Teams.LIST.findIndex((t) => t.id === teamId);
          if (ti >= 0) G.teamIdx = ti;
        },
        openGarage: (from) => { if (G.openGarage) { if (G.closeSettings) G.closeSettings(); G.openGarage(from || "share"); } },
        openDaily: () => { if (G.openDailyPicker) { if (G.closeSettings) G.closeSettings(); G.openDailyPicker(); } },
      });
      shareStatus.textContent = ShareCode.messageFor(started.n ? { ok: false } : applied);
    };

    const nav = document.createElement("div");
    nav.id = "pm-files-nav";
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Backup actions");
    const sections = [], choices = [];
    const selectSection = (index) => {
      disarm();
      sections.forEach((section, i) => { section.hidden = i !== index; });
      choices.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    };
    for (const [id, label] of [["save", "Save"], ["restore", "Restore"], ["share", "Import share code"]]) {
      const section = document.createElement("section");
      section.id = "pm-files-" + id;
      const button = document.createElement("button");
      button.id = "pm-files-show-" + id;
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-controls", section.id);
      section.setAttribute("aria-labelledby", button.id);
      const index = sections.length;
      button.onclick = () => selectSection(index);
      sections.push(section); choices.push(button); nav.append(button);
    }
    const groupHead = (text) => {
      const head = document.createElement("h4");
      head.className = "pm-group-h"; head.textContent = text;
      return head;
    };
    const saveHelp = document.createElement("p");
    saveHelp.className = "adv-help";
    saveHelp.textContent = "Save all settings for a backup, or just your changes to share a smaller file.";
    sections[0].append(saveHelp,
      saveBtn("pm-settings-changed", "SAVE CHANGED SETTINGS",
        "Changed preferences plus saved time-trial leaderboards, when present. This is not a full game backup.",
        () => collect("changes", G), () => `apex26-settings-changes-${stamp()}.json`),
      saveBtn("pm-settings-all", "SAVE ALL SETTINGS",
        "All exportable preferences plus saved time-trial leaderboards, when present. This is not a full game backup.",
        () => collect("all", G), () => `apex26-settings-all-${stamp()}.json`),
      groupHead("GARAGE FILE"),
      saveBtn("pm-garage-save", "SAVE GARAGE FILE", "Parts, setups, liveries and your team. Career progress and settings are excluded.",
        collectGarage, () => `apex26-garage-${stamp()}.json`),
      groupHead("CAREER FILE"),
      saveBtn("pm-career-save", "SAVE CAREER FILE", "All six career slots and the active slot. Settings and garage builds are excluded.",
        () => careerReady().then(collectCareer), () => `apex26-career-${stamp()}.json`));
    const restoreHelp = document.createElement("p");
    restoreHelp.className = "adv-help";
    restoreHelp.setAttribute("data-help", "keep");
    restoreHelp.textContent = "Replace settings, garage or career data from a saved file. Press Load twice to confirm, then choose the file. Each file replaces only its own data and the game reloads after applying it; best laps are merged.";
    sections[1].append(restoreHelp,
      loadBtn("pm-settings-load", "LOAD SETTINGS FILE",
        "Read an apex26-settings file back in. Only allowlisted keys are written; the garage, career and accounts are never touched.",
        (obj) => applySettings(obj, G), "SETTINGS", null, SETTINGS_MAX_BYTES),
      groupHead("GARAGE FILE"),
      loadBtn("pm-garage-load", "LOAD GARAGE FILE", "Replace garage data only. Settings and career saves are kept.",
        applyGarage, "THE GARAGE", null, GARAGE_MAX_BYTES),
      groupHead("CAREER FILE"),
      loadBtn("pm-career-load", "LOAD CAREER FILE", "Replace career slots only, with protection against changes made after confirmation.",
        loadCareer, "CAREER SAVES", careerRevisions,
        typeof CareerBackup !== "undefined" ? CareerBackup.MAX_BYTES : 5 * 1024 * 1024));
    sections[2].append(shareNote, shareIn, shareBtn, shareStatus);
    const scope = document.createElement("details");
    scope.id = "pm-files-included";
    const summary = document.createElement("summary");
    summary.textContent = "What is included in each backup?";
    scope.append(summary, note, otherFiles);
    const exclusions = document.createElement("p");
    exclusions.className = "adv-help";
    exclusions.setAttribute("data-help", "keep");
    exclusions.textContent = "Settings, garage and career are separate files. Photos, background images, ghosts, replays and accounts are excluded.";
    selectSection(0);
    host.append(h, nav, ...sections, exclusions, scope);
    if (typeof SaveHealth !== "undefined" && SaveHealth.mount) SaveHealth.mount(host);
  }

  function garageRow() {
    if (typeof document === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.id = "cs-garage-file";
    wrap.className = "sel-edit-row";
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
      if (!r.ok) { flash(resetBtn, resetLabel, String((r && r.reason) || "REFUSED").toUpperCase(), 2600); return; }
      Log.info("ui", "garage reset to shipped defaults", { applied: r.applied, skipped: r.skipped, failed: r.failed });
      if (r.failed) { flash(resetBtn, resetLabel, `STORAGE FULL — ${r.failed} NOT SAVED`, 3200); return; }
      if (!r.applied) { flash(resetBtn, resetLabel, "NOTHING TO RESET", 2200); return; }
      resetBtn.textContent = `${resetLabel} — ${r.applied} APPLIED, RELOADING…`;
      reloading = true; resetBtn.disabled = true;
      setTimeout(() => { try { location.reload(); } catch (_) {  } }, 600);
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
        applyCareer, "CAREER SAVES", careerRevisions,
        typeof CareerBackup !== "undefined" ? CareerBackup.MAX_BYTES : 5 * 1024 * 1024));
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
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(mount) : mount()), { once: true });
  else mount();
  Log.info("ui", "SettingsExport.create");
  _ui = { collect: (mode) => collect(mode, G), collectGarage, collectCareer,
          applySettings: (o) => applySettings(o, G), applyGarage, applyCareer, resetGarage,
          garageRow, careerRow, mount };
  return _ui;
}

function ensureMounted() { if (_ui && typeof _ui.mount === "function") _ui.mount(); }

return { FORMAT, GARAGE_FORMAT, CAREER_FORMAT, SPEC, collect, collectGarage, collectCareer, collectTtlb, ttlbParseBoard,
         applySettings, applyGarage, applyCareer, applyTtlb, resetGarage, isGarageKey, isCareerKey, garageValue, create,
         ensureMounted, mount: ensureMounted,
         garageRow: () => (_ui && _ui.garageRow ? _ui.garageRow() : null),
         careerRow: () => (_ui && _ui.careerRow ? _ui.careerRow() : null) };
})();
Object.freeze(SettingsExport);
