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
      presets: part('[data-as="preset-list"]', "Appearance presets"), scope: part('[data-as="preview-side"]', "Appearance preview"), picker: part("#appearance-arrange", "Screen to arrange") },
    a11y: parts("pm-", { motion: "Reduced motion", focus: "Keyboard focus", cbcues: "Colourblind cues", "hold-throttle": "Gas input", "hold-lookback": "Look back input" }),
    advanced: { pace: part("label[for=pm-pace]", "Overall speed"), more: part("#adv-details", "Advanced handling"), ...parts("pm-", { "tiltdeg-jump": "Tilt setup", "line-jump": "Steer assist" }) },
    audio: parts("as-", { "music-details": "Music", "sound-details": "Sound effects", "radio-details": "Team radio", "ann-details": "Announcers", "engine-details": "Engine" }),
    files: {
      ...parts("pm-files-", { nav: "Backup tabs", save: "Save files", restore: "Restore files", share: "Import share code", included: "Backup contents" }),
      ...parts("pm-", { "settings-changed": "Save changed settings", "settings-all": "Save all settings", "garage-save": "Save garage file", "career-save": "Save career file",
        "settings-load": "Load settings file", "garage-load": "Load garage file", "career-load": "Load career file",
        "share-code-in": "Share code field", "share-code-import": "Import button", "share-code-status": "Import feedback" }),
      daily: part("#daily-history", "Daily history"), health: part(".save-health", "Storage health and restore points"),
      history: part(".save-health-history", "Restore point selection"),
    },
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
      "fold-field": "Field settings", "fold-assists": "Assists and wear", diff: "Difficulty", aipace: "AI pace", quali: "Grid", duel: "Duel",
      caution: "Cautions", reliab: "Reliability", line: "Driving line", tyres: "Tyre wear", dirty: "Dirty air", plan: "Strategy" }),
    back: part("#rs-cancel", "Back"), start: part("#rs-go", "Start race"),
  });
  const rankings = {
    drivers: part('[data-ranking="drivers"]', "Driver standings"),
    constructors: part('[data-ranking="constructors"]', "Constructor standings"),
  };
  // Each row already has stable IDs even when the lap choices or the session flow changes.
  const raceRegions = screens["race-settings"].regions;
  for (const row of ["laps", "weather", "mixed", "time", "diff", "aipace", "quali", "caution", "reliab", "line", "tyres", "dirty", "plan"]) {
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
    drivers: part('[data-hub-part="drivers"]', "Driver standings"), constructors: part('[data-hub-part="constructors"]', "Constructor standings"),
    headToHead: part(".dh-h2h-wrap", "Championship comparison"),
    resultsTable: part(".dh-res-body .dh-table", "Session classification"), resultRounds: part(".dh-res-body .dh-rounds", "Qualifying rounds"),
    timingSort: part(".dh-sorts", "Timing order"), liveClass: part(".dh-class-rows", "Live classification"), weather: part(".dh-weather", "Session weather"),
    selectedDrivers: part('[data-hub-part="lanes"]', "Selected telemetry drivers"), loadTraces: part('[data-hub-part="traces"]', "Open telemetry"),
    replayControls: part('[data-hub-part="replay"]', "Race replay controls"), lapList: part('[data-hub-part="lap-list"]', "Lap by lap"),
    lapBoard: part('[data-hub-part="selected-lap"] .dh-table', "Selected lap classification"),
  });
  screen("telemetry-detail", "Telemetry detail", {
    heading: part(".dh-tpopup-hdr", "Drivers and session"), traces: part(".dh-tpopup-body", "Telemetry detail panel"),
    charts: part(".dh-telem-main", "Trace area"), sidebar: part(".dh-telem-side", "Map and gauges"),
    transport: part(".dh-transport", "Playback controls"), legend: part(".dh-legend", "Trace channels"),
    gauges: part(".dh-dash", "Gauges"), close: part("#dh-tpopup-close", "Close"),
    window: part(".dh-tpopup-card", "Detail window"), summary: part('[data-hub-part="summary"]', "Text summary"),
    play: part(".dh-tplay", "Play or pause"), restart: part(".dh-trestart", "Restart"), rates: part(".dh-trates", "Playback speed"),
    onboard: part(".dh-onboard", "Onboard camera"), braking: part("details.dh-thint", "Braking zone duel"),
    mapKey: part(".dh-maplegend", "Track map legend"), stints: part('[data-hub-part="stints"]', "Tyre stints"),
    pits: part('[data-hub-part="pits"]', "Pit stops"),
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
  screen("td-label-ask", "Track Designer · Same circuit", { heading, content, actions,
    keep: part("#td-label-keep", "Keep mine"), replace: part("#td-label-theirs", "Use theirs") });
  // The guide belongs to the export crop. Only the UI in front of it moves.
  screen("photo-studio", "Photo Studio", { panel: part("#ps-panel", "Studio panel"), ...parts("ps-group-", { subject: "Subject", car: "Car placement", conditions: "Time and weather", line: "Driving line",
      garage: "Garage lighting", lighting: "Photo lighting", composition: "Composition", photo: "Your photo" }),
    ...parts("ps-", { album: "Photo library", preview: "Captured image", shots: "Shot presets" }),
    actions, capture: part("#ps-capture", "Capture"), done: part("#ps-close", "Done") });
  screen("bench", "Benchmark", { heading, content: part("#bench-body", "Test and results panel"), tests: part('#bench-body [aria-label="Test"]', "Test choices"),
    timings: part("#bench-summary", "Performance results"), scenes: part("#bench-scenes", "Scene results"),
    export: part("#bench-export", "Result actions"), back: part("#bench-back", "Back") });
  screen("cockpit-preview", "Cockpit preview", { picture: part("#ckpreview-frame", "3D cockpit"),
    angles: part("#ckpreview-angles", "Preview angles"), status: part("#ckpreview-view [aria-live]", "Preview description") }, "#ckpreview-view");
  screen("campicker", "Camera view picker", { views: part("#campicker", "Camera buttons") });
  screen("photo-controls", "Photo controls", { move: { ...part(".pc-move-wrap", "Movement stick"), diameter: ".pc-stick" }, look: { ...part(".pc-look-wrap", "Look stick"), diameter: ".pc-stick" }, altitude: part(".pc-altcol", "Height controls"),
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
    lighting: parts("lt-", { rail: "Profile and lighting tools", profile: "Active lighting profile", preview: "Preview conditions", spread: "Copy across circuits", tabs: "Lighting categories", json: "Exported lighting values" }),
    camtune: parts("ct-", { rail: "Camera sidebar", scope: "Edit scope", presets: "Camera presets", copyrow: "Copy framing", profile: "Active camera profile", modes: "Camera modes", previews: "Corner previews", json: "Exported camera values" }),
    flyby: parts("fb-", { rail: "Shot controls", profile: "Flyby profile", status: "Selected shot status", scrub: "Playback position", shots: "Shot list", ops: "Shot actions", json: "Exported shot list" }),
    freecam: parts("fc-", { status: "Camera status", shot: "Flyby framing", snaps: "Snap camera", lens: "Lens", copies: "Copy view", kit: "Grid and bookmarks", "dof-focus-row": "Focus distance", "dof-blur-row": "Focus blur", out: "Copied view" }),
    garrival: { sequences: part("[data-editor-sequences]", "Animation previews"), help: part("[data-editor-help]", "Help and reset"),
      ...parts("ga-", { transport: "Preview playback", scrubber: "Playback timeline", time: "Playback time", phase: "Jump to phase",
        play: "Play or pause", loop: "Loop", edit: "Edit frame", "preview-stop": "Stop preview" }),
      ...Object.fromEntries(Object.entries({ enabled: "Animations", speed: "Playback speed", angle: "Garage angle", "crew-in": "Enter crew", "crew-out": "Leave crew", fov: "Field of view" })
        .map(([key, label]) => [key, part('.set-row:has(#ga-' + key + ')', label)])) },
  };
  Object.assign(tunerRegions.lighting, parts("lt-panel-", {
    "sun-moon": "Sun and moon", "ambient-bounce": "Ambient and bounce", shadows: "Shadows",
    "road-reflections": "Road and reflections", car: "Car lighting", "sky-weather": "Sky and weather",
    atmosphere: "Atmosphere", lamps: "Lamps", "night-glow-bloom": "Night glow and bloom",
    "image-colour": "Image and colour", fx: "Lighting effects",
  }));
  Object.assign(tunerRegions.flyby, parts("fb-row-", { dur: "Shot duration", ease: "Shot easing", fov0: "Starting field of view", fov1: "Ending field of view" }),
    parts("fb-", { "ann-script": "Announcer script", "ann-play": "Play announcement" }));
  const workspaceTools = { tools: part("details.ew-tools", "Scope and tools"),
    editorActions: part('[role="group"][aria-label="Editor actions"]', "Editor actions") };
  for (const [id, label, prefix] of [
    ["lighting", "Lighting", "lt"], ["camtune", "Camera tuning", "ct"], ["flyby", "Flyby", "fb"],
    ["freecam", "Free camera", "fc"], ["garrival", "Garage arrival", "ga"],
  ]) {
    screen(id, label, { window: part("#" + id + "-inner", "Whole window"), heading: part(id === "freecam" ? "#fc-head" : ".ew-toolbar", "Toolbar"),
    content: part("#" + prefix + "-rows", "Controls"), actions,
    ...(id === "freecam" ? {} : workspaceTools), ...tunerRegions[id] });
    screens[id].tuner = true;
  }

  for (const [id, hint] of Object.entries({
    "photo-studio": "Choose a subject, then capture or import a photo to arrange its preview.",
    lighting: "Open a lighting category, or choose Copy values to show the exported lighting values.",
    camtune: "Choose the camera and editing scope, or choose Copy values to show the exported camera values.",
    flyby: "Select a shot, or choose Copy values to show the exported shot list.",
    freecam: "Choose Copy view to show the camera text.",
    garrival: "Play a preview and pause it to arrange its playback controls.",
  })) screens[id].prepareHint = hint;

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
  screen("menupad", "Phone menu pad", { pad: { ...part("#dpad", "Direction pad"), diameter: ":scope" }, status: part("#mp-mid", "Status and pause"), actions: part("#ab", "Back and select"), back: part("#b-navBack", "Back"), select: part("#b-navSelect", "Select"), pause: part("#b-pause-menu", "Pause or resume") });
  screen("broadcast", "Broadcast overlay", { tower: part(".ov-tower", "Timing tower"), sectors: part(".ov-sectors", "Sector times"),
    battle: part(".ov-battle", "Battle"), caption: part(".ov-caption", "Caption") }, "main#overlay");

  // The standalone controller and broadcast pages use these routes without loading Appearance.
  const navigation = { pending: null, prepare: false, start: startEditor, reveal: tryPending,
    acceptsDoor: /** @type {((target: string, door: string) => boolean) | null} */ (null) };
  // A symbol cannot collide with a saved region ID, including a malformed import.
  Object.defineProperty(screens, Symbol.for("apex.arrangementRoute"), { value: navigation });
  let controllerOrientation;
  function tryPending(id) {
    if (navigation.pending !== id || (id === "menupad" && controllerOrientation?.matches)) return;
    const root = document.querySelector(screens[id].root);
    if (!root || root.hidden || root.tagName === "DIALOG" && !root.open || !root.getClientRects().length) return;
    const focus = Array.from(root.querySelectorAll("button:enabled")).find(el => el.getClientRects().length);
    if (startEditor(id, focus || root)) {
      navigation.pending = null;
    }
  }
  function startEditor(id, invoker, onClose) {
    const editor = window.ScreenArranger;
    return navigation.prepare ? editor?.prepare(id, invoker, onClose) : editor?.open(id, invoker, onClose);
  }

  function install() {
    document.addEventListener("apex:spotify-authorizing", event => {
      event.detail.arrange = navigation.pending === "spotifypanel";
    });
    const query = new URLSearchParams(location.search);
    if (query.has("arrange") && !document.getElementById("menu-buttons")) {
      navigation.prepare = query.get("arrange") === "pair" && query.get("prepare") === "1";
      navigation.pending = query.get("arrange") || "broadcast";
      if (navigation.pending === "wheel" || navigation.pending === "menupad") controllerOrientation = window.matchMedia("(orientation: portrait)");
    }
    // A route may span several real screens (e.g. track selection into Race
    // Settings). Backing out or choosing a different Home destination drops it.
    document.addEventListener("keydown", event => {
      if (!navigation.pending || event.key !== "Escape") return;
      // Escape on the track pauses, and Escape on Pause resumes. Neither
      // leaves the player's route to Results, Photo or the camera picker.
      if (window.UiLayers?.inRace() && (!window.UiLayers.anyOpen() || window.UiLayers.top()?.id === "pausemenu")) return;
      navigation.pending = null;
    }, true);
    document.addEventListener("click", event => {
      if (!navigation.pending) return;
      const door = event.target.closest?.("#menu-buttons button");
      const back = event.target.closest?.("[data-esc-close]");
      if (window.UiLayers?.inRace() && event.target.closest("button")?.id === "pm-resume") return;
      if ((door && !navigation.acceptsDoor?.(navigation.pending, door.id)) ||
          (back && back.dataset.escClose === event.target.closest("button")?.id)) navigation.pending = null;
    }, true);
    const ids = new WeakMap();
    const reveal = (root) => {
      const id = ids.get(root);
      if (!id || root.hidden || document.querySelector("#screen-arranger[open]")) return;
      if (id === navigation.pending) requestAnimationFrame(() => tryPending(id));
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
    if (wheel && (navigation.pending === "wheel" || navigation.pending === "menupad")) {
      const start = () => {
        if (controllerOrientation.matches && navigation.pending) return;
        if (navigation.pending === "menupad") tryPending("menupad");
        else if (navigation.pending === "wheel" && wheel.getClientRects().length) {
          document.getElementById("lay-arrange").click();
          navigation.pending = null;
        }
        if (!navigation.pending) {
          observer.disconnect();
          controllerOrientation.removeEventListener("change", start);
        }
      };
      const observer = new MutationObserver(start);
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      controllerOrientation.addEventListener("change", start);
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
