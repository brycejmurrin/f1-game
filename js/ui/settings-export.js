/* Apex 26 — SettingsExport: the FILES section of SETTINGS › DISPLAY › RENDERER,
   which carries a player's state OUT of the browser and back IN. TWO files,
   deliberately separate:

     SETTINGS  preferences, tuners and control bindings — how you like the game
               to behave. CHANGED lists only what differs from the shipped
               default, each with the default it replaced and the source file
               that owns it, so "make my settings the defaults" is a list of
               edits rather than a hunt; ALL lists every key's effective value.
     GARAGE    parts, liveries, setup sheets and an invented team — what you
               BUILT. A new phone wants the first file; a friend wants the
               second.

   Loading either one overwrites what is stored and reloads the page, so the
   button asks twice. Neither file carries career or season saves, lap records,
   ghosts, or anything account-shaped, in either direction.

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
  { k: "volMusic", lane: "json", group: "audio", def: 0.9, src: "js/audio/panel.js" },
  { k: "volSfx", lane: "json", group: "audio", def: 0.7, src: "js/audio/panel.js" },
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
  { k: "hudScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = 100%, or 124% on touch)" },
  { k: "hudBtnScale", lane: "json", group: "display", def: null, src: "js/ui/scale.js + css/tokens.css (null = follows hudScale)" },
  { k: "resMode", lane: "json", group: "display", def: (G) => (G && G.gfx && G.gfx.isMobile) ? "low" : "auto", src: "js/ui/scale.js (LOW on a touch device)" },
  { k: "gfxPreset", lane: "json", group: "display", def: (G) => (typeof GfxQuality !== "undefined" && GfxQuality.defaultId) ? GfxQuality.defaultId(!!(G && G.gfx && G.gfx.isMobile)) : "high", src: "js/perf/quality-preset.js defaultId" },
  { k: "gfxHigh", lane: "raw", group: "display", def: null, src: "js/perf/quality-preset.js (legacy mobile tier)" },
  { k: "gfxBackend", lane: "raw", group: "display", def: (G) => (G && G.gfx && G.gfx.isMobile) ? "three" : null, src: "js/perf/renderer-picker.js defaultBackend (unset = three on a touch device, else webgl2)" },
  { k: "tlxForceGL", lane: "raw", group: "display", def: null, src: "js/perf/renderer-picker.js (null = AUTO)" },
  // HUD (js/game.js)
  { k: "hudProfile", lane: "json", group: "hud", def: "standard", src: "js/game.js" },
  { k: "hudMetricsLayout", lane: "json", group: "hud", def: "full", src: "js/game.js" },
  { k: "hudMapVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  { k: "hudGapsVis", lane: "json", group: "hud", def: "on", src: "js/game.js" },
  // CAMERA (js/camera/mode-switch.js, offsets.js, cockpit-opts.js)
  { k: "camMode", lane: "json", group: "camera", def: 3, src: "js/camera/mode-switch.js (index into CAM_MODES)" },
  { k: "camTune", lane: "json", group: "camera", def: {}, src: "js/camera/offsets.js CAM_TUNE_DEFS (every def 0; the file holds {mode:{knob:value}} edits)" },
  { k: "cockpitHalo", lane: "raw", group: "camera", def: "1", src: "js/camera/cockpit-opts.js" },
  { k: "cockpitTurnChaseLead", lane: "raw", group: "camera", def: "0.4", src: "js/camera/cockpit-opts.js LEAD_DEFAULT" },
  // LIGHTING TUNER (js/lighting)
  { k: "lightTune", lane: "json", group: "lighting", def: {}, src: "js/lighting/knobs.js TUNE_DEFS (the file holds {\"track|tod|weather\":{knob:value}} edits)" },
  // DRIVING / RACE RULES (js/game.js, js/race/race-control.js)
  { k: "steerMode", lane: "json", group: "driving", def: "buttons", src: "js/game.js" },
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
  { k: "steerRate", lane: "json", group: "steering", def: 2, src: "js/input/steer-tuning.js" },
  { k: "steerExpo", lane: "json", group: "steering", def: 6, src: "js/input/steer-tuning.js" },
  { k: "steerSmooth", lane: "json", group: "steering", def: 3, src: "js/input/steer-tuning.js" },
  { k: "tiltDeg", lane: "json", group: "steering", def: 8, src: "js/input/steer-tuning.js" },
  { k: "steerLock", lane: "json", group: "steering", def: 7, src: "js/input/steer-tuning.js" },
  { k: "steerSpeed", lane: "json", group: "steering", def: 7, src: "js/input/steer-tuning.js" },
  { k: "carWeight", lane: "json", group: "steering", def: 10, src: "js/input/steer-tuning.js" },
  { k: "adaptiveButtons", lane: "json", group: "steering", def: 5, src: "js/input/steer-tuning.js" },
  { k: "brakeCue", lane: "json", group: "steering", def: 4, src: "js/input/steer-tuning.js" },
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

// ── THE GARAGE FILE ─────────────────────────────────────────────────────────
// A SECOND file, deliberately not part of the settings one: the garage is what
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

// ── READING A FILE BACK IN ──────────────────────────────────────────────────
// Both loaders answer {ok, applied, skipped, reason}. They are deliberately
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
  if (!file || file.format !== FORMAT) return { ok: false, reason: "not an " + FORMAT + " file", applied: 0, skipped: 0 };
  const groups = file.settings || {};
  let applied = 0, skipped = 0;
  for (const row of SPEC) {
    // A migration VERSION is context in the file and must never be written
    // back: an older number would re-run migrations that have already run.
    if (row.info) continue;
    const g = groups[row.group];
    if (!g || !Object.prototype.hasOwnProperty.call(g, row.k)) continue;
    const v = g[row.k];
    if (!typeOk(v, defaultOf(row, G))) { skipped++; continue; }
    try {
      if (row.lane === "raw") {
        if (v === null) GameStore.store.rawDel("apex26." + row.k);
        else GameStore.store.rawSet("apex26." + row.k, String(v));
      } else {
        GameStore.store.set(row.k, v);
      }
      applied++;
    } catch (_) { skipped++; }
  }
  return { ok: true, applied, skipped, reason: null };
}
function applyGarage(file) {
  if (!file || file.format !== GARAGE_FORMAT) return { ok: false, reason: "not an " + GARAGE_FORMAT + " file", applied: 0, skipped: 0 };
  const g = file.garage || {};
  let applied = 0, skipped = 0;
  for (const k of Object.keys(g)) {
    if (!isGarageKey(k)) { skipped++; continue; }
    try { GameStore.store.set(k, g[k]); applied++; } catch (_) { skipped++; }
  }
  return { ok: true, applied, skipped, reason: null };
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

// The buttons join the RENDERER fold (#pm-display-adv-body), after the controls
// RendererPicker injects there — the fold that already holds SAVE SCREENSHOT
// and COPY DIAG, the other "hand a file out" buttons. Injected on
// DOMContentLoaded like those, so the order in the fold is stable.
//
// FIVE buttons, two files. Saving is one tap. LOADING IS TWO: it overwrites
// what is already stored and then reloads the page, which is not something a
// mis-tap should do, so the first tap arms and says so and the second commits.
// The arm clears itself after ARM_MS, and arming either loader disarms the
// other.
const ARM_MS = 4000;
function create(G) {
  const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  let picker = null, armed = null, armT = 0;

  // ONE hidden <input type="file">, retargeted per use: iOS re-uses the sheet
  // and a second input would open a second one. `value = ""` before every click so
  // choosing the SAME file twice still fires change.
  function pick(onJson) {
    if (!picker) {
      picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "application/json,.json";
      picker.hidden = true;
      document.body.appendChild(picker);
    }
    picker.onchange = () => {
      const f = picker.files && picker.files[0];
      if (!f) return;
      const done = (text) => {
        let obj = null;
        try { obj = JSON.parse(text); } catch (_) { obj = null; }
        onJson(obj);
      };
      if (typeof f.text === "function") f.text().then(done, () => onJson(null));
      else { const r = new FileReader(); r.onload = () => done(String(r.result || "")); r.onerror = () => onJson(null); r.readAsText(f); }
    };
    picker.value = "";
    picker.click();
  }

  function mount() {
    const host = document.getElementById("pm-display-adv-body");
    if (!host || document.getElementById("pm-settings-file")) return;
    const h = document.createElement("h3");
    h.className = "pm-group-h";
    h.id = "pm-settings-file";
    h.textContent = "FILES";
    const note = document.createElement("p");
    note.className = "adv-help";
    note.textContent = "SETTINGS carries your preferences, tuners and control bindings; GARAGE carries parts, liveries, setups and your own team. Neither carries career, lap records or accounts. CHANGED lists only what differs from the shipped defaults, with the default each one replaced. LOAD asks twice, then reloads.";

    const flash = (b, label, msg, ms) => { b.textContent = label + " — " + msg; setTimeout(() => { b.textContent = label; }, ms || 1800); };
    const disarm = () => { if (armed) { armed.el.textContent = armed.label; armed = null; } clearTimeout(armT); };

    const saveBtn = (id, label, title, make, name) => {
      const b = document.createElement("button");
      b.id = id; b.type = "button"; b.textContent = label; b.title = title;
      b.onclick = () => {
        disarm();
        try {
          const file = make();
          download(file, name(file));
          const n = file.changed ? file.changed.length + " changed" : file.count + " keys";
          flash(b, label, "SAVED (" + n + ")");
          Log.info("ui", "file saved", { id, n });
        } catch (e) {
          flash(b, label, "FAILED");
          Log.warn("ui", "file save failed", e && e.message);
        }
        tick();
      };
      return b;
    };
    const loadBtn = (id, label, title, apply, what) => {
      const b = document.createElement("button");
      b.id = id; b.type = "button"; b.textContent = label; b.title = title;
      b.onclick = () => {
        if (!armed || armed.el !== b) {
          disarm();
          armed = { el: b, label };
          b.textContent = label + " — OVERWRITE " + what + "?";
          armT = setTimeout(disarm, ARM_MS);
          tick();
          return;
        }
        disarm();
        pick((obj) => {
          if (!obj) { flash(b, label, "NOT A JSON FILE", 2200); return; }
          const r = apply(obj);
          if (!r.ok) { flash(b, label, String(r.reason || "REFUSED").toUpperCase(), 2600); return; }
          Log.info("ui", "file loaded", { id, applied: r.applied, skipped: r.skipped });
          // A reload is the honest way to apply this: half these values are read
          // once at boot (the backend pick, the grid, every tuner's first
          // paint), so re-reading them without one would leave the page showing
          // a mix of old and new.
          b.textContent = label + " — " + r.applied + " APPLIED, RELOADING…";
          setTimeout(() => { try { location.reload(); } catch (_) { /* file:// */ } }, 600);
        });
        tick();
      };
      return b;
    };

    host.append(h,
      saveBtn("pm-settings-changed", "SAVE CHANGED SETTINGS",
        "Only the settings that differ from the defaults, each with the default it replaced and where that default lives.",
        () => collect("changes", G), () => "apex26-settings-changes-" + stamp() + ".json"),
      saveBtn("pm-settings-all", "SAVE ALL SETTINGS",
        "Every setting with its current value.",
        () => collect("all", G), () => "apex26-settings-all-" + stamp() + ".json"),
      loadBtn("pm-settings-load", "LOAD SETTINGS FILE",
        "Read an apex26-settings file back in. Only allowlisted keys are written; the garage, career and accounts are never touched.",
        (obj) => applySettings(obj, G), "SETTINGS"),
      saveBtn("pm-garage-save", "SAVE GARAGE FILE",
        "Parts, liveries, setup sheets and your own team, for every team.",
        collectGarage, () => "apex26-garage-" + stamp() + ".json"),
      loadBtn("pm-garage-load", "LOAD GARAGE FILE",
        "Read an apex26-garage file back in. Career money, results and lap records are never touched.",
        applyGarage, "THE GARAGE"),
      note);
  }
  if (typeof document === "undefined") return { collect: (mode) => collect(mode, G) };
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  Log.info("ui", "SettingsExport.create");
  return { collect: (mode) => collect(mode, G), collectGarage, applySettings: (o) => applySettings(o, G), applyGarage, mount };
}

return { FORMAT, GARAGE_FORMAT, SPEC, collect, collectGarage, applySettings, applyGarage, isGarageKey, create };
})();
