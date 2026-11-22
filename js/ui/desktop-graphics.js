/* Per-effect graphics preferences. Renderer and world builders consume one snapshot per boot. */
(() => {
  "use strict";
  const panel = document.getElementById("pm-panel-graphics");
  if (!panel || typeof GLX === "undefined" || panel.querySelector("[data-desktop-graphics]")) return;
  const values = [["", "Use preset"], ["on", "On"], ["off", "Off"]];
  const groups = {
    "Image quality": {
      msaa: "Multisample anti-aliasing", traa: "Temporal anti-aliasing", superSample: "1.5× supersampling",
      hdrOut: "HDR output", agx: "AgX tone mapping", anisotropy: "16× texture filtering",
      mirrorHi: "High-resolution rear-view mirror",
    },
    "Lighting and reflections": {
      sunMap: "High-resolution sun shadows", carMap: "High-resolution car shadows", csm: "Cascaded sun shadows",
      lampShadows: "Floodlight shadows", lightsHi: "Extended light count", raysHi: "High-quality light shafts",
      ssaoHi: "High-quality ambient occlusion", gtao: "Ground-truth ambient occlusion", ssrHi: "High-quality screen-space reflections",
      ssgi: "Screen-space indirect lighting", envProbe: "Environment reflection probe", envMap: "High-resolution reflection probe",
      envAll: "World metal reflections", skyAtmo: "Atmospheric sky",
    },
    "Cars and scenery": {
      meshHi: "Car mesh detail", heroCar: "Modelled player car parts", liveryHi: "High-resolution liveries",
      carSurf: "Car surface detail", rivalLod: "Rival detail distance", matDetail: "Detailed material shading",
      hexTiling: "Randomized ground texture tiling", wallBlend: "Blended wall textures", detailNormal: "Fine surface normals",
      gravelRelief: "Gravel parallax",
      packHd: "HD material textures", crowd3d: "3D spectators", treesHi: "High-detail trees", kerbProfile: "Modelled kerbs",
      farTerrain: "Distant terrain", density: "Scenery density", propsHi: "Trackside prop detail",
      garageHi: "Garage detail", crewHi: "Pit crew detail",
    },
    "Cinema · garage, photo and replay": { dof: "Depth of field", motionBlur: "Motion blur", ss2x: "2× cinema supersampling" },
  };
  function add(parent, tag, text) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  const fold = add(panel, "details");
  fold.dataset.desktopGraphics = "";
  fold.className = "pm-renderer-sub";
  add(fold, "summary", "Graphics details").className = "adv-more-btn";
  fold.addEventListener("toggle", () => {
    if (!fold.open || fold.children.length > 1) return;
    const store = GameStore.store;
    const key = GfxQuality.choicesKey();
    const choices = { ...store.get(key, {}) };
    const help = GLX.isMobile ? "Use preset follows Graphics. Higher detail can reduce frame rate. Texture filtering and atmospheric sky use the three.js renderer."
      : "Use preset follows Graphics. Some effects require three.js WebGPU or a compatible display.";
    const body = add(fold, "div");
    body.id = "pm-graphics-details-body";
    add(body, "p", help + " Changes take effect after reloading.").className = "adv-help";
    const rows = [];
    const status = document.createElement("p");
    status.className = "adv-help";
    status.setAttribute("role", "status");
    function save() {
      const ok = store.set(key, { ...choices });
      status.textContent = ok === false ? "Could not save graphics settings." : "Saved for the next reload.";
    }
    for (const [title, options] of Object.entries(groups)) {
      const available = Object.entries(options).filter(([name]) => GfxQuality.supportsOption(name));
      if (!available.length) continue;
      add(body, "h3", title).className = "pm-group-h";
      for (const [key, name] of available) {
        const { row, sel } = SettingRow.build("desktop-detail-" + key, name, values);
        sel.dataset.effect = key;
        body.appendChild(row);
        SettingRow.wire(row, {
          read: () => typeof choices[key] === "boolean" ? (choices[key] ? "on" : "off") : "",
          write(value) {
            if (value) choices[key] = value === "on";
            else delete choices[key];
            save();
          },
        });
        rows.push(row);
      }
    }
    const reset = add(body, "button", "Use preset for all");
    reset.type = "button";
    reset.onclick = () => {
      for (const key of Object.keys(choices)) delete choices[key];
      for (const row of rows) SettingRow.paint(row, "");
      save();
    };
    const reload = add(body, "button", "Reload to apply");
    reload.type = "button";
    reload.onclick = () => {
      if (document.body.dataset.race === "1") status.textContent = "Return to the title screen before reloading.";
      else location.reload();
    };
    body.appendChild(status);
  });
})();
