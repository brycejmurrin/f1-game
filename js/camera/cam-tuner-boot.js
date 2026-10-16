/* Apex 26 — CAMERA TUNER boot stub (FULL). The pause-menu panel is
   CamTunerEditor in LAZY_CAM_EDITOR; game.js still calls CamTunerPanel.create. */
const CamTunerPanel = (function () {
"use strict";

let _real = null, _refresh = null;

function create(G) {
  Log.info("game", "CamTunerPanel.create");
  const { $ } = G;
  function ensure() {
    if (_real) return Promise.resolve(_real);
    const load = (typeof FlybyPanel !== "undefined" && FlybyPanel.ensureCamEditor)
      ? FlybyPanel.ensureCamEditor()
      : Promise.resolve(typeof CamTunerEditor !== "undefined");
    return load.then((ok) => {
      if (!ok || typeof CamTunerEditor === "undefined") return null;
      if (!_real) _real = CamTunerEditor.create(G);
      return _real;
    });
  }
  if ($("pm-camtune")) $("pm-camtune").onclick = () => { ensure().then((r) => { if (r && r.openCamTuner) r.openCamTuner(); }); };
  _refresh = () => { if (typeof CamTunerEditor !== "undefined" && CamTunerEditor.refresh) CamTunerEditor.refresh(); };
  return {
    buildCamTunePanel: () => ensure().then((r) => r && r.buildCamTunePanel && r.buildCamTunePanel()),
    refreshCamTunePanel: () => { if (_real) _real.refreshCamTunePanel(); },
    openCamTuner: () => ensure().then((r) => { if (r && r.openCamTuner) r.openCamTuner(); }),
    closeCamTuner: (show) => { if (_real) _real.closeCamTuner(show); },
    isOpen: () => !!(!_real ? false : _real.isOpen && _real.isOpen()),
  };
}

return { create, refresh: () => { if (_refresh) _refresh(); } };
})();
Object.freeze(CamTunerPanel);
