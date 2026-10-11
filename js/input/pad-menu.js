/* InputPadMenu: gamepad/phone menu navigation, focus seeding and held-direction repeats. Factory instances own their state. */
"use strict";

const InputPadMenu = (function () {
  function create({ btnDown, btnEdge, nowMs, getPadAxisMap, padRest = () => 0 }) {
    const PAD_NAV_DEADZONE = 0.22; // menu sticks only — larger so a resting stick does not creep

    let padNavDir = null;           // held direction while a menu is open, or null
    let padNavNextT = 0;            // nowMs() of the next synthesized repeat
    let padNavSeeded = false;       // one ArrowDown seed per open-menu session
    let padNavSeedLayer = null;     // UiLayers.top() we last seeded for (layer change re-arms)
    const PAD_NAV_DELAY_MS = 450;   // delay before the first repeat
    const PAD_NAV_REPEAT_MS = 130;  // interval between repeats while held
    const PAD_NAV_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

    // Dispatch a synthetic keydown at `document` (not `window`) — measured: an
    // event dispatched at `window` only reaches WINDOW's own listeners, never
    // document's, because window has no descendants of its own in the event
    // path. MenuNav listens on `window` (capture); TopModal's Escape handler
    // listens on `document` (capture). Dispatching at `document` reaches both,
    // in the same order a real keypress would (window-capture, document-capture,
    // …, document-bubble, window-bubble).
    function padDispatchKey(key) {
      // TARGET THE FOCUSED ELEMENT, the way a real key press does. An element's
      // OWN onkeydown is not in the path of an event dispatched at `document` —
      // the event's target IS document, so it never descends to the control —
      // and both tab rails are written that way (the garage's category rail,
      // js/garage/setup-sheet.js csTabKey, and the circuit filter chips). Those
      // rails own their axis, so MenuNav steps aside for them by design; with
      // the key dispatched at document their handlers never run, and a pad
      // cannot move along either rail (measured 2026-09-08: the D-pad sat on the
      // garage's TEAM tab while a real ArrowDown walked all fifteen). Bubbling from the control still reaches document
      // (TopModal's Escape) and window (MenuNav's capture listener), which is
      // what the dispatch-at-document note below the fallback was protecting.
      const el = document.activeElement;
      const target = el && el !== document.body && el.dispatchEvent ? el : document;
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }

    // A D-PAD DIRECTION ON A VALUE CONTROL. A synthetic ArrowRight does nothing
    // to a focused <select> or range slider — there is no UA default action for
    // an untrusted key — and MenuNav steps aside for the keys those controls
    // own, so a pad that landed on ACTIVE AERO's select or the UI SIZE slider
    // was stuck: Left/Right changed nothing, A did nothing (measured
    // 2026-09-08). Along the control's axis the pad steps the VALUE itself and
    // fires input/change the way a real key would; Up/Down go to MenuNav as
    // the ordinary row move they are for the keyboard too.
    function padNavKey(dir) {
      const el = document.activeElement;
      const key = PAD_NAV_KEYS[dir];
      const horizontal = dir === "left" || dir === "right";
      if (el && !el.disabled) {
        const t = el.tagName;
        const ty = t === "INPUT" ? String(el.type || "text").toLowerCase() : "";
        if (t === "SELECT" && horizontal) {
          const opts = el.options || [];
          const n = opts.length;
          const d = dir === "right" ? 1 : -1;
          let j = el.selectedIndex;
          // Match the row chevrons: wrap and skip sentinels such as CUSTOM,
          // which describe a slider-made state but are deliberately unpickable.
          // Assigning selectedIndex directly does not honour `option.disabled`.
          // A wrap:false row (LAPS — js/ui/setting-row.js `_srLive.wrap`) stops
          // at its ends like its chevrons do, instead of 3 ↔ FULL.
          const wrap = !(el._srLive && el._srLive.wrap === false);
          for (let seen = 0; seen < n; seen++) {
            const k = j + d;
            if (!wrap && (k < 0 || k >= n)) { j = el.selectedIndex; break; }
            j = ((k % n) + n) % n;
            if (!opts[j].disabled) break;
          }
          if (n && j !== el.selectedIndex && !opts[j].disabled) {
            el.selectedIndex = j;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
        if (t === "INPUT" && (ty === "range" || ty === "number") && horizontal) {
          const step = parseFloat(el.step) || 1;
          const min = el.min === "" ? -Infinity : parseFloat(el.min), max = el.max === "" ? Infinity : parseFloat(el.max);
          // ONE PRESS IS A VISIBLE MOVE. UI / HUD / BUTTON SIZE step 0.25 over a
          // 130–260 span: stepping by `step` took 400–1040 D-pad presses. A pad
          // press covers ~1/40 of a bounded range (or the slider's own
          // data-pad-step), snapped to the step grid; never less than `step`.
          const ds = parseFloat(el.dataset && el.dataset.padStep);
          const span = max - min;
          const coarse = ds > 0 ? ds : (isFinite(span) && span > 0 ? span / 40 : step);
          const padStep = Math.max(step, Math.round(coarse / step) * step);
          const dec = Math.min(6, (String(el.step).split(".")[1] || "").length);
          const base = isFinite(min) ? min : 0;
          let v = (parseFloat(el.value) || 0) + (dir === "right" ? padStep : -padStep);
          v = +(base + Math.round((v - base) / step) * step).toFixed(dec);
          v = Math.max(min, Math.min(max, v));
          if (String(v) !== String(el.value)) {
            el.value = String(v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
      }
      padDispatchKey(key);
    }

    function padNavDirOf(pad) {
      if (btnDown(pad, 12)) return "up";
      if (btnDown(pad, 13)) return "down";
      if (btnDown(pad, 14)) return "left";
      if (btnDown(pad, 15)) return "right";
      // A wheel's pedals rest at -1: read as a stick they held a direction and
      // scrolled the menu on their own. The mapped pedal axes are not sticks.
      const axisMap = getPadAxisMap();
      const ped = (i) => i === axisMap.throttle || i === axisMap.brake;
      const ax = (pad.axes || []).map((v, i) => (ped(i) ? 0 : v));
      // CALIBRATE STICK lets a worn pad rest anywhere up to ±0.5 on the steer
      // axis; read raw, a rest past the dead zone auto-repeated one direction
      // forever. Same sign convention as calibratePad (the offset is taken after
      // steerInvert), so undo the invert, subtract, and put it back.
      const sx = axisMap.steer;
      if (Number.isInteger(sx) && sx >= 0 && sx < ax.length && !ped(sx)) {
        ax[sx] = ((ax[sx] || 0) * axisMap.steerInvert - padRest()) * axisMap.steerInvert;
      }
      const stick = (x, y) => {
        const mx = Math.abs(x) >= PAD_NAV_DEADZONE ? Math.abs(x) : 0;
        const my = Math.abs(y) >= PAD_NAV_DEADZONE ? Math.abs(y) : 0;
        if (!mx && !my) return null;
        return my >= mx ? (y < 0 ? "up" : "down") : (x < 0 ? "left" : "right");
      };
      return stick(ax[0] || 0, ax[1] || 0) || stick(ax[2] || 0, ax[3] || 0);
    }

    function padFocusableInLayer() {
      const layer = window.MenuNav && window.MenuNav.activeLayer();
      if (!layer) return null;
      const active = document.activeElement;
      const sel = window.MenuNav.FOCUSABLE;
      if (active && sel && layer.contains(active) && active.matches && active.matches(sel)) {
        return active;
      }
      return null;
    }

    // One ArrowDown into MenuNav — the empty path padActivate takes.
    // MenuNav has no seed helper of its own (it exports activeLayer / FOCUSABLE
    // only), so this is the one mover; never .focus() a node from here.
    function padSeedFocus() {
      if (!window.MenuNav || !window.MenuNav.activeLayer()) return;
      if (padFocusableInLayer()) return;
      padDispatchKey("ArrowDown");
    }

    // A → activate. Synthetic events do NOT get a browser's native "Enter/Space
    // clicks the focused button" behaviour (isTrusted:false skips that default
    // action, same as the Escape case below) — so .click() the focused control
    // ourselves, mirroring MenuNav's own idea of "focusable" (MenuNav.FOCUSABLE).
    // If nothing is focused inside the active layer yet (pad used before any
    // direction press), there is nothing to click — seed focus instead, the same
    // way MenuNav's own first arrow press would, so the NEXT press has a target.
    // "One focus visual should always be visible" (research note §8) applies to
    // A as much as to a direction — and to the menu-open seed in padNavPoll.
    function padActivate() {
      const focused = padFocusableInLayer();
      if (focused) {
        // A click on a focused range/number jumps the thumb to the click
        // coordinate — not "confirm this control". Left/Right already own it.
        const ty = (focused.type || "").toLowerCase();
        if (focused.tagName === "INPUT" && (ty === "range" || ty === "number")) return;
        focused.click();
        return;
      }
      padSeedFocus();
    }

    // B → Escape/Back. Gated on UiLayers.top() (not MenuNav.activeLayer(), which
    // deliberately excludes the photo-mode free camera) because a real Escape
    // key reaches the free camera too — it steps out of the fly-cam before
    // closing the tuner panel behind it.
    //
    // A real <dialog>'s "Escape closes it" is UA DEFAULT-ACTION behaviour tied to
    // a TRUSTED key event — Chromium's CloseWatcher takes the key's release, and
    // WebKit's older path takes the keydown's default action (see
    // docs/research/PLATFORM-INPUT-NOTES.md §1) — and neither fires for a
    // synthetic, untrusted KeyboardEvent (verified empirically: a dispatched
    // Escape keydown left an open <dialog> open). TopModal already wires a real
    // `cancel` listener on every dialog.screen that does exactly what a real
    // Escape does (presses the screen's own data-esc-close button) — so for a
    // <dialog> layer, meet THAT seam directly. The handful of screens that never
    // became <dialog>s (TopModal's own comment names them) go through
    // TopModal.onEscape, an ordinary document keydown listener with no such
    // trust requirement, so a synthetic keydown reaches it exactly like a real
    // Escape would.
    function padEscape() {
      const layer = window.UiLayers && window.UiLayers.top();
      if (!layer) return;
      // A NESTED modal (the Data Hub's telemetry popup: a showModal() dialog
      // inside #datahub, not a UiLayers entry) owns BACK, as it owns keyboard
      // Escape in js/ui/modal.js — cancelling the layer closed the whole hub.
      let inner = null;
      try { inner = Array.from(document.querySelectorAll(":modal")).filter((m) => m !== layer && layer.contains(m)).pop() || null; } catch (_) { /* no :modal support */ }
      if (inner && inner.tagName === "DIALOG") {
        inner.dispatchEvent(new Event("cancel", { cancelable: true }));
      } else if (layer.tagName === "DIALOG") {
        layer.dispatchEvent(new Event("cancel", { cancelable: true }));
      } else {
        padDispatchKey("Escape");
      }
    }

    function padNavPoll(pad) {
      const top = window.UiLayers && window.UiLayers.top();
      if (top !== padNavSeedLayer) {
        padNavSeedLayer = top || null;
        padNavSeeded = false;
      }
      const dir = padNavDirOf(pad);
      if (!padNavSeeded) {
        padNavSeeded = true;
        if (!dir && !btnEdge(pad, 0)) padSeedFocus();
      }
      if (dir) {
        const now = nowMs();
        if (dir !== padNavDir) {
          padNavDir = dir;
          padNavKey(dir);
          padNavNextT = now + PAD_NAV_DELAY_MS;
        } else if (now >= padNavNextT) {
          padNavKey(dir);
          padNavNextT = now + PAD_NAV_REPEAT_MS;
        }
      } else {
        padNavDir = null;   // released the instant input returns to neutral
      }
      if (btnEdge(pad, 6)) padDispatchKey("PageUp");
      if (btnEdge(pad, 7)) padDispatchKey("PageDown");
      if (btnEdge(pad, 4)) padDispatchKey("ArrowLeft");
      if (btnEdge(pad, 5)) padDispatchKey("ArrowRight");
      if (btnEdge(pad, 0)) padActivate();
      if (btnEdge(pad, 1)) padEscape();
    }

    function remoteNav(dir) {
      if (!(window.MenuNav && window.MenuNav.activeLayer())) return;   // no menu on top: nothing to move
      if (!padFocusableInLayer()) { padSeedFocus(); return; }
      padNavKey(dir);
    }
    function reset() { padNavDir = null; padNavSeeded = false; padNavSeedLayer = null; }
    return { poll: padNavPoll, activate: padActivate, escape: padEscape, remoteNav,
      releaseDirection() { padNavDir = null; }, reset };
  }

  return { create };
})();
Object.freeze(InputPadMenu);
