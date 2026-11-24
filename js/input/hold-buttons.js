/* InputHoldButtons: multi-pointer hold/tap buttons, analog travel and teardown safety nets. Factory instances own their state. */
"use strict";

const InputHoldButtons = (function () {
  function create({ beforeReleaseAll, slideEase }) {
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
    const holdById = new Map();   // id -> record: a hand-off finds its sibling without a DOM lookup
    const holdByEl = new Map();   // el -> holdBtns record: lostpointercapture looks its button up without a scan
    function holdReleasePointer(pointerId) {
      for (const h of holdBtns) h.release(pointerId);
    }
    function holdReleaseAll(keepLatch, touchOnly = false) {
      // A LATCH DROPS HERE on the everything-off paths (window blur, page hidden,
      // Input.reset): a latched throttle surviving a blur means the car
      // accelerates while the player is not looking at it. NOT on the last finger
      // lifting (keepLatch): TouchEvent.touches is empty on every ordinary lift, so
      // dropping it there switched LATCH off the moment the thumb left GAS.
      beforeReleaseAll(keepLatch);
      for (const h of holdBtns) {
        if (touchOnly) {
          for (const id of h.touchIds) h.release(id);
          continue;
        }
        h.ids.clear(); h.touchIds.clear();
        h.anchors && h.anchors.clear();
        h.levels && h.levels.clear();
        h.live && h.live.clear();
        h.slid.clear(); h.gone.clear();
        look(h.el, null);
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
      try {
        const s = getComputedStyle(el);
        if (s.visibility === "hidden") return true;
      } catch (_) { /* getComputedStyle can throw on a detached node */ }
      // display does not inherit: the button's own computed display can stay
      // "block" beneath a hidden container. Visibility, however, can be
      // overridden by a descendant, so inspect that on the button only.
      for (let node = el; node; node = node.parentElement) {
        if (node.hidden) return true;
        try {
          if (getComputedStyle(node).display === "none") return true;
        } catch (_) { /* getComputedStyle can throw on a detached node */ }
      }
      return false;
    }
    function lostCaptureShouldRelease(el, pointerId) {
      if (!el || el === document || !el.isConnected) return true;
      const h = holdByEl.get(el);
      const wasVisible = !!(h && h.live.get(pointerId));
      if (!wasVisible) return false;
      return holdTargetGone(el);
    }

    // SLIDE HAND-OFF (#5575). A captured pointer stayed with the control it landed
    // on, so a thumb slid from GAS up onto BRAKE never braked (and left 12 %
    // throttle on), and one slid from the left arrow onto the right kept steering
    // left. A hold button wired with `opts.sibling` now gives the contact away the
    // moment it is inside that sibling's box: THE CONTROL UNDER THE FINGER WINS.
    //   - only THAT pointer moves; a second finger on either control is untouched;
    //   - arrival normally stays full. A pedal with eased crossover ramps up;
    //     a progressive steering arrow treats the entry point as a fresh press;
    //   - it hands back the same way, and every release net above still applies
    //     to whichever control holds the pointer now.
    // The HUD can move without rotating. Hit-test the current layout even when
    // pointer capture still routes movement events to the original button.
    // data-slid = "on" | "off": the pressed look, which `:active` cannot carry across a hand-off.
    const look = (el, v) => { if (!el || !el.setAttribute) return; if (v) el.setAttribute("data-slid", v); else el.removeAttribute("data-slid"); };
    function boxOf(el) {
      if (!el || el.hidden || el.disabled || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    }
    const inBox = (r, x, y) => !!r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

    // Each held pointer snapshots its button response. Direct presses can ease
    // off along the original axis or build pressure by sliding in any direction.
    // Hand-offs use the receiving control's separate crossover preference.
    function activationKey(e) {
      if (e.code === "Space" || e.key === " ") return "Space";
      if (e.code === "NumpadEnter") return e.code;
      return e.code === "Enter" || e.key === "Enter" ? "Enter" : null;
    }
    function wireHold(id, apply, level, opts) {
      const el = document.getElementById(id);
      if (!el) return;
      suppressLoupe(el);
      const axis = (opts && opts.axis) === "x" ? "x" : "y";
      const dir = (opts && opts.dir) || 1;
      const ids = new Set();
      const touchIds = new Set(); // Includes slid-away contacts until lift; mouse/pen holds survive touch cleanup.
      const anchors = level ? new Map() : null;   // pointerId -> touchdown position and response
      const levels = level ? new Map() : null;    // pointerId -> current travel
      const live = new Map();                     // pointerId -> visible at pointerdown
      const sibId = opts && opts.sibling;
      const slid = new Set();                     // contacts that arrived by a slide (pressed look)
      const gone = new Set();                     // pointerIds that slid AWAY and are still down (pressed-look only)
      // Every contact holds independently: easing or releasing one finger must
      // not override another finger's stronger press. Both release routes use
      // the same aggregation, including window capture before the local event.
      // The last travel reported: a thumb resting in the dead band sends pointermove at the
      // digitizer rate with an unchanged level, so only a CHANGE reaches the callback.
      if (level) PedalTravel.watchButtonProfile(opts?.button || id, profile => {
        if (profile.brightness) el.style?.setProperty?.("--touch-brightness", profile.brightness + "%");
        else el.style?.removeProperty?.("--touch-brightness");
        if (opts?.button !== "gas" && profile.feedback && !profile.sliderEdge && profile.press === "progressive") el.setAttribute("data-touch-response", "progressive");
        else el.removeAttribute?.("data-touch-response");
      });
      let painted = NaN, paintedCommand = NaN, paintedProfile = null;
      const paint = level ? (v, profile = null) => {
        const command = v && opts?.command ? opts.command(v, profile) : v;
        if (painted === v && paintedCommand === command && paintedProfile === profile) return;
        if (el.style && el.style.setProperty && (profile?.feedback || paintedProfile?.feedback)) {
          if (profile?.feedback) {
            if (command !== paintedCommand || !paintedProfile?.feedback) el.style.setProperty("--touch-level", String(command));
            if (!paintedProfile?.feedback) el.setAttribute("data-touch-feedback", "on");
          } else {
            el.style.removeProperty("--touch-level");
            el.removeAttribute("data-touch-feedback");
            el.removeAttribute("data-grip-cue");
          }
        }
        painted = v; paintedCommand = command; paintedProfile = profile;
        level(v, command, profile);
      } : null;
      function paintLevel() {
        if (!level) return;
        let strongest = 0, profile = null;
        for (const [id, value] of levels) {
          if (!profile || value > strongest) { strongest = value; profile = anchors.get(id).profile; }
        }
        paint(strongest, profile);
      }
      function release(pointerId) {
        touchIds.delete(pointerId);
        if (gone.delete(pointerId) && gone.size === 0 && slid.size === 0) look(el, null);
        if (slid.delete(pointerId) && slid.size === 0) look(el, gone.size ? "off" : null);
        anchors && anchors.delete(pointerId);
        levels && levels.delete(pointerId);
        live.delete(pointerId);
        if (!ids.delete(pointerId)) return;
        if (ids.size === 0) apply(false);
        paintLevel();
      }
      function buildFromAnchor(pointer, contact) {
        if (contact.profile.sliderEdge || !contact.profile.buildMs) return;
        PedalTravel.buildOnHold(contact, () => anchors.get(pointer) === contact, value => {
          levels.set(pointer, value);
          paintLevel();
        });
      }
      function press(e, arrived) {
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone (cancelled between down and here); the button still works uncaptured */ }
        // Only the FIRST contact is a press edge: THROTTLE = LATCH toggles on every
        // apply(true), so a second finger landing on GAS cancelled the latch while
        // the first was still down.
        const firstContact = ids.size === 0;
        ids.add(e.pointerId);
        if (e.pointerType === "touch") touchIds.add(e.pointerId);
        else touchIds.delete(e.pointerId);
        // A TRUSTED press hit-tested a rendered button, so it was visible: only a synthetic
        // (dispatched) event pays holdTargetGone's getComputedStyle walk up every ancestor.
        live.set(e.pointerId, e.isTrusted === false ? !holdTargetGone(el) : true);
        if (firstContact) apply(true);
        if (level) {
          const crossingPedal = arrived && axis === "y";
          const profile = PedalTravel.contactProfile(opts?.button || id, slideEase?.() ? "ease" : "instant",
            arrived && !crossingPedal ? null : e, el, crossingPedal);
          const trackTravel = !!profile.sliderEdge || !arrived ||
            (crossingPedal ? profile.trackCrossover || profile.slide === "response" : profile.press === "progressive");
          const ramp = crossingPedal && !profile.sliderEdge && profile.slide === "ease";
          const contact = { x: e.clientX, y: e.clientY, profile, trackTravel, ramp };
          anchors.set(e.pointerId, contact);
          const initial = profile.sliderEdge ? PedalTravel.sliderLevel(profile, e) :
            ramp ? PedalTravel.MIN : trackTravel ? PedalTravel.level(profile, 0) : 1;
          levels.set(e.pointerId, initial);
          paintLevel();
          if (!ramp && (!arrived || crossingPedal)) buildFromAnchor(e.pointerId, contact);
        }
        gone.clear();
        if (arrived) slid.add(e.pointerId);
        look(el, slid.size ? "on" : null);
      }
      // The contact left for the sibling: release it here, press it there.
      function handOff(e) {
        const to = holdById.get(sibId);
        if (!to || to.el.hidden || to.el.disabled) return false;
        // Capture keeps e.target on the current pedal. The visible sibling must
        // actually be under the finger, especially where custom dock boxes overlap.
        if (document.elementFromPoint) {
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          if (hit !== to.el && !to.el.contains?.(hit)) return false;
        } else if (!inBox(boxOf(to.el), e.clientX, e.clientY)) return false;
        release(e.pointerId);
        try { el.releasePointerCapture(e.pointerId); } catch (_) { /* capture already gone */ }
        gone.add(e.pointerId);
        if (e.pointerType === "touch") touchIds.add(e.pointerId);
        if (!slid.size) look(el, "off");
        to.press(e, true);
        return true;
      }
      // Keyboard contacts share the same strongest-contact and first/last-edge rules as thumbs.
      let assistiveContact;
      function digitalPress(key) {
        if (ids.has(key) || el.disabled || el.getAttribute?.("aria-disabled") === "true") return;
        if (!ids.size) apply(true);
        ids.add(key);
        if (level) {
          anchors.set(key, { profile: PedalTravel.buttonProfile(opts?.button || id) });
          levels.set(key, 1);
          paintLevel();
        }
      }
      el.addEventListener("keydown", e => {
        const key = activationKey(e);
        if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) digitalPress(key);
      });
      el.addEventListener("keyup", e => { release(activationKey(e)); });
      el.addEventListener("blur", () => { for (const key of ids) if (typeof key !== "number") release(key); });
      el.addEventListener("click", e => {
        if (e.detail !== 0) return;
        // Assistive activation has no matching up event. Give the sim a short, bounded press.
        release(assistiveContact);
        const key = assistiveContact = Symbol();
        digitalPress(key);
        setTimeout(() => release(key), 100);
      });
      const rec = { ids, touchIds, apply, level: paint, anchors, levels, el, live, release, press, slid, gone, paintLevel, move: null };
      holdBtns.push(rec);
      holdByEl.set(el, rec);
      holdById.set(id, rec);
      el.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;   // a right-click opens a context menu and may never send pointerup
        e.preventDefault();
        press(e, false);
      });
      // After a hand-off the moves normally follow the new capture, but a browser
      // that keeps a touch with the control it LANDED on must work too, so a move
      // for a pointer the sibling holds is the sibling's to read.
      if (level || sibId) el.addEventListener("pointermove", e => {
        if (ids.has(e.pointerId)) { rec.move(e); return; }
        const to = sibId && holdById.get(sibId);
        if (to && to.move && to.ids.has(e.pointerId)) to.move(e);
      });
      if (level || sibId) rec.move = (e) => {
        if (sibId && handOff(e)) return;
        const a = anchors ? anchors.get(e.pointerId) : null;
        if (!a || (!a.ramp && !a.trackTravel)) return;
        const dx = e.clientX - a.x, dy = e.clientY - a.y;
        if (a.ramp) {
          const lv = Math.max(levels.get(e.pointerId), PedalTravel.arrive(Math.hypot(dx, dy)));
          levels.set(e.pointerId, lv);
          if (lv === 1) {
            a.ramp = false;
            a.x = e.clientX; a.y = e.clientY;
            if (a.trackTravel) buildFromAnchor(e.pointerId, a);
          }
        } else if (a.profile.sliderEdge) {
          a.profile.sliderBounds = el.getBoundingClientRect();
          levels.set(e.pointerId, PedalTravel.sliderLevel(a.profile, e));
        } else {
          a.advance = PedalTravel.advance(a.profile, dx, dy, axis === "x" ? -dir * dx : -dy);
          levels.set(e.pointerId, PedalTravel.level(a.profile, a.advance, a.holdFraction));
        }
        paintLevel();
      };
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
      suppressLoupe(el);
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
        if (!activationKey(e)) return;
        // Activate once on DOWN, like a pointer paddle. Spend the native default
        // so it cannot click again; keep Space off the window's BOOST binding.
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) el.click();
      });
      // KEYUP must reach Input: a driving key held before this button gained
      // focus still needs its release (including a rebound Space/GAS binding).
    }

    return { wireHold, wireTap, holdReleasePointer, holdReleaseAll, holdTargetGone, lostCaptureShouldRelease,
      refreshLevels() { for (const h of holdBtns) if (h.ids.size) h.paintLevel(); },
      pointerCounts: () => holdBtns.map((h) => h.ids.size) };
  }

  // WebKit can show its magnifier after tap-then-hold despite touch-action
  // and user-select (bug 296492). Pointer events still drive the controls.
  function suppressLoupe(el) {
    el.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  }

  // With native touch activation cancelled, activate on pointerup. Mouse and
  // keyboard keep their normal click path.
  function hudTouchTap(el, { activate = (_e) => el.click(), cancel = () => {}, beforeActivate = (_e) => true } = {}) {
    if (!el || !el.addEventListener) return;
    suppressLoupe(el);
    let down = null, consumed = null;
    const clear = () => { if (down && !down.cancelled) cancel(); if (down) down.cancelled = true; };
    const remember = e => { consumed = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp }; };
    const enabled = () => !el.disabled && !el.hidden && el.isConnected !== false && el.getAttribute("aria-disabled") !== "true" && (!el.checkVisibility || el.checkVisibility({ checkVisibilityCSS: true }));
    const inside = e => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    window.addEventListener("pointerdown", e => { consumed = null; if (down && down.id === e.pointerId) { clear(); down = null; } }, true);
    el.addEventListener("pointerdown", e => {
      clear(); down = null;
      if (e.pointerType !== "touch" || !enabled()) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* implicit touch capture remains */ }
    });
    el.addEventListener("pointermove", e => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) clear(); });
    el.addEventListener("pointerup", e => {
      if (!down || e.pointerId !== down.id) return;
      const cancelled = down.cancelled; down = null; remember(e);
      if (cancelled || !enabled() || !inside(e)) { if (!cancelled) cancel(); return; }
      // Keep this contact's native click from reaching a newly opened modal.
      if (beforeActivate(e) !== false) activate(e);
    });
    window.addEventListener("pointerup", e => { if (down && e.pointerId === down.id && (down.cancelled || !enabled())) { clear(); remember(e); down = null; } }, true);
    for (const type of ["pointercancel", "lostpointercapture"]) el.addEventListener(type, e => { if (down && e.pointerId === down.id) clear(); });
    if (typeof MutationObserver !== "undefined") new MutationObserver(() => { if (!enabled()) clear(); }).observe(el, { attributes: true, attributeFilter: ["hidden", "style", "class"] });
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    window.addEventListener("orientationchange", clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
    window.addEventListener("click", e => {
      const c = consumed;
      if (!c || !e.isTrusted || e.detail === 0 || e.timeStamp < c.at || e.timeStamp - c.at > 750) return;
      if ((typeof e.pointerId === "number" && e.pointerId !== c.id) || Math.hypot(e.clientX - c.x, e.clientY - c.y) > 12) return;
      consumed = null; e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  }

  return { create, hudTouchTap };
})();
Object.freeze(InputHoldButtons);
