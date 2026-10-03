/* Apex 26 — HUD tyre temperature state.
   The physics model is axle-level with one shared surface temperature, so the
   HUD shows ONE fact about heat: whether the set is cold, working or hot
   against the compound's window. It paints that as a colour on the compound
   letter (data-temp on #hud-tyre, css/hud.css) — no extra cells, no number —
   AND as a glyph after the letter (❄ cold, ▲ hot; the sheet's ::after), because
   blue-vs-red is a colour-only cue. The aria-label carries all of it in words.
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

  const NAMES = { S: "Soft", M: "Medium", H: "Hard", I: "Intermediate", W: "Wet" };

  /** The spoken twin of the chip: "Medium tyres, cold, about 5 laps left".
   *  temp ok says nothing (the normal state is not news); a worn-out set says so. */
  function label(code, temp, lapsLeft, spent) {
    const name = NAMES[code] || (code ? String(code) : "Unknown");
    let out = name + " tyres";
    if (temp === "cold" || temp === "hot") out += ", " + temp;
    if (spent >= 1) out += ", worn out";
    else if (lapsLeft != null && isFinite(lapsLeft)) {
      const n = Math.max(0, Math.min(99, Math.round(lapsLeft)));
      out += ", about " + n + (n === 1 ? " lap" : " laps") + " left";
    }
    return out;
  }

  /** Write data-temp on #hud-tyre; the compound letter takes the colour and
   *  the glyph. With `extra` ({code, lapsLeft, spent, plan}) also writes the
   *  aria-label (#hud-tyre is role="img", so the label is all a reader gets). */
  function paint(tyreEl, info, extra) {
    if (!tyreEl || !tyreEl.dataset) return false;
    const s = state(info);
    if (tyreEl.dataset.temp !== s) tyreEl.dataset.temp = s;
    if (extra && typeof tyreEl.setAttribute === "function") {
      const l = label(extra.code, s, extra.lapsLeft, extra.spent) + (extra.plan ? ", " + extra.plan : "");
      if (tyreEl.getAttribute("aria-label") !== l) tyreEl.setAttribute("aria-label", l);
    }
    return true;
  }

  return { BAND_FRAC, NAMES, band, state, label, paint };
})();
Object.freeze(HudTyres);
