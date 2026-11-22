/* PedalTravel — stamp-then-ease thumb travel, one home for both pedals.
   The on-screen GAS/BRAKE (js/input/hold-buttons.js) and the phone wheel
   (js/input/phone-pad-page.js) share these numbers: a touch is full travel,
   12 px of slop, then 90 px of slide to a 0.12 floor. Sliding back past the
   landing point stays full. controller.html loads this file and not the
   hold-button factory; the game page loads it before hold-buttons.js. */
"use strict";

const PedalTravel = (function () {
  const DEAD_PX = 12;     // slop first, so a thumb tremor is not a lift
  const TRAVEL_PX = 90;   // finger travel from full press to the light end
  const MIN = 0.12;       // never quite zero: sliding off is not releasing
  const RAMP_PX = 40;     // PEDAL SLIDE = EASE (#5996): px past a slide's arrival to full

  // Vertical pedal: up the screen (decreasing clientY) eases off. The
  // horizontal steer-button path keeps its own axis and uses the constants.
  function ease(anchor, pos, travel = TRAVEL_PX) {
    const up = Math.max(0, anchor - pos - DEAD_PX);
    return Math.max(MIN, Math.min(1, 1 - up / travel));
  }

  function arrive(dist) {
    return Math.max(MIN, Math.min(1, dist / RAMP_PX));
  }

  const KEY = "touchButtonProfiles";
  const BUTTONS = ["left", "right", "gas", "brake"];
  const raceButtons = Object.freeze({ left: "btn-steer-left", right: "btn-steer-right", gas: "btn-throttle", brake: "btn-brake",
    boost: "btn-boost", overtake: "btn-ot", aero: "btn-aero", shiftUp: "shift-up", shiftDown: "shift-down",
    camera: "btn-cam", pause: "pausebtn", showHud: "hud-restore" });
  const phoneButtons = Object.freeze(["gas", "brake", "shiftUp", "shiftDown", "boost", "overtake", "aero",
    "camera", "pause", "radio", "recover", "look", "calib", "navSelect", "navBack"]);
  const allButtons = new Set([...Object.keys(raceButtons), ...phoneButtons]);
  const colors = Object.freeze({ red: "--red", green: "--faster", blue: "--zone", purple: "--sec-best", orange: "--spark", yellow: "--gold", white: "--hud-ink-light" });
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

  function startPercent(profile) {
    return profile.start ?? (profile.press === "progressive" ? 12 : 100);
  }

  function advance(profile, dx, dy, instantAxis) {
    switch (profile.direction) {
      case "up": return -dy;
      case "down": return dy;
      case "left": return -dx;
      case "right": return dx;
      default: return profile.press === "progressive" ? Math.hypot(dx, dy) : instantAxis;
    }
  }

  function level(profile, advancePx, holdFraction = 0) {
    const start = startPercent(profile) / 100;
    const resting = start + (1 - start) * holdFraction;
    if (profile.press === "progressive") {
      if (!profile.direction) advancePx = Math.max(0, advancePx);
      const span = advancePx < 0 ? start : 1 - start;
      return Math.max(0, Math.min(1, resting + span * advancePx / profile.travel));
    }
    return Math.max(Math.min(start, MIN), resting - Math.max(0, advancePx - DEAD_PX) / profile.travel);
  }

  // Only a configured direct hold needs frames. Identity checks also handle
  // capture transfers, focus loss and pointer IDs reused before the next frame.
  function buildOnHold(contact, active, update) {
    const duration = contact.profile.buildMs;
    if (!duration || startPercent(contact.profile) === 100) return;
    const began = performance.now();
    function tick(now) {
      if (!active()) return;
      contact.holdFraction = Math.min(1, Math.max(0, now - began) / duration);
      update(level(contact.profile, contact.advance || 0, contact.holdFraction));
      if (contact.holdFraction < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Store only differences from shipped behavior. An absent slide follows the
  // existing global PEDAL SLIDE value, including edits made after this profile.
  function overrides(id, value) {
    const out = {};
    if (!object(value)) return out;
    for (const field of ["idleColor", "pressedColor"]) {
      if (Object.hasOwn(colors, value[field])) out[field] = value[field];
    }
    if (!BUTTONS.includes(id)) {
      if (id !== "look" && ["tap", "hold", "double"].includes(value.activation)) out.activation = value.activation;
      return out;
    }
    if (value.press === "progressive") out.press = value.press;
    if (Number.isFinite(value.travel)) {
      const travel = Math.max(40, Math.min(160, Math.round(value.travel)));
      if (travel !== TRAVEL_PX) out.travel = travel;
    }
    if ((id === "left" || id === "right") && Number.isFinite(value.adaptive))
      out.adaptive = Math.max(1, Math.min(10, Math.round(value.adaptive)));
    if (["up", "down", "left", "right"].includes(value.direction)) out.direction = value.direction;
    if (Number.isFinite(value.start)) out.start = Math.max(0, Math.min(100, Math.round(value.start)));
    if ([250, 500, 1000, 2000].includes(value.buildMs)) out.buildMs = value.buildMs;
    if ([25, 70, 100].includes(value.brightness)) out.brightness = value.brightness;
    if (value.feedback === false) out.feedback = false;
    if ((id === "gas" || id === "brake") && (value.slide === "instant" || value.slide === "ease")) out.slide = value.slide;
    return out;
  }

  function normalizeProfiles(value) {
    if (value === null) return null;
    if (!object(value) || value.v !== 1 || !object(value.buttons)) return undefined;
    const buttons = {};
    for (const id of allButtons) {
      const clean = overrides(id, value.buttons[id]);
      if (Object.keys(clean).length) buttons[id] = clean;
    }
    if (Object.keys(buttons).length) return { v: 1, buttons };
    // Empty is the valid unpinned shape. A malformed or future-only map
    // should be skipped on import, even when restoring a full backup.
    return Object.keys(value.buttons).length ? undefined : null;
  }

  // Both entry points load GameStore; keep a session value for isolated input
  // consumers that run without the persistence module.
  let memory = null;
  const memoryListeners = new Set();
  const store = () => typeof GameStore !== "undefined" ? GameStore.store : null;
  const saved = () => store() ? store().get(KEY, null) : memory;
  function buttonOverrides(id) {
    const raw = saved();
    return overrides(id, allButtons.has(id) && raw && raw.v === 1 && raw.buttons && raw.buttons[id]);
  }
  function buttonProfile(id, globalSlide) {
    const pedal = id === "gas" || id === "brake";
    const slide = pedal && (globalSlide ?? store()?.get("pedalSlide", "instant"));
    return { press: "instant", travel: TRAVEL_PX, slide: slide === "ease" ? "ease" : "instant", feedback: true, ...buttonOverrides(id) };
  }
  function watchButtonProfile(id, callback) {
    const refresh = () => callback(buttonProfile(id));
    refresh();
    if (store()?.subscribe) return store().subscribe(change => {
      if (change.key === KEY || change.key === null) refresh();
    });
    memoryListeners.add(refresh);
    return () => memoryListeners.delete(refresh);
  }
  function setButtonProfile(id, patch) {
    if (!allButtons.has(id)) return;
    const buttons = normalizeProfiles(saved())?.buttons || {};
    const clean = overrides(id, patch === null ? null : { ...buttons[id], ...patch });
    if (Object.keys(clean).length) buttons[id] = clean;
    else delete buttons[id];
    const value = Object.keys(buttons).length ? { v: 1, buttons } : undefined;
    if (store()) store().set(KEY, value);
    else memory = value;
    if (!store()?.subscribe) for (const refresh of memoryListeners) refresh();
    return buttonProfile(id);
  }

  function bindControl(el, id) {
    if (!el || !allButtons.has(id)) return;
    let mode, pointer = null, began = 0, previous = -Infinity, touchClick = false;
    const controlKind = BUTTONS.includes(id) ? "analog" : "action";
    watchButtonProfile(id, profile => {
      for (const [field, attribute] of [["idleColor", "idle"], ["pressedColor", "pressed"]]) {
        const color = profile[field], name = "--touch-custom-" + attribute;
        if (color) {
          el.style?.setProperty?.(name, "var(" + colors[color] + ")");
          el.setAttribute("data-custom-" + attribute, controlKind);
        } else {
          el.style?.removeProperty?.(name);
          el.removeAttribute?.("data-custom-" + attribute);
        }
      }
      if (mode !== profile.activation) { mode = profile.activation; pointer = null; previous = -Infinity; }
    });
    if (BUTTONS.includes(id) || id === "look") return;
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
      const fire = mode === "tap" || (mode === "hold" ? elapsed >= 450 : elapsed < 350 && e.timeStamp - previous <= 350);
      previous = !fire && elapsed < 350 ? e.timeStamp : -Infinity;
      if (fire) el.click();
    }, true);
    const cancel = e => { if (e.pointerId === pointer) { pointer = null; previous = -Infinity; } };
    el.addEventListener("pointercancel", cancel, true);
    el.addEventListener("lostpointercapture", cancel, true);
    el.addEventListener("click", e => { if (touchClick && e.detail > 0) consume(e); }, true);
    el.addEventListener("contextmenu", e => { if (touchClick && mode) consume(e); }, true);
  }

  return { raceButtons, phoneButtons, colors, bindControl, DEAD_PX, TRAVEL_PX, MIN, RAMP_PX, ease, arrive, level, advance, startPercent, buildOnHold, normalizeProfiles, buttonOverrides, buttonProfile,
    watchButtonProfile, setButtonProfile, resetButtonProfile: id => setButtonProfile(id, null) };
})();
Object.freeze(PedalTravel);
