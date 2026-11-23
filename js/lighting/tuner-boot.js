/* The lighting editor is a Visual Studio destination. The game can refresh or
   tear down its UI during a race that has never opened the editor. */
const LightingTunerDoor = (function () {
  "use strict";
  function create(G) {
    let panel = null;
    async function ensure() {
      if (panel) return panel;
      if (typeof TunerPanel === "undefined") {
        if (typeof ScriptLoader === "undefined") return null;
        await ScriptLoader.create().load(["js/lighting/tuner-panel.js"], [], { strict: true });
        if (typeof TunerPanel === "undefined") return null;
      }
      if (!panel) {
        panel = TunerPanel.create(G);
        opener.bind();
      }
      return panel;
    }
    const opener = FlybyPanel.createEditorOpener(G, "pm-lighting", ensure, "openLightTuner");
    return {
      refreshLightTunePanel() { if (panel) panel.refreshLightTunePanel(); },
      closeLightTuner(show) { opener.cancel(); if (panel) panel.closeLightTuner(show); },
    };
  }
  return { create };
})();
Object.freeze(LightingTunerDoor);
