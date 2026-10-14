/* ErsLayer — player-car MGU-K electric layer and overtake/boost cue.
   Fixed node set built once in attach(); update() only aims existing params
   via setTargetAtTime. Zero nodes per frame. Reads ERS/battery/boost state
   that GameAudio.setEngine already receives (game.js _engArg: deploy, energy,
   brake, ax) — never writes car state. */
"use strict";

var ErsLayer = (function () {
  const DEPLOY_HZ0 = 1880, DEPLOY_HZ_SPAN = 1720;
  const HARVEST_HZ0 = 380, HARVEST_HZ_SPAN = 340;
  const SUSTAIN_HZ = 880, CUE_HZ = 1480, CUE_PEAK = 0.055;
  const EMPTY = 1e-4, DEPLOY_GATE = 0.12, HARVEST_GATE = 0.04, CUE_REARM = 0.12;

  function clamp01(x) {
    x = +x;
    if (!(x > 0)) return 0;
    if (x > 1) return 1;
    return x;
  }

  function socK(energy) { return 0.22 + 0.78 * clamp01(energy); }

  function isLive(energy, layerOn, ersOn) {
    return layerOn !== false && ersOn !== false && clamp01(energy) > EMPTY;
  }

  /** Deploy whine Hz: rises with deploy power; sagging pack drops ~12%. */
  function deployHz(deploy, energy) {
    const d = clamp01(deploy);
    const e = clamp01(energy);
    const low = e < 0.2 ? 0.88 + 0.12 * (e / 0.2) : 1;
    return (DEPLOY_HZ0 + DEPLOY_HZ_SPAN * d) * low;
  }

  /** Harvest/regen Hz: lower register, braking-linked, never overlaps deploy. */
  function harvestHz(brake) { return HARVEST_HZ0 + HARVEST_HZ_SPAN * clamp01(brake); }

  function deployGain(deploy, energy, opts) {
    const o = opts || {};
    if (!isLive(energy, o.layerOn, o.ersOn)) return 0;
    const d = clamp01(deploy);
    if (!(d > 0)) return 0;
    const e = clamp01(energy);
    const low = e < 0.2 ? e / 0.2 : 1;
    const part = o.partBias != null ? o.partBias : 1;
    const tune = o.boostTune != null ? o.boostTune : 1;
    const s = o.speed != null ? clamp01(o.speed) : 0.75;
    return (0.012 + 0.026 * d * (0.35 + 0.65 * e)) * (0.4 + 0.6 * low)
      * part * tune * (0.42 + 0.58 * Math.max(s, 0.04));
  }

  function harvestGain(brake, energy, deploy, opts) {
    const o = opts || {};
    if (!isLive(energy, o.layerOn, o.ersOn)) return 0;
    if (clamp01(deploy) >= 0.05) return 0;
    const b = clamp01(brake);
    if (!(b > HARVEST_GATE)) return 0;
    return (0.008 + 0.022 * b) * socK(energy);
  }

  function sustainGain(on, energy, opts) {
    const o = opts || {};
    if (!on || !isLive(energy, o.layerOn, o.ersOn)) return 0;
    const tune = o.boostTune != null ? o.boostTune : 1;
    return 0.006 * socK(energy) * tune;
  }

  function aim(param, target, t, tau, rel) {
    if (!param || typeof param.setTargetAtTime !== "function") return;
    const prev = param._ersAim;
    const close = rel
      ? prev !== undefined && Math.abs(prev - target) <= Math.abs(target) * rel
      : prev !== undefined && Math.abs(prev - target) < 1e-4;
    if (prev === target || close) return;
    param.setTargetAtTime(target, t, tau);
    param._ersAim = target;
  }

  let ctx = null, dest = null;
  let deployOsc = null, deployHp = null, deployG = null;
  let harvestOsc = null, harvestBp = null, harvestG = null;
  let sustainOsc = null, sustainG = null;
  let cueOsc = null, cueG = null;
  let wasBoost = false, cueFired = 0, lastCueT = -1e9, built = 0;

  function stopNode(n) {
    try { if (n && n.stop) n.stop(); } catch (e) { /* already stopped */ }
    try { if (n && n.disconnect) n.disconnect(); } catch (e) { /* torn down */ }
  }

  function detach() {
    stopNode(deployOsc); stopNode(deployHp); stopNode(deployG);
    stopNode(harvestOsc); stopNode(harvestBp); stopNode(harvestG);
    stopNode(sustainOsc); stopNode(sustainG);
    stopNode(cueOsc); stopNode(cueG);
    deployOsc = deployHp = deployG = null;
    harvestOsc = harvestBp = harvestG = null;
    sustainOsc = sustainG = cueOsc = cueG = null;
    ctx = dest = null;
    wasBoost = false;
    lastCueT = -1e9;
  }

  function attach(ac, bus) {
    if (!ac || !bus) return;
    if (ctx === ac && dest === bus && deployOsc) return;
    detach();
    ctx = ac;
    dest = bus;
    deployOsc = ctx.createOscillator();
    deployOsc.type = "triangle";
    deployOsc.frequency.value = DEPLOY_HZ0;
    deployHp = ctx.createBiquadFilter();
    deployHp.type = "highpass";
    deployHp.frequency.value = 1400;
    deployG = ctx.createGain();
    deployG.gain.value = 0;
    deployOsc.connect(deployHp).connect(deployG).connect(dest);

    harvestOsc = ctx.createOscillator();
    harvestOsc.type = "sine";
    harvestOsc.frequency.value = HARVEST_HZ0;
    harvestBp = ctx.createBiquadFilter();
    harvestBp.type = "bandpass";
    harvestBp.frequency.value = HARVEST_HZ0;
    harvestBp.Q.value = 5;
    harvestG = ctx.createGain();
    harvestG.gain.value = 0;
    harvestOsc.connect(harvestBp).connect(harvestG).connect(dest);

    sustainOsc = ctx.createOscillator();
    sustainOsc.type = "sine";
    sustainOsc.frequency.value = SUSTAIN_HZ;
    sustainG = ctx.createGain();
    sustainG.gain.value = 0;
    sustainOsc.connect(sustainG).connect(dest);

    cueOsc = ctx.createOscillator();
    cueOsc.type = "triangle";
    cueOsc.frequency.value = CUE_HZ;
    cueG = ctx.createGain();
    cueG.gain.value = 0;
    cueOsc.connect(cueG).connect(dest);

    try { deployOsc.start(); } catch (e) { /* started */ }
    try { harvestOsc.start(); } catch (e) { /* started */ }
    try { sustainOsc.start(); } catch (e) { /* started */ }
    try { cueOsc.start(); } catch (e) { /* started */ }
    built++;
  }

  function silence(t) {
    if (!ctx) return;
    const at = t != null ? t : ctx.currentTime;
    aim(deployG && deployG.gain, 0, at, 0.06);
    aim(harvestG && harvestG.gain, 0, at, 0.06);
    aim(sustainG && sustainG.gain, 0, at, 0.06);
    aim(cueG && cueG.gain, 0, at, 0.04);
    wasBoost = false;
  }

  function fireCue(t) {
    if (!cueG || !ctx) return;
    const at = t != null ? t : ctx.currentTime;
    if (at - lastCueT < CUE_REARM) return;
    lastCueT = at;
    cueFired++;
    const g = cueG.gain;
    if (g.cancelScheduledValues) g.cancelScheduledValues(at);
    g.setTargetAtTime(CUE_PEAK, at, 0.008);
    g.setTargetAtTime(0, at + 0.04, 0.05);
    g._ersAim = 0;
  }

  function cueBoost(t) { fireCue(t); }

  function update(st) {
    if (!ctx || !deployG) return;
    const s = st || {};
    const t = s.t != null ? s.t : ctx.currentTime;
    const energy = clamp01(s.energy != null ? s.energy : 1);
    const deploy = clamp01(s.deploy != null ? s.deploy : 0);
    const brakeIn = clamp01(s.brake != null ? s.brake : 0);
    const ax = +s.ax || 0;
    const brake = Math.max(brakeIn, ax < 0 ? clamp01(-ax / 22) : 0);
    const on = isLive(energy, s.layerOn, s.ersOn);
    const dGain = on ? deployGain(deploy, energy, s) : 0;
    const hGain = on ? harvestGain(brake, energy, deploy, s) : 0;
    const boostActive = on && !!(s.boost || s.otOn || deploy > DEPLOY_GATE);
    if (boostActive && !wasBoost) fireCue(t);
    wasBoost = boostActive;
    const sGain = sustainGain(boostActive, energy, s);
    aim(deployG.gain, dGain, t, deploy > 0 ? 0.05 : 0.10);
    aim(harvestG.gain, hGain, t, 0.08);
    aim(sustainG.gain, sGain, t, 0.07);
    if (deployOsc) aim(deployOsc.frequency, deployHz(deploy, energy), t, 0.06, 1e-4);
    if (harvestOsc) aim(harvestOsc.frequency, harvestHz(brake), t, 0.08, 1e-4);
    if (harvestBp) aim(harvestBp.frequency, harvestHz(brake), t, 0.08, 1e-4);
    if (sustainOsc) aim(sustainOsc.frequency, SUSTAIN_HZ, t, 0.10, 1e-4);
  }

  function attached() { return !!(ctx && deployOsc); }
  function deployLevel() { return deployG ? +deployG.gain.value : 0; }
  function harvestLevel() { return harvestG ? +harvestG.gain.value : 0; }
  function sustainLevel() { return sustainG ? +sustainG.gain.value : 0; }
  function cueCount() { return cueFired | 0; }
  function builds() { return built | 0; }

  function inspect() {
    return {
      attached: attached(),
      deploy: deployLevel(),
      harvest: harvestLevel(),
      sustain: sustainLevel(),
      deployHz: deployOsc ? +deployOsc.frequency.value : 0,
      harvestHz: harvestOsc ? +harvestOsc.frequency.value : 0,
      cueFired: cueFired | 0,
      builds: built | 0,
      deployMethod: deployG && deployG.gain.lastMethod || (deployG && deployG.gain._ersAim != null ? "target" : null),
      harvestMethod: harvestG && harvestG.gain.lastMethod || null,
    };
  }

  return {
    attach, detach, silence, update, cueBoost, inspect, attached,
    deployLevel, harvestLevel, sustainLevel, cueCount, builds,
    deployHz, harvestHz, deployGain, harvestGain, sustainGain, isLive,
  };
})();
Object.freeze(ErsLayer);
