/* Apex 26 — photo-mode look presets: a transient grade applied while the free camera is open, restored when the visit ends. PhotoKit re-exports the same names. */
const PhotoLooks = (function () {
  "use strict";

  const LOOK_PRESETS = Object.freeze([
    { name: "Clean TV", values: { exposureMul: 1.05, contrast: 1.18, saturation: 1.08, gammaR: 1, gammaG: 1, gammaB: 1, vignette: 0.9, bloomMul: 0.85, fogTint: 0 } },
    { name: "Film", values: { exposureMul: 0.96, contrast: 1.3, saturation: 0.88, gammaR: 1.06, gammaG: 1, gammaB: 0.94, vignette: 0.68, bloomMul: 1.1, fogTint: 0.18 } },
    { name: "Noir", values: { exposureMul: 0.88, contrast: 1.58, saturation: 0, gammaR: 1, gammaG: 1, gammaB: 1, vignette: 0.48, bloomMul: 0.55, fogTint: 0 } },
    { name: "Golden", values: { exposureMul: 1.08, contrast: 1.22, saturation: 1.12, gammaR: 1.1, gammaG: 1.02, gammaB: 0.88, vignette: 0.76, bloomMul: 1.25, fogTint: 0.72 } },
    { name: "Neon Night", values: { exposureMul: 0.94, contrast: 1.4, saturation: 1.42, gammaR: 1.08, gammaG: 0.94, gammaB: 1.14, vignette: 0.58, bloomMul: 1.8, fogTint: -0.8 } },
    { name: "70s", values: { exposureMul: 1.02, contrast: 1.16, saturation: 0.82, gammaR: 1.14, gammaG: 1.04, gammaB: 0.82, vignette: 0.55, bloomMul: 0.92, fogTint: 0.45 } },
  ].map((look) => Object.freeze({ name: look.name, values: Object.freeze(look.values) })));
  const LOOK_KEYS = Object.freeze(Object.keys(LOOK_PRESETS[0].values));

  function createLookSession(get, set) {
    let snapshot = null, selected = null;
    function apply(name) {
      const look = LOOK_PRESETS.find((p) => p.name === name);
      if (!look || typeof get !== "function" || typeof set !== "function") return false;
      if (!snapshot) {
        snapshot = {};
        for (const id of LOOK_KEYS) snapshot[id] = get(id);
      }
      for (const id of LOOK_KEYS) set(id, look.values[id]);
      selected = look.name;
      return true;
    }
    function end() {
      if (!snapshot) return false;
      for (const id of LOOK_KEYS) set(id, snapshot[id]);
      snapshot = null; selected = null;
      return true;
    }
    return Object.freeze({ apply, end, active: () => selected });
  }

  function mountLookControls(parent, session, doc) {
    if (!parent || !session || !doc || typeof doc.createElement !== "function") return null;
    const group = doc.createElement("div");
    group.id = "fc-looks";
    group.className = "balanced-row";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Photo look presets");
    const buttons = [];
    for (const look of LOOK_PRESETS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = look.name.toUpperCase();
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        if (!session.apply(look.name)) return;
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      group.appendChild(button);
    }
    parent.appendChild(group);
    return group;
  }

  return { LOOK_PRESETS, LOOK_KEYS, createLookSession, mountLookControls };
})();
Object.freeze(PhotoLooks);
