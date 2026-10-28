/* GameAudioMix: radio and spotter duck holds, the SFX-bus dip, and the selective focus bus. create(host) reads live context, sfx bus, sfx level and the soundtrack duck. */
"use strict";

var GameAudioMix = (function () {
  function create(host) {
    /* TWO HOLDS, ONE DUCK. The engineer (radio-voice.js) and the spotter
     * (radioVoice clips) each latch independently: say()/stopVoice always pairs
     * setRadioDuck(false) on a card replace, and that must not lift the music
     * under a spotter call still finishing its remaining() lead — nor the reverse
     * when a spotter clip ends while an engineer line is still on air.
     * THE RADIO HOLD IS PER SOURCE TOO: the engineer, every WATCH clip and the
     * real-replay fallback pass their own id (default "radio" = the engineer), so
     * one of them letting go cannot lift the music under another still on air.
     *
     * MIX DUCK (Job 5). Radio already emits via setRadioDuck(on, src) — this
     * block only SUBSCRIBES. Music still dips through soundtrack.setRadioDuck
     * (0.35 ≈ −9 dB). The SFX bus dips here (−8 dB, 80 ms attack / 400 ms
     * release via setTargetAtTime). Overlapping holds do not re-ramp (no pump).
     * Engine stays on the SFX bus at ~0.4 — audible, not muted. Zero new nodes. */
    const radioDuckHolds = new Set();
    let spotterDuckHold = false;
    const MIX_DUCK_LIN = 10 ** (-8 / 20);   // ≈ 0.3981, mid of −6…−10 dB
    const MIX_DUCK_ATTACK_TAU = 0.08;
    const MIX_DUCK_RELEASE_TAU = 0.4;
    let mixDuckOn = false;
    // Optional selective focus. STANDARD (0) keeps the legacy whole-SFX mix.
    let radioFocusDb = 0, focusBus = null;
    const focusVoices = new Map();
    let focusCurve = { at: 0, value: 1, events: [] }, sfxCurve = { at: 0, value: 1, events: [] };
    function curveValue(curve, time) {
      let value = curve.value, at = curve.at, target = value, tau = 1;
      for (const e of curve.events) {
        if (e.at > time) break;
        value = target + (value - target) * Math.exp(-(e.at - at) / tau);
        at = e.at; target = e.target; tau = e.tau;
      }
      return target + (value - target) * Math.exp(-Math.max(0, time - at) / tau);
    }
    function writeCurve(param, curve, events) {
      const ctx = host.context();
      const t = ctx.currentTime, value = curveValue(curve, t);
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { param.cancelScheduledValues(t); param.setValueAtTime(value, t); }
      curve.at = t; curve.value = value; curve.events = events;
      for (const e of events) param.setTargetAtTime(e.target, e.at, e.tau);
    }
    function sfxBusTarget() {
      const sfxEnabled = host.sfxEnabled(), sfxVol = host.sfxVol();
      if (!sfxEnabled) return 0;
      return sfxVol * (!radioFocusDb && mixDuckOn ? MIX_DUCK_LIN : 1);
    }
    function writeSfx(tau) {
      const ctx = host.context(), sfxBus = host.sfxBus();
      if (sfxBus && ctx) writeCurve(sfxBus.gain, sfxCurve,
        [{ at: ctx.currentTime, target: sfxBusTarget(), tau }]);
    }
    function refreshFocus(tau) {
      const ctx = host.context();
      if (!focusBus || !ctx) return;
      const sfxEnabled = host.sfxEnabled(), sfxVol = host.sfxVol();
      const t = ctx.currentTime, spans = [], base = sfxEnabled ? sfxVol : 0;
      if (!radioFocusDb) {
        const target = sfxBusTarget();
        if (focusCurve.events.length === 1 && focusCurve.events[0].target === target) return;
        writeCurve(focusBus.gain, focusCurve, [{ at: t, target, tau: tau || (target < curveValue(focusCurve, t) ? MIX_DUCK_ATTACK_TAU : MIX_DUCK_RELEASE_TAU) }]);
        return;
      }
      for (const [owner, v] of focusVoices) {
        if (v.context !== ctx || v.end <= t) { focusVoices.delete(owner); continue; }
        if (radioFocusDb) spans.push([Math.max(t, v.start), v.end]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const span of spans) {
        const prev = merged[merged.length - 1];
        if (prev && span[0] <= prev[1]) prev[1] = Math.max(prev[1], span[1]);
        else merged.push(span.slice());
      }
      const lin = base * 10 ** (-radioFocusDb / 20), events = [];
      if (!merged.length || merged[0][0] > t) events.push({ at: t, target: base, tau: tau || MIX_DUCK_RELEASE_TAU });
      for (const span of merged) {
        events.push({ at: span[0], target: lin, tau: span[0] === t ? (tau || (lin < curveValue(focusCurve, t) ? MIX_DUCK_ATTACK_TAU : MIX_DUCK_RELEASE_TAU)) : MIX_DUCK_ATTACK_TAU });
        if (Number.isFinite(span[1])) events.push({ at: span[1], target: base, tau: MIX_DUCK_RELEASE_TAU });
      }
      writeCurve(focusBus.gain, focusCurve, events);
    }
    function setVoiceFocusSpan(owner, start, end, context) {
      const ctx = host.context();
      if (context !== ctx || !ctx || !Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) return false;
      focusVoices.set(owner, { context, start, end }); refreshFocus(); return true;
    }
    function setVoiceFocusHold(on, owner) {
      const ctx = host.context();
      if (!owner) return false;
      if (on && ctx) focusVoices.set(owner, { context: ctx, start: ctx.currentTime, end: Infinity });
      else focusVoices.delete(owner);
      refreshFocus(); return !!on && !!ctx;
    }
    function setRadioFocusDb(value) {
      const ctx = host.context();
      const db = [0, 4, 8, 12].indexOf(value) >= 0 ? value : 0;
      if (db === radioFocusDb) return radioFocusDb;   // repeated lazy/panel restore is inert
      radioFocusDb = db;
      const lowering = ctx && sfxBusTarget() < curveValue(sfxCurve, ctx.currentTime);
      writeSfx(lowering ? MIX_DUCK_ATTACK_TAU : MIX_DUCK_RELEASE_TAU);
      refreshFocus(); return radioFocusDb;
    }
    function applySfxDuck(on) {
      const want = !!on, changed = want !== mixDuckOn;
      mixDuckOn = want;
      if (changed) { writeSfx(want ? MIX_DUCK_ATTACK_TAU : MIX_DUCK_RELEASE_TAU); refreshFocus(); }
      return mixDuckOn;
    }
    function applyMusicDuck() {
      const on = radioDuckHolds.size > 0 || spotterDuckHold;
      applySfxDuck(on);
      return host.soundtrackRadioDuck(on);
    }
    function setRadioDuck(on, src) {
      const id = src == null ? "radio" : String(src);
      if (on) radioDuckHolds.add(id); else radioDuckHolds.delete(id);
      return applyMusicDuck();
    }
    function setSpotterDuck(on) {
      spotterDuckHold = !!on;
      return applyMusicDuck();
    }
    function getRadioFocusDb() { return radioFocusDb; }
    // New context: set the bus gains and curve clocks, return the focus node.
    // The caller connects both buses; this does not.
    function primeBuses(bus) {
      const ctx = host.context();
      mixDuckOn = radioDuckHolds.size > 0 || spotterDuckHold;
      bus.gain.value = sfxBusTarget();
      focusBus = ctx.createGain();
      focusBus.gain.value = sfxBusTarget();
      focusCurve = { at: ctx.currentTime, value: sfxBusTarget(), events: [] };
      sfxCurve = { at: ctx.currentTime, value: sfxBusTarget(), events: [] };
      return focusBus;
    }
    // Dying context: drop the focus node and its spans before radio teardown.
    function releaseBuses() {
      focusBus = null;
      focusVoices.clear();
    }
    // After radio.resetContext(). Clears latches without another soundtrack call;
    // the next applyMusicDuck (reapplyContextState) is what releases the music.
    function dropHolds() {
      radioDuckHolds.clear();
      spotterDuckHold = false;
      mixDuckOn = false;
    }
    function snapshot() {
      const ctx = host.context(), bus = host.sfxBus();
      return {
        on: mixDuckOn,
        focusDb: radioFocusDb, focusHolds: focusVoices.size,
        focusValue: ctx ? curveValue(focusCurve, ctx.currentTime) : 1,
        focusEvents: focusCurve.events.map((e) => ({ ...e })),
        holds: radioDuckHolds.size + (spotterDuckHold ? 1 : 0),
        lin: MIX_DUCK_LIN,
        attackTau: MIX_DUCK_ATTACK_TAU,
        releaseTau: MIX_DUCK_RELEASE_TAU,
        sfx: bus ? +bus.gain.value : 0,
      };
    }
    return {
      setRadioDuck, setSpotterDuck, setVoiceFocusHold, setVoiceFocusSpan, setRadioFocusDb, getRadioFocusDb,
      applySfxDuck, applyMusicDuck, writeSfx, refreshFocus, primeBuses, releaseBuses, dropHolds, snapshot,
    };
  }
  return { create };
})();
Object.freeze(GameAudioMix);
