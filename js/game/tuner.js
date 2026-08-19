/* Apex 26 — the LIGHTING TUNER panel UI for js/game.js: slider rows generated from TUNE_DEFS, group tabs, preview time-of-day/weather chips, RESET/COPY VALUES exp… */
const TunerPanel = (function () {
  "use strict";

function create(G) {
Log.info("game", "TunerPanel.create");
const { TUNE_DEFS, LT } = LightTune;
// Stable helpers from the game.js closure.
const { $, els, ltKey, setLightTune, persistLightTune, setTimeOfDay, weather } = G;
const exitPhotoMode = (...a) => G.exitPhotoMode(...a);

function fmtTune(d, v) {
  if (d.fmt === "auto" && v < 0) return "AUTO";
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = v.toFixed(Math.min(dec, 5));
  return (d.fmt === "signed" && v > 0 ? "+" + s : s) + gateNote(d, v);
}
function gateNote(d, v) {
  if (d.id !== "perChunkLights" || !(v > 0)) return "";
  let latched = false;
  try { latched = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) { /* no storage: fall through to the tier check */ }
  if (latched) return " · held after a display reset — set to 0 and back on to retry";
  const tier = (typeof PerfGov !== "undefined" && PerfGov.tier) ? PerfGov.tier() : 0;
  return tier >= 1 ? " · held off by the graphics tier — needs HIGH or ULTRA, and a frame budget the governor has not shed" : "";
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
// (LightStore.copyToTracks — js/game/light-store.js owns the semantics):
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
        persistLightTune();
      };
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
