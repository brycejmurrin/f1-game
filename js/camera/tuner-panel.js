/* Apex 26 — the CAMERA TUNER pause-menu panel: a chip per player camera mode plus a slider per knob from CamTune.defs(), so each of the 13 cameras carries its own… */
const CamTunerPanel = (function () {
  "use strict";

let _refresh = null;

function create(G) {
Log.info("game", "CamTunerPanel.create");
const { $, els } = G;
const { CAM_MODES } = CamModes;
const DEFS = CamTune.defs();

// The mode under the crosshair == the mode being edited (see header).
function curMode() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).id; }
function curLabel() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).label; }
function fmtCt(d, v) {
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = Math.abs(v).toFixed(Math.min(dec, 2));
  const sign = (v > 0 && d.min < 0) ? "+" : v < 0 ? "−" : "";
  return sign + s + d.unit;
}
function knobApplies(d, mode) { return !d.modes || d.modes.indexOf(mode) !== -1; }
function applyLive() {
  if (G.player && G.track) G.snapGameCam();
}
function selectCamMode(index, focus) {
  G.setCamMode(index);
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
        const mode = curMode();
        CamTune.set(mode, d.id, parseFloat(inp.value));
        CamTune.persist();
        b.textContent = fmtCt(d, CamTune.get(mode, d.id));
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
  document.getElementById("camtune-inner").classList.toggle("lt-show-help", $("ct-help-on").checked);
  refreshCamTunePanel();
}
function updateCtProfileLabel() {
  const host = $("ct-profile"); if (!host) return;
  const n = CamTune.count(curMode());
  host.textContent = curLabel() + (n ? "  (" + n + " tuned)" : "  (default framing)");
  const modes = $("ct-modes");
  if (modes) for (const b of modes.children) {
    const on = b.dataset.mode === curMode();
    b.classList.toggle("on", on);
    b.classList.toggle("tuned", CamTune.count(b.dataset.mode) > 0);
    // These chips carry role="tab" but never announced their selected state —
    // the active camera was invisible to assistive tech (the lighting tuner
    // already sets aria-selected; this matches it).
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
    if (on) {
      b.scrollIntoView({ block: "nearest", inline: "center" });
      $("ct-rows").setAttribute("aria-labelledby", b.id);
    }
  }
}
function refreshCamTunePanel() {
  if (!$("ct-rows").dataset.built) return;
  const mode = curMode();
  for (const d of DEFS) {
    const inp = $("ct-in-" + d.id), b = $("ct-v-" + d.id), row = $("ct-row-" + d.id);
    const v = CamTune.get(mode, d.id);
    if (inp) inp.value = v;
    if (b) b.textContent = fmtCt(d, v);
    if (row) row.style.display = knobApplies(d, mode) ? "" : "none";
  }
  updateCtProfileLabel();
}
function isOpen() { return !$("camtune").hidden; }
function openCamTuner() {
  Log.info("game", "CamTunerPanel.open");
  buildCamTunePanel();
  $("camtune").hidden = false;
  document.body.classList.add("lt-open");   // hide race HUD + touch controls underneath
  els.pmsettings.hidden = true;             // unobstructed live preview (opened from settings)
  applyLive();
}
function closeCamTuner(showPauseMenu) {
  Log.info("game", "CamTunerPanel.close");
  $("camtune").hidden = true;
  document.body.classList.remove("lt-open");
  if (showPauseMenu && G.paused) els.pmsettings.hidden = false;   // back to the settings menu
}
$("pm-camtune").onclick = openCamTuner;
$("ct-close").onclick = () => closeCamTuner(true);
$("ct-reset").onclick = () => { CamTune.reset(curMode()); CamTune.persist(); applyLive(); refreshCamTunePanel(); };
$("ct-reset-all").onclick = () => { CamTune.resetAll(); CamTune.persist(); applyLive(); refreshCamTunePanel(); };
$("ct-help-on").onchange = () => {
  document.getElementById("camtune-inner").classList.toggle("lt-show-help", $("ct-help-on").checked);
};
_refresh = () => { if (isOpen()) refreshCamTunePanel(); };
return { buildCamTunePanel, refreshCamTunePanel, openCamTuner, closeCamTuner, isOpen };
}

return { create, refresh: () => { if (_refresh) _refresh(); } };
})();
