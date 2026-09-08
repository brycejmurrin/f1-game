/* Apex 26 — the KEYBOARD and CONTROLLER sections of the CONTROLS settings
   page: one row per driving action with two slots, tap a slot then press a
   key (or a controller button) to rebind it, RESET to go back to the defaults.
   Both edit a binding table in js/input/input.js (Input.keyBindings /
   setKeyBinding and the pad twins), persist it under `apex26.keys` /
   `apex26.pad`, and rewrite the HOW TO PLAY line for that device so the help
   never contradicts the bindings. KEYBOARD is desktop-only by CSS; CONTROLLER
   shows on a desktop or wherever a pad has been seen. KeyBinds.create(G) is
   wired from js/game.js; consumes the globals Input, GameAudio. */
const KeyBinds = (function () {
  "use strict";

function create(G) {
  const { $, store } = G;
  const tick = () => { if (G.soundOn && window.GameAudio) GameAudio.uiTick(); };
  const sections = [];

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
    // A captured key code or button index lands here.
    function accept(v) {
      const { id, slot } = armed;
      const r = dev.set(id, slot, v);
      if (!r.ok) {
        setNote((r.reason === "reserved" ? dev.label(v) + " is reserved by the menus — " : "") + "press another, or Esc.");
        return;
      }
      disarm(true);
      save();
      tick();
      render();
      const from = r.conflict && dev.list().find((a) => a.id === r.conflict);
      setNote(from ? dev.label(v) + " moved here from " + from.label + "." : dev.idle);
    }
    // The keyboard capture is on WINDOW in the CAPTURE phase, ahead of every
    // document listener (the menu walker, the Escape handler, Input itself),
    // and swallows the key: a captured key must not also steer, page or close.
    // Synthetic keydowns (the gamepad walker dispatches ArrowUp/Down at the
    // document to move focus) are not keys the player pressed — ignored. The
    // controller section takes only Escape from the keyboard (cancel).
    function onKey(e) {
      if (!armed || !e.isTrusted) return;
      if (dev.keys || e.code === "Escape") { e.preventDefault(); e.stopPropagation(); }
      if (e.repeat) return;
      if (e.code === "Escape") { disarm(); return; }
      if (dev.keys) accept(e.code);
    }
    function arm(id, slot, btn) {
      if (armed && armed.btn === btn) { disarm(); return; }
      for (const s of sections) s.disarm(true);
      armed = { id, slot, btn };
      btn.dataset.armed = "1";
      btn.textContent = dev.keys ? "PRESS A KEY" : "PRESS A BUTTON";
      setNote(dev.armedNote);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", disarmOnBlur);
      if (!dev.keys) Input.padCapture(accept);
    }
    function disarm(quiet) {
      if (!armed) return;
      const { btn } = armed;
      armed = null;
      delete btn.dataset.armed;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", disarmOnBlur);
      if (!dev.keys) Input.padCapture(null);
      render();
      if (!quiet) setNote(dev.idle);
    }
    function disarmOnBlur() { disarm(); }

    function slotButton(a, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sel-chip";
      b.dataset.action = a.id;
      b.dataset.slot = String(i);
      const code = a.codes[i];
      b.textContent = code != null ? dev.label(code) : "—";
      b.setAttribute("aria-label", a.label + (i ? " second " : " ") + dev.noun + (code != null ? ": " + dev.label(code) : ": unset") + " — press to change");
      b.onclick = () => arm(a.id, i, b);
      return b;
    }
    // The rows follow the CONTROLS page's setting-row grammar (label left, the
    // control cluster right, one line at every UI SIZE): label, then two chips.
    function render() {
      host.textContent = "";
      for (const a of dev.list()) {
        const row = document.createElement("div");
        row.className = "set-row";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", a.label);
        const lbl = document.createElement("span");
        lbl.className = "tune-label";
        lbl.textContent = a.label;
        const cluster = document.createElement("div");
        cluster.append(slotButton(a, 0), slotButton(a, 1));
        row.append(lbl, cluster);
        host.appendChild(row);
      }
      if (resetBtn) resetBtn.disabled = dev.isDefault();
      if (wrap && dev.show) wrap.hidden = !dev.show();
      renderHelp();
    }
    // HOW TO PLAY's line for this device, from the live table: "Steer ← → /
    // A D · Gas ↑ / W …". A group whose ids is a string is fixed text (the
    // stick, pause). Written with DOM nodes (the .key chips), never markup.
    function renderHelp() {
      if (!help) return;
      help.textContent = "";
      const chip = (code) => { const k = document.createElement("span"); k.className = "key"; k.textContent = dev.label(code); return k; };
      const byId = {};
      for (const a of dev.list()) byId[a.id] = a;
      dev.groups.forEach(([name, ids, tail], gi) => {
        if (gi) help.append("  ·  ");
        help.append(name + " ");
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
        if (tail) help.append(" " + tail);
      });
    }
    if (resetBtn) resetBtn.onclick = () => { disarm(true); dev.resetAll(); save(); tick(); render(); setNote(dev.resetNote); };
    const api = { render, arm, disarm };
    sections.push(api);
    render();
    return api;
  }

  const keys = section({
    keys: true, noun: "key", key: "keys",
    section: $("pm-keys-section"), host: $("pm-keys"), note: $("pm-keys-note"), reset: $("pm-keys-reset"), help: $("htp-keys"),
    load: Input.setKeyMap, get: Input.getKeyMap, list: Input.keyBindings, set: Input.setKeyBinding,
    resetAll: Input.resetKeys, isDefault: Input.keysAreDefault, label: Input.keyLabel,
    idle: "Tap a key slot, then press the key you want. Esc cancels. A key already used by another action moves here.",
    armedNote: "Press a key… (Esc cancels)", resetNote: "Keys reset to the defaults.",
    groups: [
      ["Steer", ["left", "right"]], ["Gas", ["throttle"]], ["Brake", ["brake"]],
      ["Boost", ["boost"], "tap to toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"], "when GEARS: MANUAL"],
    ],
  });
  const pad = section({
    keys: false, noun: "button", key: "pad",
    section: $("pm-pad-section"), host: $("pm-pad"), note: $("pm-pad-note"), reset: $("pm-pad-reset"), help: $("htp-pad"),
    load: Input.setPadMap, get: Input.getPadMap, list: Input.padBindings, set: Input.setPadBinding,
    resetAll: Input.resetPad, isDefault: Input.padsAreDefault, label: Input.padLabel,
    // A desktop always shows it (a pad may be plugged in later); a phone only
    // once a pad has been seen, or when the map is already customised.
    show: () => Input.padPresent() || document.body.classList.contains("desktop") || !Input.padsAreDefault(),
    idle: "Tap a slot, then press a button on the controller. Esc cancels. The stick and D‑pad steer; MENU / START pauses.",
    armedNote: "Press a controller button… (Esc cancels)", resetNote: "Controller reset to the defaults.",
    groups: [
      ["Steer", "left stick / D‑pad"], ["Gas", ["throttle"]], ["Brake", ["brake"], "(triggers are analog)"],
      ["Boost", ["boost"], "toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"]], ["Pause", "MENU / START"],
    ],
  });
  // A pad that appears mid-session (gamepadconnected fires on its first press)
  // reveals the section and may rename the chips (a PlayStation pad).
  if (pad) for (const ev of ["gamepadconnected", "gamepaddisconnected"]) window.addEventListener(ev, () => pad.render());
  if (keys || pad) Log.info("ui", "KeyBinds.create");
  return { render() { for (const s of sections) s.render(); } };
}

return { create };
})();
