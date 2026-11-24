/* Find settings by player terms. Navigation only: never writes a preference. */
const SettingsSearch = (function () {
  "use strict";
  const CATALOG = Object.freeze([
    ["steering", "Steering input", "controls", "pm-steer-sel", "tilt touch buttons keyboard wheel"],
    ["steering-return", "Steering return rate", "advanced", "pm-steerreturn", "digital steering keyboard d-pad arrow recenter centre center release speed unwind"],
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
    ["appearance-arrange-screen", "Arrange a screen", "appearance", "appearance-arrange-screen", "menu arrangement layout screen picker move resize buttons text size"],
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
    ["wheel-lock", "Wheel lock & ABS", "driving", "pm-wheelmodel-sel", "abs anti lock traction control tc brake lock wheelspin wheel state"],
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
    ["touch-response", "Touch button response", "controls", "pm-touch-response", "left right arrows steer gas throttle brake pedal slide progressive travel distance input pressure button brightness opacity feedback wheelspin lockup direction start endpoint hold target"],
    ["touch-size", "Touch button size", "display", "pm-btnscale", "bigger smaller pedals arrows"],
    ["touch-opacity", "Touch button opacity", "display", "pm-btnopacity", "transparent pedals arrows"],
    ["touch-shape", "Touch button shape", "display", "pm-btnshape-sel", "round square corners pedals arrows"],
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
    ["pad-gas-deadzone", "Controller gas dead zone", "advanced", "pm-padgasdz", "gamepad trigger throttle pedal calibration wheel"],
    ["pad-brake-deadzone", "Controller brake dead zone", "advanced", "pm-padbrakedz", "gamepad trigger brake pedal calibration wheel"],
    ["stick-deadzone", "Stick dead zone", "advanced", "pm-paddz", "controller gamepad drift deadzone stick pad wheel centre center"],
    ["haptics", "Haptics strength", "driving", "pm-haptics", "vibration rumble feedback"],
    ["trigger-haptics", "Trigger haptics", "driving", "pm-triggerhap-sel", "controller vibration feedback"],
    ["pace", "Overall field speed", "advanced", "pm-pace", "pace slower faster whole field"],
    ["spotter", "Spotter", "audio", "as-spot-sel", "nearby cars voice"],
    ["radio-volume", "Radio voice volume", "audio", "as-rvol", "speech engineer loud quiet"],
    ["files-health", "Storage health and restore points", "files", "pm-files-health", "account storage quota durability cache cleanup recovery history"],
    ["files-save", "Save a backup file", "files", "pm-files-show-save", "export settings garage career saves backup download"],
    ["files-restore", "Restore a backup file", "files", "pm-files-show-restore", "import load settings garage career backup"],
    ["files-share", "Import a share code", "files", "pm-files-show-share", "paste shared code"],
    ["engine-pitch", "Engine pitch", "audio", "as-t-pitch", "rev tone sound"],
    ["engineer-chatter", "Engineer chatter", "audio", "as-chat-sel", "team radio talk engineer"],
    ["battle-tones", "Battle tones", "audio", "as-battle-sel", "cars ahead behind closing opening sounds"],
    ["music-source", "Music source", "audio", "as-src-sel", "soundtrack connection songs"],
    ["music", "Music volume", "audio", "as-mvol", "sound songs soundtrack"],
    ["effects", "Sound effects volume", "audio", "as-svol", "engine tyres tires sounds"],
    ["rivals-mute", "Rivals sound on/off", "audio", "as-l-rivals", "mute other cars opponents engines"],
    ["rivals-level", "Rivals engine level", "audio", "as-t-rivals", "volume sound other cars opponents"],
    ["boost-level", "Boost sound level", "audio", "as-t-boost", "ers deploy volume electric whine whoosh"],
    ["boost-pitch", "Boost pitch / rev lift", "audio", "as-t-boostlift", "ers deploy engine tone high ringy"],
    ["save-backup", "Save a backup", "files", "pm-files-show-save", "export settings garage career save file preferences"],
    ["restore-backup", "Restore a backup", "files", "pm-files-show-restore", "import load settings garage career save file"],
    ["share-code", "Import a share code", "files", "pm-files-show-share", "share settings paste code"],
    ["radio", "Team radio", "audio", "as-radio-sel", "voice engineer speech"],
  ].map((r) => Object.freeze({ id: r[0], label: r[1], page: r[2], target: r[3], aliases: r[4] })));
  // Owners register descriptors only; re-registering replaces that owner's rows.
  const owners = new Map(), subscribers = new Set();

  // Cached: concat and option walks ran per keystroke.
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
          || typeof r.target !== "string" || !/^[a-z][a-z0-9_-]*$/i.test(r.target) || (typeof r.navigate !== "function" && (typeof SettingsNav === "undefined" || !Object.hasOwn(SettingsNav.routes, r.page)))) throw new TypeError("Invalid settings search descriptor");
      return Object.freeze({ ...r, aliases: String(r.aliases || ""), owner });
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new TypeError("Duplicate settings search id");
    for (const row of rows) if (CATALOG.some((r) => r.id === row.id) || [...owners].some(([id, existing]) => id !== owner && existing.some((r) => r.id === row.id))) throw new TypeError("Settings search id already owned");
    owners.set(owner, rows);
    rowCache = null;
    for (const fn of subscribers) fn();
    return () => { if (owners.get(owner) === rows) { owners.delete(owner); rowCache = null; for (const fn of subscribers) fn(); } };
  }
  function registerRaceSettings(settingsNav, raceSettings) {
    const navigate = (arrived) => raceSettings.openSettingSearch(() => settingsNav.returnToSearch(), () => {
      settingsNav.invalidate();
      arrived();
    });
    register("race-settings", [
      { id: "tyre-wear", label: "Tyre wear", page: "race-settings", target: "rs-tyres-sel",
        aliases: "tires degradation pit stops", options: "off light real",
        unavailableReason: "Tyre wear is chosen in Race Settings before starting a solo race.", navigate },
      { id: "driving-line-overlay", label: "Driving line overlay", page: "race-settings", target: "rs-line-sel",
        aliases: "racing line visual guide", options: "off corners full",
        unavailableReason: "Choose the driving line overlay in Race Settings before starting a solo race.", navigate },
    ]);
  }
  function optionsOf(row) {
    // Labels only (no select/change/lazy load); cached per row.
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
    const words = String(query || "").replace(/[-_]/g, " ").trim().toLowerCase().split(/\s+/).filter(Boolean);
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
    // Device-only rows may be CSS-hidden: check focus landed.
    if (control.checkVisibility && !control.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
    if (control.getClientRects && control.getClientRects().length === 0) return false;
    control.focus({ preventScroll: true });
    if (document.activeElement !== control) return false;
    control.scrollIntoView({ block: "nearest" });
    return true;
  }
  function depBlock(t) {
    let r = t && (t.closest("[data-dep-off]") || t.querySelector("[data-dep-off]")), w = r && r.querySelector("[data-dep-reason]");
    // An owner-greyed control (SettingDeps EXPLAIN) has no data-dep-off row: its reason is the shown line it is described by (#5562).
    if (!w && t) {
      const ids = [t, ...t.querySelectorAll("[aria-describedby]")].flatMap((c) => (c.getAttribute("aria-describedby") || "").split(/\s+/)).filter(Boolean);
      w = [...document.querySelectorAll("[data-dep-reason]")].find((e) => !e.hidden && ids.includes(e.id) && e.textContent.trim());
      r = w && (w.getAttribute("aria-hidden") === "true" ? w.parentElement : w);   // never focus an aria-hidden label
    }
    const x = w && w.textContent.trim();
    if (x) { r.tabIndex = -1; r.focus({ preventScroll: true }); r.scrollIntoView({ block: "nearest" }); }
    return x;
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
      const label = row.label + " · " + (route ? route.title : row.page.replace(/-/g, " ").toUpperCase());
      if (slot.button.textContent !== label) slot.button.textContent = label;
      slot.button.onclick = () => {
        clearFeedback();
        if (route?.scope === "session" && !window.UiLayers?.inRace()) {
          note.textContent = "Pause during a session to open " + row.label + ".";
          return;
        }
        // Own navigation only once the lazy race is won.
        const arrived = () => {
          last = row.id; fromSearch = true;
          if (o.onSelect) o.onSelect(row.page);
          const el = document.querySelector("#" + row.target);
          if (el && el.getAttribute("role") === "tab" && el.getAttribute("aria-selected") === "false") el.click();
          const placed = reveal(el), why = !placed && depBlock(el);
          if (why) { clearFeedback(); note.textContent = row.label + " is off: " + why; return true; }
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
      // Reuse row nodes (no per-keystroke realloc).
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
    let loadingGraphics = false;
    input.oninput = () => {
      paint();
      if (!input.value.trim()) return;
      if (typeof DesktopGraphics !== "undefined") { DesktopGraphics.indexSearch(); return; }
      if (loadingGraphics || typeof ScriptLoader === "undefined") return;
      loadingGraphics = true;
      ScriptLoader.create().load(["js/ui/desktop-graphics.js"], [], { strict: true })
        .then(ok => { if (ok && typeof DesktopGraphics !== "undefined") DesktopGraphics.indexSearch(); })
        .catch((error) => Log.warn("ui", "Graphics search options unavailable: " + error))
        .finally(() => { loadingGraphics = false; });
    };
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
      // Fresh sessions start unfiltered.
      reset() { fromSearch = false; clearFeedback(); if (input.value) { input.value = ""; paint(); } },
      dispose() { subscribers.delete(paint); clearFeedback(); box.remove(); },
      input,
    });
  }
  // Escape / pad B (`cancel`) in a non-empty FIND A SETTING clears it first, like the circuit search.
  function onEscape(e) {
    const cancel = e.type === "cancel";
    if ((!cancel && e.key !== "Escape") || e.isComposing || e.defaultPrevented) return;
    const t = cancel ? document.activeElement : e.target;
    if (!t || !t.value || !t.closest || !t.closest("[data-settings-search]")) return;
    t.value = ""; if (t.oninput) t.oninput();
    e.preventDefault(); e.stopPropagation();
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("cancel", onEscape, true);
  }
  return Object.freeze({ CATALOG, register, registerRaceSettings, find, reveal, create, onEscape });
})();
