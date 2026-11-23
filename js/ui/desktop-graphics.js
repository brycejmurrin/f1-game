/* Per-effect graphics preferences. Renderer and world builders consume one snapshot per boot. */
const DesktopGraphics = (() => {
  "use strict";
  const groups = {
    "Image quality": {
      msaa: ["Multisample anti-aliasing", "Samples the edges of geometry several times per pixel to smooth jagged outlines."],
      traa: ["Temporal anti-aliasing", "Combines samples from successive frames to reduce shimmer as the camera moves."],
      superSample: ["1.5× supersampling", "Renders the scene at 1.5× resolution before scaling it down. Distant edges look smoother at a higher GPU cost."],
      hdrOut: ["HDR output", "Shows a wider range of brightness on compatible HDR displays, especially in bright highlights."],
      agx: ["AgX tone mapping", "Rolls bright colours into highlights more gradually so lit surfaces retain detail."],
      anisotropy: ["16× texture filtering", "Keeps painted lines and road textures sharper when you look along the track at a shallow angle."],
      mirrorHi: ["High-resolution rear-view mirror", "Draws the mirror at a higher resolution so cars behind you look clearer."],
    },
    "Lighting and reflections": {
      sunMap: ["High-resolution sun shadows", "Gives sun-cast shadows finer edges. Look at the shadows from barriers and fencing."],
      carMap: ["High-resolution car shadows", "Adds detail to the shadow cast by the car, especially around the wheels and wings."],
      csm: ["Cascaded sun shadows", "Divides the sun shadow map by distance so nearby shadows can stay detailed over a longer view."],
      lampShadows: ["Floodlight shadows", "Lets floodlights cast shadows during night sessions."],
      brakeLightSpill: ["Brake heat lighting", "After dark, hot front brakes light the area around the wheels. With per-chunk lighting, ground illumination requires three.js. Automatic on desktop High and above."],
      lightsHi: ["Extended light count", "Allows more lights to illuminate the scene at once, especially around floodlit sections."],
      raysHi: ["High-quality light shafts", "Uses more samples to smooth the shafts of light visible through the air."],
      ssaoHi: ["High-quality ambient occlusion", "Adds finer shading where surfaces meet, such as beneath the car."],
      gtao: ["Ground-truth ambient occlusion", "Estimates how much nearby geometry blocks ambient light for more defined creases and contact shadows."],
      ssrHi: ["High-quality screen-space reflections", "Traces reflections in greater detail using objects visible on screen. Look at wet asphalt."],
      ssgi: ["Screen-space indirect lighting", "Uses visible surfaces to estimate bounced light and colour on nearby objects."],
      envProbe: ["Environment reflection probe", "Captures the surroundings for reflections that change as the car moves."],
      envMap: ["High-resolution reflection probe", "Captures more detail in the environment map used by reflective surfaces."],
      envAll: ["World metal reflections", "Lets metal surfaces around the circuit reflect their surroundings."],
      garageProbeParallax: ["Garage reflections", "Aligns reflections on the car with the walls of its garage bay as you orbit. Requires desktop three.js with hardware WebGPU. Off by default."],
      skyAtmo: ["Atmospheric sky", "Models how sunlight scatters through the air, changing the sky colour near the horizon."],
    },
    "Weather and debris": {
      gravelDebris: ["Loose gravel", "Rear tyres throw small bouncing stones when a car enters gravel runoff at speed. Automatic on desktop High and above."],
      rainCurtains: ["Distant showers", "Shows the rain falling over a wet section of the circuit during a moving local shower. Off by default."],
    },
    "Cars and scenery": {
      adaptiveModels: ["Adaptive rival models", "Keeps rivals in their detailed models farther away when rendering above 720p with spare frame time. Automatic on desktop High and above."],
      rivalLiveryLod: ["Distant team colours", "Keeps two livery colours visible when rivals switch to simplified models farther down the track. Off by default."],
      circuitSurfaces: ["Silverstone surface detail", "Shows worn asphalt, resurfaced patches and scuffed kerb paint at Silverstone with the three.js renderer. Off by default."],
      tyreWearVisual: ["Visible tyre wear", "Shows scuffing as tyres wear. Preview fresh and worn tyres in the garage. Off by default."],
      meshHi: ["Car mesh detail", "Uses finer geometry to smooth the outlines of curved bodywork and wheels."],
      heroCar: ["Modelled player car parts", "Adds individually modelled parts to the player car. Look closely at the bodywork in the garage."],
      liveryHi: ["High-resolution liveries", "Uses sharper livery textures so stripes and decals hold their detail up close."],
      carSurf: ["Car surface detail", "Adds fine surface shading to the bodywork as light moves across it."],
      rivalLod: ["Rival detail distance", "Keeps rival cars in their detailed models farther down the track."],
      matDetail: ["Detailed material shading", "Shows finer differences in how track materials respond to light."],
      hexTiling: ["Randomized ground texture tiling", "Varies ground texture tiles so repeated patches are harder to spot."],
      wallBlend: ["Blended wall textures", "Blends neighbouring wall textures to soften visible seams."],
      detailNormal: ["Fine surface normals", "Adds small bumps to surface shading so fine texture catches the light."],
      gravelRelief: ["Gravel parallax", "Gives gravel apparent depth as you view it from different angles."],
      packHd: ["HD material textures", "Loads higher-resolution material textures to show more detail up close. This uses more graphics memory."],
      crowd3d: ["3D spectators", "Adds three-dimensional spectators to the grandstands."],
      treesHi: ["High-detail trees", "Uses more detailed trees around the circuit."],
      kerbProfile: ["Modelled kerbs", "Gives kerbs a raised, modelled profile that you can see from a low camera angle."],
      farTerrain: ["Distant terrain", "Adds terrain farther from the circuit to fill out the horizon."],
      density: ["Scenery density", "Places more scenery around the track."],
      propsHi: ["Trackside prop detail", "Shows finer detail on trackside objects."],
      garageHi: ["Garage detail", "Adds detail to the garage environment around the parked car."],
      crewHi: ["Pit crew detail", "Shows more detail on the pit crew models."],
    },
    "Cinema · garage, photo and replay": {
      dof: ["Depth of field", "Blurs areas away from the focus distance to draw attention to the subject."],
      motionBlur: ["Motion blur", "Blurs moving details to convey speed in cinematic views."],
      ss2x: ["2× cinema supersampling", "Renders cinematic views at twice the resolution before scaling them down for a cleaner image."],
    },
  };
  let expand;
  function mount() {
    const panel = document.getElementById("pm-panel-graphics");
    if (!panel || typeof GLX === "undefined" || panel.querySelector("[data-desktop-graphics]")) return;
    const values = [["", "Use preset"], ["on", "On"], ["off", "Off"]];
    function add(parent, tag, text) {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      parent.appendChild(el);
      return el;
    }
    if (!GLX.isMobile) {
      const options = [["display", "Display refresh rate"], ["60", "60 FPS"], ["120", "Up to 120 FPS"]];
      const { row, label } = SettingRow.build("pm-desktop-fps", "Race frame rate", options);
      const detail = document.createElement("details");
      label.replaceWith(detail);
      const summary = add(detail, "summary");
      summary.className = "adv-more-btn";
      summary.appendChild(label);
      const note = add(detail, "p", "Display refresh rate draws on each browser frame. Choose 60 FPS for lower GPU use or up to 120 FPS for smoother motion on a high-refresh display. The display and GPU determine the rate you can reach. Changes apply immediately during races.");
      note.className = "adv-help";
      note.dataset.help = "keep";
      panel.insertBefore(row, panel.firstChild);
      SettingRow.wire(row, {
        read: () => RenderRate.desktopTarget(),
        write(value) {
          if (RenderRate.setDesktopTarget(value)) GameStore.store.rawSet("apex26.desktopFpsTarget", value);
        },
      });
    }
    const fold = add(panel, "details");
    fold.dataset.desktopGraphics = "";
    fold.className = "pm-renderer-sub";
    add(fold, "summary", "Graphics details").className = "adv-more-btn";
    let refresh;
    function buildRows() {
      if (!fold.open) return;
      if (refresh) { refresh(); return; }
      const store = GameStore.store;
      const key = GfxQuality.choicesKey();
      function readChoices() { return store.get(key, {}) || {}; }
      const help = GLX.isMobile ? "Use preset follows Graphics. Higher detail can reduce frame rate. Texture filtering and atmospheric sky use the three.js renderer."
        : "Use preset follows Graphics. Some effects require three.js WebGPU or a compatible display.";
      const body = add(fold, "div");
      body.id = "pm-graphics-details-body";
      add(body, "p", help + " Changes take effect after reloading.").className = "adv-help";
      const rows = [];
      const status = document.createElement("p");
      status.className = "adv-help";
      status.setAttribute("role", "status");
      function save(saved) {
        const ok = key === "gfxPhoneFeatureOverrides" ? store.set("gfxPhoneFeatureOverrides", saved) : store.set("gfxFeatureOverrides", saved);
        status.textContent = ok === false ? "Could not save graphics settings." : "Saved for the next reload.";
      }
      for (const [title, options] of Object.entries(groups)) {
        const available = Object.entries(options).filter(([name]) => GfxQuality.supportsOption(name));
        if (!available.length) continue;
        add(body, "h3", title).className = "pm-group-h";
        for (const [effect, [name, explanation]] of available) {
          const { row, label, sel } = SettingRow.build("desktop-detail-" + effect, name, values);
          sel.dataset.effect = effect;
          const detail = document.createElement("details");
          label.replaceWith(detail);
          const summary = add(detail, "summary");
          summary.className = "adv-more-btn";
          summary.appendChild(label);
          const note = add(detail, "p", explanation);
          note.className = "adv-help";
          note.dataset.help = "keep";
          body.appendChild(row);
          const runtime = add(body, "p");
          runtime.className = "adv-help";
          runtime.id = row.id + "-runtime";
          const valueOf = choices => typeof choices[effect] === "boolean" ? (choices[effect] ? "on" : "off") : "";
          function paintRuntime(choice) {
            let reason = "";
            const requested = choice === "on" || (choice === "" && GfxQuality.feature(effect, true));
            if (requested && effect === "garageProbeParallax" && !GLX.garageProbeEnabled)
              reason = GLX.backend !== "three" || !GLX.isWebGPU ? "Inactive on this renderer. Requires hardware WebGPU with three.js." : "Garage reflections are inactive in this session.";
            else if (requested && effect === "hdrOut" && !GLX.hdrOutputActive)
              reason = "This session is displaying standard dynamic range.";
            else if (choice !== "off" && GfxQuality.shedFeature(effect))
              reason = "Temporarily reduced to maintain frame rate.";
            runtime.hidden = !reason;
            runtime.textContent = reason;
            if (reason) sel.setAttribute("aria-describedby", runtime.id);
            else sel.removeAttribute("aria-describedby");
          }
          SettingRow.wire(row, {
            read: () => valueOf(readChoices()),
            write(value) {
              const saved = { ...readChoices() };
              if (value) saved[effect] = value === "on";
              else delete saved[effect];
              save(saved);
            },
          });
          const repaint = choices => {
            const value = valueOf(choices);
            SettingRow.paint(row, value);
            paintRuntime(value);
          };
          detail.addEventListener("toggle", () => paintRuntime(valueOf(readChoices())));
          rows.push(repaint);
        }
      }
      const reset = add(body, "button", "Use preset for all");
      reset.type = "button";
      refresh = () => {
        const choices = readChoices();
        for (const repaint of rows) repaint(choices);
      };
      document.addEventListener("apex-graphics-shed", () => { if (fold.open && !panel.hidden) refresh(); });
      store.subscribe(change => {
        if (fold.open && (change.key == null || change.key === key || change.key === "gfxPreset")) refresh();
      });
      refresh();
      reset.onclick = () => save({});
      const reload = add(body, "button", "Reload to apply");
      reload.type = "button";
      reload.onclick = () => {
        if (document.body.dataset.race === "1") status.textContent = "Return to the title screen before reloading.";
        else location.reload();
      };
      body.appendChild(status);
    }
    fold.addEventListener("toggle", buildRows);
    expand = () => { fold.open = true; buildRows(); };
  }

  let indexed = false;
  function indexSearch() {
    if (indexed || typeof GfxQuality === "undefined") return;
    const options = [];
    for (const [group, entries] of Object.entries(groups)) {
      for (const [key, [label]] of Object.entries(entries)) {
        if (!GfxQuality.supportsOption(key)) continue;
        options.push({
          id: "graphics-" + key, page: "graphics", label, target: "desktop-detail-" + key + "-sel",
          aliases: "graphics details " + group + " " + key,
          navigate: (arrived) => SettingsNav.show("graphics", true, () => {
            mount();
            if (expand) expand();
            return arrived();
          }),
        });
      }
    }
    SettingsSearch.register("graphics-details", options);
    indexed = true;
  }
  return Object.freeze({ mount, indexSearch });
})();
