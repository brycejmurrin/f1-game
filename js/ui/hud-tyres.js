const HudTyres = (function () {
  "use strict";

  const BAND_FRAC = 0.55;

  function band(ts, opt, window) {
    if (!(ts > 0) || !(opt > 0) || !(window > 0)) return "ok";
    const d = ts - opt;
    const half = window * BAND_FRAC;
    if (d < -half) return "cold";
    if (d > half) return "hot";
    return "ok";
  }

  function state(info) {
    if (!info || info.tempS == null || info.tempOpt == null) return "ok";
    const win = info.tempWindow != null ? +info.tempWindow : 15;
    return band(+info.tempS, +info.tempOpt, win);
  }

  const NAMES = {
    S: () => I18n.t("hud.tyre.name.soft", null, "Soft"),
    M: () => I18n.t("hud.tyre.name.medium", null, "Medium"),
    H: () => I18n.t("hud.tyre.name.hard", null, "Hard"),
    I: () => I18n.t("hud.tyre.name.intermediate", null, "Intermediate"),
    W: () => I18n.t("hud.tyre.name.wet", null, "Wet"),
  };

  function label(code, temp, lapsLeft, spent) {
    const name = NAMES[code] ? NAMES[code]() : (code ? String(code) : I18n.t("hud.tyre.unknown", null, "Unknown"));
    let out = I18n.t("hud.tyre.label", { name }, "{name} tyres");
    if (temp === "cold") out += ", " + I18n.t("hud.tyre.cold", null, "cold");
    else if (temp === "hot") out += ", " + I18n.t("hud.tyre.hot", null, "hot");
    if (spent >= 1) out += ", " + I18n.t("hud.tyre.worn", null, "worn out");
    else if (lapsLeft != null && isFinite(lapsLeft)) {
      const n = Math.max(0, Math.min(99, Math.round(lapsLeft)));
      out += ", " + (lapsLeft < 0.5 ? I18n.t("hud.tyre.underLap", null, "under a lap left")
        : I18n.t("hud.tyre.lapsLeft", { n }, "about {n, plural, one {# lap} other {# laps}} left"));
    }
    return out;
  }

  function cbCuesOn() {
    return typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn();
  }

  function compoundChip(code) {
    const raw = code ? String(code) : "";
    if (!cbCuesOn()) return raw;
    if (typeof A11yOpts !== "undefined" && A11yOpts.compoundLetter) {
      const L = A11yOpts.compoundLetter(raw);
      if (L) return L;
    }
    return raw ? raw.charAt(0) : "-";
  }

  let _chipOf = null, _chip = null;
  function paint(tyreEl, info, extra) {
    if (!tyreEl || !tyreEl.dataset) return false;
    const s = state(info);
    if (tyreEl.dataset.temp !== s) tyreEl.dataset.temp = s;
    if (tyreEl !== _chipOf || !_chip || !_chip.isConnected) { _chipOf = tyreEl; _chip = tyreEl.querySelector ? tyreEl.querySelector("#hud-tyre-code") : null; }
    const chip = _chip;
    if (chip) {
      if (cbCuesOn() && extra && extra.code) {
        const L = compoundChip(extra.code);
        if (chip.textContent !== L) chip.textContent = L;
        if (chip.dataset && chip.dataset.compound !== L) chip.dataset.compound = L;
      } else if (chip.dataset && chip.dataset.compound != null) delete chip.dataset.compound;
    }
    if (extra && typeof tyreEl.setAttribute === "function") {
      const l = label(extra.code, s, extra.lapsLeft, extra.spent) + (extra.plan ? ", " + extra.plan : "");
      if (tyreEl.getAttribute("aria-label") !== l) tyreEl.setAttribute("aria-label", l);
    }
    return true;
  }

  return { band, state, label, compoundChip, paint };
})();
Object.freeze(HudTyres);
