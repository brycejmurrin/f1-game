/* Live touch layout toolbar, loaded on the first edit. */
const DockToolbar = (() => {
  "use strict";
  function create(G, { schemeOf, getScheme, commitLayout, docks, measurePad, inboard, boundedControlXY, getShape, setShape, record, close }) {
    const { $ } = G;
    const { sizeStep, SHAPES } = DockLayout;
    const labels = {
      "btn-steer-left": "Left arrow", "btn-steer-right": "Right arrow", "btn-throttle": "Gas", "btn-brake": "Brake",
      "btn-boost": "Boost", "btn-ot": "Overtake", "btn-aero": "Active aero",
      "shift-up": "Shift up", "shift-down": "Shift down",
    };
    const pedals = ["btn-throttle", "btn-brake"], actions = ["btn-boost", "btn-ot", "btn-aero"];
    const targets = { steer: ["btn-steer-left", "btn-steer-right"], drive: [...pedals, ...actions], pedals, actions };
    // The controls are static shell nodes. Reparenting a group for a new steering scheme retains them.
    const controls = [$("btn-steer-left"), $("btn-steer-right"), $("btn-throttle"), $("btn-brake"),
      $("btn-boost"), $("btn-ot"), $("btn-aero"), $("shift-up"), $("shift-down")];
    const byId = new Map(controls.filter(Boolean).map(node => [node.id, node]));
    let target = "all", shown = null;
    let editBar = null, doneBtn = null, toolsButton = null, expanded = false, visible = false;
    function targetButtons() { return targets[target] || (labels[target] ? [target] : []); }
    function stepSize(dir) {
      if (target !== "all") {
        for (const id of targetButtons()) {
          const button = record(id);
          button.size = sizeStep(button.size || 100, dir, 50, 175);
        }
        commitLayout();
        return;
      }
      const el = $("pm-btnscale");
      if (!el) return;
      el.value = String(sizeStep(+el.value, dir, +el.min || 40, +el.max || 300));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      // The editor runs over a PAUSED race, where the HUD tick returns before
      // the fit: force one so the dock caps (and repaints) at the new size now,
      // then re-run the slider's paint so its "fits N%" reads the fresh cap.
      if (G.refreshHud) G.refreshHud(true);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      paintBar();
    }
    function paintBar() {
      if (!editBar) return;
      toolsButton.setAttribute("aria-expanded", String(expanded));
      toolsButton.textContent = expanded ? "Hide tools" : "Size & shape";
      const field = key => editBar.querySelector("[data-k=" + key + "]");
      const scheme = getScheme();
      const options = field("target").options || [];
      for (const option of options) {
        const node = byId.get(option.value);
        option.hidden = labels[option.value] ? !node || node.hidden || node.parentElement?.hidden
          : option.value === "steer" && schemeOf() !== "buttons";
      }
      if (Array.from(options).some(option => option.value === target && option.hidden)) target = "all";
      const ids = targetButtons();
      for (const k of ["smaller", "size", "bigger", "shape", "target"]) field(k).hidden = !expanded;
      field("gap").hidden = !expanded || target !== "steer";
      field("layout").hidden = !expanded || target !== "drive";
      field("reset").hidden = !expanded || target === "all";
      field("target").value = target;
      const gap = field("gap"), value = scheme.gap == null ? "" : String(scheme.gap);
      if (gap.options && !Array.from(gap.options).some(option => option.value === value)) {
        const option = document.createElement("option");
        option.value = value; option.textContent = "Arrow gap: " + value + " px"; gap.appendChild(option);
      }
      gap.value = value;
      field("layout").value = scheme.layout || "";
      const same = (key, fallback) => {
        const values = ids.map(id => scheme.controls?.[id]?.[key] || fallback);
        return values.every(value => value === values[0]) ? values[0] : null;
      };
      const size = same("size", 100), buttonShape = same("shape", "auto");
      const out = $("pm-btnscale-v");
      field("size").textContent = target === "all" ? "SIZE " + (out?.textContent || "") : size == null ? "Mixed sizes" : size + "%";
      field("shape").textContent = "Shape: " + (target === "all" ? getShape() : buttonShape === "auto" ? "Default" : buttonShape || "Mixed");
      for (const id of Object.keys(labels)) {
        const el = byId.get(id);
        if (el && visible && ids.includes(id)) el.setAttribute("data-dock-selected", "");
        else el?.removeAttribute("data-dock-selected");
      }
    }
    // The editor's floating toolbar: SIZE − / + and SHAPE change the controls
    // in place, on the race HUD, while the player can see them (the SETTINGS
    // rows are hidden during the edit). DONE keeps its id and label.
    function ensureDone() {
      if (doneBtn || typeof document === "undefined" || !document.createElement || !document.body || !document.body.appendChild) return;
      editBar = document.createElement("div");
      editBar.id = "dock-edit-bar";
      editBar.setAttribute("role", "toolbar");
      editBar.setAttribute("aria-label", "Touch controls");
      const mk = (k, label, aria, onclick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.k = k;
        b.textContent = label;
        if (aria) b.setAttribute("aria-label", aria);
        b.onclick = onclick;
        editBar.appendChild(b);
        return b;
      };
      toolsButton = mk("tools", "Size & shape", "", () => { expanded = !expanded; paintBar(); });
      doneBtn = mk("done", "Done", "Done repositioning touch controls", () => close());
      doneBtn.id = "dock-edit-done";
      function select(key, aria, choices, change) {
        const sel = document.createElement("select");
        sel.dataset.k = key;
        sel.setAttribute("aria-label", aria);
        for (const [value, text] of choices) {
          const option = document.createElement("option");
          option.value = value; option.textContent = text; sel.appendChild(option);
        }
        sel.onchange = () => change(sel.value);
        editBar.appendChild(sel);
      }
      select("target", "Edit control or group", [["all", "All buttons"], ["steer", "Steering buttons"], ["drive", "Driving buttons"], ["pedals", "Gas + Brake"], ["actions", "Race actions"], ...Object.entries(labels)], value => {
        target = value; paintBar();
      });
      select("gap", "Distance between steering arrows", [["", "Arrow gap: Auto"], ...[0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80].map(px => [String(px), "Arrow gap: " + px + " px"])], value => {
        if (value === "") delete getScheme().gap; else getScheme().gap = Number(value);
        commitLayout();
      });
      select("layout", "Driving button layout", [["", "Layout: Auto"], ["pedal-row", "Pedals side by side"], ["tap-row", "Actions side by side"], ["stack", "Two rows"]], value => {
        if (value) getScheme().layout = value; else delete getScheme().layout;
        commitLayout();
      });
      mk("smaller", "−", "Smaller buttons", () => stepSize(-1));
      // The readout is text, not a control: a disabled button paints see-through
      // over the timing tower (measured 844x390), so it is an opaque span.
      const size = document.createElement("span");
      size.dataset.k = "size";
      size.setAttribute("aria-live", "polite");
      editBar.appendChild(size);
      mk("bigger", "+", "Bigger buttons", () => stepSize(1));
      mk("shape", "SHAPE", "Next button shape", () => {
        const ids = targetButtons();
        const current = target === "all" ? getShape() : getScheme().controls?.[ids[0]]?.shape || "auto";
        const next = SHAPES[(SHAPES.findIndex(([s]) => s === current) + 1) % SHAPES.length][0];
        if (target === "all") return setShape(next);
        for (const id of ids) record(id).shape = next;
        commitLayout();
      });
      mk("reset", "Reset selection", "", () => {
        const scheme = getScheme();
        for (const id of targetButtons()) if (scheme.controls) delete scheme.controls[id];
        if (target === "steer" || target === "drive") {
          const selected = targetButtons();
          for (const [side, dock] of Object.entries(docks())) {
            const offset = scheme[side];
            if (!offset.x && !offset.y) continue;
            const members = controls.filter(el => el && !el.hidden && dock?.contains(el));
            if (!members.some(el => selected.includes(el.id))) continue;
            // A manual-shift cluster may share a dock with race actions.
            // Preserve those other buttons when restoring the selected group.
            for (const el of members.filter(el => !selected.includes(el.id))) {
              const own = record(el.id);
              own.x = (own.x || 0) + offset.x;
              own.y = (own.y || 0) + offset.y;
            }
            scheme[side] = { x: 0, y: 0 };
          }
        }
        if (target === "steer") delete scheme.gap;
        if (target === "drive") delete scheme.layout;
        commitLayout();
      });
      editBar.hidden = true;
      document.body.appendChild(editBar);
    }
    function hideDialogs() {
      const settings = $("pmsettings"), pause = $("pausemenu");
      shown = { settings: !!settings && !settings.hidden, pause: !!pause && !pause.hidden };
      if (settings) settings.hidden = true;
      if (pause) pause.hidden = true;
    }
    function restoreDialogs() {
      const settings = $("pmsettings"), pause = $("pausemenu"), was = shown;
      shown = null;
      if (!was) return;
      if (was.settings && settings) settings.hidden = false;
      if (was.pause && pause) pause.hidden = false;
    }
    function show(on, restore) {
      visible = on;
      if (on) { target = "all"; expanded = false; ensureDone(); hideDialogs(); }
      else if (restore === false) shown = null;
      else restoreDialogs();
      if (editBar) { editBar.hidden = !on; paintBar(); }
      if (on) toolsButton?.focus?.({ preventScroll: true });
    }
    function pick(id, expand) {
      if (!labels[id]) return;
      if (target === id && !expand) return;
      target = id;
      if (expand) expanded = true;
      paintBar();
    }
    // A subset uses the ordinary per-button records. Constrain one shared movement
    // by every member's available travel, so the pair/column keeps its spacing at an edge.
    function buttonDrag(hit, side, pad) {
      if (!labels[hit]) return null;
      const subset = target === "pedals" || target === "actions";
      if (!subset && !labels[target]) return null;
      const ids = subset && targets[target].includes(hit) ? targets[target] : [hit];
      if (ids.length === 1) pick(hit, false);
      const scheme = getScheme(), name = schemeOf(), group = scheme[side];
      const members = ids.map(id => {
        const old = scheme.controls?.[id];
        return { id, old: old && { ...old }, origin: boundedControlXY(old, side, pad, id, group) };
      });
      return {
        move(dx, dy) {
          for (const { id, origin } of members) {
            const p = boundedControlXY({ x: origin.x + dx, y: origin.y + dy }, side, pad, id, group);
            dx = p.x - origin.x; dy = p.y - origin.y;
          }
          for (const { id, origin } of members) Object.assign(record(id, name), { x: origin.x + dx, y: origin.y + dy });
        },
        cancel() {
          for (const { id, old } of members) {
            if (old) scheme.controls[id] = old;
            else if (scheme.controls) delete scheme.controls[id];
          }
        },
      };
    }
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("click", e => {
        if (!visible) return;
        const id = e.target.closest?.(".touchbtn")?.id;
        if (!labels[id]) return;
        e.preventDefault(); e.stopImmediatePropagation();
        // Keyboard / assistive activation selects; a pointer's tap or drag was handled on release.
        if (e.detail === 0) pick(id, true);
      }, true);
      document.addEventListener("keydown", (e) => {
        if (!visible) return;
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation(); close();
          return;
        }
        const el = e.target?.closest?.(".touchbtn");
        if (!labels[el?.id]) return;
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
        const dir = directions[e.key];
        if (!dir && e.key !== " " && e.key !== "Enter") return;
        e.preventDefault(); e.stopImmediatePropagation();
        pick(el.id, true);
        if (!dir) return;
        const d = docks(), side = d.L?.contains(el) ? "L" : "R";
        const pad = measurePad(d), group = getScheme()[side], current = record(el.id);
        const position = boundedControlXY(current, side, pad, el.id, group), step = e.shiftKey ? 16 : 2;
        position.x += dir[0] * inboard(side) * step / pad.w;
        position.y += dir[1] * step / pad.h;
        Object.assign(current, boundedControlXY(position, side, pad, el.id, group));
        commitLayout();
      }, true);
    }
    return { show, paint: paintBar, pick, buttonDrag };
  }
  return Object.freeze({ create });
})();
Object.freeze(DockToolbar);
