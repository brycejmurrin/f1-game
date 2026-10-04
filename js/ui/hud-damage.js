/* Apex 26 — HUD DAMAGE CHIP: paints Damage (js/race/damage.js) on #hud-damage,
   a small car-outline glyph whose parts are tinted by level, with a short
   text fallback ("FW L 40%") and an aria-label in words. DISPLAY ONLY, like
   the record it draws: nothing here is read back by the game.

   Shown only while some part is past Damage.SHOW. Hidden in MINIMAL, under a
   broadcast camera and by DISPLAY › HUD › DAMAGE (css/hud.css). Writes only
   on change (levels quantized), so a steady state costs one compare a frame. */
const HudDamage = (function () {
  "use strict";

  const PARTS = [["fwL", "FW L", "front wing left"], ["fwR", "FW R", "front wing right"],
    ["rw", "RW", "rear wing"], ["floor", "FLR", "floor"]];

  /** 0 none … 3 severe. */
  function level(v) { return v >= 0.75 ? 3 : v >= 0.45 ? 2 : v >= 0.15 ? 1 : 0; }

  /** Text fallback: the worst part in a few characters, + SUSP for a knock. */
  function text(r) {
    if (!r) return "";
    let best = -1, bv = 0;
    for (let i = 0; i < PARTS.length; i++) { const v = r[PARTS[i][0]]; if (v > bv) { bv = v; best = i; } }
    const t = best >= 0 && bv >= 0.15 ? PARTS[best][1] + " " + Math.round(bv * 10) * 10 + "%" : "";
    return r.knock ? (t ? t + " SUSP" : "SUSP") : t;
  }
  /** Screen-reader label: every damaged part in words. */
  function label(r) {
    const out = [];
    if (r) for (let i = 0; i < PARTS.length; i++) {
      const v = r[PARTS[i][0]];
      if (v >= 0.15) out.push(PARTS[i][2] + " " + Math.round(v * 10) * 10 + "%");
    }
    if (r && r.knock) out.push("suspension knock");
    return "Car damage: " + (out.length ? out.join(", ") : "none");
  }

  // Quantized signature of what is drawn; a repaint only when it changes.
  function sig(r) {
    return r ? level(r.fwL) + level(r.fwR) * 4 + level(r.rw) * 16 + level(r.floor) * 64 + (r.knock ? 256 : 0)
      + Math.round(Math.max(r.fwL, r.fwR, r.rw, r.floor) * 10) * 512 : -1;
  }

  /** el = #hud-damage; r = Damage.get(player) or null. Returns shown. */
  function paint(el, r, show) {
    if (!el) return false;
    const on = !!(r && show);
    if (el.hidden === on) el.hidden = !on;
    if (!on) return false;
    const s = sig(r);
    if (el._dmgSig === s) return true;
    el._dmgSig = s;
    for (let i = 0; i < PARTS.length; i++) {
      const p = el.querySelector('[data-part="' + PARTS[i][0] + '"]');
      if (p) p.setAttribute("data-lvl", String(level(r[PARTS[i][0]])));
    }
    const k = el.querySelector('[data-part="knock"]');
    if (k) k.setAttribute("data-lvl", r.knock ? "3" : "0");
    const t = el.querySelector("[data-dmg-text]");
    if (t) t.textContent = text(r);
    el.setAttribute("aria-label", label(r));
    return true;
  }

  // The chip, looked up once (index.html owns it; re-looked-up if replaced).
  let _el = null;
  /** js/ui/hud.js updateHud's ONE call, at the HUD's 10 Hz tick. */
  function sync(player) {
    if (typeof Damage === "undefined" || typeof document === "undefined") return false;
    if (!_el || !_el.isConnected) _el = document.getElementById("hud-damage");
    const r = player ? Damage.get(player) : null;
    return paint(_el, r, Damage.worst(r) > Damage.SHOW);
  }

  return Object.freeze({ paint, sync, level, text, label });
})();
