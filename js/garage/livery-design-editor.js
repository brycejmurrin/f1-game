/* Livery editing tools. The caller owns persistence and the live Garage preview. */
"use strict";
const GarageLiveryDesignEditor = (function () {
  const sessions = new WeakMap();
  const LABELS = { ribbon: "Ribbon", brokenChevron: "Broken chevrons", contours: "Contour lines",
    honeycomb: "Honeycomb", segments: "Segmented panels", gradient: "Gradient", twoTone: "Two-tone sweep",
    checker: "Checkered flag", diamonds: "Diamond tiles", slashes: "Diagonal slashes",
    pinstripes: "Pinstripes", dots: "Rivet dots", lightning: "Lightning bolts" };
  function attach(root, draft, api) {
    let h = sessions.get(draft);
    if (!h) { h = LiveryDesign.history(draft); sessions.set(draft, h); }
    let restoring = false, comparing = false;
    const bindings = [], controls = document.createElement("div"); controls.className = "cs-liv-ed-finish";
    const status = document.createElement("p"); status.className = "cs-opt-desc"; status.setAttribute("role", "status");
    function button(label, action, host = controls) {
      const b = document.createElement("button"); b.type = "button"; b.className = "cs-liv-ed-none";
      b.textContent = label; b.onclick = action; host.appendChild(b); return b;
    }
    function sync() {
      undo.disabled = !h.canUndo(); redo.disabled = !h.canRedo();
      compare.textContent = comparing ? "SHOW EDITED" : "COMPARE ORIGINAL";
      compare.setAttribute("aria-pressed", String(comparing));
      for (const input of root.querySelectorAll("input[data-liv-field]")) {
        const key = input.dataset.livField;
        input.value = draft[key] || (input.type === "color" ? "#000000" : "");
        if (input.type === "color") input.classList.toggle("cs-liv-off", !draft[key]);
      }
      for (const b of root.querySelectorAll("[data-cs-pill], [data-cs-finish]")) {
        const pair = b.dataset.csPill ? b.dataset.csPill.split(":") : ["finish", b.dataset.csFinish];
        const on = draft[pair[0]] === pair[1]; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
      }
      for (const bind of bindings) bind();
    }
    function restore(next, message) {
      if (!next) return;
      api.flush(); comparing = false; restoring = true;
      for (const key of Object.keys(draft)) if (!Object.hasOwn(next, key)) delete draft[key];
      Object.assign(draft, next); sync(); api.changed(); restoring = false;
      status.textContent = message;
    }
    const undo = button("UNDO", () => restore(h.undo(), "Previous edit restored."));
    const redo = button("REDO", () => restore(h.redo(), "Edit restored."));
    const compare = button("COMPARE ORIGINAL", () => {
      api.flush(); comparing = !comparing; api.preview(comparing ? h.original() : draft); sync();
      status.textContent = comparing ? "Showing the original paint job. Your edits are kept; the next edit returns to your draft." : "Showing your edited paint job.";
    });
    // Extend the existing rows: one selector per field, no parallel design menu.
    const before = api.spineRow.nextSibling;
    function insert(node) { root.insertBefore(node, before); return node; }
    function row(label) {
      const r = document.createElement("div"); r.className = "cs-liv-ed-row";
      const text = document.createElement("span"); text.className = "cs-liv-ed-lbl"; text.textContent = label;
      r.appendChild(text); return r;
    }
    const historyRow = row("EDITS"); historyRow.appendChild(controls);
    root.insertBefore(historyRow, api.nameRow); root.insertBefore(status, api.nameRow);
    const patternRows = [];
    for (const [label, key, values, fallback] of [
      ["DESIGN AREA", "patternPlacement", ["crown", "wrap"], "crown"],
      ["WRAP SIDES", "patternSide", ["both", "left", "right"], "both"],
    ]) {
      const r = insert(api.pillRow(label, key, values, fallback));
      patternRows.push({ row: r, when: () => key !== "patternSide" || draft.patternPlacement === "wrap" });
    }
    const rangeLabels = { patternWidth: "DESIGN WIDTH", patternRepeat: "REPEATS", patternOffset: "SIDE OFFSET", patternTaper: "TAIL TAPER", patternOpacity: "OPACITY" };
    for (const [key, limits] of Object.entries(LiveryDesign.RANGES)) {
      const r = document.createElement("label"); r.className = "tune-row";
      const label = document.createElement("span"), text = document.createElement("span"), output = document.createElement("b");
      label.className = "tune-label"; text.textContent = rangeLabels[key]; label.append(text, output);
      const input = document.createElement("input");
      input.type = "range"; input.min = limits[0]; input.max = limits[1]; input.step = 1;
      input.setAttribute("aria-label", rangeLabels[key]); input.dataset.livField = key;
      input.oninput = () => { draft[key] = input.value; api.changed(true); };
      input.onchange = () => { api.changed(); api.flush(); };
      r.append(label, input); insert(r);
      patternRows.push({ row: r, when: () => key !== "patternRepeat" || !["ribbon", "gradient", "twoTone"].includes(draft.spineLogo) });
      bindings.push(() => { input.value = LiveryDesign.value(draft, key); output.textContent = input.value + (key === "patternRepeat" ? "" : "%"); });
    }
    bindings.push(() => {
      const enabled = LiveryDesign.PATTERNS.includes(draft.spineLogo);
      for (const item of patternRows) {
        const off = !enabled || !item.when();
        item.row.setAttribute("aria-disabled", String(off)); item.row.classList.toggle("tune-off", off);
        item.row.title = !enabled ? "Choose an adjustable design in SPINE TOP" : off ? "Not used by the current design or area" : "";
        for (const input of item.row.querySelectorAll("button, input")) input.disabled = off;
      }
    });
    const palettes = row("PALETTE"), paletteButtons = document.createElement("span"); paletteButtons.className = "cs-liv-ed-finish";
    palettes.appendChild(paletteButtons); root.insertBefore(palettes, api.bodyRow);
    for (const p of LiveryDesign.PALETTES) button(p.name.toUpperCase(), () => {
      [draft.c1, draft.c2, draft.patternTint] = p.colors; draft.patternSecond = p.colors[1];
      api.changed(); status.textContent = p.name + " applied to primary, accent and design colours. Other authored surface colours are kept.";
    }, paletteButtons);
    const actionRow = row("DESIGN"), actions = document.createElement("span"); actions.className = "cs-liv-ed-finish"; actionRow.appendChild(actions); insert(actionRow);
    const swap = button("SWAP COLOURS", () => {
      [draft.patternTint, draft.patternSecond] = [draft.patternSecond || draft.c1, draft.patternTint || draft.c2];
      api.changed(); status.textContent = "Design colours swapped. Body colours are unchanged.";
    }, actions);
    const reset = button("RESET SETTINGS", () => {
      for (const [key, limits] of Object.entries(LiveryDesign.RANGES)) draft[key] = String(limits[2]);
      draft.patternPlacement = "crown"; draft.patternSide = "both";
      api.changed(); status.textContent = "Design size, placement and opacity reset. Colours and selected design are kept. Undo restores your settings.";
    }, actions);
    bindings.push(() => {
      reset.disabled = !LiveryDesign.PATTERNS.includes(draft.spineLogo);
      swap.disabled = !["gradient", "twoTone", "segments", "checker", "diamonds", "dots"].includes(draft.spineLogo);
    });
    // Regional finishes live beside the colour they affect, using the same pill rows.
    for (const [field, finish] of [["cover", "coverFinish"], ["wing", "wingFinish"], ["halo", "haloFinish"]]) {
      const colour = root.querySelector('input[data-liv-field="' + field + '"]');
      const pill = root.querySelector('[data-cs-pill="' + finish + ':inherit"]');
      if (colour && pill) root.insertBefore(pill.closest(".cs-liv-ed-row"), colour.closest(".cs-liv-ed-row").nextSibling);
    }
    sync();
    return Object.freeze({
      changed(drag) {
        if (comparing) api.preview(draft);
        comparing = false; if (!restoring) h.record(draft, !!drag); sync();
      },
    });
  }
  return Object.freeze({ attach, label: (id) => LABELS[id] || id });
})();
