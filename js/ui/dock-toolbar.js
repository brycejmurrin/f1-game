/* Live touch layout toolbar, loaded on the first edit. */
const DockToolbar = (() => {
  "use strict";
  function create(G, { schemeOf, getScheme, commitLayout, docks, measurePad, inboard, boundedControlXY, boundedXY, repaintDock, getShape, setShape, record, refreshScale, readLayout, restoreLayout, close }) {
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
    let initial, current;
    const history = [];
    const scaleKeys = ["hudScale", "hudBtnScale", "hudBotKeep"];
    const snapshot = () => ({ layout: readLayout(), shape: getShape(), scales: Object.fromEntries(scaleKeys.map(key => [key, G.store?.get(key, null)])) });
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function remember() {
      const next = snapshot();
      if (equal(next, current)) return;
      history.push(current);
      if (history.length > 50) history.shift();
      current = next;
    }
    function restore(state) {
      restoreLayout(state.layout);
      if (state.shape !== getShape()) setShape(state.shape);
      const scale = state.scales;
      const changed = scaleKeys.filter(key => !equal(G.store?.get(key, null), scale[key]));
      if (changed.includes("hudScale")) G.store?.set("hudScale", scale.hudScale);
      if (changed.includes("hudBtnScale")) G.store?.set("hudBtnScale", scale.hudBtnScale);
      if (changed.includes("hudBotKeep")) G.store?.set("hudBotKeep", scale.hudBotKeep);
      if (changed.length) refreshScale();
      current = state;
      G.refreshHud?.(true);
      paintBar();
    }
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
      remember();
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
      field("undo").hidden = !expanded;
      field("undo").disabled = !history.length;
      field("cancel").hidden = !expanded;
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
      for (const axis of ["width", "height"]) {
        const selector = field(axis);
        selector.hidden = !expanded || !ids.length;
        const pct = same(axis, 100);
        const value = pct == null ? "" : String(pct);
        if (selector.options && !Array.from(selector.options).some(option => option.value === value)) {
          const option = document.createElement("option");
          option.value = value; option.textContent = axis + " " + pct + "%"; selector.appendChild(option);
        }
        selector.value = value;
      }
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
      for (const axis of ["width", "height"]) {
        const label = axis === "width" ? "Width" : "Height";
        const choices = [50, 60, 70, 75, 80, 90, 100, 110, 120, 125, 130, 140, 150, 160, 175];
        select(axis, label + " of selected buttons", [["", label + " mixed"], ...choices.map(v => [String(v), label + " " + v + "%"])], value => {
          if (!value) { paintBar(); return; }
          for (const id of targetButtons()) record(id)[axis] = Number(value);
          commitLayout();
        });
      }
      mk("undo", "Undo", "Undo last touch layout edit", () => { if (history.length) restore(history.pop()); });
      mk("cancel", "Cancel", "Discard touch layout edits", () => close(false));
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
        if (target === "all") { setShape(next); remember(); paintBar(); return; }
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
    // During a drag: pad cached at pointerdown, fit invalidated once per frame.
    let fitRaf = 0;
    function fitNow() {
      fitRaf = 0;
      if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
    }
    function paintDrag(pad) {
      repaintDock({ pad, fit: false });
      if (fitRaf) return;
      if (typeof requestAnimationFrame === "function") fitRaf = requestAnimationFrame(fitNow);
      else fitNow();
    }
    let drag = null;
    function onPointerDown(e) {
      if (!visible) return;
      const t = e.target;
      if (!t || !t.closest) return;
      const left = $("dock-left"), right = $("dock-right");
      const side = (left && left.contains(t)) ? "L" : (right && right.contains(t)) ? "R" : null;
      if (!side) return;
      // The press is the drag's, not the button's: preventDefault alone let
      // GAS's own pointerdown run, which flips THROTTLE = LATCH (and fires
      // BOOST/OT/AERO taps), so RESUME launched the car. Document capture runs
      // before the target, so stopping here means the button never sees it.
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (drag || e.isPrimary === false) return;
      const scheme = getScheme();
      const hit = t.closest(".touchbtn")?.id;
      const pad = measurePad(docks()), before = scheme[side];
      drag = {
        side, hit, buttons: buttonDrag(hit, side, pad), before, moved: false,
        startX: e.clientX, startY: e.clientY, orig: boundedXY(before, side, pad),
        scheme, pid: e.pointerId, pad,
      };
      try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    }
    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const pad = drag.pad;
      const sx = inboard(drag.side);
      const dx = ((e.clientX - drag.startX) / pad.w) * sx;
      const dy = -((e.clientY - drag.startY) / pad.h);
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3) return;
      drag.moved = true;
      if (drag.buttons) drag.buttons.move(dx, dy);
      else drag.scheme[drag.side] = boundedXY({ x: drag.orig.x + dx, y: drag.orig.y + dy }, drag.side, pad);
      paintDrag(pad);
    }
    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const finished = drag;
      drag = null;
      if (finished.moved) { remember(); paintBar(); }
      else pick(finished.hit, true);
      fitNow();
    }
    function cancelDrag(e) {
      if (!drag || (e?.pointerId != null && drag.pid !== e.pointerId)) return;
      if (drag.buttons) drag.buttons.cancel();
      else drag.scheme[drag.side] = drag.before;
      drag = null;
      repaintDock();
    }
    function show(on, restore) {
      if (!on) drag = null;
      visible = on;
      if (on) { initial = current = snapshot(); history.length = 0; target = "all"; expanded = false; ensureDone(); hideDialogs(); }
      else if (restore === false) shown = null;
      else restoreDialogs();
      if (editBar) { editBar.hidden = !on; paintBar(); }
      if (on) toolsButton?.focus?.({ preventScroll: true });
      const btn = $("pm-dock-reposition");
      if (btn) {
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = on ? "DONE REPOSITIONING" : "REPOSITION TOUCH CONTROLS";
        if (!on && restore !== false && btn.focus) btn.focus();
      }
      if (!on) {
        // A mid-drag fit frame must not fire after DONE/Escape ends editing.
        if (fitRaf) {
          if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(fitRaf);
          fitRaf = 0;
        }
      }
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
      // Edit mode hides SETTINGS and PAUSED itself and ends on DONE or Escape.
      // What still ends it: ANY of them being opened by someone else (the pause
      // button, a key, QUIT), because a capture-phase drag left live would slide
      // the dock under the thumb on every throttle/steer press in the race.
      const watched = [$("pmsettings"), $("pausemenu")].filter(Boolean);
      if (watched.length && typeof MutationObserver !== "undefined") {
        const mo = new MutationObserver(() => {
          // Async: by the time this runs our own hide has settled (both hidden), so
          // "something is visible" can only mean someone else opened it.
          if (visible && watched.some((e) => !e.hidden)) close(false, false);
        });
        for (const e of watched) mo.observe(e, { attributes: true, attributeFilter: ["hidden"] });
      }

      document.addEventListener("keydown", (e) => {
        if (!visible) return;
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation(); close(false);
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
    return { show, paint: paintBar, onPointerDown, onPointerMove, onPointerUp, cancelDrag, dragging: () => !!drag, remember, cancel: () => restore(initial),
      shapeChanged: () => getShape() !== initial.shape, layoutChanged: () => !equal(readLayout(), initial.layout) };
  }
  return Object.freeze({ create });
})();
Object.freeze(DockToolbar);
