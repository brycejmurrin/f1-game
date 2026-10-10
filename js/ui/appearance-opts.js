/* Apex 26 — AppearanceOpts: THEME + MENU ACCENT + HUD ACCENT preferences,
   and READABILITY (TEXT SIZE / HIGH CONTRAST / SPEED UNITS / HELP TEXT).
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
  const K_TEXT = "textSize";
  const K_CONTRAST = "uiContrast";
  const K_CVD = "cvdMode";
  const K_UNITS = "speedUnits";
  const K_HELP = "menuHelp";

  const THEMES = [["dark", "DARK"], ["light", "LIGHT"], ["system", "SYSTEM"]];
  // READABILITY. Text size scales the --fs-* type ladder (tokens.css) and a
  // modest --hud-text-boost so race digits grow with the menus. High contrast
  // swaps see-through plates for solid ones and brightens secondary text.
  // COLOUR VISION remaps semantic HUD/menu ink (faster/slower/you) for the
  // three common deficiencies — not a full-scene filter (that washes the road).
  // Units are display-only: physics and every stored number stay in km/h.
  const TEXT_SIZES = [["normal", "NORMAL"], ["large", "LARGE"], ["larger", "LARGER"]];
  const CONTRASTS = [["off", "OFF"], ["high", "HIGH"]];
  const CVD_MODES = [["off", "OFF"], ["deutan", "DEUTERANOPIA"], ["protan", "PROTANOPIA"], ["tritan", "TRITANOPIA"]];
  const UNITS = [["kmh", "KM/H"], ["mph", "MPH"]];
  // HELP TEXT: HIDE drops the grey .adv-help explanations inside the settings
  // sheet and the race setup (css/components.css keys off <html
  // data-menu-help="off">, written only when hidden). Status lines, live
  // regions and anything marked data-help="keep" (warnings, readouts) stay.
  const HELPS = [["on", "SHOW"], ["off", "HIDE"]];
  const KPH_PER_MPH = 1.609344;
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
  let menuAccent = oneOf(store.get(K_MENU, "ember"), ACCENTS, "ember");
  let hudAccent = oneOf(store.get(K_HUD, "team"), ACCENTS, "team");
  let menuHex = normHex(store.get(K_MENU_HEX, PRESET_HEX.brand), PRESET_HEX.brand);
  let hudHex = normHex(store.get(K_HUD_HEX, PRESET_HEX.brand), PRESET_HEX.brand);
  let textSize = oneOf(store.get(K_TEXT, "large"), TEXT_SIZES, "large");
  let contrast = oneOf(store.get(K_CONTRAST, "high"), CONTRASTS, "high");
  let cvdMode = oneOf(store.get(K_CVD, "off"), CVD_MODES, "off");
  let units = oneOf(store.get(K_UNITS, "kmh"), UNITS, "kmh");
  let help = oneOf(store.get(K_HELP, "on"), HELPS, "on");

  /** A km/h reading in the player's unit, rounded for display. */
  function speed(kph) {
    const v = Number(kph) || 0;
    return Math.round(units === "mph" ? v / KPH_PER_MPH : v);
  }
  function unitLabel() { return units === "mph" ? "MPH" : "KM/H"; }

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
  // ONE getComputedStyle flush for both token reads, cached across pickInk calls
  // until theme/contrast attrs change (ForcedReflow 2026-10-05: the old per-token
  // reader topped at 34 ms; apply() calls pickInk for menu + HUD + every preset chip).
  function readCssRgbFrom(cs, prop) {
    if (!cs) return null;
    const raw = cs.getPropertyValue(prop).trim();
    const hex = raw.match(/^#([0-9a-fA-F]{6})$/);
    if (hex) return hexRgb("#" + hex[1]);
    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (rgb) return [+rgb[1] / 255, +rgb[2] / 255, +rgb[3] / 255];
    return null;
  }
  let _inkKey = "", _inkText = null, _inkBg = null;
  function themeInkPair() {
    const el = root();
    // SYSTEM stamps the same data-ui-theme either way: the OS scheme is part of the key.
    let osLight = "";
    try { osLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "L" : "D"; } catch (_) { /* harness */ }
    const k = osLight + "|" + (el && el.getAttribute("data-ui-theme") || "") + "|" +
      (el && el.getAttribute("data-ui-contrast") || "") + "|" +
      (typeof document !== "undefined" && document.documentElement
        ? document.documentElement.className : "");
    if (k === _inkKey && _inkText && _inkBg) return [_inkText, _inkBg];
    const cs = el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
    _inkKey = k;
    _inkText = readCssRgbFrom(cs, "--text") || [0.965, 0.965, 0.976];
    _inkBg = readCssRgbFrom(cs, "--bg") || [0.047, 0.047, 0.078];
    return [_inkText, _inkBg];
  }
  function pickInk(accentHex) {
    const a = hexRgb(accentHex);
    const [text, bg] = themeInkPair();
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
    el.style.setProperty("--menu-accent-ink", pickInk(resolveAccent(menuAccent, menuHex)));
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
    const chips = [];
    for (const [id, label] of ACCENTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pm-accent-chip" + (id === "custom" ? " pm-accent-chip-custom" : "");
      btn.dataset.accent = id;
      btn.dataset.arrows = "listbox";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", label);
      btn.title = label;
      // A NAMED pill, not a bare square: BRAND, TEAM and CUSTOM can all be red,
      // and three identical red squares read as one choice.
      btn.textContent = label;
      paintChip(btn, id, which, false);
      const choose = () => {
        if (which === "menu") { if (menuAccent !== id) setMenuAccent(id); }
        else if (hudAccent !== id) setHudAccent(id);
        btn.focus();
      };
      btn.addEventListener("click", choose);
      btn.addEventListener("keydown", (e) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        // MenuNav uses the pad's synthetic vertical arrows to leave the row.
        if (e.isTrusted === false && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;
        const at = chips.indexOf(btn), last = chips.length - 1;
        const next = e.key === "Home" ? 0 : e.key === "End" ? last
          : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, at - 1)
          : e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(last, at + 1) : -1;
        if (next < 0) return;
        e.preventDefault(); e.stopPropagation();
        chips[next].click();
      });
      chips.push(btn);
      el.appendChild(btn);
    }
  }

  function syncSwatches(containerId, selected, which) {
    const el = byId(containerId);
    if (!el) return;
    const chips = el.querySelectorAll ? el.querySelectorAll(".pm-accent-chip") : [];
    let focused = false, selectedButton = null;
    for (const btn of chips) {
      const id = btn.dataset.accent;
      const on = id === selected;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      if (document.activeElement === btn) focused = true;
      if (on) selectedButton = btn;
      if (id === "team" || id === "custom") paintChip(btn, id, which, on);
    }
    // A profile/native select may change the chosen option while this list owns
    // focus. Keep its focus and sole tab stop together; hex editors stay put.
    if (focused && selectedButton && document.activeElement !== selectedButton) selectedButton.focus();
  }

  // CUSTOM shows the player's colour only once it is the pick; until then it is
  // a plain plate, so an untouched custom (brand red by default) is not a 3rd red.
  function paintChip(btn, id, which, on) {
    if (id === "custom" && !on) {
      btn.style.removeProperty("--chip");
      btn.style.removeProperty("--chip-ink");
      return;
    }
    const hex = chipHex(id, which);
    btn.style.setProperty("--chip", hex);
    btn.style.setProperty("--chip-ink", pickInk(hex));
  }

  function applyReadability() {
    const el = root();
    if (!el) return;
    if (textSize === "normal") delete el.dataset.textSize; else el.dataset.textSize = textSize;
    if (contrast === "high") el.dataset.uiContrast = "high"; else delete el.dataset.uiContrast;
    if (cvdMode === "off") delete el.dataset.cvd; else el.dataset.cvd = cvdMode;
    if (help === "off") el.dataset.menuHelp = "off"; else delete el.dataset.menuHelp;
    // Race HUD digit boost rides TEXT SIZE (menus already scale via --fs-*).
    // HUD SIZE remains the player's primary zoom; this is a readability nudge.
    const boost = textSize === "larger" ? "1.18" : textSize === "large" ? "1.10" : "";
    if (boost) el.style.setProperty("--hud-text-boost", boost);
    else el.style.removeProperty("--hud-text-boost");
    // The speedo's unit label and the preview's; the number follows on the next HUD tick.
    if (typeof document !== "undefined" && document.querySelectorAll) {
      for (const u of document.querySelectorAll("#hud-speed .hud-unit, .pm-look-unit")) u.textContent = unitLabel();
      const n = byId("pm-look-speed");
      if (n) n.textContent = String(speed(287));
    }
  }

  function applyAll() {
    applyTheme();
    applyReadability();
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
    menuAccent = oneOf(v, ACCENTS, "ember");
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

  function setTextSize(v) {
    textSize = oneOf(v, TEXT_SIZES, "large");
    store.set(K_TEXT, textSize);
    applyAll();
    paintRow("pm-textsize", textSize);
    return textSize;
  }
  function setContrast(v) {
    contrast = oneOf(v, CONTRASTS, "high");
    store.set(K_CONTRAST, contrast);
    applyAll();
    paintRow("pm-contrast", contrast);
    return contrast;
  }
  function setCvdMode(v) {
    cvdMode = oneOf(v, CVD_MODES, "off");
    store.set(K_CVD, cvdMode);
    applyAll();
    paintRow("pm-cvd", cvdMode);
    return cvdMode;
  }
  function setUnits(v) {
    units = oneOf(v, UNITS, "kmh");
    store.set(K_UNITS, units);
    applyAll();
    paintRow("pm-units", units);
    return units;
  }

  function setHelp(v) {
    help = oneOf(v, HELPS, "on");
    store.set(K_HELP, help);
    applyAll();
    paintRow("pm-helptext", help);
    return help;
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

  // Studio/profile restoration also updates this module's in-memory values.
  // Persistence is owned by the caller; repainting must not write a second batch.
  function restore(values) {
    const v = values || {};
    theme = oneOf(v.uiTheme, THEMES, "dark");
    menuAccent = oneOf(v.menuAccent, ACCENTS, "ember");
    hudAccent = oneOf(v.hudAccent, ACCENTS, "team");
    menuHex = normHex(v.menuAccentHex, PRESET_HEX.brand);
    hudHex = normHex(v.hudAccentHex, PRESET_HEX.brand);
    textSize = oneOf(v.textSize, TEXT_SIZES, "large");
    contrast = oneOf(v.uiContrast, CONTRASTS, "high");
    cvdMode = oneOf(v.cvdMode, CVD_MODES, "off");
    units = oneOf(v.speedUnits, UNITS, "kmh");
    help = oneOf(v.menuHelp, HELPS, "on");
    applyAll();
    for (const [id, value] of [["pm-uitheme", theme], ["pm-menuaccent", menuAccent], ["pm-hudaccent", hudAccent],
      ["pm-textsize", textSize], ["pm-contrast", contrast], ["pm-cvd", cvdMode], ["pm-units", units], ["pm-helptext", help]]) paintRow(id, value);
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // COLOUR VISION row is runtime-built (shellNodes at ceiling) — insert after
    // HIGH CONTRAST so READABILITY stays one fold.
    if (!byId("pm-cvd")) {
      const contrastRow = byId("pm-contrast");
      if (contrastRow && contrastRow.parentNode && SettingRow.build) {
        const built = SettingRow.build("pm-cvd", "COLOUR VISION", CVD_MODES);
        const help = document.createElement("p");
        help.className = "adv-help";
        help.id = "pm-cvd-help";
        help.textContent = "Remaps green/red HUD and menu ink for colour vision deficiency. The driving line still has its own COLOUR-BLIND palette under DISPLAY › HUD.";
        const after = contrastRow.nextElementSibling;
        // Skip the contrast help <p> so CVD sits under it.
        const insertBefore = after && after.tagName === "P" && after.id === "pm-contrast-help"
          ? after.nextSibling
          : after;
        contrastRow.parentNode.insertBefore(built.row, insertBefore || null);
        contrastRow.parentNode.insertBefore(help, built.row.nextSibling);
      }
    }
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
    SettingRow.wire("pm-textsize", { values: TEXT_SIZES, read: () => textSize, write: (v) => setTextSize(v) });
    SettingRow.wire("pm-contrast", { values: CONTRASTS, read: () => contrast, write: (v) => setContrast(v) });
    if (byId("pm-cvd")) {
      SettingRow.wire("pm-cvd", { values: CVD_MODES, read: () => cvdMode, write: (v) => setCvdMode(v) });
    }
    SettingRow.wire("pm-units", { values: UNITS, read: () => units, write: (v) => setUnits(v) });
    SettingRow.wire("pm-helptext", { values: HELPS, read: () => help, write: (v) => setHelp(v) });
    buildSwatches("pm-menuaccent-swatches", "menu");
    buildSwatches("pm-hudaccent-swatches", "hud");
    wireHexPair("pm-menuaccent-hex", "pm-menuaccent-hextext", setMenuHex);
    wireHexPair("pm-hudaccent-hex", "pm-hudaccent-hextext", setHudHex);
    syncCustomRows();
    applyReadability();   // the eval-time apply ran before #hud-speed's unit label existed
    // TEXT SIZE help: menus AND a HUD digit nudge.
    const tsHelp = byId("pm-textsize-help");
    if (tsHelp) {
      tsHelp.textContent = "Bigger words in the menus and settings, and a nudge to race HUD digits. HUD SIZE under DISPLAY still zooms the whole race chrome.";
    }
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
    K_THEME, K_MENU, K_HUD, K_MENU_HEX, K_HUD_HEX, K_TEXT, K_CONTRAST, K_CVD, K_UNITS, K_HELP,
    THEMES, ACCENTS, PRESET_HEX, CSS_MENU_PRESETS, TEXT_SIZES, CONTRASTS, CVD_MODES, UNITS, HELPS,
    textSize: () => textSize,
    contrast: () => contrast,
    cvdMode: () => cvdMode,
    units: () => units,
    help: () => help,
    speed, unitLabel, setTextSize, setContrast, setCvdMode, setUnits, setHelp,
    theme: () => theme,
    menuAccent: () => menuAccent,
    hudAccent: () => hudAccent,
    menuHex: () => menuHex,
    hudHex: () => hudHex,
    hudUsesTeam: () => hudAccent === "team",
    teamHex, resolveAccent, pickInk,
    setTheme, setMenuAccent, setHudAccent, setMenuHex, setHudHex,
    applyAll, applyMenuAccent, applyHudAccent, restore, initUI,
  };
})();
Object.freeze(AppearanceOpts);
