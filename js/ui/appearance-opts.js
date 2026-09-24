/* Apex 26 — AppearanceOpts: THEME + MENU ACCENT + HUD ACCENT preferences.
   Self-contained like DrivingLineOpts: GameStore + SettingRow, no G façade.
   Applies on :root via data-ui-theme / data-menu-accent / data-hud-accent and
   (for CUSTOM only) inline --red / --accent / --accent-ink. Named presets live
   in css/tokens.css so fills/grads that derive from --red follow automatically.

   Stored values are read at EVAL so the first paint matches the player's pick.
   UI wiring waits for the DOM. */
const AppearanceOpts = (function () {
  "use strict";

  const K_THEME = "uiTheme";
  const K_MENU = "menuAccent";
  const K_HUD = "hudAccent";
  const K_MENU_HEX = "menuAccentHex";
  const K_HUD_HEX = "hudAccentHex";

  const THEMES = [["dark", "DARK"], ["light", "LIGHT"], ["system", "SYSTEM"]];
  const ACCENTS = [
    ["brand", "BRAND"],
    ["team", "TEAM"],
    ["ember", "EMBER"],
    ["amber", "AMBER"],
    ["cyan", "CYAN"],
    ["violet", "VIOLET"],
    ["lime", "LIME"],
    ["custom", "CUSTOM"],
  ];
  const PRESET_HEX = {
    brand: "#e10600",
    ember: "#ff4d1a",
    amber: "#ffb000",
    cyan: "#00a3e0",
    violet: "#7a5cff",
    lime: "#b7e11b",
  };

  const store = GameStore.store;
  const root = () => (typeof document !== "undefined" ? document.documentElement : null);

  function oneOf(v, allowed, fallback) {
    const s = String(v == null ? "" : v);
    for (const [id] of allowed) if (id === s) return s;
    return fallback;
  }
  function normHex(v, fallback) {
    const m = String(v || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
    return m ? ("#" + m[1].toLowerCase()) : fallback;
  }

  let theme = oneOf(store.get(K_THEME, "dark"), THEMES, "dark");
  let menuAccent = oneOf(store.get(K_MENU, "brand"), ACCENTS, "brand");
  let hudAccent = oneOf(store.get(K_HUD, "team"), ACCENTS, "team");
  let menuHex = normHex(store.get(K_MENU_HEX, PRESET_HEX.brand), PRESET_HEX.brand);
  let hudHex = normHex(store.get(K_HUD_HEX, PRESET_HEX.brand), PRESET_HEX.brand);

  function hexRgb(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    if (!Number.isFinite(n)) return null;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function relLum(c) {
    const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function wcag(a, b) {
    const L1 = relLum(a), L2 = relLum(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function readCssRgb(prop) {
    const el = root();
    if (!el || typeof getComputedStyle !== "function") return null;
    const raw = getComputedStyle(el).getPropertyValue(prop).trim();
    const hex = raw.match(/^#([0-9a-fA-F]{6})$/);
    if (hex) return hexRgb("#" + hex[1]);
    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (rgb) return [+rgb[1] / 255, +rgb[2] / 255, +rgb[3] / 255];
    return null;
  }
  function pickInk(accentHex) {
    const a = hexRgb(accentHex);
    const text = readCssRgb("--text") || [0.965, 0.965, 0.976];
    const bg = readCssRgb("--bg") || [0.047, 0.047, 0.078];
    if (!a) return "var(--text)";
    return wcag(a, text) >= wcag(a, bg) ? "var(--text)" : "var(--bg)";
  }

  function teamHex() {
    const el = root();
    const id = el && el.dataset ? el.dataset.team : "";
    if (id && typeof Teams !== "undefined" && Teams && Array.isArray(Teams.LIST)) {
      const t = Teams.LIST.find((x) => x && x.id === id);
      if (t && t.color) {
        const f = (v) => ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2);
        return "#" + f(t.color[0]) + f(t.color[1]) + f(t.color[2]);
      }
    }
    // No team yet (title screen) — brand red is the cascade default for --accent.
    return PRESET_HEX.brand;
  }

  function resolveAccent(mode, customHex) {
    if (mode === "custom") return normHex(customHex, PRESET_HEX.brand);
    if (mode === "team") return teamHex();
    if (mode === "brand") return PRESET_HEX.brand;
    return PRESET_HEX[mode] || PRESET_HEX.brand;
  }

  function applyTheme() {
    const el = root();
    if (!el) return;
    el.dataset.uiTheme = theme;
  }

  function applyMenuAccent() {
    const el = root();
    if (!el) return;
    el.dataset.menuAccent = menuAccent;
    if (menuAccent === "custom") {
      el.style.setProperty("--red", menuHex);
    } else if (menuAccent === "team") {
      // Concrete hex — avoids a --red ↔ --accent cycle when HUD is also brand.
      el.style.setProperty("--red", teamHex());
    } else if (menuAccent === "brand") {
      el.style.removeProperty("--red");
    } else {
      // Named presets: CSS :root[data-menu-accent=…] owns --red.
      el.style.removeProperty("--red");
    }
  }

  function applyHudAccent() {
    const el = root();
    if (!el) return;
    el.dataset.hudAccent = hudAccent;
    if (hudAccent === "team") {
      // Team skin (data-team rows + hud.js skinAccent) owns --accent.
      el.style.removeProperty("--accent");
      el.style.removeProperty("--accent-ink");
      return;
    }
    const hex = resolveAccent(hudAccent, hudHex);
    if (hudAccent === "brand") {
      el.style.setProperty("--accent", "var(--red)");
      el.style.setProperty("--accent-ink", pickInk(resolveAccent(menuAccent, menuHex)));
      return;
    }
    el.style.setProperty("--accent", hex);
    el.style.setProperty("--accent-ink", pickInk(hex));
  }

  function applyAll() {
    applyTheme();
    applyMenuAccent();
    applyHudAccent();
    syncCustomRows();
  }

  function syncCustomRows() {
    const menuRow = typeof document !== "undefined" ? document.getElementById("pm-menuaccent-custom") : null;
    const hudRow = typeof document !== "undefined" ? document.getElementById("pm-hudaccent-custom") : null;
    if (menuRow) menuRow.hidden = menuAccent !== "custom";
    if (hudRow) hudRow.hidden = hudAccent !== "custom";
    const menuIn = typeof document !== "undefined" ? document.getElementById("pm-menuaccent-hex") : null;
    const hudIn = typeof document !== "undefined" ? document.getElementById("pm-hudaccent-hex") : null;
    if (menuIn) menuIn.value = menuHex;
    if (hudIn) hudIn.value = hudHex;
  }

  function paintRow(id, value) {
    if (typeof SettingRow !== "undefined" && SettingRow && typeof SettingRow.paint === "function") {
      SettingRow.paint(id, value);
    }
  }
  function setTheme(v) {
    theme = oneOf(v, THEMES, "dark");
    store.set(K_THEME, theme);
    applyAll();
    paintRow("pm-uitheme", theme);
    return theme;
  }
  function setMenuAccent(v) {
    menuAccent = oneOf(v, ACCENTS, "brand");
    store.set(K_MENU, menuAccent);
    applyAll();
    paintRow("pm-menuaccent", menuAccent);
    return menuAccent;
  }
  function setHudAccent(v) {
    hudAccent = oneOf(v, ACCENTS, "team");
    store.set(K_HUD, hudAccent);
    applyAll();
    paintRow("pm-hudaccent", hudAccent);
    return hudAccent;
  }
  function setMenuHex(v) {
    menuHex = normHex(v, menuHex);
    store.set(K_MENU_HEX, menuHex);
    if (menuAccent !== "custom") menuAccent = "custom";
    store.set(K_MENU, menuAccent);
    applyAll();
    paintRow("pm-menuaccent", menuAccent);
    return menuHex;
  }
  function setHudHex(v) {
    hudHex = normHex(v, hudHex);
    store.set(K_HUD_HEX, hudHex);
    if (hudAccent !== "custom") hudAccent = "custom";
    store.set(K_HUD, hudAccent);
    applyAll();
    paintRow("pm-hudaccent", hudAccent);
    return hudHex;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    SettingRow.wire("pm-uitheme", {
      values: THEMES,
      read: () => theme,
      write: (v) => setTheme(v),
    });
    SettingRow.wire("pm-menuaccent", {
      values: ACCENTS,
      read: () => menuAccent,
      write: (v) => setMenuAccent(v),
    });
    SettingRow.wire("pm-hudaccent", {
      values: ACCENTS,
      read: () => hudAccent,
      write: (v) => setHudAccent(v),
    });
    const menuIn = document.getElementById("pm-menuaccent-hex");
    if (menuIn) {
      menuIn.value = menuHex;
      menuIn.addEventListener("input", () => setMenuHex(menuIn.value));
      menuIn.addEventListener("change", () => setMenuHex(menuIn.value));
    }
    const hudIn = document.getElementById("pm-hudaccent-hex");
    if (hudIn) {
      hudIn.value = hudHex;
      hudIn.addEventListener("input", () => setHudHex(hudIn.value));
      hudIn.addEventListener("change", () => setHudHex(hudIn.value));
    }
    syncCustomRows();
  }

  // Apply before first paint when possible.
  applyAll();

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
    // SYSTEM follows OS changes live.
    try {
      const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
      if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (theme === "system") applyAll(); });
      else if (mq && mq.addListener) mq.addListener(() => { if (theme === "system") applyAll(); });
    } catch (_) { /* harness */ }
  }

  return {
    K_THEME, K_MENU, K_HUD, K_MENU_HEX, K_HUD_HEX,
    THEMES, ACCENTS, PRESET_HEX,
    theme: () => theme,
    menuAccent: () => menuAccent,
    hudAccent: () => hudAccent,
    menuHex: () => menuHex,
    hudHex: () => hudHex,
    hudUsesTeam: () => hudAccent === "team",
    setTheme, setMenuAccent, setHudAccent, setMenuHex, setHudHex,
    applyAll, applyMenuAccent, applyHudAccent, initUI,
  };
})();
Object.freeze(AppearanceOpts);
