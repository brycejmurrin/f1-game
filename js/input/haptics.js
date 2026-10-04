/* InputHaptics: device/remote vibration, controller rumble and capability checks. Factory instances own their state. */
"use strict";

const InputHaptics = (function () {
  function create({ clamp, activePad, padConnected, remoteActive, remoteHaptics }) {
    let hapticScale = 1;
    function setHaptics(v) {
      if (typeof v === "number" && isFinite(v)) hapticScale = clamp(v, 0, 1);
    }
    // TRIGGER HAPTICS (L2/R2 motors via "trigger-rumble"): a separate on/off from
    // the strength slider. Off forces every channel back to dual-rumble grips.
    // Adaptive-trigger RESISTANCE is NOT this — Gamepad API cannot set it (needs
    // WebHID, Chromium only); that path is out of scope. See PLATFORM-INPUT-NOTES.
    let triggerHapticsOn = true;
    function setTriggerHaptics(on) { triggerHapticsOn = !!on; }
    function triggerHapticsEnabled() { return triggerHapticsOn; }
    function actuatorHas(a, effect) {
      return !!(a && a.effects && typeof a.effects.includes === "function" && a.effects.includes(effect));
    }
    // Device vibration, scaled. The try/catch is not optional: Chrome throws if
    // the page has never been interacted with, and iOS Safari has no vibrate at
    // all (WebKit has never shipped it and formally opposes it), so every caller
    // must already survive this doing nothing.
    // Can this device produce ANY haptic? navigator.vibrate is absent from every
    // WebKit (so every iOS browser), and Gamepad.vibrationActuator is false there
    // too — an iPhone can do neither from a web page. The HAPTICS slider says so
    // in its help text, but a control that cannot do anything is better hidden
    // than explained, so steer-tuning.js gates the row on this. Re-read on
    // gamepadconnected and apexhapticschange: a pad or phone can arrive later.
    function hapticsSupported() {
      if (remoteHaptics()) return true;  // the paired phone advertised a vibrator
      const nav = typeof navigator !== "undefined" ? navigator : null;
      // navigator.vibrate exists in desktop Chrome too, where nothing buzzes: it
      // only counts on a touch device (a phone or tablet has the motor).
      if (nav && typeof nav.vibrate === "function" && (nav.maxTouchPoints || 0) > 0) return true;
      const pad = activePad();
      return !!(pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators.length)));   // the Firefox fallback rumble() uses too
    }
    // L2/R2 trigger motors: Chrome/Edge 126+, Opera, Samsung Internet on Win/macOS
    // and Bluetooth Linux/ChromeOS. Not USB-on-Linux, not Android-native, not
    // Safari, not Firefox. Gate the TRIGGER HAPTICS row on this.
    function triggerRumbleSupported() {
      const pad = activePad();
      return !!(pad && pad.vibrationActuator && actuatorHas(pad.vibrationActuator, "trigger-rumble"));
    }

    // PRIME the vibrator from a real click. Chromium requires user activation for
    // navigator.vibrate and no longer counts `touchstart` as one — so the first
    // in-race buzz of a session is dropped with a console intervention and every
    // later one works, which reads as "haptics are flaky" rather than "haptics
    // were never armed". One zero-length call from the GO/START click arms it for
    // the frame's lifetime. Safe everywhere: a no-op where vibrate is absent.
    let hapticPrimed = false;
    function primeHaptics() {
      if (hapticPrimed) return;
      hapticPrimed = true;
      if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
      try { navigator.vibrate(1); } catch (_) { /* advisory only */ }
    }

    function vibrate(ms) {
      if (hapticScale <= 0) return;
      const d = Math.round(ms * hapticScale);
      if (d <= 0) return;
      // The phone that is steering feels the kerb, not the desk the laptop sits on.
      const remote = remoteHaptics();
      if (remote && remoteActive()) { try { remote(d); } catch (_) { /* the link's problem */ } }
      if (typeof navigator === "undefined" || !navigator.vibrate) return;
      try { navigator.vibrate(d); } catch (_) { /* advisory only */ }
    }
    // Best-effort rumble on the active pad. channel:
    //   "brake"    → left trigger (lock-up) when trigger-rumble is available
    //   "throttle" → right trigger (wheelspin / rear slide)
    //   "handles" / omitted → dual-rumble grip motors (kerbs, contact, wall)
    // Unsupported trigger-rumble, or TRIGGER HAPTICS off, falls back to dual-rumble.
    // Silently no-ops where unsupported — note this is EVERY iOS browser:
    // Gamepad.vibrationActuator is false on Safari iOS, so a paired DualSense
    // cannot rumble from a web page and never will. Callers fire vibrate()
    // alongside, so haptics degrade to nothing rather than to an error.
    function rumble(intensity, ms, channel) {
      if (hapticScale <= 0) return;
      if (!padConnected()) return;
      const pad = activePad();
      if (!pad) return;
      const a = pad.vibrationActuator;
      const mag = clamp(intensity, 0, 1) * hapticScale;
      const dur = Math.max(0, ms | 0);
      const wantTrig = triggerHapticsOn && (channel === "brake" || channel === "throttle");
      if (a && typeof a.playEffect === "function") {
        // playEffect() returns a Promise, so this catch only ever saw a
        // SYNCHRONOUS throw — and every failure the Gamepad spec defines is a
        // rejection instead (w3c.github.io/gamepad/#dom-gamepadhapticactuator-playeffect):
        // TypeError for bad params, NotSupportedError for an effect type the
        // actuator cannot play, and — the one that fires in ordinary play —
        // InvalidStateError whenever the document is not fully active or
        // `visibilityState === "hidden"`. rumble() fires on every collision,
        // kerb and gear shift, so a player who alt-tabs or whose phone locks
        // mid-race lands a rejection in the split second a rumble is in flight,
        // and index.html's unhandledrejection handler paints a full-screen
        // overlay over the race on it. Preemption does NOT reject (the spec
        // RESOLVES the older promise with "preempted"), so the arm below only
        // ever swallows a real failure.
        try {
          let p;
          if (wantTrig && actuatorHas(a, "trigger-rumble")) {
            p = a.playEffect("trigger-rumble", {
              duration: dur,
              leftTrigger: channel === "brake" ? mag : 0,
              rightTrigger: channel === "throttle" ? mag : 0,
            });
          } else {
            p = a.playEffect("dual-rumble", {
              duration: dur,
              strongMagnitude: mag,
              weakMagnitude: mag * 0.7,
            });
          }
          if (p && p.catch) p.catch(() => {});
        } catch (e) { /* actuator busy or unsupported effect type */ }
        return;
      }
      // Firefox never shipped playEffect and exposes the older, non-standard
      // hapticActuators[].pulse() instead — so without this branch every Firefox
      // player had silent controllers while the code looked like it supported them.
      const legacy = pad.hapticActuators && pad.hapticActuators[0];
      if (legacy && typeof legacy.pulse === "function") {
        try { legacy.pulse(mag, dur); } catch (e) { /* same */ }
      }
    }

    return { setHaptics, setTriggerHaptics, triggerHapticsEnabled, hapticsSupported,
      triggerRumbleSupported, primeHaptics, vibrate, rumble, scale: () => hapticScale };
  }

  return { create };
})();
Object.freeze(InputHaptics);
