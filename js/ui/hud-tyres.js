/* Apex 26 — HUD tyre temperature state.
   The physics model is axle-level with one shared surface temperature, so the
   HUD shows ONE fact about heat: whether the set is cold, working or hot
   against the compound's window. It paints that as a colour on the compound
   letter (data-temp on #hud-tyre, css/hud.css) — no extra cells, no number.
   Pure: no DOM until paint(). */
const HudTyres = (function () {
  "use strict";

  // Band edges as fractions of T_WINDOW around optTemp (tyre-model.js).
  // Inside ±0.55·window = working; below = cold; above = hot.
  const BAND_FRAC = 0.55;

  /** cold | ok | hot from surface temp vs the compound's window. */
  function band(ts, opt, window) {
    if (!(ts > 0) || !(opt > 0) || !(window > 0)) return "ok";
    const d = ts - opt;
    const half = window * BAND_FRAC;
    if (d < -half) return "cold";
    if (d > half) return "hot";
    return "ok";
  }

  /** Band for TyreModel.info(player) — tempS/tempOpt/tempWindow. */
  function state(info) {
    if (!info || info.tempS == null || info.tempOpt == null) return "ok";
    const win = info.tempWindow != null ? +info.tempWindow : 15;
    return band(+info.tempS, +info.tempOpt, win);
  }

  /** Write data-temp on #hud-tyre; the compound letter takes the colour. */
  function paint(tyreEl, info) {
    if (!tyreEl || !tyreEl.dataset) return false;
    const s = state(info);
    if (tyreEl.dataset.temp !== s) tyreEl.dataset.temp = s;
    return true;
  }

  return { BAND_FRAC, band, state, paint };
})();
Object.freeze(HudTyres);
