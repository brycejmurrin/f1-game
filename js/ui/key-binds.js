/* Apex 26 — the KEYBOARD section of the CONTROLS settings page: one row per
   driving action with two key slots, tap a slot then press a key to rebind it,
   RESET KEYS to go back to the defaults. Reads and writes the binding table in
   js/input/input.js (Input.keyBindings / setKeyBinding), persists it under the
   `apex26.keys` store key, and rewrites the HOW TO PLAY keyboard line so the
   help never contradicts the bindings. Desktop only by CSS (a phone without a
   keyboard hides the section). KeyBinds.create(G) is wired from js/game.js;
   consumes the globals Input, GameAudio. */
const KeyBinds = (function () {
  "use strict";

function create(G) {
  const { $, store } = G;
  const host = $("pm-keys"), note = $("pm-keys-note"), resetBtn = $("pm-keys-reset"), help = $("htp-keys");
  if (!host) return { render() {} };
  Log.info("ui", "KeyBinds.create");
  Input.setKeyMap(store.get("keys", null));
  const NOTE_IDLE = "Tap a key slot, then press the key you want. Esc cancels. A key already used by another action moves here.";
  const NOTE_ARMED = "Press a key… (Esc cancels)";
  let armed = null;   // { id, slot, btn } while a slot waits for a key
  const tick = () => { if (G.soundOn && window.GameAudio) GameAudio.uiTick(); };
  const setNote = (t) => { if (note) note.textContent = t; };
  const save = () => store.set("keys", Input.getKeyMap());

  // The capture listener is on WINDOW in the CAPTURE phase, ahead of every
  // document listener (the menu walker, the Escape handler, Input itself), and
  // swallows the key: a captured key must not also steer, page or close.
  // Synthetic keydowns (the gamepad walker dispatches ArrowUp/Down at the
  // document to move focus) are not keys the player pressed — ignored.
  function onCapture(e) {
    if (!armed || !e.isTrusted) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    const { id, slot } = armed;
    if (e.code === "Escape") { disarm(); return; }
    const r = Input.setKeyBinding(id, slot, e.code);
    if (!r.ok) {
      setNote((r.reason === "reserved" ? Input.keyLabel(e.code) + " is reserved by the menus — " : "") + "press another key, or Esc.");
      return;
    }
    disarm(true);
    save();
    tick();
    render();
    const from = r.conflict && Input.keyBindings().find((a) => a.id === r.conflict);
    setNote(from ? Input.keyLabel(e.code) + " moved here from " + from.label + "." : NOTE_IDLE);
  }
  function arm(id, slot, btn) {
    if (armed && armed.btn === btn) { disarm(); return; }
    disarm(true);
    armed = { id, slot, btn };
    btn.dataset.armed = "1";
    btn.textContent = "PRESS A KEY";
    setNote(NOTE_ARMED);
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("blur", disarmOnBlur);
  }
  function disarm(quiet) {
    if (!armed) return;
    const { btn } = armed;
    armed = null;
    delete btn.dataset.armed;
    window.removeEventListener("keydown", onCapture, true);
    window.removeEventListener("blur", disarmOnBlur);
    render();
    if (!quiet) setNote(NOTE_IDLE);
  }
  function disarmOnBlur() { disarm(); }

  function slotButton(a, i) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip";
    b.dataset.action = a.id;
    b.dataset.slot = String(i);
    const code = a.codes[i];
    b.textContent = code ? Input.keyLabel(code) : "—";
    b.setAttribute("aria-label", a.label + (i ? " second key" : " key") + (code ? ": " + Input.keyLabel(code) : ": unset") + " — press to change");
    b.onclick = () => arm(a.id, i, b);
    return b;
  }
  // The rows follow the CONTROLS page's setting-row grammar (label left, the
  // control cluster right, one line at every UI SIZE): label, then two chips.
  function render() {
    host.textContent = "";
    for (const a of Input.keyBindings()) {
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
    if (resetBtn) resetBtn.disabled = Input.keysAreDefault();
    renderHelp();
  }
  // HOW TO PLAY's keyboard line, from the live table: "Steer ← → / A D · Gas
  // ↑ / W …". Written with DOM nodes (the .key chips), never markup.
  function renderHelp() {
    if (!help) return;
    help.textContent = "";
    const key = (code) => { const k = document.createElement("span"); k.className = "key"; k.textContent = Input.keyLabel(code); return k; };
    const groups = [
      ["Steer", ["left", "right"]], ["Gas", ["throttle"]], ["Brake", ["brake"]],
      ["Boost", ["boost"], "tap to toggle"], ["Overtake", ["overtake"]], ["Active aero", ["aero"]],
      ["Camera", ["camera"], "cycles"], ["Shift up", ["shiftUp"]], ["Shift down", ["shiftDown"], "when GEARS: MANUAL"],
    ];
    const byId = {};
    for (const a of Input.keyBindings()) byId[a.id] = a;
    groups.forEach(([name, ids, tail], gi) => {
      if (gi) help.append("  ·  ");
      help.append(name + " ");
      const primary = [], secondary = [];
      for (const id of ids) { const c = byId[id].codes; if (c[0]) primary.push(c[0]); if (c[1]) secondary.push(c[1]); }
      if (!primary.length && !secondary.length) { help.append("unset"); }
      primary.forEach((c) => help.append(key(c)));
      if (primary.length && secondary.length) help.append(" / ");
      secondary.forEach((c) => help.append(key(c)));
      if (tail) help.append(" " + tail);
    });
  }
  if (resetBtn) resetBtn.onclick = () => { disarm(true); Input.resetKeys(); save(); tick(); render(); setNote("Keys reset to the defaults."); };
  render();
  return { render, arm, disarm };
}

return { create };
})();
