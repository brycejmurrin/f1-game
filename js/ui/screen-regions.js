"use strict";
// IDs are part of exported profiles. Selectors address the live owner's DOM,
// including content built on first open by Photo Studio, Data Hub and Designer.
window.ScreenRegions = (function () {
  const screens = Object.create(null);
  const part = (selector, label) => ({ selector, label });
  const actions = part(".sheet-foot", "Actions");
  const content = part(".sheet-body", "Content");
  const heading = part(".sheet-head", "Heading");
  function screen(id, label, regions, root = "#" + id) {
    screens[id] = { label, root, regions };
  }

  screen("pmsettings", "Settings", { navigation: part("#pm-settings-index", "Navigation"), content: part(".pm-groups", "Settings"), actions });
  screen("career", "Career", { navigation: part("#cr-left", "Career navigation"), calendar: part("#cr-right", "Calendar"), actions });
  screen("carsetup", "Garage", { panel: { ...part("#cs-inner", "Setup panel"), maxWidth: 65, maxHeight: 70, scale: false, constraint: "Width and height reserve room for the car. Use these to resize the panel at its current text size." }, camera: part("#cs-stack", "Car view controls") });
  screen("select", "Track selector", { tracks: part("#sel-shelf", "Circuit list"), preview: part("#sel-track-section", "Circuit preview"), actions });
  screen("track-detail", "Circuit detail", { heading, map: part("#track-detail-canvas-wrap", "Track map"), details: part("#track-detail-panel", "Track details") });
  screen("pausemenu", "Pause", { summary: part("#pm-race-context", "Race summary"), tools: part("#pm-quick-doors", "Race tools"), music: part("#pm-now-card", "Now playing") });
  screen("season-setup", "Season setup", { calendar: part("#ss-cal", "Calendar"), circuits: part("#ss-pool", "Available circuits"), actions });
  screen("race-settings", "Race settings", { heading, content, actions });
  screen("results", "Race results", { summary: part("#res-winner", "Winner"), classification: part("#results-table", "Classification"), actions });
  screen("datahub", "Data Hub", { navigation: part(".dh-tabs", "Tabs"), content: part("#dh-panel", "Data and filters") });
  screen("telemetry-detail", "Telemetry detail", { heading: part(".dh-tpopup-hdr", "Drivers and session"), traces: part(".dh-tpopup-body", "Telemetry traces") }, "dialog.dh-tpopup");
  screen("share-card-preview", "Share card", { preview: part("#scp-img", "Card preview"), size: part('[aria-label="Card size"]', "Card size"), actions });
  screen("trackdesigner", "Track Designer", { canvas: part(".td-stage", "Drawing area"), controls: part(".td-rail", "Designer controls") });
  // The guide belongs to the export crop. Only the UI in front of it moves.
  screen("photo-studio", "Photo Studio", { panel: part("#ps-panel", "Studio panel"), shots: part("#ps-shots", "Shot presets"), actions });
  screen("photo-controls", "Photo controls", { move: part(".pc-move-wrap", "Movement stick"), look: part(".pc-look-wrap", "Look stick"), actions: part("#pc-bar", "Camera controls") });
  screen("watch", "WATCH replay", { controls: part('[data-wt="controls"]', "Transport"), timeline: part('[data-wt="timeline"]', "Timeline"), chapters: part('[data-wt="chapters"]', "Chapters"),
    timing: part("#bc-tower", "Timing tower"), picture: part("#bc-pip", "Picture in picture") }, "body.watch-controls-on");

  for (const [id, label] of [
    ["career-offers", "Career offers"], ["career-history", "Career history"], ["career-guide", "Career guide"],
    ["teampicker", "Team picker"], ["vsfriend", "Play a friend"], ["duel-picker", "Duel opponent"],
    ["quali", "Qualifying"], ["standings", "Standings"], ["spotifypanel", "Music and sound"],
  ]) screen(id, label, { heading, content, actions });
  screen("customize", "Customize", { content, preview: part("#cz-preview", "Color preview"), actions });
  screen("howtoplay", "How to play", { navigation: part("#htp-contents", "Contents"), content, actions });
  for (const [id, label, prefix] of [
    ["lighting", "Lighting", "lt"], ["camtune", "Camera tuning", "ct"], ["flyby", "Flyby", "fb"],
    ["freecam", "Free camera", "fc"], ["garrival", "Garage arrival", "ga"],
  ]) screen(id, label, { heading: part("#" + prefix + "-head", "Heading"), content: part("#" + prefix + "-rows", "Controls"), actions });

  screen("pair", "Pair phone", { instructions: part("#pair-copy p", "Instructions"), scan: part("#scan", "Scan QR code"), code: part("#code", "Room code"), connect: part("#connect", "Connect") });
  screen("menupad", "Phone menu pad", { pad: part("#dpad", "Direction pad"), status: part("#mp-mid", "Status and pause"), actions: part("#ab", "Back and select") });
  screen("broadcast", "Broadcast overlay", { tower: part(".ov-tower", "Timing tower"), sectors: part(".ov-sectors", "Sector times"),
    battle: part(".ov-battle", "Battle"), caption: part(".ov-caption", "Caption") }, "main#overlay");

  let editorLoad, request = 0;
  async function openEditor(id, button, prepare) {
    if (!button || !Object.hasOwn(screens, id)) return;
    if (button.getAttribute("aria-busy") === "true") return;
    const mine = ++request;
    if (!window.ScreenArranger) {
      button.setAttribute("aria-busy", "true");
      button.textContent = "Loading layout editor…";
      try {
        if (!editorLoad) {
          const file = "js/ui/screen-arranger.js";
          editorLoad = ScriptLoader.create().load([file], [], { strict: true }).finally(() => { editorLoad = null; });
        }
        if (!(await editorLoad) || !window.ScreenArranger) throw new Error("Layout editor unavailable");
      } catch (error) {
        button.textContent = "Retry layout editor";
        button.title = "The layout editor could not load. Select to try again.";
        if (typeof Log !== "undefined") Log.warn("ui", "Could not load the layout editor: " + error.message);
        return;
      } finally {
        button.removeAttribute("aria-busy");
      }
      button.textContent = prepare ? "Arrange Pause" : "Arrange this screen";
      button.removeAttribute("title");
    }
    if (mine !== request || !button.isConnected || button.closest("[hidden]")) return;
    const invoker = prepare ? prepare() : button;
    if (invoker) window.ScreenArranger.open(id, invoker);
  }

  function entry(root, label, run) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "screen-arrange-entry";
    if (root.id) button.id = root.id + "-arrange-entry";
    button.textContent = label;
    button.addEventListener("click", (event) => { event.stopPropagation(); run(button); });
    const host = root.id === "pausemenu" ? root.querySelector(".sheet-head") : root;
    host.appendChild(button);
  }

  // Appearance keeps its illustrative preview. This button uses the same
  // launchers a player would press, so their Career slot or race stays theirs.
  const routes = {
    home: ["Home", null, "From Home, choose Arrange this screen."],
    career: ["Career", "mb-career", "From Home, open Career Modes and choose Arrange this screen."],
    garage: ["Garage", "mb-garage", "From Home, open Garage and choose Arrange this screen."],
    select: ["Track selector", "mb-race", "From Home, open Race and choose Arrange this screen on the circuit list."],
    datahub: ["Data Hub", "mb-data", "From Home, open Data Hub and choose Arrange this screen."],
    race: ["Race setup", "mb-race", "From Home, open Race, select a circuit and continue to Race Settings. Choose Arrange this screen there."],
    pause: ["Pause", null, "During a race, pause and open Settings → Appearance. Choose Pause, then Arrange Pause."],
    hud: ["Race HUD", "pm-hud-arrange", "Arrange the HUD for the selected HUD style and camera group."],
    popups: ["Race results", null, "Finish a race, then choose Arrange this screen on Results. Each dialog saves separately."],
  };
  function attachPicker(host) {
    const preview = host.querySelector(".as-preview");
    if (!preview || host.querySelector(".arrange-route")) return;
    const note = host.querySelector(".as-note");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "arrange-route";
    host.appendChild(go);
    const atHome = () => document.getElementById("overlay")?.hidden === false && !window.UiLayers?.inRace();
    const inRace = () => !!window.UiLayers?.inRace();
    function refresh() {
      const key = preview.dataset.screen || "home";
      if (!Object.hasOwn(routes, key)) {
        note.textContent = "Open this screen and choose Arrange this screen to edit its layout.";
        go.hidden = true;
        return;
      }
      const [label, door, path] = routes[key];
      note.textContent = "Illustrative preview. " + path;
      go.textContent = key === "race" ? "Choose circuit for Race Setup" : key === "hud" || key === "home" || key === "pause" ? "Arrange " + label : "Open " + label;
      go.hidden = key === "hud" ? !document.getElementById(door) :
        key === "pause" ? !inRace() : !atHome() || key === "popups";
    }
    go.addEventListener("click", () => {
      const key = preview.dataset.screen || "home";
      if (go.hidden || !Object.hasOwn(routes, key)) return;
      if (key === "hud") { document.getElementById("pm-hud-arrange")?.click(); return; }
      const back = document.getElementById("pm-settings-close");
      const settings = document.getElementById("pmsettings");
      function closeSettings() {
        // Unwind nested Settings pages through the ordinary Back handler.
        for (let step = 0; step < 12 && !settings.hidden; step++) back.click();
        return settings.hidden;
      }
      if (key === "pause") {
        openEditor("pausemenu", go, () => preview.dataset.screen === key && closeSettings() ? document.getElementById("pm-settings") : null);
        return;
      }
      if (!closeSettings()) return;
      if (key === "home") TitleLayout.enter(document.querySelector("#overlay .screen-arrange-entry"));
      else document.getElementById(routes[key][1])?.click();
    });
    refresh();
    new MutationObserver(refresh).observe(preview, { attributes: true, attributeFilter: ["data-screen"] });
  }

  function install() {
    document.addEventListener("apex:appearance-picker", event => attachPicker(event.target));
    const existingPicker = document.querySelector(".as-preview-side");
    if (existingPicker) attachPicker(existingPicker);
    const ids = new WeakMap();
    const reveal = (root) => {
      const id = ids.get(root);
      if (!id || root.hidden || document.querySelector("#screen-arranger[open]")) return;
      if (window.ScreenPlacement) window.ScreenPlacement.restore(id);
    };
    // Observe layer visibility only. Timing, telemetry and HUD DOM updates
    // never schedule a restore or a scan through the active race's subtree.
    const visibility = new MutationObserver((records) => {
      for (const root of new Set(records.map((record) => record.target))) reveal(root);
    });
    function bind(id, root) {
      if (!root || ids.has(root)) return;
      ids.set(root, id);
      if (id !== "broadcast" || new URLSearchParams(location.search).has("arrange")) {
        entry(root, "Arrange this screen", (button) => openEditor(id, button));
      }
      visibility.observe(root, { attributes: true, attributeFilter: ["hidden", "open"] });
      reveal(root);
    }
    for (const [id, def] of Object.entries(screens)) bind(id, document.querySelector(id === "watch" ? ".watch-transport" : def.root));
    const title = document.querySelector("#overlay #menu-buttons");
    const wheel = document.getElementById("ctl");
    if (wheel) entry(wheel, "Arrange this screen", () => document.getElementById("lay-arrange").click());
    if (!title) return;
    const inserted = new MutationObserver((records) => {
      for (const record of records) for (const el of record.addedNodes) {
        if (el.nodeType !== 1) continue;
        if (el.classList.contains("watch-transport")) bind("watch", el);
        else if (el.matches("dialog.dh-tpopup")) bind("telemetry-detail", el);
        else if (Object.hasOwn(screens, el.id)) bind(el.id, el);
      }
    });
    inserted.observe(document.body, { childList: true });
    const hub = document.getElementById("datahub");
    if (hub) inserted.observe(hub, { childList: true });
  }
  // Wait for this registry and the sibling bundle modules to publish first.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else queueMicrotask(install);
  }
  return screens;
})();
