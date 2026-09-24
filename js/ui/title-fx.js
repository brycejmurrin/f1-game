/* Apex 26 — TitleFx: title-screen motion and the background drawing, as
   player settings under SETTINGS › APPEARANCE.

   MENU ANIMATIONS: ON / REDUCED. An OS that asks for reduced motion always
   wins, and is followed live; otherwise the stored choice answers, and unset
   is ON. Lands on <html data-motion="reduce"> — absent when motion is on —
   so CSS keys off ONE attribute.

   TITLE ART: ON / SOFT / OFF. Controls the #title-car line drawing behind the
   title menu via <html data-title-art>. Unset is ON (the shipped look).

   Four small jobs on #overlay (the title screen):
     * motion + title-art attributes (index.html's inline boot sets the FIRST
       answers before first paint; this file owns every later one);
     * the intro, ONCE: CSS keys off #overlay[data-intro]. The shell ships the
       attribute; this file takes it off INTRO_MS after the overlay is first
       visible. REDUCED takes it off at once. replay() is the one way to see
       it again (also wired to #pm-replay-intro);
     * #overlay[data-paused] while the tab is hidden;
     * a light confirm tap on a title .bigbtn via Input.vibrate.

   Needs GameStore at eval (HARD_EDGES). Input and SettingRow are read at call
   time only. */
const TitleFx = (function () {
  "use strict";

  const KEY = "motion";            // apex26.motion — json: "on" | "reduce" | unset
  const KEY_ART = "titleArt";      // apex26.titleArt — json: "on" | "soft" | "off" | unset
  const MOTION = [["on", "ON"], ["reduce", "REDUCED"]];
  const ARTS = [["on", "ON"], ["soft", "SOFT"], ["off", "OFF"]];
  const INTRO_MS = 2800;           // the CSS intro is over by ~2.5 s (css/menus.css)
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
  function artMode() {
    const v = store.get(KEY_ART, null);
    if (v === "soft" || v === "off") return v;
    return "on";
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
  function applyArt() {
    if (!root || !root.dataset) return;
    const a = artMode();
    if (a === "on") delete root.dataset.titleArt;
    else root.dataset.titleArt = a;
  }
  function apply() {
    applyMotion();
    applyArt();
  }

  function set(v) {
    store.set(KEY, v === "reduce" ? "reduce" : "on");
    applyMotion();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-motion", mode());
    return mode();
  }
  function setArt(v) {
    const next = (v === "soft" || v === "off") ? v : "on";
    store.set(KEY_ART, next);
    applyArt();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-titleart", artMode());
    return artMode();
  }

  // Hold the intro for one pass, then drop to the resting title for good.
  function holdIntro() {
    clearTimeout(introTimer);
    introTimer = setTimeout(endIntro, INTRO_MS);
  }

  // Play it again on demand. Removing and re-adding the attribute in one task
  // is a no-op to the style engine; a frame between is what restarts it —
  // without forcing a layout to get there.
  function replay() {
    const ov = overlay();
    if (!ov || mode() === "reduce") return;
    endIntro();
    requestAnimationFrame(() => { ov.setAttribute("data-intro", ""); holdIntro(); });
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
      if (mode() === "reduce") endIntro();
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
    KEY, KEY_ART, MOTION, ARTS,
    mode, artMode, set, setArt, apply, applyMotion, applyArt, replay, initUI, wireRows,
  };
})();
Object.freeze(TitleFx);
