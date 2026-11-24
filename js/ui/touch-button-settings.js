/* Shared response editor for in-game touch buttons and the phone controller. */
const TouchButtonSettings = (() => {
  "use strict";
  const displays = new WeakMap();
  const profilePickers = new WeakMap();

  function mountProfilePicker(host, store, modes, onApply) {
    if (!host || typeof ControllerProfiles === "undefined") return;
    if (profilePickers.has(host)) { profilePickers.get(host)(); return; }
    const presets = ControllerProfiles.buttonPresets(store);
    const element = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const option = (value, name) => Object.assign(element("option", name), { value });
    const fold = element("details", "", "pm-renderer-sub");
    fold.id = "pm-button-profiles";
    const modeSelect = element("select"), profileSelect = element("select"), name = element("input");
    const note = element("p", "", "adv-help");
    note.setAttribute("role", "status");
    name.type = "text"; name.maxLength = 40; name.placeholder = "Name your profile";
    const row = (caption, control) => {
      const label = element("label", "", "set-row");
      label.append(element("span", caption, "tune-label"), control);
      return label;
    };
    const button = (caption, click) => Object.assign(element("button", caption), { type: "button", onclick: click });
    let mode = modes[0], selected = "";
    const apply = button("Apply", () => {
      const profile = presets.list(mode.id).find(p => p.id === selected);
      if (!profile || mode.available?.() === false) return;
      const durable = mode.apply(profile.values);
      onApply?.();
      say(durable ? profile.name + " applied." : profile.name + " applied for this session.");
    });
    const save = button("Save as new", () => write());
    const update = button("Update selected", () => write(selected));
    const remove = button("Delete", () => {
      const result = presets.remove(mode.id, selected);
      if (!result) return;
      selected = ""; name.value = ""; refresh();
      say(result.durable ? "Profile deleted." : "Profile deleted for this session.");
    });
    const actions = element("div", "", "balanced-row");
    actions.append(apply, save, update, remove);
    fold.append(element("summary", "Button profiles"));
    if (modes.length > 1) {
      for (const item of modes) modeSelect.appendChild(option(item.id, item.name));
      modeSelect.value = mode.id;
      fold.append(row("Input mode", modeSelect));
    }
    fold.append(row("Saved profile", profileSelect), row("Profile name", name), actions, note);
    host.insertBefore(fold, host.firstChild);

    function say(text) { note.textContent = text; }
    function refresh() {
      const rows = presets.list(mode.id);
      profileSelect.replaceChildren(option("", "Select a profile"), ...rows.map(p => option(p.id, p.name)));
      if (!rows.some(p => p.id === selected)) selected = "";
      profileSelect.value = selected;
      const available = mode.available?.() !== false;
      apply.disabled = update.disabled = !selected || !available;
      remove.disabled = !selected;
      save.disabled = !available || rows.length >= ControllerProfiles.PRESET_LIMIT;
      if (!available) say("Connect a controller to save or apply its bindings.");
    }
    function write(id) {
      if (mode.available?.() === false) return;
      if (!name.value.trim()) { say("Enter a profile name."); name.focus(); return; }
      const result = presets.save(mode.id, name.value, mode.read(), id);
      if (!result) { say("Use a unique profile name. Each input mode holds up to 12 profiles."); return; }
      selected = result.id;
      refresh();
      say(result.durable ? "Profile saved." : "Profile saved for this session.");
    }
    modeSelect.onchange = () => {
      mode = modes.find(item => item.id === modeSelect.value) || modes[0];
      selected = ""; name.value = ""; say(""); refresh();
    };
    profileSelect.onchange = () => {
      selected = profileSelect.value;
      name.value = presets.list(mode.id).find(p => p.id === selected)?.name || "";
      say(""); refresh();
    };
    if (modes.some(item => item.id === "pad")) {
      for (const event of ["gamepadconnected", "gamepaddisconnected"]) {
        window.addEventListener(event, () => { say(""); setTimeout(refresh, 0); });
      }
    }
    profilePickers.set(host, refresh);
    refresh();
  }

  function responseMode(store, id, name) {
    const phone = id === "phone", key = phone ? "phoneButtonProfiles" : "touchButtonProfiles";
    return {
      id, name,
      read: () => PedalTravel.normalizeProfiles(store.get(key, null)) ?? null,
      apply(value) {
        const clean = PedalTravel.normalizeProfiles(value, phone);
        return (phone ? store.set("phoneButtonProfiles", clean) : store.set("touchButtonProfiles", clean ?? undefined)) !== false;
      },
    };
  }
  function mount(host, ids = Object.keys(PedalTravel.raceButtons), { standalone = false } = {}) {
    if (displays.has(host)) { displays.get(host)(); return; }
    const node = (tag, text) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      return el;
    };
    let section = host;
    function choice(field, label, values) {
      const row = node("div"), text = node("label", label), wrap = node("div"), sel = node("select");
      row.className = "set-row"; text.className = "tune-label";
      sel.id = host.id + "-" + field; sel.dataset.field = field;
      text.htmlFor = sel.id;
      for (const [value, name] of values) {
        const option = node("option", name); option.value = value; sel.appendChild(option);
      }
      wrap.appendChild(sel); row.append(text, wrap); section.appendChild(row);
      return sel;
    }
    host.textContent = "";
    const button = choice("button", "BUTTON", ids.map(id => [id, id.replace(/([A-Z])/g, " $1").toUpperCase()]));
    const scope = node("p", "Changes save as you go. Reset restores the response of the selected button only.");
    scope.className = "adv-help"; scope.id = host.id + "-scope";
    button.setAttribute("aria-describedby", scope.id); section.appendChild(scope);
    const palette = [["default", "DEFAULT"], ...Object.keys(PedalTravel.colors).map(k => [k, k.toUpperCase()])];
    const idle = choice("idleColor", "IDLE BORDER COLOR", palette);
    const pressed = choice("pressedColor", "PRESSED COLOR", palette);
    const activation = choice("activation", "ACTIVATION", [["default", "DEFAULT"], ["tap", "TAP ON RELEASE"], ["quick", "QUICK TAP"], ["hold", "HOLD AND RELEASE"], ["long", "LONG HOLD AND RELEASE"], ["double", "DOUBLE TAP"]]);
    const gestureHint = "Quick Tap requires a lift within 0.18 seconds. Hold requires 0.45 seconds, Long Hold requires 0.9 seconds, and Double Tap requires two taps within 0.35 seconds. Default keeps the original gesture for this action.";
    const gestureHelp = node("p", gestureHint);
    gestureHelp.className = "adv-help"; gestureHelp.id = host.id + "-activation-help";
    activation.setAttribute("aria-describedby", gestureHelp.id); host.appendChild(gestureHelp);
    const response = node("div"); host.appendChild(response); section = response;
    const slider = choice("sliderEdge", "PEDAL MAPPING", [["relative", "RELATIVE SLIDE"],
      ...["top", "bottom", "left", "right"].map(k => [k, "ABSOLUTE · FULL AT " + k.toUpperCase()])]);
    const sliderHelp = node("p"); sliderHelp.className = "adv-help"; sliderHelp.id = host.id + "-slider-help";
    slider.setAttribute("aria-describedby", sliderHelp.id); section.appendChild(sliderHelp);
    const sliderEntry = choice("sliderEntry", "SLIDE ONTO PEDAL", [["stay", "STAY ON ORIGINAL PEDAL"], ["enter", "USE SLIDER POSITION"]]);
    const relative = node("div"); response.appendChild(relative); section = relative;
    const press = choice("press", "FIRST TOUCH", [["instant", "INSTANT"], ["progressive", "PROGRESSIVE"]]);
    const help = node("p"); help.className = "adv-help"; help.id = host.id + "-help";
    press.setAttribute("aria-describedby", help.id); section.appendChild(help);
    const travelRow = node("label"), title = node("span", "SLIDE DISTANCE"), amount = node("b"), travel = node("input");
    travelRow.className = "tune-row"; title.className = "tune-label"; title.appendChild(amount);
    travel.type = "range"; travel.min = "40"; travel.max = "160"; travel.step = "1"; travel.dataset.field = "travel";
    travel.setAttribute("aria-label", "Slide distance"); travelRow.append(title, travel); section.appendChild(travelRow);
    const travelHelp = node("p", "Choose 40–160 screen pixels of thumb movement. A shorter slide changes input faster. A longer slide gives finer control.");
    travelHelp.className = "adv-help"; travelHelp.id = host.id + "-travel-help";
    travel.setAttribute("aria-describedby", travelHelp.id); section.appendChild(travelHelp);
    const slideCurve = choice("slideCurve", "SLIDE RESPONSE", [["linear", "LINEAR"], ["fine", "FINE START"], ["quick", "QUICK START"], ["smooth", "S-CURVE"]]);
    const slideCurveHelp = node("p", "Linear changes pressure evenly as you slide. Fine Start makes small slides gentler. Quick Start makes them stronger. S-Curve gives fine control near each end and changes pressure fastest in the middle.");
    slideCurveHelp.className = "adv-help"; slideCurveHelp.id = host.id + "-slide-curve-help";
    slideCurve.setAttribute("aria-describedby", slideCurveHelp.id); section.appendChild(slideCurveHelp);
    const direction = choice("direction", "SLIDE DIRECTION", [["default", "MODE DEFAULT"], ...["up", "down", "left", "right"].map(d => [d, d.toUpperCase()])]);
    const edge = choice("fullEdge", "START FROM TOUCH POSITION", [["fixed", "OFF · FIXED START"], ...["top", "bottom", "left", "right"].map(k => [k, "FULL AT " + k.toUpperCase()])]);
    const start = choice("start", "STARTING INPUT", [["default", "MODE DEFAULT"], ...Array.from({ length: 21 }, (_, i) => [String(i * 5), i * 5 + "%"])]);
    const build = choice("buildMs", "HOLD BUILD TIME", [["0", "OFF"], ["250", "0.25 S"], ["500", "0.5 S"], ["1000", "1 S"], ["2000", "2 S"]]);
    const curve = choice("buildPower", "HOLD BUILD CURVE", [["1", "LINEAR"], ["2", "GENTLE START"], ["0.5", "FAST START"]]);
    const buildHelp = node("p", "From the starting input, a steady hold builds to full over this time. Choose a starting input below 100% to feel it. Linear builds evenly. Gentle Start builds slowly at first. Fast Start builds quickly and eases into full input. You can still slide during the hold.");
    buildHelp.className = "adv-help"; buildHelp.id = host.id + "-build-help";
    build.setAttribute("aria-describedby", buildHelp.id); section.appendChild(buildHelp);
    section = response;
    const slide = choice("slide", "SLIDE ONTO PEDAL", [["inherit", standalone ? "STAY ON ORIGINAL PEDAL" : "DEFAULT"], ["instant", "INSTANT"], ["ease", "EASE"]]);
    const slideHelp = node("p", (standalone
      ? "Stay on Original Pedal keeps the first pedal held when you cross onto this one. "
      : "Default uses the Pedal Slide setting above. ") +
      "Crossing onto this pedal with Instant gives full input immediately. Ease starts at 12% and reaches full input after another 40 pixels.");
    slideHelp.className = "adv-help"; slideHelp.id = host.id + "-slide-help"; slide.setAttribute("aria-describedby", slideHelp.id); section.appendChild(slideHelp);
    const strengths = Array.from({ length: 10 }, (_, i) => [String(i + 1), i ? String(i + 1) : "1 · OFF"]);
    const adaptive = choice("adaptive", "ADAPTIVE BUTTONS", [["inherit", "FOLLOW GLOBAL"], ...strengths]);
    const adaptiveHelp = node("p", "At speed, a short tap gives a smaller turn. Hold the arrow longer to build steering. Level 1 turns speed smoothing off and 10 gives the most smoothing. Follow Global uses Adaptive Buttons in Driving Aids.");
    adaptiveHelp.className = "adv-help"; adaptiveHelp.id = host.id + "-adaptive-help"; adaptive.setAttribute("aria-describedby", adaptiveHelp.id); section.appendChild(adaptiveHelp);
    const feedback = choice("feedback", "ON-BUTTON FEEDBACK", [["on", "ON"], ["off", "OFF"]]);
    const feedbackHelp = node("p"); feedbackHelp.className = "adv-help"; feedbackHelp.id = host.id + "-feedback-help";
    feedback.setAttribute("aria-describedby", feedbackHelp.id); section.appendChild(feedbackHelp);
    const indicator = choice("indicator", "PRESSURE INDICATOR", [["color", "COLOR"], ["percent", "COLOR + PERCENTAGE"], ["bar", "RISING FILL"]]);
    const brightness = choice("brightness", "FULL-INPUT COLOR INTENSITY", [["25", "SUBTLE · 25%"], ["46", "STANDARD · 46%"], ["70", "STRONG · 70%"], ["100", "VIVID · 100%"]]);
    const reset = node("button"), note = node("p");
    reset.type = "button"; reset.dataset.field = "reset";
    note.className = "adv-help"; note.setAttribute("role", "status");
    host.append(reset, note);
    button.value = ids[0];

    function distance(px) {
      amount.textContent = px + " px";
      travel.setAttribute("aria-valuetext", px + " pixels");
    }
    function refresh() {
      const id = button.value, profile = PedalTravel.buttonProfile(id);
      const pedal = id === "gas" || id === "brake";
      const analog = pedal || id === "left" || id === "right";
      response.hidden = !analog;
      slider.value = profile.sliderEdge || "relative";
      slider.parentElement.parentElement.hidden = sliderHelp.hidden = !pedal;
      relative.hidden = !!profile.sliderEdge;
      sliderEntry.parentElement.parentElement.hidden = !standalone || !profile.sliderEdge;
      sliderHelp.textContent = profile.sliderEdge ? "Your thumb position sets the pedal continuously. The " + profile.sliderEdge +
        " edge gives 100%, and the opposite edge gives 0%. Lift to release. With feedback on, three ticks mark 25%, 50% and 75%." +
        (id === "gas" && !standalone ? " Use Hold throttle for manual Gas." : "") :
        "Relative Slide uses your first touch and slide distance. Absolute reads your position across the whole pedal.";
      idle.value = profile.idleColor || "default"; pressed.value = profile.pressedColor || "default";
      activation.value = profile.activation || "default";
      gestureHelp.textContent = gestureHint + (id === "camera" && !standalone
        ? " Keep holding for the view grid: 0.9 seconds with Hold, 1.35 seconds with Long Hold, or 0.34 seconds otherwise." : "");
      activation.parentElement.parentElement.hidden = gestureHelp.hidden = analog || id === "look";
      press.value = profile.press; travel.value = String(profile.travel); distance(profile.travel);
      slide.parentElement.parentElement.hidden = slideHelp.hidden = !pedal || !!profile.sliderEdge;
      feedbackHelp.textContent = id === "gas" ? "Gas brightens with throttle input. A tread mark warns of wheelspin." : id === "brake" ? "Brake brightens with braking input. Double bars warn of lock-up." : "The arrow brightens as its steering input increases.";
      if (profile.feedback && profile.indicator === "percent") feedbackHelp.textContent += " The percentage shows your current input.";
      else if (profile.feedback && !profile.sliderEdge && id !== "gas" && profile.press === "progressive") feedbackHelp.textContent += " Three rising bars mark a progressive button.";
      const overrides = PedalTravel.buttonOverrides(id);
      slide.value = overrides.slide || "inherit";
      sliderEntry.value = overrides.slide ? "enter" : "stay";
      adaptive.parentElement.parentElement.hidden = pedal; adaptiveHelp.hidden = pedal;
      adaptive.value = String(overrides.adaptive || "inherit");
      feedback.value = profile.feedback ? "on" : "off";
      slideCurve.value = profile.slideCurve || "linear";
      direction.value = profile.direction || "default";
      start.value = profile.start == null ? "default" : String(profile.start);
      curve.value = String(profile.buildPower || 1); curve.disabled = !profile.buildMs;
      build.value = String(profile.buildMs || 0);
      brightness.value = String(profile.brightness || 46);
      brightness.disabled = indicator.disabled = !profile.feedback;
      edge.value = profile.fullEdge || "fixed"; start.disabled = !!profile.fullEdge;
      indicator.value = profile.indicator || "color";
      help.textContent = profile.press === "progressive"
        ? "Touch for 12% input. Slide away from that spot in any direction to reach 100% over your Slide Distance. Slide back to ease off."
        : pedal ? "Touch for full input. Slide upward to ease off, or move back down toward your starting point to press harder." : "Touch for a full turn. Slide toward the other arrow to ease off. At the default distance, the global Adaptive Buttons level controls how much this slide eases steering.";
      if (profile.direction || profile.start != null || profile.fullEdge) {
        const gesture = profile.direction || (profile.press === "progressive" ? "in any direction" : pedal ? "up" : "toward the other arrow");
        const touchdown = profile.fullEdge ? "Touch the " + profile.fullEdge + " edge for 100%, the opposite edge for 0%, or the middle for 50%." +
          (profile.feedback ? " A double line marks the full edge." : "") : "Touch for " + PedalTravel.startPercent(profile) + "% input.";
        help.textContent = touchdown + " Slide " + gesture + (profile.press === "progressive" ? " to build input." : " to ease off.");
      }
      if (id === "gas" && !standalone) help.textContent += " Hold throttle gives manual control until you lift. Latch toggles full throttle with each tap. Auto handles throttle while you steer and brake.";
      reset.textContent = "RESET " + id.toUpperCase();
    }
    function change(patch) {
      PedalTravel.setButtonProfile(button.value, patch);
      note.textContent = ""; refresh();
    }
    button.onchange = () => { note.textContent = ""; refresh(); };
    for (const control of [idle, pressed, activation]) control.onchange = () => change({ [control.dataset.field]: control.value });
    slider.onchange = () => change({ sliderEdge: slider.value });
    sliderEntry.onchange = () => change({ slide: sliderEntry.value === "enter" ? "instant" : "inherit" });
    press.onchange = () => change({ press: press.value });
    travel.oninput = () => distance(travel.value);
    travel.onchange = () => change({ travel: Number(travel.value) });
    slideCurve.onchange = () => change({ slideCurve: slideCurve.value });
    direction.onchange = () => change({ direction: direction.value });
    edge.onchange = () => change({ fullEdge: edge.value });
    indicator.onchange = () => change({ indicator: indicator.value });
    start.onchange = () => change({ start: start.value === "default" ? null : Number(start.value) });
    curve.onchange = () => change({ buildPower: Number(curve.value) });
    build.onchange = () => change({ buildMs: Number(build.value) });
    brightness.onchange = () => change({ brightness: Number(brightness.value) });
    slide.onchange = () => change({ slide: slide.value });
    adaptive.onchange = () => change({ adaptive: adaptive.value === "inherit" ? "inherit" : Number(adaptive.value) });
    feedback.onchange = () => change({ feedback: feedback.value === "on" });
    reset.onclick = () => {
      PedalTravel.resetButtonProfile(button.value); refresh();
      note.textContent = button.value.toUpperCase() + " returned to its defaults.";
    };
    displays.set(host, refresh); refresh();
    if (standalone && typeof GameStore !== "undefined") {
      mountProfilePicker(host, GameStore.store, [responseMode(GameStore.store, "phone", "Phone as controller")], refresh);
    }
  }
  function mountControls(store, onSelect) {
    const panel = document.getElementById("pm-panel-controls");
    const bindings = (id, name, read, set, available) => ({
      id, name, read, available,
      apply(value) {
        set(value);
        const durable = id === "pad" ? store.set("pad", read()) : store.set("keys", read());
        window.dispatchEvent(new Event("apexbuttonprofileapply"));
        return durable !== false && (id !== "pad" || Input.controllerProfile?.()?.saved !== false);
      },
    });
    if (panel && typeof Input !== "undefined") mountProfilePicker(panel, store, [
      responseMode(store, "touch", "Screen touch buttons"),
      bindings("pad", "Gamepad", Input.getPadMap, Input.setPadMap, Input.padPresent),
      bindings("keyboard", "Keyboard", Input.getKeyMap, Input.setKeyMap),
    ], () => {
      displays.get(document.getElementById("pm-touch-response-fields"))?.();
      onSelect?.();
    });
    const existing = document.getElementById("pm-touch-response-fields");
    const readGuide = () => store.get("touchSteeringGuide", "ring") === "wheel" ? "wheel" : "ring";
    if (existing) {
      SettingRow.paint("pm-touch-steering-guide", readGuide());
      if (existing.parentElement.open) mount(existing);
      return;
    }
    const mirrorHelp = document.getElementById("pm-mirror")?.nextElementSibling;
    if (!mirrorHelp) return;
    const guideValues = [["ring", "DRAG RING"], ["wheel", "FLOATING WHEEL"]];
    const guide = SettingRow.build("pm-touch-steering-guide", "TOUCH STEERING GUIDE", guideValues);
    const guideHelp = document.createElement("p");
    guideHelp.id = "pm-touch-steering-guide-help"; guideHelp.className = "adv-help";
    guideHelp.textContent = "With TOUCH steering, touch the track to center the guide there. Drag left or right to turn. Lift to release.";
    guide.sel.setAttribute("aria-describedby", guideHelp.id);
    document.getElementById("pm-steer-item")?.append(guide.row, guideHelp);
    SettingRow.wire("pm-touch-steering-guide", { values: guideValues,
      read: readGuide,
      write: v => { store.set("touchSteeringGuide", v); if (onSelect) onSelect(); } });
    const SLIDE_VALUES = [["instant", "INSTANT"], ["ease", "EASE"]];
    const built = SettingRow.build("pm-pedalslide", "PEDAL SLIDE", SLIDE_VALUES);
    const help = document.createElement("p");
    help.className = "adv-help"; help.id = "pm-pedalslide-help";
    help.textContent = "Sets the default when you slide from Gas to Brake or back without lifting. Instant fully presses the new pedal on entry. Ease starts it at 12% and builds to full over 40 more pixels. Override either pedal in Touch Button Response.";
    built.sel.setAttribute("aria-describedby", help.id);
    mirrorHelp.after(built.row, help);
    SettingRow.wire("pm-pedalslide", { values: SLIDE_VALUES, read: Input.pedalSlide,
      write: (v) => { store.set("pedalSlide", Input.setPedalSlide(v)); if (onSelect) onSelect(); } });
    SettingRow.paint(built.row, Input.pedalSlide(), SLIDE_VALUES);
    const fold = document.createElement("details"), summary = document.createElement("summary"), fields = document.createElement("div");
    fold.className = "pm-renderer-sub";
    summary.id = "pm-touch-response"; summary.className = "adv-more-btn"; summary.textContent = "TOUCH BUTTON RESPONSE";
    fields.id = "pm-touch-response-fields"; fold.append(summary, fields); help.after(fold);
    fold.ontoggle = () => { if (fold.open) mount(fields); };
  }
  return Object.freeze({ mount, mountControls });
})();
