/* Apex 26 — DockLayout: per-scheme touch-dock REPOSITION offsets.
   Offsets are fractions of the usable pad (viewport minus safe-area insets),
   so orientation changes keep relative placement. Edit mode starts from SETTINGS,
   hides the modal dialogs so the docks can be dragged, and ends on DONE / Escape;
   apply() writes translate() on #dock-left / #dock-right. Plan slice 2:
   docs/research/CONTROLS-RESEARCH-2026-09-14.md §2 items 2 and 6. */
const DockLayout = (function () {
  "use strict";

  const KEY = "dockLayout";
  const SCHEMES = Object.freeze(["tilt", "buttons", "touch"]);
  const SIDES = Object.freeze(["L", "R"]);
  // Max travel from the default corner — enough to clear a thumb, not enough
  // to park a primary control under the notch or off-screen.
  const MAX = 0.35;
  const ZERO = Object.freeze({ x: 0, y: 0 });

  function clamp01(n, lo, hi) {
    const v = +n;
    if (!isFinite(v)) return 0;
    return v < lo ? lo : v > hi ? hi : v;
  }
  // +x is inboard from the dock's home edge; +y is up from the bottom (apply).
  // The home IS the safe-area edge, so an offset only moves a dock inboard or up: [0, MAX]. A negative share
  // translated the dock past the screen edge or under the home bar (cda4027e3 allowed ±MAX for "a pack nudge",
  // but the REPOSITION drag is the only writer — HUD review 2026-10-14). Past MAX still clips.
  function clampXY(xy) {
    return {
      x: clamp01(xy && xy.x, 0, MAX),
      y: clamp01(xy && xy.y, 0, MAX),
    };
  }
  function emptyScheme() { return { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } }; }

  // BUTTON SHAPE: one corner style for every touch control. AUTO is the shipped
  // mix (round taps and arrows, squircle pedals) and is stored as null, so the
  // default can move without a migration. css/overlays.css reads the attribute.
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
    for (const side of SIDES) {
      const p = scheme[side] || ZERO;
      if (Math.abs(p.x) > 1e-6 || Math.abs(p.y) > 1e-6) return false;
    }
    return true;
  }

  /** Usable pad size in CSS px (visible viewport minus safe-area insets).
      visualViewport is the area not covered by browser chrome; innerWidth
      stays the layout viewport and overstates the pad while a toolbar is up. */
  function usablePad(root) {
    const cs = root ? getComputedStyle(root) : null;
    const sal = parseFloat(cs && cs.getPropertyValue("--sal")) || 0;
    const sar = parseFloat(cs && cs.getPropertyValue("--sar")) || 0;
    const sat = parseFloat(cs && cs.getPropertyValue("--sat")) || 0;
    const sab = parseFloat(cs && cs.getPropertyValue("--sab")) || 0;
    const vv = (typeof window !== "undefined" && window.visualViewport) || null;
    const vw = (vv && +vv.width > 0) ? +vv.width : (typeof window !== "undefined" ? window.innerWidth : 390);
    const vh = (vv && +vv.height > 0) ? +vv.height : (typeof window !== "undefined" ? window.innerHeight : 844);
    return { w: Math.max(1, vw - sal - sar), h: Math.max(1, vh - sat - sab) };
  }

  // The dock carries `zoom: var(--hud-z-dock, …)` (css/touch-controls.css), and
  // zoom multiplies a translate: a pad-pixel offset written as-is lands at
  // px × zoom (off-screen at BUTTON SIZE 300%, and a saved dock moves when the
  // size changes). currentCSSZoom is the EFFECTIVE zoom (ancestors included),
  // which is what scales this element's own lengths.
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

  function apply(schemeName, bag, docks) {
    const scheme = (bag && bag[schemeName]) || emptyScheme();
    const root = (typeof document !== "undefined") ? document.documentElement : null;
    const pad = usablePad(root);
    for (const side of SIDES) {
      const el = docks && docks[side];
      if (!el || !el.style) continue;
      const p = clampXY(scheme[side] || ZERO);
      if (Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6) {
        el.style.removeProperty("transform");
        continue;
      }
      // +x = inboard (inboard() above); +y = up from the bottom.
      const sx = inboard(side);
      const z = zoomOf(el);
      const tx = (p.x * pad.w * sx / z).toFixed(1);
      const ty = (-p.y * pad.h / z).toFixed(1);
      el.style.transform = "translate(" + tx + "px, " + ty + "px)";
    }
    // The fit (dock cap, --dock-r-w, the radio lane) budgets from the docks'
    // rects; without this it kept the pre-drag boxes for up to 3 s.
    if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
  }

  function create(G) {
    Log.info("ui", "DockLayout.create");
    const { $, store } = G;
    let bag = load(store);
    let editing = false;
    let drag = null;   // { side, startX, startY, orig }

    function schemeOf() {
      const m = (G.getSteerMode && G.getSteerMode()) || "buttons";
      return SCHEMES.indexOf(m) >= 0 ? m : "buttons";
    }
    function docks() {
      return { L: $("dock-left"), R: $("dock-right") };
    }
    function paint() { apply(schemeOf(), bag, docks()); }
    // REPOSITION needs the docks reachable. #pmsettings and #pausemenu are
    // showModal() dialogs (TopModal), so while either is open the rest of the
    // document, #dock-left/#dock-right included, is inert and a drag never
    // starts. Entering therefore hides both (the title editor does the same
    // with page(false)) and a floating DONE ends it; Escape does too. `shown`
    // remembers what WE hid, so leaving restores exactly that and nothing else.
    let shown = null;      // { settings, pause } — hidden by us on entry
    let doneBtn = null;
    let editBar = null;    // the floating SIZE / SHAPE / DONE toolbar
    let shape = applyShape(store && store.get ? store.get(SHAPE_KEY, null) : null);
    function setShape(v) {
      shape = applyShape(v);
      if (store && store.set) store.set(SHAPE_KEY, shape === "auto" ? null : shape);
      if (typeof SettingRow !== "undefined" && SettingRow.paint && $("pm-btnshape")) SettingRow.paint("pm-btnshape", shape, SHAPES);
      paintBar();
      if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      return shape;
    }
    // SIZE steps drive the SETTINGS slider itself (its input handler stores,
    // clamps and applies in js/ui/scale.js), so there is one writer of BUTTON SIZE.
    function stepSize(dir) {
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
      const out = $("pm-btnscale-v");
      editBar.querySelector("[data-k=size]").textContent = "SIZE " + ((out && out.textContent) || "");
      editBar.querySelector("[data-k=shape]").textContent = "SHAPE: " + SHAPES.find((s) => s[0] === shape)[1];
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
    // The editor's floating toolbar: SIZE − / + and SHAPE change the controls
    // in place, on the race HUD, while the player can see them (the SETTINGS
    // rows are hidden during the edit). DONE keeps its id and label.
    function ensureDone() {
      if (doneBtn || typeof document === "undefined" || !document.createElement || !document.body || !document.body.appendChild) return;
      editBar = document.createElement("div");
      editBar.id = "dock-edit-bar";
      editBar.setAttribute("role", "toolbar");
      editBar.setAttribute("aria-label", "Touch controls");
      // Inline: the shell and stylesheets are not this module's to edit, and the
      // bar exists only while editing. Top-centre keeps both docks clear.
      editBar.style.cssText = "position:fixed;top:calc(8px + var(--sat,0px));left:50%;transform:translateX(-50%);" +
        "z-index:9999;display:flex;gap:6px;align-items:center;white-space:nowrap;";
      const mk = (k, label, aria, onclick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.k = k;
        b.textContent = label;
        if (aria) b.setAttribute("aria-label", aria);
        b.style.cssText = "min-width:44px;min-height:44px;padding:0 12px;font:inherit;font-weight:700;" +
          "background:var(--bg,#111);color:var(--text,#fff);border:2px solid var(--text,#fff);border-radius:8px;";
        b.onclick = onclick;
        editBar.appendChild(b);
        return b;
      };
      mk("smaller", "−", "Smaller buttons", () => stepSize(-1));
      // The readout is text, not a control: a disabled button paints see-through
      // over the timing tower (measured 844x390), so it is an opaque span.
      const size = document.createElement("span");
      size.dataset.k = "size";
      size.setAttribute("aria-live", "polite");
      size.style.cssText = "padding:0 10px;line-height:40px;font-weight:700;background:var(--bg,#111);color:var(--text,#fff);border-radius:8px;";
      editBar.appendChild(size);
      mk("bigger", "+", "Bigger buttons", () => stepSize(1));
      mk("shape", "SHAPE", "Next button shape", () => {
        const i = SHAPES.findIndex((s) => s[0] === shape);
        setShape(SHAPES[(i + 1) % SHAPES.length][0]);
      });
      doneBtn = mk("done", "DONE", "Done repositioning touch controls", () => setEditing(false));
      doneBtn.id = "dock-edit-done";
      doneBtn.style.minWidth = "96px";
      editBar.hidden = true;
      document.body.appendChild(editBar);
    }
    // restore=false when something else opened a dialog while we were editing:
    // stacking SETTINGS back on top of it would show two.
    function setEditing(on, restore) {
      const was = editing;
      editing = !!on;
      if (typeof document !== "undefined") {
        if (editing) document.body.setAttribute("data-dock-edit", "1");
        else document.body.removeAttribute("data-dock-edit");
      }
      if (editing && !was) { ensureDone(); hideDialogs(); }
      if (!editing && was) { if (restore === false) shown = null; else restoreDialogs(); }
      if (editBar) { editBar.hidden = !editing; if (editing) paintBar(); }
      const btn = $("pm-dock-reposition");
      if (btn) {
        btn.setAttribute("aria-pressed", editing ? "true" : "false");
        btn.textContent = editing ? "DONE REPOSITIONING" : "REPOSITION TOUCH CONTROLS";
        if (was && !editing && restore !== false && btn.focus) btn.focus();
      }
      if (!editing) drag = null;
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
      tip.textContent = "Drag the on-screen pedal and steer groups. Layout is saved per STEERING INPUT (tilt, buttons, touch). RESET clears only the current scheme.";
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

    function onPointerDown(e) {
      if (!editing) return;
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
      const s = schemeOf();
      drag = {
        side,
        startX: e.clientX, startY: e.clientY,
        orig: Object.assign({}, bag[s][side]),
        scheme: s,
        pid: e.pointerId,
      };
      try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    }
    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const pad = usablePad(document.documentElement);
      const sx = inboard(drag.side);
      const dx = ((e.clientX - drag.startX) / pad.w) * sx;
      const dy = -((e.clientY - drag.startY) / pad.h);
      bag[drag.scheme][drag.side] = clampXY({
        x: drag.orig.x + dx,
        y: drag.orig.y + dy,
      });
      paint();
    }
    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      save(store, bag);
      drag = null;
    }
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("pointercancel", onPointerUp, true);
      // Edit mode hides SETTINGS and PAUSED itself and ends on DONE or Escape.
      // What still ends it: ANY of them being opened by someone else (the pause
      // button, a key, QUIT), because a capture-phase drag left live would slide
      // the dock under the thumb on every throttle/steer press in the race.
      const watched = [$("pmsettings"), $("pausemenu")].filter(Boolean);
      if (watched.length && typeof MutationObserver !== "undefined") {
        const mo = new MutationObserver(() => {
          // Async: by the time this runs our own hide has settled (both hidden), so
          // "something is visible" can only mean someone else opened it.
          if (editing && watched.some((e) => !e.hidden)) setEditing(false, false);
        });
        for (const e of watched) mo.observe(e, { attributes: true, attributeFilter: ["hidden"] });
      }
      document.addEventListener("keydown", (e) => {
        if (!editing || e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();   // Input's Escape would otherwise toggle pause under the editor
        setEditing(false);
      }, true);
    }
    // apply() bakes the fractions into PIXELS of the pad at paint time, so a
    // rotation must repaint: a portrait offset kept its pixels in landscape and
    // pushed the dock off the top (the header promises relative placement).
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", paint, { passive: true });
      window.addEventListener("orientationchange", paint, { passive: true });
      if (window.visualViewport && window.visualViewport.addEventListener)
        window.visualViewport.addEventListener("resize", paint, { passive: true });
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
        if (hit(change.key)) { bag = load(store); paint(); return; }
        if (Array.isArray(change.keys) && change.keys.some(hit)) {
          bag = load(store);
          paint();
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

  return Object.freeze({
    KEY, SCHEMES, SIDES, MAX, SHAPE_KEY, SHAPES,
    clampXY, normalize, load, save, apply, isIdentity, emptyScheme, usablePad, create, shapeOf, applyShape, sizeStep,
  });
})();
