/* Find settings by player terms. Navigation only: never writes a preference. */
const SettingsSearch = (function () {
  "use strict";
  const CATALOG = Object.freeze([
    ["steering", "Steering input", "controls", "pm-steer-sel", "tilt touch buttons keyboard wheel"],
    ["gears", "Manual gears", "driving", "pm-gears-sel", "shift automatic transmission"],
    ["aero", "Active aero", "driving", "pm-aero-sel", "wing manual automatic drs"],
    ["keys", "Keyboard bindings", "controls", "pm-keys", "rebind keys controls"],
    ["pad", "Controller bindings", "controls", "pm-pad", "gamepad buttons wheel"],
    ["coach", "Driving coach", "driving", "pm-coach-sel", "tips advice braking"],
    ["brake-cue", "Braking cue", "driving", "pm-linebrakecue-sel", "braking beep warning"],
    ["pit", "Next pit-stop tyres", "strategy", "pm-pit-choice-sel", "compound tires strategy"],
    ["hud", "HUD style", "display", "pm-hudprofile-sel", "broadcast minimal"],
    ["hud-size", "HUD size", "display", "pm-hudscale", "bigger smaller scale readouts"],
    ["map", "Track map", "display", "pm-hudmap-sel", "minimap"],
    ["gaps", "Gap readouts", "display", "pm-hudgaps-sel", "timing intervals"],
    ["ui-size", "Interface size", "appearance", "pm-uiscale", "menus text bigger smaller zoom"],
    ["motion", "Reduce motion", "a11y", "pm-motion-sel", "shake flyby animation comfort"],
    ["focus", "Keyboard focus", "a11y", "pm-focus-sel", "outline ring accessibility"],
    ["colour", "Colourblind cues", "a11y", "pm-cbcues-sel", "colorblind tyre flags accessibility"],
    ["assist", "Steer assist", "driving", "pm-linemode-sel", "steering help racing line"],
    ["line", "Steering line bias", "advanced", "pm-line", "steer assist inside outside racing line offset"],
    ["throttle", "Throttle mode", "controls", "pm-throttlemode-sel", "automatic manual pedals"],
    ["handedness", "Left-handed controls", "controls", "pm-mirror-sel", "mirror touch pedals hand"],
    ["tilt-calibration", "Recalibrate tilt", "controls", "pm-calib", "phone sensor center centre"],
    ["phone-controller", "Phone controller pairing", "controls", "pm-phonepad", "qr code remote second screen"],
    ["stick-calibration", "Calibrate controller stick", "controls", "pm-pad-calib", "gamepad drift center centre"],
    ["wheel", "Wheel setup", "controls", "pm-pad-wheel", "steering wheel pedals calibration"],
    ["predictive-cue", "Predictive braking cue", "driving", "pm-brakecue", "brake warning distance"],
    ["practice", "Practice goals and checkpoints", "practice", "pm-practice-panel", "rewind retry save starting point unscored"],
    ["strategy", "Pit strategy", "strategy", "pm-pit-panel", "tyres tires stint energy forecast"],
    ["review", "Session review", "review", "pm-session-review", "incidents coaching transcript race data download"],
    ["badges", "Driving badges", "progress", "pm-badges-panel", "licence license achievements progress"],
    ["hud-visible", "Show HUD", "display", "pm-hidehud-sel", "hide interface readouts"],
    ["hud-layout", "HUD readout layout", "display", "pm-hudmetrics-sel", "timing driver compact"],
    ["mirror", "Rear-view mirror", "display", "pm-hudmirror-sel", "rear view camera"],
    ["line-colour", "Driving line colour", "display", "pm-linecolor-sel", "visual guide color"],
    ["line-opacity", "Driving line opacity", "display", "pm-lineopacity-sel", "visual guide transparent"],
    ["touch-size", "Touch button size", "display", "pm-btnscale", "bigger smaller pedals arrows"],
    ["touch-opacity", "Touch button opacity", "display", "pm-btnopacity", "transparent pedals arrows"],
    ["panel-opacity", "HUD panel opacity", "display", "pm-panelopacity", "transparent readouts"],
    ["resolution", "Resolution", "graphics", "pm-res-sel", "render scale performance quality pixels"],
    ["fullscreen", "Fullscreen", "graphics", "pm-fullscreen-sel", "full screen window"],
    ["upscale", "Upscaling", "graphics", "pm-upscale-sel", "resolution sharpness performance"],
    ["occlusion", "Occlusion culling", "graphics", "pm-occlusion-sel", "hidden objects performance"],
    ["debris", "Debris", "graphics", "pm-debris-sel", "damage pieces performance"],
    ["background-build", "Background build", "graphics", "pm-buildworker-sel", "worker loading performance"],
    ["renderer", "Renderer backend", "graphics", "pm-renderer", "webgl webgpu graphics troubleshooting"],
    ["lighting-tuner", "Lighting tuner", "visual", "pm-lighting", "sun shadows exposure visual studio"],
    ["camera-tuner", "Camera tuner", "visual", "pm-camtune", "framing field view fov visual studio"],
    ["flyby-editor", "Flyby shot editor", "visual", "pm-flyby", "cinematic cameras visual studio"],
    ["arrival-tuner", "Garage arrival tuner", "visual", "pm-garrival", "pit animation visual studio"],
    ["theme", "Interface theme", "appearance", "pm-uitheme-sel", "dark light system colours colors"],
    ["text-size", "Text size", "appearance", "pm-textsize-sel", "readability font larger"],
    ["contrast", "High contrast", "appearance", "pm-contrast-sel", "readability accessibility"],
    ["units", "Speed units", "appearance", "pm-units-sel", "mph kmh kilometres miles"],
    ["help-text", "Help text", "appearance", "pm-helptext-sel", "explanations descriptions hints"],
    ["tilt-sensitivity", "Tilt sensitivity", "controls", "pm-tiltsimple", "phone steering"],
    ["stick-deadzone", "Stick dead zone", "advanced", "pm-paddz", "controller gamepad drift"],
    ["haptics", "Haptics strength", "driving", "pm-haptics", "vibration rumble feedback"],
    ["trigger-haptics", "Trigger haptics", "driving", "pm-triggerhap-sel", "controller vibration feedback"],
    ["pace", "Overall field speed", "advanced", "pm-pace", "pace slower faster whole field"],
    ["spotter", "Spotter", "audio", "as-spot-sel", "nearby cars voice"],
    ["radio-volume", "Radio voice volume", "audio", "as-rvol", "speech engineer loud quiet"],
    ["music-source", "Music source", "audio", "as-src-sel", "soundtrack connection songs"],
    ["music", "Music volume", "audio", "as-mvol", "sound songs soundtrack"],
    ["effects", "Sound effects volume", "audio", "as-svol", "engine tyres tires sounds"],
    ["radio", "Team radio", "audio", "as-radio-sel", "voice engineer speech"],
  ].map((r) => Object.freeze({ id: r[0], label: r[1], page: r[2], target: r[3], aliases: r[4] })));
  function find(query) {
    const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? CATALOG.filter((r) => words.every((w) => (r.label + " " + r.aliases).toLowerCase().includes(w))) : [];
  }
  function reveal(target) {
    if (!target) return false;
    for (let p = target.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
    const control = /^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(target.tagName) ? target
      : target.querySelector("button:not([disabled]),input:not([disabled]),select:not([disabled]),summary");
    if (!control || control.disabled || control.closest("[hidden]")) return false;
    // Device-only controls can be hidden by CSS without [hidden] (desktop
    // STEERING INPUT). focus() silently refuses them, so verify both visibility
    // and the actual focus result before suppressing SettingsNav's fallback.
    if (control.checkVisibility && !control.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
    if (control.getClientRects && control.getClientRects().length === 0) return false;
    control.focus({ preventScroll: true });
    if (document.activeElement !== control) return false;
    control.scrollIntoView({ block: "nearest" });
    return true;
  }
  function create(o) {
    const host = o.host;
    if (!host || host.querySelector("[data-settings-search]")) return null;
    const box = document.createElement("section"); box.setAttribute("data-settings-search", ""); box.className = "settings-find";
    const label = document.createElement("label"); label.textContent = "FIND A SETTING";
    const input = document.createElement("input"); input.type = "search"; input.placeholder = "Try gears, braking beep, HUD size…";
    input.setAttribute("aria-label", "Find a setting"); input.autocomplete = "off";
    label.appendChild(input);
    const list = document.createElement("ul"); list.className = "settings-find-results"; list.setAttribute("aria-label", "Matching settings");
    const note = document.createElement("p"); note.className = "adv-help"; note.setAttribute("role", "status");
    box.append(label, note, list); host.insertBefore(box, host.firstChild);
    let last = null, fromSearch = false, destinationNote = null;
    const clearFeedback = () => { if (destinationNote) destinationNote.remove(); destinationNote = null; };
    if (o.onLeave) o.onLeave(clearFeedback);
    function unavailable(row) {
      clearFeedback();
      const message = row.label + " is unavailable in the current session or on this device. BACK returns to your search.";
      const panel = typeof SettingsNav !== "undefined" && SettingsNav.panel
        ? SettingsNav.panel(row.page)
        : document.querySelector("#" + (row.page === "advanced" ? "advanced" : row.page === "audio" ? "audioset" : "pm-panel-" + row.page));
      if (panel) {
        destinationNote = document.createElement("p"); destinationNote.className = "adv-help";
        destinationNote.setAttribute("role", "status"); destinationNote.textContent = message;
        panel.insertBefore(destinationNote, panel.firstChild);
      }
      if (typeof LiveRegion !== "undefined") LiveRegion.say(message, "hud");
    }
    function paint() {
      list.replaceChildren();
      const matches = find(input.value);
      note.textContent = input.value.trim() ? matches.length + " matching settings" : "Search names or everyday terms. Your settings stay as they are.";
      for (const row of matches) {
        const li = document.createElement("li"), button = document.createElement("button");
        button.type = "button"; button.className = "sel-chip"; button.textContent = row.label + " · " + row.page.toUpperCase();
        button.dataset.settingResult = row.id;
        button.onclick = () => {
          last = row.id; fromSearch = true; clearFeedback();
          o.show(row.page, true, () => {
            if (o.onSelect) o.onSelect(row.page);
            const placed = reveal(document.querySelector("#" + row.target));
            if (!placed) unavailable(row);
            return placed;
          });
        };
        li.appendChild(button); list.appendChild(li);
      }
    }
    input.oninput = paint;
    paint();
    return Object.freeze({
      restore() {
        if (!fromSearch) return false;
        fromSearch = false; clearFeedback();
        const button = [...list.querySelectorAll("button")].find((b) => b.dataset.settingResult === last);
        (button || input).focus({ preventScroll: true });
        return true;
      },
      input,
    });
  }
  return Object.freeze({ CATALOG, find, reveal, create });
})();
