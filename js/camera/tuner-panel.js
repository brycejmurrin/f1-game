/* Apex 26 — the CAMERA TUNER pause-menu panel: a chip per player camera mode plus a slider per knob from CamTune.defs(), comfort knobs, a global baseline scope, presets, copy-from / apply-to-all, and JSON / APXC1 import. */
const CamTunerEditor = (function () {
  "use strict";

let _refresh = null;

function create(G) {
Log.info("game", "CamTunerPanel.create");
const { $, els } = G;
const { CAM_MODES } = CamModes;
const DEFS = CamTune.defs();
const COMFORT = CamTune.comfortDefs();

// Scope: per-mode edits vs the global baseline layered under every camera.
let _scope = "mode";   // "mode" | "global"
function curMode() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).id; }
function curLabel() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).label; }
function fmtCt(d, v) {
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = Math.abs(v).toFixed(Math.min(dec, 2));
  const sign = (v > 0 && d.min < 0) ? "+" : v < 0 ? "−" : "";
  return sign + s + d.unit;
}
function knobApplies(d, mode) {
  if (_scope === "global") return true;   // global baseline shows every knob
  return !d.modes || d.modes.indexOf(mode) !== -1;
}
function applyLive() {
  if (G.player && G.track) G.snapGameCam();
}
const CT_PREVIEWS = {
  monza: { id: "monza", frac: 0.055, speed: 55 },
  spa: { id: "spa", frac: 0.34, speed: 62 },
  monaco: { id: "monaco", frac: 0.78, speed: 42 },
};
function previewCorner(key) {
  const p = CT_PREVIEWS[key];
  // The jump is the dev API's, which the shipped page does not load (__apex is
  // null there, and `typeof null` is "object"): without it a jump would swap
  // the circuit under a live race and then throw. openCamTuner hides the row.
  if (!p || !G.player || !window.__apex) return;
  const idx = Tracks.LIST.findIndex((t) => t.id === p.id);
  if (idx < 0) return;
  if (G.trackIdx !== idx) G.loadTrack(idx);
  __apex.jump(p.frac, p.speed);
  __apex.snapCam();
  applyLive();
}
function selectCamMode(index, focus) {
  G.setCamMode(index);
  _scope = "mode";
  applyLive();
  refreshCamTunePanel();
  if (focus) $("ct-tab-" + CAM_MODES[index].id).focus();
}
function camTabKey(index, e) {
  let next = null;
  if (e.key === "ArrowRight") next = (index + 1) % CAM_MODES.length;
  else if (e.key === "ArrowLeft") next = (index - 1 + CAM_MODES.length) % CAM_MODES.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = CAM_MODES.length - 1;
  if (next == null) return;
  e.preventDefault(); e.stopPropagation();
  selectCamMode(next, true);
}

