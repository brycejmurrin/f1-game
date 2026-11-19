"use strict";

const InputHaptics = (function () {
  function create({ clamp, activePad, padConnected, remoteActive, remoteHaptics, now }) {
    let hapticScale = 1;
    function setHaptics(v) {
      if (typeof v !== "number" || !isFinite(v)) return;
      const next = clamp(v, 0, 1);
      if (next === hapticScale) return;
      hapticScale = next;
      if (!next) { pulses.length = 0; mixDirty = false; nextChange = 0; stopActuator(); }
      else if (pulses.length) mixDirty = true;
    }
    let triggerHapticsOn = true;
    function setTriggerHaptics(on) {
      if (triggerHapticsOn === !!on) return;
      triggerHapticsOn = !!on;
      if (pulses.length) mixDirty = true;
    }
    function actuatorHas(a, effect) {
      return !!(a && a.effects && typeof a.effects.includes === "function" && a.effects.includes(effect));
    }
    function hapticsSupported() {
      if (remoteHaptics()) return true;
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.vibrate === "function" && (nav.maxTouchPoints || 0) > 0) return true;
      const pad = activePad();
      return !!(pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators.length)));
    }
    function triggerRumbleSupported() {
      const pad = activePad();
      return !!(pad && pad.vibrationActuator && actuatorHas(pad.vibrationActuator, "trigger-rumble"));
    }

    let hapticPrimed = false;
    function primeHaptics() {
      if (hapticPrimed) return;
      hapticPrimed = true;
      if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
      try { navigator.vibrate(1); } catch (_) {  }
    }

    function vibrate(ms) {
      if (hapticScale <= 0) return;
      const d = Math.round(ms * hapticScale);
      if (d <= 0) return;
      const remote = remoteHaptics();
      if (remote && remoteActive()) { try { remote(d); } catch (_) {  } }
      if (typeof navigator === "undefined" || !navigator.vibrate) return;
      try { navigator.vibrate(d); } catch (_) {  }
    }
    const MIX_MAX_MS = 5000;
    const pulses = [];
    let mixDirty = false, frameEmitted = false, nextChange = 0, mixSeq = 0;
    let noTrigActuator = null;
    const clockMs = typeof now === "function" ? now : () => 0;
    let lastActuator = null;
    function stopActuator() {
      ++mixSeq;
      const a = lastActuator;
      lastActuator = null;
      if (!a) return;
      try {
        const p = typeof a.reset === "function" ? a.reset() : typeof a.playEffect === "function"
          ? a.playEffect("dual-rumble", { duration: 0, strongMagnitude: 0, weakMagnitude: 0 }) : a.pulse(0, 0);
        if (p && p.catch) p.catch(() => {});
      } catch (_) {  }
    }
    function addPulse(motor, mag, until) { if (mag > 0) pulses.push({ motor, mag, until }); }
    function rumble(intensity, ms, channel) {
      if (hapticScale <= 0) return;
      if (!padConnected()) return;
      const mag = clamp(intensity, 0, 1);
      const dur = Math.min(MIX_MAX_MS, Math.max(0, ms | 0));
      if (!(mag > 0) || !dur) return;
      const t = clockMs(), until = t + dur;
      if (channel === "brake") addPulse("left", mag, until);
      else if (channel === "throttle") addPulse("right", mag, until);
      else { addPulse("strong", mag, until); addPulse("weak", mag * 0.7, until); }
      if (frameEmitted) { mixDirty = true; return; }
      emit(t);
    }
    function flush() {
      frameEmitted = false;
      const t = clockMs();
      prune(t);
      if (!padConnected()) {
        if (pulses.length || lastActuator) { pulses.length = 0; nextChange = 0; mixDirty = false; stopActuator(); }
        return;
      }
      if (mixDirty || (nextChange && t >= nextChange)) emit(t);
    }
    function prune(t) {
      for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i].until <= t) pulses.splice(i, 1);
    }
    function emit(t) {
      mixDirty = false; nextChange = 0;
      prune(t);
      if (!hapticScale || !pulses.length) return;
      const pad = activePad();
      if (!pad) { pulses.length = 0; stopActuator(); return; }
      frameEmitted = true;
      const m = { strong: 0, weak: 0, left: 0, right: 0 };
      let first = Infinity, last = 0;
      for (const p of pulses) {
        if (p.mag * hapticScale > m[p.motor]) m[p.motor] = p.mag * hapticScale;
        if (p.until < first) first = p.until;
        if (p.until > last) last = p.until;
      }
      const duration = Math.max(1, Math.round(last - t));
      if (first < last) nextChange = first;
      const a = pad.vibrationActuator;
      const trig = triggerHapticsOn && (m.left > 0 || m.right > 0) && a && a !== noTrigActuator && actuatorHas(a, "trigger-rumble");
      if (!trig && (m.left > 0 || m.right > 0)) {
        const tm = Math.max(m.left, m.right);
        m.strong = Math.max(m.strong, tm); m.weak = Math.max(m.weak, tm * 0.7);
        m.left = m.right = 0;
      }
      if (a && typeof a.playEffect === "function") {
        lastActuator = a;
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
        } catch (e) {  }
        return;
      }
      const legacy = pad.hapticActuators && pad.hapticActuators[0];
      if (legacy && typeof legacy.pulse === "function") {
        lastActuator = legacy;
        try {
          const p = legacy.pulse(Math.max(m.strong, m.left, m.right), duration);
          if (p && p.catch) p.catch(() => {});
        } catch (e) {  }
      }
    }

    return { setHaptics, setTriggerHaptics, hapticsSupported,
      triggerRumbleSupported, primeHaptics, vibrate, rumble, flush, scale: () => hapticScale };
  }

  return { create };
})();
Object.freeze(InputHaptics);
