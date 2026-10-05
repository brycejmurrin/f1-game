/* InputHaptics: device/remote vibration, controller rumble and capability checks. Factory instances own their state. */
"use strict";

const InputHaptics = (function () {
  function create({ clamp, activePad, padConnected, remoteActive, remoteHaptics, now }) {
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
    /* ONE EFFECT PER FRAME PER ACTUATOR — A MIXER, NOT A QUEUE OF RIVALS.
       An actuator plays one effect at a time and a new playEffect() PREEMPTS
       the running one (its promise resolves "preempted"). rumble() used to
       call playEffect directly, and the callers overlap on purpose: a lock-up
       pulses the left trigger every 0.14 s while a kerb pulses the grips every
       0.12 s, so each cut the other short and a braking-zone lock-up on a kerb
       felt like neither. The "trigger-rumble" params carry all four motors
       (strongMagnitude, weakMagnitude, leftTrigger, rightTrigger), so every
       channel can ride ONE effect.
       rumble() records a PULSE (channel motor, magnitude, end time). The first
       pulse of a frame plays at once (no added latency); later ones that frame
       mark the mix dirty and flush() — run by Input.poll() at the top of every
       frame — plays the SUM: the strongest live pulse per motor, for as long as
       the longest lasts, re-emitted when a shorter one ends. So at most one
       playEffect per frame, and nothing is cut short by its neighbour.
       The promise: "preempted" by our OWN newer effect is the design; one
       preempted by anything else (another page, a reset) with pulses still
       live re-plays them next frame. A rejection is always caught — an
       unhandled one paints index.html's full-screen overlay — and
       NotSupportedError on trigger-rumble folds the triggers into the grips
       for that actuator from then on.
       https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect
       https://w3c.github.io/gamepad/#dom-gamepadhapticactuator-playeffect
       (the spec RECOMMENDS a 5 s ceiling on duration: MIX_MAX_MS). */
    const MIX_MAX_MS = 5000;
    const pulses = [];             // { motor: "strong"|"weak"|"left"|"right", mag, until }
    let mixDirty = false, frameEmitted = false, nextChange = 0, mixSeq = 0;
    let noTrigActuator = null;     // the actuator that refused trigger-rumble
    const clockMs = typeof now === "function" ? now : () => 0;
    function addPulse(motor, mag, until) { if (mag > 0) pulses.push({ motor, mag, until }); }
    // Best-effort rumble on the active pad. channel:
    //   "brake"    → left trigger (lock-up) when trigger-rumble is available
    //   "throttle" → right trigger (wheelspin / rear slide)
    //   "handles" / omitted → dual-rumble grip motors (kerbs, contact, wall)
    // Unsupported trigger-rumble, or TRIGGER HAPTICS off, falls back to the grips.
    // Silently no-ops where unsupported — note this is EVERY iOS browser:
    // Gamepad.vibrationActuator is false on Safari iOS, so a paired DualSense
    // cannot rumble from a web page and never will. Callers fire vibrate()
    // alongside, so haptics degrade to nothing rather than to an error.
    function rumble(intensity, ms, channel) {
      if (hapticScale <= 0) return;
      if (!padConnected()) return;
      const mag = clamp(intensity, 0, 1) * hapticScale;
      const dur = Math.min(MIX_MAX_MS, Math.max(0, ms | 0));
      if (!(mag > 0) || !dur) return;
      const t = clockMs(), until = t + dur;
      if (triggerHapticsOn && channel === "brake") addPulse("left", mag, until);
      else if (triggerHapticsOn && channel === "throttle") addPulse("right", mag, until);
      else { addPulse("strong", mag, until); addPulse("weak", mag * 0.7, until); }
      if (frameEmitted) { mixDirty = true; return; }
      emit(t);
    }
    // Once per frame, from Input.poll(): open the frame and play what changed.
    function flush() {
      frameEmitted = false;
      const t = clockMs();
      prune(t);
      if (mixDirty || (nextChange && t >= nextChange)) emit(t);
    }
    function prune(t) {
      for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i].until <= t) pulses.splice(i, 1);
    }
    function emit(t) {
      mixDirty = false; nextChange = 0;
      prune(t);
      if (!pulses.length) return;     // the last effect simply runs out
      const pad = activePad();
      if (!pad) { pulses.length = 0; return; }
      frameEmitted = true;
      const m = { strong: 0, weak: 0, left: 0, right: 0 };
      let first = Infinity, last = 0;
      for (const p of pulses) {
        if (p.mag > m[p.motor]) m[p.motor] = p.mag;
        if (p.until < first) first = p.until;
        if (p.until > last) last = p.until;
      }
      const duration = Math.max(1, Math.round(last - t));
      if (first < last) nextChange = first;   // a shorter pulse ends: re-mix then
      const a = pad.vibrationActuator;
      const trig = (m.left > 0 || m.right > 0) && a && a !== noTrigActuator && actuatorHas(a, "trigger-rumble");
      if (!trig && (m.left > 0 || m.right > 0)) {
        // No trigger motors here (or TRIGGER HAPTICS was on when queued and the
        // pad cannot): the grips carry it, as the per-call path always did.
        const tm = Math.max(m.left, m.right);
        m.strong = Math.max(m.strong, tm); m.weak = Math.max(m.weak, tm * 0.7);
        m.left = m.right = 0;
      }
      if (a && typeof a.playEffect === "function") {
        const seq = ++mixSeq;
        try {
          const p = trig
            ? a.playEffect("trigger-rumble", { duration, strongMagnitude: m.strong, weakMagnitude: m.weak,
              leftTrigger: m.left, rightTrigger: m.right })
            : a.playEffect("dual-rumble", { duration, strongMagnitude: m.strong, weakMagnitude: m.weak });
          if (p && typeof p.then === "function") {
            p.then((r) => { if (r === "preempted" && seq === mixSeq) mixDirty = true; },
              (e) => { if (trig && e && e.name === "NotSupportedError") { noTrigActuator = a; mixDirty = true; } });
          }
        } catch (e) { /* a bad receiver can still throw synchronously */ }
        return;
      }
      // Firefox never shipped playEffect and exposes the older, non-standard
      // hapticActuators[].pulse() instead — so without this branch every Firefox
      // player had silent controllers while the code looked like it supported them.
      // It returns a Promise in Gecko too: the try only sees a synchronous throw.
      const legacy = pad.hapticActuators && pad.hapticActuators[0];
      if (legacy && typeof legacy.pulse === "function") {
        try {
          const p = legacy.pulse(Math.max(m.strong, m.left, m.right), duration);
          if (p && p.catch) p.catch(() => {});
        } catch (e) { /* same */ }
      }
    }

    return { setHaptics, setTriggerHaptics, triggerHapticsEnabled, hapticsSupported,
      triggerRumbleSupported, primeHaptics, vibrate, rumble, flush, scale: () => hapticScale };
  }

  return { create };
})();
Object.freeze(InputHaptics);
