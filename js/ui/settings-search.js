/* Find settings by player terms. Navigation only: never writes a preference. */
const SettingsSearch = (function () {
  "use strict";
  const CATALOG = Object.freeze([
    ["steering", "Steering input", "controls", "pm-steer-sel", "tilt touch buttons keyboard wheel"],
    ["gears", "Manual gears", "controls", "pm-gears-sel", "shift automatic transmission"],
    ["aero", "Active aero", "controls", "pm-aero-sel", "wing manual automatic drs"],
    ["keys", "Keyboard bindings", "controls", "pm-keys", "rebind keys controls"],
    ["pad", "Controller bindings", "controls", "pm-pad", "gamepad buttons wheel"],
    ["coach", "Driving coach", "driving", "pm-coach-sel", "tips advice braking"],
    ["brake-cue", "Braking cue", "driving", "pm-linebrakecue-sel", "braking beep warning"],
    ["pit", "Next pit-stop tyres", "driving", "pm-pit-choice-sel", "compound tires strategy"],
    ["hud", "HUD style", "display", "pm-hudprofile-sel", "broadcast minimal"],
    ["hud-size", "HUD size", "display", "pm-hudscale", "bigger smaller scale readouts"],
    ["map", "Track map", "display", "pm-hudmap-sel", "minimap"],
    ["gaps", "Gap readouts", "display", "pm-hudgaps-sel", "timing intervals"],
    ["ui-size", "Interface size", "appearance", "pm-uiscale", "menus text bigger smaller zoom"],
    ["motion", "Reduce motion", "a11y", "pm-motion-sel", "shake flyby animation comfort"],
    ["focus", "Keyboard focus", "a11y", "pm-focus-sel", "outline ring accessibility"],
    ["colour", "Colourblind cues", "a11y", "pm-cbcues-sel", "colorblind tyre flags accessibility"],
    ["assist", "Steer assist", "advanced", "pm-linemode-sel", "steering help racing line"],
    ["line", "Racing line", "advanced", "pm-line", "driving guide"],
    ["music", "Music volume", "audio", "as-mvol", "sound songs soundtrack"],
    ["effects", "Sound effects volume", "audio", "as-svol", "engine tyres tires sounds"],
    ["radio", "Team radio", "audio", "as-radio-sel", "voice engineer speech"],
  ].map((r) => Object.freeze({ id: r[0], label: r[1], page: r[2], target: r[3], aliases: r[4] })));
  // Owners register descriptors without loading their controls. Re-registration
  // replaces only that owner's rows; disposing an old registration is harmless.
  const owners = new Map(), subscribers = new Set();
  const PAGES = new Set(["controls", "driving", "display", "appearance", "a11y", "advanced", "audio", "files"]);
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
    for (const fn of subscribers) fn();
    return () => { if (owners.get(owner) === rows) { owners.delete(owner); for (const fn of subscribers) fn(); } };
  }
  function optionsOf(row) {
    // Read labels only. Never select an option, dispatch change, or ensure a
    // lazy bundle merely to answer a query.
    const target = typeof document !== "undefined" ? document.querySelector("#" + row.target) : null;
    const labels = target && target.tagName === "SELECT" ? [...target.children].map((o) => o.textContent || "").join(" ") : "";
    return labels + " " + (typeof row.options === "function" ? String(row.options() || "") : String(row.options || ""));
  }
  function find(query) {
    const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? CATALOG.concat(...owners.values()).filter((r) => {
      const haystack = (r.label + " " + r.aliases + " " + optionsOf(r)).toLowerCase();
      return words.every((w) => haystack.includes(w));
    }) : [];
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
    const panelIds = { controls: "pm-panel-controls", driving: "pm-panel-driving", display: "pm-panel-display", appearance: "pm-panel-appearance", a11y: "pm-panel-a11y", advanced: "advanced", audio: "audioset", files: "pm-panel-files" };
    function unavailable(row) {
      clearFeedback();
      const message = row.label + " is unavailable in the current session or on this device. BACK returns to your search.";
      const panel = panelIds[row.page] ? document.querySelector("#" + panelIds[row.page]) : null;
      if (panel) {
        destinationNote = document.createElement("p"); destinationNote.className = "adv-help";
        destinationNote.setAttribute("role", "status"); destinationNote.textContent = message;
        panel.insertBefore(destinationNote, panel.firstChild);
      }
      if (!panel) note.textContent = row.unavailableReason || message;
      if (typeof LiveRegion !== "undefined") LiveRegion.say(row.unavailableReason || message, "hud");
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
        li.appendChild(button); list.appendChild(li);
      }
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
      dispose() { subscribers.delete(paint); clearFeedback(); box.remove(); },
      input,
    });
  }
  return Object.freeze({ CATALOG, register, find, reveal, create });
})();
