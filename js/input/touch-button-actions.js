/* Touch appearance and action gestures mount with the race HUD or the paired phone. */
const TouchButtonActions = (() => {
  "use strict";
  const activePresses = new Set();
  const cancelAll = () => { for (const cancel of activePresses) cancel(); };
  if (typeof document !== "undefined" && document.addEventListener) {
    // WebKit can finish every contact without delivering pointerup or cancel.
    const noFingers = e => {
      if (e.touches?.length === 0) for (const cancel of activePresses) cancel(true);
    };
    document.addEventListener("touchend", noFingers, { capture: true, passive: true });
    document.addEventListener("touchcancel", e => { if (e.touches?.length === 0) cancelAll(); }, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAll(); });
  }
  if (typeof window !== "undefined") {
    window.addEventListener?.("blur", cancelAll);
    window.addEventListener?.("pagehide", cancelAll);
    window.addEventListener?.("resize", cancelAll);
    window.addEventListener?.("orientationchange", cancelAll);
    window.screen?.orientation?.addEventListener?.("change", cancelAll);
  }
  function bindControl(el, id) {
    if (!el) return;
    let mode, timingMs, customMs, pointer = null, began = 0, previous = -Infinity, touchClick = false;
    let ticks = null, picker = null, pickerGeneration;
    function cancelPress(onlyDown = false) {
      if (onlyDown && pointer === null) return;
      activePresses.delete(cancelPress);
      picker?.cancel(); picker = null;
      pointer = null; previous = -Infinity;
    }
    PedalTravel.watchButtonProfile(id, profile => {
      for (const [field, attribute] of [["idleColor", "idle"], ["pressedColor", "pressed"]]) {
        const color = profile[field], name = "--touch-custom-" + attribute;
        if (color) {
          el.style?.setProperty?.(name, "var(" + PedalTravel.colors[color] + ")");
          el.setAttribute("data-custom-" + attribute, id);
        } else {
          el.style?.removeProperty?.(name);
          el.removeAttribute?.("data-custom-" + attribute);
        }
      }
      if (profile.sliderEdge && profile.feedback && el.ownerDocument) {
        if (!ticks) {
          ticks = el.ownerDocument.createElement("span");
          ticks.setAttribute("data-pedal-ticks", "");
          ticks.setAttribute("aria-hidden", "true");
          el.appendChild(ticks);
        }
      } else if (ticks) { ticks.remove(); ticks = null; }
      const edge = profile.sliderEdge || profile.fullEdge;
      if (edge && profile.feedback) el.setAttribute("data-touch-edge", edge);
      else el.removeAttribute?.("data-touch-edge");
      if (profile.indicator && profile.feedback) el.setAttribute("data-touch-indicator", profile.indicator);
      else el.removeAttribute?.("data-touch-indicator");
      const timing = profile.gestureTiming;
      const duration = timing && profile[timing.key];
      if (mode !== profile.activation || customMs !== duration) {
        mode = profile.activation;
        customMs = duration;
        timingMs = duration ?? timing?.defaultMs;
        cancelPress();
      }
    });
    if (["left", "right", "gas", "brake"].includes(id) || id === "look") return;
    const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    el.addEventListener("pointerdown", e => {
      touchClick = e.pointerType === "touch" && !!mode;
      if (!touchClick) return;
      consume(e);
      if (pointer !== null || el.disabled || el.getAttribute?.("aria-disabled") === "true") return;
      pointer = e.pointerId; began = e.timeStamp;
      activePresses.add(cancelPress);
      if (id === "camera" && typeof CamPicker !== "undefined") {
        picker = CamPicker.touchHold(el);
        if (picker && picker.screenGeneration !== pickerGeneration) {
          // Pause and view changes retire a first tap even when it has already lifted.
          pickerGeneration = picker.screenGeneration;
          previous = -Infinity;
        }
        picker?.start(e, mode, timingMs, customMs != null);
      }
      try { el.setPointerCapture(pointer); } catch (_) { /* implicit touch capture still delivers a lift */ }
    }, true);
    el.addEventListener("pointerup", e => {
      if (!mode || e.pointerType !== "touch") return;
      consume(e);
      if (pointer !== e.pointerId) return;
      pointer = null; activePresses.delete(cancelPress);
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom ||
          el.disabled || el.hidden || el.checkVisibility?.({ visibilityProperty: true }) === false || el.getAttribute?.("aria-disabled") === "true") { cancelPress(); return; }
      if (picker) {
        const opened = picker.finish(e);
        picker = null;
        if (opened) { previous = -Infinity; return; }
      }
      const elapsed = e.timeStamp - began;
      const shortTap = mode === "double" && elapsed < timingMs;
      const fire = mode === "tap" || (mode === "quick" && elapsed <= timingMs) ||
        ((mode === "hold" || mode === "long") && elapsed >= timingMs) ||
        (shortTap && e.timeStamp - previous <= timingMs);
      previous = shortTap && !fire ? e.timeStamp : -Infinity;
      if (previous !== -Infinity) activePresses.add(cancelPress);
      if (fire) el.click();
    }, true);
    const cancel = e => { if (e.pointerId === pointer) cancelPress(); };
    el.addEventListener("pointercancel", cancel, true);
    el.addEventListener("lostpointercapture", cancel, true);
    el.addEventListener("click", e => { if (touchClick && e.detail > 0) consume(e); }, true);
    el.addEventListener("contextmenu", e => { if (touchClick && pointer !== null) consume(e); }, true);
  }

  if (typeof document !== "undefined" && document.getElementById?.("btn-throttle")) {
    const guide = document.getElementById("drag-anchor");
    if (guide && typeof GameStore !== "undefined") {
      const store = GameStore.store;
      const paint = () => {
        if (store.get("touchSteeringGuide", "ring") === "wheel") guide.dataset.steeringGuide = "wheel";
        else delete guide.dataset.steeringGuide;
      };
      paint();
      store.subscribe(change => { if (change.key === "touchSteeringGuide" || change.key === null) paint(); });
    }
    const byId = new Map(Object.entries(PedalTravel.raceButtons).map(([profile, id]) => [id, profile]));
    for (const button of document.querySelectorAll(".touchbtn, #pausebtn, #btn-cam, #hud-restore")) {
      const profile = byId.get(button.id);
      if (profile) bindControl(button, profile);
    }
  }
  return Object.freeze({ bindControl });
})();
