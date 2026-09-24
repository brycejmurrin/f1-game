/* Apex 26 — TitleFx: the title screen's motion, as a player setting.

   MENU ANIMATIONS: ON / REDUCED (SETTINGS › DISPLAY). An OS that asks for
   reduced motion always wins, and is followed live; otherwise the stored
   choice answers, and unset is ON. The answer lands on
   <html data-motion="reduce"> — absent when motion is on — so CSS keys off
   ONE attribute instead of a media query plus a class. The OS query alone was
   not enough: a player whose phone animates everything can still want quiet
   menus, and there was no way to say so.

   Four small jobs, all on #overlay (the title screen):
     * the motion attribute. index.html's inline boot script sets the FIRST
       answer before first paint; this file owns every later one, applied at
       eval (it sits right behind store.js in the manifest) and live after;
     * the intro, ONCE: the reveal in CSS keys off #overlay[data-intro]. The
       shell ships the attribute, so the very first paint is already the
       intro's start state (set from here, the static title painted whole
       first and then vanished to be drawn on). This file takes it off
       INTRO_MS after the overlay is first visible, so coming back from a
       room is the resting title, never a second show. REDUCED takes it off
       at once. replay() is the one way to see it again;
     * #overlay[data-paused] while the tab is hidden, so a backgrounded tab
       does not spend frames on a menu nobody can see;
     * a light confirm tap on a title .bigbtn. Input.vibrate is the one haptic
       path: the player's HAPTICS slider scales it, 0 is off, and iOS has no
       navigator.vibrate at all, so it is a no-op there by construction.

   Needs GameStore at eval (HARD_EDGES). Input and SettingRow are read at call
   time only. */
const TitleFx = (function () {
  "use strict";

  const KEY = "motion";            // apex26.motion — json lane: "on" | "reduce" | unset
  const INTRO_MS = 2800;           // the CSS intro is over by ~2.5 s (css/menus.css)
  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const osQuery = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const overlay = () => (typeof document !== "undefined" ? document.getElementById("overlay") : null);
  let introTimer = 0;

  const osReduce = () => !!(osQuery && osQuery.matches);
  // The OS asking for reduced motion always wins — the setting can only ADD
  // reduction — then the stored choice. A value the registry does not name
  // (hand-edited storage) reads as unset, which is ON.
  function mode() {
    if (osReduce()) return "reduce";
    return store.get(KEY, null) === "reduce" ? "reduce" : "on";
  }

  function endIntro() {
    clearTimeout(introTimer);
    const ov = overlay();
    if (ov) ov.removeAttribute("data-intro");
  }

  function apply() {
    if (!root || !root.dataset) return;
    if (mode() === "reduce") { root.dataset.motion = "reduce"; endIntro(); }
    else delete root.dataset.motion;
  }

  function set(v) {
    store.set(KEY, v === "reduce" ? "reduce" : "on");
    apply();
    return mode();
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
    buildRow();
  }

  // The row is BUILT, like cockpit-opts' HALO, rather than static shell DOM:
  // it goes straight under UI SIZE in SETTINGS › DISPLAY, the other setting
  // about how the menus themselves behave. Silent write, like DebrisOpts: no G
  // here, so no sound gate to honour.
  function buildRow() {
    if (typeof SettingRow === "undefined" || document.getElementById("pm-motion")) return;
    const slider = document.getElementById("pm-uiscale");
    const anchor = slider && slider.parentNode;
    if (!anchor || !anchor.parentNode) return;
    const r = SettingRow.build("pm-motion", "MENU ANIMATIONS", [["on", "ON"], ["reduce", "REDUCED"]]);
    SettingRow.wire(r.row, { read: mode, write: set });
    const help = document.createElement("p");
    help.id = "pm-motion-help";
    help.className = "adv-help";
    help.textContent = "REDUCED stills menu reveals and screen transitions. If your device asks for reduced motion, that always wins.";
    if (r.sel) r.sel.setAttribute("aria-describedby", help.id);
    anchor.parentNode.insertBefore(r.row, anchor.nextSibling);
    anchor.parentNode.insertBefore(help, r.row.nextSibling);
  }

  apply();
  // The OS preference is followed live, on top of the stored choice.
  if (osQuery && osQuery.addEventListener) osQuery.addEventListener("change", apply);

  // Deferred scripts run while readyState is "interactive" and SettingRow loads
  // after this file, so only a document that is already COMPLETE wires now.
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", initUI, { once: true });
  }

  return { KEY, mode, set, apply, replay, initUI };
})();
Object.freeze(TitleFx);
