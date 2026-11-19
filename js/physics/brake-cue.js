const BrakeCue = (function () {
  "use strict";

  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;

  const LOOK_LO = 0.7, LOOK_HI = 2.3;
  const URGENCY_GATE = 0.12;
  const PERIOD_LO = 0.55, PERIOD_HI = 0.09;
  const SAMPLES = 4;
  const clamp = M4.clamp;

  function fromSlider(v) {
    const n = +v;
    if (!(n > 1)) return { on: false, lookSec: 1.4 };
    return { on: true, lookSec: LOOK_LO + (LOOK_HI - LOOK_LO) * (n - 2) / 8 };
  }
  function labelOf(v) { return v <= 1 ? "OFF" : "CUE " + v; }

  function aeroCornerSpeed(radius, latMax, df, vTop) {
    const L = Math.max(latMax, 1), R = Math.min(radius, 2000), den = 1 / R - L * df / (vTop * vTop);
    if (den > 0) { const vc = Math.sqrt(L / den); if (vc <= vTop) return vc; }
    return Math.sqrt(L * (1 + df) * R);
  }

  function urgencyOf(speed, k, dist, axEstSm, latMax, brake, df, vTop) {
    const v = Math.abs(speed || 0);
    if (v < 8 || !(dist > 0)) return 0;
    const radius = 1 / Math.max(Math.abs(k || 0), 1e-5);
    const vC = df > 0 && vTop > 0 ? aeroCornerSpeed(radius, latMax, df, vTop)
      : Math.sqrt(Math.max(latMax, 1) * Math.min(radius, 2000));
    if (v <= vC + 0.8) return 0;
    const aNeed = (v * v - vC * vC) / (2 * Math.max(dist, 8));
    const already = Math.max(0, -(axEstSm || 0));
    const remain = Math.max(0, aNeed - already * 0.85);
    return clamp(remain / Math.max(brake, 1), 0, 1);
  }

  function conditionCapacity(player, pc, state, dt) {
    const bounded = (v) => Number.isFinite(v) ? clamp(v, 0.25, 1) : 1;
    const grip = bounded(player && player._cueConditionGrip);
    const latTarget = grip * bounded(player && player._cueCornering);
    const brakeTarget = grip * bounded(player && player._cueBraking);
    const alpha = 1 - Math.exp(-clamp(dt || 0, 0, 0.1) / 0.6);
    state.lat = (state.lat == null ? 1 : state.lat) + (latTarget - (state.lat == null ? 1 : state.lat)) * alpha;
    state.brake = (state.brake == null ? 1 : state.brake) + (brakeTarget - (state.brake == null ? 1 : state.brake)) * alpha;
    return { lat: (pc.LAT_MAX || 22) * state.lat, brake: (pc.BRAKE || 22) * state.brake, df: clamp(pc.DOWNFORCE || 0, 0, 1) };
  }

  let inst = null;

  function create(G) {
    let level = 6;
    let cfg = fromSlider(level);
    let nextT = 0;
    let lastMs = 0;
    let lastU = 0;
    let conditionAware = !(G && G.store && G.store.get("conditionCues", true) === false);
    const capacity = {};
    function setConditionAware(on) { conditionAware = on === true; delete capacity.lat; delete capacity.brake; }

    function setLevel(v) {
      if (typeof v === "number" && isFinite(v)) { level = clamp(v, 1, 10); cfg = fromSlider(level); }
    }

    function tick() {
      if (!cfg.on || !G || G.paused || G.state !== "race") { nextT = 0; lastU = 0; lastMs = 0; return; }
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const dt = lastMs ? Math.min(0.1, (now - lastMs) / 1000) : FIXED_DT;
      lastMs = now;
      const p = G.player, track = G.track;
      if (!p || !track || typeof Tracks === "undefined" || p.finished || p.retired) {
        lastU = 0; return;
      }
      const PC = window.PhysicsConsts || {};
      const estimate = conditionAware ? conditionCapacity(p, PC, capacity, dt) : null;
      const lat = estimate ? estimate.lat : PC.LAT_MAX || 22, brake = estimate ? estimate.brake : PC.BRAKE || 22, df = estimate ? estimate.df : 0;
      const vt = (G.vTop ? G.vTop() : 0) || (PC.VMAX || 72);
      const lookLo = 28 * Math.max(vt / (PC.VMAX || 72), 0.05);
      const lookHi = Math.max(lookLo, vt * vt / (2 * Math.max(brake, 1)));
      const reach = estimate ? (PC.BRAKE || 22) / Math.max(brake, 1) : 1;
      const look = clamp(Math.abs(p.speed) * cfg.lookSec * reach, lookLo, lookHi);
      const L = track.total || 1;
      const nS = clamp(Math.round(look / 30), SAMPLES, 16);
      let u = 0;
      for (let i = 1; i <= nS; i++) {
        const dist = look * i / nS;
        const s = ((p.s + dist) % L + L) % L;
        const k = Tracks.curvature(track, s);
        const ui = urgencyOf(p.speed, k, dist, p.axEstSm, lat, brake, df, vt);
        if (ui > u) u = ui;
      }
      lastU = u;
      if (u < URGENCY_GATE) { nextT = 0; return; }
      nextT -= dt;
      if (nextT > 0) return;
      nextT = PERIOD_LO + (PERIOD_HI - PERIOD_LO) * u;
      if (G.soundOn && (typeof GameAudio !== "undefined") && GameAudio.brakeCue) GameAudio.brakeCue(u);
      if ((typeof Input !== "undefined") && Input.vibrate) Input.vibrate(8 + (u * 16) | 0);
      if ((typeof Input !== "undefined") && Input.rumble) Input.rumble(0.10 + u * 0.22, 45);
      if (window.Log && Log.enabled && Log.enabled("game", Log.DEBUG))
        Log.debug("game", "brake cue u=" + u.toFixed(2));
    }

    function debug() {
      return { level, on: fromSlider(level).on, lookSec: +fromSlider(level).lookSec.toFixed(2), urgency: +lastU.toFixed(3), conditionAware, capacity: Object.assign({}, capacity) };
    }

    inst = { tick, setLevel, setConditionAware, debug, fromSlider, urgencyOf, on: () => cfg.on };
    return inst;
  }

  return {
    URGENCY_GATE,
    create,
    fromSlider,
    urgencyOf,
    conditionCapacity,
    labelOf,
    tick() { if (inst) inst.tick(); },
    on() { return !!inst && inst.on(); },
    debug() { return inst ? inst.debug() : null; },
    setLevel(v) { if (inst) inst.setLevel(v); },
    setConditionAware(on) { if (inst) inst.setConditionAware(on); },
  };
})();
Object.freeze(BrakeCue);
