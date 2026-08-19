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
     key from also reaching the pause switch in js/game/input.js, which is on
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

  function onFocusIn(e) {
    // Non-dialog layers never got platform focus containment. Keep Tab inside
    // the top UiLayers pane (#select, #career, #lighting, …). Dialogs already
    // trap via showModal(); #carsetup stays pointer-events:none for the
    // turntable — still contain keyboard focus to its chrome.
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer || layer.tagName === "DIALOG") return;
    const t = e.target;
    if (t && (layer.contains(t) || (t.closest && t.closest(".dh-tpopup")))) return;
    const focusable = layer.querySelector(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    if (focusable) {
      e.preventDefault();
      try { focusable.focus(); } catch (_) { /* detached */ }
    }
  }

  function init() {
    Log.info("ui", "TopModal.init");
    scan();
    document.addEventListener("keydown", onEscape, true);
    document.addEventListener("focusin", onFocusIn, true);
  }

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { scan, wire, onEscape };
})();
