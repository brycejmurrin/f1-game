const TitleFx = (function () {
  "use strict";

  const KEY = "motion";
  const KEY_INTRO = "titleIntro";
  const KEY_WASH = "menuWash";
  const KEY_ART = "titleArt";
  const MOTION = [["auto", "AUTO"], ["reduce", "ON"], ["off", "OFF"]];
  const INTROS = [["full", "FULL"], ["quick", "QUICK"], ["off", "OFF"]];
  const WASHES = [["full", "FULL"], ["soft", "SOFT"], ["off", "OFF"]];
  const ARTS = [["on", "ON"], ["soft", "SOFT"], ["off", "OFF"]];
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
  const changed = () => {
    for (const fn of subs) fn();
    if (typeof ScreenLooks !== "undefined") ScreenLooks.peek("title", ScreenLooks.PEEK_MS);
  };

  const osReduce = () => !!(osQuery && osQuery.matches);
  function choice() {
    const v = store.get(KEY, null);
    if (v === "reduce") return "reduce";
    if (v === "off") return "off";
    return "auto";
  }
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
  function washMode() {
    const v = store.get(KEY_WASH, null);
    if (v === "soft" || v === "off") return v;
    return "full";
  }
  function artMode() {
    const v = store.get(KEY_ART, null);
    if (v === "soft" || v === "off") return v;
    return "on";
  }
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
  function apply() {
    applyMotion();
    applyIntro();
    applyWash();
    applyArt();
  }

  function setChoice(v) {
    const next = (v === "reduce" || v === "off") ? v : "auto";
    store.set(KEY, next);
    applyMotion();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-motion", choice());
    return choice();
  }
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
    const next = (v === "soft" || v === "off") ? v : "full";
    store.set(KEY_WASH, next);
    applyWash();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-menuwash", washMode());
    changed();
    return washMode();
  }
  function setArt(v) {
    const next = (v === "soft" || v === "off") ? v : "on";
    store.set(KEY_ART, next);
    applyArt();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleart", artMode());
    changed();
    return artMode();
  }

  function holdIntro(force) {
    clearTimeout(introTimer);
    if (mode() === "reduce") { endIntro(); return; }
    if (!force && introMode() === "off") { endIntro(); return; }
    const ms = (force && introMode() === "off") ? INTRO_MS.full : introHoldMs();
    if (ms <= 0) { endIntro(); return; }
    introTimer = setTimeout(() => { endIntro(); if (force) applyIntro(); }, ms);
  }

  function replay() {
    const ov = overlay();
    if (!ov || mode() === "reduce") return;
    endIntro();
    if (introMode() === "off" && root && root.dataset) delete root.dataset.titleIntro;
    requestAnimationFrame(() => { ov.setAttribute("data-intro", ""); holdIntro(true); });
  }

  function confirmTap(e) {
    if (!e || !e.isTrusted) return;
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
    if (gate) gate(wireRows); else wireRows();
  }

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
    const replayBtn = byId("pm-replay-intro");
    if (replayBtn && !replayBtn._wired) {
      replayBtn._wired = true;
      replayBtn.addEventListener("click", () => replay());
    }
  }

  apply();
  if (osQuery && osQuery.addEventListener) osQuery.addEventListener("change", applyMotion);

  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", () => initUI(typeof SettingsNav !== "undefined" ? SettingsNav.lazy : null), { once: true });
  }

  return {
    KEY, KEY_INTRO, KEY_WASH, KEY_ART, MOTION, INTROS, WASHES, ARTS, INTRO_MS,
    choice, mode, introMode, washMode, artMode, introHoldMs,
    set, setChoice, setIntro, setWash, setArt, onChange,
    apply, applyMotion, applyIntro, applyWash, applyArt, replay, initUI, wireRows,
  };
})();
Object.freeze(TitleFx);
