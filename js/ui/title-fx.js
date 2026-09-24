/* Apex 26 — TitleFx: the title screen's motion, as a player setting.

   MENU ANIMATIONS: ON / REDUCED (SETTINGS › DISPLAY). Unset means "follow the
   OS": prefers-reduced-motion answers, and keeps answering if it changes. The
   answer lands on <html data-motion="reduce"> — absent when motion is on — so
   CSS keys off ONE attribute instead of a media query plus a class. The OS
   query alone was not enough: a player whose phone animates everything can
   still want a quiet menu, and there was no way to say so.

   Four small jobs, all on #overlay (the title screen):
     * the motion attribute, applied AT EVAL — this file sits right behind
       store.js in the manifest so the first menu frame already has it;
     * replay(): the reveal in CSS keys off #overlay[data-intro], so every time
       the overlay is shown again (hidden removed) the attribute is dropped,
       a reflow is forced, and it goes back on — the intro plays per visit,
       not once per boot;
     * #overlay[data-paused] while the tab is hidden, so a backgrounded tab
       does not spend frames on a menu nobody can see;
     * a light confirm tap on a title .bigbtn. Input.vibrate is the one haptic
       path: the player's HAPTICS slider scales it, 0 is off, and iOS has no
       navigator.vibrate at all, so it is a no-op there by construction.

   Needs GameStore at eval (HARD_EDGES). Input and SettingRow are read at call
   time only. */
const TitleFx = (function () {
  "use strict";

  const KEY = "motion";            // apex26.motion — json lane: "on" | "reduce" | unset (= OS)
  const store = GameStore.store;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const osQuery = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  const osReduce = () => !!(osQuery && osQuery.matches);
  // The stored choice when there is one, else what the OS says. A value the
  // registry does not name (hand-edited storage) reads as unset.
  function mode() {
    const v = store.get(KEY, null);
    return v === "on" || v === "reduce" ? v : (osReduce() ? "reduce" : "on");
  }

  function apply() {
    if (!root || !root.dataset) return;
    if (mode() === "reduce") root.dataset.motion = "reduce";
    else delete root.dataset.motion;
  }

  function set(v) {
    store.set(KEY, v === "reduce" ? "reduce" : "on");
    apply();
    return mode();
  }

  // Restart the reveal. Removing and re-adding in one task is a no-op to the
  // style engine; the offsetWidth read in between is what makes it a restart.
  function replay() {
    const ov = typeof document !== "undefined" ? document.getElementById("overlay") : null;
    if (!ov) return;
    ov.removeAttribute("data-intro");
    void ov.offsetWidth;
    ov.setAttribute("data-intro", "");
  }

  // Android-only in practice: Input.vibrate returns early where navigator has
  // no vibrate (every iOS browser), and scales by the HAPTICS slider elsewhere.
  function confirmTap(e) {
    const t = e && e.target;
    const btn = t && t.closest ? t.closest(".bigbtn") : null;
    if (!btn || btn.disabled) return;
    if (typeof Input !== "undefined" && Input.vibrate) Input.vibrate(8);
  }

  function initUI() {
    const ov = document.getElementById("overlay");
    if (ov) {
      if (!ov.hidden) replay();
      if (typeof MutationObserver !== "undefined") {
        new MutationObserver(() => { if (!ov.hidden) replay(); })
          .observe(ov, { attributes: true, attributeFilter: ["hidden"] });
      }
      ov.addEventListener("click", confirmTap);
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
    help.className = "adv-help";
    help.textContent = "REDUCED stills the title screen's reveals and transitions. Until you choose, it follows your device's reduce-motion setting.";
    anchor.parentNode.insertBefore(r.row, anchor.nextSibling);
    anchor.parentNode.insertBefore(help, r.row.nextSibling);
  }

  apply();
  // An unset preference follows the OS live; a stored one is the player's.
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
