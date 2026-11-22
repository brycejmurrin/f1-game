/* Shared response editor for in-game touch buttons and the phone controller. */
const TouchButtonSettings = (() => {
  "use strict";
  const displays = new WeakMap();
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
    const gestureHelp = node("p", "Quick Tap requires a lift within 0.18 seconds. Hold requires 0.45 seconds, Long Hold requires 0.9 seconds, and Double Tap requires two taps within 0.35 seconds. Default keeps the original gesture for this action.");
    gestureHelp.className = "adv-help"; gestureHelp.id = host.id + "-activation-help";
    activation.setAttribute("aria-describedby", gestureHelp.id); host.appendChild(gestureHelp);
    const response = node("div"); host.appendChild(response); section = response;
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
    const direction = choice("direction", "SLIDE DIRECTION", [["default", "MODE DEFAULT"], ...["up", "down", "left", "right"].map(d => [d, d.toUpperCase()])]);
    const start = choice("start", "STARTING INPUT", [["default", "MODE DEFAULT"], ...Array.from({ length: 21 }, (_, i) => [String(i * 5), i * 5 + "%"])]);
    const build = choice("buildMs", "HOLD BUILD TIME", [["0", "OFF"], ["250", "0.25 S"], ["500", "0.5 S"], ["1000", "1 S"], ["2000", "2 S"]]);
    const curve = choice("buildPower", "HOLD BUILD CURVE", [["1", "LINEAR"], ["2", "GENTLE START"], ["0.5", "FAST START"]]);
    const buildHelp = node("p", "From the starting input, a steady hold builds to full over this time. Choose a starting input below 100% to feel it. Linear builds evenly. Gentle Start builds slowly at first. Fast Start builds quickly and eases into full input. You can still slide during the hold.");
    buildHelp.className = "adv-help"; buildHelp.id = host.id + "-build-help";
    build.setAttribute("aria-describedby", buildHelp.id); section.appendChild(buildHelp);
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
      idle.value = profile.idleColor || "default"; pressed.value = profile.pressedColor || "default";
      activation.value = profile.activation || "default";
      activation.parentElement.parentElement.hidden = gestureHelp.hidden = analog || id === "look";
      press.value = profile.press; travel.value = String(profile.travel); distance(profile.travel);
      slide.parentElement.parentElement.hidden = !pedal; slideHelp.hidden = !pedal;
      feedbackHelp.textContent = id === "gas" ? "Gas brightens with throttle input. A tread mark warns of wheelspin." : id === "brake" ? "Brake brightens with braking input. Double bars warn of lock-up." : "The arrow brightens as its steering input increases.";
      if (id !== "gas" && profile.press === "progressive") feedbackHelp.textContent += " Three rising bars mark a progressive button.";
      const overrides = PedalTravel.buttonOverrides(id);
      slide.value = overrides.slide || "inherit";
      adaptive.parentElement.parentElement.hidden = pedal; adaptiveHelp.hidden = pedal;
      adaptive.value = String(overrides.adaptive || "inherit");
      feedback.value = profile.feedback ? "on" : "off";
      direction.value = profile.direction || "default";
      start.value = profile.start == null ? "default" : String(profile.start);
      curve.value = String(profile.buildPower || 1); curve.disabled = !profile.buildMs;
      build.value = String(profile.buildMs || 0);
      brightness.value = String(profile.brightness || 46);
      brightness.disabled = !profile.feedback;
      help.textContent = profile.press === "progressive"
        ? "Touch for 12% input. Slide away from that spot in any direction to reach 100% over your Slide Distance. Slide back to ease off."
        : pedal ? "Touch for full input. Slide upward to ease off, or move back down toward your starting point to press harder." : "Touch for a full turn. Slide toward the other arrow to ease off. At the default distance, the global Adaptive Buttons level controls how much this slide eases steering.";
      if (profile.direction || profile.start != null) {
        const gesture = profile.direction || (profile.press === "progressive" ? "in any direction" : pedal ? "up" : "toward the other arrow");
        help.textContent = "Touch for " + PedalTravel.startPercent(profile) + "% input. Slide " + gesture +
          (profile.press === "progressive" ? " to build input." : " to ease off.");
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
    press.onchange = () => change({ press: press.value });
    travel.oninput = () => distance(travel.value);
    travel.onchange = () => change({ travel: Number(travel.value) });
    direction.onchange = () => change({ direction: direction.value });
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
  }
  function mountControls(store, onSelect) {
    const existing = document.getElementById("pm-touch-response-fields");
    if (existing) { if (existing.parentElement.open) mount(existing); return; }
    const mirrorHelp = document.getElementById("pm-mirror")?.nextElementSibling;
    if (!mirrorHelp) return;
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
