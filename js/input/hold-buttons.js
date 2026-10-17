/* InputHoldButtons: multi-pointer hold/tap buttons, analog travel and teardown safety nets. Factory instances own their state. */
"use strict";

const InputHoldButtons = (function () {
  function create({ clamp, beforeReleaseAll }) {
    // Every wireHold button registers here so its private pressed-pointer set can
    // be cleared from OUTSIDE the closure. Nets that hang off this list:
    //   1. window-level capture-phase pointerup/pointercancel (init) release that
    //      pointerId from EVERY hold button — a pointer that lifted anywhere is by
    //      definition no longer holding anything, even when the button itself never
    //      received the event (retargeted lift, missed lostpointercapture).
    //   2. lostpointercapture, but ONLY via lostCaptureShouldRelease — a
    //      capture steal from a second hold button is not a lift (GAS + a
    //      turn arrow). A button that was already hidden at pointerdown is
    //      not a teardown either.
    //   3. reset() (blur / tab-hidden) clears every set outright, covering OS
    //      interruptions where NO pointer event is delivered at all.
    // Without these, an interruption mid-hold left a ghost pointerId in the set:
    // reset() zeroed btnThrottle but couldn't reach the closure, so after the next
    // press+release the set never emptied again ("held until every pointer
    // releases" counted a pointer that no longer existed) and the throttle could
    // be switched ON but never OFF — intermittent because an OS that happens to
    // REUSE the same pointerId self-heals. The stuck throttle then endlessly
    // re-trips the off-track auto-rescue ("throttle held but not moving").
    const holdBtns = [];
    function holdReleasePointer(pointerId) {
      for (const h of holdBtns) h.release(pointerId);
    }
    function holdReleaseAll(keepLatch) {
      // A LATCH DROPS HERE on the everything-off paths (window blur, page hidden,
      // Input.reset): a latched throttle surviving a blur means the car
      // accelerates while the player is not looking at it. NOT on the last finger
      // lifting (keepLatch): TouchEvent.touches is empty on every ordinary lift, so
      // dropping it there switched LATCH off the moment the thumb left GAS.
      beforeReleaseAll(keepLatch);
      for (const h of holdBtns) {
        h.ids.clear();
        h.anchors && h.anchors.clear();
        h.levels && h.levels.clear();
        h.live && h.live.clear();
        h.apply(false);
        h.level && h.level(0);
      }
    }

    // lostpointercapture is a TEARDOWN signal, not a lift. It fires when the
    // capture target is hidden/removed (the stuck-GAS case) AND when a second
    // hold button calls setPointerCapture — WebKit keeps one capture slot, so
    // tapping LEFT while GAS is down steals capture from GAS — treated as a lift,
    // that drops the throttle with the thumb still on it.
    //
    // Honour the event only when the button DISAPPEARED mid-hold (visible at
    // pointerdown, gone now). Buttons start `[hidden]` in the shell and tests
    // often press them that way; treating "currently hidden" as a teardown
    // would drop every capture-steal in the harness AND a real two-thumb
    // press if a parent group flickered hidden. Target === document is
    // PE3 §9.5 (capture target disconnected) — always a teardown.
    function holdTargetGone(el) {
      if (!el || el === document) return true;
      if (!el.isConnected) return true;
      if (el.hidden) return true;
      const parent = el.parentElement;
      if (parent && parent.hidden) return true;
      try {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return true;
      } catch (_) { /* getComputedStyle can throw on a detached node */ }
      return false;
    }
    function lostCaptureShouldRelease(el, pointerId) {
      if (!el || el === document || !el.isConnected) return true;
      const h = holdBtns.find((x) => x.el === el);
      const wasVisible = !!(h && h.live.get(pointerId));
      if (!wasVisible) return false;
      return holdTargetGone(el);
    }

    // PEDAL TRAVEL ON A TOUCHSCREEN. The analog-trigger note above says the
    // physics rewards MODULATION and that thresholding a trigger to a boolean
    // throws all of it away — and then the on-screen pedals did exactly that, so
    // the one platform with no triggers at all was also the one that could only
    // stamp or lift. Trail-braking, the mechanic the friction ellipse exists to
    // reward, was unreachable on an iPad.
    //
    // The gesture is STAMP THEN EASE: touching the pedal is full travel, which is
    // precisely what it did before, so nothing is taken away from a player who
    // taps and never discovers this. Sliding the thumb UP the screen, away from
    // the pedal, lifts it — the direction a foot comes off a real one. Pointer
    // capture (below) is what makes it work past the edge of a 72 px button.
    const PEDAL_TRAVEL_PX = 90;   // finger travel from full press to the light end
    const PEDAL_DEAD_PX = 12;     // slop first, so a thumb tremor is not a lift
    const PEDAL_MIN = 0.12;       // never quite zero: sliding off is not releasing

    // Hold semantics, multi-pointer safe: the button stays "held" until
    // every pointer that pressed it has been released/cancelled/left.
    // `level`, when given, additionally reports 0..1 pedal travel.
    // `opts.axis` "x" + `opts.dir` (±1) is the steer-button analog-trigger path:
    // tap is full travel (same compatibility promise as the pedals); sliding
    // opposite the steer direction eases off. The default (no opts) is the
    // original vertical pedal gesture and must stay bit-identical.
    function wireHold(id, apply, level, opts) {
      const el = document.getElementById(id);
      if (!el) return;
      const axis = (opts && opts.axis) === "x" ? "x" : "y";
      const dir = (opts && opts.dir) || 1;
      const ids = new Set();
      const anchors = level ? new Map() : null;   // pointerId -> axis pos at touch-down
      const levels = level ? new Map() : null;    // pointerId -> current travel
      const live = new Map();                     // pointerId -> visible at pointerdown
      // Every contact holds independently: easing or releasing one finger must
      // not override another finger's stronger press. Both release routes use
      // the same aggregation, including window capture before the local event.
      function paintLevel() {
        if (!level) return;
        let strongest = 0;
        for (const value of levels.values()) strongest = Math.max(strongest, value);
        level(strongest);
      }
      function release(pointerId) {
        anchors && anchors.delete(pointerId);
        levels && levels.delete(pointerId);
        live.delete(pointerId);
        if (!ids.delete(pointerId)) return;
        if (ids.size === 0) apply(false);
        paintLevel();
      }
      holdBtns.push({ ids, apply, level, anchors, levels, el, live, release });
      el.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;   // a right-click opens a context menu and may never send pointerup
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone (cancelled between down and here); the button still works uncaptured */ }
        e.preventDefault();
        // Only the FIRST contact is a press edge: THROTTLE = LATCH toggles on every
        // apply(true), so a second finger landing on GAS cancelled the latch while
        // the first was still down.
        const firstContact = ids.size === 0;
        ids.add(e.pointerId);
        live.set(e.pointerId, !holdTargetGone(el));
        if (firstContact) apply(true);
        if (level) {
          anchors.set(e.pointerId, axis === "x" ? e.clientX : e.clientY);
          levels.set(e.pointerId, 1);
          paintLevel();
        }
      });
      if (level) el.addEventListener("pointermove", e => {
        const a = anchors.get(e.pointerId);
        if (a == null) return;
        if (axis === "x") {
          const ease = Math.max(0, (e.clientX - a) * (-dir) - PEDAL_DEAD_PX);
          levels.set(e.pointerId, clamp(1 - ease / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
          paintLevel();
          return;
        }
        const up = Math.max(0, a - e.clientY - PEDAL_DEAD_PX);
        levels.set(e.pointerId, clamp(1 - up / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
        paintLevel();
      });
      el.addEventListener("pointerup", (e) => release(e.pointerId));
      el.addEventListener("pointercancel", (e) => release(e.pointerId));
      // NOT pointerleave. setPointerCapture fires a boundary pointerleave as it
      // retargets (holdSetupCtl in js/game.js documents the same trap). A second
      // finger on a turn arrow does the same to a held GAS. Window-level
      // pointerup already covers a lift that lands off the button; capture is
      // what keeps a slide-off from dropping the pedal.
      // lostpointercapture is only a release when the button was taken away —
      // see holdTargetGone. A capture steal from another hold button must not
      // drop a thumb that is still down.
      el.addEventListener("lostpointercapture", function (e) {
        if (!lostCaptureShouldRelease(el, e.pointerId)) return;
        release(e.pointerId);
      });
    }

    function wireTap(id, fire) {
      const el = document.getElementById(id);
      if (!el) return;
      const enabled = () => !el.disabled && !(el.getAttribute && el.getAttribute("aria-disabled") === "true");
      el.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (enabled()) fire();   // keep the paddle's immediate down-edge response
      });
      el.addEventListener("click", function (e) {
        // Pointer clicks already fired on DOWN. Native keyboard/AT activation
        // and .click() have detail 0: no pointer bookkeeping can strand them.
        if (e.detail === 0 && enabled()) fire();
      });
      el.addEventListener("keydown", function (e) {
        if (e.code !== "Space" && e.key !== " " && e.key !== "Enter" &&
            e.code !== "Enter" && e.code !== "NumpadEnter") return;
        // Activate once on DOWN, like a pointer paddle. Spend the native default
        // so it cannot click again; keep Space off the window's BOOST binding.
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) el.click();
      });
      // KEYUP must reach Input: a driving key held before this button gained
      // focus still needs its release (including a rebound Space/GAS binding).
    }

    return { wireHold, wireTap, holdReleasePointer, holdReleaseAll, holdTargetGone, lostCaptureShouldRelease,
      pointerCounts: () => holdBtns.map((h) => h.ids.size) };
  }

  return { create };
})();
Object.freeze(InputHoldButtons);
