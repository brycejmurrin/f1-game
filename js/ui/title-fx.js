/* Apex 26 — TitleFx: title-screen motion, wash and the background drawing, as
   player settings under SETTINGS › APPEARANCE.

   MENU ANIMATIONS: ON / REDUCED. An OS that asks for reduced motion always
   wins, and is followed live; otherwise the stored choice answers, and unset
   is ON. Lands on <html data-motion="reduce"> — absent when motion is on —
   so CSS keys off ONE attribute.

   TITLE INTRO: FULL / QUICK / OFF. How long (and whether) the first-show
   title reveal runs. Lands on <html data-title-intro>. Unset is FULL.
   REDUCED motion still drops the intro at once. QUICK halves the CSS
   timeline via scoped --dur-* / --intro-* tokens under #overlay[data-intro].

   MENU WASH: FULL / SOFT / OFF. The red radial on #overlay plus its grain.
   Lands on <html data-menu-wash>. Unset is FULL (the shipped look).

   TITLE ART: ON / SOFT / OFF. Controls the #title-car line drawing behind the
   title menu via <html data-title-art>. Unset is ON (the shipped look).

   Five small jobs on #overlay (the title screen):
     * motion / intro / wash / title-art attributes (index.html's inline boot
       sets the FIRST answers before first paint; this file owns every later
       one);
     * the intro, ONCE: CSS keys off #overlay[data-intro]. The shell ships the
       attribute; this file takes it off after introHoldMs() once the overlay
       is first visible. REDUCED and INTRO OFF take it off at once. replay()
       is the one way to see it again (also wired to #pm-replay-intro) — and
       still works under INTRO OFF as a one-shot preview;
     * #overlay[data-paused] while the tab is hidden;
     * a light confirm tap on a title .bigbtn via Input.vibrate.

   Needs GameStore at eval (HARD_EDGES). Input and SettingRow are read at call
   time only. */
const TitleFx = (function () {
  "use strict";

  const KEY = "motion";              // apex26.motion — json: "on" | "reduce" | unset
  const KEY_INTRO = "titleIntro";    // apex26.titleIntro — json: "full" | "quick" | "off" | unset
  const KEY_WASH = "menuWash";       // apex26.menuWash — json: "full" | "soft" | "off" | unset
  const KEY_ART = "titleArt";        // apex26.titleArt — json: "on" | "soft" | "off" | unset
  const MOTION = [["on", "ON"], ["reduce", "REDUCED"]];
  const INTROS = [["full", "FULL"], ["quick", "QUICK"], ["off", "OFF"]];
  const WASHES = [["full", "FULL"], ["soft", "SOFT"], ["off", "OFF"]];
  const ARTS = [["on", "ON"], ["soft", "SOFT"], ["off", "OFF"]];
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

  const osReduce = () => !!(osQuery && osQuery.matches);
  // The OS asking for reduced motion always wins — the setting can only ADD
  // reduction — then the stored choice. A value the registry does not name
  // (hand-edited storage) reads as unset, which is ON.
  function mode() {
    if (osReduce()) return "reduce";
    return store.get(KEY, null) === "reduce" ? "reduce" : "on";
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
  function apply() {
    applyMotion();
    applyIntro();
    applyWash();
    applyArt();
  }

  function set(v) {
    store.set(KEY, v === "reduce" ? "reduce" : "on");
    applyMotion();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-motion", mode());
    return mode();
  }
  function setIntro(v) {
    const next = (v === "quick" || v === "off") ? v : "full";
    store.set(KEY_INTRO, next);
    applyIntro();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleintro", introMode());
    return introMode();
  }
  function setWash(v) {
    const next = (v === "soft" || v === "off") ? v : "full";
    store.set(KEY_WASH, next);
    applyWash();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-menuwash", washMode());
    return washMode();
  }
  function setArt(v) {
    const next = (v === "soft" || v === "off") ? v : "on";
    store.set(KEY_ART, next);
    applyArt();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleart", artMode());
    return artMode();
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

  function initUI() {
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
    wireRows();
  }

  // Static shell rows under SETTINGS › APPEARANCE (moved off DISPLAY › UI SIZE
  // so motion + title art sit with the other visual chrome).
  function wireRows() {
    if (typeof SettingRow === "undefined") return;
    if (byId("pm-motion")) {
      SettingRow.wire("pm-motion", {
        values: MOTION,
        read: mode,
        write: (v) => set(v),
      });
    }
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
  // The OS preference is followed live, on top of the stored choice.
  if (osQuery && osQuery.addEventListener) osQuery.addEventListener("change", applyMotion);

  // Deferred scripts run while readyState is "interactive" and SettingRow loads
  // after this file, so only a document that is already COMPLETE wires now.
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", initUI, { once: true });
  }

  return {
    KEY, KEY_INTRO, KEY_WASH, KEY_ART, MOTION, INTROS, WASHES, ARTS, INTRO_MS,
    mode, introMode, washMode, artMode, introHoldMs,
    set, setIntro, setWash, setArt,
    apply, applyMotion, applyIntro, applyWash, applyArt, replay, initUI, wireRows,
  };
})();
Object.freeze(TitleFx);
