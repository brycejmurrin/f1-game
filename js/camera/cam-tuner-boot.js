/* Apex 26 — CAMERA TUNER boot stub (FULL). The pause-menu panel is
   CamTunerEditor in LAZY_CAM_EDITOR; game.js still calls CamTunerPanel.create. */
const CamTunerPanel = (function () {
"use strict";

let _real = null, _refresh = null;

function create(G) {
  Log.info("game", "CamTunerPanel.create");
  function ensure() {
    if (_real) return Promise.resolve(_real);
    return FlybyPanel.ensureCamEditor().then((ok) => {
      if (!ok || typeof CamTunerEditor === "undefined") return null;
      if (!_real) {
        _real = CamTunerEditor.create(G);
        opener.bind(); // the real editor installs an unguarded button handler.
      }
      return _real;
    });
  }
  const opener = FlybyPanel.createEditorOpener(G, "pm-camtune", ensure, "openCamTuner");
  _refresh = () => { if (typeof CamTunerEditor !== "undefined" && CamTunerEditor.refresh) CamTunerEditor.refresh(); };
  return {
    buildCamTunePanel: () => ensure().then((r) => r && r.buildCamTunePanel && r.buildCamTunePanel()),
    refreshCamTunePanel: () => { if (_real) _real.refreshCamTunePanel(); },
    openCamTuner: opener.open,
    closeCamTuner: (show) => { opener.cancel(); if (_real) _real.closeCamTuner(show); },
    isOpen: () => !!(!_real ? false : _real.isOpen && _real.isOpen()),
  };
}

return { create, refresh: () => { if (_refresh) _refresh(); } };
})();
Object.freeze(CamTunerPanel);
