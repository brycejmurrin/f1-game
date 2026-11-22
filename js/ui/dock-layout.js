/* Per-scheme touch-dock offsets. See docs/research/CONTROLS-RESEARCH-2026-09-14.md and docs/notes/SCREEN-LOOKS-STORAGE.md. */
const DockLayout = (function () {
  "use strict";

  const KEY = "dockLayout";
  const SCHEMES = Object.freeze(["tilt", "buttons", "touch"]);
  const SIDES = Object.freeze(["L", "R"]);
  // Stored deltas are fractions of the usable viewport. Actual limits depend
  // on the painted control sizes, home positions, safe insets and handedness.
  const MAX = 1;
  const CONTROL_IDS = ["btn-steer-left", "btn-steer-right", "btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero", "shift-up", "shift-down"];
  const ZERO = Object.freeze({ x: 0, y: 0 });

  function clamp01(n, lo, hi) {
    const v = +n;
    if (!isFinite(v)) return 0;
    return v < lo ? lo : v > hi ? hi : v;
  }
  function clampXY(xy) {
    return {
      x: clamp01(xy && xy.x, -MAX, MAX),
      y: clamp01(xy && xy.y, -MAX, MAX),
    };
  }
  function emptyScheme() { return { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } }; }

  // Auto follows the shipped corner style and is stored as null.
  const SHAPE_KEY = "hudBtnShape";
  const SHAPES = Object.freeze([["auto", "AUTO"], ["round", "ROUND"], ["squircle", "SQUIRCLE"], ["square", "SQUARE"]]);
  function shapeOf(v) { return SHAPES.some((s) => s[0] === v) ? v : "auto"; }
  function applyShape(v) {
    const s = shapeOf(v);
    const root = typeof document !== "undefined" && document.documentElement;
    if (root && root.style) {
      if (s === "auto") root.removeAttribute("data-btn-shape");
      else root.setAttribute("data-btn-shape", s);
    }
    return s;
  }
  /** Pure: the next BUTTON SIZE (%) one toolbar step from `v` — snapped to the 10 % grid, inside [lo, hi]. */
  function sizeStep(v, dir, lo, hi) {
    const n = Number.isFinite(+v) ? +v : 100;
    const next = dir > 0 ? Math.floor(n / 10 + 1e-9) * 10 + 10 : Math.ceil(n / 10 - 1e-9) * 10 - 10;
    return Math.max(lo, Math.min(hi, next));
  }
  function normalize(raw) {
    const out = {};
    for (const s of SCHEMES) {
      const src = raw && raw[s];
      out[s] = emptyScheme();
      if (!src || typeof src !== "object") continue;
      if (Number.isFinite(src.gap)) out[s].gap = clamp01(src.gap, 0, 80);
      if (["pedal-row", "tap-row", "stack"].includes(src.layout)) out[s].layout = src.layout;
      for (const id of CONTROL_IDS) {
        const values = src.controls?.[id];
        if (!values || typeof values !== "object") continue;
        const control = {};
        for (const key of ["size", "width", "height"]) {
          if (Number.isFinite(values[key]) && values[key] !== 100) control[key] = clamp01(values[key], 50, 175);
        }
        const shape = shapeOf(values.shape);
        if (shape !== "auto") control.shape = shape;
        for (const axis of ["x", "y"]) {
          if (Number.isFinite(values[axis]) && values[axis]) control[axis] = clamp01(values[axis], -MAX, MAX);
        }
        if (Object.keys(control).length) (out[s].controls || (out[s].controls = {}))[id] = control;
      }
      for (const side of SIDES) {
        if (src[side] && typeof src[side] === "object") out[s][side] = clampXY(src[side]);
      }
    }
    return out;
  }
  function load(store) {
    const raw = store && store.get ? store.get(KEY, null) : null;
    return normalize(raw);
  }
  function save(store, bag) {
    if (!store || !store.set) return;
    store.set(KEY, normalize(bag));
  }
  function isIdentity(scheme) {
    if (!scheme) return true;
    if (scheme.gap != null || scheme.layout || Object.keys(scheme.controls || {}).length) return false;
    for (const side of SIDES) {
      const p = scheme[side] || ZERO;
      if (Math.abs(p.x) > 1e-6 || Math.abs(p.y) > 1e-6) return false;
    }
    return true;
  }

  // Screen fractions use the layout viewport minus safe insets, independently of pinch zoom.
  function usablePad(root) {
    const cs = root ? getComputedStyle(root) : null;
    const sal = parseFloat(cs && cs.getPropertyValue("--sal")) || 0;
    const sar = parseFloat(cs && cs.getPropertyValue("--sar")) || 0;
    const sat = parseFloat(cs && cs.getPropertyValue("--sat")) || 0;
    const sab = parseFloat(cs && cs.getPropertyValue("--sab")) || 0;
    const de = (typeof document !== "undefined" && document.documentElement) || null;
    const vw = (de && de.clientWidth > 0) ? de.clientWidth : (typeof window !== "undefined" ? window.innerWidth : 390);
    const vh = (de && de.clientHeight > 0) ? de.clientHeight : (typeof window !== "undefined" ? window.innerHeight : 844);
    return { w: Math.max(1, vw - sal - sar), h: Math.max(1, vh - sat - sab), vw, vh, sal, sar, sat, sab };
  }

  // Undo the effective CSS zoom before writing a viewport-pixel translation.
  function zoomOf(el) {
    const z = el && el.currentCSSZoom;
    if (typeof z === "number" && z > 0) return z;
    return (typeof CssZoom !== "undefined" && CssZoom.of) ? CssZoom.of(el) : 1;
  }

  // +x = toward centre from each dock's home edge. MIRROR CONTROLS reverses
  // #hud-dock (row-reverse), so #dock-left then sits on the RIGHT edge.
  function inboard(side) {
    const b = typeof document !== "undefined" && document.body;
    const m = !!(b && b.classList && b.classList.contains("mirror-controls"));
    return (side === "L") !== m ? 1 : -1;
  }

  const translations = new WeakMap();
  const fullRange = () => ({ left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity });
  function intersect(a, b) {
    a.left = Math.max(a.left, b.left); a.right = Math.min(a.right, b.right);
    a.top = Math.max(a.top, b.top); a.bottom = Math.min(a.bottom, b.bottom);
  }
  // Keep the whole button on the display and a 44px target inside the safe
  // area on each axis. A smaller button must remain fully inside that area.
  function limits(pad, r, dx, dy) {
    const left = r.left - dx, right = r.right - dx, top = r.top - dy, bottom = r.bottom - dy;
    const w = Math.min(44, r.width), h = Math.min(44, r.height);
    return {
      left: Math.max(-left, pad.sal + w - right), right: Math.min(pad.vw - right, pad.vw - pad.sar - w - left),
      top: Math.max(-top, pad.sat + h - bottom), bottom: Math.min(pad.vh - bottom, pad.vh - pad.sab - h - top),
    };
  }
  function measurePad(docks) {
    const pad = usablePad(typeof document !== "undefined" ? document.documentElement : null);
    for (const side of SIDES) {
      const el = docks?.[side];
      if (!el) continue;
      const z = zoomOf(el), home = translations.get(el) || ZERO;
      const g = pad[side] = { z, base: fullRange(), drag: fullRange(), controls: {} };
      for (const button of el.querySelectorAll?.(".touchbtn") || []) {
        const bz = zoomOf(button), pos = translations.get(button) || ZERO;
        const entry = g.controls[button.id] = { el: button, z: bz };
        const r = typeof CssZoom !== "undefined" && CssZoom.viewportRect ? CssZoom.viewportRect(button) : button.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
        // Subtract the old CSS translations at TODAY's zoom: size, shape,
        // rotation and a new fit may have changed the untransformed anchor.
        entry.range = limits(pad, r, home.x * z + pos.x * bz, home.y * z + pos.y * bz);
        intersect(g.base, entry.range);
        intersect(g.drag, limits(pad, r, home.x * z, home.y * z));
      }
      intersect(g.drag, g.base);
    }
    return pad;
  }
  function withinRange(value, side, pad, range, group) {
    const p = clampXY(value);
    if (!range) return p;
    const sx = inboard(side) * pad.w, sy = -pad.h;
    const gx = group.x * sx, gy = group.y * sy;
    return {
      x: clamp01(p.x * sx + gx, range.left, range.right) / sx - group.x,
      y: clamp01(p.y * sy + gy, range.top, range.bottom) / sy - group.y,
    };
  }
  function boundedXY(value, side, pad) {
    return withinRange(value, side, pad, pad[side]?.drag, ZERO);
  }
  function boundedControlXY(value, side, pad, id, group) {
    const anchor = withinRange(group, side, pad, pad[side]?.base, ZERO);
    return withinRange(value, side, pad, pad[side]?.controls[id]?.range, anchor);
  }
  function translate(el, x, y, individual) {
    const previous = translations.get(el), property = individual ? "translate" : "transform";
    if (!x && !y) {
      if (previous || el.style[property]) el.style.removeProperty(property);
      translations.delete(el);
    } else {
      const tx = +x.toFixed(1), ty = +y.toFixed(1);
      if (previous && previous.x === tx && previous.y === ty) return;
      translations.set(el, { x: tx, y: ty });
      el.style[property] = individual ? tx + "px " + ty + "px" : "translate(" + tx.toFixed(1) + "px, " + ty.toFixed(1) + "px)";
    }
  }
  // A gesture passes geometry measured at touchdown. Repaint without further
  // layout reads; normal paints re-evaluate bounds after a rotation or refit.
  function apply(schemeName, bag, docks, opts) {
    const scheme = bag?.[schemeName] || emptyScheme();
    if (!opts?.pad) applyControls(scheme, docks);
    const pad = opts?.pad || (!isIdentity(scheme) ? measurePad(docks) : null);
    for (const side of SIDES) {
      const el = docks?.[side];
      if (!el?.style) continue;
      if (!pad) {
        translate(el, 0, 0, false);
        for (const button of el.querySelectorAll?.(".touchbtn") || []) translate(button, 0, 0, true);
        continue;
      }
      const g = pad[side], p = withinRange(scheme[side], side, pad, g?.base, ZERO);
      const sx = inboard(side) * pad.w, sy = -pad.h, z = g?.z || zoomOf(el);
      translate(el, p.x * sx / z, p.y * sy / z, false);
      for (const [id, b] of Object.entries(g?.controls || {})) {
        const value = scheme.controls?.[id];
        // A layout wider than the new viewport cannot fit as one rigid group.
        // Keep each target reachable even when the player only moved its dock.
        const q = withinRange(value, side, pad, b.range, p);
        translate(b.el, q.x * sx / b.z, q.y * sy / b.z, true);
      }
    }
    // The fit (dock cap, --dock-r-w, the radio lane) budgets from the docks'
    // rects; without this it kept the pre-drag boxes for up to 3 s.
    if (opts && opts.fit === false) return;
    if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
  }

  function create(G, uiScale) {
    Log.info("ui", "DockLayout.create");
    const { $, store } = G;
    let toolbar = null, pending = null;
    let bag = load(store);
    let editing = false;

    function schemeOf() {
      const m = (G.getSteerMode && G.getSteerMode()) || "buttons";
      return SCHEMES.indexOf(m) >= 0 ? m : "buttons";
    }
    function docks() {
      return { L: $("dock-left"), R: $("dock-right") };
    }
    function paint(options) { apply(schemeOf(), bag, docks(), options); }
    let shape = applyShape(store && store.get ? store.get(SHAPE_KEY, null) : null);
    function setShape(v) {
      shape = applyShape(v);
      if (!editing && store && store.set) store.set(SHAPE_KEY, shape === "auto" ? null : shape);
      if (typeof SettingRow !== "undefined" && SettingRow.paint && $("pm-btnshape")) SettingRow.paint("pm-btnshape", shape, SHAPES);
      toolbar?.paint();
      if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      return shape;
    }
    function record(id, name = schemeOf()) {
      const scheme = bag[name];
      scheme.controls ||= {};
      return scheme.controls[id] ||= {};
    }
    function commitLayout() {
      if (editing) toolbar.remember();
      else save(store, bag);
      paint();
      G.refreshHud?.(true);
      toolbar?.paint();
    }
    // restore=false when something else opened a dialog while we were editing:
    // stacking SETTINGS back on top of it would show two.
    function setEditing(on, restore, accept = restore !== false) {
      if (on && !toolbar) {
        if (typeof DockToolbar !== "undefined") {
          toolbar = DockToolbar.create(G, { schemeOf, getScheme: () => bag[schemeOf()], commitLayout,
            docks, measurePad, inboard, boundedControlXY, boundedXY, repaintDock: paint, getShape: () => shape, setShape, record,
            refreshScale: () => { uiScale?.applyHudScale(); uiScale?.applyBtnScale(); },
            readLayout: () => normalize(bag), restoreLayout: value => { bag = normalize(value); paint(); },
            close: (accept, restore = true) => setEditing(false, restore, accept) });
        } else {
          if (pending || typeof ScriptLoader === "undefined") return;
          const door = $("pm-dock-reposition"), origin = [$("pmsettings"), $("pausemenu")].find(el => el && !el.hidden);
          const request = ScriptLoader.create().load(["js/ui/dock-toolbar.js"], [], { strict: true });
          pending = request;
          door?.setAttribute("aria-busy", "true");
          request.catch(() => false).then(ok => {
            if (pending !== request) return;
            pending = null;
            door?.removeAttribute("aria-busy");
            if (!ok || typeof DockToolbar === "undefined") {
              Log.warn("ui", "The touch layout editor could not load.");
              G.announce?.("Could not open the touch editor. Tap Reposition Touch Controls to retry.", 3, "coach");
            } else if (!origin || !origin.hidden) setEditing(true);
          });
          return;
        }
      }
      if (!on && pending) { pending = null; $("pm-dock-reposition")?.removeAttribute("aria-busy"); }
      const was = editing;
      if (was && !on) {
        if (accept) {
          if (toolbar.shapeChanged()) store?.set?.(SHAPE_KEY, shape === "auto" ? null : shape);
          if (toolbar.layoutChanged()) save(store, bag);
        } else toolbar.cancel();
      }
      editing = !!on;
      if (typeof document !== "undefined") {
        if (editing) document.body.setAttribute("data-dock-edit", "1");
        else document.body.removeAttribute("data-dock-edit");
      }
      if (editing !== was) toolbar?.show(editing, restore);
      paint();
    }

    // Inject CONTROLS chrome (keeps shellNodes at the ceiling).
    (function ensureControls() {
      if ($("pm-dock-reposition") || typeof document === "undefined") return;
      const mirror = $("pm-mirror");
      const host = mirror && mirror.parentNode;
      if (!host) return;
      const btn = document.createElement("button");
      btn.id = "pm-dock-reposition";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "REPOSITION TOUCH CONTROLS";
      const tip = document.createElement("p");
      tip.className = "adv-help";
      tip.id = "pm-dock-reposition-help";
      tip.textContent = "Drag a group, or tap a button to edit it on its own. In Size & shape, choose Steering buttons for arrow spacing or Driving buttons for layout. Select Gas + Brake or Race actions to move, size and shape that set together. Width and Height change the footprint independently. Size scales the whole control. Undo reverses one edit, Cancel restores this session, and Done keeps it. With a button focused, arrow keys move it 2 px. Hold Shift for 16 px. Reset Dock Layout restores the current steering mode.";
      const reset = document.createElement("button");
      reset.id = "pm-dock-reset";
      reset.type = "button";
      reset.textContent = "RESET DOCK LAYOUT";
      const after = mirror.nextSibling;
      // Insert after the LEFT-HANDED help paragraph when present.
      let anchor = mirror;
      while (anchor && anchor.nextElementSibling && anchor.nextElementSibling.classList
        && anchor.nextElementSibling.classList.contains("adv-help")
        && anchor.nextElementSibling.id !== "pm-calib-help") {
        anchor = anchor.nextElementSibling;
      }
      const next = anchor ? anchor.nextSibling : after;
      host.insertBefore(btn, next);
      host.insertBefore(tip, btn.nextSibling);
      host.insertBefore(reset, tip.nextSibling);
    })();
    // ARRANGE HUD goes under them (or in the HUD details fold); its editor is lazy (arrangeDoor).
    arrangeDoor(G, () => HudArrange.create(G));

    // BUTTON SHAPE row, injected under BUTTON OPACITY (the shell's node count is
    // at its ceiling, so new SETTINGS chrome is built here, like REPOSITION).
    (function ensureShapeRow() {
      if (typeof SettingRow === "undefined" || !SettingRow.build || !SettingRow.wire || typeof document === "undefined") return;
      if (!$("pm-btnshape")) {
        const opacity = $("pm-btnopacity");
        const after = opacity && opacity.closest ? opacity.closest(".tune-row") : null;
        if (!after || !after.parentNode) return;
        const built = SettingRow.build("pm-btnshape", "BUTTON SHAPE", SHAPES);
        const note = document.createElement("p");
        note.className = "adv-help";
        note.id = "pm-btnshape-help";
        note.textContent = "The corners of the pedals, arrows and race buttons. AUTO keeps round taps with squircle pedals. Tap REPOSITION TOUCH CONTROLS to change size and shape on the race screen.";
        after.parentNode.insertBefore(built.row, after.nextSibling);
        after.parentNode.insertBefore(note, built.row.nextSibling);
      }
      SettingRow.wire("pm-btnshape", { values: SHAPES, read: () => shape, write: (v) => setShape(v) });
    })();

    const repoBtn = $("pm-dock-reposition");
    if (repoBtn) repoBtn.onclick = () => {
      setEditing(!editing);
      if (editing && G.announce) G.announce("Drag, size and shape the controls, then DONE.", 3, "coach");
    };
    const resetBtn = $("pm-dock-reset");
    if (resetBtn) resetBtn.onclick = () => {
      const s = schemeOf();
      bag[s] = emptyScheme();
      save(store, bag);
      paint();
      if (G.announce) G.announce("Dock layout reset for " + s.toUpperCase(), 2, "coach");
    };

    function viewportChanged() { if (toolbar?.dragging()) toolbar.cancelDrag(); else paint(); }
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", e => toolbar?.onPointerDown(e), true);
      document.addEventListener("pointermove", e => toolbar?.onPointerMove(e), true);
      document.addEventListener("pointerup", e => toolbar?.onPointerUp(e), true);
      document.addEventListener("pointercancel", e => toolbar?.cancelDrag(e), true);
      document.addEventListener("lostpointercapture", e => toolbar?.cancelDrag(e), true);

    }
    // apply() bakes the fractions into PIXELS of the pad at paint time, so a
    // rotation must repaint: a portrait offset kept its pixels in landscape and
    // pushed the dock off the top (the header promises relative placement).
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("blur", e => toolbar?.cancelDrag(e));
      window.addEventListener("resize", viewportChanged, { passive: true });
      window.addEventListener("orientationchange", viewportChanged, { passive: true });
      if (window.visualViewport && window.visualViewport.addEventListener)
        window.visualViewport.addEventListener("resize", viewportChanged, { passive: true });
    }
    // LEFT-HANDED flips a body class with no resize: repaint or a moved group sits off screen.
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
      let mirrored = inboard("L") < 0;
      new MutationObserver(() => {
        const m = inboard("L") < 0;
        if (m !== mirrored) { mirrored = m; viewportChanged(); }
      }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    // The offset divides by the dock's zoom, which changes at race start with no resize.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { if (!toolbar?.dragging()) paint(); });
      const d = docks();
      for (const side of SIDES) if (d[side]) ro.observe(d[side]);
    }

    // Re-apply when the player switches STEERING INPUT (store.set notifies
    // `{ key }` singular; bulk restore may also send `{ keys }`).
    if (store && store.subscribe) {
      store.subscribe((change) => {
        if (!change) return;
        if (change.key === SHAPE_KEY || (Array.isArray(change.keys) && change.keys.includes(SHAPE_KEY))) {
          const v = shapeOf(store.get(SHAPE_KEY, null));
          if (v !== shape) setShape(v);
        }
        const hit = (k) => k === "steerMode" || k === KEY;
        if (hit(change.key) || change.keys?.some(hit)) {
          toolbar?.cancelDrag();
          bag = load(store);
          paint();
          toolbar?.paint();
        }
      });
    }

    paint();
    return {
      apply: paint,
      editing: () => editing,
      setEditing,
      bag: () => normalize(bag),
      schemeOf,
      resetCurrent: () => { bag[schemeOf()] = emptyScheme(); save(store, bag); paint(); },
      shape: () => shape,
      setShape,
    };
  }

  // Read preferences on a layout change. The drag path only updates translations.
  function applyControls(scheme, docks) {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    function attr(el, key, value) {
      if (!el?.getAttribute || el.getAttribute(key) === value) return;
      if (value === null) el.removeAttribute(key);
      else el.setAttribute(key, value);
    }
    function prop(el, key, value) {
      if (!el?.style?.getPropertyValue || el.style.getPropertyValue(key) === value) return;
      if (value) el.style.setProperty(key, value);
      else el.style.removeProperty(key);
    }
    const custom = !isIdentity(scheme) || document.body?.hasAttribute?.("data-dock-edit");
    for (const dock of Object.values(docks || {})) {
      attr(dock, "data-drive-layout", scheme.layout || null);
      attr(dock, "data-dock-custom", custom ? "" : null);
    }
    const steer = document.getElementById("grp-steer");
    attr(steer, "data-steer-gap", scheme.gap == null ? null : "");
    prop(steer, "--steer-gap", scheme.gap == null ? "" : scheme.gap + "px");
    for (const el of document.querySelectorAll(".dock-grp .touchbtn")) {
      const control = scheme.controls?.[el.id];
      prop(el, "--control-scale", control?.size ? String(control.size / 100) : "");
      for (const axis of ["width", "height"]) {
        prop(el, "--control-" + axis, control?.[axis] ? String(control[axis] / 100) : "");
      }
      attr(el, "data-control-dimensions", control?.width || control?.height ? "" : null);
      attr(el, "data-control-size", control?.size ? "" : null);
      attr(el, "data-control-shape", control?.shape || null);
    }
  }

  /** ARRANGE HUD's pause-card door (create() opens it). js/ui/hud-arrange.js is LAZY_UI_PRESETS: the first
   *  tap loads it with the HUD customization policy, calls make() (HudArrange.create(G)) once and opens the editor; a failed load logs and
   *  the next tap retries. */
  function arrangeDoor(G, make) {
    const { $ } = G;
    if (typeof document === "undefined" || $("pm-hud-arrange")) return null;
    const hudHost = $("pm-hud-details");
    const anchor = hudHost ? $("pm-hud-details-sum") : ($("pm-dock-reset") || $("pm-dock-reposition-help") || $("pm-mirror"));
    const host = anchor && anchor.parentNode;
    if (!host) return null;
    const btn = document.createElement("button");
    btn.id = "pm-hud-arrange";
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "ARRANGE HUD";
    const tip = document.createElement("p");
    tip.className = "adv-help";
    tip.id = "pm-hud-arrange-help";
    tip.textContent = "Choose a readout to show, hide, move or resize. AUTO follows the camera and HUD style. Drag to move; pinch or use − / + to size. Red outlines mark overlaps. Positions are saved per HUD STYLE and camera set.";
    let editor = null, load = null;
    const ready = () => typeof HudArrange !== "undefined" ? Promise.resolve(true)
      : typeof ScriptLoader === "undefined" ? Promise.resolve(false)
      : ScriptLoader.create().load(["js/ui/hud-arrange.js"], [], { strict: true });
    btn.onclick = () => {
      if (editor) { editor.setEditing(!editor.isEditing()); return; }
      if (load) return;
      btn.setAttribute("aria-busy", "true");
      const policy = typeof HudLayout !== "undefined" && HudLayout.ensureEditor ? HudLayout.ensureEditor() : true;
      load = Promise.all([ready(), policy]).catch(() => [false]).then(results => {
        const ok = results.every(Boolean);
        load = null;
        btn.removeAttribute("aria-busy");
        editor = ok && typeof HudArrange !== "undefined" ? make() : null;
        if (editor) editor.setEditing(true);
        else Log.warn("ui", "the ARRANGE HUD editor did not load — the next tap retries");
      });
    };
    host.insertBefore(btn, anchor.nextSibling);
    host.insertBefore(tip, btn.nextSibling);
    return btn;
  }

  return Object.freeze({
    KEY, SCHEMES, SIDES, MAX, SHAPE_KEY, SHAPES, arrangeDoor,
    clampXY, normalize, load, save, apply, isIdentity, emptyScheme, usablePad, create, shapeOf, applyShape, sizeStep,
  });
})();
