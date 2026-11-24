"use strict";
// Appearance-only screen picker. The registry and saved placements also serve standalone pages.
window.AppearanceArrangementPicker = (function () {
  const navigation = window.ScreenRegions[Symbol.for("apex.arrangementRoute")];
  // Appearance keeps its illustrative preview. This button uses the same
  // launchers a player would press, so their Career slot or race stays theirs.
  const previewTargets = { garage: "carsetup", race: "race-settings", pause: "pausemenu" };
  const launchers = { career: "mb-career", carsetup: "mb-garage", select: "mb-race", datahub: "mb-data", learn: "mb-learn", "telemetry-detail": "mb-data",
    results: "mb-race", "share-card-preview": "mb-race", "race-settings": "mb-race", "track-detail": "mb-race", "duel-picker": "mb-race", customize: "mb-garage", "career-offers": "mb-career", "career-history": "mb-career", "career-guide": "mb-career", standings: "mb-standings", quali: "mb-race", teampicker: "mb-garage", "season-setup": "mb-season",
    trackdesigner: "mb-designer", "td-label-ask": "mb-designer", "photo-studio": "mb-photo", watch: "mb-watch", vsfriend: "mb-vs", howtoplay: "mb-help" };
  const pauseDoors = { "photo-controls": "pm-photo", "photo-studio": "pm-photo", standings: "pm-standings", howtoplay: "pm-howto" };
  const flybyDoor = () => document.getElementById("pm-flyby");
  const visualDoors = {
    lighting: () => document.getElementById("pm-lighting"),
    camtune: () => document.getElementById("pm-camtune"),
    garrival: () => document.getElementById("pm-garrival"),
    flyby: flybyDoor, "flyby-card": flybyDoor, freecam: flybyDoor,
  };
  const separatePages = { pair: "controller.html", menupad: "controller.html", wheel: "controller.html", broadcast: "overlay.html" };
  const preparation = {
    career: "Choose a slot, setup or active career hub.",
    carsetup: "Choose a Garage category or open Camera adjustments.",
    select: "Choose the circuit, filters or briefing to arrange.",
    "race-settings": "Choose a race preset or enable tyre wear to open the strategy controls.",
    quali: "Simulate qualifying to include the grid and session actions.",
    vsfriend: "Choose Host or Join, then navigate to the lobby step you want.",
    datahub: "Choose a tab, race, lap or telemetry drivers.",
    "pm-panel-files": "Choose a backup tab or open Storage health and View restore points.",
    "photo-studio": "Capture a picture to include its preview.",
    lighting: "Open a lighting category or export its values.",
    camtune: "Choose a camera and scope or export its values.",
    flyby: "Choose a shot or export its values.",
    freecam: "Choose a shot or export its values.",
    garrival: "Start the garage animation to show its transport.",
    pair: "Open the scanner to include its view.",
    bench: "Run a benchmark to include its results.",
    watch: "Select a chapter, timing view or picture in picture."
  };
  navigation.acceptsDoor = (target, door) => door === launchers[target] ||
    (door === "mb-practice" && target === "select") ||
    (door === "mb-race" && (target === "campicker" || target === "photo-controls" || !!visualDoors[target]));
  function attachPicker(host) {
    const screens = window.ScreenRegions;
    const preview = host.querySelector('[data-as="preview"]');
    const studio = host.closest("#appearance-studio");
    if (!preview || !studio || studio.querySelector("#appearance-arrange")) return;
    const group = document.createElement("section");
    group.id = "appearance-arrange";
    const note = document.createElement("p");
    note.id = "appearance-arrange-help";
    note.setAttribute("aria-live", "polite");
    const target = document.createElement("select");
    target.id = "appearance-arrange-screen";
    const label = document.createElement("label");
    label.htmlFor = target.id;
    label.textContent = "Screen to arrange";
    target.add(new Option("Home", "home"));
    target.add(new Option("Race HUD", "hud"));
    target.add(new Option("Touch controls", "touch-controls"));
    for (const [id, def] of Object.entries(screens)) {
      target.add(new Option(def.label, id));
    }
    target.add(new Option("Shared popup style", "popups"));
    target.add(new Option("Phone wheel", "wheel"));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "arrange-route";
    target.setAttribute("aria-describedby", note.id);
    const prepareLabel = document.createElement("label");
    const prepareChoice = document.createElement("input");
    prepareChoice.type = "checkbox";
    prepareLabel.append(prepareChoice, " Choose page state first");
    const modeLabel = document.createElement("label");
    const mode = document.createElement("select");
    mode.add(new Option("Grand Prix", "race"));
    mode.add(new Option("Practice", "practice"));
    modeLabel.append("Selector mode ", mode);
    group.append(label, target, go, modeLabel, prepareLabel, note);
    studio.insertBefore(group, studio.firstChild);
    const atHome = () => document.getElementById("overlay")?.hidden === false && !window.UiLayers?.inRace();
    const needsCircuit = id => atHome() && (id === "campicker" || id === "photo-controls" || visualDoors[id]?.()?.disabled);
    function describe() {
      const id = target.value;
      const label = target.selectedOptions[0].text;
      prepareLabel.hidden = !preparation[id];
      modeLabel.hidden = id !== "select";
      host.dispatchEvent(new CustomEvent("apex:arrangement-target", {detail: {id, label}}));
      go.textContent = id === "popups" ? "Edit shared popup style" : "Arrange " + label;
      go.disabled = (id === "home" || id === "home-style") && !atHome();
      if (id === "touch-controls") {
        const pedals = document.getElementById("btn-brake");
        go.disabled = !window.UiLayers?.inRace() || !pedals || pedals.hidden;
        note.textContent = go.disabled ? "Pause a race with touch driving controls enabled to arrange the buttons." :
          "Move, resize and shape the active touch driving buttons.";
        return;
      }
      if (id === "hud") {
        note.textContent = atHome() ? "Preview the race HUD with sample readouts. Apply or Cancel returns to Appearance." : "Arrange the active race HUD and camera profile.";
        return;
      }
      if (atHome() && (id === "career-history" || id === "career-offers") && typeof Career !== "undefined") {
        const slots = Career.slots().filter(slot => slot.used && !slot.unsupported);
        go.disabled = id === "career-history" ? !slots.length : !slots.some(slot => slot.pendingOffers || (slot.rounds > 0 && slot.round >= slot.rounds));
        if (go.disabled) {
          note.textContent = id === "career-history" ? "Start a career to make Career record available." : "Offers become available at a contract decision or the end of a career season.";
          return;
        }
      }
      if (!atHome() && launchers[id] && !pauseDoors[id] && id !== "results" && id !== "share-card-preview") {
        go.disabled = true;
        note.textContent = "Open Settings → Appearance from Home to arrange " + label + ".";
        return;
      }
      if (needsCircuit(id)) {
        go.textContent = "Choose a circuit for " + label;
        note.textContent = id === "campicker" ? "Start a race, then hold or right-click the camera button. The editor opens with the view picker." :
          id === "photo-controls" ? "Start a race, then choose Photo from Pause. The editor opens on the camera sticks." :
          "Start a race, then choose the tuner in Pause → Settings → Visual Studio." + (id === "freecam" ? " Choose Free Camera in Flyby." : "") + " The editor opens when its window appears.";
        return;
      }
      if (id === "standings" && (atHome() ? document.getElementById("mb-standings") : document.getElementById("pm-standings"))?.hidden) {
        go.disabled = true;
        note.textContent = "Complete a season round to make the standings available.";
        return;
      }
      if (screens[id]?.settingsPage && typeof SettingsNav !== "undefined" && SettingsNav.routes[screens[id].settingsPage]?.scope === "session" && atHome()) {
        go.disabled = true;
        note.textContent = "Pause during a session to arrange " + label + ".";
        return;
      }
      note.textContent = id === "telemetry-detail" ? "Open a lap in Data Hub. Choose Charts & Track or Track View, then Start arranging." : go.disabled ? "Open Appearance from Home to arrange Home." :
        atHome() && id === "duel-picker" ? "Continue from the circuit list to Race Settings, open Field, and choose your duel rival." :
        atHome() && id === "teampicker" ? "Select the team card in the Garage to arrange the team picker." :
        atHome() && id === "quali" ? "In Race Settings, choose a qualifying grid, then start to arrange the qualifying sheet." :
        id === "photo-controls" ? "Open Photo Studio on the paused race to edit the movement and look sticks." :
        id === "flyby-card" ? "Arrange the track card over the Flyby editor preview. Use Track Card in Flyby for the whole card’s size and position." :
        id === "freecam" ? "Choose Free Camera in the Flyby editor to arrange its window." :
        id === "customize" ? "Open Team in Garage, then edit your team." :
        id === "career-offers" ? "Open a saved career with a pending contract or a completed season, then choose Sign a contract or End of season." :
        id === "career-history" ? "Open a saved career, then choose Season by season under Career record." :
        id === "career-guide" ? "In Career Modes, choose How Career Works or How My Team Works." :
        id === "track-detail" ? "In the circuit selector choose Circuit detail." :
        id === "season-setup" ? "In the circuit selector, choose Customise Season or Start New Season after the final round." :
        id === "td-label-ask" ? "Import a copy of a saved circuit with a different name, then choose Save to open Same circuit." :
        id === "watch" ? "In Data Hub choose Watch & Drive, select a completed race, then choose Highlights or Full Race." :
        id === "share-card-preview" ? "After a race, open a share card from Results to arrange the preview." :
        id === "results" ? "Finish a race to edit its actual Results screen." :
        id === "spotifypanel" ? "Choose Open Player in Music & Sound with Spotify connected." :
        id === "bench" ? "Open the Benchmark dialog from Graphics to arrange its test choices and results." :
        id === "campicker" ? "Choose Resume, then hold or right-click the camera button. The editor opens with the view picker." :
        id === "pausemenu" ? "Edit the Pause menu. Apply or Cancel returns to Appearance." :
        id === "popups" ? "Shared appearance for popup sheets. Choose Results to arrange its individual regions." :
        id === "home-style" ? "Edit the title menu’s text and button dimensions." :
        id === "home" || id === "hud" || id === "pmsettings" ? "" :
        "The editor opens when " + label + " is on screen.";
    }
    function updateDescription() {
      describe();
      const id = target.value;
      if (preparation[id] && !go.disabled) {
        const hint = screens[id]?.prepareHint || preparation[id];
        note.textContent += prepareChoice.checked ? " " + hint + " Then choose Start arranging." : " Choose page state first to navigate before editing.";
      }
    }
    prepareChoice.addEventListener("change", updateDescription);
    let lastPreview;
    function refresh() {
      const key = preview.dataset.screen || "home";
      if (key === lastPreview) return;
      lastPreview = key;
      target.value = previewTargets[key] || key;
      if (!target.value) target.value = "home";
      updateDescription();
    }
    target.addEventListener("change", updateDescription);
    if (typeof SettingsNav !== "undefined") SettingsNav.onEnter(page => { if (page === "appearance") updateDescription(); });
    go.addEventListener("click", async () => {
      navigation.pending = null;
      const id = target.value;
      navigation.prepare = id === "telemetry-detail" || (!!preparation[id] && prepareChoice.checked);
      if (id === "popups") {
        const fold = document.getElementById("pm-look-popups");
        if (fold) {
          for (let el = fold; el; el = el.parentElement) if (el.tagName === "DETAILS") el.open = true;
          fold.querySelector("summary")?.focus();
        }
        return;
      }
      if (id === "hud" || id === "touch-controls") {
        updateDescription();
        if (!go.disabled) {
          const door = id === "hud" ? document.getElementById("pm-hud-arrange") : document.getElementById("pm-dock-reposition");
          door?.click();
        }
        return;
      }
      const settings = document.getElementById("pmsettings");
      if (separatePages[id]) {
        const url = new URL(separatePages[id], location.href);
        url.searchParams.set("arrange", id);
        if (navigation.prepare) url.searchParams.set("prepare", "1");
        if (id === "menupad" || id === "wheel") url.searchParams.set("demo", id === "menupad" ? "menu" : "wheel");
        window.open(url, "_blank", "noopener");
        return;
      }
      const fromHome = atHome();
      const chooseCircuit = needsCircuit(id);
      if (id !== "home" && !window.ScreenArranger) {
        go.disabled = true;
        try {
          await ScriptLoader.create().load(["js/ui/screen-arranger.js"], [], { strict: true });
        } catch { /* Keep the picker available for retry. */ }
        updateDescription();
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
      if (visualDoors[id] && !chooseCircuit) {
        const door = visualDoors[id]();
        if (door && !door.disabled) SettingsNav.show("visual", false, () => {
          if (settings.hidden || SettingsNav.current() !== "visual") return;
          navigation.pending = id;
          door.click();
          requestAnimationFrame(() => navigation.reveal(id));
        });
        return;
      }
      if (id === "spotifypanel") {
        SettingsNav.show("audio", true, () => {
          if (settings.hidden || SettingsNav.current() !== "audio") return;
          const door = document.getElementById("as-sp-open");
          navigation.pending = id;
          if (door && !door.disabled) door.click();
        });
        return;
      }
      if (id === "bench") {
        SettingsNav.show("graphics", true, () => {
          if (settings.hidden || SettingsNav.current() !== "graphics") return;
          // Benchmark mounts its door after the profiling bundle loads. An
          // early visit still arms the real dialog for a manual first open.
          navigation.pending = id;
          document.getElementById("pm-bench-open")?.click();
        });
        return;
      }
      const route = id === "pmsettings" ? "home" : id === "cockpit-preview" ? "display" : screens[id]?.settingsPage;
      if (route) {
        // The settings router owns each page's lazy content and availability.
        SettingsNav.show(route, true, () => {
          requestAnimationFrame(() => {
            if (settings.hidden || SettingsNav.current() !== route) return;
            const fold = id === "cockpit-preview" && document.getElementById("pm-cockpit");
            const wasOpen = fold && fold.open;
            if (fold) {
              fold.open = true;
              const preview = document.getElementById("pm-ckpreview");
              if (preview?.getAttribute("aria-expanded") === "false") preview.click();
            }
            const returnToPicker = () => {
              if (settings.hidden || SettingsNav.current() !== route) return;
              if (fold && !wasOpen) fold.open = false;
              SettingsNav.show("appearance", false);
              go.focus({ preventScroll: true });
            };
            if (!navigation.start(id, go, returnToPicker)) {
              returnToPicker();
              note.textContent = "No visible regions on this page.";
            }
          });
        });
        return;
      }
      const back = document.getElementById("pm-settings-close");
      for (let step = 0; step < 12 && !settings.hidden; step++) back.click();
      if (!settings.hidden) return;
      if (id === "home") { TitleLayout.enter(document.getElementById("mb-settings")); return; }
      navigation.pending = id;
      // TopModal closes the native Settings dialog in a microtask. A lazy
      // title launcher captures its current owner and abandons navigation if
      // that owner changes while loading. Invoke it after the close settles.
      requestAnimationFrame(() => {
        if (navigation.pending !== id) return;
        if (chooseCircuit) {
          document.getElementById("mb-race")?.click();
        } else {
          const launcher = id === "select" && mode.value === "practice" ? "mb-practice" : (fromHome ? launchers : pauseDoors)[id];
          const door = launcher && document.getElementById(launcher);
          if (door && id === "telemetry-detail") door.dataset.openTab = "telemetry";
          door?.click();
        }
        navigation.reveal(id);
      });
    });
    refresh();
    new MutationObserver(refresh).observe(preview, { attributes: true, attributeFilter: ["data-screen"] });
  }

  const existing = document.querySelector('[data-as="preview-side"]');
  if (existing) attachPicker(existing);
  return Object.freeze({ attach: attachPicker });
})();
