const HudDamage = (function () {
  "use strict";

  const PARTS = [["fwL", "FW L", "front wing left"], ["fwR", "FW R", "front wing right"],
    ["rw", "RW", "rear wing"], ["floor", "FLR", "floor"]];

  function level(v) { return v >= 0.75 ? 3 : v >= 0.45 ? 2 : v >= 0.15 ? 1 : 0; }

  function text(r) {
    if (!r) return "";
    let best = -1, bv = 0;
    for (let i = 0; i < PARTS.length; i++) { const v = r[PARTS[i][0]]; if (v > bv) { bv = v; best = i; } }
    const t = best >= 0 && bv >= 0.15 ? PARTS[best][1] + " " + Math.round(bv * 10) * 10 + "%" : "";
    return r.knock ? (t ? t + " SUSP" : "SUSP") : t;
  }
  function label(r) {
    const out = [];
    if (r) for (let i = 0; i < PARTS.length; i++) {
      const v = r[PARTS[i][0]];
      if (v >= 0.15) out.push(PARTS[i][2] + " " + Math.round(v * 10) * 10 + "%");
    }
    if (r && r.knock) out.push(I18n.t("hud.damage.knock", null, "suspension knock"));
    return I18n.t("hud.damage.label", { parts: out.length ? out.join(", ") : I18n.t("hud.damage.none", null, "none") }, "Car damage: {parts}");
  }

  function sig(r) {
    return r ? level(r.fwL) + level(r.fwR) * 4 + level(r.rw) * 16 + level(r.floor) * 64 + (r.knock ? 256 : 0)
      + (Math.round(r.fwL * 10) + Math.round(r.fwR * 10) * 11 + Math.round(r.rw * 10) * 121 + Math.round(r.floor * 10) * 1331) * 512 : -1;
  }

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

  let _el = null;
  function sync(player) {
    if (typeof Damage === "undefined" || typeof document === "undefined") return false;
    if (!_el || !_el.isConnected) _el = document.getElementById("hud-damage");
    const r = player ? Damage.get(player) : null;
    const show = Damage.worst(r) > Damage.SHOW;
    if (!show && _el && !_el.hidden && document.body.hasAttribute("data-hud-arrange")) return false;
    return paint(_el, r, show);
  }

  return Object.freeze({ paint, sync, level, text });
})();
