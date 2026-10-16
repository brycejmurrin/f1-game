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
    const bindings = [], controls = document.createElement("div"); controls.className = "cs-liv-ed-btns";
    controls.style.flexWrap = "wrap";
    const status = document.createElement("p"); status.className = "cs-opt-desc"; status.setAttribute("role", "status");
    function button(label, action, host = controls) {
      const b = document.createElement("button"); b.type = "button"; b.className = "cs-liv-ed-none";
      b.style.whiteSpace = "normal"; b.style.flex = "1 1 auto"; b.style.maxWidth = "100%";
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
    const top = document.createElement("div"); top.className = "cs-liv-design-tools"; top.style.gridColumn = "1 / -1"; top.style.minWidth = "0";
    root.insertBefore(top, root.firstChild); top.append(controls, status);
    const tools = document.createElement("details"); tools.open = true;
    const summary = document.createElement("summary"); summary.textContent = "DESIGN TOOLS"; tools.appendChild(summary);
    top.appendChild(tools);
    function row(label) {
      const r = document.createElement("label"); r.className = "cs-liv-ed-row"; r.style.marginBlock = "8px";
      const text = document.createElement("span"); text.className = "cs-liv-ed-lbl"; text.textContent = label; text.style.flex = "1 0 100%"; r.appendChild(text); tools.appendChild(r); return r;
    }
    function select(label, options, action, command = false) {
      const r = row(label), s = document.createElement("select"); s.setAttribute("aria-label", label);
      s.style.maxWidth = "100%"; s.style.minWidth = "0"; s.style.width = "100%"; s.style.minHeight = "var(--chip-h)";
      for (const [value, text] of options) { const o = document.createElement("option"); o.value = value; o.textContent = text; s.appendChild(o); }
      s.onchange = () => { action(s.value); if (command) s.value = ""; }; r.appendChild(s); return s;
    }
    const surfaces = Array.from(root.querySelectorAll("input[type=color][data-liv-field]"));
    select("PAINT SURFACE", [["", "Choose a surface…"], ...surfaces.map((input) => [input.dataset.livField, input.getAttribute("aria-label")])], (key) => {
      const input = surfaces.find((item) => item.dataset.livField === key);
      if (!input) return;
      input.scrollIntoView({ block: "nearest" }); input.focus({ preventScroll: true });
      if (typeof GarageSurfaceInspection !== "undefined") GarageSurfaceInspection.inspect(key);
      status.textContent = input.getAttribute("aria-label") + " selected. Choose a colour or match another colour from this car.";
    }, true);
    const choices = [["", "Keep current top design"], ...LiveryDesign.PATTERNS.map((id) => [id, LABELS[id]])];
    const pattern = select("SPINE DESIGN", choices, (id) => { if (id) { draft.spineLogo = id; api.changed(); } });
    bindings.push(() => { pattern.value = LiveryDesign.PATTERNS.includes(draft.spineLogo) ? draft.spineLogo : ""; });
    const patternControls = [];
    for (const [label, key, options] of [
      ["DESIGN AREA", "patternPlacement", [["crown", "Crown and tail"], ["wrap", "Wrap over shoulders"]]],
      ["WRAP SIDES", "patternSide", [["both", "Both sides"], ["left", "Left only"], ["right", "Right only"]]],
    ]) {
      const s = select(label, options, (value) => { draft[key] = value; api.changed(); });
      patternControls.push(s); bindings.push(() => { s.value = draft[key]; });
    }
    const rangeLabels = { patternWidth: "DESIGN WIDTH", patternRepeat: "REPEATS", patternOffset: "SIDE OFFSET", patternTaper: "TAIL TAPER", patternOpacity: "OPACITY" };
    for (const [key, limits] of Object.entries(LiveryDesign.RANGES)) {
      const r = row(rangeLabels[key]), input = document.createElement("input"), output = document.createElement("output");
      input.style.minWidth = "0"; input.style.flex = "1 1 0";
      input.type = "range"; input.min = limits[0]; input.max = limits[1]; input.step = 1;
      input.setAttribute("aria-label", rangeLabels[key]); input.dataset.livField = key;
      input.oninput = () => { draft[key] = input.value; api.changed(true); };
      input.onchange = () => { api.changed(); api.flush(); };
      r.append(input, output); patternControls.push(input);
      bindings.push(() => { input.value = LiveryDesign.value(draft, key); output.value = input.value + (key === "patternRepeat" ? "" : "%"); });
    }
    bindings.push(() => {
      const enabled = LiveryDesign.PATTERNS.includes(draft.spineLogo);
      for (const input of patternControls) input.disabled = !enabled || input.getAttribute("aria-label") === "WRAP SIDES" && draft.patternPlacement !== "wrap";
      const repeat = patternControls.find((input) => input.dataset.livField === "patternRepeat");
      repeat.disabled = !enabled || ["ribbon", "gradient", "twoTone"].includes(draft.spineLogo);
    });
    select("PALETTE", [["", "Choose colours…"], ...LiveryDesign.PALETTES.map((p, i) => [String(i), p.name])], (id) => {
      if (id === "") return;
      const p = LiveryDesign.PALETTES[Number(id)]; if (!p) return;
      [draft.c1, draft.c2, draft.patternTint] = p.colors; draft.patternSecond = p.colors[1];
      api.changed(); status.textContent = p.name + " applied to primary, accent and design colours. Other authored surface colours are kept.";
    }, true);
    const actions = document.createElement("div"); actions.className = "cs-liv-ed-btns"; actions.style.flexWrap = "wrap"; tools.appendChild(actions);
    const swap = button("SWAP DESIGN COLOURS", () => {
      [draft.patternTint, draft.patternSecond] = [draft.patternSecond || draft.c1, draft.patternTint || draft.c2];
      api.changed(); status.textContent = "Design colours swapped. Body colours are unchanged.";
    }, actions);
    const reset = button("RESET DESIGN SETTINGS", () => {
      for (const [key, limits] of Object.entries(LiveryDesign.RANGES)) draft[key] = String(limits[2]);
      draft.patternPlacement = "crown"; draft.patternSide = "both";
      api.changed(); status.textContent = "Design size, placement and opacity reset. Colours and selected design are kept. Undo restores your settings.";
    }, actions);
    bindings.push(() => {
      reset.disabled = !LiveryDesign.PATTERNS.includes(draft.spineLogo);
      swap.disabled = !["gradient", "twoTone", "segments", "checker", "diamonds", "dots"].includes(draft.spineLogo);
    });
    const saved = api.presets();
    select("VISUAL PRESET", [["", "Load a complete paint job…"], ...saved.map((p, i) => [String(i), p.name || "Custom"])], (id) => {
      if (id === "") return;
      const p = saved[Number(id)]; if (!p) return;
      Object.assign(draft, api.fromLivery(p, draft.name)); api.changed();
      status.textContent = "Paint, designs and finishes loaded. SAVE & FIT keeps this as your visual preset; fitted mechanical parts stay unchanged.";
    }, true);
    const note = document.createElement("p"); note.className = "cs-opt-desc";
    note.textContent = "Design colours paint the new spine designs. Width, taper and offset shape the pattern across the crown and chosen flanks; side marks stay above it. SAVE & FIT stores every visual setting. Regional finishes affect painted surfaces; carbon and neutral metal keep their material. Undo is available until you close this editor.";
    tools.appendChild(note);
    sync();
    return Object.freeze({
      changed(drag) {
        if (comparing) api.preview(draft);
        comparing = false; if (!restoring) h.record(draft, !!drag); sync();
      },
    });
  }
  return Object.freeze({ attach });
})();
