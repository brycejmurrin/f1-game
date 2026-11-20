const KeyBinds = (function () {
  "use strict";

function create(G) {
  const { $, store } = G;
  const tick = () => { if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiTick(); };
  const sections = [];
  let stopPreview = () => {};
  let stickTimer = 0;
  let stickGeneration = 0;
  let calibration = null;
  function cancelStick() {
    clearTimeout(stickTimer);
    stickTimer = 0;
    stickGeneration++;
  }
  const controlsPageActive = () => {
    const panel = $("pm-panel-controls");
    if (panel && panel.hidden) return false;
    const calib = $("pm-pad-calib");
    if (calib && calib.closest && calib.closest("[hidden]")) return false;
    const host = $("pm-pad");
    if (host && host.closest && host.closest("[hidden]")) return false;
    return true;
  };
  function cancelCalibration() {
    if (calibration) {
      clearTimeout(calibration.timer);
      calibration = null;
      const note = $("pm-pad-calib-note");
      const msg = "Calibration cancelled — press CALIBRATE STICK to try again.";
      if (note && note.textContent !== msg) note.textContent = msg;
    }
    cancelStick();
  }

  const activeInputKind = () => Input.activeInputSource ? Input.activeInputSource()
    : Input.touchControlsNeeded() ? "touch" : "keyboard";

  function markHelpInput() {
    const root = document.getElementById("htp-inputs");
    if (root && root.dataset) root.dataset.activeInput = activeInputKind();
  }

  function prioritizeHelpInput() {
    const root = document.getElementById("htp-inputs");
    const sheet = document.getElementById("howtoplay");
    if (!root || !root.querySelectorAll || (sheet && sheet.hidden)) return;
    const details = Array.from(root.querySelectorAll("details[data-input]"));
    if (!details.length) return;
    if (root.dataset.helpInputReady) return;
    const source = activeInputKind();
    const kind = source === "phone" ? "touch" : source;
    const current = details.find((el) => el.getAttribute("data-input") === kind) || details[0];
    for (const el of details) el.open = el === current;
    root.dataset.helpInputReady = "1";
    if (root.firstElementChild !== current && root.insertBefore) root.insertBefore(current, root.firstElementChild);
  }

  function section(dev) {
    const { host, note, reset: resetBtn, help, section: wrap } = dev;
    if (!host) return null;
    if (dev.key !== "pad" || !Input.controllerProfile || !Input.controllerProfile()) dev.load(store.get(dev.key, null));
    let armed = null;
    const setNote = (t) => { if (note) note.textContent = t; };
    const save = () => store.set(dev.key, dev.get());
    function clearArmed() {
      if (!armed) return null;
      const out = { id: armed.id, slot: armed.slot };
      const { btn } = armed;
      armed = null;
      delete btn.dataset.armed;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", disarmOnBlur);
      if (!dev.keys) Input.padCapture(null);
      return out;
    }
    const onScreen = () => !(host.closest && host.closest("[hidden]"));
    function accept(v) {
      if (!armed) return;
      if (!onScreen()) { disarm(true, false); return; }
      const { id, slot } = armed;
      const focus = { id, slot };
      const r = dev.set(id, slot, v);
      if (!r.ok) {
        const prefix = r.reason === "reserved" ? `${dev.label(v)} is reserved by the menus — ` : "";
        setNote(`${prefix}press another, or Esc.`);
        return;
      }
      clearArmed();
      save();
      tick();
      render(focus);
      const from = r.conflict && dev.list().find((a) => a.id === r.conflict);
      setNote(from ? `${dev.label(v)} moved here from ${from.label}.` : dev.idle);
    }
    function onKey(e) {
      if (!armed || !e.isTrusted) return;
      if (!onScreen()) { disarm(true, false); return; }
      if (e.isComposing || e.keyCode === 229) return;
      const erase = e.code === "Backspace" || e.code === "Delete";
      if (dev.keys || erase || e.code === "Escape") { e.preventDefault(); e.stopPropagation(); }
      if (e.repeat) return;
      if (e.code === "Escape") { disarm(); return; }
      if (erase) { unbind(); return; }
      if (dev.keys) accept(e.code);
    }
    function unbind() {
      const { id, slot } = armed;
      const focus = { id, slot };
      const row = dev.list().find((a) => a.id === id);
      dev.clear(id, slot);
      clearArmed();
      save();
      tick();
      render(focus);
      setNote(`${row ? row.label : id}${slot ? " second" : ""} ${dev.noun} cleared — it is unset now.`);
    }
    function arm(id, slot, btn) {
      cancelCalibration();
      if (armed && armed.btn === btn) { disarm(); return; }
      for (const s of sections) s.disarm(true, false);
      armed = { id, slot, btn };
      btn.dataset.armed = "1";
      btn.textContent = dev.keys ? "PRESS A KEY" : "PRESS A BUTTON";
      setNote(dev.armedNote);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", disarmOnBlur);
      if (!dev.keys) Input.padCapture(accept);
    }
    function disarm(quiet, restoreFocus = true) {
      const focus = clearArmed();
      if (!focus) return;
      render(restoreFocus ? focus : null);
      if (!quiet) setNote(dev.idle);
    }
    function disarmOnBlur() { disarm(false, false); }

    function slotButton(a, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sel-chip";
      b.dataset.action = a.id;
      b.dataset.slot = String(i);
      const code = a.codes[i];
      b.textContent = code != null ? dev.label(code) : "—";
      const slotWord = i ? " second " : " ";
      const valueText = code != null ? `: ${dev.label(code)}` : ": unset";
      b.setAttribute("aria-label", `${a.label}${slotWord}${dev.noun}${valueText} — press to change`);
      b.onclick = () => arm(a.id, i, b);
      return b;
    }
    function render(focus) {
      if (clearArmed()) setNote(dev.idle);
      host.textContent = "";
      let focusBtn = null;
      for (const a of dev.list()) {
        const row = document.createElement("div");
        row.className = "set-row";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", a.label);
        const lbl = document.createElement("span");
        lbl.className = "tune-label";
        lbl.textContent = a.label;
        const cluster = document.createElement("div");
        const first = slotButton(a, 0), second = slotButton(a, 1);
        cluster.append(first, second);
        if (focus && focus.id === a.id) focusBtn = focus.slot === 1 ? second : first;
        row.append(lbl, cluster);
        host.appendChild(row);
      }
      if (resetBtn) resetBtn.disabled = dev.isDefault();
      if (wrap && dev.show) wrap.hidden = !dev.show();
      renderHint();
      renderHelp();
      markHelpInput();
      prioritizeHelpInput();
      if (focusBtn && typeof focusBtn.focus === "function") {
        try { focusBtn.focus({ preventScroll: true }); } catch (_) { focusBtn.focus(); }
      }
    }
    function renderHelp() {
      const attr = dev.keys ? "data-help-keys" : "data-help-pad";
      const slots = document.querySelectorAll ? document.querySelectorAll(`[${attr}]`) : [];
      if (slots.length) {
        const byId = {};
        for (const a of dev.list()) byId[a.id] = a;
        const aliases = { ot: "overtake", activeaero: "aero", "active-aero": "aero" };
        for (const slot of slots) {
          const raw = (slot.getAttribute(attr) || "").trim().toLowerCase();
          const action = aliases[raw] || raw;
          const row = byId[action];
          slot.textContent = "";
          if (!row) { slot.textContent = "unset"; continue; }
          const codes = row.codes.filter((c) => c != null);
          if (!codes.length) { slot.textContent = "unset"; continue; }
          codes.forEach((code, i) => {
            if (i) slot.append(" / ");
            const chip = document.createElement("span");
            chip.className = "key";
            chip.textContent = dev.label(code);
            slot.append(chip);
          });
        }
      }
      if (!help) return;
      help.textContent = "";
      const chip = (code) => { const k = document.createElement("span"); k.className = "key"; k.textContent = dev.label(code); return k; };
      const byId = {};
      for (const a of dev.list()) byId[a.id] = a;
      dev.groups.forEach(([name, ids, tail], gi) => {
        if (gi) help.append("  ·  ");
        help.append(`${name} `);
        if (typeof ids === "string") {
          help.append(ids);
        } else {
          const primary = [], secondary = [];
          for (const id of ids) { const c = byId[id].codes; if (c[0] != null) primary.push(c[0]); if (c[1] != null) secondary.push(c[1]); }
          if (!primary.length && !secondary.length) help.append("unset");
          primary.forEach((c) => help.append(chip(c)));
          if (primary.length && secondary.length) help.append(" / ");
          secondary.forEach((c) => help.append(chip(c)));
        }
        if (tail) help.append(` ${tail}`);
      });
    }
    if (resetBtn) resetBtn.onclick = () => { disarm(true); dev.resetAll(); save(); tick(); render(); setNote(dev.resetNote); };
    const api = { render, arm, disarm, hidden: () => !!(wrap && wrap.hidden) };
    sections.push(api);
    render();
    return api;
  }

  const desktop = () => document.body.classList.contains("desktop");
  const hint = $("pm-ctl-hint");
  let keys = null;
  let pad = null;
  function renderHint() {
    if (!hint) return;
    const keysOff = keys ? keys.hidden() : true;
    const padOff = pad ? pad.hidden() : true;
    hint.hidden = desktop() || !(keysOff && padOff);
  }
  keys = section({
    keys: true, noun: "key", key: "keys",
    section: $("pm-keys-section"), host: $("pm-keys"), note: $("pm-keys-note"), reset: $("pm-keys-reset"), help: $("htp-keys"),
    load: Input.setKeyMap, get: Input.getKeyMap, list: Input.keyBindings, set: Input.setKeyBinding, clear: Input.clearKeyBinding,
    resetAll: Input.resetKeys, isDefault: Input.keysAreDefault, label: Input.keyLabel,
    show: () => desktop() || Input.keyboardSeen() || !Input.keysAreDefault(),
    idle: "Tap a key slot, then press the key you want. Esc cancels, Backspace clears the slot. A key already used by another action moves here.",
    armedNote: "Press a key… (Esc cancels, Backspace clears)", resetNote: "Keys reset to the defaults.",
    groups: [
      ["Steer", ["left", "right"]], ["Gas", ["throttle"]], ["Brake", ["brake"]],
      ["Boost", ["boost"], "tap to toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"], "when GEARS: MANUAL"],
      ["Look back", ["lookBack"], "hold"], ["Recover", ["recover"]], ["Radio check", ["radio"], "gaps from the engineer"], ["Mirror", ["mirror"], "on / off"], ["Pause", ["pause"]],
    ],
  });
  const controllerIsDefault = () => Input.padsAreDefault()
    && (!Input.padAxesAreDefault || Input.padAxesAreDefault())
    && (!Input.padRest || Input.padRest() === 0);
  const resetController = () => {
    cancelCalibration();
    stopPreview();
    if (abortWheel) abortWheel();
    Input.resetPad();
    if (Input.setPadAxisMap) {
      Input.setPadAxisMap(null);
      if (store.rawDel) store.rawDel("padAxes");
      else store.set("padAxes", Input.getPadAxisMap());
    }
    if (Input.setPadRest) {
      Input.setPadRest(0);
      if (store.rawDel) store.rawDel("padRest");
      else store.set("padRest", 0);
    }
  };
  pad = section({
    keys: false, noun: "button", key: "pad",
    section: $("pm-pad-section"), host: $("pm-pad"), note: $("pm-pad-note"), reset: $("pm-pad-reset"), help: $("htp-pad"),
    load: Input.setPadMap, get: Input.getPadMap, list: Input.padBindings, set: Input.setPadBinding, clear: Input.clearPadBinding,
    resetAll: resetController, isDefault: controllerIsDefault, label: Input.padLabel,
    show: () => Input.padPresent() || desktop() || !controllerIsDefault(),
    idle: "Tap a slot, then press a button on the controller. Esc cancels, Backspace clears the slot. The stick and D‑pad steer.",
    armedNote: "Press a controller button… (Esc cancels, Backspace clears)", resetNote: "Controller reset to the defaults.",
    groups: [
      ["Steer", "left stick / D‑pad"], ["Gas", ["throttle"]], ["Brake", ["brake"], "(triggers are analog)"],
      ["Boost", ["boost"], "toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"]],
      ["Look back", ["lookBack"], "hold"], ["Recover", ["recover"]], ["Radio check", ["radio"], "gaps from the engineer"], ["Mirror", ["mirror"], "on / off"], ["Pause", ["pause"]],
    ],
  });
  if (pad) for (const ev of ["gamepadconnected", "gamepaddisconnected"]) window.addEventListener(ev, () => { cancelCalibration(); pad.render(); });
  let reveal = null;
  if (keys) {
    reveal = () => setTimeout(() => { if (keys.hidden() && Input.keyboardSeen()) keys.render(); if (!keys.hidden()) window.removeEventListener("keydown", reveal); }, 0);
    window.addEventListener("keydown", reveal);
  }
  const rerender = () => {
    for (const s of sections) s.render();
    if (reveal && keys && !keys.hidden()) window.removeEventListener("keydown", reveal);
  };
  if (Input.onPointerKindChange) Input.onPointerKindChange(rerender);
  if (typeof MutationObserver === "function") {
    const helpSheet = document.getElementById("howtoplay");
    if (helpSheet) new MutationObserver(prioritizeHelpInput)
      .observe(helpSheet, { attributes: true, attributeFilter: ["hidden"] });
  }
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(rerender) : rerender()), { once: true });
  else rerender();
  const BRANDS = [["auto", "AUTO"], ["xbox", "XBOX"], ["ps", "PLAYSTATION"], ["nintendo", "NINTENDO"]];
  if ($("pm-padbrand") && Input.setPadLabelMode && window.SettingRow) {
    Input.setPadLabelMode(store.get("padLabels", "auto"));
    SettingRow.wire("pm-padbrand", {
      values: BRANDS,
      read: () => Input.padLabelMode(),
      write: (v) => {
        Input.setPadLabelMode(v);
        store.set("padLabels", v);
        tick();
        if (pad) pad.render();
      },
    });
    SettingRow.paint($("pm-padbrand"), Input.padLabelMode(), BRANDS);
  }

  const calibNote = $("pm-pad-calib-note");
  if (calibNote) {
    calibNote.setAttribute("role", "status");
    calibNote.setAttribute("aria-live", "polite");
    calibNote.setAttribute("aria-atomic", "true");
  }
  const say = (t) => { if (calibNote && calibNote.textContent !== t) calibNote.textContent = t; };
  const calibBtn = $("pm-pad-calib");
  function calibrationDevice() {
    try { return Input.pickPad(navigator.getGamepads(), null, !Input.padAxesAreDefault()); }
    catch (_) { return null; }
  }
  if (calibBtn && Input.calibratePad) calibBtn.onclick = () => {
    stopPreview();
    for (const s of sections) s.disarm(true, false);
    if (abortWheel) abortWheel();
    cancelStick();
    if (!Input.padPresent()) { say("No controller detected. Press a button on it first — a browser hides a pad until you do."); return; }
    say("Let go of the stick…");
    const generation = stickGeneration;
    const owner = Input.padCalibrationOwner ? Input.padCalibrationOwner() : undefined;
    const device = calibrationDevice();
    const request = calibration = { id: device && device.id, index: device && device.index, timer: 0, generation, owner };
    request.timer = stickTimer = setTimeout(() => {
      if (calibration !== request || generation !== stickGeneration) return;
      stickTimer = 0;
      const current = calibrationDevice();
      if (!current || current.id !== request.id || current.index !== request.index
          || !controlsPageActive()) { cancelCalibration(); return; }
      if (Input.padCalibrationOwner && owner !== Input.padCalibrationOwner()) {
        cancelCalibration();
        say("Controller changed — calibration cancelled. Press CALIBRATE STICK again for this controller.");
        return;
      }
      calibration = null;
      if (Input.calibratePad(owner)) {
        store.set("padRest", Input.padRestStore ? Input.padRestStore() : Input.padRest());
        say(`Centre captured (offset ${(Input.padRest() * 100).toFixed(1)}%). If the car still pulls, raise DEAD ZONE a point or two.`);
        tick();
        if (pad) pad.render();
      } else {
        say("The stick was not resting — let go of it completely, then press CALIBRATE STICK again.");
      }
    }, 450);
  };

  let abortWheel = null;
  let wheelOwner = null;
  const wheelBtn = $("pm-pad-wheel");
  if (wheelBtn && Input.beginAxisCapture) {
    const STEPS = [
      { key: "steer", ask: "Turn the wheel LEFT and hold it…", done: "Steering found." },
      { key: "throttle", ask: "Now press the THROTTLE pedal all the way…", done: "Throttle found." },
      { key: "brake", ask: "Now press the BRAKE pedal all the way…", done: "Brake found." },
    ];
    let running = false;
    let stepTimer = 0;
    abortWheel = () => {
      clearTimeout(stepTimer);
      if (!running) return;
      running = false;
      wheelOwner = null;
      Input.beginAxisCapture(null);
      wheelBtn.textContent = "SET UP A WHEEL";
      say("Wheel setup cancelled — nothing changed.");
    };
    const finish = (map, msg) => {
      running = false;
      clearTimeout(stepTimer);
      if (!Input.setPadAxisMap(map, wheelOwner)) {
        wheelOwner = null;
        Input.beginAxisCapture(null);
        wheelBtn.textContent = "SET UP A WHEEL";
        say("Wheel disconnected — setup cancelled, nothing changed.");
        return;
      }
      wheelOwner = null;
      Input.beginAxisCapture(null);
      store.set("padRest", Input.padRestStore());
      store.set("padAxes", Input.getPadAxisMap());
      wheelBtn.textContent = "SET UP A WHEEL";
      say(msg);
      tick();
      if (pad) pad.render();
    };
    wheelBtn.onclick = () => {
      cancelCalibration();
      stopPreview();
      if (running) {
        abortWheel();
        say("Wheel setup cancelled — nothing changed.");
        return;
      }
      if (!Input.padPresent()) { say("No wheel or controller detected. Turn the wheel or press a button on it first."); return; }
      running = true;
      wheelOwner = null;
      wheelBtn.textContent = "CANCEL";
      const map = Object.assign(Input.getPadAxisMap(), { throttle: null, brake: null,
        throttleRest: null, throttleFar: null, brakeRest: null, brakeFar: null });
      const ext = {};
      let i = 0;
      const step = (note) => {
        if (!running) return;
        if (i >= STEPS.length) {
          for (const k of ["throttle", "brake"]) {
            const e = ext[k];
            if (e && Math.abs(e.far - e.rest) >= 0.3) { map[k + "Rest"] = Math.round(e.rest * 1000) / 1000; map[k + "Far"] = Math.round(e.far * 1000) / 1000; }
          }
          finish(map, "Wheel set up. Steering, throttle and brake are mapped to the axes you moved.");
          return;
        }
        say(typeof note === "string" ? note : STEPS[i].ask);
        const taken = STEPS.slice(0, i).filter((s) => s.key !== "throttle" || STEPS[i].key !== "brake")
          .map((s) => map[s.key]).filter((a) => a != null);
        Input.beginAxisCapture((axis, dir, info) => {
          if (!running) return;
          if (!wheelOwner && info) wheelOwner = info.key;
          if (wheelOwner && (!info || info.key !== wheelOwner)) return;
          const st = STEPS[i];
          if (st.key === "brake" && axis === map.throttle) {
            clearTimeout(stepTimer);
            stepTimer = setTimeout(() => step("That moved the THROTTLE's axis. Letting go of the throttle? Press the BRAKE pedal now. If brake and throttle share one axis, switch the wheel to separate pedals."), 600);
            return;
          }
          map[st.key] = axis;
          if (info && st.key !== "steer") ext[st.key] = info;
          if (st.key === "steer") map.steerInvert = dir > 0 ? -1 : 1;
          else if (st.key === "throttle") map.pedalInvert = dir > 0 ? 1 : -1;
          say(st.done);
          i++;
          tick();
          clearTimeout(stepTimer);
          stepTimer = setTimeout(step, 600);
        }, { exclude: taken, ownerKey: wheelOwner });
      };
      step();
    };
  }
  window.addEventListener("gamepaddisconnected", (e) => {
    const p = e.gamepad;
    if (wheelOwner && p && wheelOwner === p.index + ":" + p.id && abortWheel) abortWheel();
  });
  const previewHost = $("pm-pad-section");
  if (previewHost && Input.parkedPadPreview) {
    const button = document.createElement("button");
    button.id = "pm-pad-preview"; button.type = "button";
    button.textContent = "CHECK CONTROLS";
    button.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.id = "pm-pad-preview-panel"; panel.hidden = true;
    button.setAttribute("aria-controls", panel.id);
    const note = document.createElement("p"); note.className = "adv-help";
    note.textContent = "Release the controls to check centre, then press each pedal and turn fully each way. This check changes no settings.";
    panel.appendChild(note);
    const meters = {};
    for (const [key, name, min] of [["steer", "Steering", -1], ["throttle", "Throttle", 0], ["brake", "Brake", 0]]) {
      const row = document.createElement("label"); row.className = "set-row";
      const text = document.createElement("span"); text.textContent = name;
      const meter = document.createElement("meter");
      meter.min = min; meter.max = 1; meter.value = 0;
      meter.setAttribute("aria-label", name);
      const reading = document.createElement("span");
      row.append(text, meter, reading); panel.appendChild(row);
      meters[key] = { meter, reading };
    }
    const calibrate = document.createElement("button");
    calibrate.type = "button"; calibrate.textContent = "CALIBRATE STICK";
    calibrate.onclick = () => { stopPreview(); if (calibBtn) { calibBtn.focus(); calibBtn.click(); } };
    const tuning = document.createElement("button");
    tuning.type = "button"; tuning.textContent = "DEAD ZONE & SATURATION…";
    tuning.onclick = () => { stopPreview(); const advanced = $("pm-advanced"); if (advanced && advanced.click) advanced.click(); };
    panel.append(calibrate, tuning);
    previewHost.append(button, panel);
    let previewTimer = 0, running = false, generation = 0;
    stopPreview = () => {
      running = false; generation++;
      clearTimeout(previewTimer); previewTimer = 0;
      panel.hidden = true; button.textContent = "CHECK CONTROLS";
      button.setAttribute("aria-expanded", "false");
    };
    const sample = (owner) => {
      if (!running || owner !== generation) return;
      if (previewHost.closest && previewHost.closest("[hidden]")) { stopPreview(); return; }
      const values = Input.parkedPadPreview();
      note.textContent = values ? "Release to check centre; press pedals fully and turn both ways. No settings are changed." : "No controller detected. Press a button on it first.";
      for (const key of Object.keys(meters)) {
        const value = values ? values[key] : 0;
        const text = key === "steer" ? (Math.abs(value) < 0.01 ? "centred" : `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? "left" : "right"}${Math.abs(value) >= 0.99 ? " — full steering" : ""}`)
          : value < 0.01 ? "released" : value >= 0.99 ? "fully pressed" : `${Math.round(value * 100)}%`;
        meters[key].meter.value = value;
        meters[key].meter.setAttribute("aria-valuetext", text);
        meters[key].reading.textContent = text;
      }
      previewTimer = setTimeout(() => sample(owner), 100);
    };
    button.onclick = () => {
      if (running) { stopPreview(); return; }
      for (const section of sections) section.disarm(false, false);
      cancelStick(); if (abortWheel) abortWheel();
      running = true; panel.hidden = false;
      button.textContent = "STOP CONTROL CHECK";
      button.setAttribute("aria-expanded", "true");
      sample(++generation);
    };
  }
  const helpSheet = $("htp-controls");
  if (helpSheet && typeof Onboard !== "undefined" && Onboard.resetControlsRefresher) {
    const refresher = document.createElement("button");
    refresher.id = "htp-controls-refresher"; refresher.type = "button";
    refresher.textContent = "REPEAT CONTROL REMINDERS";
    const note = document.createElement("p"); note.className = "adv-help";
    note.setAttribute("role", "status"); note.setAttribute("aria-atomic", "true");
    refresher.onclick = () => {
      if (Onboard.resetControlsRefresher()) {
        note.textContent = "Brake, overtake and aero reminders re-enabled for your next races, using your current controls.";
        tick();
      }
    };
    helpSheet.append(refresher, note);
  }
  if (Input.setPadAxisMap && (!Input.controllerProfile || !Input.controllerProfile())) Input.setPadAxisMap(store.get("padAxes", null));
  if (Input.setPadRest) Input.setPadRest(store.get("padRest", 0));

  function disarmAll() {
    cancelCalibration();
    stopPreview();
    for (const s of sections) s.disarm(true, false);
    if (abortWheel) abortWheel();
  }
  if (typeof SettingsNav !== "undefined" && SettingsNav && SettingsNav.onLeave) {
    SettingsNav.onLeave((id) => { if (id === "controls") disarmAll(); });
  }
  window.addEventListener("blur", cancelCalibration);
  if (keys || pad) Log.info("ui", "KeyBinds.create");
  return {
    render() { for (const s of sections) s.render(); },
    disarmAll,
  };
}

  return { create };
})();
Object.freeze(KeyBinds);
