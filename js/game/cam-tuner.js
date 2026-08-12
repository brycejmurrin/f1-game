/* Apex 26 — the CAMERA TUNER pause-menu panel: a chip per player camera mode
   plus a slider per knob from CamTune.defs(), so each of the 13 cameras carries
   its own framing (a chase cam pulled back 2 m does not move the hood cam).
   Docked right like the LIGHTING TUNER — the live view behind the panel IS the
   preview, and every slider snaps the camera immediately so you see the angle
   you are dialling instead of watching it damp there.

   The mode being EDITED is always the mode you are looking through: the chips
   switch the live camera (same call as the CAM button) and the sliders follow.
   One thing on screen, one thing being tuned.

   Values/store/apply live in js/game/cam-tune.js (CamTune); live state comes
   through the ctx façade G handed to CamTunerPanel.create(G). Consumes globals
   CamTune + GameTables. Must load BEFORE js/game.js. */
const CamTunerPanel = (function () {
  "use strict";

// Set by create(). Lets game.js nudge the panel (setCamMode) through the module
// global instead of a const that would still be in its temporal dead zone when
// setCamMode first runs at boot.
let _refresh = null;

function create(G) {
const { $, els } = G;
const { CAM_MODES } = GameTables;
const DEFS = CamTune.defs();

// The mode under the crosshair == the mode being edited (see header).
function curMode() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).id; }
function curLabel() { return (CAM_MODES[G.camMode] || CAM_MODES[0]).label; }
function fmtCt(d, v) {
  const dec = (String(d.step).split(".")[1] || "").length;
  const s = Math.abs(v).toFixed(Math.min(dec, 2));
  // A bidirectional knob (min < 0) shows its sign; a 0..N knob (CORNER LEAD)
  // reads as a plain magnitude.
  const sign = (v > 0 && d.min < 0) ? "+" : v < 0 ? "−" : "";
  return sign + s + d.unit;
}
// A knob may be limited to certain camera modes (CORNER LEAD → chase/far). No
// `modes` list means it applies everywhere.
function knobApplies(d, mode) { return !d.modes || d.modes.indexOf(mode) !== -1; }
// Re-snap rather than let the damping walk there: at λ14 a slider drag would
// read as a lag between the thumb and the picture, which is exactly the thing
// you cannot judge a camera angle through.
function applyLive() {
  if (G.player && G.track) G.snapGameCam();
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
        b.textContent = c.label; b.setAttribute("role", "tab");
        b.onclick = () => { G.setCamMode(i); applyLive(); refreshCamTunePanel(); };
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
// Name the camera being edited and how many of its knobs are off default, so
// "why does this slider do nothing" is answered before it is asked.
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
    // Hide a knob that doesn't apply to the mode under edit (CORNER LEAD is only
    // meaningful on chase/far), so the panel only ever shows live controls.
    if (row) row.style.display = knobApplies(d, mode) ? "" : "none";
  }
  updateCtProfileLabel();
}
function isOpen() { return !$("camtune").hidden; }
function openCamTuner() {
  buildCamTunePanel();
  $("camtune").hidden = false;
  document.body.classList.add("lt-open");   // hide race HUD + touch controls underneath
  els.pmsettings.hidden = true;             // unobstructed live preview (opened from settings)
  applyLive();
}
function closeCamTuner(showPauseMenu) {
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
