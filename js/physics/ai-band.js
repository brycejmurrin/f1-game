/* Apex 26 — AI PACE BAND: gap-to-player catch-up vs race-scripted fixed pace.
 *
 * History: updateCar multiplied AI vmax by how far the leading human was ahead
 * (reverse-only rubber band). That is the classic unfair catch-up Black Rock /
 * Pure rejected — see Game Developer "The Pure Advantage" and GamesIndustry
 * "Rubber banding is not fair and not fun". Melder (Game AI Pro ch.42) keeps a
 * gentler band; this project defaults the other way.
 *
 * Modes (apex26.aiPace):
 *   scripted (default) — pace = tierV × skill × DIFF.ai × pacePhase only.
 *                        No live boost from the player's gap. Fair racing
 *                        driven by car/driver data and the difficulty ladder.
 *   catchup            — legacy reverse-only vmax (and corner) band: AI behind
 *                        the lead human get up to DIFF.band extra authority,
 *                        still gated off the start line and once lapped.
 *
 * Pure factor/apply helpers; mode() is the live setting updateCar reads. */
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

  /**
   * Catch-up factor in [0, bandAuth]. Zero in scripted mode, with no human,
   * inside the start guard, once lapped, or when the AI is ahead.
   *
   * @param {{ mode?: string, leadProg?: number, carProg?: number,
   *           trackTotal?: number, raceT?: number, launchT0?: number,
   *           bandAuth?: number }} ctx
   */
  function factor(ctx) {
    if (!ctx) return 0;
    const m = ctx.mode != null ? normalize(ctx.mode) : _mode;
    if (m !== "catchup") return 0;
    const lead = ctx.leadProg, car = ctx.carProg, total = ctx.trackTotal;
    if (!(Number.isFinite(lead) && Number.isFinite(car) && Number.isFinite(total) && total > 0)) return 0;
    const gap = lead - car;
    // Reverse band only: human ahead of this AI, and not a full lap clear.
    if (!(gap > 0 && gap < total * 0.5)) return 0;
    const t0 = ctx.launchT0 || 0;
    if ((ctx.raceT || 0) - t0 <= START_GUARD_S) return 0;
    const auth = Number.isFinite(ctx.bandAuth) ? Math.max(0, ctx.bandAuth) : 0;
    return Math.min(gap / GAP_REF_M, 1) * auth;
  }

  /**
   * Scale vmax by the catch-up factor, capped so a banded easy car cannot beat
   * the top of the DIFF ladder (BAND_CEIL). Returns { vmax, bandNow }.
   */
  function applyVmax(vmax, bandFactor, paceScale, bandCeil) {
    const f = Math.max(0, bandFactor || 0);
    if (f <= 0) return { vmax: vmax, bandNow: 0 };
    const scale = Math.max(1e-6, paceScale || 1);
    const ceil = Number.isFinite(bandCeil) ? bandCeil : 1;
    const bandCap = Math.max(1, ceil / scale);
    return {
      vmax: vmax * Math.min(1 + f, bandCap),
      bandNow: f,
    };
  }

  try { Log.info("game", "AiBand ready"); } catch (_) { /* Log absent in isolated VM */ }
  return Object.freeze({
    MODES, START_GUARD_S, GAP_REF_M,
    isMode, normalize, mode, setMode, factor, applyVmax,
  });
})();
Object.freeze(AiBand);
