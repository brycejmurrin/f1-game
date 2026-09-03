"use strict";
/* TOP MODAL — mirrors each dialog.screen's `hidden` onto showModal()/close().
 * Seam migration: `hidden` stays source of truth; screens migrate one at a time
 * so existing `.hidden =` call sites keep working unchanged. */
window.TopModal = (function () {
  const wired = new WeakSet();

  function sync(el) {
    const wantOpen = !el.hidden;
    if (wantOpen && !el.open) {
      try { el.showModal(); } catch (_) { /* already in the top layer */ }
      try { Log.info("ui", "TopModal open #" + (el.id || "?")); } catch (_) { /* Log absent */ }
    } else if (!wantOpen && el.open) {
      try { el.close(); } catch (_) {}
      try { Log.info("ui", "TopModal close #" + (el.id || "?")); } catch (_) { /* Log absent */ }
    }
  }

  function wire(el) {
    if (!el || wired.has(el) || typeof el.showModal !== "function") return;
    wired.add(el);

    new MutationObserver(() => sync(el))
      .observe(el, { attributes: true, attributeFilter: ["hidden"] });

    /* ESCAPE MUST GO THROUGH THE SCREEN'S OWN DOOR.
       A native dialog closes itself on Escape, which sounds like a free feature
       and is a trap: closing the ELEMENT is not the same as closing the SCREEN.
       The VS FRIEND lobby's own close path stops the camera and tears down a
       half-built RTCPeerConnection before hiding anything, and AGENTS.md is
       explicit that a camera outliving its screen is a privacy bug nothing on
       screen would reveal. A bare Escape would have left both running.
       So: `data-esc-close="<id>"` names the control Escape should press, and
       Escape then does exactly what that button does — no second code path to
       keep in step. `data-esc="none"` refuses Escape outright, for a screen that
       is a gate rather than a dismissible overlay. */
    el.addEventListener("cancel", (e) => {
      const via = el.getAttribute("data-esc-close");
      if (via) {
        e.preventDefault();
        const btn = document.getElementById(via);
        if (btn) btn.click(); else el.hidden = true;
      } else if (el.getAttribute("data-esc") === "none") {
        e.preventDefault();
      }
    });

    /* Whatever does close it — the app, Escape, a light-dismiss — the attribute
       has to be put back in step, or the next `hidden = false` is a silent no-op
       because the element is already `open`. That is the same desync class this
       seam exists to avoid, arriving from the other direction. */
    el.addEventListener("close", () => {
      if (el.hidden) return;                       // our own mirror closed it
      // A platform close nothing on screen asked for: the SECOND Escape in a
      // row fires a non-cancelable `cancel` (the first consumed the
      // history-action activation), and the dialog closes behind our
      // preventDefault. For a screen with a door, press the door; for a gate
      // (data-esc="none") or a door that chose to stay, put it back — a
      // refused RESULTS sheet used to vanish onto a frozen HUD.
      const via = el.getAttribute("data-esc-close");
      if (via) { const btn = document.getElementById(via); if (btn) btn.click(); }
      if (el.hidden) return;
      if (via || el.getAttribute("data-esc") === "none") {
        queueMicrotask(() => { if (!el.hidden && !el.open) { try { el.showModal(); } catch (_) { /* not connected */ } } });
      } else el.hidden = true;
    });

    sync(el);
  }

  function scan(root) {
    (root || document).querySelectorAll("dialog.screen").forEach(wire);
  }

  /* THE SAME DOOR FOR THE SCREENS THAT ARE NOT DIALOGS.
     Five screens never became <dialog>s and so never got Escape: #select,
     #career, #carsetup, #lighting and #camtune, plus the free-camera overlay
     #photo-controls. (#track-detail was a sixth, until it migrated to a real
     <dialog> — see docs/research/PLATFORM-INPUT-NOTES.md §9a. That migration
     shipped, silently lost its markup hunk to a merge, and was restored in
     2026-08 after tests/specs/menu-keyboard.spec.js's ":modal" assertion — which had
     been red and unrun the whole time — was found pinning it.) Two of the
     remainder must NOT become modal dialogs — #carsetup is
     `pointer-events: none` so a drag reaches the live turntable rendering
     behind it, and showModal() would make that canvas inert — so instead of
     migrating them, the ATTRIBUTE migrates: they carry
     the same `data-esc-close="<id>"` and this handler presses it, which is
     exactly what the `cancel` path above does for a real dialog.

     ON `document` AND NOT `window`, DELIBERATELY. An inner disclosure has to be
     able to claim Escape before its screen does — the GARAGE's camera panel is
     the case: Escape there shuts the panel, not the GARAGE. That handler is on
     document/capture too (js/game.js) and registers at script-eval time, i.e.
     before this one, so it runs first and marks the event handled. A listener
     on `window` would beat it and there would be no way back.

     Stopping propagation is the point, not a side effect: it is what keeps the
     key from also reaching the pause switch in js/input/input.js, which is on
     `window` in the BUBBLE phase and therefore downstream of this. When no
     screen claims the key we return WITHOUT stopping anything, so the data
     hub's and the telemetry popup's own document-bubble handlers still work. */
  function onEscape(e) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return;
    if (layer.tagName === "DIALOG") return;
    if (layer.getAttribute("data-esc") === "none") {
      e.preventDefault(); e.stopPropagation();
      return;
    }
    const via = layer.getAttribute("data-esc-close");
    if (!via) return;
    const btn = document.getElementById(via);
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    btn.click();
  }

  /* WHAT FOCUS MAY LAND ON. One selector — MenuNav's, once it has loaded (it
     ships after this file) — and one visibility rule: a control that is
     `hidden`, disabled, aria-hidden or has no box is not a landing spot. The
     containment below used to take the FIRST focusable in DOM order whether
     or not it was on screen — a search-filtered circuit row, a CSS-hidden
     button — and `focus()` on a hidden element is a silent no-op, so the
     pull-back read as done while focus stayed outside the layer. */
  const FOCUSABLE_FALLBACK = "button:not([disabled]),a[href],input:not([disabled])," +
    "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const focusableSel = () => (window.MenuNav && window.MenuNav.FOCUSABLE) || FOCUSABLE_FALLBACK;
  const shown = (el) => (window.UiLayers && window.UiLayers.shown) ? window.UiLayers.shown(el) : !el.hidden;
  const usable = (el) => !!el && !el.disabled &&
    !(el.getAttribute && el.getAttribute("aria-hidden") === "true") && shown(el);
  // A text field is never chosen as a landing spot: focusing one on open raises
  // the on-screen keyboard on touch and hands the caret keys a pad's D-pad.
  const TEXTY = /^(text|search|url|email|password|tel|number)$/;
  const isTexty = (el) => el.tagName === "TEXTAREA" ||
    (el.tagName === "INPUT" && TEXTY.test((el.type || "text").toLowerCase()));
  function firstFocusable(layer, skipTexty) {
    for (const el of layer.querySelectorAll(focusableSel())) {
      if (!usable(el) || (skipTexty && isTexty(el))) continue;
      return el;
    }
    return null;
  }

  function onFocusIn(e) {
    // Non-dialog layers never got platform focus containment. Keep Tab inside
    // the top UiLayers pane (#select, #career, #lighting, …). Dialogs already
    // trap via showModal(); #carsetup stays pointer-events:none for the
    // turntable — still contain keyboard focus to its chrome.
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer || layer.tagName === "DIALOG") return;
    const t = e.target;
    if (t && layer.contains(t)) return;
    const focusable = firstFocusable(layer, false);
    if (focusable) {
      // No preventDefault: `focusin` is NOT cancelable, so the call was a
      // no-op that read as if it were suppressing the stray focus. The
      // focus() below is what actually pulls focus back into the layer.
      try { focusable.focus({ preventScroll: true }); } catch (_) { /* detached */ }
    }
  }

  /* FOCUS MEMORY FOR THE SCREENS THAT ARE NOT DIALOGS.
     A <dialog> gets two things from the platform for free: showModal() parks
     focus inside it, and close() hands focus back to whatever opened it. The
     `hidden`-toggled pages (#select, #career, #carsetup, the tuners, the title
     screen itself) got neither: the button you pressed on the title screen
     went `hidden` under you, the browser's focus fixup dropped focus on <body>,
     and BACK left it there — Tab restarted at the top of the document and a
     pad's only cursor was gone, the "unfocused screen is a lost user" case
     docs/research/PLATFORM-INPUT-NOTES.md §8 quotes. Two WeakMaps, keyed by
     layer:
       lastFocus  the control focused INSIDE the layer when it last hid — where
                  focus returns on the next open (#select reopens on NEXT: YOUR
                  CAR after the garage's BACK, the title on the button that
                  left it), else the same landing rule as the first arrow press
                  (MenuNav.currentItem: autofocus / data-menu-default / the
                  selected control / the first usable one, never a text field);
       opener     the control focused OUTSIDE the layer when it opened — focus
                  goes back to it on close when it is on screen again and
                  nothing else has taken focus meanwhile.
     Mutation callbacks run before the browser's focus fixup, so activeElement
     still names the control inside a layer that has just gone hidden — that
     ordering is what makes the memory readable at all. Both maps are per
     layer and weak; nothing here outlives the DOM it points at. */
  const lastFocus = new WeakMap();
  const opener = new WeakMap();
  const LAYER_SKIP = {
    // The rotate blocker manages its own focus (js/game.js) and is CSS-gated;
    // the fly-cam is not a menu — its arrows are the camera's (MenuNav refuses
    // it too) and a focused button there would turn Space into a click.
    "rotate-device": 1, "photo-controls": 1,
  };
  const inside = (layer, el) => !!el && el !== document.body && layer.contains(el);
  const connected = (el) => !!el && !!document.body && document.body.contains(el);
  const focusQuiet = (el) => { try { el.focus({ preventScroll: true }); } catch (_) { /* detached */ } };

  function landing(layer) {
    const auto = layer.querySelector("[autofocus]");
    if (usable(auto)) return auto;
    const nav = window.MenuNav;
    if (nav && nav.currentItem && nav.items) {
      const list = nav.items(layer).filter((el) => !isTexty(el));
      const cur = nav.currentItem(layer, list);
      if (cur) return cur;
    }
    return firstFocusable(layer, true);
  }

  function onLayerShow(layer) {
    const a = document.activeElement;
    if (inside(layer, a)) return;                       // the app placed focus itself
    opener.set(layer, connected(a) && a !== document.body ? a : null);
    const back = lastFocus.get(layer);
    const target = (connected(back) && layer.contains(back) && usable(back)) ? back : landing(layer);
    if (target) focusQuiet(target);
  }

  function onLayerHide(layer) {
    const a = document.activeElement;
    if (inside(layer, a)) lastFocus.set(layer, a);
    const back = opener.get(layer);
    opener.delete(layer);
    if (!connected(back) || !usable(back)) return;      // its screen is not up (a race started)
    if (a && a !== document.body && !layer.contains(a)) return;   // something else took focus
    const top = window.UiLayers && window.UiLayers.top ? window.UiLayers.top() : null;
    if (top && !top.contains(back)) return;             // another layer owns the keys now
    focusQuiet(back);
  }

  function wireLayer(el) {
    if (!el || wired.has(el) || typeof el.showModal === "function") return;
    wired.add(el);
    new MutationObserver(() => (el.hidden ? onLayerHide(el) : onLayerShow(el)))
      .observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }

  function scanLayers() {
    const ids = (window.UiLayers && window.UiLayers.LAYER_IDS) || [];
    for (const id of ids) {
      if (LAYER_SKIP[id]) continue;
      const el = document.getElementById(id);
      if (el && el.tagName !== "DIALOG") wireLayer(el);
    }
  }

  function init() {
    Log.info("ui", "TopModal.init");
    scan();
    scanLayers();
    document.addEventListener("keydown", onEscape, true);
    document.addEventListener("focusin", onFocusIn, true);
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, wire, onEscape, onFocusIn, wireLayer, scanLayers, landing };
})();
