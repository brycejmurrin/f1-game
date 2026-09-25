/* Apex 26 — AppearanceOpts: THEME + MENU ACCENT + HUD ACCENT preferences.
   Self-contained like DrivingLineOpts: GameStore + SettingRow, no G façade.
   Applies on :root via data-ui-theme / data-menu-accent / data-hud-accent and
   (for CUSTOM only) inline --red / --accent / --accent-ink. Named presets live
   in css/tokens.css so fills/grads that derive from --red follow automatically.

   Stored values are read at EVAL so the first paint matches the player's pick.
   UI wiring waits for the DOM. Preset swatches + hex text fields sit beside
   the SettingRow selects; a live preview strip mirrors --red / --accent. */
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
  // Named presets that tokens.css must define as :root[data-menu-accent=…].
  const CSS_MENU_PRESETS = ["ember", "amber", "cyan", "violet", "lime"];

  const store = GameStore.store;
  const root = () => (typeof document !== "undefined" ? document.documentElement : null);
  const byId = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);

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

  function syncCustomRows() {
    const menuRow = byId("pm-menuaccent-custom");
    const hudRow = byId("pm-hudaccent-custom");
    if (menuRow) menuRow.hidden = menuAccent !== "custom";
    if (hudRow) hudRow.hidden = hudAccent !== "custom";
    const menuIn = byId("pm-menuaccent-hex");
    const hudIn = byId("pm-hudaccent-hex");
    const menuTx = byId("pm-menuaccent-hextext");
    const hudTx = byId("pm-hudaccent-hextext");
    if (menuIn) menuIn.value = menuHex;
    if (hudIn) hudIn.value = hudHex;
    if (menuTx && document.activeElement !== menuTx) menuTx.value = menuHex;
    if (hudTx && document.activeElement !== hudTx) hudTx.value = hudHex;
    syncSwatches("pm-menuaccent-swatches", menuAccent, "menu");
    syncSwatches("pm-hudaccent-swatches", hudAccent, "hud");
  }

  function chipHex(id, which) {
    if (id === "custom") return which === "menu" ? menuHex : hudHex;
    return resolveAccent(id, which === "menu" ? menuHex : hudHex);
  }

  function buildSwatches(containerId, which) {
    const el = byId(containerId);
    if (!el || el.dataset.built === "1") return;
    el.dataset.built = "1";
    for (const [id, label] of ACCENTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pm-accent-chip" + (id === "custom" ? " pm-accent-chip-custom" : "");
      btn.dataset.accent = id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", label);
      btn.title = label;
      if (id !== "custom") btn.style.setProperty("--chip", chipHex(id, which));
      btn.addEventListener("click", () => {
        if (which === "menu") setMenuAccent(id);
        else setHudAccent(id);
      });
      el.appendChild(btn);
    }
  }

  function syncSwatches(containerId, selected, which) {
    const el = byId(containerId);
    if (!el) return;
    const chips = el.querySelectorAll ? el.querySelectorAll(".pm-accent-chip") : [];
    for (const btn of chips) {
      const id = btn.dataset.accent;
      const on = id === selected;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (id === "team" || id === "custom") {
        if (id === "custom") continue;
        btn.style.setProperty("--chip", chipHex(id, which));
      }
    }
  }

  function applyAll() {
    applyTheme();
    applyMenuAccent();
    applyHudAccent();
    syncCustomRows();
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
    const next = normHex(v, null);
    if (!next) return menuHex;
    menuHex = next;
    store.set(K_MENU_HEX, menuHex);
    if (menuAccent !== "custom") menuAccent = "custom";
    store.set(K_MENU, menuAccent);
    applyAll();
    paintRow("pm-menuaccent", menuAccent);
    return menuHex;
  }
  function setHudHex(v) {
    const next = normHex(v, null);
    if (!next) return hudHex;
    hudHex = next;
    store.set(K_HUD_HEX, hudHex);
    if (hudAccent !== "custom") hudAccent = "custom";
    store.set(K_HUD, hudAccent);
    applyAll();
    paintRow("pm-hudaccent", hudAccent);
    return hudHex;
  }

  function wireHexPair(colorId, textId, write) {
    const color = byId(colorId);
    const text = byId(textId);
    if (color) {
      color.addEventListener("input", () => write(color.value));
      color.addEventListener("change", () => write(color.value));
    }
    if (text) {
      text.addEventListener("input", () => {
        const n = normHex(text.value, null);
        if (n) write(n);
      });
      text.addEventListener("change", () => {
        write(text.value);
        text.value = write === setMenuHex ? menuHex : hudHex;
      });
      text.addEventListener("blur", () => {
        text.value = write === setMenuHex ? menuHex : hudHex;
      });
    }
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
    buildSwatches("pm-menuaccent-swatches", "menu");
    buildSwatches("pm-hudaccent-swatches", "hud");
    wireHexPair("pm-menuaccent-hex", "pm-menuaccent-hextext", setMenuHex);
    wireHexPair("pm-hudaccent-hex", "pm-hudaccent-hextext", setHudHex);
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
    THEMES, ACCENTS, PRESET_HEX, CSS_MENU_PRESETS,
    theme: () => theme,
    menuAccent: () => menuAccent,
    hudAccent: () => hudAccent,
    menuHex: () => menuHex,
    hudHex: () => hudHex,
    hudUsesTeam: () => hudAccent === "team",
    teamHex, resolveAccent, pickInk,
    setTheme, setMenuAccent, setHudAccent, setMenuHex, setHudHex,
    applyAll, applyMenuAccent, applyHudAccent, initUI,
  };
})();
Object.freeze(AppearanceOpts);
