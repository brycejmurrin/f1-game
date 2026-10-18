/* Livery editing tools. The caller owns persistence and the live Garage preview. */
"use strict";
const GarageLiveryDesignEditor = (function () {
  const sessions = new WeakMap();
  const LABELS = { ribbon: "Ribbon", brokenChevron: "Broken chevrons", contours: "Contour lines",
    honeycomb: "Honeycomb", segments: "Segmented panels", gradient: "Gradient", twoTone: "Two-tone sweep",
    checker: "Checkered flag", diamonds: "Diamond tiles", slashes: "Diagonal slashes",
    pinstripes: "Pinstripes", dots: "Rivet dots", lightning: "Lightning bolts", waves: "Wave bands", sunburst: "Sunburst rays", scallops: "Scallop scales",
    herringbone: "Herringbone weave", circuit: "Circuit traces", shards: "Angular shards", pixelFade: "Pixel fade", speedlines: "Speed lines" };
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
    const rangeLabels = { patternWidth: "DESIGN WIDTH", patternRepeat: "REPEATS", patternOffset: "SIDE OFFSET", patternTaper: "TAIL TAPER", patternOpacity: "OPACITY", patternRotation: "ROTATION", patternStretch: "LENGTH STRETCH", patternWeight: "LINE WEIGHT" };
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
      patternRows.push({ row: r, when: () => key === "patternWeight" ? LiveryDesign.LINE_PATTERNS.includes(draft.spineLogo) : key !== "patternRepeat" || !["ribbon", "gradient", "twoTone"].includes(draft.spineLogo) });
      bindings.push(() => { input.value = LiveryDesign.value(draft, key); output.textContent = input.value + (key === "patternRepeat" ? "" : key === "patternRotation" ? "°" : "%"); });
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
    Array.from(paletteButtons.children).forEach((b, i) => {
      const colours = LiveryDesign.PALETTES[i].colors, swatch = document.createElement("span");
      swatch.className = "cs-liv-swatch"; swatch.setAttribute("aria-hidden", "true");
      swatch.style.width = "100%"; swatch.style.height = "6px"; swatch.style.flexBasis = "100%";
      swatch.style.background = "linear-gradient(90deg," + colours[0] + " 0 33%," + colours[1] + " 33% 66%," + colours[2] + " 66% 100%)";
      b.style.flexWrap = "wrap"; b.style.gap = "4px"; b.appendChild(swatch);
      b.title = "Apply " + LiveryDesign.PALETTES[i].name + " to body primary, accent and adjustable-pattern colours";
    });
    const actionRow = row("DESIGN"), actions = document.createElement("span"); actions.className = "cs-liv-ed-finish"; actionRow.appendChild(actions); insert(actionRow);
    const swap = button("SWAP COLOURS", () => {
      [draft.patternTint, draft.patternSecond] = [draft.patternSecond || draft.c1, draft.patternTint || draft.c2];
      api.changed(); status.textContent = "Design colours swapped. Body colours are unchanged.";
    }, actions);
    const reset = button("RESET SETTINGS", () => {
      for (const [key, limits] of Object.entries(LiveryDesign.RANGES)) draft[key] = String(limits[2]);
      draft.patternPlacement = "crown"; draft.patternSide = "both";
      api.changed(); status.textContent = "Design size, placement, rotation, stretch, line weight and opacity reset. Colours and selected design are kept. Undo restores your settings.";
    }, actions);
    bindings.push(() => {
      reset.disabled = !LiveryDesign.PATTERNS.includes(draft.spineLogo);
      swap.disabled = !LiveryDesign.SECOND_COLOR.includes(draft.spineLogo);
    });
    // Keep each setting and its paint beside the part it changes. Move the
    // original nodes, so their handlers, dependency rules and keyboard state survive.
    const fields = new Map();
    for (const r of Array.from(root.children)) {
      for (const c of r.querySelectorAll("input, button")) {
        const key = c.dataset.livField || (c.dataset.csPill || "").split(":")[0] || (c.dataset.csFinish ? "finish" : "");
        if (key) fields.set(key, r);
      }
      if (r.classList.contains("cs-liv-ed-sec")) r.remove();
    }
    function section(title, description, keys, extras = []) {
      const heading = document.createElement("div"); heading.className = "cs-liv-ed-sec";
      heading.setAttribute("role", "heading"); heading.setAttribute("aria-level", "3"); heading.textContent = title;
      heading.title = description; root.appendChild(heading);
      const note = document.createElement("p"); note.className = "cs-opt-desc"; note.textContent = description; root.appendChild(note);
      for (const item of [...keys.map((key) => fields.get(key)), ...extras]) {
        if (!item) continue;
        item.setAttribute("data-liv-section", title); root.appendChild(item);
      }
    }
    section("COLOUR PALETTE", "Changes body primary, accent and adjustable-pattern colours. Other painted surfaces keep their colours.", [], [palettes]);
    section("BODY PAINT & BASE FINISH", "Main body, nose and sidepods. FINISH is the whole-car default; regional INHERIT buttons use it.",
      ["finish", "c1", "c2", "stripe", "noseStripe", "accent", "nose", "noseFinish", "pod", "podFinish", "lower", "upper", "bodySplit"]);
    section("ENGINE COVER — SHAPE & PAINT", "The raised cover behind the cockpit. Shape, vents, base colour and finish.",
      ["cover", "coverFinish", "spineHeight", "coverVents"]);
    section("SPINE TOP — ARTWORK & COLOURS", "Artwork along the top of the engine cover. Select one design; only the colour controls it uses are enabled.",
      ["spineLogo", "patternTint", "patternSecond", "spineTint", "saddleTint", "sunTint", "bandTint2"]);
    section("SPINE PATTERN — SIZE & PLACEMENT", "Rotate or stretch adjustable artwork and tune its coverage. LINE WEIGHT applies to stroked designs. CROWN paints the top and tail; WRAP extends onto the selected cover sides.",
      ["patternPlacement", "patternSide", ...Object.keys(LiveryDesign.RANGES)], [actionRow]);
    section("COVER SIDES & TAIL LINK", "Side artwork and its fills. COVER BIND links top and side graphics; FIN HANDOFF controls the transition to the tail.",
      ["spineSide", "sideTint", "plateTint", "coverBind", "finHandoff"]);
    section("WINGS", "Front and rear wing paint. Carbon flaps keep their carbon material; WING FINISH applies to painted wing surfaces.",
      ["wingCarbon", "wing", "rearWing", "endplate", "wingFinish"]);
    section("TAIL FIN", "The vertical fin behind the engine cover. Choose its shape, paint, graphic and badge.",
      ["finShape", "fin", "finFinish", "finStyle", "finArt", "finBadge"]);
    section("TEAM MARKS & NUMBERS", "Emblem colours, number lettering and sponsor names. These controls affect identity marks across the car.",
      ["logo", "logo2", "logo3", "numFont", "sponsors", "boardTint"], [api.markNote]);
    section("COCKPIT & CAMERA", "Halo, mirror and T-cam: paint, finish and mirror housing colour.", ["halo", "haloFinish", "mirrorTint", "mirrorFinish", "cockpitTint", "gripTint", "tcam"]);
    section("WHEELS & BRAKES", "Paint-only wheel colours, applied to all four wheels. NONE keeps the BRAKES and TYRES parts' own colours.", ["rimTint", "caliperTint", "sidewallInk", "rimFinish"]);
    section("FLOOR, SUSPENSION & RUNNING GEAR", "Parts that are bare carbon by default: floor edge and bargeboards, suspension arms, brake ducts, wheel deflectors, plus the exhaust tip's heat colour. Unset keeps them carbon.",
      ["floorTint", "floorFinish", "suspTint", "suspFinish", "ductTint", "deflectorTint", "exhaustTint"]);
    section("HELMET", "Helmets for both of this team's drivers, like the rest of the paint job. TEAM keeps each driver's own design; the other styles repaint it from HELMET BASE and HELMET ACCENT.", ["helmetStyle", "helmetBase", "helmetAccent"]);
    section("REVIEW & SAVE", "Undo or compare your edits, then name and save this paint job.", [], [historyRow, status, api.nameRow, api.saveRow]);
    // One SPINE TOP selection, divided by purpose rather than a wall of pills.
    const group = api.spineRow.querySelector(".cs-liv-ed-finish"), choices = Array.from(group.querySelectorAll("button"));
    const marks = ["logo", "none", "bigmark", "wordmark", "number"];
    group.replaceChildren();
    for (const [label, accepts] of [
      ["MARKS & IDENTITY", (id) => marks.includes(id)],
      ["FIXED GRAPHICS", (id) => !marks.includes(id) && !LiveryDesign.PATTERNS.includes(id)],
      ["ADJUSTABLE PATTERNS", (id) => LiveryDesign.PATTERNS.includes(id)],
    ]) {
      const labelNode = document.createElement("span"); labelNode.className = "cs-liv-ed-sec";
      labelNode.textContent = label; labelNode.style.flexBasis = "100%"; group.appendChild(labelNode);
      for (const b of choices) if (accepts(b.dataset.csPill.split(":")[1])) group.appendChild(b);
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
