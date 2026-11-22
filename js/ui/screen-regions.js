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

  // These stable IDs double as region keys. Keep their order broad-to-specific
  // so an individual action can override its group's saved appearance.
  function parts(prefix, labels) {
    return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, part("#" + prefix + key, label)]));
  }
  screen("pmsettings", "Settings", { heading, navigation: part("#pm-settings-index", "Navigation"), content: part(".pm-groups", "Settings"), actions });
  for (const [page, label, root, regions] of [
    ["controls", "Controls", "#pm-panel-controls", parts("pm-", { "steer-item": "Steering", throttlemode: "Pedals", "keys-section": "Keyboard", "pad-section": "Gamepad" })],
    ["driving", "Driving aids", "#pm-panel-driving", { presets: part(".preset-row", "Presets"), ...parts("pm-", { gears: "Gears", aero: "Aero", coach: "Coach" }) }],
    ["display", "HUD and camera", "#pm-panel-display"], ["graphics", "Graphics", "#pm-panel-graphics"],
    ["appearance", "Appearance", "#pm-panel-appearance", { studio: part("#appearance-studio", "Appearance Studio"), ...parts("pm-", { "appearance-menu": "Menu colours", "appearance-hud": "HUD colours", general: "Readability" }) }],
    ["a11y", "Accessibility", "#pm-panel-a11y"], ["advanced", "Advanced input and handling", "#advanced"],
    ["audio", "Audio settings", "#audioset"], ["files", "Saves and data", "#pm-panel-files"],
    ["visual", "Visual Studio", "#pm-panel-visual"], ["progress", "Progress", "#pm-panel-progress"],
    ["credits", "About and credits", "#pm-panel-credits", parts("credits-", { data: "Data sources", software: "Software", fonts: "Fonts", assets: "Assets" })],
    ["practice", "Practice", "#pm-panel-practice"], ["strategy", "Pit strategy", "#pm-panel-strategy"], ["review", "Session review", "#pm-panel-review"],
  ]) {
    const id = "pm-panel-" + page;
    screen(id, label, { panel: part(root, "Page controls"), ...regions }, root);
    screens[id].settingsPage = page;
  }
  screen("career", "Career", { heading, navigation: part("#cr-left", "Career navigation"), calendar: part("#cr-right", "Calendar"), actions });
  screen("carsetup", "Garage", { panel: { ...part("#cs-inner", "Setup panel"), maxWidth: 65, maxHeight: 70, scale: false, constraint: "Width and height reserve room for the car. Use these to resize the panel at its current text size." }, camera: part("#cs-stack", "Car view controls") });
  screen("select", "Track selector", { tracks: part("#sel-shelf", "Circuit list"), preview: part("#sel-track-section", "Circuit preview"), actions });
  screen("track-detail", "Circuit detail", { heading, map: part("#track-detail-canvas-wrap", "Track map"), details: part("#track-detail-panel", "Track details") });
  screen("pausemenu", "Pause", { heading, ...parts("pm-", { resume: "Resume", restart: "Restart race", settings: "Settings", quit: "Quit to menu" }), summary: part("#pm-race-context", "Race summary"), tools: part("#pm-quick-doors", "Race tools"), music: part("#pm-now-card", "Now playing") });
  screen("season-setup", "Season setup", { calendar: part("#ss-cal", "Calendar"), circuits: part("#ss-pool", "Available circuits"), actions });
  screen("race-settings", "Race settings", {
    heading, content, actions, presets: part("#rs-presets", "Preset buttons"),
    ...parts("rs-preset-", { quick: "Quick race", weekend: "Full weekend", endurance: "Endurance" }),
    ...parts("rs-", { laps: "Laps", weather: "Weather", mixed: "Conditions", time: "Time of day",
      "fold-field": "Field settings", "fold-assists": "Assists and wear", diff: "Difficulty", quali: "Grid", duel: "Duel",
      caution: "Cautions", reliab: "Reliability", line: "Driving line", tyres: "Tyre wear", dirty: "Dirty air", plan: "Strategy" }),
    back: part("#rs-cancel", "Back"), start: part("#rs-go", "Start race"),
  });
  screen("results", "Race results", { heading, summary: part("#res-winner", "Winner"), classification: part("#results-table", "Classification"), actions, menu: part("#res-menu", "Menu"), next: part("#res-next", "Continue") });
  screen("datahub", "Data Hub", { navigation: part(".dh-tabs", "Tabs"), content: part("#dh-panel", "Data and filters") });
  screen("telemetry-detail", "Telemetry detail", { heading: part(".dh-tpopup-hdr", "Drivers and session"), traces: part(".dh-tpopup-body", "Telemetry traces") }, "dialog.dh-tpopup");
  screen("share-card-preview", "Share card", { preview: part("#scp-img", "Card preview"), size: part('[aria-label="Card size"]', "Card size"), actions });
  screen("trackdesigner", "Track Designer", { canvas: part(".td-stage", "Drawing area"), controls: part(".td-rail", "Designer controls") });
  // The guide belongs to the export crop. Only the UI in front of it moves.
  screen("photo-studio", "Photo Studio", { panel: part("#ps-panel", "Studio panel"), shots: part("#ps-shots", "Shot presets"), actions });
  screen("campicker", "Camera view picker", { views: part("#campicker", "Camera buttons") });
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

  // TitleLayout already owns the title's placement, group width and scale.
  const homePart = (selector, label) => ({
    ...part(selector, label), x: false, y: false, width: false, height: false, scale: false,
    constraint: "Use Arrange Home to move or scale the title layout."
  });
  screen("home-style", "Home text and buttons", {
    buttons: homePart("#menu-buttons", "All menu buttons"),
    career: homePart("#mb-career", "Career Modes"),
    retention: homePart("#menu-retention", "Continue and Daily Time Trial"),
    create: homePart("#menu-create", "Studio and designer buttons"),
    utilities: homePart("#menu-secondary", "Settings and utilities"),
    info: homePart("#menu-meta", "Sound and notice"),
  }, "div#overlay");

  screen("pair", "Pair phone", { instructions: part("#pair-copy p", "Instructions"), scan: part("#scan", "Scan QR code"), code: part("#code", "Room code"), connect: part("#connect", "Connect") });
  screen("menupad", "Phone menu pad", { pad: part("#dpad", "Direction pad"), status: part("#mp-mid", "Status and pause"), actions: part("#ab", "Back and select") });
  screen("broadcast", "Broadcast overlay", { tower: part(".ov-tower", "Timing tower"), sectors: part(".ov-sectors", "Sector times"),
    battle: part(".ov-battle", "Battle"), caption: part(".ov-caption", "Caption") }, "main#overlay");

  // Appearance keeps its illustrative preview. This button uses the same
  // launchers a player would press, so their Career slot or race stays theirs.
  const previewTargets = { garage: "carsetup", race: "race-settings", pause: "pausemenu", popups: "results" };
  const launchers = { career: "mb-career", carsetup: "mb-garage", select: "mb-race", datahub: "mb-data",
    "race-settings": "mb-race", "track-detail": "mb-race", "season-setup": "mb-season",
    trackdesigner: "mb-designer", "photo-studio": "mb-photo", watch: "mb-watch", vsfriend: "mb-vs", howtoplay: "mb-help" };
  const separatePages = { pair: "controller.html", menupad: "controller.html", wheel: "controller.html", broadcast: "overlay.html" };
  let pending;
  function tryPending(id) {
    if (pending !== id) return;
    const root = document.querySelector(screens[id].root);
    if (!root || !root.getClientRects().length) return;
    const focus = Array.from(root.querySelectorAll("button:enabled")).find(el => el.getClientRects().length);
    if (window.ScreenArranger?.open(id, focus || root)) pending = null;
  }
  function attachPicker(host) {
    const preview = host.querySelector('[data-as="preview"]');
    if (!preview || host.querySelector(".arrange-route")) return;
    const note = host.querySelector('[data-as="note"]');
    const target = document.createElement("select");
    target.setAttribute("aria-label", "Screen to arrange");
    target.add(new Option("Home", "home"));
    target.add(new Option("Race HUD", "hud"));
    for (const [id, def] of Object.entries(screens)) {
      target.add(new Option(def.label, id));
    }
    target.add(new Option("Phone wheel", "wheel"));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "arrange-route";
    host.append(target, go);
    const atHome = () => document.getElementById("overlay")?.hidden === false && !window.UiLayers?.inRace();
    function describe() {
      const id = target.value;
      const label = target.selectedOptions[0].text;
      go.textContent = "Arrange " + label;
      go.disabled = (id === "home" || id === "home-style") && !atHome();
      if (screens[id]?.settingsPage && typeof SettingsNav !== "undefined" && SettingsNav.routes[screens[id].settingsPage]?.scope === "session" && atHome()) {
        go.disabled = true;
        note.textContent = "Pause during a session to arrange " + label + ".";
        return;
      }
      note.textContent = go.disabled ? "Open Appearance from Home to arrange Home." :
        id === "pausemenu" ? "Edit the Pause menu. Apply or Cancel returns to Appearance." :
        id === "home-style" ? "Edit the title menu’s text and button dimensions." :
        id === "home" || id === "hud" || id === "pmsettings" ? "" :
        "The editor opens when " + label + " is on screen.";
    }
    let lastPreview;
    function refresh() {
      const key = preview.dataset.screen || "home";
      if (key === lastPreview) return;
      lastPreview = key;
      target.value = previewTargets[key] || key;
      if (!target.value) target.value = "home";
      describe();
    }
    target.addEventListener("change", describe);
    go.addEventListener("click", async () => {
      pending = null;
      const id = target.value;
      if (id === "hud") { document.getElementById("pm-hud-arrange")?.click(); return; }
      const settings = document.getElementById("pmsettings");
      if (separatePages[id]) {
        const url = new URL(separatePages[id], location.href);
        url.searchParams.set("arrange", id);
        if (id === "menupad" || id === "wheel") url.searchParams.set("demo", id === "menupad" ? "menu" : "wheel");
        window.open(url, "_blank", "noopener");
        return;
      }
      const fromHome = atHome();
      if (id !== "home" && !window.ScreenArranger) {
        go.disabled = true;
        try {
          await ScriptLoader.create().load(["js/ui/screen-arranger.js"], [], { strict: true });
        } catch { /* Keep the picker available for retry. */ }
        describe();
        if (!window.ScreenArranger) { note.textContent = "Layout editor could not load. Try again."; return; }
        if (target.value !== id || !go.getClientRects().length) return;
      }
      if (id === "pausemenu") {
        // Keep the Appearance navigation stack. The real pause card can render
        // its no-race summary at Home without starting or resuming a session.
        const pause = document.getElementById("pausemenu");
        const wasInert = pause.inert;
        const restorePicker = () => {
          pause.hidden = true;
          pause.inert = wasInert;
          // The race can end or resume externally (e.g. a controller).
          // closeSettings invalidates the route; do not resurrect it.
          if (SettingsNav.current() !== "appearance") return;
          settings.hidden = false;
          // TopModal mirrors hidden onto native dialogs in a microtask.
          queueMicrotask(() => go.focus({ preventScroll: true }));
        };
        pause.inert = true;
        settings.hidden = true;
        pause.hidden = false;
        queueMicrotask(() => {
          if (!window.ScreenArranger.open(id, go, restorePicker)) {
            restorePicker();
            note.textContent = "Pause could not be displayed. Try again.";
          }
        });
        return;
      }
      const route = screens[id]?.settingsPage;
      if (route) {
        // The settings router owns each page's lazy content and availability.
        SettingsNav.show(route, true, () => {
          requestAnimationFrame(() => {
            if (settings.hidden || SettingsNav.current() !== route) return;
            const returnToPicker = () => {
              if (settings.hidden || SettingsNav.current() !== route) return;
              SettingsNav.show("appearance", false);
              go.focus({ preventScroll: true });
            };
            if (!window.ScreenArranger.open(id, go, returnToPicker)) {
              returnToPicker();
              note.textContent = "No visible regions on this page.";
            }
          });
        });
        return;
      }
      const back = document.getElementById("pm-settings-close");
      if (id === "pmsettings") {
        back.click();
        requestAnimationFrame(() => window.ScreenArranger.open(id, document.getElementById("pm-open-appearance")));
        return;
      }
      for (let step = 0; step < 12 && !settings.hidden; step++) back.click();
      if (!settings.hidden) return;
      if (id === "home") { TitleLayout.enter(document.getElementById("mb-settings")); return; }
      pending = id;
      if (fromHome && launchers[id]) document.getElementById(launchers[id])?.click();
      requestAnimationFrame(() => tryPending(id));
    });
    refresh();
    new MutationObserver(refresh).observe(preview, { attributes: true, attributeFilter: ["data-screen"] });
  }

  function install() {
    document.addEventListener("apex:appearance-picker", event => attachPicker(event.target));
    const existingPicker = document.querySelector('[data-as="preview-side"]');
    if (existingPicker) attachPicker(existingPicker);
    const query = new URLSearchParams(location.search);
    if (query.has("arrange") && !document.getElementById("menu-buttons")) pending = query.get("arrange") || "broadcast";
    const ids = new WeakMap();
    const reveal = (root) => {
      const id = ids.get(root);
      if (!id || root.hidden || document.querySelector("#screen-arranger[open]")) return;
      if (id === pending) requestAnimationFrame(() => tryPending(id));
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
      visibility.observe(root, { attributes: true, attributeFilter: ["hidden", "open"] });
      reveal(root);
    }
    for (const [id, def] of Object.entries(screens)) bind(id, document.querySelector(id === "watch" ? ".watch-transport" : def.root));
    const title = document.querySelector("#overlay #menu-buttons");
    const wheel = document.getElementById("ctl");
    if (wheel && (pending === "wheel" || pending === "menupad")) {
      const start = () => {
        if (pending === "menupad") tryPending("menupad");
        else if (pending === "wheel" && wheel.getClientRects().length) {
          document.getElementById("lay-arrange").click();
          pending = null;
        }
        if (!pending) observer.disconnect();
      };
      const observer = new MutationObserver(start);
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      requestAnimationFrame(start);
    }
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
