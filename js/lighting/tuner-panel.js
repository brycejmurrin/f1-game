/* Apex 26 — the LIGHTING TUNER panel UI for js/game.js: slider rows generated from TUNE_DEFS, group tabs, preview time-of-day/weather chips, COPY TO ALL TRACKS, the help toggle and the RESET / COPY VALUES export (window.LightEdits), open/close. The knob registry is js/lighting/knobs.js; profile resolution is js/lighting/profiles.js. */
const TunerPanel = (function () {
  "use strict";

function create(G) {
Log.info("game", "TunerPanel.create");
const { TUNE_DEFS, LT } = LightTune;
// Stable helpers from the game.js closure.
const { $, els, ltKey, setLightTune, persistLightTune, applyLightTune, setTimeOfDay, weather } = G;
const exitPhotoMode = (...a) => G.exitPhotoMode(...a);

function fmtTune(d, v) {
  if (d.fmt === "auto" && v < 0) return "AUTO";
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = v.toFixed(Math.min(dec, 5));
  return (d.fmt === "signed" && v > 0 ? "+" + s : s) + gateNote(d, v);
}
function gateNote(d, v) {
  // Both LAMPS chunk knobs answer here. They share every gate, so a note on
  // only one of them left the other silently doing nothing — which is exactly
  // how a held-off feature reads as a broken slider.
  const isChunk = d.id === "perChunkLights" || d.id === "roadChunkLamps";
  // ENV REFLECTION carries the same latch shape (apex26.envProbeOff, written on
  // a visible context loss) and the same 0-and-back-on reset in setLightTune.
  if (d.id === "carEnvCube" && v > 0) {
    let held = false;
    try { held = localStorage.getItem("apex26.envProbeOff") === "1"; } catch (_) { /* no storage */ }
    return held ? " · held after a display reset — set to 0 and back on to retry" : "";
  }
  if (!isChunk || !(v > 0)) return "";
  // The BACKEND gate first: three.js has no per-chunk lamp binding at all, so
  // on TLX the knob can never do anything however the tier and latch sit.
  const g = G.gfx;
  if (g && g.hasPerChunkLights === false) return " · not supported by the three.js renderer — switch to WebGL2 or WebGPU";
  let latched = false;
  try { latched = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) { /* no storage: fall through to the tier check */ }
  if (latched) return " · held after a display reset — set to 0 and back on to retry";
  const tier = (typeof PerfGov !== "undefined" && PerfGov.autoShed) ? PerfGov.autoShed() : 0;
  if (tier >= 1) return " · held off — this device is missing frames and the governor has shed a tier; it returns on its own when frames recover";
  // PER-CHUNK ROAD is a rider on PER-CHUNK LAMPS and does nothing on its own.
  if (d.id === "roadChunkLamps") {
    const pcl = (typeof LT !== "undefined" && +LT.perChunkLights) || 0;
    if (!(pcl > 0)) return " · needs PER-CHUNK LAMPS above 0 to do anything";
  }
  return "";
}
// PREVIEW conditions: the tuner tunes GLOBAL values that only take visible
// effect under the right conditions (night sliders do nothing on a day track,
// wet reflections need a wet road). So a track with a FIXED time/weather could
// hide half the controls. These buttons flip the live session's time-of-day and
// weather so every value can be dialled in on any circuit; the original race
// settings are captured on open and restored on DONE, so previewing never
// changes the race you go back to.
let _ltPrevTOD = null, _ltPrevWx = null;
const LT_TODS = ["dawn", "day", "dusk", "night", "default"];
const LT_WX = ["dry", "wet", "rain", "fog", "overcast"];
function refreshLtPreviewActive() {
  const tod = setTimeOfDay(), wx = weather();
  for (const t of LT_TODS) { const el = $("lt-tod-" + t); if (el) el.classList.toggle("on", t === tod); }
  for (const w of LT_WX) { const el = $("lt-wx-" + w); if (el) el.classList.toggle("on", w === wx); }
}
// Show which per-condition profile is being edited, e.g. "MONZA · NIGHT · WET".
function updateLtProfileLabel() {
  const host = $("lt-profile"); if (!host) return;
  const key = ltKey();
  if (!key) { host.textContent = ""; return; }
  const [id, tod, wx] = key.split("|");
  const name = (G.track && G.track.def && G.track.def.name) || id;
  const nOver = G._ltStore[key] ? Object.keys(G._ltStore[key]).length : 0;
  host.textContent = name.toUpperCase() + " · " + tod.toUpperCase() + " · " + wx.toUpperCase() +
    (nOver ? "  (" + nOver + " tuned)" : "  (defaults)");
}
function buildLtPreview() {
  const host = $("lt-preview");
  if (host.dataset.built) return;
  host.dataset.built = "1";
  const mkGroup = (title, ids, labels, onPick, prefix) => {
    const row = document.createElement("div");
    row.className = "lt-preview-row";
    const lb = document.createElement("span"); lb.className = "lt-preview-lbl"; lb.textContent = title;
    row.appendChild(lb);
    ids.forEach((id, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn lt-preview-btn"; btn.id = prefix + id; btn.textContent = labels[i];
      btn.onclick = () => { onPick(id); refreshLtPreviewActive(); refreshLightTunePanel(); };
      row.appendChild(btn);
    });
    host.appendChild(row);
  };
  mkGroup("TIME", LT_TODS, ["DAWN", "DAY", "DUSK", "NIGHT", "TRACK"],
    (t) => setTimeOfDay(t), "lt-tod-");
  mkGroup("WEATHER", LT_WX, ["DRY", "WET", "RAIN", "FOG", "CLOUD"],
    (w) => weather(w), "lt-wx-");
}
// COPY TO ALL TRACKS. Every other control in this panel edits the ONE
// (track, time-of-day, weather) profile named above it; these two write the same
// values into every OTHER track at that same time and weather
// (LightStore.copyToTracks — js/lighting/profiles.js owns the semantics):
//   MY EDITS  — only this profile's own overrides, merged over each target's, so
//               a circuit keeps its shipped character for untouched knobs.
//   FULL LOOK — every live value, so they all render identically. This overrides
//               the per-track presets, which is the point of asking for it.
// 39 profiles at once is worth a second thought, so each button ARMS on the first
// click and fires on the second, and the previous state stays revertible via UNDO
// for as long as the panel is open. The arm window is generous (20 s, not the
// 2-3 s a plain double-click guard would use) — MEASURED: on this renderer a
// docked panel keeps painting the live preview behind it, and a background
// tab or a loaded device can push a single click's actionability wait (visible +
// stable) past several seconds on its own. A window tight enough to feel like a
// "confirm" reads as broken the moment ordinary rendering load eats it — the
// second, deliberate click landing back on the ARM branch instead of firing.
let _ltUndo = null;            // snapshot from the last copy, or null
let _ltArmed = null;           // id of the armed button, or null
let _ltArmT = 0, _ltFlashT = 0;
const LT_SPREAD = [
  ["edits", "MY EDITS"],
  ["look", "FULL LOOK"],
];
const ltSpreadBtn = {};
function ltTargetCount() {
  const n = (typeof Tracks !== "undefined" && Tracks.LIST && Tracks.LIST.length) || 0;
  return Math.max(0, n - 1);
}
function ltDisarm() {
  _ltArmed = null;
  clearTimeout(_ltArmT); clearTimeout(_ltFlashT);
  for (const [id, label] of LT_SPREAD) if (ltSpreadBtn[id]) {
    ltSpreadBtn[id].textContent = label;
    ltSpreadBtn[id].classList.remove("on");
  }
  if (ltSpreadBtn.undo) ltSpreadBtn.undo.hidden = !_ltUndo;
}
function ltFlash(btn, text) {
  btn.textContent = text;
  clearTimeout(_ltFlashT);
  _ltFlashT = setTimeout(ltDisarm, 2200);
}
function ltSpread(id, btn) {
  if (_ltArmed !== id) {   // first click arms; arming one disarms the other
    ltDisarm();
    _ltArmed = id; btn.classList.add("on");
    btn.textContent = "COPY TO " + ltTargetCount() + "?";
    _ltArmT = setTimeout(ltDisarm, 20000);
    return;
  }
  clearTimeout(_ltArmT);
  _ltArmed = null; btn.classList.remove("on");
  const r = G.copyLightTune(id);
  if (!r.ok) { ltFlash(btn, r.error === "no-edits" ? "NOTHING TUNED" : "NO TRACK"); return; }
  persistLightTune();
  _ltUndo = r.undo;
  ltFlash(btn, "COPIED " + r.tracks + " ✓");
  if (ltSpreadBtn.undo) ltSpreadBtn.undo.hidden = false;
}
function ltUndoSpread() {
  if (!_ltUndo) return;
  G.restoreLightTune(_ltUndo);
  _ltUndo = null;
  persistLightTune();
  ltDisarm();
  refreshLightTunePanel();
}
function buildLtSpread() {
  const host = $("lt-spread");
  if (!host || host.dataset.built) return;
  host.dataset.built = "1";
  const row = document.createElement("div");
  row.className = "lt-preview-row";
  const lb = document.createElement("span");
  lb.className = "lt-preview-lbl"; lb.textContent = "COPY ALL";
  row.appendChild(lb);
  for (const [id, label] of LT_SPREAD) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "opt-btn lt-preview-btn"; btn.id = "lt-spread-" + id;
    btn.textContent = label;
    btn.onclick = () => ltSpread(id, btn);
    ltSpreadBtn[id] = btn;
    row.appendChild(btn);
  }
  const undo = document.createElement("button");
  undo.type = "button"; undo.className = "opt-btn lt-preview-btn"; undo.id = "lt-spread-undo";
  undo.textContent = "UNDO"; undo.hidden = true;
  undo.onclick = ltUndoSpread;
  ltSpreadBtn.undo = undo;
  row.appendChild(undo);
  host.appendChild(row);
  const help = document.createElement("p");
  help.className = "adv-help";
  help.textContent = "Copy this condition to every other track at the same time and weather. " +
    "MY EDITS sends only the knobs tuned here; FULL LOOK sends every value and overrides each " +
    "track's shipped look. Click twice to confirm.";
  host.appendChild(help);
}
let _ltActiveGroup = null;   // currently-shown tuner category (tab)
function setLtTab(group, focus) {
  _ltActiveGroup = group;
  const rows = $("lt-rows"), tabs = $("lt-tabs");
  if (rows) for (const g of rows.children) {
    const on = g.dataset.group === group;
    g.classList.toggle("active", on);
    g.hidden = !on;
  }
  if (tabs) for (const t of tabs.children) {
    const on = t.dataset.group === group;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    if (on) {
      t.scrollIntoView({ block: "nearest", inline: "center" });
      if (focus) t.focus();
    }
  }
  if (rows) rows.scrollTop = 0;
}
function ltTabKey(index, groups, e) {
  let next = null;
  if (e.key === "ArrowRight") next = (index + 1) % groups.length;
  else if (e.key === "ArrowLeft") next = (index - 1 + groups.length) % groups.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = groups.length - 1;
  if (next == null) return;
  e.preventDefault(); e.stopPropagation();
  setLtTab(groups[next], true);
}
function buildLightTunePanel() {
  buildLtPreview();
  buildLtSpread();
  const host = $("lt-rows"), tabs = $("lt-tabs");
  if (!host.dataset.built) {
    host.dataset.built = "1";
    const groups = [];      // ordered distinct group names
    let group = null, section = null, wrap = null;
    for (const d of TUNE_DEFS) {
      if (d.group !== group) {
        group = d.group; groups.push(group);
        section = null;
        wrap = document.createElement("div");
        wrap.className = "lt-group"; wrap.dataset.group = group;
        const slug = group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        wrap.id = "lt-panel-" + slug;
        wrap.setAttribute("role", "tabpanel");
        wrap.setAttribute("aria-labelledby", "lt-tab-" + slug);
        const h = document.createElement("h3");
        h.className = "adv-sec"; h.textContent = group;
        wrap.appendChild(h);
        host.appendChild(wrap);
      }
      if (d.section && d.section !== section) {
        section = d.section;
        const sh = document.createElement("h4");
        sh.className = "lt-section";
        sh.textContent = section;
        wrap.appendChild(sh);
      }
      const item = document.createElement("div");
      item.className = "adv-item";
      const lab = document.createElement("label"); lab.className = "tune-row";
      const span = document.createElement("span"); span.className = "tune-label";
      span.textContent = d.label + " ";
      const b = document.createElement("b"); b.id = "lt-v-" + d.id;
      span.appendChild(b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
      inp.id = "lt-in-" + d.id;
      inp.setAttribute("aria-label", d.label);
      inp.oninput = () => {
        setLightTune(d.id, parseFloat(inp.value));
        b.textContent = fmtTune(d, LT[d.id]);
      };
      // Persist on release (range "change" fires once), not on every drag tick —
      // persistLightTune() does a synchronous JSON.stringify + localStorage.setItem
      // of the whole profile store, which is too heavy to run on every oninput.
      inp.onchange = () => persistLightTune();
      lab.appendChild(span); lab.appendChild(inp);
      item.appendChild(lab);
      if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
      wrap.appendChild(item);
    }
    // Build one tab chip per group.
    if (tabs) {
      tabs.textContent = "";
      groups.forEach((g, index) => {
        const slug = g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const t = document.createElement("button");
        t.type = "button"; t.className = "lt-tab"; t.dataset.group = g;
        t.id = "lt-tab-" + slug;
        t.textContent = g; t.setAttribute("role", "tab");
        t.setAttribute("aria-controls", "lt-panel-" + slug);
        t.onclick = () => setLtTab(g);
        t.onkeydown = (e) => ltTabKey(index, groups, e);
        tabs.appendChild(t);
      });
    }
    _ltActiveGroup = groups[0];
  }
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", $("lt-help-on").checked);
  // Restore the last-viewed category (or default to the first).
  setLtTab(_ltActiveGroup || (TUNE_DEFS[0] && TUNE_DEFS[0].group));
  refreshLightTunePanel();
}
function refreshLightTunePanel() {
  for (const d of TUNE_DEFS) {
    const inp = $("lt-in-" + d.id), b = $("lt-v-" + d.id);
    if (inp) inp.value = LT[d.id];
    if (b) b.textContent = fmtTune(d, LT[d.id]);
  }
  updateLtProfileLabel();
  ltDisarm();
}
$("lt-help-on").onchange = (e) => {
  document.getElementById("lighting-inner").classList.toggle("lt-show-help", e.target.checked);
};
$("lt-reset").onclick = () => {
  // Drop this condition's LOCAL edits so it falls back to the shipped file /
  // defaults. The shipped file is never touched; other CONDITIONS are only
  // reached through the legacy global layer cleared below.
  const key = ltKey();
  if (key && G._ltStore[key]) delete G._ltStore[key];
  if (G._ltStore["*"]) delete G._ltStore["*"];
  persistLightTune();
  applyLightTune();
  refreshLightTunePanel();
  $("lt-json").hidden = true;
};
/* COPY VALUES HANDS OVER THE EDITS, NOT THE WHOLE FILE. This used to export the
   file+local MERGE — every shipped preset plus the local overrides — which
   measured 805 conditions, 7071 knobs and 182,569 characters against the
   shipped light-presets.js. That is the right input for bake.mjs (a full
   REPLACE needs a full snapshot) and the wrong thing entirely for the person
   holding the phone: it cannot be pasted into a message, and #lt-json is a
   10px box capped at 120px, so hand-selecting ~4,500 lines through it is not
   hard, it is impossible. The shipped half already lives in the repo, so
   sending it back is pure noise — only the overrides carry information.

   window.LightEdits, NEVER window.LightPresets. The name is a safety
   interlock, not a preference: bake.mjs replaces the entire LightPresets
   literal, so a delta wearing that name would silently wipe every condition it
   did not mention. The distinct name lets the tools tell a delta from a
   snapshot instead of trusting whoever pastes it — merge-proposals.mjs takes
   this one and merges, bake.mjs refuses it by name.

   A JS assignment with // comments rather than bare JSON: the dividers below
   are for a human reading the paste, and the blob still loads in a single
   vm.runInContext the way merge-proposals.mjs already reads light-presets.js. */
$("lt-copy").onclick = () => {
  const btn = $("lt-copy");
  const S = G._ltStore || {};
  const here = ltKey();
  const keys = Object.keys(S).filter((k) => Object.keys(S[k] || {}).length);
  if (!keys.length) {
    btn.textContent = "NOTHING TUNED";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
    return;
  }
  const entry = (k) => '  "' + k + '": ' +
    JSON.stringify(S[k], null, 2).replace(/\n/g, "\n  ");
  const lines = ["window.LightEdits = {"];
  // THE CURRENT CONDITION FIRST, always: it is the one just tuned and the one a
  // reader checks. Key order is insertion order, so first here is first out.
  if (here && keys.includes(here)) {
    const [id, tod, wx] = here.split("|");
    const name = (G.track && G.track.def && G.track.def.name) || id;
    lines.push("  // THIS CONDITION — " + [name, tod, wx].join(" · ").toUpperCase() +
      "  (" + Object.keys(S[here]).length + " tuned)");
    lines.push(entry(here) + (keys.length > 1 ? "," : ""));
  } else {
    lines.push("  // THIS CONDITION — nothing tuned here yet");
  }
  const rest = keys.filter((k) => k !== here);
  if (rest.length) {
    lines.push("  // EVERYTHING ELSE YOU HAVE TUNED — " + rest.length +
      (rest.length === 1 ? " condition" : " conditions"));
    rest.forEach((k, i) => lines.push(entry(k) + (i < rest.length - 1 ? "," : "")));
  }
  lines.push("};");
  const json = lines.join("\n");

  const ta = $("lt-json");
  ta.value = json; ta.hidden = false;
  // readOnly stays ON: it is what keeps iOS from raising the keyboard, and
  // setSelectionRange is the select idiom that works on a readonly field where
  // select() alone does not.
  ta.focus(); ta.setSelectionRange(0, json.length);

  // THE SYNCHRONOUS ATTEMPT COMES FIRST. execCommand("copy") needs user
  // activation, and the old handler only reached it from inside the clipboard
  // promise's REJECTION handler — a microtask later. MEASURED, and the obvious
  // story turned out wrong on the browser nearest to hand: Chromium keeps
  // transient activation ~5 s, so the late call still copied there (verified by
  // reading the clipboard back, both with the API working and with it stubbed
  // to reject). WebKit is documented as the strict one — the copy must happen
  // while the gesture is being processed, not merely soon after — but that half
  // is UNVERIFIED here: this container's proxy blocks the WebKit download, so
  // nobody has run it. Ordering the synchronous attempt first costs nothing and
  // takes the engine out of the question either way. Do NOT read it as a claim
  // that the old order was broken everywhere: on Chromium it demonstrably was
  // not, and the payload size below is what a player was actually hitting.
  let ok = false;
  try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { /* not available */ }
  const flash = (good) => {
    btn.textContent = good ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    // Still preferred where it works — the only path that survives a browser
    // with execCommand removed. Either success is a success.
    navigator.clipboard.writeText(json).then(() => flash(true), () => flash(ok));
    return;
  }
  flash(ok);
};
$("pm-lighting").onclick = () => {
  Log.info("game", "TunerPanel.open");
  buildLightTunePanel();
  _ltPrevTOD = setTimeOfDay();   // capture the race's real conditions
  _ltPrevWx = weather();
  refreshLtPreviewActive();
  $("lt-json").hidden = true;
  $("lighting").hidden = false;
  document.body.classList.add("lt-open");   // hide race HUD + touch controls underneath
  els.pmsettings.hidden = true;     // unobstructed live preview (opened from settings)
};
function closeLightTuner(showPauseMenu) {
  Log.info("game", "TunerPanel.close");
  if (G.photoMode) exitPhotoMode();
  _ltUndo = null; ltDisarm();   // the copy's one-step revert does not outlive the panel
  // Restore the race's real time & weather (preview was transient).
  if (_ltPrevTOD != null && setTimeOfDay() !== _ltPrevTOD) setTimeOfDay(_ltPrevTOD);
  if (_ltPrevWx != null && weather() !== _ltPrevWx) weather(_ltPrevWx);
  _ltPrevTOD = null; _ltPrevWx = null;
  $("lighting").hidden = true;
  document.body.classList.remove("lt-open");   // restore race HUD + touch controls
  if (showPauseMenu && G.paused) els.pmsettings.hidden = false;   // back to the settings menu
}
$("lt-close").onclick = () => closeLightTuner(true);
return { buildLightTunePanel, refreshLightTunePanel, closeLightTuner };
}

return { create };
})();
