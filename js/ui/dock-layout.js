/* Apex 26 — DockLayout: per-scheme touch-dock REPOSITION offsets.
   Offsets are fractions of the usable pad (viewport minus safe-area insets),
   so orientation changes keep relative placement. Edit mode is SETTINGS-driven;
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
      // The dock's own CSS zoom scales a transform written on it: divide it back out.
      const z = typeof CssZoom !== "undefined" ? CssZoom.of(el) : 1;
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
    function setEditing(on) {
      editing = !!on;
      if (typeof document !== "undefined") {
        if (editing) document.body.setAttribute("data-dock-edit", "1");
        else document.body.removeAttribute("data-dock-edit");
      }
      const btn = $("pm-dock-reposition");
      if (btn) {
        btn.setAttribute("aria-pressed", editing ? "true" : "false");
        btn.textContent = editing ? "DONE REPOSITIONING" : "REPOSITION TOUCH CONTROLS";
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
      // REPOSITION ends with SETTINGS. Only its own toggle used to turn it off,
      // so BACK/RESUME without DONE left the capture-phase drag live in the race:
      // the dock slid under the thumb on every throttle/steer press.
      const settings = $("pmsettings");
      if (settings && typeof MutationObserver !== "undefined") {
        new MutationObserver(() => { if (settings.hidden && editing) setEditing(false); })
          .observe(settings, { attributes: true, attributeFilter: ["hidden"] });
      }
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
