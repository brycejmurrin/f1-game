"use strict";
/* TOP MODAL — the platform's top layer, without rewriting the app's state machine.
 *
 * WHY. Every modal in this game is a `<div class="screen dim">` shown by setting
 * `.hidden = false`, and the stacking is a hand-maintained z-index ladder: 25
 * distinct values across 49 declarations, topping out at 9000. Nothing traps
 * focus, Escape is handled in two files out of twelve, and the background stays
 * interactive behind the scrim. `<dialog>.showModal()` supplies all of that —
 * the TOP LAYER (which no z-index can reorder and no `overflow: hidden` or
 * transformed ancestor can clip), `::backdrop`, Escape, focus containment and an
 * inert background — and it does so by deleting code rather than adding it.
 *
 * THE PROBLEM IS THE MIGRATION, NOT THE FEATURE. There are ~130 `.hidden =`
 * sites across js/, sixty-odd of them on these screens, and this app's state
 * machine has already proved that it does not survive having a screen's
 * visibility changed behind its back: forcing `#pmsettings.hidden = false`
 * desynced that screen and made every panel button inside it a silent no-op.
 * Rewriting sixty call sites in one change is how that becomes twelve bugs.
 *
 * So this is a SEAM, not a rewrite. A migrated screen becomes a `<dialog>` in
 * the markup and gains nothing else; this module watches its `hidden` attribute
 * and mirrors it onto `showModal()` / `close()`. Every existing call site keeps
 * working, unchanged and unaware, and screens migrate one at a time — each one
 * verified by its row in the layout grid before the next.
 *
 * `hidden` stays the source of truth deliberately. The alternative — making
 * `open` authoritative — means every reader of `.hidden` (menus.js, the pause
 * flow, the audit harness, the specs) has to learn a second way to ask the same
 * question, on a staggered schedule. One question, one answer, throughout.
 */
window.TopModal = (function () {
  const wired = new WeakSet();

  function sync(el) {
    const wantOpen = !el.hidden;
    // showModal() throws InvalidStateError on an already-open dialog, and close()
    // on a closed one is a no-op — so both directions are guarded.
    if (wantOpen && !el.open) {
      try { el.showModal(); } catch (_) { /* already in the top layer */ }
    } else if (!wantOpen && el.open) {
      try { el.close(); } catch (_) {}
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
       half-built RTCPeerConnection before hiding anything, and CLAUDE.md is
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
    el.addEventListener("close", () => { if (!el.hidden) el.hidden = true; });

    sync(el);
  }

  function scan(root) {
    (root || document).querySelectorAll("dialog.screen").forEach(wire);
  }

  /* THE SAME DOOR FOR THE SCREENS THAT ARE NOT DIALOGS.
     Five screens never became <dialog>s and so never got Escape: #select,
     #career, #carsetup, #lighting and #camtune, plus the free-camera overlay
     #photo-controls. (#track-detail was a sixth, until it migrated to a real
     <dialog> — see docs/research/PLATFORM-INPUT-NOTES.md §9a.) Two of the
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
     key from also reaching the pause switch in js/game/input.js, which is on
     `window` in the BUBBLE phase and therefore downstream of this. When no
     screen claims the key we return WITHOUT stopping anything, so the data
     hub's and the telemetry popup's own document-bubble handlers still work. */
  function onEscape(e) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return;
    // A <dialog> gets Escape from the platform — the browser fires `cancel` on
    // it and wire()'s handler turns that into the screen's own back button.
    // Doing it here as well would open the door twice.
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

  function init() {
    scan();
    document.addEventListener("keydown", onEscape, true);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, wire, onEscape };
})();
