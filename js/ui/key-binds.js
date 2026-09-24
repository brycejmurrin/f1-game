/* Apex 26 — the KEYBOARD and CONTROLLER sections of the CONTROLS settings
   page: one row per driving action with two slots, tap a slot then press a
   key (or a controller button) to rebind it, RESET to go back to the defaults.
   Both edit a binding table in js/input/input.js (Input.keyBindings /
   setKeyBinding and the pad twins), persist it under `apex26.keys` /
   `apex26.pad`, and rewrite the HOW TO PLAY binding slots for that device so the help
   never contradicts the bindings. A desktop shows both; a touch device shows
   each table once its device has been seen (a trusted key press, a pad
   button) or when its map is already customised, with one hint line saying
   so until then. KeyBinds.create(G) is wired from js/game.js; consumes the
   globals Input, GameAudio. */
const KeyBinds = (function () {
  "use strict";

function create(G) {
  const { $, store } = G;
  const tick = () => { if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiTick(); };
  const sections = [];

  // The same activity report drives Help and first-run coaching prompts.
  const activeInputKind = () => Input.activeInputSource ? Input.activeInputSource()
    : Input.touchControlsNeeded() ? "touch" : "keyboard";

  function markHelpInput() {
    const root = document.getElementById("htp-inputs");
    if (root && root.dataset) root.dataset.activeInput = activeInputKind();
  }

  // On opening, put the active device article first and open it. Do this only
  // for the initial disclosure state: once the player has opened an alternate
  // article, preserve that choice across rebinding and later Help openings.
  function prioritizeHelpInput() {
    const root = document.getElementById("htp-inputs");
    const sheet = document.getElementById("howtoplay");
    if (!root || !root.querySelectorAll || (sheet && sheet.hidden)) return;
    const details = Array.from(root.querySelectorAll("details[data-input]"));
    if (!details.length) return;
    const kind = activeInputKind();
    const current = details.find((el) => el.getAttribute("data-input") === kind) || details[0];
    if (!root.dataset.helpInputReady) {
      for (const el of details) el.open = el === current;
      root.dataset.helpInputReady = "1";
    } else if (!current.open) {
      current.open = true;
    }
    if (root.firstElementChild !== current && root.insertBefore) root.insertBefore(current, root.firstElementChild);
  }

  // One rebinding section. `dev` carries the DOM (section, host, note, reset,
  // help — looked up by literal id at the call sites) and the Input half it
  // edits (list/set/get/load/resetAll/isDefault/label); `dev.keys` is true for
  // the keyboard, whose capture is a keydown, and false for the pad, whose
  // capture is Input.padCapture.
  function section(dev) {
    const { host, note, reset: resetBtn, help, section: wrap } = dev;
    if (!host) return null;
    dev.load(store.get(dev.key, null));
    let armed = null;   // { id, slot, btn } while a slot waits for input
    const setNote = (t) => { if (note) note.textContent = t; };
    const save = () => store.set(dev.key, dev.get());
    // Stop capture without rebuilding. Successful capture needs one render,
    // followed by focus on the replacement for the slot the player changed.
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
    // An armed slot is only armed while the player can SEE it. Leaving by
    // BACK, CLOSE or RESUME never disarmed it, so the first key pressed in the
    // race was swallowed and rebound (W could steal throttle's own binding)
    // and an armed pad slot zeroed the pad until a press (bug hunt 2026-09-22).
    const onScreen = () => !(host.closest && host.closest("[hidden]"));
    // A captured key code or button index lands here.
    function accept(v) {
      if (!onScreen()) { disarm(true, false); return; }
      const { id, slot } = armed;
      const r = dev.set(id, slot, v);
      if (!r.ok) {
        const prefix = r.reason === "reserved" ? `${dev.label(v)} is reserved by the menus — ` : "";
        setNote(`${prefix}press another, or Esc.`);
        return;
      }
      const focus = clearArmed();
      save();
      tick();
      render(focus);
      const from = r.conflict && dev.list().find((a) => a.id === r.conflict);
      setNote(from ? `${dev.label(v)} moved here from ${from.label}.` : dev.idle);
    }
    // The keyboard capture is on WINDOW in the CAPTURE phase, ahead of every
    // document listener (the menu walker, the Escape handler, Input itself),
    // and swallows the key: a captured key must not also steer, page or close.
    // Synthetic keydowns (the gamepad walker dispatches ArrowUp/Down at the
    // document to move focus) are not keys the player pressed — ignored. The
    // controller section takes only Escape from the keyboard (cancel).
    function onKey(e) {
      if (!armed || !e.isTrusted) return;
      if (!onScreen()) { disarm(true, false); return; }   // not consumed: the key is the race's
      /* AN IME IS TYPING, NOT BINDING. While a composition is active the
         browser reports keyCode 229 and a `key` of "Process" instead of the
         real key, so a player with a CJK input method active captured garbage
         into their control map — and `isComposing` alone is not enough,
         because compositionstart can fire AFTER the first keydown, leaving it
         false mid-composition. The 229 check is what covers that gap, and is
         the pairing MDN recommends. */
      if (e.isComposing || e.keyCode === 229) return;
      if (dev.keys || e.code === "Escape") { e.preventDefault(); e.stopPropagation(); }
      if (e.repeat) return;
      if (e.code === "Escape") { disarm(); return; }
      if (dev.keys) accept(e.code);
    }
    function arm(id, slot, btn) {
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
    // The rows follow the CONTROLS page's setting-row grammar (label left, the
    // control cluster right, one line at every UI SIZE): label, then two chips.
    function render(focus) {
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
    // Both the complete input guide and in-prose binding references use the
    // live table. A group whose ids is a string is fixed text (the
    // stick, pause). Written with DOM nodes (the .key chips), never markup.
    function renderHelp() {
      const attr = dev.keys ? "data-help-keys" : "data-help-pad";
      // Inline references also live outside the input disclosures.
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
  // The one line a phone sees while both tables are hidden: what to press to
  // make them appear. Gone the moment either table shows, and on a desktop.
  const hint = $("pm-ctl-hint");
  // Assigned below; section() renders (and hints) before both exist.
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
    load: Input.setKeyMap, get: Input.getKeyMap, list: Input.keyBindings, set: Input.setKeyBinding,
    resetAll: Input.resetKeys, isDefault: Input.keysAreDefault, label: Input.keyLabel,
    // A desktop always shows it; a touch device once a physical key has been
    // pressed (a tablet with a Bluetooth keyboard), or when the map is already
    // customised — pointer: coarse says nothing about whether a keyboard exists.
    show: () => desktop() || Input.keyboardSeen() || !Input.keysAreDefault(),
    idle: "Tap a key slot, then press the key you want. Esc cancels. A key already used by another action moves here.",
    armedNote: "Press a key… (Esc cancels)", resetNote: "Keys reset to the defaults.",
    groups: [
      ["Steer", ["left", "right"]], ["Gas", ["throttle"]], ["Brake", ["brake"]],
      ["Boost", ["boost"], "tap to toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"], "when GEARS: MANUAL"],
      ["Look back", ["lookBack"], "hold"], ["Recover", ["recover"]], ["Pause", ["pause"]],
    ],
  });
  pad = section({
    keys: false, noun: "button", key: "pad",
    section: $("pm-pad-section"), host: $("pm-pad"), note: $("pm-pad-note"), reset: $("pm-pad-reset"), help: $("htp-pad"),
    load: Input.setPadMap, get: Input.getPadMap, list: Input.padBindings, set: Input.setPadBinding,
    resetAll: Input.resetPad, isDefault: Input.padsAreDefault, label: Input.padLabel,
    // A desktop always shows it (a pad may be plugged in later); a phone only
    // once a pad has been seen, or when the map is already customised.
    show: () => Input.padPresent() || desktop() || !Input.padsAreDefault(),
    idle: "Tap a slot, then press a button on the controller. Esc cancels. The stick and D‑pad steer.",
    armedNote: "Press a controller button… (Esc cancels)", resetNote: "Controller reset to the defaults.",
    groups: [
      ["Steer", "left stick / D‑pad"], ["Gas", ["throttle"]], ["Brake", ["brake"], "(triggers are analog)"],
      ["Boost", ["boost"], "toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"]],
      ["Look back", ["lookBack"], "hold"], ["Recover", ["recover"]], ["Pause", ["pause"]],
    ],
  });
  // A pad that appears mid-session (gamepadconnected fires on its first press)
  // reveals the section and may rename the chips (a PlayStation pad).
  if (pad) for (const ev of ["gamepadconnected", "gamepaddisconnected"]) window.addEventListener(ev, () => pad.render());
  // The first physical key on a touch device reveals the KEYBOARD table.
  // Input.init (which sets the latch) is wired AFTER this create, so its
  // listener runs after this one for the same keydown: the check is deferred
  // past the dispatch. Once the table is showing there is nothing left to
  // reveal and the listener unhooks.
  if (keys) {
    const reveal = () => setTimeout(() => { if (keys.hidden() && Input.keyboardSeen()) keys.render(); if (!keys.hidden()) window.removeEventListener("keydown", reveal); }, 0);
    window.addEventListener("keydown", reveal);
  }
  // body.desktop is written by game.js's syncPointerKind() AFTER this create
  // (and again whenever the pointer kind flips at runtime), so the tables'
  // first render above ran with no verdict: re-render once the shell has
  // settled and on every later flip.
  const rerender = () => { for (const s of sections) s.render(); };
  if (Input.onPointerKindChange) Input.onPointerKindChange(rerender);
  // `hidden` is the shell's source of truth for dialog visibility. The
  // observer keeps Help's first disclosure aligned with the source the player
  // actually used when the dialog is opened, without a per-frame DOM walk.
  if (typeof MutationObserver === "function") {
    const helpSheet = document.getElementById("howtoplay");
    if (helpSheet) new MutationObserver(prioritizeHelpInput)
      .observe(helpSheet, { attributes: true, attributeFilter: ["hidden"] });
  }
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", rerender, { once: true });
  else rerender();
  /* BUTTON NAMES — the manual override for a guess that cannot always be
     right. Sniffing gamepad.id is genuinely the state of the art (the spec
     leaves the id format "unspecified" and standardising vendorId/productId is
     still an open W3C issue), but it mislabels a Switch-style pad, an 8BitDo
     in Nintendo mode, and anything Safari renames at the OS layer. */
  const BRANDS = [["auto", "AUTO"], ["xbox", "XBOX"], ["ps", "PLAYSTATION"], ["nintendo", "NINTENDO"]];
  // SettingRow is optional here on purpose: this module is booted in a bare VM
  // by tests/unit/key-binds.test.mjs, which supplies Input and a DOM and
  // nothing else. Every other global it touches is already guarded the same
  // way; an unguarded reference took the whole CONTROLS page down with it.
  if ($("pm-padbrand") && Input.setPadLabelMode && window.SettingRow) {
    Input.setPadLabelMode(store.get("padLabels", "auto"));
    SettingRow.wire("pm-padbrand", {
      values: BRANDS,
      read: () => Input.padLabelMode(),
      write: (v) => {
        Input.setPadLabelMode(v);
        store.set("padLabels", v);
        tick();
        if (pad) pad.render();       // every chip is renamed by this
      },
    });
    SettingRow.paint($("pm-padbrand"), Input.padLabelMode(), BRANDS);
  }

  const calibNote = $("pm-pad-calib-note");
  const say = (t) => { if (calibNote) calibNote.textContent = t; };
  const calibBtn = $("pm-pad-calib");
  if (calibBtn && Input.calibratePad) calibBtn.onclick = () => {
    if (!Input.padPresent()) { say("No controller detected. Press a button on it first — a browser hides a pad until you do."); return; }
    // The press that ran this button is not the stick, so sample on the next
    // turn of the loop rather than the instant of the click.
    say("Let go of the stick…");
    setTimeout(() => {
      if (Input.calibratePad()) {
        say(`Centre captured (offset ${(Input.padRest() * 100).toFixed(1)}%). If the car still pulls, raise DEAD ZONE a point or two.`);
        tick();
      } else {
        say("The stick was not resting — let go of it completely, then press CALIBRATE STICK again.");
      }
    }, 450);
  };

  /* THE WHEEL WIZARD. A wheel enumerates as a Gamepad with mapping "" — the
     only standard layout the spec defines is the Xbox-style pad — so its
     steering axis is a guess and its pedals are certainly not buttons 6/7.
     Nothing in the API says which axis is which, so the honest design is to
     ask: move the control, and whichever axis travels furthest from where it
     was resting is the answer. Sequential, one prompt at a time, and
     abandonable — a half-finished wizard leaves the previous map alone. */
  /* Abort the wheel wizard without changing the saved map. closeSettings /
     disarmAll must call this: beginAxisCapture alone zeroes the pad every
     frame until cancelled, and the 2026-09-22 slot disarm left the wizard out. */
  let abortWheel = null;
  const wheelBtn = $("pm-pad-wheel");
  if (wheelBtn && Input.beginAxisCapture) {
    const STEPS = [
      { key: "steer", ask: "Turn the wheel LEFT and hold it…", done: "Steering found." },
      { key: "throttle", ask: "Now press the THROTTLE pedal all the way…", done: "Throttle found." },
      { key: "brake", ask: "Now press the BRAKE pedal all the way…", done: "Brake found." },
    ];
    let running = false;
    abortWheel = () => {
      if (!running) return;
      running = false;
      Input.beginAxisCapture(null);
      wheelBtn.textContent = "SET UP A WHEEL";
    };
    const finish = (map, msg) => {
      running = false;
      Input.setPadAxisMap(map);
      store.set("padAxes", Input.getPadAxisMap());
      wheelBtn.textContent = "SET UP A WHEEL";
      say(msg);
      tick();
    };
    wheelBtn.onclick = () => {
      if (running) {   // a second press abandons it and puts everything back
        abortWheel();
        say("Wheel setup cancelled — nothing changed.");
        return;
      }
      if (!Input.padPresent()) { say("No wheel or controller detected. Turn the wheel or press a button on it first."); return; }
      running = true;
      wheelBtn.textContent = "CANCEL";
      const map = Object.assign(Input.getPadAxisMap(), { throttle: null, brake: null });
      let i = 0;
      const step = () => {
        if (!running) return;
        if (i >= STEPS.length) { finish(map, "Wheel set up. Steering, throttle and brake are mapped to the axes you moved."); return; }
        say(STEPS[i].ask);
        Input.beginAxisCapture((axis, dir) => {
          if (!running) return;
          const st = STEPS[i];
          map[st.key] = axis;
          // The steering sign is whatever the wheel reports for LEFT; we asked
          // for left, so a POSITIVE reading means this wheel is inverted.
          if (st.key === "steer") map.steerInvert = dir > 0 ? -1 : 1;
          else if (st.key === "throttle") map.pedalInvert = dir > 0 ? 1 : -1;
          i++;
          tick();
          setTimeout(step, 600);   // let the pedal come back up before listening again
        });
      };
      step();
    };
  }
  if (Input.setPadAxisMap) Input.setPadAxisMap(store.get("padAxes", null));

  if (keys || pad) Log.info("ui", "KeyBinds.create");
  return {
    render() { for (const s of sections) s.render(); },
    disarmAll() {
      for (const s of sections) s.disarm(true, false);   // closeSettings: nothing stays armed into a race
      if (abortWheel) abortWheel();
    },
  };
}

  return { create };
})();
Object.freeze(KeyBinds);
