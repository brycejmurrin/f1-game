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
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

  // A freshly stamped button has full travel. Progressive starts at the light end
  // and the caller supplies signed travel in the direction that increases input.
  function level(profile, advancePx) {
    if (profile.press === "progressive") {
      return MIN + (1 - MIN) * Math.min(1, Math.max(0, advancePx) / profile.travel);
    }
    return ease(0, -advancePx, profile.travel);
  }

  // Store only differences from shipped behavior. An absent slide follows the
  // existing global PEDAL SLIDE value, including edits made after this profile.
  function overrides(id, value) {
    const out = {};
    if (!object(value)) return out;
    if (value.press === "progressive") out.press = value.press;
    if (Number.isFinite(value.travel)) {
      const travel = Math.max(40, Math.min(160, Math.round(value.travel)));
      if (travel !== TRAVEL_PX) out.travel = travel;
    }
    if ((id === "left" || id === "right") && Number.isFinite(value.adaptive))
      out.adaptive = Math.max(1, Math.min(10, Math.round(value.adaptive)));
    if (value.feedback === false) out.feedback = false;
    if ((id === "gas" || id === "brake") && (value.slide === "instant" || value.slide === "ease")) out.slide = value.slide;
    return out;
  }

  function normalizeProfiles(value) {
    if (value === null) return null;
    if (!object(value) || value.v !== 1 || !object(value.buttons)) return undefined;
    const buttons = {};
    for (const id of BUTTONS) {
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
  const store = () => typeof GameStore !== "undefined" ? GameStore.store : null;
  const saved = () => store() ? store().get(KEY, null) : memory;
  function buttonOverrides(id) {
    const raw = saved();
    return overrides(id, BUTTONS.includes(id) && raw && raw.v === 1 && raw.buttons && raw.buttons[id]);
  }
  function buttonProfile(id, globalSlide) {
    const pedal = id === "gas" || id === "brake";
    const slide = pedal && (globalSlide ?? store()?.get("pedalSlide", "instant"));
    return { press: "instant", travel: TRAVEL_PX, slide: slide === "ease" ? "ease" : "instant", feedback: true, ...buttonOverrides(id) };
  }
  function setButtonProfile(id, patch) {
    if (!BUTTONS.includes(id)) return;
    const buttons = normalizeProfiles(saved())?.buttons || {};
    const clean = overrides(id, patch === null ? null : { ...buttons[id], ...patch });
    if (Object.keys(clean).length) buttons[id] = clean;
    else delete buttons[id];
    const value = Object.keys(buttons).length ? { v: 1, buttons } : undefined;
    if (store()) store().set(KEY, value);
    else memory = value;
    return buttonProfile(id);
  }

  return { DEAD_PX, TRAVEL_PX, MIN, RAMP_PX, ease, arrive, level, normalizeProfiles, buttonOverrides, buttonProfile,
    setButtonProfile, resetButtonProfile: id => setButtonProfile(id, null) };
})();
Object.freeze(PedalTravel);
