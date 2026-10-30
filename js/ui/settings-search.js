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
    ["colour-vision", "Colour vision", "appearance", "pm-cvd-sel", "color vision colourblind colorblind palette deuteranopia protanopia tritanopia"],
    ["captions", "Captions", "appearance", "pm-captions-sel", "subtitles hearing speech spotter announcer on screen text"],
    ["caption-size", "Caption size", "appearance", "pm-caption-size-sel", "captions subtitles bigger larger text"],
    ["caption-position", "Caption position", "appearance", "pm-caption-pos-sel", "captions subtitles top bottom placement"],
    ["caption-background", "Caption background", "appearance", "pm-caption-bg-sel", "captions subtitles opacity contrast readability"],
    ["caption-speaker", "Caption speaker colour", "appearance", "pm-caption-speaker-sel", "captions subtitles speaker color name"],
    ["hold-gas", "Gas hold / toggle (keyboard / pad)", "a11y", "pm-hold-throttle-sel", "throttle accelerator hold toggle accessibility"],
    ["hold-lookback", "Look back hold / toggle (keyboard / pad)", "a11y", "pm-hold-lookback-sel", "rear view mirror hold toggle accessibility"],
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
    ["resolution", "Resolution", "graphics", "pm-res-sel", "render scale performance quality pixels graphics picture sharpness"],
    ["fullscreen", "Fullscreen", "graphics", "pm-fullscreen-sel", "full screen window"],
    ["upscale", "Upscaling", "graphics", "pm-upscale-sel", "resolution sharpness performance"],
    ["occlusion", "Occlusion culling", "graphics", "pm-occlusion-sel", "hidden objects performance"],
    ["debris", "Debris", "graphics", "pm-debris-sel", "damage pieces performance"],
    ["ssao", "Ambient occlusion", "graphics", "pm-ssao-sel", "ssao ao contact shadows performance"],
    ["godrays", "God-rays", "graphics", "pm-godrays-sel", "sun shafts volumetric light beams performance"],
    ["background-build", "Background build", "graphics", "pm-buildworker-sel", "worker loading performance"],
    ["renderer", "Renderer backend", "graphics", "pm-renderer", "webgl webgpu graphics troubleshooting"],
    ["lighting-tuner", "Lighting tuner", "visual", "pm-lighting", "sun shadows exposure visual studio"],
    ["camera-tuner", "Camera tuner", "visual", "pm-camtune", "framing field view fov visual studio"],
    ["flyby-editor", "Flyby shot editor", "visual", "pm-flyby", "cinematic cameras visual studio"],
    ["arrival-tuner", "Garage arrival tuner", "visual", "pm-garrival", "pit animation visual studio"],
    ["units", "Speed units", "appearance", "pm-units-sel", "mph kmh kilometres miles"],
    ["help-text", "Help text", "appearance", "pm-helptext-sel", "explanations descriptions hints"],
    ["tilt-sensitivity", "Tilt sensitivity", "controls", "pm-tiltsimple", "phone steering"],
    ["stick-deadzone", "Stick dead zone", "advanced", "pm-paddz", "controller gamepad drift deadzone stick pad wheel centre center"],
    ["haptics", "Haptics strength", "driving", "pm-haptics", "vibration rumble feedback"],
    ["trigger-haptics", "Trigger haptics", "driving", "pm-triggerhap-sel", "controller vibration feedback"],
    ["pace", "Overall field speed", "advanced", "pm-pace", "pace slower faster whole field"],
    ["spotter", "Spotter", "audio", "as-spot-sel", "nearby cars voice"],
    ["radio-volume", "Radio voice volume", "audio", "as-rvol", "speech engineer loud quiet"],
    ["music-source", "Music source", "audio", "as-src-sel", "soundtrack connection songs"],
    ["music", "Music volume", "audio", "as-mvol", "sound songs soundtrack"],
    ["effects", "Sound effects volume", "audio", "as-svol", "engine tyres tires sounds"],
    ["rivals-mute", "Rivals sound on/off", "audio", "as-l-rivals", "mute other cars opponents engines"],
    ["rivals-level", "Rivals engine level", "audio", "as-t-rivals", "volume sound other cars opponents"],
    ["boost-level", "Boost sound level", "audio", "as-t-boost", "ers deploy volume electric whine whoosh"],
    ["boost-pitch", "Boost pitch / rev lift", "audio", "as-t-boostlift", "ers deploy engine tone high ringy"],
    ["radio", "Team radio", "audio", "as-radio-sel", "voice engineer speech"],
  ].map((r) => Object.freeze({ id: r[0], label: r[1], page: r[2], target: r[3], aliases: r[4] })));
  // Owners register descriptors without loading their controls. Re-registration
  // replaces only that owner's rows; disposing an old registration is harmless.
  const owners = new Map(), subscribers = new Set();
  const PAGES = new Set(["controls", "driving", "display", "appearance", "a11y", "advanced", "audio", "files"]);
  // Catalog concat and option-label walks were repeated on every keystroke.
  let rowCache = null;
  const optionText = new Map();
  function allRows() {
    if (!rowCache) rowCache = CATALOG.concat(...owners.values());
    return rowCache;
  }
  function optionSig(el) {
    return (el._srKey || "") + ":" + (el.children ? el.children.length : 0);
  }
  function register(owner, descriptors) {
    if (typeof owner !== "string" || !owner || !Array.isArray(descriptors)) throw new TypeError("Settings search owner and descriptors required");
    const rows = descriptors.map((r) => {
      if (!r || typeof r.id !== "string" || !/^[a-z0-9_-]+$/i.test(r.id) || typeof r.label !== "string" || !r.label.trim()
          || typeof r.target !== "string" || !/^[a-z][a-z0-9_-]*$/i.test(r.target) || (!PAGES.has(r.page) && typeof r.navigate !== "function")) throw new TypeError("Invalid settings search descriptor");
      return Object.freeze({ ...r, aliases: String(r.aliases || ""), owner });
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new TypeError("Duplicate settings search id");
    for (const row of rows) if (CATALOG.some((r) => r.id === row.id) || [...owners].some(([id, existing]) => id !== owner && existing.some((r) => r.id === row.id))) throw new TypeError("Settings search id already owned");
    owners.set(owner, rows);
    rowCache = null;
    for (const fn of subscribers) fn();
    return () => { if (owners.get(owner) === rows) { owners.delete(owner); rowCache = null; for (const fn of subscribers) fn(); } };
  }
  function optionsOf(row) {
    // Read labels only. Never select an option, dispatch change, or ensure a
    // lazy bundle merely to answer a query. A select's joined option text is
    // cached until its SettingRow key or child count changes, so the next
    // keystroke does not walk those labels again. A missing id is looked up
    // again so a control mounted later can still match.
    const extra = typeof row.options === "function" ? String(row.options() || "") : String(row.options || "");
    const hit = optionText.get(row.target);
    if (hit && hit.el && hit.el.isConnected !== false && optionSig(hit.el) === hit.sig) return hit.labels + " " + extra;
    const target = typeof document !== "undefined" && document.querySelector ? document.querySelector("#" + row.target) : null;
    if (!target || target.tagName !== "SELECT") {
      optionText.set(row.target, { el: null, sig: "", labels: "" });
      return extra;
    }
    const labels = [...target.children].map((o) => o.textContent || "").join(" ");
    optionText.set(row.target, { el: target, sig: optionSig(target), labels });
    return labels + " " + extra;
  }
  function find(query) {
    const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const r of allRows()) {
      const base = (r.label + " " + r.aliases).toLowerCase();
      if (words.every((w) => base.includes(w))) { out.push(r); continue; }
      const haystack = (base + " " + optionsOf(r)).toLowerCase();
      if (words.every((w) => haystack.includes(w))) out.push(r);
    }
    return out;
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
      if (!panel) note.textContent = row.unavailableReason || message;
      if (typeof LiveRegion !== "undefined") LiveRegion.say(row.unavailableReason || message, "hud");
    }
    const slots = new Map();
    function slotFor(row) {
      let slot = slots.get(row.id);
      if (slot) return slot;
      const li = document.createElement("li"), button = document.createElement("button");
      button.type = "button"; button.className = "sel-chip";
      button.dataset.settingResult = row.id;
      li.appendChild(button);
      slot = { li, button, row: null };
      slots.set(row.id, slot);
      return slot;
    }
    function armResult(slot, row) {
      if (slot.row === row) return;
      slot.row = row;
      const route = typeof SettingsNav !== "undefined" && SettingsNav.routes && SettingsNav.routes[row.page];
      const label = row.label + " · " + (route ? route.title : row.page.toUpperCase());
      if (slot.button.textContent !== label) slot.button.textContent = label;
      slot.button.onclick = () => {
        clearFeedback();
        // Navigation ownership is committed only after the destination won
        // the lazy generation race. A cancelled audio request owns no BACK.
        const arrived = () => {
          last = row.id; fromSearch = true;
          if (o.onSelect) o.onSelect(row.page);
          const placed = reveal(document.querySelector("#" + row.target));
          if (!placed) unavailable(row);
          return placed;
        };
        if (typeof row.navigate === "function") { if (row.navigate(arrived) === false) unavailable(row); }
        else o.show(row.page, true, arrived);
      };
    }
    function paint() {
      const matches = find(input.value);
      const caption = input.value.trim() ? matches.length + " matching settings" : "Search names or everyday terms. Your settings stay as they are.";
      if (note.textContent !== caption) note.textContent = caption;
      // Reuse the row nodes. replaceChildren() on every input dropped and
      // reallocated a button per match (often dozens for a one-letter query).
      const keep = [];
      for (const row of matches) {
        const slot = slotFor(row);
        armResult(slot, row);
        keep.push(slot.li);
      }
      const kids = list.children;
      for (let i = 0; i < keep.length; i++) {
        if (kids[i] === keep[i]) continue;
        if (keep[i].parentNode) keep[i].remove();
        list.insertBefore(keep[i], kids[i] || null);
      }
      while (list.children.length > keep.length) list.children[list.children.length - 1].remove();
    }
    input.oninput = paint;
    subscribers.add(paint);
    paint();
    return Object.freeze({
      restore() {
        if (!fromSearch) return false;
        fromSearch = false; clearFeedback();
        const button = [...list.querySelectorAll("button")].find((b) => b.dataset.settingResult === last);
        const target = button || input;
        target.focus({ preventScroll: true });
        if (target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
        return document.activeElement === target;
      },
      cancel() { fromSearch = false; clearFeedback(); },
      // A fresh Settings session starts unfiltered (UI hunt 2026-10-29 #5);
      // restore() still brings a result page BACK to the query within one.
      reset() { fromSearch = false; clearFeedback(); if (input.value) { input.value = ""; paint(); } },
      dispose() { subscribers.delete(paint); clearFeedback(); box.remove(); },
      input,
    });
  }
  return Object.freeze({ CATALOG, register, find, reveal, create });
})();
