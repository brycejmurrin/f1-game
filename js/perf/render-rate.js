const RenderRate = (function () {
  "use strict";

  const KEY = "apex26.renderRate";
  const ENTER_MS = 10.5;
  const LEAVE_MS = 13.5;
  const ENTER_FRAMES = 90;
  const EMA_A = 0.1;
  const MAX_SANE_MS = 100;

  const MODES = ["auto", "off", "half", "45", "30"];
  const WARM_FRAMES = 90;
  const MAX_GAP_S = 1 / 20;
  const SETTINGS_HZ = 20;
  let mode = "auto";
  let credit = 0, live = 0;
  let mobile = false;
  let ema = 16.7;
  let fast = 0;
  let half = false;
  let phase = 0;
  let accDt = 0, accMs = 0;
  let outDt = 0, outMs = 0;
  let skipped = 0, drawn = 0;
  let sCredit = 1;
  let last = true;

  function init(opts) {
    mobile = !!(opts && opts.isMobile);
    let v = "";
    try { v = localStorage.getItem(KEY) || ""; } catch (_) {  }
    mode = MODES.indexOf(v) >= 0 ? v : "auto";
    credit = 0; live = 0; sCredit = 1;
    ema = 16.7; fast = 0; half = false; phase = 0; accDt = 0; accMs = 0; skipped = 0; drawn = 0; last = true;
  }

  const tierRate = () => mode === "45" ? 45 : mode === "30" ? 30 : 0;

  function setMode(v) {
    if (MODES.indexOf(v) < 0) return false;
    mode = v; credit = 0; live = 0; phase = 0; accDt = 0; accMs = 0;
    return true;
  }

  function active() {
    return tierRate() > 0 || mode === "half" || (mode === "auto" && mobile && half);
  }

  function observe(ms) {
    if (!(ms > 0) || ms > MAX_SANE_MS) return;
    ema += (ms - ema) * EMA_A;
    if (!half) {
      if (ema < ENTER_MS) { if (++fast >= ENTER_FRAMES) half = true; } else fast = 0;
    } else if (ema > LEAVE_MS) {
      half = false; fast = 0;
    }
  }

  function draw(dt, ms) {
    outDt = dt + accDt; outMs = ms + accMs; accDt = 0; accMs = 0; phase = 0; drawn++;
    return true;
  }
  function force(dt, ms) { sCredit = 1; return (last = draw(dt, ms)); }

  function settle(dt, ms, presenting) {
    if (presenting || mode === "off" || !(ms > 0) || ms > MAX_SANE_MS) { sCredit = 1; return (last = draw(Number.isFinite(dt) && dt > 0 ? dt : 0, ms > 0 && ms <= MAX_SANE_MS ? ms : 16.7)); }
    sCredit = Math.min(1, sCredit + ms / 1000 * SETTINGS_HZ);
    if (sCredit < 1 - 1e-6) { accDt += dt; accMs += ms; skipped++; return (last = false); }
    sCredit -= 1; return (last = draw(dt, ms));
  }

  function gate(dt, ms, presenting, racing) { return (last = gateOnce(dt, ms, presenting, racing)); }
  function gateOnce(dt, ms, presenting, racing) {
    if (!(ms > 0) || ms > MAX_SANE_MS) {
      accDt = 0; accMs = 0; credit = 0;
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      return draw(step, 16.7);
    }
    const rate = tierRate();
    if (rate && !presenting) {
      if (!racing) { live = 0; credit = 0; } else {
        accDt += dt; accMs += ms;
        let draw = live++ < WARM_FRAMES;
        if (!draw) { credit = Math.min(2, credit + dt * rate); draw = credit >= 1 - 1e-6; if (draw) credit -= 1; }
        if (draw) { outDt = Math.min(accDt, MAX_GAP_S); outMs = accMs; accDt = 0; accMs = 0; drawn++; return true; }
        skipped++; return false;
      }
    }
    if (presenting || !active() || rate) {
      return draw(dt, ms);
    }
    accDt += dt; accMs += ms;
    if ((++phase & 1) === 1) { skipped++; return false; }
    outDt = accDt; outMs = accMs; accDt = 0; accMs = 0; drawn++;
    return true;
  }

  return {
    init, observe, gate, force, settle, setMode,
    dt: () => outDt,
    drew: () => last,
    ms: () => outMs,
    active,
    state: () => ({ mode, tier: tierRate() || 60, mobile, half, active: active(), emaMs: +ema.toFixed(2), skipped, drawn }),
  };
})();

Object.freeze(RenderRate);
