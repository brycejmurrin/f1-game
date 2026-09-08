/* Apex 26 — SettingsExport: the SETTINGS FILE buttons in SETTINGS › DISPLAY ›
   RENDERER. SAVE CHANGED SETTINGS downloads a JSON file of every preference
   that differs from the shipped default; SAVE ALL SETTINGS downloads every
   preference with its effective value. The point of the file is to be handed
   to whoever tunes the defaults: each changed key carries the default it
   replaced and the source file that owns that default, so "make my settings
   the defaults" is a list of edits, not a hunt.

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
const SPEC = [
  // MUSIC & SOUND (js/audio/panel.js)
  { k: "sound", lane: "json", group: "audio", def: true, src: "js/game.js" },
  { k: "sfx", lane: "json", group: "audio", def: true, src: "js/audio/panel.js" },
  { k: "music", lane: "json", group: "audio", def: true, src: "js/game.js" },
  { k: "volMusic", lane: "json", group: "audio", def: 0.5, src: "js/audio/panel.js" },
  { k: "volSfx", lane: "json", group: "audio", def: 1, src: "js/audio/panel.js" },
  { k: "musicSource", lane: "json", group: "audio", def: "all", src: "js/audio/panel.js" },
  { k: "sndProfile", lane: "json", group: "audio", def: "team", src: "js/audio/panel.js" },
  { k: "sndTune", lane: "json", group: "audio", def: () => (typeof GameAudio !== "undefined" && GameAudio.tuneDefaults) ? GameAudio.tuneDefaults() : {}, src: "js/audio/engine.js TUNE_DEF" },
  { k: "sndLayers", lane: "json", group: "audio", def: () => (typeof GameAudio !== "undefined" && GameAudio.layerDefaults) ? GameAudio.layerDefaults() : {}, src: "js/audio/engine.js LAYER_DEF" },
  // DISPLAY (js/ui/scale.js, js/perf/quality-preset.js, js/perf/renderer-picker.js)
  { k: "uiScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = 100%)" },
  { k: "hudScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = 100%)" },
  { k: "hudBtnScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js (null = follows hudScale)" },
  { k: "resMode", lane: "json", group: "display", def: "auto", src: "js/ui/scale.js" },
  { k: "gfxPreset", lane: "json", group: "display", def: (G) => (typeof GfxQuality !== "undefined" && GfxQuality.defaultId) ? GfxQuality.defaultId(!!(G && G.gfx && G.gfx.isMobile)) : "high", src: "js/perf/quality-preset.js defaultId" },
  { k: "gfxHigh", lane: "raw", group: "display", def: null, src: "js/perf/quality-preset.js (legacy mobile tier)" },
  { k: "gfxBackend", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js (null = webgl2)" },
  { k: "tlxForceGL", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js (null = AUTO)" },
  // HUD (js/game.js)
  { k: "hudProfile", lane: "json", group: "hud", def: "standard", src: "js/game.js" },
  { k: "hudMetricsLayout", lane: "json", group: "hud", def: "auto", src: "js/game.js" },
  { k: "hudMapVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudGapsVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  // CAMERA (js/camera/mode-switch.js, offsets.js, cockpit-opts.js)
  { k: "camMode", lane: "json", group: "camera", def: 0, src: "js/camera/mode-switch.js (index into CAM_MODES)" },
  { k: "camTune", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js CAM_TUNE_DEFS (every def 0; the file holds {mode:{knob:value}} edits)" },
  { k: "cockpitHalo", lane: "raw", group: "camera", def: "0", src: "js/camera/cockpit-opts.js" },
  { k: "cockpitTurnChaseLead", lane: "raw", group: "camera", def: "0.35", src: "js/camera/cockpit-opts.js LEAD_DEFAULT" },
  // LIGHTING TUNER (js/lighting)
  { k: "lightTune", lane: "json", group: "lighting", def: {}, src: "js/lighting/knobs.js TUNE_DEFS (the file holds {\"track|tod|weather\":{knob:value}} edits)" },
  // DRIVING / RACE RULES (js/game.js, js/race/race-control.js)
  { k: "steerMode", lane: "json", group: "driving", def: "tilt", src: "js/game.js" },
  { k: "manual", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "aeroMode", lane: "json", group: "driving", def: "manual", src: "js/game.js" },
  { k: "drivingLine", lane: "json", group: "driving", def: "full", src: "js/game.js" },
  { k: "difficulty", lane: "json", group: "driving", def: "normal", src: "js/game.js" },
  { k: "raceGrid", lane: "json", group: "driving", def: "tier", src: "js/game.js" },
  { k: "reliability", lane: "json", group: "driving", def: "off", src: "js/game.js" },
  { k: "caution", lane: "json", group: "driving", def: true, src: "js/race/race-control.js" },
  { k: "unlimitedBudget", lane: "json", group: "driving", def: false, src: "js/game.js" },
  { k: "bodyAttitude", lane: "raw", group: "driving", def: null, src: "js/physics/body-attitude.js (null = on)" },
  // STEERING (js/input/steer-tuning.js applySteerTuning)
  { k: "preset", lane: "json", group: "steering", def: "standard", src: "js/input/steer-tuning.js" },
  { k: "steerRate", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "steerExpo", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "steerSmooth", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "tiltDeg", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "steerLock", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "steerSpeed", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "carWeight", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "adaptiveButtons", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "brakeCue", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "drivingHelp", lane: "json", group: "steering", def: 1, src: "js/input/steer-tuning.js (1 = OFF)" },
  { k: "pace", lane: "json", group: "steering", def: 11, src: "js/input/steer-tuning.js PACE_DEF" },
  { k: "raceLine", lane: "json", group: "steering", def: 0, src: "js/input/steer-tuning.js" },
  { k: "steerSchema", lane: "json", group: "steering", def: 1, info: true, src: "js/input/steer-tuning.js STEER_SCHEMA (migration version — boot writes the current one, so never a change)" },
  // CONTROLS (js/input/input.js tables, js/ui/key-binds.js)
  { k: "keys", lane: "json", group: "controls", def: null, src: "js/input/input.js KEY_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.keysAreDefault && Input.keysAreDefault()) },
  { k: "pad", lane: "json", group: "controls", def: null, src: "js/input/input.js PAD_ACTIONS", changed: () => !(typeof Input !== "undefined" && Input.padsAreDefault && Input.padsAreDefault()) },
  // METRICS PANEL (js/perf/metrics-overlay.js)
  { k: "metrics", lane: "raw", group: "metrics", def: null, src: "js/perf/metrics-overlay.js (null = off)" },
  { k: "metricsPage", lane: "raw", group: "metrics", def: "gov", src: "js/perf/metrics-overlay.js" },
  { k: "metricsPos", lane: "raw", group: "metrics", def: "auto", src: "js/perf/metrics-overlay.js" },
  { k: "metricsSize", lane: "raw", group: "metrics", def: "s", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogNs", lane: "raw", group: "metrics", def: "*", src: "js/perf/metrics-overlay.js" },
  { k: "metricsLogLvl", lane: "raw", group: "metrics", def: "warn", src: "js/perf/metrics-overlay.js" },
];

const EXCLUDED = "garage (parts, liveries, setup sheets, MY TEAM), saves (career, season, leaderboards, ghosts, daily challenge), accounts and network (Spotify, TURN, relays), renderer self-heal latches, developer flags";

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
function defaultOf(row, G) { return typeof row.def === "function" ? row.def(G) : row.def; }

// collect(mode, G) → the file's object. mode "changes" (default) lists only
// what differs from the shipped default; "all" lists every key's effective
// value (stored, else the default). Both carry `changed`, the dotted names of
// the keys that differ, and for those the default replaced and its source.
function collect(mode, G) {
  const all = mode === "all";
  const settings = {}, defaults = {}, where = {}, changed = [];
  for (const row of SPEC) {
    const stored = readStored(row);
    const def = defaultOf(row, G);
    const has = stored !== null;
    let diff = has && !row.info && (row.changed ? row.changed(stored) : !same(stored, def));
    let value = has ? stored : def;
    if (diff && isObj(stored) && isObj(def) && Object.keys(def).length) {
      value = objDiff(stored, def);
      if (!Object.keys(value).length) diff = false;
    }
    if (!diff && !all) continue;
    (settings[row.group] ||= {})[row.k] = value;
    if (diff) {
      const name = row.group + "." + row.k;
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

function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

// The buttons join the RENDERER fold (#pm-display-adv-body), after the
// controls RendererPicker injects there — the fold that already holds SAVE
// SCREENSHOT and COPY DIAG, the other two "hand a file out" buttons. Injected
// on DOMContentLoaded like those, so the order in the fold is stable.
function create(G) {
  const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  function mount() {
    const host = document.getElementById("pm-display-adv-body");
    if (!host || document.getElementById("pm-settings-file")) return;
    const h = document.createElement("h3");
    h.className = "pm-group-h";
    h.id = "pm-settings-file";
    h.textContent = "SETTINGS FILE";
    const note = document.createElement("p");
    note.className = "adv-help";
    note.textContent = "Downloads a JSON file of your preferences, tuners and control bindings — nothing from the garage, career or accounts. CHANGED lists only what differs from the shipped defaults, with the default each one replaced.";
    const btn = (id, label, mode) => {
      const b = document.createElement("button");
      b.id = id; b.type = "button"; b.textContent = label;
      b.title = mode === "all" ? "Every setting with its current value." : "Only the settings that differ from the defaults, each with the default it replaced and where that default lives.";
      b.onclick = () => {
        let out;
        try {
          const file = collect(mode, G);
          download(file, "apex26-settings-" + mode + "-" + stamp() + ".json");
          out = label + " — SAVED (" + file.changed.length + " changed)";
          Log.info("ui", "settings file", { mode, changed: file.changed.length });
        } catch (e) {
          out = label + " — FAILED";
          Log.warn("ui", "settings file failed", e && e.message);
        }
        tick();
        b.textContent = out;
        setTimeout(() => { b.textContent = label; }, 1600);
      };
      return b;
    };
    host.append(h, btn("pm-settings-changed", "SAVE CHANGED SETTINGS", "changes"), btn("pm-settings-all", "SAVE ALL SETTINGS", "all"), note);
  }
  if (typeof document === "undefined") return { collect: (mode) => collect(mode, G) };
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  Log.info("ui", "SettingsExport.create");
  return { collect: (mode) => collect(mode, G), mount };
}

return { FORMAT, SPEC, collect, create };
})();
