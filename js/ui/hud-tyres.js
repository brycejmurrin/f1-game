/* Apex 26 — HUD tyre corner paint helpers.
   The physics model is axle-level (wearF/wearR + shared surface/bulk temp).
   This module projects that onto four corner cells (FL/FR/RL/RR) with a small
   left/right bias from lateral load so the strip reads like a sim dash without
   inventing a four-tyre thermal model. Pure: no DOM until ensure()/paint(). */
const HudTyres = (function () {
  "use strict";

  const CORNERS = ["fl", "fr", "rl", "rr"];
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

  /**
   * Four corner snapshots for the HUD.
   * @param {object} info  TyreModel.info(player) — tempS/tempOpt/tempWindow/wearF/wearR
   * @param {number} lat   signed lateral load proxy (−1…+1); + = load to the right
   */
  function corners(info, lat) {
    const ts = info && info.tempS != null ? +info.tempS : null;
    const opt = info && info.tempOpt != null ? +info.tempOpt : null;
    const win = info && info.tempWindow != null ? +info.tempWindow : 15;
    const base = band(ts, opt, win);
    const latN = Math.max(-1, Math.min(1, Number(lat) || 0));
    // Outer tyre runs a touch warmer under lateral load (~3 °C at full).
    const bias = 3 * Math.abs(latN);
    const rightHeavy = latN > 0;
    function cell(id, axleWear) {
      let t = ts;
      if (t != null && bias > 0.05) {
        const right = id === "fr" || id === "rr";
        t = t + (right === rightHeavy ? bias : -bias * 0.35);
      }
      const b = t != null && opt != null ? band(t, opt, win) : base;
      return {
        id,
        band: b,
        temp: t != null ? Math.round(t) : null,
        wear: axleWear != null ? +axleWear : null,
      };
    }
    const wF = info ? info.wearF : null;
    const wR = info ? info.wearR : null;
    return [
      cell("fl", wF), cell("fr", wF),
      cell("rl", wR), cell("rr", wR),
    ];
  }

  /** Signed °C from the window centre — the tyre delta readout. */
  function tempDelta(info) {
    if (!info || info.tempS == null || info.tempOpt == null) return null;
    return Math.round(+info.tempS - +info.tempOpt);
  }

  /** Ensure the four corner cells exist under #hud-tyre (runtime DOM — not shell). */
  function ensure(tyreEl) {
    if (!tyreEl || typeof document === "undefined") return null;
    let grid = tyreEl.querySelector("#hud-tyre-corners");
    if (grid) return grid;
    grid = document.createElement("div");
    grid.id = "hud-tyre-corners";
    grid.setAttribute("aria-hidden", "true");
    for (let i = 0; i < CORNERS.length; i++) {
      const cell = document.createElement("span");
      cell.dataset.corner = CORNERS[i];
      cell.dataset.band = "ok";
      cell.textContent = "·";
      grid.appendChild(cell);
    }
    let delta = tyreEl.querySelector("#hud-tyre-delta");
    if (!delta) {
      delta = document.createElement("span");
      delta.id = "hud-tyre-delta";
      delta.setAttribute("aria-hidden", "true");
    }
    // Corners + ΔT sit after the compound code, before the life bar.
    const code = tyreEl.querySelector("#hud-tyre-code");
    if (code && code.nextSibling) {
      tyreEl.insertBefore(grid, code.nextSibling);
      tyreEl.insertBefore(delta, grid.nextSibling);
    } else {
      tyreEl.appendChild(grid);
      tyreEl.appendChild(delta);
    }
    return grid;
  }

  /**
   * Paint corner cells + ΔT. Returns false when the strip should stay hidden
   * (no temp yet / wear off — caller already hid #hud-tyre).
   */
  function paint(tyreEl, info, lat, opts) {
    if (!tyreEl) return false;
    const grid = ensure(tyreEl);
    if (!grid) return false;
    const cells = corners(info, lat);
    const kids = grid.children;
    for (let i = 0; i < cells.length && i < kids.length; i++) {
      const c = cells[i];
      const el = kids[i];
      if (el.dataset.band !== c.band) el.dataset.band = c.band;
      const txt = c.temp != null ? String(c.temp) : "·";
      if (el.textContent !== txt) el.textContent = txt;
    }
    const deltaEl = tyreEl.querySelector("#hud-tyre-delta");
    const d = tempDelta(info);
    if (deltaEl) {
      if (d == null) {
        if (deltaEl.textContent) deltaEl.textContent = "";
        if (deltaEl.dataset.sign) delete deltaEl.dataset.sign;
      } else {
        const sign = d > 0 ? "+" : "";
        const txt = "Δ" + sign + d + "°";
        if (deltaEl.textContent !== txt) deltaEl.textContent = txt;
        const s = d > 2 ? "hot" : d < -2 ? "cold" : "ok";
        if (deltaEl.dataset.sign !== s) deltaEl.dataset.sign = s;
      }
    }
    // Practice / TT: hide the pit-plan line (race strategy noise).
    if (opts && opts.practice) {
      const plan = tyreEl.querySelector("#hud-plan");
      if (plan && plan.textContent) plan.textContent = "";
      if (tyreEl.dataset.plan) delete tyreEl.dataset.plan;
    }
    return true;
  }

  return {
    CORNERS, BAND_FRAC, band, corners, tempDelta, ensure, paint,
  };
})();
Object.freeze(HudTyres);
