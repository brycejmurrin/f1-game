const HudSkin = (function () {
  "use strict";

  const _lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  const _lum = (c) => 0.2126 * _lin(c[0]) + 0.7152 * _lin(c[1]) + 0.0722 * _lin(c[2]);
  const _wcag = (a, b) => {
    const la = _lum(a), lb = _lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const _hexRgb = (v) => {
    const h = String(v || "").trim();
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const d = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return [parseInt(d.slice(0, 2), 16) / 255, parseInt(d.slice(2, 4), 16) / 255, parseInt(d.slice(4, 6), 16) / 255];
  };
  function skinAccent(t, G) {
    const root = document.documentElement;
    const canTell = typeof Teams !== "undefined" && Teams && typeof Teams.isReal === "function";
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && !AppearanceOpts.hudUsesTeam()) {
      if (AppearanceOpts.menuAccent() === "team") AppearanceOpts.applyMenuAccent();
      AppearanceOpts.applyHudAccent();
      return;
    }
    if (!t || !t.color || !canTell || Teams.isReal(t) || typeof getComputedStyle !== "function") {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-ink");
      if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && AppearanceOpts.menuAccent() === "team") {
        AppearanceOpts.applyMenuAccent();
      }
      return;
    }
    const cs = getComputedStyle(root);
    const text = _hexRgb(cs.getPropertyValue("--text")), bg = _hexRgb(cs.getPropertyValue("--bg"));
    root.style.setProperty("--accent", G.cssCol(t.color));
    if (!text || !bg) return;
    const ink = _wcag(t.color, text) >= _wcag(t.color, bg) ? "var(--text)" : "var(--bg)";
    root.style.setProperty("--accent-ink", ink);
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && AppearanceOpts.menuAccent() === "team") {
      AppearanceOpts.applyMenuAccent();
    }
  }

  return { skinAccent };
})();
Object.freeze(HudSkin);
