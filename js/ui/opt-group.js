"use strict";
// OptGroup — the ONE way a menu offers a choice: a row of `.opt-btn` chips
// under a `.tune-label`, exactly one of them `.active`.
//
// WHY. A survey of every menu (2026-09-05) found three ways a control said
// "this one is chosen": a ringed chip (STEERING, RACE SETTINGS, the garage, the
// data hub), a `KEY: VALUE` button that cycled on tap with the value word
// painted gold/red/green/cyan (the whole CONTROLS page, the HUD fold), and an
// ON | OFF pair with no ring where only the chosen word was coloured (MUSIC,
// SOUND). Three grammars for one idea, sometimes on one screen. A chip row
// shows every option, needs one tap instead of a cycle, and lights the same
// way everywhere (css/tokens.css --plate-on); a coloured WORD stays a readout
// (the closed fold summaries), never a control.
//
// CONTRACT. The chips are static DOM in index.html — `<button class="opt-btn"
// data-v="…">` children of a `role="group"` row — so the shell stays the one
// source of static markup. `wire()` attaches the click handlers and paints;
// `paint()` / `disable()` are the statics a caller with its own refresh uses;
// `build()` is for the two rows JS creates at runtime (cockpit HALO). Chips are
// found through `getAttribute("data-v")` on `children`, not a selector, so the
// unit-test DOM stubs can drive it. AriaState mirrors `.active` to aria-pressed
// and MenuNav gives the row Left/Right, so this module owns neither.
window.OptGroup = (function () {
  const byId = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);
  const host = (h) => (typeof h === "string" ? byId(h) : h);

  function chips(h) {
    const el = host(h);
    const out = [];
    if (!el || !el.children) return out;
    for (const c of el.children) {
      if (c.tagName === "BUTTON" && c.getAttribute && c.getAttribute("data-v") != null) out.push(c);
    }
    return out;
  }

  /* Light the chip whose data-v is `value` (compared as strings), unlight the rest. */
  function paint(h, value) {
    const v = String(value);
    for (const b of chips(h)) b.classList.toggle("active", b.getAttribute("data-v") === v);
  }

  /* Disable — never hide — every chip: hiding reflowed the settings grid
     mid-tap and the next tap landed on whatever slid under the finger. */
  function disable(h, off) {
    for (const b of chips(h)) b.disabled = !!off;
  }

  /* One-line wiring for a static row: `read()` is the live value, `write(v)`
     applies a pick (the caller repaints via its own refresh, or we do). */
  function wire(h, read, write) {
    const el = host(h);
    if (!el) return null;
    for (const b of chips(el)) {
      b.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const v = b.getAttribute("data-v");
        if (v !== String(read())) write(v);
        paint(el, read());
      };
    }
    paint(el, read());
    return el;
  }

  /* Build a labelled row for JS-created settings. `values` is [[v, label], …].
     Returns { item, label, row } so the caller can place `item` and wire `row`. */
  function build(id, labelText, values) {
    const item = document.createElement("div");
    item.className = "adv-item";
    const label = document.createElement("span");
    label.className = "tune-label";
    label.id = id + "-label";
    label.textContent = labelText;
    const row = document.createElement("div");
    row.id = id;
    row.className = "opt-row balanced-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", label.id);
    for (const [v, text] of values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt-btn";
      b.id = id + "-" + v;
      b.setAttribute("data-v", String(v));
      b.textContent = text;
      row.appendChild(b);
    }
    item.appendChild(label);
    item.appendChild(row);
    return { item, label, row };
  }

  return { chips, paint, disable, wire, build };
})();
