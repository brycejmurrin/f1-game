/* Apex 26 — HudSkin: the runtime team accent of the HUD (skinAccent + its WCAG ink pick).
   Pure move out of hud.js (#1656). skinAccent(team, G) takes the game ctx only for G.cssCol. */
const HudSkin = (function () {
  "use strict";

  /* THE TEAM ACCENT for a team css/tokens.css has no row for.
   *
   * `:root[data-team="…"]` carries --accent and --accent-ink for the eleven
   * constructors, and a selector cannot match a team that does not exist until
   * runtime: MY TEAM and the LEGENDS entry are appended to Teams.LIST at boot
   * (js/career/custom-team.js) and MY TEAM's colours are edited in the garage.
   * So `data-team="custom"` matched nothing, --accent stayed at whatever team was
   * skinned last — or the shipped --red — and the radio card's number plate, the
   * one surface painted --accent, carried another constructor's colour for the
   * whole session while the car on screen was the player's own.
   *
   * The rule is the sheet's, applied at runtime rather than duplicated: the plate
   * is the TEAM's colour and the ink is whichever of --text and --bg stands
   * FURTHER from it, which is exactly what nontext-contrast.test.mjs proves of
   * every hand-written row. Both tokens are read off the live root, so
   * re-pointing --text in the sheet moves this with it.
   *
   * Only for a team with no row. A real constructor gets its inline props CLEARED
   * so the cascade hands it back to tokens.css, where the ink was chosen by hand
   * and measured. */
  // WCAG relative luminance and contrast ratio, the four lines of it. js/car/
  // liverytex.js exports the same pair, and this is deliberately NOT that one: a
  // HUD that must reach into the livery TEXTURE builder to decide a text colour
  // is a dependency nobody would choose, and the tuner-slider doc generator reads
  // any `.contrast` member call as a consumer of the CONTRAST lighting slider, so
  // borrowing it also published three false rows in a generated table. Channels
  // are linearised first — the Rec.709 coefficients on gamma-encoded sRGB
  // overstate mid-tones badly (0.5 grey reads as 0.5 when it is really 0.21).
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
    // Teams.isReal is the same predicate the career grid filters on: false for
    // exactly the two appended entries, and for the next one appended after them.
    // UNKNOWABLE COUNTS AS REAL. Without Teams there is no way to tell an
    // appended entry from a constructor, and the safe answer is to leave the
    // cascade alone: tokens.css is right for every team it has a row for, and
    // writing an inline accent on a guess would override a hand-measured one.
    // (It is also what keeps this callable from the node HUD harnesses, which
    // boot hud.js with neither Teams nor getComputedStyle.)
    const canTell = typeof Teams !== "undefined" && Teams && typeof Teams.isReal === "function";
    // APPEARANCE › HUD ACCENT owns --accent when not TEAM (js/ui/appearance-opts.js).
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
    // Menu accent TEAM resolves a concrete --red from the constructor colour.
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && AppearanceOpts.menuAccent() === "team") {
      AppearanceOpts.applyMenuAccent();
    }
  }

  return { skinAccent };
})();
Object.freeze(HudSkin);
