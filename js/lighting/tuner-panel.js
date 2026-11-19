const TunerPanel = (function () {
  "use strict";

function create(G) {
Log.info("game", "TunerPanel.create");
const { TUNE_DEFS, LT } = LightTune;
const { $, els, ltKey, setLightTune, persistLightTune, applyLightTune, setTimeOfDay, weather } = G;
const exitPhotoMode = (...a) => G.exitPhotoMode(...a);

function fmtTune(d, v) {
  if (d.fmt === "auto" && v < 0) return "AUTO";
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = v.toFixed(Math.min(dec, 5));
  return (d.fmt === "signed" && v > 0 ? "+" + s : s) + gateNote(d, v);
}
function gateNote(d, v) {
  const isChunk = d.id === "perChunkLights" || d.id === "roadChunkLamps";
  if (d.id === "carEnvCube" && v > 0) {
    let held = false;
    try { held = localStorage.getItem("apex26.envProbeOff") === "1"; } catch (_) {  }
    return held ? " · held after a display reset — set to 0 and back on to retry" : "";
  }
  if (!isChunk || !(v > 0)) return "";
  let latched = false;
  try { latched = localStorage.getItem("apex26.perChunkOff") === "1"; } catch (_) {  }
  if (latched) return " · held after a display reset — set to 0 and back on to retry";
  const tier = (typeof PerfGov !== "undefined" && PerfGov.autoShed) ? PerfGov.autoShed() : 0;
  if (tier >= 2) return " · held off — this device is missing frames and the governor has shed two tiers; it returns on its own when frames recover";
  if (tier >= 1 && d.id === "perChunkLights" && v > 0.3) return " · capped at 0.3 while the governor has shed a tier (this device is missing frames)";
  if (d.id === "roadChunkLamps") {
    const pcl = (typeof LT !== "undefined" && +LT.perChunkLights) || 0;
    if (!(pcl > 0)) return " · needs PER-CHUNK LAMPS above 0 to do anything";
  }
  return "";
}
let _ltPrevTOD = null, _ltPrevWx = null;
let _ltPrevArc, _ltArcSaved = false;
const netLive = () => !!(G.netPlay && typeof G.netPlay.active === "function" && G.netPlay.active());
const LT_TODS = ["dawn", "day", "dusk", "night", "default"];
const LT_WX = ["dry", "wet", "rain", "fog", "overcast"];
function refreshLtPreviewActive() {
  const tod = setTimeOfDay(), wx = weather();
  for (const t of LT_TODS) { const el = $("lt-tod-" + t); if (el) el.classList.toggle("active", t === tod); }
  for (const w of LT_WX) { const el = $("lt-wx-" + w); if (el) el.classList.toggle("active", w === wx); }
}
function updateLtProfileLabel() {
  const host = $("lt-profile"); if (!host) return;
  const key = ltKey();
  if (!key) { host.textContent = ""; return; }
  const [id, tod, wx] = key.split("|");
  const name = (G.track && G.track.def && G.track.def.name) || id;
  const nOver = LightStore.tuned();
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
      btn.onclick = () => { if (netLive()) return; onPick(id); refreshLtPreviewActive(); refreshLightTunePanel(); };
      row.appendChild(btn);
    });
    host.appendChild(row);
  };
  mkGroup("TIME", LT_TODS, ["DAWN", "DAY", "DUSK", "NIGHT", "TRACK"],
    (t) => setTimeOfDay(t), "lt-tod-");
  mkGroup("WEATHER", LT_WX, ["DRY", "WET", "RAIN", "FOG", "CLOUD"],
    (w) => weather(w), "lt-wx-");
}
let _ltUndo = null;
let _ltArmed = null;
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
  if (_ltArmed !== id) {
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
function ltSlug(group) {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
let _ltActiveGroup = null;
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
    t.classList.toggle("active", on);
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
    const groups = [];
    let group = null, section = null, wrap = null;
    for (const d of TUNE_DEFS) {
      if (d.group !== group) {
        group = d.group; groups.push(group);
        section = null;
        wrap = document.createElement("div");
        wrap.className = "lt-group"; wrap.dataset.group = group;
        const slug = ltSlug(group);
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
      if (d.desktopOnly && typeof GLX !== "undefined" && GLX.isMobile) {
        inp.disabled = true;
        span.appendChild(document.createTextNode(" (DESKTOP ONLY)"));
        inp.setAttribute("aria-label", d.label + " (desktop only)");
      }
      inp.oninput = () => {
        if (!setLightTune(d.id, parseFloat(inp.value))) return;
        b.textContent = fmtTune(d, LT[d.id]);
        if (d.id === "perChunkLights" || d.id === "roadChunkLamps") {
          const other = TUNE_DEFS.find((t) => t.id === (d.id === "perChunkLights" ? "roadChunkLamps" : "perChunkLights"));
          const value = other && $("lt-v-" + other.id);
          if (value) value.textContent = fmtTune(other, LT[other.id]);
        }
        updateLtProfileLabel();
      };
      inp.onchange = () => persistLightTune();
      lab.appendChild(span); lab.appendChild(inp);
      item.appendChild(lab);
      if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
      wrap.appendChild(item);
    }
    if (tabs) {
      tabs.textContent = "";
      groups.forEach((g, index) => {
        const slug = ltSlug(g);
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
  LightStore.reset();
  persistLightTune();
  applyLightTune();
  refreshLightTunePanel();
  $("lt-json").hidden = true;
};
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
  const sunSlot = here && here.replace(/\|[^|]+$/, "|dry");
  const sharedSun = sunSlot !== here && keys.includes(sunSlot) &&
    ["sunElev", "sunAzim"].some((id) => Object.prototype.hasOwnProperty.call(S[sunSlot], id));
  const current = keys.filter((k) => k === here || (sharedSun && k === sunSlot));
  current.sort((a, b) => (a === here ? -1 : b === here ? 1 : 0));
  if (current.length) {
    const [id, tod, wx] = here.split("|");
    const name = (G.track && G.track.def && G.track.def.name) || id;
    lines.push("  // THIS CONDITION — " + [name, tod, wx].join(" · ").toUpperCase() +
      "  (" + LightStore.tuned() + " tuned)");
    current.forEach((k, i) => {
      if (k !== here) {
        lines.push("  // SUN ANGLES — affect this condition in every weather; stored under DRY");
        if (Object.keys(S[k]).some((id) => id !== "sunElev" && id !== "sunAzim"))
          lines.push("  // Other knobs in this slot affect DRY only");
      }
      lines.push(entry(k) + (i < keys.length - 1 ? "," : ""));
    });
  } else {
    lines.push("  // THIS CONDITION — nothing tuned here yet");
  }
  const rest = keys.filter((k) => !current.includes(k));
  if (rest.length) {
    lines.push("  // EVERYTHING ELSE YOU HAVE TUNED — " + rest.length +
      (rest.length === 1 ? " condition" : " conditions"));
    rest.forEach((k, i) => lines.push(entry(k) + (i < rest.length - 1 ? "," : "")));
  }
  lines.push("};");
  const json = lines.join("\n");

  const ta = $("lt-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); ta.setSelectionRange(0, json.length);

  const flash = (good) => {
    btn.textContent = good ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  ApexClipboard.write(json, { preferSync: true }).then(flash);
};
$("pm-lighting").onclick = () => {
  Log.info("game", "TunerPanel.open");
  buildLightTunePanel();
  _ltPrevTOD = setTimeOfDay();
  _ltPrevWx = weather();
  _ltPrevArc = G.weatherArc; _ltArcSaved = true;
  refreshLtPreviewActive();
  $("lt-preview").hidden = netLive();
  $("lt-json").hidden = true;
  $("lighting").hidden = false;
  document.body.classList.add("lt-open");
  els.pmsettings.hidden = true;
  const visualPage = $("pm-panel-visual");
  if (visualPage) visualPage.hidden = true;
};
function closeLightTuner(showPauseMenu) {
  Log.info("game", "TunerPanel.close");
  if (G.photoMode) exitPhotoMode();
  _ltUndo = null; ltDisarm();
  if (_ltPrevTOD != null && setTimeOfDay() !== _ltPrevTOD) setTimeOfDay(_ltPrevTOD);
  if (_ltPrevWx != null && weather() !== _ltPrevWx) weather(_ltPrevWx);
  if (_ltArcSaved) { G.weatherArc = _ltPrevArc; _ltArcSaved = false; _ltPrevArc = undefined; }
  _ltPrevTOD = null; _ltPrevWx = null;
  $("lighting").hidden = true;
  document.body.classList.remove("lt-open");
  if (showPauseMenu && G.paused) {
    els.pmsettings.hidden = false;
    const visualPage = $("pm-panel-visual");
    if (visualPage) visualPage.hidden = false;
  }
}
$("lt-close").onclick = () => closeLightTuner(true);
return { buildLightTunePanel, refreshLightTunePanel, closeLightTuner };
}

return { create };
})();
Object.freeze(TunerPanel);
