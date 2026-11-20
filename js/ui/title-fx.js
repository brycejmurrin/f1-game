/* Apex 26 — TitleFx: title-screen motion, wash and the background drawing.

   Accessibility owns the REDUCE MOTION row. Appearance › Title Screen owns
   intro, wash, art, button style and replay. The shell reads saved choices
   before first paint. TitleFx updates them at runtime and notifies TitleLayout.

   Needs GameStore at eval (HARD_EDGES). Input and SettingRow are read at call
   time only. */
const TitleFx = (function () {
  "use strict";

  const KEY = "motion";
  const KEY_INTRO = "titleIntro";
  const KEY_WASH = "menuWash";
  const KEY_ART = "titleArt";
  const KEY_STYLE = "titleButtonStyle";
  const BUTTON_STYLES = [["auto", "AUTO"], ["racing", "RACING"], ["flat", "FLAT"]];
  const STYLE_ROW = "pm-titlebuttonstyle";
  // UI labels AUTO / ON / OFF; stored tokens auto / reduce / off (reduce = always reduce).
  const MOTION = [["auto", "AUTO"], ["reduce", "ON"], ["off", "OFF"]];
  const INTROS = [["full", "FULL"], ["quick", "QUICK"], ["off", "OFF"]];
  const WASHES = [["full", "FULL"], ["medium", "MEDIUM"], ["soft", "SOFT"], ["off", "OFF"]];
  const ARTS = [["on", "ON"], ["medium", "MEDIUM"], ["soft", "SOFT"], ["off", "OFF"]];
  // Hold windows: FULL covers the CSS timeline (~2.5 s); QUICK matches the
  // halved --intro-* / --dur-* tokens under data-title-intro="quick".
  const INTRO_MS = { full: 2800, quick: 1200, off: 0 };
  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const osQuery = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const byId = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);
  const overlay = () => byId("overlay");
  let introTimer = 0;
  const subs = [];
  function onChange(fn) { if (typeof fn === "function") subs.push(fn); }
  // Refresh the title summary and briefly preview the changed setting.
  const changed = () => {
    for (const fn of subs) fn();
    if (typeof ScreenLooks !== "undefined") ScreenLooks.peek("title", ScreenLooks.PEEK_MS);
  };

  const osReduce = () => !!(osQuery && osQuery.matches);
  // Stored choice for REDUCE MOTION. Legacy "on" (old MOTION: ON) maps to AUTO
  // so an OS that asks for reduced motion still wins for those saves; "reduce"
  // stays ON (always reduce); "off" is the new override.
  function choice() {
    const v = store.get(KEY, null);
    if (v === "reduce") return "reduce";
    if (v === "off") return "off";
    return "auto";   // null, "auto", legacy "on", garbage
  }
  // Effective motion for CSS / race callers: "reduce" | "on".
  function mode() {
    const c = choice();
    if (c === "reduce") return "reduce";
    if (c === "off") return "on";
    return osReduce() ? "reduce" : "on";
  }
  function introMode() {
    const v = store.get(KEY_INTRO, null);
    if (v === "quick" || v === "off") return v;
    return "full";
  }
  const strength = (v, fallback) => v === "medium" || v === "soft" || v === "off" ? v : fallback;
  const washMode = () => strength(store.get(KEY_WASH, null), "full");
  const artMode = () => strength(store.get(KEY_ART, null), "on");
  function normalizeButtonStyle(v) {
    return v === "racing" || v === "flat" ? v : "auto";
  }
  function buttonStyle() { return normalizeButtonStyle(store.get(KEY_STYLE, null)); }
  function introHoldMs() {
    return INTRO_MS[introMode()] || INTRO_MS.full;
  }

  function endIntro() {
    clearTimeout(introTimer);
    const ov = overlay();
    if (ov) ov.removeAttribute("data-intro");
  }

  function applyMotion() {
    if (!root || !root.dataset) return;
    if (mode() === "reduce") { root.dataset.motion = "reduce"; endIntro(); }
    else delete root.dataset.motion;
  }
  function applyIntro() {
    if (!root || !root.dataset) return;
    const i = introMode();
    if (i === "full") delete root.dataset.titleIntro;
    else root.dataset.titleIntro = i;
    // OFF (or a live flip to OFF while the reveal is mid-flight) drops it now.
    if (i === "off" || mode() === "reduce") endIntro();
  }
  function applyWash() {
    if (!root || !root.dataset) return;
    const w = washMode();
    if (w === "full") delete root.dataset.menuWash;
    else root.dataset.menuWash = w;
  }
  function applyArt() {
    if (!root || !root.dataset) return;
    const a = artMode();
    if (a === "on") delete root.dataset.titleArt;
    else root.dataset.titleArt = a;
  }
  function applyButtonStyle() {
    if (!root || !root.dataset) return;
    const style = buttonStyle();
    if (style === "auto") delete root.dataset.titleButtonStyle;
    else root.dataset.titleButtonStyle = style;
  }
  function apply() {
    applyMotion();
    applyIntro();
    applyWash();
    applyArt();
    applyButtonStyle();
  }

  function setChoice(v) {
    const next = (v === "reduce" || v === "off") ? v : "auto";
    store.set(KEY, next);
    applyMotion();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-motion", choice());
    return choice();
  }
  // Legacy alias: set("reduce") / set("on") — "on" now means AUTO (motion allowed).
  function set(v) {
    if (v === "reduce") return setChoice("reduce");
    if (v === "off") return setChoice("off");
    return setChoice("auto");
  }
  function setIntro(v) {
    const next = (v === "quick" || v === "off") ? v : "full";
    store.set(KEY_INTRO, next);
    applyIntro();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleintro", introMode());
    changed();
    return introMode();
  }
  function setWash(v) {
    const next = strength(v, "full");
    store.set(KEY_WASH, next);
    applyWash();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-menuwash", washMode());
    changed();
    return washMode();
  }
  function setArt(v) {
    const next = strength(v, "on");
    store.set(KEY_ART, next);
    applyArt();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleart", artMode());
    changed();
    return artMode();
  }

  function setButtonStyle(v) {
    store.set(KEY_STYLE, normalizeButtonStyle(v));
    applyButtonStyle();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint(STYLE_ROW, buttonStyle());
    changed();
    return buttonStyle();
  }

  // Hold the intro for one pass, then drop to the resting title for good.
  // force=true (replay) still plays under INTRO OFF — one FULL preview, then
  // rest (and the off stamp is put back so CSS stays still afterwards).
  function holdIntro(force) {
    clearTimeout(introTimer);
    if (mode() === "reduce") { endIntro(); return; }
    if (!force && introMode() === "off") { endIntro(); return; }
    const ms = (force && introMode() === "off") ? INTRO_MS.full : introHoldMs();
    if (ms <= 0) { endIntro(); return; }
    introTimer = setTimeout(() => { endIntro(); if (force) applyIntro(); }, ms);
  }

  // Play it again on demand. Removing and re-adding the attribute in one task
  // is a no-op to the style engine; a frame between is what restarts it —
  // without forcing a layout to get there. Under INTRO OFF the off stamp is
  // lifted for the preview so CSS actually runs, then put back after.
  function replay() {
    const ov = overlay();
    if (!ov || mode() === "reduce") return;
    endIntro();
    if (introMode() === "off" && root && root.dataset) delete root.dataset.titleIntro;
    requestAnimationFrame(() => { ov.setAttribute("data-intro", ""); holdIntro(true); });
  }

  // Android-only in practice: Input.vibrate returns early where navigator has
  // no vibrate (every iOS browser), and scales by the HAPTICS slider elsewhere.
  function confirmTap(e) {
    if (!e || !e.isTrusted) return;   // a scripted .click() is not a finger
    const t = e.target;
    const btn = t && t.closest ? t.closest(".bigbtn") : null;
    if (!btn || btn.disabled) return;
    if (typeof Input !== "undefined" && Input.vibrate) Input.vibrate(8);
  }

  function initUI(gate) {
    const ov = overlay();
    if (ov) {
      if (mode() === "reduce" || introMode() === "off") endIntro();
      else if (!ov.hidden) holdIntro();
      else if (typeof MutationObserver !== "undefined") {
        // Booted straight past the title (a deep link): the intro is held for
        // the first time the title is actually seen, then never again.
        const mo = new MutationObserver(() => {
          if (ov.hidden) return;
          mo.disconnect();
          holdIntro();
        });
        mo.observe(ov, { attributes: true, attributeFilter: ["hidden"] });
      } else endIntro();
      ov.addEventListener("click", confirmTap);
      if (document.visibilityState === "hidden") ov.setAttribute("data-paused", "");
    }
    document.addEventListener("visibilitychange", () => {
      if (!ov) return;
      if (document.visibilityState === "hidden") ov.setAttribute("data-paused", "");
      else ov.removeAttribute("data-paused");
    });
    // #4798 gate: rows only
    if (gate) gate(wireRows); else wireRows();
  }

  // TITLE SCREEN fold rows under SETTINGS › APPEARANCE. REDUCE MOTION is
  // wired by A11yOpts once the Accessibility panel has built #pm-motion.
  function wireRows() {
    if (typeof SettingRow === "undefined") return;
    if (byId("pm-titleintro")) {
      SettingRow.wire("pm-titleintro", {
        values: INTROS,
        read: introMode,
        write: (v) => setIntro(v),
      });
    }
    if (byId("pm-menuwash")) {
      SettingRow.wire("pm-menuwash", {
        values: WASHES,
        read: washMode,
        write: (v) => setWash(v),
      });
    }
    if (byId("pm-titleart")) {
      SettingRow.wire("pm-titleart", {
        values: ARTS,
        read: artMode,
        write: (v) => setArt(v),
      });
    }
    const body = byId("pm-titlescreen-body");
    if (body && !byId(STYLE_ROW)) {
      const row = SettingRow.build(STYLE_ROW, "BUTTON STYLE");
      const help = document.createElement("p");
      help.id = STYLE_ROW + "-help";
      help.className = "adv-help";
      help.textContent = "AUTO adapts to the screen. Choose RACING for angled buttons or FLAT for straight buttons in both orientations.";
      row.sel.setAttribute("aria-describedby", help.id);
      body.insertBefore(row.row, body.firstChild);
      body.insertBefore(help, row.row.nextSibling);
    }
    if (byId(STYLE_ROW)) {
      SettingRow.wire(STYLE_ROW, { values: BUTTON_STYLES, read: buttonStyle, write: setButtonStyle });
    }
    const replayBtn = byId("pm-replay-intro");
    if (replayBtn && !replayBtn._wired) {
      replayBtn._wired = true;
      replayBtn.addEventListener("click", () => replay());
    }
  }

  apply();
  // The OS preference is followed live, on top of the stored choice.
  if (osQuery && osQuery.addEventListener) osQuery.addEventListener("change", applyMotion);

  // Deferred scripts run while readyState is "interactive" and SettingRow loads
  // after this file, so only a document that is already COMPLETE wires now.
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", () => initUI(typeof SettingsNav !== "undefined" ? SettingsNav.lazy : null), { once: true });
  }

  return {
    KEY, KEY_INTRO, KEY_WASH, KEY_ART, MOTION, INTROS, WASHES, ARTS, INTRO_MS,
    choice, mode, introMode, washMode, artMode, introHoldMs,
    set, setChoice, setIntro, setWash, setArt, buttonStyle, setButtonStyle, onChange,
    apply, applyMotion, applyIntro, applyWash, applyArt, replay, initUI, wireRows,
  };
})();
Object.freeze(TitleFx);
