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

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => scan(), { once: true });
  else scan();

  return { scan, wire };
})();
