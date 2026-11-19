const AiBand = (function () {
  "use strict";

  const START_GUARD_S = 8;
  const GAP_REF_M = 700;
  const MODES = Object.freeze(["scripted", "catchup"]);
  let _mode = "scripted";

  function isMode(v) { return v === "scripted" || v === "catchup"; }
  function normalize(v) { return isMode(v) ? v : "scripted"; }
  function mode() { return _mode; }
  function setMode(v) { _mode = normalize(v); return _mode; }

  function factor(ctx) {
    if (!ctx) return 0;
    const m = ctx.mode != null ? normalize(ctx.mode) : _mode;
    if (m !== "catchup") return 0;
    const lead =  (ctx.leadProg), car =  (ctx.carProg), total =  (ctx.trackTotal);
    if (!(Number.isFinite(lead) && Number.isFinite(car) && Number.isFinite(total) && total > 0)) return 0;
    const gap = lead - car;
    if (!(gap > 0 && gap < total * 0.5)) return 0;
    const t0 = ctx.launchT0 || 0;
    if ((ctx.raceT || 0) - t0 <= START_GUARD_S) return 0;
    const auth = Number.isFinite(ctx.bandAuth) ? Math.max(0,  (ctx.bandAuth)) : 0;
    return Math.min(gap / GAP_REF_M, 1) * auth;
  }

  function applyVmax(vmax, bandFactor, paceScale, bandCeil, out) {
    const r = out || { vmax: 0, bandNow: 0 };
    const f = Math.max(0, bandFactor || 0);
    if (f <= 0) { r.vmax = vmax; r.bandNow = 0; return r; }
    const scale = Math.max(1e-6, paceScale || 1);
    const ceil = Number.isFinite(bandCeil) ? bandCeil : 1;
    const bandCap = Math.max(1, ceil / scale);
    r.vmax = vmax * Math.min(1 + f, bandCap);
    r.bandNow = f;
    return r;
  }

  try { Log.info("game", "AiBand ready"); } catch (_) {  }
  return Object.freeze({
    MODES, START_GUARD_S, GAP_REF_M,
    isMode, normalize, mode, setMode, factor, applyVmax,
  });
})();
Object.freeze(AiBand);
