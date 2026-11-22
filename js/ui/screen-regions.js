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
  screen("pmsettings", "Settings", { heading, navigation: part("#pm-settings-index", "Navigation"), search: part("[data-settings-search]", "Search and results"), content: part(".pm-groups", "Settings"), actions });
  // Page and region IDs must also exist on controller/overlay, where saving a
  // companion layout normalizes the shared store without loading SettingsNav.
  const pageRegions = {
    controls: parts("pm-", { "steer-item": "Steering", throttlemode: "Pedals", "keys-section": "Keyboard", "pad-section": "Gamepad", phonepad: "Phone controller", "touch-response-fields": "Touch button response" }),
    driving: { presets: part(".preset-row", "Presets"), ...parts("pm-", { gears: "Gears", aero: "Aero", coach: "Coach", "braking-cues": "Braking cues" }) },
    display: parts("pm-", { "hud-details": "HUD settings", hudprofile: "HUD profile", hudmetrics: "Metrics layout", hudmap: "Map", hudmirror: "Mirror", "hud-sample": "HUD preview" }),
    graphics: parts("pm-", { "display-adv": "Renderer settings", res: "Resolution", fullscreen: "Fullscreen", upscale: "Upscaling", "graphics-details-body": "Individual effects" }),
    appearance: { studio: part("#appearance-studio", "Appearance Studio"), ...parts("pm-", { "appearance-menu": "Menu colours", "appearance-hud": "HUD colours", general: "Readability" }),
      presets: part('[data-as="preset-list"]', "Appearance presets"), scope: part('[data-as="preview-side"]', "Preview and screen picker") },
    a11y: parts("pm-", { motion: "Reduced motion", focus: "Keyboard focus", cbcues: "Colourblind cues", "hold-throttle": "Gas input", "hold-lookback": "Look back input" }),
    advanced: { pace: part("label[for=pm-pace]", "Overall speed"), more: part("#adv-details", "Advanced handling"), ...parts("pm-", { "tiltdeg-jump": "Tilt setup", "line-jump": "Steer assist" }) },
    audio: parts("as-", { "music-details": "Music", "sound-details": "Sound effects", "radio-details": "Team radio", "ann-details": "Announcers", "engine-details": "Engine" }),
    files: { ...parts("pm-files-", { nav: "Backup actions", save: "Save files", restore: "Restore files", share: "Import share code" }), daily: part("#daily-history", "Daily history") },
    visual: parts("pm-", { lighting: "Lighting tuner", camtune: "Camera tuner", flyby: "Flyby editor", garrival: "Garage animations" }),
    progress: parts("pm-badges-", { summary: "Licence progress", list: "Badge list" }),
    credits: parts("credits-", { data: "Data sources", software: "Software", fonts: "Fonts", assets: "Assets" }),
    practice: parts("pm-", { "practice-pathway": "Training pathway", drill: "Practice drill", "practice-set": "Save starting point", "practice-retry": "Retry", "practice-rewind": "Rewind" }),
    strategy: parts("pm-", { "pit-choice": "Tyre choice", "pit-estimate": "Pit estimate", "stint-forecast": "Stint forecast", "energy-forecast": "Energy forecast" }),
    review: parts("pm-", { "coach-summary": "Coaching summary", "incident-log": "Incident log", "last-lap-energy": "Lap energy", "technical-data": "Technical data" }),
  };
  for (const [page, regions] of Object.entries(pageRegions)) {
    const id = "pm-panel-" + page;
    const route = typeof SettingsNav === "undefined" || typeof document === "undefined" ? null : SettingsNav.routes[page];
    const root = "#" + (route?.panel()?.id || ({ advanced: "advanced", audio: "audioset" })[page] || id);
    screen(id, "Settings › " + (route?.title || page), { panel: part(root, "Page controls"), ...regions }, root);
    screens[id].settingsPage = page;
  }
  screen("career", "Career", {
    heading, navigation: part("#cr-left", "Left pane"), calendar: part("#cr-right", "Right pane"), actions,
    ...parts("cr-", { meters: "Career meters", nextrace: "Next race", funds: "Funds and budget controls", ladder: "Career ladder", back: "Back", garage: "Garage", go: "Go racing" }),
    flavours: part(".cr-flavours", "Career type"), teams: part(".cr-teamgrid", "Starting team"),
    identity: part(".cr-form", "Driver and team details"), objective: part(".cr-objective", "Race objective"),
    sections: part('[data-career-part="nav"]', "Hub navigation"),
    seasonStory: part('[data-career-part="story"]', "Season story"),
    rounds: part('[data-career-part="calendar"]', "Season calendar"),
    milestones: part('[data-career-part="milestones"]', "Career milestones"),
  });
  screen("carsetup", "Garage", {
    panel: { ...part("#cs-inner", "Setup panel"), maxWidth: 65, maxHeight: 70, scale: false, constraint: "Width and height reserve room for the car. Use these to resize the panel at its current text size." },
    camera: part("#cs-stack", "Car view controls"), actions,
    ...parts("cs-", { header: "Heading", "budget-wrap": "Budget", "stats-inner": "Performance bars", tabs: "Categories",
      options: "All option panels", "cam-panel": "Camera adjustments", bar: "Camera and aero buttons",
      arrival: "Arrival controls", back: "Back", done: "Done" }),
    teamOptions: part('#cs-options[aria-labelledby="cs-tab-team"]', "Team options"),
    tuneOptions: part('#cs-options[aria-labelledby="cs-tab-tune"]', "Setup options"),
    liveryOptions: part('#cs-options[aria-labelledby="cs-tab-livery"]', "Livery options"),
  });
  screen("select", "Track selector", {
    heading, tracks: part("#sel-shelf", "Circuit list"), preview: part("#sel-track-section", "Circuit preview"), actions,
    ...parts("sel-", { "track-filter": "Circuit filters", "track-search": "Circuit search",
      "map-btn": "Map button", "detail-chip": "Circuit detail button", "preview-facts": "Circuit facts", "preview-elev": "Elevation profile",
      back: "Back", car: "Choose car", go: "Continue" }), tiles: part("#sel-tracks", "Circuit tiles"), brief: part("#practice-brief", "Practice briefing"),
  });
  screen("track-detail", "Circuit detail", { heading, map: part("#track-detail-canvas-wrap", "Track map"), details: part("#track-detail-panel", "Track details"), ...parts("track-detail-", { close: "Close", meta: "Circuit facts", "elev-wrap": "Elevation profile", "drs-wrap": "Overtake zones", list: "Corners" }) });
  screen("pausemenu", "Pause", { heading, ...parts("pm-", { resume: "Resume", restart: "Restart race", settings: "Settings", quit: "Quit to menu" }), summary: part("#pm-race-context", "Race summary"), tools: part("#pm-quick-doors", "Race tools"), music: part("#pm-now-card", "Now playing") });
  Object.assign(screens.pausemenu.regions, parts("pm-", { strategy: "Strategy", review: "Review", practice: "Practice", photo: "Photo", howto: "How to play",
    checkpoint: "Rewind and retry", standings: "Standings", "skip-results": "Skip to results", prev: "Previous track", play: "Play or pause music", skip: "Next track" }));
  screen("season-setup", "Season setup", {
    heading, calendar: part("#ss-cal", "Calendar"), circuits: part("#ss-pool", "Available circuits"), actions,
    ...parts("ss-", { presets: "Calendar presets", quali: "Qualifying format", sprint: "Sprint format",
      laps: "Race distance", points: "Points format", fl: "Fastest lap point", drop: "Dropped scores", back: "Back", apply: "Apply" }),
  });
  screen("race-settings", "Race settings", {
    heading, content, actions, presets: part("#rs-presets", "Preset buttons"),
    ...parts("rs-preset-", { quick: "Quick race", weekend: "Full weekend", endurance: "Endurance" }),
    ...parts("rs-", { laps: "Laps", weather: "Weather", mixed: "Conditions", time: "Time of day",
      "fold-field": "Field settings", "fold-assists": "Assists and wear", diff: "Difficulty", quali: "Grid", duel: "Duel",
      caution: "Cautions", reliab: "Reliability", line: "Driving line", tyres: "Tyre wear", dirty: "Dirty air", plan: "Strategy" }),
    back: part("#rs-cancel", "Back"), start: part("#rs-go", "Start race"),
  });
  const rankings = {
    drivers: part('[data-ranking="drivers"]', "Driver standings"),
    constructors: part('[data-ranking="constructors"]', "Constructor standings"),
  };
  // Each row already has stable IDs even when the lap choices or the session flow changes.
  const raceRegions = screens["race-settings"].regions;
  for (const row of ["laps", "weather", "mixed", "time", "diff", "quali", "caution", "reliab", "line", "tyres", "dirty", "plan"]) {
    for (const [suffix, label] of [["prev", "Previous"], ["sel", "Value"], ["next", "Next"]]) {
      const id = row + "-" + suffix;
      raceRegions[id] = part("#rs-" + id, raceRegions[row].label + " · " + label);
    }
  }
  raceRegions.opponent = part("#rs-duel-open", "Choose duel rival");
  screen("results", "Race results", {
    heading, summary: part("#res-winner", "Winner"), classification: part("#results-table", "Results panel"), actions,
    story: part('[data-results-part="story"]', "Race story"), podium: part('[data-results-part="podium"]', "Podium"),
    finishers: part('[data-ranking="race"]', "Classification"), ...rankings,
    leaderboard: part('[data-ranking="laps"]', "Lap leaderboard"), stints: part(".res-stints", "Tyre stints"),
    incidents: part("#res-incidents", "Incidents"), settlement: part(".res-settle", "Career settlement"),
    menu: part("#res-menu", "Menu"), next: part("#res-next", "Continue"),
  });
  const hubPages = {};
  for (const [tab, label] of Object.entries({ schedule: "Schedule", standings: "Standings", results: "Session results",
    live: "Live timing", telemetry: "Telemetry", race: "Watch and Drive" })) {
    hubPages[tab] = part('#dh-panel[aria-labelledby="dh-tab-' + tab + '"]', label + " panel");
  }
  screen("datahub", "Data Hub", {
    heading, navigation: part(".dh-tabs", "Tabs"), content: part("#dh-panel", "All tab panels"), ...hubPages,
    close: part("#dh-close-btn", "Close"), filters: part(".dh-picker", "Session filters"),
    nextRace: part('[data-nextgp="tile"]', "Next Grand Prix"), scheduleList: part(".dh-race-grid", "Schedule grid"),
    telemetryDrivers: part(".dh-driverpick", "Telemetry driver picker"), timingControls: part(".dh-livecontrols", "Live timing controls"),
  });
  screen("telemetry-detail", "Telemetry detail", {
    heading: part(".dh-tpopup-hdr", "Drivers and session"), traces: part(".dh-tpopup-body", "Telemetry detail panel"),
    charts: part(".dh-telem-main", "Trace area"), sidebar: part(".dh-telem-side", "Map and gauges"),
    transport: part(".dh-transport", "Playback controls"), legend: part(".dh-legend", "Trace channels"),
    gauges: part(".dh-dash", "Gauges"), close: part("#dh-tpopup-close", "Close"),
  }, "dialog.dh-tpopup");
  screen("share-card-preview", "Share card", {
    heading, preview: part("#scp-img", "Card preview"), size: part('[aria-label="Card size"]', "Card size"), actions,
    ...parts("scp-", { status: "Export status", share: "Share", save: "Save image", close: "Close" }),
  });
  screen("trackdesigner", "Track Designer", { canvas: part(".td-stage", "Drawing area"), controls: part(".td-rail", "Designer controls"),
    tabs: part(".td-tabs", "Workspace tabs"), modes: part('[data-role="mode-bar"]', "Design tools"),
    design: part("#td-pane-design", "Design inspector"), library: part("#td-pane-library", "Circuit library"),
    help: part("#td-pane-howto", "Designer guide"), actions: part(".td-foot", "Circuit actions"),
    files: part('[data-role="file-menu"]', "Share and files"), status: part('[data-role="workspace-status"]', "Checks and status") });
  // The guide belongs to the export crop. Only the UI in front of it moves.
  screen("photo-studio", "Photo Studio", { panel: part("#ps-panel", "Studio panel"), ...parts("ps-group-", { subject: "Subject", car: "Car placement", conditions: "Time and weather", line: "Driving line",
      garage: "Garage lighting", lighting: "Photo lighting", composition: "Composition", photo: "Your photo" }),
    ...parts("ps-", { album: "Photo library", preview: "Captured image", shots: "Shot presets" }),
    actions, capture: part("#ps-capture", "Capture"), done: part("#ps-close", "Done") });
  screen("campicker", "Camera view picker", { views: part("#campicker", "Camera buttons") });
  screen("photo-controls", "Photo controls", { move: part(".pc-move-wrap", "Movement stick"), look: part(".pc-look-wrap", "Look stick"), altitude: part(".pc-altcol", "Height controls"),
    actions: part("#pc-bar", "Camera controls"), lens: part(".pc-fovlab", "Field of view") });
  const replayPart = (key, label) => part('[data-wt="' + key + '"]', label);
  screen("watch", "WATCH replay", { controls: part('[data-wt="controls"]', "Transport"), timeline: part('[data-wt="timeline"]', "Timeline"), chapters: part('[data-wt="chapters"]', "Chapters"),
    timing: part("#bc-tower", "Timing tower"), picture: part("#bc-pip", "Picture in picture"),
    play: replayPart("play", "Play or pause"), previous: replayPart("prev", "Previous event"), next: replayPart("next", "Next event"),
    driver: replayPart("driver-field", "Followed driver"), speed: replayPart("speed-field", "Playback speed"),
    camera: replayPart("camera-field", "Camera choice"), auto: replayPart("auto", "Auto director"), lock: replayPart("lock", "Follow lock"),
    photo: replayPart("photo", "Photo"), captions: replayPart("caption", "Race and radio captions") }, "body.watch-controls-on");

  for (const [id, label] of [
    ["career-offers", "Career offers"], ["career-history", "Career history"], ["career-guide", "Career guide"],
    ["teampicker", "Team picker"], ["vsfriend", "Play a friend"], ["duel-picker", "Duel opponent"],
    ["spotifypanel", "Music and sound"],
  ]) screen(id, label, { heading, content, actions });
  screen("quali", "Qualifying", { heading, content, actions, ...parts("q-", { table: "Qualifying order", back: "Back", drive: "Drive my lap", sim: "Simulate", go: "To the grid" }) });
  screen("standings", "Standings", { heading, content, actions, ...rankings });
  Object.assign(screens.teampicker.regions, { close: part("#tp-close", "Close") });
  Object.assign(screens["duel-picker"].regions, { rivals: part("#duel-list", "Rivals"), close: part("#duel-close", "Back") });
  Object.assign(screens.quali.regions, parts("q-", { table: "Qualifying order", back: "Back", drive: "Drive my lap", sim: "Simulate", go: "To the grid" }));
  Object.assign(screens.vsfriend.regions, parts("vs-", {
    pick: "Connection options", host: "Host a race", join: "Join a friend", "code-entry": "Room code options", code: "Room code",
    "code-show": "Share room code", "code-input": "Enter room code", hosting: "Host invitation", joining: "Join invitation",
    "qr-wrap": "Invite QR code", "answer-qr-wrap": "Answer QR code", invite: "Invite text", "answer-in": "Answer input",
    "invite-in": "Invite input", "answer-actions": "Share answer", accept: "Connect",
    room: "Race lobby", "race-summary": "Race summary", roster: "Driver roster", "edit-race": "Edit race",
    "edit-car": "Edit car", "invite-more": "Invite another driver", ready: "Ready", start: "Start race",
    scan: "Code scanner", "scan-cancel": "Cancel scan", status: "Connection status", close: "Close",
  }));
  screen("customize", "Customize", { content, preview: part("#cz-preview", "Color preview"), actions });
  screen("howtoplay", "How to play", { heading, navigation: part("#htp-contents", "Contents"), content, actions,
    ...parts("htp-", { controls: "Quick start", inputs: "Input guide", close: "Close" }) });
  const tunerRegions = {
    lighting: parts("lt-", { rail: "Profile and lighting tools", preview: "Preview", tabs: "Lighting categories" }),
    camtune: parts("ct-", { rail: "Camera scope", modes: "Camera modes", previews: "Corner previews" }),
    flyby: parts("fb-", { rail: "Shot controls", scrub: "Playback position", shots: "Shot list", ops: "Shot actions" }),
    freecam: parts("fc-", { status: "Camera status", shot: "Flyby framing" }),
    garrival: { sequences: part("[data-editor-sequences]", "Animation previews"), transport: part("#ga-transport", "Preview playback") },
  };
  for (const [id, label, prefix] of [
    ["lighting", "Lighting", "lt"], ["camtune", "Camera tuning", "ct"], ["flyby", "Flyby", "fb"],
    ["freecam", "Free camera", "fc"], ["garrival", "Garage arrival", "ga"],
  ]) screen(id, label, { heading: part(id === "freecam" ? "#fc-head" : ".ew-toolbar", "Toolbar"),
    content: part("#" + prefix + "-rows", "Controls"), actions, ...tunerRegions[id] });

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

  for (const [id, label] of Object.entries({
    continue: "Continue", daily: "Daily time trial", race: "Race", tt: "Time trial", vs: "Race a friend", season: "Season",
    practice: "Practice", garage: "Garage", watch: "Watch", data: "Data Hub", photo: "Photo Studio", designer: "Track Designer",
    visual: "Visual Studio", standings: "Standings", settings: "Settings", phonepad: "Use as controller",
    steerphone: "Phone controller", help: "How to play", saves: "Saves and data",
  })) screens["home-style"].regions[id] = homePart("#mb-" + id, label);
  screen("pair", "Pair phone", { heading: part("#pair-copy h1", "Heading"), scanner: part("#scan-box", "Scanner view"), status: part("#status", "Pairing status"), instructions: part("#pair-copy p", "Instructions"), scan: part("#scan", "Scan QR code"), code: part("#code", "Room code"), connect: part("#connect", "Connect") });
  screen("menupad", "Phone menu pad", { pad: part("#dpad", "Direction pad"), status: part("#mp-mid", "Status and pause"), actions: part("#ab", "Back and select"), back: part("#b-navBack", "Back"), select: part("#b-navSelect", "Select"), pause: part("#b-pause-menu", "Pause or resume") });
  screen("broadcast", "Broadcast overlay", { tower: part(".ov-tower", "Timing tower"), sectors: part(".ov-sectors", "Sector times"),
    battle: part(".ov-battle", "Battle"), caption: part(".ov-caption", "Caption") }, "main#overlay");

  // Appearance keeps its illustrative preview. This button uses the same
  // launchers a player would press, so their Career slot or race stays theirs.
  const previewTargets = { garage: "carsetup", race: "race-settings", pause: "pausemenu" };
  const launchers = { career: "mb-career", carsetup: "mb-garage", select: "mb-race", datahub: "mb-data",
    "race-settings": "mb-race", "track-detail": "mb-race", "duel-picker": "mb-race", quali: "mb-race", teampicker: "mb-garage", "season-setup": "mb-season",
    trackdesigner: "mb-designer", "photo-studio": "mb-photo", watch: "mb-watch", vsfriend: "mb-vs", howtoplay: "mb-help" };
  const flybyDoor = () => document.getElementById("pm-flyby");
  const visualDoors = {
    lighting: () => document.getElementById("pm-lighting"),
    camtune: () => document.getElementById("pm-camtune"),
    garrival: () => document.getElementById("pm-garrival"),
    flyby: flybyDoor, freecam: flybyDoor, "photo-controls": flybyDoor,
  };
  const separatePages = { pair: "controller.html", menupad: "controller.html", wheel: "controller.html", broadcast: "overlay.html" };
  let pending;
  const reentry = new WeakMap();
  // Screens with tabs, folds or multiple steps can expose different regions
  // after the first edit. Keep a way back while this screen remains open.
  function addReentry(id, root) {
    if (reentry.has(root) || root.hidden) return;
    const door = document.createElement("button");
    door.type = "button";
    door.textContent = "Arrange again";
    door.onclick = () => window.ScreenArranger.open(id, door);
    root.querySelector(".sheet-head").appendChild(door);
    reentry.set(root, door);
  }
  function tryPending(id) {
    if (pending !== id) return;
    const root = document.querySelector(screens[id].root);
    if (!root || root.hidden || root.tagName === "DIALOG" && !root.open || !root.getClientRects().length) return;
    const focus = Array.from(root.querySelectorAll("button:enabled")).find(el => el.getClientRects().length);
    if (window.ScreenArranger?.open(id, focus || root)) {
      pending = null;
      if (["race-settings", "vsfriend", "photo-studio", "trackdesigner"].includes(id)) addReentry(id, root);
    }
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
    target.add(new Option("Shared popup style", "popups"));
    target.add(new Option("Phone wheel", "wheel"));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "arrange-route";
    host.append(target, go);
    const atHome = () => document.getElementById("overlay")?.hidden === false && !window.UiLayers?.inRace();
    function describe() {
      const id = target.value;
      const label = target.selectedOptions[0].text;
      host.dispatchEvent(new CustomEvent("apex:arrangement-target", {detail: {id, label}}));
      go.textContent = id === "popups" ? "Edit shared popup style" : "Arrange " + label;
      go.disabled = (id === "home" || id === "home-style") && !atHome();
      if (visualDoors[id]?.()?.disabled) {
        go.disabled = true;
        note.textContent = "Pause on track to arrange " + label + ".";
        return;
      }
      if (screens[id]?.settingsPage && typeof SettingsNav !== "undefined" && SettingsNav.routes[screens[id].settingsPage]?.scope === "session" && atHome()) {
        go.disabled = true;
        note.textContent = "Pause during a session to arrange " + label + ".";
        return;
      }
      note.textContent = go.disabled ? "Open Appearance from Home to arrange Home." :
        atHome() && id === "duel-picker" ? "Continue from the circuit list to Race Settings, open Field, and choose your duel rival." :
        atHome() && id === "teampicker" ? "Select the team card in the Garage to arrange the team picker." :
        atHome() && id === "quali" ? "In Race Settings, choose a qualifying grid, then start to arrange the qualifying sheet." :
        id === "freecam" || id === "photo-controls" ? "Choose Free Camera in the Flyby editor to open these controls." :
        id === "pausemenu" ? "Edit the Pause menu. Apply or Cancel returns to Appearance." :
        id === "popups" ? "Shared appearance for popup sheets. Choose Results to arrange its individual regions." :
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
      if (id === "popups") {
        const fold = document.getElementById("pm-look-popups");
        if (fold) {
          for (let el = fold; el; el = el.parentElement) if (el.tagName === "DETAILS") el.open = true;
          fold.querySelector("summary")?.focus();
        }
        return;
      }
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
      if (visualDoors[id]) {
        const door = visualDoors[id]();
        if (door && !door.disabled) SettingsNav.show("visual", false, () => {
          if (settings.hidden || SettingsNav.current() !== "visual") return;
          pending = id;
          door.click();
          requestAnimationFrame(() => tryPending(id));
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
      // TopModal closes the native Settings dialog in a microtask. A lazy
      // title launcher captures its current owner and abandons navigation if
      // that owner changes while loading. Invoke it after the close settles.
      requestAnimationFrame(() => {
        if (pending !== id) return;
        if (fromHome && launchers[id]) document.getElementById(launchers[id])?.click();
        tryPending(id);
      });
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
    // A route may span several real screens (e.g. track selection into Race
    // Settings). Backing out or choosing a different Home destination drops it.
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") pending = null;
    }, true);
    document.addEventListener("click", event => {
      if (!pending) return;
      const door = event.target.closest?.("#menu-buttons button");
      const back = event.target.closest?.("[data-esc-close]");
      if ((door && door.id !== launchers[pending]) ||
          (back && back.dataset.escClose === event.target.closest("button")?.id)) pending = null;
    }, true);
    const ids = new WeakMap();
    const reveal = (root) => {
      const id = ids.get(root);
      if (root.hidden && reentry.has(root)) {
        reentry.get(root).remove();
        reentry.delete(root);
      }
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
