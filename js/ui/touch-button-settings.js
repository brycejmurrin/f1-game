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
    // PRESS MODE (#6365): the paired phone's BOOST / OVERTAKE / AERO. TOGGLE is the race HUD's tap.
    const latch = choice("latch", "PRESS MODE", [["toggle", "TOGGLE"], ["hold", "HOLD"]]);
    const latchHelp = node("p"); latchHelp.className = "adv-help"; latchHelp.id = host.id + "-latch-help";
    latch.setAttribute("aria-describedby", latchHelp.id); host.appendChild(latchHelp);
    const activation = choice("activation", "ACTIVATION", [["default", "DEFAULT"], ["tap", "TAP ON RELEASE"], ["quick", "QUICK TAP"], ["hold", "HOLD AND RELEASE"], ["long", "LONG HOLD AND RELEASE"], ["double", "DOUBLE TAP"]]);
    // The timing slider's caption per gesture (moved out of the eager PedalTravel table, #6365).
    const gestureLabels = { quick: "QUICK TAP LIMIT", hold: "HOLD TIME", long: "LONG HOLD TIME", double: "DOUBLE TAP WINDOW" };
    const gestureHints = {
      tap: "Lift to activate.",
      quick: "Lift within the selected time to activate.",
      hold: "Hold for at least the selected time, then lift to activate.",
      long: "Hold for at least the selected time, then lift to activate.",
      double: "Lift twice within the selected time. Each tap must also be shorter than this window.",
    };
    const gestureRow = node("label"), gestureLabel = node("span"), gestureAmount = node("b"), gestureTime = node("input");
    gestureRow.className = "tune-row"; gestureLabel.className = "tune-label";
    gestureTime.type = "range"; gestureTime.step = "10"; gestureTime.id = host.id + "-gesture-time";
    gestureRow.append(gestureLabel, gestureTime); host.appendChild(gestureRow);
    const gestureHelp = node("p");
    gestureHelp.className = "adv-help"; gestureHelp.id = host.id + "-activation-help";
    activation.setAttribute("aria-describedby", gestureHelp.id);
    gestureTime.setAttribute("aria-describedby", gestureHelp.id); host.appendChild(gestureHelp);
    const response = node("div"); host.appendChild(response); section = response;
    const slider = choice("sliderEdge", "INPUT MAPPING", [["relative", "RELATIVE SLIDE"],
      ["top", "BOTTOM TO TOP"], ["bottom", "TOP TO BOTTOM"], ["left", "RIGHT TO LEFT"], ["right", "LEFT TO RIGHT"]]);
    const sliderHelp = node("p"); sliderHelp.className = "adv-help"; sliderHelp.id = host.id + "-slider-help";
    slider.setAttribute("aria-describedby", sliderHelp.id); section.appendChild(sliderHelp);
    const sliderEntry = choice("sliderEntry", "SLIDE ONTO PEDAL", [["stay", "STAY ON ORIGINAL PEDAL"], ["enter", "USE SLIDER POSITION"]]);
    const percentages = Array.from({ length: 101 }, (_, i) => [String(i), i + "%"]);
    const curves = [["linear", "LINEAR"], ["fine", "FINE START"], ["quick", "QUICK START"], ["smooth", "S-CURVE"]];
    const absolute = node("div"); response.appendChild(absolute); section = absolute;
    const sliderStart = choice("sliderStart", "START EDGE INPUT", percentages);
    const sliderEnd = choice("sliderEnd", "END EDGE INPUT", percentages);
    const sliderCurve = choice("sliderCurve", "EDGE-TO-EDGE RESPONSE", curves);
    const relative = node("div"); response.appendChild(relative); section = relative;
    // RESPONSE preset (#6794): a one-tap view of five existing fields on the steer arrows; no stored key of its own.
    const preset = choice("preset", "RESPONSE", [["ease", "SLIDE TO EASE"], ["full", "FULL ONLY"], ["custom", "CUSTOM"]]);
    preset.children[2].disabled = true;
    const presetHelp = node("p"); presetHelp.className = "adv-help"; presetHelp.id = host.id + "-preset-help";
    preset.setAttribute("aria-describedby", presetHelp.id); section.appendChild(presetHelp);
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
    const slideCurve = choice("slideCurve", "SLIDE RESPONSE", curves);
    const slideCurveHelp = node("p", "Linear changes pressure evenly as you slide. Fine Start makes small slides gentler. Quick Start makes them stronger. S-Curve gives fine control near each end and changes pressure fastest in the middle.");
    slideCurveHelp.className = "adv-help"; slideCurveHelp.id = host.id + "-slide-curve-help";
    slideCurve.setAttribute("aria-describedby", slideCurveHelp.id); section.appendChild(slideCurveHelp);
    const deadZone = choice("deadPx", "SLIDE DEAD ZONE", [["0", "OFF"], ...PedalTravel.DEAD_ZONES.map(px => [String(px), px + " PX"])]);
    const deadZoneHelp = node("p", "With a Slide End Input set, the slide counts from your first pixel of movement. A dead zone ignores that much thumb wobble first.");
    deadZoneHelp.className = "adv-help"; deadZoneHelp.id = host.id + "-dead-zone-help";
    deadZone.setAttribute("aria-describedby", deadZoneHelp.id); section.appendChild(deadZoneHelp);
    const edge = choice("fullEdge", "START FROM TOUCH POSITION", [["fixed", "OFF · FIXED START"], ...["top", "bottom", "left", "right"].map(k => [k, "FULL AT " + k.toUpperCase()])]);
    const withDefault = [["default", "MODE DEFAULT"], ...percentages];
    const start = choice("start", "STARTING INPUT", withDefault);
    const direction = choice("direction", "SLIDE DIRECTION", [["default", "MODE DEFAULT"], ...PedalTravel.directions.map(d => [d, d === "any" ? "ANY DIRECTION" : d.toUpperCase()])]);
    const end = choice("end", "SLIDE END INPUT", withDefault);
    const endHelp = node("p", "The input reached after moving the Slide Distance in the selected direction. Set a value above the starting input to increase it, or below to decrease it.");
    endHelp.className = "adv-help"; endHelp.id = host.id + "-end-help";
    end.setAttribute("aria-describedby", endHelp.id); section.appendChild(endHelp);
    const build = choice("buildMs", "HOLD BUILD TIME", [["0", "OFF"], ["250", "0.25 S"], ["500", "0.5 S"], ["1000", "1 S"], ["2000", "2 S"]]);
    const holdEnd = choice("holdEnd", "HOLD TARGET INPUT", percentages);
    const curve = choice("buildPower", "HOLD BUILD CURVE", [["1", "LINEAR"], ["2", "GENTLE START"], ["0.5", "FAST START"]]);
    const buildHelp = node("p", "A steady hold moves from the starting input to the hold target over this time. Gentle Start changes input slowly at first. Fast Start changes it quickly at first. You can still slide during the hold.");
    buildHelp.className = "adv-help"; buildHelp.id = host.id + "-build-help";
    for (const control of [build, holdEnd, curve]) control.setAttribute("aria-describedby", buildHelp.id);
    section.appendChild(buildHelp);
    section = response;
    const slide = choice("slide", "SLIDE ONTO PEDAL", [["inherit", standalone ? "STAY ON ORIGINAL PEDAL" : "DEFAULT"],
      ["instant", "INSTANT"], ["ease", "EASE"], ["response", "USE BUTTON RESPONSE"]]);
    const slideHelp = node("p", (standalone
      ? "Stay on Original Pedal keeps the first pedal held when you cross onto this one. "
      : "Default uses the Pedal Slide setting above. ") +
      "Instant gives full input immediately. Ease starts at 12% and reaches full input after another 40 pixels. " +
      "Both then use your slide settings from full input. Use Button Response starts with this pedal’s configured input as you enter.");
    slideHelp.className = "adv-help"; slideHelp.id = host.id + "-slide-help"; slide.setAttribute("aria-describedby", slideHelp.id); section.appendChild(slideHelp);
    const strengths = Array.from({ length: 10 }, (_, i) => [String(i + 1), i ? String(i + 1) : "1 · OFF"]);
    const adaptive = choice("adaptive", "ADAPTIVE BUTTONS", [["inherit", "FOLLOW GLOBAL"], ...strengths]);
    const adaptiveHelp = node("p", "At speed, a short tap gives a smaller turn. Hold the arrow longer to build steering. Level 1 turns speed smoothing off and 10 gives the most smoothing. Follow Global uses Adaptive Buttons in Driving Aids.");
    adaptiveHelp.className = "adv-help"; adaptiveHelp.id = host.id + "-adaptive-help"; adaptive.setAttribute("aria-describedby", adaptiveHelp.id); section.appendChild(adaptiveHelp);
    const feedback = choice("feedback", "ON-BUTTON FEEDBACK", [["on", "ON"], ["off", "OFF"]]);
    const feedbackHelp = node("p"); feedbackHelp.className = "adv-help"; feedbackHelp.id = host.id + "-feedback-help";
    feedback.setAttribute("aria-describedby", feedbackHelp.id); section.appendChild(feedbackHelp);
    const indicator = choice("indicator", "PRESSURE INDICATOR", [["color", "COLOR"], ["percent", "COLOR + PERCENTAGE"], ["bar", "FILL BAR"]]);
    const fillDirection = choice("fillDirection", "FILL DIRECTION", [["top", "BOTTOM TO TOP"], ["bottom", "TOP TO BOTTOM"], ["left", "RIGHT TO LEFT"], ["right", "LEFT TO RIGHT"]]);
    const brightness = choice("brightness", "FULL-INPUT COLOR INTENSITY", [["25", "SUBTLE · 25%"], ["46", "STANDARD · 46%"], ["70", "STRONG · 70%"], ["100", "VIVID · 100%"]]);
    const reset = node("button"), note = node("p");
    reset.type = "button"; reset.dataset.field = "reset";
    note.className = "adv-help"; note.setAttribute("role", "status");
    host.append(reset, note);
    button.value = ids[0];

    function paintGestureTime() {
      const label = Number(gestureTime.value) / 1000 + " s";
      gestureAmount.textContent = label;
      gestureTime.setAttribute("aria-valuetext", label);
    }
    const FULL_ONLY = { start: 100, end: 100, press: "instant", buildMs: 0, adaptive: 1, fullEdge: "fixed" };
    const EASE = { start: null, end: null, press: "instant", buildMs: 0, adaptive: "inherit", fullEdge: "fixed" };
    function presetOf(id) {
      const o = PedalTravel.buttonOverrides(id);
      if (o.fullEdge) return "custom";   // a touch-position start overrides STARTING INPUT
      if (o.start == null && o.end == null && !o.press && !o.buildMs && o.adaptive == null) return "ease";
      return o.start === 100 && o.end === 100 && !o.press && !o.buildMs && o.adaptive === 1 ? "full" : "custom";
    }
    function arrowsDiffer() {
      if (!ids.includes("left") || !ids.includes("right")) return false;
      const l = PedalTravel.buttonProfile("left"), r = PedalTravel.buttonProfile("right");
      return presetOf("left") !== presetOf("right") || l.travel !== r.travel || (l.slideCurve || "linear") !== (r.slideCurve || "linear");
    }
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
      absolute.hidden = !profile.sliderEdge;
      relative.hidden = !!profile.sliderEdge;
      sliderEntry.parentElement.parentElement.hidden = !standalone || !pedal || !profile.sliderEdge;
      sliderStart.value = String(profile.sliderStart ?? 0);
      sliderEnd.value = String(profile.sliderEnd ?? 100);
      sliderCurve.value = profile.sliderCurve || "linear";
      sliderHelp.textContent = profile.sliderEdge ? "Thumb position sets the input from " + sliderStart.value + "% at the starting edge to " +
        sliderEnd.value + "% at the " + profile.sliderEdge + " edge. Lift to release. The ticks mark 25%, 50% and 75% of the travel." +
        (id === "gas" && !standalone ? " Use Hold throttle for manual Gas." : "") :
        "Relative Slide uses your first touch and slide distance. Edge-to-edge reads your position across the whole button.";
      idle.value = profile.idleColor || "default"; pressed.value = profile.pressedColor || "default";
      activation.value = profile.activation || "default";
      const timing = profile.gestureTiming;
      const latching = standalone && typeof PhonePadPage !== "undefined" && PhonePadPage.latchButtons.includes(id);   // the phone page loads it
      latch.parentElement.parentElement.hidden = latchHelp.hidden = !latching;
      latch.value = profile.latch || "toggle";
      latchHelp.textContent = profile.latch === "hold" ? "Press to switch it on and lift to switch it off. It lights only while pressed."
        : "Each press switches it on or off. The button stays lit while the game reports it on.";
      activation.parentElement.parentElement.hidden = gestureHelp.hidden = analog || id === "look" || (latching && profile.latch === "hold");
      gestureRow.hidden = gestureTime.disabled = gestureHelp.hidden || !timing;
      if (timing) {
        gestureLabel.textContent = gestureLabels[profile.activation]; gestureLabel.appendChild(gestureAmount);
        gestureTime.setAttribute("aria-label", gestureLabels[profile.activation]);
        gestureTime.min = String(timing.min); gestureTime.max = String(timing.max);
        gestureTime.value = String(profile[timing.key] ?? timing.defaultMs);
        paintGestureTime();
      }
      gestureHelp.textContent = (gestureHints[profile.activation] || "Default keeps the original gesture for this action.") +
        (id === "camera" && !standalone ? " A longer hold opens the view grid." : "");
      const arrow = id === "left" || id === "right";
      preset.parentElement.parentElement.hidden = presetHelp.hidden = !arrow;
      if (arrow) {
        preset.value = presetOf(id);
        const split = ids.includes("left") && ids.includes("right") && presetOf("left") !== presetOf("right");
        presetHelp.textContent = "Slide to Ease eases steering as you slide toward the other arrow. Full Only gives full input for the whole press: it sets Starting Input and Slide End Input to 100, First Touch to Instant, Hold Build Time off and Adaptive Buttons to 1. Editing any of those, or Start From Touch Position, shows Custom. Slide to Ease is the default: those fields are unchanged." +
          (split ? " The left and right arrows use different responses, so this applies to " + id.toUpperCase() + " only." : "") +
          (arrowsDiffer() && !(presetOf("left") === "full" && presetOf("right") === "full") ? " Left and right arrows differ: slide distance is " + PedalTravel.buttonProfile("left").travel + " px left and " +
            PedalTravel.buttonProfile("right").travel + " px right." : "");
      }
      press.value = profile.press; travel.value = String(profile.travel); distance(profile.travel);
      slide.parentElement.parentElement.hidden = slideHelp.hidden = !pedal || !!profile.sliderEdge;
      feedbackHelp.textContent = id === "gas" ? "Gas brightens with throttle input. A tread mark warns of wheelspin." : id === "brake" ? "Brake brightens with braking input. Double bars warn of lock-up." : "The arrow brightens as its steering input increases.";
      if (profile.feedback && profile.indicator === "percent") feedbackHelp.textContent += " The percentage shows your current input.";
      else if (profile.feedback && !profile.sliderEdge && id !== "gas" && profile.press === "progressive") feedbackHelp.textContent += " Three rising bars mark a progressive button.";
      const overrides = PedalTravel.buttonOverrides(id);
      slide.value = overrides.slide || "inherit";
      sliderEntry.value = PedalTravel.sliderEntry(overrides);
      adaptive.parentElement.parentElement.hidden = pedal; adaptiveHelp.hidden = pedal;
      adaptive.value = String(overrides.adaptive || "inherit");
      feedback.value = profile.feedback ? "on" : "off";
      slideCurve.value = profile.slideCurve || "linear";
      deadZone.value = String(profile.deadPx || 0); deadZone.disabled = profile.end == null;
      direction.value = profile.direction || "default";
      start.value = String(profile.start ?? "default");
      end.value = String(profile.end ?? "default");
      holdEnd.value = String(profile.holdEnd ?? 100);
      curve.value = String(profile.buildPower || 1); curve.disabled = holdEnd.disabled = !profile.buildMs;
      build.value = String(profile.buildMs || 0);
      brightness.value = String(profile.brightness || 46);
      brightness.disabled = indicator.disabled = !profile.feedback;
      edge.value = profile.fullEdge || "fixed"; start.disabled = !!profile.fullEdge;
      indicator.value = profile.indicator || "color";
      fillDirection.value = profile.fillDirection || "top";
      fillDirection.parentElement.parentElement.hidden = !profile.feedback || profile.indicator !== "bar";
      help.textContent = profile.press === "progressive"
        ? "Touch for 12% input. Slide away from that spot in any direction to reach 100% over your Slide Distance. Slide back to ease off."
        : pedal ? "Touch for full input. Slide upward to ease off, or move back down toward your starting point to press harder." : "Touch for a full turn. Slide toward the other arrow to ease off. At the default distance, the global Adaptive Buttons level controls how much this slide eases steering.";
      if (profile.direction || profile.start != null || profile.fullEdge || profile.end != null) {
        const gesture = profile.direction === "any" ? "in any direction" : profile.direction ||
          (profile.press === "progressive" ? "in any direction" : pedal ? "up" : "toward the other arrow");
        const touchdown = profile.fullEdge ? "Touch the " + profile.fullEdge + " edge for 100%, the opposite edge for 0%, or the middle for 50%." +
          (profile.feedback ? " A double line marks the full edge." : "") : "Touch for " + PedalTravel.startPercent(profile) + "% input.";
        const slideTarget = profile.end != null ? " to reach " + profile.end + "% input."
          : profile.press === "progressive" ? " to build input." : " to ease off.";
        help.textContent = touchdown + " Slide " + gesture + slideTarget;
      }
      if (id === "gas" && !standalone) help.textContent += " Hold throttle gives manual control until you lift. Latch toggles full throttle with each tap. Auto handles throttle while you steer and brake.";
      reset.textContent = "RESET " + id.toUpperCase();
    }
    function change(patch) {
      PedalTravel.setButtonProfile(button.value, patch);
      note.textContent = ""; refresh();
    }
    button.onchange = () => { note.textContent = ""; refresh(); };
    gestureTime.oninput = paintGestureTime;
    gestureTime.onchange = () => {
      const timing = PedalTravel.buttonProfile(button.value).gestureTiming;
      if (timing) change({ [timing.key]: Number(gestureTime.value) });
    };
    for (const control of [idle, pressed, activation, latch]) control.onchange = () => change({ [control.dataset.field]: control.value });
    slider.onchange = () => change({ sliderEdge: slider.value });
    sliderEntry.onchange = () => change({ sliderEntry: sliderEntry.value });
    preset.onchange = () => {
      if (preset.value === "custom") return;
      const patch = preset.value === "full" ? FULL_ONLY : EASE, id = button.value;
      const both = (id === "left" || id === "right") && ids.includes("left") && ids.includes("right") && presetOf("left") === presetOf("right");
      for (const target of both ? ["left", "right"] : [id]) PedalTravel.setButtonProfile(target, patch);
      note.textContent = ""; refresh();
    };
    press.onchange = () => change({ press: press.value });
    travel.oninput = () => distance(travel.value);
    travel.onchange = () => change({ travel: Number(travel.value) });
    slideCurve.onchange = () => change({ slideCurve: slideCurve.value });
    deadZone.onchange = () => change({ deadPx: Number(deadZone.value) });
    sliderCurve.onchange = () => change({ sliderCurve: sliderCurve.value });
    direction.onchange = () => change({ direction: direction.value });
    edge.onchange = () => change({ fullEdge: edge.value });
    indicator.onchange = () => change({ indicator: indicator.value });
    fillDirection.onchange = () => change({ fillDirection: fillDirection.value });
    for (const control of [start, end, holdEnd, sliderStart, sliderEnd]) {
      control.onchange = () => change({ [control.dataset.field]: control.value === "default" ? null : Number(control.value),
        // A dead zone only acts on a slide end: clearing the end clears it, so it cannot revive unseen later.
        ...(control === end && control.value === "default" ? { deadPx: 0 } : {}) });
    }
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
        // Input persists an active device profile itself; the shared "pad" key stays the legacy map a wheel
        // that has yet to migrate reads (key-binds.js save(), #6446).
        const profiled = id === "pad" && !!Input.controllerProfile?.();
        const durable = profiled || (id === "pad" ? store.set("pad", read()) : store.set("keys", read()));
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