function buildTools(host) {
  if (!host || host.dataset.tools) return;
  host.dataset.tools = "1";

  // Scope: THIS CAM vs ALL CAMS (global baseline).
  const scope = document.createElement("div");
  scope.className = "lt-preview-row";
  scope.id = "ct-scope";
  const scopeLbl = document.createElement("span");
  scopeLbl.className = "lt-preview-lbl";
  scopeLbl.textContent = "SCOPE";
  scope.appendChild(scopeLbl);
  const scopeBtns = {};
  for (const [id, label] of [["mode", "THIS CAM"], ["global", "ALL CAMS"]]) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "opt-btn lt-preview-btn";
    b.dataset.scope = id;
    b.textContent = label;
    b.onclick = () => { _scope = id; refreshCamTunePanel(); };
    scope.appendChild(b);
    scopeBtns[id] = b;
  }
  host.appendChild(scope);
  host._ctScopeBtns = scopeBtns;
  const scopeHelp = document.createElement("p");
  scopeHelp.className = "adv-help";
  scopeHelp.textContent = "THIS CAM edits one mode. ALL CAMS writes the global baseline layered under every camera (per-mode edits still win on a shared knob).";
  host.appendChild(scopeHelp);

  // Presets
  const presets = document.createElement("div");
  presets.className = "lt-preview-row";
  presets.id = "ct-presets";
  const pLbl = document.createElement("span");
  pLbl.className = "lt-preview-lbl";
  pLbl.textContent = "PRESET";
  presets.appendChild(pLbl);
  const table = CamTune.presets();
  for (const id of Object.keys(table)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "opt-btn lt-preview-btn"; b.id = "ct-preset-" + id;
    b.textContent = table[id].label;
    b.title = table[id].help || "";
    b.onclick = () => {
      CamTune.applyPreset(id);
      CamTune.persist();
      applyLive();
      refreshCamTunePanel();
    };
    presets.appendChild(b);
  }
  host.appendChild(presets);

  // Copy from / apply to all
  const copy = document.createElement("div");
  copy.className = "lt-preview-row";
  copy.id = "ct-copyrow";
  const cLbl = document.createElement("span");
  cLbl.className = "lt-preview-lbl";
  cLbl.textContent = "COPY";
  copy.appendChild(cLbl);
  const sel = document.createElement("select");
  sel.id = "ct-copy-from";
  sel.setAttribute("aria-label", "Copy framing from camera");
  for (const c of CAM_MODES) {
    const o = document.createElement("option");
    o.value = c.id; o.textContent = c.label;
    sel.appendChild(o);
  }
  copy.appendChild(sel);
  const fromBtn = document.createElement("button");
  fromBtn.type = "button"; fromBtn.className = "opt-btn lt-preview-btn"; fromBtn.id = "ct-copy-from-btn";
  fromBtn.textContent = "FROM → HERE";
  fromBtn.title = "Copy the selected camera's per-mode edits onto the camera you are editing.";
  fromBtn.onclick = () => {
    const src = sel.value, dst = curMode();
    if (src === dst) return;
    CamTune.copyFrom(src, dst);
    CamTune.persist("modes");
    applyLive();
    refreshCamTunePanel();
  };
  copy.appendChild(fromBtn);
  const allBtn = document.createElement("button");
  allBtn.type = "button"; allBtn.className = "opt-btn lt-preview-btn"; allBtn.id = "ct-copy-all-btn";
  allBtn.textContent = "HERE → ALL";
  allBtn.title = "Copy this camera's per-mode edits onto every other camera. Click twice to confirm.";
  let armed = false, armT = 0;
  allBtn.onclick = () => {
    if (!armed) {
      armed = true;
      allBtn.classList.add("on");
      allBtn.textContent = "COPY TO ALL?";
      clearTimeout(armT);
      armT = setTimeout(() => { armed = false; allBtn.classList.remove("on"); allBtn.textContent = "HERE → ALL"; }, 20000);
      return;
    }
    clearTimeout(armT);
    armed = false; allBtn.classList.remove("on");
    const n = CamTune.applyToAllModes(curMode());
    CamTune.persist("modes");
    applyLive();
    refreshCamTunePanel();
    allBtn.textContent = "COPIED " + n + " ✓";
    setTimeout(() => { allBtn.textContent = "HERE → ALL"; }, 1800);
  };
  copy.appendChild(allBtn);
  host.appendChild(copy);

  // Comfort block
  const comfortHead = document.createElement("div");
  comfortHead.id = "ct-comfort-head";
  comfortHead.className = "lt-preview-lbl";
  comfortHead.textContent = "COMFORT";
  comfortHead.style.marginTop = "0.6em";
  host.appendChild(comfortHead);
  const comfortHelp = document.createElement("p");
  comfortHelp.className = "adv-help";
  comfortHelp.textContent = "Independent of MOTION: REDUCED. Reduced motion still zeroes shake, buzz and lean; these knobs scale the same effects when motion is on, and FOV bias always applies.";
  host.appendChild(comfortHelp);
  for (const d of COMFORT) {
    const item = document.createElement("div");
    item.className = "adv-item";
    item.id = "ct-comfort-row-" + d.id;
    const lab = document.createElement("label"); lab.className = "tune-row";
    const span = document.createElement("span"); span.className = "tune-label";
    span.textContent = d.label + " ";
    const b = document.createElement("b"); b.id = "ct-cv-" + d.id;
    span.appendChild(b);
    const inp = document.createElement("input");
    inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
    inp.id = "ct-cin-" + d.id;
    inp.setAttribute("aria-label", d.label);
    inp.oninput = () => {
      CamTune.comfortSet(d.id, parseFloat(inp.value));
      CamTune.persist("comfort");
      b.textContent = fmtCt(d, CamTune.comfortGet(d.id));
      applyLive();
    };
    lab.appendChild(span); lab.appendChild(inp);
    item.appendChild(lab);
    if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
    host.appendChild(item);
  }
}

