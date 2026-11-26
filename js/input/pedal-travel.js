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
  const PHONE_KEY = "phoneButtonProfiles";
  const EMPTY_PHONE = Object.freeze({ v: 1, buttons: Object.freeze({}) });
  const BUTTONS = ["left", "right", "gas", "brake"];
  const edges = ["top", "bottom", "left", "right"];
  const directions = Object.freeze(["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right", "any"]);
  const curves = ["fine", "quick", "smooth"];
  const DEAD_ZONES = [6, 12, 20];   // SLIDE DEAD ZONE px; absent = OFF (the shipped no-slop slide)
  const raceButtons = Object.freeze({ left: "btn-steer-left", right: "btn-steer-right", gas: "btn-throttle", brake: "btn-brake",
    boost: "btn-boost", overtake: "btn-ot", aero: "btn-aero", shiftUp: "shift-up", shiftDown: "shift-down",
    camera: "btn-cam", pause: "pausebtn", showHud: "hud-restore" });
  const phoneButtons = Object.freeze(["gas", "brake", "shiftUp", "shiftDown", "boost", "overtake", "aero",
    "camera", "pause", "radio", "recover", "look", "calib", "navSelect", "navBack"]);
  const gestureTiming = Object.freeze({
    quick: { key: "quickMs", defaultMs: 180, min: 80, max: 600 },
    hold: { key: "holdMs", defaultMs: 450, min: 150, max: 2000 },
    long: { key: "longHoldMs", defaultMs: 900, min: 350, max: 3000 },
    double: { key: "doubleTapMs", defaultMs: 350, min: 150, max: 1000 },
  });
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
      case "up-left": return (-dx - dy) * Math.SQRT1_2;
      case "up-right": return (dx - dy) * Math.SQRT1_2;
      case "down-left": return (dy - dx) * Math.SQRT1_2;
      case "down-right": return (dx + dy) * Math.SQRT1_2;
      case "any": return Math.hypot(dx, dy);
      default: return profile.press === "progressive" ? Math.hypot(dx, dy) : instantAxis;
    }
  }

  // Shape only the first slide distance. Preserve the sign and any overtravel
  // so a directional slide can still unwind a timed hold at its normal limit.
  function responseFraction(fraction, curve) {
    const t = Math.abs(fraction);
    if (!curve || t >= 1) return fraction;
    const sign = Math.sign(fraction);
    switch (curve) {
      case "fine": return sign * t * t;
      case "quick": return sign * t * (2 - t);
      case "smooth": return sign * t * t * (3 - 2 * t);
      default: return fraction;
    }
  }

  function slideFraction(distance, profile) {
    return responseFraction(distance / profile.travel, profile.slideCurve);
  }

  function level(profile, advancePx, holdFraction = 0) {
    const start = startPercent(profile) / 100;
    const holdEnd = (profile.holdEnd ?? 100) / 100;
    const resting = start + (holdEnd - start) * (holdFraction ** (profile.buildPower || 1));
    if (profile.end != null) {
      // SLIDE DEAD ZONE (opt-in, Bryce's Vegas lab 2026-11-26): an explicit slide end has no slop, so a
      // 6 px thumb roll on a QUICK START brake read 88 %. deadPx ignores that much travel first.
      const fraction = Math.min(1, slideFraction(Math.max(0, advancePx - (profile.deadPx || 0)), profile));
      return resting * (1 - fraction) + profile.end / 100 * fraction;
    }
    if (profile.press === "progressive") {
      if (!profile.direction) advancePx = Math.max(0, advancePx);
      const span = advancePx < 0 ? start : 1 - start;
      return Math.max(0, Math.min(1, resting + span * slideFraction(advancePx, profile)));
    }
    return Math.max(Math.min(start, resting, MIN), resting - slideFraction(Math.max(0, advancePx - DEAD_PX), profile));
  }

  // Only a configured direct hold needs frames. Identity checks also handle
  // capture transfers, focus loss and pointer IDs reused before the next frame.
  function buildOnHold(contact, active, update) {
    const duration = contact.profile.buildMs;
    if (!duration || startPercent(contact.profile) === (contact.profile.holdEnd ?? 100)) return;
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
      if (id === "look") return out;
      if (typeof value.activation === "string" && (value.activation === "tap" || Object.hasOwn(gestureTiming, value.activation))) {
        out.activation = value.activation;
      }
      for (const { key, defaultMs, min, max } of Object.values(gestureTiming)) {
        if (!Number.isFinite(value[key])) continue;
        const ms = Math.max(min, Math.min(max, Math.round(value[key] / 10) * 10));
        if (ms !== defaultMs) out[key] = ms;
      }
      // PRESS MODE (#6365): the phone's latching toggles (PhonePadPage.latchButtons, test-pinned). TOGGLE is the
      // default (each press flips the host's effect, as the race HUD's tap does); stored only when HOLD.
      if (value.latch === "hold" && /^(boost|overtake|aero)$/.test(id)) out.latch = "hold";
      return out;
    }
    if (value.press === "progressive") out.press = value.press;
    if (curves.includes(value.slideCurve)) out.slideCurve = value.slideCurve;
    if (DEAD_ZONES.includes(value.deadPx)) out.deadPx = value.deadPx;
    if (Number.isFinite(value.travel)) {
      const travel = Math.max(40, Math.min(160, Math.round(value.travel)));
      if (travel !== TRAVEL_PX) out.travel = travel;
    }
    if ((id === "left" || id === "right") && Number.isFinite(value.adaptive))
      out.adaptive = Math.max(1, Math.min(10, Math.round(value.adaptive)));
    if (directions.includes(value.direction)) out.direction = value.direction;
    for (const field of ["start", "end", "holdEnd"]) {
      if (Number.isFinite(value[field])) out[field] = Math.max(0, Math.min(100, Math.round(value[field])));
    }
    if (out.holdEnd === 100) delete out.holdEnd;
    if (edges.includes(value.fullEdge)) out.fullEdge = value.fullEdge;
    if (edges.includes(value.sliderEdge)) out.sliderEdge = value.sliderEdge;
    if (Number.isFinite(value.sliderStart)) out.sliderStart = Math.max(0, Math.min(100, Math.round(value.sliderStart)));
    if (Number.isFinite(value.sliderEnd)) out.sliderEnd = Math.max(0, Math.min(100, Math.round(value.sliderEnd)));
    if (curves.includes(value.sliderCurve)) out.sliderCurve = value.sliderCurve;
    if (id === "gas" || id === "brake") {
      if (value.sliderEntry === "enter" || value.sliderEntry === "stay") out.sliderEntry = value.sliderEntry;
    }
    if (["percent", "bar"].includes(value.indicator)) out.indicator = value.indicator;
    if (edges.includes(value.fillDirection) && value.fillDirection !== "top") out.fillDirection = value.fillDirection;
    if ([0.5, 2].includes(value.buildPower)) out.buildPower = value.buildPower;
    if ([250, 500, 1000, 2000].includes(value.buildMs)) out.buildMs = value.buildMs;
    if ([25, 70, 100].includes(value.brightness)) out.brightness = value.brightness;
    if (value.feedback === false) out.feedback = false;
    if ((id === "gas" || id === "brake") && ["instant", "ease", "response"].includes(value.slide)) out.slide = value.slide;
    return out;
  }

  function normalizeProfiles(value, keepEmpty = false) {
    if (value === null) return keepEmpty ? EMPTY_PHONE : null;
    if (!object(value) || value.v !== 1 || !object(value.buttons)) return undefined;
    const buttons = {};
    for (const id of allButtons) {
      const clean = overrides(id, value.buttons[id]);
      if (Object.keys(clean).length) buttons[id] = clean;
    }
    if (Object.keys(buttons).length) return { v: 1, buttons };
    // Empty is the valid unpinned shape. A malformed or future-only map
    // should be skipped on import, even when restoring a full backup.
    return Object.keys(value.buttons).length ? undefined : keepEmpty ? EMPTY_PHONE : null;
  }

  // Both entry points load GameStore; keep a session value for isolated input
  // consumers that run without the persistence module.
  let memory = null;
  const memoryListeners = new Set();
  const store = () => typeof GameStore !== "undefined" ? GameStore.store : null;
  const profileKey = () => typeof document !== "undefined" && document.documentElement?.hasAttribute?.("data-phone-controller") ? PHONE_KEY : KEY;
  function saved() {
    const s = store();
    if (!s) return memory;
    // Fork the old shared responses before the first edit on either surface.
    if (s.getStored && s.getStored(PHONE_KEY) === undefined) {
      const shared = normalizeProfiles(s.get(KEY, null)) ?? EMPTY_PHONE;
      s.set(PHONE_KEY, { ...shared, inherited: true }, { migration: true });
    }
    return s.get(profileKey(), null);
  }
  function writeProfiles(value) {
    const key = profileKey(), s = store();
    const durable = s ? s.set(key, key === KEY ? value ?? undefined : value ?? EMPTY_PHONE) : false;
    if (!s) memory = value;
    if (!s?.subscribe) for (const refresh of memoryListeners) refresh();
    return durable;
  }
  function buttonOverrides(id) {
    const raw = saved();
    return overrides(id, allButtons.has(id) && raw && raw.v === 1 && raw.buttons && raw.buttons[id]);
  }
  // Old phone profiles used the presence of a relative slide override to opt in.
  function sliderEntry(profile) {
    return profile.sliderEntry ?? (profile.slide ? "enter" : "stay");
  }
  function buttonProfile(id, globalSlide) {
    const pedal = id === "gas" || id === "brake";
    const slide = pedal && (globalSlide ?? store()?.get("pedalSlide", "instant"));
    const profile = { press: "instant", travel: TRAVEL_PX, slide: slide === "ease" ? "ease" : "instant", feedback: true, ...buttonOverrides(id) };
    if (profile.activation) profile.gestureTiming = gestureTiming[profile.activation];
    return profile;
  }
  function positionLevel(edge, rect, event) {
    const horizontal = edge === "left" || edge === "right";
    const distance = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
    const fraction = distance / (horizontal ? rect.width : rect.height);
    if (!Number.isFinite(fraction)) return undefined;
    const amount = edge === "left" || edge === "top" ? 1 - fraction : fraction;
    return Math.max(0, Math.min(1, amount));
  }

  // One layout read per position-based contact. Absolute sliders sample every
  // movement against this rectangle; relative buttons use only the landing.
  function contactProfile(id, slide, event, el, crossover = false) {
    const profile = buttonProfile(id, slide);
    if (profile.sliderEdge) profile.sliderBounds = el.getBoundingClientRect();
    else if (crossover && profile.slide !== "response") {
      // The inherited, untuned profile keeps its original crossover. An
      // explicit pedal resumes from full input without jumping to its start;
      // an explicit arrow starts its response afresh (#6305). A
      // hold target alone shapes no build, so it is not a tuning.
      profile.trackCrossover = !!buttonOverrides(id).slide || profile.press === "progressive" || profile.travel !== TRAVEL_PX ||
        !!(profile.direction || profile.slideCurve || profile.fullEdge || profile.buildMs) ||
        profile.start != null || profile.end != null;
      if (id === "gas" || id === "brake") profile.start = 100;
    } else if (profile.fullEdge && event) {
      const amount = positionLevel(profile.fullEdge, el.getBoundingClientRect(), event);
      if (amount !== undefined) profile.start = 100 * amount;
    }
    return profile;
  }

  function sliderLevel(profile, event) {
    const position = positionLevel(profile.sliderEdge, profile.sliderBounds, event);
    if (position === undefined) return 0;
    const fraction = responseFraction(position, profile.sliderCurve);
    const start = profile.sliderStart ?? 0, end = profile.sliderEnd ?? 100;
    return (start * (1 - fraction) + end * fraction) / 100;
  }
  function watchButtonProfile(id, callback) {
    const refresh = () => callback(buttonProfile(id));
    refresh();
    if (store()?.subscribe) return store().subscribe(change => {
      if (change.key === profileKey() || change.key === null) refresh();
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
    writeProfiles(Object.keys(buttons).length ? { v: 1, buttons } : null);
    return buttonProfile(id);
  }

  return { raceButtons, phoneButtons, colors, directions, DEAD_PX, DEAD_ZONES, TRAVEL_PX, MIN, RAMP_PX, ease, arrive, level, advance, startPercent, buildOnHold, normalizeProfiles, buttonOverrides, buttonProfile, contactProfile, sliderLevel, sliderEntry,
    watchButtonProfile, setButtonProfile, resetButtonProfile: id => setButtonProfile(id, null) };
})();
Object.freeze(PedalTravel);
