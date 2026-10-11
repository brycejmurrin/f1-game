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
  function clampXY(xy) {
    return {
      x: clamp01(xy && xy.x, -MAX, MAX),
      y: clamp01(xy && xy.y, -MAX, MAX),
    };
  }
  function emptyScheme() { return { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } }; }
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

  /** Usable pad size in CSS px (viewport minus safe-area insets). */
  function usablePad(root) {
    const cs = root ? getComputedStyle(root) : null;
    const sal = parseFloat(cs && cs.getPropertyValue("--sal")) || 0;
    const sar = parseFloat(cs && cs.getPropertyValue("--sar")) || 0;
    const sat = parseFloat(cs && cs.getPropertyValue("--sat")) || 0;
    const sab = parseFloat(cs && cs.getPropertyValue("--sab")) || 0;
    const w = (typeof window !== "undefined" ? window.innerWidth : 390) - sal - sar;
    const h = (typeof window !== "undefined" ? window.innerHeight : 844) - sat - sab;
    return { w: Math.max(1, w), h: Math.max(1, h) };
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
      // +x = toward centre from each dock's home edge; +y = up from the bottom.
      const sx = side === "L" ? 1 : -1;
      const z = zoomOf(el);
      const tx = (p.x * pad.w * sx / z).toFixed(1);
      const ty = (-p.y * pad.h / z).toFixed(1);
      el.style.transform = "translate(" + tx + "px, " + ty + "px)";
    }
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
    function ensureDone() {
      if (doneBtn || typeof document === "undefined" || !document.createElement || !document.body || !document.body.appendChild) return;
      doneBtn = document.createElement("button");
      doneBtn.id = "dock-edit-done";
      doneBtn.type = "button";
      doneBtn.textContent = "DONE";
      doneBtn.setAttribute("aria-label", "Done repositioning touch controls");
      // Inline: the shell and stylesheets are not this module's to edit, and the
      // button exists only while editing. Top-centre keeps both docks clear.
      doneBtn.style.cssText = "position:fixed;top:calc(8px + var(--sat,0px));left:50%;transform:translateX(-50%);" +
        "z-index:9999;min-width:96px;min-height:44px;padding:0 20px;font:inherit;font-weight:700;" +
        "background:var(--bg,#111);color:var(--text,#fff);border:2px solid var(--text,#fff);border-radius:8px;";
      doneBtn.onclick = () => setEditing(false);
      doneBtn.hidden = true;
      document.body.appendChild(doneBtn);
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
      if (doneBtn) doneBtn.hidden = !editing;
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

    const repoBtn = $("pm-dock-reposition");
    if (repoBtn) repoBtn.onclick = () => {
      setEditing(!editing);
      if (editing && G.announce) G.announce("Drag the touch controls. Tap DONE when finished.", 3, "coach");
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
      e.preventDefault();
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
      const sx = drag.side === "L" ? 1 : -1;
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
    }

    // Re-apply when the player switches STEERING INPUT (store.set notifies
    // `{ key }` singular; bulk restore may also send `{ keys }`).
    if (store && store.subscribe) {
      store.subscribe((change) => {
        if (!change) return;
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
    };
  }

  return Object.freeze({
    KEY, SCHEMES, SIDES, MAX,
    clampXY, normalize, load, save, apply, isIdentity, emptyScheme, usablePad, create,
  });
})();
