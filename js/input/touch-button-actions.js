/* Touch appearance and action gestures mount with the race HUD or the paired phone. */
const TouchButtonActions = (() => {
  "use strict";
  function bindControl(el, id) {
    if (!el) return;
    let mode, pointer = null, began = 0, previous = -Infinity, touchClick = false;
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
      if (profile.fullEdge && profile.feedback) el.setAttribute("data-touch-edge", profile.fullEdge);
      else el.removeAttribute?.("data-touch-edge");
      if (profile.indicator && profile.feedback) el.setAttribute("data-touch-indicator", profile.indicator);
      else el.removeAttribute?.("data-touch-indicator");
      if (mode !== profile.activation) { mode = profile.activation; pointer = null; previous = -Infinity; }
    });
    if (["left", "right", "gas", "brake"].includes(id) || id === "look") return;
    const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    el.addEventListener("pointerdown", e => {
      touchClick = e.pointerType === "touch" && !!mode;
      if (!touchClick) return;
      consume(e);
      if (pointer !== null || el.disabled || el.getAttribute?.("aria-disabled") === "true") return;
      pointer = e.pointerId; began = e.timeStamp;
      try { el.setPointerCapture(pointer); } catch (_) { /* implicit touch capture still delivers a lift */ }
    }, true);
    el.addEventListener("pointerup", e => {
      if (!mode || e.pointerType !== "touch") return;
      consume(e);
      if (pointer !== e.pointerId) return;
      pointer = null;
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom ||
          el.disabled || el.hidden || el.getAttribute?.("aria-disabled") === "true") { previous = -Infinity; return; }
      const elapsed = e.timeStamp - began;
      const fire = mode === "tap" || (mode === "quick" && elapsed <= 180) ||
        (mode === "hold" && elapsed >= 450) || (mode === "long" && elapsed >= 900) ||
        (mode === "double" && elapsed < 350 && e.timeStamp - previous <= 350);
      previous = !fire && elapsed < 350 ? e.timeStamp : -Infinity;
      if (fire) el.click();
    }, true);
    const cancel = e => { if (e.pointerId === pointer) { pointer = null; previous = -Infinity; } };
    el.addEventListener("pointercancel", cancel, true);
    el.addEventListener("lostpointercapture", cancel, true);
    el.addEventListener("click", e => { if (touchClick && e.detail > 0) consume(e); }, true);
    el.addEventListener("contextmenu", e => { if (touchClick && mode) consume(e); }, true);
  }

  if (typeof document !== "undefined" && document.getElementById?.("btn-throttle")) {
    for (const [id, element] of Object.entries(PedalTravel.raceButtons)) bindControl(document.getElementById(element), id);
  }
  return Object.freeze({ bindControl });
})();