function buildCamTunePanel() {
  const host = $("ct-rows"), modes = $("ct-modes");
  if (!host.dataset.built) {
    host.dataset.built = "1";
    if (modes) {
      modes.textContent = "";
      CAM_MODES.forEach((c, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "lt-tab"; b.dataset.mode = c.id;
        b.id = "ct-tab-" + c.id;
        b.textContent = c.label; b.setAttribute("role", "tab");
        b.setAttribute("aria-controls", "ct-rows");
        b.onclick = () => selectCamMode(i, false);
        b.onkeydown = (e) => camTabKey(i, e);
        modes.appendChild(b);
      });
    }
    buildTools(host);
    for (const d of DEFS) {
      const item = document.createElement("div");
      item.className = "adv-item";
      const lab = document.createElement("label"); lab.className = "tune-row";
      const span = document.createElement("span"); span.className = "tune-label";
      span.textContent = d.label + " ";
      const b = document.createElement("b"); b.id = "ct-v-" + d.id;
      span.appendChild(b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
      inp.id = "ct-in-" + d.id;
      inp.setAttribute("aria-label", d.label);
      inp.oninput = () => {
        if (_scope === "global") {
          CamTune.setGlobal(d.id, parseFloat(inp.value));
        } else {
          CamTune.set(curMode(), d.id, parseFloat(inp.value));
        }
        CamTune.persist(_scope === "global" ? "global" : "modes");
        const v = _scope === "global" ? CamTune.getGlobal(d.id) : CamTune.getModeOnly(curMode(), d.id);
        b.textContent = fmtCt(d, v);
        updateCtProfileLabel();
        applyLive();
      };
      lab.appendChild(span); lab.appendChild(inp);
      item.appendChild(lab);
      if (d.help) { const p = document.createElement("p"); p.className = "adv-help"; p.textContent = d.help; item.appendChild(p); }
      item.id = "ct-row-" + d.id;   // toggled per mode in refreshCamTunePanel
      host.appendChild(item);
    }
  }
  // Import lives next to COPY — inject once so shellNodes stays flat.
  const actions = $("ct-copy") && $("ct-copy").parentNode;
  if (actions && !actions.dataset.ctImport) {
    actions.dataset.ctImport = "1";
    const imp = document.createElement("button");
    imp.id = "ct-import";
    imp.type = "button";
    imp.textContent = "IMPORT";
    imp.title = "Paste JSON, a window.CameraEdits snippet, or an APXC1 share code into the box, then click IMPORT.";
    actions.insertBefore(imp, $("ct-close"));
    imp.onclick = () => {
      const ta = $("ct-json");
      ta.hidden = false;
      ta.readOnly = false;
      ta.placeholder = "Paste JSON, CameraEdits = {...}, or APXC1.… then IMPORT";
      const raw = (ta.value || "").trim();
      if (!raw) { ta.focus(); return; }
      const r = CamTune.importText(raw);
      if (!r.ok) {
        imp.textContent = "BAD PASTE";
        setTimeout(() => { imp.textContent = "IMPORT"; }, 1800);
        return;
      }
      CamTune.persist();
      applyLive();
      refreshCamTunePanel();
      imp.textContent = "IMPORTED ✓";
      setTimeout(() => { imp.textContent = "IMPORT"; }, 1800);
    };
  }
  const ta = $("ct-json");
  if (ta) { ta.readOnly = false; ta.setAttribute("aria-label", "Camera tuning export / import"); }
  document.getElementById("camtune-inner").classList.toggle("lt-show-help", $("ct-help-on").checked);
  refreshCamTunePanel();
}
function updateCtProfileLabel() {
  const host = $("ct-profile"); if (!host) return;
  if (_scope === "global") {
    const n = CamTune.countGlobal();
    host.textContent = "ALL CAMERAS" + (n ? "  (" + n + " baseline)" : "  (no baseline)");
  } else {
    const n = CamTune.count(curMode());
    host.textContent = curLabel() + (n ? "  (" + n + " tuned)" : "  (default framing)");
  }
  const modes = $("ct-modes");
  if (modes) for (const b of modes.children) {
    const on = _scope === "mode" && b.dataset.mode === curMode();
    b.classList.toggle("active", on);
    b.classList.toggle("tuned", CamTune.count(b.dataset.mode) > 0);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
    if (on) {
      b.scrollIntoView({ block: "nearest", inline: "center" });
      $("ct-rows").setAttribute("aria-labelledby", b.id);
    }
  }
  const sm = $("ct-rows") && $("ct-rows")._ctScopeBtns;
  if (sm) {
    if (sm.mode) sm.mode.classList.toggle("on", _scope === "mode");
    if (sm.global) sm.global.classList.toggle("on", _scope === "global");
  }
}
function refreshCamTunePanel() {
  if (!$("ct-rows").dataset.built) return;
  const mode = curMode();
  for (const d of DEFS) {
    const inp = $("ct-in-" + d.id), b = $("ct-v-" + d.id), row = $("ct-row-" + d.id);
    const v = _scope === "global" ? CamTune.getGlobal(d.id) : CamTune.getModeOnly(mode, d.id);
    if (inp) inp.value = v;
    if (b) b.textContent = fmtCt(d, v);
    if (row) row.style.display = knobApplies(d, mode) ? "" : "none";
  }
  for (const d of COMFORT) {
    const inp = $("ct-cin-" + d.id), b = $("ct-cv-" + d.id);
    const v = CamTune.comfortGet(d.id);
    if (inp) inp.value = v;
    if (b) b.textContent = fmtCt(d, v);
  }
  const sel = $("ct-copy-from");
  if (sel && !sel.dataset.locked) {
    // Default the picker to chase when editing something else, else the previous mode.
    if ([...sel.options].some((o) => o.value === "chase") && mode !== "chase") sel.value = "chase";
  }
  updateCtProfileLabel();
}
function isOpen() { return !$("camtune").hidden; }
function openCamTuner() {
  Log.info("game", "CamTunerPanel.open");
  buildCamTunePanel();
  $("camtune").hidden = false;
  { const row = $("ct-previews"); if (row) row.hidden = !window.__apex; }   // dev-API jumps only
  $("ct-json").hidden = true;
  document.body.classList.add("lt-open");   // hide race HUD + touch controls underneath
  els.pmsettings.hidden = true;             // unobstructed live preview (opened from settings)
  // Nested under DISPLAY -> ADVANCED VISUALS: hide that page too, or its own
  // .hidden survives underneath and reappears the moment pmsettings does.
  const displayPage = $("pm-panel-display");
  if (displayPage) displayPage.hidden = true;
  applyLive();
}
function closeCamTuner(showPauseMenu) {
  Log.info("game", "CamTunerPanel.close");
  $("camtune").hidden = true;
  document.body.classList.remove("lt-open");
  if (showPauseMenu && G.paused) {
    els.pmsettings.hidden = false;   // back to the settings menu
    const displayPage = $("pm-panel-display");
    if (displayPage) displayPage.hidden = false;   // ...specifically its DISPLAY page
  }
}
$("pm-camtune").onclick = openCamTuner;
$("ct-close").onclick = () => closeCamTuner(true);
$("ct-reset").onclick = () => {
  if (_scope === "global") CamTune.resetGlobal();
  else CamTune.reset(curMode());
  CamTune.persist(); applyLive(); refreshCamTunePanel();
};
$("ct-reset-all").onclick = () => { CamTune.resetAll(); CamTune.persist(); applyLive(); refreshCamTunePanel(); $("ct-json").hidden = true; };
$("ct-help-on").onchange = () => {
  document.getElementById("camtune-inner").classList.toggle("lt-show-help", $("ct-help-on").checked);
};
$("ct-prev-monza").onclick = () => previewCorner("monza");
$("ct-prev-spa").onclick = () => previewCorner("spa");
$("ct-prev-monaco").onclick = () => previewCorner("monaco");
$("ct-copy").onclick = () => {
  const btn = $("ct-copy");
  const pack = CamTune.exportPack();
  const hasModes = pack.modes && Object.keys(pack.modes).length;
  const hasGlobal = pack.global && Object.keys(pack.global).length;
  const hasComfort = pack.comfort && Object.keys(pack.comfort).length;
  if (!hasModes && !hasGlobal && !hasComfort) {
    btn.textContent = "NOTHING TUNED";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
    return;
  }
  // Dual export: readable CameraEdits snippet (modes) + pack JSON + share code.
  const lines = [];
  if (hasModes) {
    const S = pack.modes;
    const keys = Object.keys(S);
    const mode = curMode();
    const entry = (k) => '  "' + k + '": ' + JSON.stringify(S[k], null, 2).replace(/\n/g, "\n  ");
    lines.push("window.CameraEdits = {");
    if (keys.includes(mode)) {
      lines.push("  // THIS MODE — " + curLabel().toUpperCase() +
        "  (" + Object.keys(S[mode]).length + " tuned)");
      lines.push(entry(mode) + (keys.length > 1 ? "," : ""));
    } else {
      lines.push("  // THIS MODE — nothing tuned here yet");
    }
    const rest = keys.filter((k) => k !== mode);
    if (rest.length) {
      lines.push("  // EVERY OTHER TUNED MODE — " + rest.length +
        (rest.length === 1 ? " mode" : " modes"));
      rest.forEach((k, i) => lines.push(entry(k) + (i < rest.length - 1 ? "," : "")));
    }
    lines.push("};");
    lines.push("");
  }
  lines.push("// Pack (JSON) — paste into IMPORT, or use the share code below");
  lines.push(JSON.stringify(pack));
  lines.push("");
  lines.push("// Share code");
  lines.push(CamTune.encodeShare(pack));
  const json = lines.join("\n");
  const ta = $("ct-json");
  ta.readOnly = false;
  ta.value = json; ta.hidden = false;
  ta.focus(); ta.setSelectionRange(0, json.length);
  const flash = (good) => {
    btn.textContent = good ? "COPIED ✓" : "SELECT & COPY ↑";
    setTimeout(() => { btn.textContent = "COPY VALUES"; }, 1800);
  };
  ApexClipboard.write(json, { preferSync: true }).then(flash);
};
_refresh = () => { if (isOpen()) refreshCamTunePanel(); };
return { buildCamTunePanel, refreshCamTunePanel, openCamTuner, closeCamTuner, isOpen };
}

return { create, refresh: () => { if (_refresh) _refresh(); } };
})();
Object.freeze(CamTunerEditor);
