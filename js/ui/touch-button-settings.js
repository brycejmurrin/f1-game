/* Shared response editor for in-game touch buttons and the phone controller. */
const TouchButtonSettings = (() => {
  "use strict";
  const displays = new WeakMap();
  function mount(host, ids = ["left", "right", "gas", "brake"], { standalone = false } = {}) {
    if (displays.has(host)) { displays.get(host)(); return; }
    const node = (tag, text) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      return el;
    };
    function choice(field, label, values) {
      const row = node("div"), text = node("label", label), wrap = node("div"), sel = node("select");
      row.className = "set-row"; text.className = "tune-label";
      sel.id = host.id + "-" + field; sel.dataset.field = field;
      text.htmlFor = sel.id;
      for (const [value, name] of values) {
        const option = node("option", name); option.value = value; sel.appendChild(option);
      }
      wrap.appendChild(sel); row.append(text, wrap); host.appendChild(row);
      return sel;
    }
    host.textContent = "";
    const button = choice("button", "BUTTON", ids.map(id => [id, id.toUpperCase()]));
    const press = choice("press", "FIRST TOUCH", [["instant", "INSTANT"], ["progressive", "PROGRESSIVE"]]);
    const help = node("p"); help.className = "adv-help"; help.id = host.id + "-help";
    press.setAttribute("aria-describedby", help.id); host.appendChild(help);
    const travelRow = node("label"), title = node("span", "SLIDE DISTANCE"), amount = node("b"), travel = node("input");
    travelRow.className = "tune-row"; title.className = "tune-label"; title.appendChild(amount);
    travel.type = "range"; travel.min = "40"; travel.max = "160"; travel.step = "1"; travel.dataset.field = "travel";
    travel.setAttribute("aria-label", "Slide distance"); travelRow.append(title, travel); host.appendChild(travelRow);
    const slide = choice("slide", "SLIDE ONTO PEDAL", [["inherit", standalone ? "STAY ON ORIGINAL PEDAL" : "DEFAULT"], ["instant", "INSTANT"], ["ease", "EASE"]]);
    const slideHelp = node("p", standalone
      ? "By default, your thumb stays on its original pedal. Choose Instant or Ease to transfer input when you slide onto the selected pedal."
      : "Default follows Pedal Slide. Ease builds input as you slide onto this pedal.");
    slideHelp.className = "adv-help"; slideHelp.id = host.id + "-slide-help"; slide.setAttribute("aria-describedby", slideHelp.id); host.appendChild(slideHelp);
    const strengths = Array.from({ length: 10 }, (_, i) => [String(i + 1), i ? String(i + 1) : "1 · OFF"]);
    const adaptive = choice("adaptive", "ADAPTIVE BUTTONS", [["inherit", "FOLLOW GLOBAL"], ...strengths]);
    const adaptiveHelp = node("p", "Higher levels soften this arrow’s steering taps at speed. Follow Global uses Adaptive Buttons in Driving Aids.");
    adaptiveHelp.className = "adv-help"; adaptiveHelp.id = host.id + "-adaptive-help"; adaptive.setAttribute("aria-describedby", adaptiveHelp.id); host.appendChild(adaptiveHelp);
    const feedback = choice("feedback", "ON-BUTTON FEEDBACK", [["on", "ON"], ["off", "OFF"]]);
    const feedbackHelp = node("p"); feedbackHelp.className = "adv-help"; feedbackHelp.id = host.id + "-feedback-help";
    feedback.setAttribute("aria-describedby", feedbackHelp.id); host.appendChild(feedbackHelp);
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
      press.value = profile.press; travel.value = String(profile.travel); distance(profile.travel);
      slide.parentElement.parentElement.hidden = !pedal; slideHelp.hidden = !pedal;
      feedbackHelp.textContent = id === "gas" ? "Gas brightens with throttle input. A tread mark warns of wheelspin." : id === "brake" ? "Brake brightens with braking input. Double bars warn of lock-up." : "The arrow brightens as its steering input increases.";
      if (profile.press === "progressive") feedbackHelp.textContent += " Three rising bars mark a progressive button.";
      const overrides = PedalTravel.buttonOverrides(id);
      slide.value = overrides.slide || "inherit";
      adaptive.parentElement.parentElement.hidden = pedal; adaptiveHelp.hidden = pedal;
      adaptive.value = String(overrides.adaptive || "inherit");
      feedback.value = profile.feedback ? "on" : "off";
      help.textContent = profile.press === "progressive"
        ? "Start light. Slide away from where you touched to build input, then slide back to ease off."
        : pedal ? "Start at full input. Slide up to ease off." : "Start at full steering input. Slide toward the other arrow to ease off.";
      if (id === "gas" && !standalone) help.textContent += " Use HOLD throttle for manual gas input.";
      reset.textContent = "RESET " + id.toUpperCase();
    }
    function change(patch) {
      PedalTravel.setButtonProfile(button.value, patch);
      note.textContent = ""; refresh();
    }
    button.onchange = () => { note.textContent = ""; refresh(); };
    press.onchange = () => change({ press: press.value });
    travel.oninput = () => distance(travel.value);
    travel.onchange = () => change({ travel: Number(travel.value) });
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
    help.textContent = "Sliding a thumb from GAS onto BRAKE, or back. INSTANT presses it fully at once. EASE builds it up over a short slide, so sliding off GAS cannot slam the brakes.";
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
